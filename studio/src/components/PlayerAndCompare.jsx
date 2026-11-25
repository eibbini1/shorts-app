import { useEffect, useRef, useState } from 'react';

const FPS = 24;

export function Player({ src, fps = FPS }) {
  const v = useRef(null);
  const [loop, setLoop] = useState(false);
  const [rate, setRate] = useState(1);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  useEffect(() => {
    if (v.current) {
      v.current.playbackRate = rate;
      v.current.loop = loop;
    }
  }, [rate, loop]);
  useEffect(() => {
    const el = v.current;
    if (!el) return undefined;
    let raf;
    const tick = () => {
      setT(el.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const step = (d) => {
    const el = v.current;
    if (!el) return;
    el.pause();
    const f = Math.floor(el.currentTime * fps + 1e-6) + d;
    el.currentTime = Math.min(Math.max(0, (f + 0.5) / fps), Math.max(0, (el.duration || 0) - 0.001));
  };
  const onKey = (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (e.key === ',' || e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === '.' || e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === ' ') {
      e.preventDefault();
      const el = v.current;
      if (el.paused) el.play();
      else el.pause();
    }
  };
  return (
    <div className="pl" tabIndex={0} onKeyDown={onKey}>
      <video ref={v} src={src} controls playsInline className="player" onLoadedMetadata={(e) => setDur(e.target.duration)} />
      <div className="plbar">
        <button onClick={() => step(-fps)} title="Back 1 s">« 1s</button>
        <button onClick={() => step(-1)} title="Previous frame (, or left arrow)">‹ frame</button>
        <button onClick={() => step(1)} title="Next frame (. or right arrow)">frame ›</button>
        <button onClick={() => step(fps)} title="Forward 1 s">1s »</button>
        <label>Speed <select value={rate} onChange={(e) => setRate(+e.target.value)}>{[0.25, 0.5, 1, 1.5, 2].map((r) => <option key={r} value={r}>{r}x</option>)}</select></label>
        <label><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop</label>
        <span className="muted small">frame {Math.floor(t * fps)} / {Math.round(dur * fps)} · {t.toFixed(2)}s · click here, then use , and . keys</span>
      </div>
    </div>
  );
}

export function ComparePanel({ onClose }) {
  const [list, setList] = useState([]);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [blind, setBlind] = useState(false);
  const [swap, setSwap] = useState(false);
  const [rate, setRate] = useState(1);
  const [t, setT] = useState(0);
  const [audioSide, setAudioSide] = useState('left');
  const [feedback, setFeedback] = useState('');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const va = useRef(null);
  const vb = useRef(null);
  useEffect(() => {
    fetch('/api/videos').then((r) => r.json()).then((j) => {
      setList(j);
      if (j[0]) setA(j[0].p);
      if (j[1]) setB(j[1].p);
    }).catch(() => {});
  }, []);
  useEffect(() => { setFeedback(''); setFeedbackNote(''); }, [a, b]);
  const left = blind && swap ? b : a;
  const right = blind && swap ? a : b;
  const both = (fn) => [va.current, vb.current].forEach((el) => el && fn(el));
  const play = () => {
    both((el) => { el.currentTime = va.current.currentTime; });
    both((el) => el.play());
  };
  const pause = () => both((el) => el.pause());
  const seek = (s) => both((el) => { el.currentTime = s; });
  const step = (d) => {
    pause();
    const f = Math.floor(va.current.currentTime * FPS + 1e-6) + d;
    seek(Math.max(0, (f + 0.5) / FPS));
  };
  useEffect(() => { both((el) => { el.playbackRate = rate; }); }, [rate, left, right]);
  useEffect(() => {
    let raf;
    const tick = () => {
      const m = va.current;
      const f = vb.current;
      if (m && f) {
        setT(m.currentTime);
        m.muted = audioSide !== 'left';
        f.muted = audioSide !== 'right';
        if (!m.paused && Math.abs(f.currentTime - m.currentTime) > 0.08) f.currentTime = m.currentTime;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioSide]);
  const name = (p) => (list.find((x) => x.p === p)?.n || p || '').replace(/\.mp4$/, '');
  const url = (p) => '/media?p=' + encodeURIComponent(p);
  const opts = list.map((x, i) => <option key={x.p} value={x.p}>{blind ? `Saved clip ${i + 1}` : x.n}</option>);
  const listenTo = (side) => {
    setAudioSide(side);
    if (va.current) va.current.muted = side !== 'left';
    if (vb.current) vb.current.muted = side !== 'right';
  };
  const saveAcceptability = async () => {
    setSavingFeedback(true);
    setFeedback('saving');
    try {
      const response = await fetch('/api/comparison-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseline: a, candidate: b, notes: feedbackNote }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save this comparison.');
      setFeedback('saved');
    } catch (error) {
      setFeedback(error.message || 'Could not save this comparison.');
    } finally {
      setSavingFeedback(false);
    }
  };
  return (
    <div className="card compare">
      <div className="cmphead"><h3>Compare clips</h3><button className="ghost" onClick={onClose}>Close</button></div>
      <div className="cmpsel">
        <label>A <select value={a} onChange={(e) => setA(e.target.value)}>{opts}</select></label>
        <label>B <select value={b} onChange={(e) => setB(e.target.value)}>{opts}</select></label>
        <label><input type="checkbox" checked={blind} onChange={(e) => { setBlind(e.target.checked); setSwap(Math.random() < 0.5); }} /> Blind (hide names, random sides)</label>
      </div>
      <div className="cmpvids">
        <div><video ref={va} src={left ? url(left) : undefined} playsInline muted={audioSide !== 'left'} className="player" /><div className="muted small">{blind ? 'Left' : 'A: ' + name(left)}</div></div>
        <div><video ref={vb} src={right ? url(right) : undefined} playsInline muted={audioSide !== 'right'} className="player" /><div className="muted small">{blind ? 'Right' : 'B: ' + name(right)}</div></div>
      </div>
      <div className="plbar">
        <button onClick={play}>Play both</button><button onClick={pause}>Pause</button>
        <button onClick={() => step(-1)}>‹ frame</button><button onClick={() => step(1)}>frame ›</button>
        <button onClick={() => seek(0)}>Restart</button>
        <span>Audio:</span><button type="button" aria-pressed={audioSide === 'left'} onClick={() => listenTo('left')}>Left clip</button><button type="button" aria-pressed={audioSide === 'right'} onClick={() => listenTo('right')}>Right clip</button>
        <label>Speed <select value={rate} onChange={(e) => setRate(+e.target.value)}>{[0.25, 0.5, 1, 2].map((r) => <option key={r} value={r}>{r}x</option>)}</select></label>
        <span className="muted small">{t.toFixed(2)}s · both pictures follow one clock; listen to one clip at a time</span>
      </div>
      <p className="muted small">For sound review, play the same moment and switch between Left clip and Right clip. Saving “both acceptable” checks that the picture streams match and the audio differs.</p>
      {feedback === 'saved' ? <p className="muted small" role="status">Saved as “both acceptable, no preference.” This records your review only; it does not change production defaults.</p> : <div className="plbar">
        <label className="muted small" htmlFor="comparison-feedback-note">Optional sound note</label>
        <input id="comparison-feedback-note" className="ending" value={feedbackNote} onChange={(e) => setFeedbackNote(e.target.value)} maxLength={400} placeholder="Optional note about the sound" />
        <button type="button" disabled={savingFeedback || !a || !b || a === b} onClick={saveAcceptability}>Both acceptable — no preference</button>
        {feedback === 'saving' && <span className="muted small" role="status">Checking and saving…</span>}
        {feedback && feedback !== 'saving' && <span className="bad small" role="alert">{feedback}</span>}
      </div>}
      {blind && <p className="muted small">Blind mode hides names and randomizes sides. The clip selectors reveal labels, so use Blind mode for a fresh unbiased listen.</p>}
    </div>
  );
}
