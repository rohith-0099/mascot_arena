// Procedural sprite rasteriser. A Pose (squash, arms, eyes, mouth…) plus a
// CharacterDef is rasterised into a 56×56 transparent frame. All characters
// share the same body maths, so silhouettes and proportions stay consistent.

import type { CharacterDef } from "./characters";
import { makeCanvas } from "./pixel";

export const SPRITE_W = 56;
export const SPRITE_H = 56;
/** feet touch this row */
export const GROUND_Y = 52;
const CX = 28;

export type EyeState = "open" | "half" | "closed" | "happy" | "fierce" | "wide" | "star";
export type MouthState = "smile" | "open" | "grin" | "shout" | "flat" | "none";
export type ArmPose =
  | "rest"
  | "out"
  | "up"
  | "wave1"
  | "wave2"
  | "punch"
  | "back"
  | "swingF"
  | "swingB"
  | "hidden";

export interface Pose {
  sx?: number;
  sy?: number;
  /** body lift above the feet (jumps) */
  dy?: number;
  /** horizontal body shift (lunges) */
  dx?: number;
  /** top-of-body lean in px, positive = forward */
  lean?: number;
  eyes?: EyeState;
  look?: number;
  lookY?: number;
  mouth?: MouthState;
  armL?: ArmPose;
  armR?: ArmPose;
  /** [x offset, lift] */
  footL?: [number, number];
  footR?: [number, number];
  antenna?: number;
  blush?: boolean;
  /** feet leave the ground with the body */
  airborne?: boolean;
}

// label ids in the raster mask
const EMPTY = 0,
  BODY = 1,
  ARM = 2,
  FOOT = 3,
  FEAT = 4,
  ACC = 5,
  STEM = 6,
  ACC_D = 7;

export function renderPose(char: CharacterDef, pose: Pose): HTMLCanvasElement {
  const P = char.palette;
  const W = SPRITE_W,
    H = SPRITE_H;
  const lab = new Uint8Array(W * H);
  const set = (x: number, y: number, v: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    lab[y * W + x] = v;
  };
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? EMPTY : lab[y * W + x]);

  const sx = pose.sx ?? 1;
  const sy = pose.sy ?? 1;
  const dy = Math.round(pose.dy ?? 0);
  const lean = pose.lean ?? 0;
  const rx = 13 * sx * (char.bodyW ?? 1);
  const ry = 11.5 * sy * (char.bodyH ?? 1);
  const feetTop = GROUND_Y - 2;
  const bottom = feetTop + 1 - dy;
  const cx = CX + (pose.dx ?? 0);
  const cy = bottom - ry;
  const top = Math.round(cy - ry);
  const leanAt = (y: number) => (lean * (cy - y)) / (2 * ry);

  const ellipse = (ecx: number, ecy: number, erx: number, ery: number, v: number, power = 2) => {
    for (let y = Math.floor(ecy - ery - 1); y <= Math.ceil(ecy + ery + 1); y++)
      for (let x = Math.floor(ecx - erx - 1); x <= Math.ceil(ecx + erx + 1); x++) {
        const nx = Math.abs((x + 0.5 - ecx) / erx);
        const ny = Math.abs((y + 0.5 - ecy) / ery);
        if (Math.pow(nx, power) + Math.pow(ny, power) <= 1) set(x, y, v);
      }
  };
  const tri = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, v: number) => {
    const minX = Math.floor(Math.min(x0, x1, x2)),
      maxX = Math.ceil(Math.max(x0, x1, x2));
    const minY = Math.floor(Math.min(y0, y1, y2)),
      maxY = Math.ceil(Math.max(y0, y1, y2));
    const e = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
      (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5,
          py = y + 0.5;
        const a = e(x0, y0, x1, y1, px, py),
          b = e(x1, y1, x2, y2, px, py),
          c = e(x2, y2, x0, y0, px, py);
        if ((a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0)) set(x, y, v);
      }
  };

  // ---- head features behind the body ----
  const tx = cx + leanAt(top); // top-centre x
  const ant = pose.antenna ?? 0;
  switch (char.feature) {
    case "cat":
      tri(tx - 11, top + 6, tx - 8, top - 5, tx - 2, top + 3, FEAT);
      tri(tx + 11, top + 6, tx + 8, top - 5, tx + 2, top + 3, FEAT);
      tri(tx - 9, top + 3, tx - 8, top - 2, tx - 5, top + 2, ACC);
      tri(tx + 9, top + 3, tx + 8, top - 2, tx + 5, top + 2, ACC);
      break;
    case "bunny":
      ellipse(tx - 5 + ant * 0.5, top - 5, 2.6, 7.5, FEAT);
      ellipse(tx + 5 + ant, top - 5, 2.6, 7.5, FEAT);
      ellipse(tx - 5 + ant * 0.5, top - 4, 1, 5, ACC);
      ellipse(tx + 5 + ant, top - 4, 1, 5, ACC);
      break;
    case "tuft":
      tri(tx - 6, top + 3, tx - 4 + ant, top - 6, tx, top + 2, FEAT);
      tri(tx - 2, top + 3, tx + 1 + ant, top - 8, tx + 4, top + 2, FEAT);
      tri(tx + 2, top + 3, tx + 6 + ant, top - 5, tx + 7, top + 3, FEAT);
      break;
  }

  // ---- feet ----
  const fL = pose.footL ?? [0, 0];
  const fR = pose.footR ?? [0, 0];
  const footLift = pose.airborne ? dy : 0;
  ellipse(cx - 6 + fL[0], feetTop + 1 - fL[1] - footLift, 3.6, 2, FOOT);
  ellipse(cx + 6 + fR[0], feetTop + 1 - fR[1] - footLift, 3.6, 2, FOOT);

  // ---- body (gumdrop: superellipse bottom, round top) ----
  for (let y = top - 1; y <= bottom + 1; y++)
    for (let x = Math.floor(cx - rx - 4); x <= Math.ceil(cx + rx + 4); x++) {
      const nx = Math.abs((x + 0.5 - cx - leanAt(y + 0.5)) / rx);
      const ny = Math.abs((y + 0.5 - cy) / ry);
      const p = y + 0.5 > cy ? 2.7 : 2;
      if (Math.pow(nx, p) + Math.pow(ny, p) <= 1) set(x, y, BODY);
    }

  // ---- arms ----
  const armPos = (a: ArmPose, side: 1 | -1): [number, number, number, number] | null => {
    const s = side;
    const ay = (y: number) => cy + y;
    const ax = (x: number) => cx + leanAt(cy) + s * x;
    switch (a) {
      case "hidden":
        return null;
      case "rest":
        return [ax(rx * 0.92), ay(ry * 0.32), 2.6, 2.3];
      case "out":
        return [ax(rx + 2), ay(-1), 2.8, 2.3];
      case "up":
        return [ax(rx * 0.72 + 1), ay(-ry - 2), 2.4, 2.8];
      case "wave1":
        return [ax(rx + 3), ay(-ry * 0.55), 2.4, 2.8];
      case "wave2":
        return [ax(rx + 0.5), ay(-ry - 1.5), 2.4, 2.8];
      case "punch":
        return [ax(rx + 6), ay(0), 3.6, 3];
      case "back":
        return [ax(rx * 0.55), ay(ry * 0.55), 2.6, 2.2];
      case "swingF":
        return [ax(rx * 0.95 + 1), ay(ry * 0.15), 2.6, 2.3];
      case "swingB":
        return [ax(rx * 0.8 - 1), ay(ry * 0.5), 2.6, 2.3];
    }
  };
  for (const [a, side] of [
    [pose.armL ?? "rest", -1],
    [pose.armR ?? "rest", 1],
  ] as const) {
    const p = armPos(a, side);
    if (p) ellipse(p[0], p[1], p[2], p[3], ARM);
  }

  // ---- head features in front ----
  switch (char.feature) {
    case "antenna": {
      const bx = Math.round(tx + 1);
      let x = bx,
        y = top - 1;
      for (let k = 0; k < 5; k++) {
        x = bx + Math.round((ant * k * k) / 16);
        y = top - 1 - k;
        set(x, y, STEM);
      }
      ellipse(x + 0.5, y - 1.5, 2.2, 2.2, ACC);
      break;
    }
    case "sprout": {
      const bx = Math.round(tx);
      for (let k = 0; k < 4; k++) set(bx + Math.round((ant * k) / 4), top - 1 - k, ACC_D);
      const ex = bx + ant,
        ey = top - 5;
      ellipse(ex - 3.5, ey, 3.5, 1.8, ACC);
      ellipse(ex + 3.5, ey - 1, 3.5, 1.8, ACC);
      break;
    }
    case "twin":
      for (const s of [-1, 1]) {
        const bx = Math.round(tx + s * 5);
        for (let k = 0; k < 3; k++) set(bx + Math.round((ant * s * k) / 4), top - k, STEM);
        ellipse(bx + ant * s * 0.5 + 0.5, top - 4, 1.8, 1.8, ACC);
      }
      break;
    case "bow": {
      const bx = tx + 7,
        by = top + 2;
      tri(bx, by, bx - 6, by - 4, bx - 6, by + 4, ACC);
      tri(bx, by, bx + 6, by - 4, bx + 6, by + 4, ACC);
      ellipse(bx + 0.5, by + 0.5, 1.6, 1.6, ACC_D);
      break;
    }
  }

  // ---- colour pass ----
  const [canvas, ctx] = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  const colours: Record<string, [number, number, number]> = {};
  const rgb = (hex: string) => (colours[hex] ??= hexRgb(hex));
  const put = (x: number, y: number, hex: string) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b] = rgb(hex);
    const i = (y * W + x) * 4;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  };

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const l = get(x, y);
      if (l === EMPTY) continue;
      let c = P.body;
      if (l === BODY) {
        const nx = (x + 0.5 - cx - leanAt(y + 0.5)) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const shade = nx * 0.42 + ny * 0.9;
        const spot = (nx + 0.42) ** 2 / 0.05 + (ny + 0.5) ** 2 / 0.03;
        if (spot < 1) c = P.highlight;
        else if (shade > 0.6) c = P.shadow;
        else if (nx * nx + ny * ny > 0.72 && nx < -0.25 && ny < 0) c = P.highlight;
      } else if (l === ARM) {
        c = get(x, y + 1) === ARM ? P.body : P.shadow;
        if (get(x - 1, y) !== ARM && get(x, y - 1) !== ARM) c = P.highlight;
      } else if (l === FOOT) c = get(x, y - 1) === FOOT ? P.shadow : P.body;
      else if (l === FEAT) c = get(x, y + 1) === FEAT || get(x, y + 1) === ACC ? P.body : P.shadow;
      else if (l === ACC) c = P.accent;
      else if (l === ACC_D) c = P.accentDark;
      else if (l === STEM) c = P.shadow;
      put(x, y, c);
    }

  // arm/body seam: arms read as separate shapes
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (get(x, y) !== ARM) continue;
      const n = [get(x - 1, y), get(x + 1, y), get(x, y - 1), get(x, y + 1)];
      if (n.includes(BODY)) put(x, y, P.outline);
    }

  // 1px outline around everything
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (get(x, y) !== EMPTY) continue;
      const n = [get(x - 1, y), get(x + 1, y), get(x, y - 1), get(x, y + 1)];
      if (n.some((v) => v !== EMPTY)) put(x, y, P.outline);
    }

  // accent shading: lighter top-left, darker bottom-right
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (get(x, y) !== ACC) continue;
      if (get(x + 1, y) !== ACC || get(x, y + 1) !== ACC) put(x, y, P.accentDark);
      if (get(x - 1, y) !== ACC && get(x, y - 1) !== ACC) put(x, y, "#ffffff");
    }

  // ---- face ----
  const look = Math.round(pose.look ?? 0);
  const lookY = Math.round(pose.lookY ?? 0);
  const fy = Math.round(cy - 1 + lookY);
  const fx = Math.round(cx + leanAt(fy) * 1.2) + look;
  const E = P.eye;
  const eye = (ex: number, side: -1 | 1) => {
    switch (pose.eyes ?? "open") {
      case "open":
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) put(ex + j, fy - 2 + i, E);
        put(ex, fy - 2, "#ffffff");
        break;
      case "wide":
        for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) put(ex - (side < 0 ? 1 : 0) + j, fy - 3 + i, E);
        put(ex - (side < 0 ? 1 : 0), fy - 3, "#ffffff");
        put(ex - (side < 0 ? 1 : 0) + 1, fy - 3, "#ffffff");
        put(ex - (side < 0 ? 1 : 0), fy - 2, "#ffffff");
        break;
      case "half":
        put(ex, fy, E);
        put(ex + 1, fy, E);
        put(ex, fy + 1, E);
        put(ex + 1, fy + 1, E);
        put(ex - 1, fy - 1, P.shadow);
        put(ex, fy - 1, P.shadow);
        put(ex + 1, fy - 1, P.shadow);
        put(ex + 2, fy - 1, P.shadow);
        break;
      case "closed":
        put(ex - 1, fy + 1, E);
        put(ex, fy + 1, E);
        put(ex + 1, fy + 1, E);
        put(ex + 2, fy + 1, E);
        break;
      case "happy":
        put(ex - 1, fy + 1, E);
        put(ex, fy, E);
        put(ex + 1, fy, E);
        put(ex + 2, fy + 1, E);
        put(ex - 1, fy + 2, E);
        put(ex + 2, fy + 2, E);
        break;
      case "fierce":
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) put(ex + j, fy - 1 + i, E);
        put(ex + (side < 0 ? 0 : 1), fy - 1, "#ffffff");
        // brow slanting down towards the centre
        put(ex + (side < 0 ? -1 : 2), fy - 4, E);
        put(ex + (side < 0 ? 0 : 1), fy - 3, E);
        put(ex + (side < 0 ? 1 : 0), fy - 3, E);
        put(ex + (side < 0 ? 2 : -1), fy - 2, E);
        break;
      case "star":
        put(ex, fy - 3, P.accent);
        put(ex + 1, fy - 3, P.accent);
        for (let j = -1; j < 3; j++) put(ex + j, fy - 1, P.accent);
        put(ex, fy - 2, P.accent);
        put(ex + 1, fy - 2, P.accent);
        put(ex, fy, P.accent);
        put(ex + 1, fy, P.accent);
        put(ex - 1, fy + 1, P.accent);
        put(ex + 2, fy + 1, P.accent);
        for (const [a, b] of [
          [ex - 1, fy - 3],
          [ex + 2, fy - 3],
          [ex - 2, fy - 1],
          [ex + 3, fy - 1],
          [ex - 1, fy],
          [ex + 2, fy],
          [ex - 2, fy + 1],
          [ex + 3, fy + 1],
          [ex, fy - 4],
          [ex + 1, fy - 4],
        ])
          put(a, b, E);
        break;
    }
  };
  eye(fx - 6, -1);
  eye(fx + 4, 1);

  if (pose.blush !== false) {
    put(fx - 9, fy + 2, P.cheek);
    put(fx - 8, fy + 2, P.cheek);
    put(fx + 7, fy + 2, P.cheek);
    put(fx + 8, fy + 2, P.cheek);
  }

  const my = fy + 4;
  const mx = fx;
  const T = P.cheek;
  switch (pose.mouth ?? "smile") {
    case "smile":
      put(mx - 2, my, E);
      put(mx - 1, my + 1, E);
      put(mx, my + 1, E);
      put(mx + 1, my, E);
      break;
    case "open":
      for (let j = -2; j <= 1; j++) put(mx + j, my, E);
      put(mx - 2, my + 1, E);
      put(mx - 1, my + 1, T);
      put(mx, my + 1, T);
      put(mx + 1, my + 1, E);
      put(mx - 1, my + 2, E);
      put(mx, my + 2, E);
      break;
    case "grin":
      for (let j = -3; j <= 2; j++) put(mx + j, my, E);
      put(mx - 3, my + 1, E);
      for (let j = -2; j <= 1; j++) put(mx + j, my + 1, T);
      put(mx + 2, my + 1, E);
      for (let j = -2; j <= 1; j++) put(mx + j, my + 2, E);
      break;
    case "shout":
      put(mx - 1, my, E);
      put(mx, my, E);
      for (let j = -2; j <= 1; j++) put(mx + j, my + 1, E);
      put(mx - 1, my + 2, E);
      put(mx, my + 2, E);
      break;
    case "flat":
      put(mx - 1, my + 1, E);
      put(mx, my + 1, E);
      break;
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
