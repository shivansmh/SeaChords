export interface Landmark {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export interface FingerCount {
  readonly valid: boolean;
  readonly palmSize: number;
  readonly wristX: number;
  readonly wristY: number;
  readonly nonThumbCount: number;
  readonly thumbExtended: boolean;
  readonly extended: Readonly<{ thumb: boolean; index: boolean; middle: boolean; ring: boolean; pinky: boolean }>;
}

function distanceSquared(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return dx * dx + dy * dy + dz * dz;
}

export function countExtendedFingers(
  landmarks: readonly Landmark[],
  fingerExtensionRatio = 1.1,
  thumbExtensionRatio = 1.1,
  minPalmSize = 0.04,
): FingerCount {
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const pinkyMcp = landmarks[17];
  if (landmarks.length < 21 || !wrist || !middleMcp || !pinkyMcp) {
    return {
      valid: false,
      palmSize: 0,
      wristX: wrist?.x ?? 0,
      wristY: wrist?.y ?? 0,
      nonThumbCount: 0,
      thumbExtended: false,
      extended: { thumb: false, index: false, middle: false, ring: false, pinky: false },
    };
  }

  const palmSize = Math.sqrt(distanceSquared(wrist, middleMcp));
  if (palmSize < minPalmSize) {
    return {
      valid: false,
      palmSize,
      wristX: wrist.x,
      wristY: wrist.y,
      nonThumbCount: 0,
      thumbExtended: false,
      extended: { thumb: false, index: false, middle: false, ring: false, pinky: false },
    };
  }

  const ratioSquared = fingerExtensionRatio * fingerExtensionRatio;
  const index = (landmarks[8] && landmarks[6])
    ? distanceSquared(wrist, landmarks[8]) > distanceSquared(wrist, landmarks[6]) * ratioSquared
    : false;
  const middle = (landmarks[12] && landmarks[10])
    ? distanceSquared(wrist, landmarks[12]) > distanceSquared(wrist, landmarks[10]) * ratioSquared
    : false;
  const ring = (landmarks[16] && landmarks[14])
    ? distanceSquared(wrist, landmarks[16]) > distanceSquared(wrist, landmarks[14]) * ratioSquared
    : false;
  const pinky = (landmarks[20] && landmarks[18])
    ? distanceSquared(wrist, landmarks[20]) > distanceSquared(wrist, landmarks[18]) * ratioSquared
    : false;
  const thumbIp = landmarks[3];
  const thumbTip = landmarks[4];
  const thumbExtended = thumbIp && thumbTip
    ? distanceSquared(thumbTip, pinkyMcp) >
      distanceSquared(thumbIp, pinkyMcp) * thumbExtensionRatio * thumbExtensionRatio
    : false;

  return {
    valid: true,
    palmSize,
    wristX: wrist.x,
    wristY: wrist.y,
    nonThumbCount: Number(index) + Number(middle) + Number(ring) + Number(pinky),
    thumbExtended,
    extended: { thumb: thumbExtended, index, middle, ring, pinky },
  };
}

export function isFingerSetExtended(count: FingerCount): boolean {
  return count.valid;
}
