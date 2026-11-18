import hashlib
import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('export_provenance', Path(__file__).with_name('export-provenance.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg tools required')
class ExportProvenanceTests(unittest.TestCase):
    def test_measures_source_and_upscaled_export_and_binds_output(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            source = work / 'source.mp4'
            video = work / 'export.mp4'
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i',
                            'color=size=96x160:rate=24:duration=0.25',
                            '-c:v', 'libx264', str(source)], check=True)
            subprocess.run(['ffmpeg', '-v', 'error', '-i', str(source),
                            '-vf', 'scale=192:320', '-c:v', 'libx264', str(video)], check=True)
            manifest = work / 'manifest.json'
            manifest.write_text(json.dumps({'shots': [{'file': source.name}]}))
            report = module.record(manifest, video)
            self.assertEqual(report['delivery'], {'width': 192, 'height': 320})
            self.assertEqual(report['nativeSources'][0]['width'], 96)
            self.assertEqual(report['nativeSources'][0]['height'], 160)
            self.assertEqual(report['outputSha256'], hashlib.sha256(video.read_bytes()).hexdigest())
            self.assertEqual(json.loads(video.with_suffix('.provenance.json').read_text()), report)
