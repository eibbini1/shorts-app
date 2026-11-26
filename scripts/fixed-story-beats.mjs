import { hasVisiblePhysicalAction } from './story-action-gate.mjs';

function canonical(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function validateFixedBeats(input, count, ending = '') {
  if (!Array.isArray(input) || input.length !== count) throw new Error(`Fixed beats require exactly ${count} entries.`);
  const states = input.map((state, index) => {
    const values = ['before', 'action', 'after'].map(key => state?.[key]);
    if (values.some(value => typeof value !== 'string' || !value.trim() || value.length > 300)) {
      throw new Error(`Fixed beat ${index+1} requires before, action and after text of 1–300 characters.`);
    }
    const [before, action, after] = values.map(value => value.trim());
    if (!hasVisiblePhysicalAction(action) || canonical(before) === canonical(after)) {
      throw new Error(`Fixed beat ${index+1} requires a visible action that changes the state.`);
    }
    return { before, action, after };
  });
  for (let i = 1; i < states.length; i++) {
    if (states[i].before !== states[i-1].after) throw new Error(`Fixed beat ${i+1} must start at the previous exact end state.`);
  }
  if (new Set(states.map(state => canonical(state.action))).size !== states.length ||
      new Set([states[0].before, ...states.map(state => state.after)].map(canonical)).size !== states.length + 1) {
    throw new Error('Fixed beats cannot repeat an action or return to an earlier state.');
  }
  if (ending && canonical(states.at(-1).after) !== canonical(ending)) {
    throw new Error('The last fixed beat must end at the requested ending.');
  }
  return states;
}
