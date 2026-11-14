"""Make look variations of a recurring character from one anchor image (same face, new hair, dress and venue).

  python3 scripts/muse-sheet.py assets/muse/ruby/anchor.png --out assets/muse/ruby

Each look edits the anchor with FLUX.2 Klein (one GPU job at a time, about 1 minute each). Review the sheet:
the face is kept recognisable, not guaranteed identical. Use a look as --anchor-image (or BB_ANCHOR_IMAGE) for a film.
"""
import argparse, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAME = 'The same woman with the same face, eyes, nose, lips and skin tone as the reference photo. '
LOOKS = {
    'black-rooftop': 'She wears an elegant black cocktail dress with thin straps, her dark hair is long, sleek and straight, in a rooftop lounge at night with city lights.',
    'emerald-updo': 'She wears an emerald green silk evening gown, her dark hair is in an elegant low updo with a few loose strands, in a candlelit hotel restaurant.',
    'white-terrace': 'She wears a white linen summer dress, her hair is honey-blonde in soft beach waves, on a sunlit marble terrace with a sea view.',
    'navy-bob': 'She wears a navy velvet dress, her hair is a short sleek bob, in a warm wine cellar bar with wooden barrels.',
    'gold-champagne': 'She wears a gold sequin evening dress, her hair is auburn with soft curls, at a glamorous champagne bar with golden bokeh.',
}
STYLE = ' Medium close portrait, photorealistic luxury commercial photography, warm natural light, sharp focus, natural skin texture.'

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('anchor', type=Path); ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--only', nargs='*', help='Look names to make (default all)')
    ap.add_argument('--width', type=int, default=384); ap.add_argument('--height', type=int, default=640)
    a = ap.parse_args()
    anchor = a.anchor.expanduser().resolve(); out = a.out.expanduser().resolve(); out.mkdir(parents=True, exist_ok=True)
    if not anchor.is_file(): sys.exit(f'Missing anchor: {anchor}')
    for i, (name, text) in enumerate(LOOKS.items()):
        if a.only and name not in a.only: continue
        target = out / f'{name}.png'
        if target.exists(): print(f'Keeping {target.name}'); continue
        subprocess.run(['python3', str(ROOT / 'scripts/create-flux-image.py'), '--prompt', SAME + text + STYLE,
                        '--source', str(anchor), '--seed', str(3100 + i), '--width', str(a.width), '--height', str(a.height),
                        '--output', str(target)], check=True)
    print('Done:', out)

if __name__ == '__main__': main()
