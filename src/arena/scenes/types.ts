import type { Particles } from "../particles";
import type { Ctx } from "../pixel";

/** A reusable backdrop. The stage owns actors/effects; a scene only paints the world. */
export interface Scene {
  id: string;
  /** y where actors' feet rest */
  floorY: number;
  /** 0..1, raised by celebrations / hype: brighter fire, more embers */
  intensity: number;
  drawBack(ctx: Ctx, t: number, cam: number, focusX: number): void;
  drawFront(ctx: Ctx, t: number, cam: number): void;
  ambient(dt: number, p: Particles, cam: number): void;
  /** world-space points that should flare during big moments (braziers etc.) */
  flarePoints: { x: number; y: number }[];
}

export type SceneFactory = () => Scene;

export const WORLD_W = 480;
export const WORLD_H = 270;
/** world px → screen px */
export const PIXEL = 4;
