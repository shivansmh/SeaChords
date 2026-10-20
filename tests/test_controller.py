"""
Unit tests for SeaChords debounce and controller logic.
Validates Section 9.1, 9.3 and Section 15 acceptance criteria.
"""
import pytest
from seachords.engine.debounce import StabilityFilter, OctaveHysteresis, SeaChordsDebouncer
from seachords.engine.controller import SeaChordsController
from seachords.output.mock_out import MockOutput

def test_stability_filter():
    # Value commits only after STABLE_FRAMES (e.g. 4)
    sf = StabilityFilter(initial_value=1, stable_frames=4)
    assert sf.committed_value == 1

    # Candidate 2 for 3 frames: should still be 1
    assert sf.update(2) == 1
    assert sf.update(2) == 1
    assert sf.update(2) == 1

    # On 4th consecutive frame: commits to 2
    assert sf.update(2) == 2
    assert sf.committed_value == 2

    # A single glitch frame 3 should not change committed value
    assert sf.update(3) == 2
    assert sf.update(2) == 2 # resets streak

def test_octave_hysteresis():
    # zone_high = 0.33, zone_low = 0.66, deadband = 0.04
    # half_deadband = 0.02
    oh = OctaveHysteresis(zone_high=0.33, zone_low=0.66, deadband=0.04)
    assert oh.current_zone == 0 # Middle

    # Moving up towards top zone:
    # 0.32 is between 0.31 and 0.33 -> still in middle deadband
    assert oh.update(0.32) == 0
    # 0.30 is < 0.31 -> transitions to Top (+1)
    assert oh.update(0.30) == 1

    # In top zone: hovering around 0.32 should stay in Top (+1)
    assert oh.update(0.32) == 1
    assert oh.update(0.34) == 1
    # Moving down past 0.35 (high + half_db) -> transitions back to Middle (0)
    assert oh.update(0.36) == 0

    # Moving down towards bottom zone:
    # 0.67 is between 0.66 and 0.68 -> still in middle deadband
    assert oh.update(0.67) == 0
    # 0.69 is > 0.68 -> transitions to Bottom (-1)
    assert oh.update(0.69) == -1
    # Hovering around 0.65 -> stays in Bottom until < 0.64
    assert oh.update(0.65) == -1
    assert oh.update(0.63) == 0

def test_controller_event_table_9_3():
    mock = MockOutput()
    ctrl = SeaChordsController(output=mock, tonic=0, mode="major", retrigger_on_octave=True)

    # 1. Hands not present -> no sound
    actions = ctrl.step((1, 0, 0, False))
    assert actions == []
    assert not ctrl.is_sounding

    # 2. Level goes 0 to >0 (fist opened) -> play(chord)
    actions = ctrl.step((1, 0, 1, True)) # Degree 1 (C), Mid zone, Triad (C major)
    assert actions == ["play"]
    assert ctrl.is_sounding
    assert mock.active_notes == [48, 52, 55] # C, E, G

    # 3. Same state holds -> no action
    actions = ctrl.step((1, 0, 1, True))
    assert actions == []
    assert ctrl.is_sounding

    # 4. Committed state changed: degree 1 -> 2 (Dm triad)
    actions = ctrl.step((2, 0, 1, True))
    assert actions == ["play"]
    assert mock.active_notes == [50, 53, 57] # D, F, A

    # 5. Level goes to 0 (fist closed) -> stop() immediately
    actions = ctrl.step((2, 0, 0, True))
    assert actions == ["stop"]
    assert not ctrl.is_sounding
    assert mock.active_notes == []

    # 6. Fist opened again with same degree & level -> play(chord) (re-strike!)
    actions = ctrl.step((2, 0, 1, True))
    assert actions == ["play"]
    assert ctrl.is_sounding
    assert mock.active_notes == [50, 53, 57]

    # 7. Octave zone change -> retrigger
    actions = ctrl.step((2, 1, 1, True)) # Top zone (+1 octave)
    assert actions == ["play"]
    assert mock.active_notes == [62, 65, 69]

    # 8. Hand lost beyond grace window -> stop()
    actions = ctrl.step((2, 1, 1, False))
    assert actions == ["stop"]
    assert not ctrl.is_sounding
    assert mock.active_notes == []

    # 9. Key or mode changed by hotkey -> panic()
    mock.play([60, 64, 67])
    assert mock.active_notes == [60, 64, 67]
    ctrl.set_key(tonic=2, mode="major") # change to D major
    assert mock.active_notes == []
