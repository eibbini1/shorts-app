"""Draw the 'Genius Approved' seal as a transparent PNG, and optionally composite it onto an image.

  python3 scripts/make-stamp.py --out outputs/stamp.png [--size 520] [--onto thumb.png --at 0.80,0.14 --width 0.34 --out2 out.png]
Original artwork: double ring, arc text, centre word, slight tilt, ink-worn texture. No official or brand marks.
"""
import argparse, math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parents[1]
GOLD = (236, 196, 112, 255)
FONT = ROOT / 'assets/fonts/Poppins-Bold.ttf'


def arc_text(layer, text, radius, centre, size, start_deg, span_deg, flip=False):
    font = ImageFont.truetype(str(FONT), size)
    step = span_deg / max(len(text) - 1, 1)
    for i, ch in enumerate(text):
        ang = start_deg + step * i if not flip else start_deg - step * i
        glyph = Image.new('RGBA', (size * 2, size * 2), (0, 0, 0, 0))
        ImageDraw.Draw(glyph).text((size, size), ch, font=font, fill=GOLD, anchor='mm')
        rot = ang + 90 if not flip else ang - 90
        glyph = glyph.rotate(-rot, resample=Image.BICUBIC)
        x = centre + radius * math.cos(math.radians(ang)) - size
        y = centre + radius * math.sin(math.radians(ang)) - size
        layer.alpha_composite(glyph, (round(x), round(y)))


def stamp(size=520, tilt=-12, seed=7):
    s = size * 2
    c = s // 2
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r0 = c - 8
    d.ellipse((c - r0, c - r0, c + r0, c + r0), fill=(14, 10, 4, 215))
    for r, w in ((c - 8, 22), (c - 52, 8), (int(c * .55), 8)):
        d.ellipse((c - r, c - r, c + r, c + r), outline=GOLD, width=w)
    arc_text(img, 'BILLIONAIRE BITES', c - 112, c, int(s * .085), 180 + 22, 136)
    arc_text(img, 'OFFICIAL SEAL', c - 112, c, int(s * .06), 90 - 52, 104, flip=False) if False else None
    arc_text(img, 'TASTE TESTED', c - 112, c, int(s * .07), 90 + 62, 124, flip=True)
    big = ImageFont.truetype(str(FONT), int(s * .135))
    d.text((c, c - int(s * .075)), 'GENIUS', font=big, fill=GOLD, anchor='mm')
    d.text((c, c + int(s * .075)), 'APPROVED', font=ImageFont.truetype(str(FONT), int(s * .10)), fill=GOLD, anchor='mm')
    for ang in (0, 180):  # side stars
        x = c + (c - 112 - 30) * math.cos(math.radians(ang)) * 0.0
    for k in (-1, 0, 1):
        cx, cy, ro, ri = c + k * int(s * .075), c + int(s * .19), int(s * .034), int(s * .014)
        pts = [(cx + (ro if i % 2 == 0 else ri) * math.cos(math.radians(-90 + 36 * i)), cy + (ro if i % 2 == 0 else ri) * math.sin(math.radians(-90 + 36 * i))) for i in range(10)]
        d.polygon(pts, fill=GOLD)
    # worn-ink texture: knock random specks out of the alpha
    rnd = random.Random(seed)
    wear = Image.new('L', (s, s), 255)
    wd = ImageDraw.Draw(wear)
    for _ in range(700):
        x, y, r = rnd.randrange(s), rnd.randrange(s), rnd.choice((1, 1, 2, 3))
        wd.ellipse((x - r, y - r, x + r, y + r), fill=rnd.choice((40, 90)))
    wear = wear.filter(ImageFilter.GaussianBlur(0.8))
    img.putalpha(ImageChops.multiply(img.getchannel('A'), wear))
    img = img.rotate(tilt, resample=Image.BICUBIC, expand=True)
    return img.resize((size, size), Image.LANCZOS)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--out', required=True, type=Path)
    p.add_argument('--size', type=int, default=520)
    p.add_argument('--onto', type=Path)
    p.add_argument('--at', default='0.80,0.14', help='centre as fractions of width,height')
    p.add_argument('--width', type=float, default=0.34, help='stamp width as a fraction of the image width')
    p.add_argument('--out2', type=Path)
    a = p.parse_args()
    st = stamp(a.size)
    st.save(a.out)
    if a.onto:
        base = Image.open(a.onto).convert('RGBA')
        w = round(base.width * a.width)
        small = st.resize((w, w), Image.LANCZOS)
        fx, fy = (float(v) for v in a.at.split(','))
        shadow = Image.new('RGBA', small.size, (0, 0, 0, 0))
        shadow.putalpha(small.getchannel('A').point(lambda v: int(v * .6)))
        shadow = shadow.filter(ImageFilter.GaussianBlur(6))
        pos = (round(base.width * fx - w / 2), round(base.height * fy - w / 2))
        base.alpha_composite(shadow, (pos[0] + 5, pos[1] + 7))
        base.alpha_composite(small, pos)
        base.convert('RGB').save(a.out2 or a.onto.with_suffix('.stamped.png'))


if __name__ == '__main__':
    main()
