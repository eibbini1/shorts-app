import os
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
VOICE_PROVIDER = os.environ.get("SHORTS_VOICE", "mock")  # "elevenlabs" for real narration
IMAGE_TIMEOUT = int(os.environ.get("SHORTS_IMAGE_TIMEOUT", "90"))
# Heavier machines (for example an Apple Silicon Mac) can run ComfyUI locally for better images and real video clips.
#   SHORTS_IMAGE_PROVIDER=pollinations (default) | comfyui
#   SHORTS_VIDEO_PROVIDER=none (default) | ltx-mlx | comfyui   animates chosen scene images into real motion clips
#       ltx-mlx = the runtime from scripts/setup-mac.sh (set LTX_MLX_BIN to override its path)
#   SHORTS_VIDEO_SCENES=auto (hook, catch, ending) | all | 1,4,7
# ComfyUI workflows are "Save (API Format)" JSON files. Like scripts/local-media.mjs, the exact string values
# "{{prompt}}", "{{seed}}", "{{width}}", "{{height}}" and (video only) "{{image}}" are replaced before the run.
IMAGE_PROVIDER = os.environ.get("SHORTS_IMAGE_PROVIDER", "pollinations").strip().lower()
VIDEO_PROVIDER = os.environ.get("SHORTS_VIDEO_PROVIDER", "none").strip().lower()
VIDEO_SCENES = os.environ.get("SHORTS_VIDEO_SCENES", "auto").strip().lower()
COMFY_URL = os.environ.get("COMFY_URL", "http://127.0.0.1:8188").rstrip("/")
COMFY_IMAGE_WORKFLOW = os.environ.get("COMFY_IMAGE_WORKFLOW", os.path.join("workflows", "image.api.json"))
COMFY_VIDEO_WORKFLOW = os.environ.get("COMFY_VIDEO_WORKFLOW", os.path.join("workflows", "video.api.json"))
COMFY_TIMEOUT = int(os.environ.get("COMFY_TIMEOUT", "1800"))
LTX_MLX_BIN = os.environ.get("LTX_MLX_BIN", os.path.join("storage", "tools", "ltx-2-mlx", ".venv", "bin", "ltx-2-mlx"))
MOTIONS = ["in", "left", "out", "right"]
MODEL_NAME = os.environ.get("SHORTS_MODEL", "qwen3:4b-instruct-2507-q4_K_M")  # SHORTS_MODEL=qwen3:1.7b for fast drafts

# Target video length. About 2.5 spoken words per second; 60 s means 6-7 scenes and ~150 words.
TARGET_SECONDS = int(os.environ.get("SHORTS_SECONDS", "60"))
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
IMAGE_STYLE = "Moody dark food photography with deep shadows and warm gold highlights, cinematic color grading, subtle film grain."
# Fixed order that gives a different camera position in every neighbouring scene.
SHOT_CYCLE = ["macro close-up", "wide establishing shot", "detail close-up", "overhead flat lay",
              "over-the-shoulder medium shot", "low-angle hero shot"]
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
    parts = [f"A photorealistic {shot} of {subject}" + (f", set in {setting}." if setting else ".")]
    parts.append(f"Lit by {lighting}.")
    parts.append(f"Captured with {SHOT_LOOK[shot]}.")
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


def clamp_hook(text, limit=10) -> str:
    return " ".join(str(text or "").split()[:limit])


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
    if len(first.split()) > 10 and hook and len(hook.split()) <= 10:
        scenes[0]["text"] = hook
    elif len(hook.split()) > 10 and first and len(first.split()) <= 10:
        spec["hookText"] = first


def script_problems(spec):
    """Rules the JSON schema cannot express: scene count and hook length."""
    problems = []
    scenes = spec.get("scenes")
    if not isinstance(scenes, list) or not MIN_SCENES <= len(scenes) <= MAX_SCENES:
        problems.append(f"needs {MIN_SCENES} or {MAX_SCENES} scenes")
    elif any(not isinstance(s, dict) or not str(s.get("text", "")).strip() for s in scenes):
        problems.append("a scene has no text")
    elif len(str(scenes[0]["text"]).split()) > 10:
        problems.append(f"scene 1 has {len(str(scenes[0]['text']).split())} words, needs 10 or fewer")
    total_words = sum(len(str(s.get("text", "")).split()) for s in scenes) if isinstance(scenes, list) else 0
    if scenes and total_words < 0.8 * TOTAL_WORDS:
        problems.append(f"only {total_words} words, needs about {TOTAL_WORDS}")
    hook_words = len(str(spec.get("hookText", "")).split())
    if hook_words > 10:
        problems.append(f"hookText has {hook_words} words, needs 10 or fewer")
    return problems


def load_font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


_SEEN_HASHES = []


def image_problem(data):
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
        if any(sum(a != b for a, b in zip(bits, old)) < 26 for old in _SEEN_HASHES):
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
    return f"{camera}. {action}. Preserve the original {subject}, composition and lighting. No text, no camera movement."


def animate_scene(image_path, scene, scene_idx):
    """Turns a scene image into a short motion clip. Returns the clip path, or None to keep the still."""
    clip_path = os.path.join(ASSET_DIR, f"clip_{scene_idx}.mp4").replace("\\", "/")
    raw_path = clip_path + ".raw"
    prompt = motion_prompt(scene)
    try:
        print(f"   🎞️  Animating scene {scene_idx} with {VIDEO_PROVIDER} (this can take minutes): {prompt}")
        if VIDEO_PROVIDER == "ltx-mlx":
            # Same settings as scripts/test-mac-motion.sh (49 frames at 24 fps, 384x640, distilled, low RAM).
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
                            "-H", "640", "-W", "384", "-f", "49", "--frame-rate", "24", "-o", raw_path],
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
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw_path, "-an", "-vf", "scale=720:1280:flags=lanczos",
                        "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "18", clip_path], check=True)
        os.remove(raw_path)
        print(f"      ✅ Clip -> {clip_path}")
        return clip_path
    except Exception as err:
        print(f"      ⚠️  Animation failed ({err}). Keeping the still image with camera motion.")
        return None


def generate_ai_scene_image(prompt_text, output_path, scene_idx, total_scenes):
    """Generates 9:16 portrait visual assets via AI API or falls back to a stylized slide."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
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


def main():
    print("=" * 60)
    print(" 🎬 LOCAL AI SHORT VIDEO GENERATOR (~" + str(TARGET_SECONDS) + "s, 80+ Hook Score)")
    print("=" * 60)

    topic = input("\n[1/3] What is your video topic or story idea? ").strip()
    voice_preset = input("[2/3] Choose voice preset (e.g. en_male, en_female) [default: en_female]: ").strip() or "en_female"
    hook_prompt = input("[3/3] Custom hook line (or press Enter for AI to generate): ").strip()

    print(f"\n🤖 Contacting local Ollama model ({MODEL_NAME}) to generate script & image prompts...")

    # System prompt engineered for 80+ hook retention score AND the target total duration
    system_prompt = (
        "You are a viral short-video director. Output ONLY valid JSON with no markdown block formatting.\n"
        "STRICT HOOK & DURATION RULES FOR 80+ RETENTION SCORE:\n"
        "1. 'hookText': MUST be 10 words or fewer.\n"
        "2. Scene 1 'text' is the hook line itself: 10 words or fewer, and it MUST include a curiosity gap ('Guess why' or 'Here is why'), a concrete price ('$1,000'), AND name a specific luxury item ('truffle', 'gold', 'wagyu', 'caviar').\n"
        "3. Tension: Include high-tension words ('banned', 'forbidden', 'secret', 'scam') in the opening scenes.\n"
        f"4. Total Length: Create exactly {MIN_SCENES} or {MAX_SCENES} scenes. Scene 1 is the 10-word hook, the other scenes have about {OTHER_WORDS} words each (about {TOTAL_WORDS} words in total) for a video of about {TARGET_SECONDS} seconds. Every scene after the first MUST be 2 or 3 full sentences and at least {OTHER_WORDS - 4} words; shorter scenes make the video too short.\n"
        "5. Closing scene: End with a divisive opinion-gap question ('Genius or total scam? Drop your take below.').\n"
        "STORYTELLING: write for the ear, as a narrator speaking to ONE viewer ('you'). Every scene has a job:\n"
        "- Scene 1 HOOK: the shocking price, the secret, the question. Never start with 'Welcome' or 'Today'.\n"
        "- Scene 2 STAKES: why this matters, with one concrete number.\n"
        "- Scene 3 REVEAL: what it is made of or how it is made, with sensory detail (smell, crunch, shine).\n"
        "- Scene 4 TWIST: the surprising catch, introduced with 'But' or 'Here is the catch'.\n"
        "- Scene 5 COMPARISON: set the price or scale against something familiar (a car, a month of rent).\n"
        "- Middle scenes before the last: PAYOFF, what the first bite or the owner's reaction is like.\n"
        "- Last scene CTA: one divisive question that makes people comment. Reuse one key word from the hook so the ending leads back into the start.\n"
        "Voice rules: sentences of 6 to 14 words, simple everyday words, one idea and at most one number per scene, concrete nouns instead of adjectives like 'amazing'. "
        "End every scene except the last with a small open loop ('and that is not even the strange part') so people keep watching. Never write 'In conclusion' or 'Subscribe'.\n"
        "TRUTH: use only facts that are widely known or frame them as 'reportedly' or 'some say'. Never invent names of people, restaurants, studies or statistics.\n"
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
        f"Create {MIN_SCENES} or {MAX_SCENES} scenes (a 10-word hook first, then about {OTHER_WORDS} words per scene, about {TOTAL_WORDS} words in total) with the shot, subject, setting, lighting and action fields filled for each scene."
    )
    if hook_prompt:
        user_prompt += f" Hook: {hook_prompt}."
    # SHORTS_FACTS=facts.txt holds checked facts (prices, origins). The model must use only these, so it cannot invent claims.
    facts_file = os.environ.get("SHORTS_FACTS", "").strip()
    if facts_file:
        with open(facts_file, encoding="utf-8") as f:
            user_prompt += "\nUse ONLY these verified facts for every claim, price and origin; do not add others:\n" + f.read().strip()[:1500]

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "stream": False,
        "think": False,
        "format": SCRIPT_SCHEMA,
        "options": {"temperature": 0.7, "num_ctx": 4096},
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
    for attempt in range(1, 4):
        if spec_data is not None:
            break
        try:
            candidate = parse_model_json(call_ollama(payload))
            repair_script(candidate)
            problems = script_problems(candidate)
            if problems:
                raise ValueError("; ".join(problems))
            spec_data = candidate
            break
        except Exception as e:
            last_error = e
            print(f"   Attempt {attempt}/3 rejected: {e}")
    if spec_data is None:
        e = last_error
        print(f"\n❌ Ollama issue or JSON parse error: {e}")
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

    # Enforce shorts-app spec requirements
    spec_data["hookText"] = clamp_hook(spec_data.get("hookText") or hook_prompt)
    spec_data["kicker"] = " ".join(str(spec_data.get("kicker") or " ".join(topic.split()[:3])).split()[:4]).upper()
    kw = spec_data.get("keywords")
    spec_data["keywords"] = [" ".join(str(k).lower().split()) for k in kw if str(k).strip()][:6] if isinstance(kw, list) else []
    spec_data["kind"] = "stills"
    spec_data["output"] = "out/interactive.mp4"
    if "brand" not in spec_data or not isinstance(spec_data["brand"], dict) or not spec_data["brand"].get("name"):
        spec_data["brand"] = {"name": "Local Shorts"}
    if "voice" not in spec_data or not isinstance(spec_data["voice"], dict) or spec_data["voice"].get("provider") not in ["elevenlabs", "mock"]:
        spec_data["voice"] = {"provider": VOICE_PROVIDER}
        if VOICE_PROVIDER == "elevenlabs":
            spec_data["voice"].update({"speed": 1, "stability": 0.45, "style": 0.5})
    spec_data.setdefault("fps", 30)
    spec_data.setdefault("music", "ambient")
    if "scenes" not in spec_data or not isinstance(spec_data["scenes"], list) or len(spec_data["scenes"]) == 0:
        spec_data["scenes"] = [{"text": f"Overview of {topic}.", "subject": topic, "voice": voice_preset}]

    # A small model often repeats the same shot, so neighbouring scenes always get a different camera position.
    previous_shot = None
    for i, scene in enumerate(spec_data["scenes"]):
        if scene.get("shot") not in SHOT_LOOK or scene.get("shot") == previous_shot:
            scene["shot"] = next(s for s in SHOT_CYCLE[i % len(SHOT_CYCLE):] + SHOT_CYCLE if s != previous_shot)
        previous_shot = scene["shot"]

    # Generate Image Assets for each scene
    os.makedirs(ASSET_DIR, exist_ok=True)
    print("\n🎨 Creating visual scene assets...")
    for i, scene in enumerate(spec_data["scenes"], 1):
        # The hook and the closing image must show the topic itself, so the video is recognisable at a glance.
        img_prompt = compose_image_prompt(scene, topic, ground=i in (1, len(spec_data["scenes"])))
        scene["image_prompt"] = img_prompt
        image_filename = f"scene_{i}.png"
        image_path = os.path.join(ASSET_DIR, image_filename).replace("\\", "/")
        generate_ai_scene_image(img_prompt, image_path, i, len(spec_data["scenes"]))
        scene["image"] = image_path
        scene.setdefault("motion", MOTIONS[(i - 1) % len(MOTIONS)])
        if not scene.get("voice"):
            scene["voice"] = voice_preset

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
    print(" ⚠️  A small local model wrote this script. Check every claim against a primary source before publishing.")
    print("=" * 60)

    # Step 3: Launch Assembly Pipeline
    confirm = input("\nGenerate this video now? (Y/n): ").strip().lower()
    if confirm in ['', 'y', 'yes']:
        os.makedirs("episodes", exist_ok=True)
        os.makedirs("out", exist_ok=True)
        with open(SPEC_PATH, "w", encoding="utf-8") as f:
            json.dump(spec_data, f, indent=2)

        print(f"\n✅ Spec saved to {SPEC_PATH}")
        print("🚀 Launching shorts-app assembly pipeline...\n")

        env = os.environ.copy()
        env["OPENAI_BASE_URL"] = "http://localhost:11434/v1"
        env["OPENAI_API_KEY"] = "ollama"
        env["OPENAI_MODEL"] = MODEL_NAME

        command = ["npm", "run", "pipeline", "--", "--spec", SPEC_PATH]
        if os.environ.get("SHORTS_ALLOW_VOICE_SPEND") == "1":
            command.append("--allow-voice-spend")  # uncached ElevenLabs lines spend characters
        result = subprocess.run(command, env=env, shell=True)
        if result.returncode != 0:
            print(f"\n❌ Pipeline failed (exit {result.returncode}). See the log above.")
            raise SystemExit(result.returncode)
    else:
        print("\nOperation cancelled. No video was rendered.")

if __name__ == "__main__":
    main()