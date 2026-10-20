# SeaChords browser app — implementation plan

## Product and implementation

Replace the Python/OpenCV + MJPEG runtime on the primary branch with a static, fully client-side Vite + React + TypeScript + Tailwind application. The browser acquires the webcam, processes its frames locally, classifies hands, generates diatonic chords and synthesizes sound. No camera frame is sent to a server. The legacy Python implementation remains available on the separate `legacy-python` branch. Use the existing SeaChords SOP as the musical behavior reference; retain its chord stacking, avoid-note fallback, sus selection, spread voicing, MIDI-range clamping, hand-loss grace behavior, mute/restrike transitions and octave hysteresis. The requested two-zone override maps below the boundary to octave `0` and above it to octave `+1`. The explicit project notes supersede the older SOP input convention for the new browser path: submit raw camera frames to the model, mirror only the displayed video/canvas, and centralize label inversion plus mirrored wrist-position fallback in `engine/vision/handTracker.ts`. Tests cover raw and mirrored paths.

The engine is pure TypeScript and has no React, DOM or UI imports except the narrowly isolated camera/audio/MIDI/MediaPipe adapters within `engine/vision` and `engine/audio`. `useSeaChords()` is the stable UI-facing adapter to engine state/actions. Keep per-frame landmarks and hot-path data in refs/worker messages, not React state. Draw video and landmarks on one canvas; publish HUD updates only on semantic changes and a capped 10–15 Hz status cadence. Use `requestVideoFrameCallback` with RAF fallback, never an interval, avoid an inference queue, and drop frames whenever the worker is occupied. Request 640×480/30fps, and measure inference and camera FPS on-device; do not promise a measured performance target without a real camera run.

Run MediaPipe Tasks Vision HandLandmarker in VIDEO mode with two hands, attempt GPU then recreate with CPU after GPU setup failure, and serve the WASM bundle plus task model from the app's own `public/` directory. Move inference into a worker using transferable `ImageBitmap` frames where supported. If that route is not supported by the selected MediaPipe runtime, retain frame-dropping and imperative rendering and document the compatible fallback. Reuse scratch buffers in the frame/gesture hot paths.

Create one lazy shared AudioContext on the first user gesture; use `currentTime` scheduling and gain envelopes for attack/release. Add Pad, Pluck, Organ and Electric Piano recipes, volume and a modest generated reverb path, with an optional Web MIDI output that is hidden where unsupported. The engine API exposes status, FPS, latency, hands, chord/degree/richness/octave/mute, events/settings and the named actions requested in the specification. Persist selected settings and emergency handedness swap in localStorage.

Implement the supplied advanced interactions after the core works: twelve key choices; Major, Natural Minor, Dorian and Mixolydian; chord name/Roman numeral and last eight chords; H help overlay; octave-boundary calibration; timestamped chord capture and MIDI-file export; and keyboard/mouse fallback. Preserve the working behavior of both hands and never add chromatic notes.

## Serving and project structure

The production artifact is static Vite output. Development and optional Manus Preview use the project's Vite server; the deployed version can be hosted by Vercel, Netlify or GitHub Pages over HTTPS. There is no Python server or application backend. A service worker caches the static app shell and same-origin model/WASM assets for repeat/offline loading, with camera permission still granted by the browser. Add correct PWA manifest/icons, route declaration for `/`, cache headers where hosting supports them, and user-facing errors for permission denial, missing camera, unsupported browser/WebGL, model/WASM load errors and insecure origins. Keep all browser URLs relative.

```text
src/
  engine/
    music/       scale definitions, diatonic chords, voicing, names and Roman numerals
    gesture/    finger counting, classification and time-based debounce
    controller/ time-based grace/mute/retrigger controller
    audio/       shared Web Audio synth and optional MIDI output
    vision/      camera lifecycle, worker, MediaPipe hand tracking and hand mapping
    index.ts     stable framework-agnostic engine API
    README.md    engine ownership boundary for future UI redesigns
  hooks/         useSeaChords React adapter; throttled snapshots only
  ui/            React dashboard, video/canvas overlay, HUD, controls and dialogs
  config.ts      tunable behavior and camera constants
public/
  mediapipe/     self-hosted WASM and task model
  icons/         PWA icons
  manifest.webmanifest, service worker and manus-routes.json
 tests/           Vitest unit tests for music, gestures, handedness, debounce and controller
 docs/            API, operating/deployment notes and migrated SOP
```

Existing source documents are retained under `docs/`; Python runtime code and pytest files are not retained on the new primary branch because the original implementation remains on the `legacy-python` branch.

## Design

Reuse the repository's existing dark, neon instrument-console style rather than invent a new visual direction. Keep its concise dashboard structure, cyan/magenta/green status accents and mono-spaced readouts, but prioritize legibility, camera area and reliable controls over decorative polish.

- **Design movement:** restrained live-performance instrument console, continuing the current SeaChords dark dashboard.
- **Core principles:** readable state at a glance; clear camera/audio readiness; no frame-rate-bound React rendering; safe, immediate mute/panic.
- **Color philosophy:** near-black/navy surfaces reduce glare; cyan identifies musical focus; magenta marks richness/control; green indicates active audio; amber/red signal warning or mute.
- **Layout paradigm:** compact asymmetric console with camera/canvas as the primary surface and chord/HUD/settings grouped beside or below it; responsive single column on small screens.
- **Signature elements:** a two-tone SeaChords mark; a fine cyan octave boundary; concise monospaced performance telemetry.
- **Interaction philosophy:** user-initiated camera/audio permission, visible status and predictable controls; mute/panic never hidden behind a gesture.
- **Animation:** avoid layout motion and continuous decoration; use short state transitions only when a musical value or connection status changes.
- **Typography:** use system UI for controls/body and a local system monospace stack for chord/telemetry; do not require remote font fetches.
- **Brand essence:** a camera-driven, in-key chord instrument for hands-on improvisers; immediate, musical, approachable.
- **Brand voice:** short, operational labels. Examples: “Allow camera to begin.” “Fist closes the sound; reopen to strike again.”
- **Wordmark & logo:** compact “S” waveform/chord-line mark derived from the existing gradient S badge.
- **Signature brand color:** SeaChords cyan, carried forward from the existing `#00f0ff` accent.

## Constraints and compatibility

Keep the requested UI minimal for later redesign. Do not introduce features beyond the attached specification. MediaPipe assets must be same-origin. Prefer Chrome/Edge for the first verified target; document any Firefox/Safari limitations confirmed from current supported APIs. Do not claim FPS/latency measurements from code or a simulated environment. Do not publish a public deployment unless requested; static deployment files and instructions are in scope. The managed preview project's canonical repository remains Manus-managed; the existing GitHub repository remains the source the user asked to update, so changes will be synchronized and pushed there separately without attempting an unsupported in-place canonical repository rebind.
