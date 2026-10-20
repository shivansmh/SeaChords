"""
SeaChords: Air-Chord Instrument
Main entry point, real-time gesture loop, OpenCV HUD, and hotkeys.
Sections 11, 12, 13 of the SOP.
"""
import sys
import time
import argparse
import logging
import cv2
import numpy as np

from seachords.config import Config, DEFAULT_CONFIG, NOTE_NAMES
from seachords.vision.camera import Camera
from seachords.vision.hand_tracker import HandTracker
from seachords.vision.gesture import analyze_hand_gesture
from seachords.engine.debounce import SeaChordsDebouncer
from seachords.engine.controller import SeaChordsController
from seachords.output.midi_out import MidiOutput
from seachords.output.mock_out import MockOutput
from seachords.ui.overlay import draw_overlay
from seachords.ui.web_server import WebServer, SeaChordsWebState

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] %(message)s")
logger = logging.getLogger("seachords.main")

def run(config: Config, enable_web: bool = False, web_port: int = 8080, headless: bool = False) -> None:
    # 1. Initialize output backend
    logger.info(f"Initializing output backend: {config.output_backend}...")
    if config.output_backend == "mock":
        output = MockOutput()
    elif config.output_backend == "midi":
        output = MidiOutput(
            port_name=config.midi_port_name,
            velocity=config.velocity,
            strum_ms=config.strum_ms
        )
    else: # auto
        try:
            output = MidiOutput(
                port_name=config.midi_port_name,
                velocity=config.velocity,
                strum_ms=config.strum_ms
            )
        except Exception as e:
            logger.warning(f"Defaulting to MockOutput due to MIDI init notice: {e}")
            output = MockOutput()

    # 2. Initialize Controller and Debouncer
    controller = SeaChordsController(
        output=output,
        tonic=config.tonic,
        mode=config.mode,
        retrigger_on_octave=config.retrigger_on_octave,
        base_tonic_midi=config.base_octave_tonic_midi
    )

    debouncer = SeaChordsDebouncer(
        stable_frames=config.stable_frames,
        grace_ms=config.hand_lost_grace_ms,
        zone_high=config.zone_high,
        zone_low=config.zone_low,
        zone_deadband=config.zone_deadband
    )

    # 3. Optional Web Interface
    web_server = None
    web_state = None
    if enable_web:
        web_state = SeaChordsWebState()
        web_server = WebServer(web_state=web_state, port=web_port)
        web_url = web_server.start()
        print(f"\n=======================================================")
        print(f"SeaChords Web Interface is LIVE at: {web_url}")
        print(f"=======================================================\n")

        # Connect web callbacks to live controller
        def on_web_panic():
            controller.panic()
        def on_web_config(cfg):
            if "tonic" in cfg or "mode" in cfg:
                t = cfg.get("tonic", controller.tonic)
                m = cfg.get("mode", controller.mode)
                controller.set_key(t, m)
            if "stable_frames" in cfg:
                debouncer.degree_filter.stable_frames = cfg["stable_frames"]
                debouncer.zone_filter.stable_frames = cfg["stable_frames"]
                debouncer.level_filter.stable_frames = cfg["stable_frames"]
            if "finger_ext_ratio" in cfg:
                config.finger_ext_ratio = cfg["finger_ext_ratio"]

        web_state.panic_callbacks.append(on_web_panic)
        web_state.config_callbacks.append(on_web_config)

    # 4. Initialize Camera & Tracker
    camera = Camera(
        camera_id=config.camera_id,
        width=config.frame_width,
        height=config.frame_height,
        fps=config.fps
    )

    cam_started = camera.start()
    if not cam_started:
        logger.warning(
            "Could not open physical webcam (or camera is in use by another app). "
            "Running in simulation / fallback test mode."
        )

    tracker = HandTracker(
        min_detection_confidence=config.min_detection_confidence,
        min_tracking_confidence=config.min_tracking_confidence,
        swap_handedness=config.swap_handedness
    )

    logger.info("SeaChords instrument ready! Press 'q' to quit, 'a'/'d' for key, 'm' for mode, 'p' for panic.")

    prev_time = time.time()
    fps = 30.0
    running = True

    try:
        while running:
            loop_start = time.time()

            if cam_started and camera.is_opened():
                ret, frame = camera.read()
                if not ret or frame is None:
                    time.sleep(0.01)
                    continue
            else:
                # Synthetic canvas if camera not available
                frame = np.zeros((config.frame_height, config.frame_width, 3), dtype=np.uint8)
                cv2.putText(
                    frame, "SeaChords (Standby / Simulation)", (50, 240),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (150, 150, 150), 2, cv2.LINE_AA
                )
                time.sleep(0.033)

            # Detect hand landmarks (Section 8.1)
            hands = tracker.detect(frame)

            # Classify Left Hand (degree, octave zone)
            raw_degree = controller.current_degree
            raw_wrist_y = None
            left_present = False
            if hands.left is not None:
                left_info = analyze_hand_gesture(
                    hands.left,
                    handedness="Left",
                    finger_ext_ratio=config.finger_ext_ratio,
                    thumb_ext_ratio=config.thumb_ext_ratio
                )
                if left_info.is_valid:
                    left_present = True
                    raw_degree = left_info.classified_value
                    raw_wrist_y = left_info.wrist_y

            # Classify Right Hand (richness level)
            raw_level = 0
            right_present = False
            if hands.right is not None:
                right_info = analyze_hand_gesture(
                    hands.right,
                    handedness="Right",
                    finger_ext_ratio=config.finger_ext_ratio,
                    thumb_ext_ratio=config.thumb_ext_ratio
                )
                if right_info.is_valid:
                    right_present = True
                    raw_level = right_info.classified_value

            # Update debouncer (Section 9.1)
            c_degree, c_zone, c_level, hands_present = debouncer.update(
                raw_degree=raw_degree,
                raw_wrist_y=raw_wrist_y,
                raw_level=raw_level,
                left_present=left_present,
                right_present=right_present,
                now=loop_start
            )

            # Step state machine controller (Section 9.3)
            events = controller.step((c_degree, c_zone, c_level, hands_present))

            # Calculate FPS
            dt = time.time() - prev_time
            prev_time = time.time()
            if dt > 0:
                fps = 0.9 * fps + 0.1 * (1.0 / dt)

            # Chord name for HUD
            chord_name = controller.current_chord.chord_name if (controller.current_chord and controller.is_sounding) else "MUTED"
            active_notes = output.active_notes

            # Draw OpenCV HUD Overlay (Section 13)
            draw_overlay(
                frame=frame,
                tonic=controller.tonic,
                mode=controller.mode,
                degree=c_degree,
                octave_zone=c_zone,
                level=c_level,
                chord_name=chord_name,
                active_notes=active_notes,
                hands_present=hands_present,
                fps=fps,
                zone_high=config.zone_high,
                zone_low=config.zone_low,
                left_landmarks=hands.left,
                right_landmarks=hands.right
            )

            # Update Web Server state if enabled
            if web_state:
                web_state.update_frame(frame)
                web_state.update_state(
                    tonic=controller.tonic,
                    mode=controller.mode,
                    degree=c_degree,
                    octave_zone=c_zone,
                    level=c_level,
                    chord_name=chord_name,
                    active_notes=list(active_notes),
                    hands_present=hands_present,
                    fps=fps
                )

            # Show OpenCV GUI window if not headless
            if not headless:
                cv2.imshow("SeaChords — Air-Chord Instrument", frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    logger.info("Quit requested via 'q' hotkey.")
                    running = False
                elif key == ord('a'): # Tonic down 1 semitone
                    controller.set_key((controller.tonic - 1) % 12)
                    logger.info(f"Tonic changed: {NOTE_NAMES[controller.tonic]} {controller.mode}")
                elif key == ord('d'): # Tonic up 1 semitone
                    controller.set_key((controller.tonic + 1) % 12)
                    logger.info(f"Tonic changed: {NOTE_NAMES[controller.tonic]} {controller.mode}")
                elif key == ord('m'): # Toggle mode
                    new_mode = "natural_minor" if controller.mode == "major" else "major"
                    controller.set_key(controller.tonic, new_mode)
                    logger.info(f"Mode changed: {NOTE_NAMES[controller.tonic]} {controller.mode}")
                elif key == ord('p'): # Panic
                    controller.panic()
                    logger.info("Panic triggered!")
                elif key == ord('s'): # Swap handedness
                    tracker.swap_handedness = not tracker.swap_handedness
                    logger.info(f"Handedness swap set to: {tracker.swap_handedness}")

    finally:
        logger.info("Shutting down SeaChords...")
        controller.panic()
        camera.release()
        cv2.destroyAllWindows()
        if web_server:
            web_server.stop()
        logger.info("Shutdown complete.")

def main():
    parser = argparse.ArgumentParser(description="SeaChords: Air-Chord Instrument")
    parser.add_argument("--camera", type=int, default=0, help="Camera device index (default: 0)")
    parser.add_argument("--tonic", type=int, default=0, help="Starting tonic pitch class 0-11 (default: 0 = C)")
    parser.add_argument("--mode", type=str, default="major", choices=["major", "natural_minor"], help="Mode (default: major)")
    parser.add_argument("--backend", type=str, default="auto", choices=["auto", "midi", "mock"], help="Output backend")
    parser.add_argument("--web", action="store_true", help="Launch interactive browser web interface")
    parser.add_argument("--port", type=int, default=8080, help="Web interface port (default: 8080)")
    parser.add_argument("--headless", action="store_true", help="Run without native OpenCV GUI window")
    args = parser.parse_args()

    config = Config(
        camera_id=args.camera,
        tonic=args.tonic,
        mode=args.mode,
        output_backend=args.backend
    )

    run(config, enable_web=args.web, web_port=args.port, headless=args.headless)

if __name__ == "__main__":
    main()
