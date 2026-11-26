import { lazy, Suspense, useEffect, useState } from 'react';
import { filterSessions, sessionDisplayName } from '../session-label.js';

const BabyBall3DPreview = lazy(() => import('../BabyBall3DPreview.jsx'));

export const THEMES = [
  ['studio', 'Studio'],
  ['night', 'Night'],
  ['white', 'White'],
  ['codex', 'Codex dark'],
];

export function supportsBabyBallPreview(job) {
  const text = [
    job.prompt,
    job.options?.storyPrompt,
    job.plan?.creativeBrief?.mustShow,
    job.plan?.plan?.title,
  ].filter(Boolean).join(' ').toLowerCase();
  return /\bbaby\b/.test(text) && /\bball\b/.test(text) && /\bpark\b/.test(text);
}

export function BabyBallPreviewCard() {
  const [open, setOpen] = useState(false);
  return (
    <section className="card three-preview">
      <div className="three-preview-head">
        <div>
          <h3>Interactive 3D story preview</h3>
          <p className="muted small">A procedural Three.js interpretation of the same baby, ball, and park story.</p>
        </div>
        <button type="button" className="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide preview' : 'Open 3D preview'}
        </button>
      </div>
      {open && <>
        <p className="muted small">Experimental preview only. It does not change or render into your video export.</p>
        <Suspense fallback={<p className="muted small" role="status">Loading 3D scene…</p>}>
          <BabyBall3DPreview />
        </Suspense>
      </>}
    </section>
  );
}

// Ticks only while a job is running, and only this small component re-renders each second (not the whole app).
export function Elapsed({ startedAt }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return null;
  const sec = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

const dayLabel = (t) => {
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return 'Earlier';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
};

export function Sidebar({ sessions, selectedId, liveId, onSelect, onNew, onRename, onDelete, open }) {
  const [editing, setEditing] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState('');
  const groups = [];
  const visibleSessions = filterSessions(sessions, search);
  for (const x of visibleSessions) {
    const label = dayLabel(x.updatedAt);
    const g = groups.find((y) => y.label === label);
    if (g) g.items.push(x);
    else groups.push({ label, items: [x] });
  }
  const commit = (id) => {
    const n = draftName.trim();
    if (n) onRename(id, n);
    setEditing(null);
  };
  return (
    <aside id="projects" className={open ? 'side projects-open' : 'side'} aria-label="Projects">
      <button className="primary newchat" onClick={onNew}>+ New project</button>
      <div className="sessions">
        <input
          className="project-search"
          type="search"
          aria-label="Search projects"
          placeholder="Search projects"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {groups.length === 0 && (
          <p className="muted pad">
            {search.trim() ? 'No projects match that search.' : 'No projects yet. Your plans and videos will be listed here.'}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.label}>
            <div className="day">{g.label}</div>
            {g.items.map((x) => (
              <div key={x.id} className={'sess' + (x.id === selectedId ? ' sel' : '')}>
                <span className={'dot ' + x.status} title={x.status} />
                {editing === x.id ? (
                  <input
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit(x.id);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    onBlur={() => commit(x.id)}
                  />
                ) : (
                  <button
                    className="name"
                    aria-current={x.id === selectedId ? 'true' : undefined}
                    title={`${x.status} · ${x.prompt || x.name}`}
                    onClick={() => onSelect(x.id)}
                  >
                    {sessionDisplayName(x, sessions)}{x.hasVideo ? ' 🎬' : ''}
                  </button>
                )}
                {editing !== x.id && (
                  <span className="acts" onClick={(e) => e.stopPropagation()}>
                    <button title="Rename" onClick={() => { setEditing(x.id); setDraftName(x.name); }}>✎</button>
                    {confirm === x.id ? (
                      <button className="danger" onClick={() => { setConfirm(null); onDelete(x.id); }} onMouseLeave={() => setConfirm(null)}>Delete?</button>
                    ) : (
                      <button title="Delete chat (keeps videos)" disabled={x.id === liveId && x.status === 'running'} onClick={() => setConfirm(x.id)}>🗑</button>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
