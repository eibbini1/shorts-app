"""Unit & real-FFmpeg parity tests for Phase A pipeline throughput optimizations."""
import importlib.util
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))

import first_checks  # noqa: E402
import render_quality  # noqa: E402


def _load_script(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


qa_local = _load_script('qa_local_video', 'qa-local-video.py')
assemble = _load_script('assemble_motion_video', 'assemble-motion-video.py')
vision = _load_script('check_still_vision_perf', 'check-still-vision.py')
renderer = _load_script('render_any_local_perf', 'render-any-local.py')


class NativeFrameAndAssemblyTests(unittest.TestCase):
    def test_frames_for_seconds_preserves_default_and_computes_exact_8k_plus_1(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('SHORTS_NATIVE_CLIP_FRAMES', None)
            self.assertEqual(render_quality.frames_for_seconds(3), 97)
            self.assertEqual(render_quality.frames_for_seconds(5), 97)
        self.assertEqual(render_quality.frames_for_seconds(3, native=True), 73)
        self.assertEqual(render_quality.frames_for_seconds(4, native=True), 97)
        self.assertEqual(render_quality.frames_for_seconds(5, native=True), 121)
        self.assertEqual(render_quality.frames_for_seconds(6, native=True), 145)
        for sec in (1, 2, 3, 4, 5, 6):
            f = render_quality.frames_for_seconds(sec, native=True)
            self.assertEqual((f - 1) % 8, 0)
            self.assertGreaterEqual(f, sec * 24)

    def test_build_segment_filter_skips_minterpolate_for_native_8k_plus_1_clips(self):
        for source_frames, target_frames in ((73, 72), (97, 96), (121, 120), (48, 48)):
            vf = assemble.build_segment_filter(0, source_frames, target_frames, 720, 1280)
            self.assertNotIn('minterpolate', vf, (source_frames, target_frames))
            self.assertIn(f'trim=start_frame=0:end_frame={target_frames}', vf)

    def test_build_segment_filter_keeps_minterpolate_when_time_stretch_needed(self):
        vf_stretch = assemble.build_segment_filter(0, 97, 120, 720, 1280)
        self.assertIn('minterpolate', vf_stretch)
        vf_speedup = assemble.build_segment_filter(0, 97, 72, 720, 1280)
        self.assertIn('minterpolate', vf_speedup)

    def test_parallel_native_trim_assembly_produces_exact_frame_count(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            clips = []
            for idx, color in enumerate(('0x336699', '0x996633')):
                clip_path = base / f'clip-{idx}.mp4'
                # 49 frames = 2s native 8k+1 clip -> target 48 frames (2.0s) triggers native-trim fast path.
                subprocess.run([
                    'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                    '-f', 'lavfi', '-i', f'color=c={color}:s=384x640:r=24:d=2.042',
                    '-frames:v', '49', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(clip_path),
                ], check=True)
                clips.append({'file': str(clip_path), 'seconds': 2.0})
            manifest = base / 'manifest.json'
            manifest.write_text(json.dumps({'aspect': 'short', 'shots': clips}))
            out = base / 'assembled.mp4'
            res = subprocess.run([
                sys.executable, str(ROOT / 'scripts/assemble-motion-video.py'),
                '--manifest', str(manifest), '--output', str(out),
            ], capture_output=True, text=True, check=True)
            self.assertIn('native-trim', res.stdout)
            probed = assemble.probe(out)
            self.assertEqual(int(probed['nb_frames']), 96)
            self.assertEqual((int(probed['width']), int(probed['height'])), (720, 1280))


class SinglePassQaParityTests(unittest.TestCase):
    def test_single_pass_qa_matches_legacy_four_pass_measurements(self):
        with tempfile.TemporaryDirectory() as folder:
            mp4 = Path(folder) / 'sample.mp4'
            # 3s moving testsrc + 440Hz tone
            subprocess.run([
                'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=24:duration=3',
                '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
                '-af', 'volume=-15dB',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', str(mp4),
            ], check=True)
            single = qa_local.analyze_media_single_pass(mp4, 3.0, has_audio=True)
            # Legacy independent passes for parity check:
            legacy_black = first_checks.parse_black_seconds(
                qa_local.ffmpeg_log(['-i', str(mp4), '-vf', 'blackdetect=d=0.3:pix_th=0.10', '-an', '-f', 'null', '-'])
            )
            legacy_freeze = first_checks.longest_freeze(mp4)
            legacy_loud_raw = qa_local.ffmpeg_log(
                ['-i', str(mp4), '-af', qa_local.loudnorm_filter(print_json=True), '-vn', '-f', 'null', '-']
            )
            legacy_loud = json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}', legacy_loud_raw).group(0))
            legacy_silence = max(map(float, re.findall(
                r'silence_duration: ([\d.]+)',
                qa_local.ffmpeg_log(['-i', str(mp4), '-af', 'silencedetect=n=-45dB:d=1.0', '-vn', '-f', 'null', '-'])
            )), default=0.0)

            self.assertAlmostEqual(single['longestBlack'], legacy_black, places=3)
            self.assertAlmostEqual(single['longestFreeze'], legacy_freeze, places=3)
            self.assertIsNotNone(single['loudness'])
            self.assertAlmostEqual(single['loudness'][0], float(legacy_loud['input_i']), places=2)
            self.assertAlmostEqual(single['loudness'][1], float(legacy_loud['input_tp']), places=2)
            self.assertAlmostEqual(single['longestSilence'], legacy_silence, places=3)
            self.assertIsNone(first_checks.check_clip(mp4))


class WarmVisionAndStageBatchTests(unittest.TestCase):
    def test_vision_keep_alive_after_keeps_model_warm_when_requested(self):
        with tempfile.TemporaryDirectory() as folder:
            img = Path(folder) / 'shot.png'
            img.write_bytes(b'fake-image-bytes')
            reply = {'done_reason': 'stop', 'message': {'content': json.dumps({'answer': 'yes', 'reason': 'visible'})}}
            with patch.object(vision.urllib.request, 'urlopen',
                              return_value=io.BytesIO(json.dumps(reply).encode())) as call:
                vision.review(img, 'bread on counter', keep_alive_after='2m')
                sent = json.loads(call.call_args.args[0].data)
                self.assertEqual(sent['keep_alive'], '2m')

            img2 = Path(folder) / 'shot2.png'
            img2.write_bytes(b'fake-image-bytes-2')
            with patch.object(vision.urllib.request, 'urlopen',
                              return_value=io.BytesIO(json.dumps(reply).encode())) as call:
                vision.review(img2, 'bread on counter')
                sent = json.loads(call.call_args.args[0].data)
                self.assertEqual(sent['keep_alive'], 0)

    def test_should_batch_stills_before_motion_only_for_non_chained_full_renders(self):
        self.assertTrue(renderer.should_batch_stills_before_motion(False, False, None))
        self.assertFalse(renderer.should_batch_stills_before_motion(True, False, None))
        self.assertFalse(renderer.should_batch_stills_before_motion(False, True, None))
        self.assertFalse(renderer.should_batch_stills_before_motion(False, False, 2))


if __name__ == '__main__':
    unittest.main()
