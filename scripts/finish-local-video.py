#!/usr/bin/env python3
"""Add captions and an upload pack to a finished local video.

  python3 scripts/finish-local-video.py --scenario drafts/generated/ID.local-scenario.json --video outputs/ID.mp4

Writes next to the video: ID.captioned.mp4, ID.srt and ID.pack.json (title, description, tags, claims to check).
Caption timing comes from the Kokoro voice timeline the render already made, so no new speech model is needed.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORDS_PER_SECOND = 2.6   # Kokoro speed 1 reads about this fast; only used to split one line into short captions
CHUNK_WORDS = 4


def stamp(seconds):
    ms = round(seconds * 1000)
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


def captions(lines, total):
    cues = []
    for number, line in enumerate(lines):
        start = line['atSeconds']
        end = lines[number + 1]['atSeconds'] if number + 1 < len(lines) else total
        words = line['text'].split()
        chunks = [words[i:i + CHUNK_WORDS] for i in range(0, len(words), CHUNK_WORDS)]
        speech = min(end - start, len(words) / WORDS_PER_SECOND)
        at = start
        for chunk in chunks:
            length = speech * len(chunk) / len(words)
            cues.append((at, min(at + length, end), ' '.join(chunk)))
            at += length
    return cues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', required=True, type=Path)
    parser.add_argument('--video', required=True, type=Path)
    parser.add_argument('--work-dir', type=Path, help='Render work folder (default: storage/any-local/<scenario name>)')
    args = parser.parse_args()
    scenario, video = args.scenario.resolve(), args.video.resolve()
    work = (args.work_dir or ROOT / 'storage/any-local' / scenario.stem).resolve()
    data = json.loads(scenario.read_text(encoding='utf-8-sig'))
    plan, settings = data['plan'], data['settings']
    timeline = json.loads((work / 'voice-provenance.json').read_text())['lines']
    cues = captions(timeline, settings['seconds'])
    srt = video.with_suffix('.srt')
    srt.write_text(''.join(f'{i}\n{stamp(a)} --> {stamp(b)}\n{t}\n\n' for i, (a, b, t) in enumerate(cues, 1)))
    out = video.with_name(video.stem + '.captioned.mp4')
    style = 'FontName=Arial,FontSize=18,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,Alignment=2,MarginV=55'
    escaped = str(srt).replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'")
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(video), '-vf', f"subtitles='{escaped}':force_style='{style}'",
                    '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-c:a', 'copy', str(out)], check=True)
    topic_words = [w for w in re.findall(r'[a-z]{4,}', (data.get('topic', '') + ' ' + plan['title']).lower())]
    tags = list(dict.fromkeys(topic_words))[:10] + ['shorts', 'animated']
    pack = {'title': plan['title'][:100],
            'description': f"{plan['hook']}\n\n{plan['payoff']}\n\n#shorts #animated",
            'tags': tags, 'claimsToCheck': plan.get('claimsToCheck', []),
            'video': out.name, 'captions': srt.name, 'seconds': settings['seconds'],
            'note': 'Review before upload. Nothing is uploaded by this script.'}
    video.with_name(video.stem + '.pack.json').write_text(json.dumps(pack, indent=2) + '\n')
    print(f'Wrote {out.name}, {srt.name} and {video.stem}.pack.json')


if __name__ == '__main__':
    main()
