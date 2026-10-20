import { constructChord, type ChordDefinition } from '../music/chords';
import { buildVoicedNotes } from '../music/voicing';
import type { Mode } from '../music/scales';
import type { CommittedGestureState } from './debounce';

export type ControllerAction =
  | {
      readonly type: 'play';
      readonly notes: number[];
      readonly chord: ChordDefinition;
      readonly atMs: number;
    }
  | { readonly type: 'stop'; readonly atMs: number }
  | { readonly type: 'panic'; readonly atMs: number };

export class SeaChordsController {
  private degree = 1;
  private octaveZone = 0;
  private richness = 0;
  private handsPresent = false;
  private sounding = false;

  constructor(
    private tonic = 0,
    private mode: Mode = 'major',
    private readonly retriggerOnOctave = true,
    private readonly baseTonicMidi = 48,
  ) {}

  get currentChord(): ChordDefinition | null {
    return this.richness > 0
      ? constructChord(this.degree, this.richness, this.tonic, this.mode)
      : null;
  }

  get isSounding(): boolean {
    return this.sounding;
  }

  get key(): { tonic: number; mode: Mode } {
    return { tonic: this.tonic, mode: this.mode };
  }

  setKey(tonic: number, mode = this.mode, atMs = performance.now()): ControllerAction[] {
    this.tonic = ((tonic % 12) + 12) % 12;
    this.mode = mode;
    const actions: ControllerAction[] = [{ type: 'panic', atMs }];
    this.sounding = false;
    if (this.handsPresent && this.richness > 0) actions.push(this.playAction(atMs));
    return actions;
  }

  panic(atMs = performance.now()): ControllerAction[] {
    this.sounding = false;
    return [{ type: 'panic', atMs }];
  }

  step(state: CommittedGestureState, atMs = performance.now()): ControllerAction[] {
    const previousDegree = this.degree;
    const previousZone = this.octaveZone;
    const previousRichness = this.richness;
    const previousHandsPresent = this.handsPresent;
    const wasSounding = this.sounding;
    this.degree = state.degree;
    this.octaveZone = state.octaveZone;
    this.richness = state.richness;
    this.handsPresent = state.handsPresent;

    if (!state.handsPresent || state.richness === 0) {
      if (wasSounding) {
        this.sounding = false;
        return [{ type: 'stop', atMs }];
      }
      return [];
    }

    if (previousRichness === 0 || !previousHandsPresent || !wasSounding) {
      return [this.playAction(atMs)];
    }

    const chordChanged =
      state.degree !== previousDegree || state.richness !== previousRichness;
    const octaveChanged = state.octaveZone !== previousZone && this.retriggerOnOctave;
    return chordChanged || octaveChanged ? [this.playAction(atMs)] : [];
  }

  private playAction(atMs: number): ControllerAction {
    const chord = constructChord(this.degree, this.richness, this.tonic, this.mode);
    const notes = buildVoicedNotes(
      chord,
      this.octaveZone,
      this.tonic,
      this.mode,
      this.baseTonicMidi,
    );
    this.sounding = true;
    return { type: 'play', notes, chord, atMs };
  }
}
