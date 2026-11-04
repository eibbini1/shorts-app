import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readUploadJournal } from '../publishing/publisher.js';
const root=process.cwd();
const journal=await readUploadJournal(root);
let report:{results:{spec:string;status:string;publishing?:string;error?:string}[]}={results:[]};
try{report=JSON.parse(await readFile(path.join(root,'storage/automation/latest-run.json'),'utf8'));}
catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
if(!report.results.length)console.log('No automation run recorded. Run npm run automate -- --dry-run.');
for(const row of report.results){const record=journal[row.spec.replace(/\\/g,'/')];console.log(row.spec+' | pack='+row.status+' | YouTube='+(record?.phase??row.publishing??'not-uploaded')+(record?.videoId?' | https://youtu.be/'+record.videoId:'')+(row.error?' | '+row.error:''));}
