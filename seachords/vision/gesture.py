"""
Gesture recognition and finger counting for SeaChords.
Sections 8.2 and 8.3 of the SOP.
"""
import math
from dataclasses import dataclass
from typing import List, Dict, Any, Optional

# Landmark indices per MediaPipe specification
WRIST = 0
THUMB_CMC = 1
THUMB_MCP = 2
THUMB_IP = 3
THUMB_TIP = 4

INDEX_MCP = 5
INDEX_PIP = 6
INDEX_DIP = 7
INDEX_TIP = 8

MIDDLE_MCP = 9
MIDDLE_PIP = 10
MIDDLE_DIP = 11
MIDDLE_TIP = 12

RING_MCP = 13
RING_PIP = 14
RING_DIP = 15
RING_TIP = 16

PINKY_MCP = 17
PINKY_PIP = 18
PINKY_DIP = 19
PINKY_TIP = 20

@dataclass
class Point3D:
    x: float
    y: float
    z: float = 0.0

@dataclass
class HandGestureInfo:
    handedness: str                 # "Left" or "Right"
    is_valid: bool                  # True if palm size >= MIN_PALM_SIZE
    palm_size: float
    wrist_y: float
    wrist_x: float
    extended_fingers: Dict[str, bool] # thumb, index, middle, ring, pinky
    non_thumb_count: int
    thumb_extended: bool
    classified_value: int           # Degree (1-7) for Left, Level (0-5) for Right

def dist_points(p1: Point3D, p2: Point3D) -> float:
    return math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2 + (p1.z - p2.z) ** 2)

def extract_landmarks(landmarks: Any) -> List[Point3D]:
    """
    Converts MediaPipe NormalizedLandmarkList or list of dict/objects to List[Point3D].
    """
    points: List[Point3D] = []
    for lm in landmarks:
        if hasattr(lm, "x") and hasattr(lm, "y"):
            z = getattr(lm, "z", 0.0)
            points.append(Point3D(lm.x, lm.y, z))
        elif isinstance(lm, (list, tuple)):
            z = lm[2] if len(lm) > 2 else 0.0
            points.append(Point3D(lm[0], lm[1], z))
        elif isinstance(lm, dict):
            points.append(Point3D(lm.get("x", 0.0), lm.get("y", 0.0), lm.get("z", 0.0)))
    return points

def analyze_hand_gesture(
    landmarks_raw: Any,
    handedness: str,
    finger_ext_ratio: float = 1.1,
    thumb_ext_ratio: float = 1.1,
    min_palm_size: float = 0.04 # In normalized coords ~0.04, in px ~25
) -> HandGestureInfo:
    """
    Analyzes landmarks of a single hand and classifies degree or richness level.
    """
    pts = extract_landmarks(landmarks_raw)
    if len(pts) < 21:
        return HandGestureInfo(
            handedness=handedness,
            is_valid=False,
            palm_size=0.0,
            wrist_y=0.0,
            wrist_x=0.0,
            extended_fingers={},
            non_thumb_count=0,
            thumb_extended=False,
            classified_value=1 if handedness == "Left" else 0
        )

    wrist = pts[WRIST]
    middle_mcp = pts[MIDDLE_MCP]
    pinky_mcp = pts[PINKY_MCP]

    # Normalize by palm size: dist(wrist, middle_mcp)
    palm_size = dist_points(wrist, middle_mcp)
    if palm_size < min_palm_size:
        return HandGestureInfo(
            handedness=handedness,
            is_valid=False,
            palm_size=palm_size,
            wrist_y=wrist.y,
            wrist_x=wrist.x,
            extended_fingers={},
            non_thumb_count=0,
            thumb_extended=False,
            classified_value=1 if handedness == "Left" else 0
        )

    # Finger extensions:
    # Non-thumb fingers: extended if dist(wrist, tip) > dist(wrist, pip) * FINGER_EXT_RATIO
    non_thumb_indices = [
        ("index", INDEX_PIP, INDEX_TIP),
        ("middle", MIDDLE_PIP, MIDDLE_TIP),
        ("ring", RING_PIP, RING_TIP),
        ("pinky", PINKY_PIP, PINKY_TIP),
    ]

    extended: Dict[str, bool] = {}
    for name, pip_idx, tip_idx in non_thumb_indices:
        d_tip = dist_points(wrist, pts[tip_idx])
        d_pip = dist_points(wrist, pts[pip_idx])
        extended[name] = (d_tip > (d_pip * finger_ext_ratio))

    # Thumb extension:
    # extended if dist(thumb_tip, pinky_mcp) > dist(thumb_ip, pinky_mcp) * THUMB_EXT_RATIO
    d_thumb_tip = dist_points(pts[THUMB_TIP], pinky_mcp)
    d_thumb_ip = dist_points(pts[THUMB_IP], pinky_mcp)
    thumb_extended = (d_thumb_tip > (d_thumb_ip * thumb_ext_ratio))
    extended["thumb"] = thumb_extended

    non_thumb_count = sum(1 for name, _, _ in non_thumb_indices if extended[name])

    # Classification per Section 8.3
    if handedness == "Left":
        # Degree classification
        # n == 0 and thumb: degree 7
        # n == 0 and not thumb: degree 6
        # n == 4 and thumb: degree 5
        # n in 1-4 (thumb ignored): degree n
        if non_thumb_count == 0:
            classified_value = 7 if thumb_extended else 6
        elif non_thumb_count == 4 and thumb_extended:
            classified_value = 5
        else:
            classified_value = non_thumb_count
    else:
        # Right hand: level classification
        # n == 0: level 0 (mute), thumb or not
        # n == 4 and thumb: level 5
        # n in 1-4 (thumb ignored): level n
        if non_thumb_count == 0:
            classified_value = 0
        elif non_thumb_count == 4 and thumb_extended:
            classified_value = 5
        else:
            classified_value = non_thumb_count

    return HandGestureInfo(
        handedness=handedness,
        is_valid=True,
        palm_size=palm_size,
        wrist_y=wrist.y,
        wrist_x=wrist.x,
        extended_fingers=extended,
        non_thumb_count=non_thumb_count,
        thumb_extended=thumb_extended,
        classified_value=classified_value
    )
