"""Structured FLUX still-image prompt builder for vertical 9:16 Shorts that will be animated.

Follows Black Forest Labs guidance for FLUX.2: natural-language prose, subject first, positive wording only (no negative prompts),
lighting stated explicitly, hex colours next to colour names. Sentence order is fixed:
subject, action, style, environment, composition, camera, lighting, materials, motion readiness.

  from flux_prompt import build_prompt
  build_prompt({'subject': 'A red Ferrari 458 Italia', 'action': 'parked, ready to roll forward'}, domain='car')

Domains give safe defaults for every field the caller leaves out: car, food, luxury, technology, cartoon.
"""
import re

FIELDS = ('subject', 'action', 'style', 'environment', 'composition', 'camera', 'lighting', 'materials', 'motion_ready')

DOMAINS = {
    'car': {
        'style': 'photorealistic cinematic automotive photograph',
        'composition': 'vertical 9:16 frame, three-quarter front view, the car fills the lower two thirds with open road ahead and headroom above',
        'camera': 'shot on a 35mm lens at bumper height, shallow depth of field, the whole car body in sharp focus',
        'lighting': 'warm golden-hour side light with soft highlights running along the body panels',
        'materials': 'glossy paint, polished alloy wheels, clear glass, matte black tyres',
        'motion_ready': 'all four wheels and the full silhouette are visible and sharply defined, the car angles slightly toward the camera with clear road ahead for forward motion, the background is simple and uncluttered',
    },
    'food': {
        'style': 'photorealistic editorial food photograph',
        'composition': 'vertical 9:16 frame, the dish centred in the lower middle with soft negative space above',
        'camera': 'shot on a 50mm lens at a 35 degree angle, shallow depth of field, crisp focus on the dish',
        'lighting': 'soft window light from the left with gentle warm highlights and a faint rim light',
        'materials': 'glistening sauce, crisp edges, steam, matte ceramic plate, dark wood table',
        'motion_ready': 'the dish and hands are fully in frame with clean edges, steam and a utensil have room to move, the background stays simple',
    },
    'luxury': {
        'style': 'photorealistic high-end product photograph',
        'composition': 'vertical 9:16 frame, the object centred with generous negative space above and below',
        'camera': 'shot on an 85mm macro lens, shallow depth of field, razor-sharp focus on the object',
        'lighting': 'three-point softbox lighting with a warm key light and a specular highlight on the gold surfaces',
        'materials': 'polished 24K gold (#D4AF37), black velvet, clear glass, fine reflections',
        'motion_ready': 'the object sits fully visible with crisp reflections, a slow camera push-in has room to travel, the backdrop stays dark and uncluttered',
    },
    'technology': {
        'style': 'photorealistic modern technology product photograph',
        'composition': 'vertical 9:16 frame, the device centred at a slight angle with clean space around it',
        'camera': 'shot on a 50mm lens, deep depth of field, sharp focus across the device',
        'lighting': 'cool diffused overhead light with a thin cyan (#00E5FF) rim light',
        'materials': 'brushed aluminium, black glass screen, matte plastic, soft reflections',
        'motion_ready': 'the device and its screen are fully visible with sharp edges, a slow orbit or push-in has room to move, the background is a plain gradient',
    },
    'cartoon': {
        'style': '3D animated feature-film look with soft fur detail',
        'composition': 'vertical 9:16 frame at eye level, faces and hands clearly visible',
        'camera': 'virtual 35mm lens, gentle depth of field',
        'lighting': 'warm soft daylight with a gentle rim light',
        'materials': 'soft fur, smooth fabric, glossy eyes',
        'motion_ready': 'clear silhouettes with limbs apart from the body, props apart so they can move, calm background',
    },
}

NEGATIONS = re.compile(r"\b(no|not|without|don't|dont|avoid|never|none)\b", re.I)


def build_prompt(spec, domain=None):
    """Join the nine fields, domain defaults filling any gaps, into one prose prompt."""
    if domain is not None and domain not in DOMAINS:
        raise ValueError(f'unknown domain {domain!r}; choose from {sorted(DOMAINS)}')
    unknown = set(spec) - set(FIELDS)
    if unknown:
        raise ValueError(f'unknown fields {sorted(unknown)}; allowed {list(FIELDS)}')
    merged = {**DOMAINS.get(domain, {}), **{k: v for k, v in spec.items() if v}}
    missing = [f for f in ('subject', 'action') if not merged.get(f)]
    if missing:
        raise ValueError(f'missing required fields {missing}')
    sentences = []
    for field in FIELDS:
        text = merged.get(field)
        if not text:
            continue
        text = text.strip().rstrip('.')
        if field in ('subject', 'action'):
            sentences.append(text)
        else:
            sentences.append(text[0].upper() + text[1:])
    # subject and action read as one sentence: "A red car, parked on a road."
    head = f'{sentences[0]}, {sentences[1][0].lower() + sentences[1][1:]}' if len(sentences) > 1 and merged.get('action') else sentences[0]
    return '. '.join([head, *sentences[2:]]) + '.'


def check_prompt(text):
    """Return a list of problems: negative wording, repeated sentences, too long for a 4-step model."""
    issues = []
    if NEGATIONS.search(text):
        issues.append('uses negative wording; describe what you want instead')
    sentences = [s.strip().lower() for s in re.split(r'[.!?]+', text) if s.strip()]
    if len(set(sentences)) != len(sentences):
        issues.append('repeats a sentence')
    if len(text.split()) > 140:
        issues.append(f'{len(text.split())} words; keep under 140')
    return issues
