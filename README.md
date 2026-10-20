# SeaChords — Air-Chord Instrument

SeaChords is a two-handed webcam instrument. Finger gestures select a scale degree and chord color; wrist height shifts the octave. The browser creates a diatonic synth chord locally, so no camera frames leave the device.

**Live demo:** Not published yet. The repository is configured to build a static site for HTTPS hosting.

## Run it

Use Node.js 22.13 or newer and npm 10.9.2 (pinned by `packageManager`). From the project directory:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, allow camera access, and start the camera. The hand model and MediaPipe WebAssembly runtime are self-hosted under `public/mediapipe/`; loading them does not depend on a vision CDN. The audio context starts from the camera-start user gesture. Camera use on a deployed site requires HTTPS.

Other useful commands:

```bash
npm test             # Vitest suite
npm run lint         # ESLint, zero warnings
npm run typecheck    # strict TypeScript
npm run build        # typecheck and static production build to dist/
```

## Play

| Hand           | Gesture                           | Result                                               |
| -------------- | --------------------------------- | ---------------------------------------------------- |
| **Left**       | 1–5 extended fingers              | Scale degree 1–5                                     |
| **Left**       | Closed fist                       | Degree 6                                             |
| **Left**       | Thumb only                        | Degree 7                                             |
| **Left wrist** | Top / middle / bottom camera zone | +1 / base / −1 octave, with hysteresis               |
| **Right**      | Fist or thumb only                | Mute/release; reopening re-strikes                   |
| **Right**      | 1–5 extended fingers              | Triad / 7th / 9th / suspended / wide-spread richness |

Select any of the 12 keys and Major, Natural Minor, Dorian, or Mixolydian. All voices stay diatonic to the selected scale. Use `D` for FPS/inference/gesture-to-note/dropped-frame diagnostics, `H` for the gesture guide, `Esc` for panic mute, and `1`–`7` for the keyboard fallback. The settings panel includes Pad, Pluck, Organ and Electric Piano sounds, volume, reverb, optional Web MIDI, octave calibration, chord history and MIDI recording/export.

## Privacy and compatibility

The camera stream is processed locally in the browser. No frame, landmark stream, account, or backend service is sent or required by this static app. Browser permission and camera access remain under the user's control; stopping the camera releases the stream. After the shell/model assets have been cached, the static app can load offline, but camera availability and browser permission still apply.

Chrome and Edge are the recommended targets for initial use. The project has not been verified across every Firefox or Safari release; graphics acceleration, worker/WebAssembly behavior and speed can vary. SeaChords attempts the GPU vision delegate and falls back to CPU. Web MIDI is optional and is only shown when the browser exposes the Web MIDI API.

## Project structure

```text
src/
  engine/       music, gestures, debounce, controller, audio, MIDI, camera and vision
  hooks/        useSeaChords() adapter for UI state/actions
  ui/           React instrument console and styles
  config.ts     camera, timing, octave and HUD constants
public/
  mediapipe/    local hand-landmarker model and copied WASM runtime
  icons/        app/favicon and install icons
  manifest.webmanifest, sw.js, manus-routes.json
scripts/        copy the installed MediaPipe WASM bundle into public/
docs/           stable engine API and preserved Python-era documentation
```

`src/engine/README.md` protects the engine boundary for future UI redesigns. See [`docs/ENGINE_API.md`](docs/ENGINE_API.md) for the public interface.

## Static hosting

Build with `npm run build` and deploy the contents of `dist/` to Vercel, Netlify, GitHub Pages or another static HTTPS host. Relative asset URLs support project subpaths such as GitHub Pages. The production output includes the local `.task` model and WASM bundle. `vercel.json` and `public/_headers` set explicit MIME/cache headers for Vercel and Netlify; for another host, serve `.wasm` as `application/wasm`, serve the task file as binary, and revalidate `sw.js` so offline updates can reach clients. The `Deploy SeaChords to GitHub Pages` workflow runs the quality checks, builds `dist/`, and publishes it automatically after pushes to `main`.

To enable the first GitHub Pages deployment, open the repository's **Settings → Pages**, set **Source** to **GitHub Actions**, and wait for the `Deploy SeaChords to GitHub Pages` workflow to finish. The site will then be available at `https://shivansmh.github.io/SeaChords/`. Future pushes to `main` redeploy it automatically.

The hosted build must serve all app paths from `index.html` if you later add client-side routes. Camera access is not available on insecure non-localhost HTTP.
