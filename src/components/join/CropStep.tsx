"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./join.module.css";

/** viewport and output share a 4:5 portrait frame (fits people and the screen card) */
const VIEW_W = 400;
const VIEW_H = 500;
const OUT_W = 800;
const OUT_H = 1000;
const MAX_ZOOM = 4;

type View = { zoom: number; cx: number; cy: number };

/**
 * Drag to move, pinch (or the slider) to zoom. Produces an OUT_W×OUT_H canvas.
 */
export function CropStep({ source, onDone }: { source: HTMLCanvasElement; onDone: (c: HTMLCanvasElement) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cover = Math.max(VIEW_W / source.width, VIEW_H / source.height);
  const [view, setView] = useState<View>({ zoom: 1, cx: source.width / 2, cy: source.height / 2 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  /** keep the frame inside the photo */
  const clamp = useCallback(
    (v: View): View => {
      const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
      const hw = VIEW_W / (cover * zoom) / 2;
      const hh = VIEW_H / (cover * zoom) / 2;
      return {
        zoom,
        cx: Math.min(source.width - hw, Math.max(hw, v.cx)),
        cy: Math.min(source.height - hh, Math.max(hh, v.cy)),
      };
    },
    [cover, source],
  );

  useEffect(() => setView({ zoom: 1, cx: source.width / 2, cy: source.height / 2 }), [source]);

  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    const k = cover * view.zoom;
    ctx.fillStyle = "#07080b";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.drawImage(source, VIEW_W / 2 - view.cx * k, VIEW_H / 2 - view.cy * k, source.width * k, source.height * k);
  }, [source, view, cover]);

  const toCanvas = () => VIEW_W / (ref.current?.getBoundingClientRect().width || VIEW_W);

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: React.PointerEvent) => {
    const ps = pointers.current;
    const prev = ps.get(e.pointerId);
    if (!prev) return;
    const others = [...ps.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
    const next = { x: e.clientX, y: e.clientY };
    ps.set(e.pointerId, next);
    setView((v) => {
      if (others.length === 0) {
        // one finger: pan (screen px → source px)
        const f = toCanvas() / (cover * v.zoom);
        return clamp({ ...v, cx: v.cx - (next.x - prev.x) * f, cy: v.cy - (next.y - prev.y) * f });
      }
      // two fingers: zoom by the change in finger distance
      const o = others[0];
      const d0 = Math.hypot(prev.x - o.x, prev.y - o.y);
      const d1 = Math.hypot(next.x - o.x, next.y - o.y);
      return d0 > 0 ? clamp({ ...v, zoom: v.zoom * (d1 / d0) }) : v;
    });
  };
  const onUp = (e: React.PointerEvent) => pointers.current.delete(e.pointerId);

  const done = () => {
    const out = document.createElement("canvas");
    out.width = OUT_W;
    out.height = OUT_H;
    const ctx = out.getContext("2d")!;
    const k = (cover * view.zoom * OUT_W) / VIEW_W;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, OUT_W / 2 - view.cx * k, OUT_H / 2 - view.cy * k, source.width * k, source.height * k);
    onDone(out);
  };

  return (
    <div className={s.crop}>
      <div className={s.cropFrame}>
        <canvas
          ref={ref}
          width={VIEW_W}
          height={VIEW_H}
          className={s.cropCanvas}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Crop: drag to move, pinch to zoom"
        />
        <div className={s.cropGrid} aria-hidden />
      </div>
      <label className={s.zoom}>
        <span>ZOOM</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={view.zoom}
          onChange={(e) => setView((v) => clamp({ ...v, zoom: Number(e.target.value) }))}
        />
      </label>
      <p className={s.fine}>Drag to move · pinch to zoom</p>
      <button className={s.primary} onClick={done}>
        CROP ✓
      </button>
    </div>
  );
}
