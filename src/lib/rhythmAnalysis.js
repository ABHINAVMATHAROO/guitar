export const RHYTHM_SUBDIVISIONS = {
  eighth: {
    value: 'eighth',
    label: '8th',
    stepsPerBeat: 2,
    labels: ['1', '&', '2', '&', '3', '&', '4', '&'],
    defaultPattern: [1, 0, 1, 0, 1, 0, 1, 0],
  },
  triplet: {
    value: 'triplet',
    label: 'triplet',
    stepsPerBeat: 3,
    labels: ['1', 'tri', 'let', '2', 'tri', 'let', '3', 'tri', 'let', '4', 'tri', 'let'],
    defaultPattern: [1, 0, -1, 1, 0, -1, 1, 0, -1, 1, 0, -1],
  },
};

export function getSubdivisionConfig(subdivision) {
  return RHYTHM_SUBDIVISIONS[subdivision] ?? RHYTHM_SUBDIVISIONS.eighth;
}

export function createDefaultPattern(subdivision) {
  return [...getSubdivisionConfig(subdivision).defaultPattern];
}

export function normalizePattern(pattern, subdivision) {
  const config = getSubdivisionConfig(subdivision);
  if (!Array.isArray(pattern) || pattern.length !== config.labels.length) {
    return createDefaultPattern(subdivision);
  }

  return pattern.map((value) => {
    if (value === -1 || value === 1) return value;
    return 0;
  });
}

export function createRhythmHistory(length = 120) {
  return new Array(length).fill(0);
}

export function appendRhythm(previous, next) {
  return [...previous.slice(1), next];
}

export function detectOnset({ silent, flux, fluxAverage, currentTime, lastOnsetTime, minFlux = 0.25, ratio = 1.45, cooldownMs = 0.12 }) {
  return (
    !silent &&
    flux > fluxAverage * ratio &&
    flux > minFlux &&
    currentTime - lastOnsetTime > cooldownMs
  );
}

function getStepDuration(bpm, patternLength) {
  if (!bpm || !patternLength) {
    return null;
  }
  const barDuration = (60 / bpm) * 4;
  return barDuration / patternLength;
}

export function computeBeatPosition({ currentTime, referenceTime, bpm, patternLength }) {
  if (referenceTime === null || referenceTime === undefined || !bpm || !patternLength) {
    return null;
  }

  const stepDuration = getStepDuration(bpm, patternLength);
  const barDuration = stepDuration * patternLength;
  return ((currentTime - referenceTime) % barDuration) / stepDuration;
}

export function computeRhythmAccuracy({ currentTime, referenceTime, bpm, pattern }) {
  if (referenceTime === null || referenceTime === undefined) {
    return 1;
  }

  const patternLength = pattern.length;
  const stepDuration = getStepDuration(bpm, patternLength);
  const barDuration = stepDuration * patternLength;
  const position = ((currentTime - referenceTime) % barDuration) / stepDuration;

  if (!pattern.some((step) => step !== 0)) {
    return 0;
  }

  let nearestError = Infinity;
  for (let index = 0; index < patternLength; index += 1) {
    if (pattern[index] === 0) {
      continue;
    }

    let diff = position - index;
    if (diff > patternLength / 2) diff -= patternLength;
    if (diff < -patternLength / 2) diff += patternLength;

    if (Math.abs(diff) < Math.abs(nearestError)) {
      nearestError = diff;
    }
  }

  const errorMs = nearestError * stepDuration * 1000;
  return Math.max(0, Math.min(1, 1 - Math.abs(errorMs) / 150));
}

export function averageAccuracy(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}
