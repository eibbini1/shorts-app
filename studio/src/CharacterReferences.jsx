import { useEffect, useState } from 'react';

export default function CharacterReferences({ job, canApply, disabled, onApply }) {
  const approved = job.sequence?.approvedFrames || [];
  const [characters, setCharacters] = useState([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [shot, setShot] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const visible = canApply || approved.length > 0;

  useEffect(() => {
    if (!visible) return undefined;
    const controller = new AbortController();
    fetch('/api/character-references', { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setCharacters(data.characters);
      })
      .catch((error) => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [visible]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/character-references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: job.id, shot: Number(shot || approved[0]?.shot), name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCharacters((items) => [...items, data.character]);
      setSelected(data.character.id);
      setName('');
      setMessage('Character reference saved.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function apply(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await onApply(selected);
      setMessage('Character applied where there is no custom shot reference.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  if (!visible) return null;
  return <details className="shot-references">
    <summary>Character references</summary>
    {approved.length > 0 && <form onSubmit={save}>
      <label>Approved frame <select value={shot || String(approved[0]?.shot)} onChange={(event) => setShot(event.target.value)}>
        {approved.map((frame) => <option key={frame.shot} value={frame.shot}>Shot {frame.shot}</option>)}
      </select></label>
      <label>Character name <input required maxLength="60" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button type="submit" disabled={busy || disabled}>Save character</button>
    </form>}
    {canApply && characters.length > 0 && <form onSubmit={apply}>
      <label>Saved character <select required value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">Choose a character</option>
        {characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
      </select></label>
      <button type="submit" disabled={busy || disabled || !selected}>Apply to shots</button>
      <p className="muted small">Custom shot references take priority. Review fresh first frames after applying.</p>
    </form>}
    {canApply && !characters.length && <p className="muted small">Save an approved character frame to reuse it in future projects.</p>}
    {message && <p role="status">{message}</p>}
  </details>;
}
