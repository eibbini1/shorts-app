#!/usr/bin/env python3
"""Run the REAL local planner (studio-draft.py: local LLM + every gate) over the stress corpus and tabulate results.

Runs on the Mac only (needs the local story model). Local compute only: no paid APIs, no rendering, no media.
usage: python3 scripts/planner-stress/run-draft-corpus.py [--limit N] [--category food,craft] [--only-actionable] [--dry-run] [--out DIR]
Per idea it records: exit code (0 passed every gate, 3 blocked), gate events (@@event lines), BLOCKED reasons,
shot count, total seconds, whether hook/ending exist, and the saved scenario path. Output: results.jsonl + summary.md.
"""
import argparse, json, os, re, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCN = re.compile(r'(drafts/generated/[^\s\'"]+\.local-scenario\.json)')
STYLE = {'food': 'luxury cinematic food film', 'cartoon': 'bright 3D cartoon'}


def brief(row, seconds):
    cat = row['category']
    return {'topic': row['idea'], 'style': STYLE.get(cat, 'cinematic film'), 'set': '', 'hook': '', 'mustShow': row['idea'],
            'obstacle': '', 'turn': '', 'ending': '', 'audio': 'asmr', 'seconds': seconds, 'orientation': 'vertical'}


def run_one(i, row, out, seconds, dry, timeout):
    answers = out / f'answers-{i:03d}.json'
    answers.write_text(json.dumps(brief(row, seconds), ensure_ascii=False))
    rec = {'i': i, 'category': row['category'], 'idea': row['idea'], 'expectedActionable': row['actionable'], 'answers': str(answers)}
    if dry:
        return rec | {'status': 'dry-run'}
    t0 = time.time()
    try:
        p = subprocess.run([sys.executable, 'scripts/studio-draft.py', '--answers', str(answers), '--allow-repeat'], cwd=ROOT,
                           capture_output=True, text=True, timeout=timeout, env=os.environ.copy())
        text = (p.stdout or '') + (p.stderr or ''); code = p.returncode
    except subprocess.TimeoutExpired as e:
        text = (e.stdout or b'').decode() if isinstance(e.stdout, bytes) else (e.stdout or ''); code = 124
    events = []
    for line in text.splitlines():
        if line.startswith('@@event '):
            try: events.append(json.loads(line[8:]))
            except ValueError: pass
    blocked = [l.strip() for l in text.splitlines() if l.strip().startswith('BLOCKED')]
    scn = (SCN.findall(text) or [None])[-1]
    rec |= {'status': {0: 'passed', 3: 'blocked', 124: 'timeout'}.get(code, f'exit{code}'), 'seconds': round(time.time() - t0),
            'blocked': blocked[:6], 'gateEvents': [e for e in events if e.get('type') == 'gate'], 'scenario': scn}
    if scn and (ROOT / scn).is_file():
        try:
            data = json.loads((ROOT / scn).read_text()); plan = data.get('plan') or {}; shots = plan.get('shots') or []
            rec |= {'shots': len(shots), 'totalSeconds': sum(float(s.get('seconds') or 0) for s in shots),
                    'hook': bool(plan.get('hook') or (shots and shots[0].get('motionPrompt'))), 'payoff': bool(plan.get('payoff')),
                    'avgMotionWords': round(sum(len(str(s.get('motionPrompt', '')).split()) for s in shots) / max(1, len(shots)), 1)}
        except ValueError:
            pass
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0); ap.add_argument('--category', default='')
    ap.add_argument('--only-actionable', action='store_true'); ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--seconds', type=int, default=15); ap.add_argument('--timeout', type=int, default=900)
    ap.add_argument('--out', default=str(ROOT / 'storage/planner-stress'))
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    rows = json.loads((Path(__file__).parent / 'ideas.json').read_text())
    cats = {c for c in a.category.split(',') if c}
    rows = [r for r in rows if (not cats or r['category'] in cats) and (r['actionable'] or not a.only_actionable) and r['idea'].strip()]
    if a.limit: rows = rows[:a.limit]
    results = out / 'results.jsonl'
    recs = []
    with results.open('w') as fh:
        for i, row in enumerate(rows, 1):
            rec = run_one(i, row, out, a.seconds, a.dry_run, a.timeout); recs.append(rec)
            fh.write(json.dumps(rec, ensure_ascii=False) + '\n'); fh.flush()
            print(f"[{i}/{len(rows)}] {rec['status']:8} {row['category']:9} {row['idea'][:70]}", flush=True)
    lines = ['# Planner stress summary', '', f'{len(recs)} ideas', '', '| category | ideas | passed | blocked | other |', '|---|---|---|---|---|']
    for c in sorted({r['category'] for r in recs}):
        rs = [r for r in recs if r['category'] == c]
        lines.append(f"| {c} | {len(rs)} | {sum(r['status']=='passed' for r in rs)} | {sum(r['status']=='blocked' for r in rs)} | {sum(r['status'] not in ('passed','blocked') for r in rs)} |")
    lines += ['', '## Blocked or failed ideas', '']
    for r in recs:
        if r['status'] not in ('passed', 'dry-run'):
            codes = ', '.join(sorted({f"{e.get('gate')}:{e.get('code')}" for e in r.get('gateEvents', []) if e.get('status') == 'blocked'})) or 'no gate event'
            lines.append(f"- [{r['category']}] {r['idea'][:90]} -> {r['status']} ({codes})")
    (out / 'summary.md').write_text('\n'.join(lines) + '\n')
    print('wrote', results, 'and', out / 'summary.md')


if __name__ == '__main__':
    main()
