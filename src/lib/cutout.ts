"use client";

import type { ImageSegmenter } from "@mediapipe/tasks-vision";

/**
 * On-device person cutout (MediaPipe selfie segmenter, Apache-2.0). Runs on the
 * phone: the photo never leaves it unprocessed, and there's no cloud API. The
 * WASM runtime and model are served from our own origin (see
 * scripts/copy-mediapipe.mjs and public/models).
 */
let segmenter: Promise<ImageSegmenter> | null = null;

function load() {
  segmenter ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe");
    return ImageSegmenter.createFromOptions(fileset, {
      // CPU is plenty for one 256×256 inference and avoids flaky mobile WebGL
      baseOptions: { modelAssetPath: "/models/selfie_segmenter.tflite", delegate: "CPU" },
      runningMode: "IMAGE",
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  })();
  // a failed load (offline, old browser) may be retried later
  segmenter.catch(() => (segmenter = null));
  return segmenter;
}

/** start downloading the model early (e.g. when a photo is picked) */
export function preloadCutout() {
  void load().catch(() => {});
}

/** Fraction of the image that must be "person" for a cutout to count. */
const MIN_COVERAGE = 0.03;

/**
 * Returns a copy of `src` with the background made transparent, or null when
 * no person was found (the caller keeps the original photo).
 */
export async function cutout(src: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
  const seg = await load();
  let mask: Float32Array | null = null;
  let mw = 0;
  let mh = 0;
  seg.segment(src, (r) => {
    const m = r.confidenceMasks?.[0];
    if (!m) return;
    mask = m.getAsFloat32Array().slice(); // the mask is freed after this callback
    mw = m.width;
    mh = m.height;
  });
  const conf = mask as Float32Array | null;
  if (!conf || mw !== src.width || mh !== src.height) return null;

  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const px = img.data;
  let fg = 0;
  for (let i = 0; i < conf.length; i++) {
    // smoothstep(0.3, 0.7): crisp edges without a hard, jaggy threshold
    const t = Math.min(1, Math.max(0, (conf[i] - 0.3) / 0.4));
    const a = t * t * (3 - 2 * t);
    if (a > 0.5) fg++;
    px[i * 4 + 3] = Math.round(px[i * 4 + 3] * a);
  }
  if (fg / conf.length < MIN_COVERAGE) return null;
  ctx.putImageData(img, 0, 0);
  return out;
}
