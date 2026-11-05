import { readFile } from 'node:fs/promises';
import { authenticatedYouTube } from '../src/publishing/auth.ts';

const read = async (file) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const config = await read('automation.json');
const expected = config.publish?.expectedChannelId;
const snapshot = await read('storage/analytics/bb-latest.json');
if (!expected || snapshot.channelId !== expected) throw new Error('Refresh the verified BB channel snapshot first.');
const { api } = await authenticatedYouTube(process.cwd());
const channels = (await api.channels.list({ part: ['id'], mine: true })).data.items ?? [];
if (channels.length !== 1 || channels[0]?.id !== expected) throw new Error('Connected channel is not the configured BB channel.');

const candidates = snapshot.videos.filter((video) => video.status?.privacyStatus === 'public' && Number(video.statistics?.commentCount) > 0).slice(0, 12);
const report = [];
for (const video of candidates) {
  try {
    const page = (await api.commentThreads.list({ part: ['snippet'], videoId: video.id, textFormat: 'plainText', maxResults: 20, order: 'time' })).data;
    const threads = (page.items ?? []).flatMap(({ snippet }) => {
      const comment = snippet?.topLevelComment?.snippet;
      if (!comment?.authorChannelId?.value || comment.authorChannelId.value === expected || snippet.totalReplyCount !== 0) return [];
      return [{ commentId: snippet.topLevelComment.id, text: comment.textDisplay }];
    });
    report.push({ videoId: video.id, title: video.snippet?.title, threads, moreThreads: !!page.nextPageToken });
  } catch (error) {
    report.push({ videoId: video.id, title: video.snippet?.title, error: error.response?.data?.error?.errors?.[0]?.reason ?? 'read-failed' });
  }
}
console.log(JSON.stringify({ note: 'Review only: latest 20 threads per selected video; only viewer threads with zero replies. No comments are posted.', snapshotAt: snapshot.capturedAt, report }, null, 2));
