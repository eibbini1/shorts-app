import runpy
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
SCORE = runpy.run_path(str(Path(__file__).with_name('score-local-video.py')))


class ReleaseEvidenceTests(unittest.TestCase):
    def test_qa_must_match_exact_video_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            video = Path(folder) / 'film.mp4'
            video.write_bytes(b'first edit')
            qa = {'passed': True, 'videoSha256': SCORE['file_sha256'](video)}
            self.assertTrue(SCORE['qa_matches_file'](qa, video))
            video.write_bytes(b'new final edit')
            self.assertFalse(SCORE['qa_matches_file'](qa, video))

    def test_structure_failure_blocks_even_a_100_point_score(self):
        kwargs = {'release_problems': [], 'qa_current': True, 'structure_ok': False,
                  'editorial': {key: 5 for key in SCORE['CATEGORIES']}, 'review_problems': [],
                  'score': 100, 'minimum': 90, 'critical': [],
                  'technical': {key: True for key in SCORE['TECHNICAL']}}
        self.assertEqual(SCORE['release_status'](**kwargs), 'blocked')
        kwargs['structure_ok'] = True
        kwargs['qa_current'] = False
        self.assertEqual(SCORE['release_status'](**kwargs), 'blocked')
        kwargs['qa_current'] = True
        kwargs['review_problems'] = ['listenedFullAudio']
        self.assertEqual(SCORE['release_status'](**kwargs), 'review-needed')
        kwargs['review_problems'] = []
        self.assertEqual(SCORE['release_status'](**kwargs), 'pass')

    def test_review_record_needs_file_binding_and_full_audio_check(self):
        evidence = {'reviewer': 'Owner', 'videoSha256': 'abc', 'watchedFullVideo': True,
                    'listenedFullAudio': True, 'checkedOpeningHook': True,
                    'checkedFoodContinuity': True, 'checkedShotTransitions': True,
                    'checkedSoundCueSync': True}
        self.assertEqual(SCORE['review_evidence_problems'](evidence, 'abc'), [])
        evidence['listenedFullAudio'] = False
        self.assertIn('listenedFullAudio', SCORE['review_evidence_problems'](evidence, 'abc'))
        self.assertIn('videoSha256 does not match the exact final file',
                      SCORE['review_evidence_problems'](evidence, 'different'))


if __name__ == '__main__':
    unittest.main()
