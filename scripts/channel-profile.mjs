import { readFile } from 'node:fs/promises';
import { z } from 'zod';
const profileSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  brand: z.string().trim().min(1).max(120),
  audience: z.string().trim().min(1),
  tone: z.string().trim().min(1),
  visualStyle: z.string().trim().min(1),
  catalogFile: z.string().min(1).optional(),
});
export async function loadChannel(file) {
  return profileSchema.parse(JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')));
}
export async function channelCatalog(profile) {
  if (!profile.catalogFile) return [];
  try {
    const snapshot = JSON.parse((await readFile(profile.catalogFile, 'utf8')).replace(/^\uFEFF/, ''));
    if (!Array.isArray(snapshot.videos)) throw new Error('Channel catalog requires a videos array');
    return snapshot.videos.map(video => video.snippet?.title ?? video.title).filter(title => typeof title === 'string').slice(0, 60);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
