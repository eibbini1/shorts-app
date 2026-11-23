#!/usr/bin/env python3
"""Run five local planning cases one at a time. No still or motion generation."""
import argparse
from datetime import datetime, timezone
import json
import os
import signal
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
CASES = (
    ('object', 'Restore a tarnished brass compass, then reveal its polished face.',
     'A polished brass compass catches a band of light as it turns.'),
    ('character', 'A cartoon robot lifts a brass key, then opens a greenhouse door.',
     'The robot opens the greenhouse door and steps inside.'),
    ('gadget', 'Reveal a small gadget. It rotates and opens one large panel.',
     'The gadget opens one large panel and the lamp inside lights up.'),
    ('animal', 'A fox carries a pinecone across a wooden bridge, then drops it beside a lantern.',
     'The fox drops the pinecone beside a lantern.'),
    ('travel', 'A paper plane glides over an empty harbor, then lands on a wooden dock.',
     'The paper plane lands on the wooden dock.'),
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--attempts', type=int, choices=(1, 2, 3), default=1)
    args = parser.parse_args()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    output = ROOT / 'outputs' / f'nonfood-planning-{stamp}'
    output.mkdir(parents=True)
    report = []
    for key, topic, ending in CASES:
        runs = []
        for attempt in range(1, args.attempts + 1):
            name = f'bench-nonfood-{stamp}-{key}-{attempt}'
            log = output / f'{key}-{attempt}.log'
            scenario = ROOT / 'drafts/generated' / f'{name}.local-scenario.json'
            start = time.monotonic()
            with log.open('w') as handle:
                command = ['node', 'scripts/story-scenario.mjs', topic, name, '--model', 'gemma-local',
                           '--seconds', '10', '--audio', 'asmr', '--ending', ending]
                with subprocess.Popen(command, cwd=ROOT, stdout=handle, stderr=subprocess.STDOUT,
                                      start_new_session=True) as process:
                    try:
                        passed = process.wait(timeout=720) == 0 and scenario.is_file()
                        status = 'planned' if passed else 'failed'
                    except (KeyboardInterrupt, subprocess.TimeoutExpired) as error:
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        process.wait()
                        if isinstance(error, KeyboardInterrupt):
                            raise
                        status = 'timed-out'
            runs.append({'attempt': attempt, 'status': status, 'seconds': round(time.monotonic() - start, 1),
                         'log': log.name, 'scenario': str(scenario.relative_to(ROOT)) if status == 'planned' else None})
            if status in ('planned', 'timed-out'):
                break
        report.append({'case': key, 'runs': runs})
        (output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
        print(f'{key}: {runs[-1]["status"]} ({len(runs)} attempts)', flush=True)
    print(f'Results: {output / "results.json"}', flush=True)
    return 0 if all(item['runs'][-1]['status'] == 'planned' for item in report) else 1


if __name__ == '__main__':
    raise SystemExit(main())
