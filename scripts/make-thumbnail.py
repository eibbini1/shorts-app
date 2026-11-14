"""Make a vertical Shorts thumbnail: sharpened hero still, gold-glow price, badge on top, small tag under the price.

  python3 scripts/make-thumbnail.py --still outputs/_check/hero/c1b.png --price '$2,700' --tag 'vs a $5 slice' --badge 'WORLD RECORD PIZZA' --out outputs/ID-thumbnail.png
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / 'assets/fonts/Poppins-Bold.ttf'
GOLD = '0xECC470'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--still', required=True, type=Path)
    parser.add_argument('--price', required=True)
    parser.add_argument('--tag', default='')
    parser.add_argument('--badge', default='')
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--price-size', type=int, default=285)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        files = {}
        for key, text in (('price', args.price), ('tag', args.tag), ('badge', args.badge)):
            files[key] = Path(tmp) / f'{key}.txt'
            files[key].write_text(text)
        font = str(FONT)
        price = (f"drawtext=fontfile={font}:textfile={files['price']}:fontsize={args.price_size}:fontcolor=white"
                 f":x=(w-text_w)/2:y=235")
        price_final = (f"drawtext=fontfile={font}:textfile={files['price']}:fontsize={args.price_size}:fontcolor={GOLD}"
                       f":borderw=13:bordercolor=black:x=(w-text_w)/2:y=235")
        chain = ['[0:v]scale=1080:1920:flags=lanczos,unsharp=5:5:0.9,eq=contrast=1.1:saturation=1.12:brightness=0.02,vignette=PI/5,'
                 + ','.join(f'drawbox=x=0:y=0:w=1080:h={(14 - i) * 52}:color=0x1A0F00@0.04:t=fill' for i in range(14)) + '[bg]',
                 f'[1:v]{price},format=gray,gblur=sigma=30[mb]', '[2:v]format=rgba[g]', '[g][mb]alphamerge[glow]', '[bg][glow]overlay[b2]']
        last = 'b2'
        if args.badge:
            chain.append(f"[{last}]drawtext=fontfile={font}:textfile={files['badge']}:fontsize=58:fontcolor=black:box=1:boxcolor={GOLD}:boxborderw=26:x=(w-text_w)/2:y=105[b3]")
            last = 'b3'
        chain.append(f'[{last}]{price_final}[b4]')
        last = 'b4'
        if args.tag:
            chain.append(f"[{last}]drawtext=fontfile={font}:textfile={files['tag']}:fontsize=100:fontcolor=white:borderw=9:bordercolor=black:x=(w-text_w)/2:y=545[out]")
            last = 'out'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(args.still),
                        '-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:r=1', '-f', 'lavfi', '-i', f'color=c={GOLD}:s=1080x1920:r=1',
                        '-filter_complex', ';'.join(chain), '-map', f'[{last}]', '-frames:v', '1', str(args.out)], check=True)
    print(f'Wrote {args.out}')


if __name__ == '__main__':
    main()
