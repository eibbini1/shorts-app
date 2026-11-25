// Shared job-status derivation and backward-compatible re-exports for extracted Studio UI components.
export { EST, clipsOf, fmt, planEstimate } from './render-estimate.js';
export { CheckpointReviewForm, ExportReview, Feedback } from './components/ExportReviewPanel.jsx';
export { ComparePanel, Player } from './components/PlayerAndCompare.jsx';
export {
  DirectorsChair,
  FramesBlock,
  FramesReview,
  LearnedCard,
  PlanCard,
  PrerenderChecklist,
  RenderLive,
  RenderTimer,
  STAGE_NAMES,
  ShotPlan,
  StageBar,
  StepTrack,
  guessResult,
  stageIndex,
} from './components/ProductionPanels.jsx';
export {
  BlockedCard,
  FailureCard,
  IdeaHelper,
  IdeaRefinement,
  LOOKS,
  LookCards,
  LookChips,
  ReadinessCheck,
  RepairChangePreview,
  THEME_SW,
  UpNext,
  plainBlock,
  readQueue,
  writeQueue,
} from './components/StoryComposer.jsx';

// One honest state per job: waiting / running / awaiting approval / blocked / failed / complete.
// "Awaiting approval" is derived from a finished plan or first-frames job, because the server only reports running/done/failed.
export function jobState(job, blocked, busyElsewhere) {
  const st = job.status;
  if (!st || st === 'idle') {
    return busyElsewhere
      ? { k: 'waiting', t: 'The Mac is busy with another video. New ideas wait in Up next.' }
      : { k: 'idle', t: '' };
  }
  if (st === 'running') {
    return {
      k: 'running',
      t: job.kind === 'draft'
        ? 'Planning your video.'
        : job.kind === 'stills'
        ? (job.sequence?.active
          ? `Making and checking shot ${job.sequence.currentShot} first frames.`
          : 'Making and checking first frames. Local AI will correct a rejected frame before stopping; no motion starts until frames pass.')
        : job.kind === 'sequence-motion'
        ? `Rendering approved shot ${job.sequence?.currentShot || ''} motion.`
        : 'Rendering motion. This takes several minutes; you can leave this page open.',
    };
  }
  if (st === 'stopping') return { k: 'waiting', t: 'Stopping the current job. Studio will be available when it exits.' };
  if (st === 'cancelled') return { k: 'stopped', t: 'Stopped. Your idea is kept; plan again when ready.' };
  if (st === 'interrupted') return { k: 'failed', t: 'The Mac restarted this job. Your idea is kept; try again.' };
  if (st === 'failed' && job.kind === 'stills') {
    return {
      k: 'blocked',
      t: 'Local AI could not verify an acceptable first frame after its bounded correction attempt. Your idea and plan are saved; no motion was generated. Retry in this project to let Studio try again.',
    };
  }
  if (st === 'failed' && job.kind === 'sequence-motion') {
    return { k: 'failed', t: 'The approved shot motion failed. Its frame approval is saved; retry this shot before continuing.' };
  }
  if (st === 'failed') {
    return blocked
      ? { k: 'blocked', t: 'Blocked by a check. Nothing was rendered. Fix the point below or try again.' }
      : { k: 'failed', t: 'Something went wrong. Your idea is kept; try again.' };
  }
  if (job.kind === 'draft') {
    return blocked
      ? { k: 'blocked', t: 'Blocked by a check. Nothing was rendered.' }
      : { k: 'approval', t: 'Plan ready. Next: make first frames, then check them before the long render.' };
  }
  if (job.kind === 'stills' && job.sequence?.active) {
    return blocked
      ? { k: 'blocked', t: 'This shot is ready for review, but a plan check still blocks motion.' }
      : { k: 'approval', t: `Shot ${job.sequence.currentShot} first frame is ready. Review and approve it before its motion renders.` };
  }
  if (job.kind === 'stills') {
    return blocked
      ? { k: 'blocked', t: 'Blocked by a check. Fix it before rendering.' }
      : { k: 'approval', t: 'First frames ready. Approve them to start the render, or regenerate any frame.' };
  }
  if (job.kind === 'sequence-motion' && job.sequence?.stage === 'ready') {
    return { k: 'approval', t: 'All shots are approved and rendered. Assemble the final video when ready.' };
  }
  if (job.kind === 'sequence-motion') {
    return { k: 'approval', t: `Shot ${job.sequence?.currentShot || ''} motion is verified. Preparing the next first frame.` };
  }
  return blocked
    ? { k: 'blocked', t: 'Final file failed a check. It is not ready.' }
    : { k: 'complete', t: 'Video rendered. Review the export below before using it.' };
}
