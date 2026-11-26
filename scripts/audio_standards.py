"""Shared broadcast/Shorts audio loudness targets and FFmpeg loudnorm filter builder.

Keeps mixing, SFX ducking, ArtCraft bounces, technical QA, and editorial pre-review
aligned around a single integrated loudness target (-15.0 LUFS, -1.5 dBTP).
"""

TARGET_LUFS = -15.0
TARGET_TP_DB = -1.5
TARGET_LRA = 11.0

QA_MIN_LUFS = -18.0
QA_MAX_LUFS = -13.0
QA_MAX_TP_DB = -0.5

PREREVIEW_TOLERANCE_LUFS = 2.5
PREREVIEW_MAX_TP_DB = -0.8


def loudnorm_filter(target_lufs=TARGET_LUFS, tp_db=TARGET_TP_DB, lra=TARGET_LRA, print_json=False):
    """Build an FFmpeg loudnorm filter string using shared targets."""
    base = f'loudnorm=I={target_lufs:g}:TP={tp_db:g}:LRA={lra:g}'
    return f'{base}:print_format=json' if print_json else base


def qa_loudness_ok(lufs, true_peak_db):
    """Return True when integrated LUFS and true peak satisfy QA gates."""
    return QA_MIN_LUFS <= lufs <= QA_MAX_LUFS and true_peak_db <= QA_MAX_TP_DB
