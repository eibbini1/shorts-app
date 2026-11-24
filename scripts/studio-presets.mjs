import fs from 'node:fs';

// Read-only CPU resolver. This never creates a reference image.
export function loadStudioPreset(id, lightingVariantId = 'base') {
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid studio ID.');
  const file = new URL('../data/studios/' + id + '.json', import.meta.url);
  if (!fs.existsSync(file)) throw new Error('Unknown studio: ' + id);
  const studio = JSON.parse(fs.readFileSync(file, 'utf8'));
  const variants = studio.lightingVariants ?? [{ id: 'base', lighting: studio.lighting, mood: studio.mood }];
  const lighting = variants.find(row => row.id === lightingVariantId);
  if (!lighting) throw new Error('Unknown lighting variant for ' + id);
  return { ...studio, lighting: lighting.lighting, mood: lighting.mood, lightingVariantId };
}
