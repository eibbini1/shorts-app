import 'dotenv/config';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { youtube_v3 } from 'googleapis';
import { authenticatedYouTube } from '../publishing/auth.js';
import { atomicJson } from '../automation/spec.js';

const root = process.cwd();
const config = JSON.parse(await readFile(path.join(root, 'automation.json'), 'utf8'));
const expectedChannelId = config.publish?.expectedChannelId;
if (typeof expectedChannelId !== 'string' || !expectedChannelId.trim()) {
  throw new Error('Set publish.expectedChannelId in automation.json before collecting channel statistics');
}
const { api } = await authenticatedYouTube(root);
const channels = (await api.channels.list({
  part: ['snippet', 'statistics', 'contentDetails'],
  mine: true,
})).data.items ?? [];
const channel = channels[0];
if (channels.length !== 1 || channel?.id !== expectedChannelId) {
  throw new Error('Connected channel differs from the configured publishing channel');
}
const playlistId = channel.contentDetails?.relatedPlaylists?.uploads;
if (!playlistId) throw new Error('Channel has no uploads playlist');

const ids = new Set<string>();
let pageToken: string | undefined;
do {
  const page = await api.playlistItems.list({
    part: ['contentDetails'],
    playlistId,
    maxResults: 50,
    ...(pageToken ? { pageToken } : {}),
  });
  for (const item of page.data.items ?? []) {
    if (item.contentDetails?.videoId) ids.add(item.contentDetails.videoId);
  }
  pageToken = page.data.nextPageToken ?? undefined;
} while (pageToken);

const videos: youtube_v3.Schema$Video[] = [];
const videoIds = [...ids];
for (let offset = 0; offset < videoIds.length; offset += 50) {
  const page = await api.videos.list({
    part: ['snippet', 'statistics', 'contentDetails', 'status'],
    id: videoIds.slice(offset, offset + 50),
  });
  videos.push(...(page.data.items ?? []));
}
const capturedAt = new Date().toISOString();
const snapshot = {
  capturedAt,
  channelId: channel.id,
  channelStatistics: channel.statistics,
  requestedVideoCount: videoIds.length,
  returnedVideoCount: videos.length,
  limitation: 'Data API counts omit retention and stayed to watch. Use equal age windows and Studio exports for creative comparisons.',
  videos,
};
const directory = path.join(root, 'storage', 'analytics');
const archive = path.join(directory, 'bb-' + capturedAt.replace(/[:.]/g, '-') + '.json');
await atomicJson(archive, snapshot);
await atomicJson(path.join(directory, 'bb-latest.json'), snapshot);
console.log('Saved ' + videos.length + ' videos to ' + path.relative(root, archive));
