# SeaChords engine and UI API

The browser app exposes a single React adapter, `useSeaChords()`, from `src/hooks/useSeaChords.ts`. The UI should render the returned snapshot and call its actions. It must not inspect frame landmarks or implement music, gesture classification, camera scheduling, or note triggering itself.

## Snapshot

`useSeaChords()` returns the following stable state fields:

| Field                                                                       | Meaning                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                                                                    | `idle`, `loading`, `running`, or `error`.                                                                                                                                                                                                         |
| `fps`                                                                       | Camera frames observed per second, averaged over the most recent half-second window.                                                                                                                                                              |
| `latencyMs`                                                                 | Estimate from the most recent raw gesture change to the resulting note-on controller action. It is meaningful only after a note event.                                                                                                            |
| `leftHand` / `rightHand`                                                    | Readouts for the hands assigned to the mirrored-view LEFT and RIGHT roles, or `null` when unavailable. They contain role, finger count, thumb status, classified value, and normalized wrist Y. These are HUD summaries, not per-frame landmarks. |
| `currentChord`                                                              | Current diatonic chord name, or `null` while muted.                                                                                                                                                                                               |
| `roman`                                                                     | Current Roman numeral label, or `—` while muted.                                                                                                                                                                                                  |
| `scaleDegree`                                                               | Committed degree, from 1 through 7.                                                                                                                                                                                                               |
| `richness`                                                                  | Committed right-hand richness, from 0 (mute) through 5 (wide spread).                                                                                                                                                                             |
| `octave`                                                                    | Committed octave zone: `1` (upper) or `0` (lower).                                                                                                                                                                                                |
| `muted`                                                                     | Whether the controller is currently sounding a chord.                                                                                                                                                                                             |
| `events`                                                                    | The most recent eight note-on chord events, oldest first; each contains `atMs`, `chordName`, `roman`, and MIDI `notes`.                                                                                                                           |
| `settings`                                                                  | Persisted key/mode/synth/volume/reverb/hand-swap/octave-boundary/MIDI settings.                                                                                                                                                                   |
| `inferenceMs`, `droppedFrames`                                              | Vision runtime duration and count of frames skipped while inference was busy.                                                                                                                                                                     |
| `delegate`, `workerInference`, `progress`, `message`                        | Vision backend and lifecycle feedback for setup/error UI.                                                                                                                                                                                         |
| `recording`, `midiSupported`, `midiDevice`, `swapSuggested`, `keyboardMode` | Optional-feature state used by the supplied UI.                                                                                                                                                                                                   |

The per-frame 21-point landmark arrays never enter React state. They move from the video scheduler to the tracker, gesture classifier, and imperative overlay canvas; only summarized HUD snapshots are emitted, with a maximum routine update cadence of 12 Hz. Musical state changes can notify immediately.

## Actions

- `start()` — from a user gesture, unlocks the shared audio graph, asks for a 640×480/30fps camera stream, loads the same-origin model/WASM, and starts tracking.
- `stop()` — stops the camera/tracker, clears the overlay and releases audio/MIDI output.
- `panic()` — immediately releases all active audio/MIDI notes without stopping the camera.
- `setKey(tonic)` — sets tonic pitch class `0…11` and recomputes/re-strikes an active chord.
- `setMode(mode)` — selects `major`, `natural_minor`, `dorian`, or `mixolydian`.
- `setSynthPreset(preset)` — selects `pad`, `pluck`, `organ`, or `electric-piano`.
- `setVolume(value)` / `setReverb(value)` — update a normalized value from `0…1` and persist it.
- `swapHands()` — toggles the persisted emergency role swap.
- `calibrate(zoneBoundary)` — updates and persists the normalized Y boundary between the two playable zones; the default is `0.5`. The zone above the boundary plays octave `+1`, the zone below it plays octave `0`, and the controller retains a 4% deadband around the boundary.
- `setKeyboardMode(enabled)`, `setKeyboardDegree(1…7)`, `setKeyboardRichness(0…5)` — camera-free fallback controls.
- `setMidiEnabled(enabled)` — requests optional Web MIDI output when supported; returns the connected output name or `null`.
- `startRecording()`, `stopRecording(download?)`, `exportRecording()` — record timestamped chord transitions and download a Standard MIDI File (`.mid`).

## Performance and ownership boundaries

`src/engine` is the source of truth for music, gesture interpretation, debounce, controller behavior, audio, local vision and hand mapping. React is confined to `src/ui` and `src/hooks`. Do not add React, styling, DOM presentation, or visual redesign code to the engine. Gesture values settle for 60 ms, independent of camera frame rate. The vision runtime uses transferable `ImageBitmap` frames and a worker where the browser supports the required runtime; it falls back to CPU-compatible main-thread inference when worker setup fails. The camera scheduler never queues frames: it drops a frame if the previous inference has not completed.

The MediaPipe model and WebAssembly files load from `public/mediapipe/`; video frames are not uploaded. Camera access requires a secure context (HTTPS or localhost) and an explicit browser permission. Browser CPU/GPU performance varies; use the `D` diagnostics panel to inspect the actual device rather than treating a target as a measured result.
