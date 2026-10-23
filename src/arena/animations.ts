// Animation library: each animation is a list of stepped poses with per-frame
// timing. Frames can emit events (jump/land/impact) the stage turns into effects.

import type { Pose } from "./sprite";

export type AnimEvent = "jump" | "land" | "impact" | "step" | "wave";

export interface Frame {
  pose: Pose;
  ms: number;
  event?: AnimEvent;
}

export interface AnimDef {
  frames: Frame[];
  loop: boolean;
}

export type AnimName = "idle" | "blink" | "look" | "walk" | "wave" | "celebrate" | "attack" | "hurt" | "talk";

const f = (ms: number, pose: Pose, event?: AnimEvent): Frame => ({ ms, pose, event });

export const ANIMS: Record<AnimName, AnimDef> = {
  idle: {
    loop: true,
    frames: [
      f(220, { antenna: 0 }),
      f(180, { sy: 0.96, sx: 1.03, antenna: 1 }),
      f(220, { sy: 0.93, sx: 1.05, antenna: 2 }),
      f(180, { sy: 0.96, sx: 1.03, antenna: 1 }),
      f(220, { antenna: 0 }),
      f(180, { sy: 1.03, sx: 0.98, dy: 1, antenna: -1 }),
      f(220, { sy: 1.05, sx: 0.97, dy: 1, antenna: -2 }),
      f(180, { sy: 1.03, sx: 0.98, dy: 1, antenna: -1 }),
    ],
  },
  blink: {
    loop: false,
    frames: [f(50, { eyes: "half" }), f(70, { eyes: "closed", sy: 0.97 }), f(50, { eyes: "half" })],
  },
  look: {
    loop: false,
    frames: [
      f(500, { look: -2, antenna: 1 }),
      f(90, { look: 0, eyes: "half" }),
      f(500, { look: 2, antenna: -1, mouth: "flat" }),
      f(90, { look: 0 }),
    ],
  },
  walk: {
    loop: true,
    frames: [
      f(110, { footL: [2, 2], footR: [-1, 0], lean: 1, dy: 1, armL: "swingB", armR: "swingF", antenna: -1 }, "step"),
      f(110, { footL: [1, 0], footR: [0, 0], lean: 1, dy: 0, sy: 0.96, sx: 1.03, antenna: -2 }),
      f(110, { footL: [-1, 0], footR: [2, 2], lean: 1, dy: 1, armL: "swingF", armR: "swingB", antenna: -1 }, "step"),
      f(110, { footL: [0, 0], footR: [1, 0], lean: 1, dy: 0, sy: 0.96, sx: 1.03, antenna: -2 }),
    ],
  },
  wave: {
    loop: false,
    frames: [
      f(90, { armR: "out", eyes: "open", mouth: "open", sy: 0.97 }),
      ...[0, 1, 2].flatMap(() => [
        f(150, { armR: "wave1", eyes: "happy", mouth: "grin", antenna: 2, lean: -1 }, "wave"),
        f(150, { armR: "wave2", eyes: "happy", mouth: "grin", antenna: -2, lean: 0 }),
      ]),
      f(120, { armR: "out", eyes: "happy", mouth: "smile" }),
    ],
  },
  celebrate: {
    loop: false,
    frames: [
      // anticipation
      f(90, { sy: 0.88, sx: 1.1, eyes: "closed", mouth: "smile", armL: "back", armR: "back" }),
      f(110, { sy: 0.78, sx: 1.18, eyes: "closed", mouth: "grin", armL: "back", armR: "back", antenna: 2 }),
      // launch
      f(70, { sy: 1.18, sx: 0.88, dy: 6, airborne: true, eyes: "star", mouth: "grin", armL: "up", armR: "up", antenna: -3 }, "jump"),
      f(90, { sy: 1.1, sx: 0.93, dy: 12, airborne: true, eyes: "star", mouth: "grin", armL: "up", armR: "up", antenna: -2 }),
      f(140, { sy: 1.0, sx: 1.0, dy: 15, airborne: true, eyes: "star", mouth: "grin", armL: "up", armR: "up", antenna: 0 }),
      f(90, { sy: 1.04, sx: 0.97, dy: 12, airborne: true, eyes: "star", mouth: "grin", armL: "wave2", armR: "wave2", antenna: 2 }),
      f(70, { sy: 1.1, sx: 0.92, dy: 6, airborne: true, eyes: "star", mouth: "grin", armL: "up", armR: "up", antenna: 3 }),
      // land
      f(90, { sy: 0.8, sx: 1.18, eyes: "happy", mouth: "grin", armL: "out", armR: "out" }, "land"),
      f(80, { sy: 0.92, sx: 1.06, eyes: "happy", mouth: "grin", armL: "up", armR: "up" }),
      // second little hop
      f(70, { sy: 1.08, sx: 0.94, dy: 5, airborne: true, eyes: "happy", mouth: "grin", armL: "up", armR: "up", antenna: -2 }, "jump"),
      f(110, { sy: 1.0, dy: 7, airborne: true, eyes: "happy", mouth: "open", armL: "wave2", armR: "wave1", antenna: 0 }),
      f(70, { sy: 1.04, dy: 4, airborne: true, eyes: "happy", mouth: "open", armL: "up", armR: "up", antenna: 2 }),
      f(90, { sy: 0.86, sx: 1.12, eyes: "happy", mouth: "grin", armL: "out", armR: "out" }, "land"),
      // victory pose
      ...[0, 1, 2].flatMap(() => [
        f(140, { eyes: "happy", mouth: "grin", armL: "up", armR: "wave1", antenna: 2, sy: 1.02 }),
        f(140, { eyes: "happy", mouth: "open", armL: "wave1", armR: "up", antenna: -2, sy: 0.98 }),
      ]),
    ],
  },
  attack: {
    loop: false,
    frames: [
      f(90, { lean: -2, sy: 0.95, eyes: "fierce", mouth: "flat", armR: "back", armL: "out" }),
      f(160, { lean: -3, sy: 0.88, sx: 1.1, dx: -2, eyes: "fierce", mouth: "shout", armR: "back", armL: "out", antenna: 3 }),
      f(50, { lean: 3, sx: 1.1, sy: 0.94, dx: 3, eyes: "fierce", mouth: "shout", armR: "swingF", armL: "back", antenna: -3, footR: [2, 1] }),
      f(240, { lean: 4, sx: 1.14, sy: 0.92, dx: 5, eyes: "fierce", mouth: "shout", armR: "punch", armL: "back", antenna: -3, footR: [3, 0], footL: [-1, 0] }, "impact"),
      f(110, { lean: 2, sx: 1.04, dx: 3, eyes: "fierce", mouth: "grin", armR: "out", antenna: -1, footR: [2, 0] }),
      f(120, { lean: 0, dx: 1, eyes: "happy", mouth: "grin", armR: "rest", antenna: 1 }),
    ],
  },
  hurt: {
    loop: false,
    frames: [
      f(70, { lean: -3, dx: -3, sx: 0.9, sy: 1.08, eyes: "closed", mouth: "shout", armL: "out", armR: "out" }),
      f(160, { lean: -2, dx: -2, eyes: "wide", mouth: "shout", armL: "up", armR: "out" }),
      f(160, { lean: -1, dx: -1, eyes: "half", mouth: "flat" }),
    ],
  },
  talk: {
    loop: true,
    frames: [
      f(110, { mouth: "open", antenna: 1 }),
      f(90, { mouth: "smile", sy: 0.98 }),
      f(130, { mouth: "grin", antenna: -1, armR: "out" }),
      f(90, { mouth: "smile", sy: 1.01 }),
    ],
  },
};
