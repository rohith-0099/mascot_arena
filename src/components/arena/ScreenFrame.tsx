"use client";

import { useEffect, useState } from "react";
import s from "./arena.module.css";

/** Fixed 1920×1080 canvas, scaled to fit any window/projector and letterboxed. */
export function ScreenFrame({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className={s.viewport}>
      <div
        className={s.frame}
        style={{ transform: `scale(${scale}) translate(-50%, -50%)`, visibility: scale ? "visible" : "hidden" }}
      >
        {children}
      </div>
    </div>
  );
}
