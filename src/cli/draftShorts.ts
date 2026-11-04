import path from 'node:path';
import { generatePendingDrafts } from '../drafting/drafts.js';
const arg=(name:string)=>{const i=process.argv.indexOf('--'+name);return i<0?undefined:process.argv[i+1];};
await generatePendingDrafts(path.resolve('.'),arg('briefs'),arg('reference'),process.argv.includes('--dry-run'));
