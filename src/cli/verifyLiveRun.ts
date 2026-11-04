import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadSpec,inputDigest } from '../automation/spec.js';
import { verifyPack } from '../automation/pack.js';
const root=process.cwd();const i=process.argv.indexOf('--spec');
const config=JSON.parse(await readFile(path.join(root,'automation.json'),'utf8')) as {specs:string[]};
const specs=i>=0?[process.argv[i+1]!]:config.specs;
for(const relative of specs){try{const file=path.resolve(root,relative);const spec=await loadSpec(file,root);await verifyPack(file.replace(/\.assemble\.json$/,'.pack.json'),root,await inputDigest(file,spec,root));console.log('VERIFIED '+relative);}catch(error){process.exitCode=1;console.error('FAILED '+relative+': '+(error instanceof Error?error.message:String(error)));}}
