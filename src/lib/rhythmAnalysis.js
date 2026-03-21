export function createRhythmHistory(length = 120) {
  return new Array(length).fill(0);
}

export function appendRhythm(previous, next) {
  return [...previous.slice(1), next];
}

export function detectOnset({ silent, flux, fluxAverage, currentTime, lastOnsetTime, minFlux = 1.5, ratio = 2.2, cooldownMs = 0.12 }) {
  return (
    !silent &&
    flux > fluxAverage * ratio &&
    flux > minFlux &&
    currentTime - lastOnsetTime > cooldownMs
  );
}

export function computeBeatPosition({ currentTime, referenceTime, bpm }) {
  if (referenceTime === null || referenceTime === undefined || !bpm) {
    return null;
  }

  const eighthDuration = (60 / bpm) / 2;
  const barDuration = eighthDuration * 8;
  return ((currentTime - referenceTime) % barDuration) / eighthDuration;
}

export function computeRhythmAccuracy({ currentTime, referenceTime, bpm, pattern }) {
  if (referenceTime === null || referenceTime === undefined) {
    return 1;
  }

  const eighthDuration = (60 / bpm) / 2;
  const barDuration = eighthDuration * 8;
  const position = ((currentTime - referenceTime) % barDuration) / eighthDuration;

  if (!pattern.some(Boolean)) {
    return 0;
  }

  let nearestError = Infinity;
  for (let index = 0; index < 8; index += 1) {
    if (!pattern[index]) {
      continue;
    }

    let diff = position - index;
    if (diff > 4) diff -= 8;
    if (diff < -4) diff += 8;

    if (Math.abs(diff) < Math.abs(nearestError)) {
      nearestError = diff;
    }
  }

  const errorMs = nearestError * eighthDuration * 1000;
  return Math.max(0, Math.min(1, 1 - Math.abs(errorMs) / 150));
}

export function averageAccuracy(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export const RHYTHM_PRESETS = {
  quarter: [1, 0, 1, 0, 1, 0, 1, 0],
  eighth: [1, 1, 1, 1, 1, 1, 1, 1],
  ddu: [1, 0, 1, 0, 1, 1, 0, 0],
  dduudu: [1, 0, 1, 1, 0, 1, 1, 0],
  reggae: [0, 1, 0, 1, 0, 1, 0, 1],
};
