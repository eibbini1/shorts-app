import argparse
from html import escape
from pathlib import Path
import os
import shutil
import json
import subprocess
import urllib.request
import urllib.error
import time
import urllib.parse
import re
import zlib
import struct

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Model & Local Service Configurations
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
# One 4B script can take 7 minutes on a CPU laptop, so the default timeout is generous.
OLLAMA_TIMEOUT = int(os.environ.get("SHORTS_TIMEOUT", "1200"))
VOICE_PROVIDER = os.environ.get("SHORTS_VOICE", "").strip().lower()
IMAGE_TIMEOUT = int(os.environ.get("SHORTS_IMAGE_TIMEOUT", "90"))
# Heavier machines (for example an Apple Silicon Mac) can run ComfyUI locally for better images and real video clips.
#   SHORTS_IMAGE_PROVIDER=pollinations (default) | comfyui | flux (local FLUX.2 Klein via mflux, Mac)
#   SHORTS_VIDEO_PROVIDER=none (default) | ltx-mlx | comfyui   animates chosen scene images into real motion clips
#       ltx-mlx = the runtime from scripts/setup-mac.sh (set LTX_MLX_BIN to override its path)
#   SHORTS_VIDEO_SCENES=auto (hook, catch, ending) | all | 1,4,7
# ComfyUI workflows are "Save (API Format)" JSON files. Like scripts/local-media.mjs, the exact string values
# "{{prompt}}", "{{seed}}", "{{width}}", "{{height}}" and (video only) "{{image}}" are replaced before the run.
IMAGE_PROVIDER = os.environ.get("SHORTS_IMAGE_PROVIDER", "pollinations").strip().lower()
# FLUX only, for a recurring character. Scene 1 becomes the reference for the rest. Tested on FLUX.2 Klein:
# strength 0.35 ignores the reference, 0.6 loses the character, 0.7 keeps the character and room, 0.8 copies the pose.
# It keeps identity but does not follow big pose changes, so it is off by default.
CHAIN_IMAGES = os.environ.get("SHORTS_CHAIN_IMAGES", "0") == "1"
CHAIN_STRENGTH = os.environ.get("SHORTS_CHAIN_STRENGTH", "0.7")
FLUX_BIN = os.environ.get("FLUX_BIN", os.path.join("storage", "tools", "mflux", ".venv", "bin", "mflux-generate-flux2"))
FLUX_MODEL = os.environ.get("FLUX_MODEL", os.path.join("storage", "models", "flux2-klein-4b-4bit"))
VIDEO_PROVIDER = os.environ.get("SHORTS_VIDEO_PROVIDER", "none").strip().lower()
VIDEO_FRAMES = max(25, int(os.environ.get("SHORTS_VIDEO_FRAMES", "97")))  # 97 frames at 24 fps = 4 s clips (proven on this Mac); 49 = 2 s
VIDEO_SCENES = os.environ.get("SHORTS_VIDEO_SCENES", "auto").strip().lower()
COMFY_URL = os.environ.get("COMFY_URL", "http://127.0.0.1:8188").rstrip("/")
COMFY_IMAGE_WORKFLOW = os.environ.get("COMFY_IMAGE_WORKFLOW", os.path.join("workflows", "image.api.json"))
COMFY_VIDEO_WORKFLOW = os.environ.get("COMFY_VIDEO_WORKFLOW", os.path.join("workflows", "video.api.json"))
COMFY_TIMEOUT = int(os.environ.get("COMFY_TIMEOUT", "1800"))
LTX_MLX_BIN = os.environ.get("LTX_MLX_BIN", os.path.join("storage", "tools", "ltx-2-mlx", ".venv", "bin", "ltx-2-mlx"))
MOTIONS = ["in", "left", "out", "right"]
DEFAULT_MODEL = "qwen3:1.7b" if os.name == "nt" else "qwen3:4b-instruct-2507-q4_K_M"
MODEL_NAME = os.environ.get("SHORTS_MODEL", DEFAULT_MODEL)

# Target video length. About 2.5 spoken words per second; 60 s means 6-7 scenes and ~150 words.
TARGET_SECONDS = int(os.environ.get("SHORTS_SECONDS", "60"))
# Soft 384x640 motion clips: lanczos upscale, light sharpening, fine film grain so they sit beside the stills (SHORTS_CLIP_FILTER to override).
CLIP_FILTER = os.environ.get("SHORTS_CLIP_FILTER", "scale=720:1280:flags=lanczos,unsharp=5:5:0.5:5:5:0.0,noise=alls=5:allf=t")
HOOK_WORDS = max(5, int(os.environ.get("SHORTS_HOOK_WORDS", "10")))  # 8 tests well for retention; 10 is the default
MIN_SCENES, MAX_SCENES = (6, 7) if TARGET_SECONDS >= 50 else (5, 6)
TOTAL_WORDS = round(TARGET_SECONDS * 2.5)
OTHER_WORDS = max(10, round((TOTAL_WORDS - 10) / (MAX_SCENES - 1)))

# Image prompts are built in code from short structured fields. A small model only has to fill in
# concrete nouns, and every prompt still gets the shot framing, lens, lighting and style that make
# photos look professional. Each shot type is a different camera position, so scenes do not look alike.
SHOT_TYPES = ["macro close-up", "wide establishing shot", "overhead flat lay", "low-angle hero shot",
              "over-the-shoulder medium shot", "detail close-up"]
SHOT_LOOK = {
    "macro close-up": "100mm macro lens, shallow depth of field, creamy bokeh",
    "wide establishing shot": "24mm wide-angle lens, deep depth of field, leading lines",
    "overhead flat lay": "bird's-eye view, 50mm lens, tidy composition on a textured surface",
    "low-angle hero shot": "low camera angle, 35mm lens, subject towering in the frame",
    "over-the-shoulder medium shot": "85mm portrait lens, shallow depth of field, soft background",
    "detail close-up": "85mm lens at f/1.8, sharp focus on the texture, blurred background",
}
IMAGE_STYLE = os.environ.get("SHORTS_IMAGE_STYLE", "Moody dark food photography with deep shadows and warm gold highlights, cinematic color grading, subtle film grain.")  # SHORTS_IMAGE_STYLE overrides the look for other formats
# Fixed order that gives a different camera position in every neighbouring scene.
SHOT_CYCLE = ["macro close-up", "wide establishing shot", "detail close-up", "overhead flat lay",
              "over-the-shoulder medium shot", "low-angle hero shot"]
PHOTO_LOOK = os.environ.get("SHORTS_PHOTO_LOOK", "photorealistic")  # e.g. "Pixar-style 3D animated" for cartoon characters
IMAGE_EXCLUDE = "Vertical 9:16 composition. No text, no watermark, no logos, no people's faces."


def compose_image_prompt(scene, topic="", ground=False):
    """Turns {shot, subject, setting, lighting} into a prose prompt a text-to-image model handles well."""
    clean = lambda key: " ".join(str(scene.get(key) or "").split()).strip(" .,")
    shot = scene.get("shot") if scene.get("shot") in SHOT_LOOK else SHOT_TYPES[0]
    subject = clean("subject") or clean("image_prompt") or topic or clean("text")
    words = [w for w in topic.lower().split() if len(w) > 3]
    if ground and words and not any(w in subject.lower() for w in words):
        subject = f"{subject}, with {topic} clearly visible in the foreground"
    setting = clean("setting")
    lighting = clean("lighting") or "warm key light from camera-left with soft shadows"
    parts = [f"A {PHOTO_LOOK} {shot} of {subject}" + (f", set in {setting}." if setting else ".")]
    parts.append(f"Lit by {lighting}.")
    parts.append(f"Captured with {SHOT_LOOK[shot]}.")
    if clean("action"):
        parts.append(f"Show the setup just before this action: {clean('action')}. Keep the contact point visible.")
    parts.append(IMAGE_STYLE)
    parts.append(IMAGE_EXCLUDE)
    return " ".join(parts)


# Ollama constrains the reply to this schema, so even small models return valid JSON.
SCRIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "tightOpen": {"type": "boolean"},
        "hookText": {"type": "string"},
        "kicker": {"type": "string"},
        "keywords": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 6},
        "scenes": {
            "type": "array",
            "minItems": MIN_SCENES,
            "maxItems": MAX_SCENES,
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "shot": {"type": "string", "enum": SHOT_TYPES},
                    "subject": {"type": "string"},
                    "setting": {"type": "string"},
                    "lighting": {"type": "string"},
                    "action": {"type": "string"},
                    "voice": {"type": "string"},
                },
                "required": ["text", "shot", "subject", "setting", "lighting", "action"],
            },
        },
    },
    "required": ["hookText", "scenes"],
}
ASSET_DIR = "assets"
SPEC_PATH = os.path.join("episodes", "interactive.assemble.json")
IMG_BASE = "https://image.pollinations.ai/prompt/"
FONT_PATH = os.path.join("assets", "fonts", "Poppins-Bold.ttf")


def open_image_bytes(file):
    with open(file, "rb") as image:
        return image.read(12)


def is_image(data: bytes) -> bool:
    return data[:8] == b"\x89PNG\r\n\x1a\n" or data[:3] == b"\xff\xd8\xff" or data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def parse_model_json(content: str) -> dict:
    """Strip <think> blocks and code fences, then parse the first JSON object."""
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.S).strip()
    content = re.sub(r"^```(?:json)?|```$", "", content, flags=re.M).strip()
    start, end = content.find("{"), content.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in model reply")
    return json.loads(content[start:end + 1])


def clamp_hook(text, limit=None) -> str:
    return " ".join(str(text or "").split()[:limit or HOOK_WORDS])


def call_ollama(payload):
    """Posts to Ollama and returns the reply text. Retries once without 'think' on HTTP 400."""
    def post(body):
        req = urllib.request.Request(
            OLLAMA_URL,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=OLLAMA_TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))

    try:
        res_data = post(payload)
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")[:300]
        if err.code == 400 and "think" in payload:
            print(f"   Ollama rejected the request ({detail}). Retrying without 'think'...")
            res_data = post({k: v for k, v in payload.items() if k != "think"})
        else:
            raise ValueError(f"Ollama HTTP {err.code}: {detail}")
    # Native Ollama reply has 'message'; an OpenAI-style OLLAMA_URL has 'choices'.
    choices = res_data.get("choices") or [{}]
    message = res_data.get("message") or choices[0].get("message") or {}
    content = (message.get("content") or "").strip()
    if not content:
        raise ValueError("Model reply has no content.")
    return content


def repair_script(spec):
    """Fixes a hook that is long in only one place, so a 7-minute CPU attempt is not thrown away."""
    scenes = spec.get("scenes")
    if not isinstance(scenes, list) or not scenes or not isinstance(scenes[0], dict):
        return
    hook = " ".join(str(spec.get("hookText") or "").split())
    first = " ".join(str(scenes[0].get("text") or "").split())
    if len(first.split()) > HOOK_WORDS and hook and len(hook.split()) <= HOOK_WORDS:
        scenes[0]["text"] = hook
    elif len(hook.split()) > HOOK_WORDS and first and len(first.split()) <= HOOK_WORDS:
        spec["hookText"] = first


def script_problems(spec):
    """Rules the JSON schema cannot express: scene count and hook length."""
    problems = []
    scenes = spec.get("scenes")
    if not isinstance(scenes, list) or not MIN_SCENES <= len(scenes) <= MAX_SCENES:
        problems.append(f"needs {MIN_SCENES} or {MAX_SCENES} scenes")
    elif any(not isinstance(s, dict) or not str(s.get("text", "")).strip() for s in scenes):
        problems.append("a scene has no text")
    elif len(str(scenes[0]["text"]).split()) > HOOK_WORDS:
        problems.append(f"scene 1 has {len(str(scenes[0]['text']).split())} words, needs {HOOK_WORDS} or fewer")
    total_words = sum(len(str(s.get("text", "")).split()) for s in scenes) if isinstance(scenes, list) else 0
    if scenes and total_words < 0.8 * TOTAL_WORDS:
        problems.append(f"only {total_words} words, needs about {TOTAL_WORDS}")
    hook_words = len(str(spec.get("hookText", "")).split())
    if hook_words > HOOK_WORDS:
        problems.append(f"hookText has {hook_words} words, needs {HOOK_WORDS} or fewer")
    return problems


def load_font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


_SEEN_HASHES = []


def image_problem(data, near=26):
    """Returns why an image is unusable (flat, wrong shape, copy of an earlier scene) or None. Needs Pillow."""
    if not HAS_PIL:
        return None
    try:
        import io
        img = Image.open(io.BytesIO(data)).convert("L")
        if img.height <= img.width:
            return "not a portrait image"
        small = list(img.resize((16, 16)).tobytes())
        mean = sum(small) / len(small)
        if (sum((p - mean) ** 2 for p in small) / len(small)) ** 0.5 < 6:
            return "image is almost flat"
        bits = [p > mean for p in small]
        if any(sum(a != b for a, b in zip(bits, old)) < near for old in _SEEN_HASHES):
            return "looks like an earlier scene"
        _SEEN_HASHES.append(bits)
    except Exception as err:
        return f"unreadable image ({err})"
    return None


def strip_watermark(data, keep=0.95):
    """The free endpoint stamps a 'pollinations.ai' mark in the bottom-right corner. Crop 5% off the
    bottom (and the same share off the sides, to keep 9:16) and scale back up to 1080x1920.
    keep=1.0 only fits the image to 9:16 without cropping a mark."""
    if not HAS_PIL:
        return data
    import io
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    nh = round(h * keep)
    nw = round(nh * 9 / 16)
    left = max(0, (w - nw) // 2)
    img = img.crop((left, 0, left + min(nw, w), nh)).resize((1080, 1920), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def comfy_upload(path):
    """Uploads an image to ComfyUI and returns the name its workflows use to load it."""
    boundary = "----shorts" + str(int(time.time() * 1000))
    with open(path, "rb") as f:
        content = f.read()
    head = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{os.path.basename(path)}"\r\n'
            "Content-Type: image/png\r\n\r\n").encode()
    tail = (f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{boundary}--\r\n').encode()
    req = urllib.request.Request(f"{COMFY_URL}/upload/image", data=head + content + tail,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)["name"]


def comfy_run(workflow_path, values):
    """Runs a ComfyUI API-format workflow and returns (file bytes, file extension) of its first output."""
    with open(workflow_path, encoding="utf-8") as f:
        text = f.read()
    for key, value in values.items():
        text = text.replace('"{{' + key + '}}"', json.dumps(value))
    body = json.dumps({"prompt": json.loads(text)}).encode()
    req = urllib.request.Request(f"{COMFY_URL}/prompt", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as response:
        prompt_id = json.load(response)["prompt_id"]
    deadline = time.time() + COMFY_TIMEOUT
    while time.time() < deadline:
        time.sleep(3)
        with urllib.request.urlopen(f"{COMFY_URL}/history/{prompt_id}", timeout=60) as response:
            entry = json.load(response).get(prompt_id)
        if not entry:
            continue
        if entry.get("status", {}).get("status_str") == "error":
            raise RuntimeError("ComfyUI reported an error for this workflow")
        for node in entry.get("outputs", {}).values():
            for kind in ("images", "videos", "gifs"):
                for item in node.get(kind, []):
                    if item.get("type") == "temp":
                        continue
                    query = urllib.parse.urlencode({"filename": item["filename"], "subfolder": item.get("subfolder", ""), "type": item.get("type", "output")})
                    with urllib.request.urlopen(f"{COMFY_URL}/view?{query}", timeout=300) as response:
                        return response.read(), os.path.splitext(item["filename"])[1].lower()
        raise RuntimeError("ComfyUI finished but returned no image or video")
    raise TimeoutError(f"ComfyUI did not finish within {COMFY_TIMEOUT}s")


def pick_video_scenes(count):
    """Scene numbers (1-based) that become real clips: hook, the catch (4th), and the ending by default."""
    if VIDEO_PROVIDER not in ("comfyui", "ltx-mlx"):
        return set()
    if VIDEO_SCENES == "all":
        return set(range(1, count + 1))
    if VIDEO_SCENES == "auto":
        return {1, min(4, count), count}
    return {int(n) for n in VIDEO_SCENES.split(",") if n.strip().isdigit() and 1 <= int(n) <= count}


def motion_prompt(scene):
    """Subject-motion prompt in the style of docs/MOTION_SHOT_RECIPE.md: steady camera, one visible physical action."""
    subject = " ".join(str(scene.get("subject") or "the subject").split()).strip(" .")
    action = " ".join(str(scene.get("action") or "").split()).strip(" .") or "light and steam move gently across the scene"
    camera = "Locked macro camera" if scene.get("shot") in ("macro close-up", "detail close-up") else "Steady camera"
    constraints = scene.get("visualConstraints")
    continuity = f" Required continuity: {constraints}." if constraints else ""
    return f"{camera}. Start from the reference frame. Animate one action: {action}. Show the result and hold briefly. Preserve {subject}, composition and lighting. No cuts, text or camera movement.{continuity}"


def animate_scene(image_path, scene, scene_idx):
    """Turns a scene image into a short motion clip. Returns the clip path, or None to keep the still."""
    clip_path = os.path.join(ASSET_DIR, f"clip_{scene_idx}.mp4").replace("\\", "/")
    raw_path = clip_path + ".raw"
    prompt = motion_prompt(scene)
    try:
        print(f"   🎞️  Animating scene {scene_idx} with {VIDEO_PROVIDER} (this can take minutes): {prompt}")
        if VIDEO_PROVIDER == "ltx-mlx":
            # Same settings as scripts/test-mac-motion.sh (384x640, 24 fps, distilled, low RAM); 97 frames = 4 s like the earlier Mac clips.
            raw_path = clip_path + ".raw.mp4"
            env = dict(os.environ, HF_HOME=os.environ.get("HF_HOME", os.path.join("storage", "models", "huggingface")))
            # setup:mac records the local model dirs (see scripts/mac-runtime.sh); fall back to hub names.
            def _setup_dir(var, marker, hub):
                if os.environ.get(var):
                    return os.environ[var]
                try:
                    with open(os.path.join("storage", "setup", marker), encoding="utf-8") as f:
                        return f.read().strip() or hub
                except OSError:
                    return hub
            ltx_model = _setup_dir("LTX_MODEL_DIR", "ltx-model-dir.txt", "dgrauet/ltx-2.3-mlx-q4")
            gemma_model = _setup_dir("GEMMA_MODEL_DIR", "gemma-model-dir.txt", "mlx-community/gemma-3-12b-it-4bit")
            subprocess.run([LTX_MLX_BIN, "generate", "--model", ltx_model, "--gemma", gemma_model, "--distilled", "--low-ram",
                            "--seed", str(42 + scene_idx), "--image", image_path, "--prompt", prompt,
                            "-H", "640", "-W", "384", "-f", str(VIDEO_FRAMES), "--frame-rate", "24", "-o", raw_path],
                           check=True, timeout=COMFY_TIMEOUT, env=env)
        else:
            data, ext = comfy_run(COMFY_VIDEO_WORKFLOW, {"image": comfy_upload(image_path), "prompt": prompt,
                                                          "seed": scene_idx * 17, "width": 720, "height": 1280})
            if ext not in (".mp4", ".webm", ".mov", ".gif"):
                raise ValueError(f"workflow returned {ext or 'no file type'}, needs a video output")
            raw_path = clip_path + ".raw" + ext
            with open(raw_path, "wb") as f:
                f.write(data)
        # Scale to the video size the renderer uses and make sure the codec is plain H.264.
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw_path, "-an", "-vf", CLIP_FILTER,
                        "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "18", clip_path], check=True)
        os.remove(raw_path)
        print(f"      ✅ Clip -> {clip_path}")
        return clip_path
    except Exception as err:
        print(f"      ⚠️  Animation failed ({err}). Keeping the still image with camera motion.")
        return None


def generate_ai_scene_image(prompt_text, output_path, scene_idx, total_scenes, anchor_path=None, strict=False):
    """Generates 9:16 portrait visual assets via AI API or falls back to a stylized slide."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    if IMAGE_PROVIDER == "flux":
        # FLUX.2 Klein 4B (4-bit, MLX) from scripts/setup-mflux-mac.sh: native 720x1280, no watermark, about a minute per image on an M1.
        try:
            if os.path.exists(output_path):
                os.remove(output_path)  # mflux writes name_1.png instead of overwriting, which would leave a stale image in place
            command = [FLUX_BIN, "--model", FLUX_MODEL, "--base-model", "flux2-klein-4b", "--prompt", prompt_text,
                       "--width", "720", "--height", "1280", "--steps", "4", "--seed", str(scene_idx * 17 + 7),
                       "--low-ram", "--output", output_path]
            if anchor_path and os.path.exists(anchor_path):
                command[command.index("--prompt") + 1] = "Same character and setting as the reference image. " + prompt_text
                command += ["--image", anchor_path, CHAIN_STRENGTH]  # scene 1 anchors the look and the character of every later scene
            subprocess.run(command, check=True, timeout=COMFY_TIMEOUT)
            with open(output_path, "rb") as f:
                why = image_problem(f.read(), near=8 if anchor_path else 26)  # chained scenes look alike on purpose; only reject near copies
            if why:
                raise ValueError(why)
            print(f"      ✅ FLUX image -> {output_path}")
            return
        except Exception as err:
            if strict:
                raise SystemExit(f"Scene {scene_idx} FLUX image rejected: {err}") from err
            print(f"      ⚠️  FLUX image failed ({err}). Trying the free endpoint instead...")
    if IMAGE_PROVIDER == "comfyui":
        try:
            data, _ = comfy_run(COMFY_IMAGE_WORKFLOW, {"prompt": prompt_text, "seed": scene_idx * 17, "width": 832, "height": 1472})
            why = image_problem(data)
            if why:
                raise ValueError(why)
            with open(output_path, "wb") as f:
                f.write(strip_watermark(data, keep=1.0))
            print(f"      ✅ ComfyUI image -> {output_path}")
            return
        except Exception as err:
            if strict:
                raise SystemExit(f"Scene {scene_idx} ComfyUI image rejected: {err}") from err
            print(f"      ⚠️  ComfyUI image failed ({err}). Trying the free endpoint instead...")
    clean_prompt = urllib.parse.quote(prompt_text)
    
    # Valid vertical 9:16 AI image generation URL (1080x1920)
    ai_img_url = f"{IMG_BASE}{clean_prompt}?width=1080&height=1920&nologo=true&seed={scene_idx * 17}"

    print(f"   🖼️  Generating Scene Visual [{scene_idx}/{total_scenes}]: '{prompt_text[:40]}...'")

    # The free endpoint rate-limits (HTTP 402/429) when scenes are requested back to back, so wait and retry.
    for attempt in range(1, 5):
        ai_img_url = f"{IMG_BASE}{clean_prompt}?width=1080&height=1920&nologo=true&seed={scene_idx * 17 + (attempt - 1) * 101}"
        try:
            req = urllib.request.Request(ai_img_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=IMAGE_TIMEOUT) as response:
                data = response.read()
            if not is_image(data):
                raise ValueError("endpoint did not return an image")
            why = image_problem(data)
            if why and attempt < 4:
                print(f"      🔁 {why}; retrying with a new seed...")
                continue
            if why and strict:
                raise ValueError(why)
            with open(output_path, 'wb') as f:
                f.write(strip_watermark(data))
            print(f"      ✅ Downloaded AI image -> {output_path}")
            return
        except urllib.error.HTTPError as err:
            if err.code in (402, 429) and attempt < 4:
                wait = 20 * attempt
                print(f"      ⏳ Image endpoint is rate limiting (HTTP {err.code}). Retrying in {wait}s...")
                time.sleep(wait)
                continue
            print(f"      ⚠️  AI endpoint failed ({err}). Rendering stylized 9:16 fallback slide...")
            break
        except Exception as err:
            print(f"      ⚠️  AI endpoint failed ({err}). Rendering stylized 9:16 fallback slide...")
            break

    if strict:
        raise SystemExit(f"Scene {scene_idx} has no approved image. Retry or supply a replacement.")

    # Vibrant background colors to guarantee frame 0 brightness > 25 for QA check
    colors = [(75, 55, 115), (55, 85, 115), (115, 65, 55), (55, 95, 65), (85, 65, 105), (65, 75, 105)]
    if HAS_PIL:
        img = Image.new("RGB", (1080, 1920), color=colors[(scene_idx - 1) % len(colors)])
        draw = ImageDraw.Draw(img)
        # Bounding boxes with explicit [x0, y0, x1, y1] coordinates
        draw.rectangle([60, 60, 1020, 220], fill=(255, 60, 100))
        draw.text((120, 110), f"SCENE {scene_idx} OF {total_scenes}", fill=(255, 255, 255), font=load_font(72))
        img.save(output_path)
    else:
        r, g, b = colors[(scene_idx - 1) % len(colors)]
        raw_rows = b"".join(b"\x00" + bytes([r, g, b]) * 1080 for _ in range(1920))
        compressed = zlib.compress(raw_rows)
        chunk = lambda tag, data: struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
        ihdr = struct.pack(">IIBBBBB", 1080, 1920, 8, 2, 0, 0, 0)
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
        with open(output_path, "wb") as f:
            f.write(png)
    print(f"      ✅ Rendered fallback scene image -> {output_path}")


def configure_voice(spec, provider_override="", voice_id_override=""):
    existing = spec.get("voice")
    existing = existing if isinstance(existing, dict) else {}
    requested_provider = provider_override or VOICE_PROVIDER
    provider = requested_provider or ("elevenlabs" if voice_id_override else existing.get("provider", "mock"))
    if provider not in ("elevenlabs", "mock"):
        raise SystemExit("SHORTS_VOICE must be elevenlabs or mock.")
    voice = existing.copy() if existing.get("provider") == provider else {}
    voice["provider"] = provider
    if provider == "elevenlabs":
        for key, value in {"speed": 1, "stability": 0.45, "style": 0.5}.items():
            voice.setdefault(key, value)
        voice_id = voice_id_override or os.environ.get("ELEVENLABS_VOICE_ID", "").strip()
        if voice_id:
            voice["voiceId"] = voice_id
        if requested_provider == "elevenlabs" or voice_id_override:
            for scene in spec["scenes"]:
                scene.pop("narration", None)  # Recorded takes otherwise override the provider.
    spec["voice"] = voice


def render_spec(spec_path, rerender=False):
    env = os.environ.copy()
    env["OPENAI_BASE_URL"] = "http://localhost:11434/v1"
    env["OPENAI_API_KEY"] = "ollama"
    env["OPENAI_MODEL"] = MODEL_NAME

    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        raise SystemExit("npm is missing. Install Node.js and reopen Command Prompt.")
    command = [npm, "run", "pipeline", "--", "--spec", spec_path]
    if rerender:
        command.append("--skip-variation")  # Intentional reuse of the same script.
    if os.environ.get("SHORTS_ALLOW_VOICE_SPEND") == "1":
        command.append("--allow-voice-spend")  # uncached ElevenLabs lines spend characters
    result = subprocess.run(command, env=env)
    if result.returncode != 0:
        print(f"\n❌ Pipeline failed (exit {result.returncode}). See the log above.")
        raise SystemExit(result.returncode)


TRANSITIONS = ("fade", "cut", "flash", "gold", "punch", "whip")
EFFECT_LEVELS = {"off": 0, "subtle": 0.4, "standard": 0.8}


def configure_edit(spec, transition, effects):
    if transition:
        for scene in spec["scenes"][1:]:
            scene["transition"] = transition
    if effects:
        spec["soundEffectsVolume"] = EFFECT_LEVELS[effects]


def rerender(args):
    with open(args.rerender, encoding="utf-8-sig") as f:
        spec = json.load(f)
    configure_voice(spec, args.voice_provider or "", args.voice_id or "")
    configure_edit(spec, args.transition, args.effects)
    name = "interactive-rerender" if args.name == "interactive" else args.name
    target = os.path.join("episodes", name + ".assemble.json")
    if os.path.abspath(target) == os.path.abspath(args.rerender):
        raise SystemExit("Choose a different --name to preserve the source spec.")
    spec["output"] = f"out/{name}/{name}.mp4"
    with open(target, "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2)
    render_spec(target, rerender=True)


def suggest_hook(brief):
    """Select a short, filmable hook from locally generated options."""
    result = parse_model_json(call_ollama({
        "model": MODEL_NAME, "stream": False, "think": False,
        "format": {
            "type": "object",
            "properties": {
                "options": {"type": "array", "minItems": 3, "maxItems": 3,
                            "items": {"type": "string"}},
                "pick": {"type": "integer", "minimum": 1, "maximum": 3},
            },
            "required": ["options", "pick"],
        },
        "options": {"temperature": 0.4, "num_ctx": 4096, "num_predict": 256},
        "messages": [
            {"role": "system", "content": (
                f"Write three distinct spoken hooks, each at most {HOOK_WORDS} words. "
                "Name the subject or detail. Create a question or visual promise that the payoff "
                "can answer. Avoid unsupported prices, records, superlatives and legal claims. "
                "Pick the clearest, most specific option the brief can actually show, using a 1-based index."
            )},
            {"role": "user", "content": brief},
        ],
    }))
    options = result.get("options")
    pick = result.get("pick")
    if not isinstance(options, list) or len(options) != 3 or type(pick) is not int or not 1 <= pick <= 3:
        raise ValueError("Invalid hook suggestions")
    hooks = [" ".join(option.split()) if isinstance(option, str) else "" for option in options]
    if any(not hook or len(hook.split()) > HOOK_WORDS for hook in hooks):
        raise ValueError("Hook suggestions exceed the spoken hook limit")
    return hooks[pick - 1]


def review_hook_payoff(draft, expected_payoff):
    """Ask the local model to evaluate the promise using only the supplied draft."""
    first, last = draft["scenes"][0], draft["scenes"][-1]
    evidence = {
        "hook": draft.get("hookText"),
        "opening": {key: first.get(key) for key in ("text", "subject", "action")},
        "ending": {key: last.get(key) for key in ("text", "subject", "action")},
        "expected_payoff": expected_payoff,
    }
    result = parse_model_json(call_ollama({
        "model": MODEL_NAME,
        "stream": False,
        "think": False,
        "format": {
            "type": "object",
            "properties": {
                "passed": {"type": "boolean"},
                "reason": {"type": "string"},
            },
            "required": ["passed", "reason"],
        },
        "options": {"temperature": 0, "num_ctx": 4096},
        "messages": [
            {"role": "system", "content": (
                "Review a short video's hook and ending. Pass only when the ending narration answers "
                "the opening and the ending action shows the requested result. A repeated promise, "
                "generic praise or a result that is merely implied fails. Judge only the supplied "
                "evidence. On failure, give one specific revision in the reason."
            )},
            {"role": "user", "content": json.dumps(evidence, ensure_ascii=False)},
        ],
    }))
    if type(result.get("passed")) is not bool or not isinstance(result.get("reason"), str) or not result["reason"].strip():
        raise ValueError("Hook reviewer returned an invalid verdict")
    if not result["passed"]:
        raise ValueError(f"Hook payoff review: {result['reason'].strip()}")
    print(f"Hook payoff review passed: {result['reason'].strip()}")


HOOK_TEMPLATES = (
    ("Reveal", "Why does this detail work that way?", "Open on the action, show a clue, then reveal the cause."),
    ("Before and after", "Spot what changed.", "Use matching framing and show the step that connects both states."),
    ("Macro detail", "Can you spot the hidden detail?", "Open in macro, then pull back to show what the detail does."),
    ("One click", "One click changes the reading.", "Show the original reading, one visible click, then the changed reading."),
    ("Two choices", "Which one would you choose?", "Show two comparable options, one real tradeoff, and who each suits."),
    ("Sound first", "Can you identify that sound?", "Open on a real available sound and reveal the component that made it."),
    ("Design tradeoff", "Why would a designer leave that out?", "Show the design decision and demonstrate the tradeoff."),
    ("Controlled test", "What changes if we move just this part?", "Keep the other variables fixed and show the result."),
    ("Same angle, new light", "Watch what the light reveals.", "Keep the subject fixed and use a light sweep to reveal its finish."),
    ("Misread", "This mark is easy to read wrong.", "Show a plausible misread and demonstrate the correct reading."),
    ("Sequence", "Watch what happens after the second press.", "Show the controls in order and make the final state legible."),
    ("Spot the difference", "These look alike until you turn them.", "Match framing and compare one visible detail. Use actual references."),
    ("Loop back", "Remember where that hand started?", "Return to the opening frame with the meaning of the detail resolved."),
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--voice-provider', choices=('mock', 'elevenlabs'), help='Narration provider for this run')
    parser.add_argument('--voice-id', help='ElevenLabs voice ID. Defaults to the configured voice or Brian.')
    parser.add_argument("--rerender", nargs="?", const=SPEC_PATH, help="Reuse a saved spec and its visuals")
    parser.add_argument("--strict-images", action="store_true", help="Reject invalid images and stop instead of using fallbacks")
    parser.add_argument("--transition", choices=TRANSITIONS)
    parser.add_argument("--effects", choices=EFFECT_LEVELS, help="Sound effects level, separate from music")
    parser.add_argument("--topic")
    parser.add_argument("--description", help="Story details and available visuals")
    parser.add_argument("--visual-constraints", help="Details that images and motion must preserve")
    parser.add_argument("--hook", help="Opening line or idea")
    parser.add_argument("--audience", help="Who should watch this Short?")
    parser.add_argument("--payoff", help="What should the final shot visibly answer? Triggers local hook review.")
    parser.add_argument("--story", type=int, choices=range(1, len(HOOK_TEMPLATES) + 1))
    parser.add_argument("--list-hooks", action="store_true")
    parser.add_argument("--name", default="interactive", help="Name for saved assets, spec and video")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--yes", action="store_true", help="Render without prompting")
    mode.add_argument("--preview", action="store_true", help="Show the preview without rendering")
    mode.add_argument("--draft-only", action="store_true", help="Save the validated story JSON before generating media")
    args = parser.parse_args()
    if args.list_hooks:
        for index, (title, hook, direction) in enumerate(HOOK_TEMPLATES, 1):
            print(f"{index}. {title} | {hook} | {direction}")
        return
    if args.voice_id and (args.voice_provider or VOICE_PROVIDER) == 'mock':
        parser.error('--voice-id requires ElevenLabs')
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,59}", args.name):
        parser.error("--name must use lowercase letters, digits or hyphens")
    if args.rerender:
        if args.preview or args.strict_images or args.draft_only:
            parser.error("--preview, --draft-only and --strict-images apply to new projects only")
        rerender(args)
        return
    unattended = args.yes or args.preview or args.draft_only
    if unattended and not args.topic:
        parser.error("--topic is required with --yes or --preview")
    topic = (args.topic if args.topic is not None else input("What is the Short about? ")).strip()
    if not topic:
        parser.error("The topic cannot be empty")
    saved_script = os.environ.get("SHORTS_SCRIPT", "").strip()
    def brief_value(value, question):
        return value or ("" if unattended or saved_script else input(question).strip())
    hook_prompt = (args.hook or "").strip()
    description = brief_value(args.description, "Describe the story and what we can show [optional]: ")
    visual_constraints = brief_value(args.visual_constraints, "What visual details must stay consistent? [optional]: ")
    audience = brief_value(args.audience, "Who is this for? [general audience]: ")
    payoff = brief_value(args.payoff, "What should viewers see or learn at the end? [optional]: ")
    asset_dir = ASSET_DIR if args.name == "interactive" else os.path.join("storage", "interactive", args.name)
    spec_path = os.path.join("episodes", args.name + ".assemble.json")
    voice_preset = "neutral"
    print(f"Creating a roughly {TARGET_SECONDS}-second Short about {topic}.")

    system_prompt = (
        "You are a viral short-video director. Output ONLY valid JSON with no markdown block formatting.\n"
        f"Write {MIN_SCENES} or {MAX_SCENES} scenes and about {TOTAL_WORDS} spoken words. "
        f"Keep the opening narration and hookText within {HOOK_WORDS} words each. "
        "Open on a visible action and raise a question the ending answers. Build through a clue to a visible payoff. "
        "Use verified supplied facts for prices, records or legal claims. Without facts, write a demonstration. "
        "Keep recurring subjects, props and lighting consistent across linked shots.\n"
        "IMAGE DIRECTION: for every scene describe ONE photograph that shows what the narration says. Fill five fields:\n"
        f"- shot: one of {', '.join(SHOT_TYPES)}. Use a different shot in every scene: start wide or macro, move to details, end on a hero shot.\n"
        "- subject: one concrete thing with materials, colors and texture (8 to 18 words). Example for a different topic: 'a brushed-steel pocket watch resting on dark green velvet, its gold hands catching the light'. Never copy the examples.\n"
        "- setting: where it is, with time of day and 2 background details. Example for a different topic: 'a candlelit oak desk in a quiet study at dusk, leather books blurred behind'.\n"
        "- lighting: direction and quality. Example: 'warm low key light from camera-left, deep shadows, soft rim light'.\n"
        "- action: ONE physical movement of the subject itself that a video model can animate, never a camera move. Example for a different topic: 'the gold hands of the watch tick forward and a speck of dust drifts through the light'.\n"
        "Describe things that are visible; never write abstract ideas, camera brands, text, logos or real people.\n"
        "UPLOAD DETAILS: 'kicker' is a 2 to 3 word label of the subject (for example 'Truffle Pasta'). 'keywords' are 3 to 6 lowercase search phrases a viewer would type on YouTube (for example 'most expensive pasta').\n"
        "JSON structure: {\"tightOpen\": true, \"hookText\": \"string\", \"kicker\": \"string\", \"keywords\": [\"string\"], \"scenes\": [{\"text\": \"string\", \"shot\": \"string\", \"subject\": \"string\", \"setting\": \"string\", \"lighting\": \"string\", \"action\": \"string\", \"voice\": \"string\"}]}"
    )

    user_prompt = (
        f"Topic: {topic}. Voice: {voice_preset}. "
        f"Create {MIN_SCENES} or {MAX_SCENES} scenes (a {HOOK_WORDS}-word hook first, then about {OTHER_WORDS} words per scene, about {TOTAL_WORDS} words in total) with the shot, subject, setting, lighting and action fields filled for each scene."
    )
    if not os.environ.get("SHORTS_SCRIPT", "").strip():
        if not unattended and args.story is None:
            for index, (title, hook, _) in enumerate(HOOK_TEMPLATES, 1):
                print(f"{index}. {title} | {hook}")
            pick = input("Pick a hook template [1]: ").strip() or "1"
            if not pick.isdecimal() or int(pick) not in range(1, len(HOOK_TEMPLATES) + 1):
                parser.error("Choose a numbered hook template")
        else:
            pick = args.story or 1
        title, hook, direction = HOOK_TEMPLATES[int(pick) - 1]
        user_prompt += (
            f" Story template: {title}. {direction} "
            f"Opening example: {hook} Adapt it to name the actual subject or mechanism. "
            "The opening action must be possible in the first image and motion shot. "
            "Write the answer or result into the final narration and final visual."
        )
    if audience:
        user_prompt += f" Audience: {audience}."
    if payoff:
        user_prompt += f" Visible payoff: {payoff}."
    if visual_constraints:
        user_prompt += f" Visual details to preserve across scenes: {visual_constraints}."
    if description:
        user_prompt += f" Story description and available visuals: {description}."
    # SHORTS_FACTS=facts.txt holds checked facts (prices, origins). The model must use only these, so it cannot invent claims.
    facts_file = os.environ.get("SHORTS_FACTS", "").strip()
    if facts_file:
        with open(facts_file, encoding="utf-8") as f:
            user_prompt += "\nUse ONLY these verified facts for every claim, price and origin; do not add others:\n" + f.read().strip()[:1500]

    if not saved_script and not hook_prompt:
        try:
            proposal = suggest_hook(user_prompt)
        except (ValueError, OSError) as error:
            print(f"Hook suggestion unavailable ({error}). Continuing with script drafting.")
        else:
            print(f"Suggested hook: {proposal}")
            hook_prompt = proposal if unattended else (
                input("Press Enter to use it, or type your own hook: ").strip() or proposal
            )
    if not saved_script and hook_prompt:
        if len(hook_prompt.split()) > HOOK_WORDS:
            parser.error(f"The spoken hook must be {HOOK_WORDS} words or fewer")
        user_prompt += f" Use this exact opening for scene 1 narration and hookText: {json.dumps(hook_prompt)}."

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "stream": False,
        "think": False,
        "format": SCRIPT_SCHEMA,
        "options": {"temperature": 0.4, "num_ctx": 4096},
    }

    spec_data = None
    last_error = None
    # SHORTS_SCRIPT=my_script.json uses a script written elsewhere (for example by a stronger cloud model)
    # in the same JSON shape, and skips the slow local model. The same checks still apply.
    script_file = os.environ.get("SHORTS_SCRIPT", "").strip()
    if script_file:
        with open(script_file, encoding="utf-8") as f:
            candidate = json.load(f)
        repair_script(candidate)
        problems = script_problems(candidate)
        if problems:
            raise SystemExit(f"SHORTS_SCRIPT rejected: {'; '.join(problems)}")
        spec_data = candidate
    if spec_data is None:
        print(f'Generating script with local Ollama model {MODEL_NAME}...')
    for attempt in range(1, 4):
        if spec_data is not None:
            break
        try:
            candidate = parse_model_json(call_ollama(payload))
            if hook_prompt and isinstance(candidate.get("scenes"), list) and candidate["scenes"] and isinstance(candidate["scenes"][0], dict):
                candidate["hookText"] = hook_prompt
                candidate["scenes"][0]["text"] = hook_prompt
            repair_script(candidate)
            problems = script_problems(candidate)
            if problems:
                raise ValueError("; ".join(problems))
            if payoff:
                review_hook_payoff(candidate, payoff)
            spec_data = candidate
            break
        except Exception as e:
            last_error = e
            print(f"   Attempt {attempt}/3 rejected: {e}")
            # Tell the model exactly what was wrong so the next attempt can fix it instead of repeating the same draft.
            payload["messages"][1]["content"] += f"\nYour previous draft was rejected: {e}. Write it again and fix exactly that. Keep the requested runtime and show the payoff in the final scene."
    if spec_data is None:
        e = last_error
        print(f"\n❌ Ollama issue or JSON parse error: {e}")
        if payoff or os.environ.get("SHORTS_ALLOW_TEMPLATE") != "1":
            # The template makes up claims ("banned", "only three chefs in the world") and is built to game the hook score, so it must never be published by accident.
            raise SystemExit("Script generation failed 3 times. Stopping instead of using the generic template. Fix the prompt or facts, use SHORTS_SCRIPT, or set SHORTS_ALLOW_TEMPLATE=1 for a throwaway draft.")
        print("Falling back to the built-in template (about 40 seconds, generic, review before publishing)...")
        short_topic = " ".join(topic.split()[:3]) or "dish"
        fb_hook = hook_prompt or f"Guess why this $1,000 banned {short_topic} is secret."
        spec_data = {
            "tightOpen": True,
            "hookText": fb_hook,
            "scenes": [
                {
                    "text": fb_hook,
                    "shot": "macro close-up",
                    "subject": f"a plated luxury {topic} topped with shaved black truffle and flakes of gold leaf",
                    "setting": "a dark marble counter in a high-end restaurant kitchen at night",
                    "lighting": "warm low key light from camera-left, deep shadows, soft rim light",
                    "voice": voice_preset
                },
                {
                    "text": "Only three master chefs in the world have access to this hidden recipe and forbidden culinary technique.",
                    "shot": "over-the-shoulder medium shot",
                    "subject": f"a chef in a white jacket carefully plating {topic} with steel tweezers",
                    "setting": "a busy Michelin-star kitchen, copper pans and steam blurred behind",
                    "lighting": "warm overhead pass light with cool blue fill from the side",
                    "voice": voice_preset
                },
                {
                    "text": "Most people think spending a thousand dollars on a single dish is total madness or an outright scam.",
                    "shot": "overhead flat lay",
                    "subject": "a long dining table set with crystal glasses, a decanter of dark red wine and small bowls of caviar and saffron",
                    "setting": "a private dining room with a linen tablecloth in the evening",
                    "lighting": "soft candlelight with gentle highlights on the glass",
                    "voice": voice_preset
                },
                {
                    "text": "Behind closed doors, elite collectors bid fortunes just to secure a single gram of this rare ingredient.",
                    "shot": "wide establishing shot",
                    "subject": "a single glass jar of rare golden spice on a velvet-draped pedestal",
                    "setting": "an empty auction hall with rows of red velvet chairs at dusk",
                    "lighting": "one narrow spotlight from above, dark surroundings",
                    "voice": voice_preset
                },
                {
                    "text": "Those who have tasted it claim the intense flavor profile completely transforms your mind and palate forever.",
                    "shot": "detail close-up",
                    "subject": f"a spoonful of {topic} with a glossy sauce, glistening crumbs and a gold-dusted edge",
                    "setting": "a black slate plate on a dark wooden table",
                    "lighting": "soft side light from camera-right with a warm highlight",
                    "voice": voice_preset
                },
                {
                    "text": "Is this true culinary genius or just an overpriced luxury scam? Drop your opinion in the comments below!",
                    "shot": "low-angle hero shot",
                    "subject": f"a single finished plate of {topic} on a gold-rimmed white plate",
                    "setting": "an empty candlelit restaurant table by a tall window at night",
                    "lighting": "warm golden candlelight with a cool blue window glow behind",
                    "voice": voice_preset
                }
            ]
        }

    if visual_constraints:
        spec_data["visualConstraints"] = visual_constraints
    if args.draft_only:
        destination = Path("out") / args.name / "draft.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("x", encoding="utf-8") as f:
            json.dump(spec_data, f, indent=2, ensure_ascii=False)
        print(f"Draft saved: {destination.resolve()}")
        return

    # Enforce shorts-app spec requirements
    spec_data["hookText"] = clamp_hook(spec_data.get("hookText") or hook_prompt)
    spec_data["kicker"] = " ".join(str(spec_data.get("kicker") or " ".join(topic.split()[:3])).split()[:4]).upper()
    kw = spec_data.get("keywords")
    spec_data["keywords"] = [" ".join(str(k).lower().split()) for k in kw if str(k).strip()][:6] if isinstance(kw, list) else []
    spec_data["kind"] = "stills"
    spec_data["output"] = "out/interactive.mp4" if args.name == "interactive" else f"out/{args.name}/{args.name}.mp4"
    if "brand" not in spec_data or not isinstance(spec_data["brand"], dict) or not spec_data["brand"].get("name"):
        # The end card shows this name. Use the channel name when given, else the video's own kicker, never a made-up brand.
        spec_data["brand"] = {"name": os.environ.get("SHORTS_BRAND") or spec_data["kicker"] or "Shorts"}
    voice_provider = args.voice_provider
    voice_id = args.voice_id
    transition = args.transition
    effects = args.effects
    if not unattended:
        voice_provider = voice_provider or input("Voice [elevenlabs/mock, Enter keeps current]: ").strip().lower()
        if (voice_provider or VOICE_PROVIDER) == "elevenlabs" and not voice_id:
            voice_id = input("ElevenLabs voice ID [Enter uses configured voice or Brian]: ").strip()
        transition = transition or input("Transition [fade/cut/flash/gold/punch/whip, Enter keeps scene settings]: ").strip().lower()
        effects = effects or input("Sound effects [off/subtle/standard, Enter keeps current]: ").strip().lower()
    if transition and transition not in TRANSITIONS or effects and effects not in EFFECT_LEVELS:
        parser.error("Choose a listed transition and sound-effects level")
    if voice_id and (voice_provider or VOICE_PROVIDER) == "mock":
        parser.error("--voice-id requires ElevenLabs")
    configure_voice(spec_data, voice_provider or "", voice_id or "")
    configure_edit(spec_data, transition, effects)
    spec_data.setdefault("fps", 30)
    spec_data.setdefault("music", os.environ.get("SHORTS_MUSIC") or "ambient")  # SHORTS_MUSIC=/path/to/track.mp3 uses a licensed track instead of the built-in ambient bed
    if "scenes" not in spec_data or not isinstance(spec_data["scenes"], list) or len(spec_data["scenes"]) == 0:
        spec_data["scenes"] = [{"text": f"Overview of {topic}.", "subject": topic, "voice": voice_preset}]

    # A small model often repeats the same shot, so neighbouring scenes always get a different camera position.
    previous_shot = None
    for i, scene in enumerate(spec_data["scenes"]):
        if scene.get("shot") not in SHOT_LOOK or scene.get("shot") == previous_shot:
            scene["shot"] = next(s for s in SHOT_CYCLE[i % len(SHOT_CYCLE):] + SHOT_CYCLE if s != previous_shot)
        previous_shot = scene["shot"]

    image_folder = os.environ.get("SHORTS_SCENE_IMAGES", "").strip()
    if args.strict_images and not HAS_PIL:
        parser.error("--strict-images requires Pillow in the Python environment")
    _SEEN_HASHES.clear()
    supplied = []
    if image_folder:
        for index in range(1, len(spec_data["scenes"]) + 1):
            image = os.path.join(image_folder, f"scene_{index}.png")
            if not os.path.isfile(image) or not is_image(open_image_bytes(image)):
                raise SystemExit(f"Missing or unreadable scene image: {image}")
            if args.strict_images:
                why = image_problem(Path(image).read_bytes(), near=1)
                if why:
                    raise SystemExit(f"Scene {index} image rejected: {why}")
            supplied.append(image)

    # Generate Image Assets for each scene
    os.makedirs(asset_dir, exist_ok=True)
    print("\n🎨 Creating visual scene assets...")
    for i, scene in enumerate(spec_data["scenes"], 1):
        # The hook and the closing image must show the topic itself, so the video is recognisable at a glance.
        img_prompt = compose_image_prompt(scene, topic, ground=i in (1, len(spec_data["scenes"])))
        constraints = spec_data.get("visualConstraints")
        if constraints:
            img_prompt += f" Required continuity: {constraints}."
            scene["visualConstraints"] = constraints
        scene["image_prompt"] = img_prompt
        image_filename = f"scene_{i}.png"
        image_path = os.path.join(asset_dir, image_filename).replace("\\", "/")
        anchor = os.path.join(asset_dir, "scene_1.png") if CHAIN_IMAGES and i > 1 else None
        if supplied:
            image_path = supplied[i - 1].replace("\\", "/")
            print(f"   Using supplied scene image: {image_path}")
        else:
            generate_ai_scene_image(img_prompt, image_path, i, len(spec_data["scenes"]), anchor, strict=args.strict_images)
        scene["image"] = image_path
        scene.setdefault("motion", MOTIONS[(i - 1) % len(MOTIONS)])
        if not scene.get("voice"):
            scene["voice"] = voice_preset

    review = Path("out") / args.name / "image-review.html"
    review.parent.mkdir(parents=True, exist_ok=True)
    cards = []
    for index, scene in enumerate(spec_data["scenes"], 1):
        uri = Path(scene["image"]).resolve().as_uri()
        cards.append(f'<section><h2>Scene {index}</h2><img width="240" src="{escape(uri)}">'
                     f'<p>{escape(scene["text"])}</p><p>{escape(scene["image_prompt"])}</p>'
                     f'<p>{escape(motion_prompt(scene))}</p></section>')
    review.write_text('<!doctype html><meta charset="utf-8"><title>Scene image review</title>'
                      '<h1>Scene image review</h1><p>Compare the image to the expected subject and action. '
                      'For watches, check dial markings, hand positions, bezel geometry and continuity.</p>'
                      + ''.join(cards), encoding="utf-8")
    print(f"Image review: {review.resolve()}")

    # Clips are made after all images, so a 16 GB Mac can stop ComfyUI first and give the memory to the video model.
    video_scenes = pick_video_scenes(len(spec_data["scenes"]))
    if video_scenes:
        if IMAGE_PROVIDER == "comfyui" and VIDEO_PROVIDER == "ltx-mlx":
            print("\n💡 Images are done. If memory is tight, stop ComfyUI now (the video model needs it).")
        print("\n🎞️  Creating real motion clips...")
        for i, scene in enumerate(spec_data["scenes"], 1):
            if i in video_scenes:
                clip = animate_scene(scene["image"], scene, i)
                if clip:
                    scene["video"] = clip
                    scene["videoFill"] = "hold"

    # Step 2: Display Interactive Preview Card
    print("\n" + "=" * 60)
    print(" 📋 PREVIEW CARD - REVIEW YOUR SCENE SPECIFICATION")
    print("=" * 60)
    print(f" 🏷️  Brand Name        : {spec_data['brand']['name']}")
    print(f" 🎙️  Voice Provider     : {spec_data['voice']['provider']}")
    print(f" 🎯 Spec Kind & Output : {spec_data['kind']} -> {spec_data['output']}")
    print(f" 🪝 Hook Text (0-2.4s) : {spec_data.get('hookText')}")
    print(f" ⚡ Tight Open Trimming: {spec_data.get('tightOpen')}")
    print(" 🎬 Generated Scenes & Visual Assets:")
    for i, scene in enumerate(spec_data["scenes"], 1):
        print(f"   [{i}] Narration: \"{scene.get('text')}\"")
        print(f"       Visual Prompt : \"{scene.get('image_prompt', 'N/A')}\"")
        print(f"       Generated Asset: {scene.get('image')}")
    print(" ⚠️  Review the script and verify factual claims before publishing.")
    print("=" * 60)

    # Step 3: Launch Assembly Pipeline
    confirm = "yes" if args.yes else "no" if args.preview else input("\nRender this preview? (y/N): ").strip().lower()
    if confirm in ['y', 'yes']:
        os.makedirs("episodes", exist_ok=True)
        os.makedirs("out", exist_ok=True)
        with open(spec_path, "w", encoding="utf-8") as f:
            json.dump(spec_data, f, indent=2)

        print(f"\n✅ Spec saved to {spec_path}")
        print("🚀 Launching shorts-app assembly pipeline...\n")

        render_spec(spec_path)
    else:
        print("\nOperation cancelled. No video was rendered.")

if __name__ == "__main__":
    main()
