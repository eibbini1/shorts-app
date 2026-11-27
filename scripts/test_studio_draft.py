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

    def test_pre_render_gates_surface_reviews_and_only_block_unattended_continuity_risks(self):
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

        def repaired_fields(command, **_kwargs):
            name = next((part for part in command if part.endswith('.py') or part.endswith('.mjs')), '')
            output = {
                'preflight-short.py': '',
                'audit-local-story.py': 'REVIEW: the story model repaired fields automatically; inspect those shots before render\n',
                'evidence_gate.py': 'Evidence gate passed\n',
                'add-sfx.py': 'Sound cue and ASMR coverage plan passed\n',
                'bb-local-scenario.mjs': 'Scenario structure verified\n',
            }[Path(name).name]
            return type('Result', (), {'returncode': 0, 'stdout': output, 'stderr': ''})()

        with patch.object(STUDIO_DRAFT['subprocess'], 'run', side_effect=repaired_fields), \
             patch.dict(STUDIO_DRAFT['os'].environ, {'SHORTS_STUDIO_UNATTENDED': '1', 'SHORTS_MIN_PROMPT_SCORE': '0'}):
            problems = STUDIO_DRAFT['checks']('fixture.local-scenario.json', False)
        self.assertEqual(problems, [])

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

    def test_unattended_review_attempts_repair_before_rewriting_the_story(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scn_rel = 'drafts/generated/retry-unattended.local-scenario.json'
            scn_abs = root / scn_rel
            scn_abs.parent.mkdir(parents=True, exist_ok=True)
            scn_abs.write_text('{}')

            class PlanProcess:
                def __init__(self):
                    self.stdout = iter([f'Review the shot plan: {scn_rel}\n'])
                def wait(self):
                    return 0

            checks_mock = unittest.mock.MagicMock(side_effect=[['unattended review required: auto repair'], []])
            output = io.StringIO()
            with patch.dict(STUDIO_DRAFT['main'].__globals__, {'ROOT': root, 'checks': checks_mock}), \
                 patch.object(sys, 'argv', ['studio-draft.py', '--answers', 'answers.json', '--tries', '2']), \
                 patch.object(STUDIO_DRAFT['subprocess'], 'run', return_value=type('Result', (), {
                     'stdout': '', 'stderr': '', 'returncode': 0,
                 })()), \
                 patch.object(STUDIO_DRAFT['subprocess'], 'Popen', side_effect=lambda *a, **k: PlanProcess()) as popen, \
                 contextlib.redirect_stdout(output):
                rc = STUDIO_DRAFT['main']()
            self.assertEqual(rc, 0)
            self.assertEqual(popen.call_count, 1)
            self.assertEqual(checks_mock.call_count, 2)
            self.assertIn('Story passed every check after automatic fixes (attempt 1).', output.getvalue())

    def test_unattended_draft_stops_after_two_attempts_if_continuity_still_needs_review(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scn_rel = 'drafts/generated/blocked-continuity.local-scenario.json'
            scn_abs = root / scn_rel
            scn_abs.parent.mkdir(parents=True, exist_ok=True)
            scn_abs.write_text('{}')

            class PlanProcess:
                def __init__(self):
                    self.stdout = iter([f'Plan saved: {scn_rel}\n'])
                def wait(self):
                    return 0

            checks_mock = unittest.mock.MagicMock(
                side_effect=[['unattended review required: missing continuity']] * 4,
            )
            output = io.StringIO()
            with patch.dict(STUDIO_DRAFT['main'].__globals__, {'ROOT': root, 'checks': checks_mock}), \
                 patch.object(sys, 'argv', ['studio-draft.py', '--answers', 'answers.json']), \
                 patch.object(STUDIO_DRAFT['subprocess'], 'run', return_value=type('Result', (), {
                     'stdout': '', 'stderr': '', 'returncode': 0,
                 })()), \
                 patch.object(STUDIO_DRAFT['subprocess'], 'Popen', side_effect=lambda *a, **k: PlanProcess()) as popen, \
                 contextlib.redirect_stdout(output):
                rc = STUDIO_DRAFT['main']()
            self.assertEqual(rc, 3)
            self.assertEqual(popen.call_count, 2)
            self.assertEqual(checks_mock.call_count, 4)
            self.assertIn('NEEDS-CHOICE: still-blocked', output.getvalue())

    def test_polish_skips_food_prompt_gate_for_non_food_look_profile(self):
        import json, tempfile
        with tempfile.TemporaryDirectory() as tmp:
            scn_path = Path(tmp) / 'cartoon.local-scenario.json'
            scn_path.write_text(json.dumps({
                'schemaVersion': 1,
                'settings': {'format': 'short', 'seconds': 10, 'look': 'cartoon'},
                'plan': {'shots': []},
            }), encoding='utf-8')
            with patch.dict(STUDIO_DRAFT['os'].environ, {}, clear=False), \
                 patch.object(STUDIO_DRAFT['subprocess'], 'run') as run_mock:
                STUDIO_DRAFT['os'].environ.pop('SHORTS_MIN_PROMPT_SCORE', None)
                STUDIO_DRAFT['os'].environ.pop('SHORTS_LOOK', None)
                self.assertEqual(STUDIO_DRAFT['polish'](str(scn_path)), [])
                self.assertEqual(run_mock.call_count, 0)


if __name__ == '__main__':
    unittest.main()
