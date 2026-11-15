import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from local_video_progress import snapshot


class ProgressRunTests(unittest.TestCase):
    def test_current_run_counts_only_validated_clips_not_old_cache_files(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            scenario = work / 'story.json'
            scenario.write_text(json.dumps({'plan': {'shots': [{'seconds': 4}, {'seconds': 4}]}}))
            (work / 'motion').mkdir()
            (work / 'motion' / 'shot-00-part-00-old.mp4').write_bytes(b'old clip')
            (work / 'motion' / 'shot-01-part-00-old.mp4').write_bytes(b'old clip')
            (work / 'progress-run.json').write_text(json.dumps({
                'scenarioSha256': hashlib.sha256(scenario.read_bytes()).hexdigest(),
                'output': str(work / 'new.mp4'), 'completed': [[0, 0]]}))
            line = snapshot(scenario, work, work / 'new.mp4')
            self.assertIn('1/2 motion clips', line)
            self.assertNotIn('95%', line)


if __name__ == '__main__':
    unittest.main()
