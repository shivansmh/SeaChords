"""
Unit tests for gesture recognition and classification.
Validates Section 8.2, 8.3 and Section 15 acceptance criteria.
"""
import pytest
from seachords.vision.gesture import analyze_hand_gesture, Point3D

def make_hand_fixture(
    thumb_ext: bool,
    index_ext: bool,
    middle_ext: bool,
    ring_ext: bool,
    pinky_ext: bool,
    wrist_y: float = 0.5,
    wrist_x: float = 0.3
):
    """
    Constructs a 21-landmark fixture with controlled extension geometry.
    """
    # Wrist at (wrist_x, wrist_y)
    wrist = Point3D(wrist_x, wrist_y, 0.0)
    pinky_mcp = Point3D(wrist_x + 0.1, wrist_y - 0.1, 0.0)
    middle_mcp = Point3D(wrist_x, wrist_y - 0.15, 0.0)

    # 21 points
    pts = [Point3D(0, 0, 0) for _ in range(21)]
    pts[0] = wrist
    pts[9] = middle_mcp
    pts[17] = pinky_mcp

    # Fingers configuration:
    # (pip_idx, tip_idx, is_ext)
    fingers = [
        (6, 8, index_ext),
        (10, 12, middle_ext),
        (14, 16, ring_ext),
        (18, 20, pinky_ext)
    ]
    for pip_idx, tip_idx, is_ext in fingers:
        # pip is at distance 0.1 from wrist
        pts[pip_idx] = Point3D(wrist_x, wrist_y - 0.1, 0.0)
        # if extended: tip distance is 0.2 (> 0.1 * 1.1)
        # if curled: tip distance is 0.08 (< 0.1 * 1.1)
        tip_y = (wrist_y - 0.2) if is_ext else (wrist_y - 0.08)
        pts[tip_idx] = Point3D(wrist_x, tip_y, 0.0)

    # Thumb:
    # thumb_ip (idx 3), thumb_tip (idx 4)
    # distance to pinky_mcp determines extension
    pts[3] = Point3D(pinky_mcp.x - 0.1, pinky_mcp.y, 0.0) # dist = 0.1
    if thumb_ext:
        pts[4] = Point3D(pinky_mcp.x - 0.25, pinky_mcp.y, 0.0) # dist = 0.25 > 0.1 * 1.1
    else:
        pts[4] = Point3D(pinky_mcp.x - 0.08, pinky_mcp.y, 0.0) # dist = 0.08 < 0.1 * 1.1

    return pts

def test_left_hand_degree_classification_8_3():
    # Fist (no thumb): Degree 6
    fist = make_hand_fixture(False, False, False, False, False)
    assert analyze_hand_gesture(fist, "Left").classified_value == 6

    # Thumb only: Degree 7
    thumb_only = make_hand_fixture(True, False, False, False, False)
    assert analyze_hand_gesture(thumb_only, "Left").classified_value == 7

    # Index only: Degree 1
    idx_only = make_hand_fixture(False, True, False, False, False)
    assert analyze_hand_gesture(idx_only, "Left").classified_value == 1

    # Index + Middle: Degree 2
    two_fingers = make_hand_fixture(False, True, True, False, False)
    assert analyze_hand_gesture(two_fingers, "Left").classified_value == 2

    # Index + Middle + Ring: Degree 3
    three_fingers = make_hand_fixture(False, True, True, True, False)
    assert analyze_hand_gesture(three_fingers, "Left").classified_value == 3

    # Four fingers without thumb: Degree 4
    four_fingers = make_hand_fixture(False, True, True, True, True)
    assert analyze_hand_gesture(four_fingers, "Left").classified_value == 4

    # Open palm (four fingers + thumb): Degree 5
    open_palm = make_hand_fixture(True, True, True, True, True)
    assert analyze_hand_gesture(open_palm, "Left").classified_value == 5

def test_right_hand_level_classification_8_3():
    # Fist or thumb only: Level 0 (mute)
    fist = make_hand_fixture(False, False, False, False, False)
    assert analyze_hand_gesture(fist, "Right").classified_value == 0
    thumb_only = make_hand_fixture(True, False, False, False, False)
    assert analyze_hand_gesture(thumb_only, "Right").classified_value == 0

    # Index only: Level 1 (triad)
    idx_only = make_hand_fixture(False, True, False, False, False)
    assert analyze_hand_gesture(idx_only, "Right").classified_value == 1

    # Two fingers: Level 2 (7th)
    two_fingers = make_hand_fixture(False, True, True, False, False)
    assert analyze_hand_gesture(two_fingers, "Right").classified_value == 2

    # Three fingers: Level 3 (9th)
    three_fingers = make_hand_fixture(False, True, True, True, False)
    assert analyze_hand_gesture(three_fingers, "Right").classified_value == 3

    # Four fingers (no thumb): Level 4 (sus)
    four_fingers = make_hand_fixture(False, True, True, True, True)
    assert analyze_hand_gesture(four_fingers, "Right").classified_value == 4

    # Open palm (four fingers + thumb): Level 5 (spread)
    open_palm = make_hand_fixture(True, True, True, True, True)
    assert analyze_hand_gesture(open_palm, "Right").classified_value == 5
