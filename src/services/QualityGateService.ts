import { readFile, stat } from 'node:fs/promises';
import { getMediaDuration, getMeanVolumeDb } from '../media/shared/ffmpegExec.js';
import { RenderError } from '../shared/errors.js';
import type { RenderedVideo, Script } from '../shared/types.js';
export class QualityGateService {
  async assert(render: RenderedVideo, script: Script, captionsPath?: string): Promise<void> {
    if (!(await stat(render.path)).size) throw new RenderError('Rendered video is empty');
    const duration = await getMediaDuration(render.path);
    if (!Number.isFinite(duration) || duration <= 0 || Math.abs(duration-render.durationSec)>Math.max(1,render.durationSec*0.1)) throw new RenderError('Rendered duration does not match narration');
    if (await getMeanVolumeDb(render.path) < -50) throw new RenderError('Rendered audio is silent');
    const captions = captionsPath ? await readFile(captionsPath,'utf8') : '';
    if (/\[(?:director|stage direction|insert footage|voiceover instruction)[^\]]*\]/i.test(script.fullText+' '+captions)) throw new RenderError('Director instructions leaked into narration or captions');
  }
}
