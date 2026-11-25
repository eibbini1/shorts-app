"""Sound accents (impact, riser, stinger, swell, breath) are measured on the audio itself, not assumed.

The pattern comes from the 2026-11-24 reference teardown: a riser builds high-frequency energy for about 1.2 s before a
low impact, a final reveal gets an impact plus a ringing tail, and the soundtrack takes a short breath before a hero cut.
"""
import importlib.util
import shutil
import subprocess
import sys
import tempfile
import unittest
import wave
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location('add_sfx', Path(__file__).with_name('add-sfx.py'))
sfx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sfx)
R = sfx.RATE
FRAME = 1 / 24


def seg(x, a, b):
    return x[round(a * R):round(b * R)]


def rms(x):
    return float(np.sqrt(np.mean(x.astype(np.float64) ** 2))) if len(x) else 0.0


def band(x, lo, hi):
    spectrum = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    freqs = np.fft.rfftfreq(len(x), 1 / R)
    return float(spectrum[(freqs >= lo) & (freqs < hi)].sum())


def render(accents, total=5, shots=None):
    return sfx.build(shots or [{'seconds': total}], total, accents=accents)[0]


class AccentAudioTests(unittest.TestCase):
    def test_impact_starts_on_the_marked_time_and_is_mostly_low(self):
        mix = render([{'type': 'impact', 'at': 2.0}])
        self.assertEqual(float(np.max(np.abs(seg(mix, 0, 1.99)))), 0.0)
        onset = int(np.argmax(np.abs(mix) > 0.05 * np.max(np.abs(mix)))) / R
        self.assertLessEqual(abs(onset - 2.0), 0.005)
        self.assertLessEqual(abs(onset - 2.0), 2 * FRAME)
        hit = seg(mix, 2.0, 2.3)
        self.assertGreater(band(hit, 20, 150) / band(hit, 20, 20000), 0.8)

    def test_riser_builds_high_frequencies_then_the_impact_lands(self):
        mix = render([{'type': 'riser-impact', 'at': 3.0}])
        self.assertEqual(float(np.max(np.abs(seg(mix, 0, 1.79)))), 0.0)
        first, last = seg(mix, 1.8, 2.2), seg(mix, 2.6, 3.0)
        self.assertGreater(band(last, 3500, 9000) / band(first, 3500, 9000), 2.0)
        share = lambda x: band(x, 3500, 9000) / band(x, 20, 20000)  # brighter, not just louder
        self.assertGreater(share(last), 2 * share(first))
        self.assertGreater(rms(seg(mix, 3.0, 3.1)), rms(seg(mix, 2.9, 3.0)))

    def test_stinger_rings_out_and_decays(self):
        mix = render([{'type': 'stinger', 'at': 8.2}], total=10)
        self.assertEqual(float(np.max(np.abs(seg(mix, 0, 8.19)))), 0.0)
        early, late = band(seg(mix, 8.3, 8.9), 2000, 6000), band(seg(mix, 8.9, 9.5), 2000, 6000)
        self.assertGreater(early, 0)
        self.assertGreater(early, late * 2)

    def test_swell_peaks_at_its_marked_centre_and_stays_inside_its_window(self):
        mix = render([{'type': 'swell', 'at': 4.8, 'seconds': 1.2}], total=8)
        windows = [(t, rms(seg(mix, t, t + 0.1))) for t in np.arange(3.0, 6.5, 0.1)]
        peak = max(windows, key=lambda item: item[1])[0] + 0.05
        self.assertLessEqual(abs(peak - 4.8), 0.15)
        self.assertEqual(float(np.max(np.abs(seg(mix, 0, 4.1)))), 0.0)
        self.assertEqual(float(np.max(np.abs(seg(mix, 5.5, 8)))), 0.0)

    def test_foley_is_identical_with_and_without_accents(self):
        shots = [{'seconds': 5, 'sound': 'ball bounce'}]
        plain = sfx.build(shots, 5)[0]
        accented = sfx.build(shots, 5, accents=[{'type': 'impact', 'at': 4.0}])[0]
        self.assertTrue(np.array_equal(seg(plain, 0, 3.99), seg(accented, 0, 3.99)))


class HitPointTests(unittest.TestCase):
    def scenario(self, hit, shots=None):
        return {'settings': {'seconds': 10, 'presentationMode': 'voiced'},
                'plan': {'shots': shots or [{'seconds': 4}, {'seconds': 3, 'hit': hit}, {'seconds': 3}]}}

    def test_hit_offset_becomes_film_time_after_earlier_shots(self):
        accents, problems = sfx.resolve_accents(self.scenario({'type': 'impact', 'atSeconds': 1.25}))
        self.assertEqual(problems, [])
        self.assertEqual(accents, [{'type': 'impact', 'at': 5.25}])

    def test_hit_is_mixed_on_the_visual_frame(self):
        accents, _ = sfx.resolve_accents(self.scenario({'type': 'impact', 'atSeconds': 1.0}))
        mix = render(accents, total=10)
        onset = int(np.argmax(np.abs(mix) > 0.05 * np.max(np.abs(mix)))) / R
        self.assertLessEqual(abs(onset - 5.0), 2 * FRAME)

    def test_hit_outside_its_shot_is_reported_by_shot_number(self):
        _, problems = sfx.resolve_accents(self.scenario({'type': 'impact', 'atSeconds': 3.5}))
        self.assertEqual(len(problems), 1)
        self.assertIn('shot 2', problems[0])

    def test_explicit_accents_are_kept_and_hit_accents_are_audited(self):
        data = self.scenario({'type': 'impact', 'atSeconds': 1.0})
        data['audioPlan'] = {'accents': [{'type': 'stinger', 'at': 8.2}]}
        accents, _ = sfx.resolve_accents(data)
        self.assertEqual([a['type'] for a in accents], ['stinger', 'impact'])
        data['plan']['shots'][1]['hit'] = {'type': 'nonsense', 'atSeconds': 1.0}
        with redirect_stdout(StringIO()):
            self.assertTrue(any('unknown type' in p for p in sfx.audit_cues(data)))


def write_test_wav(path, samples, rate=48000):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes())


def run_filter(graph, inputs, seconds):
    out = Path(inputs[0]).with_name('mixed.wav')
    cmd = ['ffmpeg', '-y', '-v', 'error']
    for item in inputs:
        cmd += ['-i', str(item)]
    subprocess.run(cmd + ['-filter_complex', graph, '-map', '[a]', '-t', str(seconds), '-ac', '1', '-ar', '48000', str(out)], check=True)
    with wave.open(str(out)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768


class MusicBedTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        t = np.arange(int(6 * R)) / R
        track = np.zeros_like(t)
        burst = (t >= 2.0) & (t < 2.05)
        track[burst] = 0.8 * np.sin(2 * np.pi * 1000 * t[burst])  # the track's "drop" at 2.0 s
        self.track = self.dir / 'track.wav'
        write_test_wav(self.track, track)

    def bed(self, music, total=8):
        music = {**music, 'path': str(self.track), 'gainDb': 0, 'fadeOut': 0}
        graph = sfx.music_filter(music, total, source='[0:a]', out='[a]')
        return run_filter(graph, [self.track], total)

    def onset(self, audio):
        return int(np.argmax(np.abs(audio) > 0.2)) / R

    def test_offset_rule(self):
        self.assertEqual(sfx.music_offset({'dropAt': 5.0, 'dropInTrack': 2.0}), 3.0)
        self.assertEqual(sfx.music_offset({'dropAt': 1.0, 'dropInTrack': 2.0}), -1.0)
        self.assertEqual(sfx.music_offset({'startAt': 1.5}), 1.5)
        self.assertEqual(sfx.music_offset({}), 0)

    def test_drop_lands_on_the_film_hit_when_the_track_is_delayed(self):
        self.assertAlmostEqual(self.onset(self.bed({'dropAt': 5.0, 'dropInTrack': 2.0})), 5.0, delta=0.03)

    def test_drop_lands_on_the_film_hit_when_the_track_front_is_trimmed(self):
        self.assertAlmostEqual(self.onset(self.bed({'dropAt': 1.0, 'dropInTrack': 2.0})), 1.0, delta=0.03)

    def test_bed_ducks_under_narration(self):
        t = np.arange(int(4 * R)) / R
        voice = np.where((t >= 1.5) & (t < 2.5), 0.5 * np.sin(2 * np.pi * 220 * t), 0.0)
        voice_path, film, fx = self.dir / 'voice.wav', self.dir / 'film.wav', self.dir / 'fx.wav'
        write_test_wav(voice_path, voice)
        write_test_wav(film, np.zeros_like(t))
        write_test_wav(fx, np.zeros_like(t))
        bed_path = self.dir / 'bed.wav'
        write_test_wav(bed_path, 0.3 * np.sin(2 * np.pi * 440 * t))
        music = {'path': str(bed_path), 'gainDb': 0, 'fadeOut': 0}
        graph = sfx.mix_graph('[0:a]anull[base]', 4, music).replace(',loudnorm=I=-14:TP=-1.5:LRA=11', '')
        mixed = run_filter(graph, [film, fx, voice_path, bed_path], 4)
        level = lambda a, b: rms(mixed[int(a * R):int(b * R)])
        self.assertLess(level(1.8, 2.3), 0.5 * level(0.2, 1.0))

    def test_plan_problems_are_named(self):
        self.assertEqual(sfx.audit_music(None, 8), [])
        self.assertTrue(any('path' in p for p in sfx.audit_music({'gainDb': -10}, 8)))
        self.assertTrue(any('not found' in p for p in sfx.audit_music({'path': '/nope.mp3'}, 8)))
        bad = sfx.audit_music({'path': str(self.track), 'dropAt': 3}, 8)
        self.assertTrue(any('go together' in p for p in bad))
        self.assertTrue(any('gainDb' in p for p in sfx.audit_music({'path': str(self.track), 'gainDb': 5}, 8)))
        self.assertEqual(sfx.audit_music({'path': str(self.track), 'dropAt': 3, 'dropInTrack': 2}, 8), [])


class RecordedAccentTests(unittest.TestCase):
    SAMPLES = {'crunch': {'file': 'assets/foley/public-domain/crunching.ogg', 'offsetSeconds': 0.0}}

    def render(self, at, offset, total=5):
        samples = {'crunch': {**self.SAMPLES['crunch'], 'offsetSeconds': offset}}
        accents = [{'type': 'recorded', 'sample': 'crunch', 'at': at, 'seconds': 0.8}]
        return sfx.build([{'seconds': total}], total, foley_samples=samples, accents=accents)[0]

    def onset(self, mix):
        return int(np.argmax(np.abs(mix) > 0.05 * np.max(np.abs(mix)))) / R

    def test_first_transient_lands_on_the_marked_frame_whatever_the_recording_start(self):
        for offset in (0.0, 0.6, 1.3):
            mix = self.render(3.0, offset)
            self.assertEqual(float(np.max(np.abs(seg(mix, 0, 2.98)))), 0.0)
            self.assertAlmostEqual(self.onset(mix), 3.0, delta=0.012)

    def test_recorded_plan_problems_are_named(self):
        self.assertTrue(any('needs "sample"' in p for p in sfx.audit_accents([{'type': 'recorded', 'at': 2}], 5)))
        self.assertTrue(any('not in audioPlan.foleySamples' in p for p in sfx.audit_accents([{'type': 'recorded', 'sample': 'x', 'at': 2}], 5, self.SAMPLES)))
        self.assertTrue(any('must fit' in p for p in sfx.audit_accents([{'type': 'recorded', 'sample': 'crunch', 'at': 4.9}], 5, self.SAMPLES)))
        self.assertEqual(sfx.audit_accents([{'type': 'recorded', 'sample': 'crunch', 'at': 2}], 5, self.SAMPLES), [])


class AccentPlanTests(unittest.TestCase):
    def problems(self, accents, total=10):
        return sfx.audit_accents(accents, total)

    def test_valid_plan_has_no_problems(self):
        plan = [{'type': 'riser-impact', 'at': 3.0}, {'type': 'stinger', 'at': 8.2}, {'type': 'breath', 'at': 5.0}]
        self.assertEqual(self.problems(plan), [])
        self.assertEqual(self.problems(None), [])

    def test_bad_plans_are_named(self):
        cases = [
            ([{'type': 'boom', 'at': 1}], 'unknown type'),
            ([{'type': 'impact', 'at': 11}], 'between 0 and'),
            ([{'type': 'impact', 'at': 'soon'}], 'between 0 and'),
            ([{'type': 'riser-impact', 'at': 0.5}], 'riser is longer'),
            ([{'type': 'stinger', 'at': 9.5}], 'tail does not fit'),
            ([{'type': 'impact', 'at': 2.0}, {'type': 'impact', 'at': 2.3}], 'closer than 0.5 s'),
            ([{'type': 'breath', 'at': 5, 'seconds': 0.05}], 'breath needs'),
            ([{'type': 'impact', 'at': i + 1} for i in range(7)], 'maximum is 6'),
        ]
        for plan, text in cases:
            with self.subTest(text=text):
                found = self.problems(plan)
                self.assertTrue(any(text in item and 'accent plan' in item for item in found), found)

    def test_audit_cues_blocks_a_bad_accent_plan_with_its_own_code(self):
        data = {'settings': {'presentationMode': 'asmr'}, 'plan': {'shots': [{'seconds': 5, 'sound': 'ball bounce'}]},
                'audioPlan': {'accents': [{'type': 'impact', 'at': 99}]}}
        with redirect_stdout(StringIO()):
            found = sfx.audit_cues(data)
        self.assertTrue(any('accent plan' in item for item in found))
        self.assertEqual(sfx.sound_code(found[0]), 'accent-plan')

    def test_breath_over_speech_is_refused_but_a_gap_is_fine(self):
        speech = np.zeros(3 * R, dtype=np.float32)
        speech[round(1.0 * R):round(1.5 * R)] = 0.3 * np.sin(2 * np.pi * 200 * np.arange(round(0.5 * R)) / R)
        over = sfx.breath_over_narration([{'type': 'breath', 'at': 1.4, 'seconds': 0.3}], speech)
        gap = sfx.breath_over_narration([{'type': 'breath', 'at': 2.4, 'seconds': 0.3}], speech)
        self.assertTrue(any('overlaps narration' in item for item in over))
        self.assertEqual(gap, [])


@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg is needed to run the real filter graph')
class BreathFilterTests(unittest.TestCase):
    def run_breath(self, accents):
        tone = (0.5 * np.sin(2 * np.pi * 1000 * np.arange(3 * R) / R)).astype('<f4')
        with tempfile.TemporaryDirectory() as folder:
            src, dst = Path(folder) / 'in.wav', Path(folder) / 'out.wav'
            pcm = (tone * 32767).astype('<i2')
            with wave.open(str(src), 'wb') as w:
                w.setnchannels(1), w.setsampwidth(2), w.setframerate(R), w.writeframes(pcm.tobytes())
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(src), '-af', sfx.breath_chain(accents), str(dst)], check=True)
            out, rate = sfx.read_wav_mono(dst)
        self.assertEqual(rate, R)
        return tone, out

    def test_breath_dips_before_the_cut_and_nowhere_else_without_clicks(self):
        tone, out = self.run_breath([{'type': 'breath', 'at': 2.0, 'seconds': 0.3, 'depth': 0.2}])
        base = rms(seg(tone, 0.5, 1.5))
        self.assertAlmostEqual(rms(seg(out, 1.80, 1.90)) / base, 0.2, delta=0.04)
        self.assertAlmostEqual(rms(seg(out, 0.5, 1.5)) / base, 1.0, delta=0.03)
        self.assertAlmostEqual(rms(seg(out, 2.1, 2.9)) / base, 1.0, delta=0.03)
        self.assertGreaterEqual(rms(seg(out, 2.0, 2.1)) / base, 0.97)
        self.assertLess(float(np.max(np.abs(np.diff(out)))), 0.25)


if __name__ == '__main__':
    unittest.main()
