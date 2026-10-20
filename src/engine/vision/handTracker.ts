import type { HandRole } from '../gesture/classify';
import type { Landmark } from '../gesture/fingerCount';

export type MediaPipeHandLabel = 'Left' | 'Right' | 'Unknown';

export interface DetectedHand {
  readonly label: MediaPipeHandLabel;
  readonly landmarks: readonly Landmark[];
}

export interface AssignedHands {
  readonly left: DetectedHand | null;
  readonly right: DetectedHand | null;
  readonly labelPositionMismatch: boolean;
}

/**
 * MediaPipe's handedness labels assume a mirrored selfie frame. SeaChords feeds
 * raw frames and mirrors only the displayed video/canvas, so labels invert for
 * raw input. For two hands, mirrored-view wrist position is authoritative.
 */
export function mapHandednessLabel(
  label: MediaPipeHandLabel,
  inputMirrored: boolean,
): HandRole | null {
  if (label === 'Unknown') return null;
  if (inputMirrored) return label === 'Left' ? 'left' : 'right';
  return label === 'Left' ? 'right' : 'left';
}

export function mirroredViewX(rawX: number, inputMirrored: boolean): number {
  return inputMirrored ? rawX : 1 - rawX;
}

export function assignHandRoles(
  hands: readonly DetectedHand[],
  inputMirrored: boolean,
  swapHands = false,
): AssignedHands {
  let left: DetectedHand | null = null;
  let right: DetectedHand | null = null;
  let labelPositionMismatch = false;

  if (hands.length >= 2) {
    const first = hands[0]!;
    const second = hands[1]!;
    const firstX = mirroredViewX(first.landmarks[0]?.x ?? 0.5, inputMirrored);
    const secondX = mirroredViewX(second.landmarks[0]?.x ?? 0.5, inputMirrored);
    // In the mirrored view, the user's left hand is on viewer-left (smaller x).
    if (firstX <= secondX) {
      left = first;
      right = second;
      labelPositionMismatch = mapHandednessLabel(first.label, inputMirrored) === 'right'
        || mapHandednessLabel(second.label, inputMirrored) === 'left';
    } else {
      left = second;
      right = first;
      labelPositionMismatch = mapHandednessLabel(second.label, inputMirrored) === 'right'
        || mapHandednessLabel(first.label, inputMirrored) === 'left';
    }
  } else if (hands.length === 1) {
    const hand = hands[0]!;
    const role = mapHandednessLabel(hand.label, inputMirrored)
      ?? (mirroredViewX(hand.landmarks[0]?.x ?? 0.5, inputMirrored) < 0.5 ? 'left' : 'right');
    if (role === 'left') left = hand;
    else right = hand;
  }

  return swapHands
    ? { left: right, right: left, labelPositionMismatch: false }
    : { left, right, labelPositionMismatch };
}
