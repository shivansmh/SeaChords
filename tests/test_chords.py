"""
Unit tests for SeaChords music theory engine.
Validates Section 7.2, 7.3, 7.4, 7.5 and Section 15 acceptance criteria.
"""
import pytest
from seachords.music.scales import get_scale_pitch_classes, is_pitch_class_in_scale
from seachords.music.chords import (
    construct_chord,
    get_diatonic_stack_intervals
)
from seachords.music.voicing import build_voiced_notes, clamp_chord_to_range

def test_c_major_table_7_2():
    # Table 7.2 Triads and 7ths for C major
    expected_triads = {
        1: "C",
        2: "Dm",
        3: "Em",
        4: "F",
        5: "G",
        6: "Am",
        7: "Bdim"
    }
    expected_7ths = {
        1: "Cmaj7",
        2: "Dm7",
        3: "Em7",
        4: "Fmaj7",
        5: "G7",
        6: "Am7",
        7: "Bm7b5"
    }

    for degree in range(1, 8):
        c_triad = construct_chord(degree=degree, level=1, tonic=0, mode="major")
        assert c_triad.chord_name == expected_triads[degree], f"Degree {degree} triad mismatch"

        c_7th = construct_chord(degree=degree, level=2, tonic=0, mode="major")
        assert c_7th.chord_name == expected_7ths[degree], f"Degree {degree} 7th mismatch"

def test_a_natural_minor_table_7_2():
    # Table 7.2 Triads and 7ths for A natural minor (tonic=9)
    expected_triads = {
        1: "Am",
        2: "Bdim",
        3: "C",
        4: "F" if False else "Dm", # 4 in A minor is Dm
        5: "Em",
        6: "F",
        7: "G"
    }
    expected_7ths = {
        1: "Am7",
        2: "Bm7b5",
        3: "Cmaj7",
        4: "Dm7",
        5: "Em7",
        6: "Fmaj7",
        7: "G7"
    }

    for degree in range(1, 8):
        c_triad = construct_chord(degree=degree, level=1, tonic=9, mode="natural_minor")
        assert c_triad.chord_name == expected_triads[degree], f"A minor degree {degree} triad mismatch"

        c_7th = construct_chord(degree=degree, level=2, tonic=9, mode="natural_minor")
        assert c_7th.chord_name == expected_7ths[degree], f"A minor degree {degree} 7th mismatch"

def test_avoid_note_rule_7_3():
    # C major: flat-9 degrees are 3 (Em) and 7 (Bdim)
    for degree in range(1, 8):
        c_9th = construct_chord(degree=degree, level=3, tonic=0, mode="major")
        if degree in (3, 7):
            assert c_9th.is_avoid_note_fallback is True, f"C major degree {degree} should be flat-9 avoid"
            assert len(c_9th.relative_offsets) == 4 # Falls back to 7th chord notes
        else:
            assert c_9th.is_avoid_note_fallback is False, f"C major degree {degree} should NOT be flat-9 avoid"
            assert len(c_9th.relative_offsets) == 5

    # A natural minor: flat-9 degrees are 2 (Bdim) and 5 (Em)
    for degree in range(1, 8):
        a_9th = construct_chord(degree=degree, level=3, tonic=9, mode="natural_minor")
        if degree in (2, 5):
            assert a_9th.is_avoid_note_fallback is True, f"A minor degree {degree} should be flat-9 avoid"
            assert len(a_9th.relative_offsets) == 4
        else:
            assert a_9th.is_avoid_note_fallback is False, f"A minor degree {degree} should NOT be flat-9 avoid"
            assert len(a_9th.relative_offsets) == 5

def test_sus_rule_7_4():
    # In C major:
    # Degree 1 (C): sus4 is C F G (F=5, G=7 are both in C major) -> Csus4
    c1 = construct_chord(degree=1, level=4, tonic=0, mode="major")
    assert c1.chord_name == "Csus4"
    assert c1.sus_type == "sus4"

    # Degree 4 (F): sus4 would need Bb (pc 10) which is NOT in C major.
    # sus2 needs G (pc 7) and C (pc 0), which ARE in C major -> Fsus2
    c4 = construct_chord(degree=4, level=4, tonic=0, mode="major")
    assert c4.chord_name == "Fsus2"
    assert c4.sus_type == "sus2"
    assert c4.relative_offsets == [0, 2, 7] # F, G, C

def test_all_notes_in_scale_acceptance_criterion_1():
    # Acceptance criterion 1: In any selectable key and mode, no produced note falls outside the scale
    for tonic in range(12):
        for mode in ["major", "natural_minor"]:
            scale_pcs = get_scale_pitch_classes(tonic, mode)
            for degree in range(1, 8):
                for level in range(1, 6):
                    chord_def = construct_chord(degree=degree, level=level, tonic=tonic, mode=mode)
                    for oct_zone in (-1, 0, 1):
                        notes = build_voiced_notes(chord_def, octave_zone=oct_zone, tonic=tonic, mode=mode)
                        for n in notes:
                            pc = n % 12
                            assert pc in scale_pcs, f"Note {n} (pc {pc}) not in scale for tonic={tonic}, mode={mode}, degree={degree}, level={level}"

def test_voicing_and_clamp_7_5():
    # Test octave shift
    c_chord = construct_chord(degree=1, level=1, tonic=0, mode="major") # C E G
    notes_mid = build_voiced_notes(c_chord, octave_zone=0, tonic=0, base_tonic_midi=48)
    notes_top = build_voiced_notes(c_chord, octave_zone=1, tonic=0, base_tonic_midi=48)
    notes_bot = build_voiced_notes(c_chord, octave_zone=-1, tonic=0, base_tonic_midi=48)

    assert notes_mid == [48, 52, 55] # C3, E3, G3
    assert notes_top == [60, 64, 67] # C4, E4, G4
    assert notes_bot == [36, 40, 43] # C2, E2, G2

    # Test clamping: extremely low or high chords are shifted into 21-108
    low_notes = [0, 4, 7]
    clamped_low = clamp_chord_to_range(low_notes, min_midi=21, max_midi=108)
    assert min(clamped_low) >= 21
    assert max(clamped_low) <= 108

    high_notes = [105, 109, 112]
    clamped_high = clamp_chord_to_range(high_notes, min_midi=21, max_midi=108)
    assert min(clamped_high) >= 21
    assert max(clamped_high) <= 108
