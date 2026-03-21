import { NOTE_NAMES, parseChordName } from './music.js';

const MIN_CHROMA_FREQUENCY = 60;
const MAX_CHROMA_FREQUENCY = 2600;
const DETECTION_QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4'];
const DETECTION_LABELS = NOTE_NAMES.flatMap((note) => DETECTION_QUALITIES.map((quality) => `${note}${quality}`));

export function computeChromaFromFrequencyData(frequencyData, sampleRate, fftSize) {
  const chroma = new Float32Array(12);
  const binFrequency = sampleRate / fftSize;
  let total = 0;

  for (let index = 2; index < frequencyData.length; index += 1) {
    const frequency = index * binFrequency;
    if (frequency < MIN_CHROMA_FREQUENCY || frequency > MAX_CHROMA_FREQUENCY) {
      continue;
    }

    const magnitude = 10 ** (frequencyData[index] / 20);
    const energy = magnitude * magnitude;
    const midi = 69 + 12 * Math.log2(frequency / 440);
    const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pitchClass] += energy;
    total += energy;
  }

  if (total > 0) {
    for (let index = 0; index < 12; index += 1) {
      chroma[index] /= total;
    }
  }

  return Array.from(chroma);
}

export function smoothChroma(previous, next, alpha = 0.75) {
  return previous.map((value, index) => value * alpha + next[index] * (1 - alpha));
}

export function decayChroma(chroma, factor = 0.92) {
  return chroma.map((value) => value * factor);
}

export function makeChordTemplate(pitchClasses) {
  const template = new Array(12).fill(0);
  for (let index = 0; index < pitchClasses.length; index += 1) {
    template[pitchClasses[index]] = 1;
  }
  const sum = template.reduce((total, value) => total + value, 0);
  return sum > 0 ? template.map((value) => value / sum) : template;
}

export function cosineSimilarity(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < 12; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

export function detectBestChord(chroma, capo = 0) {
  let best = { name: '—', similarity: 0 };

  for (let index = 0; index < DETECTION_LABELS.length; index += 1) {
    const label = DETECTION_LABELS[index];
    const chord = parseChordName(label, capo);
    const similarity = cosineSimilarity(chroma, makeChordTemplate(chord.pitchClasses));
    if (similarity > best.similarity) {
      best = { name: label, similarity };
    }
  }

  return best;
}

export function appendSimilarity(previous, next) {
  return [...previous.slice(1), next];
}

export function createSimilarityHistory(length = 120) {
  return new Array(length).fill(0);
}

export function noteLabels() {
  return NOTE_NAMES;
}
