# SeaChords delivery outcomes

## [ ] Fully client-side static web app and PWA

- Convert SeaChords from the Python/OpenCV + MJPEG web interface to a Vite + React + TypeScript + Tailwind app that runs 100% in the browser, with no Python backend and no camera video leaving the user's device.
- Produce a static build deployable to Vercel, Netlify or GitHub Pages; camera use is served from HTTPS (localhost is exempt).
- Make the app installable with its own manifest/icons and a service worker for the static shell and same-origin model/WASM assets; preserve camera permission requirements and document hosting/cache/MIME requirements.
- Use relative URLs and provide the complete route manifest for the implemented page routes.

## [ ] Framework-independent musical, gesture and controller engine

- Put all musical rules and controller behavior in pure, unit-tested TypeScript under `src/engine`; keep React/UI out of that folder. `src/engine/README.md` must say: “UI redesign tools must not modify this folder.”
- Preserve the SOP: left hand chooses scale degree 1–7 and octave zone (top +1, middle base, bottom -1) with 4% hysteresis; right hand chooses richness (triad, 7th, 9th, sus, wide spread); right fist mutes and reopening re-strikes; every played pitch is diatonic.
- Port chord stacking, all existing major/natural-minor chord behaviors, flat-9 avoid-note fallback, diatonic sus4/sus2 selection, spread voicing, MIDI 21–108 clamping, time-based debounce, hand-loss grace, and controller retrigger/mute rules faithfully from the Python implementation and SOP.
- Keep a stable public `useSeaChords()` interface exposing `{ status, fps, latencyMs, leftHand, rightHand, currentChord, scaleDegree, richness, octave, muted, events, settings }` and actions `start()`, `stop()`, `panic()`, `setKey()`, `setMode()`, `setSynthPreset()`, `setVolume()`, `swapHands()`, `calibrate()`; document it in `docs/ENGINE_API.md`.

## [ ] Local webcam tracking, correct hand roles and efficient rendering

- Use `@mediapipe/tasks-vision` HandLandmarker, VIDEO mode and `numHands: 2`; self-host its WASM and `.task` model under `public/`; attempt the GPU delegate and fall back to CPU if initialization fails.
- Request modest camera video, ideal 640×480 at 30fps; do not process 1080p.
- Run inference from `video.requestVideoFrameCallback()` with `requestAnimationFrame` fallback; never use `setInterval`; skip/drop a frame while inference is busy and never queue frames.
- Move inference to a worker with `ImageBitmap`/`OffscreenCanvas` only when supported by the selected runtime; otherwise retain a responsive frame-dropping implementation. Reuse objects in the hot path.
- Mirror the displayed video and overlay; centralize MediaPipe label conversion, mirrored wrist-x sanity fallback and manual swap in `src/engine/vision/handTracker.ts`. The raw and mirrored input conventions must both be tested; the player's actual left hand always controls degree/octave and actual right hand always controls richness/mute.
- Keep per-frame landmark data out of React state; draw the overlay imperatively on one canvas and update the HUD only on musical changes and at most about 10–15 times/second.
- Show an onboarding check “Raise your LEFT hand”; verify left-hand detection and offer the emergency swap if needed.
- Add a D-key debug panel with camera FPS, inference milliseconds, gesture-change-to-note-on latency estimate, and dropped-frame count.

## [ ] Browser audio and optional MIDI

- Create one shared AudioContext only from a first user gesture; schedule using `audioContext.currentTime` and use attack/release gain envelopes to avoid clicks.
- Provide Pad, Pluck, Organ and Electric Piano recipes, volume and a basic reverb amount.
- Support optional Web MIDI output and hide MIDI controls where unsupported.
- Panic and stop must release active notes; fist-to-open must re-strike the unchanged chord.

## [ ] Controls, history, persistence and robustness

- Offer all 12 keys and modes Major, Natural Minor, Dorian and Mixolydian, preserving the in-key avoid-note rules.
- Show current chord name and Roman numeral, plus the last 8 chords played.
- Provide a toggleable H-key gesture cheat sheet, draggable octave-zone calibration lines saved in localStorage, and keyboard/mouse fallback with number keys 1–7 plus a richness slider.
- Record played chords with timestamps and export a `.mid` file.
- Persist key, mode, synth preset, volume, swap-hands and zone lines in localStorage.
- Gracefully explain camera permission denial, no camera, WebGL unavailable, model-load failure and unsupported browsers; do not leave a blank screen. Show model loading progress.

## [ ] Tests, docs, quality gates and deployment readiness

- Use TypeScript strict mode, ESLint, Prettier and Vitest; port the existing pytest tests for chords, controller and gestures, and add handedness raw/mirrored fixtures and time-based debounce tests.
- Add GitHub Actions to lint, test and build on push; all configured checks pass.
- Move non-code documentation to `docs/`; rewrite README with what it is, live demo link if one exists, use/gesture instructions, `npm install`/`npm run dev` setup, project structure and deployment. Do not invent a live demo URL if not published.
- Document Chrome/Edge verification and any Firefox/Safari limitations; only report FPS/inference/latency values measured on a real device.
- Keep the untouched Python implementation preserved on the GitHub branch `legacy-python`; do not delete that branch.
