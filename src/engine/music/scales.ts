export type Mode = 'major' | 'natural_minor' | 'dorian' | 'mixolydian';

export const SCALE_OFFSETS: Record<Mode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural_minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

export const MODE_LABELS: Record<Mode, string> = {
  major: 'Major',
  natural_minor: 'Natural Minor',
  dorian: 'Dorian',
  mixolydian: 'Mixolydian',
};

export const MODE_OPTIONS = Object.keys(MODE_LABELS) as Mode[];

export const NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

export function getScaleOffsets(mode: Mode): readonly number[] {
  const offsets = SCALE_OFFSETS[mode];
  if (!offsets) throw new RangeError(`Unsupported scale mode: ${String(mode)}`);
  return offsets;
}

export function getScalePitchClasses(tonic: number, mode: Mode): ReadonlySet<number> {
  return new Set(getScaleOffsets(mode).map((offset) => (tonic + offset) % 12));
}

export function isPitchClassInScale(pc: number, tonic: number, mode: Mode): boolean {
  return getScalePitchClasses(tonic, mode).has(((pc % 12) + 12) % 12);
}

export function pitchClassToName(pc: number): string {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}
