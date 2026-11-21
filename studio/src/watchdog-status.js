// Label for the job view, from the small `watchdog` object the studio server keeps on each session.
export function watchdogLabel(watchdog, status) {
  if (!watchdog) return null;
  if (status === 'running' && watchdog.retries > 0) {
    return { tone: 'warn', text: `Retrying automatically (${watchdog.retries} of ${watchdog.maxRetries})` };
  }
  if (watchdog.lastFault && status === 'failed') {
    const why = { stalled: 'stalled', oom: 'ran out of memory', crash: 'crashed' }[watchdog.lastFault] || 'failed';
    return { tone: 'warn', text: `Stopped: the job ${why}${watchdog.retries ? ' again after one automatic retry' : ''}. Nothing was lost; retry when ready.` };
  }
  return null;
}
