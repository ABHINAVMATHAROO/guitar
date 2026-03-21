import test from 'node:test';
import assert from 'node:assert/strict';
import { clampCapo, parseChordName, parseChordProgression } from '../src/lib/music.js';

test('clampCapo keeps values in guitar-friendly range', () => {
  assert.equal(clampCapo(-3), 0);
  assert.equal(clampCapo(20), 12);
  assert.equal(clampCapo(5), 5);
});

test('parseChordName transposes pitch classes with capo', () => {
  const chord = parseChordName('Em', 2);
  assert.equal(chord.label, 'F#m');
  assert.deepEqual(chord.pitchClasses, [1, 6, 9]);
});

test('parseChordProgression splits on common separators', () => {
  const chords = parseChordProgression('G | D, Em C', 0);
  assert.equal(chords.length, 4);
  assert.equal(chords[2].raw, 'Em');
});
