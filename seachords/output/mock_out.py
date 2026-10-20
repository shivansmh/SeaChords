"""
Mock / Event-dispatching Output Backend for SeaChords.
Tracks held notes, history of play/stop/panic events, and notifies registered listeners.
"""
import time
from typing import List, Callable, Dict, Any
from .base import OutputBackend

class MockOutput(OutputBackend):
    def __init__(self):
        self._active_notes: List[int] = []
        self.history: List[Dict[str, Any]] = []
        self.listeners: List[Callable[[str, List[int]], None]] = []

    def add_listener(self, callback: Callable[[str, List[int]], None]) -> None:
        self.listeners.append(callback)

    def _notify(self, event_type: str, notes: List[int]) -> None:
        for cb in self.listeners:
            try:
                cb(event_type, notes)
            except Exception:
                pass

    def play(self, notes: List[int]) -> None:
        self._active_notes = list(notes)
        entry = {"event": "play", "notes": list(notes), "timestamp": time.time()}
        self.history.append(entry)
        self._notify("play", list(notes))

    def stop(self) -> None:
        prev = list(self._active_notes)
        self._active_notes = []
        entry = {"event": "stop", "notes": prev, "timestamp": time.time()}
        self.history.append(entry)
        self._notify("stop", prev)

    def panic(self) -> None:
        prev = list(self._active_notes)
        self._active_notes = []
        entry = {"event": "panic", "notes": prev, "timestamp": time.time()}
        self.history.append(entry)
        self._notify("panic", prev)

    @property
    def active_notes(self) -> List[int]:
        return list(self._active_notes)
