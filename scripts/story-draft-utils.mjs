import { clipLine } from './shot-normalize.mjs';

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

const DANGLING_TAIL = new Set(['the', 'a', 'an', 'to', 'and', 'of', 'with', 'for', 'as', 'in', 'on', 'at', 'by', 'from', 'that', 'while', 'into', 'toward', 'towards', 'over', 'across', 'its', 'their', 'his', 'her']);

export function hasDanglingTail(text) {
  const last = String(text || '').toLowerCase().match(/([a-z]+)[^a-z]*$/);
  return Boolean(last && DANGLING_TAIL.has(last[1]));
}

// Fill a missing or static scene-state action from the shot's own motion prompt. Local models often write
// "stands tall" as the action or repeat the same text for before and after; the motion prompt already
// holds a concrete movement, so reuse it instead of discarding the whole plan.
export function repairSceneState(sceneState, motionPrompt, hasAction) {
  if (!sceneState || typeof sceneState !== 'object') return false;
  const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let changed = false;
  if (!hasAction(sceneState.action)) {
    const sentence = String(motionPrompt || '').match(/[^.!?]+[.!?]?/)?.[0]?.trim();
    if (sentence && hasAction(sentence)) { sceneState.action = sentence.slice(0, 300); changed = true; }
  }
  if (norm(sceneState.before) === norm(sceneState.after) && hasAction(sceneState.action)) {
    sceneState.after = `After this movement: ${sceneState.action}`.slice(0, 300);
    changed = true;
  }
  return changed;
}

// First clause of a long description, cut at a word boundary, for building short fallback lines.
export function firstClause(text, maxWords = 6) {
  const clause = String(text || '').split(/[,;:.]/)[0].trim().split(/\s+/).filter(Boolean);
  const cut = clause.slice(0, maxWords);
  while (cut.length > 1 && DANGLING_TAIL.has(cut[cut.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) cut.pop();
  return cut.join(' ');
}

// Fit a line into the narration word band without leaving a dangling fragment ("... the", "... as").
export function shortenNarration(text, seconds) {
  const { min: minimum, max: limit } = narrationWordBand(seconds);
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= limit) return words.join(' ');
  const sentences = String(text).match(/[^.!?]+[.!?]?/g)?.map(item => item.trim()) ?? [];
  const fit = sentences.find(sentence => sentence.split(/\s+/).length >= minimum && sentence.split(/\s+/).length <= limit);
  if (fit) return fit;
  const cut = words.slice(0, limit);
  while (cut.length > minimum && DANGLING_TAIL.has(cut[cut.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) cut.pop();
  return cut.join(' ').replace(/[,;:]+$/, '') + '.';
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

export function lockRequestedEnding(shot, requested) {
  const ending = requested.trim().replace(/[.!?؟]+$/u, '');
  if (!ending) return;
  const sentence = `${ending}.`;
  const instruction = `Final physical moment: ${sentence}`;
  const state = shot.sceneState;
  let motion = shot.motionPrompt;
  if (state?.after && state.after !== sentence) {
    const oldEnd = state.after.trim().replace(/[.!?؟]+$/u, '');
    motion = motion.replace(`Visible end state: ${oldEnd}.`, '').trim();
  }
  shot.motionPrompt = clipLine(`${instruction} ${motion.replaceAll(instruction, '').trim()}`.trim());
  if (state) {
    const action = String(state.action || '').trim();
    if (!action.toLowerCase().includes(ending.toLowerCase())) {
      const sequence = action ? `${action.replace(/[.!?؟]+$/u, '')}. ${sentence}` : sentence;
      state.action = sequence.length <= 1000 ? sequence : sentence;
    }
    state.after = sentence;
  }
}

export function applyVisualIdentityLock(prompt, protagonist, visualBible, requiredContent = '') {
  const subject = String(protagonist || '').trim().slice(0, 120);
  const identity = String(visualBible || '').trim().slice(0, 360);
  if (!subject || !identity) throw new Error('A shared visual identity reference needs a subject and visual bible.');
  // Model retries can echo the preceding shot's generated identity wrapper.
  // Remove only that known wrapper, including a trailing wrapper cut off by the model.
  const stripLock = value => String(value || '')
    .replace(/Shared visual identity reference for every scene:[\s\S]*?Do not redesign recurring subjects between shots unless the story explicitly changes them\./g, '')
    .replace(/Shared visual identity reference for every scene:[\s\S]*$/, '')
    .replace(/\s+/g, ' ').trim();
  const action = stripLock(requiredContent);
  let content = stripLock(prompt);
  if (action && !content.includes(action)) content = action + ' ' + content;
  if (!content.trim()) throw new Error('The shot has no visual content after removing repeated identity instructions.');
  const lock = `Shared visual identity reference for every scene: ${subject}. ${identity}. Preserve the same defining face, hair, clothing, accessories and proportions for characters, and the same shape, color, material, size and distinctive markings for objects. Do not redesign recurring subjects between shots unless the story explicitly changes them.`;
  // The shot action gets the first 650 characters. Identity uses the remaining budget.
  const visual = clipLine(content, 650);
  const remaining = 1000 - visual.length - 1;
  return `${visual} ${clipLine(lock, remaining)}`;
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
