const NOTE_INDEX = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  'E#': 5,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const QUALITY_INTERVALS = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};

const CHORD_PATTERN =
  /^\s*([A-G](?:#|b)?)(maj7|m7|sus2|sus4|m|7)?(?:\/([A-G](?:#|b)?))?\s*$/i;

export function clampCapo(value) {
  const capo = Number.parseInt(value, 10);
  if (Number.isNaN(capo)) return 0;
  return Math.max(0, Math.min(12, capo));
}

export function normalizePitchClass(value) {
  return ((value % 12) + 12) % 12;
}

export function transposePitchClass(pitchClass, semitones) {
  return normalizePitchClass(pitchClass + semitones);
}

export function pitchClassToName(pitchClass) {
  return NOTE_NAMES[normalizePitchClass(pitchClass)];
}

export function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function pitchClassToFrequency(pitchClass, targetHz = 146.83) {
  const normalizedPitchClass = normalizePitchClass(pitchClass);
  let bestFrequency = midiToFrequency(normalizedPitchClass + 12 * 3);
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let octave = 1; octave <= 6; octave += 1) {
    const midi = normalizedPitchClass + 12 * (octave + 1);
    const frequency = midiToFrequency(midi);
    const distance = Math.abs(frequency - targetHz);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestFrequency = frequency;
    }
  }

  return bestFrequency;
}

export function parseChordName(input, capo = 0) {
  const match = CHORD_PATTERN.exec(input);
  if (!match) {
    throw new Error(`Unsupported chord: ${input}`);
  }

  const [, rootToken, qualityToken = '', bassToken] = match;
  const root = NOTE_INDEX[toCanonicalNote(rootToken)];
  const quality = qualityToken;
  const intervals = QUALITY_INTERVALS[quality];

  if (!intervals) {
    throw new Error(`Unsupported chord quality: ${qualityToken}`);
  }

  const soundingRoot = transposePitchClass(root, capo);
  const pitchClasses = intervals.map((interval) => transposePitchClass(root + interval, capo));
  const bassPitchClass = bassToken
    ? transposePitchClass(NOTE_INDEX[toCanonicalNote(bassToken)], capo)
    : null;

  return {
    raw: input.trim(),
    root,
    quality,
    capo,
    soundingRoot,
    bassPitchClass,
    pitchClasses: [...new Set(pitchClasses)].sort((a, b) => a - b),
    label: `${pitchClassToName(soundingRoot)}${quality}`,
  };
}

export function parseChordProgression(input, capo = 0) {
  return input
    .split(/[\s,|]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => parseChordName(token, capo));
}

export function toCanonicalNote(token) {
  const normalized = token[0].toUpperCase() + (token.slice(1) || '');
  return normalized.replace('?', '#').replace('?', 'b');
}

export function supportedChordLabels() {
  return ['major', 'minor', '7', 'maj7', 'm7', 'sus2', 'sus4'];
}
