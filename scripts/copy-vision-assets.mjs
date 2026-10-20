import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(projectRoot, 'node_modules/@mediapipe/tasks-vision/wasm');
const destination = path.join(projectRoot, 'public/mediapipe/wasm');
const runtimeFiles = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await Promise.all(runtimeFiles.map((file) => cp(path.join(source, file), path.join(destination, file))));
console.log(`Self-hosted ${runtimeFiles.length} MediaPipe WASM assets at ${path.relative(projectRoot, destination)}`);
