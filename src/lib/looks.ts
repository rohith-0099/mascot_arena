"use client";

/**
 * Photo "looks", baked on the phone so the moderator approves exactly what the
 * big screen will show. Cutouts get sticker outlines; full photos get a grade.
 */
export type Look = "sticker" | "hero" | "neon" | "pixel";

export const LOOKS: { id: Look; label: string }[] = [
  { id: "sticker", label: "STICKER" },
  { id: "hero", label: "HERO" },
  { id: "neon", label: "NEON" },
  { id: "pixel", label: "8-BIT" },
];

const INK = "#07080b";
const PAD = 22;

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/** `src`'s silhouette grown by `r` px, filled with `color`, drawn centred in a PAD-padded canvas */
function outline(src: HTMLCanvasElement, r: number, color: string, alpha = 1) {
  const c = canvas(src.width + PAD * 2, src.height + PAD * 2);
  const ctx = c.getContext("2d")!;
  // shifted copies on two rings: the inner ring fills gaps around thin bits (hair)
  for (const rr of [r * 0.5, r]) {
    const steps = Math.max(16, Math.round(rr * 1.5));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      ctx.drawImage(src, PAD + Math.cos(a) * rr, PAD + Math.sin(a) * rr);
    }
  }
  ctx.globalCompositeOperation = "source-in";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

function mapPixels(src: HTMLCanvasElement, fn: (px: Uint8ClampedArray, i: number) => void) {
  const c = canvas(src.width, src.height);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) fn(img.data, i);
  ctx.putImageData(img, 0, 0);
  return c;
}

const contrast = (v: number, k: number) => (v - 128) * k + 128;

const warm = (src: HTMLCanvasElement) =>
  mapPixels(src, (p, i) => {
    p[i] = contrast(p[i] * 1.08 + 10, 1.12);
    p[i + 1] = contrast(p[i + 1] * 1.02 + 2, 1.12);
    p[i + 2] = contrast(p[i + 2] * 0.86, 1.12);
  });

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// deep violet → hot magenta → electric cyan
const DUO = [
  [26, 6, 51],
  [255, 43, 214],
  [127, 249, 255],
];
const duotone = (src: HTMLCanvasElement) =>
  mapPixels(src, (p, i) => {
    const l = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255;
    const t = Math.min(1, Math.max(0, (l - 0.08) / 0.84));
    const [a, b, u] = t < 0.5 ? [DUO[0], DUO[1], t * 2] : [DUO[1], DUO[2], (t - 0.5) * 2];
    for (let k = 0; k < 3; k++) p[i + k] = lerp(a[k], b[k], u);
  });

const cool = (src: HTMLCanvasElement) =>
  mapPixels(src, (p, i) => {
    p[i] = contrast(p[i] * 0.95, 1.15);
    p[i + 1] = contrast(p[i + 1] * 1.0, 1.15);
    p[i + 2] = contrast(p[i + 2] * 1.1 + 12, 1.15);
  });

/** chunky pixels, 6 levels per channel, hard alpha; cutouts get a white + ink pixel outline */
function pixel(src: HTMLCanvasElement, cut: boolean) {
  const block = Math.max(4, Math.round(src.width / 90));
  const pad = cut ? 3 : 0;
  const sw = Math.ceil(src.width / block);
  const sh = Math.ceil(src.height / block);
  const small = canvas(sw + pad * 2, sh + pad * 2);
  const sctx = small.getContext("2d")!;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(src, pad, pad, sw, sh);
  const img = sctx.getImageData(0, 0, small.width, small.height);
  const d = img.data;
  const q = (v: number) => Math.round((v / 255) * 5) * 51;
  const solid = new Uint8Array(small.width * small.height);
  for (let i = 0; i < solid.length; i++) {
    const o = i * 4;
    solid[i] = d[o + 3] > 110 ? 1 : 0;
    // a little saturation before quantising keeps faces from going grey
    const m = (d[o] + d[o + 1] + d[o + 2]) / 3;
    for (let k = 0; k < 3; k++) d[o + k] = q(m + (d[o + k] - m) * 1.25);
    d[o + 3] = solid[i] ? 255 : 0;
  }
  if (cut) {
    // two 1-block rings: white next to the subject, ink outside that
    const W = small.width;
    const H = small.height;
    for (const [level, rgba] of [
      [2, [242, 240, 234, 255]],
      [3, [7, 8, 11, 255]],
    ] as const) {
      const ring: number[] = [];
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (solid[i]) continue;
          const near = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => solid[(y + dy) * W + (x + dx)] > 0));
          if (near) ring.push(i);
        }
      for (const i of ring) {
        solid[i] = level;
        d.set(rgba, i * 4);
      }
    }
  }
  sctx.putImageData(img, 0, 0);
  const out = canvas(small.width * block, small.height * block);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

/** layer outlines (outermost first) under the subject */
function stack(subject: HTMLCanvasElement, rings: [number, string, number?][]) {
  const out = canvas(subject.width + PAD * 2, subject.height + PAD * 2);
  const ctx = out.getContext("2d")!;
  for (const [r, color, a] of rings) ctx.drawImage(outline(subject, r, color, a), 0, 0);
  ctx.drawImage(subject, PAD, PAD);
  return out;
}

export function renderLook(src: HTMLCanvasElement, look: Look, cut: boolean): HTMLCanvasElement {
  if (look === "pixel") return pixel(src, cut);
  if (!cut) return look === "hero" ? warm(src) : look === "neon" ? duotone(src) : src;
  switch (look) {
    case "sticker":
      return stack(src, [
        [20, INK],
        [15, "#ffffff"],
      ]);
    case "hero":
      return stack(warm(src), [
        [21, INK],
        [16, "#ffd36e"],
        [8, "#ff6a00"],
      ]);
    case "neon":
      return stack(cool(src), [
        [22, "#ff2bd6", 0.35],
        [16, "#ff2bd6", 0.7],
        [8, "#7ff9ff"],
      ]);
  }
}
