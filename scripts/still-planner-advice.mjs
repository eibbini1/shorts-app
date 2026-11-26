import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultDirectory = fileURLToPath(new URL('../storage/learning/', import.meta.url));
const types = [
  ['overhead', /overhead|top.down/i], ['mid-air', /mid.air|floating|suspended/i],
  ['pour', /\bpour/i], ['macro-close-up', /macro|close.up/i], ['hero', /\bhero\b/i],
];
const rules = [
  ['premature-result', /bare bun|already (?:assembled|stacked|finished|cut)|premature/i,
    'Show only the starting state of this beat. Exclude items that arrive in later beats.'],
  ['invisible-check', /smoky|taste|cannot (?:tell|distinguish)|not visible/i,
    'Use only observable first-frame checks. Describe visible shape, position and contact.'],
  ['extra-subject', /extra (?:hand|finger|person)|duplicate/i,
    'State the expected subject count and keep any unused hand outside the frame.'],
];

export async function readStillAdvice(directory = process.env.STILL_LESSONS_DIR || defaultDirectory) {
  let file;
  try {
    file = await open(join(directory, 'still-rejections.jsonl'));
    const { size } = await file.stat();
    const buffer = Buffer.alloc(Math.min(size, 64 * 1024));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, size - buffer.length);
    const lines = buffer.subarray(0, bytesRead).toString('utf8').split('\n');
    if (size > buffer.length) lines.shift();
    return lines.flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch {
    return [];
  } finally {
    await file?.close();
  }
}

export function stillAdviceFor(rows, text) {
  const shotType = types.find(([, pattern]) => pattern.test(text))?.[0];
  if (!shotType) return [];
  return rules.flatMap(([id, pattern, advice]) =>
    rows.some((row) => row?.shotType === shotType && typeof row.reason === 'string' && pattern.test(row.reason))
      ? [{ id, shotType, advice }] : []);
}
