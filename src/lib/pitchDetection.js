import { NOTE_NAMES, normalizePitchClass } from './music.js';

export function autoCorrelate(buffer, sampleRate) {
  const size = buffer.length;
  let rms = 0;

  for (let index = 0; index < size; index += 1) {
    const sample = buffer[index];
    rms += sample * sample;
  }

  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return -1;

  let bestOffset = -1;
  let bestCorrelation = 0;
  let previousCorrelation = 1;
  const maxSamples = Math.floor(size / 2);

  for (let offset = 8; offset < maxSamples; offset += 1) {
    let correlation = 0;

    for (let index = 0; index < maxSamples; index += 1) {
      correlation += Math.abs(buffer[index] - buffer[index + offset]);
    }

    correlation = 1 - correlation / maxSamples;

    if (correlation > 0.9 && correlation > previousCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    } else if (bestCorrelation > 0.9 && correlation < previousCorrelation) {
      const shift = (correlation - previousCorrelation) / bestCorrelation;
      return sampleRate / (bestOffset + 8 * shift);
    }

    previousCorrelation = correlation;
  }

  if (bestCorrelation > 0.92 && bestOffset !== -1) {
    return sampleRate / bestOffset;
  }

  return -1;
}

export function frequencyToMidi(frequency) {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function frequencyToPitchClass(frequency) {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const midi = Math.round(frequencyToMidi(frequency));
  return normalizePitchClass(midi);
}

export function midiToNoteInfo(midi) {
  const roundedMidi = Math.round(midi);
  const pitchClass = normalizePitchClass(roundedMidi);
  const octave = Math.floor(roundedMidi / 12) - 1;

  return {
    midi: roundedMidi,
    pitchClass,
    noteName: NOTE_NAMES[pitchClass],
    octave,
    label: `${NOTE_NAMES[pitchClass]}${octave}`,
  };
}

export function frequencyToNoteInfo(frequency) {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;

  const exactMidi = frequencyToMidi(frequency);
  const nearest = midiToNoteInfo(exactMidi);
  const cents = Math.round((exactMidi - nearest.midi) * 100);

  return {
    ...nearest,
    frequency,
    exactMidi,
    cents,
  };
}
