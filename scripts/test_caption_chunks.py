import importlib.util, pathlib, unittest
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


if __name__ == '__main__':
    unittest.main()
