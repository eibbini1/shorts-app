import fs from 'node:fs';
import crypto from 'node:crypto';
import { loadStudioPreset } from './studio-presets.mjs';

const catalogue = JSON.parse(fs.readFileSync(new URL('../data/people-stories.json', import.meta.url)));
const dimensions = [['personId', 'people'], ['settingId', 'settings'], ['shapeId', 'shapes']];

// Pure selector. Callers supply session snapshots; no learning or media files are read.
export function selectPeopleStory({ enabled = process.env.SHORTS_VARIETY === '1',
  mode, user, projectId, sessions = [], saved = null, ending = '', lightingVariantId = null, ...explicit } = {}) {
  if (!enabled || mode !== 'people-stories') return null;
  if (saved) return structuredClone(saved);
  const history = sessions.filter(row => row.user === user && row.status === 'done' &&
    row.kind === 'render' && row.video && row.technicalQa?.status === 'passed')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, catalogue.historyWindow);
  const result = { version: catalogue.version, mode, ending, warnings: [] };
  for (const [key, group] of dimensions) {
    const pool = catalogue[group];
    const recent = new Set(history.map(row => row.options?.varietySelection?.[key]).filter(Boolean));
    const pinned = explicit[key];
    if (pinned && !pool.some(row => row.id === pinned)) throw new Error('Unknown ' + key);
    const candidates = pinned ? pool.filter(row => row.id === pinned) : pool.filter(row => !recent.has(row.id));
    if (!candidates.length) return { status: 'needs-choice', dimension: key, version: catalogue.version };
    // Independent salts prevent a fixed person-to-place pairing.
    const hash = crypto.createHash('sha256').update(String(projectId) + ':' + key).digest().readUInt32BE();
    const choice = candidates[hash % candidates.length];
    result[key] = choice.id;
    result[group] = structuredClone(choice);
    if (pinned && recent.has(pinned)) result.warnings.push('Explicit repeat: ' + key);
  }
  result.studioId = result.settings.studioId;
  const studio = loadStudioPreset(result.studioId);
  const lighting = lightingVariantId ?? studio.lightingVariants[
    crypto.createHash('sha256').update(String(projectId) + ':lighting').digest().readUInt32BE() % studio.lightingVariants.length].id;
  result.backgroundRecipe = loadStudioPreset(result.studioId, lighting);
  return result;
}
