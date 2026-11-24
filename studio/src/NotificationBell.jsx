import { useCallback, useEffect, useRef, useState } from 'react';
import { failureHelp } from './failure-help.js';
import {
  addEvent, eventFromTransition, loadItems, loadPrefs, markAllRead, markRead, relativeTime, saveItems, savePrefs,
  sessionEvents, unreadCount,
} from './notifications.js';

const store = (() => { try { return window.localStorage; } catch { return null; } })();

function beep(frequency) {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const o = c.createOscillator(); const g = c.createGain();
    o.connect(g); g.connect(c.destination); o.frequency.value = frequency;
    g.gain.setValueAtTime(0.12, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6);
    o.start(); o.stop(c.currentTime + 0.6);
  } catch { /* sound blocked until the page has been used */ }
}

// Turns server status changes into a persistent list. It only reads `live` (the SSE job) and `sessions`
// (the project list), so it adds no requests of its own.
export function useNotifications({ live, sessions }) {
  const [items, setItems] = useState(() => loadItems(store));
  const [prefs, setPrefs] = useState(() => loadPrefs(store));
  const itemsRef = useRef(items);
  const prefsRef = useRef(prefs);
  const prevLive = useRef(null);
  const prevSessions = useRef(null);
  prefsRef.current = prefs;

  useEffect(() => { itemsRef.current = items; saveItems(store, items); }, [items]);

  const push = useCallback((event) => {
    const next = addEvent(itemsRef.current, event);
    if (next === itemsRef.current) return;
    itemsRef.current = next;
    setItems(next);
    const p = prefsRef.current;
    if (p.sound && (event.type === 'ready' || event.type === 'failed')) beep(event.type === 'ready' ? 880 : 330);
    if (p.desktop && 'Notification' in window && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
      try {
        const n = new Notification(event.title, { body: event.project ? `${event.project}${event.detail ? ` — ${event.detail}` : ''}` : event.detail });
        n.onclick = () => { window.focus(); n.close(); };
      } catch { /* notifications unavailable */ }
    }
  }, []);

  useEffect(() => {
    const prev = prevLive.current;
    if (prev) {
      const help = failureHelp({ status: live.status, kind: live.kind, error: live.error, watchdog: live.watchdog,
        technicalQa: live.technicalQa, hasScenario: Boolean(live.scenario) });
      const event = eventFromTransition(prev, live, { detail: help?.why || live.error || '' });
      if (event) push(event);
    }
    prevLive.current = { id: live.id, status: live.status, kind: live.kind };
  }, [live.id, live.status, live.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const { events, map } = sessionEvents(prevSessions.current, sessions);
    prevSessions.current = map;
    events.forEach(push);
  }, [sessions, push]);

  const updatePrefs = (patch) => setPrefs((cur) => { const next = { ...cur, ...patch }; savePrefs(store, next); return next; });
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const enableDesktop = async () => {
    if (!('Notification' in window)) return;
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    updatePrefs({ desktop: result === 'granted' });
  };
  return {
    items, unread: unreadCount(items), prefs, permission,
    markAll: () => setItems((cur) => markAllRead(cur)),
    markOne: (id) => setItems((cur) => markRead(cur, id)),
    clear: () => setItems([]),
    setSound: (sound) => updatePrefs({ sound }),
    setDesktop: (desktop) => updatePrefs({ desktop }),
    enableDesktop,
  };
}

const Bell = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d="M12 3a6 6 0 0 0-6 6v3.6L4.5 16h15L18 12.6V9a6 6 0 0 0-6-6zm-2 15a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function NotificationBell({ notifier, selectedId, onOpen }) {
  const { items, unread, prefs, permission } = notifier;
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wrap = useRef(null);
  const button = useRef(null);
  const panel = useRef(null);
  const wasOpen = useRef(false);

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) {
      if (wasOpen.current) { notifier.markAll(); button.current?.focus(); }
      wasOpen.current = false;
      return undefined;
    }
    wasOpen.current = true;
    setNow(Date.now());
    panel.current?.focus();
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const away = (event) => { if (wrap.current && !wrap.current.contains(event.target)) close(); };
    const key = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { clearInterval(tick); document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = items[0] && !items[0].read ? `${items[0].title}${items[0].project ? `: ${items[0].project}` : ''}` : '';
  const choose = (item) => { notifier.markOne(item.id); close(); onOpen?.(item.sessionId); };

  return (
    <div className="bellwrap" ref={wrap}>
      <button ref={button} type="button" className="bell" aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={() => setOpen((v) => !v)}>
        <Bell />
        {unread > 0 && <span className="bellbadge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <span className="bell-sr" role="status" aria-live="polite">{latest}</span>
      {open && (
        <div className="bellpanel" role="dialog" aria-label="Notifications" tabIndex={-1} ref={panel}>
          <div className="bellhead">
            <b>Notifications</b>
            <span>
              <button type="button" className="ghost" onClick={notifier.markAll} disabled={!unread}>Mark all read</button>
              <button type="button" className="ghost" onClick={notifier.clear} disabled={!items.length}>Clear</button>
            </span>
          </div>
          {items.length === 0
            ? <p className="muted bellempty">Nothing yet. Finished videos, failures, and plans waiting for your review will appear here.</p>
            : (
              <ul className="bellist">
                {items.map((item) => (
                  <li key={item.id}>
                    <button type="button" className={`bellitem ${item.severity}${item.read ? '' : ' unread'}`} onClick={() => choose(item)}>
                      <span className="belldot" aria-hidden="true" />
                      <span className="belltext">
                        <span className="belltitle">{item.title}{!item.read && <span className="bell-sr"> (unread)</span>}</span>
                        <span className="muted bellmeta">
                          {String(selectedId) !== item.sessionId && <em>Other project · </em>}{item.project || 'Untitled project'}
                        </span>
                        {item.detail && <span className="muted belldetail">{item.detail}</span>}
                      </span>
                      <time className="muted belltime" dateTime={new Date(item.at).toISOString()}>{relativeTime(item.at, now)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          <div className="bellfoot">
            <label><input type="checkbox" checked={prefs.sound} onChange={(e) => notifier.setSound(e.target.checked)} /> Sound when something finishes</label>
            {permission === 'unsupported' ? null : prefs.desktop && permission === 'granted'
              ? <label><input type="checkbox" checked onChange={() => notifier.setDesktop(false)} /> Desktop alerts when this tab is in the background</label>
              : permission === 'denied'
                ? <span className="muted">Desktop alerts are blocked in your browser settings for this site.</span>
                : <button type="button" className="ghost" onClick={notifier.enableDesktop}>Turn on desktop alerts</button>}
          </div>
        </div>
      )}
    </div>
  );
}
