// Shared look & genre profile resolver for Node scripts (studio-server, story-scenario, scenario-schema).
// Reads data/looks.json when present and falls back to an identical built-in config for isolated test fixtures.
import fs from 'node:fs';

export const DEFAULT_LOOKS_CONFIG = Object.freeze({
  version: 1,
  defaultLook: 'food',
  foodKeywords: Object.freeze([
    'arancini', 'bake', 'baked', 'baking', 'beef', 'bowl', 'bread', 'burger',
    'cabbage', 'cake', 'caviar', 'champagne', 'cheese', 'chef', 'chocolate',
    'coffee', 'cook', 'cooked', 'cooker', 'cooking', 'cookware', 'dessert',
    'dish', 'drink', 'dumpling', 'dumplings', 'egg', 'food', 'fries', 'garlic',
    'halloumi', 'hot dog', 'hot-dog', 'kebab', 'kitchen', 'meal', 'noodle', 'noodles',
    'pasta', 'pastry', 'pizza', 'plate', 'recipe', 'salad', 'sauce', 'scallop',
    'sear', 'seared', 'searing', 'soup', 'steak', 'sushi', 'taco', 'toast',
    'toasted', 'truffle', 'wagyu',
  ]),
  foodSubstringKeywords: Object.freeze(['حلوم', 'المقلاة', 'طبخ', 'وصفة']),
  foodOnlyAudioCues: Object.freeze([
    'chew', 'clink', 'crunch', 'fizz', 'pour', 'scrape', 'sizzle', 'slice',
  ]),
  looks: Object.freeze({
    food: Object.freeze({
      label: 'Food & culinary',
      style: 'luxury cinematic food film',
      set: 'dark luxury kitchen',
      defaultStudio: 'luxury-kitchen',
      minPromptScore: 85,
      foodDomain: true,
      chainShotsByDefault: false,
      continuityQuestion: 'The left half and the right half are two moments from one cooking video. Do both halves show the same kind of food with the same kind of topping?',
    }),
    cartoon: Object.freeze({
      label: '2D cartoon',
      style: 'hand-drawn 2D cartoon animation, bold outlines, flat vibrant colors, expressive characters',
      set: 'a colourful storybook world that fits the story',
      defaultStudio: null,
      minPromptScore: 0,
      foodDomain: false,
      chainShotsByDefault: true,
      continuityQuestion: 'The left half and the right half are two moments from one short film. Do both halves show the same main character or object, looking the same?',
    }),
    night: Object.freeze({
      label: 'Night cartoon',
      style: 'hand-drawn 2D cartoon animation at night, deep navy blue sky and shadows with warm creamy ivory highlights, glowing cream lights, limited navy and cream palette, bold outlines',
      set: 'a moonlit navy-blue night scene with cream-coloured lights',
      defaultStudio: null,
      minPromptScore: 0,
      foodDomain: false,
      chainShotsByDefault: true,
      continuityQuestion: 'The left half and the right half are two moments from one short film. Do both halves show the same main character or object, looking the same?',
    }),
    custom: Object.freeze({
      label: 'Custom',
      style: 'cinematic short film matching the idea',
      set: 'a setting that fits the idea',
      defaultStudio: null,
      minPromptScore: 0,
      foodDomain: false,
      chainShotsByDefault: true,
      continuityQuestion: 'The left half and the right half are two moments from one short film. Do both halves show the same main character or object, looking the same?',
    }),
  }),
});

export function loadLooksConfig(fileUrl = new URL('../data/looks.json', import.meta.url)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(fileUrl, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.looks && typeof parsed.looks === 'object') {
      return parsed;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return DEFAULT_LOOKS_CONFIG;
}

const ACTIVE_CONFIG = loadLooksConfig();

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FOOD_PARTS = [
  `\\b(?:${ACTIVE_CONFIG.foodKeywords.map(escapeRegex).join('|')})\\b`,
  ...(Array.isArray(ACTIVE_CONFIG.foodSubstringKeywords) && ACTIVE_CONFIG.foodSubstringKeywords.length
    ? [`(?:${ACTIVE_CONFIG.foodSubstringKeywords.map(escapeRegex).join('|')})`]
    : []),
];
const FOOD_PATTERN = new RegExp(FOOD_PARTS.join('|'), 'i');

export const DEFAULT_LOOK = ACTIVE_CONFIG.defaultLook;
export const STUDIO_LOOKS = Object.freeze({ ...ACTIVE_CONFIG.looks });
export const LOOK_IDS = Object.freeze(Object.keys(STUDIO_LOOKS));
export const FOOD_ONLY_AUDIO_CUES = Object.freeze(new Set(ACTIVE_CONFIG.foodOnlyAudioCues));

export function isValidLook(value) {
  return typeof value === 'string' && Object.hasOwn(STUDIO_LOOKS, value);
}

export function resolveLookId(value) {
  return isValidLook(value) ? value : DEFAULT_LOOK;
}

export function getLookProfile(value) {
  return STUDIO_LOOKS[resolveLookId(value)];
}

export function isFoodText(text) {
  return FOOD_PATTERN.test(String(text || ''));
}

export function isFoodLook(look, text = '') {
  if (isValidLook(look)) {
    if (look === 'custom') return isFoodText(text);
    return Boolean(STUDIO_LOOKS[look].foodDomain);
  }
  return isFoodText(text);
}

export function minPromptScoreForLook(look) {
  return Number(getLookProfile(look).minPromptScore) || 0;
}

export function chainByDefaultForLook(look) {
  return Boolean(getLookProfile(look).chainShotsByDefault);
}
