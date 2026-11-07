# Local gold-finished steak Short

This 30-second portrait recipe uses the installed ComfyUI SD 1.5 checkpoint
for original source images, LTX with Gemma for six moving clips, Kokoro for
short narration, original locally synthesized music and cooking effects, and
FFmpeg for assembly. It requires the Mac setup to have completed first.

```sh
cd /Users/eibbini/Documents/shorts-app
npm run make:gold-steak:mac
```

The recipe creates four local reference images and six motion clips. Basting
continues from the searing clip's last frame; serving continues from the
gold-plating clip's last frame. This reduces visual changes between those
paired shots. The other scene cuts still require visual review for continuity.

The sequence is seasoning (4 s), searing (5 s), butter basting (5 s), slicing
(5 s), edible-gold plating (5 s), and serving a bite (6 s). Narration and sound
are timed to those sections. The export has no burned-in text.

Generated assets stay under ignored `storage/gold-steak-local`. A first run can
take around half an hour or longer on the 16 GB Mac. Reruns reuse saved image
references and verified motion clips. Use a fresh working folder to regenerate
everything after changing prompts:

```sh
GOLD_STEAK_WORK_DIR="$PWD/storage/gold-steak-take2" npm run make:gold-steak:mac
```

The wrapper starts ComfyUI if needed and stops only the instance it started.
If ComfyUI was already running, it requests model unloading before LTX starts.
Keep other GPU generation jobs idle during this recipe. No paid inference API
or downloaded stock footage is used. The soundtrack is synthesized, rather
than a recording of actual kitchen sounds.

Technical checks confirm duration, frame count, resolution and successful
decoding. Watch the finished film to assess cooking action, utensils, food
geometry, sound and continuity; those qualities are not guaranteed by the
technical checks alone.
