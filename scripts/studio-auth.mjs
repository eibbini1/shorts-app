// Studio authentication, origin allowlist, and per-creator file/session ownership checks.
// TODO(security): Local studio uses shared high-entropy token links for private localhost/Tailscale access rather than OAuth/MFA.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CREATOR_MAX_SECONDS = 20;
export const CREATOR_DAILY_DRAFTS = 12;

export function sameToken(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

export const keyOf = (scenario) => (
  scenario
    ? path.basename(String(scenario)).replace(/\.local-scenario\.json$/, '').replace(/\.json$/, '')
    : null
);

export const canSee = (user, x) => !x || !user || user.role === 'owner' || x.user === user.name;

export function createStudioAuth({ token = '', usersFile, extraOrigins = [], sessions }) {
  // Relatives listed in the users file. A missing file means none were added. null means the file is there but
  // cannot be read as a users list (damaged, or caught mid-write). Callers must treat null as locked, never as
  // "no users": with no users and no owner token, every request is let in as the owner.
  function readUsers() {
    let text;
    try { text = fs.readFileSync(usersFile, 'utf8'); } catch (error) { return error.code === 'ENOENT' ? [] : null; }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const users = parsed.users ?? [];
      return Array.isArray(users) ? users.filter((u) => u && u.name && u.token) : null;
    } catch { return null; }
  }

  const authOn = () => {
    const users = readUsers();
    return Boolean(token) || users === null || users.length > 0;
  };

  function userFor(candidate) {
    if (token && sameToken(candidate, token)) return { name: 'owner', role: 'owner' };
    for (const u of readUsers() || []) {
      const name = String(u.name).slice(0, 40);
      if (name.trim().toLowerCase() !== 'owner' && sameToken(candidate, u.token)) {
        return { name, role: 'creator', dailyRenders: Number(u.dailyRenders) || 3 };
      }
    }
    return null;
  }

  function ownKeys(user) {
    return [...sessions.values()]
      .filter((x) => x.user === user.name && x.scenario)
      .map((x) => keyOf(x.scenario))
      .filter(Boolean);
  }

  function mayUse(user, value) {
    if (user.role === 'owner') return true;
    const file = String(value);
    if (path.isAbsolute(file) || path.normalize(file) !== file) return false;
    const keys = ownKeys(user);
    if (file.startsWith('drafts/generated/')) return keys.includes(keyOf(file));
    // Work folders are named after the whole story file (storage/any-local/<id>.local-scenario), not the bare id.
    if (file.startsWith('storage/any-local/')) {
      const folder = file.split('/')[2];
      return [...sessions.values()].some((x) => x.user === user.name && x.scenario &&
        path.basename(String(x.scenario), '.json') === folder);
    }
    const output = file.startsWith('outputs/') ? file.slice('outputs/'.length) : file;
    return !output.includes('/') && keys.some((key) => output.startsWith(key + '-'));
  }

  function isAllowedOrigin(origin) {
    if (!origin) return true;
    return /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin) || extraOrigins.includes(origin);
  }

  function authenticateRequest(req, res, url, sendJson) {
    if (!isAllowedOrigin(req.headers.origin)) {
      sendJson(res, 403, { error: 'Bad origin' });
      return false;
    }
    req.user = { name: 'owner', role: 'owner' };
    if (authOn()) {
      const cookie = /(?:^|;\s*)studio_token=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      const given = url.searchParams.get('token');
      if (given && userFor(given)) {
        const safeLocation = url.pathname.startsWith('//') ? '/' : url.pathname;
        res.writeHead(302, {
          'Set-Cookie': `studio_token=${encodeURIComponent(given)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
          Location: safeLocation,
        });
        res.end();
        return false;
      }
      let decoded = '';
      try { decoded = decodeURIComponent(cookie || ''); } catch { /* malformed cookie is unauthorized */ }
      const who = userFor(decoded);
      if (!who) {
        res.writeHead(401, { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' });
        res.end('Studio is locked. Open it once with the private link you were given.');
        return false;
      }
      req.user = who;
    }
    return true;
  }

  return {
    readUsers,
    authOn,
    userFor,
    ownKeys,
    mayUse,
    isAllowedOrigin,
    authenticateRequest,
  };
}
