import type { SynthPreset } from './audio/synth';
import { MODE_OPTIONS, type Mode } from './music/scales';

export interface SeaChordsSettings {
  readonly tonic: number;
  readonly mode: Mode;
  readonly synthPreset: SynthPreset;
  readonly volume: number;
  readonly reverb: number;
  readonly swapHands: boolean;
  readonly zoneBoundary: number;
  readonly midiEnabled: boolean;
}

export const DEFAULT_SETTINGS: SeaChordsSettings = {
  tonic: 0,
  mode: 'major',
  synthPreset: 'pad',
  volume: 0.25,
  reverb: 0.12,
  swapHands: false,
  zoneBoundary: 0.5,
  midiEnabled: false,
};

const STORAGE_KEY = 'seachords.settings.v1';
const PRESETS: readonly SynthPreset[] = ['pad', 'pluck', 'organ', 'electric-piano'];

export function loadSettings(): SeaChordsSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '{}',
    ) as Partial<SeaChordsSettings> & {
      zoneHigh?: unknown;
      zoneLow?: unknown;
    };
    const legacyBoundary =
      typeof parsed.zoneHigh === 'number' && typeof parsed.zoneLow === 'number'
        ? (parsed.zoneHigh + parsed.zoneLow) / 2
        : parsed.zoneHigh;
    return {
      tonic: Number.isInteger(parsed.tonic)
        ? ((parsed.tonic! % 12) + 12) % 12
        : DEFAULT_SETTINGS.tonic,
      mode: MODE_OPTIONS.includes(parsed.mode as Mode)
        ? (parsed.mode as Mode)
        : DEFAULT_SETTINGS.mode,
      synthPreset: PRESETS.includes(parsed.synthPreset as SynthPreset)
        ? (parsed.synthPreset as SynthPreset)
        : DEFAULT_SETTINGS.synthPreset,
      volume: clamp(parsed.volume, 0, 1, DEFAULT_SETTINGS.volume),
      reverb: clamp(parsed.reverb, 0, 1, DEFAULT_SETTINGS.reverb),
      swapHands: parsed.swapHands === true,
      zoneBoundary: clamp(
        typeof parsed.zoneBoundary === 'number'
          ? parsed.zoneBoundary
          : typeof legacyBoundary === 'number'
            ? legacyBoundary
            : undefined,
        0.15,
        0.85,
        DEFAULT_SETTINGS.zoneBoundary,
      ),
      midiEnabled: parsed.midiEnabled === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: SeaChordsSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing and quota restrictions should not stop the instrument.
  }
}

function clamp(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}
