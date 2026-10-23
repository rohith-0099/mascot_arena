// Copies MediaPipe's WASM runtime into public/mediapipe so phones load it from
// our own origin (no CDN at the venue). Runs before `dev` and `build`.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const dest = join(root, "public/mediapipe");

if (!existsSync(src)) {
  console.error("copy-mediapipe: @mediapipe/tasks-vision is not installed (run npm install)");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
// the loader picks the SIMD or no-SIMD build at runtime; the "module" variant is unused
for (const f of readdirSync(src).filter((f) => f.startsWith("vision_wasm_") && !f.includes("_module_")))
  cpSync(join(src, f), join(dest, f));
