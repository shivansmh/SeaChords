"""
MediaPipe Hand Landmark Tracking and Handedness Assignment.
Section 8.1 of the SOP.
"""
import os
import urllib.request
import logging
from typing import Optional, Tuple, Dict, Any, List
import cv2
import numpy as np

logger = logging.getLogger("seachords.tracker")

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"

def ensure_model_exists(target_path: str = "models/hand_landmarker.task") -> str:
    abs_path = os.path.abspath(target_path)
    if os.path.exists(abs_path) and os.path.getsize(abs_path) > 1000000:
        return abs_path

    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    logger.info(f"Downloading MediaPipe HandLandmarker model to {abs_path}...")
    urllib.request.urlretrieve(MODEL_URL, abs_path)
    logger.info(f"Model downloaded successfully ({os.path.getsize(abs_path)} bytes).")
    return abs_path

class HandDetectionResult:
    def __init__(self, left_hand: Optional[List[Any]] = None, right_hand: Optional[List[Any]] = None):
        self.left = left_hand
        self.right = right_hand

    @property
    def has_both(self) -> bool:
        return self.left is not None and self.right is not None

class HandTracker:
    def __init__(
        self,
        min_detection_confidence: float = 0.6,
        min_tracking_confidence: float = 0.6,
        swap_handedness: bool = False,
        model_path: str = "models/hand_landmarker.task"
    ):
        self.swap_handedness = swap_handedness
        self.min_detection_confidence = min_detection_confidence
        self.min_tracking_confidence = min_tracking_confidence
        self.model_path = ensure_model_exists(model_path)
        self.detector = None
        self._init_detector()

    def _init_detector(self) -> None:
        try:
            import mediapipe as mp
            BaseOptions = mp.tasks.BaseOptions
            HandLandmarker = mp.tasks.vision.HandLandmarker
            HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
            VisionRunningMode = mp.tasks.vision.RunningMode

            options = HandLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=self.model_path),
                running_mode=VisionRunningMode.IMAGE,
                num_hands=2,
                min_hand_detection_confidence=self.min_detection_confidence,
                min_hand_presence_confidence=self.min_detection_confidence,
                min_tracking_confidence=self.min_tracking_confidence
            )
            self.detector = HandLandmarker.create_from_options(options)
            self._mp = mp
            logger.info("MediaPipe HandLandmarker initialized successfully.")
        except Exception as e:
            logger.error(f"Error initializing MediaPipe HandLandmarker: {e}")
            self.detector = None

    def detect(self, mirrored_frame: np.ndarray) -> HandDetectionResult:
        """
        Processes mirrored BGR frame and assigns handedness with fallback rules (Section 8.1).
        Returns HandDetectionResult with .left and .right landmarks.
        """
        if self.detector is None or mirrored_frame is None:
            return HandDetectionResult(None, None)

        rgb_frame = cv2.cvtColor(mirrored_frame, cv2.COLOR_BGR2RGB)
        mp_image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb_frame)
        result = self.detector.detect(mp_image)

        if not result.hand_landmarks:
            return HandDetectionResult(None, None)

        detected_hands = []
        for i, landmarks in enumerate(result.hand_landmarks):
            label = "Unknown"
            if i < len(result.handedness) and len(result.handedness[i]) > 0:
                cat = result.handedness[i][0]
                label = getattr(cat, "category_name", getattr(cat, "display_name", "Unknown"))

            # Optional handedness swap if configured
            if self.swap_handedness:
                if label == "Left":
                    label = "Right"
                elif label == "Right":
                    label = "Left"

            wrist_x = landmarks[0].x if len(landmarks) > 0 else 0.5
            detected_hands.append({
                "label": label,
                "landmarks": landmarks,
                "wrist_x": wrist_x
            })

        left_landmarks = None
        right_landmarks = None

        if len(detected_hands) == 1:
            h = detected_hands[0]
            if h["label"] == "Left":
                left_landmarks = h["landmarks"]
            elif h["label"] == "Right":
                right_landmarks = h["landmarks"]
            else:
                # Ambiguous single hand: fallback by wrist X position
                if h["wrist_x"] < 0.5:
                    left_landmarks = h["landmarks"]
                else:
                    right_landmarks = h["landmarks"]

        elif len(detected_hands) >= 2:
            h1, h2 = detected_hands[0], detected_hands[1]

            # Case 1: distinct labels
            if h1["label"] == "Left" and h2["label"] == "Right":
                left_landmarks = h1["landmarks"]
                right_landmarks = h2["landmarks"]
            elif h1["label"] == "Right" and h2["label"] == "Left":
                left_landmarks = h2["landmarks"]
                right_landmarks = h1["landmarks"]
            else:
                # Case 2: both hands have the same label (Section 8.1 fallback)
                # Assign by wrist X: the hand on viewer-left (smaller X) is Left hand
                if h1["wrist_x"] <= h2["wrist_x"]:
                    left_landmarks = h1["landmarks"]
                    right_landmarks = h2["landmarks"]
                else:
                    left_landmarks = h2["landmarks"]
                    right_landmarks = h1["landmarks"]

        return HandDetectionResult(left_landmarks, right_landmarks)
