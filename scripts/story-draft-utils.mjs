export function fitOutlineIdeas(value, count = 5) {
  if (!Array.isArray(value?.ideas) || value.ideas.length <= count) return value;
  return {...value, ideas: value.ideas.slice(0, count)};
}

export function narrationWordBand(seconds) {
  return {
    min: Math.max(3, Math.floor(seconds * 0.8)),
    max: Math.floor(seconds * 2.5),
  };
}

const SUPPORTED_ASMR_CUE = /\b(?:rain\w*|splash\w*|puddle\w*|ripple\w*|click\w*|tick\w*|mechanical|gear\w*|servo\w*|beep\w*|rustl\w*|leaves|foliage|grass|bloom\w*|sprout\w*|footstep\w*|pitter\w*|paws?|stomp\w*|hoof\w*|paddl\w*|bounc\w*|breez\w*|wind\w*|gust\w*|sizzl\w*|crunch|crispy|crisp|bite|biting|crack|snap|chew\w*|munch\w*|pour\w*|drizzl\w*|stream of sauce|slice|slicing|chop|chopping|knife cut|scrap\w*|spread\w*|drag\w*|clink\w*|plate tap|glass tap|utensil tap|shimmer\w*|sparkl\w*|chime\w*|flour|pat|patting|squeak\w*|whoosh\w*|glid\w*|sweep\w*|pop\w*|fizz\w*|champagne|ambience|ambient|room tone|hum)\b/i;

export function hasSupportedAsmrCue(value) {
  return SUPPORTED_ASMR_CUE.test(value);
}

export function reconcileSceneStateBefore(sceneState, previousAfter) {
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (normalize(sceneState.before) === normalize(previousAfter)) return false;
  sceneState.before = previousAfter;
  return true;
}

export function applyVisualIdentityLock(prompt, protagonist, visualBible) {
  const subject = String(protagonist || '').trim().slice(0, 120);
  const identity = String(visualBible || '').trim().slice(0, 360);
  if (!subject || !identity) throw new Error('A shared visual identity reference needs a subject and visual bible.');
  const lock = `Shared visual identity reference for every scene: ${subject}. ${identity}. Preserve the same defining face, hair, clothing, accessories and proportions for characters, and the same shape, color, material, size and distinctive markings for objects. Do not redesign recurring subjects between shots unless the story explicitly changes them.`;
  const remaining = Math.max(0, 1000 - lock.length - 1);
  return `${lock} ${String(prompt || '').trim().slice(0, remaining)}`.trim();
}

export function collectPromptChanges(beforeShots, afterShots, shotNumbers, reason) {
  if (!Array.isArray(beforeShots) || !Array.isArray(afterShots) || !Array.isArray(shotNumbers)) return [];
  return shotNumbers.flatMap(shot => {
    const before = beforeShots[shot - 1];
    const after = afterShots[shot - 1];
    if (!before || !after) return [];
    const changes = ['imagePrompt', 'motionPrompt'].flatMap(field => {
      const previous = String(before[field] || '');
      const next = String(after[field] || '');
      return previous === next ? [] : [{ field, before: previous, after: next }];
    });
    return changes.length ? [{ shot, reason, changes }] : [];
  });
}
