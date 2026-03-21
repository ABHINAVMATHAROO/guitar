function overlapCount(actualPitchClasses, expectedPitchClasses) {
  const actualSet = new Set(actualPitchClasses);
  return expectedPitchClasses.filter((pitchClass) => actualSet.has(pitchClass)).length;
}

export function evaluateChordMatch(actualPitchClasses, expectedPitchClasses) {
  const uniqueActual = [...new Set(actualPitchClasses)];
  const uniqueExpected = [...new Set(expectedPitchClasses)];

  if (!uniqueActual.length || !uniqueExpected.length) {
    return {
      isMatch: false,
      confidence: 0,
      matchRatio: 0,
      noiseRatio: 1,
      heardPitchClasses: uniqueActual,
    };
  }

  const matches = overlapCount(uniqueActual, uniqueExpected);
  const matchRatio = matches / uniqueExpected.length;
  const noiseCount = uniqueActual.length - matches;
  const noiseRatio = noiseCount <= 0 ? 0 : noiseCount / uniqueActual.length;
  const confidence = Math.max(0, Math.min(1, matchRatio - noiseRatio * 0.45));
  const isMatch = matchRatio >= 0.67 && confidence >= 0.45;

  return {
    isMatch,
    confidence,
    matchRatio,
    noiseRatio,
    heardPitchClasses: uniqueActual,
  };
}
