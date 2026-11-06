import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindWorkflow } from './local-media.mjs';
test('workflow preserves numeric bindings and source graph', () => {
  const source = { 1: { inputs: { seed: '{{seed}}', text: '{{prompt}}', link: ['2', 0] } } };
  const result = bindWorkflow(source, { seed: 42, prompt: 'Chocolate cracks' });
  assert.equal(result[1].inputs.seed, 42);
  assert.equal(result[1].inputs.text, 'Chocolate cracks');
  assert.deepEqual(result[1].inputs.link, ['2', 0]);
  assert.equal(source[1].inputs.seed, '{{seed}}');
});
test('unknown workflow bindings fail before submission', () => {
  assert.throws(() => bindWorkflow({ text: '{{typo}}' }, {}), /Unknown workflow binding/);
});
