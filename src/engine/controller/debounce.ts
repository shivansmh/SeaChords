import { APP_CONFIG } from '../../config';

export class OctaveHysteresis {
  private zone = 0;

  constructor(
    private readonly zoneBoundary: number = APP_CONFIG.octave.zoneBoundary,
    deadband: number = APP_CONFIG.octave.deadband,
  ) {
    this.halfDeadband = deadband / 2;
  }

  private readonly halfDeadband: number;

  get currentZone(): number {
    return this.zone;
  }

  update(wristY: number): number {
    if (this.zone === 0) {
      if (wristY < this.zoneBoundary - this.halfDeadband) this.zone = 1;
    } else if (this.zone === 1 && wristY > this.zoneBoundary + this.halfDeadband) {
      this.zone = 0;
    }
    return this.zone;
  }
}

export class StabilityFilter<T> {
  private candidate: T;
  private candidateSince: number;
  private committed: T;

  constructor(
    initialValue: T,
    private readonly stableMs: number = APP_CONFIG.debounce.stableMs,
  ) {
    this.committed = initialValue;
    this.candidate = initialValue;
    this.candidateSince = 0;
  }

  get value(): T {
    return this.committed;
  }

  update(value: T, nowMs: number): T {
    if (Object.is(value, this.committed)) {
      this.candidate = value;
      this.candidateSince = nowMs;
      return this.committed;
    }
    if (!Object.is(value, this.candidate)) {
      this.candidate = value;
      this.candidateSince = nowMs;
    } else if (nowMs - this.candidateSince >= this.stableMs) {
      this.committed = value;
      this.candidateSince = nowMs;
    }
    return this.committed;
  }
}

export interface RawGestureState {
  readonly degree: number;
  readonly wristY: number | null;
  readonly richness: number;
  readonly leftPresent: boolean;
  readonly rightPresent: boolean;
}

export interface CommittedGestureState {
  readonly degree: number;
  readonly octaveZone: number;
  readonly richness: number;
  readonly handsPresent: boolean;
}

export class SeaChordsDebouncer {
  private octave: OctaveHysteresis;
  private readonly degreeFilter = new StabilityFilter(1);
  private readonly octaveFilter = new StabilityFilter(0);
  private readonly richnessFilter = new StabilityFilter(0);
  private lastBothHandsAt = Number.NEGATIVE_INFINITY;

  constructor(zoneBoundary: number = APP_CONFIG.octave.zoneBoundary) {
    this.octave = new OctaveHysteresis(zoneBoundary);
  }

  setZone(zoneBoundary: number): void {
    this.octave = new OctaveHysteresis(zoneBoundary);
  }

  update(raw: RawGestureState, nowMs: number): CommittedGestureState {
    const both = raw.leftPresent && raw.rightPresent;
    if (both) this.lastBothHandsAt = nowMs;
    const handsPresent =
      both || nowMs - this.lastBothHandsAt <= APP_CONFIG.debounce.handLostGraceMs;
    const rawZone =
      raw.wristY === null ? this.octave.currentZone : this.octave.update(raw.wristY);
    return {
      degree: this.degreeFilter.update(raw.degree, nowMs),
      octaveZone: this.octaveFilter.update(rawZone, nowMs),
      richness: this.richnessFilter.update(raw.richness, nowMs),
      handsPresent,
    };
  }
}
