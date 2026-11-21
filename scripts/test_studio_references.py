import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from studio_references import load_reference_manifest


class StudioReferenceTests(unittest.TestCase):
    def test_loads_only_scenario_bound_checksummed_shot_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            work = root / 'work'
            references = work / 'references'
            references.mkdir(parents=True)
            scenario = root / 'story.json'
            scenario.write_text('{}')
            image = references / ('shot-01-' + 'a' * 16 + '.png')
            image.write_bytes(b'local reference')
            manifest = {
                'schemaVersion': 1,
                'scenarioSha256': hashlib.sha256(scenario.read_bytes()).hexdigest(),
                'references': [{
                    'shot': 1,
                    'file': 'references/' + image.name,
                    'sha256': hashlib.sha256(image.read_bytes()).hexdigest(),
                }],
            }
            (work / 'references.json').write_text(json.dumps(manifest))
            self.assertEqual(load_reference_manifest(work, scenario, 1), {1: image.resolve()})
            image.write_bytes(b'tampered')
            with self.assertRaisesRegex(ValueError, 'changed'):
                load_reference_manifest(work, scenario, 1)

    def test_rejects_references_from_an_edited_story(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            work = root / 'work'
            work.mkdir()
            scenario = root / 'story.json'
            scenario.write_text('{}')
            (work / 'references.json').write_text(json.dumps({
                'schemaVersion': 1,
                'scenarioSha256': hashlib.sha256(scenario.read_bytes()).hexdigest(),
                'references': [],
            }))
            scenario.write_text('{"edited":true}')
            with self.assertRaisesRegex(ValueError, 'older version'):
                load_reference_manifest(work, scenario, 1)

    def test_rejects_reference_paths_outside_the_project_folder(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            work = root / 'work'
            work.mkdir()
            scenario = root / 'story.json'
            scenario.write_text('{}')
            (work / 'references.json').write_text(json.dumps({
                'schemaVersion': 1,
                'scenarioSha256': hashlib.sha256(scenario.read_bytes()).hexdigest(),
                'references': [{'shot': 1, 'file': '../outside.png', 'sha256': '0' * 64}],
            }))
            with self.assertRaisesRegex(ValueError, 'invalid path'):
                load_reference_manifest(work, scenario, 1)


if __name__ == '__main__':
    unittest.main()
