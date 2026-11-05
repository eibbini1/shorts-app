import fs from 'node:fs';
import path from 'node:path';

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const snapshot = read('storage/analytics/bb-latest.json');
const journal = read('storage/automation/uploads.json');
const rows = fs.readFileSync('episodes/hook-log.jsonl', 'utf8')
  .split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
const videos = new Map(snapshot.videos.map(video => [video.id, video]));
const records = Object.entries(journal).map(([specPath, upload]) => {
  const spec = read(specPath);
  const output = path.basename(spec.output);
  const matching = rows.filter(row => row.short === output);
  const hook = matching.length === 1 ? matching[0] : null;
  const video = videos.get(upload.videoId);
  return {
    spec: specPath,
    localHook: hook?.first_line ?? null,
    localHookMatchesCurrentScript: hook ? hook.first_line === spec.scenes?.[0]?.text?.trim() : null,
    localHookRows: matching.length,
    tags: hook?.tags ?? [],
    videoId: upload.videoId ?? null,
    visibility: video?.status?.privacyStatus ?? null,
    scheduledAt: video?.status?.publishAt ?? null,
  };
});
console.log(JSON.stringify({
  capturedAt: snapshot.capturedAt,
  channelId: snapshot.channelId,
  note: 'A local hook match does not prove the uploaded cut uses that line. This report does not infer retention or 24/72-hour views.',
  records,
}, null, 2));
