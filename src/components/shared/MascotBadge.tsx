"use client";

import { useEffect, useRef } from "react";
import { Actor } from "@/arena/actor";
import type { AnimName } from "@/arena/animations";
import { SPRITE_H, SPRITE_W } from "@/arena/sprite";

/** A small live mascot for non-arena pages; replays one-shot animations when `anim` changes. */
export function MascotBadge({ anim = "idle", charId = "realm", size = 3 }: { anim?: AnimName; charId?: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const actor = useRef<Actor | null>(null);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const a = new Actor(charId, SPRITE_W / 2, 52, 1);
    actor.current = a;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      a.update(Math.min(0.05, (now - last) / 1000));
      last = now;
      ctx.clearRect(0, 0, c.width, c.height);
      a.draw(ctx, 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [charId]);

  useEffect(() => {
    void actor.current?.play(anim);
  }, [anim]);

  return (
    <canvas
      ref={ref}
      width={SPRITE_W}
      height={SPRITE_H}
      className="pixelated"
      style={{ width: SPRITE_W * size, height: SPRITE_H * size }}
      aria-hidden
    />
  );
}
