import { useEffect, useRef, useState } from 'react';
import { useSeaChords } from '../hooks/useSeaChords';
import { PITCH_CLASS_NAMES } from '../config';
import type { Mode } from '../engine/music/scales';
import type { SynthPreset } from '../engine/audio/synth';
import { Keyboard } from './Keyboard';
import { GesturesModal } from './Modals';

const MODES: { value: Mode; label: string }[] = [
  { value: 'major', label: 'Major' },
  { value: 'natural_minor', label: 'Minor' },
  { value: 'dorian', label: 'Dorian' },
  { value: 'mixolydian', label: 'Mixolydian' },
];
const PRESETS: { value: SynthPreset; label: string }[] = [
  { value: 'pad', label: 'Pad' },
  { value: 'pluck', label: 'Pluck' },
  { value: 'organ', label: 'Organ' },
  { value: 'electric-piano', label: 'Keys' },
];
const EMPTY: readonly number[] = [];

function statusText(status: string, message: string) {
  if (status === 'idle') return 'Camera off';
  if (status === 'loading') return 'Loading model';
  if (status === 'running') return 'Tracking';
  return /no camera|not found/i.test(message) ? 'No camera found' : 'Camera blocked';
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const sea = useSeaChords();
  const [debug, setDebug] = useState(false);
  const [help, setHelp] = useState(false);
  const [lightOff, setLightOff] = useState(
    () => localStorage.getItem('sc-light') !== '0',
  );
  useEffect(() => {
    document.documentElement.classList.toggle('light', lightOff);
    localStorage.setItem('sc-light', lightOff ? '1' : '0');
  }, [lightOff]);
  const [hasRecording, setHasRecording] = useState(false);
  const live = useRef(sea);
  live.current = sea;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(t.tagName) && e.key === ' ')
        return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      const s = live.current;
      const k = e.key.toLowerCase();
      if (k === 'd') setDebug((v) => !v);
      else if (k === 'h') setHelp((v) => !v);
      else if (e.key === 'Escape') setHelp(false);
      else if (/^[1-7]$/.test(e.key)) s.setKeyboardDegree(Number(e.key));
      else if (e.key === ' ') {
        e.preventDefault();
        if (s.status === 'running') s.stop();
        else if (s.status !== 'loading') void s.start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const last = sea.events[sea.events.length - 1];
  const activeNotes = !sea.muted && last ? last.notes : EMPTY;
  const history = [...sea.events].reverse();
  const s = sea.settings;

  const toggleRecord = () => {
    if (sea.recording) {
      sea.stopRecording(false);
      setHasRecording(true);
    } else sea.startRecording();
  };
  const calibrate = () => {
    const y = sea.leftHand?.wristY;
    if (y === undefined) sea.calibrate(0.33, 0.66);
    else sea.calibrate(Math.max(0.15, y - 0.17), Math.min(0.85, y + 0.17));
  };

  return (
    <>
      <div className="bg" aria-hidden="true">
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
      </div>
      <div className="page">
        <header className="header">
          <h1 className="t-l">SeaChords</h1>
          <div className="header-right">
            <span role="status">{statusText(sea.status, sea.message)}</span>
            <button
              className="btn"
              aria-pressed={lightOff}
              onClick={() => setLightOff((v) => !v)}
            >
              Light off
            </button>
          </div>
        </header>

        <main className="main">
          <section className="col-side" aria-label="Chord">
            <div className="panel">
              <h2>Chord</h2>
              <div aria-live="polite">
                <div className="t-l num">{sea.currentChord ?? '—'}</div>
                <div className="num">{sea.roman}</div>
              </div>
              <div className="grid2 num">
                <span>Degree</span>
                <span>{sea.scaleDegree}</span>
                <span>Richness</span>
                <span>{sea.richness}</span>
                <span>Octave</span>
                <span>{sea.octave > 0 ? '+1' : sea.octave}</span>
                <span>Muted</span>
                <span>{sea.muted ? 'Yes' : 'No'}</span>
              </div>
              <h2>History</h2>
              <ol className="list num">
                {history.map((e) => (
                  <li key={e.atMs}>
                    {e.chordName} {e.roman}
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="col-cam" aria-label="Camera">
            <div className="frame">
              <video ref={sea.videoRef} autoPlay muted playsInline aria-label="Camera" />
              <canvas ref={sea.canvasRef} aria-hidden="true" />
              {sea.status === 'idle' && (
                <div className="center">
                  <button className="btn btn-start t-l" onClick={() => void sea.start()}>
                    Start
                  </button>
                </div>
              )}
              {sea.status === 'loading' && (
                <>
                  <span className="loadlabel">Loading model</span>
                  <span
                    className="loadline"
                    style={{ width: `${Math.round(sea.progress * 100)}%` }}
                  />
                </>
              )}
              {sea.status === 'error' && (
                <div className="center">
                  <p>{sea.message}</p>
                  <button className="btn" onClick={() => void sea.start()}>
                    Try again
                  </button>
                </div>
              )}
              {debug && (
                <div className="debug num" aria-label="Debug">
                  <span>FPS</span>
                  <span>{sea.fps.toFixed(0)}</span>
                  <span>Inference ms</span>
                  <span>{sea.inferenceMs.toFixed(1)}</span>
                  <span>Latency ms</span>
                  <span>{sea.latencyMs.toFixed(0)}</span>
                  <span>Dropped</span>
                  <span>{sea.droppedFrames}</span>
                </div>
              )}
            </div>
          </section>

          <section className="col-side" aria-label="Settings">
            <div className="panel">
              <h2>Settings</h2>
              <div className="rows">
                <label>
                  <span>Key</span>
                  <select
                    className="select"
                    aria-label="Key"
                    value={s.tonic}
                    onChange={(e) => sea.setKey(Number(e.target.value))}
                  >
                    {PITCH_CLASS_NAMES.map((n, i) => (
                      <option key={n} value={i}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row-stack">
                  <span>Mode</span>
                  <Segmented
                    label="Mode"
                    value={s.mode}
                    options={MODES}
                    onChange={sea.setMode}
                  />
                </div>
                <div className="row-stack">
                  <span>Sound</span>
                  <Segmented
                    label="Sound"
                    value={s.synthPreset}
                    options={PRESETS}
                    onChange={sea.setSynthPreset}
                  />
                </div>
                <label>
                  <span>Volume</span>
                  <input
                    className="range"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    aria-label="Volume"
                    value={s.volume}
                    onChange={(e) => sea.setVolume(Number(e.target.value))}
                  />
                </label>
                <label>
                  <span>Reverb</span>
                  <input
                    className="range"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    aria-label="Reverb"
                    value={s.reverb}
                    onChange={(e) => sea.setReverb(Number(e.target.value))}
                  />
                </label>
                {sea.midiSupported && (
                  <label>
                    <span>MIDI out</span>
                    <select
                      className="select"
                      aria-label="MIDI out"
                      value={sea.midiDevice ?? ''}
                      onChange={(e) => void sea.setMidiEnabled(e.target.value !== '')}
                    >
                      <option value="">Off</option>
                      <option value={sea.midiDevice ?? 'on'}>
                        {sea.midiDevice ?? 'On'}
                      </option>
                    </select>
                  </label>
                )}
              </div>
              <div className="stack">
                <button
                  className={`btn${sea.recording ? ' is-rec' : ''}`}
                  onClick={toggleRecord}
                  aria-pressed={sea.recording}
                >
                  {sea.recording ? 'Stop' : 'Record'}
                </button>
                <button
                  className="btn"
                  disabled={!hasRecording || sea.recording}
                  onClick={sea.exportRecording}
                >
                  Export MIDI
                </button>
                <button className="btn" onClick={calibrate}>
                  Calibrate
                </button>
                <button
                  className="btn"
                  onClick={sea.swapHands}
                  aria-pressed={s.swapHands}
                >
                  Swap hands
                </button>
                <button className="btn" onClick={() => setHelp(true)}>
                  Gestures
                </button>
              </div>
            </div>
          </section>
        </main>

        <div className="keys">
          <Keyboard active={activeNotes} />
        </div>
      </div>

      {help && <GesturesModal onClose={() => setHelp(false)} />}
    </>
  );
}
