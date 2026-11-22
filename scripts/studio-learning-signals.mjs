/** Convert observed Studio log lines into deduplicated learning evidence. */
export function classifyGateLine(value) {
  const line = String(value || '').trim();
  let match;
  if ((match = /^Error: Beat (\d+) has no clear physical action after repair\.?/i.exec(line))) {
    return { gate: 'visible-action', outcome: 'blocked', message: line.slice(0, 400), blocker: `beat ${match[1]} has no filmable physical action` };
  }
  if ((match = /director-brief\.py: error:\s*(.+)$/i.exec(line))) {
    return { gate: 'brief-input', outcome: 'blocked', message: line.slice(0, 400), blocker: match[1].slice(0, 240) };
  }
  if (/^Run failed:/i.test(line)) {
    const detail = line.replace(/^Run failed:\s*/i, '').trim();
    return { gate: 'pipeline-run', outcome: 'failed', message: line.slice(0, 400), blocker: (detail || 'session ended in a failed state').slice(0, 240) };
  }
  if (/^BLOCKED:/i.test(line)) {
    const message = line.slice(8).trim();
    return { gate: 'release-gate', outcome: 'blocked', message: line.slice(0, 400), blocker: message.slice(0, 240) };
  }
  if (/^Story passed every check|^Plan ready:/i.test(line)) return { gate: 'story-plan', outcome: 'passed', message: line.slice(0, 400) };
  if (/^Story gate:|^Evidence gate passed|^Preflight passed:|^Story structure passed|^First (picture|clip) check passed|^Still vision gate:.*passed/i.test(line)) {
    return { gate: 'pre-render', outcome: 'passed', message: line.slice(0, 400) };
  }
  if (/^Technical QA passed|^Quality checks passed/i.test(line)) return { gate: 'technical-qa', outcome: 'passed', message: line.slice(0, 400) };
  if (/^Technical QA failed|^Quality check failed/i.test(line)) return { gate: 'technical-qa', outcome: 'failed', message: line.slice(0, 400) };
  if (/^NEEDS-CHOICE:/i.test(line)) return { gate: 'story-choice', outcome: 'needs-choice', message: line.slice(0, 400) };
  if (/^REVIEW:/i.test(line)) return { gate: 'human-review', outcome: 'review-required', message: line.slice(0, 400) };
  if ((match = /^WARNING:\s+\[gate:(prompt|preflight|story|sound)\]\s*(.*)$/i.exec(line))) {
    return { gate: match[1].toLowerCase(), outcome: 'review-required', message: match[2].slice(0, 400) };
  }
  if (/^WARNING:/i.test(line)) return { gate: 'warning', outcome: 'review-required', message: line.slice(0, 400) };
  if (/^Fixed automatically:/i.test(line)) return { gate: 'automatic-repair', outcome: 'repaired', message: line.slice(0, 400) };
  if (/^PASS:/i.test(line)) return { gate: 'production-gate', outcome: 'passed', message: line.slice(0, 400) };
  if (/^Attempt \d+\/\d+: writing the story/.test(line)) return { gate: 'story-draft', outcome: 'started', message: line.slice(0, 400) };
  return null;
}

export function gateEventKey(row) {
  return JSON.stringify([String(row.session || ''), String(row.gate || ''), String(row.outcome || ''), String(row.message || '')]);
}

export function blockerReasons(lines = []) {
  const reasons = [];
  for (const value of lines) {
    const line = String(value || '').trim();
    const signal = classifyGateLine(line);
    if (['blocked', 'failed'].includes(signal?.outcome) && signal.blocker) reasons.push(signal.blocker);
  }
  return [...new Set(reasons)];
}
