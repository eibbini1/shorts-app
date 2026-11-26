import test from 'node:test';
import assert from 'node:assert/strict';
import { ingredientContract, outlineIngredientText, shotIngredientText } from './planner-ingredient-fidelity.mjs';

test('Arabic halloumi survives Arabic spelling and English translation, and rejects benchmark substitutions', () => {
  const contract = ingredientContract('يضع الطاهي قطعة الحَلُّوم في المقلاة مع الزعتر.');
  assert.deepEqual(contract.requested, ['halloumi']);
  assert.deepEqual(contract.missing('The chef sears halloumi.'), []);
  assert.deepEqual(contract.missing('يقدّم الحلوم.'), []);
  assert.deepEqual(contract.unexpected('The lamb browns in the pan.'), ['lamb']);
  assert.deepEqual(contract.unexpected('The crouton lands on the plate.'), ['crouton']);
  assert.deepEqual(contract.missing('A golden crouton rests on the plate.'), ['halloumi']);
});

test('known ingredients can coexist when requested and nested action text is checked', () => {
  const contract = ingredientContract('Halloumi', 'Serve with chicken.');
  const text = shotIngredientText({ imagePrompt: 'Halloumi on the board.', sceneState: { action: 'He adds lamb.' } });
  assert.deepEqual(contract.unexpected(text), ['lamb']);
  assert.deepEqual(contract.unexpected('Halloumi and chicken'), []);
  assert.equal(ingredientContract('A clay robot opens a door.'), null);
});

test('echoing the requested ending does not ground the outline subject', () => {
  const contract = ingredientContract('يقدّم الطاهي الحلوم.');
  const outline = { title: 'Folded pastry', hook: 'Fold phyllo', goal: 'Bake pastry',
    payoff: 'يقدّم الطاهي الحلوم.' };
  assert.deepEqual(contract.missing(outlineIngredientText(outline)), ['halloumi']);
  assert.deepEqual(contract.unexpected(outlineIngredientText(outline)), ['phyllo']);
  assert.deepEqual(contract.missing(outlineIngredientText({ ...outline, title: 'Golden halloumi' })), []);
});
