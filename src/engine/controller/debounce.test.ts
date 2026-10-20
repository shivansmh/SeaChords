import { describe, expect, it } from 'vitest';
import { OctaveHysteresis, SeaChordsDebouncer, StabilityFilter } from './debounce';

describe('time-based gesture debounce', () => {
  it('waits for 60ms regardless of frame rate', () => {
    for (const cadence of [1000 / 30, 1000 / 60]) {
      const filter = new StabilityFilter(1, 60);
      let elapsed = 0;
      filter.update(2, elapsed);
      while (filter.value === 1) {
        elapsed += cadence;
        filter.update(2, elapsed);
      }
      expect(elapsed).toBeGreaterThanOrEqual(60);
      expect(elapsed).toBeLessThan(60 + cadence);
    }
  });

  it('resets a candidate when the raw value changes', () => {
    const filter = new StabilityFilter('stable', 100);
    expect(filter.update('new', 0)).toBe('stable');
    expect(filter.update('other', 80)).toBe('stable');
    expect(filter.update('other', 179)).toBe('stable');
    expect(filter.update('other', 180)).toBe('other');
  });

  it('preserves 4% hysteresis around the two-zone octave boundary', () => {
    const zones = new OctaveHysteresis(0.5, 0.04);
    expect(zones.update(0.49)).toBe(0);
    expect(zones.update(0.47)).toBe(1);
    expect(zones.update(0.51)).toBe(1);
    expect(zones.update(0.53)).toBe(0);
  });

  it('keeps the last hand state for the 300ms grace, then marks it absent', () => {
    const debouncer = new SeaChordsDebouncer();
    const both = {
      degree: 1,
      wristY: 0.5,
      richness: 1,
      leftPresent: true,
      rightPresent: true,
    };
    expect(debouncer.update(both, 0).handsPresent).toBe(true);
    const missing = { ...both, leftPresent: false };
    expect(debouncer.update(missing, 300).handsPresent).toBe(true);
    expect(debouncer.update(missing, 301).handsPresent).toBe(false);
  });
});
