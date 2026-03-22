import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAudioMatcher } from './hooks/useAudioMatcher.js';
import { noteLabels } from './lib/chordAnalysis.js';
import { NOTE_NAMES, clampCapo, parseChordName } from './lib/music.js';
import { createDefaultPattern, getSubdivisionConfig, normalizePattern } from './lib/rhythmAnalysis.js';

const STORAGE_KEY = 'guitar-cafe-trainer:settings';
const PICKER_ITEM_HEIGHT = 46;
const TEMPO_GROUP = 'tempo';
const STRUM_GROUP = 'strum';
const CHORD_GROUPS = ['chords-a', 'chords-b'];
const CAPO_OPTIONS = Array.from({ length: 13 }, (_, index) => ({ value: index, label: `${index}` }));
const BPM_OPTIONS = Array.from({ length: 181 }, (_, index) => ({ value: index + 40, label: `${index + 40}` }));
const ROOT_OPTIONS = NOTE_NAMES.map((note) => ({ value: note, label: note }));
const SUBDIVISION_OPTIONS = [
  { value: 'eighth', label: '8th' },
  { value: 'triplet', label: 'triplet' },
];
const QUALITY_OPTIONS = [
  { value: '', label: 'maj' },
  { value: 'm', label: 'min' },
  { value: '7', label: '7' },
  { value: 'maj7', label: 'maj7' },
  { value: 'm7', label: 'm7' },
  { value: 'sus2', label: 'sus2' },
  { value: 'sus4', label: 'sus4' },
];
const ASSET_BASE = import.meta.env.BASE_URL;

const defaultSettings = {
  capo: 0,
  bpm: 72,
  mode: 'auto',
  subdivision: 'eighth',
  pattern: createDefaultPattern('eighth'),
  chords: [
    { root: 'G', quality: '' },
    { root: 'D', quality: '' },
    { root: 'E', quality: 'm' },
    { root: 'C', quality: '' },
  ],
};

function loadSettings() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return defaultSettings;

  try {
    const parsed = JSON.parse(saved);
    const subdivision = parsed.subdivision ?? defaultSettings.subdivision;
    return {
      ...defaultSettings,
      ...parsed,
      subdivision,
      pattern: normalizePattern(parsed.pattern, subdivision),
      chords: Array.isArray(parsed.chords) && parsed.chords.length === 4 ? parsed.chords : defaultSettings.chords,
    };
  } catch {
    return defaultSettings;
  }
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function chordGroupForIndex(index) {
  return CHORD_GROUPS[Math.floor(index / 2)];
}

function buildHistoryPath(data) {
  if (!data.length) return '';
  return data
    .map((value, index) => {
      const x = (index / Math.max(1, data.length - 1)) * 100;
      const y = 100 - Math.max(0, Math.min(1, value ?? 0)) * 100;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

function patternSymbol(step) {
  if (step === 1) return 'D';
  if (step === -1) return 'U';
  return '-';
}

function cyclePatternStep(step) {
  if (step === 0) return 1;
  if (step === 1) return -1;
  return 0;
}

function HistoryChart({ history, threshold, title, detail, statusText, statusTone, compact = false }) {
  const path = useMemo(() => buildHistoryPath(history), [history]);
  const thresholdY = 100 - threshold * 100;

  return (
    <div className="analysis-block">
      <div className={compact ? 'scope-meta' : 'scope-meta scope-meta-top'}>
        <span>{compact ? detail : title}</span>
        <span className={`heard-status ${statusTone}`}>{statusText}</span>
      </div>
      {compact ? null : (
        <div className="scope-meta scope-meta-bottom">
          <span>{detail}</span>
        </div>
      )}
      <div className="scope-screen">
        <div className="scope-sweep" aria-hidden="true" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="scope-svg" aria-hidden="true">
          <defs>
            <pattern id={`scope-grid-${title.replace(/\s+/g, '-')}`} width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(74,255,137,0.10)" strokeWidth="0.45" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill={`url(#scope-grid-${title.replace(/\s+/g, '-')})`} />
          <line x1="0" y1={thresholdY} x2="100" y2={thresholdY} className="scope-expected" />
          <path d={path} className="scope-line" />
        </svg>
      </div>
    </div>
  );
}

function ChromaStrip({ expectedPitchClasses, chromaStrengths }) {
  const expectedSet = useMemo(() => new Set(expectedPitchClasses), [expectedPitchClasses]);
  const labels = noteLabels();

  return (
    <div className="chroma-wrap">
      <div className="chroma-grid" role="img" aria-label="Expected and heard note classes">
        {labels.map((note, index) => {
          const expected = expectedSet.has(index);
          const strength = chromaStrengths[index] ?? 0;
          return (
            <div key={note} className={expected ? 'chroma-cell expected' : 'chroma-cell'}>
              <div className="chroma-fill" style={{ transform: `scaleY(${Math.max(0.04, strength)})` }} />
              <span className="chroma-label">{note}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mic-icon" fill="none">
      <path d="M19 9v3a5.006 5.006 0 0 1-5 5h-4a5.006 5.006 0 0 1-5-5V9m7 9v3m-3 0h6M11 3h2a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mic-icon">
      <path d="M19.97 9.012a1 1 0 1 0-2 0h2Zm-1 2.988 1 .001V12h-1Zm-8.962 4.98-.001 1h.001v-1Zm-3.52-1.46.708-.708-.707.707ZM5.029 12h-1v.001l1-.001Zm3.984 7.963a1 1 0 1 0 0 2v-2Zm5.975 2a1 1 0 0 0 0-2v2ZM7.017 8.017a1 1 0 1 0 2 0h-2Zm6.641 4.862a1 1 0 1 0 .667 1.886l-.667-1.886Zm-7.63-2.87a1 1 0 1 0-2 0h2Zm9.953 5.435a1 1 0 1 0 1 1.731l-1-1.731ZM12 16.979h1a1 1 0 0 0-1-1v1ZM5.736 4.322a1 1 0 0 0-1.414 1.414l1.414-1.414Zm12.528 15.356a1 1 0 0 0 1.414-1.414l-1.414 1.414ZM17.97 9.012V12h2V9.012h-2Zm0 2.987a3.985 3.985 0 0 1-1.168 2.813l1.415 1.414a5.985 5.985 0 0 0 1.753-4.225l-2-.002Zm-7.962 3.98a3.985 3.985 0 0 1-2.813-1.167l-1.414 1.414a5.985 5.985 0 0 0 4.225 1.753l.002-2Zm-2.813-1.167a3.985 3.985 0 0 1-1.167-2.813l-2 .002a5.985 5.985 0 0 0 1.753 4.225l1.414-1.414Zm3.808-10.775h1.992v-2h-1.992v2Zm1.992 0c1.097 0 1.987.89 1.987 1.988h2a3.988 3.988 0 0 0-3.987-3.988v2Zm1.987 1.988v4.98h2v-4.98h-2Zm-5.967 0c0-1.098.89-1.988 1.988-1.988v-2a3.988 3.988 0 0 0-3.988 3.988h2Zm-.004 15.938H12v-2H9.012v2Zm2.988 0h2.987v-2H12v2ZM9.016 8.017V6.025h-2v1.992h2Zm5.967 2.987a1.99 1.99 0 0 1-1.325 1.875l.667 1.886a3.989 3.989 0 0 0 2.658-3.76h-2ZM6.03 12v-1.992h-2V12h2Zm10.774 2.812a3.92 3.92 0 0 1-.823.632l1.002 1.731a5.982 5.982 0 0 0 1.236-.949l-1.415-1.414ZM4.322 5.736l13.942 13.942 1.414-1.414L5.736 4.322 4.322 5.736ZM12 15.98h-1.992v2H12v-2Zm-1 1v3.984h2V16.98h-2Z" fill="currentColor" />
    </svg>
  );
}

function LoopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mic-icon" fill="none">
      <path d="m16 10 3-3m0 0-3-3m3 3H5v3m3 4-3 3m0 0 3 3m-3-3h14v-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mic-icon" fill="none">
      <path d="M20 12H8m12 0-4 4m4-4-4-4M9 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function WheelScroller({ label, options, value, onChange, autoClose = false, onDone }) {
  const ref = useRef(null);
  const settleRef = useRef(0);
  const index = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTo({ top: index * PICKER_ITEM_HEIGHT, behavior: 'smooth' });
  }, [index]);

  useEffect(() => () => {
    if (settleRef.current) {
      window.clearTimeout(settleRef.current);
    }
  }, []);

  function commitValue(nextValue) {
    if (nextValue !== value) {
      onChange(nextValue);
    }
    if (autoClose) {
      onDone?.();
    }
  }

  function settleSelection() {
    if (!ref.current) return;
    const nextIndex = Math.max(0, Math.min(options.length - 1, Math.round(ref.current.scrollTop / PICKER_ITEM_HEIGHT)));
    const nextValue = options[nextIndex].value;
    ref.current.scrollTo({ top: nextIndex * PICKER_ITEM_HEIGHT, behavior: 'smooth' });
    commitValue(nextValue);
  }

  function handleScroll() {
    window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(settleSelection, 90);
  }

  return (
    <div className="wheel-block">
      <span className="picker-label">{label}</span>
      <div className="picker-frame">
        <div className="picker-highlight" aria-hidden="true" />
        <div className="picker-wheel" ref={ref} onScroll={handleScroll}>
          <div style={{ height: `${PICKER_ITEM_HEIGHT * 2}px` }} aria-hidden="true" />
          {options.map((option) => (
            <button type="button" key={`${label}-${option.value}`} className={option.value === value ? 'picker-item active' : 'picker-item'} onClick={() => commitValue(option.value)}>
              {option.label}
            </button>
          ))}
          <div style={{ height: `${PICKER_ITEM_HEIGHT * 2}px` }} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function SummaryPicker({ label, summary, options, value, isOpen, onToggle, onChange, children, fullWidth = false }) {
  const panelId = useId();
  const selectedOption = summary ?? options?.find((option) => option.value === value)?.label ?? value;

  return (
    <div className={[isOpen ? 'picker open' : 'picker', fullWidth ? 'picker-full' : ''].filter(Boolean).join(' ')}>
      <span className="picker-label">{label}</span>
      <button type="button" className={isOpen ? 'picker-summary active' : 'picker-summary'} aria-expanded={isOpen} aria-controls={panelId} onClick={onToggle}>
        {selectedOption}
      </button>
      <div className={isOpen ? 'picker-panel open' : 'picker-panel'} id={panelId}>
        {isOpen
          ? children ?? <WheelScroller label={label} options={options} value={value} onChange={onChange} autoClose onDone={onToggle} />
          : null}
      </div>
    </div>
  );
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openGroup, setOpenGroup] = useState(null);
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [suppressPanelTransitions, setSuppressPanelTransitions] = useState(false);

  const capo = clampCapo(settings.capo);
  const bpm = Math.max(40, Math.min(220, Number.parseInt(settings.bpm, 10) || 72));
  const progression = useMemo(() => settings.chords.map((chord) => parseChordName(`${chord.root}${chord.quality}`, capo)), [settings.chords, capo]);
  const progressionLabel = settings.chords.map((chord) => `${chord.root}${chord.quality || ''}`).join(' - ');
  const currentChord = progression[activeIndex] ?? progression[0];
  const subdivisionConfig = useMemo(() => getSubdivisionConfig(settings.subdivision), [settings.subdivision]);
  const patternLabels = subdivisionConfig.labels;

  const {
    supported,
    permissionState,
    hearing,
    signalQuality,
    latchedChordSimilarity,
    chordThreshold,
    chordHistory,
    chromaStrengths,
    rhythmHistory,
    rhythmThreshold,
    activeBeat,
    rhythmMetrics,
    requestPermission,
    startListening,
    stopListening,
  } = useAudioMatcher({
    expectedPitchClasses: currentChord?.pitchClasses ?? [],
    currentChordName: currentChord?.raw ?? '',
    capo,
    bpm,
    pattern: settings.pattern,
  });

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        capo,
        bpm,
        mode: settings.mode,
        subdivision: settings.subdivision,
        pattern: settings.pattern,
        chords: settings.chords,
      }),
    );
  }, [capo, bpm, settings.mode, settings.subdivision, settings.pattern, settings.chords]);

  useEffect(() => {
    if (!suppressPanelTransitions) return undefined;
    const frame = window.requestAnimationFrame(() => setSuppressPanelTransitions(false));
    return () => window.cancelAnimationFrame(frame);
  }, [suppressPanelTransitions]);

  useEffect(() => {
    if (settings.mode !== 'auto' || !hearing || progression.length < 2) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % progression.length);
    }, Math.round((60000 / bpm) * 4));
    return () => window.clearInterval(timer);
  }, [settings.mode, bpm, progression.length, hearing]);

  function stopPracticeForSetupEdit() {
    if (hearing) {
      stopListening();
    }
  }

  function updateSetting(key, value) {
    stopPracticeForSetupEdit();
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateChord(slotIndex, key, value) {
    stopPracticeForSetupEdit();
    setSettings((current) => ({
      ...current,
      chords: current.chords.map((chord, index) => (index === slotIndex ? { ...chord, [key]: value } : chord)),
    }));
  }

  function updateSubdivision(subdivision) {
    stopPracticeForSetupEdit();
    setSettings((current) => ({
      ...current,
      subdivision,
      pattern: createDefaultPattern(subdivision),
    }));
  }

  function togglePatternStep(index) {
    stopPracticeForSetupEdit();
    setSettings((current) => ({
      ...current,
      pattern: current.pattern.map((value, patternIndex) => (patternIndex === index ? cyclePatternStep(value) : value)),
    }));
  }

  function toggleGroup(group) {
    setOpenGroup((current) => (current === group ? null : group));
  }

  function handleChordToggle(index) {
    setActiveIndex(index);
    const group = chordGroupForIndex(index);
    setOpenGroup((current) => (current === group ? null : group));
  }

  function expandSetupPanel() {
    setOpenGroup(null);
    setSuppressPanelTransitions(true);
    setSetupCollapsed(false);
  }

  async function handlePracticeClick() {
    if (hearing) {
      stopListening();
      return;
    }
    if (!supported) {
      window.alert('This browser does not support microphone access for the app.');
      return;
    }
    if (permissionState === 'denied') {
      window.alert('Microphone access is blocked for this site. Open your browser site settings and allow microphone access, then try again.');
      return;
    }
    if (permissionState !== 'granted') {
      const granted = await requestPermission();
      if (!granted) return;
    }
    setOpenGroup(null);
    setSetupCollapsed(true);
    await startListening();
  }

  function toggleMode() {
    updateSetting('mode', settings.mode === 'auto' ? 'manual' : 'auto');
  }

  function goToNextChord() {
    setActiveIndex((current) => (current + 1) % progression.length);
  }

  const showCollapsedSetup = setupCollapsed;
  const micPillLabel = hearing ? 'LISTENING' : permissionState === 'granted' ? 'READY' : 'MIC OFF';
  const autoMode = settings.mode === 'auto';
  const displayedChordSimilarity = latchedChordSimilarity;
  const chordTone = displayedChordSimilarity >= chordThreshold ? 'good' : displayedChordSimilarity >= 0.65 ? 'close' : 'off';
  const chordStatus = displayedChordSimilarity >= chordThreshold ? 'CORRECT' : displayedChordSimilarity >= 0.65 ? 'CLOSE' : 'OFF';
  const rhythmTone = (rhythmMetrics.last ?? 0) >= rhythmThreshold ? 'good' : (rhythmMetrics.last ?? 0) >= 0.45 ? 'close' : 'off';
  const rhythmStatus = rhythmMetrics.last === null ? 'WAITING' : formatPercent(rhythmMetrics.last);
  const activeStrums = settings.pattern.filter((step) => step !== 0).length;

  return (
    <main className="shell">
      <header className="brand-bar">
        <p className="brand-name">Corda</p>
        <img src={`${ASSET_BASE}corda.png`} alt="Corda logo" className="brand-logo" />
      </header>

      <section
        className={['panel', 'setup-panel', showCollapsedSetup ? 'collapsed clickable' : '', suppressPanelTransitions ? 'no-panel-transition' : ''].filter(Boolean).join(' ')}
        onClick={showCollapsedSetup ? expandSetupPanel : undefined}
        role={showCollapsedSetup ? 'button' : undefined}
        tabIndex={showCollapsedSetup ? 0 : undefined}
        onKeyDown={showCollapsedSetup ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            expandSetupPanel();
          }
        } : undefined}
      >
        {showCollapsedSetup ? (
          <p className="setup-summary-line">
            <span>Chord progression</span>
            <span>{progressionLabel}</span>
            <span>Capo : {capo}</span>
            <span>BPM : {bpm}</span>
            <span>Strum : {subdivisionConfig.label}</span>
          </p>
        ) : (
          <>
            <div className="wheel-row">
              <SummaryPicker label="capo" options={CAPO_OPTIONS} value={capo} isOpen={openGroup === TEMPO_GROUP} onToggle={() => toggleGroup(TEMPO_GROUP)}>
                <WheelScroller label="capo" options={CAPO_OPTIONS} value={capo} onChange={(value) => updateSetting('capo', value)} />
              </SummaryPicker>
              <SummaryPicker label="bpm" options={BPM_OPTIONS} value={bpm} isOpen={openGroup === TEMPO_GROUP} onToggle={() => toggleGroup(TEMPO_GROUP)}>
                <WheelScroller label="bpm" options={BPM_OPTIONS} value={bpm} onChange={(value) => updateSetting('bpm', value)} />
              </SummaryPicker>
            </div>

            <div className="wheel-row chord-row">
              {settings.chords.map((chord, index) => {
                const chordName = `${chord.root}${chord.quality || ''}`;
                const isOpen = openGroup === chordGroupForIndex(index);
                return (
                  <SummaryPicker key={`chord-${index}`} label={`0${index + 1}`} summary={chordName} isOpen={isOpen} onToggle={() => handleChordToggle(index)}>
                    <div className="chord-wheel-stack">
                      <WheelScroller label="root" options={ROOT_OPTIONS} value={chord.root} onChange={(value) => updateChord(index, 'root', value)} />
                      <WheelScroller label="shape" options={QUALITY_OPTIONS} value={chord.quality} onChange={(value) => updateChord(index, 'quality', value)} />
                    </div>
                  </SummaryPicker>
                );
              })}
            </div>

            <div className="strum-section">
              <SummaryPicker
                label="strum"
                options={SUBDIVISION_OPTIONS}
                value={settings.subdivision}
                summary={`${subdivisionConfig.label} | ${activeStrums} strokes`}
                isOpen={openGroup === STRUM_GROUP}
                onToggle={() => toggleGroup(STRUM_GROUP)}
                fullWidth
              >
                <WheelScroller label="subdivision" options={SUBDIVISION_OPTIONS} value={settings.subdivision} onChange={updateSubdivision} />
              </SummaryPicker>

              <div className="strum-editor" style={{ gridTemplateColumns: `repeat(${patternLabels.length}, minmax(0, 1fr))` }}>
                {patternLabels.map((label, index) => (
                  <button key={`strum-${label}-${index}`} type="button" className={settings.pattern[index] === 0 ? 'strum-step' : 'strum-step active'} onClick={() => togglePatternStep(index)}>
                    <span className="strum-slot-label">{label}</span>
                    <span className="strum-slot-symbol">{patternSymbol(settings.pattern[index])}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="practice-slot">
              <span className="picker-label">&nbsp;</span>
              <button type="button" className="practice-button" onClick={handlePracticeClick} disabled={!supported}>Practice</button>
            </div>
          </>
        )}
      </section>

      <section className={chordTone === 'good' ? 'practice-card match' : 'practice-card miss'}>
        <div className="practice-top">
          <p className="current-name">{currentChord.raw}</p>
          <div className="practice-actions">
            <button type="button" className={hearing ? 'mic-pill live' : 'mic-pill idle'} onClick={handlePracticeClick} disabled={!supported && !hearing}>
              {hearing ? <MicIcon /> : <MicOffIcon />}
              <span>{micPillLabel}</span>
            </button>
            <div className="transport-row">
              <button type="button" className={autoMode ? 'mic-pill live transport-pill auto-pill' : 'mic-pill idle transport-pill auto-pill compact'} onClick={toggleMode}>
                <LoopIcon />
                {autoMode ? <span>Auto</span> : null}
              </button>
              {!autoMode ? (
                <button type="button" className="mic-pill idle transport-pill next-pill" onClick={goToNextChord}>
                  <NextIcon />
                  <span>Next</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <HistoryChart
          history={chordHistory}
          threshold={chordThreshold}
          title=""
          detail={`Similarity ${formatPercent(displayedChordSimilarity)}`}
          statusText={chordStatus}
          statusTone={chordTone}
          compact
        />

        <ChromaStrip expectedPitchClasses={currentChord.pitchClasses} chromaStrengths={chromaStrengths} />

        <div className="rhythm-panel">
          <div className="beat-row" style={{ gridTemplateColumns: `repeat(${patternLabels.length}, minmax(0, 1fr))` }}>
            {patternLabels.map((label, index) => (
              <div key={`beat-${label}-${index}`} className="beat-cell">
                <span className="beat-label">{label}</span>
                <div className={activeBeat === index ? 'beat-pip active' : 'beat-pip'} />
                <span className={settings.pattern[index] === 0 ? 'beat-direction muted' : 'beat-direction'}>{patternSymbol(settings.pattern[index])}</span>
              </div>
            ))}
          </div>

          <HistoryChart
            history={rhythmHistory}
            threshold={rhythmThreshold}
            title=""
            detail=""
            statusText=""
            statusTone={rhythmTone}
            compact
          />

          <div className="metric-grid">
            <div className="metric-card">
              <span className="metric-label">Last beat</span>
              <span className="metric-value">{formatPercent(rhythmMetrics.last)}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Session avg</span>
              <span className="metric-value">{formatPercent(rhythmMetrics.average)}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Strums</span>
              <span className="metric-value">{rhythmMetrics.strums}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}





