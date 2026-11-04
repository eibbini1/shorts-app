import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileDigest } from './spec.js';
export interface PublishPack { video: string; thumbnails: string[]; subtitles: string[]; meta: string; qa: string; inputDigest: string; artifactDigests: Record<string,string>; title: string }
export async function verifyPack(file: string, root = process.cwd(), expectedInputDigest?: string): Promise<PublishPack> {
  const pack = JSON.parse(await readFile(file,'utf8')) as PublishPack;
  if (!pack.inputDigest || (expectedInputDigest && pack.inputDigest !== expectedInputDigest)) throw new Error('Pack inputs are stale');
  if (!pack.video || !pack.meta || !pack.qa || !Array.isArray(pack.thumbnails) || pack.thumbnails.length !== 3 || !Array.isArray(pack.subtitles) || pack.subtitles.length !== 2 || !pack.artifactDigests) throw new Error('Incomplete publish pack');
  for (const artifact of [pack.video,pack.meta,pack.qa,...pack.thumbnails,...pack.subtitles]) {
    if (typeof artifact !== 'string' || !pack.artifactDigests[artifact] || await fileDigest(path.resolve(root,artifact)) !== pack.artifactDigests[artifact]) throw new Error('Pack artifact changed or missing: '+artifact);
  }
  const qa = JSON.parse(await readFile(path.resolve(root,pack.qa),'utf8'));
  if (qa.passed !== true || !Array.isArray(qa.results) || !qa.results.length || qa.results.some((r: {hard?:boolean;ok?:boolean}) => r.hard && r.ok !== true)) throw new Error('Pack has no passing QA report');
  return pack;
}
