#!/usr/bin/env python3
"""Studio draft loop: write the story, check it, repair it, and redraft if needed (up to 3 tries).

Usage: studio-draft.py --answers FILE [--allow-repeat] [--tries 3]
Never shows a dead end for a fixable problem. Exit 0 = a plan that passed every gate;
exit 3 = still blocked (the last BLOCKED lines say why; NEEDS-CHOICE lines name a user decision).
"""
import argparse, json, os, re, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline_events import gate as gate_event  # noqa: E402
from gate_severity import split as split_problems  # noqa: E402
from look_profiles import default_studio_for, min_prompt_score_for  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SCN = re.compile(r'(drafts/generated/[^\s\'"]+\.local-scenario\.json)')


def say(*a):
    print(*a, flush=True)


def director_input_error(line):
    match = re.search(r'director-brief\.py: error:\s*(.+)$', str(line))
    return match.group(1).strip() if match else None


def checks(scn, allow_repeat):
    """Same gates the render runs before any media work; returns the BLOCKED reasons."""
    found = []
    pre = ['--strict'] + (['--allow'] if allow_repeat else [])

    def run_gate(label, command):
        try:
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        except FileNotFoundError as error:
            return [f'{label} is unavailable: {error.filename}'], []
        output = '\n'.join(part for part in (result.stdout, result.stderr) if part)
        lines = output.splitlines()
        problems = [line[9:] for line in lines if line.startswith('BLOCKED: ')]
        reviews = [line[8:] for line in lines if line.startswith('REVIEW: ')]
        if result.returncode and not problems:
            detail = re.sub(r'\s+', ' ', output.strip())[:240]
            problems.append(f'{label} failed' + (f': {detail}' if detail else f' (exit {result.returncode})'))
        return problems, reviews

    reviews = []
    gates = [
        ('preflight-short.py', [sys.executable, str(ROOT / 'scripts/preflight-short.py'), scn, *pre]),
        ('audit-local-story.py', [sys.executable, str(ROOT / 'scripts/audit-local-story.py'), scn]),
        ('evidence_gate.py', [sys.executable, str(ROOT / 'scripts/evidence_gate.py'), scn]),
    ]
    audio_python = Path(os.environ.get('SHORTS_MEDIA_PY') or (ROOT / 'storage/tools/ComfyUI/.venv/bin/python'))
    gates.append(('add-sfx.py', [str(audio_python), str(ROOT / 'scripts/add-sfx.py'), '--scenario', scn, '--audit']))
    for label, command in gates:
        problems, notes = run_gate(label, command)
        found += problems
        reviews += notes
    if allow_repeat:
        found = [p for p in found if p != 'repeat topic']
    found += polish(scn)
    schema_problems, _ = run_gate('scenario schema validation', [
        'node', str(ROOT / 'scripts/bb-local-scenario.mjs'), '--validate', scn,
    ])
    found += schema_problems
    unattended = os.environ.get('SHORTS_STUDIO_UNATTENDED') == '1'
    for note in reviews:
        continuity_risk = re.search(
            r'omits the named protagonist or focal object|omits the named setting|story model repaired fields automatically',
            note, re.I,
        )
        if unattended and continuity_risk:
            found.append(f'unattended review required: {note}')
        else:
            say(f'REVIEW: {note}')
    return found


_polished = set()


def _load_scenario_dict(scn):
    try:
        target = Path(scn)
        if not target.is_absolute():
            target = ROOT / target
        return json.loads(target.read_text(encoding='utf-8-sig'))
    except (OSError, json.JSONDecodeError):
        return None


def polish(scn):
    """Enforce the look profile's minimum picture-prompt score before FLUX/LTX time; refine when a studio preset applies."""
    env_override = os.environ.get('SHORTS_MIN_PROMPT_SCORE')
    if env_override == '0':
        return []
    scenario_data = _load_scenario_dict(scn)
    min_score = min_prompt_score_for(scenario_data, env_override=env_override, look=os.environ.get('SHORTS_LOOK'))
    if min_score <= 0:
        return []
    lint = [f'--min-prompts={min_score}']
    first = subprocess.run([sys.executable, str(ROOT / 'scripts/prompt-lint.py'), scn, *lint], cwd=ROOT, capture_output=True, text=True)
    if first.returncode == 0:
        return []
    before = re.search(r'prompts (\d+)', first.stdout)
    studio = default_studio_for(scenario_data, look=os.environ.get('SHORTS_LOOK')) or 'luxury-kitchen'
    subprocess.run([sys.executable, str(ROOT / 'scripts/refine-prompts.py'), scn, '--studio', studio, '--in-place'], cwd=ROOT, capture_output=True, text=True)
    second = subprocess.run([sys.executable, str(ROOT / 'scripts/prompt-lint.py'), scn, *lint], cwd=ROOT, capture_output=True, text=True)
    after = re.search(r'prompts (\d+)', second.stdout)
    if second.returncode == 0:
        if scn not in _polished:
            _polished.add(scn)
            say(f"Fixed automatically: picture prompts polished ({before.group(1) if before else '?'} to {after.group(1) if after else '?'})")
        return []
    return [f"picture prompts score {after.group(1) if after else '?'} (need {min_score})"]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--answers', required=True)
    p.add_argument('--allow-repeat', action='store_true')
    p.add_argument('--tries', type=int, default=3)
    a = p.parse_args()
    last, scn = [], None
    for attempt in range(1, a.tries + 1):
        say(f'Attempt {attempt}/{a.tries}: writing the story')
        input_error = None
        proc = subprocess.Popen(['bash', 'scripts/make-local-video.sh', '--draft-only', '--answers', a.answers], cwd=ROOT,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        scn = None
        for line in proc.stdout:
            line = line.rstrip('\n')
            input_error = input_error or director_input_error(line)
            if m := SCN.search(line): scn = m.group(1)
            # Gate lines are re-checked below; showing them raw now would look like a dead end.
            if line.startswith('BLOCKED: '): line = 'CHECK: ' + line[9:]
            elif 'blocked it' in line or 'Story gate blocked' in line: continue
            say(line)
        proc.wait()
        if input_error:
            say(f'BLOCKED: director brief input: {input_error}')
            say('Fix the brief input and try again. No media render was started.')
            return 2
        if not scn or not (ROOT / scn).is_file():
            say('Fixing: the story model did not save a plan; trying again'); continue
        last = checks(scn, a.allow_repeat)
        if not last:
            say(f'Story passed every check on attempt {attempt}.'); say('Plan ready:', scn); return 0
        if any(problem.startswith('unattended review required:') for problem in last):
            if attempt < a.tries:
                say('Fixing: ' + '; '.join(last) + '; writing a fresh version')
                continue
            say('Plan saved:', scn)
            for problem in last: say('BLOCKED:', problem); gate_event('story', 'blocked', 'unattended-review', problem)
            say('NEEDS-CHOICE: still-blocked')
            return 3
        if last == ['repeat topic']:
            break
        say('Fixing: ' + '; '.join(last))
        rep = subprocess.run([sys.executable, str(ROOT / 'scripts/repair-local-story.py'), scn], cwd=ROOT, capture_output=True, text=True)
        for line in rep.stdout.splitlines():
            if line.startswith('FIXED: '): say('Fixed automatically: ' + line[7:])
        last = checks(scn, a.allow_repeat)
        if not last:
            say(f'Story passed every check after automatic fixes (attempt {attempt}).'); say('Plan ready:', scn); return 0
        hard, soft = split_problems(last)
        if not hard:  # only style/quality rules remain: warn and keep the owner's idea instead of a dead end
            for problem in soft: say('WARNING:', problem)
            say(f'Story ready with {len(soft)} style warning(s) after automatic fixes (attempt {attempt}); rendering is not blocked.')
            say('Plan ready:', scn); return 0
        last = hard
        if attempt < a.tries:
            say('Fixing: still not right (' + '; '.join(last) + '); writing a fresh version')
    if scn: say('Plan saved:', scn)
    for b in last:
        say('BLOCKED:', b)
        gate_event('story', 'blocked', 'repeat-topic' if b == 'repeat topic' else 'story-check', b)
    if 'repeat topic' in last:
        say('NEEDS-CHOICE: repeat-topic')
    else:
        say('NEEDS-CHOICE: still-blocked')
    return 3


if __name__ == '__main__':
    sys.exit(main())
