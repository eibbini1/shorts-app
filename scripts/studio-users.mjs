#!/usr/bin/env node
// Manage relatives who may use the Studio. Each gets their own private link and only sees their own videos.
//   node scripts/studio-users.mjs add "Mum" [dailyVideos=3]   -> prints her link
//   node scripts/studio-users.mjs list
//   node scripts/studio-users.mjs remove "Mum"                -> her link stops working at once (no restart needed)
// Base address for links: STUDIO_PUBLIC_URL (default: local Studio).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = process.env.STUDIO_USERS_FILE || path.join(ROOT, 'storage', 'studio-users.json');
const BASE = (process.env.STUDIO_PUBLIC_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { users: [] }; } };
const save = (d) => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2) + '\n', { mode: 0o600 }); fs.chmodSync(FILE, 0o600); };
const [cmd, name, perDay] = process.argv.slice(2);
const data = load();
if (cmd === 'add' && name) {
  if (data.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) { console.error(`${name} already exists. Remove first to get a new link.`); process.exit(1); }
  const token = crypto.randomBytes(24).toString('base64url');
  data.users.push({ name, token, dailyRenders: Number(perDay) || 3, createdAt: new Date().toISOString() });
  save(data);
  console.log(`${name} added (${Number(perDay) || 3} videos a day). Private link:\n${BASE}/?token=${token}`);
} else if (cmd === 'remove' && name) {
  const before = data.users.length;
  data.users = data.users.filter((u) => u.name.toLowerCase() !== name.toLowerCase());
  save(data); console.log(before === data.users.length ? `No user called ${name}.` : `${name} removed. Their link no longer works.`);
} else if (cmd === 'list') {
  for (const u of data.users) console.log(`${u.name}  ${u.dailyRenders}/day  since ${u.createdAt?.slice(0, 10)}`);
  if (!data.users.length) console.log('No relatives added yet.');
} else {
  console.log('Usage: node scripts/studio-users.mjs add "Name" [videosPerDay] | list | remove "Name"');
}
