"""
Voicing, octave placement, and note clamping for SeaChords.
Section 7.5 of the SOP.
"""
from typing import List
from .chords import ChordDefinition, get_diatonic_stack_intervals
from .scales import get_scale_offsets

def build_voiced_notes(
    chord_def: ChordDefinition,
    octave_zone: int = 0, # -1, 0, or +1
    tonic: int = 0,
    mode: str = "major",
    base_tonic_midi: int = 48
) -> List[int]:
    """
    Constructs the exact MIDI note numbers for a chord given the octave zone and base register.
    """
    if chord_def.level == 0 or not chord_def.relative_offsets:
        return []

    scale = get_scale_offsets(mode)
    degree_zero = chord_def.degree_zero

    # Base register: tonic sits at base_tonic_midi + tonic_pc; degree roots ascend from there
    tonic_midi = base_tonic_midi + (tonic % 12)
    base_root = tonic_midi + scale[degree_zero]

    # Octave zone adds -12, 0, or +12
    root = base_root + (octave_zone * 12)

    t1, t2, t3, t4 = get_diatonic_stack_intervals(degree_zero, mode)

    # Level 5: Wide spread voicing: [-12, 0, t2, t3, t1+12, t4+12]
    # If 9th is excluded, drop t4+12
    if chord_def.level == 5:
        spread_offsets = [-12, 0, t2, t3, t1 + 12]
        if not chord_def.is_avoid_note_fallback:
            spread_offsets.append(t4 + 12)
        notes = [root + off for off in spread_offsets]

    # Level 3 with avoid-note fallback: placed in the spread-leaning voicing from 7.5
    elif chord_def.level == 3 and chord_def.is_avoid_note_fallback:
        spread_offsets = [-12, 0, t2, t3, t1 + 12]
        notes = [root + off for off in spread_offsets]

    # Levels 1-4: root position, ascending, stacked in order
    else:
        notes = [root + off for off in chord_def.relative_offsets]

    # Clamp all notes to MIDI 21-108 by shifting the entire chord by octaves if needed
    notes = clamp_chord_to_range(notes, min_midi=21, max_midi=108)

    # Return sorted list of distinct notes
    return sorted(list(set(notes)))

def clamp_chord_to_range(notes: List[int], min_midi: int = 21, max_midi: int = 108) -> List[int]:
    """
    Shifts the entire chord by octaves (+12 or -12) until all notes fit within min_midi and max_midi.
    """
    if not notes:
        return []

    curr_notes = list(notes)
    # If any note is below min_midi, shift entire chord up by octaves
    while min(curr_notes) < min_midi:
        curr_notes = [n + 12 for n in curr_notes]

    # If any note is above max_midi, shift entire chord down by octaves
    while max(curr_notes) > max_midi:
        curr_notes = [n - 12 for n in curr_notes]

    return curr_notes
