import { NOTE_NAMES } from './music.js';

export function computeRms(samples) {
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) {
    energy += samples[index] * samples[index];
  }
  return Math.sqrt(energy / samples.length);
}

export function smoothValue(previous, next, alpha) {
  return previous * alpha + next * (1 - alpha);
}

export function computeHarmonicity(samples, sampleRate) {
  const size = Math.min(512, samples.length);
  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.min(Math.floor(sampleRate / 60), size - 1);

  let energy = 0;
  for (let index = 0; index < size; index += 1) {
    energy += samples[index] * samples[index];
  }

  if (energy / size < 0.0001) {
    return 0;
  }

  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    const usable = size - lag;
    for (let index = 0; index < usable; index += 1) {
      correlation += samples[index] * samples[index + lag];
    }
    correlation /= usable;
    if (correlation > best) {
      best = correlation;
    }
  }

  return Math.max(0, Math.min(1, best / (energy / size)));
}

export function computeSpectralFlux(currentMagnitude, previousMagnitude) {
  if (!previousMagnitude) {
    return { flux: 0, magnitude: currentMagnitude };
  }

  let flux = 0;
  for (let index = 0; index < currentMagnitude.length; index += 1) {
    const delta = currentMagnitude[index] - previousMagnitude[index];
    if (delta > 0) {
      flux += delta;
    }
  }

  return { flux, magnitude: currentMagnitude };
}

export function createMagnitudeFromDb(frequencyData) {
  const magnitude = new Float32Array(frequencyData.length);
  for (let index = 0; index < frequencyData.length; index += 1) {
    magnitude[index] = 10 ** (frequencyData[index] / 20);
  }
  return magnitude;
}

export function classifySignal({ smoothedRms, harmonicity, silentThreshold = 0.013, harmonicThreshold = 0.3 }) {
  if (smoothedRms < silentThreshold) {
    return {
      label: 'No signal',
      tone: 'off',
      silent: true,
    };
  }

  if (harmonicity > harmonicThreshold) {
    return {
      label: 'Good',
      tone: 'good',
      silent: false,
    };
  }

  return {
    label: 'Buzzy',
    tone: 'close',
    silent: false,
  };
}

export function buildEmptyChroma() {
  return new Array(NOTE_NAMES.length).fill(0);
}
