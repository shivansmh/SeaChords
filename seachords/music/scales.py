"""
Scale definitions and tonic handling for SeaChords.
Section 7.1: Major and natural minor scale offsets and diatonic pitch class membership.
"""
from typing import Set, List

SCALE_OFFSETS = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "natural_minor": [0, 2, 3, 5, 7, 8, 10],
    "minor": [0, 2, 3, 5, 7, 8, 10]
}

PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
NOTE_NAMES = PITCH_CLASS_NAMES

def get_scale_offsets(mode: str) -> List[int]:
    normalized_mode = mode.lower().strip()
    if normalized_mode not in SCALE_OFFSETS:
        raise ValueError(f"Unsupported mode: '{mode}'. Must be 'major' or 'natural_minor'.")
    return SCALE_OFFSETS[normalized_mode]

def get_scale_pitch_classes(tonic: int, mode: str) -> Set[int]:
    """Returns the set of 7 pitch classes (0-11) belonging to the key."""
    offsets = get_scale_offsets(mode)
    return {(tonic + offset) % 12 for offset in offsets}

def is_pitch_class_in_scale(pc: int, tonic: int, mode: str) -> bool:
    """Checks whether pitch class pc (0-11) is diatonic to the scale."""
    return (pc % 12) in get_scale_pitch_classes(tonic, mode)

def pitch_class_to_name(pc: int) -> str:
    return PITCH_CLASS_NAMES[pc % 12]
