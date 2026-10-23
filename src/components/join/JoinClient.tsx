"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimName } from "@/arena/animations";
import { MascotBadge } from "@/components/shared/MascotBadge";
import s from "./join.module.css";

const MAX_PICK_BYTES = 25 * 1024 * 1024;
/** must stay under the server limit (4 MB) and Vercel's 4.5 MB body cap */
const MAX_SEND_BYTES = 4 * 1024 * 1024;
const MAX_EDGE = 1280;
const TEAM_KEY = "rh_team";

type Phase =
  | { k: "idle" }
  | { k: "preparing" }
  | { k: "ready" }
  | { k: "uploading"; pct: number }
  | { k: "sent"; team: string }
  | { k: "error"; message: string; retryAt?: number };

/** randomUUID needs a secure context; phones on plain-http LAN URLs don't have one. */
function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Downscale to ≤1280px and re-encode as JPEG ~0.8 (also drops EXIF/GPS on the phone). */
async function compress(file: File): Promise<Blob> {
  let source: CanvasImageSource & { width: number; height: number };
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      source = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const k = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const c = document.createElement("canvas");
  c.width = Math.round(source.width * k);
  c.height = Math.round(source.height * k);
  c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.8));
}

function upload(form: FormData, onProgress: (pct: number) => void) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/submit");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    xhr.timeout = 60_000;
    xhr.send(form);
  });
}

export function JoinClient() {
  const [team, setTeam] = useState("");
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [preview, setPreview] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const photo = useRef<{ blob: Blob; token: string } | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setTeam(localStorage.getItem(TEAM_KEY) ?? "");
    } catch {}
  }, []);

  // ticking clock only while a cooldown is showing
  const retryAt = phase.k === "error" ? phase.retryAt : undefined;
  useEffect(() => {
    if (!retryAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [retryAt]);
  const cooldown = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setPhase({ k: "error", message: "That isn't a photo. Pick an image file." });
    if (file.size > MAX_PICK_BYTES) return setPhase({ k: "error", message: "That photo is huge. Try a smaller one." });
    setPhase({ k: "preparing" });
    try {
      const blob = await compress(file);
      if (blob.size > MAX_SEND_BYTES) return setPhase({ k: "error", message: "That photo is too large. Try another one." });
      // a fresh token per chosen photo: retries of the same photo stay idempotent
      photo.current = { blob, token: uuid() };
      setPreview(URL.createObjectURL(blob));
      setPhase({ k: "ready" });
    } catch {
      setPhase({ k: "error", message: "Couldn't read that photo. Try another one (JPEG or PNG)." });
    }
  };

  const send = async () => {
    const name = team.replace(/\s+/g, " ").trim();
    if (name.length < 2) return setPhase({ k: "error", message: "Enter your team name first." });
    if (!photo.current) return;
    try {
      localStorage.setItem(TEAM_KEY, name);
    } catch {}
    const form = new FormData();
    form.set("team", name);
    form.set("token", photo.current.token);
    form.set("photo", photo.current.blob, "photo.jpg");
    setPhase({ k: "uploading", pct: 0 });
    try {
      const { status, body } = await upload(form, (pct) => setPhase({ k: "uploading", pct }));
      if (status === 200 && body.ok) {
        photo.current = null;
        setPreview(null);
        setPhase({ k: "sent", team: String(body.team ?? name) });
        return;
      }
      if (status === 413 && !body.message) body.message = "That photo is too large. Try another one.";
      const retry = Number(body.retryAfter ?? 0);
      setNow(Date.now());
      setPhase({
        k: "error",
        message: String(body.message ?? "Something went wrong. Try again."),
        retryAt: retry ? Date.now() + retry * 1000 : undefined,
      });
    } catch {
      setPhase({ k: "error", message: "No connection. Check your Wi-Fi and tap send again." });
    }
  };

  const reset = () => {
    photo.current = null;
    setPreview(null);
    setPhase({ k: "idle" });
  };

  const busy = phase.k === "preparing" || phase.k === "uploading";
  const canSend = !!photo.current && !busy && cooldown === 0 && phase.k !== "sent";
  const anim: AnimName =
    phase.k === "sent" ? "celebrate" : phase.k === "error" ? "hurt" : phase.k === "uploading" ? "talk" : phase.k === "ready" ? "wave" : "idle";

  return (
    <main className={s.page}>
      <header className={s.head}>
        <MascotBadge anim={anim} size={2} />
        <div>
          <h1 className={s.title}>
            REALM HACK <em>&apos;26</em>
          </h1>
          <p className={s.kicker}>SEND A PHOTO TO THE BIG SCREEN</p>
        </div>
      </header>

      {phase.k === "sent" ? (
        <section className={s.card} aria-live="polite">
          <p className={s.big}>SENT!</p>
          <p className={s.copy}>
            Team <b>{phase.team}</b>, your photo is waiting for a moderator. If it&apos;s approved, watch the big screen!
          </p>
          <button className={s.primary} onClick={reset}>
            SEND ANOTHER
          </button>
        </section>
      ) : (
        <section className={s.card}>
          <label className={s.label} htmlFor="team">
            TEAM NAME
          </label>
          <input
            id="team"
            className={s.input}
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            maxLength={32}
            autoComplete="organization"
            placeholder="e.g. Null Pointers"
            disabled={busy}
          />

          <div className={s.photoBox}>
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Your photo" className={s.preview} />
            ) : (
              <p className={s.placeholder}>{phase.k === "preparing" ? "PREPARING…" : "NO PHOTO YET"}</p>
            )}
          </div>

          <div className={s.row}>
            <button className={s.secondary} onClick={() => cameraInput.current?.click()} disabled={busy}>
              📷 TAKE PHOTO
            </button>
            <button className={s.secondary} onClick={() => galleryInput.current?.click()} disabled={busy}>
              🖼 UPLOAD
            </button>
          </div>
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            hidden
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {phase.k === "uploading" && (
            <div className={s.progress} role="progressbar" aria-valuenow={phase.pct} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${phase.pct}%` }} />
            </div>
          )}
          {phase.k === "error" && (
            <p className={s.error} role="alert">
              {phase.message}
              {cooldown > 0 && ` (${cooldown}s)`}
            </p>
          )}

          <button className={s.primary} onClick={send} disabled={!canSend}>
            {phase.k === "uploading" ? `SENDING ${phase.pct}%` : cooldown > 0 ? `WAIT ${cooldown}s` : "SEND TO ARENA ▶"}
          </button>
          <p className={s.fine}>Every photo is checked by a human before it appears. Be kind.</p>
        </section>
      )}
    </main>
  );
}
