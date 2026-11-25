"""Render quality presets shared by every Studio render path (full render, single-shot retry, preview stills).

standard = the long-standing fast default on a 16 GB Apple Silicon Mac (384x640, 97 frames).
high     = opt-in, matches the bench clips the owner scored (704x1280). Slower; same 97-frame clip length so
           shot timing, caching and assembly stay identical. Unknown values fall back to standard.
A faster machine later changes speed only; these presets do not change.
"""
import os

FRAMES = 97
QUALITIES = {
    'standard': {'short': (384, 640), 'wide': (640, 384)},
    'high': {'short': (704, 1280), 'wide': (1280, 704)},
}
DEFAULT = 'standard'


def normalize(value):
    value = str(value or '').strip().lower()
    return value if value in QUALITIES else DEFAULT


def pick(settings=None):
    """Quality for this run: scenario settings first, then the Studio's SHORTS_RENDER_QUALITY, else standard."""
    chosen = (settings or {}).get('quality') or os.environ.get('SHORTS_RENDER_QUALITY')
    return normalize(chosen)


def layout(settings):
    """'short' (vertical) or 'wide' (landscape): the names the size table and the assembler's manifest use.

    Scenarios call landscape 'long' (scripts/scenario-schema.mjs), so any format other than 'short' is wide.
    """
    return 'short' if (settings or {}).get('format', 'short') == 'short' else 'wide'


def dimensions(settings):
    """(width, height) for the scenario's format at the chosen quality."""
    return QUALITIES[pick(settings)][layout(settings)]


def known_sizes():
    return {size for sizes in QUALITIES.values() for size in sizes.values()}
