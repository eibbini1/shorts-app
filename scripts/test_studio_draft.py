import contextlib
import io
import runpy
import sys
import unittest
from unittest.mock import patch

STUDIO_DRAFT = runpy.run_path('scripts/studio-draft.py')


class FakeProcess:
    stdout = iter([
        'usage: director-brief.py [options]\n',
        'director-brief.py: error: topic is 601 characters; maximum is 600\n',
    ])

    def wait(self):
        return 2


class StudioDraftTests(unittest.TestCase):
    def test_input_validation_error_stops_without_retrying(self):
        fake = FakeProcess()
        output = io.StringIO()
        with patch.object(sys, 'argv', ['studio-draft.py', '--answers', 'answers.json']), \
             patch.object(STUDIO_DRAFT['subprocess'], 'Popen', return_value=fake) as popen, \
             contextlib.redirect_stdout(output):
            result = STUDIO_DRAFT['main']()
        self.assertEqual(result, 2)
        self.assertEqual(popen.call_count, 1)
        self.assertIn('BLOCKED: director brief input:', output.getvalue())
        self.assertIn('No media render was started.', output.getvalue())


if __name__ == '__main__':
    unittest.main()
