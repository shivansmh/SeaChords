# SeaChords Quick Run Guide

## 1. Quick Start

Run either of the following commands from this folder (`c:\Users\shiva\OneDrive\Desktop\CS\SeaChords`):

### Option A: Web Interface (Recommended)

Includes live video tracking, animated piano keyboard, and a built-in synth so you can hear chords directly in your browser:

```bash
python -m seachords.main --web
```

Open your browser at: **http://127.0.0.1:8080**

---

### Option B: Native Desktop Window

Standard OpenCV window with live HUD overlay and hand skeletons:

```bash
python -m seachords.main
```

---

## 2. Hand Gestures Quick Reference

### Left Hand: Scale Degree & Octave Register

| Fingers Extended          | Degree (in C Major) | Height (Left Wrist)            | Octave Register   |
| :------------------------ | :------------------ | :----------------------------- | :---------------- |
| **Index only**            | 1 (C / Cmaj7)       | **Top zone** (< 33% height)    | **+1 Octave**     |
| **Index + Middle**        | 2 (Dm / Dm7)        | **Middle zone** (33%–66%)      | **Base Register** |
| **Index + Middle + Ring** | 3 (Em / Em7)        | **Bottom zone** (> 66% height) | **-1 Octave**     |
| **Four fingers**          | 4 (F / Fmaj7)       |                                |                   |
| **Open palm (5)**         | 5 (G / G7)          |                                |                   |
| **Closed fist**           | 6 (Am / Am7)        |                                |                   |
| **Thumb only**            | 7 (Bdim / Bm7b5)    |                                |                   |

---

### Right Hand: Richness Level & Muting

| Fingers Extended             | Level | Chord Voicing       | Behavior                     |
| :--------------------------- | :---- | :------------------ | :--------------------------- |
| **Closed fist / Thumb only** | **0** | **MUTE / Release**  | Silences the instrument      |
| **Index only**               | **1** | Triad               | Root, 3rd, 5th               |
| **Two fingers**              | **2** | 7th Chord           | Diatonic stacked 3rds        |
| **Three fingers**            | **3** | 9th Chord           | Flat-9 avoid-note fallback   |
| **Four fingers**             | **4** | Suspended           | Diatonic `sus4` or `sus2`    |
| **Open palm (5)**            | **5** | Wide Spread Voicing | Deep root + wide top voicing |

> **Pro-tip (Re-striking Chords)**: To repeat the same chord, close your right hand into a fist to mute, then open it again.

---

## 3. Hotkeys (Desktop Window)

- `A` / `D` : Transpose tonic down / up by semitone
- `M` : Toggle scale mode (Major ↔ Natural Minor)
- `P` : Panic (silence all notes immediately)
- `S` : Swap left/right hand assignment
- `Q` : Quit application

---

## 4. Useful Flags

```bash
# Start in key of G (tonic=7) in Natural Minor
python -m seachords.main --tonic 7 --mode natural_minor

# Run web interface without native desktop window
python -m seachords.main --web --headless --port 8080

# Select camera index (default is 0)
python -m seachords.main --camera 1
```

---

## 5. Running the Tests

```bash
python -m pytest
```
