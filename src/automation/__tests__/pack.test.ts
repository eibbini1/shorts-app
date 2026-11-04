import { describe,it,expect } from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {fileDigest,atomicJson} from '../spec.js';
import {verifyPack} from '../pack.js';
describe('publish pack integrity',()=>{
  it('rejects stale inputs, tampered media, and failed QA',async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'pack-check-'));
    try {
      const artifacts=['video.mp4','meta.json','qa.json','a.jpg','b.jpg','c.jpg','en.srt','en.vtt'];
      for(const f of artifacts)await writeFile(path.join(root,f),f==='qa.json'?JSON.stringify({passed:true,results:[{hard:true,ok:true}]}):'fixture-'+f);
      const digests:Record<string,string>={};for(const f of artifacts)digests[f]=await fileDigest(path.join(root,f));
      const pack={video:artifacts[0],meta:artifacts[1],qa:artifacts[2],thumbnails:artifacts.slice(3,6),subtitles:artifacts.slice(6),inputDigest:'current',artifactDigests:digests};
      const file=path.join(root,'episode.pack.json');await atomicJson(file,pack);
      await expect(verifyPack(file,root,'current')).resolves.toBeDefined();
      await expect(verifyPack(file,root,'stale')).rejects.toThrow('stale');
      await writeFile(path.join(root,'video.mp4'),'replaced');
      await expect(verifyPack(file,root,'current')).rejects.toThrow('artifact changed');
      digests['video.mp4']=await fileDigest(path.join(root,'video.mp4'));
      await writeFile(path.join(root,'qa.json'),JSON.stringify({passed:false,results:[{hard:true,ok:false}]}));
      digests['qa.json']=await fileDigest(path.join(root,'qa.json'));await atomicJson(file,pack);
      await expect(verifyPack(file,root,'current')).rejects.toThrow('passing QA');
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
