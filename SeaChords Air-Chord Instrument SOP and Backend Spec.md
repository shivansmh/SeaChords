# SeaChords: Air-Chord Instrument SOP and Backend Spec

Version 1.0 | Audience: backend/implementation agent | Language: Python 3.10+

## 1. Purpose and Scope

SeaChords is a real-time instrument that turns two-handed webcam gestures into chords. The player never plays out of key: a scale is selected once, and every chord the instrument can produce is diatonic to that scale.

- **Left hand** chooses the scale degree (finger count) and the octave register (hand height).
- **Right hand** chooses chord richness (finger count). A closed right fist mutes.
- Output is MIDI by default (to a DAW or software synth), with an optional built-in synth fallback.

**In scope:** hand tracking, gesture classification, diatonic chord generation, debounce/state machine, MIDI output, on-screen overlay, tests.

**Out of scope for v1:** velocity from motion, chord progressions/recording, chromatic or borrowed chords, UI scale dropdown, mobile.

## 2. Locked Design Decisions

1. Scale-specific and diatonic. Chord quality (major, minor, diminished) comes from the scale, never from the player.
2. The old Y-threshold major/minor toggle is removed. Left-hand height now controls **octave register**.
3. Right-hand finger count is a "richness ladder" (triad, 7th, 9th, sus, spread).
4. A chord sounds whenever the committed chord state changes. A right fist mutes; opening the fist again re-strikes the chord, which is how the player repeats a chord.
5. Gestures must be stable for a few frames (debounce) before they count, so passing through intermediate finger counts does not fire stray chords.

## 3. Assumptions (flag to the owner if wrong)

- Output default is **MIDI via virtual port** (mido + python-rtmidi). macOS/Linux can create a virtual port directly; Windows needs a loopback driver such as loopMIDI.
- Optional fallback backend: FluidSynth with a SoundFont so the app makes sound without a DAW.
- Standard webcam, one player, palm facing the camera, reasonable lighting.
- Scale is chosen at startup (CLI args) and can be changed live with hotkeys.

## 4. Tech Stack

| Purpose | Library |
| --- | --- |
| Camera and overlay | opencv-python |
| Hand landmarks | mediapipe (pin an exact version) |
| MIDI out | mido, python-rtmidi |
| Optional internal synth | pyfluidsynth |
| Tests | pytest |

MediaPipe settings: max 2 hands, detection and tracking confidence 0.6 (tunable), lightest model complexity that stays accurate. Camera: 640x480 at 30 fps, minimal capture buffer so frames are not stale.

## 5. Project Structure

```
seachords/
  main.py                 # entry point, main loop, hotkeys
  config.py               # all tunable constants (section 12)
  vision/
    camera.py             # capture, mirror flip
    hand_tracker.py       # MediaPipe wrapper, handedness assignment
    gesture.py            # finger counting, degree and level classification
  music/
    scales.py             # scale definitions, tonic handling
    chords.py             # diatonic chord construction, avoid-note rules
    voicing.py            # voicing and octave placement
  engine/
    debounce.py           # stability filter and hysteresis
    controller.py         # state machine, trigger and mute logic
  output/
    base.py               # OutputBackend interface
    midi_out.py           # primary backend
    fluid_out.py          # optional backend
  ui/
    overlay.py            # zone lines, chord name, status
  tests/
    test_chords.py
    test_gesture.py
    test_controller.py
```

`OutputBackend` interface: `play(notes: list[int])`, `stop()`, `panic()`. The controller depends only on this interface.

## 6. Control Mapping

### 6.1 Left hand: degree (finger count)

| Gesture | Scale degree |
| --- | --- |
| Fist (no thumb) | 6 |
| Index only | 1 |
| Index + middle | 2 |
| Index + middle + ring | 3 |
| Four fingers (thumb ignored) | 4 |
| Open palm (four fingers + thumb) | 5 |
| Thumb only | 7 |

Degree numbering is relative to the tonic, so it is the same gestures in every key (key of C: 1=C, 2=D, 3=E, 4=F, 5=G, 6=A, 7=B).

### 6.2 Left hand: octave (hand height)

Two horizontal lines split the frame into three zones using the left wrist Y position.

| Zone | Register |
| --- | --- |
| Top | +1 octave |
| Middle | base |
| Bottom | -1 octave |

Default boundaries at 33% and 66% of frame height, with a deadband (hysteresis) so hovering on a line does not flicker.

### 6.3 Right hand: richness level (finger count)

| Gesture | Level | Chord |
| --- | --- | --- |
| Fist or thumb only | 0 | **Mute / release** |
| Index only | 1 | Triad |
| Two fingers | 2 | 7th |
| Three fingers | 3 | 9th (with avoid-note fallback) |
| Four fingers (no thumb) | 4 | Suspended (sus4 or sus2) |
| Open palm (with thumb) | 5 | Wide spread voicing |

### 6.4 No-hand behavior

If either hand is lost for longer than `HAND_LOST_GRACE_MS`, mute. A brief dropout inside the grace window keeps the last committed value.

## 7. Music Theory Engine

### 7.1 Scales

- Major: semitone offsets `[0, 2, 4, 5, 7, 9, 11]`
- Natural minor: `[0, 2, 3, 5, 7, 8, 10]`
- Config: tonic pitch class 0-11 (C=0) and mode. No other scales in v1.

### 7.2 Chord construction (no lookup tables)

Build every chord by **stacking diatonic thirds** from the scale. For zero-based degree `d`, chord tones are scale indices `d, d+2, d+4, d+6, d+8` (root, 3rd, 5th, 7th, 9th). For any index beyond 6, wrap and add 12 semitones per octave. Quality (major, minor, diminished, dominant, half-diminished) falls out automatically.

Expected results to unit test:

| Degree | C major triad / 7th | A natural minor triad / 7th |
| --- | --- | --- |
| 1 | C / Cmaj7 | Am / Am7 |
| 2 | Dm / Dm7 | B dim / Bm7b5 |
| 3 | Em / Em7 | C / Cmaj7 |
| 4 | F / Fmaj7 | Dm / Dm7 |
| 5 | G / G7 | Em / Em7 |
| 6 | Am / Am7 | F / Fmaj7 |
| 7 | B dim / Bm7b5 | G / G7 |

### 7.3 Level 3 (9th) and the avoid-note rule

Compute the interval from the chord root to the diatonic 9th. If it equals 13 semitones (a flat 9), the 9th clashes and is **not used**. In that case, level 3 falls back to the 7th chord (same notes as level 2, but placed in the spread-leaning voicing from 7.5 so it still sounds different).

- C major: flat-9 degrees are 3 and 7.
- A natural minor: flat-9 degrees are 2 and 5.

The 9th itself is never chromatically altered, because that would leave the key.

### 7.4 Level 4 (suspended)

Try in order and take the first whose pitch classes are all inside the scale:

1. sus4 = root, root+5 semitones, chord's own fifth
2. sus2 = root, root+2 semitones, chord's own fifth
3. If neither fits, fall back to the triad.

Keep the chord's own fifth (so a diminished chord keeps its diminished fifth). Check: in C major, IV resolves to sus2 (F G C) because Fsus4 would need Bb.

### 7.5 Voicing and register

- Base register: the tonic sits at MIDI `48 + tonic_pc`; degree roots ascend from there.
- Octave zone adds -12, 0, or +12 to every note.
- Levels 1-4: root position, ascending, stacked in order.
- Level 5 (spread): with `t1..t4` as the semitone offsets of the 3rd, 5th, 7th, 9th above the root, voice as `[-12, 0, t2, t3, t1+12, t4+12]`. If the 9th is excluded, drop `t4+12`.
- Clamp all notes to MIDI 21-108 by shifting the entire chord by octaves if needed.
- Chord name for the overlay: derived from the interval structure (for example Dm7, G7, Bdim).

## 8. Vision and Gesture Recognition

### 8.1 Frame and handedness

1. Capture the frame and **mirror it horizontally** (`cv2.flip(frame, 1)`) before sending it to MediaPipe. MediaPipe's handedness labels assume a mirrored image, so after the flip the label "Left" is the player's actual left hand.
2. Run a startup self-check: ask the player to show only their left hand and confirm the label. If this is wrong on a given setup, provide a config switch to swap labels.
3. If both detected hands receive the same label, assign by wrist X position (the hand on the viewer-left of the mirrored frame is the left hand).

### 8.2 Finger extension

Use landmark geometry that does not depend on hand rotation. Landmark IDs: wrist 0; thumb 1-4; index 5-8; middle 9-12; ring 13-16; pinky 17-20 (MCP, PIP, DIP, TIP in order).

- **Index/middle/ring/pinky:** extended if `dist(wrist, tip) > dist(wrist, pip) * FINGER_EXT_RATIO` (default 1.1).
- **Thumb:** extended if `dist(thumb_tip, pinky_mcp) > dist(thumb_ip, pinky_mcp) * THUMB_EXT_RATIO`. This is the least reliable gesture; expose the ratio as a tunable.
- Normalize all distances by palm size (`dist(wrist, middle_mcp)`) and ignore hands whose palm size is below `MIN_PALM_SIZE` (too far or partial).

### 8.3 Classification

Let `n` = number of extended non-thumb fingers and `thumb` = thumb extended.

**Left (degree):**

- `n == 0` and thumb: degree 7
- `n == 0` and not thumb: degree 6
- `n == 4` and thumb: degree 5
- `n` in 1-4 (thumb ignored): degree `n`

Note: three or two fingers must be the specific adjacent fingers described in 6.1, but classify by count only in v1 and revisit if misfires occur.

**Right (level):**

- `n == 0`: level 0 (mute), thumb or not
- `n == 4` and thumb: level 5
- `n` in 1-4 (thumb ignored): level `n`

## 9. State and Trigger Logic

### 9.1 Debounce

Each classified value (degree, octave zone, level) passes through a stability filter: a new value is **committed** only after it is seen for `STABLE_FRAMES` consecutive frames (default 4, about 130 ms at 30 fps). Until then, the previous committed value stays. Octave zone additionally uses a deadband of `ZONE_DEADBAND` around each boundary.

### 9.2 Chord state

Committed chord state = `(degree, octave_zone, level)` plus the global `(tonic, mode)`.

### 9.3 Events

| Condition | Action |
| --- | --- |
| Both hands present, level > 0, and committed state changed | `stop()` then `play(new chord)` |
| Level goes 0 to >0 (fist opened) | `play(chord)` even if unchanged (re-strike) |
| Level goes to 0 (fist closed) | `stop()` |
| Hand lost beyond grace window | `stop()` |
| Key or mode changed by hotkey | `panic()` then reset state |
| Octave zone change | Treated as a chord change (retrigger) when `RETRIGGER_ON_OCTAVE` is true |

Notes ring until the next event; there is no timer-based decay. Optional `STRUM_MS` staggers note-on messages (default 0 = simultaneous).

## 10. Output Layer

- MIDI channel 1, fixed velocity (`VELOCITY`, default 90), no pitch bend.
- `play`: send note\_off for any currently held notes, then note\_on for the new set.
- `panic`: send note\_off for all held notes and CC 123 (all notes off).
- Always call `panic` on exit, including on exceptions (use try/finally).
- Virtual port name: `SeaChords` (configurable). If the port cannot be created, print a clear error naming the Windows loopback requirement and fall back to FluidSynth if installed.

## 11. Main Loop (pseudocode)

```
init(config, camera, tracker, output)
while running:
    frame = camera.read(); frame = flip(frame)
    hands = tracker.detect(frame)          # {left: landmarks|None, right: ...}
    raw_degree, raw_zone = classify_left(hands.left)
    raw_level = classify_right(hands.right)
    committed = debounce.update(raw_degree, raw_zone, raw_level, hands_present)
    events = controller.step(committed)     # play / stop / none
    for e in events: output.apply(e)
    overlay.draw(frame, committed, chord_name, fps)
    show(frame); handle_hotkeys()
finally: output.panic()
```

## 12. Configuration Parameters

| Name | Default | Meaning |
| --- | --- | --- |
| `TONIC` | C (0) | Key root pitch class |
| `MODE` | major | major or natural minor |
| `STABLE_FRAMES` | 4 | Frames a gesture must hold to commit |
| `HAND_LOST_GRACE_MS` | 300 | Dropout tolerance before muting |
| `ZONE_LOW`, `ZONE_HIGH` | 0.66, 0.33 | Frame-height fractions for octave zones |
| `ZONE_DEADBAND` | 0.04 | Hysteresis around zone lines |
| `FINGER_EXT_RATIO` | 1.1 | Non-thumb extension sensitivity |
| `THUMB_EXT_RATIO` | 1.1 | Thumb extension sensitivity |
| `MIN_PALM_SIZE` | tuned | Reject far or partial hands |
| `VELOCITY` | 90 | MIDI velocity |
| `STRUM_MS` | 0 | Note-on stagger |
| `RETRIGGER_ON_OCTAVE` | true | Octave change re-fires chord |
| `SWAP_HANDEDNESS` | false | Fix inverted labels |
| `MIDI_PORT_NAME` | SeaChords | Virtual port name |

## 13. On-Screen Overlay and Hotkeys

Overlay shows: the two octave zone lines, current key and mode, degree number, chord name (for example Dm7), richness level, a MUTED indicator, detected hand labels, and FPS.

Hotkeys: `q` quit; `a` / `d` tonic down/up by a semitone; `m` toggle major/minor; `p` panic. Changing key triggers a panic first.

## 14. Edge Cases

- Both hands detected as the same label: use wrist X fallback (8.1).
- Thumb flicker on degrees 6 and 7: rely on debounce; tune `THUMB_EXT_RATIO`.
- Hand partially out of frame or too far: ignored via `MIN_PALM_SIZE`, treated as lost after grace.
- Fast sweep through intermediate finger counts: absorbed by debounce.
- Same chord requested twice: only via fist, then open.
- Camera fails to open: exit with a clear message.
- MIDI port unavailable: clear error and optional fallback.
- Low light or low FPS: log a warning when FPS drops below 20.

## 15. Testing and Acceptance Criteria

**Unit tests (no camera needed):**

- Chord generation matches the table in 7.2 for C major and A natural minor across all 7 degrees and all 5 levels.
- Avoid-note fallback triggers on exactly the degrees listed in 7.3.
- Sus rule outputs match section 7.4 (IV in C major yields sus2).
- Voicing placement and the 21-108 clamp.
- Debounce: a value changes only after `STABLE_FRAMES` identical frames; zone hysteresis works.
- Controller: matches every row of the event table in 9.3.
- Gesture classification on recorded landmark fixtures for all left and right gestures.

**Acceptance criteria:**

1. In any selectable key and mode, no produced note falls outside the scale.
2. Gesture-to-sound latency under 150 ms after the debounce window, measured camera-to-note-on.
3. Rapid 1-to-5 finger change on the right hand produces exactly one new chord.
4. Fist mutes immediately; opening re-strikes.
5. Losing a hand mutes after the grace window, with no stuck notes after exit or crash.

## 16. Suggested Build Order

1. `music/` module with full unit tests (pure Python, no hardware).
2. `output/midi_out.py` and a script that plays a test chord to confirm the port works in a DAW.
3. Camera, tracker and handedness self-check with an overlay showing labels.
4. Gesture classification, validated live and with fixtures.
5. Debounce and controller, tested against the event table.
6. Integration, overlay, hotkeys.
7. Tuning pass on thresholds and frame counts.

## 17. Future Work (not in v1)

- Selectable scale UI dropdown and additional scales/modes.
- Velocity from hand speed.
- Chord inversions or borrowed chords on a third axis.
- Progression recording and looping.
