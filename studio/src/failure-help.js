// Plain-language help for a failed render-side job. Pure: it only reads fields the server already sets
// (status, kind, error, watchdog.lastFault, technicalQa.status) and only suggests actions the UI already has.
// It does NOT offer "lower memory settings": the render API has no such option today.
const FAULTS = {
  stalled: { why: 'The job stopped producing output for a long time, so the Studio stopped it.', tips: ['Close other heavy apps, then retry.', 'If it stalls again on the same shot, regenerate that shot’s first frame and retry.'] },
  oom: { why: 'The Mac ran out of memory during this job.', tips: ['Quit other heavy apps (browsers with many tabs, other renders), then retry.', 'A shorter video uses less memory: reduce the length and plan again.'] },
  crash: { why: 'The render program exited unexpectedly.', tips: ['Retry once; one-off crashes are common.', 'If it crashes again, keep the log line below when you report it.'] },
};

export function failureHelp({ status, kind, error, watchdog, technicalQa, hasScenario } = {}) {
  if (!['failed', 'interrupted'].includes(status)) return null;
  // The card's retry button re-runs the render, so it is only offered for render jobs; stills and sequence jobs keep their own retry buttons.
  const retryable = kind === 'render';
  if (technicalQa?.status === 'failed') {
    return { title: 'The finished file failed a technical check', why: 'The video was made but did not pass the automatic file check, so it was not marked ready.',
      tips: ['Retry the render; nothing else was changed.'], canRetry: retryable && Boolean(hasScenario), detail: error || null };
  }
  if (status === 'interrupted') {
    return { title: 'The Studio restarted during this job', why: 'The job was interrupted, not failed. Finished clips and frames are kept.',
      tips: ['Retry to continue from the saved frames.'], canRetry: retryable && Boolean(hasScenario), detail: error || null };
  }
  const f = FAULTS[watchdog?.lastFault];
  if (f) {
    const again = watchdog?.retries > 0 ? ' It already retried once automatically.' : '';
    return { title: 'This job did not finish', why: f.why + again, tips: f.tips, canRetry: retryable && Boolean(hasScenario), detail: error || null };
  }
  return { title: 'This job did not finish', why: 'The job reported an error that the Studio does not recognise.', tips: ['Retry once. If it fails the same way, copy the error below.'],
    canRetry: retryable && Boolean(hasScenario), detail: error || null };
}
