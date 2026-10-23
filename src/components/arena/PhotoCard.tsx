"use client";

import { useEffect, useRef } from "react";
import s from "./arena.module.css";

const BOX_W = 600;
const BOX_H = 450;
/** mosaic block sizes for the "pixel resolve" — stepped, not smooth */
const RESOLVE = [64, 48, 32, 24, 16, 12, 8, 6, 4, 2, 1];
const STEP_MS = 70;

/**
 * Approved photo framed as an arcade card. It drops in (CSS, stepped), then
 * the photo resolves from chunky pixels to full detail; on exit it re-pixelates.
 */
export function PhotoCard({ image, team, leaving }: { image: ImageBitmap | HTMLImageElement; team: string; leaving: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const k = Math.min(BOX_W / image.width, BOX_H / image.height);
  const w = Math.round(image.width * k);
  const h = Math.round(image.height * k);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const small = document.createElement("canvas");
    const sctx = small.getContext("2d")!;
    const draw = (block: number) => {
      if (block <= 1) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(image, 0, 0, w, h);
        return;
      }
      small.width = Math.max(1, Math.ceil(w / block));
      small.height = Math.max(1, Math.ceil(h / block));
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(image, 0, 0, small.width, small.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, small.width * block, small.height * block);
    };
    const steps = leaving ? [...RESOLVE].reverse() : RESOLVE;
    // entering: wait for the drop to land before resolving
    const delay = leaving ? 0 : 420;
    draw(steps[0]);
    const timers = steps.map((b, i) => setTimeout(() => draw(b), delay + i * STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [image, w, h, leaving]);

  return (
    <div className={`${s.photoCard} ${leaving ? s.photoCardOut : ""}`} style={{ width: w + 40 }} data-testid="photo-card">
      <div className={s.photoTag}>★ NEW PHOTO ★</div>
      <canvas ref={ref} width={w} height={h} className={s.photoCanvas} />
      <div className={s.photoTeam}>
        <span>TEAM</span>
        {team}
      </div>
    </div>
  );
}
