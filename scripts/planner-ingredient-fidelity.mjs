// A small bilingual vocabulary for high-impact substitutions seen in planning.
// Unlisted ingredients are outside this deterministic check.
const vocabulary = {
  halloumi: /\b(?:halloumi|haloumi)\b|(?<!\p{L})(?:و|ب|ل)?(?:ال)?(?:حلوم|حلومي)(?!\p{L})/iu,
  lamb: /\blamb\b|(?<!\p{L})(?:ال)?(?:ضأن|ضان|خروف)(?!\p{L})/iu,
  crouton: /\bcroutons?\b|(?<!\p{L})(?:ال)?كروتون(?!\p{L})/iu,
  phyllo: /\b(?:phyllo|filo)\b|عجين(?:ة)? الفيلو/iu,
  beef: /\bbeef\b|لحم البقر|لحم بقري/iu,
  chicken: /\bchicken\b|(?<!\p{L})(?:ال)?دجاج(?!\p{L})/iu,
};

const normalize = text => String(text ?? '').normalize('NFKC')
  .replace(/[\u0640\u064b-\u065f\u0670]/gu, '');

function namedIngredients(text) {
  return Object.entries(vocabulary)
    .filter(([, pattern]) => pattern.test(normalize(text)))
    .map(([ingredient]) => ingredient);
}

export function ingredientContract(...briefFields) {
  const requested = namedIngredients(briefFields.join(' '));
  if (!requested.length) return null;
  return {
    requested,
    unexpected(text) {
      return namedIngredients(text).filter(ingredient => !requested.includes(ingredient));
    },
    missing(text) {
      const actual = namedIngredients(text);
      return requested.filter(ingredient => !actual.includes(ingredient));
    },
  };
}

export function shotIngredientText(shot) {
  return [shot.imagePrompt, shot.motionPrompt, shot.narration, ...Object.values(shot.sceneState ?? {})].join(' ');
}


export function outlineIngredientText(outline) {
  return [outline.title, outline.hook, outline.goal, outline.protagonist].join(' ');
}
