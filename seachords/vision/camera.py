"""
Webcam capture module for SeaChords.
Section 4, 8.1: Horizontal mirror flip, minimal capture buffer, safe lifecycle.
"""
import logging
from typing import Optional, Tuple
import cv2
import numpy as np

logger = logging.getLogger("seachords.camera")

class Camera:
    def __init__(self, camera_id: int = 0, width: int = 640, height: int = 480, fps: int = 30):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.fps = fps
        self.cap: Optional[cv2.VideoCapture] = None

    def start(self) -> bool:
        """Opens camera and configures parameters."""
        logger.info(f"Opening camera {self.camera_id}...")
        self.cap = cv2.VideoCapture(self.camera_id)
        if not self.cap or not self.cap.isOpened():
            logger.error(f"Failed to open camera ID {self.camera_id}.")
            return False

        # Attempt to set camera resolution and minimal buffer size
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self.cap.set(cv2.CAP_PROP_FPS, self.fps)
        try:
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass

        return True

    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        """
        Reads a frame and returns mirrored frame (cv2.flip(frame, 1)).
        Returns (success, frame).
        """
        if self.cap is None or not self.cap.isOpened():
            return False, None

        ret, frame = self.cap.read()
        if not ret or frame is None:
            return False, None

        # Section 8.1: Mirror horizontally before tracking and display
        mirrored = cv2.flip(frame, 1)
        return True, mirrored

    def release(self) -> None:
        if self.cap and self.cap.isOpened():
            self.cap.release()
            logger.info("Camera released.")
        self.cap = None

    def is_opened(self) -> bool:
        return self.cap is not None and self.cap.isOpened()
