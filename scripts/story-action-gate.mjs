const ACTIONS = new Set(`add arrange assemble bake baste bite bloom boil break brown build carry catch chase chew chop close coat cook curl cut dance dice dip drizzle drop eat flip float fly fold fry garnish grab grate grow knead leap lick lift look melt mince mix move open peel pedal place pour prepare press pull push race react reach reveal roll run scoop sear serve shake slice smash smile sniff spin splash sprinkle stack steer steam stir stumble taste tap toast turn unfurl walk wave whisk`.split(' '));
const PLATE_OBJECTS = new Set(['a', 'an', 'beside', 'each', 'her', 'his', 'it', 'one', 'the', 'their']);
const PRODUCTION_NOTES = /\b(?:film|video|vertical|horizontal|cinematic|captions?|narration|macro details|sync(?:ed|hronized)?|cooking sounds)\b/i;

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
  const words = text.match(/[a-z]+/g) || [];
  return words.some((word, index) => {
    const root = [...roots(word)].find((value) => ACTIONS.has(value));
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

/** Keep recognized user-requested physical-action clauses in storyboard order. */
export function preserveRequestedActions(shots, requestedText) {
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
        if (actionTokens(shots[shotIndex].motionPrompt).includes(action)) { found = shotIndex; break; }
      }
      if (found < 0) { positions.length = 0; break; }
      positions.push(found);
      searchFrom = found;
    }
    if (!positions.length) {
      const target = Math.min(shots.length - 1, Math.floor(clauseIndex * shots.length / clauses.length));
      shots[target].motionPrompt = `The subject performs this requested physical action now: ${clause}. `
        + 'Keep the relevant ingredient and tool visible, show the change caused by the action, and use one continuous take.';
      shots[target].imagePrompt = `Start frame for the requested action: show the subject, needed ingredient, and tool poised immediately before: ${clause}.`;
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

export function preserveOpeningHook(shots, hookText) {
  if (!Array.isArray(shots) || !shots.length) return { status: 'unverified' };
  const hook = firstRequestedActionClause(hookText);
  if (!hook) return { status: 'unverified' };
  const missing = [...new Set(actionTokens(hook))].filter((action) => !actionTokens(shots[0].motionPrompt).includes(action));
  if (!missing.length) return { status: 'verified' };
  shots[0].motionPrompt = `The subject performs the requested opening action now: ${hook}. `
    + 'Keep the subject and relevant tool visible through the action in one continuous take.';
  shots[0].imagePrompt = `Opening-hook start frame: show the subject and tool poised immediately before: ${hook}.`;
  if (!missing.every((action) => actionTokens(shots[0].motionPrompt).includes(action))) {
    throw new Error(`Could not preserve the opening hook in shot 1: ${hook}`);
  }
  return { status: 'repaired', action: hook };
}
