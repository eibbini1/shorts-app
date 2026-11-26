"""Shared local media interpreter & tool path resolver.

Centralizes resolution of the Python media venv (SHORTS_MEDIA_PY) and local LTX CLI
(SHORTS_LTX_CLI) so pipeline scripts and tests stay portable across Mac and Linux/CI.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MEDIA_PY_REL = Path('storage/tools/ComfyUI/.venv/bin/python')
DEFAULT_LTX_CLI_REL = Path('storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx')


def media_python(root=ROOT):
    """Return the configured media Python path (SHORTS_MEDIA_PY override, else local ComfyUI venv)."""
    override = os.environ.get('SHORTS_MEDIA_PY', '').strip()
    if override:
        return Path(override)
    return Path(root) / DEFAULT_MEDIA_PY_REL


def ltx_cli(root=ROOT):
    """Return the configured local LTX-2-MLX CLI path (SHORTS_LTX_CLI override, else local venv)."""
    override = os.environ.get('SHORTS_LTX_CLI', '').strip()
    if override:
        return Path(override)
    return Path(root) / DEFAULT_LTX_CLI_REL


def has_media_python(root=ROOT):
    return media_python(root).is_file()
