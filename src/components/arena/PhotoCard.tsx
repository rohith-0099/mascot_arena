"use client";

import { useEffect, useRef } from "react";
import s from "./arena.module.css";

const BOX = { card: { w: 600, h: 450 }, hero: { w: 520, h: 600 } };
/** mosaic block sizes for the "pixel resolve" — stepped, not smooth */
const RESOLVE = [64, 48, 32, 24, 16, 12, 8, 6, 4, 2, 1];
const STEP_MS = 70;

/**
 * Approved photo. A full photo is framed as an arcade card; a background-
 * removed cutout stands on stage as a "new challenger" in front of spinning
 * light rays. Either drops in (CSS, stepped), then resolves from chunky pixels
 * to full detail; on exit it re-pixelates.
 */
export function PhotoCard({
  image,
  team,
  cutout,
  leaving,
}: {
  image: ImageBitmap | HTMLImageElement;
  team: string;
  cutout: boolean;
  leaving: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = cutout ? BOX.hero : BOX.card;
  const k = Math.min(box.w / image.width, box.h / image.height);
  const w = Math.round(image.width * k);
  const h = Math.round(image.height * k);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const small = document.createElement("canvas");
    const sctx = small.getContext("2d")!;
    const draw = (block: number) => {
      ctx.clearRect(0, 0, w, h); // cutouts are transparent: don't smear old frames
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

  if (cutout)
    return (
      <div className={`${s.hero} ${leaving ? s.photoCardOut : ""}`} style={{ width: w }} data-testid="photo-card">
        <div className={s.heroRays} aria-hidden />
        <div className={s.heroSpot} aria-hidden />
        <div className={s.photoTag}>★ NEW CHALLENGER ★</div>
        <canvas ref={ref} width={w} height={h} className={s.heroCanvas} />
        <div className={s.heroTeam}>
          <span>TEAM</span>
          {team}
        </div>
      </div>
    );

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
