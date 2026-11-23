const clean = (value, max = 180) => String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

/** Build bounded, user-scoped evidence for local-model prompts; never infer quality. */
export function buildLearningContext(rows, { user, look, limit = 4 } = {}) {
  const visible = (row) => user?.role === 'owner' || row.user === user?.name;
  const runs = rows.filter((row) => row.type === 'run');
  const runLook = new Map(runs.map((row) => [row.session, row.look]));
  const rowLook = (row) => row.look || runLook.get(row.session) || '';
  const relevant = rows.filter((row) => visible(row) && (!look || rowLook(row) === look));

  const failures = new Map();
  for (const row of relevant) {
    if (row.type !== 'gate-event' || !['blocked', 'failed'].includes(row.outcome)) continue;
    const reason = clean(row.blocker || row.message, 180);
    if (!reason) continue;
    const key = `${row.gate}:${reason}`;
    const current = failures.get(key) || { gate: row.gate, reason, count: 0 };
    current.count += 1;
    failures.set(key, current);
  }
  const repeatedFailures = [...failures.values()].filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count).slice(0, limit);

  const humanNotes = relevant.filter((row) =>
    (row.type === 'feedback' && row.note) || (row.type === 'checkpoint-review' && row.notes) ||
    (row.type === 'motion-take-review' && row.clipSha256 && row.notes))
    .slice(-limit).map((row) => ({
      source: row.type === 'feedback' ? 'creator-rating' : row.type === 'motion-take-review' ? 'motion-review' : 'shot-review',
      rating: row.rating || row.outcome || null,
      note: clean(row.note || row.notes),
    }));
  const feedbackRows = relevant.filter((row) => row.type === 'feedback');
  const ratings = { good: feedbackRows.filter((row) => row.rating === 'up').length,
    needsWork: feedbackRows.filter((row) => row.rating === 'down').length };
  const machineFindings = relevant.filter((row) => row.type === 'machine-review').flatMap((row) =>
    Object.entries(row.flags || {}).flatMap(([category, items]) => Array.isArray(items)
      ? items.map((finding) => ({ category: clean(category, 40), finding: clean(finding, 160), source: 'advisory-screen' })) : []))
    .slice(-limit);

  return { version: 1, look: look || 'all', repeatedFailures, humanNotes,
    ratings, machineFindings,
    evidenceCount: relevant.filter((row) => ['gate-event', 'feedback', 'checkpoint-review', 'motion-take-review', 'machine-review'].includes(row.type)).length,
    guidanceCount: repeatedFailures.length + humanNotes.length + machineFindings.length + (feedbackRows.length ? 1 : 0) };
}

export function hasLearningEvidence(context) {
  return Boolean(context && (context.repeatedFailures?.length || context.humanNotes?.length
    || context.machineFindings?.length || context.ratings?.good || context.ratings?.needsWork));
}
