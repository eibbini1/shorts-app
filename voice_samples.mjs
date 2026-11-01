import fs from 'node:fs';
import path from 'node:path';
const env = fs.readFileSync('.env', 'utf8');
const m = env.match(/^ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
if (!m) { console.log('NO KEY'); process.exit(1); }
const key = m[1].trim();
const out = 'out\\voice_samples';
fs.mkdirSync(out, { recursive: true });
const text = "This burger costs two thousand dollars. Here's what's inside. The patty is Kobe beef, mixed with New Zealand venison.";
const variants = [
  ['A_brian_current', 'nPczCjzI2devNBz1zQrb', { stability: 0.45, style: 0.5, speed: 1.0 }],
  ['B_brian_clear', 'nPczCjzI2devNBz1zQrb', { stability: 0.75, style: 0.15, speed: 0.93 }],
  ['C_daniel_british', 'onwK4e9ZLuTAKqWW03F9', { stability: 0.7, style: 0.2, speed: 0.95 }],
  ['D_george_warm', 'JBFqnCBsd6RMkjVDRZzb', { stability: 0.7, style: 0.2, speed: 0.95 }],
  ['E_adam_deep', 'pNInz6obpgDQGcFmaJgB', { stability: 0.7, style: 0.2, speed: 0.95 }],
  ['F_charlie_clear', 'IKne3meq5aSn9XLyUdCD', { stability: 0.7, style: 0.2, speed: 0.95 }],
];
for (const [name, id, s] of variants) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: s.stability, similarity_boost: 0.8, style: s.style, use_speaker_boost: true, speed: s.speed } }),
  });
  if (!res.ok) { console.log(name, 'HTTP', res.status, (await res.text()).slice(0, 150)); continue; }
  fs.writeFileSync(path.join(out, name + '.mp3'), Buffer.from(await res.arrayBuffer()));
  console.log(name, 'ok');
}
console.log('SAMPLES DONE');
