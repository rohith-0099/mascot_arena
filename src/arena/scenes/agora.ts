// "Agora" — a night-time Greek temple arena lit by braziers and an orange eclipse.
// Static layers are painted once into offscreen canvases; fire, glow, stars and
// the floor are drawn per frame. Layers scroll at different parallax factors.

import { type Ctx, bayer, ditherGlow, hexToRgb, makeCanvas, rand, ring, seeded } from "../pixel";
import { type Scene, WORLD_H, WORLD_W } from "./types";

const W = WORLD_W;
const H = WORLD_H;
const MAX_CAM = 40;

// parallax factors
const P_SKY = 0.05;
const P_FAR = 0.15;
const P_TEMPLE = 0.35;
const P_FRONT = 1.6;

const C = {
  bg: "#07080b",
  stone0: "#110e13",
  stone1: "#1a161c",
  stone2: "#241e25",
  stone3: "#30282e",
  stone4: "#3e3237",
  rim1: "#6b2a0c",
  rim2: "#b5480f",
  rim3: "#ff6a00",
  gold: "#ffd36e",
  orange: "#ff6a00",
  ember: "#e85d00",
  bronze0: "#2a1608",
  bronze1: "#5a3214",
  bronze2: "#8f5524",
  bronze3: "#d08a3c",
};

function layer(p: number): [HTMLCanvasElement, Ctx, number] {
  const m = Math.ceil(MAX_CAM * p) + 6;
  const [c, ctx] = makeCanvas(W + m * 2, H);
  return [c, ctx, m];
}

function drawLayer(ctx: Ctx, img: HTMLCanvasElement, p: number, cam: number) {
  const m = (img.width - W) / 2;
  ctx.drawImage(img, -m - Math.round(cam * p), 0);
}

/** per-pixel painter backed by ImageData (fast for one-off static layers) */
function paint(ctx: Ctx, w: number, h: number, fn: (x: number, y: number) => string | null) {
  const img = ctx.getImageData(0, 0, w, h);
  const cache: Record<string, [number, number, number]> = {};
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      if (!c) continue;
      const [r, g, b] = (cache[c] ??= hexToRgb(c));
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

function rect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// ------------------------------------------------------------------ sky
const ECLIPSE = { x: 240, y: 104, r: 58 };

function paintSky() {
  const [c, ctx, m] = layer(P_SKY);
  const w = c.width;
  const bands = ["#07080b", "#08090d", "#0b0a0f", "#100b0e", "#170d0c", "#1f110b"];
  const rnd = seeded(7);
  const ex = ECLIPSE.x + m,
    ey = ECLIPSE.y;
  paint(ctx, w, H, (x, y) => {
    const d = Math.hypot(x - ex, y - ey);
    // eclipse: dark disc, hot rim, dithered corona
    if (d < ECLIPSE.r - 0.5) return d > ECLIPSE.r - 3 && (x + y) % 2 === 0 ? "#160a06" : "#050507";
    if (d < ECLIPSE.r + 1.2) return C.gold;
    if (d < ECLIPSE.r + 2.5) return C.orange;
    const cor = 1 - (d - ECLIPSE.r) / 34;
    if (cor > 0) {
      const v = cor * cor;
      if (v > bayer(x, y) * 1.15) return v > 0.55 ? C.ember : v > 0.3 ? "#7a2a08" : "#3a1408";
    }
    const t = Math.min(1, Math.max(0, (y - 20) / 190)) * (bands.length - 1);
    const i = Math.floor(t);
    const f = t - i;
    return f > bayer(x, y) && i + 1 < bands.length ? bands[i + 1] : bands[i];
  });
  // stars
  for (let i = 0; i < 170; i++) {
    const x = Math.floor(rnd() * w);
    const y = Math.floor(rnd() * 150);
    if (Math.hypot(x - ex, y - ey) < ECLIPSE.r + 30) continue;
    const b = rnd();
    rect(ctx, b > 0.9 ? "#8a8494" : b > 0.6 ? "#3c3a46" : "#24232c", x, y, 1, 1);
  }
  return c;
}

// ------------------------------------------------------------------ far hills + distant ruins
function paintFar() {
  const [c, ctx, m] = layer(P_FAR);
  const w = c.width;
  const rnd = seeded(21);
  const hill = (x: number) =>
    176 -
    Math.sin(x * 0.011 + 1.3) * 9 -
    Math.sin(x * 0.027 + 0.4) * 5 -
    Math.sin(x * 0.07) * 2 -
    Math.max(0, 22 - Math.abs(x - (m + 70)) * 0.35) - // acropolis hill left
    Math.max(0, 16 - Math.abs(x - (m + 420)) * 0.3);
  for (let x = 0; x < w; x++) {
    const top = Math.round(hill(x));
    rect(ctx, "#0c0b10", x, top, 1, H - top);
    rect(ctx, "#17131a", x, top, 1, 1);
  }
  // distant acropolis temple silhouette
  const ax = m + 70,
    ay = Math.round(hill(m + 70));
  ctx.fillStyle = "#0f0d13";
  ctx.fillRect(ax - 22, ay - 4, 44, 4);
  for (let i = 0; i < 7; i++) ctx.fillRect(ax - 20 + i * 6, ay - 15, 3, 11);
  ctx.fillRect(ax - 22, ay - 18, 44, 3);
  for (let i = 0; i < 9; i++) ctx.fillRect(ax - 20 + i * 2.5, ay - 19 - Math.min(i, 8 - i), 3, 1);
  ctx.fillStyle = "#2a1610";
  ctx.fillRect(ax - 22, ay - 18, 44, 1);
  // broken columns along the ridge
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rnd() * w);
    if (Math.abs(x - ax) < 30) continue;
    const top = Math.round(hill(x));
    const h = 4 + Math.floor(rnd() * 10);
    rect(ctx, "#100e14", x, top - h, 2, h);
    if (rnd() > 0.5) rect(ctx, "#100e14", x - 1, top - h, 4, 1);
  }
  return c;
}

// ------------------------------------------------------------------ temple
function paintTemple() {
  const [c, ctx, m] = layer(P_TEMPLE);
  const xc = m + W / 2;

  // stylobate steps
  const steps = [
    [190, 196, 322],
    [196, 202, 338],
    [202, 208, 356],
  ];
  for (const [y0, y1, w] of steps) {
    rect(ctx, C.stone1, xc - w / 2, y0, w, y1 - y0);
    rect(ctx, C.stone3, xc - w / 2, y0, w, 1);
    rect(ctx, C.stone0, xc - w / 2, y1 - 1, w, 1);
  }

  // columns
  const n = 8,
    gap = 40;
  for (let i = 0; i < n; i++) {
    const cx = Math.round(xc + (i - (n - 1) / 2) * gap);
    const lightFromRight = cx < xc; // fire/eclipse glow comes from the centre
    const sx0 = cx - 6,
      sw = 13;
    // shaft with fluting
    for (let x = 0; x < sw; x++) {
      const edge = lightFromRight ? sw - 1 - x : x;
      let col = x % 3 === 0 ? C.stone1 : C.stone2;
      if (edge === 0) col = C.rim2;
      else if (edge === 1) col = C.rim1;
      else if (edge === 2) col = C.stone3;
      else if (edge >= sw - 2) col = C.stone0;
      rect(ctx, col, sx0 + x, 104, 1, 86);
    }
    // entasis hint: darker band at bottom
    rect(ctx, C.stone0, sx0, 186, sw, 1);
    // base
    rect(ctx, C.stone2, cx - 8, 187, 17, 3);
    rect(ctx, C.stone3, cx - 8, 187, 17, 1);
    // capital: echinus + abacus
    rect(ctx, C.stone2, cx - 8, 99, 17, 5);
    rect(ctx, C.stone3, cx - 8, 99, 17, 1);
    rect(ctx, C.stone0, cx - 7, 103, 15, 1);
    rect(ctx, C.stone3, cx - 10, 95, 21, 4);
    rect(ctx, C.stone4, cx - 10, 95, 21, 1);
    rect(ctx, lightFromRight ? C.rim2 : C.rim1, lightFromRight ? cx + 10 : cx - 10, 95, 1, 9);
  }

  // architrave
  const ew = 330;
  rect(ctx, C.stone2, xc - ew / 2, 83, ew, 12);
  rect(ctx, C.stone3, xc - ew / 2, 83, ew, 1);
  rect(ctx, C.stone0, xc - ew / 2, 94, ew, 1);
  rect(ctx, C.stone1, xc - ew / 2, 88, ew, 1);
  // frieze: triglyphs + metopes with tiny relief diamonds
  rect(ctx, C.stone1, xc - ew / 2, 72, ew, 11);
  for (let x = xc - ew / 2 + 2, k = 0; x < xc + ew / 2 - 6; x += 20, k++) {
    rect(ctx, C.stone3, x, 72, 7, 11);
    rect(ctx, C.stone0, x + 2, 73, 1, 10);
    rect(ctx, C.stone0, x + 4, 73, 1, 10);
    const mx = x + 13;
    ctx.fillStyle = k % 3 === 1 ? C.rim1 : C.stone3;
    ctx.fillRect(mx, 75, 1, 5);
    ctx.fillRect(mx - 2, 77, 5, 1);
  }
  // cornice
  rect(ctx, C.stone3, xc - ew / 2 - 6, 68, ew + 12, 4);
  rect(ctx, C.stone4, xc - ew / 2 - 6, 68, ew + 12, 1);
  rect(ctx, C.stone0, xc - ew / 2 - 6, 71, ew + 12, 1);

  // pediment
  const pw = ew / 2 + 6,
    apex = 30,
    base = 68;
  for (let y = apex; y < base; y++) {
    const half = ((y - apex) / (base - apex)) * pw;
    rect(ctx, C.stone1, xc - half, y, half * 2, 1);
    // raking cornice
    rect(ctx, C.stone4, xc - half - 1, y, 4, 1);
    rect(ctx, C.stone4, xc + half - 3, y, 4, 1);
    rect(ctx, C.stone2, xc - half + 3, y, 2, 1);
    rect(ctx, C.stone2, xc + half - 5, y, 2, 1);
  }
  // tympanum relief: laurel branches flanking the emblem
  for (const s of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const x = xc + s * (16 + k * 6);
      const y = 57 + Math.round(Math.sin(k * 0.35) * 2) + Math.round(k * 0.3);
      rect(ctx, "#3a2416", x, y, 3, 1);
      rect(ctx, "#3a2416", x + s, y - 1 - (k % 2), 2, 1);
      rect(ctx, "#523018", x + s * 2, y + 1 + (k % 2), 2, 1);
    }
  }
  // acroteria
  rect(ctx, C.stone4, xc - 3, apex - 6, 7, 5);
  rect(ctx, C.rim2, xc - 1, apex - 9, 3, 3);
  rect(ctx, C.stone4, xc - pw - 4, base - 6, 6, 6);
  rect(ctx, C.stone4, xc + pw - 2, base - 6, 6, 6);
  return c;
}

// ------------------------------------------------------------------ foreground columns
function paintFront() {
  const [c, ctx, m] = layer(P_FRONT);
  for (const side of [-1, 1] as const) {
    const cx = side < 0 ? m - 8 : m + W + 8;
    const sw = 46;
    const x0 = cx - sw / 2;
    for (let x = 0; x < sw; x++) {
      const edge = side < 0 ? sw - 1 - x : x; // inner edge faces the stage
      let col = x % 5 < 2 ? "#0b090d" : "#070608";
      if (edge === 0) col = C.rim3;
      else if (edge === 1) col = C.rim2;
      else if (edge <= 3) col = C.rim1;
      else if (edge <= 5) col = "#1c0e09";
      rect(ctx, col, x0 + x, 0, 1, H);
    }
    // huge capital near the top
    rect(ctx, "#09080b", x0 - 8, 0, sw + 16, 18);
    rect(ctx, "#09080b", x0 - 4, 18, sw + 8, 8);
    rect(ctx, C.rim1, side < 0 ? x0 + sw + 7 : x0 - 8, 0, 1, 18);
    rect(ctx, C.rim2, side < 0 ? x0 + sw + 3 : x0 - 4, 18, 1, 8);
    rect(ctx, "#1c0e09", x0 - 8, 17, sw + 16, 1);
  }
  return c;
}

function paintVignette() {
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2);
      const dy = (y - H / 2) / (H / 2);
      const v = Math.max(0, Math.hypot(dx * 0.9, dy * 1.1) - 0.72) * 1.6;
      if (v > bayer(x, y)) ctx.fillRect(x, y, 1, 1);
    }
  return c;
}

function paintShafts() {
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = "#ff9a50";
  const beams = [
    [150, 26],
    [215, 16],
    [300, 30],
  ];
  for (let y = 0; y < 210; y++)
    for (const [bx, bw] of beams) {
      const cx = bx + y * 0.32;
      for (let x = Math.floor(cx - bw); x < cx + bw; x++) {
        const v = (1 - Math.abs(x - cx) / bw) * (1 - y / 210) * 0.9;
        if (v > bayer(x, y)) ctx.fillRect(x, y, 1, 1);
      }
    }
  return c;
}

// ------------------------------------------------------------------ dynamic pieces
const MEANDER = [
  "##########",
  "#........#",
  "#.######.#",
  "#.#....#.#",
  "#.#.##.#.#",
  "#...#..#..",
  "#####..###",
];

function drawFlame(ctx: Ctx, cx: number, by: number, t: number, power: number) {
  const tq = Math.floor(t * 12); // stepped flame animation
  const r = seeded(tq * 131 + cx);
  const hw = 10;
  for (let x = -hw; x <= hw; x++) {
    const k = 1 - Math.abs(x) / (hw + 1);
    const h = Math.round((8 + 22 * power) * Math.pow(k, 0.8) * (0.65 + r() * 0.45));
    for (let y = 0; y < h; y++) {
      const f = y / h;
      ctx.fillStyle =
        f < 0.25 && Math.abs(x) < 4 ? "#fff4d0" : f < 0.45 ? C.gold : f < 0.7 ? "#ff8a3d" : f < 0.88 ? C.ember : "#8a2a00";
      ctx.fillRect(cx + x, by - y, 1, 1);
    }
    if (r() > 0.75) {
      ctx.fillStyle = C.ember;
      ctx.fillRect(cx + x, by - h - 2 - Math.floor(r() * 4), 1, 1);
    }
  }
}

function drawBrazier(ctx: Ctx, x: number, floor: number) {
  const top = floor - 40;
  // legs
  ctx.fillStyle = C.bronze1;
  for (let y = top + 8; y < floor; y++) {
    const k = (y - top - 8) / (floor - top - 8);
    ctx.fillRect(Math.round(x - 4 - k * 8), y, 2, 1);
    ctx.fillRect(Math.round(x + 3 + k * 8), y, 2, 1);
    ctx.fillRect(x, y, 1, 1);
  }
  rect(ctx, C.bronze0, x - 13, floor - 1, 28, 1);
  // bowl
  const rows = [12, 12, 11, 10, 8, 6, 4, 3];
  rows.forEach((hw, i) => {
    rect(ctx, i < 2 ? C.bronze3 : i < 4 ? C.bronze2 : C.bronze1, x - hw, top + i, hw * 2 + 1, 1);
  });
  rect(ctx, "#ffe2a8", x - 12, top, 4, 1);
  rect(ctx, C.bronze0, x - 12, top + 1, 25, 1);
}

export function createAgora(): Scene {
  const sky = paintSky();
  const far = paintFar();
  const temple = paintTemple();
  const front = paintFront();
  const vignette = paintVignette();
  const shafts = paintShafts();
  const fireGlow = ditherGlow(64, "#ff6a00", 5, 0.55);
  const eclipseGlow = ditherGlow(120, "#ff6a00", 6, 0.38);
  const floorGlow = ditherGlow(80, "#ff8a3d", 5, 0.5);
  const emblemGlow = ditherGlow(18, "#ffd36e", 4, 0.9);

  const floorY = 232;
  const BRAZIERS = [68, 412];
  const twinkles = Array.from({ length: 22 }, () => ({ x: rand(0, W), y: rand(4, 120), p: rand(0, 10), s: rand(0.5, 1.6) }));

  const scene: Scene = {
    id: "agora",
    floorY,
    intensity: 0,
    flarePoints: BRAZIERS.map((x) => ({ x, y: floorY - 44 })),

    drawBack(ctx, t, cam, focusX) {
      const I = scene.intensity;
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);
      drawLayer(ctx, sky, P_SKY, cam);

      // eclipse breathing glow
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55 + Math.sin(t * 0.8) * 0.1 + I * 0.35;
      ctx.drawImage(eclipseGlow, ECLIPSE.x - 120 - Math.round(cam * P_SKY), ECLIPSE.y - 120);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // orange twinkles
      for (const s of twinkles) {
        const v = Math.sin(t * s.s * 2 + s.p);
        if (v < 0.55) continue;
        const x = Math.round(s.x - cam * P_SKY),
          y = Math.round(s.y);
        ctx.fillStyle = v > 0.92 ? "#ffd36e" : C.ember;
        ctx.fillRect(x, y, 1, 1);
        if (v > 0.85) {
          ctx.fillRect(x - 1, y, 3, 1);
          ctx.fillRect(x, y - 1, 1, 3);
        }
      }

      drawLayer(ctx, far, P_FAR, cam);

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.07 + Math.sin(t * 0.6) * 0.025 + I * 0.08;
      ctx.drawImage(shafts, -Math.round(cam * 0.2), 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      drawLayer(ctx, temple, P_TEMPLE, cam);
      // glowing emblem in the pediment
      const ex = W / 2 - Math.round(cam * P_TEMPLE);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.6 + Math.sin(t * 2) * 0.2 + I * 0.4;
      ctx.drawImage(emblemGlow, ex - 18, 56 - 18);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = C.orange;
      ctx.fillRect(ex - 3, 53, 7, 6);
      ctx.fillRect(ex - 4, 54, 9, 4);
      ctx.fillStyle = C.gold;
      ctx.fillRect(ex, 49, 1, 4);
      ctx.fillRect(ex - 1, 47, 3, 2);
      ctx.fillStyle = "#1a0e08";
      ctx.fillRect(ex - 2, 55, 1, 1);
      ctx.fillRect(ex + 2, 55, 1, 1);

      // ---- floor / stage platform ----
      for (let y = 208; y < H; y++) {
        const k = (y - 208) / 40;
        ctx.fillStyle = y < 244 ? (k + bayer(0, y) * 0.3 > 0.5 ? "#161217" : "#120f14") : "#09080b";
        ctx.fillRect(0, y, W, 1);
      }
      rect(ctx, C.stone3, 0, 208, W, 1);
      // perspective tile lines
      ctx.fillStyle = "#1f1920";
      for (const y of [211, 215, 220, 227, 236]) ctx.fillRect(0, y, W, 1);
      for (let i = -14; i <= 14; i++) {
        for (let y = 209; y < 244; y++) {
          const k = (y - 208) / 36;
          const p = P_TEMPLE + (1 - P_TEMPLE) * k;
          const sx = W / 2 + i * (18 + 34 * k) - cam * p;
          ctx.fillRect(Math.round(sx), y, 1, 1);
        }
      }
      // warm reflection under the focus actor
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.45 + I * 0.4;
      ctx.save();
      ctx.translate(Math.round(focusX - cam) - 80, floorY - 16);
      ctx.scale(1, 0.22);
      ctx.drawImage(floorGlow, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      // stage ring
      ctx.fillStyle = I > 0.3 ? C.gold : "#5a260c";
      ring(ctx, focusX - cam, floorY, 66 + Math.sin(t * 2) * 1.5, 1, 0.14);
      ctx.fillStyle = "#3a1a0a";
      ring(ctx, focusX - cam, floorY, 76, 1, 0.14);

      // stage lip with meander band
      rect(ctx, "#ff6a00", 0, 244, W, 1);
      rect(ctx, "#5a220a", 0, 245, W, 1);
      rect(ctx, "#140d0c", 0, 246, W, 12);
      const off = Math.round(-cam) % 10;
      ctx.fillStyle = "#7a3410";
      for (let x = -10; x < W + 10; x += 10)
        for (let r = 0; r < MEANDER.length; r++)
          for (let q = 0; q < 10; q++) if (MEANDER[r][q] === "#") ctx.fillRect(x + q + off, 248 + r, 1, 1);
      rect(ctx, "#5a220a", 0, 257, W, 1);

      // braziers + fire
      for (const bx of BRAZIERS) {
        const x = Math.round(bx - cam);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.55 + Math.sin(t * 9 + bx) * 0.08 + Math.sin(t * 23 + bx) * 0.05 + I * 0.4;
        ctx.drawImage(fireGlow, x - 64, floorY - 40 - 64);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        drawBrazier(ctx, x, floorY + 4);
        drawFlame(ctx, x, floorY - 37, t + bx, 0.7 + I * 0.9);
      }
    },

    drawFront(ctx, t, cam) {
      drawLayer(ctx, front, P_FRONT, cam);
      ctx.drawImage(vignette, 0, 0);
    },

    ambient(dt, p, cam) {
      const I = scene.intensity;
      for (const bx of BRAZIERS) {
        const rate = 14 + I * 60;
        if (Math.random() < rate * dt)
          p.add({
            kind: "ember",
            x: bx + rand(-6, 6),
            y: floorY - 44,
            vx: rand(-8, 8),
            vy: rand(-45, -20) * (1 + I),
            drag: 0.005,
            max: rand(1.5, 3.5),
            colors: ["#fff4d0", "#ffd36e", "#ff8a3d", "#e85d00", "#8a2a00"],
            glow: true,
          });
      }
      if (Math.random() < 6 * dt)
        p.add({
          kind: "dust",
          x: rand(0, W) + cam,
          y: rand(60, 240),
          vx: rand(-4, 4),
          vy: rand(-6, -2),
          max: rand(4, 8),
          colors: ["#4a3a36", "#6b4a3a", "#4a3a36"],
          front: Math.random() < 0.3,
        });
    },
  };
  return scene;
}
