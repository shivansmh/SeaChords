import type { ChordDefinition } from './chords';

const DEGREE_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

export function romanNumeral(chord: ChordDefinition): string {
  if (chord.level === 0) return '—';
  const numeral = DEGREE_NUMERALS[chord.degreeZero] ?? 'I';
  const minor = /m(?!aj)/.test(chord.chordName);
  const diminished = /dim|m7b5/.test(chord.chordName);
  const quality = minor ? numeral.toLowerCase() : numeral;
  return `${quality}${diminished ? '°' : ''}${chord.level === 2 ? '7' : chord.level === 3 ? '9' : ''}`;
}
