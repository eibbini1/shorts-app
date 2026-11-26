"""Unit tests for scripts/runtime_env.py interpreter and CLI path resolution."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import runtime_env  # noqa: E402


class RuntimeEnvTests(unittest.TestCase):
    def test_defaults_point_to_local_tool_venvs_under_root(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('SHORTS_MEDIA_PY', None)
            os.environ.pop('SHORTS_LTX_CLI', None)
            self.assertEqual(runtime_env.media_python(ROOT), ROOT / 'storage/tools/ComfyUI/.venv/bin/python')
            self.assertEqual(runtime_env.ltx_cli(ROOT), ROOT / 'storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx')

    def test_env_overrides_win_and_has_media_python_checks_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            fake_py = Path(tmp) / 'python'
            fake_py.write_text('#!/bin/sh\n')
            fake_ltx = Path(tmp) / 'ltx-2-mlx'
            with patch.dict(os.environ, {'SHORTS_MEDIA_PY': str(fake_py), 'SHORTS_LTX_CLI': str(fake_ltx)}):
                self.assertEqual(runtime_env.media_python(ROOT), fake_py)
                self.assertEqual(runtime_env.ltx_cli(ROOT), fake_ltx)
                self.assertTrue(runtime_env.has_media_python(ROOT))
            with patch.dict(os.environ, {'SHORTS_MEDIA_PY': str(Path(tmp) / 'missing')}):
                self.assertFalse(runtime_env.has_media_python(ROOT))


if __name__ == '__main__':
    unittest.main()
