#!/usr/bin/env python3
"""Daily topic feed for the luxury-food Shorts channel from free sources, ranked and checked against what we already posted.

  python3 scripts/trend_signals.py [--no-youtube] [--top 10]

Sources: Wikimedia pageviews (keyless, CC0) for the articles in episodes/signal-watchlist.txt, and the YouTube Data API v3
(needs YOUTUBE_API_KEY in the environment; skipped with a clear health line when missing). Public YouTube stats are kept in
SQLite for 30 days only (YouTube developer policy). Score is our own calculation, an internal ranking, not a prediction.
A failing source is logged as a failure, never read as "no trends". Exit 2 when every source failed.
"""
import argparse
import importlib.util
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / 'storage/signals/signals.db'
UA = 'shorts-app/0.1 (personal trend research; esam.ibbini@gmail.com)'
YT_QUERY_CAP = 12  # search.list has its own 100-calls-a-day bucket
YT_KEEP_DAYS = 30
PRICE_HINT = re.compile(r'(\$\s?\d|\bvs\b|\bmost expensive\b|\bcosts?\b)', re.I)


def get_json(url, timeout=30):
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def parse_duration(iso):
    """ISO 8601 duration such as PT1M5S to seconds."""
    match = re.fullmatch(r'P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', iso or '')
    if not match:
        return None
    d, h, m, s = (int(x or 0) for x in match.groups())
    return d * 86400 + h * 3600 + m * 60 + s


def velocity(views, published_at, now):
    """Views per hour since publish (own calculation)."""
    hours = max((now - published_at).total_seconds() / 3600, 1.0)
    return views / hours


def spike_ratio(daily_views):
    """Latest complete day over the mean of the 7 days before it. None when there is not enough data."""
    if len(daily_views) < 8:
        return None
    latest, base = daily_views[-1], daily_views[-8:-1]
    mean = sum(base) / len(base)
    return latest / mean if mean else None


def load_lines(path):
    return [l.strip() for l in path.read_text().splitlines() if l.strip() and not l.startswith('#')]


def covered(topic, published_titles, subject):
    """True when every subject word of the topic already appears in one published title."""
    words = subject(topic)
    return bool(words) and any(words <= subject(title) for title in published_titles)


def score_topics(wiki, yt_videos, published_titles, subject):
    """wiki: {article: spike ratio or None}; yt_videos: [{title, velocity}]. Returns ranked list of dicts."""
    topics = {}
    top_velocity = max((v['velocity'] for v in yt_videos), default=0)
    for article, ratio in wiki.items():
        name = article.replace('_', ' ')
        entry = topics.setdefault(name, {'topic': name, 'score': 0.0, 'sources': [], 'why': []})
        if ratio is not None and ratio >= 1.2:
            entry['score'] += min(ratio, 5) / 5 * 50
            entry['sources'].append('wikipedia')
            entry['why'].append(f'pageviews {ratio:.1f}x the 7-day mean')
        matches = [v for v in yt_videos if name.lower() in v['title'].lower()]
        if matches and top_velocity:
            best = max(m['velocity'] for m in matches)
            entry['score'] += best / top_velocity * 50
            entry['sources'].append('youtube')
            entry['why'].append(f'{len(matches)} short videos, best {best:,.0f} views/h')
            if any(PRICE_HINT.search(m['title']) for m in matches):
                entry['score'] += 10
                entry['why'].append('price-contrast titles')
    ranked = []
    for entry in topics.values():
        if not entry['sources']:
            continue
        if len(entry['sources']) > 1:
            entry['score'] *= 1.25
        entry['covered'] = covered(entry['topic'], published_titles, subject)
        if entry['covered']:
            entry['score'] *= 0.3
            entry['why'].append('already covered on the channel (score x0.3)')
        entry['score'] = round(entry['score'], 1)
        ranked.append(entry)
    return sorted(ranked, key=lambda e: -e['score'])


def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB)
    db.executescript('''
      CREATE TABLE IF NOT EXISTS yt_videos(id TEXT, title TEXT, channel TEXT, published_at TEXT, duration_s INTEGER, views INTEGER, fetched_at TEXT, PRIMARY KEY(id, fetched_at));
      CREATE TABLE IF NOT EXISTS wiki_views(article TEXT, day TEXT, views INTEGER, PRIMARY KEY(article, day));
      CREATE TABLE IF NOT EXISTS health(run_at TEXT, source TEXT, status TEXT, detail TEXT);
      CREATE TABLE IF NOT EXISTS topic_scores(run_at TEXT, topic TEXT, score REAL, sources TEXT, covered INTEGER, why TEXT);''')
    return db


def fetch_wiki(db, articles, now):
    start, end = (now - timedelta(days=9)).strftime('%Y%m%d'), (now - timedelta(days=1)).strftime('%Y%m%d')
    ratios, failures = {}, 0
    for article in articles:
        url = ('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/'
               f'{urllib.parse.quote(article, safe="")}/daily/{start}/{end}')
        try:
            items = get_json(url)['items']
        except (urllib.error.URLError, KeyError, ValueError) as error:
            failures += 1
            ratios[article] = None
            last = f'{article}: {error}'
            continue
        for item in items:
            db.execute('INSERT OR REPLACE INTO wiki_views VALUES (?,?,?)', (article, item['timestamp'][:8], item['views']))
        ratios[article] = spike_ratio([i['views'] for i in items])
        time.sleep(0.2)
    status = 'ok' if failures == 0 else ('failed' if failures == len(articles) else 'partial')
    detail = f'{len(articles) - failures}/{len(articles)} articles' + (f'; last error {last}' if failures else '')
    return ratios, status, detail


def fetch_youtube(db, queries, key, now):
    base = 'https://www.googleapis.com/youtube/v3/'
    after = (now - timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ')
    ids = []
    try:
        for q in queries[:YT_QUERY_CAP]:
            params = urllib.parse.urlencode({'part': 'id', 'q': q, 'type': 'video', 'videoDuration': 'short', 'order': 'viewCount',
                                             'publishedAfter': after, 'maxResults': 25, 'key': key})
            ids += [i['id']['videoId'] for i in get_json(base + 'search?' + params)['items']]
        ids = list(dict.fromkeys(ids))
        videos = []
        for i in range(0, len(ids), 50):
            params = urllib.parse.urlencode({'part': 'snippet,contentDetails,statistics', 'id': ','.join(ids[i:i + 50]), 'key': key})
            for item in get_json(base + 'videos?' + params)['items']:
                seconds = parse_duration(item['contentDetails']['duration'])
                if seconds is None or seconds > 180:
                    continue
                published = datetime.fromisoformat(item['snippet']['publishedAt'].replace('Z', '+00:00'))
                views = int(item['statistics'].get('viewCount', 0))
                db.execute('INSERT OR REPLACE INTO yt_videos VALUES (?,?,?,?,?,?,?)', (item['id'], item['snippet']['title'],
                           item['snippet']['channelTitle'], published.isoformat(), seconds, views, now.isoformat()))
                videos.append({'title': item['snippet']['title'], 'velocity': velocity(views, published, now)})
    except (urllib.error.URLError, KeyError, ValueError) as error:
        return [], 'failed', str(error)[:200]
    return videos, 'ok', f'{len(videos)} videos of {len(ids)} found (180 s or shorter)'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-youtube', action='store_true')
    parser.add_argument('--top', type=int, default=10)
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    db = connect()
    db.execute('DELETE FROM yt_videos WHERE fetched_at < ?', ((now - timedelta(days=YT_KEEP_DAYS)).isoformat(),))
    spec = importlib.util.spec_from_file_location('topic_check', ROOT / 'scripts/topic-check.py')
    topic_check = importlib.util.module_from_spec(spec); spec.loader.exec_module(topic_check)
    published = [s['title'] for s in json.loads((ROOT / 'episodes/channel-performance.json').read_text())['shorts']]
    health = []
    wiki, status, detail = fetch_wiki(db, load_lines(ROOT / 'episodes/signal-watchlist.txt'), now)
    health.append(('wikimedia', status, detail))
    key = os.environ.get('YOUTUBE_API_KEY')
    if args.no_youtube or not key:
        videos = []
        health.append(('youtube', 'skipped', 'disabled' if args.no_youtube else 'YOUTUBE_API_KEY not set; free key from Google Cloud console, YouTube Data API v3'))
    else:
        videos, status, detail = fetch_youtube(db, load_lines(ROOT / 'episodes/signal-queries.txt'), key, now)
        health.append(('youtube', status, detail))
    for source, status, detail in health:
        db.execute('INSERT INTO health VALUES (?,?,?,?)', (now.isoformat(), source, status, detail))
        print(f'source {source}: {status} ({detail})')
    ranked = score_topics(wiki, videos, published, topic_check.subject)[:args.top]
    for e in ranked:
        db.execute('INSERT INTO topic_scores VALUES (?,?,?,?,?,?)', (now.isoformat(), e['topic'], e['score'], ','.join(e['sources']), int(e['covered']), '; '.join(e['why'])))
    db.commit()
    ok = [s for s in health if s[1] in ('ok', 'partial')]
    if not ok:
        sys.exit('Every source failed or was skipped: no trend list produced. Do not read this as "no trends".')
    lines = [f'# Topic feed {now:%Y-%m-%d}', '', 'Own calculation from free sources; a ranking aid, not a prediction.', '',
             '| # | Topic | Score | Sources | Why |', '|---|---|---|---|---|']
    lines += [f'| {i} | {e["topic"]} | {e["score"]} | {"+".join(e["sources"])} | {"; ".join(e["why"])} |' for i, e in enumerate(ranked, 1)]
    lines += ['', 'Sources: ' + '; '.join(f'{s} {st}' for s, st, _ in health)]
    out = DB.parent / f'feed-{now:%Y%m%d}.md'
    out.write_text('\n'.join(lines) + '\n')
    print('\n'.join(lines)); print(f'\nSaved {out}')


if __name__ == '__main__':
    main()
