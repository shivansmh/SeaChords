import { useCallback, useEffect, useRef, useState } from 'react';
import { SeaChordsEngine, type SeaChordsSnapshot } from '../engine';
import type { Mode } from '../engine/music/scales';
import type { SynthPreset } from '../engine/audio/synth';

export interface UseSeaChordsReturn extends SeaChordsSnapshot {
  readonly videoRef: React.RefObject<HTMLVideoElement | null>;
  readonly canvasRef: React.RefObject<HTMLCanvasElement | null>;
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  readonly panic: () => void;
  readonly setKey: (tonic: number) => void;
  readonly setMode: (mode: Mode) => void;
  readonly setSynthPreset: (preset: SynthPreset) => void;
  readonly setVolume: (volume: number) => void;
  readonly setReverb: (reverb: number) => void;
  readonly swapHands: () => void;
  readonly calibrate: (zoneHigh: number, zoneLow: number) => void;
  readonly setKeyboardMode: (enabled: boolean) => void;
  readonly setKeyboardDegree: (degree: number) => void;
  readonly setKeyboardRichness: (richness: number) => void;
  readonly setMidiEnabled: (enabled: boolean) => Promise<string | null>;
  readonly startRecording: () => void;
  readonly stopRecording: (download?: boolean) => void;
  readonly exportRecording: () => void;
}

export function useSeaChords(): UseSeaChordsReturn {
  const engineRef = useRef<SeaChordsEngine | null>(null);
  if (!engineRef.current) engineRef.current = new SeaChordsEngine();
  const engine = engineRef.current;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [snapshot, setSnapshot] = useState<SeaChordsSnapshot>(engine.snapshot);

  useEffect(() => {
    const unsubscribe = engine.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      engine.stop();
      engine.dispose();
    };
  }, [engine]);

  const start = useCallback(async () => {
    engine.attachMedia(videoRef.current, canvasRef.current);
    await engine.start();
  }, [engine]);
  const stop = useCallback(() => engine.stop(), [engine]);
  const panic = useCallback(() => engine.panic(), [engine]);
  const setKey = useCallback((tonic: number) => engine.setKey(tonic), [engine]);
  const setMode = useCallback((mode: Mode) => engine.setMode(mode), [engine]);
  const setSynthPreset = useCallback((preset: SynthPreset) => engine.setSynthPreset(preset), [engine]);
  const setVolume = useCallback((volume: number) => engine.setVolume(volume), [engine]);
  const setReverb = useCallback((reverb: number) => engine.setReverb(reverb), [engine]);
  const swapHands = useCallback(() => engine.swapHands(), [engine]);
  const calibrate = useCallback((zoneHigh: number, zoneLow: number) => engine.calibrate(zoneHigh, zoneLow), [engine]);
  const setKeyboardMode = useCallback((enabled: boolean) => engine.setKeyboardMode(enabled), [engine]);
  const setKeyboardDegree = useCallback((degree: number) => engine.setKeyboardDegree(degree), [engine]);
  const setKeyboardRichness = useCallback((richness: number) => engine.setKeyboardRichness(richness), [engine]);
  const setMidiEnabled = useCallback((enabled: boolean) => engine.setMidiEnabled(enabled), [engine]);
  const startRecording = useCallback(() => engine.startRecording(), [engine]);
  const stopRecording = useCallback((download = false) => engine.stopRecording(download), [engine]);
  const exportRecording = useCallback(() => engine.exportRecording(), [engine]);

  return {
    ...snapshot,
    videoRef,
    canvasRef,
    start,
    stop,
    panic,
    setKey,
    setMode,
    setSynthPreset,
    setVolume,
    setReverb,
    swapHands,
    calibrate,
    setKeyboardMode,
    setKeyboardDegree,
    setKeyboardRichness,
    setMidiEnabled,
    startRecording,
    stopRecording,
    exportRecording,
  };
}
