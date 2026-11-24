import json
from pathlib import Path
import runpy
import tempfile
import unittest

MODULE = runpy.run_path(str(Path(__file__).with_name('report-motion-ratings.py')))
summarize = MODULE['summarize']
export = MODULE['export']
FIRST = 'a' * 64
SECOND = 'b' * 64


def rating(clip=FIRST, role='owner', value=4):
    return {'type': 'motion-take-review', 'user': 'reviewer', 'reviewerRole': role,
            'clipSha256': clip, 'ratings': dict.fromkeys(('identity', 'action', 'realism'), value)}


def gate(kind, *, clip=FIRST, flagged=True):
    return {'type': 'motion-clip-gate', 'schemaVersion': 1, 'gateVersion': 'fixture-v1',
            'gate': kind, 'clipSha256': clip, 'flagged': flagged}


class OwnerExportTests(unittest.TestCase):
    def test_owner_roles_and_latest_labels_are_preserved(self):
        unknown = rating(value=1)
        del unknown['reviewerRole']
        report, rows = summarize(map(json.dumps, [rating(value=2), rating(value=5), unknown,
                                                   rating(role='creator', value=1), rating(clip='invalid')]))
        self.assertEqual(report['excludedRatings'], 2)
        self.assertEqual(report['ratedClips'], 1)
        self.assertEqual(rows[0]['labels']['identity'], 5)

    def test_only_exact_hashes_join_and_technical_flags_do_not_claim_agreement(self):
        report, rows = summarize(map(json.dumps, [rating(value=2), rating(clip=SECOND, value=5),
                                                   gate('technical-screen'), gate('identity-drift'),
                                                   gate('frozen-motion', clip='c' * 64)]))
        self.assertEqual(report['gates']['technical-screen'], {'pairs': 1, 'missing': 1,
                         'comparison': 'Co-occurrence only', 'flaggedAndLowRealism': 1})
        self.assertEqual(report['gates']['identity-drift']['agree'], 1)
        self.assertEqual(report['gates']['frozen-motion']['pairs'], 0)
        self.assertEqual(rows[1]['gates'], {})

    def test_reproducible_export_retains_existing_manual_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'golden.jsonl'
            manual = '{"kind":"pair","labeler":"owner","winner":"original"}\n'
            path.write_text(manual)
            _, rows = summarize([json.dumps(rating())])
            export(path, rows)
            first = path.read_bytes()
            export(path, rows)
            self.assertEqual(path.read_bytes(), first)
            self.assertEqual(path.read_text().splitlines()[0] + '\n', manual)
            self.assertEqual(json.loads(path.read_text().splitlines()[1])['sha256'], FIRST)


if __name__ == '__main__':
    unittest.main()
