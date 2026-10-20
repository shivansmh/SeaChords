import { describe, expect, it } from 'vitest';
import { classifyHand } from './classify';
import type { Landmark } from './fingerCount';

function makeHand(
  thumb: boolean,
  index: boolean,
  middle: boolean,
  ring: boolean,
  pinky: boolean,
  wristX = 0.3,
): Landmark[] {
  const points: Landmark[] = Array.from({ length: 21 }, () => ({
    x: wristX,
    y: 0.5,
    z: 0,
  }));
  points[0] = { x: wristX, y: 0.5, z: 0 };
  points[9] = { x: wristX, y: 0.35, z: 0 };
  points[17] = { x: wristX + 0.1, y: 0.4, z: 0 };
  const fingers = [
    [6, 8, index],
    [10, 12, middle],
    [14, 16, ring],
    [18, 20, pinky],
  ] as const;
  for (const [pip, tip, extended] of fingers) {
    points[pip] = { x: wristX, y: 0.4, z: 0 };
    points[tip] = { x: wristX, y: extended ? 0.3 : 0.42, z: 0 };
  }
  points[3] = { x: wristX, y: 0.4, z: 0 };
  points[4] = { x: thumb ? wristX - 0.2 : wristX + 0.02, y: 0.4, z: 0 };
  return points;
}

const poses = [
  [false, false, false, false, false, 6, 0],
  [true, false, false, false, false, 7, 0],
  [false, true, false, false, false, 1, 1],
  [false, true, true, false, false, 2, 2],
  [false, true, true, true, false, 3, 3],
  [false, true, true, true, true, 4, 4],
  [true, true, true, true, true, 5, 5],
] as const;

describe('gesture classification', () => {
  it('maps finger configurations to left-hand scale degrees', () => {
    for (const [thumb, index, middle, ring, pinky, degree] of poses) {
      expect(
        classifyHand(makeHand(thumb, index, middle, ring, pinky), 'left').value,
      ).toBe(degree);
    }
  });

  it('maps finger configurations to right-hand richness and mute', () => {
    for (const [thumb, index, middle, ring, pinky, , richness] of poses) {
      expect(
        classifyHand(makeHand(thumb, index, middle, ring, pinky), 'right').value,
      ).toBe(richness);
    }
  });

  it('rejects incomplete or too-small landmarks', () => {
    expect(classifyHand([], 'left').valid).toBe(false);
    const tiny = makeHand(false, true, false, false, false).map((point) => ({
      x: point.x * 0.001,
      y: point.y * 0.001,
      z: point.z,
    }));
    expect(classifyHand(tiny, 'right').valid).toBe(false);
  });
});
