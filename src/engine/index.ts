import { APP_CONFIG, PITCH_CLASS_NAMES } from '../config';
import { SeaChordsSynth, type SynthPreset } from './audio/synth';
import { SeaChordsController, type ControllerAction } from './controller/controller';
import { SeaChordsDebouncer } from './controller/debounce';
import { romanNumeral } from './music/roman';
import type { Mode } from './music/scales';
import { downloadMidi, type RecordedChord } from './recording';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type SeaChordsSettings,
} from './settings';
import { SeaChordsCamera, type CameraFrameState } from './vision/camera';
import type { TrackerProgress } from './vision/runtime';

export type EngineStatus = 'idle' | 'loading' | 'running' | 'error';

export interface HandReadout {
  readonly role: 'left' | 'right';
  readonly fingers: number;
  readonly thumbExtended: boolean;
  readonly value: number;
  readonly wristY: number;
}

export interface ChordHistoryItem {
  readonly atMs: number;
  readonly chordName: string;
  readonly roman: string;
  readonly notes: readonly number[];
}

export interface SeaChordsSnapshot {
  readonly status: EngineStatus;
  readonly message: string;
  readonly progress: number;
  readonly fps: number;
  readonly inferenceMs: number;
  readonly latencyMs: number;
  readonly droppedFrames: number;
  readonly delegate: 'GPU' | 'CPU' | null;
  readonly workerInference: boolean;
  readonly leftHand: HandReadout | null;
  readonly rightHand: HandReadout | null;
  readonly currentChord: string | null;
  readonly roman: string;
  readonly scaleDegree: number;
  readonly richness: number;
  readonly octave: -1 | 0 | 1;
  readonly muted: boolean;
  readonly events: readonly ChordHistoryItem[];
  readonly settings: SeaChordsSettings;
  readonly recording: boolean;
  readonly midiSupported: boolean;
  readonly midiDevice: string | null;
  readonly swapSuggested: boolean;
  readonly keyboardMode: boolean;
}

function initialSnapshot(
  settings: SeaChordsSettings,
  midiSupported: boolean,
): SeaChordsSnapshot {
  return {
    status: 'idle',
    message: 'Allow camera to begin.',
    progress: 0,
    fps: 0,
    inferenceMs: 0,
    latencyMs: 0,
    droppedFrames: 0,
    delegate: null,
    workerInference: false,
    leftHand: null,
    rightHand: null,
    currentChord: null,
    roman: '—',
    scaleDegree: 1,
    richness: 0,
    octave: 0,
    muted: true,
    events: [],
    settings,
    recording: false,
    midiSupported,
    midiDevice: null,
    swapSuggested: false,
    keyboardMode: false,
  };
}

export class SeaChordsEngine {
  private readonly synth = new SeaChordsSynth();
  private readonly controller: SeaChordsController;
  private readonly debouncer: SeaChordsDebouncer;
  private readonly listeners = new Set<(snapshot: SeaChordsSnapshot) => void>();
  private readonly camera: SeaChordsCamera;
  private settings: SeaChordsSettings;
  private state: SeaChordsSnapshot;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private recordingEvents: RecordedChord[] = [];
  private lastRawSignature = '';
  private gestureChangedAt = performance.now();
  private lastHudUpdateAt = 0;

  constructor(settings: SeaChordsSettings = loadSettings()) {
    this.settings = settings;
    this.controller = new SeaChordsController(settings.tonic, settings.mode);
    this.debouncer = new SeaChordsDebouncer(settings.zoneHigh, settings.zoneLow);
    this.synth.setPreset(settings.synthPreset);
    this.synth.setVolume(settings.volume);
    this.synth.setReverb(settings.reverb);
    this.camera = new SeaChordsCamera({
      onStatus: (status, message) => this.onCameraStatus(status, message),
      onProgress: (progress) => this.onProgress(progress),
      onDelegate: (delegate, worker) => this.onDelegate(delegate, worker),
      onFrame: (frame) => this.onCameraFrame(frame),
    });
    this.camera.setSwapHands(settings.swapHands);
    this.camera.setZones(settings.zoneHigh, settings.zoneLow);
    this.state = initialSnapshot(settings, this.synth.midiSupported);
  }

  get snapshot(): SeaChordsSnapshot {
    return this.state;
  }

  subscribe(listener: (snapshot: SeaChordsSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  attachMedia(video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null): void {
    this.videoElement = video;
    this.canvasElement = canvas;
  }

  async start(): Promise<void> {
    if (!this.videoElement || !this.canvasElement) {
      this.setState(
        {
          status: 'error',
          message: 'The camera surface is not ready. Reload the page and try again.',
        },
        true,
      );
      return;
    }
    this.setState(
      { status: 'loading', progress: 0, message: 'Starting camera and local audio…' },
      true,
    );
    try {
      await this.synth.unlock();
      await this.camera.start(this.videoElement, this.canvasElement);
    } catch (error) {
      this.setState(
        {
          status: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'SeaChords could not start.',
        },
        true,
      );
    }
  }

  stop(): void {
    this.camera.stop();
    this.controller.panic();
    this.synth.panic();
    this.setState(
      {
        status: 'idle',
        message: 'Camera stopped. Your video remains on this device.',
        progress: 0,
        leftHand: null,
        rightHand: null,
        muted: true,
        swapSuggested: false,
      },
      true,
    );
  }

  panic(): void {
    this.controller.panic();
    this.synth.panic();
    this.setState({ muted: true, message: 'All notes released.' }, true);
  }

  setKey(tonic: number): void {
    const normalized = ((Math.round(tonic) % 12) + 12) % 12;
    this.settings = { ...this.settings, tonic: normalized };
    this.persistSettings();
    const actions = this.controller.setKey(normalized, this.settings.mode);
    this.applyActions(actions);
    this.refreshChordSnapshot();
  }

  setMode(mode: Mode): void {
    if (!['major', 'natural_minor', 'dorian', 'mixolydian'].includes(mode)) return;
    this.settings = { ...this.settings, mode };
    this.persistSettings();
    const actions = this.controller.setKey(this.settings.tonic, mode);
    this.applyActions(actions);
    this.refreshChordSnapshot();
  }

  setSynthPreset(synthPreset: SynthPreset): void {
    this.settings = { ...this.settings, synthPreset };
    this.synth.setPreset(synthPreset);
    this.persistSettings();
    this.setState({ settings: this.settings }, true);
  }

  setVolume(volume: number): void {
    const value = Math.max(0, Math.min(1, volume));
    this.settings = { ...this.settings, volume: value };
    this.synth.setVolume(value);
    this.persistSettings();
    this.setState({ settings: this.settings }, true);
  }

  setReverb(reverb: number): void {
    const value = Math.max(0, Math.min(1, reverb));
    this.settings = { ...this.settings, reverb: value };
    this.synth.setReverb(value);
    this.persistSettings();
    this.setState({ settings: this.settings }, true);
  }

  swapHands(): void {
    this.settings = { ...this.settings, swapHands: !this.settings.swapHands };
    this.camera.setSwapHands(this.settings.swapHands);
    this.persistSettings();
    this.setState({ settings: this.settings, swapSuggested: false }, true);
  }

  calibrate(zoneHigh: number, zoneLow: number): void {
    const high = Math.max(0.15, Math.min(zoneHigh, zoneLow - 0.1));
    const low = Math.min(0.85, Math.max(zoneLow, high + 0.1));
    this.settings = { ...this.settings, zoneHigh: high, zoneLow: low };
    this.debouncer.setZones(high, low);
    this.camera.setZones(high, low);
    this.persistSettings();
    this.setState({ settings: this.settings }, true);
  }

  setKeyboardMode(enabled: boolean): void {
    this.setState({ keyboardMode: enabled }, true);
  }

  setKeyboardDegree(degree: number): void {
    if (!Number.isInteger(degree) || degree < 1 || degree > 7) return;
    void this.synth.unlock();
    const state = {
      degree,
      octaveZone: this.state.octave,
      richness: this.state.richness,
      handsPresent: true,
    };
    this.applyActions(this.controller.step(state));
    this.setState(
      { keyboardMode: true, scaleDegree: degree, muted: state.richness === 0 },
      true,
    );
    this.refreshChordSnapshot();
  }

  setKeyboardRichness(richness: number): void {
    const value = Math.max(0, Math.min(5, Math.round(richness)));
    void this.synth.unlock();
    const state = {
      degree: this.state.scaleDegree,
      octaveZone: this.state.octave,
      richness: value,
      handsPresent: true,
    };
    this.applyActions(this.controller.step(state));
    this.setState({ keyboardMode: true, richness: value, muted: value === 0 }, true);
    this.refreshChordSnapshot();
  }

  async setMidiEnabled(enabled: boolean): Promise<string | null> {
    if (!enabled) {
      this.synth.disableMidi();
      this.settings = { ...this.settings, midiEnabled: false };
      this.persistSettings();
      this.setState({ settings: this.settings, midiDevice: null }, true);
      return null;
    }
    try {
      const name = await this.synth.enableMidi();
      this.settings = { ...this.settings, midiEnabled: name !== null };
      this.persistSettings();
      this.setState({ settings: this.settings, midiDevice: name }, true);
      return name;
    } catch (error) {
      this.setState(
        {
          message:
            error instanceof Error ? error.message : 'MIDI access was not granted.',
        },
        true,
      );
      return null;
    }
  }

  startRecording(): void {
    this.recordingEvents = [];
    this.setState({ recording: true, message: 'Recording chord events.' }, true);
  }

  stopRecording(download = false): void {
    this.setState(
      {
        recording: false,
        message: `${this.recordingEvents.length} chord events recorded.`,
      },
      true,
    );
    if (download) downloadMidi(this.recordingEvents);
  }

  exportRecording(): void {
    downloadMidi(this.recordingEvents);
  }

  dispose(): void {
    this.camera.stop();
    this.synth.dispose();
    this.listeners.clear();
  }

  private onCameraStatus(
    status: 'loading' | 'running' | 'error' | 'stopped',
    message?: string,
  ): void {
    if (status === 'stopped') return;
    this.setState({ status, ...(message ? { message } : {}) }, true);
  }

  private onProgress(progress: TrackerProgress): void {
    this.setState({ progress: progress.progress, message: progress.message }, true);
  }

  private onDelegate(delegate: 'GPU' | 'CPU', worker: boolean): void {
    const message =
      delegate === 'GPU'
        ? 'GPU hand tracking is ready.'
        : worker
          ? 'GPU is unavailable; using the worker CPU fallback.'
          : 'Worker setup was unavailable; using the CPU fallback.';
    this.setState({ delegate, workerInference: worker, message }, true);
  }

  private onCameraFrame(frame: CameraFrameState): void {
    const left = frame.leftHand;
    const right = frame.rightHand;
    const degree = left?.value ?? this.state.scaleDegree;
    const richness = right?.value ?? this.state.richness;
    const rawZone = left
      ? left.wristY < this.settings.zoneHigh
        ? 1
        : left.wristY > this.settings.zoneLow
          ? -1
          : 0
      : this.state.octave;
    const signature = `${degree}:${richness}:${rawZone}:${Boolean(left)}:${Boolean(right)}`;
    if (signature !== this.lastRawSignature) {
      this.lastRawSignature = signature;
      this.gestureChangedAt = frame.timestampMs;
    }
    const committed = this.debouncer.update(
      {
        degree,
        wristY: left?.wristY ?? null,
        richness,
        leftPresent: left !== null,
        rightPresent: right !== null,
      },
      frame.timestampMs,
    );
    const now = performance.now();
    const actions = this.controller.step(committed, now);
    this.applyActions(actions);
    const current = this.controller.currentChord;
    const force =
      actions.length > 0 ||
      committed.degree !== this.state.scaleDegree ||
      committed.richness !== this.state.richness ||
      committed.octaveZone !== this.state.octave;
    const next: Partial<SeaChordsSnapshot> = {
      leftHand: left ? this.toReadout('left', left) : null,
      rightHand: right ? this.toReadout('right', right) : null,
      fps: frame.cameraFps,
      inferenceMs: frame.inferenceMs,
      droppedFrames: frame.droppedFrames,
      scaleDegree: committed.degree,
      richness: committed.richness,
      octave: committed.octaveZone as -1 | 0 | 1,
      muted: !this.controller.isSounding,
      currentChord: current?.chordName ?? null,
      roman: current ? romanNumeral(current) : '—',
      swapSuggested: frame.assigned.labelPositionMismatch && !this.settings.swapHands,
      latencyMs: actions.some((action) => action.type === 'play')
        ? Math.max(0, now - this.gestureChangedAt)
        : this.state.latencyMs,
    };
    this.setState(
      next,
      force || now - this.lastHudUpdateAt >= 1000 / APP_CONFIG.hud.maxUpdatesPerSecond,
    );
  }

  private applyActions(actions: readonly ControllerAction[]): void {
    for (const action of actions) {
      if (action.type === 'panic') {
        this.synth.panic();
      } else if (action.type === 'stop') {
        this.synth.stop();
      } else {
        this.synth.play(action.notes);
        const event: ChordHistoryItem = {
          atMs: action.atMs,
          chordName: action.chord.chordName,
          roman: romanNumeral(action.chord),
          notes: action.notes,
        };
        const events = [...this.state.events, event].slice(-8);
        if (this.state.recording) {
          this.recordingEvents.push({
            atMs: action.atMs,
            chordName: event.chordName,
            notes: event.notes,
          });
        }
        this.setState({ events }, true);
      }
    }
  }

  private refreshChordSnapshot(): void {
    const chord = this.controller.currentChord;
    this.setState(
      {
        currentChord: chord?.chordName ?? null,
        roman: chord ? romanNumeral(chord) : '—',
        settings: this.settings,
        muted: !this.controller.isSounding,
      },
      true,
    );
  }

  private toReadout(
    role: 'left' | 'right',
    hand: NonNullable<CameraFrameState['leftHand']>,
  ): HandReadout {
    return {
      role,
      fingers: hand.nonThumbCount,
      thumbExtended: hand.thumbExtended,
      value: hand.value,
      wristY: hand.wristY,
    };
  }

  private persistSettings(): void {
    saveSettings(this.settings);
  }

  private setState(patch: Partial<SeaChordsSnapshot>, notify = true): void {
    this.state = { ...this.state, ...patch, settings: patch.settings ?? this.settings };
    if (!notify) return;
    this.lastHudUpdateAt = performance.now();
    for (const listener of this.listeners) listener(this.state);
  }
}

export { DEFAULT_SETTINGS, PITCH_CLASS_NAMES };
export type { Mode, SynthPreset, SeaChordsSettings };
