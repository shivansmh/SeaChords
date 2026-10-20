"""
Base output interface for SeaChords.
Section 5: OutputBackend interface: play(notes: list[int]), stop(), panic().
"""
from abc import ABC, abstractmethod
from typing import List

class OutputBackend(ABC):
    @abstractmethod
    def play(self, notes: List[int]) -> None:
        """Stops held notes and sounds the new set of MIDI notes."""
        pass

    @abstractmethod
    def stop(self) -> None:
        """Silences all currently active notes."""
        pass

    @abstractmethod
    def panic(self) -> None:
        """Emergency stop: silences all notes and sends all-notes-off CC 123."""
        pass

    @property
    @abstractmethod
    def active_notes(self) -> List[int]:
        """Returns currently sounding MIDI notes."""
        pass
