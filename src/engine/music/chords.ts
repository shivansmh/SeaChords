import { getScaleOffsets, isPitchClassInScale, pitchClassToName, type Mode } from './scales';

export interface ChordDefinition {
  degree: number;
  degreeZero: number;
  level: number;
  rootPc: number;
  rootName: string;
  relativeOffsets: number[];
  chordName: string;
  isAvoidNoteFallback: boolean;
  susType: 'sus4' | 'sus2' | null;
}

export function getDiatonicStackIntervals(
  degreeZero: number,
  mode: Mode,
): [number, number, number, number] {
  const scale = getScaleOffsets(mode);
  const d = ((degreeZero % 7) + 7) % 7;
  const semitones = (index: number) => scale[index % 7]! + Math.floor(index / 7) * 12;
  const root = semitones(d);
  return [
    semitones(d + 2) - root,
    semitones(d + 4) - root,
    semitones(d + 6) - root,
    semitones(d + 8) - root,
  ];
}

export function getTriadName(root: string, third: number, fifth: number): string {
  if (third === 4 && fifth === 7) return root;
  if (third === 3 && fifth === 7) return `${root}m`;
  if (third === 3 && fifth === 6) return `${root}dim`;
  if (third === 4 && fifth === 8) return `${root}aug`;
  return `${root}(${third},${fifth})`;
}

export function getSeventhName(
  root: string,
  third: number,
  fifth: number,
  seventh: number,
): string {
  if (third === 4 && fifth === 7 && seventh === 11) return `${root}maj7`;
  if (third === 3 && fifth === 7 && seventh === 10) return `${root}m7`;
  if (third === 4 && fifth === 7 && seventh === 10) return `${root}7`;
  if (third === 3 && fifth === 6 && seventh === 10) return `${root}m7b5`;
  if (third === 3 && fifth === 6 && seventh === 9) return `${root}dim7`;
  return `${getTriadName(root, third, fifth)}7`;
}

function getNinthName(
  root: string,
  third: number,
  fifth: number,
  seventh: number,
  ninth: number,
): string {
  if (ninth === 14) {
    if (third === 4 && fifth === 7 && seventh === 11) return `${root}maj9`;
    if (third === 3 && fifth === 7 && seventh === 10) return `${root}m9`;
    if (third === 4 && fifth === 7 && seventh === 10) return `${root}9`;
  }
  return `${getSeventhName(root, third, fifth, seventh)}add9`;
}

export function constructChord(
  degree: number,
  level: number,
  tonic = 0,
  mode: Mode = 'major',
): ChordDefinition {
  if (!Number.isInteger(degree) || degree < 1 || degree > 7) {
    throw new RangeError(`Degree must be 1–7, got ${degree}`);
  }
  if (!Number.isInteger(level) || level < 0 || level > 5) {
    throw new RangeError(`Richness must be 0–5, got ${level}`);
  }
  const degreeZero = degree - 1;
  const scale = getScaleOffsets(mode);
  const rootPc = ((tonic + scale[degreeZero]!) % 12 + 12) % 12;
  const rootName = pitchClassToName(rootPc);
  const base = {
    degree,
    degreeZero,
    level,
    rootPc,
    rootName,
    isAvoidNoteFallback: false,
    susType: null,
  } satisfies Omit<ChordDefinition, 'relativeOffsets' | 'chordName'>;

  if (level === 0) return { ...base, relativeOffsets: [], chordName: 'MUTED' };
  const [third, fifth, seventh, ninth] = getDiatonicStackIntervals(degreeZero, mode);

  if (level === 1) {
    return { ...base, relativeOffsets: [0, third, fifth], chordName: getTriadName(rootName, third, fifth) };
  }
  if (level === 2) {
    return { ...base, relativeOffsets: [0, third, fifth, seventh], chordName: getSeventhName(rootName, third, fifth, seventh) };
  }
  if (level === 3) {
    const avoid = ninth === 13;
    return {
      ...base,
      relativeOffsets: avoid ? [0, third, fifth, seventh] : [0, third, fifth, seventh, ninth],
      chordName: avoid
        ? getSeventhName(rootName, third, fifth, seventh)
        : getNinthName(rootName, third, fifth, seventh, ninth),
      isAvoidNoteFallback: avoid,
    };
  }
  if (level === 4) {
    const fifthPc = (rootPc + fifth) % 12;
    if (isPitchClassInScale(rootPc + 5, tonic, mode) && isPitchClassInScale(fifthPc, tonic, mode)) {
      return {
        ...base,
        relativeOffsets: [0, 5, fifth],
        chordName: `${rootName}sus4`,
        susType: 'sus4',
      };
    }
    if (isPitchClassInScale(rootPc + 2, tonic, mode) && isPitchClassInScale(fifthPc, tonic, mode)) {
      return {
        ...base,
        relativeOffsets: [0, 2, fifth],
        chordName: `${rootName}sus2`,
        susType: 'sus2',
      };
    }
    return { ...base, relativeOffsets: [0, third, fifth], chordName: getTriadName(rootName, third, fifth) };
  }

  const avoid = ninth === 13;
  const seventhName = getSeventhName(rootName, third, fifth, seventh);
  const ninthName = getNinthName(rootName, third, fifth, seventh, ninth);
  return {
    ...base,
    relativeOffsets: avoid ? [0, third, fifth, seventh] : [0, third, fifth, seventh, ninth],
    chordName: `${avoid ? seventhName : ninthName} (spread)`,
    isAvoidNoteFallback: avoid,
  };
}
