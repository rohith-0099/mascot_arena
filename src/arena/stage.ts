// The Stage owns the render loop, camera, actors and all transient effects
// (shake, flashes, shockwaves, impacts, transitions). Higher-level "moments"
// like celebrate() and attack() are composed from those primitives.

import { Actor, warmCharacter } from "./actor";
import type { AnimEvent } from "./animations";
import { CHARACTER_IDS } from "./characters";
import { Particles } from "./particles";
import { type Ctx, pick, rand, ring } from "./pixel";
import { type Scene, type SceneFactory, WORLD_H, WORLD_W } from "./scenes/types";

export type StageEvent =
  | { type: "banner"; title: string; sub?: string }
  | { type: "say"; text: string; ms?: number }
  | { type: "moment"; name: string };

interface Ring {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  max: number;
  colors: string[];
  squash: number;
  thick: number;
}

interface Impact {
  x: number;
  y: number;
  t: number;
}

const CONFETTI = ["#ff6a00", "#ffd36e", "#f2f0ea", "#ff8a3d", "#ffc08f", "#e85d00"];
const SPARK = ["#ffffff", "#fff4d0", "#ffd36e", "#ff8a3d", "#e85d00"];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Stage {
  readonly ctx: Ctx;
  scene: Scene;
  hero: Actor;
  actors: Actor[] = [];
  particles = new Particles();

  private rings: Ring[] = [];
  private impacts: Impact[] = [];
  private shakeAmp = 0;
  private flashA = 0;
  private flashColor = "#ffffff";
  private hitstop = 0;
  private wipe: { t: number; dur: number; dir: "in" | "out"; color: string; done: () => void } | null = null;
  private time = 0;
  private cam = 0;
  private raf = 0;
  private last = 0;
  private listeners = new Set<(e: StageEvent) => void>();
  private busyMoment = false;
  /** bumps whenever a big moment starts, so background routines can bail out */
  momentId = 0;

  /** called every frame with the hero's head position in world px (for DOM overlays) */
  onFrame: ((head: { x: number; y: number }) => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    sceneFactory: SceneFactory,
    heroId = "realm",
  ) {
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.scene = sceneFactory();
    warmCharacter(heroId);
    this.hero = this.addActor(heroId, WORLD_W / 2);
    // warm the rest of the cast lazily so the first frame is fast
    setTimeout(() => CHARACTER_IDS.forEach(warmCharacter), 50);
  }

  on(fn: (e: StageEvent) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: StageEvent) {
    this.listeners.forEach((l) => l(e));
  }

  addActor(id: string, x: number) {
    const a = new Actor(id, x, this.scene.floorY);
    a.onEvent = (e, who) => this.actorEvent(e, who);
    this.actors.push(a);
    return a;
  }

  removeActor(a: Actor) {
    this.actors = this.actors.filter((b) => b !== a);
  }

  setScene(factory: SceneFactory) {
    return this.transition(() => {
      this.scene = factory();
      for (const a of this.actors) a.y = this.scene.floorY;
    });
  }

  start() {
    this.last = performance.now();
    this.wipe = { t: 0, dur: 1.1, dir: "out", color: "#07080b", done: () => {} };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  // ------------------------------------------------------------ effect primitives

  shake(amp: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }
  flash(color = "#ffffff", a = 1) {
    this.flashColor = color;
    this.flashA = a;
  }
  shockwave(x: number, y: number, opts: Partial<Ring> = {}) {
    this.rings.push({ x, y, r: 4, vr: 260, life: 0, max: 0.45, colors: ["#ffffff", "#ffd36e", "#ff6a00"], squash: 0.18, thick: 2, ...opts });
  }
  impact(x: number, y: number) {
    this.impacts.push({ x, y, t: 0 });
    this.hitstop = 0.09;
    this.shake(6);
    this.flash("#fff4d0", 0.55);
    this.particles.burst(x, y, 28, SPARK, 230);
    this.particles.debris(x, y, 10, this.scene.floorY + 4, ["#ffd36e", "#ff8a3d", "#5a260c"]);
    this.shockwave(x, y, { squash: 1, vr: 200, max: 0.3, thick: 2 });
  }

  /** block-wipe transition: covers the screen, runs `mid`, then reveals */
  async transition(mid?: () => void, color = "#07080b") {
    await new Promise<void>((r) => (this.wipe = { t: 0, dur: 0.55, dir: "in", color, done: r }));
    mid?.();
    await new Promise<void>((r) => (this.wipe = { t: 0, dur: 0.6, dir: "out", color, done: r }));
  }

  // ------------------------------------------------------------ moments

  async celebrate(title = "QUEST COMPLETE", sub = "+300 PTS") {
    if (this.busyMoment) return;
    this.busyMoment = true;
    const h = this.hero;
    const fy = this.scene.floorY;
    this.beginMoment("celebrate");
    this.flash("#ffd36e", 0.8);
    this.shake(4);
    this.scene.intensity = 1;
    this.emit({ type: "banner", title, sub });
    this.emit({ type: "say", text: pick(["LET'S GOOOO!", "WE ARE SO BACK!", "LEGENDARY!", "SHIP IT!!"]), ms: 2600 });
    // confetti cannons from both front corners + from the hero
    for (const [x, dir] of [
      [24, 1],
      [WORLD_W - 24, -1],
    ] as const)
      for (let i = 0; i < 70; i++)
        this.particles.add({
          kind: "confetti",
          x,
          y: 240,
          vx: dir * rand(60, 230),
          vy: rand(-330, -170),
          g: 150,
          drag: 0.03,
          max: rand(3, 5),
          size: pick([2, 2, 3]),
          colors: [pick(CONFETTI)],
          front: Math.random() < 0.6,
          floor: fy + rand(-6, 14),
        });
    for (const p of this.scene.flarePoints) this.particles.burst(p.x, p.y, 24, SPARK, 120, false);
    void this.fireworks(5);
    await h.play("celebrate");
    this.particles.confetti(h.x, fy - 15 * h.scale, 50, fy, CONFETTI);
    await wait(400);
    this.busyMoment = false;
  }

  async attack(rivalId?: string) {
    if (this.busyMoment) return;
    this.busyMoment = true;
    const h = this.hero;
    const fy = this.scene.floorY;
    this.beginMoment("attack");
    const id = rivalId ?? pick(CHARACTER_IDS.filter((c) => c !== h.char.id));
    // prefer the right side: the QR code lives bottom-left
    const side = h.x > WORLD_W * 0.62 ? -1 : 1;
    const rival = this.addActor(id, h.x + side * 34 * h.scale);
    rival.facing = side === 1 ? -1 : 1;
    // drop in from the sky
    rival.z = -260;
    rival.vz = 0;
    this.emit({ type: "say", text: `${rival.char.name} ENTERS THE ARENA!`, ms: 1600 });
    await wait(900);
    rival.play("wave");
    h.facing = side as 1 | -1;
    await wait(500);
    this.emit({ type: "say", text: pick(["HAAA-YAH!", "MERGE CONFLICT!", "SEGFAULT PUNCH!", "TAKE THIS BUG!"]), ms: 1300 });
    const target = rival;
    const done = h.play("attack");
    this.pendingHit = () => {
      target.flash = 1;
      target.kx = side * 260;
      void target.play("hurt");
      this.impact(h.x + side * 22 * h.scale, fy - 11 * h.scale);
    };
    await done;
    await wait(800);
    // rival bows out in a burst of pixels
    this.particles.burst(rival.x, fy - 30, 40, ["#ffffff", rival.char.palette.body, rival.char.palette.shadow], 140);
    for (let i = 0; i < 10; i++)
      this.particles.add({ kind: "star", x: rival.x + rand(-20, 20), y: fy - rand(10, 60), max: rand(0.4, 0.8), colors: ["#ffffff", "#ffd36e"], glow: true, front: true });
    this.flash("#ffffff", 0.3);
    this.removeActor(rival);
    h.facing = 1;
    await wait(300);
    this.busyMoment = false;
  }

  private beginMoment(name: string) {
    this.momentId++;
    this.hero.halt();
    this.emit({ type: "moment", name });
  }

  get inMoment() {
    return this.busyMoment;
  }

  /**
   * Run an externally-driven moment (e.g. a photo arrival) exclusively: the
   * director and other moments wait until it finishes. Returns false if busy.
   */
  async moment(name: string, fn: () => Promise<void>): Promise<boolean> {
    if (this.busyMoment) return false;
    this.busyMoment = true;
    this.beginMoment(name);
    try {
      await fn();
    } finally {
      this.busyMoment = false;
    }
    return true;
  }

  /** a volley of fireworks over the arena */
  async fireworks(count: number, x0 = 110, x1 = 370) {
    for (let i = 0; i < count; i++) {
      this.particles.firework(rand(x0, x1), 200, rand(30, 90), pick([SPARK, ["#ffffff", "#ffc08f", "#ff8a3d"], ["#f2f0ea", "#ffd36e", "#e85d00"]]));
      await wait(rand(180, 380));
    }
  }

  /** impact for a DOM element "landing" on the stage at world coords */
  landing(x: number, y: number) {
    this.flash("#fff4d0", 0.45);
    this.shake(5);
    this.shockwave(x, y, { squash: 1, vr: 260, max: 0.4, thick: 2 });
    this.particles.burst(x, y, 30, SPARK, 200);
    this.particles.confetti(x, y, 60, this.scene.floorY, CONFETTI);
    this.scene.intensity = Math.max(this.scene.intensity, 0.6);
  }

  async wave(text = "HELLO REALM HACK!") {
    this.emit({ type: "say", text, ms: 2200 });
    await this.hero.play("wave");
  }

  say(text: string, ms?: number) {
    this.emit({ type: "say", text, ms });
  }

  get isBusy() {
    return this.busyMoment || this.hero.busy;
  }

  // ------------------------------------------------------------ internals

  private pendingHit: (() => void) | null = null;

  private actorEvent(e: AnimEvent, a: Actor) {
    const fy = this.scene.floorY;
    switch (e) {
      case "jump":
        this.particles.debris(a.x, fy, 6, fy + 2, ["#3e3237", "#241e25"]);
        this.shockwave(a.x, fy, { colors: ["#ffd36e", "#ff6a00", "#5a260c"], vr: 180, max: 0.35, thick: 1 });
        break;
      case "land":
        this.shake(a === this.hero ? 5 : 3);
        this.shockwave(a.x, fy, { vr: 320, max: 0.5, thick: 2 });
        this.particles.debris(a.x, fy, 12, fy + 2, ["#ffd36e", "#3e3237", "#241e25"]);
        break;
      case "impact":
        if (a === this.hero && this.pendingHit) {
          this.pendingHit();
          this.pendingHit = null;
        }
        break;
      case "step":
        if (Math.random() < 0.6)
          this.particles.add({ kind: "dust", x: a.x - a.facing * 10, y: fy - 1, vx: -a.facing * 10, vy: -8, max: 0.5, colors: ["#3e3237"], front: false });
        break;
      case "wave":
        this.particles.add({ kind: "star", x: a.x + a.facing * 15 * a.scale, y: fy - 32 * a.scale, max: 0.5, colors: ["#ffd36e", "#ff6a00"], glow: true, front: true });
        break;
    }
  }

  private update(dt: number) {
    this.time += dt;
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 20);
    this.flashA = Math.max(0, this.flashA - dt * 3.2);
    this.scene.intensity = Math.max(0, this.scene.intensity - dt * 0.22);

    if (this.wipe) {
      this.wipe.t += dt;
      if (this.wipe.t >= this.wipe.dur) {
        const w = this.wipe;
        this.wipe = w.dir === "in" ? { ...w, t: w.dur } : null;
        w.done();
      }
    }

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }

    for (const a of this.actors) a.update(dt);
    // camera drifts gently and leans towards the hero
    const target = (this.hero.x - WORLD_W / 2) * 0.3 + Math.sin(this.time * 0.13) * 8;
    this.cam += (target - this.cam) * Math.min(1, dt * 1.5);
    this.cam = Math.max(-40, Math.min(40, this.cam));

    this.scene.ambient(dt, this.particles, this.cam);
    // rocket trails
    for (const p of this.particles.list)
      if (p.kind === "rocket" && Math.random() < 0.8)
        this.particles.add({ kind: "ember", x: p.x, y: p.y, vy: 10, max: 0.35, colors: ["#ffd36e", "#ff6a00", "#8a2a00"], glow: true });
    this.particles.update(dt);

    for (const r of this.rings) {
      r.life += dt;
      r.r += r.vr * dt;
      r.vr *= Math.pow(0.08, dt);
    }
    this.rings = this.rings.filter((r) => r.life < r.max);
    for (const i of this.impacts) i.t += dt;
    this.impacts = this.impacts.filter((i) => i.t < 0.25);
  }

  private draw() {
    const ctx = this.ctx;
    const cam = this.cam;
    const sx = this.shakeAmp > 0.5 ? Math.round(rand(-this.shakeAmp, this.shakeAmp)) : 0;
    const sy = this.shakeAmp > 0.5 ? Math.round(rand(-this.shakeAmp, this.shakeAmp) * 0.6) : 0;

    ctx.save();
    ctx.translate(sx, sy);
    this.scene.drawBack(ctx, this.time, cam, this.hero.x);
    this.particles.draw(ctx, false, cam);

    // ground shadows, then actors (back to front by y)
    for (const a of this.actors) {
      if (!a.visible) continue;
      const lift = -a.z + (a.pose.airborne ? (a.pose.dy ?? 0) * a.scale : 0);
      const w = Math.max(8, a.scale * 15 - lift * 0.2);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const x = Math.round(a.x - cam);
      ctx.fillRect(Math.round(x - w / 2), this.scene.floorY - 2, Math.round(w), 3);
      ctx.fillRect(Math.round(x - w / 2 + 3), this.scene.floorY - 3, Math.round(w - 6), 5);
    }
    for (const a of this.actors) a.draw(ctx, cam);

    for (const r of this.rings) {
      const k = r.life / r.max;
      ctx.fillStyle = r.colors[Math.min(r.colors.length - 1, Math.floor(k * r.colors.length))];
      ring(ctx, r.x - cam, r.y, r.r, r.thick, r.squash);
    }
    for (const i of this.impacts) this.drawImpact(ctx, i, cam);
    this.particles.draw(ctx, true, cam);
    this.scene.drawFront(ctx, this.time, cam);
    ctx.restore();

    if (this.flashA > 0.01) {
      // stepped alpha keeps the flash punchy and "8-bit"
      ctx.globalAlpha = Math.ceil(this.flashA * 4) / 4 * 0.85;
      ctx.fillStyle = this.flashColor;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    if (this.wipe) this.drawWipe(ctx);

    if (this.onFrame) {
      const h = this.hero;
      this.onFrame({ x: h.x - cam + sx, y: this.scene.floorY + h.z - 36 * h.scale + sy });
    }
  }

  private drawImpact(ctx: Ctx, i: Impact, cam: number) {
    const x = Math.round(i.x - cam);
    const y = Math.round(i.y);
    const f = Math.floor(i.t / 0.06);
    const spikes = 8;
    const rOut = [16, 24, 28, 30][f] ?? 30;
    const rIn = [6, 10, 18, 24][f] ?? 24;
    ctx.fillStyle = ["#ffffff", "#fff4d0", "#ffd36e", "#ff6a00"][f] ?? "#ff6a00";
    // jagged star made of pixel spokes
    for (let s = 0; s < spikes * 2; s++) {
      const a = (s / (spikes * 2)) * Math.PI * 2 + 0.2;
      const len = s % 2 === 0 ? rOut : rOut * 0.6;
      for (let d = rIn * (f >= 2 ? 1 : 0); d < len; d++) {
        const w = Math.max(1, Math.round((1 - d / len) * (f < 2 ? 3 : 1)));
        ctx.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), w, w);
      }
    }
    if (f < 2) {
      ctx.fillRect(x - 5, y - 5, 11, 11);
      ctx.fillRect(x - 7, y - 3, 15, 7);
      ctx.fillRect(x - 3, y - 7, 7, 15);
    }
  }

  private drawWipe(ctx: Ctx) {
    const w = this.wipe!;
    const k = Math.min(1, w.t / w.dur);
    const B = 10; // block size
    const cols = Math.ceil(WORLD_W / B),
      rows = Math.ceil(WORLD_H / B);
    const maxD = cols / 2 + rows / 2;
    ctx.fillStyle = w.color;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        // diamond from the centre
        const d = (Math.abs(c - cols / 2) + Math.abs(r - rows / 2)) / maxD;
        let s = w.dir === "in" ? k * 1.6 - (1 - d) * 0.6 : (1 - k) * 1.6 - d * 0.6;
        s = Math.max(0, Math.min(1, s));
        if (s <= 0) continue;
        const size = Math.ceil(s * B);
        ctx.fillRect(c * B + Math.floor((B - size) / 2), r * B + Math.floor((B - size) / 2), size, size);
        if (s > 0 && s < 0.6) {
          ctx.fillStyle = "#ff6a00";
          ctx.fillRect(c * B + Math.floor((B - size) / 2), r * B + Math.floor((B - size) / 2), size, 1);
          ctx.fillStyle = w.color;
        }
      }
  }
}
