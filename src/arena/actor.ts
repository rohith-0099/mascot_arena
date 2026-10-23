// An Actor is one on-stage character: animation state machine + movement.
// Idle never freezes: breathing loops, blinks overlay at random intervals.

import { ANIMS, type AnimEvent, type AnimName } from "./animations";
import { CHARACTERS, type CharacterDef } from "./characters";
import { GROUND_Y, SPRITE_H, SPRITE_W, renderPose, type Pose } from "./sprite";
import type { Ctx } from "./pixel";

const frameCache = new Map<string, HTMLCanvasElement>();

function frameFor(char: CharacterDef, pose: Pose) {
  const key = char.id + JSON.stringify(pose);
  let c = frameCache.get(key);
  if (!c) {
    c = renderPose(char, pose);
    frameCache.set(key, c);
  }
  return c;
}

/** Pre-render every frame of every animation so the first play never hitches. */
export function warmCharacter(id: string) {
  const char = CHARACTERS[id];
  for (const a of Object.values(ANIMS)) for (const fr of a.frames) frameFor(char, fr.pose);
  for (const fr of ANIMS.blink.frames)
    for (const base of ANIMS.idle.frames) frameFor(char, { ...base.pose, ...fr.pose });
}

export class Actor {
  char: CharacterDef;
  x: number;
  y: number;
  /** extra vertical offset for drops / knockbacks (world px) */
  z = 0;
  vz = 0;
  facing: 1 | -1 = 1;
  scale: number;
  visible = true;
  /** 0..1 white flash when hit */
  flash = 0;

  private anim: AnimName = "idle";
  private frame = 0;
  private t = 0;
  private overlay: { frame: number; t: number } | null = null;
  private blinkIn = 2;
  private done: (() => void) | null = null;
  private targetX: number | null = null;
  private walkDone: (() => void) | null = null;
  speed = 55;
  /** anim to loop while not doing anything else */
  rest: AnimName = "idle";

  onEvent: (e: AnimEvent, a: Actor) => void = () => {};

  constructor(charId: string, x: number, y: number, scale = 2) {
    this.char = CHARACTERS[charId];
    this.x = x;
    this.y = y;
    this.scale = scale;
  }

  get busy() {
    return this.anim !== this.rest || this.targetX !== null;
  }

  get pose(): Pose {
    const base = ANIMS[this.anim].frames[this.frame].pose;
    if (!this.overlay) return base;
    return { ...base, ...ANIMS.blink.frames[this.overlay.frame].pose };
  }

  play(name: AnimName): Promise<void> {
    this.done?.();
    this.anim = name;
    this.frame = 0;
    this.t = 0;
    this.overlay = null;
    this.emit();
    if (ANIMS[name].loop) {
      this.rest = name;
      this.done = null;
      return Promise.resolve();
    }
    return new Promise((r) => (this.done = r));
  }

  /** cancel movement and any running animation, back to idle */
  halt() {
    this.targetX = null;
    const w = this.walkDone,
      d = this.done;
    this.walkDone = this.done = null;
    this.rest = "idle";
    this.anim = "idle";
    this.frame = 0;
    this.t = 0;
    w?.();
    d?.();
  }

  walkTo(x: number): Promise<void> {
    this.walkDone?.();
    this.done?.();
    this.done = null;
    this.targetX = x;
    this.facing = x >= this.x ? 1 : -1;
    if (this.anim !== "walk") {
      this.anim = "walk";
      this.frame = 0;
      this.t = 0;
    }
    return new Promise((r) => (this.walkDone = r));
  }

  private emit() {
    const e = ANIMS[this.anim].frames[this.frame].event;
    if (e) this.onEvent(e, this);
  }

  /** horizontal knockback velocity, decays with friction */
  kx = 0;

  update(dt: number) {
    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.kx) {
      this.x += this.kx * dt;
      this.kx *= Math.pow(0.002, dt);
      if (Math.abs(this.kx) < 2) this.kx = 0;
    }
    // simple vertical physics for drops/knockback
    if (this.z !== 0 || this.vz !== 0) {
      this.vz += 900 * dt;
      this.z += this.vz * dt;
      if (this.z >= 0) {
        if (this.vz > 120) this.onEvent("land", this);
        this.z = 0;
        this.vz = 0;
      }
    }

    if (this.targetX !== null) {
      const d = this.targetX - this.x;
      const step = this.speed * dt;
      if (Math.abs(d) <= step) {
        this.x = this.targetX;
        this.targetX = null;
        this.anim = this.rest === "walk" ? "idle" : this.rest;
        this.frame = 0;
        this.t = 0;
        const r = this.walkDone;
        this.walkDone = null;
        r?.();
      } else this.x += Math.sign(d) * step;
    }

    const def = ANIMS[this.anim];
    this.t += dt * 1000;
    while (this.t >= def.frames[this.frame].ms) {
      this.t -= def.frames[this.frame].ms;
      this.frame++;
      if (this.frame >= def.frames.length) {
        if (def.loop) this.frame = 0;
        else {
          this.anim = this.rest;
          this.frame = 0;
          this.t = 0;
          const r = this.done;
          this.done = null;
          r?.();
          break;
        }
      }
      this.emit();
    }

    // blinking overlay on idle-ish loops
    if (this.anim === "idle" || this.anim === "walk" || this.anim === "talk") {
      if (this.overlay) {
        this.overlay.t += dt * 1000;
        const fr = ANIMS.blink.frames;
        while (this.overlay && this.overlay.t >= fr[this.overlay.frame].ms) {
          this.overlay.t -= fr[this.overlay.frame].ms;
          this.overlay.frame++;
          if (this.overlay.frame >= fr.length) this.overlay = null;
        }
      } else {
        this.blinkIn -= dt;
        if (this.blinkIn <= 0) {
          this.overlay = { frame: 0, t: 0 };
          // occasional double blink
          this.blinkIn = Math.random() < 0.2 ? 0.25 : 1.6 + Math.random() * 3.2;
        }
      }
    } else this.overlay = null;
  }

  /** feet position on screen (world px, camera applied) */
  screenFeet(camX: number) {
    return { x: Math.round(this.x - camX), y: Math.round(this.y + this.z) };
  }

  draw(ctx: Ctx, camX: number) {
    if (!this.visible) return;
    const img = frameFor(this.char, this.pose);
    const s = this.scale;
    const { x, y } = this.screenFeet(camX);
    const dx = x - Math.round((SPRITE_W / 2) * s);
    const dy = y - GROUND_Y * s;
    ctx.save();
    if (this.facing === -1) {
      ctx.translate(x * 2, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, dx, dy, SPRITE_W * s, SPRITE_H * s);
    if (this.flash > 0.01) {
      // stepped white silhouette flash on hit
      ctx.globalAlpha = Math.ceil(this.flash * 3) / 3;
      ctx.drawImage(tinted(img, "#ffffff"), dx, dy, SPRITE_W * s, SPRITE_H * s);
    }
    ctx.restore();
  }
}

const tintCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function tinted(img: HTMLCanvasElement, color: string) {
  let c = tintCache.get(img);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  tintCache.set(img, c);
  return c;
}
