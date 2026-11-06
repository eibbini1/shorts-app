import {describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
describe('automation worker exclusion',()=>{
  it('keeps watching after initial discovery fails and recovers on the next tick',async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'shorts-worker-recovery-'));
    const loader=pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href;
    const script=path.resolve('src/cli/automate.ts');
    let worker:ReturnType<typeof spawn>|undefined;
    try {
      await writeFile(path.join(root,'automation.json'),JSON.stringify({cron:'* * * * * *'}));
      worker=spawn(process.execPath,['--import',loader,script,'--watch','--prepare-only'],{cwd:root,stdio:['ignore','pipe','pipe']});
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Initial discovery failure was not observed')),10000);
        let error='';
        worker!.stderr!.on('data',data=>{error+=String(data);if(error.includes('ENOENT')){clearTimeout(timer);resolve();}});
        worker!.once('error',reject);
        worker!.once('exit',code=>{clearTimeout(timer);reject(new Error('Watcher exited '+code));});
      });
      await mkdir(path.join(root,'episodes'));
      await writeFile(path.join(root,'episodes/recovered.assemble.json'),'{}');
      // An invalid episode produces a normal per-episode report: discovery recovered.
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Watcher did not retry discovery')),10000);
        worker!.stderr!.on('data',data=>{if(String(data).includes('FAILED episodes')){clearTimeout(timer);resolve();}});
        worker!.once('exit',code=>{clearTimeout(timer);reject(new Error('Watcher exited '+code));});
      });
      expect(worker.exitCode).toBeNull();
    } finally {
      if(worker && worker.exitCode===null){const closed=new Promise<void>(resolve=>worker!.once('close',()=>resolve()));worker.kill();await closed;}
      await rm(root,{recursive:true,force:true});
    }
  },25000);

  it('rejects a second worker while a real watcher owns the lock',async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'shorts-worker-'));
    const loader=pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href;
    const script=path.resolve('src/cli/automate.ts');
    let first:ReturnType<typeof spawn>|undefined;
    try {
      await mkdir(path.join(root,'src'));await mkdir(path.join(root,'assets/fonts'),{recursive:true});
      await writeFile(path.join(root,'src/test.ts'),'fixture');await writeFile(path.join(root,'assets/fonts/Lora-Variable.ttf'),'font');
      await writeFile(path.join(root,'scene.jpg'),'image');
      await writeFile(path.join(root,'episode.assemble.json'),JSON.stringify({kind:'stills',output:'out/final.mp4',voice:{provider:'mock'},brand:{name:'Test'},scenes:[{image:'scene.jpg',text:'Hook.'}]}));
      await writeFile(path.join(root,'automation.json'),JSON.stringify({specs:['episode.assemble.json']}));
      first=spawn(process.execPath,['--import',loader,script,'--watch','--prepare-only'],{cwd:root,stdio:['ignore','pipe','pipe']});
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Watcher did not become ready')),12000);let output='';
        first!.stdout!.on('data',data=>{output+=String(data);if(output.includes('Watching episodes')){clearTimeout(timer);resolve();}});
        first!.once('error',error=>{clearTimeout(timer);reject(error);});
        first!.once('exit',code=>{if(code!==null){clearTimeout(timer);reject(new Error('Watcher exited '+code));}});
      });
      expect(first.exitCode).toBeNull();
      const second=spawn(process.execPath,['--import',loader,script,'--prepare-only'],{cwd:root,stdio:['ignore','pipe','pipe']});
      let error='';second.stderr!.on('data',data=>{error+=String(data);});
      const code=await new Promise<number|null>((resolve,reject)=>{second.once('error',reject);second.once('close',resolve);});
      expect(code).not.toBe(0);expect(error).toContain('Another automation worker');
      const preview=spawn(process.execPath,['--import',loader,script,'--dry-run'],{cwd:root,stdio:'ignore'});
      const previewCode=await new Promise<number|null>((resolve,reject)=>{preview.once('error',reject);preview.once('close',resolve);});
      expect(previewCode).toBe(0);
      expect(first.exitCode).toBeNull();
    }finally{
      if(first && first.exitCode===null){const closed=new Promise<void>(resolve=>first!.once('close',()=>resolve()));first.kill();await closed;}
      await rm(root,{recursive:true,force:true});
    }
  },25000);
});
