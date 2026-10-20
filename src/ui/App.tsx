import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PITCH_CLASS_NAMES } from '../config';
import { useSeaChords } from '../hooks/useSeaChords';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type ZoneHandle = 'high' | 'low';

const MODES = [
  { value: 'major', label: 'Major' },
  { value: 'natural_minor', label: 'Natural minor' },
  { value: 'dorian', label: 'Dorian' },
  { value: 'mixolydian', label: 'Mixolydian' },
] as const;

const PRESETS = [
  { value: 'pad', label: 'Soft pad' },
  { value: 'pluck', label: 'Pluck' },
  { value: 'organ', label: 'Organ' },
  { value: 'electric-piano', label: 'Electric piano' },
] as const;

export function App() {
  const sea = useSeaChords();
  const [debugOpen, setDebugOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [midiMessage, setMidiMessage] = useState('');
  const frameRef = useRef<HTMLDivElement | null>(null);
  const zoneDrag = useRef<ZoneHandle | null>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'd') setDebugOpen((value) => !value);
      else if (key === 'h') setHelpOpen((value) => !value);
      else if (key === 'escape') sea.panic();
      else if (/^[1-7]$/.test(key)) sea.setKeyboardDegree(Number(key));
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstall);
    };
  }, [sea.panic, sea.setKeyboardDegree]);

  const updateZone = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const kind = zoneDrag.current;
    const frame = frameRef.current;
    if (!kind || !frame) return;
    const bounds = frame.getBoundingClientRect();
    const y = Math.max(0.15, Math.min(0.85, (event.clientY - bounds.top) / bounds.height));
    const minGap = 0.1;
    let high = sea.settings.zoneHigh;
    let low = sea.settings.zoneLow;
    if (kind === 'high') high = Math.min(y, low - minGap);
    else low = Math.max(y, high + minGap);
    sea.calibrate(high, low);
  };

  const beginZoneDrag = (kind: ZoneHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    zoneDrag.current = kind;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const endZoneDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    zoneDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const promptInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const midiToggle = async () => {
    const enabled = sea.midiDevice === null;
    const device = await sea.setMidiEnabled(enabled);
    setMidiMessage(enabled ? (device ? `Connected: ${device}` : 'No MIDI output selected.') : 'MIDI disconnected.');
  };

  const tonicName = PITCH_CLASS_NAMES[sea.settings.tonic] ?? 'C';
  const octaveLabel = sea.octave > 0 ? '+1 octave' : sea.octave < 0 ? '−1 octave' : 'base octave';

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="./" aria-label="SeaChords home">
          <img src="./icons/seachords.svg" alt="" className="brand-mark" />
          <span className="brand-copy">
            <strong>SeaChords</strong>
            <small>AIR-CHORD INSTRUMENT</small>
          </span>
        </a>
        <div className="topbar-right">
          <span className={`network-pill ${online ? '' : 'is-offline'}`}>
            <i aria-hidden="true" />{online ? 'LOCAL READY' : 'OFFLINE'}
          </span>
          {installPrompt && <button className="quiet-button install-button" onClick={() => void promptInstall()}>Install app</button>}
          <button className="icon-button" title="Help (H)" aria-label="Open help" onClick={() => setHelpOpen(true)}>?</button>
        </div>
      </header>

      <main className="workspace">
        <section className="stage-column" aria-label="Camera and hand tracking">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LIVE INPUT</p>
              <h1>Play the space between your hands.</h1>
            </div>
            <div className={`status-chip status-${sea.status}`} aria-live="polite">
              <span className="status-dot" />
              {sea.status === 'running' ? 'TRACKING' : sea.status === 'loading' ? 'STARTING' : sea.status === 'error' ? 'NEEDS ATTENTION' : 'READY'}
            </div>
          </div>

          <div className="camera-card">
            <div className="camera-toolbar">
              <div className="toolbar-left">
                <span className="camera-indicator" />
                <span>{sea.status === 'running' ? 'CAMERA ACTIVE' : 'CAMERA OFF'}</span>
                <span className="toolbar-divider">/</span>
                <span>640 × 480 · 30 FPS TARGET</span>
              </div>
              <button className="tiny-button" onClick={() => setDebugOpen((value) => !value)} aria-pressed={debugOpen}>
                DEBUG <kbd>D</kbd>
              </button>
            </div>

            <div className="camera-frame" ref={frameRef}>
              <video ref={sea.videoRef} className="camera-video" autoPlay muted playsInline aria-label="Mirrored camera preview" />
              <canvas ref={sea.canvasRef} className="landmark-canvas" aria-hidden="true" />
              {calibrationOpen && sea.status === 'running' && (
                <>
                  <button
                    type="button"
                    role="slider"
                    aria-label="Top octave zone boundary; drag to calibrate"
                    aria-valuemin={15}
                    aria-valuemax={75}
                    aria-valuenow={Math.round(sea.settings.zoneHigh * 100)}
                    className="zone-handle zone-handle-high"
                    style={{ top: `${sea.settings.zoneHigh * 100}%` }}
                    onPointerDown={(event) => beginZoneDrag('high', event)}
                    onPointerMove={updateZone}
                    onPointerUp={endZoneDrag}
                    onPointerCancel={endZoneDrag}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowUp') sea.calibrate(sea.settings.zoneHigh - 0.01, sea.settings.zoneLow);
                      if (event.key === 'ArrowDown') sea.calibrate(sea.settings.zoneHigh + 0.01, sea.settings.zoneLow);
                    }}
                  ><span>TOP · +1</span></button>
                  <button
                    type="button"
                    role="slider"
                    aria-label="Bottom octave zone boundary; drag to calibrate"
                    aria-valuemin={25}
                    aria-valuemax={85}
                    aria-valuenow={Math.round(sea.settings.zoneLow * 100)}
                    className="zone-handle zone-handle-low"
                    style={{ top: `${sea.settings.zoneLow * 100}%` }}
                    onPointerDown={(event) => beginZoneDrag('low', event)}
                    onPointerMove={updateZone}
                    onPointerUp={endZoneDrag}
                    onPointerCancel={endZoneDrag}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowUp') sea.calibrate(sea.settings.zoneHigh, sea.settings.zoneLow - 0.01);
                      if (event.key === 'ArrowDown') sea.calibrate(sea.settings.zoneHigh, sea.settings.zoneLow + 0.01);
                    }}
                  ><span>BOTTOM · −1</span></button>
                </>
              )}

              {sea.status !== 'running' && (
                <div className="camera-empty">
                  <div className="empty-orbit"><span /><span /><span /></div>
                  <p className="empty-title">{sea.status === 'error' ? 'CAMERA NEEDS A CHECK' : 'NO VIDEO LEAVES THIS DEVICE'}</p>
                  <p className="empty-copy">{sea.status === 'error' ? sea.message : sea.status === 'loading' ? sea.message : 'Start the camera to see your hands and play.'}</p>
                  {sea.status === 'loading' && (
                    <div className="progress-track" aria-label="Loading hand model">
                      <span style={{ width: `${Math.max(4, sea.progress * 100)}%` }} />
                    </div>
                  )}
                  {sea.status !== 'loading' && !sea.keyboardMode && (
                    <button className="primary-button camera-start" onClick={() => void sea.start()}>
                      <span className="play-glyph">▶</span>{sea.status === 'error' ? 'Try camera again' : 'Start camera'}
                    </button>
                  )}
                </div>
              )}
              {sea.status === 'running' && (
                <div className="camera-badges">
                  <span className="frame-badge"><span className="status-dot" /> {sea.delegate ?? 'CPU'} · {sea.workerInference ? 'WORKER' : 'MAIN THREAD'}</span>
                  <span className="frame-badge">{sea.muted ? 'MUTED' : 'SOUND ON'}</span>
                </div>
              )}
            </div>

            {sea.swapSuggested && (
              <div className="mapping-warning" role="status">
                <span className="warning-icon">↔</span>
                <div><strong>Check your hand roles</strong><small>Position and handedness labels disagree. Raise your LEFT hand to confirm.</small></div>
                <button className="quiet-button" onClick={sea.swapHands}>Swap hands</button>
              </div>
            )}

            <div className="camera-footer">
              <div className="hand-readout hand-left">
                <span className="hand-symbol">L</span>
                <div><small>LEFT HAND · DEGREE</small><strong>{sea.leftHand ? `Degree ${sea.leftHand.value}` : 'Waiting for left hand'}</strong></div>
              </div>
              <div className="hand-readout hand-right">
                <span className="hand-symbol">R</span>
                <div><small>RIGHT HAND · RICHNESS</small><strong>{sea.rightHand ? (sea.rightHand.value === 0 ? 'Closed fist · mute' : `Level ${sea.rightHand.value}`) : 'Waiting for right hand'}</strong></div>
              </div>
              <button className="tiny-button calibration-button" onClick={() => setCalibrationOpen((value) => !value)} aria-pressed={calibrationOpen}>
                {calibrationOpen ? 'DONE' : 'CALIBRATE'}
              </button>
            </div>
          </div>

          <div className="guide-strip">
            <div className="guide-index">01</div>
            <p><strong>Raise your LEFT hand</strong><span>Fingers choose a scale degree; wrist height moves the octave.</span></p>
            <div className="guide-divider" />
            <div className="guide-index">02</div>
            <p><strong>Shape with your RIGHT</strong><span>Fingers add chord color. A fist mutes; reopening re-strikes.</span></p>
          </div>
        </section>

        <aside className="instrument-column" aria-label="Instrument controls">
          <div className="chord-panel">
            <div className="panel-topline"><span className="eyebrow">NOW PLAYING</span><span className={`sound-state ${sea.muted ? '' : 'sound-on'}`}><i />{sea.muted ? 'MUTED' : 'SOUNDING'}</span></div>
            <div className="chord-display" aria-live="polite">
              <span className="chord-rune" aria-hidden="true">◌</span>
              <span className="chord-name">{sea.currentChord ?? '— —'}</span>
              <span className="roman-label">{sea.roman === '—' ? 'WAITING FOR A CHORD' : `${sea.roman} · ${tonicName} ${sea.settings.mode.replace('_', ' ')}`}</span>
            </div>
            <div className="chord-meta">
              <span><small>DEGREE</small><strong>{sea.scaleDegree} / 7</strong></span>
              <span><small>REGISTER</small><strong>{octaveLabel}</strong></span>
              <span><small>COLOR</small><strong>{sea.richness === 0 ? 'Mute' : `Level ${sea.richness}`}</strong></span>
            </div>
          </div>

          <div className="control-card">
            <div className="card-heading"><div><p className="eyebrow">HARMONY</p><h2>Choose a home.</h2></div><span className="card-mark">A</span></div>
            <div className="form-row">
              <label htmlFor="key-select">Key</label>
              <select id="key-select" value={sea.settings.tonic} onChange={(event) => sea.setKey(Number(event.currentTarget.value))}>
                {PITCH_CLASS_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="mode-select">Scale mode</label>
              <select id="mode-select" value={sea.settings.mode} onChange={(event) => sea.setMode(event.currentTarget.value as typeof sea.settings.mode)}>
                {MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
              </select>
            </div>
            <p className="control-note">Every chord stays inside the selected scale.</p>
          </div>

          <div className="control-card sound-card">
            <div className="card-heading"><div><p className="eyebrow">SOUND DESIGN</p><h2>Set the tone.</h2></div><span className="card-mark">B</span></div>
            <div className="form-row">
              <label htmlFor="preset-select">Voice</label>
              <select id="preset-select" value={sea.settings.synthPreset} onChange={(event) => sea.setSynthPreset(event.currentTarget.value as typeof sea.settings.synthPreset)}>
                {PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
              </select>
            </div>
            <label className="range-row" htmlFor="volume-range"><span>Volume</span><output>{Math.round(sea.settings.volume * 100)}%</output></label>
            <input id="volume-range" className="range-input" type="range" min="0" max="1" step="0.01" value={sea.settings.volume} onChange={(event) => sea.setVolume(Number(event.currentTarget.value))} />
            <label className="range-row" htmlFor="reverb-range"><span>Room</span><output>{Math.round(sea.settings.reverb * 100)}%</output></label>
            <input id="reverb-range" className="range-input" type="range" min="0" max="1" step="0.01" value={sea.settings.reverb} onChange={(event) => sea.setReverb(Number(event.currentTarget.value))} />
          </div>

          <div className="control-card actions-card">
            <div className="card-heading"><div><p className="eyebrow">PERFORMANCE</p><h2>Play & capture.</h2></div><span className="card-mark">C</span></div>
            <div className="button-row">
              {sea.status === 'running' ? (
                <button className="quiet-button wide-button" onClick={sea.stop}>Stop camera</button>
              ) : (
                <button className="quiet-button wide-button" onClick={() => sea.setKeyboardMode(!sea.keyboardMode)} aria-pressed={sea.keyboardMode}>
                  {sea.keyboardMode ? 'Keyboard mode on' : 'Use keyboard / mouse'}
                </button>
              )}
              <button className="panic-button" onClick={sea.panic} title="Panic: release all sound" aria-label="Panic, release all sound">PANIC <kbd>Esc</kbd></button>
            </div>
            {sea.keyboardMode && (
              <div className="fallback-panel">
                <div className="fallback-label"><span>DEGREE</span><span>KEYS 1–7</span></div>
                <div className="degree-keys">
                  {Array.from({ length: 7 }, (_, index) => index + 1).map((degree) => (
                    <button key={degree} className={sea.scaleDegree === degree ? 'degree-key is-selected' : 'degree-key'} onClick={() => sea.setKeyboardDegree(degree)} aria-pressed={sea.scaleDegree === degree}>{degree}</button>
                  ))}
                </div>
                <label className="fallback-label" htmlFor="richness-range"><span>CHORD RICHNESS</span><span>{sea.richness === 0 ? 'MUTE' : `LEVEL ${sea.richness}`}</span></label>
                <input id="richness-range" className="range-input" type="range" min="0" max="5" step="1" value={sea.richness} onChange={(event) => sea.setKeyboardRichness(Number(event.currentTarget.value))} />
              </div>
            )}
            {sea.midiSupported && (
              <button className="midi-toggle" onClick={() => void midiToggle()} aria-pressed={sea.midiDevice !== null}>
                <span>Optional Web MIDI output</span><strong>{sea.midiDevice ? 'CONNECTED' : 'CONNECT'}</strong>
              </button>
            )}
            {midiMessage && <p className="control-note" role="status">{midiMessage}</p>}
            <div className="record-row">
              <button className={sea.recording ? 'record-button is-recording' : 'record-button'} onClick={() => sea.recording ? sea.stopRecording() : sea.startRecording()}>
                <i />{sea.recording ? 'Stop recording' : 'Record chords'}
              </button>
              <button className="export-button" onClick={sea.exportRecording} title="Export Standard MIDI file">Export MIDI ↓</button>
            </div>
            <div className="history-heading"><span>RECENT CHORDS</span><span>LAST 8</span></div>
            <div className="history-list">
              {sea.events.length === 0 ? <p className="history-empty">Your chord path will appear here.</p> : sea.events.slice().reverse().map((event, index) => (
                <div className="history-item" key={`${event.atMs}-${index}`}><span>{event.chordName}</span><small>{event.roman}</small></div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {debugOpen && (
        <section className="debug-panel" aria-label="Performance diagnostics">
          <div className="debug-heading"><span className="eyebrow">PERFORMANCE MONITOR</span><button className="icon-button" onClick={() => setDebugOpen(false)} aria-label="Close diagnostics">×</button></div>
          <div className="debug-metrics">
            <span><small>CAMERA FPS</small><strong>{sea.fps.toFixed(1)}</strong></span>
            <span><small>INFERENCE</small><strong>{sea.inferenceMs.toFixed(1)} <i>ms</i></strong></span>
            <span><small>GESTURE → NOTE</small><strong>{sea.latencyMs.toFixed(0)} <i>ms</i></strong></span>
            <span><small>DROPPED FRAMES</small><strong>{sea.droppedFrames}</strong></span>
          </div>
        </section>
      )}

      {helpOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setHelpOpen(false); }}>
          <section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
            <div className="help-top"><p className="eyebrow">QUICK REFERENCE · H</p><button className="icon-button" onClick={() => setHelpOpen(false)} aria-label="Close help">×</button></div>
            <h2 id="help-title">Your hands are the instrument.</h2>
            <div className="help-grid">
              <div><span className="help-hand left">LEFT</span><p>Index through open palm select degrees 1–5. Fist is 6; thumb-only is 7. Raise for +1 octave, lower for −1.</p></div>
              <div><span className="help-hand right">RIGHT</span><p>Index through open palm select triad, 7th, 9th, sus, and wide voicing. Fist mutes; opening again re-strikes.</p></div>
            </div>
            <div className="help-shortcuts"><kbd>1–7</kbd> keyboard fallback <kbd>D</kbd> performance panel <kbd>Esc</kbd> panic mute</div>
            <p className="privacy-note">Camera frames and hand landmarks stay in this browser. No video is uploaded.</p>
          </section>
        </div>
      )}

      <footer className="page-footer"><span>SEACHORDS · AIR-CHORD INSTRUMENT</span><span>CAMERA + MODEL RUN LOCALLY</span></footer>
    </div>
  );
}
