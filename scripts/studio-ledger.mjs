// Learning ledger, gate-event tracking, checkpoint reviews, comparison feedback, and daily user quotas.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileHash, inspectExport } from './studio-export-review.mjs';
import { blockerReasons, classifyGateLine, gateEventKey } from './studio-learning-signals.mjs';

export function createStudioLedger({ root, sessions, canSee }) {
  const learnDir = path.join(root, 'storage', 'studio-learning');
  const ledgerFile = path.join(learnDir, 'runs.jsonl');

  function ledger(rec) {
    try {
      fs.mkdirSync(learnDir, { recursive: true });
      fs.appendFileSync(ledgerFile, JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n');
      return true;
    } catch { return false; }
  }

  function readLedger() {
    try {
      return fs.readFileSync(ledgerFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch { return []; }
  }

  const recordedGateKeys = new Set(readLedger().filter((row) => row.type === 'gate-event').map(gateEventKey));

  function recordGateEvent(session, line, evidenceSource = 'live-pipeline-output') {
    const signal = classifyGateLine(line);
    if (!signal) return;
    const row = {
      type: 'gate-event', user: session.user || 'owner', session: session.id, kind: session.kind,
      prompt: session.prompt, look: session.options?.look || null, scenario: session.scenario || null, ...signal,
      evidenceSource, evidenceStatus: 'observed pipeline output; no automatic quality inference',
    };
    const key = gateEventKey(row);
    if (recordedGateKeys.has(key)) return;
    if (ledger(row)) recordedGateKeys.add(key);
  }

  function recordSessionFailure(session, evidenceSource = 'terminal-session-state') {
    if (session.status !== 'failed') return;
    const detail = String(session.error || session.lines?.at(-1) || 'session ended in a failed state')
      .replace(/[\r\n]+/g, ' ').slice(0, 240);
    recordGateEvent(session, `Run failed: ${detail}`, evidenceSource);
  }

  async function recordFinalReviewEvidence(session) {
    if (session.kind !== 'render' || session.status !== 'done' || !session.video
      || !/^outputs\/[\w.-]+\.mp4$/.test(session.video)
      || !/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(session.scenario || '')) return;
    const videoFile = path.resolve(root, session.video);
    const scenarioFile = path.resolve(root, session.scenario);
    const reportFile = videoFile.replace(/\.mp4$/i, '.prereview.json');
    if (!fs.existsSync(videoFile) || !fs.existsSync(scenarioFile) || !fs.existsSync(reportFile)) return;
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    const [videoSha256, scenarioSha256] = await Promise.all([fileHash(videoFile), fileHash(scenarioFile)]);
    if (report.videoSha256 !== videoSha256 || report.scenarioSha256 !== scenarioSha256) return;
    if (readLedger().some((row) => row.type === 'machine-review' && row.session === session.id && row.videoSha256 === videoSha256)) return;
    ledger({
      type: 'machine-review', evidenceType: 'hash-bound-advisory-prereview', user: session.user || 'owner',
      session: session.id, look: session.options?.look || null, video: session.video, videoSha256,
      scenario: session.scenario, scenarioSha256, visionChecked: report.visionChecked === true,
      flags: report.flags && typeof report.flags === 'object' ? report.flags : {},
      shotMotion: Array.isArray(report.shotMotion) ? report.shotMotion : [],
      likelyBelow4: Array.isArray(report.likelyBelow4) ? report.likelyBelow4 : [],
      unchecked: Array.isArray(report.unchecked) ? report.unchecked : [],
      technicalQa: session.technicalQa?.status || 'unverified',
      evidenceStatus: 'machine screening only; not an artistic verdict; human watch/listen review remains required',
    });
  }

  async function saveComparisonFeedback({ baseline, candidate, reviewer, notes }) {
    const outputRoot = fs.realpathSync(path.join(root, 'outputs'));
    const resolveOutput = (value) => {
      if (typeof value !== 'string' || !/^outputs\/[\w.-]+\.mp4$/.test(value)) {
        throw new Error('Choose two finished videos from the Studio output list.');
      }
      const resolved = path.resolve(root, value);
      if (!resolved.startsWith(outputRoot + path.sep) || !fs.existsSync(resolved)) {
        throw new Error('A selected video is missing. Refresh the video list.');
      }
      const real = fs.realpathSync(resolved);
      if (!real.startsWith(outputRoot + path.sep)) throw new Error('Selected video is outside Studio outputs.');
      return real;
    };
    const baselineVideo = resolveOutput(baseline);
    const candidateVideo = resolveOutput(candidate);
    if (baselineVideo === candidateVideo) throw new Error('Choose two different exports.');
    const id = 'studio-listen-' + crypto.randomUUID();
    const input = path.join(root, 'storage', id + '.json');
    const request = {
      id, experimentId: id, baselineVideo, candidateVideo,
      outcome: 'both-acceptable-no-preference', reviewer,
      notes: String(notes || 'Both acceptable; no preference indicated.').slice(0, 400),
    };
    fs.writeFileSync(input, JSON.stringify(request));
    try {
      return await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(root, 'scripts', 'creative-learning.mjs'), 'feedback', input],
          { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        const timer = setTimeout(() => child.kill('SIGTERM'), 20_000);
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('error', (error) => { clearTimeout(timer); reject(error); });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (code !== 0) return reject(new Error(stderr.trim().split('\n')[0] || 'Could not verify the audio comparison.'));
          try { resolve(JSON.parse(stdout)); } catch { reject(new Error('The feedback recorder returned an unreadable result.')); }
        });
      });
    } finally { try { fs.unlinkSync(input); } catch { /* already removed */ } }
  }

  async function checkpointReviewState(session, user, submitted) {
    if (!session?.scenario || !session?.video || !canSee(user, session)) throw new Error('Unknown export.');
    if (submitted?.video && submitted.video !== session.video) {
      throw new Error('This review belongs to an older export. Reload the current video.');
    }
    const scenarioName = String(session.scenario);
    if (!/^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(scenarioName)) {
      throw new Error('The original storyboard is unavailable.');
    }
    const scenarioFile = path.resolve(root, scenarioName);
    const scenarioRoot = path.resolve(root, 'drafts', 'generated') + path.sep;
    if (!scenarioFile.startsWith(scenarioRoot) || !fs.existsSync(scenarioFile)) {
      throw new Error('The original storyboard is unavailable.');
    }
    const inspected = await inspectExport(root, session.video);
    if (inspected.status !== 'complete' || !inspected.contactSheet || !inspected.sampleTimeline.length) {
      throw new Error('Run a fresh checkpoint review for this exact export first.');
    }
    const videoFile = path.resolve(root, session.video);
    const reportFile = videoFile.replace(/\.mp4$/i, '.prereview.json');
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    const scenarioSha256 = await fileHash(scenarioFile);
    const videoSha256 = await fileHash(videoFile);
    if (report.videoSha256 !== videoSha256 || report.scenarioSha256 !== scenarioSha256) {
      throw new Error('The checkpoint report is stale or belongs to a different storyboard. Run the review again.');
    }
    const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf8'));
    const shots = scenario.plan?.shots;
    if (!Array.isArray(shots) || shots.length !== inspected.sampleTimeline.length) {
      throw new Error('The checkpoint list does not match the saved storyboard.');
    }
    const timeline = inspected.sampleTimeline.map((item, index) => {
      const shot = shots[index];
      const action = String(shot.motionPrompt || shot.imagePrompt || '').slice(0, 400);
      if (item.shot !== index + 1 || item.plannedAction !== action) {
        throw new Error('The checkpoint actions do not match the saved storyboard. Run the review again.');
      }
      return item;
    });
    if (!submitted) {
      const past = readLedger().filter((item) => item.type === 'checkpoint-review' && item.user === user.name
        && item.session === session.id && item.videoSha256 === videoSha256 && item.scenarioSha256 === scenarioSha256
        && item.contactSheetSha256 === report.contactSheetSha256).at(-1);
      return { available: true, review: past || null, timeline };
    }
    const validShotOutcomes = new Set(['matches', 'partial', 'not-visible']);
    const validPayoff = new Set(['achieved', 'partial', 'not-visible']);
    const findings = submitted.shotFindings;
    if (submitted.confirmed !== true || !Array.isArray(findings) || findings.length !== shots.length
      || !validPayoff.has(submitted.payoff) || findings.some((item, index) => item?.shot !== index + 1
        || !validShotOutcomes.has(item.outcome))) {
      throw new Error('Review every shot and the final payoff before saving.');
    }
    const saved = {
      type: 'checkpoint-review', evidenceType: 'scenario-bound-human-checkpoint-review',
      id: 'checkpoint-' + crypto.randomUUID(), user: user.name, session: session.id,
      video: session.video, videoSha256, scenario: scenarioName, scenarioSha256,
      contactSheet: inspected.contactSheet, contactSheetSha256: report.contactSheetSha256,
      title: String(scenario.plan?.title || '').slice(0, 120),
      look: session.options?.look || null,
      shotFindings: findings.map((item, index) => ({
        shot: item.shot, outcome: item.outcome,
        plannedAction: timeline[index].plannedAction,
        checkpoints: [timeline[index].startSeconds, timeline[index].middleSeconds, timeline[index].endSeconds],
      })),
      payoff: submitted.payoff, notes: String(submitted.notes || '').trim().slice(0, 500),
      learningUse: 'human evidence only; no score or automatic production-default update',
    };
    if (!ledger(saved)) throw new Error('Could not save the review record.');
    return { available: true, review: { ...saved, ts: new Date().toISOString() }, timeline };
  }

  function recordScenePlans(session, shots) {
    if (!Array.isArray(shots) || !shots.length) return;
    shots.forEach((shot, index) => ledger({
      type: 'scene-plan', user: session.user || 'owner', session: session.id,
      scenario: session.scenario, shot: index + 1, seconds: shot.seconds, narration: shot.narration,
      imagePrompt: shot.imagePrompt, motionPrompt: shot.motionPrompt, sound: shot.sound,
      evidenceStatus: 'generated scene plan; not human-approved for reuse',
    }));
  }

  function logRun(x, code) {
    const plan = x.plan?.plan || x.plan || {};
    const shots = plan.shots || [];
    const lines = x.lines || [];
    ledger({
      type: 'run', user: x.user || 'owner', session: x.id, kind: x.kind, status: x.status, exitCode: code,
      prompt: x.prompt, look: x.options?.look, setting: x.options?.setting, ending: x.options?.ending,
      audio: x.options?.audio, seconds: x.options?.seconds,
      shots: shots.length, shotSeconds: shots.map((s) => s.seconds), title: plan.title, scenario: x.scenario, video: x.video,
      storyModel: x.plan?.model || plan.model || null, ideaModel: x.options?.ideaModel || null,
      technicalQa: x.technicalQa?.status || 'unverified',
      learningGuidanceCount: Number(x.options?.learningGuidanceCount) || 0,
      completedSteps: [...new Set(x.steps || [])],
      durationSec: Math.round((Date.now() - x.startedAt) / 1000),
      blocked: blockerReasons(lines),
      fixed: lines.filter((l) => /^Fixed automatically/.test(l)).map((l) => l.slice(21, 160)),
      tries: lines.filter((l) => /^Attempt \d+\/\d+/.test(l)).length || undefined,
      reviews: lines.filter((l) => /^REVIEW/.test(l)).length,
    });
    if (x.kind === 'draft') recordScenePlans(x, shots);
  }

  async function backfillPersistedEvidence() {
    const rows = readLedger();
    const sessionsWithSceneEvidence = new Set(rows.filter((item) => item.type === 'scene-plan').map((item) => item.session));
    for (const session of sessions.values()) {
      for (const line of session.lines || []) recordGateEvent(session, String(line), 'persisted-session-log');
      recordSessionFailure(session, 'persisted-session-status');
      await recordFinalReviewEvidence(session).catch(() => {});
      if (session.kind !== 'draft' || sessionsWithSceneEvidence.has(session.id)) continue;
      let shots = session.plan?.plan?.shots || session.plan?.shots;
      if (!Array.isArray(shots) && /^drafts\/generated\/[\w.-]+\.local-scenario\.json$/.test(session.scenario || '')) {
        try { shots = JSON.parse(fs.readFileSync(path.resolve(root, session.scenario), 'utf8')).plan?.shots; }
        catch { /* no readable historical plan */ }
      }
      recordScenePlans(session, shots);
    }
  }

  function learning(user) {
    const rows = readLedger();
    const ownedRows = rows.filter((r) => user?.role === 'owner' || r.user === user?.name);
    const runs = ownedRows.filter((r) => r.type === 'run');
    const fb = ownedRows.filter((r) => r.type === 'feedback');
    const gateEvents = ownedRows.filter((r) => r.type === 'gate-event');
    const scenePlans = ownedRows.filter((r) => r.type === 'scene-plan');
    const machineReviews = ownedRows.filter((r) => r.type === 'machine-review');
    const checkpointReviews = ownedRows.filter((r) => r.type === 'checkpoint-review');
    const renders = runs.filter((r) => r.kind === 'render' && r.status === 'done' && r.shots > 0 && r.durationSec > 0);
    const per = renders.map((r) => (r.durationSec - 80) / r.shots).filter((v) => v > 120 && v < 600).sort((p, q) => p - q);
    const cycle = per.length >= 2 ? Math.round(per[Math.floor(per.length / 2)]) : null;
    const blockers = {};
    runs.forEach((r) => (r.blocked || []).filter((b) => !/provisional score/.test(b)).forEach((b) => {
      const k = b.replace(/^BLOCKED:\s*/, '').replace(/shot \d+: /, '');
      blockers[k] = (blockers[k] || 0) + 1;
    }));
    const byLook = {};
    fb.forEach((f) => {
      const k = f.look || 'unknown';
      byLook[k] ||= { up: 0, down: 0 };
      byLook[k][f.rating === 'up' ? 'up' : 'down']++;
    });
    const guidedRuns = runs.filter((run) => run.learningGuidanceCount > 0).length;
    return {
      drafts: runs.filter((r) => r.kind === 'draft').length,
      renders: renders.length,
      failed: runs.filter((r) => r.status === 'failed').length,
      gateEvents: gateEvents.length,
      scenePlans: scenePlans.length,
      machineReviews: machineReviews.length,
      recentGateEvents: gateEvents.slice(-5).map((event) => ({ gate: event.gate, outcome: event.outcome, message: event.message })),
      calibration: { cycleSec: cycle, samples: per.length },
      topBlockers: Object.entries(blockers).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })),
      ratings: byLook,
      recentNotes: fb.filter((f) => f.note).slice(-5).map((f) => ({ look: f.look, rating: f.rating, note: f.note })),
      guidedRuns,
      recentMachineReviews: machineReviews.slice(-3).map((review) => ({
        look: review.look,
        visionChecked: review.visionChecked,
        likelyBelow4: review.likelyBelow4,
        flags: review.flags,
        technicalQa: review.technicalQa,
      })),
      checkpointReviews: checkpointReviews.length,
      recentCheckpointReviews: checkpointReviews.slice(-5).map((item) => ({
        title: item.title,
        payoff: item.payoff,
        notes: item.notes,
        findings: item.shotFindings.map((shot) => ({ shot: shot.shot, outcome: shot.outcome })),
      })),
    };
  }

  function today(user, kind) {
    const day = new Date().toDateString();
    return readLedger().filter((r) => r.type === 'run' && r.user === user.name && r.kind === kind && new Date(r.ts).toDateString() === day).length;
  }

  return {
    ledger,
    readLedger,
    recordGateEvent,
    recordSessionFailure,
    recordFinalReviewEvidence,
    saveComparisonFeedback,
    checkpointReviewState,
    logRun,
    recordScenePlans,
    backfillPersistedEvidence,
    learning,
    today,
  };
}
