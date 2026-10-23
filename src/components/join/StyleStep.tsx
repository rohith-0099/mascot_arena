"use client";

import { useEffect, useState } from "react";
import { cutout } from "@/lib/cutout";
import { LOOKS, type Look, renderLook } from "@/lib/looks";
import s from "./join.module.css";

/** must stay under the server limit (4 MB) and Vercel's 4.5 MB body cap */
export const MAX_SEND_BYTES = 4 * 1024 * 1024;

type Cut = { k: "working" } | { k: "done"; canvas: HTMLCanvasElement } | { k: "nobody" } | { k: "failed" };

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob | null>((res) => c.toBlob(res, type, q));

/** transparent → WebP (PNG where WebP encoding is missing, e.g. Safari); opaque → JPEG */
async function encode(c: HTMLCanvasElement, alpha: boolean): Promise<Blob | null> {
  for (let i = 0; i < 3; i++) {
    let b = alpha ? await toBlob(c, "image/webp", 0.9) : await toBlob(c, "image/jpeg", 0.85);
    if (alpha && b && b.type !== "image/webp") b = await toBlob(c, "image/png");
    if (b && b.size <= MAX_SEND_BYTES) return b;
    // too big (large PNG): shrink and retry
    const small = document.createElement("canvas");
    small.width = Math.round(c.width * 0.75);
    small.height = Math.round(c.height * 0.75);
    small.getContext("2d")!.drawImage(c, 0, 0, small.width, small.height);
    c = small;
  }
  return null;
}

/**
 * Background removal + look picker. Reports the final, upload-ready blob (or
 * null while it's being made) through `onResult`.
 */
export function StyleStep({
  photo,
  disabled,
  onResult,
}: {
  photo: HTMLCanvasElement;
  disabled: boolean;
  onResult: (blob: Blob | null, error?: string) => void;
}) {
  const [removeBg, setRemoveBg] = useState(true);
  const [look, setLook] = useState<Look>("sticker");
  const [cut, setCut] = useState<Cut>({ k: "working" });

  // one segmentation per crop; toggles and looks reuse it
  useEffect(() => {
    let alive = true;
    setCut({ k: "working" });
    cutout(photo)
      .then((c) => alive && setCut(c ? { k: "done", canvas: c } : { k: "nobody" }))
      .catch(() => alive && setCut({ k: "failed" }));
    return () => {
      alive = false;
    };
  }, [photo]);

  const waiting = removeBg && cut.k === "working";
  useEffect(() => {
    if (waiting) return onResult(null);
    let alive = true;
    onResult(null);
    const isCut = removeBg && cut.k === "done";
    // let the "working" state paint before the pixel loops run
    const t = setTimeout(async () => {
      const out = renderLook(isCut ? cut.canvas : photo, look, isCut);
      const blob = await encode(out, isCut);
      if (alive) onResult(blob, blob ? undefined : "That photo is too large. Try another one.");
    }, 30);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // onResult is a stable setter wrapper from the parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, removeBg, look, cut, waiting]);

  const note =
    !removeBg
      ? null
      : cut.k === "working"
        ? "✂ CUTTING YOU OUT…"
        : cut.k === "nobody"
          ? "No person found, so the background stays."
          : cut.k === "failed"
            ? "Background removal isn't available on this phone."
            : null;

  return (
    <div className={s.style}>
      <label className={s.toggle}>
        <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} disabled={disabled} />
        <span className={s.toggleBox} aria-hidden />
        REMOVE BACKGROUND
      </label>
      {note && (
        <p className={s.note} aria-live="polite">
          {note}
        </p>
      )}
      <div className={s.looks} role="radiogroup" aria-label="Look">
        {LOOKS.map((l) => (
          <button
            key={l.id}
            role="radio"
            aria-checked={look === l.id}
            className={`${s.look} ${s[`look_${l.id}`]} ${look === l.id ? s.lookOn : ""}`}
            onClick={() => setLook(l.id)}
            disabled={disabled}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
