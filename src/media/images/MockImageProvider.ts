import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import type { ImageProvider, ImageOptions } from './ImageProvider.js';
import type { VisualAsset } from '../../shared/types.js';
export class MockImageProvider implements ImageProvider {
  private sequence = 0;
  constructor(private readonly outputDir: string) {}
  async getVisuals(_query: string, options?: ImageOptions): Promise<VisualAsset[]> {
    await mkdir(this.outputDir,{recursive:true});
    const assets: VisualAsset[] = [];
    for (let i=0;i<(options?.count ?? 1);i++) {
      const n=this.sequence++;
      const canvas=createCanvas(720,1280),ctx=canvas.getContext('2d');
      ctx.fillStyle=['#997438','#448899','#886699'][n%3]!;ctx.fillRect(0,0,720,1280);
      ctx.fillStyle='#eeeecc';ctx.fillRect(150,350,420,500);
      const file=path.join(this.outputDir,'mock-'+n+'.png');await writeFile(file,canvas.toBuffer('image/png'));
      assets.push({path:file,type:'image'});
    }
    return assets;
  }
}
