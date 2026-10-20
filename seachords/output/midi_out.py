"""
MIDI Output backend for SeaChords.
Section 10 of SOP: Channel 1, fixed velocity, play/stop/panic, virtual port handling.
"""
import time
import logging
from typing import List, Optional, Callable
from .base import OutputBackend

logger = logging.getLogger("seachords.midi")

class MidiOutput(OutputBackend):
    def __init__(
        self,
        port_name: str = "SeaChords",
        velocity: int = 90,
        strum_ms: int = 0,
        channel: int = 0 # 0-indexed (MIDI channel 1)
    ):
        self.port_name = port_name
        self.velocity = max(0, min(127, velocity))
        self.strum_ms = strum_ms
        self.channel = channel
        self._active_notes: List[int] = []
        self._port = None
        self._mido = None
        self.listeners: List[Callable[[str, List[int]], None]] = []

        self._init_port()

    def add_listener(self, callback: Callable[[str, List[int]], None]) -> None:
        self.listeners.append(callback)

    def _notify(self, event_type: str, notes: List[int]) -> None:
        for cb in self.listeners:
            try:
                cb(event_type, notes)
            except Exception:
                pass

    def _init_port(self) -> None:
        try:
            import mido
            self._mido = mido
            # On Windows, creating a virtual port directly usually requires loopMIDI.
            # We attempt to open an output port, either virtual or existing port matching port_name.
            try:
                self._port = mido.open_output(self.port_name)
                logger.info(f"Opened MIDI output port: {self.port_name}")
            except Exception as e1:
                # Try opening virtual port if supported by platform
                try:
                    self._port = mido.open_output(self.port_name, virtual=True)
                    logger.info(f"Created virtual MIDI output port: {self.port_name}")
                except Exception as e2:
                    available = mido.get_output_names()
                    logger.warning(
                        f"Could not create virtual MIDI port '{self.port_name}' ({e1}; {e2}).\n"
                        f"Note: On Windows, install loopMIDI or a loopback driver to create virtual ports.\n"
                        f"Available output ports: {available}"
                    )
                    self._port = None
        except Exception as err:
            logger.warning(f"MIDI subsystem initialization deferred: {err}")
            self._port = None

    def play(self, notes: List[int]) -> None:
        # Note off for currently held notes
        self.stop()

        self._active_notes = list(notes)
        if self._port and self._mido:
            for i, note in enumerate(notes):
                if self.strum_ms > 0 and i > 0:
                    time.sleep(self.strum_ms / 1000.0)
                msg = self._mido.Message(
                    "note_on",
                    note=note,
                    velocity=self.velocity,
                    channel=self.channel
                )
                self._port.send(msg)

        self._notify("play", list(notes))

    def stop(self) -> None:
        if not self._active_notes:
            return

        prev_notes = list(self._active_notes)
        self._active_notes = []

        if self._port and self._mido:
            for note in prev_notes:
                msg = self._mido.Message(
                    "note_off",
                    note=note,
                    velocity=0,
                    channel=self.channel
                )
                self._port.send(msg)

        self._notify("stop", prev_notes)

    def panic(self) -> None:
        prev_notes = list(self._active_notes)
        self._active_notes = []

        if self._port and self._mido:
            # Note off for all held notes
            for note in prev_notes:
                msg = self._mido.Message(
                    "note_off",
                    note=note,
                    velocity=0,
                    channel=self.channel
                )
                self._port.send(msg)
            # CC 123 (All Notes Off)
            cc_msg = self._mido.Message(
                "control_change",
                control=123,
                value=0,
                channel=self.channel
            )
            self._port.send(cc_msg)

        self._notify("panic", prev_notes)

    def close(self) -> None:
        self.panic()
        if self._port:
            try:
                self._port.close()
            except Exception:
                pass
            self._port = None

    @property
    def active_notes(self) -> List[int]:
        return list(self._active_notes)
