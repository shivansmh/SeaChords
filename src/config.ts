export const APP_CONFIG = {
  camera: {
    width: 640,
    height: 480,
    frameRate: 30,
    minDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  },
  gesture: {
    fingerExtensionRatio: 1.1,
    thumbExtensionRatio: 1.1,
    minPalmSize: 0.04,
  },
  debounce: {
    stableMs: 60,
    handLostGraceMs: 300,
  },
  octave: {
    zoneHigh: 0.33,
    zoneLow: 0.66,
    deadband: 0.04,
  },
  audio: {
    attackSeconds: 0.025,
    releaseSeconds: 0.12,
    baseTonicMidi: 48,
    initialVolume: 0.25,
  },
  hud: {
    maxUpdatesPerSecond: 12,
    debugHotkey: 'd',
    helpHotkey: 'h',
  },
} as const;

export const PITCH_CLASS_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;
