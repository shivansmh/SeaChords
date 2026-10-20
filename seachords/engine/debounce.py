"""
Debounce and stability filtering for SeaChords.
Section 9.1: Stability filter and hysteresis.
"""
import time
from typing import Optional, Tuple

class OctaveHysteresis:
    """
    Classifies wrist Y (0=top, 1=bottom) into zone:
    +1 (Top: Y < zone_high)
     0 (Middle: zone_high <= Y <= zone_low)
    -1 (Bottom: Y > zone_low)
    with deadband hysteresis to prevent flickering on boundary lines.
    """
    def __init__(self, zone_high: float = 0.33, zone_low: float = 0.66, deadband: float = 0.04):
        self.zone_high = zone_high
        self.zone_low = zone_low
        self.half_deadband = deadband / 2.0
        self.current_zone: int = 0 # Default middle

    def update(self, wrist_y: float) -> int:
        if self.current_zone == 0:
            # In middle zone: transition to top (+1) if Y < high - half_db
            if wrist_y < (self.zone_high - self.half_deadband):
                self.current_zone = 1
            # Transition to bottom (-1) if Y > low + half_db
            elif wrist_y > (self.zone_low + self.half_deadband):
                self.current_zone = -1

        elif self.current_zone == 1:
            # In top zone: transition back down to middle if Y > high + half_db
            if wrist_y > (self.zone_high + self.half_deadband):
                if wrist_y > (self.zone_low + self.half_deadband):
                    self.current_zone = -1
                else:
                    self.current_zone = 0

        elif self.current_zone == -1:
            # In bottom zone: transition back up to middle if Y < low - half_db
            if wrist_y < (self.zone_low - self.half_deadband):
                if wrist_y < (self.zone_high - self.half_deadband):
                    self.current_zone = 1
                else:
                    self.current_zone = 0

        return self.current_zone

class StabilityFilter:
    """
    A value is committed only after being observed for stable_frames consecutive frames.
    """
    def __init__(self, initial_value, stable_frames: int = 4):
        self.committed_value = initial_value
        self.candidate_value = initial_value
        self.streak_count: int = 0
        self.stable_frames = stable_frames

    def update(self, raw_value):
        if raw_value == self.committed_value:
            self.candidate_value = raw_value
            self.streak_count = 0
            return self.committed_value

        if raw_value == self.candidate_value:
            self.streak_count += 1
            if self.streak_count >= self.stable_frames:
                self.committed_value = raw_value
                self.streak_count = 0
        else:
            self.candidate_value = raw_value
            self.streak_count = 1
            if self.stable_frames <= 1:
                self.committed_value = raw_value

        return self.committed_value

class SeaChordsDebouncer:
    """
    Combined stability filter and grace window tracker for SeaChords.
    """
    def __init__(
        self,
        stable_frames: int = 4,
        grace_ms: float = 300.0,
        zone_high: float = 0.33,
        zone_low: float = 0.66,
        zone_deadband: float = 0.04
    ):
        self.stable_frames = stable_frames
        self.grace_ms = grace_ms
        self.octave_hysteresis = OctaveHysteresis(zone_high, zone_low, zone_deadband)

        self.degree_filter = StabilityFilter(initial_value=1, stable_frames=stable_frames)
        self.zone_filter = StabilityFilter(initial_value=0, stable_frames=stable_frames)
        self.level_filter = StabilityFilter(initial_value=0, stable_frames=stable_frames)

        self.last_both_hands_time: float = time.time()
        self.hands_committed_present: bool = False

    def update(
        self,
        raw_degree: int,
        raw_wrist_y: Optional[float],
        raw_level: int,
        left_present: bool,
        right_present: bool,
        now: Optional[float] = None
    ) -> Tuple[int, int, int, bool]:
        """
        Returns committed (degree, octave_zone, level, hands_present)
        """
        current_time = now if now is not None else time.time()

        both_present = left_present and right_present
        if both_present:
            self.last_both_hands_time = current_time
            hands_present = True
        else:
            elapsed_ms = (current_time - self.last_both_hands_time) * 1000.0
            hands_present = elapsed_ms <= self.grace_ms

        # Compute octave zone with hysteresis
        if raw_wrist_y is not None:
            raw_zone = self.octave_hysteresis.update(raw_wrist_y)
        else:
            raw_zone = self.octave_hysteresis.current_zone

        # Pass through stability filters
        c_degree = self.degree_filter.update(raw_degree)
        c_zone = self.zone_filter.update(raw_zone)
        c_level = self.level_filter.update(raw_level)

        self.hands_committed_present = hands_present
        return c_degree, c_zone, c_level, hands_present
