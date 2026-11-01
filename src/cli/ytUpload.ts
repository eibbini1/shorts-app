import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { google } from 'googleapis';

/**
 * Upload + schedule to YouTube through the official Data API (no browser clicking).
 *   One-time:  put OAuth "Desktop app" credentials at secrets/client_secret.json, then  npm run yt-upload -- --auth
 *   Upload:    npm run yt-upload -- --video storage/episodes/x/x-final.mp4 --meta episodes/x.meta.json [--at 2026-11-02T00:00:00Z] [--thumb path.jpg]
 *   From plan: npm run yt-upload -- --plan episodes/schedule.plan.json   (video path = meta path with the episode's output)
 * IMPORTANT: until the Google Cloud project passes YouTube's API compliance audit, videos uploaded through the API
 * are locked to PRIVATE. Uploading still saves all fields; publish them once in Studio, or request the audit.
 * Each upload costs about 1600 quota units of the default 10,000/day.
 */
const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const root = process.cwd();
const secretPath = path.join(root, 'secrets', 'client_secret.json');
const tokenPath = path.join(root, 'secrets', 'yt_token.json');
const PORT = 53682;
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'];

if (!existsSync(secretPath)) {
  console.error(`Missing ${secretPath}. Create an OAuth client (type: Desktop app) in Google Cloud Console, enable "YouTube Data API v3", download the JSON to that path.`);
  process.exit(1);
}
const cred = JSON.parse(await readFile(secretPath, 'utf8'));
const c = cred.installed ?? cred.web;
const oauth = new google.auth.OAuth2(c.client_id, c.client_secret, `http://127.0.0.1:${PORT}`);

async function authorize() {
  const url = oauth.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
  console.log('Open this URL signed in as the Billionaire Bites channel owner:\n' + url);
  const code = await new Promise<string>((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
      const cd = u.searchParams.get('code');
      res.end(cd ? 'Authorized. You can close this tab.' : 'No code.');
      srv.close();
      cd ? resolve(cd) : reject(new Error('no code'));
    }).listen(PORT, '127.0.0.1');
  });
  const { tokens } = await oauth.getToken(code);
  await mkdir(path.dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, JSON.stringify(tokens), 'utf8');
  console.log('Saved token to secrets/yt_token.json');
}

if (process.argv.includes('--auth')) {
  await authorize();
  process.exit(0);
}
if (!existsSync(tokenPath)) {
  console.error('Not authorized yet. Run: npm run yt-upload -- --auth');
  process.exit(1);
}
oauth.setCredentials(JSON.parse(await readFile(tokenPath, 'utf8')));
const yt = google.youtube({ version: 'v3', auth: oauth });

async function upload(video: string, metaPath: string, at?: string, thumb?: string) {
  const meta = JSON.parse(await readFile(path.resolve(root, metaPath), 'utf8'));
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId ?? '24', defaultLanguage: meta.language ?? 'en', defaultAudioLanguage: meta.language ?? 'en' },
      status: {
        privacyStatus: at ? 'private' : 'private',
        ...(at ? { publishAt: new Date(at).toISOString() } : {}),
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true,
      } as never,
    },
    media: { body: createReadStream(path.resolve(root, video)) },
  });
  const id = res.data.id!;
  console.log(`uploaded ${id}  https://youtu.be/${id}  ${at ? 'scheduled ' + at : '(private)'}`);
  if (thumb) await yt.thumbnails.set({ videoId: id, media: { body: createReadStream(path.resolve(root, thumb)) } });
  return id;
}

const plan = arg('plan');
if (plan) {
  const items = JSON.parse(await readFile(path.resolve(root, plan), 'utf8')) as { file: string; publishAtUtc: string }[];
  for (const it of items) {
    const base = it.file.replace(/\.meta\.json$/, '');
    const spec = JSON.parse((await readFile(path.resolve(root, base + '.assemble.json'), 'utf8')).replace(/^﻿/, '')) as { output: string };
    await upload(spec.output, it.file, it.publishAtUtc);
  }
} else {
  await upload(arg('video')!, arg('meta')!, arg('at'), arg('thumb'));
}
