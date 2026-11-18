export function exportReviewStatus({ failed = [], technicalPassed = false, review = {} } = {}) {
  if (failed.length) return { tone: 'bad', message: 'Not ready: the final file failed a technical check.' };
  if (!technicalPassed) return { tone: 'muted', message: 'Technical checks have not been confirmed for this export.' };

  const flags = Object.values(review.flags || {}).flat().filter((item) => typeof item === 'string');
  if (flags.length) {
    return {
      tone: 'bad',
      message: 'Technical checks passed, but automatic screening raised visual or story concerns. Review the flagged moments before using this film; machine flags are prompts for review, not an artistic verdict.',
    };
  }
  if (review.status !== 'complete') {
    return {
      tone: 'muted',
      message: 'Technical checks passed. Automatic visual review is not complete, so watch the film before using it.',
    };
  }
  return { tone: 'ok', message: 'Technical checks passed. Watch and listen before publishing.' };
}
