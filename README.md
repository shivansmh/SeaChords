# SeaChords: Air-Chord Instrument

SeaChords is a real-time gesture-controlled instrument that turns two-handed webcam gestures into chords. The player **never plays out of key**: a scale is selected once, and every chord produced is strictly diatonic to that scale.

- **Left Hand**: Chooses **scale degree** (finger count 1–7) and **octave register** (hand height zone: Top `+1`, Mid `Base`, Bottom `-1`).
- **Right Hand**: Chooses **chord richness** (finger count: Triad, 7th, 9th, Sus, Spread). A closed fist **mutes**.
- **Output Architecture**: Clean decoupled `OutputBackend` interface (`MidiOutput`, `MockOutput`, `FluidSynthOutput`). Sound source deployment (DAW/virtual MIDI) can be connected at any time.

---

## 🚀 Quickstart

### 1. Web Interface (Recommended)
Launches the full interactive browser dashboard with **live camera tracking, HUD, animated 61-key piano keyboard, real-time MIDI event log, and built-in Web Audio polyphonic synthesizer** (hear chords directly in your browser without needing a DAW):

```bash
python -m seachords.main --web
```
Then open your browser at **`http://127.0.0.1:8080`**.

### 2. Native OpenCV Desktop Window
Launches the standard OpenCV desktop HUD window with real-time zone lines, chord banners, and hand skeleton tracking:

```bash
python -m seachords.main
```

### 3. Headless / Server Mode
```bash
python -m seachords.main --web --headless --port 8080
```

---

## 🎮 Controls & Gesture Mapping

### Left Hand: Scale Degree & Octave
| Gesture | Scale Degree | Key of C Example |
| :--- | :--- | :--- |
| **Index finger only** | Degree 1 (Tonic) | C / Cmaj7 |
| **Index + Middle** | Degree 2 (Supertonic) | Dm / Dm7 |
| **Index + Middle + Ring** | Degree 3 (Mediant) | Em / Em7 |
| **Four fingers (no thumb)** | Degree 4 (Subdominant) | F / Fmaj7 |
| **Open palm (4 fingers + thumb)** | Degree 5 (Dominant) | G / G7 |
| **Closed fist (no thumb)** | Degree 6 (Submediant) | Am / Am7 |
| **Thumb only** | Degree 7 (Leading Tone) | Bdim / Bm7b5 |

**Octave Zones (Wrist Y Height):**
- **Top Zone** (< 33% height): `+1 Octave` (+12 semitones)
- **Middle Zone** (33% – 66% height): `Base Register` (Tonic at MIDI 48)
- **Bottom Zone** (> 66% height): `-1 Octave` (-12 semitones)
- Includes deadband hysteresis (4%) to prevent boundary flickering.

---

### Right Hand: Chord Richness & Muting
| Gesture | Richness Level | Voicing Quality | Behavior |
| :--- | :--- | :--- | :--- |
| **Closed fist or thumb only** | **Level 0** | **MUTE / Release** | Silences sounding notes |
| **Index finger only** | **Level 1** | Triad | Root, 3rd, 5th |
| **Two fingers** | **Level 2** | 7th Chord | Diatonic stacked thirds |
| **Three fingers** | **Level 3** | 9th Chord | Automatic avoid-note rule (flat-9 falls back to 7th) |
| **Four fingers (no thumb)** | **Level 4** | Suspended | Diatonic `sus4` or `sus2` (checked in scale) |
| **Open palm (with thumb)** | **Level 5** | Wide Spread Voicing | Sub-bass root with high chord extension |

**Re-strike Feature**: Close right fist to mute, then reopen into any finger count to re-strike the chord.

---

## 🎹 Keyboard Hotkeys (OpenCV Window)

- `Q`: Quit application
- `A` / `D`: Transpose tonic down / up by semitone
- `M`: Toggle scale mode (Major ↔ Natural Minor)
- `P`: Panic (silence all notes & send CC 123)
- `S`: Swap handedness labels if inverted

---

## 🛠️ Project Structure

```
seachords/
  config.py               # Tunable constants (Section 12 of SOP)
  main.py                 # Application entry point, main loop, hotkeys
  music/
    scales.py             # Major & Natural Minor scales, tonic math
    chords.py             # Pure diatonic third stacking & avoid-note rules
    voicing.py            # Octave zone offsets, spread voicings, MIDI 21-108 clamping
  engine/
    debounce.py           # Multi-frame stability filter & octave hysteresis
    controller.py         # State machine & trigger/mute logic (Section 9.3)
  vision/
    camera.py             # Capture & horizontal mirror flip (cv2.flip)
    hand_tracker.py       # MediaPipe HandLandmarker & handedness assignment
    gesture.py            # Geometry-based finger extension classification
  output/
    base.py               # OutputBackend interface (play, stop, panic)
    midi_out.py           # MIDI backend (virtual port or loopback)
    mock_out.py           # Mock / event-dispatching backend
    fluid_out.py          # FluidSynth backend
  ui/
    overlay.py            # OpenCV HUD overlay (zone lines, banners, skeletons)
    web_server.py         # Lightweight HTTP + MJPEG streaming server
    web/index.html        # Modern browser interface with Web Audio synthesizer
tests/
  test_chords.py          # Diatonic chords, avoid-note, sus rules, and clamp tests
  test_controller.py      # Event table & debounce hysteresis tests
  test_gesture.py         # Landmark fixtures for all left & right gestures
```

---

## 🧪 Testing

Run the automated test suite:
```bash
python -m pytest
```

---

## 🔊 Sound Source Deployment (Later Setup)

The instrument sends MIDI on **Channel 1**. When ready to deploy an external sound source:
- **Windows**: Install [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html) and create a virtual port named `SeaChords`. Route this port into your DAW (Ableton, FL Studio, Reaper, Logic) or software synthesizer (Vital, Serum, Kontakt).
- **macOS / Linux**: Mido automatically creates the virtual port `SeaChords`.
- **Browser Synthesizer**: The included Web Interface (`python -m seachords.main --web`) includes an instant Web Audio synth so you can play immediately before setting up a DAW!
