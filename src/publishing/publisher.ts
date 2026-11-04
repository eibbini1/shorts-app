import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { youtube_v3 } from 'googleapis';
import { verifyPack } from '../automation/pack.js';
import { atomicJson, inputDigest, loadSpec } from '../automation/spec.js';
import { nextPublishSlot } from './schedule.js';

export class PublishingReviewRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishingReviewRequiredError';
  }
}

export interface UploadRecord {
  phase: 'uploading' | 'uploaded' | 'scheduled' | 'uncertain';
  videoId?: string;
  publishAt: string;
  channelId: string;
  videoDigest: string;
  thumbnailDone?: boolean;
  captionsDone?: boolean;
  updatedAt: string;
}
export interface PublishOptions { hour?: number; utcOffsetHours?: number; at?: string; expectedChannelId?: string }
export type UploadJournal = Record<string, UploadRecord>;

export async function readUploadJournal(root: string): Promise<UploadJournal> {
  try { return JSON.parse(await readFile(path.join(root, 'storage/automation/uploads.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
}

/** Persist the remote ID before attachments; never repeat an upload with an ambiguous result. */
export async function publishPack(api: youtube_v3.Youtube, packFile: string, root: string, options: PublishOptions = {}): Promise<UploadRecord> {
  const specFile = packFile.replace(/\.pack\.json$/, '.assemble.json');
  if (specFile === packFile) throw new Error('Expected a .pack.json file');
  const spec = await loadSpec(specFile, root);
  const pack = await verifyPack(packFile, root, await inputDigest(specFile, spec, root));
  const directory = path.join(root, 'storage/automation');
  await mkdir(directory, { recursive: true });
  const lockFile = path.join(directory, 'publishing.lock');
  let lock;
  try { lock = await open(lockFile, 'wx'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Another upload operation holds publishing.lock'); throw error; }
  await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  try {
    const journal = await readUploadJournal(root);
    const key = path.relative(root, specFile).replace(/\\/g, '/');
    let record = journal[key];
    if (record?.phase === 'scheduled') {
      if (record.videoDigest !== pack.artifactDigests[pack.video]) throw new PublishingReviewRequiredError('Local video differs from the existing scheduled upload. Review the uploaded version before publishing changes.');
      return record;
    }
    if (record?.phase === 'uncertain' || record?.phase === 'uploading') throw new Error('A prior upload result is uncertain. Check YouTube Studio and reconcile uploads.json before retrying; refusing a duplicate upload.');

    const channels = await api.channels.list({ part: ['id', 'snippet'], mine: true });
    const channel = channels.data.items?.[0];
    if (!channel?.id || channels.data.items?.length !== 1) throw new Error('Could not identify exactly one authorized YouTube channel');
    if (options.expectedChannelId && channel.id !== options.expectedChannelId) throw new Error('Connected channel differs from the configured publishing channel');
    const bindingFile = path.join(directory, 'channel.json');
    let binding: { id: string } | undefined;
    try { binding = JSON.parse(await readFile(bindingFile, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (binding && binding.id !== channel.id) throw new Error('Connected channel differs from the saved publishing channel');
    if (!binding) await atomicJson(bindingFile, { id: channel.id, title: channel.snippet?.title });
    if (record && record.channelId !== channel.id) throw new Error('Upload belongs to a different YouTube channel');
    const persist = async () => { record!.updatedAt = new Date().toISOString(); journal[key] = record!; await atomicJson(path.join(directory, 'uploads.json'), journal); };
    if (record && record.videoDigest !== pack.artifactDigests[pack.video]) throw new PublishingReviewRequiredError('Video changed after upload. Review the existing private upload before replacing it.');
    if (record?.videoId && record.thumbnailDone && record.captionsDone) {
      // An earlier update may have succeeded before the status read caught up.
      const existingStatus = (await api.videos.list({ part: ['status'], id: [record.videoId] })).data.items?.[0]?.status;
      if (existingStatus?.privacyStatus === 'private' && Date.parse(existingStatus.publishAt ?? '') === Date.parse(record.publishAt)) {
        record.phase = 'scheduled'; await persist();
        return record;
      }
      if (existingStatus?.privacyStatus !== 'private') throw new Error('Expected an existing private upload; check its status in YouTube Studio before retrying.');
    }

    if (!record) {
      const at = options.at ?? nextPublishSlot(new Date(), Object.values(journal).map(r => r.publishAt), options.hour, options.utcOffsetHours);
      if (!Number.isFinite(Date.parse(at)) || Date.parse(at) <= Date.now() + 3600000) throw new Error('Publication must be more than one hour in the future');
      const metadata = JSON.parse(await readFile(path.resolve(root, pack.meta), 'utf8')) as { title: string; description: string; tags: string[]; categoryId?: string; language?: string };
      if (!metadata.title?.trim() || metadata.title.length > 100 || typeof metadata.description !== 'string' || metadata.description.length > 5000 || !Array.isArray(metadata.tags)) throw new Error('Invalid upload metadata');
      record = { phase: 'uploading', publishAt: new Date(at).toISOString(), channelId: channel.id, videoDigest: pack.artifactDigests[pack.video]!, updatedAt: new Date().toISOString() };
      await persist();
      try {
        const response = await api.videos.insert({
          part: ['snippet', 'status'],
          requestBody: {
            snippet: { title: metadata.title, description: metadata.description, tags: metadata.tags, categoryId: metadata.categoryId ?? '24', defaultLanguage: metadata.language ?? 'en', defaultAudioLanguage: metadata.language ?? 'en' },
            status: { privacyStatus: 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
          },
          media: { body: createReadStream(path.resolve(root, pack.video)) },
        }, { retry: false });
        if (!response.data.id) throw new Error('YouTube returned no video ID');
        record.videoId = response.data.id;
        record.phase = 'uploaded';
        await persist();
      } catch (error) { record.phase = record.videoId ? 'uploaded' : 'uncertain'; await persist(); throw error; }
    }
    const id = record.videoId;
    if (!id) throw new Error('Upload journal has no remote video ID');
    if (!record.thumbnailDone) {
      await api.thumbnails.set({ videoId: id, media: { body: createReadStream(path.resolve(root, pack.thumbnails[0]!)) } });
      record.thumbnailDone = true; await persist();
    }
    if (!record.captionsDone) {
      const name = 'English - Shorts App';
      const captions = await api.captions.list({ part: ['snippet'], videoId: id });
      if (!captions.data.items?.some(c => c.snippet?.name === name && c.snippet?.language === 'en')) {
        await api.captions.insert({ part: ['snippet'], requestBody: { snippet: { videoId: id, language: 'en', name, isDraft: false } }, media: { body: createReadStream(path.resolve(root, pack.subtitles.find(s => s.endsWith('.srt'))!)) } }, { retry: false });
      }
      record.captionsDone = true; await persist();
    }
    if (Date.parse(record.publishAt) <= Date.now() + 3600000) {
      record.publishAt = nextPublishSlot(new Date(), Object.entries(journal).filter(([k]) => k !== key).map(([, r]) => r.publishAt), options.hour, options.utcOffsetHours);
      await persist();
    }
    await api.videos.update({ part: ['status'], requestBody: { id, status: { privacyStatus: 'private', publishAt: record.publishAt, selfDeclaredMadeForKids: false, containsSyntheticMedia: true } } });
    const confirmed = await api.videos.list({ part: ['status'], id: [id] });
    const status = confirmed.data.items?.[0]?.status;
    if (status?.privacyStatus !== 'private' || !status.publishAt || Date.parse(status.publishAt) !== Date.parse(record.publishAt)) throw new Error('YouTube did not confirm the publication schedule; the uploaded video stays private. Check API project restrictions.');
    record.phase = 'scheduled'; await persist();
    return record;
  } finally { await lock.close(); await rm(lockFile, { force: true }); }
}
