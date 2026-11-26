import json
import subprocess
import tempfile
import unittest
import wave
import struct
import math
from pathlib import Path

import sfx_library as lib


def write_tone(path, seconds=1.0, start=0.3, rate=16000):
    with wave.open(str(path), 'wb') as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        frames = bytearray()
        for i in range(int(seconds * rate)):
            t = i / rate
            value = 12000 * math.sin(2 * math.pi * 440 * t) if t >= start else 0
            frames += struct.pack('<h', int(value))
        handle.writeframes(bytes(frames))


class SfxLibraryTest(unittest.TestCase):
    def entry(self, name, category='crunch', **extra):
        base = dict(id=name, file=f'{name}.wav', category=category, license='CC0-1.0',
                    sourceUrl='https://example.org', recordedAction='test')
        base.update(extra)
        return base

    def test_measure_finds_first_hit_and_length(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'tone.wav'
            write_tone(path)
            facts = lib.measure(path)
        self.assertAlmostEqual(facts['durationSeconds'], 1.0, places=1)
        self.assertAlmostEqual(facts['firstHitSeconds'], 0.3, delta=0.05)
        self.assertLess(facts['peakDb'], 0)

    def test_validate_flags_bad_licence_missing_file_and_changed_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_tone(root / 'ok.wav')
            data = {'entries': [
                self.entry('ok', sha256=lib.sha256(root / 'ok.wav')),
                self.entry('nc', license='CC-BY-NC-4.0'),
                self.entry('gone'),
                self.entry('changed', sha256='0' * 64),
            ]}
            write_tone(root / 'nc.wav')
            write_tone(root / 'changed.wav')
            found = lib.problems(data, root)
        text = '\n'.join(found)
        self.assertIn('nc: licence', text)
        self.assertIn('gone: file missing', text)
        self.assertIn('changed: file changed', text)
        self.assertNotIn('ok:', text)

    def test_validate_flags_missing_fields_and_duplicates(self):
        data = {'entries': [self.entry('a'), self.entry('a', recordedAction='')]}
        found = lib.problems(data, Path('/nonexistent'))
        self.assertTrue(any('duplicate id' in line for line in found))
        self.assertTrue(any('missing recordedAction' in line for line in found))

    def test_pick_is_repeatable_and_avoids_recent(self):
        data = {'entries': [self.entry('a'), self.entry('b'), self.entry('c')]}
        first = lib.pick(data, 'crunch', seed=3)
        self.assertEqual(first, lib.pick(data, 'crunch', seed=3))
        for seed in range(20):
            self.assertNotEqual(lib.pick(data, 'crunch', seed=seed, avoid=['a', 'b'])['id'], 'a')
            self.assertEqual(lib.pick(data, 'crunch', seed=seed, avoid=['a', 'b'])['id'], 'c')

    def test_pick_reuses_when_only_one_variant(self):
        data = {'entries': [self.entry('only')]}
        self.assertEqual(lib.pick(data, 'crunch', avoid=['only'])['id'], 'only')
        with self.assertRaises(LookupError):
            lib.pick(data, 'sizzle')

    def test_foley_samples_use_different_files_per_cue(self):
        data = {'entries': [self.entry('a'), self.entry('b')]}
        samples = lib.foley_samples(data, {'one': 'crunch', 'two': 'crunch'}, seed=1)
        self.assertEqual({samples['one']['file'], samples['two']['file']}, {'a.wav', 'b.wav'})
        self.assertEqual(set(samples['one']), {'file', 'recordedAction', 'sourceUrl', 'license', 'offsetSeconds'})

    def test_shipped_manifest_has_no_licence_or_field_problems(self):
        data = lib.load()
        found = [line for line in lib.problems(data) if 'file missing' not in line and 'file changed' not in line]
        self.assertEqual(found, [])

    def test_validate_blocks_file_paths_escaping_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'repo'
            root.mkdir()
            data = {'entries': [self.entry('escape', file='../outside.wav')]}
            found = lib.problems(data, root)
        self.assertTrue(any('file path escapes root' in line for line in found))

    def test_resolve_library_samples_verifies_license_hash_and_keeps_explicit_overrides(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            good_crunch = root / 'crunch-ok.wav'
            bad_hash = root / 'crunch-bad.wav'
            bad_lic = root / 'pour-nc.wav'
            good_room = root / 'room.wav'
            for path in (good_crunch, bad_hash, bad_lic, good_room):
                write_tone(path)
            manifest = {'entries': [
                self.entry('crunch-ok', file='crunch-ok.wav', category='crunch', sha256=lib.sha256(good_crunch)),
                self.entry('crunch-bad', file='crunch-bad.wav', category='crunch', sha256='0' * 64),
                self.entry('pour-nc', file='pour-nc.wav', category='pour', license='CC-BY-NC-4.0', sha256=lib.sha256(bad_lic)),
                self.entry('room-01', file='room.wav', category='ambience', sha256=lib.sha256(good_room)),
                self.entry('escape-01', file='../outside.wav', category='sizzle'),
            ]}
            explicit = {'sizzle': {'file': 'custom-sizzle.wav', 'recordedAction': 'pan', 'sourceUrl': 'https://x', 'license': 'CC0-1.0'}}
            resolved = lib.resolve_library_samples(['crunch', 'pour', 'room', 'sizzle'], data=manifest, root=root, existing=explicit)
            self.assertEqual(resolved['sizzle'], explicit['sizzle'])
            self.assertEqual(resolved['crunch']['file'], 'crunch-ok.wav')
            self.assertEqual(resolved['crunch']['libraryId'], 'crunch-ok')
            self.assertEqual(resolved['room']['file'], 'room.wav')
            self.assertNotIn('pour', resolved)

    def test_add_sfx_effective_foley_samples_uses_library_when_opted_in(self):
        import runpy, sys, types
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wav = root / 'assets/foley/crunch.wav'
            wav.parent.mkdir(parents=True)
            write_tone(wav)
            manifest = {'entries': [
                self.entry('crunch-01', file='assets/foley/crunch.wav', category='crunch', sha256=lib.sha256(wav)),
            ]}
            prev_np = sys.modules.get('numpy')
            if prev_np is None:
                sys.modules['numpy'] = types.ModuleType('numpy')
            try:
                add_sfx = runpy.run_path(str(lib.ROOT / 'scripts/add-sfx.py'))
            finally:
                if prev_np is None:
                    sys.modules.pop('numpy', None)
            scenario = {
                'settings': {'presentationMode': 'voiced'},
                'audioPlan': {'sfxLibrary': True},
                'plan': {'shots': [{'seconds': 4, 'imagePrompt': 'Golden bread crust', 'motionPrompt': 'Knife cuts crisp bread', 'sound': 'crisp crunch'}]},
            }
            resolved = add_sfx['effective_foley_samples'](scenario, root=root, manifest_data=manifest)
            self.assertEqual(resolved['crunch']['file'], 'assets/foley/crunch.wav')


if __name__ == '__main__':
    unittest.main()
