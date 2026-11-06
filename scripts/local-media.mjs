import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile, writeFile, mkdir, rename, open, unlink, statfs, access } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const read = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const hash = data => createHash('sha256').update(data).digest('hex');
async function save(file, data) {
  const temp = file + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(data, null, 2));
  await rename(temp, file);
}
function command(name, args) {
  try { return execFileSync(name, args, { encoding: 'utf8', timeout: 15000 }).trim(); }
  catch { return null; }
}
async function request(base, route, options = {}) {
  const response = await fetch(new URL(route, base), { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(route + ' returned HTTP ' + response.status);
  return response;
}
function endpoint(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid worker URL');
  return url.origin;
}
export function bindWorkflow(template, values) {
  if (typeof template === 'string' && /^\{\{\w+\}\}$/.test(template)) {
    const key = template.slice(2, -2);
    if (!(key in values)) throw new Error('Unknown workflow binding ' + key);
    return values[key];
  }
  if (Array.isArray(template)) return template.map(item => bindWorkflow(item, values));
  if (template && typeof template === 'object') return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, bindWorkflow(value, values)]));
  return template;
}
async function doctor() {
  const disk = await statfs(process.cwd());
  const report = {
    platform: os.platform(), arch: os.arch(), node: process.version,
    ramBytes: os.totalmem(), freeRamBytes: os.freemem(), diskFreeBytes: disk.bavail * disk.bsize,
    gpu: command('nvidia-smi', ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader']),
    ffmpeg: command('ffmpeg', ['-version'])?.split('\n')[0] ?? null,
    python: command('uv', ['python', 'list', '--only-installed']),
    services: {},
  };
  for (const [name, url, route] of [['comfy', 'http://127.0.0.1:8188', '/system_stats'], ['ollama', 'http://127.0.0.1:11434', '/api/tags']]) {
    try { report.services[name] = await (await request(url, route)).json(); }
    catch (error) { report.services[name] = { unavailable: error.message }; }
  }
  console.log(JSON.stringify(report, null, 2));
}
async function generate(configFile, shotIndex, stage) {
  if (!['image', 'video'].includes(stage)) throw new Error('Stage must be image or video');
  const config = await read(configFile);
  const base = endpoint(config.worker);
  const draft = await read(config.scenario);
  const shot = draft.plan.shots[shotIndex];
  if (!shot) throw new Error('Shot index is out of range');
  const settings = config[stage];
  if (!settings || !Number.isFinite(settings.fps) || settings.fps <= 0 || !settings.outputNode) throw new Error('Stage requires workflow, positive fps and outputNode');
  if (config.offlineWorkflowReviewed !== true) throw new Error('Review the workflow and custom nodes for local-only inference first');
  const template = await read(settings.workflow);
  const reference = stage === 'video' ? await readFile(config.references[shotIndex]) : null;
  const identity = hash(JSON.stringify({ base, shot, template, settings: config[stage], seed: config.seed ?? 42, reference: reference && hash(reference) }));
  const dir = path.resolve('storage/local-video', identity);
  await mkdir(dir, { recursive: true });
  const lock = await open(path.join(dir, 'lock'), 'wx');
  try {
    const stateFile = path.join(dir, 'job.json');
    let state;
    try { state = await read(stateFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (state?.output) {
      if (hash(await readFile(state.output)) !== state.outputHash) throw new Error('Saved output hash mismatch');
      console.log(JSON.stringify(state, null, 2)); return;
    }
    if (state?.status === 'submitting') throw new Error('Submission result is uncertain. Inspect worker history using clientId ' + state.clientId + ' before recovery.');
    if (!state) {
      let image = '';
      if (reference) {
        const form = new FormData();
        form.append('image', new Blob([reference]), identity + path.extname(config.references[shotIndex]));
        const uploaded = await (await request(base, '/upload/image', { method: 'POST', body: form })).json();
        image = [uploaded.subfolder, uploaded.name].filter(Boolean).join('/');
      }
      const graph = bindWorkflow(template, {
        prompt: shot.imagePrompt, motion: shot.motionPrompt, seconds: shot.seconds,
        frames: Math.round(shot.seconds * config[stage].fps), fps: config[stage].fps,
        seed: config.seed ?? 42, image,
      });
      state = { status: 'submitting', clientId: randomUUID(), worker: base, stage, shotIndex, started: Date.now(), workflowHash: hash(JSON.stringify(graph)), peakMemoryBytes: null, visualReview: 'pending' };
      await save(stateFile, state);
      const result = await (await request(base, '/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: state.clientId }) })).json();
      if (!result.prompt_id) throw new Error('Worker did not return a prompt ID');
      state.promptId = result.prompt_id; state.status = 'queued';
      await save(stateFile, state);
    }
    const deadline = Date.now() + (config.timeoutSeconds ?? 1800) * 1000;
    while (Date.now() < deadline) {
      const history = await (await request(base, '/history/' + encodeURIComponent(state.promptId))).json();
      const result = history[state.promptId];
      if (result?.status?.status_str === 'error') throw new Error('Generation failed: ' + JSON.stringify(result.status.messages));
      if (result?.status?.completed) {
        const outputs = result.outputs[config[stage].outputNode];
        const candidates = [...(outputs?.images ?? []), ...(outputs?.gifs ?? []), ...(outputs?.videos ?? [])];
        const asset = candidates.find(item => stage === 'video' ? /\.mp4$/i.test(item.filename) : /\.(png|jpg|webp)$/i.test(item.filename));
        if (!asset) throw new Error('Configured output node returned no compatible media');
        const query = new URLSearchParams({ filename: asset.filename, subfolder: asset.subfolder ?? '', type: asset.type ?? 'output' });
        const bytes = Buffer.from(await (await request(base, '/view?' + query)).arrayBuffer());
        const output = path.join(dir, 'output' + path.extname(asset.filename));
        await writeFile(output + '.part', bytes);
        await rename(output + '.part', output);
        const probe = command('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,codec_name:format=duration', '-of', 'json', output]);
        if (!probe) throw new Error('Generated media failed ffprobe inspection');
        Object.assign(state, { status: 'review-required', output, outputHash: hash(bytes), elapsedSeconds: (Date.now() - state.started) / 1000, media: JSON.parse(probe) });
        await save(stateFile, state);
        console.log(JSON.stringify(state, null, 2)); return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error('Wait timed out. Rerun the same command to resume the existing prompt.');
  } finally { await lock.close(); await unlink(path.join(dir, 'lock')); }
}
const [action, config, index, stage] = process.argv.slice(2);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (action === 'doctor') await doctor();
    else if (action === 'generate' && config && /^\d+$/.test(index ?? '')) await generate(config, Number(index), stage);
    else throw new Error('Usage: node scripts/local-media.mjs doctor | generate CONFIG SHOT_INDEX image|video');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

