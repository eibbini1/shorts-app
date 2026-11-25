import importlib.util, pathlib, unittest
import subprocess
import tempfile
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('finish', pathlib.Path(__file__).with_name('finish-local-video.py'))
finish = importlib.util.module_from_spec(spec); spec.loader.exec_module(finish)


class PhraseChunks(unittest.TestCase):
    def chunks(self, text):
        return [' '.join(c) for c in finish.phrase_chunks(text.split())]

    def test_breaks_on_commas(self):
        self.assertEqual(self.chunks('Truffle cream, a silky spread, goes into the bun.'),
                         ['Truffle cream,', 'a silky spread,', 'goes into the bun.'])

    def test_never_ends_on_article_or_preposition(self):
        for text in ('The copper pan sears the sausage until golden.', 'A tiny spoon of caviar.', 'Carefully, the sausage rests in the bun.'):
            for chunk in self.chunks(text)[:-1]:
                self.assertNotIn(chunk.split()[-1].lower(), finish.DANGLERS, chunk)

    def test_all_words_kept_in_order(self):
        text = 'One hot dog. Could this belong in fine dining?'
        self.assertEqual(' '.join(self.chunks(text)), text)

    def test_cap_never_strands_an_article(self):
        for chunk in self.chunks('Wagyu sizzles in a copper pan until the edges turn golden.')[:-1]:
            self.assertNotIn(chunk.split()[-1].lower(), finish.DANGLERS, chunk)

    def test_max_four_words(self):
        for chunk in self.chunks('Every single golden crisp edge glistens under warm light today'):
            self.assertLessEqual(len(chunk.split()), 5)


class OpeningHook(unittest.TestCase):
    def test_literal_punctuation_and_timing_in_rendered_frames(self):
        text = r'''“Chef's”: 50% \N'''
        hook = finish.opening_hook({'settings': {'seconds': 30}, 'hookOverlay': {'text': text}})
        self.assertEqual(hook, (0, 1.5, text))
        with tempfile.TemporaryDirectory() as folder:
            ass = pathlib.Path(folder) / 'hook.ass'
            ass.write_text(finish.brand_ass([], hook))
            self.assertIn(text.replace('\\', '\\\u2060'), ass.read_text())
            frame = subprocess.check_output([
                'ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
                'color=black:s=360x640:r=2:d=2', '-vf', f'ass={ass}',
                '-threads', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', '-',
            ])
            size = 360 * 640
            frames = [frame[i:i+size] for i in range(0, len(frame), size)]
            self.assertEqual(len(frames), 4)
            # The literal slash-N must stay on one line at phone preview size.
            lit_rows = [y for y in range(640) if max(frames[0][y*360:(y+1)*360]) > 32]
            self.assertTrue(lit_rows)
            self.assertLess(max(lit_rows) - min(lit_rows), 38)
            self.assertEqual(frames[0], frames[2])
            self.assertLess(max(frames[3]), 10)

    def test_literal_braces_in_hook_and_spoken_caption(self):
        text = r'{\b1}'
        escaped = finish.ass_literal(text)
        self.assertTrue(escaped.startswith(r'\{'))
        self.assertTrue(escaped.endswith(r'\}'))
        ass = finish.brand_ass([(0, 1, text)], (0, 1.5, text))
        self.assertEqual(ass.count(escaped), 2)


class CaptionTiming(unittest.TestCase):
    """voice-N.wav is the take as recorded; the timeline plays it at `tempo`, so captions follow the played length."""

    def span(self, tempo=None):
        line = {'atSeconds': 1.0, 'text': 'One two three four five six'}
        if tempo is not None:
            line['tempo'] = tempo
        # The recorded take: 0.5 s of silence, then 2.0 s of speech.
        with patch.object(finish, 'speech_span', return_value=(0.5, 2.0)):
            cues = finish.captions([line], 10.0, pathlib.Path('work'))
        self.assertEqual(' '.join(text for _, _, text in cues), line['text'])
        return cues[0][0], cues[-1][1]

    def test_normal_speed_is_unchanged(self):
        for tempo in (None, 1):
            start, end = self.span(tempo)
            self.assertAlmostEqual(start, 1.5)
            self.assertAlmostEqual(end, 3.5)

    def test_sped_up_line_starts_and_ends_sooner(self):
        start, end = self.span(1.25)
        self.assertAlmostEqual(start, 1.4)   # 0.5 s of silence plays in 0.4 s
        self.assertAlmostEqual(end, 3.0)     # 2.0 s of speech plays in 1.6 s

    def test_slowed_line_runs_longer(self):
        start, end = self.span(0.8)
        self.assertAlmostEqual(start, 1.625)
        self.assertAlmostEqual(end, 4.125)

    def test_captions_never_run_past_the_next_line(self):
        lines = [{'atSeconds': 0.0, 'text': 'One two three', 'tempo': 0.8}, {'atSeconds': 2.0, 'text': 'Four five six'}]
        with patch.object(finish, 'speech_span', return_value=(0.5, 2.0)):
            cues = finish.captions(lines, 6.0, pathlib.Path('work'))
        first_line = [cue for cue in cues if cue[2] in 'One two three']
        self.assertLessEqual(max(end for _, end, _ in first_line), 2.0)


if __name__ == '__main__':
    unittest.main()
