import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from studio_frames import read_manifest, read_manifest_details, write_manifest


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

    def test_human_review_metadata_survives_exact_frame_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            scenario = work / 'story.json'
            scenario.write_text('{}')
            frame = work / 'frame.png'
            frame.write_bytes(b'human-approved')
            write_manifest(work, scenario, [frame])
            manifest = work / 'first-frames.json'
            data = json.loads(manifest.read_text())
            self.assertEqual(data['sharedIdentityReference'], data['frames'][0])
            data.update({'reviewMethod': 'human', 'reviewedBy': 'creator'})
            manifest.write_text(json.dumps(data))
            references, details = read_manifest_details(work, scenario, 1)
            self.assertEqual(references, [frame.resolve()])
            self.assertEqual(details['reviewMethod'], 'human')
            self.assertEqual(details['sharedIdentityReference'], details['frames'][0])
            data['sharedIdentityReference']['sha256'] = 'changed'
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'shared identity reference'):
                read_manifest_details(work, scenario, 1)
            write_manifest(work, scenario, [frame])
            manifest = work / 'first-frames.json'
            data = json.loads(manifest.read_text())
            data['frames'][0]['file'] = '../outside.png'
            manifest.write_text(json.dumps(data))
            with self.assertRaises(ValueError):
                read_manifest(work, scenario, 1)

    def test_reference_change_invalidates_reviewed_frames(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            scenario = work / 'story.json'
            scenario.write_text('{}')
            reference = work / 'references' / ('shot-01-' + 'a' * 16 + '.png')
            reference.parent.mkdir()
            reference.write_bytes(b'reference image')
            (work / 'references.json').write_text(json.dumps({
                'schemaVersion': 1,
                'scenarioSha256': hashlib.sha256(scenario.read_bytes()).hexdigest(),
                'references': [{'shot': 1, 'file': 'references/' + reference.name,
                                'sha256': hashlib.sha256(reference.read_bytes()).hexdigest()}],
            }))
            frame = work / 'frame.png'
            frame.write_bytes(b'approved')
            write_manifest(work, scenario, [frame])
            self.assertEqual(read_manifest(work, scenario, 1), [frame.resolve()])
            (work / 'references.json').write_text((work / 'references.json').read_text() + ' ')
            with self.assertRaisesRegex(ValueError, 'reference images changed'):
                read_manifest(work, scenario, 1)

    def test_per_frame_review_fields_do_not_break_identity_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            scenario = work / 'story.json'
            scenario.write_text('{}')
            frame = work / 'frame.png'
            frame.write_bytes(b'approved')
            write_manifest(work, scenario, [frame])
            manifest = work / 'first-frames.json'
            data = json.loads(manifest.read_text())
            data['frames'][0].update({'scenarioSha256': 'x', 'reviewedAt': '2026-11-22T13:56:58Z', 'reviewedBy': 'owner'})
            manifest.write_text(json.dumps(data))
            references, _ = read_manifest_details(work, scenario, 1)
            self.assertEqual(references, [frame.resolve()])
            data['sharedIdentityReference']['file'] = 'other.png'
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'shared identity reference'):
                read_manifest_details(work, scenario, 1)
