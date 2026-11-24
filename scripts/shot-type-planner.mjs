// Opt-in bridge between a drafted plan and the shot-type library (SHORTS_SHOT_TYPES=1).
// It rewrites only imagePrompt and motionPrompt of each shot: timing, narration, sound and the
// sceneState chain stay exactly as planned, so every existing gate still sees the same story.
import { materializeShotRecipe, selectShotTypes } from './shot-types.mjs';
import { selectPeopleStory } from './people-stories.mjs';

const PROMPT_LIMIT = 1000;
const CAMERA_WORDS = /\b(?:camera|zoom(?:s|ing)?|pans?|panning|dolly|push(?:es)? in|tracking|tilts?)\b/i;
const NOT_YET = /\b(?:about to|(?:is|are) going to|prepares? to|preparing to|ready to|poised to|before (?:she|he|they) )/i;
const PLACE_LABEL = /\b(?:place|setting|establish\w*|location|arrival)\b/i;
const FEELING = /\b(?:smil\w*|laugh\w*|grin\w*|sigh\w*|breath\w*|gaz\w*|glanc\w*|nods?|tears?|blinks?|frown\w*|eyes|looks? (?:up|down|at|toward|away))\b/i;
const DETAIL = /\b(?:cream|sauce|filling|liquid|drips?|flows?|pools?|melts?|bubbl\w*|steam\w*|crumbs?|crack\w*|pours?|sprinkl\w*|glaze|syrup|chocolate|dough|juice|oil)\b/i;
const PERSON = /\b(?:she|he|they|her|his|their|person|man|woman)\b/i;

const sentence = (text) => { const t = String(text || '').trim(); return !t ? '' : /[.!?]$/.test(t) ? t : t + '.'; };

// Cut at a sentence boundary so a long identity block never chops the action in half.
function fit(text) {
  if (text.length <= PROMPT_LIMIT) return text;
  const cut = text.slice(0, PROMPT_LIMIT - 1);
  const end = cut.lastIndexOf('. ');
  return end > 200 ? cut.slice(0, end + 1) : cut.trimEnd() + '.';
}

function parseStory(peopleStory) {
  if (peopleStory == null || peopleStory === '') return null;
  let raw = peopleStory;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { throw new Error('peopleStory must be a people-stories selection.'); }
  }
  if (!raw || typeof raw !== 'object' || raw.mode !== 'people-stories') {
    throw new Error('peopleStory must use mode "people-stories".');
  }
  return raw;
}

export function createShotTypeContext({ enabled = process.env.SHORTS_SHOT_TYPES === '1', projectId = '',
  peopleStory = null, explicitSetting = '', explicitPerson = '' } = {}) {
  if (!enabled) return null;
  const raw = parseStory(peopleStory);
  let story = null;
  if (raw) {
    // A saved selection (it already names its studio) is reused unchanged on retries.
    story = raw.studioId && raw.version != null
      ? selectPeopleStory({ enabled: true, mode: 'people-stories', saved: raw })
      : selectPeopleStory({ enabled: true, mode: 'people-stories', projectId, ending: raw.ending || '',
        personId: raw.personId, settingId: raw.settingId, shapeId: raw.shapeId,
        lightingVariantId: raw.lightingVariantId ?? null });
    if (!story || story.status === 'needs-choice') throw new Error('The people-stories selection needs a choice before planning.');
  }
  const studio = story?.backgroundRecipe ?? null;
  return {
    peopleStory: story,
    studio,
    person: String(explicitPerson || story?.people?.description || ''),
    setting: String(explicitSetting || story?.settings?.description || studio?.set || ''),
    shape: story?.shapes ?? null,
  };
}

function beatKind(shot, beat) {
  const label = String(beat?.label ?? beat?.kind ?? beat ?? '');
  if (PLACE_LABEL.test(label)) return { kind: 'place' };
  const action = String(shot.sceneState?.action || shot.narration || '');
  if (DETAIL.test(action) && !PERSON.test(action)) return { kind: 'detail' };
  if (FEELING.test(action)) return { kind: 'feeling' };
  if (DETAIL.test(action)) return { kind: 'detail' };
  return { kind: 'action' };
}

export function applyTypedShots(ctx, { shots, beats = [], outline = {}, ending = '' } = {}) {
  if (!ctx) return { shots };
  if (!Array.isArray(shots) || !shots.length) throw new Error('Typed shots need a drafted shot list.');
  shots.forEach((shot, index) => {
    const state = shot.sceneState;
    if (!state?.action || !state?.before) throw new Error(`Shot ${index + 1} needs a sceneState with before and action.`);
    if (CAMERA_WORDS.test(state.action)) {
      throw new Error(`Shot ${index + 1} action contains a camera instruction; choose the framing instead.`);
    }
    if (NOT_YET.test(state.before)) {
      throw new Error(`Shot ${index + 1} first frame must show the action already underway, not about to start.`);
    }
  });
  const recipes = selectShotTypes({ enabled: true, shotCount: shots.length,
    beats: shots.map((shot, index) => beatKind(shot, beats[index])) });
  const person = ctx.person || outline.protagonist || '';
  const setting = ctx.setting || outline.setting || '';
  const lighting = ctx.studio?.lighting || '';
  const bible = outline.visualBible || '';
  const finalMoment = sentence(ending);
  const typed = shots.map((shot, index) => {
    const made = materializeShotRecipe(recipes[index], { action: shot.sceneState.action, startState: shot.sceneState.before });
    // Action first, identity after: repeated identity text must never push the action past the limit.
    const imagePrompt = fit([made.imagePrompt, person && `Subject: ${sentence(person)}`,
      setting && `Setting: ${sentence(setting)}`, lighting && `Light: ${sentence(lighting)}`, sentence(bible)]
      .filter(Boolean).join(' '));
    const last = index === shots.length - 1;
    const motionPrompt = fit([last && finalMoment ? `Final physical moment: ${finalMoment}` : '', made.motionPrompt]
      .filter(Boolean).join(' '));
    return { ...structuredClone(shot), imagePrompt, motionPrompt };
  });
  return { shots: typed, recipes };
}
