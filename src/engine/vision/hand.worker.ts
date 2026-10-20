/// <reference lib="webworker" />

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { Landmark } from '../gesture/fingerCount';
import type { MediaPipeHandLabel } from './handTracker';

interface InitMessage {
  readonly type: 'init';
  readonly wasmRoot: string;
  readonly modelBuffer: ArrayBuffer;
  readonly minDetectionConfidence: number;
  readonly minHandPresenceConfidence: number;
  readonly minTrackingConfidence: number;
}

interface FrameMessage {
  readonly type: 'frame';
  readonly bitmap: ImageBitmap;
  readonly timestampMs: number;
}

type WorkerMessage = InitMessage | FrameMessage | { readonly type: 'stop' };

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
let detector: HandLandmarker | null = null;
let initialization: Promise<void> | null = null;

async function createDetector(
  fileset: WasmFileset,
  modelBuffer: ArrayBuffer,
  delegate: 'GPU' | 'CPU',
  message: InitMessage,
): Promise<HandLandmarker> {
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: new Uint8Array(modelBuffer), delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: message.minDetectionConfidence,
    minHandPresenceConfidence: message.minHandPresenceConfidence,
    minTrackingConfidence: message.minTrackingConfidence,
  });
}

function serializeResult(result: HandLandmarkerResult) {
  return result.landmarks.map((landmarks, index) => {
    const category = result.handedness[index]?.[0];
    const categoryName = category?.categoryName ?? '';
    const label: MediaPipeHandLabel =
      categoryName === 'Left' || categoryName === 'Right' ? categoryName : 'Unknown';
    const points: Landmark[] = landmarks.map(({ x, y, z }) => ({ x, y, z }));
    return { label, landmarks: points };
  });
}

workerScope.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (message.type === 'init') {
    initialization = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(message.wasmRoot);
      try {
        detector = await createDetector(fileset, message.modelBuffer, 'GPU', message);
        workerScope.postMessage({ type: 'ready', delegate: 'GPU' });
      } catch (gpuError) {
        try {
          detector = await createDetector(fileset, message.modelBuffer, 'CPU', message);
          workerScope.postMessage({
            type: 'ready',
            delegate: 'CPU',
            gpuFallback: gpuError instanceof Error ? gpuError.message : String(gpuError),
          });
        } catch (cpuError) {
          const reason = cpuError instanceof Error ? cpuError.message : String(cpuError);
          workerScope.postMessage({
            type: 'error',
            stage: 'initialization',
            message: reason,
          });
          throw cpuError;
        }
      }
    })();
    void initialization.catch(() => undefined);
    return;
  }
  if (message.type === 'stop') {
    detector?.close();
    detector = null;
    return;
  }
  if (message.type === 'frame') {
    const bitmap = message.bitmap;
    void (async () => {
      try {
        await initialization;
        if (!detector) throw new Error('Hand tracker is not initialized.');
        const startedAt = performance.now();
        const result = detector.detectForVideo(bitmap, message.timestampMs);
        const inferenceMs = performance.now() - startedAt;
        workerScope.postMessage({
          type: 'result',
          timestampMs: message.timestampMs,
          inferenceMs,
          hands: serializeResult(result),
        });
      } catch (error) {
        workerScope.postMessage({
          type: 'error',
          stage: 'frame',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        bitmap.close();
      }
    })();
  }
});
