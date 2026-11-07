"""Local reference and LTX motion generation for a coherent luxury steak Short."""
import argparse
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(os.environ.get('GOLD_STEAK_WORK_DIR', ROOT / 'storage/gold-steak-local')).expanduser().resolve()
SHOTS = [
    ('season', 4, 'Close macro photograph of a single thick boneless marbled beef steak on a dark walnut cutting board, coarse salt crystals and rosemary beside it, black kitchen background, warm side lighting', 'Macro food cinematography. Coarse salt crystals fall gently onto the single raw marbled steak on the walnut board, bounce and settle on its moist surface. The rosemary remains beside it. Slow deliberate physical motion, warm side light, dark background, no cuts, no text.'),
    ('sear', 5, 'Close macro photograph of a single thick boneless steak searing in a black cast iron skillet, caramelized brown crust, bubbling butter around the steak, rosemary sprig beside it, warm side lighting, dark restaurant kitchen background', 'A thick steak sears in the black cast iron skillet. Butter bubbles rapidly around its edges and steam rises naturally. Its browned crust glistens. Gentle low camera push, same steak and skillet, dark kitchen, warm side light. Real cooking motion, no cuts, no text.'),
    ('baste', 5, 'Close macro photograph of a single thick browned boneless steak in a black cast iron skillet, a single silver spoon above it holding golden melted butter, rosemary sprig in the skillet, bubbling butter, warm side lighting, dark background', 'One silver spoon slowly tilts and pours a ribbon of hot golden butter over the browned steak in the same black skillet. The butter flows across the crust and falls back into the bubbling pan. Rosemary moves slightly in the butter. Continuous appetizing physical movement, warm light, no cuts, no text.'),
    ('slice', 5, 'Close macro photograph of a cooked steak sliced into five thick slices on a dark walnut cutting board, rich brown crust and juicy rosy pink center, a single clean chefs knife beside the steak, rosemary, warm side lighting, dark background', 'Close macro food shot. A single knife finishes one slow slice through the rested steak on the walnut board. The tender rosy center is revealed as one slice gently separates; a small bead of juice glistens on the cutting surface. Same browned steak and rosemary, continuous physical motion, no cuts, no text.'),
    ('gold', 5, 'Luxury restaurant food photograph, five thick slices of medium rare steak arranged neatly on one matte charcoal ceramic plate, glossy brown pan sauce underneath, one rosemary sprig, a few tiny delicate edible gold leaf flakes resting on the steak, close macro view, warm golden side light, dark background', 'Macro shot of the plated slices of the same steak on the matte charcoal plate. Tiny delicate edible gold leaf flakes float down and settle on the browned crust. The glossy brown sauce slowly spreads around the slices. The rosy centers remain visible. Warm side light, coherent physical movement, no cuts, no text.'),
    ('serve', 6, 'Luxury macro food photograph, a single silver fork holding one bite of juicy medium rare steak with a browned crust and a tiny edible gold leaf flake, a matte charcoal plate with matching sliced steak and glossy brown sauce behind it, rosemary garnish, warm golden side light, dark background', 'A single fork slowly lifts one bite of the same tender steak with a tiny edible gold flake toward the camera. A little glossy pan sauce clings to the bite, the rosy center remains visible. The matching sliced steak rests on the same charcoal plate behind it. Gentle mouthwatering movement and shallow depth of field, no cuts, no text.'),
]

def run(args):
    subprocess.run([str(a) for a in args], cwd=ROOT, check=True)

def valid(path):
    if not path.exists(): return False
    try:
        s=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,width,height,r_frame_rate','-of','json',str(path)]))['streams'][0]
        return s['nb_frames']=='97' and s['width']==384 and s['height']==640 and s['r_frame_rate']=='24/1'
    except (KeyError, ValueError, IndexError, subprocess.CalledProcessError): return False

def main():
    mode=argparse.ArgumentParser()
    mode.add_argument('stage',choices=['images','motion'])
    args=mode.parse_args()
    (WORK/'refs').mkdir(parents=True,exist_ok=True)
    (WORK/'motion').mkdir(exist_ok=True)
    for index,(name,seconds,prompt,motion) in enumerate(SHOTS):
        ref=WORK/'refs'/f'{name}.png'
        if args.stage=='images':
            if name in ('baste', 'serve'): continue
            if ref.exists() and ref.with_suffix('.json').exists(): continue
            print('Local image:',name,flush=True)
            run(['python3',ROOT/'scripts/create-local-image.py','--prompt',prompt,'--preset',ROOT/'assets/presets/luxury-food.json','--seed',600+index,'--output',ref])
        else:
            target=WORK/'motion'/f'{name}.mp4'
            if name == 'baste':
                ref=WORK/'motion'/'sear-anchor.png'
                motion='Close-up continuation of the exact same steak searing in the same black skillet. A thin stream of golden melted butter pours from above the frame onto the browned crust, flows across it, and bubbles around the steak. Steam rises. Same single steak, same pan, no extra pans or food, no cuts, no text.'
            if name == 'serve':
                ref=WORK/'motion'/'gold-anchor.png'
                motion='Continuous macro shot of the exact same sliced steak with delicate edible gold leaf on the same charcoal plate. One silver fork enters from the right, gently lifts a small tender bite from the nearest slice toward the lens. Glossy sauce clings to the bite and the pink center remains visible. Slow realistic food movement, same plate, same rosemary, no extra dishes, no cuts, no text.'
            if valid(target):
                print('Reusing verified',name,flush=True)
                run(['ffmpeg','-y','-v','error','-sseof','-0.05','-i',target,'-frames:v',1,WORK/'motion'/f'{name}-anchor.png'])
                continue
            print('Local LTX motion:',name,flush=True)
            ltx=(ROOT/'storage/setup/ltx-model-dir.txt').read_text().strip()
            gemma=(ROOT/'storage/setup/gemma-model-dir.txt').read_text().strip()
            run([ROOT/'storage/tools/ltx-2-mlx/.venv/bin/ltx-2-mlx','generate','--model',ltx,'--gemma',gemma,'--distilled','--low-ram','--no-audio','--seed',700+index,'--image',ref,0,1.0,'--prompt',motion,'-H',640,'-W',384,'-f',97,'--frame-rate',24,'-o',target])
            if not valid(target): raise RuntimeError(f'Invalid clip: {target}')
            run(['ffmpeg','-y','-v','error','-sseof','-0.05','-i',target,'-frames:v',1,WORK/'motion'/f'{name}-anchor.png'])
    (WORK/'film-manifest.json').write_text(json.dumps({'aspect':'short','shots':[{'file':f'motion/{name}.mp4','seconds':seconds, **({'endFrame':48} if name == 'season' else {})} for name,seconds,_,_ in SHOTS],'soundtrack':'soundtrack.wav','voice':{'file':'voice-timeline.wav','startSeconds':0}},indent=2)+'\n')

if __name__=='__main__': main()
