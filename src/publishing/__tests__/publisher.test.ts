import { describe,it,expect,vi } from 'vitest';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { youtube_v3 } from 'googleapis';
import { publishPack,readUploadJournal } from '../publisher.js';
import { nextPublishSlot } from '../schedule.js';
vi.mock('node:fs',async importOriginal => {
  const original=await importOriginal<typeof import('node:fs')>();
  const {Readable}=await import('node:stream');
  return {...original,createReadStream:()=>Readable.from('mock media')};
});
vi.mock('../../automation/pack.js',()=>({verifyPack:vi.fn(async()=>({video:'video.mp4',meta:'meta.json',thumbnails:['a.jpg','b.jpg','c.jpg'],subtitles:['en.srt','en.vtt'],artifactDigests:{'video.mp4':'video-digest'}}))}));
vi.mock('../../automation/spec.js',async importOriginal=>({...await importOriginal<typeof import('../../automation/spec.js')>(),loadSpec:vi.fn(async()=>({})),inputDigest:vi.fn(async()=>'input-digest')}));
async function fixture() {
  const root=await mkdtemp(path.join(os.tmpdir(),'publisher-'));
  await mkdir(path.join(root,'episodes'));
  await writeFile(path.join(root,'meta.json'),JSON.stringify({title:'An accurate title',description:'Synthetic visuals disclosed.',tags:['shorts']}));
  let scheduled='';
  const api={channels:{list:vi.fn(async()=>({data:{items:[{id:'channel-1',snippet:{title:'Test channel'}}]}}))},videos:{
    insert:vi.fn(async()=>({data:{id:'video-1'}})),
    update:vi.fn(async(params:{requestBody:{status:{publishAt:string}}})=>{scheduled=params.requestBody.status.publishAt;return {data:{}};}),
    list:vi.fn(async()=>({data:{items:[{status:{privacyStatus:'private',publishAt:scheduled}}]}}))
  },thumbnails:{set:vi.fn(async()=>({data:{}}))},captions:{list:vi.fn(async()=>({data:{items:[]}})),insert:vi.fn(async()=>({data:{id:'caption-1'}}))}};
  return {root,api,file:path.join(root,'episodes/demo.pack.json')};
}
describe('scheduled uploads',()=>{
  it('rejects a changed local video after an upload is scheduled', async () => {
    const { root, api, file } = await fixture();
    try {
      await publishPack(api as unknown as youtube_v3.Youtube, file, root);
      const journal = await readUploadJournal(root);
      journal['episodes/demo.assemble.json']!.videoDigest = 'previous-video';
      await writeFile(path.join(root, 'storage/automation/uploads.json'), JSON.stringify(journal));
      await expect(publishPack(api as unknown as youtube_v3.Youtube, file, root)).rejects.toThrow('Local video differs');
      expect(api.videos.insert).toHaveBeenCalledTimes(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('rejects an unexpected channel before the first upload', async () => {
    const { root, api, file } = await fixture();
    try {
      await expect(publishPack(api as unknown as youtube_v3.Youtube, file, root, {
        expectedChannelId: 'different-channel',
      })).rejects.toThrow('Connected channel differs from the configured publishing channel');
      expect(api.videos.insert).not.toHaveBeenCalled();
      expect(await readUploadJournal(root)).toEqual({});
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('keeps a saved remote ID across attachment failures and schedules only once',async()=>{
    const f=await fixture();
    try {
      f.api.thumbnails.set.mockRejectedValueOnce(new Error('temporary thumbnail failure'));
      await expect(publishPack(f.api as unknown as youtube_v3.Youtube,f.file,f.root)).rejects.toThrow('thumbnail failure');
      expect((await readUploadJournal(f.root))['episodes/demo.assemble.json']?.videoId).toBe('video-1');
      const result=await publishPack(f.api as unknown as youtube_v3.Youtube,f.file,f.root);
      expect(result.phase).toBe('scheduled');
      await publishPack(f.api as unknown as youtube_v3.Youtube,f.file,f.root);
      expect(f.api.videos.insert).toHaveBeenCalledTimes(1);
      expect(f.api.videos.update).toHaveBeenCalledTimes(1);
      expect(f.api.captions.insert).toHaveBeenCalledTimes(1);
    } finally {await rm(f.root,{recursive:true,force:true});}
  });
  it('refuses an automatic retry when the server may have accepted an upload',async()=>{
    const f=await fixture();
    try {
      f.api.videos.insert.mockRejectedValueOnce(new Error('connection lost'));
      await expect(publishPack(f.api as unknown as youtube_v3.Youtube,f.file,f.root)).rejects.toThrow('connection lost');
      await expect(publishPack(f.api as unknown as youtube_v3.Youtube,f.file,f.root)).rejects.toThrow('uncertain');
      expect(f.api.videos.insert).toHaveBeenCalledTimes(1);
      expect(f.api.videos.update).not.toHaveBeenCalled();
    } finally {await rm(f.root,{recursive:true,force:true});}
  });
  it('does not mark a schedule successful when YouTube omits publishAt',async()=>{
    const f=await fixture();
    try {
      const staleStatus = {data:{items:[{status:{privacyStatus:'private',publishAt:''}}]}};
      f.api.videos.list.mockResolvedValueOnce(staleStatus);
      await expect(publishPack(f.api as unknown as youtube_v3.Youtube,f.file,f.root)).rejects.toThrow('did not confirm');
      expect((await readUploadJournal(f.root))['episodes/demo.assemble.json']?.phase).toBe('uploaded');
      const recovered = await publishPack(f.api as unknown as youtube_v3.Youtube,f.file,f.root);
      expect(recovered.phase).toBe('scheduled');
      expect(f.api.videos.insert).toHaveBeenCalledTimes(1);
      expect(f.api.videos.update).toHaveBeenCalledTimes(1);
    } finally {await rm(f.root,{recursive:true,force:true});}
  });
});
describe('future publishing slots',()=>{
  it('uses Amman time with an hour of lead and one video per day',()=>{
    expect(nextPublishSlot(new Date('2026-11-02T14:00:00Z'),[])).toBe('2026-11-02T17:00:00.000Z');
    expect(nextPublishSlot(new Date('2026-11-02T16:30:00Z'),[])).toBe('2026-11-03T17:00:00.000Z');
    expect(nextPublishSlot(new Date('2026-11-02T14:00:00Z'),['2026-11-02T17:00:00Z'])).toBe('2026-11-03T17:00:00.000Z');
  });
});
