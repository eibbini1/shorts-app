const GUIDANCE = {
  continuity: 'Keep the same subject or dish across shots, and make any visible change a plausible planned progression.',
  realism: 'Simplify the flagged physical action into one plausible, clearly visible movement with the subject and relevant tool in frame.',
  payoff: 'Make the final shot end on the approved outcome, not while the action is still underway.',
  story: 'Reconnect the shots in the requested action order so each beat leads clearly to the next.',
  audio: 'Check the flagged sound or narration against the selected audio mode and the visible action.',
};

const RECOMMENDATION = {
  continuity: 'Compare the flagged moments. If they should show one dish or subject, clarify how it changes between shots; if not, revise the continuity expectation.',
  realism: 'Check the action at the flagged timestamp. Make sure the movement is physically plausible and the relevant subject and tool stay visible.',
  payoff: 'Compare the last frame with the approved ending. The final image should show that outcome, not an intermediate pose.',
  story: 'Check that the requested actions stay in order and that each shot leads naturally into the next.',
  audio: 'Listen to the flagged moment and compare it with the selected audio mode and visible action.',
};

export function reviewRecommendations(review = {}) {
  return Object.entries(review.flags || {}).flatMap(([category, items]) => {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => typeof item === 'string').map((item) => ({
      category,
      issue: item,
      nextStep: RECOMMENDATION[category] || 'Review this moment against the approved story plan before deciding whether it needs a change.',
      ...issueLocation(item, review.sampleTimeline),
    }));
  }).slice(0, 8);
}

function issueLocation(issue, timeline = []) {
  const shotMatch = /\bshot\s+(\d+)\b/i.exec(issue);
  if (!shotMatch) return {};
  const shot = Number(shotMatch[1]);
  const explicitTime = /\b(?:at|around)\s+(\d+(?:\.\d+)?)\s*(?:s|sec(?:ond)?s?)\b/i.exec(issue);
  const sample = Array.isArray(timeline) ? timeline.find((item) => item.shot === shot) : null;
  const seconds = explicitTime
    ? Number(explicitTime[1])
    : /\bmiddle frame\b/i.test(issue) && Number.isFinite(sample?.middleSeconds)
      ? sample.middleSeconds
      : undefined;
  return { shot, ...(seconds === undefined ? {} : { seconds }) };
}

export function suggestedRepairGuidance(recommendations, ending = '') {
  if (!recommendations.length) return '';
  const categories = [...new Set(recommendations.map(({ category }) => category))];
  const steps = categories.map((category) => GUIDANCE[category] || 'Address the flagged concern while preserving the approved idea and requested actions.');
  const finalState = String(ending || '').trim();
  return [
    'Revise the story plan while preserving my original idea and every requested action in order.',
    ...steps,
    ...(finalState ? [`The approved ending must remain: ${finalState}`] : []),
    'Return a connected, physically plausible plan. I will review it before any frames or video are generated.',
  ].join(' ').slice(0, 600);
}

export function suggestedShotRepairGuidance(recommendation, ending = '') {
  if (!Number.isInteger(recommendation?.shot)) return '';
  const timestamp = Number.isFinite(recommendation.seconds) ? ` around ${recommendation.seconds.toFixed(1)} seconds` : '';
  return [
    `Focus the repair on shot ${recommendation.shot}${timestamp}.`,
    recommendation.nextStep,
    'Keep every other shot, the original idea, and all requested actions in order unchanged.',
    ...(String(ending || '').trim() ? [`Keep the approved ending: ${String(ending).trim()}`] : []),
    'Return the revised plan for review; do not start frames or motion.',
  ].join(' ').slice(0, 600);
}

export function repairPreviewChanges(baseBrief = {}, baseStoryPrompt = '', proposal = {}) {
  const fields = [
    ['Story direction', String(baseStoryPrompt || baseBrief.topic || '').trim(), proposal.refinedPrompt || proposal.prompt],
    ['Opening action', baseBrief.hook, proposal.hook],
    ['Required actions', baseBrief.mustShow, proposal.mustShow],
    ['Obstacle', baseBrief.obstacle, proposal.obstacle],
    ['Solution', baseBrief.turn, proposal.turn],
    ['Ending', baseBrief.ending, proposal.ending],
  ];

  return fields.flatMap(([label, before, after]) => {
    const previous = typeof before === 'string' ? before.trim() : '';
    const next = typeof after === 'string' ? after.trim() : '';
    if (!next || previous === next) return [];
    return [{ label, before: previous || 'Not set', after: next }];
  });
}

export function planPromptChanges(previousShots = [], currentShots = []) {
  if (!Array.isArray(previousShots) || !Array.isArray(currentShots)) return [];
  const changes = [];
  if (previousShots.length !== currentShots.length) {
    changes.push({
      shot: null,
      field: 'Shot count',
      before: `${previousShots.length} shots`,
      after: `${currentShots.length} shots`,
    });
  }
  const commonCount = Math.min(previousShots.length, currentShots.length);
  for (let index = 0; index < commonCount; index += 1) {
    for (const [field, label] of [['imagePrompt', 'First-frame prompt'], ['motionPrompt', 'Motion prompt']]) {
      const before = String(previousShots[index]?.[field] || '').trim();
      const after = String(currentShots[index]?.[field] || '').trim();
      if (before !== after) changes.push({ shot: index + 1, field: label, before: before || 'Not set', after: after || 'Not set' });
    }
  }
  return changes;
}
