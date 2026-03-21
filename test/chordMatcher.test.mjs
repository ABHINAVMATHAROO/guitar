import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChordMatch } from '../src/lib/chordMatcher.js';

test('evaluateChordMatch accepts tolerant close matches', () => {
  const result = evaluateChordMatch([7, 11, 2], [7, 11, 2]);
  assert.equal(result.isMatch, true);
  assert.ok(result.confidence >= 0.45);
});

test('evaluateChordMatch rejects noisy partial misses', () => {
  const result = evaluateChordMatch([7, 9, 1], [7, 11, 2]);
  assert.equal(result.isMatch, false);
});
