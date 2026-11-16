#!/usr/bin/env python3
"""Build RTL Arabic captions from a reviewed recipe timing manifest.

Draft cue times are suitable for typography preview only. Final rendering must
use a manifest whose timing was checked against the recorded narration.
"""
import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARABIC = re.compile(r'[\u0600-\u06ff]')
FONT = ROOT / 'assets/fonts/Cairo-Arabic-Variable.ttf'


def stamp(seconds):
    centiseconds = round(seconds * 100)
    return f'{centiseconds // 360000}:{centiseconds // 6000 % 60:02d}:{centiseconds // 100 % 60:02d}.{centiseconds % 100:02d}'


def ass_text(value):
    return value.replace('\\', '\\\\').replace('{', '\\{').replace('}', '\\}').replace('\n', '\\N')


def build(spec, require_verified=False):
    if not FONT.is_file():
        raise ValueError('Bundled Cairo Arabic font is missing')
    if spec.get('language') != 'ar-JO' or spec.get('width') != 1080 or spec.get('height') != 1920:
        raise ValueError('Arabic reel captions require ar-JO at 1080x1920')
    seconds = spec.get('seconds')
    if not isinstance(seconds, (int, float)) or seconds <= 0:
        raise ValueError('Invalid film duration')
    if require_verified and spec.get('captionTimingStatus') != 'verified-against-recorded-voice':
        raise ValueError('Caption timing is not verified against recorded narration')
    cues = spec.get('captionCues')
    if not isinstance(cues, list) or not cues:
        raise ValueError('Missing caption cues')
    previous_end = 0.0
    events = []
    for number, cue in enumerate(cues, 1):
        start, end, text = cue.get('startSeconds'), cue.get('endSeconds'), cue.get('text')
        if (not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or
                not isinstance(text, str) or not ARABIC.search(text) or
                not previous_end <= start < end <= seconds or len(text) > 55):
            raise ValueError(f'Caption cue {number} has invalid timing, overlap, length or Arabic text')
        previous_end = end
        events.append(f'Dialogue: 0,{stamp(start)},{stamp(end)},Arabic,,0,0,0,,{ass_text(text)}')
    header = ('[Script Info]\nTitle: Arabic recipe reel\nScriptType: v4.00+\nPlayResX: 1080\n'
              'PlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\n'
              'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, '
              'Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, '
              'Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
              'Style: Arabic,Cairo,72,&H00FFFFFF,&H00FFFFFF,&H00201913,&H70000000,'
              '0,0,0,0,100,100,0,0,1,5,2,8,120,120,300,1\n\n[Events]\n'
              'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n')
    return header + '\n'.join(events) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spec', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--require-verified', action='store_true')
    args = parser.parse_args()
    spec = json.loads(args.spec.read_text(encoding='utf-8-sig'))
    output = args.output.resolve()
    if output.exists():
        parser.error(f'Output already exists: {output}')
    try:
        contents = build(spec, args.require_verified)
    except ValueError as error:
        parser.error(str(error))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(contents, encoding='utf-8')
    print(f'Wrote {output} ({len(spec["captionCues"])} cues; timing: {spec.get("captionTimingStatus")})')


if __name__ == '__main__':
    main()
