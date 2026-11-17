const ACTIONS = new Set(`add assemble bake bite bloom boil break brown build carry catch chase chew chop crack climb close cook curl cut dance dice dip drizzle drop eat flip float fly fold fry garnish grab grate grow knead leap lick lift look melt mince mix open peel pedal place pour press pull push race react reach reveal roll run scoop sear serve shake slice smash smile sniff spin splash sprinkle stack steer steam stir stumble taste tap toast turn unfurl walk wave whisk`.split(' '));

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
  return words.some((word) => [...roots(word)].some((root) => ACTIONS.has(root)));
}
