import { describe, expect, it } from 'vitest';
import { encodeMidiFile } from './recording';

describe('MIDI recording export', () => {
  it('writes a valid single-track MIDI file with note-on, note-off and end marker', () => {
    const bytes = encodeMidiFile([
      { atMs: 1000, chordName: 'C', notes: [48, 52, 55] },
      { atMs: 1500, chordName: 'Dm', notes: [50, 53, 57] },
    ]);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('MThd')).toBe(true);
    expect(text.includes('MTrk')).toBe(true);
    expect(bytes).toContain(0x90);
    expect(bytes).toContain(0x80);
    expect(bytes.slice(-3)).toEqual(new Uint8Array([0xff, 0x2f, 0x00]));
  });
});
