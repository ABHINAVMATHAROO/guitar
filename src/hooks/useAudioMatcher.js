import { useEffect, useRef, useState } from 'react';
import {
  appendSimilarity,
  computeChromaFromFrequencyData,
  cosineSimilarity,
  createSimilarityHistory,
  decayChroma,
  detectBestChord,
  makeChordTemplate,
  smoothChroma,
} from '../lib/chordAnalysis.js';
import {
  appendRhythm,
  averageAccuracy,
  computeBeatPosition,
  computeRhythmAccuracy,
  createRhythmHistory,
  detectOnset,
} from '../lib/rhythmAnalysis.js';
import {
  buildEmptyChroma,
  classifySignal,
  computeHarmonicity,
  computeRms,
  computeSpectralFlux,
  createMagnitudeFromDb,
  smoothValue,
} from '../lib/signalQualification.js';

const SIMILARITY_HISTORY_POINTS = 120;
const RHYTHM_HISTORY_POINTS = 120;
const CHORD_THRESHOLD = 0.85;
const RHYTHM_THRESHOLD = 0.7;
const CHORD_WINDOW_SECONDS = 0.24;

export function useAudioMatcher({ expectedPitchClasses, currentChordName, capo, bpm, pattern }) {
  const [permissionState, setPermissionState] = useState('idle');
  const [supported, setSupported] = useState(true);
  const [hearing, setHearing] = useState(false);
  const [signalQuality, setSignalQuality] = useState({ label: 'No signal', tone: 'off', silent: true });
  const [chordSimilarity, setChordSimilarity] = useState(0);
  const [latchedChordSimilarity, setLatchedChordSimilarity] = useState(0);
  const [chordHistory, setChordHistory] = useState(() => createSimilarityHistory(SIMILARITY_HISTORY_POINTS));
  const [chromaStrengths, setChromaStrengths] = useState(buildEmptyChroma);
  const [detectedChord, setDetectedChord] = useState({ name: '—', similarity: 0 });
  const [latchedDetectedChord, setLatchedDetectedChord] = useState({ name: '—', similarity: 0 });
  const [rhythmHistory, setRhythmHistory] = useState(() => createRhythmHistory(RHYTHM_HISTORY_POINTS));
  const [activeBeat, setActiveBeat] = useState(null);
  const [rhythmMetrics, setRhythmMetrics] = useState({ last: null, average: null, strums: 0 });

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const permissionStatusRef = useRef(null);
  const previousMagnitudeRef = useRef(null);
  const fluxBufferRef = useRef([]);
  const smoothedRmsRef = useRef(0);
  const smoothedChromaRef = useRef(buildEmptyChroma());
  const lastOnsetTimeRef = useRef(-1);
  const lastStrumTimeRef = useRef(-1);
  const rhythmReferenceRef = useRef(null);
  const accuracyBufferRef = useRef([]);
  const rhythmHistoryRef = useRef(createRhythmHistory(RHYTHM_HISTORY_POINTS));
  const totalStrumsRef = useRef(0);
  const chordWindowRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function detectSupportAndPermission() {
      const hasAudioContext = window.AudioContext || window.webkitAudioContext;
      const hasMediaDevices = Boolean(navigator.mediaDevices?.getUserMedia);

      if (!hasAudioContext || !hasMediaDevices) {
        if (!mounted) return;
        setSupported(false);
        setPermissionState('unsupported');
        return;
      }

      if (!navigator.permissions?.query) {
        if (mounted) {
          setPermissionState('prompt');
        }
        return;
      }

      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        permissionStatusRef.current = permissionStatus;
        if (!mounted) return;
        setPermissionState(permissionStatus.state);
        permissionStatus.onchange = () => {
          setPermissionState(permissionStatus.state);
        };
      } catch {
        if (mounted) {
          setPermissionState('prompt');
        }
      }
    }

    detectSupportAndPermission();

    return () => {
      mounted = false;
      if (permissionStatusRef.current) {
        permissionStatusRef.current.onchange = null;
      }
    };
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        stopListening();
      }
    }

    function handlePageHide() {
      stopListening();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      stopListening();
    };
  }, []);

  useEffect(() => {
    smoothedChromaRef.current = buildEmptyChroma();
    chordWindowRef.current = null;
    setChordSimilarity(0);
    setLatchedChordSimilarity(0);
    setChordHistory(createSimilarityHistory(SIMILARITY_HISTORY_POINTS));
    setDetectedChord({ name: currentChordName || '—', similarity: 0 });
    setLatchedDetectedChord({ name: currentChordName || '—', similarity: 0 });
  }, [currentChordName, expectedPitchClasses]);

  useEffect(() => {
    rhythmHistoryRef.current = rhythmHistory;
  }, [rhythmHistory]);

  function resetAnalysisState() {
    setSignalQuality({ label: 'No signal', tone: 'off', silent: true });
    setChordSimilarity(0);
    setLatchedChordSimilarity(0);
    setChordHistory(createSimilarityHistory(SIMILARITY_HISTORY_POINTS));
    setChromaStrengths(buildEmptyChroma());
    setDetectedChord({ name: currentChordName || '—', similarity: 0 });
    setLatchedDetectedChord({ name: currentChordName || '—', similarity: 0 });
    setRhythmHistory(createRhythmHistory(RHYTHM_HISTORY_POINTS));
    setActiveBeat(null);
    setRhythmMetrics({ last: null, average: null, strums: 0 });

    previousMagnitudeRef.current = null;
    fluxBufferRef.current = [];
    smoothedRmsRef.current = 0;
    smoothedChromaRef.current = buildEmptyChroma();
    lastOnsetTimeRef.current = -1;
    lastStrumTimeRef.current = -1;
    rhythmReferenceRef.current = null;
    accuracyBufferRef.current = [];
    totalStrumsRef.current = 0;
    rhythmHistoryRef.current = createRhythmHistory(RHYTHM_HISTORY_POINTS);
    chordWindowRef.current = null;
  }

  function detachStreamHandlers(stream) {
    if (!stream) return;
    stream.oninactive = null;
    stream.getTracks().forEach((track) => {
      track.onended = null;
      track.onmute = null;
      track.onunmute = null;
    });
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

    if (streamRef.current) {
      detachStreamHandlers(streamRef.current);
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.onstatechange = null;
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    resetAnalysisState();
    setPermissionState((current) => (current === 'unsupported' || current === 'denied' ? current : 'granted'));
  }

  function handleExternalStreamStop() {
    stopListening();
  }

  async function requestPermission() {
    if (!supported || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      setPermissionState('unsupported');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.08;

      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);

      stream.oninactive = handleExternalStreamStop;
      stream.getTracks().forEach((track) => {
        track.onended = handleExternalStreamStop;
        track.onmute = () => {
          if (!track.enabled || track.muted || track.readyState === 'ended') {
            handleExternalStreamStop();
          }
        };
        track.onunmute = null;
      });

      context.onstatechange = () => {
        if (context.state === 'closed' || context.state === 'interrupted') {
          handleExternalStreamStop();
        }
      };

      streamRef.current = stream;
      audioContextRef.current = context;
      analyserRef.current = analyser;
      sourceRef.current = source;
      setPermissionState('granted');
      return true;
    } catch (error) {
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        setPermissionState('denied');
      } else {
        setPermissionState('prompt');
      }
      return false;
    }
  }

  function lastRhythmValue() {
    return rhythmHistoryRef.current[rhythmHistoryRef.current.length - 1] ?? 0;
  }

  function commitChordWindow(windowState) {
    if (!windowState) {
      return;
    }
    setLatchedChordSimilarity(windowState.peakSimilarity);
    setLatchedDetectedChord(windowState.bestChord);
  }

  function processFrame() {
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;
    const stream = streamRef.current;
    if (!analyser || !audioContext || !stream || !stream.active || audioContext.state === 'closed') {
      handleExternalStreamStop();
      return;
    }

    const frequencyData = new Float32Array(analyser.frequencyBinCount);
    const timeData = new Float32Array(analyser.fftSize);
    analyser.getFloatFrequencyData(frequencyData);
    analyser.getFloatTimeDomainData(timeData);

    const rawRms = computeRms(timeData);
    smoothedRmsRef.current = smoothValue(smoothedRmsRef.current, rawRms, 0.85);

    const harmonicity = computeHarmonicity(timeData, audioContext.sampleRate);
    const quality = classifySignal({
      smoothedRms: smoothedRmsRef.current,
      harmonicity,
      silentThreshold: 0.013,
      harmonicThreshold: 0.3,
    });
    setSignalQuality(quality);

    const magnitude = createMagnitudeFromDb(frequencyData);
    const { flux, magnitude: nextMagnitude } = computeSpectralFlux(magnitude, previousMagnitudeRef.current);
    previousMagnitudeRef.current = nextMagnitude;
    fluxBufferRef.current.push(flux);
    if (fluxBufferRef.current.length > 20) {
      fluxBufferRef.current.shift();
    }
    const fluxAverage = fluxBufferRef.current.length
      ? fluxBufferRef.current.reduce((total, value) => total + value, 0) / fluxBufferRef.current.length
      : 0;

    const currentTime = audioContext.currentTime;
    const onset = detectOnset({
      silent: quality.silent,
      flux,
      fluxAverage,
      currentTime,
      lastOnsetTime: lastOnsetTimeRef.current,
    });

    if (!quality.silent) {
      const rawChroma = computeChromaFromFrequencyData(frequencyData, audioContext.sampleRate, analyser.fftSize);
      smoothedChromaRef.current = smoothChroma(smoothedChromaRef.current, rawChroma);
    } else {
      smoothedChromaRef.current = decayChroma(smoothedChromaRef.current);
    }

    const template = makeChordTemplate(expectedPitchClasses);
    const similarity = quality.silent ? 0 : Math.max(0, cosineSimilarity(smoothedChromaRef.current, template));
    const bestChord = quality.silent ? { name: currentChordName || '—', similarity: 0 } : detectBestChord(smoothedChromaRef.current, capo);

    setChordSimilarity(similarity);
    setDetectedChord(bestChord);
    setChromaStrengths(smoothedChromaRef.current);
    setChordHistory((previous) => appendSimilarity(previous, similarity));

    if (onset) {
      if (!rhythmReferenceRef.current) {
        rhythmReferenceRef.current = currentTime;
      }

      lastOnsetTimeRef.current = currentTime;
      lastStrumTimeRef.current = currentTime;
      chordWindowRef.current = {
        startTime: currentTime,
        peakSimilarity: similarity,
        bestChord,
      };

      const accuracy = computeRhythmAccuracy({
        currentTime,
        referenceTime: rhythmReferenceRef.current,
        bpm,
        pattern,
      });
      accuracyBufferRef.current.push(accuracy);
      if (accuracyBufferRef.current.length > 50) {
        accuracyBufferRef.current.shift();
      }
      totalStrumsRef.current += 1;
      setRhythmMetrics({
        last: accuracy,
        average: averageAccuracy(accuracyBufferRef.current),
        strums: totalStrumsRef.current,
      });
      setRhythmHistory((previous) => appendRhythm(previous, accuracy));
    } else {
      const inactiveFor = lastStrumTimeRef.current < 0 ? Number.POSITIVE_INFINITY : currentTime - lastStrumTimeRef.current;
      const nextValue = inactiveFor > ((60 / bpm) * 4) * 1.5 ? Math.max(0, lastRhythmValue() * 0.97) : lastRhythmValue();
      setRhythmHistory((previous) => appendRhythm(previous, nextValue));
    }

    const activeChordWindow = chordWindowRef.current;
    if (activeChordWindow) {
      if (!quality.silent && similarity >= activeChordWindow.peakSimilarity) {
        activeChordWindow.peakSimilarity = similarity;
        activeChordWindow.bestChord = bestChord;
      }

      if (currentTime - activeChordWindow.startTime >= CHORD_WINDOW_SECONDS) {
        commitChordWindow(activeChordWindow);
        chordWindowRef.current = null;
      }
    }

    const beatPosition = computeBeatPosition({ currentTime, referenceTime: rhythmReferenceRef.current, bpm, patternLength: pattern.length });
    setActiveBeat(beatPosition === null ? null : Math.floor(beatPosition) % pattern.length);

    frameRef.current = window.requestAnimationFrame(processFrame);
  }

  async function startListening() {
    if (hearing) {
      return true;
    }

    const granted = permissionState === 'granted' ? true : await requestPermission();
    if (!granted) {
      return false;
    }

    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    resetAnalysisState();
    setHearing(true);
    frameRef.current = window.requestAnimationFrame(processFrame);
    return true;
  }

  return {
    supported,
    permissionState,
    hearing,
    signalQuality,
    chordSimilarity,
    latchedChordSimilarity,
    chordThreshold: CHORD_THRESHOLD,
    chordHistory,
    chromaStrengths,
    detectedChord,
    latchedDetectedChord,
    rhythmHistory,
    rhythmThreshold: RHYTHM_THRESHOLD,
    activeBeat,
    rhythmMetrics,
    requestPermission,
    startListening,
    stopListening,
  };
}
