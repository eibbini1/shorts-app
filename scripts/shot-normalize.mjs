// Lenient repair of a local story model's shot JSON before schema validation.
// Small local models often return visualChecks as a list, omit empty arrays, or
// write one very long motionPrompt. These are fixable shape problems, not bad stories.
const MAX_LINE = 1000;
const MAX_ITEMS = 5;
const BACK_VIEW = /\b(?:from behind|back view|back to (?:the )?camera|rear view|seen from the back|turned away)\b/i;
const FACE_QUESTION = /\b(?:expression|smil\w*|face|facial|eyes?)\b/i;
const showsBack = shot => BACK_VIEW.test(`${shot.imagePrompt || ''} ${shot.motionPrompt || ''}`);

export function clipLine(value, max = MAX_LINE) {
  if (typeof value !== 'string') return value;
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (sentence >= max * 0.5) return head.slice(0, sentence + 1).trim();
  const space = head.lastIndexOf(' ');
  return (space > max * 0.5 ? head.slice(0, space) : head).replace(/[,;:\s]+$/, '').trim();
}

function strings(list) {
  if (!Array.isArray(list)) return typeof list === 'string' && list.trim() ? [clipLine(list)] : [];
  return list.filter(item => typeof item === 'string' && item.trim()).map(item => clipLine(item)).slice(0, MAX_ITEMS);
}

export function normalizeVisualChecks(value) {
  if (Array.isArray(value)) {
    const objects = value.filter(item => item && typeof item === 'object' && !Array.isArray(item));
    if (objects.length) {
      return {
        mustShow: strings(objects.flatMap(item => strings(item.mustShow))),
        mustNotShow: strings(objects.flatMap(item => strings(item.mustNotShow))),
        questions: strings(objects.flatMap(item => strings(item.questions))),
      };
    }
    // A plain list of strings: treat as facts visible in the first frame.
    return { mustShow: strings(value), mustNotShow: [], questions: [] };
  }
  if (value && typeof value === 'object') {
    return { mustShow: strings(value.mustShow), mustNotShow: strings(value.mustNotShow), questions: strings(value.questions) };
  }
  return value;
}

export function normalizeShot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const shot = { ...raw };
  for (const key of ['narration', 'imagePrompt', 'motionPrompt', 'sound']) shot[key] = clipLine(shot[key]);
  if (shot.sceneState && typeof shot.sceneState === 'object') {
    shot.sceneState = Object.fromEntries(Object.entries(shot.sceneState).map(([k, v]) => [k, clipLine(v)]));
  }
  if ('visualChecks' in shot) shot.visualChecks = normalizeVisualChecks(shot.visualChecks);
  if (shot.visualChecks && typeof shot.visualChecks === 'object' && showsBack(shot)) {
    // A face cannot be judged from behind; asking would force a pointless still regeneration.
    const kept = shot.visualChecks.questions.filter(q => !FACE_QUESTION.test(q));
    shot.visualChecks = { ...shot.visualChecks, questions: kept };
  }
  return shot;
}
