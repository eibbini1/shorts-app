#!/usr/bin/env python3
"""Research popular video metadata without downloading footage.

Use --query for YouTube discovery and --urls for links from other platforms.
Results are dated popularity candidates, not a promise that an idea is trending now.
"""
import argparse
import json
import subprocess
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YTDLP = ROOT / 'storage/tools/ytdlp-venv/bin/yt-dlp'


def extract(target, limit):
    result = subprocess.run([str(YTDLP), '--dump-json', '--skip-download', '--ignore-errors',
                             '--retries', '1', '--extractor-retries', '1', '--socket-timeout', '10',
                             '--playlist-end', str(limit), target], capture_output=True, text=True, timeout=90)
    rows = []
    for line in result.stdout.splitlines():
        try: rows.append(json.loads(line))
        except json.JSONDecodeError: pass
    return rows, result.stderr.strip()[-500:]


def candidates(rows, minimum, recent_days, max_seconds, today):
    found = {}
    for row in rows:
        views, raw_date, duration = row.get('view_count'), row.get('upload_date'), row.get('duration')
        if not isinstance(views, int) or views < minimum or not raw_date or not duration: continue
        try: published = date.fromisoformat(f'{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}')
        except ValueError: continue
        age = (today - published).days
        if age < 0 or age > recent_days or duration > max_seconds: continue
        url = row.get('webpage_url') or row.get('original_url')
        if not url: continue
        found[url] = {'url': url, 'platform': row.get('extractor_key') or row.get('extractor'),
                      'title': row.get('title'), 'creator': row.get('uploader') or row.get('channel'),
                      'published': published.isoformat(), 'viewsAtCheck': views,
                      'durationSeconds': duration, 'ageDaysAtCheck': age,
                      'estimatedViewsPerDay': round(views / max(age, 1))}
    return sorted(found.values(), key=lambda row: row['estimatedViewsPerDay'], reverse=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--query', help='YouTube search query; metadata only')
    p.add_argument('--urls', type=Path, help='Text file with one public video URL per line (YouTube, TikTok, etc.)')
    p.add_argument('--min-views', type=int, default=1_000_000)
    p.add_argument('--recent-days', type=int, default=365)
    p.add_argument('--max-seconds', type=int, default=1800)
    p.add_argument('--limit', type=int, default=10)
    p.add_argument('--output', type=Path)
    a = p.parse_args()
    if not a.query and not a.urls: p.error('Provide --query and/or --urls')
    if not YTDLP.is_file(): p.error('Local yt-dlp is missing; run the Mac setup script first')
    if a.limit < 1 or a.limit > 50 or a.min_views < 0 or a.recent_days < 1: p.error('Invalid limit, minimum views or recent-days')
    targets = []
    if a.query: targets.append(f'ytsearch{max(a.limit * 3, 15)}:{a.query}')
    if a.urls:
        if not a.urls.is_file(): p.error(f'Missing URL list: {a.urls}')
        targets.extend(line.strip() for line in a.urls.read_text().splitlines() if line.strip() and not line.startswith('#'))
    rows, errors = [], []
    for target in targets:
        try:
            extracted, warning = extract(target, a.limit * 3)
            rows.extend(extracted)
            if warning and not extracted: errors.append(f'{target[:80]}: {warning}')
        except subprocess.TimeoutExpired: errors.append(f'{target[:80]}: metadata lookup timed out')
    now = datetime.now(timezone.utc)
    chosen = candidates(rows, a.min_views, a.recent_days, a.max_seconds, now.date())[:a.limit]
    report = {'checkedAt': now.isoformat(), 'query': a.query, 'minimumViews': a.min_views,
              'recentDays': a.recent_days, 'maxSeconds': a.max_seconds, 'candidates': chosen,
              'errors': errors, 'limitation': ('Public view counts are cumulative. A high count or rough views/day estimate is not proof of a current trend. '
                                       'Metadata cannot reveal a video’s shot sequence or retention. Watch references yourself; make original footage, narration and editing.')}
    if a.output:
        a.output.parent.mkdir(parents=True, exist_ok=True)
        a.output.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2))
    if not chosen: print('No videos met the verified filters; do not invent a million-view reference.', flush=True)


if __name__ == '__main__': main()
