import { describe, expect, it } from 'vitest';
import { constructChord } from './chords';
import { getScalePitchClasses, type Mode } from './scales';
import { buildVoicedNotes, clampChordToRange } from './voicing';

describe('diatonic chord construction', () => {
  it('matches the C major triads and sevenths from the SOP', () => {
    const triads = ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'];
    const sevenths = ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5'];
    for (let degree = 1; degree <= 7; degree += 1) {
      expect(constructChord(degree, 1, 0, 'major').chordName).toBe(triads[degree - 1]);
      expect(constructChord(degree, 2, 0, 'major').chordName).toBe(sevenths[degree - 1]);
    }
  });

  it('matches the A natural-minor triads and sevenths', () => {
    const triads = ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G'];
    const sevenths = ['Am7', 'Bm7b5', 'Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7'];
    for (let degree = 1; degree <= 7; degree += 1) {
      expect(constructChord(degree, 1, 9, 'natural_minor').chordName).toBe(
        triads[degree - 1],
      );
      expect(constructChord(degree, 2, 9, 'natural_minor').chordName).toBe(
        sevenths[degree - 1],
      );
    }
  });

  it('uses the specified flat-9 avoid-note fallback', () => {
    for (const [tonic, mode, avoidedDegrees] of [
      [0, 'major', [3, 7]],
      [9, 'natural_minor', [2, 5]],
    ] as const) {
      for (let degree = 1; degree <= 7; degree += 1) {
        expect(constructChord(degree, 3, tonic, mode).isAvoidNoteFallback).toBe(
          new Set<number>(avoidedDegrees).has(degree),
        );
      }
    }
  });

  it('selects the in-key sus2 for IV in C major', () => {
    const sus = constructChord(4, 4, 0, 'major');
    expect(sus.chordName).toBe('Fsus2');
    expect(sus.relativeOffsets).toEqual([0, 2, 7]);
  });

  it('supports all requested modes and keeps every output pitch diatonic in every key', () => {
    const modes: Mode[] = ['major', 'natural_minor', 'dorian', 'mixolydian'];
    for (const mode of modes) {
      for (let tonic = 0; tonic < 12; tonic += 1) {
        const scale = getScalePitchClasses(tonic, mode);
        for (let degree = 1; degree <= 7; degree += 1) {
          for (let level = 1; level <= 5; level += 1) {
            const chord = constructChord(degree, level, tonic, mode);
            for (const zone of [-1, 0, 1]) {
              for (const note of buildVoicedNotes(chord, zone, tonic, mode)) {
                expect(scale.has(note % 12)).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('places and clamps root-position and spread voicings', () => {
    const triad = constructChord(1, 1, 0, 'major');
    expect(buildVoicedNotes(triad, 0, 0)).toEqual([48, 52, 55]);
    expect(buildVoicedNotes(triad, 1, 0)).toEqual([60, 64, 67]);
    expect(buildVoicedNotes(triad, -1, 0)).toEqual([36, 40, 43]);
    expect(clampChordToRange([0, 4, 7]).every((note) => note >= 21 && note <= 108)).toBe(
      true,
    );
    expect(
      clampChordToRange([105, 109, 112]).every((note) => note >= 21 && note <= 108),
    ).toBe(true);
  });
});
