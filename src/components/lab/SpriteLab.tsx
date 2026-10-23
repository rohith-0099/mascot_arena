"use client";

import { useEffect, useRef, useState } from "react";
import { Actor } from "@/arena/actor";
import { ANIMS, type AnimName } from "@/arena/animations";
import { CHARACTERS, CHARACTER_IDS } from "@/arena/characters";
import { SPRITE_H, SPRITE_W, renderPose } from "@/arena/sprite";

const NAMES = Object.keys(ANIMS) as AnimName[];
const SCALE = 3;

/** One looping preview cell: replays one-shot animations forever. */
function Cell({ charId, anim }: { charId: string; anim: AnimName }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const a = new Actor(charId, SPRITE_W / 2, 52, 1);
    const replay = () => {
      if (!ANIMS[anim].loop) void a.play(anim).then(() => setTimeout(replay, 400));
      else void a.play(anim);
    };
    replay();
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
  }, [charId, anim]);
  return (
    <canvas
      ref={ref}
      width={SPRITE_W}
      height={SPRITE_H}
      className="pixelated"
      style={{ width: SPRITE_W * SCALE, height: SPRITE_H * SCALE, background: "repeating-conic-gradient(#14121a 0 25%, #1c1922 0 50%) 0 0 / 24px 24px" }}
    />
  );
}

/** Export a character as a PNG sheet (one row per animation) + Aseprite-style JSON. */
function exportSheet(charId: string) {
  const char = CHARACTERS[charId];
  const cols = Math.max(...NAMES.map((n) => ANIMS[n].frames.length));
  const c = document.createElement("canvas");
  c.width = cols * SPRITE_W;
  c.height = NAMES.length * SPRITE_H;
  const ctx = c.getContext("2d")!;
  const meta: Record<string, { row: number; frames: number[]; loop: boolean }> = {};
  NAMES.forEach((n, row) => {
    meta[n] = { row, frames: ANIMS[n].frames.map((f) => f.ms), loop: ANIMS[n].loop };
    ANIMS[n].frames.forEach((f, i) => ctx.drawImage(renderPose(char, f.pose), i * SPRITE_W, row * SPRITE_H));
  });
  const dl = (href: string, name: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
  };
  dl(c.toDataURL("image/png"), `${charId}-sheet.png`);
  const json = { frameWidth: SPRITE_W, frameHeight: SPRITE_H, feetY: 52, animations: meta };
  dl(URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" })), `${charId}-sheet.json`);
}

export function SpriteLab() {
  const [only, setOnly] = useState<string | null>(null);
  const ids = only ? [only] : CHARACTER_IDS;
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 40 }}>
        SPRITE <span style={{ color: "var(--orange)" }}>LAB</span>
      </h1>
      <p style={{ color: "var(--gold)", margin: "8px 0 20px", fontSize: 14 }}>
        TRANSPARENT FRAMES · CHECKERBOARD = ALPHA · CLICK A NAME TO FOCUS
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 8 }}>
          <thead>
            <tr>
              <th />
              {NAMES.map((n) => (
                <th key={n} style={{ fontSize: 14, color: "var(--gold)" }}>
                  {n.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => (
              <tr key={id}>
                <td style={{ fontSize: 14, verticalAlign: "middle" }}>
                  <button onClick={() => setOnly(only ? null : id)} style={btn}>
                    {CHARACTERS[id].name}
                  </button>
                  <br />
                  <button onClick={() => exportSheet(id)} style={{ ...btn, marginTop: 8, fontSize: 11 }}>
                    PNG ↓
                  </button>
                </td>
                {NAMES.map((n) => (
                  <td key={n}>
                    <Cell charId={id} anim={n} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  fontFamily: "var(--font-pixel)",
  color: "var(--white)",
  background: "#15121a",
  border: 0,
  padding: "8px 12px",
  boxShadow: "inset 0 0 0 3px var(--orange)",
  cursor: "pointer",
};
