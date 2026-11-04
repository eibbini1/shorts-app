import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runFfmpeg } from '../shared/ffmpegExec.js';
import type { TTSProvider } from './TTSProvider.js';
export class MockTTSProvider implements TTSProvider {
  constructor(private readonly outputDir: string) {}
  async synthesize(text: string, options?: { targetDurationSec?: number }) {
    await mkdir(this.outputDir,{recursive:true});
    const words = text.trim().split(/\s+/);
    const durationSec = options?.targetDurationSec ?? words.length / 2.6;
    const file = path.join(this.outputDir, createHash('sha256').update(text + durationSec).digest('hex').slice(0,16) + '.wav');
    await runFfmpeg(['-f','lavfi','-i','sine=frequency=220:sample_rate=48000','-t',String(durationSec),'-af','volume=0.15',file]);
    return { path:file,durationSec,wordTimings:words.map((word,i)=>({word,startSec:i*durationSec/words.length,endSec:(i+1)*durationSec/words.length})) };
  }
}
