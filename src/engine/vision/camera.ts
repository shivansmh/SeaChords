import { APP_CONFIG } from '../../config';
import { classifyHand, type ClassifiedHand } from '../gesture/classify';
import type { Landmark } from '../gesture/fingerCount';
import { assignHandRoles, type AssignedHands } from './handTracker';
import { HandTrackerRuntime, type TrackerProgress, type TrackingResult } from './runtime';

export interface CameraFrameState {
  readonly leftHand: ClassifiedHand | null;
  readonly rightHand: ClassifiedHand | null;
  readonly timestampMs: number;
  readonly inferenceMs: number;
  readonly cameraFps: number;
  readonly droppedFrames: number;
  readonly assigned: AssignedHands;
}

export interface CameraCallbacks {
  readonly onStatus: (
    status: 'loading' | 'running' | 'error' | 'stopped',
    message?: string,
  ) => void;
  readonly onProgress: (progress: TrackerProgress) => void;
  readonly onDelegate: (delegate: 'GPU' | 'CPU', worker: boolean) => void;
  readonly onFrame: (state: CameraFrameState) => void;
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

export class SeaChordsCamera {
  private stream: MediaStream | null = null;
  private video: VideoWithFrameCallback | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private tracker: HandTrackerRuntime | null = null;
  private running = false;
  private busy = false;
  private videoFrameCallbackId: number | null = null;
  private animationFrameId: number | null = null;
  private droppedFrames = 0;
  private frameWindowStartedAt = 0;
  private framesInWindow = 0;
  private lastVideoTime = -1;
  private cameraFps = 0;
  private swapHands = false;
  private zoneHigh: number = APP_CONFIG.octave.zoneHigh;
  private zoneLow: number = APP_CONFIG.octave.zoneLow;
  private callbacks: CameraCallbacks;

  constructor(callbacks: CameraCallbacks) {
    this.callbacks = callbacks;
  }

  setSwapHands(swap: boolean): void {
    this.swapHands = swap;
  }

  setZones(high: number, low: number): void {
    this.zoneHigh = Math.max(0.15, Math.min(high, low - 0.1));
    this.zoneLow = Math.min(0.85, Math.max(low, high + 0.1));
  }

  async start(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<void> {
    if (this.running) return;
    if (
      !window.isSecureContext &&
      !['localhost', '127.0.0.1'].includes(location.hostname)
    ) {
      throw new Error(
        'Camera access requires HTTPS. Open SeaChords on a secure site or localhost.',
      );
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        'This browser cannot access a camera. Try an up-to-date Chrome or Edge browser.',
      );
    }
    if (typeof createImageBitmap === 'undefined') {
      throw new Error(
        'This browser is missing image processing features required for hand tracking.',
      );
    }

    this.video = video as VideoWithFrameCallback;
    this.canvas = canvas;
    video.muted = true;
    video.playsInline = true;
    this.callbacks.onStatus('loading', 'Requesting camera permission…');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: APP_CONFIG.camera.width, max: APP_CONFIG.camera.width },
          height: { ideal: APP_CONFIG.camera.height, max: APP_CONFIG.camera.height },
          frameRate: {
            ideal: APP_CONFIG.camera.frameRate,
            max: APP_CONFIG.camera.frameRate,
          },
        },
      });
    } catch (error) {
      throw new Error(this.cameraErrorMessage(error), { cause: error });
    }
    video.srcObject = this.stream;
    try {
      await video.play();
    } catch (error) {
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      video.srcObject = null;
      throw new Error(
        'The camera preview could not start. Check browser playback permissions and try again.',
        { cause: error },
      );
    }

    this.tracker = new HandTrackerRuntime({
      onProgress: (progress) => this.callbacks.onProgress(progress),
      onDelegate: (delegate, worker) => this.callbacks.onDelegate(delegate, worker),
      onResult: (result) => this.handleResult(result),
      onError: (message) => {
        this.busy = false;
        this.stop();
        this.callbacks.onStatus('error', `Hand tracking stopped: ${message}`);
      },
    });
    this.callbacks.onStatus('loading', 'Loading the hand model…');
    try {
      await this.tracker.initialize();
    } catch (error) {
      this.stop();
      throw new Error(
        `The local hand model could not start. ${error instanceof Error ? error.message : ''}`.trim(),
        { cause: error },
      );
    }

    this.running = true;
    this.frameWindowStartedAt = performance.now();
    this.framesInWindow = 0;
    this.lastVideoTime = -1;
    this.callbacks.onStatus(
      'running',
      'Camera and hand tracking are ready. Video stays on this device.',
    );
    this.scheduleNextFrame();
  }

  stop(): void {
    this.running = false;
    if (this.videoFrameCallbackId !== null) {
      this.video?.cancelVideoFrameCallback?.(this.videoFrameCallbackId);
      this.videoFrameCallbackId = null;
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.tracker?.stop();
    this.tracker = null;
    this.busy = false;
    const context = this.canvas?.getContext('2d');
    if (context && this.canvas)
      context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.callbacks.onStatus('stopped');
  }

  private scheduleNextFrame(): void {
    if (!this.running || !this.video) return;
    if (this.video.requestVideoFrameCallback) {
      this.videoFrameCallbackId = this.video.requestVideoFrameCallback((now) => {
        this.videoFrameCallbackId = null;
        this.onVideoFrame(now);
        this.scheduleNextFrame();
      });
    } else {
      this.animationFrameId = requestAnimationFrame((now) => {
        this.animationFrameId = null;
        this.onVideoFrame(now);
        this.scheduleNextFrame();
      });
    }
  }

  private onVideoFrame(now: number): void {
    const video = this.video;
    if (!this.running || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
      return;
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    this.framesInWindow += 1;
    const elapsed = now - this.frameWindowStartedAt;
    if (elapsed >= 500) {
      this.cameraFps = (this.framesInWindow * 1000) / elapsed;
      this.framesInWindow = 0;
      this.frameWindowStartedAt = now;
    }
    if (this.busy) {
      this.droppedFrames += 1;
      return;
    }
    this.busy = true;
    void createImageBitmap(video)
      .then((bitmap) => {
        if (!this.running) {
          bitmap.close();
          this.busy = false;
          return;
        }
        this.tracker?.submit(bitmap, now);
      })
      .catch((error: unknown) => {
        this.busy = false;
        this.stop();
        this.callbacks.onStatus(
          'error',
          `Could not prepare a camera frame: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  private handleResult(result: TrackingResult): void {
    this.busy = false;
    if (!this.running) return;
    const assigned = assignHandRoles(result.hands, false, this.swapHands);
    const leftHand = assigned.left ? classifyHand(assigned.left.landmarks, 'left') : null;
    const rightHand = assigned.right
      ? classifyHand(assigned.right.landmarks, 'right')
      : null;
    this.drawOverlay(assigned);
    this.callbacks.onFrame({
      leftHand: leftHand?.valid ? leftHand : null,
      rightHand: rightHand?.valid ? rightHand : null,
      timestampMs: result.timestampMs,
      inferenceMs: result.inferenceMs,
      cameraFps: this.cameraFps,
      droppedFrames: this.droppedFrames,
      assigned,
    });
  }

  private drawOverlay(hands: AssignedHands): void {
    const canvas = this.canvas;
    const video = this.video;
    if (!canvas || !video || !video.videoWidth || !video.videoHeight) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.save();
    context.strokeStyle = 'rgba(48, 210, 255, 0.75)';
    context.lineWidth = Math.max(2, width / 320);
    context.setLineDash([8, 7]);
    for (const boundary of [this.zoneHigh, this.zoneLow]) {
      const y = boundary * height;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.setLineDash([]);
    this.drawHand(context, hands.left?.landmarks ?? [], '#28d7ff');
    this.drawHand(context, hands.right?.landmarks ?? [], '#d98cff');
    context.restore();
  }

  private drawHand(
    context: CanvasRenderingContext2D,
    landmarks: readonly Landmark[],
    color: string,
  ): void {
    if (landmarks.length < 21 || !this.canvas) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = Math.max(2, width / 360);
    for (const [from, to] of HAND_CONNECTIONS) {
      const a = landmarks[from]!;
      const b = landmarks[to]!;
      context.beginPath();
      context.moveTo(a.x * width, a.y * height);
      context.lineTo(b.x * width, b.y * height);
      context.stroke();
    }
    for (const landmark of landmarks) {
      context.beginPath();
      context.arc(
        landmark.x * width,
        landmark.y * height,
        Math.max(2, width / 180),
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }

  private cameraErrorMessage(error: unknown): string {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Camera permission was denied. Allow camera access in your browser settings, then try again.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No camera was found. Connect a camera or use the keyboard controls.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'The camera is busy in another app. Close that app and try again.';
    }
    return error instanceof Error
      ? `Camera could not start: ${error.message}`
      : 'Camera could not start.';
  }
}
