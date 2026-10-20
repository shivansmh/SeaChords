import { WebMidiOutput } from './midiOut';

export type SynthPreset = 'pad' | 'pluck' | 'organ' | 'electric-piano';

interface ActiveVoice {
  readonly oscillators: OscillatorNode[];
  readonly envelope: GainNode;
}

const PRESET_SHAPES: Record<SynthPreset, OscillatorType> = {
  pad: 'sine',
  pluck: 'triangle',
  organ: 'sawtooth',
  'electric-piano': 'sine',
};

export class SeaChordsSynth {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private wet: GainNode | null = null;
  private readonly voices: ActiveVoice[] = [];
  private readonly midi = new WebMidiOutput();
  private volume = 0.25;
  private reverb = 0.12;
  private preset: SynthPreset = 'pad';

  get isReady(): boolean {
    return this.context !== null;
  }

  get audioTime(): number {
    return this.context?.currentTime ?? 0;
  }

  get midiSupported(): boolean {
    return this.midi.supported;
  }

  get midiConnected(): boolean {
    return this.midi.connected;
  }

  async unlock(): Promise<void> {
    if (!this.context) this.createGraph();
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  async enableMidi(): Promise<string | null> {
    return this.midi.connect();
  }

  disableMidi(): void {
    this.midi.disconnect();
  }

  setPreset(preset: SynthPreset): void {
    this.preset = preset;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
    }
  }

  setReverb(amount: number): void {
    this.reverb = Math.max(0, Math.min(1, amount));
    if (this.wet && this.context) {
      this.wet.gain.setTargetAtTime(this.reverb * 0.35, this.context.currentTime, 0.03);
    }
  }

  play(notes: readonly number[], timestamp?: number): void {
    const when = this.context ? Math.max(this.context.currentTime, timestamp ?? this.context.currentTime) : 0;
    this.stop(when);
    this.midi.play(notes);
    if (!this.context || !this.master || this.volume <= 0) return;

    const context = this.context;
    for (const note of notes) {
      const frequency = 440 * 2 ** ((note - 69) / 12);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, when);
      envelope.connect(this.master);
      if (this.convolver) envelope.connect(this.convolver);

      const oscillators: OscillatorNode[] = [];
      const fundamental = context.createOscillator();
      fundamental.type = PRESET_SHAPES[this.preset];
      fundamental.frequency.setValueAtTime(frequency, when);
      fundamental.connect(envelope);
      fundamental.start(when);
      oscillators.push(fundamental);

      if (this.preset === 'pad' || this.preset === 'organ') {
        const layer = context.createOscillator();
        layer.type = this.preset === 'pad' ? 'triangle' : 'sine';
        layer.frequency.setValueAtTime(frequency * (this.preset === 'pad' ? 1.003 : 2), when);
        const layerGain = context.createGain();
        layerGain.gain.value = this.preset === 'pad' ? 0.28 : 0.18;
        layer.connect(layerGain).connect(envelope);
        layer.start(when);
        oscillators.push(layer);
      } else if (this.preset === 'electric-piano') {
        const harmonic = context.createOscillator();
        harmonic.type = 'sine';
        harmonic.frequency.setValueAtTime(frequency * 2, when);
        const harmonicGain = context.createGain();
        harmonicGain.gain.value = 0.16;
        harmonic.connect(harmonicGain).connect(envelope);
        harmonic.start(when);
        oscillators.push(harmonic);
      }

      const attack = this.preset === 'pluck' ? 0.008 : 0.025;
      const peak = this.preset === 'organ' ? 0.12 : 0.17;
      envelope.gain.linearRampToValueAtTime(peak, when + attack);
      if (this.preset === 'pluck') {
        envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
        for (const oscillator of oscillators) oscillator.stop(when + 0.52);
      }
      this.voices.push({ oscillators, envelope });
    }
  }

  stop(when = this.context?.currentTime ?? 0): void {
    this.releaseVoices(when);
    this.midi.releaseAll();
  }

  panic(when = this.context?.currentTime ?? 0): void {
    this.releaseVoices(when);
    this.midi.panic();
  }

  dispose(): void {
    this.panic();
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.convolver = null;
    this.wet = null;
  }

  private createGraph(): void {
    const context = new AudioContext({ latencyHint: 'interactive' });
    const master = context.createGain();
    master.gain.value = this.volume;
    master.connect(context.destination);
    const convolver = context.createConvolver();
    convolver.buffer = this.createImpulse(context, 1.4, 2.6);
    const wet = context.createGain();
    wet.gain.value = this.reverb * 0.35;
    convolver.connect(wet).connect(master);
    this.context = context;
    this.master = master;
    this.convolver = convolver;
    this.wet = wet;
  }

  private createImpulse(context: AudioContext, seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(context.sampleRate * seconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
      }
    }
    return impulse;
  }

  private releaseVoices(when: number): void {
    const release = this.preset === 'pad' ? 0.18 : 0.12;
    for (const voice of this.voices) {
      voice.envelope.gain.cancelScheduledValues(when);
      voice.envelope.gain.setValueAtTime(Math.max(voice.envelope.gain.value, 0.0001), when);
      voice.envelope.gain.linearRampToValueAtTime(0.0001, when + release);
      for (const oscillator of voice.oscillators) {
        try {
          oscillator.stop(when + release + 0.03);
        } catch {
          // A pluck oscillator may already be scheduled to stop.
        }
      }
    }
    this.voices.length = 0;
  }
}
