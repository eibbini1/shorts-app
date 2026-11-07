"""Fetch dated public Google Trends RSS signals for a chosen region."""

import argparse
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

HT = '{https://trends.google.com/trending/rss}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--region', required=True, help='Two-letter target region, e.g. US')
    parser.add_argument('--output', type=Path, help='Optional dated JSON snapshot path')
    args = parser.parse_args()
    region = args.region.upper()
    if not re.fullmatch('[A-Z]{2}', region):
        parser.error('--region must be a two-letter code')
    url = 'https://trends.google.com/trending/rss?' + urllib.parse.urlencode({'geo': region})
    request = urllib.request.Request(url, headers={'User-Agent': 'shorts-app/0.1 (trend research)'})
    with urllib.request.urlopen(request, timeout=30) as response:
        root = ET.fromstring(response.read())
    items = []
    for item in root.findall('./channel/item'):
        title = (item.findtext('title') or '').strip()
        if not title:
            continue
        published = item.findtext('pubDate')
        items.append({
            'title': title,
            'approxTraffic': item.findtext(HT + 'approx_traffic'),
            'publishedAt': parsedate_to_datetime(published).astimezone(timezone.utc).isoformat()
            if published else None,
        })
    if not items:
        raise RuntimeError('Google Trends returned no items; do not infer current trends')
    data = {'source': 'Google Trends Trending now RSS', 'sourceUrl': url,
            'region': region, 'fetchedAt': datetime.now(timezone.utc).isoformat(),
            'items': items}
    if args.output:
        output = args.output.expanduser().resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open('x') as file:
            json.dump(data, file, indent=2)
            file.write('\n')
        print(f'Saved {len(items)} dated trends to {output}')
    else:
        print(json.dumps(data, indent=2))


if __name__ == '__main__':
    main()
