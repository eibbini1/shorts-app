"""Choose a local film's voice/caption treatment before model rendering."""


def choose(data):
    settings = data['settings']
    shots = data['plan']['shots']
    requested = settings.get('presentationMode', 'auto')
    if requested not in ('auto', 'voiced', 'asmr'):
        raise ValueError('presentationMode must be auto, voiced or asmr')
    if requested == 'auto':
        # A short tactile reveal can carry itself. Longer stories keep the
        # established Kokoro narration and phrase captions by default.
        asmr = settings['seconds'] <= 12 and len(shots) <= 2 and all(s.get('sound', '').strip() for s in shots)
        mode = 'asmr' if asmr else 'voiced'
        reason = 'short two-shot action with sound cues' if asmr else 'story needs narrated context'
    else:
        mode, reason = requested, 'explicit scenario setting'
    return {'mode': mode, 'voice': mode == 'voiced', 'captions': mode == 'voiced', 'reason': reason}
