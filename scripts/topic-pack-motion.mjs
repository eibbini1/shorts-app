import { readFileSync } from 'node:fs';

const { packs } = JSON.parse(readFileSync(new URL('../data/topic-packs.json', import.meta.url), 'utf8'));

export function motionPackFor(topic, { foodProcess = false } = {}) {
  const cookingId = 'realistic-hand-heavy-cooking';
  const order = [cookingId, 'realistic-fast-sports-fights', 'animals',
    'gadgets-product-reveals', 'single-object-transformation', 'solo-challenge-comparison',
    'travel-scenic-reveal', 'practical-how-to', 'stylized-character-mini-story'];
  for (const id of order) {
    if (id === cookingId && !foodProcess) continue;
    const pack = packs.find((item) => item.id === id);
    if (pack && new RegExp(pack.topicPattern, 'i').test(topic)) return pack;
  }
  return null;
}

export function motionPackGuidance(pack) {
  if (!pack) return '';
  const simpler = pack.safe.length ? `Prefer these motions where they fit: ${pack.safe.join(', ')}.` : '';
  return `Local motion guidance: ${pack.recipe} ${simpler} Risky for local generation: ${pack.risky.join(', ')}. Preserve explicitly requested actions and endings. Avoid adding risky motion that the user did not ask for.`;
}
