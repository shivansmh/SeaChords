"""
FluidSynth output backend for SeaChords.
Section 5: Optional internal synth fallback using pyfluidsynth.
"""
import logging
from typing import List, Optional
from .base import OutputBackend

logger = logging.getLogger("seachords.fluid")

class FluidSynthOutput(OutputBackend):
    def __init__(self, soundfont_path: Optional[str] = None):
        self.soundfont_path = soundfont_path
        self._active_notes: List[int] = []
        self._fs = None
        self._sfid = None
        self._init_synth()

    def _init_synth(self) -> None:
        try:
            import fluidsynth
            self._fs = fluidsynth.Synth()
            self._fs.start()
            if self.soundfont_path:
                self._sfid = self._fs.sfload(self.soundfont_path)
                self._fs.program_select(0, self._sfid, 0, 0)
                logger.info(f"Loaded soundfont: {self.soundfont_path}")
        except Exception as e:
            logger.warning(f"FluidSynth backend not initialized: {e}")
            self._fs = None

    def play(self, notes: List[int]) -> None:
        self.stop()
        self._active_notes = list(notes)
        if self._fs:
            for note in notes:
                self._fs.noteon(0, note, 90)

    def stop(self) -> None:
        if self._fs and self._active_notes:
            for note in self._active_notes:
                self._fs.noteoff(0, note)
        self._active_notes = []

    def panic(self) -> None:
        self.stop()
        if self._fs:
            self._fs.cc(0, 123, 0)

    @property
    def active_notes(self) -> List[int]:
        return list(self._active_notes)
