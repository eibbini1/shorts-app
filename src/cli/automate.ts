import { generatePendingDrafts } from '../drafting/drafts.js';
import { publishPack, readUploadJournal, PublishingReviewRequiredError } from '../publishing/publisher.js';
import { nextPublishSlot } from '../publishing/schedule.js';
import { verifyPack } from '../automation/pack.js';
import 'dotenv/config';
import { open, readFile, readdir, mkdir, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import cron from 'node-cron';
import { loadSpec, inputDigest, fileDigest, atomicJson } from '../automation/spec.js';

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');
const watch = process.argv.includes('--watch');
if (dryRun && watch) throw new Error('--dry-run is a one-time preview');
const arg = (name: string) => { const i = process.argv.indexOf('--' + name); return i < 0 ? undefined : process.argv[i + 1]; };
const configFile = path.resolve(root, arg('config') ?? 'automation.json');
interface Config { drafts?: { enabled: boolean; briefs?: string; referenceSpec?: string }; specs?: string[]; episodesDir?: string; cron?: string; timezone?: string; allowVoiceSpend?: boolean; publish?: { enabled: boolean; hour?: number; utcOffsetHours?: number; expectedChannelId?: string } }
const config: Config = JSON.parse((await readFile(configFile, 'utf8')).replace(/^\uFEFF/, ''));
if (!config || typeof config !== 'object' || (config.specs !== undefined && (!Array.isArray(config.specs) || !config.specs.length || config.specs.some(s => typeof s !== 'string' || !s.endsWith('.assemble.json'))))) throw new Error('automation.json specs must be a nonempty array of episode spec paths');
if (config.allowVoiceSpend !== undefined && typeof config.allowVoiceSpend !== 'boolean') throw new Error('allowVoiceSpend must be true or false');
if (config.publish && typeof config.publish.enabled !== 'boolean') throw new Error('publish.enabled must be true or false');
if (config.publish?.enabled) nextPublishSlot(new Date(), [], config.publish.hour, config.publish.utcOffsetHours);
const stateDir = path.join(root, 'storage', 'automation');
const lockFile = path.join(stateDir, 'worker.lock');
let lock;
if (!dryRun) {
  await mkdir(stateDir, { recursive: true });
  try { lock = await open(lockFile, 'wx'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Another automation worker owns storage/automation/worker.lock. Inspect its PID before removing a stale lock.'); throw error; }
  await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
}
let stopping = false;
let running: Promise<void> | undefined;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopping = true; task?.stop(); });
let task: ReturnType<typeof cron.schedule> | undefined;

async function currentPack(packFile: string, digest: string) {
  try {
    return await verifyPack(packFile, root, digest);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES' || (error as NodeJS.ErrnoException).code === 'EPERM') throw error;
    return undefined;
  }
}

async function runPipeline(spec: string, logFile: string): Promise<void> {
  const output = createWriteStream(logFile, { flags: 'a' });
  try {
    await new Promise<void>((resolve, reject) => {
      const args = ['--import', 'tsx', 'src/cli/pipeline.ts', '--spec', spec, '--resume'];
      if (config.allowVoiceSpend === true) args.push('--allow-voice-spend');
      const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', (data: Buffer) => { output.write(data); process.stdout.write(data); });
      child.stderr.on('data', (data: Buffer) => { output.write(data); process.stderr.write(data); });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error('Pipeline exited ' + code + '; see ' + logFile)));
    });
  } finally { await new Promise<void>((resolve, reject) => { output.on('error', reject); output.end(resolve); }); }
}

async function cycle(): Promise<void> {
  if (config.drafts?.enabled) await generatePendingDrafts(root, config.drafts.briefs, config.drafts.referenceSpec, dryRun);
  const specs = config.specs ?? (await readdir(path.resolve(root, config.episodesDir ?? 'episodes'))).filter(f => f.endsWith('.assemble.json')).sort().map(f => path.join(config.episodesDir ?? 'episodes', f));
  if (!specs.length) throw new Error('No episode specs configured');
  const outputs = new Map<string, string>();
  const results: { spec: string; status: string; error?: string; publishing?: string; videoId?: string; publishAt?: string; videoDigest?: string }[] = [];
  for (const relative of specs) {
    if (stopping) break;
    try {
      const file = path.resolve(root, relative);
      const spec = await loadSpec(file, root);
      const key = path.resolve(root, spec.output).toLowerCase();
      if (outputs.has(key)) throw new Error('Output collides with ' + outputs.get(key));
      outputs.set(key, relative);
      const digest = await inputDigest(file, spec, root);
      const pack = await currentPack(file.replace(/\.assemble\.json$/, '.pack.json'), digest);
      if (pack) {
        console.log('CURRENT ' + relative); results.push({ spec: relative, status: 'current', ...(dryRun ? { videoDigest: pack.artifactDigests[pack.video] } : {}) }); continue;
      }
      if (dryRun) {
        console.log('WOULD BUILD ' + relative); results.push({ spec: relative, status: 'planned' }); continue;
      }
      await runPipeline(relative, path.join(stateDir, path.basename(file) + '.log'));
      results.push({ spec: relative, status: 'ready' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('FAILED ' + relative + ': ' + message);
      results.push({ spec: relative, status: 'failed', error: message });
    }
  }
  if (config.publish?.enabled && !process.argv.includes('--prepare-only')) {
    const ready = results.filter(r => ['ready','current','planned'].includes(r.status));
    if (dryRun) {
      const journal = await readUploadJournal(root);
      const reserved = Object.values(journal).map(record => record.publishAt);
      for (const result of ready) {
        const existing = journal[result.spec.replace(/\\/g,'/')];
        const at = existing?.publishAt ?? nextPublishSlot(new Date(),reserved,config.publish.hour,config.publish.utcOffsetHours);
        reserved.push(at);result.publishing=existing?.phase ?? 'planned';result.publishAt=at;
        if (existing?.phase === 'uploading' || existing?.phase === 'uncertain') {
          result.publishing = 'needs-review';
          console.log('NEEDS REVIEW ' + result.spec + ': prior upload outcome is uncertain');
          continue;
        }
        if (existing && result.videoDigest && existing.videoDigest !== result.videoDigest) {
          result.publishing = 'needs-review';
          console.log('NEEDS REVIEW ' + result.spec + ': local video differs from the existing upload');
          continue;
        }
        console.log((existing ? 'EXISTING ' + existing.phase + ' ' : 'WOULD SCHEDULE ') + result.spec + ' at ' + at);
      }
    } else if (ready.length) {
      try {
        const { authenticatedYouTube, saveCredentials } = await import('../publishing/auth.js');
        const connection = await authenticatedYouTube(root);
        try {
          for (const result of ready) {
            try {
              const record = await publishPack(connection.api,path.resolve(root,result.spec.replace(/\.assemble\.json$/,'.pack.json')),root,config.publish);
              result.publishing=record.phase;result.videoId=record.videoId;result.publishAt=record.publishAt;
              console.log('SCHEDULED https://youtu.be/'+record.videoId+' at '+record.publishAt);
            } catch (error) { result.publishing=error instanceof PublishingReviewRequiredError?'needs-review':'failed';result.error=error instanceof Error?error.message:String(error);process.exitCode=1;console.error(result.error); }
          }
        } finally { await saveCredentials(root,connection.oauth.credentials); }
      } catch (error) {
        const message=error instanceof Error?error.message:String(error);
        for (const result of ready) { result.publishing='needs-connection';result.error=message; }
        process.exitCode=1;console.error(message);
      }
    }
  }
  if (!dryRun) await atomicJson(path.join(stateDir, 'latest-run.json'), { finishedAt: new Date().toISOString(), dryRun, results });
  if (results.some(r => r.status === 'failed')) process.exitCode = 1;
}

try {
  if (watch) {
    const expression = config.cron ?? '*/15 * * * *';
    if (!cron.validate(expression)) throw new Error('Invalid automation cron expression');
    task = cron.schedule(expression, () => { if (stopping || running) return; running = cycle().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { running = undefined; }); return running; }, { timezone: config.timezone ?? 'Asia/Amman', noOverlap: true });
    console.log('Watching episodes on ' + expression + ' (' + (config.timezone ?? 'Asia/Amman') + ')');
  }
  running = cycle().catch(error => {
    if (!watch) throw error;
    console.error(error);
    process.exitCode = 1;
  }).finally(() => { running = undefined; });
  await running;
  if (task) {
    while (!stopping) await new Promise(resolve => setTimeout(resolve, 1000));
    await running;
  }
} finally { task?.destroy(); if (lock) { await lock.close(); await rm(lockFile, { force: true }); } }
