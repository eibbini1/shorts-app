import { atomicJson } from '../automation/spec.js';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * Pre-upload QA gate for a rendered video. Exit code 1 if any hard check fails.
 *   npm run qa-check -- --video storage/episodes/x/x-final.mp4 [--expect portrait|landscape] [--max-sec 60]
 * Checks: orientation/resolution, duration, audio present, loudness (-14 LUFS target, +-2), true peak <= -1 dBFS,
 * black frames, long silences, frame rate. Shorts must be vertical and under 3 minutes to count as Shorts.
 */
const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const video = path.resolve(process.cwd(), arg('video', '')!);
const run = (bin: string, args: string[]) => {
  const result = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(bin + ' analysis failed: ' + result.stderr.slice(-1200));
  return result;
};

const pr = run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate,sample_rate:format=duration', '-of', 'json', video]);
const info = JSON.parse(pr.stdout) as { streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string }[]; format: { duration: string } };
const v = info.streams.find((s) => s.codec_type === 'video');
const hasAudio = info.streams.some((s) => s.codec_type === 'audio');
const dur = Number(info.format.duration);
const [fn, fd] = (v?.r_frame_rate ?? '0/1').split('/').map(Number);
const fps = fn! / (fd || 1);
const portrait = (v?.height ?? 0) > (v?.width ?? 0);

const ln = run('ffmpeg', ['-hide_banner', '-nostats', '-i', video, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']);
const jm = ln.stderr.match(/\{[\s\S]*?"target_offset"[\s\S]*?\}/);
const loud = jm ? (JSON.parse(jm[0]) as { input_i: string; input_tp: string; input_lra: string }) : null;
const bd = run('ffmpeg', ['-hide_banner', '-nostats', '-i', video, '-vf', 'blackdetect=d=0.5:pix_th=0.06', '-an', '-f', 'null', '-']);
const blacks = [...bd.stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
const sd = run('ffmpeg', ['-hide_banner', '-nostats', '-i', video, '-af', 'silencedetect=n=-45dB:d=2', '-vn', '-f', 'null', '-']);
const silences = [...sd.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));

const results: { name: string; ok: boolean; hard: boolean; note: string }[] = [];
const add = (name: string, ok: boolean, note: string, hard = true) => results.push({ name, ok, hard, note });
const expect = arg('expect');
if (expect) add('orientation', expect === 'portrait' ? portrait : !portrait, `${v?.width}x${v?.height} (${portrait ? 'portrait' : 'landscape'})`);
else add('orientation', true, `${v?.width}x${v?.height} (${portrait ? 'portrait' : 'landscape'})`, false);
const maxSec = Number(arg('max-sec', portrait ? '180' : '36000'));
add('duration', dur <= maxSec && dur >= 8, `${dur.toFixed(1)} s (limit ${maxSec} s${portrait ? '; best retention 13 to 40 s' : ''})`);
if (portrait && dur > 45) add('short length', false, `${dur.toFixed(0)} s is long for a Short`, false);
add('audio track', hasAudio, hasAudio ? 'present' : 'MISSING');
add('frame rate', fps >= 23, `${fps.toFixed(2)} fps`);
if (loud) {
  const i = Number(loud.input_i);
  const tp = Number(loud.input_tp);
  add('loudness', Math.abs(i + 14) <= 2, `${i.toFixed(1)} LUFS (target -14)`);
  add('true peak', tp <= -1, `${tp.toFixed(1)} dBTP (max -1)`);
} else add('loudness', false, 'could not measure');
if (process.argv.includes('--require-motion')) {
  const motion = run('ffmpeg', ['-hide_banner', '-nostats', '-i', video, '-vf', 'freezedetect=n=-50dB:d=2.5', '-an', '-f', 'null', '-']);
  const freezes = [...motion.stderr.matchAll(/freeze_start:\s*([\d.]+)/g)].map(match => Number(match[1]));
  add('motion', freezes.length === 0, freezes.length
    ? 'static stretches begin at ' + freezes.map(t => t.toFixed(1) + 's').join(', ')
    : 'no detected static stretch of 2.5 s or longer');
}
add('black frames', blacks.length === 0, blacks.length ? blacks.map((b) => `${b[0]}-${b[1]}s`).join(', ') : 'none');
add('silences > 2 s', silences.length === 0, silences.length ? silences.map((s) => s.toFixed(1) + 's').join(', ') : 'none');

// Opening check (analytics: ~69% swipe away in the first frames): no dead air, no black frame in the first 0.5 s
if (portrait) {
  const od = run('ffmpeg', ['-hide_banner', '-nostats', '-t', '0.5', '-i', video, '-af', 'volumedetect', '-vn', '-f', 'null', '-']);
  const mv = od.stderr.match(/max_volume: (-?[\d.]+) dB/);
  const openMax = mv ? Number(mv[1]) : -99;
  add('open audio', openMax > -30, `${openMax.toFixed(1)} dB peak in first 0.5 s (needs speech/sound at the very start)`, false);
  const early = blacks.filter((b) => b[0] < 0.5);
  add('open frame', early.length === 0, early.length ? 'black at start' : 'visible from frame 0', false);
  // a single black first frame (fade-in) is not caught by blackdetect but becomes the feed thumbnail: measure frame 0 directly
  const f0 = run('ffmpeg', ['-hide_banner', '-nostats', '-i', video, '-vf', 'select=eq(n\\,0),signalstats,metadata=print', '-frames:v', '1', '-an', '-f', 'null', '-']);
  const ya = (f0.stderr + (f0.stdout ?? '')).match(/YAVG=([\d.]+)/);
  const yavg = ya ? Number(ya[1]) : -1;
  add('frame 0', yavg > 25, `frame 0 brightness ${yavg < 0 ? 'unknown' : yavg.toFixed(0)} (needs > 25; a black first frame becomes the feed thumbnail)`, false);
}
let fail = 0;
for (const r of results) {
  const tag = r.ok ? 'PASS' : r.hard ? 'FAIL' : 'WARN';
  if (!r.ok && r.hard) fail++;
  console.log(`${tag}  ${r.name.padEnd(14)} ${r.note}`);
}
console.log(fail ? `QA FAILED (${fail})` : 'QA PASSED');
if (arg('report')) await atomicJson(path.resolve(arg('report')!), { video, checkedAt: new Date().toISOString(), passed: fail === 0, results });
process.exit(fail ? 1 : 0);
