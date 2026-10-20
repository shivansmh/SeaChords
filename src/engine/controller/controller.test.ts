import { describe, expect, it } from 'vitest';
import { SeaChordsController } from './controller';

describe('controller musical events', () => {
  it('plays on state changes, mutes, restrikes, and retriggers octave changes', () => {
    const controller = new SeaChordsController(0, 'major');
    expect(
      controller.step({ degree: 1, octaveZone: 0, richness: 0, handsPresent: false }, 0),
    ).toEqual([]);
    const first = controller.step(
      { degree: 1, octaveZone: 0, richness: 1, handsPresent: true },
      1,
    );
    expect(first[0]).toMatchObject({ type: 'play', notes: [48, 52, 55] });
    expect(
      controller.step({ degree: 1, octaveZone: 0, richness: 1, handsPresent: true }, 2),
    ).toEqual([]);
    expect(
      controller.step(
        { degree: 2, octaveZone: 0, richness: 1, handsPresent: true },
        3,
      )[0],
    ).toMatchObject({ type: 'play', notes: [50, 53, 57] });
    expect(
      controller.step({ degree: 2, octaveZone: 0, richness: 0, handsPresent: true }, 4)[0]
        ?.type,
    ).toBe('stop');
    expect(
      controller.step({ degree: 2, octaveZone: 0, richness: 1, handsPresent: true }, 5)[0]
        ?.type,
    ).toBe('play');
    expect(
      controller.step(
        { degree: 2, octaveZone: 1, richness: 1, handsPresent: true },
        6,
      )[0],
    ).toMatchObject({ type: 'play', notes: [62, 65, 69] });
    expect(
      controller.step(
        { degree: 2, octaveZone: 1, richness: 1, handsPresent: false },
        7,
      )[0]?.type,
    ).toBe('stop');
  });

  it('panics before changing key and retriggers when both hands remain active', () => {
    const controller = new SeaChordsController(0, 'major');
    controller.step({ degree: 1, octaveZone: 0, richness: 1, handsPresent: true }, 1);
    expect(controller.setKey(2, 'major', 2).map((action) => action.type)).toEqual([
      'panic',
      'play',
    ]);
    expect(controller.key).toEqual({ tonic: 2, mode: 'major' });
    expect(controller.panic(3)[0]?.type).toBe('panic');
  });
});
