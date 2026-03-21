import assert from 'node:assert/strict';
import { evaluateChordMatch } from '../src/lib/chordMatcher.js';
import { clampCapo, parseChordName, parseChordProgression } from '../src/lib/music.js';

const tests = [
  {
    name: 'clampCapo keeps values in guitar-friendly range',
    run() {
      assert.equal(clampCapo(-3), 0);
      assert.equal(clampCapo(20), 12);
      assert.equal(clampCapo(5), 5);
    },
  },
  {
    name: 'parseChordName transposes pitch classes with capo',
    run() {
      const chord = parseChordName('Em', 2);
      assert.equal(chord.label, 'F#m');
      assert.deepEqual(chord.pitchClasses, [1, 6, 9]);
    },
  },
  {
    name: 'parseChordProgression splits on common separators',
    run() {
      const chords = parseChordProgression('G | D, Em C', 0);
      assert.equal(chords.length, 4);
      assert.equal(chords[2].raw, 'Em');
    },
  },
  {
    name: 'evaluateChordMatch accepts tolerant close matches',
    run() {
      const result = evaluateChordMatch([7, 11, 2], [7, 11, 2]);
      assert.equal(result.isMatch, true);
      assert.ok(result.confidence >= 0.45);
    },
  },
  {
    name: 'evaluateChordMatch rejects noisy partial misses',
    run() {
      const result = evaluateChordMatch([7, 9, 1], [7, 11, 2]);
      assert.equal(result.isMatch, false);
    },
  },
];

let failed = 0;

for (const test of tests) {
  try {
    test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${test.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
  console.error(`\n${failed} test(s) failed.`);
} else {
  console.log(`\n${tests.length} test(s) passed.`);
}
