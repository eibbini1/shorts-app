"""Shared broadcast/Shorts audio loudness targets and FFmpeg loudnorm filter builder.

Keeps mixing, SFX ducking, ArtCraft bounces, technical QA, and editorial pre-review
aligned around the single shared audio specification in data/output-spec.json
(-15.0 LUFS, -1.5 dBTP).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from output_spec import OUTPUT_SPEC  # noqa: E402

_AUDIO = OUTPUT_SPEC['audio']

TARGET_LUFS = float(_AUDIO['targetLufs'])
TARGET_TP_DB = float(_AUDIO['targetTruePeakDb'])
TARGET_LRA = float(_AUDIO['targetLra'])

QA_MIN_LUFS = float(_AUDIO['qaMinLufs'])
QA_MAX_LUFS = float(_AUDIO['qaMaxLufs'])
QA_MAX_TP_DB = float(_AUDIO['qaMaxTruePeakDb'])

PREREVIEW_TOLERANCE_LUFS = float(_AUDIO['prereviewToleranceLufs'])
PREREVIEW_MAX_TP_DB = float(_AUDIO['prereviewMaxTruePeakDb'])


def loudnorm_filter(target_lufs=TARGET_LUFS, tp_db=TARGET_TP_DB, lra=TARGET_LRA, print_json=False):
    """Build an FFmpeg loudnorm filter string using shared targets."""
    base = f'loudnorm=I={target_lufs:g}:TP={tp_db:g}:LRA={lra:g}'
    return f'{base}:print_format=json' if print_json else base


def qa_loudness_ok(lufs, true_peak_db):
    """Return True when integrated LUFS and true peak satisfy QA gates."""
    return QA_MIN_LUFS <= lufs <= QA_MAX_LUFS and true_peak_db <= QA_MAX_TP_DB
