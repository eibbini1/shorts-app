import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_TAKES = 3;
export const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function motionState(work) {
  try { return JSON.parse(fs.readFileSync(path.join(work, 'motion', 'takes.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

export function verifiedTake(work, record, { scenarioSha256, shot, take, referenceSha256, renderSettings }) {
  if (record?.schemaVersion !== 1 || record.shot !== shot || record.take !== take || record.scenarioSha256 !== scenarioSha256 ||
      (referenceSha256 && record.approvedReferenceSha256 !== referenceSha256) ||
      Object.entries(renderSettings).some(([key, value]) => record.renderSettings?.[key] !== value)) {
    throw new Error(`Take ${take + 1} no longer matches shot ${shot} and its approved settings.`);
  }
  if (typeof record.approvedReferenceSha256 !== 'string') throw new Error('Missing approved source hash.');
  if (!Number.isInteger(record.parts) || record.parts < 1 || record.segments?.length !== record.parts ||
      record.segments.at(-1).clip !== record.clip || record.segments.at(-1).sha256 !== record.clipSha256) {
    throw new Error(`Take ${take + 1} is missing motion segments.`);
  }
  const root = fs.realpathSync(work);
  const checked = (relative, hash) => {
    const file = fs.realpathSync(path.resolve(root, relative));
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile() || sha256(file) !== hash) throw new Error('Cached motion changed.');
  };
  for (const [index, segment] of record.segments.entries()) {
    if (segment.seed !== 2200 + (shot - 1) * 10 + index + 7919 * take) throw new Error('Motion seed changed.');
    checked(segment.clip, segment.sha256);
  }
  if (record.endFrame) checked(record.endFrame, record.endFrameSha256);
  return record;
}

export function availableTakes(work, shot, expected, state = motionState(work)) {
  const entry = state[String(shot - 1)];
  const completed = {};
  for (const [key, record] of Object.entries(entry?.completed || {})) {
    const take = Number(key);
    if (!Number.isInteger(take) || take < 0 || take >= MAX_TAKES) continue;
    try { completed[key] = verifiedTake(work, record, { ...expected, shot, take }); }
    catch { /* stale or missing cache entries cannot be selected */ }
  }
  return { current: entry?.current ?? 0, completed };
}

export function reserveTake(state, requested) {
  if (requested !== undefined) {
    if (!Number.isInteger(requested) || !state.completed[requested]) throw new Error('That take has not been made or its cache changed.');
    return { take: requested, cacheOnly: true };
  }
  const take = Array.from({ length: MAX_TAKES }, (_, i) => i).find((i) => !(i in state.completed));
  if (take === undefined) throw new Error('All three takes are used.');
  return { take, cacheOnly: false };
}

export function technicalObservations(row) {
  if (!Array.isArray(row?.technicalScreen)) return [];
  return row.technicalScreen.filter((entry) => entry && Number.isInteger(entry.part) &&
    typeof entry.clipSha256 === 'string' && row.segments?.[entry.part - 1]?.sha256 === entry.clipSha256 &&
    (entry.reason === null || typeof entry.reason === 'string'));
}

export function commitTakes(work, rows, selection = null, finalExport = null) {
  const state = motionState(work);
  for (const row of rows) {
    const index = row.shot - 1;
    const old = state[index] || {};
    const prior = old.completed?.[row.take];
    const same = prior && JSON.stringify(prior.segments) === JSON.stringify(row.segments) &&
      JSON.stringify(prior.renderSettings) === JSON.stringify(row.renderSettings);
    const updated = same ? { ...prior, ...row } : { ...row };
    const byPart = new Map([...technicalObservations(same ? prior : null), ...technicalObservations(row)]
      .map((entry) => [entry.part, entry]));
    if (byPart.size) {
      updated.technicalScreen = [...byPart.values()].sort((a, b) => a.part - b.part);
      if (byPart.size === row.parts) updated.technicalFlags = updated.technicalScreen.map((entry) => entry.reason).filter(Boolean);
    }
    const completed = { ...(old.completed || {}), [row.take]: updated };
    const current = selection?.shot === row.shot && !selection.select ? old.current ?? row.take : row.take;
    state[index] = { current, highest: Math.max(...Object.keys(completed).map(Number)), completed };
  }
  if (finalExport) state.verifiedExport = finalExport;
  const dir = path.join(work, 'motion');
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `takes-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(state), { flag: 'wx' });
  fs.renameSync(tmp, path.join(dir, 'takes.json'));
}
