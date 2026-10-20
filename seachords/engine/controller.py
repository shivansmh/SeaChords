"""
State machine and controller for SeaChords.
Section 9.2, 9.3: Trigger and mute logic, event generation, re-strike handling.
"""
from typing import List, Tuple, Optional
from ..music.chords import construct_chord, ChordDefinition
from ..music.voicing import build_voiced_notes
from ..output.base import OutputBackend

class SeaChordsController:
    def __init__(
        self,
        output: OutputBackend,
        tonic: int = 0,
        mode: str = "major",
        retrigger_on_octave: bool = True,
        base_tonic_midi: int = 48
    ):
        self.output = output
        self.tonic = tonic
        self.mode = mode
        self.retrigger_on_octave = retrigger_on_octave
        self.base_tonic_midi = base_tonic_midi

        # State tracking
        self.current_degree: int = 1
        self.current_zone: int = 0
        self.current_level: int = 0
        self.hands_present: bool = False
        self.is_sounding: bool = False

        self.current_chord: Optional[ChordDefinition] = None
        self.current_notes: List[int] = []

    def set_key(self, tonic: int, mode: Optional[str] = None) -> None:
        """Key or mode changed by hotkey -> panic() then reset state."""
        self.output.panic()
        self.tonic = tonic % 12
        if mode is not None:
            self.mode = mode
        self.is_sounding = False
        self.current_notes = []

        # If hands are currently playing, recompute and retrigger
        if self.hands_present and self.current_level > 0:
            self._trigger_chord(self.current_degree, self.current_zone, self.current_level)

    def panic(self) -> None:
        self.output.panic()
        self.is_sounding = False
        self.current_notes = []

    def _trigger_chord(self, degree: int, zone: int, level: int) -> None:
        chord_def = construct_chord(degree=degree, level=level, tonic=self.tonic, mode=self.mode)
        notes = build_voiced_notes(
            chord_def=chord_def,
            octave_zone=zone,
            tonic=self.tonic,
            mode=self.mode,
            base_tonic_midi=self.base_tonic_midi
        )
        self.current_chord = chord_def
        self.current_notes = notes
        self.output.play(notes)
        self.is_sounding = True

    def _stop_chord(self) -> None:
        if self.is_sounding:
            self.output.stop()
            self.is_sounding = False
        self.current_notes = []

    def step(self, committed_state: Tuple[int, int, int, bool]) -> List[str]:
        """
        Processes a debounced frame: (degree, octave_zone, level, hands_present)
        Returns list of executed actions: ["play"], ["stop"], or [].
        """
        degree, zone, level, hands_present = committed_state
        actions: List[str] = []

        prev_degree = self.current_degree
        prev_zone = self.current_zone
        prev_level = self.current_level
        prev_hands = self.hands_present
        was_sounding = self.is_sounding

        self.current_degree = degree
        self.current_zone = zone
        self.current_level = level
        self.hands_present = hands_present

        # Condition 4: Hand lost beyond grace window -> stop()
        if not hands_present:
            if was_sounding:
                self._stop_chord()
                actions.append("stop")
            return actions

        # Both hands present:
        # Condition 3: Level goes to 0 (fist closed) -> stop()
        if level == 0:
            if was_sounding:
                self._stop_chord()
                actions.append("stop")
            return actions

        # Now level > 0:
        # Condition 2: Level goes 0 to >0 (fist opened) -> play(chord) even if unchanged (re-strike)
        if prev_level == 0 or not prev_hands or not was_sounding:
            self._trigger_chord(degree, zone, level)
            actions.append("play")
            return actions

        # Condition 1 & 6: Level > 0 and committed state changed
        state_changed = (degree != prev_degree) or (level != prev_level)
        octave_changed = (zone != prev_zone)

        if octave_changed:
            if self.retrigger_on_octave:
                state_changed = True
            else:
                # Octave changed but retrigger is disabled
                pass

        if state_changed:
            self._trigger_chord(degree, zone, level)
            actions.append("play")

        return actions
