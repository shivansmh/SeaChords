import { APP_CONFIG } from '../../config';
import { countExtendedFingers, type FingerCount, type Landmark } from './fingerCount';

export type HandRole = 'left' | 'right';

export interface ClassifiedHand extends FingerCount {
  readonly role: HandRole;
  readonly value: number;
}

export function classifyHand(
  landmarks: readonly Landmark[],
  role: HandRole,
  options: {
    fingerExtensionRatio?: number;
    thumbExtensionRatio?: number;
    minPalmSize?: number;
  } = {},
): ClassifiedHand {
  const fingers = countExtendedFingers(
    landmarks,
    options.fingerExtensionRatio ?? APP_CONFIG.gesture.fingerExtensionRatio,
    options.thumbExtensionRatio ?? APP_CONFIG.gesture.thumbExtensionRatio,
    options.minPalmSize ?? APP_CONFIG.gesture.minPalmSize,
  );
  const count = fingers.nonThumbCount;
  const value = role === 'left'
    ? count === 0 ? (fingers.thumbExtended ? 7 : 6)
      : count === 4 && fingers.thumbExtended ? 5 : count
    : count === 0 ? 0
      : count === 4 && fingers.thumbExtended ? 5 : count;
  return { ...fingers, role, value };
}
