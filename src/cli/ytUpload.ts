import 'dotenv/config';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { authorizeYouTube, authenticatedYouTube, saveCredentials } from '../publishing/auth.js';
import { publishPack } from '../publishing/publisher.js';
const root=process.cwd();
const arg=(name:string)=>{const i=process.argv.indexOf('--'+name);return i<0?undefined:process.argv[i+1];};
if (process.argv.includes('--auth')) {
  await authorizeYouTube(root,url=>console.log('Open this URL, choose the channel to publish to, and approve access:\n'+url));
  console.log('YouTube connected. Scheduled publishing can now run.');
} else {
  const plan=arg('plan');
  const meta=arg('meta');
  const pack=arg('pack') ?? (meta?.endsWith('.meta.json') ? meta.replace(/\.meta\.json$/,'.pack.json') : undefined);
  if (!plan && !pack) throw new Error('Usage: npm run yt-upload -- --auth | --pack episodes/name.pack.json [--at ISO_TIME] | --plan episodes/schedule.plan.json. Uploads require a complete passing QA pack.');
  const items: {pack:string;at?:string}[] = plan ? (JSON.parse(await readFile(path.resolve(root,plan),'utf8')) as {file:string;publishAtUtc:string}[]).map(item=>({pack:item.file.replace(/\.meta\.json$/,'.pack.json'),at:item.publishAtUtc})) : [{pack:pack!,at:arg('at')}];
  const config = JSON.parse((await readFile(path.join(root, 'automation.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const expectedChannelId = config?.publish?.expectedChannelId;
  if (typeof expectedChannelId !== 'string' || !expectedChannelId.trim()) {
    throw new Error('Set publish.expectedChannelId in automation.json before uploading.');
  }
  const connection=await authenticatedYouTube(root);
  try {
    for(const item of items) {
      const result=await publishPack(connection.api,path.resolve(root,item.pack),root,{at:item.at,expectedChannelId:expectedChannelId.trim()});
      console.log('SCHEDULED https://youtu.be/'+result.videoId+' at '+result.publishAt);
    }
  } finally { await saveCredentials(root,connection.oauth.credentials); }
}
