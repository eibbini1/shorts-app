import { describe, expect, it } from 'vitest';
import { audioProfile, dirOf, lengthNote, shotOrder, totalSeconds } from './plan-summary.js';

const shots = [{ seconds: 5, sound: 'crack' }, { seconds: 5, sound: 'pour', narration: 'صب الكريمة' }, { seconds: 5 }];

describe('plan summary', () => {
  it('sums shot seconds', () => { expect(totalSeconds(shots)).toBe(15); expect(totalSeconds()).toBe(0); });
  it('describes ASMR without narration', () => {
    expect(audioProfile('asmr', shots).text).toMatch(/^No narration\./);
  });
  it('counts narrated shots for Voiced', () => {
    expect(audioProfile('voiced', shots).text).toContain('Narration on 1 of 3 shots');
  });
  it('reports what Auto contains, both ways', () => {
    expect(audioProfile('auto', shots).text).toContain('narration on 1 of 3 shots');
    expect(audioProfile('auto', [{ seconds: 5 }]).text).toContain('no narration');
  });
  it('flags a length mismatch only when it exists', () => {
    expect(lengthNote(20, shots)).toBe('The plan runs 15s; you asked for 20s.');
    expect(lengthNote(15, shots)).toBe('');
    expect(lengthNote(undefined, shots)).toBe('');
  });
  it('numbers shots with start and end times', () => {
    expect(shotOrder(shots).map((s) => [s.n, s.start, s.end])).toEqual([[1, 0, 5], [2, 5, 10], [3, 10, 15]]);
  });
  it('detects right-to-left text', () => {
    expect(dirOf('ملعقة تكسر القشرة')).toBe('rtl');
    expect(dirOf('A spoon taps the shell')).toBe('ltr');
    expect(dirOf('')).toBe('ltr');
  });
});
