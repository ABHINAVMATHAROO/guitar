import { useEffect, useRef, useState } from 'react';
import { evaluateChordMatch } from '../lib/chordMatcher.js';
import { autoCorrelate, frequencyToNoteInfo, frequencyToPitchClass } from '../lib/pitchDetection.js';

const WINDOW_MS = 1400;
const PITCH_HISTORY_POINTS = 120;
const MIN_GUITAR_FREQUENCY = 70;
const MAX_GUITAR_FREQUENCY = 420;
const MIN_SIGNAL_RMS = 0.01;
const MIN_SPECTRUM_PEAK = 0.12;
const NOISE_FLOOR_ALPHA = 0.035;

function createEmptyPitchHistory() {
  return new Array(PITCH_HISTORY_POINTS).fill(null);
}

function createEmptyChroma() {
  return new Array(12).fill(0);
}

function computeRms(samples) {
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) {
    energy += samples[index] * samples[index];
  }
  return Math.sqrt(energy / samples.length);
}

function sampleSpectrumPeak(frequencyData, sampleRate, maxFrequency = 800) {
  const nyquist = sampleRate / 2;
  const maxIndex = Math.max(1, Math.floor((maxFrequency / nyquist) * frequencyData.length));
  let peak = 0;

  for (let index = 0; index < maxIndex && index < frequencyData.length; index += 1) {
    peak = Math.max(peak, frequencyData[index] / 255);
  }

  return peak;
}

function appendPitch(previous, nextValue) {
  return [...previous.slice(1), nextValue];
}

function applyNoiseGate(samples, threshold) {
  return samples.map((sample) => (Math.abs(sample) < threshold ? 0 : sample));
}

function buildChromaStrengths(activity) {
  if (!activity.length) return createEmptyChroma();

  const counts = new Array(12).fill(0);
  for (let index = 0; index < activity.length; index += 1) {
    counts[activity[index].pitchClass] += 1;
  }

  const peak = Math.max(...counts, 1);
  return counts.map((count) => count / peak);
}

export function useAudioMatcher(expectedPitchClasses) {
  const [permissionState, setPermissionState] = useState('idle');
  const [supported, setSupported] = useState(true);
  const [hearing, setHearing] = useState(false);
  const [pitchHistory, setPitchHistory] = useState(createEmptyPitchHistory);
  const [chromaStrengths, setChromaStrengths] = useState(createEmptyChroma);
  const [detectedFrequency, setDetectedFrequency] = useState(null);
  const [noteInfo, setNoteInfo] = useState(null);
  const [result, setResult] = useState({
    isMatch: false,
    confidence: 0,
    matchRatio: 0,
    noiseRatio: 1,
    heardPitchClasses: [],
  });

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);
  const highpassRef = useRef(null);
  const lowpassRef = useRef(null);
  const compressorRef = useRef(null);
  const frameRef = useRef(0);
  const activityRef = useRef([]);
  const lastDetectionRef = useRef(0);
  const ambientRmsRef = useRef(MIN_SIGNAL_RMS * 0.6);
  const ambientPeakRef = useRef(MIN_SPECTRUM_PEAK * 0.5);

  useEffect(() => {
    if (!window.AudioContext && !window.webkitAudioContext) {
      setSupported(false);
      setPermissionState('unsupported');
    }
  }, []);

  useEffect(() => {
    if (!expectedPitchClasses.length) {
      setResult({
        isMatch: false,
        confidence: 0,
        matchRatio: 0,
        noiseRatio: 1,
        heardPitchClasses: [],
      });
    }
  }, [expectedPitchClasses]);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  async function requestPermission() {
    if (!supported) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      streamRef.current = stream;
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyser.minDecibels = -88;
      analyser.maxDecibels = -12;

      const source = context.createMediaStreamSource(stream);
      const highpass = context.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 82;
      highpass.Q.value = 0.8;

      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 950;
      lowpass.Q.value = 0.9;

      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -30;
      compressor.knee.value = 18;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.22;

      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(compressor);
      compressor.connect(analyser);

      audioContextRef.current = context;
      analyserRef.current = analyser;
      sourceRef.current = source;
      highpassRef.current = highpass;
      lowpassRef.current = lowpass;
      compressorRef.current = compressor;
      setPermissionState('granted');
      return true;
    } catch {
      setPermissionState('denied');
      return false;
    }
  }

  function resetDetectionState() {
    setResult({
      isMatch: false,
      confidence: 0,
      matchRatio: 0,
      noiseRatio: 1,
      heardPitchClasses: [],
    });
    setDetectedFrequency(null);
    setNoteInfo(null);
    setChromaStrengths(createEmptyChroma());
  }

  function processFrame() {
    const analyser = analyserRef.current;
    const context = audioContextRef.current;
    if (!analyser || !context) return;

    const timeData = new Float32Array(analyser.fftSize);
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getFloatTimeDomainData(timeData);
    analyser.getByteFrequencyData(frequencyData);

    const rawRms = computeRms(timeData);
    const dynamicGate = Math.max(MIN_SIGNAL_RMS * 0.6, ambientRmsRef.current * 1.35);
    const cleanedTimeData = applyNoiseGate(Array.from(timeData), dynamicGate);
    const cleanedRms = computeRms(cleanedTimeData);
    const spectrumPeak = sampleSpectrumPeak(frequencyData, context.sampleRate);
    const now = performance.now();

    activityRef.current = activityRef.current.filter((sample) => now - sample.time <= WINDOW_MS);

    const activeSignal =
      cleanedRms >= Math.max(MIN_SIGNAL_RMS, ambientRmsRef.current * 2.4) &&
      spectrumPeak >= Math.max(MIN_SPECTRUM_PEAK, ambientPeakRef.current + 0.08);

    if (!activeSignal) {
      ambientRmsRef.current += (rawRms - ambientRmsRef.current) * NOISE_FLOOR_ALPHA;
      ambientPeakRef.current += (spectrumPeak - ambientPeakRef.current) * NOISE_FLOOR_ALPHA;
      setPitchHistory((previous) => appendPitch(previous, null));
      setChromaStrengths(buildChromaStrengths(activityRef.current));

      if (now - lastDetectionRef.current > WINDOW_MS) {
        resetDetectionState();
      }

      frameRef.current = window.requestAnimationFrame(processFrame);
      return;
    }

    const frequency = autoCorrelate(cleanedTimeData, context.sampleRate);
    const validFrequency =
      Number.isFinite(frequency) && frequency >= MIN_GUITAR_FREQUENCY && frequency <= MAX_GUITAR_FREQUENCY
        ? frequency
        : null;

    if (validFrequency !== null) {
      const pitchClass = frequencyToPitchClass(validFrequency);
      if (pitchClass !== null) {
        activityRef.current.push({ pitchClass, frequency: validFrequency, time: now });
        lastDetectionRef.current = now;
        setDetectedFrequency(validFrequency);
        setNoteInfo(frequencyToNoteInfo(validFrequency));
      }
    }

    activityRef.current = activityRef.current.filter((sample) => now - sample.time <= WINDOW_MS);
    setChromaStrengths(buildChromaStrengths(activityRef.current));

    if (activityRef.current.length >= 4) {
      const counts = activityRef.current.reduce((accumulator, sample) => {
        accumulator[sample.pitchClass] = (accumulator[sample.pitchClass] || 0) + 1;
        return accumulator;
      }, {});

      const dominantPitchClasses = Object.entries(counts)
        .filter(([, count]) => count >= 2)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([pitchClassValue]) => Number(pitchClassValue));

      setResult(evaluateChordMatch(dominantPitchClasses, expectedPitchClasses));
    } else if (now - lastDetectionRef.current > WINDOW_MS) {
      resetDetectionState();
    }

    setPitchHistory((previous) => appendPitch(previous, validFrequency));
    frameRef.current = window.requestAnimationFrame(processFrame);
  }

  async function startListening() {
    const granted = permissionState === 'granted' ? true : await requestPermission();
    if (!granted) return;

    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    setHearing(true);
    activityRef.current = [];
    ambientRmsRef.current = MIN_SIGNAL_RMS * 0.6;
    ambientPeakRef.current = MIN_SPECTRUM_PEAK * 0.5;
    setPitchHistory(createEmptyPitchHistory());
    setChromaStrengths(createEmptyChroma());
    frameRef.current = window.requestAnimationFrame(processFrame);
  }

  function stopListening() {
    setHearing(false);
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (highpassRef.current) {
      highpassRef.current.disconnect();
      highpassRef.current = null;
    }

    if (lowpassRef.current) {
      lowpassRef.current.disconnect();
      lowpassRef.current = null;
    }

    if (compressorRef.current) {
      compressorRef.current.disconnect();
      compressorRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setPitchHistory(createEmptyPitchHistory());
    setDetectedFrequency(null);
    setNoteInfo(null);
    setChromaStrengths(createEmptyChroma());
    setPermissionState((current) => (current === 'unsupported' ? current : 'idle'));
  }

  return {
    supported,
    permissionState,
    hearing,
    result,
    detectedFrequency,
    noteInfo,
    pitchHistory,
    chromaStrengths,
    requestPermission,
    startListening,
    stopListening,
  };
}
