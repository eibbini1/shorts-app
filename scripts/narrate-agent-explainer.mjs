import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { synthesize } from '../src/media/voice/VoiceProvider.ts';
import { chapters } from './agent-explainer-content.mjs';

const directory = 'storage/episodes/build-ai-agent';
const voice = { provider: 'elevenlabs', speed: 1, stability: 0.53, style: 0.22 };
const narration = [];
for (const [index, chapter] of chapters.entries()) {
  const take = await synthesize(chapter[3].join(' '), directory + '/voice', voice);
  narration.push(take);
  console.log('Narration chapter', index + 1, take.durationSec);
}
await writeFile(directory + '/narration.json', JSON.stringify(narration, null, 2));
