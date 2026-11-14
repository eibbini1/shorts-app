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
CHUNK_WORDS = 3
MAX_CHUNK_WORDS = 4
DANGLERS = {'a', 'an', 'the', 'of', 'to', 'and', 'or', 'in', 'on', 'with', 'for', 'at', 'by', 'its', 'his', 'her', 'their', 'your', 'my', 'our', 'into', 'onto', 'until', 'from', 'as', 'that', 'but', 'while', 'over', 'under'}


def phrase_chunks(words):
    """Split words into caption chunks that end on punctuation or a natural pause, never on a dangling article/preposition."""
    chunks, cur = [], []
    for i, word in enumerate(words):
        cur.append(word)
        last = i == len(words) - 1
        ends_phrase = word[-1] in ',.!?;:'
        dangling = word.lower().strip(',.!?;:') in DANGLERS
        full = len(cur) >= MAX_CHUNK_WORDS and not (dangling and len(cur) < MAX_CHUNK_WORDS + 1)
        ok_to_cut = len(cur) >= 2 and word.lower().strip(',.!?;:') not in DANGLERS
        if last or (ends_phrase and len(cur) >= 2) or (len(cur) >= CHUNK_WORDS and ok_to_cut) or full:
            if not last and len(words) - i - 1 == 1 and not ends_phrase and len(cur) < MAX_CHUNK_WORDS:
                continue   # keep a lone final word with this chunk instead of orphaning it
            chunks.append(cur)
            cur = []
    return chunks


def stamp(seconds):
    ms = round(seconds * 1000)
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


def speech_span(path):
    """(lead, length): seconds of silence before the voice, and the voice itself, trimmed of padding. None if unreadable."""
    if not path.exists():
        return None
    result = subprocess.run(['ffmpeg', '-v', 'info', '-i', str(path), '-af', 'silencedetect=n=-35dB:d=0.1', '-f', 'null', '-'],
                            capture_output=True, text=True)
    total = re.search(r'time=(\d+):(\d+):([\d.]+)', result.stderr.replace('\r', '\n').split('time=')[-1] and 'time=' + result.stderr.split('time=')[-1])
    if not total:
        return None
    total = int(total.group(1)) * 3600 + int(total.group(2)) * 60 + float(total.group(3))
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', result.stderr)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', result.stderr)]
    lead = ends[0] if starts and starts[0] < 0.05 and ends else 0.0
    trail_from = starts[-1] if starts and (len(starts) > len(ends) or total - ends[-1] < 0.05) else total
    return lead, max(trail_from - lead, 0.3)


def captions(lines, total, work=None):
    cues = []
    for number, line in enumerate(lines):
        start = line['atSeconds']
        end = lines[number + 1]['atSeconds'] if number + 1 < len(lines) else total
        words = line['text'].split()
        chunks = phrase_chunks(words)
        span = speech_span(work / f'voice-{number}.wav') if work else None
        lead, real = span if span else (0.0, None)
        speech = min(end - start - lead, real if real else len(words) / WORDS_PER_SECOND)
        weights = [len(' '.join(chunk)) for chunk in chunks]   # time follows letters, so "Hic!" is not given as long as a full phrase
        at = start + lead
        for chunk, weight in zip(chunks, weights):
            length = speech * weight / sum(weights)
            cues.append((at, min(at + length, end), ' '.join(chunk)))
            at += length
    return cues


GOLD_BGR = '&H0070C4EC'   # rgb(236,196,112), the Billionaire Bites gold used by the Windows shorts (luxuryText.js)


def ass_stamp(seconds):
    cs = round(seconds * 100)
    return f'{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}'


def brand_ass(cues):
    """Burger-style captions: Lora bold, white with black outline, the spoken word in gold."""
    head = ('[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\nWrapStyle: 0\n\n[V4+ Styles]\n'
            'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, '
            'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
            'Style: Caption,Lora,66,&H00FFFFFF,&H00FFFFFF,&H00101010,&H99000000,-1,0,0,0,100,100,1,0,1,6,3,2,50,50,320,1\n\n'
            '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n')
    rows = []
    for start, end, text in cues:
        words = text.split()
        weights = [len(w) for w in words]
        at = start
        for number, weight in enumerate(weights):
            stop = end if number == len(words) - 1 else at + (end - start) * weight / sum(weights)
            shown = ' '.join(f'{{\\c{GOLD_BGR}&\\fscx114\\fscy114}}{w}{{\\c&HFFFFFF&\\fscx100\\fscy100}}' if i == number else w for i, w in enumerate(words))
            rows.append(f'Dialogue: 0,{ass_stamp(at)},{ass_stamp(stop)},Caption,,0,0,0,,{shown}')
            at = stop
    return head + '\n'.join(rows) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scenario', required=True, type=Path)
    parser.add_argument('--video', required=True, type=Path)
    parser.add_argument('--style', choices=['brand', 'plain'], default='brand', help='brand = Lora with gold spoken word (like the burger); plain = white Arial')
    parser.add_argument('--work-dir', type=Path, help='Render work folder (default: storage/any-local/<scenario name>)')
    args = parser.parse_args()
    scenario, video = args.scenario.resolve(), args.video.resolve()
    work = (args.work_dir or ROOT / 'storage/any-local' / scenario.stem).resolve()
    data = json.loads(scenario.read_text(encoding='utf-8-sig'))
    plan, settings = data['plan'], data['settings']
    timeline = json.loads((work / 'voice-provenance.json').read_text())['lines']
    cues = captions(timeline, settings['seconds'], work)
    srt = video.with_suffix('.srt')
    srt.write_text(''.join(f'{i}\n{stamp(a)} --> {stamp(b)}\n{t}\n\n' for i, (a, b, t) in enumerate(cues, 1)))
    out = video.with_name(video.stem + '.captioned.mp4')
    if args.style == 'brand':
        ass = video.with_suffix('.ass')
        ass.write_text(brand_ass(cues), encoding='utf-8')
        esc = lambda path: str(path).replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'")
        vf = f"subtitles='{esc(ass)}':fontsdir='{esc(ROOT / 'assets/fonts')}'"
    else:
        style = 'FontName=Arial,FontSize=18,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,Alignment=2,MarginV=55'
        escaped = str(srt).replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'")
        vf = f"subtitles='{escaped}':force_style='{style}'"
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(video), '-vf', vf,
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
