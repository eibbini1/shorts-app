// Orphaned worker process-group verification, cleanup, and take-job recovery across server restarts.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { availableTakes, motionState, sha256 } from './studio-motion-state.mjs';
import {
  isOrphanScenarioMember,
  mayReapOrphan,
  parsePsProcessIdentities,
  parsePsProcessIdentity,
} from './studio-watchdog.mjs';

export function createOrphanRecovery({
  root,
  sessDir,
  graceMs,
  persist,
  takeWork,
  takeContext,
  restoreSequenceTake,
}) {
  function processGroupMembers(pgid) {
    try {
      const output = execFileSync('ps', ['-axo', 'pid=', '-o', 'pgid=', '-o', 'command='], { encoding: 'utf8' });
      return parsePsProcessIdentities(output).filter((item) => item.pgid === Number(pgid));
    } catch { return []; }
  }

  function liveProcessIdentity(pid) {
    try {
      return parsePsProcessIdentity(
        execFileSync('ps', ['-o', 'pid=', '-o', 'pgid=', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }),
      );
    } catch { return null; }
  }

  function inspectOrphanGroup(recorded) {
    const pgid = Number(recorded?.pid);
    if (!Number.isSafeInteger(pgid) || pgid <= 1) return { state: 'unverified', members: [] };
    const recordedPid = liveProcessIdentity(pgid);
    if (recordedPid && !mayReapOrphan({ recorded, live: recordedPid })) {
      return { state: 'unverified', members: [] };
    }
    const members = processGroupMembers(pgid);
    if (!members.length) return { state: 'gone', members };
    const leader = members.find((item) => item.pid === pgid);
    if (leader) {
      return mayReapOrphan({ recorded, live: leader })
        ? { state: 'verified-leader', members }
        : { state: 'unverified', members };
    }
    const targets = members.filter((item) => isOrphanScenarioMember({ recorded, live: item }));
    return targets.length ? { state: 'verified-members', members: targets } : { state: 'unverified', members };
  }

  function signalOrphanGroup(recorded, signal) {
    const inspection = inspectOrphanGroup(recorded);
    if (inspection.state === 'gone' || inspection.state === 'unverified') return inspection;
    if (inspection.state === 'verified-leader') {
      try { process.kill(-Number(recorded.pid), signal); }
      catch (error) { if (error.code !== 'ESRCH') return { ...inspection, state: 'signal-error' }; }
      return inspection;
    }
    for (const target of inspection.members) {
      const fresh = liveProcessIdentity(target.pid);
      if (!fresh || fresh.pgid !== Number(recorded.pid) || fresh.command !== target.command || !isOrphanScenarioMember({ recorded, live: fresh })) continue;
      try { process.kill(fresh.pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') return { ...inspection, state: 'signal-error' }; }
    }
    return inspection;
  }

  function clearRecoveredProcess(x) {
    if (x.takeJob && x.procInfo?.pid) {
      const recorded = x.procInfo;
      const inspection = inspectOrphanGroup(recorded);
      const current = liveProcessIdentity(recorded.pid);
      const unrelatedOccupant = current && current.command !== recorded.command &&
        !processGroupMembers(recorded.pid).some((member) => isOrphanScenarioMember({ recorded, live: member }));
      if (!unrelatedOccupant) {
        if (inspection.state !== 'gone') return;
        try { process.kill(-recorded.pid, 0); return; }
        catch (error) { if (error.code !== 'ESRCH') return; }
      }
    }
    if (x.takeJob && x.kind === 'render' && x.scenario) {
      try {
        const output = motionState(takeWork(x.scenario)).verifiedExport;
        if (output?.jobId === x.takeJob.id && output.session === x.id && /^outputs\/[^/\\]+\.mp4$/.test(output.path) &&
            sha256(path.join(root, output.path)) === output.sha256) {
          x.video = output.path;
          x.technicalQa = { status: 'passed' };
          x.status = 'done';
          x.error = null;
          if (x.sequence?.stage === 'ready') {
            const state = motionState(takeWork(x.scenario));
            x.sequence.endFrames = x.sequence.endFrames.map((old) => {
              const entry = state[old.shot - 1];
              const row = entry?.completed?.[entry.current];
              return row?.completedJobId === x.takeJob.id && row.endFrame ? row : old;
            });
          }
        } else if (x.previousVideo) {
          x.video = x.previousVideo;
          x.technicalQa = { status: 'passed' };
        }
      } catch { /* preserve interrupted status if the export cannot be verified */ }
    }
    if (x.takeJob && x.kind === 'sequence-motion' && x.sequence?.currentShot) {
      try {
        const shot = x.sequence.currentShot;
        const context = takeContext(x, shot);
        const state = availableTakes(context.work, shot, context.expected);
        if (Object.values(state.completed).some((row) => row.completedJobId === x.takeJob.id)) {
          x.status = 'done';
          x.error = null;
        }
      } catch { /* a report without verified artifacts cannot restore a job */ }
    }
    restoreSequenceTake(x, x.takeJob?.optional, 'The optional take was interrupted.');
    if (/^take-[0-9a-f-]{36}\.report$/.test(x.takeJob?.id || '')) {
      try { fs.unlinkSync(path.join(sessDir, x.takeJob.id)); } catch { /* no completed report */ }
    }
    x.takeJob = null;
    x.procInfo = null;
    persist(x, false);
  }

  function recoverOrphan(x) {
    const recorded = x.procInfo;
    if (!recorded?.pid) { clearRecoveredProcess(x); return; }
    const term = signalOrphanGroup(recorded, 'SIGTERM');
    if (term.state === 'gone') { clearRecoveredProcess(x); return; }
    x.lines ||= [];
    if (term.state === 'unverified' || term.state === 'signal-error') {
      clearRecoveredProcess(x);
      if (!x.procInfo) return;
      x.lines.push('Watchdog: a leftover process could not be safely identified; its process record is retained for another recovery check.');
      persist(x, false);
      return;
    }
    x.lines.push('Watchdog: sent SIGTERM to the verified job process; checking whether every worker exits.');
    persist(x, false);
    setTimeout(() => {
      const forced = signalOrphanGroup(recorded, 'SIGKILL');
      if (forced.state === 'gone') { clearRecoveredProcess(x); return; }
      if (forced.state === 'unverified' || forced.state === 'signal-error') {
        x.lines.push('Watchdog: process identity changed during recovery; retained its record and did not signal unverified processes.');
        persist(x, false);
        return;
      }
      x.lines.push('Watchdog: a verified worker did not exit after SIGTERM; sent SIGKILL and will verify cleanup.');
      persist(x, false);
      setTimeout(() => {
        const remaining = inspectOrphanGroup(recorded);
        if (remaining.state === 'gone') clearRecoveredProcess(x);
        else {
          x.lines.push(remaining.state === 'verified-leader' || remaining.state === 'verified-members'
            ? 'Watchdog: a verified worker is still present; retained its process record so a later restart can retry.'
            : 'Watchdog: the old group could not be conclusively cleared; retained its record without signaling unverified processes.');
          persist(x, false);
        }
      }, 750).unref();
    }, graceMs).unref();
  }

  return {
    liveProcessIdentity,
    inspectOrphanGroup,
    signalOrphanGroup,
    clearRecoveredProcess,
    recoverOrphan,
  };
}
