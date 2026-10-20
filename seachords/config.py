"""
SeaChords Configuration
Tunable parameters and defaults as defined in Section 12 of the SOP.
"""
from dataclasses import dataclass

# Tonic pitch classes: C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

@dataclass
class Config:
    # Musical settings
    tonic: int = 0                  # Key root pitch class (0=C)
    mode: str = "major"             # "major" or "natural_minor"
    base_octave_tonic_midi: int = 48 # Base register: 48 + tonic (e.g. C3 = 48)

    # Vision & gesture parameters
    camera_id: int = 0
    frame_width: int = 640
    frame_height: int = 480
    fps: int = 30
    min_detection_confidence: float = 0.6
    min_tracking_confidence: float = 0.6
    finger_ext_ratio: float = 1.1   # Non-thumb extension sensitivity
    thumb_ext_ratio: float = 1.1    # Thumb extension sensitivity
    min_palm_size: float = 30.0     # Reject far or partial hands (normalized or pixels)
    swap_handedness: bool = False   # Set True if labels need inversion

    # Debounce and state
    stable_frames: int = 4          # Frames a gesture must hold to commit (~130ms at 30fps)
    hand_lost_grace_ms: float = 300.0 # Dropout tolerance in ms before muting
    zone_low: float = 0.66          # Frame-height fraction for bottom/middle boundary
    zone_high: float = 0.33         # Frame-height fraction for middle/top boundary
    zone_deadband: float = 0.04     # Hysteresis around zone lines
    retrigger_on_octave: bool = True # Octave change re-fires chord

    # Output parameters
    velocity: int = 90              # Default MIDI velocity
    strum_ms: int = 0               # Note-on stagger in ms (0 = simultaneous)
    midi_port_name: str = "SeaChords" # Virtual/Hardware MIDI port name
    output_backend: str = "auto"    # "auto", "midi", "mock", "fluid"

DEFAULT_CONFIG = Config()
