"""
Diatonic chord construction and avoid-note rules for SeaChords.
Sections 7.2, 7.3, 7.4.
"""
from dataclasses import dataclass
from typing import List, Tuple, Optional
from .scales import get_scale_offsets, is_pitch_class_in_scale, pitch_class_to_name

@dataclass
class ChordDefinition:
    degree: int                      # 1-indexed degree (1-7)
    degree_zero: int                 # 0-indexed degree (0-6)
    level: int                       # Richness level (0-5)
    root_pc: int                     # Pitch class of the root (0-11)
    root_name: str                   # E.g. "C", "D", etc.
    relative_offsets: List[int]      # Semitones relative to root
    chord_name: str                  # Display name, e.g. "Cmaj7", "Dm", "Bdim"
    is_avoid_note_fallback: bool = False
    sus_type: Optional[str] = None   # "sus4", "sus2", or None

def get_diatonic_stack_intervals(degree_zero: int, mode: str = "major") -> Tuple[int, int, int, int]:
    """
    Returns (t1, t2, t3, t4) as semitone offsets of 3rd, 5th, 7th, 9th above chord root.
    """
    scale = get_scale_offsets(mode)
    d = degree_zero % 7

    def scale_semitones(idx: int) -> int:
        return scale[idx % 7] + (idx // 7) * 12

    root_semi = scale_semitones(d)
    t1 = scale_semitones(d + 2) - root_semi
    t2 = scale_semitones(d + 4) - root_semi
    t3 = scale_semitones(d + 6) - root_semi
    t4 = scale_semitones(d + 8) - root_semi
    return t1, t2, t3, t4

def get_triad_name(root_name: str, t1: int, t2: int) -> str:
    if t1 == 4 and t2 == 7:
        return root_name
    elif t1 == 3 and t2 == 7:
        return f"{root_name}m"
    elif t1 == 3 and t2 == 6:
        return f"{root_name}dim"
    elif t1 == 4 and t2 == 8:
        return f"{root_name}aug"
    return f"{root_name}({t1},{t2})"

def get_seventh_name(root_name: str, t1: int, t2: int, t3: int) -> str:
    if t1 == 4 and t2 == 7 and t3 == 11:
        return f"{root_name}maj7"
    elif t1 == 3 and t2 == 7 and t3 == 10:
        return f"{root_name}m7"
    elif t1 == 4 and t2 == 7 and t3 == 10:
        return f"{root_name}7"
    elif t1 == 3 and t2 == 6 and t3 == 10:
        return f"{root_name}m7b5"
    elif t1 == 3 and t2 == 6 and t3 == 9:
        return f"{root_name}dim7"
    return f"{get_triad_name(root_name, t1, t2)}7"

def get_ninth_name(root_name: str, t1: int, t2: int, t3: int, t4: int) -> str:
    if t4 == 14:
        if t1 == 4 and t2 == 7 and t3 == 11:
            return f"{root_name}maj9"
        elif t1 == 3 and t2 == 7 and t3 == 10:
            return f"{root_name}m9"
        elif t1 == 4 and t2 == 7 and t3 == 10:
            return f"{root_name}9"
    return f"{get_seventh_name(root_name, t1, t2, t3)}add9"

def construct_chord(degree: int, level: int, tonic: int = 0, mode: str = "major") -> ChordDefinition:
    """
    Constructs a diatonic chord for the given scale degree (1-7) and richness level (0-5).
    """
    if degree < 1 or degree > 7:
        raise ValueError(f"Degree must be 1-7, got {degree}")
    if level < 0 or level > 5:
        raise ValueError(f"Level must be 0-5, got {level}")

    degree_zero = degree - 1
    scale = get_scale_offsets(mode)
    root_pc = (tonic + scale[degree_zero]) % 12
    root_name = pitch_class_to_name(root_pc)

    if level == 0:
        return ChordDefinition(
            degree=degree,
            degree_zero=degree_zero,
            level=0,
            root_pc=root_pc,
            root_name=root_name,
            relative_offsets=[],
            chord_name="MUTED"
        )

    t1, t2, t3, t4 = get_diatonic_stack_intervals(degree_zero, mode)

    # Level 1: Triad
    if level == 1:
        triad_name = get_triad_name(root_name, t1, t2)
        return ChordDefinition(
            degree=degree,
            degree_zero=degree_zero,
            level=1,
            root_pc=root_pc,
            root_name=root_name,
            relative_offsets=[0, t1, t2],
            chord_name=triad_name
        )

    # Level 2: 7th
    if level == 2:
        seventh_name = get_seventh_name(root_name, t1, t2, t3)
        return ChordDefinition(
            degree=degree,
            degree_zero=degree_zero,
            level=2,
            root_pc=root_pc,
            root_name=root_name,
            relative_offsets=[0, t1, t2, t3],
            chord_name=seventh_name
        )

    # Level 3: 9th (with avoid-note rule)
    if level == 3:
        # Check flat-9 (interval 13 semitones above root)
        if t4 == 13:
            # Avoid-note fallback: falls back to 7th chord notes, voiced spread-leaning
            seventh_name = get_seventh_name(root_name, t1, t2, t3)
            return ChordDefinition(
                degree=degree,
                degree_zero=degree_zero,
                level=3,
                root_pc=root_pc,
                root_name=root_name,
                relative_offsets=[0, t1, t2, t3],
                chord_name=seventh_name,
                is_avoid_note_fallback=True
            )
        else:
            ninth_name = get_ninth_name(root_name, t1, t2, t3, t4)
            return ChordDefinition(
                degree=degree,
                degree_zero=degree_zero,
                level=3,
                root_pc=root_pc,
                root_name=root_name,
                relative_offsets=[0, t1, t2, t3, t4],
                chord_name=ninth_name,
                is_avoid_note_fallback=False
            )

    # Level 4: Suspended (sus4 or sus2, else triad fallback)
    if level == 4:
        # Try sus4: root, root+5, chord's own fifth (t2)
        pc_sus4 = (root_pc + 5) % 12
        pc_fifth = (root_pc + t2) % 12
        if is_pitch_class_in_scale(pc_sus4, tonic, mode) and is_pitch_class_in_scale(pc_fifth, tonic, mode):
            return ChordDefinition(
                degree=degree,
                degree_zero=degree_zero,
                level=4,
                root_pc=root_pc,
                root_name=root_name,
                relative_offsets=[0, 5, t2],
                chord_name=f"{root_name}sus4",
                sus_type="sus4"
            )

        # Try sus2: root, root+2, chord's own fifth (t2)
        pc_sus2 = (root_pc + 2) % 12
        if is_pitch_class_in_scale(pc_sus2, tonic, mode) and is_pitch_class_in_scale(pc_fifth, tonic, mode):
            return ChordDefinition(
                degree=degree,
                degree_zero=degree_zero,
                level=4,
                root_pc=root_pc,
                root_name=root_name,
                relative_offsets=[0, 2, t2],
                chord_name=f"{root_name}sus2",
                sus_type="sus2"
            )

        # Triad fallback
        triad_name = get_triad_name(root_name, t1, t2)
        return ChordDefinition(
            degree=degree,
            degree_zero=degree_zero,
            level=4,
            root_pc=root_pc,
            root_name=root_name,
            relative_offsets=[0, t1, t2],
            chord_name=triad_name,
            sus_type=None
        )

    # Level 5: Wide spread voicing
    if level == 5:
        # Check if 9th is excluded by flat-9
        ninth_excluded = (t4 == 13)
        base_name = get_ninth_name(root_name, t1, t2, t3, t4) if not ninth_excluded else get_seventh_name(root_name, t1, t2, t3)
        return ChordDefinition(
            degree=degree,
            degree_zero=degree_zero,
            level=5,
            root_pc=root_pc,
            root_name=root_name,
            relative_offsets=[0, t1, t2, t3] if ninth_excluded else [0, t1, t2, t3, t4],
            chord_name=f"{base_name} (spread)",
            is_avoid_note_fallback=ninth_excluded
        )

    return ChordDefinition(degree, degree_zero, level, root_pc, root_name, [], "MUTED")
