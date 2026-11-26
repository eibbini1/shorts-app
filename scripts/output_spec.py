"""Shared output specification loader and stream validator for local finishers and QA.

Reads data/output-spec.json when available and falls back to an identical built-in dict
so isolated temp fixtures without data/ stay self-contained.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DEFAULT_OUTPUT_SPEC = {
    'version': 1,
    'video': {
        'vertical': {'width': 1080, 'height': 1920, 'aspectRatio': '9:16'},
        'wide': {'width': 1920, 'height': 1080, 'aspectRatio': '16:9'},
        'allowedFps': [24, 25, 30],
        'defaultLocalFps': 24,
        'defaultTsFps': 30,
        'allowedVideoCodecs': ['h264'],
        'allowedPixelFormats': ['yuv420p'],
        'minWidth': 360,
        'minHeight': 360,
    },
    'audio': {
        'targetLufs': -15.0,
        'targetTruePeakDb': -1.5,
        'targetLra': 11.0,
        'qaMinLufs': -18.0,
        'qaMaxLufs': -13.0,
        'qaMaxTruePeakDb': -0.5,
        'prereviewToleranceLufs': 2.5,
        'prereviewMaxTruePeakDb': -0.8,
        'allowedAudioCodecs': ['aac'],
        'targetSampleRateHz': 48000,
        'minSampleRateHz': 44100,
        'bitrateKbps': 192,
    },
    'qa': {
        'maxBlackSeconds': 0.5,
        'maxFreezeSeconds': 2.5,
        'maxSilenceSeconds': 1.5,
        'durationToleranceSeconds': 0.15,
        'defaultMinSeconds': 20,
        'defaultMaxSeconds': 35,
        'maxFirstVoiceSeconds': 1.0,
    },
}


def load_output_spec(path=None):
    target = Path(path) if path is not None else ROOT / 'data/output-spec.json'
    try:
        parsed = json.loads(target.read_text(encoding='utf-8'))
        if isinstance(parsed, dict) and 'video' in parsed and 'audio' in parsed and 'qa' in parsed:
            return parsed
    except FileNotFoundError:
        pass
    return DEFAULT_OUTPUT_SPEC


OUTPUT_SPEC = load_output_spec()


def _parse_rate(value):
    raw = str(value or '').strip()
    if not raw or raw == '0/0':
        return None
    if '/' in raw:
        num, den = raw.split('/', 1)
        try:
            n, d = float(num), float(den)
            return round(n / d, 3) if d > 0 else None
        except ValueError:
            return None
    try:
        return round(float(raw), 3)
    except ValueError:
        return None


def probe_video_streams(video_path):
    """Extract normalized stream metrics via ffprobe for shared output spec validation."""
    result = subprocess.run(
        [
            'ffprobe', '-v', 'error',
            '-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate,sample_rate:format=duration',
            '-of', 'json', str(video_path),
        ],
        capture_output=True, text=True, check=True,
    )
    payload = json.loads(result.stdout or '{}')
    streams = payload.get('streams') or []
    video = next((s for s in streams if s.get('codec_type') == 'video'), None)
    audio = next((s for s in streams if s.get('codec_type') == 'audio'), None)
    duration_raw = (payload.get('format') or {}).get('duration')
    try:
        duration = round(float(duration_raw), 3) if duration_raw is not None else None
    except ValueError:
        duration = None
    return {
        'width': int(video['width']) if video and video.get('width') is not None else None,
        'height': int(video['height']) if video and video.get('height') is not None else None,
        'fps': _parse_rate(video.get('avg_frame_rate') or video.get('r_frame_rate')) if video else None,
        'videoCodec': str(video.get('codec_name') or '').lower() if video else None,
        'pixelFormat': str(video.get('pix_fmt') or '').lower() if video else None,
        'hasAudio': audio is not None,
        'audioCodec': str(audio.get('codec_name') or '').lower() if audio else None,
        'audioSampleRateHz': int(audio['sample_rate']) if audio and audio.get('sample_rate') else None,
        'durationSeconds': duration,
    }


def check_video_spec(metrics, orientation=None, expected_seconds=None, spec=OUTPUT_SPEC):
    """Validate stream metrics against the shared output specification."""
    issues = []
    vspec = spec['video']
    aspec = spec['audio']
    qspec = spec['qa']

    width = metrics.get('width')
    height = metrics.get('height')
    if not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
        issues.append('video stream missing valid dimensions')
    else:
        if width < vspec['minWidth'] or height < vspec['minHeight']:
            issues.append(f'dimensions {width}x{height} are below minimum {vspec["minWidth"]}x{vspec["minHeight"]}')
        if width % 2 != 0 or height % 2 != 0:
            issues.append(f'dimensions {width}x{height} must be even for H.264/yuv420p playback')
        if orientation == 'vertical' and height <= width:
            issues.append(f'expected vertical orientation (height > width), got {width}x{height}')
        elif orientation == 'wide' and width <= height:
            issues.append(f'expected wide orientation (width > height), got {width}x{height}')

    fps = metrics.get('fps')
    allowed_fps = vspec['allowedFps']
    if fps is None or not any(abs(fps - target) <= 0.5 for target in allowed_fps):
        issues.append(f'frame rate {fps} fps is outside allowed {allowed_fps}')

    vcodec = (metrics.get('videoCodec') or '').lower()
    if vcodec not in vspec['allowedVideoCodecs']:
        issues.append(f'video codec "{vcodec or "missing"}" is not in {vspec["allowedVideoCodecs"]}')

    pix_fmt = (metrics.get('pixelFormat') or '').lower()
    if pix_fmt not in vspec['allowedPixelFormats']:
        issues.append(f'pixel format "{pix_fmt or "missing"}" is not in {vspec["allowedPixelFormats"]}')

    if not metrics.get('hasAudio'):
        issues.append('audio stream is missing')
    else:
        acodec = (metrics.get('audioCodec') or '').lower()
        if acodec not in aspec['allowedAudioCodecs']:
            issues.append(f'audio codec "{acodec or "missing"}" is not in {aspec["allowedAudioCodecs"]}')
        sr = metrics.get('audioSampleRateHz')
        if not isinstance(sr, int) or sr < aspec['minSampleRateHz']:
            issues.append(f'audio sample rate {sr} Hz is below {aspec["minSampleRateHz"]} Hz')

    if expected_seconds is not None:
        dur = metrics.get('durationSeconds')
        tol = qspec['durationToleranceSeconds']
        if dur is None or abs(dur - expected_seconds) > tol:
            issues.append(f'duration {dur}s is outside {expected_seconds}s ± {tol}s')

    return {'ok': not issues, 'issues': issues, 'metrics': metrics, 'specVersion': spec['version']}


def check_output_file(video_path, orientation=None, expected_seconds=None, spec=OUTPUT_SPEC):
    """Probe a rendered video file and verify it satisfies the shared output spec."""
    try:
        metrics = probe_video_streams(video_path)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        return {'ok': False, 'issues': [f'could not probe output video: {error}'], 'metrics': {}, 'specVersion': spec['version']}
    return check_video_spec(metrics, orientation=orientation, expected_seconds=expected_seconds, spec=spec)
