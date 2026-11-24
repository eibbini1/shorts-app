const ACTIONS = new Set(`add arrange assemble bake baste bite bloom boil break brown build carry catch chase chew chop close coat cook come curl cut dance dice dip drizzle drop eat enter exit emerge flip float fly fold fry garnish grab grate grow knead leap lift load look melt mince mix move open peel pedal place pour prepare press pull push put race react reach remove retrieve reveal roll run scoop sear serve shake slide slice smash smile sniff spin splash sprinkle spread stack steer steam stir stumble take taste tap toast transfer turn unfurl walk wave whisk`.split(' '));
// Verbs beyond the original food-centred list, so novel ideas (craft, sport, nature, sci-fi, product, travel) are not refused as "no visible action".
// Deliberately excludes states and framing words (set, stand, make, show, look at) so abstract or static ideas are still refused.
const MORE_ACTIONS = new Set(`accelerate bang bash blow bolt bounce brake buckle burst cast clap claw click climb collide crack crash crush dart dive drag drain drift drill drip drive empty fasten fill flick fold fry gallop glide grip hammer haul heave hit hoist hop hover hug hurl ignite inflate jump kick knock launch lay lean loosen lower nod paddle paint pick pinch plant plunge polish pop puff pluck quench raise rattle reel ride rise rotate saw scatter scoop scrub season shake shatter shoot sip sail sketch sneeze snap soar solder spill split spray sprint squeeze stitch stop stretch strike surf swap sway sweep swim swing tear tether throw tie tighten toss torch tow trickle twirl twist unfold unlock unscrew unwrap unzip wave weave weld wipe wrap write zip land flutter billow ripple descend step touch crouch straighten kneel lunge swirl whip flap glance gaze pivot stride tumble flicker wander tiptoe hurry skip`.split(' '));
const ARABIC_ACTION = /(?:يكسر|تكسر|يسكب|تسكب|يقطع|تقطع|يقلب|تقلب|يركض|تركض|يصب|تصب|يرفع|ترفع|يقفز|تقفز|يرسم|ترسم|يطبخ|تطبخ|يخبز|تخبز|يقلي|يخلط|تخلط|يعجن|تعجن|يفتح|تفتح|يغلق|يضع|تضع|يسحب|تسحب|يدفع|تدفع|يرش|ترش|يقطّع|يمسك|تمسك|يلقي|تلقي|يطير|تطير|يجري|تجري|يسبح|تسبح|يرقص|ترقص|يطرق|يلمع|يحمل|تحمل|يسقط|تسقط)/;
const PLATE_OBJECTS = new Set(['a', 'an', 'beside', 'each', 'her', 'his', 'it', 'one', 'the', 'their']);
const PRODUCTION_NOTES = /\b(?:film|video|vertical|horizontal|cinematic|captions?|narration|macro details|sync(?:ed|hronized)?|cooking sounds)\b/i;
const GENERIC_SUBJECT = /\b(?:the subject|the focal subject|the food|the dish)\b/i;

function roots(word) {
  const values = new Set([word]);
  if (word.endsWith('ies')) values.add(`${word.slice(0, -3)}y`);
  if (word.endsWith('ing')) {
    const base = word.slice(0, -3);
    values.add(base); values.add(`${base}e`);
    if (base.length > 2 && base.at(-1) === base.at(-2)) values.add(base.slice(0, -1));
  }
  if (word.endsWith('ed')) {
    const base = word.slice(0, -2);
    values.add(base); values.add(`${base}e`);
    if (base.length > 2 && base.at(-1) === base.at(-2)) values.add(base.slice(0, -1));
  }
  if (word.endsWith('es')) values.add(word.slice(0, -2));
  if (word.endsWith('s')) values.add(word.slice(0, -1));
  return values;
}

export function hasVisiblePhysicalAction(value) {
  let text = String(value || '').toLowerCase();
  // In “camera zoom reveals the dish”, reveal describes the camera's framing, not subject motion.
  text = text.replace(/\b(?:camera\s+)?(?:slow(?:ly)?\s+)?zoom(?:s|ed|ing)?\s+reveal(?:s|ed|ing)?\b/g, '');
  if (ARABIC_ACTION.test(text)) return true;
  const words = text.match(/[a-z]+/g) || [];
  return words.some((word, index) => {
    const root = [...roots(word)].find((value) => ACTIONS.has(value) || MORE_ACTIONS.has(value));
    if (!root) return /^(?:plate|plates|plating)$/.test(word) && PLATE_OBJECTS.has(words[index + 1]);
    // A camera moving is not evidence that the filmed subject performed an action.
    return !(root === 'move' && words.slice(Math.max(0, index - 2), index).includes('camera'));
  });
}

export function requestedActionClauses(value) {
  return String(value || '').split(/\s*(?:,\s*(?:and\s+)?then\b|,|\bthen\b|[;.!?])\s*/i)
    .map((text) => text.trim()).filter((text) => actionTokens(text).length > 0 && !PRODUCTION_NOTES.test(text));
}

export function firstRequestedActionClause(value) {
  return requestedActionClauses(value)[0] || '';
}

function actionTokens(value) {
  const text = String(value || '')
    .replace(/\b(?:required user action must be visible in this shot|opening hook must visibly perform the requested first action):[^.!?]*(?:[.!?]|$)/gi, '');
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  return words.flatMap((word, index) => {
    const found = [...roots(word)].find((root) => ACTIONS.has(root));
    if (found) return [found];
    return /^(?:plate|plates|plating)$/.test(word) && PLATE_OBJECTS.has(words[index + 1]) ? ['place'] : [];
  });
}

const ENTRY_ACTIONS = new Set(['enter', 'slide', 'push', 'load', 'place', 'put']);
const EXIT_ACTIONS = new Set(['come', 'emerge', 'exit', 'pull', 'retrieve', 'remove', 'take']);
const ENTRY_PHRASE = /\benter\w*\b|\b(?:slide\w*|push\w*|load\w*|place\w*|put\w*)\b[\s\S]{0,80}\b(?:into|inside)\b/i;
const EXIT_PHRASE = /\b(?:come\w*|emerge\w*|exit\w*|pull\w*|retrieve\w*|remove\w*|take\w*)\b[\s\S]{0,80}\b(?:out|from)\b/i;

function actionCovered(action, clause, motion) {
  if (actionTokens(motion).includes(action)) return true;
  return (ENTRY_ACTIONS.has(action) && ENTRY_PHRASE.test(clause) && ENTRY_PHRASE.test(motion))
    || (EXIT_ACTIONS.has(action) && EXIT_PHRASE.test(clause) && EXIT_PHRASE.test(motion));
}

function subjectAction(clause, subject) {
  const action = clause.trim().replace(/[.!?]+$/, '');
  return subject && !action.toLowerCase().includes(subject.toLowerCase()) ? `${subject} ${action}` : action;
}

function firstFramePrompt(shot, subject, clause) {
  const state = String(shot.sceneState?.before || '').trim().replace(/[.!?]+$/, '');
  return state
    ? `First frame: ${state}.`
    : `First frame: ${subject || 'the subject'} is poised immediately before: ${clause}.`;
}

function sceneActionDetail(shot) {
  const detail = String(shot.sceneState?.action || '').trim().replace(/[.!?]+$/, '');
  return detail && hasVisiblePhysicalAction(detail) && !GENERIC_SUBJECT.test(detail) ? `${detail}. ` : '';
}

function sceneTransition(shot) {
  const before = String(shot.sceneState?.before || '').trim().replace(/[.!?]+$/, '');
  const after = String(shot.sceneState?.after || '').trim().replace(/[.!?]+$/, '');
  if (!before || !after || before.length + after.length > 420) return '';
  return `Starting state: ${before}. Visible end state: ${after}. `;
}

/** Keep recognized user-requested physical-action clauses in storyboard order. */
export function preserveRequestedActions(shots, requestedText, subject = '') {
  if (!Array.isArray(shots) || shots.length === 0) return { status: 'unverified', inserted: [] };
  const clauses = requestedActionClauses(requestedText);
  if (!clauses.length) return { status: 'unverified', inserted: [] };
  let cursor = 0;
  const inserted = [];
  for (let clauseIndex = 0; clauseIndex < clauses.length; clauseIndex++) {
    const clause = clauses[clauseIndex];
    const actions = [...new Set(actionTokens(clause))];
    const positions = [];
    let searchFrom = cursor;
    for (const action of actions) {
      let found = -1;
      for (let shotIndex = searchFrom; shotIndex < shots.length; shotIndex++) {
        if (actionCovered(action, clause, shots[shotIndex].motionPrompt)
          && !GENERIC_SUBJECT.test(shots[shotIndex].motionPrompt)) { found = shotIndex; break; }
      }
      if (found < 0) { positions.length = 0; break; }
      positions.push(found);
      searchFrom = found;
    }
    if (!positions.length) {
      const target = Math.min(shots.length - 1, Math.floor(clauseIndex * shots.length / clauses.length));
      const action = subjectAction(clause, subject);
      shots[target].motionPrompt = `${action}. ${sceneActionDetail(shots[target])}${sceneTransition(shots[target])}Keep ${subject || 'the subject'} and any prop it uses visible; show the change caused by the action in one continuous take.`;
      shots[target].imagePrompt = firstFramePrompt(shots[target], subject, clause);
      inserted.push({ clause, shot: target + 1 });
      const refreshed = actionTokens(shots[target].motionPrompt);
      if (!actions.every((action) => refreshed.includes(action))) {
        throw new Error(`Could not preserve requested action in shot ${target + 1}: ${clause}`);
      }
      cursor = target;
    } else {
      cursor = positions.at(-1);
    }
  }
  return { status: inserted.length ? 'repaired' : 'verified', inserted };
}

export function preserveOpeningHook(shots, hookText, subject = '') {
  if (!Array.isArray(shots) || !shots.length) return { status: 'unverified' };
  const hook = firstRequestedActionClause(hookText);
  if (!hook) return { status: 'unverified' };
  const missing = [...new Set(actionTokens(hook))].filter((action) => !actionCovered(action, hook, shots[0].motionPrompt));
  if (!missing.length && !GENERIC_SUBJECT.test(shots[0].motionPrompt)) return { status: 'verified' };
  const action = subjectAction(hook, subject);
  shots[0].motionPrompt = `${action}. ${sceneActionDetail(shots[0])}${sceneTransition(shots[0])}Keep ${subject || 'the subject'} and any prop it uses visible through the action in one continuous take.`;
  shots[0].imagePrompt = firstFramePrompt(shots[0], subject, hook);
  if (!missing.every((action) => actionTokens(shots[0].motionPrompt).includes(action))) {
    throw new Error(`Could not preserve the opening hook in shot 1: ${hook}`);
  }
  return { status: 'repaired', action: hook };
}
