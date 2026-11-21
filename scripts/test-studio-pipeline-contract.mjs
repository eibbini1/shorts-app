// Characterization tests for the Studio <-> pipeline text contract (phase 1, 2026-11-21).
// The "legacy" functions below are verbatim copies of the parsing that lived inline in
// studio/src/App.jsx and extras.jsx before it moved to studio/src/pipeline-lines.js.
// Real transcripts come from owner Studio sessions (lines only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as P from '../studio/src/pipeline-lines.js';
import { classifyGateLine, blockerReasons } from './studio-learning-signals.mjs';
import * as ServerEvents from './pipeline-events.mjs';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const transcripts = JSON.parse(fs.readFileSync(here('./fixtures/studio-pipeline-transcripts.json'), 'utf8'));
const snapshotFile = here('./fixtures/studio-pipeline-classification.snapshot.json');

const legacy = {
  notes: (lines) => lines.filter((l) => /^(BLOCKED|REVIEW|WARNING|Fixed automatically)/.test(l)).map((l) => (/^BLOCKED:.*provisional score/.test(l) ? 'REVIEW: waiting for your rating (thumbs up or down below)' : l)),
  choice: (lines) => ((lines || []).find((l) => l.startsWith('NEEDS-CHOICE: ')) || '').slice(14),
  reasons: (lines) => [...new Set(lines.filter((l) => l.startsWith('BLOCKED: ')).map((l) => l.slice(9)))],
  tries: (lines) => lines.filter((l) => /^Attempt \d+\/\d+/.test(l)).length,
  fixes: (n, notes) => notes.filter((l) => /^BLOCKED/.test(l) && new RegExp('shots?\\s*' + n + '\\b', 'i').test(l)).map((l) => l.replace(/^BLOCKED:\s*/, '')),
  progress(lines) { let best = null; for (const l of lines) { const m = l.match(/(?:beat|clip|shot|still)s?\s+(\d+)\s*\/\s*(\d+)/i) || l.match(/(\d+)\s*\/\s*(\d+)\b/); if (m && +m[2] > 0 && +m[1] <= +m[2]) best = { n: +m[1], of: +m[2], label: l.slice(0, 70) }; } return best; },
  nowLine(lines) {
    const p = [...(lines || [])].reverse().find((l) => String(l).includes('[progress]'));
    if (!p) return 'Getting ready...';
    const m = String(p).split('[progress]')[1] || ''; const parts = m.split('|').map((x) => x.trim());
    const clips = parts.find((x) => /motion clips/.test(x)) || ''; const what = parts.find((x) => /rendering|still|FLUX|voice|sound|finish/i.test(x)) || parts[3] || '';
    const left = parts.find((x) => /remaining/.test(x)) || '';
    return [what, clips && 'done: ' + clips.replace(' motion clips', ' clips'), left].filter(Boolean).join(' · ');
  },
};

test('fixture covers blocked, choice, progress, repair and verified-export transcripts', () => {
  const all = transcripts.flatMap((t) => t.lines);
  for (const marker of ['BLOCKED: ', 'NEEDS-CHOICE: ', '[progress]', 'Fixed automatically', 'Attempt ', 'Studio verified export: ']) {
    assert.ok(all.some((l) => l.includes(marker)), `fixture is missing ${marker}`);
  }
});

for (const t of transcripts) {
  test(`extracted Studio parsing equals legacy parsing: ${t.name}`, () => {
    const notes = P.notesOf(t.lines);
    assert.deepEqual(notes, legacy.notes(t.lines));
    assert.equal(P.isBlocked(notes), legacy.notes(t.lines).some((l) => l.startsWith('BLOCKED')));
    assert.equal(P.choiceOf(t.lines), legacy.choice(t.lines));
    assert.equal(P.attemptCount(t.lines), legacy.tries(t.lines));
    assert.deepEqual(P.progressOf(t.lines), legacy.progress(t.lines));
    assert.equal(P.nowLine(t.lines), legacy.nowLine(t.lines));
    assert.deepEqual(P.blockReasons(t.lines, []), legacy.reasons(t.lines));
    for (let n = 1; n <= 12; n += 1) assert.deepEqual(P.shotFixes(n, notes, []), [...new Set(legacy.fixes(n, notes))]);
  });
}

test('learning classification of every transcript line matches the recorded snapshot', () => {
  const now = transcripts.map((t) => ({ name: t.name, signals: t.lines.map(classifyGateLine).filter(Boolean), blockers: blockerReasons(t.lines) }));
  if (!fs.existsSync(snapshotFile) || process.env.UPDATE_SNAPSHOT === '1') fs.writeFileSync(snapshotFile, JSON.stringify(now, null, 1));
  assert.deepEqual(now, JSON.parse(fs.readFileSync(snapshotFile, 'utf8')));
});

test('event lines are parsed strictly and never treated as notes', () => {
  const line = P.EVENT_PREFIX + JSON.stringify({ type: 'gate', gate: 'sound', status: 'blocked', code: 'asmr-gap', shot: 2, message: 'gap' });
  assert.deepEqual(P.parseEventLine(line), { type: 'gate', gate: 'sound', status: 'blocked', code: 'asmr-gap', shot: 2, message: 'gap' });
  assert.equal(P.parseEventLine('@@event {not json'), null);
  assert.equal(P.parseEventLine('@@event {"no":"type"}'), null);
  assert.equal(P.parseEventLine('BLOCKED: x'), null);
  assert.deepEqual(P.notesOf([line]), []);
  assert.equal(classifyGateLine(line), null);
});

test('events win over text for reasons and per-shot fixes, text still works without events', () => {
  const lines = ['BLOCKED: ASMR sound plan has a gap of at least 1.5 s before rendering'];
  const events = [{ type: 'gate', gate: 'sound', status: 'blocked', code: 'asmr-gap', shot: 2, message: 'Shot 2 goes quiet for 1.6 s' }];
  assert.deepEqual(P.blockReasons(lines, events), ['Shot 2 goes quiet for 1.6 s']);
  assert.deepEqual(P.blockReasons(lines, []), ['ASMR sound plan has a gap of at least 1.5 s before rendering']);
  assert.deepEqual(P.shotFixes(2, P.notesOf(lines), events), ['Shot 2 goes quiet for 1.6 s']);
  assert.deepEqual(P.shotFixes(1, P.notesOf(lines), events), []);
});

test('server and browser event parsers agree', () => {
  assert.equal(ServerEvents.EVENT_PREFIX, P.EVENT_PREFIX);
  const samples = ['@@event {"type":"gate","gate":"story","status":"blocked","code":"story-check","shot":1}', '@@event {"x":1}', '@@event nope', 'plain', '', '@@event {"type":5}', '@@event null'];
  for (const s of samples) assert.deepEqual(ServerEvents.parseEventLine(s), P.parseEventLine(s), s);
});

test('Python emitter output is readable by both parsers', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('python3', ['-c', "import sys; sys.path.insert(0, 'scripts'); import pipeline_events as e; e.gate('sound', 'blocked', 'asmr-gap', 'shot 2: ASMR sound line is empty')"], { encoding: 'utf8' }).trim();
  const event = P.parseEventLine(out);
  assert.deepEqual(event, { type: 'gate', gate: 'sound', status: 'blocked', code: 'asmr-gap', message: 'shot 2: ASMR sound line is empty', shot: 2 });
  assert.deepEqual(ServerEvents.parseEventLine(out), event);
});
