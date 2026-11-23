import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CATEGORIES, LIMITS, STATUSES, buildPayload, emptyDraft, labelOf, listQuery, newClientKey, statusHint, validateDraft,
} from './feedback.js';
import { relativeTime } from './notifications.js';

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status}).`);
  return data;
}

const Chat = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);

function Stars({ value, onChange }) {
  return (
    <div className="fbstars" role="group" aria-label="Rating, optional">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={n <= value ? 'on' : ''} aria-pressed={n === value}
          aria-label={`${n} of 5`} onClick={() => onChange(n === value ? 0 : n)}>★</button>
      ))}
    </div>
  );
}

function SendForm({ job, onSent }) {
  const hasVideo = Boolean(job?.id && job?.video);
  const [draft, setDraft] = useState(() => emptyDraft());
  const [about, setAbout] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const key = useRef(newClientKey());
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true); setFailure('');
    try {
      await call('POST', '/api/product-feedback', buildPayload({ ...draft, sessionId: about && hasVideo ? job.id : '' }, key.current));
      key.current = newClientKey();
      setDraft(emptyDraft()); setAbout(false);
      onSent();
    } catch (error) { setFailure(error.message); } finally { setBusy(false); }
  };

  return (
    <form className="fbform" onSubmit={submit} noValidate>
      <label>Type
        <select value={draft.category} onChange={(e) => set({ category: e.target.value })}>
          {CATEGORIES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </label>
      <label>Title
        <input value={draft.title} maxLength={LIMITS.title[1]} onChange={(e) => set({ title: e.target.value })} aria-invalid={Boolean(errors.title)} />
        {errors.title && <span className="bad fberr">{errors.title}</span>}
      </label>
      <label>Details
        <textarea rows={5} value={draft.comment} maxLength={LIMITS.comment[1]} onChange={(e) => set({ comment: e.target.value })} aria-invalid={Boolean(errors.comment)} />
        {errors.comment && <span className="bad fberr">{errors.comment}</span>}
      </label>
      <div className="fbrow"><span>How is it working for you? <span className="muted">(optional)</span></span><Stars value={draft.rating} onChange={(rating) => set({ rating })} /></div>
      {hasVideo && (
        <label className="fbcheck"><input type="checkbox" checked={about} onChange={(e) => setAbout(e.target.checked)} /> This is about the video I have open</label>
      )}
      {failure && <p className="bad fberr" role="alert">{failure}</p>}
      <button type="submit" className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send feedback'}</button>
    </form>
  );
}

function Replies({ item, now }) {
  if (!item.replies?.length) return null;
  return (
    <ul className="fbreplies">
      {item.replies.map((r, i) => (
        <li key={i}><b>Reply</b> <time className="muted" dateTime={new Date(r.ts).toISOString()}>{relativeTime(r.ts, now)}</time><p>{r.text}</p></li>
      ))}
    </ul>
  );
}

function useFeedbackList(scope, filters, active) {
  const [state, setState] = useState({ items: [], next: null, loading: false, error: '' });
  const filterKey = JSON.stringify(filters);
  const load = useCallback(async (cursor) => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await call('GET', `/api/product-feedback${listQuery({ scope, ...filters, cursor })}`);
      setState((s) => ({ items: cursor ? [...s.items, ...data.items] : data.items, next: data.nextCursor || null, loading: false, error: '' }));
    } catch (error) { setState((s) => ({ ...s, loading: false, error: error.message })); }
  }, [scope, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (active) load(); }, [active, load]);
  return { ...state, reload: () => load(), more: () => load(state.next), patch: (item) => setState((s) => ({ ...s, items: s.items.map((i) => (i.id === item.id ? item : i)) })) };
}

function MyFeedback({ active }) {
  const list = useFeedbackList('mine', {}, active);
  const now = Date.now();
  return (
    <div className="fblist">
      {list.error && <p className="bad fberr" role="alert">{list.error}</p>}
      {!list.loading && !list.error && !list.items.length && <p className="muted">You have not sent any feedback yet.</p>}
      <ul>
        {list.items.map((item) => (
          <li key={item.id} className="fbitem">
            <div className="fbtop"><b>{item.title}</b><span className={`fbstatus s-${item.status}`}>{labelOf(STATUSES, item.status)}</span></div>
            <span className="muted">{labelOf(CATEGORIES, item.category)} · {relativeTime(item.ts, now)} · {statusHint(item.status)}</span>
            <p className="fbbody">{item.comment}</p>
            <Replies item={item} now={now} />
          </li>
        ))}
      </ul>
      {list.next && <button type="button" className="ghost" onClick={list.more} disabled={list.loading}>Show more</button>}
    </div>
  );
}

function Manage({ item, onSaved }) {
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try {
      const updated = await call('POST', '/api/product-feedback/update', {
        id: item.id, status: status !== item.status ? status : undefined, note: note.trim() || undefined, reply: reply.trim() || undefined,
      });
      setNote(''); setReply(''); onSaved(updated);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="fbmanage">
      <label>Status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      </label>
      {item.notes?.length > 0 && <ul className="fbnotes">{item.notes.map((n, i) => <li key={i}><span className="muted">Private note</span><p>{n.text}</p></li>)}</ul>}
      <label>Private note <span className="muted">(only you see this)</span>
        <textarea rows={2} value={note} maxLength={LIMITS.note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label>Reply to {item.user} <span className="muted">(they see this under My feedback)</span>
        <textarea rows={2} value={reply} maxLength={LIMITS.reply} onChange={(e) => setReply(e.target.value)} />
      </label>
      {error && <p className="bad fberr" role="alert">{error}</p>}
      <button type="button" className="primary" onClick={save} disabled={busy || (status === item.status && !note.trim() && !reply.trim())}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  );
}

function Inbox({ active }) {
  const [filters, setFilters] = useState({ status: '', category: '', q: '' });
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  useEffect(() => { const t = setTimeout(() => setFilters((f) => (f.q === q ? f : { ...f, q })), 300); return () => clearTimeout(t); }, [q]);
  const list = useFeedbackList('all', filters, active);
  const now = Date.now();
  return (
    <div className="fblist">
      <div className="fbfilters">
        <input type="search" placeholder="Search feedback" aria-label="Search feedback" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Any status</option>{STATUSES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <select aria-label="Type" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
          <option value="">Any type</option>{CATEGORIES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </div>
      {list.error && <p className="bad fberr" role="alert">{list.error}</p>}
      {!list.loading && !list.error && !list.items.length && <p className="muted">Nothing matches.</p>}
      <ul>
        {list.items.map((item) => (
          <li key={item.id} className="fbitem">
            <button type="button" className="fbhead" aria-expanded={openId === item.id} onClick={() => setOpenId(openId === item.id ? null : item.id)}>
              <span className="fbtop"><b>{item.title}</b><span className={`fbstatus s-${item.status}`}>{labelOf(STATUSES, item.status)}</span></span>
              <span className="muted">{item.user} · {labelOf(CATEGORIES, item.category)}{item.rating ? ` · ${item.rating}★` : ''} · {relativeTime(item.ts, now)}</span>
            </button>
            {openId === item.id && (
              <>
                <p className="fbbody">{item.comment}</p>
                {item.context?.sessionId && <p className="muted">About a video (project {item.context.sessionId}{item.context.look ? `, ${item.context.look}` : ''})</p>}
                <Replies item={item} now={now} />
                <Manage item={item} onSaved={list.patch} />
              </>
            )}
          </li>
        ))}
      </ul>
      {list.next && <button type="button" className="ghost" onClick={list.more} disabled={list.loading}>Show more</button>}
    </div>
  );
}

export function FeedbackPanel({ job, canManage }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('send');
  const [sentNote, setSentNote] = useState('');
  const wrap = useRef(null);
  const button = useRef(null);
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    panel.current?.focus();
    const away = (event) => { if (wrap.current && !wrap.current.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const tabs = [['send', 'Send'], ['mine', 'My feedback'], ...(canManage ? [['inbox', 'Inbox']] : [])];
  return (
    <div className="bellwrap" ref={wrap}>
      <button ref={button} type="button" className="bell" aria-haspopup="dialog" aria-expanded={open} aria-label="Send feedback" title="Send feedback"
        onClick={() => { setOpen((v) => !v); setSentNote(''); }}><Chat /></button>
      {open && (
        <div className="bellpanel fbpanel" role="dialog" aria-label="Feedback" tabIndex={-1} ref={panel}>
          <div className="fbtabs" role="tablist">
            {tabs.map(([k, n]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setSentNote(''); }}>{n}</button>)}
          </div>
          <div className="fbscroll">
            {tab === 'send' && (
              <>
                {sentNote && <p className="hint ok" role="status">{sentNote}</p>}
                <SendForm job={job} onSent={() => { setSentNote('Thank you. Your feedback was sent.'); setTab('mine'); }} />
              </>
            )}
            {tab === 'mine' && <>{sentNote && <p className="hint ok" role="status">{sentNote}</p>}<MyFeedback active={open && tab === 'mine'} /></>}
            {tab === 'inbox' && canManage && <Inbox active={open && tab === 'inbox'} />}
          </div>
        </div>
      )}
    </div>
  );
}
