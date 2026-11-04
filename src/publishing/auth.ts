import { readFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { OAuth2Client, CodeChallengeMethod, type Credentials } from 'google-auth-library';
import { google } from 'googleapis';
import { atomicJson } from '../automation/spec.js';

const scopes = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.force-ssl'];

async function clientCredentials(root: string) {
  const file = path.join(root, 'secrets/client_secret.json');
  let json;
  try { json = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('YouTube is not connected. Follow docs/YOUTUBE_SETUP.md and save Desktop OAuth client JSON at secrets/client_secret.json.');
    throw error;
  }
  const client = json.installed;
  if (!client?.client_id || !client?.client_secret) throw new Error('OAuth client must be of type Desktop app');
  return client as { client_id: string; client_secret: string };
}

export async function saveCredentials(root: string, next: Credentials): Promise<void> {
  const file = path.join(root, 'secrets/yt_token.json');
  let previous: Credentials = {};
  try { previous = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await atomicJson(file, { ...previous, ...next, refresh_token: next.refresh_token ?? previous.refresh_token });
}

export async function authorizeYouTube(root: string, showUrl: (url: string) => void = console.log): Promise<void> {
  const client = await clientCredentials(root);
  const state = randomBytes(32).toString('hex');
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/oauth2callback' || url.searchParams.get('state') !== state) {
      res.writeHead(400); res.end('Invalid authorization callback.'); return;
    }
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400); res.end('Authorization was declined.');
      rejectCode(new Error('Google authorization was declined')); return;
    }
    res.end('YouTube connected. You can close this tab.');
    resolveCode(code);
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start OAuth callback server');
  const oauth = new OAuth2Client(client.client_id, client.client_secret, 'http://127.0.0.1:' + address.port + '/oauth2callback');
  const verifier = await oauth.generateCodeVerifierAsync();
  const timeout = setTimeout(() => rejectCode(new Error('YouTube authorization timed out after 5 minutes; run --auth again')), 300000);
  try {
    showUrl(oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: scopes, state, code_challenge: verifier.codeChallenge, code_challenge_method: CodeChallengeMethod.S256 }));
    const { tokens } = await oauth.getToken({ code: await codePromise, codeVerifier: verifier.codeVerifier });
    if (!tokens.refresh_token) throw new Error('Google returned no refresh token; retry authorization with consent');
    await saveCredentials(root, tokens);
  } finally { clearTimeout(timeout); server.close(); server.closeAllConnections(); }
}

export async function authenticatedYouTube(root: string) {
  const client = await clientCredentials(root);
  const oauth = new OAuth2Client(client.client_id, client.client_secret);
  let token: Credentials;
  try { token = JSON.parse(await readFile(path.join(root, 'secrets/yt_token.json'), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Run npm run yt-upload -- --auth to connect your YouTube channel');
    throw error;
  }
  if (!token.refresh_token) throw new Error('No refresh token; run npm run yt-upload -- --auth');
  oauth.setCredentials(token);
  await oauth.getAccessToken();
  await saveCredentials(root, oauth.credentials);
  return { api: google.youtube({ version: 'v3', auth: oauth }), oauth };
}
