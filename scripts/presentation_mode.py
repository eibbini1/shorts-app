"""Choose a local film's voice/caption treatment before model rendering."""


def choose(data):
    settings = data['settings']
    shots = data['plan']['shots']
    requested = settings.get('presentationMode', 'auto')
    audio_plan = data.get('audioPlan') or {}
    voice_intent = str(audio_plan.get('voice', 'auto')).strip().lower()
    subtitle_intent = str(audio_plan.get('subtitles', 'auto')).strip().lower()
    if requested not in ('auto', 'voiced', 'asmr'):
        raise ValueError('presentationMode must be auto, voiced or asmr')
    if requested == 'auto':
        # The scenario's creative intent outranks runtime. A longer tactile
        # recipe can still work through physical action and cooking sound.
        tactile = (data.get('creativeSignature') or {}).get('format') == 'tactile-recipe-reveal'
        sound_cues = all(s.get('sound', '').strip() for s in shots)
        short_tactile = settings['seconds'] <= 12 and len(shots) <= 2 and sound_cues
        asmr = voice_intent == 'none' or (voice_intent == 'auto' and (short_tactile or (tactile and sound_cues)))
        mode = 'asmr' if asmr else 'voiced'
        reason = ('scenario requests no voice' if voice_intent == 'none' else
                  'tactile recipe with sound cues' if tactile and sound_cues and asmr else
                  'short two-shot action with sound cues' if asmr else 'story needs narrated context')
    else:
        mode, reason = requested, 'explicit scenario setting'
    if subtitle_intent not in ('auto', 'none', 'captions'):
        raise ValueError('audioPlan.subtitles must be auto, none or captions')
    captions = mode == 'voiced' and subtitle_intent != 'none'
    return {'mode': mode, 'voice': mode == 'voiced', 'captions': captions, 'reason': reason}
