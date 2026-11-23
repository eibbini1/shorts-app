import { useState } from 'react';

export default function HostedShotSimulation({ sessionId, shot }) {
  const [model, setModel] = useState('ltx-2.5');
  const [cap, setCap] = useState('1');
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const reset = () => { setQuote(null); setMessage(''); };

  async function simulate(action) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/hosted/dry-run', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, shot, model, capUsd: Number(cap), action, approval: quote?.approval }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Simulation failed.');
      if (action === 'quote') setQuote(result);
      else {
        setQuote(null);
        setMessage('Local simulation completed. Charged $0.00.');
      }
    } catch (error) {
      setQuote(null);
      setMessage(error.message);
    } finally { setBusy(false); }
  }

  return <details>
    <summary>Simulate hosted motion</summary>
    <p>Test approval and budget for this shot locally. The simulation uses example pricing.</p>
    <label>Simulation model <select value={model} disabled={busy} onChange={(event) => { reset(); setModel(event.target.value); }}>
      <option value="ltx-2.5">LTX-2.5</option><option value="wan-2.2">Wan 2.2</option>
    </select></label>
    <label>Session cap (USD) <input type="number" value={cap} min="0.25" max="100" step="0.01"
      disabled={busy} onChange={(event) => { reset(); setCap(event.target.value); }} /></label>
    {quote && <div>
      <p>{quote.settings.prompt}</p>
      <p>Shot {shot} · {quote.model} · first frame {quote.referenceSha256.slice(0, 12)} · {quote.settings.width} × {quote.settings.height} ·
      {' '}{quote.settings.frameCount} frames at {quote.settings.fps} fps · ${quote.estimateUsd.toFixed(2)} simulated reservation · ${quote.capUsd.toFixed(2)} session cap</p>
    </div>}
    <button type="button" disabled={busy} onClick={() => simulate(quote ? 'confirm' : 'quote')}>
      {quote ? 'Approve this simulation' : 'Preview simulation'}
    </button>
    {message && <p role="status">{message}</p>}
  </details>;
}
