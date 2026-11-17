import json
import tempfile
import unittest
from pathlib import Path
from studio_frames import read_manifest, write_manifest


class StudioFramesTests(unittest.TestCase):
    def test_exact_frames_survive_newer_unselected_files(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            scenario = work / 'story.json'
            scenario.write_text('{}')
            frame = work / 'frame.png'
            frame.write_bytes(b'approved')
            write_manifest(work, scenario, [frame.resolve()])
            (work / 'newer.png').write_bytes(b'other take')
            self.assertEqual(read_manifest(work, scenario, 1), [frame.resolve()])
            frame.write_bytes(b'changed')
            with self.assertRaises(ValueError):
                read_manifest(work, scenario, 1)

    def test_changed_story_and_escape_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            scenario = work / 'story.json'
            scenario.write_text('{}')
            frame = work / 'frame.png'
            frame.write_bytes(b'approved')
            write_manifest(work, scenario, [frame])
            scenario.write_text('{"edited":true}')
            with self.assertRaises(ValueError):
                read_manifest(work, scenario, 1)
            write_manifest(work, scenario, [frame])
            manifest = work / 'first-frames.json'
            data = json.loads(manifest.read_text())
            data['frames'][0]['file'] = '../outside.png'
            manifest.write_text(json.dumps(data))
            with self.assertRaises(ValueError):
                read_manifest(work, scenario, 1)
