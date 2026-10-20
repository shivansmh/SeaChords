import { getDiatonicStackIntervals, type ChordDefinition } from './chords';
import { getScaleOffsets, type Mode } from './scales';

export function clampChordToRange(
  notes: readonly number[],
  minMidi = 21,
  maxMidi = 108,
): number[] {
  if (notes.length === 0) return [];
  const result = [...notes];
  while (Math.min(...result) < minMidi) {
    for (let i = 0; i < result.length; i += 1) result[i]! += 12;
  }
  while (Math.max(...result) > maxMidi) {
    for (let i = 0; i < result.length; i += 1) result[i]! -= 12;
  }
  return result;
}

export function buildVoicedNotes(
  chord: ChordDefinition,
  octaveZone = 0,
  tonic = 0,
  mode: Mode = 'major',
  baseTonicMidi = 48,
): number[] {
  if (chord.level === 0 || chord.relativeOffsets.length === 0) return [];
  const scale = getScaleOffsets(mode);
  const root =
    baseTonicMidi +
    (((tonic % 12) + 12) % 12) +
    scale[chord.degreeZero]! +
    octaveZone * 12;
  const [third, fifth, seventh, ninth] = getDiatonicStackIntervals(
    chord.degreeZero,
    mode,
  );
  let notes: number[];
  if (chord.level === 5 || (chord.level === 3 && chord.isAvoidNoteFallback)) {
    notes = [root - 12, root, root + fifth, root + seventh, root + third + 12];
    if (chord.level === 5 && !chord.isAvoidNoteFallback) notes.push(root + ninth + 12);
  } else {
    notes = chord.relativeOffsets.map((offset) => root + offset);
  }
  return [...new Set(clampChordToRange(notes))].sort((a, b) => a - b);
}
