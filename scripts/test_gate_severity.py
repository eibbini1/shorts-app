"""Stop blocking, start warning: soft story rules warn; contradictions of the idea still block.

The problem strings below are copied from real failed Studio sessions (storage/studio-sessions, Nov 17-19).
Run: python3 -m unittest scripts/test_gate_severity.py
"""
import contextlib, io, json, subprocess, sys, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import runpy

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from gate_severity import is_soft, split  # noqa: E402

SOFT_REAL = [
    'picture prompts score 78 (need 85)',
    'title does not name the requested subject',
    'shots 1 and 2 have near-identical imagePrompt',
    'weak hook (40/100): open with a concrete subject and a short curiosity gap',
    "shot 3 has no recognizable physical action",
    'ASMR sound plan has a gap of at least 1.5 s before rendering',
]
HARD_REAL = [
    'payoff changed the requested ending',
    'first shot does not depict the requested visual hook',
    'no moving shot depicts the required physical action',
    'final moving shot does not depict the requested ending',
    'shot 2 does not visibly add honey',
    'repeat topic',
    'repeated imagePrompt',
    'shot timings do not equal the requested runtime',
    'too few distinct shots; motion would repeat or stretch',
    'visible price is not sourced',
    'scenario schema validation failed: bad json',
    'unattended review required: story model repaired fields automatically',
    'a brand new gate message nobody classified',
]


class SeverityTests(unittest.TestCase):
    def test_style_rules_are_soft(self):
        for problem in SOFT_REAL:
            self.assertTrue(is_soft(problem), problem)

    def test_idea_contradictions_honesty_and_unknowns_stay_hard(self):
        for problem in HARD_REAL:
            self.assertFalse(is_soft(problem), problem)

    def test_split_keeps_order(self):
        hard, soft = split(['picture prompts score 70 (need 85)', 'payoff changed the requested ending', 'weak hook (10/100): x'])
        self.assertEqual(hard, ['payoff changed the requested ending'])
        self.assertEqual(soft, ['picture prompts score 70 (need 85)', 'weak hook (10/100): x'])


def run_gate(script_body, *flags):
    with tempfile.TemporaryDirectory() as tmp:
        gate = Path(tmp) / 'gate.py'
        gate.write_text(script_body)
        return subprocess.run([sys.executable, str(ROOT / 'scripts/soft_gate.py'), *flags, '--', sys.executable, str(gate)],
                              capture_output=True, text=True)


class SoftGateWrapperTests(unittest.TestCase):
    def test_only_soft_blocked_lines_become_warnings_and_exit_zero(self):
        r = run_gate("print('BLOCKED: title does not name the requested subject'); raise SystemExit(1)")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('WARNING: title does not name the requested subject', r.stdout)
        self.assertNotIn('BLOCKED:', r.stdout)

    def test_a_hard_line_keeps_the_exit_code_and_the_soft_line_still_warns(self):
        r = run_gate("print('BLOCKED: weak hook (10/100): x'); print('BLOCKED: payoff changed the requested ending'); raise SystemExit(3)")
        self.assertEqual(r.returncode, 3)
        self.assertIn('WARNING: weak hook (10/100): x', r.stdout)
        self.assertIn('BLOCKED: payoff changed the requested ending', r.stdout)

    def test_failure_without_recognisable_lines_keeps_its_code(self):
        r = run_gate("print('Traceback: boom'); raise SystemExit(2)")
        self.assertEqual(r.returncode, 2)

    def test_soft_all_downgrades_only_a_real_score_failure(self):
        scored = run_gate("print('== a.json  overall 70  (prompts 78, story 60)'); raise SystemExit(1)", '--soft-all')
        self.assertEqual(scored.returncode, 0, scored.stdout)
        self.assertIn('WARNING:', scored.stdout)
        crashed = run_gate("raise RuntimeError('crash')", '--soft-all')
        self.assertNotEqual(crashed.returncode, 0)

    def test_passing_gate_is_untouched(self):
        r = run_gate("print('all good')")
        self.assertEqual((r.returncode, r.stdout.strip()), (0, 'all good'))


class DraftLoopTests(unittest.TestCase):
    """studio-draft.py: after the automatic repair, soft-only problems warn and the plan proceeds."""

    def run_main(self, problems):
        draft = runpy.run_path(str(ROOT / 'scripts/studio-draft.py'))
        g = draft['main'].__globals__
        with tempfile.TemporaryDirectory() as tmp:
            scn = 'drafts/generated/a.local-scenario.json'
            (Path(tmp) / 'drafts/generated').mkdir(parents=True)
            (Path(tmp) / scn).write_text('{}')

            class Proc:
                stdout = iter([f'Plan saved: {scn}\n'])
                def wait(self): return 0

            out = io.StringIO()
            with patch.dict(g, {'ROOT': Path(tmp), 'checks': lambda s, allow: list(problems)}), \
                 patch.object(sys, 'argv', ['studio-draft.py', '--answers', 'a.json', '--tries', '2']), \
                 patch.object(g['subprocess'], 'Popen', side_effect=lambda *a, **k: Proc()), \
                 patch.object(g['subprocess'], 'run', return_value=SimpleNamespace(stdout='', stderr='', returncode=0)), \
                 contextlib.redirect_stdout(out):
                code = draft['main']()
        return code, out.getvalue()

    def test_soft_only_proceeds_with_warnings(self):
        code, out = self.run_main(['picture prompts score 78 (need 85)', 'title does not name the requested subject'])
        self.assertEqual(code, 0, out)
        self.assertIn('WARNING: picture prompts score 78 (need 85)', out)
        self.assertIn('Plan ready: drafts/generated/a.local-scenario.json', out)
        self.assertNotIn('NEEDS-CHOICE', out)

    def test_a_hard_problem_still_blocks(self):
        code, out = self.run_main(['picture prompts score 78 (need 85)', 'payoff changed the requested ending'])
        self.assertEqual(code, 3, out)
        self.assertIn('BLOCKED: payoff changed the requested ending', out)
        self.assertNotIn('BLOCKED: picture prompts', out)


class RenderScriptWiringTests(unittest.TestCase):
    def test_render_time_gates_warn_but_evidence_still_blocks(self):
        sh = (ROOT / 'scripts/make-local-video.sh').read_text()
        for gate in ('prompt-lint.py', 'preflight-short.py', 'audit-local-story.py', 'add-sfx.py'):
            line = next(l for l in sh.splitlines() if gate in l and '--' in l and 'gate_event' in l)
            self.assertIn('scripts/soft_gate.py', line, gate)
        evidence = next(l for l in sh.splitlines() if 'evidence_gate.py' in l and 'gate_event' in l)
        self.assertNotIn('soft_gate.py', evidence)


if __name__ == '__main__':
    unittest.main()
