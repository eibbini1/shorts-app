import test from 'node:test';
import assert from 'node:assert/strict';
import {
  watchdogLimits, checkStall, stallMessage, classifyExit, isLocalCommand,
  retryDecision, keepAwakeCommand, parsePsProcessIdentity, parsePsProcessIdentities,
  isOrphanScenarioMember, mayReapOrphan, MAX_AUTO_RETRIES,
} from './studio-watchdog.mjs';

const limits = { idleMs: 60_000, hardMs: 600_000 };

test('WD-1 idle job is stopped, hard cap is stopped', () => {
  assert.equal(checkStall({ startedAt: 0, lastActivityAt: 0, now: 60_000, limits }).reason, 'idle');
  assert.equal(checkStall({ startedAt: 0, lastActivityAt: 590_000, now: 600_000, limits }).reason, 'hard');
});

test('WD-2 a slow job that keeps printing is not stopped', () => {
  assert.equal(checkStall({ startedAt: 0, lastActivityAt: 119_000, now: 120_000, limits }), null);
  assert.equal(checkStall({ startedAt: 0, lastActivityAt: 540_000, now: 550_000, limits }), null);
});

test('WD-1 limits default generously and accept env overrides', () => {
  assert.deepEqual(watchdogLimits(30, {}), { idleMs: 30 * 60_000, hardMs: 4 * 3_600_000 });
  assert.equal(watchdogLimits(120, {}).hardMs, 120 * 8 * 60_000);
  assert.deepEqual(watchdogLimits(30, { STUDIO_RENDER_IDLE_TIMEOUT_MS: '5000', STUDIO_RENDER_TIMEOUT_MS: '9000' }), { idleMs: 5000, hardMs: 9000 });
  assert.equal(watchdogLimits(30, { STUDIO_RENDER_IDLE_TIMEOUT_MS: 'abc' }).idleMs, 30 * 60_000);
  assert.match(stallMessage({ reason: 'idle', minutes: 30 }), /no output for 30 minutes/);
});

test('classifyExit separates infrastructure faults from rejected work', () => {
  assert.equal(classifyExit({ code: 0 }), 'ok');
  assert.equal(classifyExit({ code: null, signal: 'SIGKILL' }), 'crash');
  assert.equal(classifyExit({ code: 137 }), 'crash');
  assert.equal(classifyExit({ code: 1, tail: ['RuntimeError: out of memory'] }), 'oom');
  assert.equal(classifyExit({ code: 1, tail: ['Technical QA failed: duration'] }), 'failed');
  assert.equal(classifyExit({ code: 2, tail: ['BLOCKED: prompt gate'] }), 'failed');
  assert.equal(classifyExit({ code: null, signal: 'SIGTERM', stalled: true }), 'stalled');
  assert.equal(classifyExit({ code: null, signal: 'SIGTERM', stoppedByUser: true }), 'cancelled');
});

test('WD-3 at most one automatic retry, only for stall, oom or crash', () => {
  assert.equal(MAX_AUTO_RETRIES, 1);
  for (const classification of ['stalled', 'oom', 'crash']) {
    assert.equal(retryDecision({ classification, kind: 'render', retriesUsed: 0 }).retry, true);
    assert.equal(retryDecision({ classification, kind: 'render', retriesUsed: 1 }).retry, false);
  }
  for (const classification of ['failed', 'cancelled', 'ok']) {
    assert.equal(retryDecision({ classification, kind: 'render', retriesUsed: 0 }).retry, false);
  }
  assert.equal(retryDecision({ classification: 'crash', kind: 'draft', retriesUsed: 0 }).retry, false);
});

test('WD-4 a non-local or paid-looking command is never auto-retried', () => {
  assert.equal(isLocalCommand(undefined), true);
  assert.equal(isLocalCommand(['python3', 'scripts/render-studio-shot.py'], ['--shot', '2']), true);
  assert.equal(isLocalCommand(['python3', 'scripts/render-higgsfield.py']), false);
  assert.equal(isLocalCommand(['curl', 'https://api.example.com']), false);
  assert.equal(isLocalCommand(['python3', 'scripts/render-studio-shot.py'], ['--runpod']), false);
  assert.equal(retryDecision({ classification: 'crash', kind: 'render', retriesUsed: 0, local: false }).retry, false);
});

test('WD-6 keep-awake binds caffeinate to the job pid on macOS only', () => {
  assert.deepEqual(keepAwakeCommand(4321, 'darwin'), { cmd: 'caffeinate', args: ['-dims', '-w', '4321'] });
  assert.equal(keepAwakeCommand(4321, 'linux'), null);
  assert.equal(keepAwakeCommand(undefined, 'darwin'), null);
  assert.equal(keepAwakeCommand(1, 'darwin'), null);
});

test('WD-8 orphan reaping needs the recorded pid and the exact recorded command', () => {
  const recorded = { pid: 900, command: 'bash scripts/make-local-video.sh --scenario a.json' };
  assert.equal(mayReapOrphan({ recorded, live: { pid: 900, pgid: 900, command: recorded.command } }), true);
  assert.equal(mayReapOrphan({ recorded, live: { pid: 900, pgid: 901, command: recorded.command } }), false);
  assert.equal(mayReapOrphan({ recorded, live: { pid: 900, pgid: 900, command: 'vim notes.txt' } }), false);
  assert.equal(mayReapOrphan({ recorded, live: { pid: 901, pgid: 901, command: recorded.command } }), false);
  assert.equal(mayReapOrphan({ recorded: { pid: 900 }, live: { pid: 900, pgid: 900, command: '' } }), false);
  assert.equal(mayReapOrphan({ recorded: null, live: { pid: 900, pgid: 900, command: 'x' } }), false);
});

test('WD-8 process identity parser fails closed on malformed ps output', () => {
  assert.deepEqual(parsePsProcessIdentity(' 900  900 bash scripts/make-local-video.sh --scenario a.json\n'), {
    pid: 900, pgid: 900, command: 'bash scripts/make-local-video.sh --scenario a.json',
  });
  assert.equal(parsePsProcessIdentity('900 bash scripts/make-local-video.sh'), null);
  assert.equal(parsePsProcessIdentity('1 1 launchd'), null);
  assert.equal(parsePsProcessIdentity('900 900 '), null);
  assert.deepEqual(parsePsProcessIdentities('900 900 bash job\n901 900 python worker\n'), [
    { pid: 900, pgid: 900, command: 'bash job' },
    { pid: 901, pgid: 900, command: 'python worker' },
  ]);
});

test('WD-8 orphan children require the recorded scenario/work path and process group', () => {
  const recorded = { pid: 900, scenario: 'drafts/generated/fixture.local-scenario.json' };
  assert.equal(isOrphanScenarioMember({ recorded, live: {
    pid: 901, pgid: 900, command: 'ltx-2-mlx generate -o /app/storage/any-local/fixture.local-scenario/motion/shot.mp4',
  } }), true);
  assert.equal(isOrphanScenarioMember({ recorded, live: {
    pid: 902, pgid: 900, command: 'python scripts/render-any-local.py --scenario drafts/generated/fixture.local-scenario.json',
  } }), true);
  assert.equal(isOrphanScenarioMember({ recorded, live: { pid: 903, pgid: 900, command: 'sleep 60' } }), false);
  assert.equal(isOrphanScenarioMember({ recorded, live: {
    pid: 904, pgid: 905, command: 'ltx-2-mlx generate -o /app/storage/any-local/fixture.local-scenario/motion/shot.mp4',
  } }), false);
});
