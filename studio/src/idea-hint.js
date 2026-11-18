const MOOD = new Set('nice beautiful cool amazing good great best awesome story stories animation animated cartoon video short shorts film movie clip scene idea something thing cute funny epic'.split(' '));
const STOP = new Set('a an the of in on at to and or with for from by is are was it its his her their this that some'.split(' '));
const ACTIONS = new Set(('walk run chase catch pour slice cut chop stir mix bake fry cook grill open close jump fly swim climb push pull throw grab drop fall drizzle spread flip whisk sail dance hug find follow meet build paint write ride drive sprint paddle carry lift hold reach turn smile laugh look wave sing sit stand roll spin slide splash melt glow grow glide land water rest make prepare plate serve add toss simmer boil roast strain dice blend share discover reveal press pull apart arrange plate').split(' '));

function isAction(word) {
  if (ACTIONS.has(word)) return true;
  if (word.endsWith('ing')) {
    const stem = word.slice(0, -3);
    return ACTIONS.has(stem) || ACTIONS.has(stem + 'e') || ACTIONS.has(stem.slice(0, -1));
  }
  if (word.endsWith('ed')) {
    const stem = word.slice(0, -2);
    return ACTIONS.has(stem) || ACTIONS.has(stem + 'e') || ACTIONS.has(stem.slice(0, -1));
  }
  if (word.endsWith('es')) {
    const stem = word.slice(0, -2);
    return ACTIONS.has(stem) || ACTIONS.has(stem + 'e');
  }
  return word.endsWith('s') && ACTIONS.has(word.slice(0, -1));
}

export function ideaHint(text, look, ending = '') {
  const t = text.trim();
  if (!t) return null;
  const words = t.toLowerCase().replace(/[^a-z\s,'-]/g, ' ').split(/\s+/).filter(Boolean);
  const content = words.filter((word) => !STOP.has(word) && !MOOD.has(word));
  const hasAction = words.some(isAction);
  const hasEnding = Boolean(ending.trim()) || /\bthen\b|;|\.\s*\w|,\s*(and\s+)?\w+/i.test(t);
  if (words.length < 4 || content.length < 2) return { level: 'warn', msg: 'Give us a subject and one thing that happens. For example: “A small fox chases a paper boat, then sails away in it.”' };
  if (!hasAction) return { level: 'warn', msg: 'I can’t spot a visible action yet. Say what moves or changes, such as chopping, pouring, stirring, or plating.' };
  if (look === 'food' && !/(food|dish|steak|bread|onion|garlic|noodle|rice|sauce|cake|fruit|soup|kebab|tomato|cheese|egg|chicken|burger|pasta|cook|bake|chef|kitchen|pan|slice|pour|dumpling|curry|salad)/i.test(t)) return { level: 'tip', msg: 'The selected look is Food film, but I don’t see a food subject. Switch looks if that’s intentional.' };
  if (!hasEnding) return { level: 'tip', msg: 'I can see the action. Add what changes by the end, or fill in Required ending. Example: “then folds them into glossy sauce.”' };
  return { level: 'ok', msg: 'Good starting beat. We’ll refine it into a connected story and check that the ending follows logically before making frames.' };
}
