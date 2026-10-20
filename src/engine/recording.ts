export interface RecordedChord {
  readonly atMs: number;
  readonly chordName: string;
  readonly notes: readonly number[];
}

interface MidiEvent {
  readonly tick: number;
  readonly priority: number;
  readonly bytes: number[];
}

export function encodeMidiFile(events: readonly RecordedChord[]): Uint8Array {
  const ticksPerQuarter = 480;
  const microsecondsPerQuarter = 500_000;
  const ordered = [...events].sort((a, b) => a.atMs - b.atMs);
  const track: MidiEvent[] = [{
    tick: 0,
    priority: -1,
    bytes: [0xff, 0x51, 0x03,
      (microsecondsPerQuarter >> 16) & 0xff,
      (microsecondsPerQuarter >> 8) & 0xff,
      microsecondsPerQuarter & 0xff],
  }];
  let previousNotes: readonly number[] = [];
  const startMs = ordered[0]?.atMs ?? 0;

  for (const event of ordered) {
    const tick = Math.max(0, Math.round((event.atMs - startMs) * ticksPerQuarter / 500));
    for (const note of previousNotes) track.push({ tick, priority: 0, bytes: [0x80, note, 0] });
    for (const note of event.notes) track.push({ tick, priority: 1, bytes: [0x90, note, 90] });
    previousNotes = event.notes;
  }
  const finalTick = (track.at(-1)?.tick ?? 0) + ticksPerQuarter;
  for (const note of previousNotes) track.push({ tick: finalTick, priority: 0, bytes: [0x80, note, 0] });
  track.push({ tick: finalTick, priority: 1, bytes: [0xff, 0x2f, 0x00] });
  track.sort((a, b) => a.tick - b.tick || a.priority - b.priority);

  const trackBytes: number[] = [];
  let previousTick = 0;
  for (const event of track) {
    trackBytes.push(...variableLength(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }
  return new Uint8Array([
    ...ascii('MThd'), 0, 0, 0, 6, 0, 0, 0, 1,
    (ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff,
    ...ascii('MTrk'),
    (trackBytes.length >>> 24) & 0xff,
    (trackBytes.length >>> 16) & 0xff,
    (trackBytes.length >>> 8) & 0xff,
    trackBytes.length & 0xff,
    ...trackBytes,
  ]);
}

function variableLength(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= ((value & 0x7f) | 0x80);
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

function ascii(value: string): number[] {
  return Array.from(value, (character) => character.charCodeAt(0));
}

export function downloadMidi(events: readonly RecordedChord[]): void {
  if (events.length === 0) return;
  const bytes = encodeMidiFile(events);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([buffer], { type: 'audio/midi' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `seachords-${new Date().toISOString().slice(0, 10)}.mid`;
  link.click();
  URL.revokeObjectURL(link.href);
}
