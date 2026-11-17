import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIdeaService } from './studio-ideas.mjs';

test('all four categories rotate while a render is busy without invoking another model', async () => {
  const service = createIdeaService({ choose: () => 0, fetchImpl: async () => { throw new Error('must not run'); } });
  for (const look of ['food', 'cartoon', 'night', 'custom']) {
    const first = await service.suggest({ look, busy: true });
    const second = await service.suggest({ look, busy: true, exclude: [first.prompt] });
    assert.notEqual(first.prompt, second.prompt);
    assert.equal(first.look, look);
    assert.equal(first.source, 'sample');
    assert.equal(first.trend, null);
    assert.match(first.prompt, /then/);
  }
  await assert.rejects(service.suggest({ look: 'unknown' }));
});

test('fresh matching search evidence is retained and model failure returns an honest sample', async () => {
  const modelIdea = { title: 'Crisp potatoes', prompt: 'A chef crisps potato cups, then fills them with cheese.',
    ending: 'The same crisp potato cup holds melted cheese on a small plate.', trendTitle: 'Potato recipes' };
  const fresh = () => ({ fetchedAt: new Date().toISOString(), region: 'US',
    sourceUrl: 'https://trends.google.com/trending/rss?geo=US', matches: [{ trend: 'Potato recipes' }] });
  const service = createIdeaService({ choose: () => 0, trendReader: fresh,
    fetchImpl: async () => ({ ok: true, json: async () => ({ message: { content: JSON.stringify(modelIdea) } }) }) });
  const result = await service.suggest({ look: 'food' });
  assert.equal(result.source, 'local-model');
  assert.equal(result.trend.title, 'Potato recipes');
  assert.match(result.note, /unverified/);
  const repeated = await service.suggest({ look: 'food', exclude: [modelIdea.prompt] });
  assert.equal(repeated.source, 'sample');
  const stale = createIdeaService({ choose: () => 0, trendReader: () => ({ ...fresh(), fetchedAt: '2020-01-01' }),
    fetchImpl: async () => ({ ok: true, json: async () => ({ message: { content: JSON.stringify(modelIdea) } }) }) });
  assert.equal((await stale.suggest({ look: 'food' })).trend, null);
});
