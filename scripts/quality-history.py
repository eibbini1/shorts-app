#!/usr/bin/env python3
"""Show the local 90/100 release-gate trend without inventing missing reviews."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
runs = ROOT / 'storage/learning/local-runs.jsonl'
scores = ROOT / 'storage/learning/quality-scores.jsonl'
records = [json.loads(line) for line in scores.read_text().splitlines() if line.strip()] if scores.is_file() else []
reviewed = {row['scenario'] for row in records}
pending = [json.loads(line) for line in runs.read_text().splitlines() if line.strip()] if runs.is_file() else []
print(f'Editorially scored: {len(records)} | 90+ passes: {sum(row["status"] == "pass" for row in records)} | pending reviews: {sum(row["scenario"] not in reviewed for row in pending)}')
for row in records[-10:]: print(f'{row["score"]:5.0f}/100 {row["status"]:7} {row["title"]}')
if not records: print('No editorial scores yet. Technical QA alone does not qualify a video for release.')
