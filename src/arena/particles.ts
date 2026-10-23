// Chunky pixel particle system: embers, confetti, sparks, debris, dust.

import { type Ctx, rand, pick } from "./pixel";

export type ParticleKind = "ember" | "confetti" | "spark" | "debris" | "dust" | "star" | "rocket";

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  colors: string[];
  phase: number;
  /** drawn with additive blending */
  glow: boolean;
  front: boolean;
  floor?: number;
  onDeath?: (p: Particle) => void;
}

export class Particles {
  list: Particle[] = [];

  add(p: Partial<Particle> & Pick<Particle, "kind" | "x" | "y">) {
    if (this.list.length > 1400) return;
    this.list.push({
      vx: 0,
      vy: 0,
      g: 0,
      drag: 0,
      life: 0,
      max: 1,
      size: 1,
      colors: ["#ffffff"],
      phase: Math.random() * 10,
      glow: false,
      front: false,
      ...p,
    });
  }

  update(dt: number) {
    const keep: Particle[] = [];
    for (const p of this.list) {
      p.life += dt;
      if (p.life >= p.max) {
        p.onDeath?.(p);
        continue;
      }
      const d = Math.pow(1 - p.drag, dt * 60);
      p.vx *= d;
      p.vy = p.vy * d + p.g * dt;
      if (p.kind === "ember") p.vx += Math.sin(p.life * 3 + p.phase) * 6 * dt;
      if (p.kind === "confetti") p.vx += Math.sin(p.life * 5 + p.phase) * 30 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.floor !== undefined && p.y > p.floor) {
        p.y = p.floor;
        p.vy *= -0.35;
        p.vx *= 0.6;
        if (p.kind === "confetti") {
          p.vy = 0;
          p.g = 0;
          p.vx = 0;
        }
      }
      keep.push(p);
    }
    this.list = keep;
  }

  draw(ctx: Ctx, front: boolean, camX: number) {
    for (const p of this.list) {
      if (p.front !== front) continue;
      const k = p.life / p.max;
      const ci = Math.min(p.colors.length - 1, Math.floor(k * p.colors.length));
      ctx.fillStyle = p.colors[ci];
      ctx.globalCompositeOperation = p.glow ? "lighter" : "source-over";
      const x = Math.round(p.x - camX);
      const y = Math.round(p.y);
      switch (p.kind) {
        case "confetti": {
          // fluttering square: width oscillates to fake a 3D flip
          const w = Math.max(1, Math.round(Math.abs(Math.cos(p.life * 9 + p.phase)) * p.size));
          ctx.fillRect(x, y, w, p.size);
          break;
        }
        case "spark": {
          ctx.fillRect(x, y, p.size, p.size);
          const len = Math.min(4, Math.hypot(p.vx, p.vy) / 40);
          const nx = p.vx / (Math.hypot(p.vx, p.vy) || 1);
          const ny = p.vy / (Math.hypot(p.vx, p.vy) || 1);
          for (let i = 1; i <= len; i++) ctx.fillRect(Math.round(x - nx * i), Math.round(y - ny * i), 1, 1);
          break;
        }
        case "star": {
          const s = k < 0.5 ? 1 : 0;
          ctx.fillRect(x, y - 1 - s, 1, 3 + s * 2);
          ctx.fillRect(x - 1 - s, y, 3 + s * 2, 1);
          break;
        }
        case "ember":
        case "dust":
          if (p.kind === "dust" && Math.sin(p.life * 2 + p.phase) < -0.6) break;
          ctx.fillRect(x, y, p.size, p.size);
          break;
        default:
          ctx.fillRect(x, y, p.size, p.size);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // ---------- emitters ----------

  confetti(x: number, y: number, n: number, floor: number, palette: string[]) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const s = rand(80, 260);
      this.add({
        kind: "confetti",
        x: x + rand(-6, 6),
        y: y + rand(-6, 6),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        g: 140,
        drag: 0.035,
        max: rand(2.5, 4.5),
        size: pick([2, 2, 3]),
        colors: [pick(palette)],
        front: Math.random() < 0.5,
        floor: floor + rand(-4, 12),
      });
    }
  }

  burst(x: number, y: number, n: number, colors: string[], speed = 160, front = true) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
      const s = rand(speed * 0.4, speed);
      this.add({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        g: 90,
        drag: 0.05,
        max: rand(0.35, 0.8),
        size: 1,
        colors,
        glow: true,
        front,
      });
    }
  }

  debris(x: number, y: number, n: number, floor: number, colors: string[]) {
    for (let i = 0; i < n; i++) {
      this.add({
        kind: "debris",
        x: x + rand(-4, 4),
        y: y + rand(-4, 4),
        vx: rand(-110, 110),
        vy: rand(-170, -50),
        g: 420,
        drag: 0.01,
        max: rand(0.8, 1.4),
        size: pick([1, 2, 2]),
        colors,
        front: true,
        floor,
      });
    }
  }

  firework(x: number, y: number, targetY: number, colors: string[]) {
    this.add({
      kind: "rocket",
      x,
      y,
      vx: rand(-15, 15),
      vy: -(y - targetY) * 1.6,
      g: 0,
      drag: 0.02,
      max: 0.55,
      size: 1,
      colors: ["#ffd36e"],
      glow: true,
      onDeath: (p) => {
        this.burst(p.x, p.y, 36, colors, 110, false);
        for (let i = 0; i < 6; i++)
          this.add({ kind: "star", x: p.x + rand(-14, 14), y: p.y + rand(-14, 14), max: rand(0.4, 0.9), colors: ["#ffffff", colors[0]], glow: true });
      },
    });
  }
}
