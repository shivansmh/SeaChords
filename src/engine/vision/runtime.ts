import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from '../gesture/fingerCount';
import type { DetectedHand, MediaPipeHandLabel } from './handTracker';

export interface TrackingResult {
  readonly hands: DetectedHand[];
  readonly timestampMs: number;
  readonly inferenceMs: number;
}

export interface TrackerProgress {
  readonly progress: number;
  readonly message: string;
}

interface WorkerReadyMessage {
  readonly type: 'ready';
  readonly delegate: 'GPU' | 'CPU';
  readonly gpuFallback?: string;
}

interface WorkerResultMessage extends TrackingResult {
  readonly type: 'result';
}

type WorkerResponse = WorkerReadyMessage
  | WorkerResultMessage
  | { readonly type: 'error'; readonly stage: 'initialization' | 'frame'; readonly message: string };

function localVisionAssets(): { modelUrl: string; wasmRoot: string } {
  const base = typeof document === 'undefined' ? import.meta.url : document.baseURI;
  return {
    modelUrl: new URL('mediapipe/hand_landmarker.task', base).toString(),
    wasmRoot: new URL('mediapipe/wasm/', base).toString(),
  };
}

async function downloadModel(modelUrl: string, onProgress: (state: TrackerProgress) => void): Promise<Uint8Array> {
  onProgress({ progress: 0.06, message: 'Connecting to the local hand model…' });
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`Model request failed (${response.status}).`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onProgress({ progress: 0.48, message: 'Hand model downloaded.' });
    return new Uint8Array(buffer);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    const percent = total > 0 ? received / total : Math.min(0.85, received / 9_000_000);
    onProgress({
      progress: 0.06 + Math.min(percent, 1) * 0.42,
      message: total > 0
        ? `Loading hand model… ${Math.round(percent * 100)}%`
        : 'Loading hand model…',
    });
  }
  const model = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    model.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress({ progress: 0.5, message: 'Hand model ready.' });
  return model;
}

export class HandTrackerRuntime {
  private worker: Worker | null = null;
  private mainDetector: HandLandmarker | null = null;
  private model: Uint8Array | null = null;
  private pendingReady: { resolve: (message: WorkerReadyMessage) => void; reject: (error: Error) => void } | null = null;
  private initialized = false;
  private modelUrl = '';
  private wasmRoot = '';

  constructor(
    private readonly callbacks: {
      onProgress: (progress: TrackerProgress) => void;
      onDelegate: (delegate: 'GPU' | 'CPU', worker: boolean, gpuFallback?: string) => void;
      onResult: (result: TrackingResult) => void;
      onError: (message: string) => void;
    },
  ) {}

  async initialize(): Promise<void> {
    const assets = localVisionAssets();
    this.modelUrl = assets.modelUrl;
    this.wasmRoot = assets.wasmRoot;
    this.model = await downloadModel(this.modelUrl, this.callbacks.onProgress);
    this.callbacks.onProgress({ progress: 0.58, message: 'Preparing local vision runtime…' });

    try {
      const delegate = await this.initializeWorker();
      this.callbacks.onDelegate(delegate.delegate, true, delegate.gpuFallback);
    } catch (workerError) {
      this.worker?.terminate();
      this.worker = null;
      this.callbacks.onProgress({ progress: 0.68, message: 'Starting compatible CPU vision runtime…' });
      const delegate = await this.initializeMainThread();
      this.callbacks.onDelegate(delegate, false,
        workerError instanceof Error ? workerError.message : String(workerError));
    }
    this.initialized = true;
    this.callbacks.onProgress({ progress: 1, message: 'Hand tracking ready.' });
  }

  submit(bitmap: ImageBitmap, timestampMs: number): void {
    if (!this.initialized) {
      bitmap.close();
      return;
    }
    if (this.worker) {
      this.worker.postMessage({ type: 'frame', bitmap, timestampMs }, [bitmap]);
      return;
    }
    if (!this.mainDetector) {
      bitmap.close();
      this.callbacks.onError('Hand tracker is not ready.');
      return;
    }
    try {
      const startedAt = performance.now();
      const result = this.mainDetector.detectForVideo(bitmap, timestampMs);
      const inferenceMs = performance.now() - startedAt;
      this.callbacks.onResult({
        hands: result.landmarks.map((landmarks, index) => {
          const categoryName = result.handedness[index]?.[0]?.categoryName;
          const label: MediaPipeHandLabel = categoryName === 'Left' || categoryName === 'Right'
            ? categoryName
            : 'Unknown';
          const points: Landmark[] = landmarks.map(({ x, y, z }) => ({ x, y, z }));
          return { label, landmarks: points };
        }),
        timestampMs,
        inferenceMs,
      });
    } catch (error) {
      this.callbacks.onError(error instanceof Error ? error.message : String(error));
    } finally {
      bitmap.close();
    }
  }

  stop(): void {
    this.worker?.postMessage({ type: 'stop' });
    this.worker?.terminate();
    this.worker = null;
    this.mainDetector?.close();
    this.mainDetector = null;
    this.model = null;
    this.initialized = false;
  }

  private initializeWorker(): Promise<WorkerReadyMessage> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(new URL('./hand.worker.ts', import.meta.url), {
          type: 'module',
          name: 'seachords-hand-tracker',
        });
        this.worker = worker;
        this.pendingReady = { resolve, reject };
        worker.onerror = (event) => {
          const error = new Error(event.message || 'Vision worker failed.');
          if (this.pendingReady) {
            this.pendingReady.reject(error);
            this.pendingReady = null;
          } else {
            this.callbacks.onError(error.message);
          }
        };
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const message = event.data;
          if (message.type === 'ready') {
            this.pendingReady?.resolve(message);
            this.pendingReady = null;
          } else if (message.type === 'result') {
            this.callbacks.onResult(message);
          } else if (message.type === 'error') {
            if (message.stage === 'initialization') {
              this.pendingReady?.reject(new Error(message.message));
              this.pendingReady = null;
            } else {
              this.callbacks.onError(message.message);
            }
          }
        };
        const modelCopy = this.model!.slice().buffer;
        worker.postMessage({
          type: 'init',
          wasmRoot: this.wasmRoot,
          modelBuffer: modelCopy,
          minDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        }, [modelCopy]);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async initializeMainThread(): Promise<'GPU' | 'CPU'> {
    if (!this.model) throw new Error('The local hand model has not loaded.');
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(this.wasmRoot);
    try {
      this.mainDetector = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: this.model, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      return 'GPU';
    } catch {
      this.mainDetector = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: this.model, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      return 'CPU';
    }
  }
}
