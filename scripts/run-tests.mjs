import assert from 'node:assert/strict';
import { evaluateChordMatch } from '../src/lib/chordMatcher.js';
import {
  appendRhythm,
  averageAccuracy,
  computeBeatPosition,
  computeRhythmAccuracy,
  detectOnset,
} from '../src/lib/rhythmAnalysis.js';
import {
  clampCapo,
  parseChordName,
  parseChordProgression,
} from '../src/lib/music.js';
import {
  computeChromaFromFrequencyData,
  cosineSimilarity,
  detectBestChord,
  makeChordTemplate,
} from '../src/lib/chordAnalysis.js';
import {
  buildEmptyChroma,
  classifySignal,
  computeSpectralFlux,
} from '../src/lib/signalQualification.js';

function nearlyEqual(left, right, tolerance = 1e-6) {
  assert.ok(Math.abs(left - right) <= tolerance, `Expected ${left} to be within ${tolerance} of ${right}`);
}

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
  {
    name: 'makeChordTemplate normalizes active pitch classes',
    run() {
      const template = makeChordTemplate([0, 4, 7]);
      nearlyEqual(template[0], 1 / 3);
      nearlyEqual(template[4], 1 / 3);
      nearlyEqual(template[7], 1 / 3);
      nearlyEqual(template.reduce((sum, value) => sum + value, 0), 1);
    },
  },
  {
    name: 'cosineSimilarity prefers matching chord templates',
    run() {
      const major = makeChordTemplate([0, 4, 7]);
      const minor = makeChordTemplate([0, 3, 7]);
      assert.ok(cosineSimilarity(major, major) > cosineSimilarity(major, minor));
    },
  },
  {
    name: 'computeChromaFromFrequencyData normalizes synthetic peaks',
    run() {
      const sampleRate = 48_000;
      const fftSize = 8192;
      const frequencyData = new Float32Array(fftSize / 2).fill(-120);
      const binFrequency = sampleRate / fftSize;
      const aIndex = Math.round(440 / binFrequency);
      frequencyData[aIndex] = -20;
      const chroma = computeChromaFromFrequencyData(frequencyData, sampleRate, fftSize);
      const total = chroma.reduce((sum, value) => sum + value, 0);
      nearlyEqual(total, 1, 1e-4);
      assert.ok(chroma[9] > 0.95);
    },
  },
  {
    name: 'detectBestChord identifies capo-aware chord shapes from chroma',
    run() {
      const chord = parseChordName('Em', 2);
      const detected = detectBestChord(makeChordTemplate(chord.pitchClasses), 2);
      assert.equal(detected.name, 'Em');
      assert.ok(detected.similarity > 0.99);
    },
  },
  {
    name: 'classifySignal separates silent good and buzzy input',
    run() {
      assert.equal(classifySignal({ smoothedRms: 0.005, harmonicity: 0.8 }).label, 'No signal');
      assert.equal(classifySignal({ smoothedRms: 0.02, harmonicity: 0.6 }).label, 'Good');
      assert.equal(classifySignal({ smoothedRms: 0.02, harmonicity: 0.1 }).label, 'Buzzy');
    },
  },
  {
    name: 'computeSpectralFlux responds only to upward spectral energy',
    run() {
      const previous = new Float32Array([0.5, 0.25, 0.2]);
      const current = new Float32Array([0.75, 0.2, 0.6]);
      const { flux } = computeSpectralFlux(current, previous);
      nearlyEqual(flux, 0.65);
    },
  },
  {
    name: 'buildEmptyChroma returns twelve note bins',
    run() {
      const chroma = buildEmptyChroma();
      assert.equal(chroma.length, 12);
      assert.ok(chroma.every((value) => value === 0));
    },
  },
  {
    name: 'detectOnset respects silence and cooldown thresholds',
    run() {
      assert.equal(detectOnset({ silent: true, flux: 4, fluxAverage: 1, currentTime: 1, lastOnsetTime: 0 }), false);
      assert.equal(detectOnset({ silent: false, flux: 4, fluxAverage: 1, currentTime: 1, lastOnsetTime: 0.5 }), true);
      assert.equal(detectOnset({ silent: false, flux: 4, fluxAverage: 1, currentTime: 0.55, lastOnsetTime: 0.5 }), false);
    },
  },
  {
    name: 'computeBeatPosition maps time into the eight-step bar grid',
    run() {
      nearlyEqual(computeBeatPosition({ currentTime: 0.25, referenceTime: 0, bpm: 120 }), 1);
      nearlyEqual(computeBeatPosition({ currentTime: 1.0, referenceTime: 0, bpm: 120 }), 4);
    },
  },
  {
    name: 'computeRhythmAccuracy rewards on-time strums more than off-time strums',
    run() {
      const pattern = [1, 0, 1, 0, 1, 0, 1, 0];
      const perfect = computeRhythmAccuracy({ currentTime: 0.5, referenceTime: 0, bpm: 120, pattern });
      const late = computeRhythmAccuracy({ currentTime: 0.62, referenceTime: 0, bpm: 120, pattern });
      assert.ok(perfect > late);
      nearlyEqual(perfect, 1);
    },
  },
  {
    name: 'appendRhythm preserves a fixed history length',
    run() {
      const next = appendRhythm([0, 0.2, 0.4], 0.6);
      assert.deepEqual(next, [0.2, 0.4, 0.6]);
    },
  },
  {
    name: 'averageAccuracy reports zero for empty histories',
    run() {
      assert.equal(averageAccuracy([]), 0);
      nearlyEqual(averageAccuracy([0.5, 1]), 0.75);
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
