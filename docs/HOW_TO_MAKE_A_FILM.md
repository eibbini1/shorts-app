# How to make a film yourself (local, free) — 2026-11-14

Status: steps 1-2 VERIFIED. Step 3 (`film-v3.sh`) is syntax-checked; its first full run is the kebab level-up film queued on 2026-11-14.

## The three commands
```
cd ~/Documents/shorts-app
python3 scripts/story.py --list                      # dishes available
python3 scripts/story.py charcoal-lamb-kebab-levels  # writes the scenario and scores it (must be 90+)
scripts/film-v3.sh drafts/generated/charcoal-lamb-kebab-levels.local-scenario.json
```
Result: `storage/p9/<name>-15s.mp4` plus a contact sheet `storage/p9/<name>-sheet.png`.

## What you get
- Shape: vertical 9:16 for phones. File is 1080x1920, 24 fps, H.264 + AAC.
- True detail: clips are generated at 384x640 and enlarged. A higher native size is being tested.
- Length: 15 s (five 3 s shots, or seven 2 s shots). The pipeline accepts 10-180 s; longer means more render time and more chances for a bad shot.
- Time: about 5 minutes per shot on this M1 16 GB Mac, so 25-35 minutes per 15 s film. One render at a time.

## Before you start
- Plug in the Mac, keep it awake, close heavy apps (browser tabs, Xcode). Do not start a second render.
- If the score is under 90 the film is blocked; the output lists what to fix in `scripts/story.py`.

## Formats (set per dish in scripts/story.py)
- levels: same plate upgraded level by level, with an on-screen level and price counter.
- assembly: top-down, 2 s cuts, gloved hands building one item.
- process: one fixed view, 4 s steps, sound-led.
- v3: voiced, five angles (hook, top-down, top-down, 45 degrees, payoff).

## Extras after a film exists (seconds each, no GPU)
- `scripts/trend-fx.py split --top CHEAP.mp4 --bottom RICH.mp4 --out OUT.mp4`   ($5 vs $5,000)
- `scripts/trend-fx.py comic --video FILM.mp4 --out OUT.mp4`                    (comic panel opens into the real shot)
- `scripts/trend-fx.py reverse --video FILM.sfx.mp4 --out OUT.mp4`              (un-build; silent)

## How to judge it
Watch on a phone, full screen, once muted and once with sound. Check: food close and sharp in the first second, one pair of hands, text never on the food, the same food from shot to shot, a clear reveal at the end.
