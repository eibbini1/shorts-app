// Facts shown in the plan review, derived only from the saved plan and options (nothing is guessed).
const secs = (s) => Number(s?.seconds) || 0;
const hasVoice = (s) => Boolean(String(s?.narration || '').trim());

export function totalSeconds(shots = []) { return shots.reduce((n, s) => n + secs(s), 0); }

// What the creator chose, and what this plan actually contains.
export function audioProfile(audio, shots = []) {
  const voiced = shots.filter(hasVoice).length;
  const count = shots.length;
  const withSound = shots.filter((s) => String(s?.sound || '').trim()).length;
  const sound = count ? `${withSound} of ${count} shots have a sound cue.` : '';
  if (audio === 'asmr') return { label: 'ASMR', text: `No narration. Action and room sounds only. ${sound}`.trim() };
  if (audio === 'voiced') return { label: 'Voiced', text: `Narration on ${voiced} of ${count} shots; captions follow the narration. ${sound}`.trim() };
  // Auto: report what the plan turned out to contain.
  const kind = voiced ? `narration on ${voiced} of ${count} shots` : 'no narration';
  return { label: 'Auto', text: `This plan has ${kind}. ${sound}`.trim() };
}

// A plan can come back a different length than requested; say so.
export function lengthNote(requested, shots = []) {
  const total = totalSeconds(shots); const want = Number(requested) || 0;
  if (!total || !want || total === want) return '';
  return `The plan runs ${total}s; you asked for ${want}s.`;
}

export function shotOrder(shots = []) {
  let at = 0;
  return shots.map((s, i) => { const start = at; at += secs(s); return { n: i + 1, seconds: secs(s), start, end: at }; });
}

// Direction of a line of user-facing text: any Arabic/Hebrew-script letter makes it right-to-left.
export function dirOf(text) { return /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(String(text || '')) ? 'rtl' : 'ltr'; }
