"""Phase 1 pipeline events: emitter format and the gate events make-local-video.sh prints."""
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import pipeline_events  # noqa: E402

PREFIX = '@@event '


def events(text):
    return [json.loads(line[len(PREFIX):]) for line in text.splitlines() if line.startswith(PREFIX)]


class EmitterTests(unittest.TestCase):
    def test_gate_event_is_one_compact_line_with_shot(self):
        out = io.StringIO()
        pipeline_events.gate('sound', 'blocked', 'cue-missing', 'shot 3: ASMR sound line is empty', stream=out)
        line = out.getvalue()
        self.assertTrue(line.startswith(PREFIX) and line.endswith('\n') and line.count('\n') == 1)
        self.assertEqual(json.loads(line[len(PREFIX):]), {'type': 'gate', 'gate': 'sound', 'status': 'blocked',
                                                          'code': 'cue-missing', 'message': 'shot 3: ASMR sound line is empty', 'shot': 3})

    def test_no_shot_and_long_message_is_capped(self):
        out = io.StringIO()
        pipeline_events.gate('story', 'blocked', 'story-check', 'x' * 900, stream=out)
        event = events(out.getvalue())[0]
        self.assertNotIn('shot', event)
        self.assertEqual(len(event['message']), 400)


class MakeLocalVideoEventTests(unittest.TestCase):
    """Runs the real make-local-video.sh in a temp root with stub gate scripts (no models, no GPU)."""

    def run_script(self, stubs, env_extra=None):
        root = Path(tempfile.mkdtemp(prefix='pipeline-events-'))
        self.addCleanup(shutil.rmtree, root, True)
        (root / 'scripts').mkdir()
        (root / 'drafts/generated').mkdir(parents=True)
        shutil.copy(ROOT / 'scripts/make-local-video.sh', root / 'scripts')
        for helper in ('soft_gate.py', 'gate_severity.py'):  # make-local-video.sh runs its gates through soft_gate.py
            shutil.copy(ROOT / 'scripts' / helper, root / 'scripts')
        for name, code in stubs.items():
            (root / 'scripts' / name).write_text(f'import sys\nprint("stub {name}")\nsys.exit({code})\n')
        scenario = root / 'drafts/generated/fixture.local-scenario.json'
        scenario.write_text('{"settings": {"seconds": 10}, "plan": {"shots": []}}')
        env = {**os.environ, **(env_extra or {})}
        return subprocess.run(['bash', 'scripts/make-local-video.sh', '--scenario', str(scenario.relative_to(root)), '--editor', 'ffmpeg'],
                              cwd=root, capture_output=True, text=True, env=env, timeout=60)

    def test_environment_failure_prints_a_blocked_event_and_keeps_text_and_exit_code(self):
        result = self.run_script({'check-env.py': 1})
        self.assertEqual(result.returncode, 4)
        self.assertIn('Fix the FAIL lines above', result.stderr)
        self.assertEqual(events(result.stdout), [{'type': 'gate', 'gate': 'environment', 'status': 'blocked', 'code': 'env-check-failed', 'exitCode': 4}])

    def test_story_gate_failure_names_the_gate(self):
        result = self.run_script({'check-env.py': 0, 'prompt-lint.py': 0, 'preflight-short.py': 0, 'audit-local-story.py': 3},
                                 {'SHORTS_MIN_PROMPT_SCORE': '0'})
        self.assertEqual(result.returncode, 3)
        self.assertIn('Story gate blocked', result.stderr)
        self.assertEqual([(e['gate'], e['code']) for e in events(result.stdout)], [('story', 'story-blocked')])

    def test_media_python_override_is_used_for_the_sound_audit(self):
        fake = Path(tempfile.mkdtemp()) / 'fake-python'
        self.addCleanup(shutil.rmtree, fake.parent, True)
        fake.write_text('#!/bin/sh\necho "fake media python $*"\nexit 3\n')
        fake.chmod(0o755)
        stubs = {name: 0 for name in ('check-env.py', 'prompt-lint.py', 'preflight-short.py', 'audit-local-story.py', 'evidence_gate.py')}
        result = self.run_script(stubs, {'SHORTS_MEDIA_PY': str(fake), 'SHORTS_MIN_PROMPT_SCORE': '0'})
        self.assertEqual(result.returncode, 3)
        self.assertIn('fake media python scripts/add-sfx.py', result.stdout)
        self.assertEqual([(e['gate'], e['code']) for e in events(result.stdout)], [('sound', 'sound-plan-blocked')])

    def test_unexpected_failure_reports_the_failing_script(self):
        stubs = {name: 0 for name in ('check-env.py', 'prompt-lint.py', 'preflight-short.py', 'audit-local-story.py', 'evidence_gate.py')}
        ok = Path(tempfile.mkdtemp()) / 'ok-python'
        self.addCleanup(shutil.rmtree, ok.parent, True)
        ok.write_text('#!/bin/sh\nexit 0\n'); ok.chmod(0o755)
        stubs['render-any-local.py'] = 7
        result = self.run_script(stubs, {'SHORTS_MEDIA_PY': str(ok), 'SHORTS_MIN_PROMPT_SCORE': '0'})
        self.assertEqual(result.returncode, 7)
        self.assertEqual(events(result.stdout)[-1], {'type': 'gate', 'gate': 'scripts/render-any-local.py', 'status': 'failed', 'code': 'command-failed', 'exitCode': 7})


if __name__ == '__main__':
    unittest.main()
