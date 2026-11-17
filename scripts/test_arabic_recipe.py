import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from arabic_recipe import check
from arabic_reel_captions import build


ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / 'examples/recipes/avocado-egg-salad-ar-60.json').read_text())


class ArabicRecipeTest(unittest.TestCase):
    def test_story_covers_sixty_seconds_and_missing_assets_block_render(self):
        errors, _ = check(SPEC)
        self.assertEqual([scene['endSeconds'] - scene['startSeconds'] for scene in SPEC['scenes']],
                         [6, 12, 12, 12, 11, 7])
        self.assertTrue(any('missing media' in error for error in errors))
        self.assertTrue(any('Caption timing is not verified' in error for error in errors))
        self.assertFalse(any('voice' in error.lower() for error in errors))

    def test_verified_manifest_with_matching_assets_is_ready(self):
        spec = copy.deepcopy(SPEC)
        spec['captionTimingStatus'] = 'verified-against-picture'
        spec['soundBed']['licenseStatus'] = 'verified-commercial-use'
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            for scene in spec['scenes']:
                for field in ('media',):
                    path = base / scene[field]
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.touch()
            (base / spec['soundBed']['file']).touch()

            def media_probe(path):
                if path.name.startswith('scene-'):
                    number = int(path.stem.split('-')[1]) - 1
                    scene = spec['scenes'][number]
                    return {'streams': [{'codec_type': 'video', 'width': 1080, 'height': 1920,
                                         'r_frame_rate': '30/1'}],
                            'format': {'duration': str(scene['endSeconds'] - scene['startSeconds'])}}
                return {'streams': [{'codec_type': 'audio'}], 'format': {'duration': '60'}}

            with patch('arabic_recipe.probe', side_effect=media_probe):
                self.assertEqual(check(spec, base), ([], []))

    def test_captions_reject_overlap_and_unverified_timing(self):
        with self.assertRaisesRegex(ValueError, 'not verified'):
            build(SPEC, require_verified=True)
        spec = copy.deepcopy(SPEC)
        spec['captionCues'][1]['startSeconds'] = 2.0
        with self.assertRaisesRegex(ValueError, 'overlap'):
            build(spec)


if __name__ == '__main__':
    unittest.main()
