// Low-level pixel helpers. Everything is drawn with integer fillRects so the
// world canvas stays crisp when it is upscaled with `image-rendering: pixelated`.

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export function px(ctx: Ctx, x: number, y: number, w = 1, h = 1) {
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// 4x4 Bayer matrix, normalised to 0..1, for ordered dithering.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export function bayer(x: number, y: number) {
  return BAYER4[(y & 3) * 4 + (x & 3)];
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1)}`;
}

/** Radial glow quantised into dithered bands — reads as pixel art, not a soft gradient. */
export function ditherGlow(radius: number, color: string, bands = 4, strength = 1): HTMLCanvasElement {
  const size = radius * 2;
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = color;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - radius, y + 0.5 - radius) / radius;
      if (d >= 1) continue;
      const v = Math.pow(1 - d, 1.6) * strength;
      const q = Math.floor(v * bands) / bands;
      const frac = v * bands - Math.floor(v * bands);
      const level = q + (frac > bayer(x, y) ? 1 / bands : 0);
      if (level <= 0) continue;
      ctx.globalAlpha = Math.min(1, level);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  return c;
}

/** Pixel ring via midpoint circle, thickness in px. */
export function ring(ctx: Ctx, cx: number, cy: number, r: number, thick = 1, squashY = 1) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  for (let t = 0; t < thick; t++) {
    const rr = Math.max(0, Math.round(r - t));
    const steps = Math.max(12, Math.ceil(rr * 6.4));
    let lastX = NaN;
    let lastY = NaN;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = cx + Math.round(Math.cos(a) * rr);
      const y = cy + Math.round(Math.sin(a) * rr * squashY);
      if (x === lastX && y === lastY) continue;
      ctx.fillRect(x, y, 1, 1);
      lastX = x;
      lastY = y;
    }
  }
}

export function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Deterministic PRNG so static scene layers look identical on every load. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
