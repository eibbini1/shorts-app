// Pure watchdog rules for Studio jobs (no I/O, no timers): stall limits, exit classification,
// bounded auto-retry eligibility, keep-awake arguments and the orphan-reap safety check.
// studio-server.mjs owns the processes; this module only decides.

export const MAX_AUTO_RETRIES = 1;
export const WATCHED_KINDS = ['render', 'stills', 'sequence-motion'];

const positive = (value) => {
  const n = Number(value);
  return String(value ?? '').trim() && Number.isFinite(n) && n > 0 ? n : null;
};

// Local LTX on a Mac took ~18 min for one clip (Phase: bench, 2026-11-21) and its output cadence is not yet
// measured, so these defaults are deliberately generous. Override with STUDIO_RENDER_IDLE_TIMEOUT_MS / STUDIO_RENDER_TIMEOUT_MS.
export function watchdogLimits(seconds, env = {}) {
  const duration = Number(seconds) > 0 ? Number(seconds) : 30;
  return {
    idleMs: positive(env.STUDIO_RENDER_IDLE_TIMEOUT_MS) ?? 30 * 60_000,
    hardMs: positive(env.STUDIO_RENDER_TIMEOUT_MS) ?? Math.max(4 * 3_600_000, duration * 8 * 60_000),
  };
}

// Returns null while the job is healthy, otherwise why it should be stopped.
export function checkStall({ startedAt, lastActivityAt, now, limits }) {
  if (now - lastActivityAt >= limits.idleMs) return { reason: 'idle', minutes: Math.round(limits.idleMs / 60_000) };
  if (now - startedAt >= limits.hardMs) return { reason: 'hard', minutes: Math.round(limits.hardMs / 60_000) };
  return null;
}

export function stallMessage(stall) {
  const what = stall.reason === 'idle' ? `produced no output for ${stall.minutes} minutes` : `ran longer than ${stall.minutes} minutes`;
  return `This step ${what} and was stopped. Your plan and any finished clips are saved; retry it, or free up memory first.`;
}

const OOM_PATTERN = /out of memory|MemoryError|Cannot allocate memory|std::bad_alloc|Insufficient Memory|kIOGPUCommandBufferCallbackErrorOutOfMemory/i;
const CRASH_SIGNALS = new Set(['SIGKILL', 'SIGSEGV', 'SIGABRT', 'SIGBUS', 'SIGILL']);

// 'ok' | 'cancelled' | 'stalled' | 'oom' | 'crash' | 'failed'. Only stalled/oom/crash are infrastructure faults;
// 'failed' (non-zero exit, QA or prompt-gate failure) means the work itself was rejected and must not be auto-retried.
export function classifyExit({ code, signal = null, stoppedByUser = false, stalled = false, tail = [] }) {
  if (stoppedByUser) return 'cancelled';
  if (stalled) return 'stalled';
  if (code === 0 && !signal) return 'ok';
  const text = Array.isArray(tail) ? tail.join('\n') : String(tail || '');
  if (OOM_PATTERN.test(text)) return 'oom';
  if (CRASH_SIGNALS.has(signal) || [134, 137, 139].includes(code)) return 'crash';
  return 'failed';
}

// Auto-retry is never allowed to spend money: only the studio's own local scripts qualify.
const LOCAL_COMMANDS = new Set(['python3 scripts/render-studio-shot.py', 'python3 scripts/studio-draft.py']);
const PAID_HINT = /higgsfield|runpod|replicate|fal\.ai|openai|elevenlabs|hosted|api[_-]?key/i;
export function isLocalCommand(cmd, args = []) {
  if (!cmd) return true; // default job: bash scripts/make-local-video.sh
  const head = cmd.slice(0, 2).join(' ');
  if (!LOCAL_COMMANDS.has(head)) return false;
  return ![...cmd, ...args].some((part) => PAID_HINT.test(String(part)));
}

export function retryDecision({ classification, kind, retriesUsed = 0, local = true, max = MAX_AUTO_RETRIES }) {
  if (!WATCHED_KINDS.includes(kind)) return { retry: false, why: 'not a watched job type' };
  if (!['stalled', 'oom', 'crash'].includes(classification)) return { retry: false, why: `${classification} is not retried automatically` };
  if (!local) return { retry: false, why: 'only local commands are retried automatically' };
  if (retriesUsed >= max) return { retry: false, why: 'automatic retry already used' };
  return { retry: true, why: `${classification}: retrying once with the same settings` };
}

export function keepAwakeCommand(pid, platform = process.platform) {
  if (platform !== 'darwin' || !Number.isInteger(pid) || pid <= 1) return null;
  return { cmd: 'caffeinate', args: ['-dims', '-w', String(pid)] };
}

// Orphan reaping after a studio restart requires the exact process, its detached process group,
// and exact command line. This prevents kill(-pid, ...) from signaling an unrelated group.
export function parsePsProcessIdentity(output) {
  const match = String(output || '').trim().match(/^(\d+)\s+(\d+)\s+(.+?)\s*$/);
  if (!match) return null;
  const pid = Number(match[1]);
  const pgid = Number(match[2]);
  if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(pgid) || pid <= 1 || !match[3].trim()) return null;
  return { pid, pgid, command: match[3].trim() };
}

export function parsePsProcessIdentities(output) {
  return String(output || '').split(/\r?\n/).map(parsePsProcessIdentity).filter(Boolean);
}

export function mayReapOrphan({ recorded, live }) {
  if (!recorded || !live) return false;
  const pid = Number(recorded.pid);
  if (!Number.isInteger(pid) || pid <= 1 || pid !== Number(live.pid)) return false;
  return Number(live.pgid) === pid && Boolean(recorded.command) && recorded.command === String(live.command || '').trim();
}

// If the Studio leader exited but its detached group still has workers, only treat a member as
// belonging to that job when its command names the stored scenario or that scenario's work folder.
// This deliberately fails closed for old/unknown commands instead of killing by PGID alone.
export function isOrphanScenarioMember({ recorded, live }) {
  if (!recorded || !live || Number(live.pgid) !== Number(recorded.pid)) return false;
  let scenario = String(recorded.scenario || '');
  if (!scenario) {
    const match = String(recorded.command || '').match(/--scenario(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/);
    scenario = match?.[1] || match?.[2] || match?.[3] || '';
  }
  if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(scenario)) return false;
  const workFolder = `storage/any-local/${scenario.split('/').pop().replace(/\.json$/, '')}/`;
  const command = String(live.command || '').replaceAll('\\', '/');
  return command.includes(scenario) || command.includes(workFolder);
}
