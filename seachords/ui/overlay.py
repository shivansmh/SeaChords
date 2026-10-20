"""
On-screen HUD overlay for SeaChords.
Section 13: Zone lines, chord name, scale degree, richness level, MUTED banner, hand landmarks, FPS.
"""
from typing import Optional, List, Dict, Any, Tuple
import cv2
import numpy as np
from ..music.scales import NOTE_NAMES

# Landmark connections for hand skeleton rendering
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),        # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),        # Index
    (0, 9), (9, 10), (10, 11), (11, 12),   # Middle
    (0, 13), (13, 14), (14, 15), (15, 16), # Ring
    (0, 17), (17, 18), (18, 19), (19, 20), # Pinky
    (5, 9), (9, 13), (13, 17)              # Palm base
]

DEGREE_NAMES = {
    1: "1 (Root)",
    2: "2 (ii)",
    3: "3 (iii)",
    4: "4 (IV)",
    5: "5 (V)",
    6: "6 (vi)",
    7: "7 (vii)"
}

LEVEL_NAMES = {
    0: "0 (Mute)",
    1: "1 (Triad)",
    2: "2 (7th)",
    3: "3 (9th)",
    4: "4 (Sus)",
    5: "5 (Spread)"
}

def draw_hand_skeleton(
    frame: np.ndarray,
    landmarks: List[Any],
    color: Tuple[int, int, int],
    label: str,
    classified_val: Optional[int] = None
) -> None:
    h, w, _ = frame.shape
    coords = []
    for lm in landmarks:
        cx = int(lm.x * w)
        cy = int(lm.y * h)
        coords.append((cx, cy))

    # Draw bones
    for p1_idx, p2_idx in HAND_CONNECTIONS:
        if p1_idx < len(coords) and p2_idx < len(coords):
            cv2.line(frame, coords[p1_idx], coords[p2_idx], color, 2, cv2.LINE_AA)

    # Draw joints
    for cx, cy in coords:
        cv2.circle(frame, (cx, cy), 4, (255, 255, 255), -1, cv2.LINE_AA)
        cv2.circle(frame, (cx, cy), 4, color, 1, cv2.LINE_AA)

    # Label at wrist
    if coords:
        wx, wy = coords[0]
        text = f"{label}"
        if classified_val is not None:
            text += f": {classified_val}"
        cv2.putText(
            frame, text, (max(10, wx - 30), max(20, wy + 25)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA
        )
        cv2.putText(
            frame, text, (max(10, wx - 30), max(20, wy + 25)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 1, cv2.LINE_AA
        )

def draw_overlay(
    frame: np.ndarray,
    tonic: int,
    mode: str,
    degree: int,
    octave_zone: int,
    level: int,
    chord_name: str,
    active_notes: List[int],
    hands_present: bool,
    fps: float,
    zone_high: float = 0.33,
    zone_low: float = 0.66,
    left_landmarks: Optional[List[Any]] = None,
    right_landmarks: Optional[List[Any]] = None
) -> None:
    h, w, _ = frame.shape

    # Draw Octave Zone boundary lines (Section 6.2)
    y_high = int(h * zone_high)
    y_low = int(h * zone_low)

    # Active zone highlighting
    if octave_zone == 1: # Top
        zone_color = (0, 255, 180)
    elif octave_zone == 0: # Mid
        zone_color = (180, 180, 180)
    else: # Bottom
        zone_color = (255, 180, 0)

    # Top zone line
    cv2.line(frame, (0, y_high), (w, y_high), (70, 70, 70), 1, cv2.LINE_AA)
    cv2.putText(
        frame, "+1 OCTAVE", (15, y_high - 8),
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (120, 220, 120) if octave_zone == 1 else (100, 100, 100),
        1, cv2.LINE_AA
    )

    # Bottom zone line
    cv2.line(frame, (0, y_low), (w, y_low), (70, 70, 70), 1, cv2.LINE_AA)
    cv2.putText(
        frame, "-1 OCTAVE", (15, y_low + 18),
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (120, 180, 255) if octave_zone == -1 else (100, 100, 100),
        1, cv2.LINE_AA
    )

    # Middle zone label
    cv2.putText(
        frame, "BASE REGISTER", (15, int((y_high + y_low) / 2)),
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (220, 220, 220) if octave_zone == 0 else (90, 90, 90),
        1, cv2.LINE_AA
    )

    # Draw Hand Skeletons
    if left_landmarks:
        draw_hand_skeleton(frame, left_landmarks, (0, 230, 255), "LEFT (Degree)", degree)
    if right_landmarks:
        draw_hand_skeleton(frame, right_landmarks, (255, 120, 50), "RIGHT (Level)", level)

    # Semi-transparent top HUD bar
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 65), (15, 15, 20), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    # Key and Mode
    key_str = f"KEY: {NOTE_NAMES[tonic % 12]} {mode.capitalize()}"
    cv2.putText(frame, key_str, (15, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)

    # Left hand degree badge
    deg_str = f"Left: {DEGREE_NAMES.get(degree, str(degree))}"
    cv2.putText(frame, deg_str, (15, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 230, 255), 1, cv2.LINE_AA)

    # Right hand level badge
    lvl_str = f"Right: {LEVEL_NAMES.get(level, str(level))}"
    cv2.putText(frame, lvl_str, (210, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 140, 60), 1, cv2.LINE_AA)

    # Center Chord / Mute Banner
    if not hands_present or level == 0 or chord_name == "MUTED":
        status_text = "MUTED"
        color = (0, 100, 255) # Red/Orange
    else:
        status_text = chord_name
        color = (50, 255, 100) # Bright green

    # Chord title text
    text_size, _ = cv2.getTextSize(status_text, cv2.FONT_HERSHEY_DUPLEX, 1.1, 2)
    tx = (w - text_size[0]) // 2
    cv2.putText(frame, status_text, (tx, 42), cv2.FONT_HERSHEY_DUPLEX, 1.1, (0, 0, 0), 4, cv2.LINE_AA)
    cv2.putText(frame, status_text, (tx, 42), cv2.FONT_HERSHEY_DUPLEX, 1.1, color, 2, cv2.LINE_AA)

    # FPS counter in top-right
    fps_color = (100, 255, 100) if fps >= 20 else (0, 100, 255)
    cv2.putText(frame, f"FPS: {fps:.1f}", (w - 100, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, fps_color, 1, cv2.LINE_AA)

    # Semi-transparent bottom HUD bar
    bot_overlay = frame.copy()
    cv2.rectangle(bot_overlay, (0, h - 35), (w, h), (15, 15, 20), -1)
    cv2.addWeighted(bot_overlay, 0.75, frame, 0.25, 0, frame)

    # Active notes display
    if active_notes:
        notes_str = "Notes: " + ", ".join(f"{NOTE_NAMES[n % 12]}{n // 12 - 1}({n})" for n in active_notes)
    else:
        notes_str = "Notes: (none)"
    cv2.putText(frame, notes_str, (15, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1, cv2.LINE_AA)

    # Hotkeys tip in bottom-right
    tip_str = "[A/D] Key  [M] Mode  [P] Panic  [Q] Quit"
    tip_size, _ = cv2.getTextSize(tip_str, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
    cv2.putText(frame, tip_str, (w - tip_size[0] - 15, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (140, 140, 140), 1, cv2.LINE_AA)
