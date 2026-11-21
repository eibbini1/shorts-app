import contextlib
import io
import runpy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

STUDIO_DRAFT = runpy.run_path('scripts/studio-draft.py')


class FakeProcess:
    stdout = iter([
        'usage: director-brief.py [options]\n',
        'director-brief.py: error: topic is 601 characters; maximum is 600\n',
    ])

    def wait(self):
        return 2


class StudioDraftTests(unittest.TestCase):
    def test_input_validation_error_stops_without_retrying(self):
        fake = FakeProcess()
        output = io.StringIO()
        with patch.object(sys, 'argv', ['studio-draft.py', '--answers', 'answers.json']), \
             patch.object(STUDIO_DRAFT['subprocess'], 'Popen', return_value=fake) as popen, \
             contextlib.redirect_stdout(output):
            result = STUDIO_DRAFT['main']()
        self.assertEqual(result, 2)
        self.assertEqual(popen.call_count, 1)
        self.assertIn('BLOCKED: director brief input:', output.getvalue())
        self.assertIn('No media render was started.', output.getvalue())

    def test_pre_render_gates_surface_reviews_and_block_unattended_continuity_risks(self):
        calls = []

        def run(command, **_kwargs):
            name = next((part for part in command if part.endswith('.py') or part.endswith('.mjs')), '')
            calls.append(name)
            output = {
                'preflight-short.py': '',
                'audit-local-story.py': 'REVIEW: shot 2 omits the named setting; inspect location continuity\n',
                'evidence_gate.py': 'Evidence gate passed\n',
                'add-sfx.py': 'Sound cue and ASMR coverage plan passed\n',
                'bb-local-scenario.mjs': 'Scenario structure verified\n',
            }[Path(name).name]
            return type('Result', (), {'returncode': 0, 'stdout': output, 'stderr': ''})()

        output = io.StringIO()
        with patch.object(STUDIO_DRAFT['subprocess'], 'run', side_effect=run), \
             patch.dict(STUDIO_DRAFT['os'].environ, {'SHORTS_STUDIO_UNATTENDED': '0', 'SHORTS_MIN_PROMPT_SCORE': '0'}), \
             contextlib.redirect_stdout(output):
            problems = STUDIO_DRAFT['checks']('fixture.local-scenario.json', False)
        self.assertEqual(problems, [])
        self.assertIn('REVIEW: shot 2 omits the named setting', output.getvalue())
        self.assertTrue(any(name.endswith('evidence_gate.py') for name in calls))
        self.assertTrue(any(name.endswith('add-sfx.py') for name in calls))

        with patch.object(STUDIO_DRAFT['subprocess'], 'run', side_effect=run), \
             patch.dict(STUDIO_DRAFT['os'].environ, {'SHORTS_STUDIO_UNATTENDED': '1', 'SHORTS_MIN_PROMPT_SCORE': '0'}):
            problems = STUDIO_DRAFT['checks']('fixture.local-scenario.json', False)
        self.assertEqual(len(problems), 1)
        self.assertIn('unattended review required', problems[0])

    def test_evidence_and_sound_failures_block_before_generation(self):
        def run(command, **_kwargs):
            name = next((part for part in command if part.endswith('.py') or part.endswith('.mjs')), '')
            output = {
                'preflight-short.py': '',
                'audit-local-story.py': '',
                'evidence_gate.py': 'BLOCKED: visible price is not sourced\n',
                'add-sfx.py': 'BLOCKED: shot 1 has no supported ASMR cue\n',
                'bb-local-scenario.mjs': '',
            }[Path(name).name]
            return type('Result', (), {'returncode': int(bool(output)), 'stdout': output, 'stderr': ''})()

        with patch.object(STUDIO_DRAFT['subprocess'], 'run', side_effect=run), \
             patch.dict(STUDIO_DRAFT['os'].environ, {'SHORTS_STUDIO_UNATTENDED': '0', 'SHORTS_MIN_PROMPT_SCORE': '0'}):
            problems = STUDIO_DRAFT['checks']('fixture.local-scenario.json', False)
        self.assertIn('visible price is not sourced', problems)
        self.assertIn('shot 1 has no supported ASMR cue', problems)


if __name__ == '__main__':
    unittest.main()
