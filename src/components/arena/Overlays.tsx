"use client";

import { forwardRef, useEffect, useState } from "react";
import QRCode from "qrcode";
import s from "./arena.module.css";

/** Pixel speech bubble with typewriter text. Positioned imperatively by the stage (no re-render per frame). */
export const SpeechBubble = forwardRef<HTMLDivElement, { text: string }>(function SpeechBubble({ text }, ref) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    const id = setInterval(() => setShown((n) => (n >= text.length ? n : n + 1)), 32);
    return () => clearInterval(id);
  }, [text]);
  return (
    <div ref={ref} className={s.bubbleAnchor}>
      <div className={s.bubble} key={text}>
        {text.slice(0, shown)}
        {shown < text.length && <span className={s.caret} />}
        <div className={s.bubbleTail} />
      </div>
    </div>
  );
});

export function Banner({ title, sub, leaving }: { title: string; sub?: string; leaving: boolean }) {
  return (
    <div className={`${s.banner} ${leaving ? s.bannerOut : ""}`}>
      <div className={s.bannerBand} />
      <div className={s.bannerTitle}>{title}</div>
      {sub && <div className={s.bannerSub}>{sub}</div>}
    </div>
  );
}

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const end = process.env.NEXT_PUBLIC_EVENT_END ? new Date(process.env.NEXT_PUBLIC_EVENT_END) : null;
  let label = "LOCAL TIME";
  let value = "--:--:--";
  if (now) {
    if (end) {
      label = "TIME LEFT";
      const ms = Math.max(0, end.getTime() - now.getTime());
      const h = Math.floor(ms / 3.6e6),
        m = Math.floor(ms / 6e4) % 60,
        sec = Math.floor(ms / 1000) % 60;
      value = [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
    } else value = now.toLocaleTimeString("en-GB", { hour12: false });
  }
  return (
    <div className={s.clock}>
      <div className={s.clockLabel}>{label}</div>
      <div className={s.clockValue}>{value}</div>
    </div>
  );
}

export function JoinQR() {
  const [el, setEl] = useState<HTMLCanvasElement | null>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/join`;
    setUrl(u);
    if (el) QRCode.toCanvas(el, u, { margin: 0, scale: 4, color: { dark: "#1a0e08", light: "#f2f0ea" } });
  }, [el]);
  return (
    <div className={s.qr}>
      <div className={s.qrBox}>
        <canvas ref={setEl} />
      </div>
      <div className={s.qrText}>
        <b className={s.qrArrow}>◀</b> SCAN
        <br />
        TO PLAY
        <span>{url.replace(/^https?:\/\//, "")}</span>
      </div>
    </div>
  );
}

const TICKER = [
  "★ SCAN THE QR TO JOIN THE ARENA",
  "★ QUESTS DROP EVERY 45 MINUTES",
  "★ FIRST 3 TEAMS TO SUBMIT GET BONUS POINTS",
  "★ TAP HYPE ON YOUR PHONE TO POWER UP REALM",
  "★ BE KIND — EVERY PHOTO IS MODERATED",
];

export function Ticker() {
  const items = [...TICKER, ...TICKER];
  return (
    <div className={s.ticker}>
      <div className={s.tickerTrack}>
        {items.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}
