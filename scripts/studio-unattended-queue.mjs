import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const LOOKS = new Set(['food', 'cartoon', 'night', 'custom']);
const ORIENTATIONS = new Set(['vertical', 'wide']);
const QUALITIES = new Set(['standard', 'high']);
const AUDIOS = new Set(['asmr', 'voiced', 'auto']);
const ANCHORS = new Set(['identity', 'previous-end']);
const MAX_QUEUE_ITEMS = 10;

export function sanitizeQueueEntry(raw = {}) {
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim().slice(0, 600) : '';
  if (prompt.length < 4) throw new Error('Write at least 4 characters for a queued video idea.');
  const look = LOOKS.has(raw.look) ? raw.look : 'food';
  const orientation = ORIENTATIONS.has(raw.orientation) ? raw.orientation : 'vertical';
  const requestedSeconds = Math.min(60, Math.max(10, Math.round(Number(raw.seconds) || 10)));
  const seconds = orientation === 'wide' ? 60 : requestedSeconds;
  const quality = QUALITIES.has(raw.quality) ? raw.quality : 'standard';
  const audio = AUDIOS.has(raw.audio) ? raw.audio : 'asmr';
  const continuityAnchor = ANCHORS.has(raw.continuityAnchor) ? raw.continuityAnchor : 'identity';
  const setting = typeof raw.setting === 'string' ? raw.setting.trim().slice(0, 200) : '';
  const ending = typeof raw.ending === 'string' ? raw.ending.trim().slice(0, 300) : '';
  return {
    id: typeof raw.id === 'string' && /^[\w-]{8,64}$/.test(raw.id) ? raw.id : crypto.randomUUID(),
    prompt,
    look,
    seconds,
    orientation,
    quality,
    audio,
    continuityAnchor,
    setting,
    ending,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

export function resolveUnattendedRefinement(refined, fallbackPrompt) {
  if (!refined || typeof refined !== 'object') return null;
  if (refined.decision === 'ready' && typeof refined.refinedPrompt === 'string' && refined.refinedPrompt.trim()) {
    return {
      prompt: refined.refinedPrompt.trim(),
      hook: refined.hook || '',
      mustShow: refined.mustShow || fallbackPrompt,
      obstacle: refined.obstacle || '',
      turn: refined.turn || '',
      ending: refined.ending || '',
      model: refined.model || null,
    };
  }
  if (refined.decision === 'needs_choices' && Array.isArray(refined.choices) && refined.choices.length > 0) {
    const first = refined.choices[0];
    if (first && typeof first.prompt === 'string' && first.prompt.trim()) {
      return {
        prompt: first.prompt.trim(),
        hook: first.hook || '',
        mustShow: first.mustShow || fallbackPrompt,
        obstacle: first.obstacle || '',
        turn: first.turn || '',
        ending: first.ending || '',
        model: refined.model || null,
      };
    }
  }
  return null;
}

export function createUnattendedQueueStore({ file }) {
  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { autoNext: true, items: [] };
      }
      const items = Array.isArray(parsed.items)
        ? parsed.items.flatMap((item) => {
            try { return [sanitizeQueueEntry(item)]; } catch { return []; }
          }).slice(0, MAX_QUEUE_ITEMS)
        : [];
      return {
        autoNext: parsed.autoNext !== false,
        items,
      };
    } catch {
      return { autoNext: true, items: [] };
    }
  }

  function save(state) {
    const normalized = {
      autoNext: Boolean(state.autoNext),
      items: (Array.isArray(state.items) ? state.items : []).slice(0, MAX_QUEUE_ITEMS),
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
    return normalized;
  }

  return {
    read,
    add(raw) {
      const current = read();
      if (current.items.length >= MAX_QUEUE_ITEMS) {
        throw new Error(`Up next holds up to ${MAX_QUEUE_ITEMS} unattended ideas.`);
      }
      const entry = sanitizeQueueEntry(raw);
      return save({ autoNext: true, items: [...current.items, entry] });
    },
    remove(id) {
      const current = read();
      return save({
        ...current,
        items: current.items.filter((item) => item.id !== String(id || '')),
      });
    },
    move(index, delta) {
      const current = read();
      const from = Number(index);
      const step = Number(delta);
      const to = from + step;
      if (!Number.isInteger(from) || ![-1, 1].includes(step) || from < 0 || from >= current.items.length || to < 0 || to >= current.items.length) {
        return current;
      }
      const items = [...current.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return save({ ...current, items });
    },
    setAutoNext(autoNext) {
      const current = read();
      return save({ ...current, autoNext: Boolean(autoNext) });
    },
    clear() {
      const current = read();
      return save({ ...current, items: [] });
    },
    shift() {
      const current = read();
      if (!current.autoNext || current.items.length === 0) return null;
      const [first, ...rest] = current.items;
      save({ ...current, items: rest });
      return first;
    },
    unshiftFront(entry) {
      const current = read();
      return save({ ...current, items: [entry, ...current.items].slice(0, MAX_QUEUE_ITEMS) });
    },
  };
}
