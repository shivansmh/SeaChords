export interface MidiPort {
  readonly name?: string | null;
  send(data: number[]): void;
}

type MidiAccessLike = { readonly outputs: Map<string, MidiPort> };
type MidiNavigator = Navigator & { requestMIDIAccess?: () => Promise<MidiAccessLike> };

export class WebMidiOutput {
  private output: MidiPort | null = null;
  private readonly activeNotes = new Set<number>();

  get supported(): boolean {
    return typeof navigator !== 'undefined' && Boolean((navigator as MidiNavigator).requestMIDIAccess);
  }

  get connected(): boolean {
    return this.output !== null;
  }

  async connect(): Promise<string | null> {
    const request = (navigator as MidiNavigator).requestMIDIAccess;
    if (!request) return null;
    const access = await request.call(navigator);
    this.output = access.outputs.values().next().value ?? null;
    return this.output?.name ?? (this.output ? 'MIDI output' : null);
  }

  play(notes: readonly number[], velocity = 90): void {
    if (!this.output) return;
    this.releaseAll();
    for (const note of notes) {
      this.output.send([0x90, note, velocity]);
      this.activeNotes.add(note);
    }
  }

  releaseAll(): void {
    if (!this.output) return;
    for (const note of this.activeNotes) this.output.send([0x80, note, 0]);
    this.activeNotes.clear();
  }

  panic(): void {
    if (!this.output) return;
    this.releaseAll();
    this.output.send([0xb0, 123, 0]);
  }

  disconnect(): void {
    this.panic();
    this.output = null;
  }
}
