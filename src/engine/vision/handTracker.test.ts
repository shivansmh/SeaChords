import { describe, expect, it } from 'vitest';
import { classifyHand } from '../gesture/classify';
import type { Landmark } from '../gesture/fingerCount';
import { assignHandRoles, mapHandednessLabel, type DetectedHand } from './handTracker';

const landmarks = (x: number): Landmark[] => {
  const points: Landmark[] = Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 }));
  points[0] = { x, y: 0.5, z: 0 };
  points[9] = { x, y: 0.35, z: 0 };
  points[17] = { x: x + 0.1, y: 0.4, z: 0 };
  for (const [pip, tip, extended] of [[6, 8, true], [10, 12, false], [14, 16, false], [18, 20, false]] as const) {
    points[pip] = { x, y: 0.4, z: 0 };
    points[tip] = { x, y: extended ? 0.3 : 0.42, z: 0 };
  }
  points[3] = { x, y: 0.4, z: 0 };
  points[4] = { x: x + 0.02, y: 0.4, z: 0 };
  return points;
};

const hand = (label: DetectedHand['label'], x: number): DetectedHand => ({ label, landmarks: landmarks(x) });

describe('handedness mapping', () => {
  it('inverts MediaPipe labels for raw unmirrored input', () => {
    expect(mapHandednessLabel('Left', false)).toBe('right');
    expect(mapHandednessLabel('Right', false)).toBe('left');
  });

  it('keeps MediaPipe labels for mirrored input', () => {
    expect(mapHandednessLabel('Left', true)).toBe('left');
    expect(mapHandednessLabel('Right', true)).toBe('right');
  });

  it.each([
    { mirrored: false, leftX: 0.78, rightX: 0.22, leftLabel: 'Right' as const, rightLabel: 'Left' as const },
    { mirrored: true, leftX: 0.22, rightX: 0.78, leftLabel: 'Left' as const, rightLabel: 'Right' as const },
  ])('assigns roles by mirrored-view position for raw/mirrored input', ({ mirrored, leftX, rightX, leftLabel, rightLabel }) => {
    const assigned = assignHandRoles([
      hand(rightLabel, rightX),
      hand(leftLabel, leftX),
    ], mirrored);
    expect(assigned.left?.landmarks[0]?.x).toBe(leftX);
    expect(assigned.right?.landmarks[0]?.x).toBe(rightX);
    expect(classifyHand(assigned.left!.landmarks, 'left').value).toBe(1);
    expect(classifyHand(assigned.right!.landmarks, 'right').value).toBe(1);
  });

  it('supports the persisted emergency swap only as an explicit override', () => {
    const assigned = assignHandRoles([hand('Right', 0.78), hand('Left', 0.22)], false, true);
    expect(assigned.left?.landmarks[0]?.x).toBe(0.22);
    expect(assigned.right?.landmarks[0]?.x).toBe(0.78);
  });
});
