#!/usr/bin/env python3
"""Hand-drawn retro game "LEVEL UP" card (pure Python + ffmpeg, CPU only, no AI model, no dependencies).

Draws a 135x240 pixel-art scene in code and scales it 8x with nearest-neighbour to a crisp 1080x1920 clip:
a kebab plate that upgrades through four levels while a price counter climbs. Original art; prices are game
numbers, not claims. Use as an insert between realistic shots (see docs/GAP_ANALYSIS.md gap 16).

Usage: scripts/retro-card.py --out storage/p9/retro-kebab.mp4 [--seconds 8] [--mute]
"""
import argparse, math, random, subprocess

W, H, FPS = 135, 240, 12
G = {
 'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.', 'C': '.#### #.... #.... #.... #.... #.... .####',
 'D': '####. #...# #...# #...# #...# #...# ####.', 'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
 'G': '.#### #.... #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#', 'I': '##### ..#.. ..#.. ..#.. ..#.. ..#.. #####',
 'J': '..### ...#. ...#. ...#. ...#. #..#. .##..', 'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#.... #.... #.... #.... #.... #.... #####',
 'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#', 'O': '.###. #...# #...# #...# #...# #...# .###.',
 'P': '####. #...# #...# ####. #.... #.... #....', 'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
 'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..', 'U': '#...# #...# #...# #...# #...# #...# .###.',
 'V': '#...# #...# #...# #...# #...# .#.#. ..#..', 'W': '#...# #...# #...# #.#.# #.#.# ##.## #...#', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
 'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####',
 '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.', '2': '.###. #...# ....# ...#. ..#.. .#... #####',
 '3': '####. ....# ....# .###. ....# ....# ####.', '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
 '6': '.###. #.... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. ..#.. ..#.. ..#..', '8': '.###. #...# #...# .###. #...# #...# .###.',
 '9': '.###. #...# #...# .#### ....# ....# .###.', '$': '..#.. .#### #.#.. .###. ..#.# ####. ..#..', ',': '..... ..... ..... ..... ..... ..#.. .#...',
 '.': '..... ..... ..... ..... ..... ..... ..#..', '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....', ':': '..... ..#.. ..... ..... ..... ..#.. .....',
 '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..', '-': '..... ..... ..... ##### ..... ..... .....', ' ': '..... ..... ..... ..... ..... ..... .....',
}
NAVY, INK, SLATE, WHITE, GOLD, GOLD2 = (10, 14, 34), (4, 6, 16), (30, 36, 62), (238, 236, 226), (242, 196, 72), (255, 232, 150)
BROWN, CHAR, MEAT, BREAD, BREAD2, RED, GREEN, PURPLE, STEEL = (122, 66, 34), (58, 30, 18), (168, 92, 48), (224, 190, 132), (190, 150, 96), (206, 52, 44), (64, 168, 72), (150, 70, 150), (150, 156, 170)
LEVELS = [  # (level label, name, price, seconds)
 ('LEVEL 01', 'STREET KEBAB', 5), ('LEVEL 02', '+ SAFFRON BUTTER', 60), ('LEVEL 03', '+ WAGYU BEEF', 900), ('LEVEL 99', '+ 24K GOLD LEAF', 5000)]


class Frame:
    def __init__(self, bg=NAVY):
        self.p = [[bg] * W for _ in range(H)]

    def px(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.p[y][x] = c

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.px(xx, yy, c)

    def ellipse(self, cx, cy, rx, ry, c):
        for yy in range(cy - ry, cy + ry + 1):
            for xx in range(cx - rx, cx + rx + 1):
                if ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.0:
                    self.px(xx, yy, c)

    def text(self, s, x, y, c, scale=1, shadow=INK):
        for i, ch in enumerate(s.upper()):
            rows = G.get(ch, G[' ']).split()
            for r, row in enumerate(rows):
                for q, bit in enumerate(row):
                    if bit == '#':
                        if shadow:
                            self.rect(x + (i * 6 + q) * scale + 1, y + r * scale + 1, scale, scale, shadow)
                        self.rect(x + (i * 6 + q) * scale, y + r * scale, scale, scale, c)

    def ctext(self, s, y, c, scale=1):
        self.text(s, (W - (len(s) * 6 - 1) * scale) // 2, y, c, scale)

    def bytes(self):
        return bytes(v for row in self.p for px in row for v in px)


def scene(level, t, price, flash):
    rnd = random.Random(7)
    f = Frame(NAVY if level < 3 else (16, 12, 30))
    for y in range(0, 118, 2):                      # dithered wall
        for x in range(y % 4, W, 4):
            f.px(x, y, SLATE)
    if level == 3:                                  # gold stars for the last level
        for k in range(26):
            x, y = rnd.randrange(W), rnd.randrange(20, 112)
            if (k + int(t * 6)) % 3:
                f.px(x, y, GOLD2 if k % 2 else GOLD)
    f.rect(0, 118, W, 122, (22, 18, 16))            # counter
    for x in range(0, W, 9):
        f.rect(x, 118, 1, 122, (34, 28, 24))
    f.rect(0, 118, W, 2, GOLD if level == 3 else (70, 60, 50))
    cy = 150
    rim = GOLD if level == 3 else (196, 196, 204)
    f.ellipse(67, cy + 6, 56, 17, INK); f.ellipse(67, cy + 4, 56, 17, rim); f.ellipse(67, cy + 3, 52, 14, WHITE)
    f.ellipse(67, cy + 2, 44, 11, BREAD2); f.ellipse(67, cy + 1, 43, 10, BREAD)
    for k in range(18):                             # bread spots
        f.px(30 + rnd.randrange(74), cy - 5 + rnd.randrange(12), BREAD2)
    f.rect(8, cy - 5, 119, 2, STEEL); f.rect(4, cy - 6, 8, 4, GOLD)        # skewer + handle
    meat, dark = (MEAT, CHAR) if level < 2 else ((176, 70, 58), (96, 30, 28))
    f.rect(35, cy - 11, 64, 12, meat); f.rect(33, cy - 9, 68, 8, meat)     # kebab body
    f.rect(35, cy - 11, 64, 2, (min(meat[0] + 34, 255), meat[1] + 26, meat[2] + 18))
    for x in range(38, 98, 6):                      # ridges and char
        f.rect(x, cy - 10, 1, 10, dark)
        f.px(x + 3, cy - 2, dark); f.px(x + 2, cy - 7, BROWN)
    if level >= 2:                                  # marbling
        for k in range(22):
            f.px(36 + rnd.randrange(62), cy - 9 + rnd.randrange(8), (236, 198, 190))
    if level >= 1:                                  # saffron butter glaze
        for x in range(36, 98):
            if (x * 7 + int(t * 4)) % 5 < 3:
                f.px(x, cy - 12, GOLD); f.px(x, cy - 11, (250, 214, 96))
    f.ellipse(108, cy + 8, 6, 5, RED); f.px(106, cy + 6, (246, 130, 110)); f.px(108, cy + 3, GREEN)   # tomato
    for k in range(7):                              # onion + parsley
        f.rect(22 + k * 3, cy + 7 + (k % 2), 2, 1, PURPLE); f.px(24 + k * 3, cy + 9, GREEN)
    if level == 3:                                  # twinkling gold leaf
        for k in range(16):
            x, y = 36 + rnd.randrange(62), cy - 12 + rnd.randrange(10)
            f.rect(x, y, 2, 1, GOLD2 if (k + int(t * 8)) % 2 else GOLD)
    for k in range(3):                              # steam
        sx = 50 + k * 17 + int(2 * math.sin(t * 3 + k))
        for j in range(5):
            f.px(sx + (j % 2), cy - 18 - j * 3 - int(t * 6) % 3, (120, 126, 150))
    label, name, _ = LEVELS[level]
    f.rect(0, 0, W, 21, INK); f.text(label, 5, 4, GOLD)
    f.rect(70, 5, 60, 5, SLATE); f.rect(70, 5, int(60 * (level + 1) / 4), 5, GOLD); f.text('XP', 57, 13, STEEL)
    f.ctext(name, 182, WHITE)
    ptxt = '$' + format(int(price), ',')
    f.ctext(ptxt, 198, GOLD2 if level == 3 else GOLD, 3)
    if level == 3 and int(t * 4) % 2:
        f.ctext('BILLIONAIRE BITES', 226, GOLD)
    if flash > 0:
        f.ctext('LEVEL UP!', 60, WHITE if flash % 2 else GOLD2, 2)
        if flash > 5:
            for y in range(0, H, 2):
                for x in range(y % 4 // 2, W, 2):
                    f.px(x, y, WHITE)
    return f


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out', required=True)
    p.add_argument('--seconds', type=float, default=8)
    p.add_argument('--mute', action='store_true')
    a = p.parse_args()
    n = int(a.seconds * FPS); per = n // 4
    audio = ['-f', 'lavfi', '-i', f"anullsrc=r=48000:cl=stereo:d={a.seconds}"] if a.mute else \
            ['-f', 'lavfi', '-i', f"aevalsrc='0.06*sgn(sin(2*PI*t*(262*pow(2\\,floor(mod(t*6\\,4))/6+floor(t/{a.seconds / 4})/4))))':d={a.seconds}:s=48000"]
    ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', *audio,
                           '-vf', 'scale=1080:1920:flags=neighbor', '-r', '24', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p',
                           '-c:a', 'aac', '-b:a', '128k', '-shortest', a.out], stdin=subprocess.PIPE)
    for i in range(n):
        level = min(i // per, 3); k = i - level * per
        prev = LEVELS[level - 1][2] if level else 0
        ease = min(k / (per * 0.6), 1.0)
        price = prev + (LEVELS[level][2] - prev) * (1 - (1 - ease) ** 3)
        flash = 8 - k if level and k < 8 else 0
        ff.stdin.write(scene(level, i / FPS, price, flash).bytes())
    ff.stdin.close(); ff.wait()
    print(f'Done: {a.out}')


if __name__ == '__main__':
    main()
