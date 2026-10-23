"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, type StageEvent } from "@/arena/stage";
import { createAgora } from "@/arena/scenes/agora";
import { PIXEL, WORLD_W } from "@/arena/scenes/types";
import { pick, rand } from "@/arena/pixel";
import { ScreenFrame } from "./ScreenFrame";
import { Banner, Clock, JoinQR, SpeechBubble, Ticker } from "./Overlays";
import { PhotoCard } from "./PhotoCard";
import { type FeedItem, useScreenFeed } from "./useScreenFeed";
import s from "./arena.module.css";

const IDLE_CHATTER = [
  "WHO'S STILL ON THEIR FIRST COMMIT?",
  "HYDRATE. THEN GIT PUSH.",
  "I CAN SMELL A DEMO BUG FROM HERE.",
  "SCAN THE QR. I DARE YOU.",
  "NEXT QUEST IS GONNA BE SPICY.",
  "REMEMBER: IT WORKS ON MY MACHINE.",
];

const PHOTO_LINES = [
  "LOOK AT THAT SETUP!",
  "ICONIC. FRAME IT.",
  "10/10, WOULD MERGE.",
  "THE VIBES ARE IMMACULATE.",
  "PEAK HACKATHON ENERGY.",
];

const CHALLENGER_LINES = [
  "A NEW CHALLENGER APPROACHES!",
  "MAIN CHARACTER ENERGY!",
  "THEY GOT THE HERO EDIT!",
  "STICKER-WORTHY. ICONIC.",
  "THAT'S A BOSS-FIGHT POSE.",
];

const BUBBLE_W_GUESS = 560;
const PHOTO_HOLD_MS = 7000;
const MAX_QUEUE = 40;
/** card centre in world px (matches .photoCard left/top in arena.module.css) */
const CARD_WORLD = { x: 1300 / PIXEL, y: 520 / PIXEL };

type Card = { id: string; team: string; image: ImageBitmap | HTMLImageElement; cutout: boolean; leaving: boolean };

/** the server stores background-removed photos (and only those) as WebP */
async function loadPhoto(id: string): Promise<{ image: ImageBitmap; cutout: boolean } | null> {
  try {
    const res = await fetch(`/api/screen/photo/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const cutout = res.headers.get("content-type") === "image/webp";
    return { image: await createImageBitmap(await res.blob()), cutout };
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ArenaScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const lastInput = useRef(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ title: string; sub?: string; leaving: boolean; id: number } | null>(null);
  const [dev, setDev] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const queue = useRef<FeedItem[]>([]);
  const showing = useRef<{ id: string; pulled: boolean } | null>(null);

  const feed = useScreenFeed(
    (item) => {
      if (queue.current.length >= MAX_QUEUE) queue.current.shift();
      queue.current.push(item);
    },
    (id) => {
      queue.current = queue.current.filter((q) => q.submission_id !== id);
      if (showing.current?.id === id) showing.current.pulled = true;
    },
  );
  const photoTotal = useRef<number | null>(null);
  photoTotal.current = feed.total;

  const onStageEvent = useCallback((e: StageEvent) => {
    if (e.type === "say") {
      setBubble(e.text);
      const t = e.text;
      setTimeout(() => setBubble((b) => (b === t ? null : b)), e.ms ?? 2400);
    } else if (e.type === "banner") {
      const id = Date.now();
      setBanner({ title: e.title, sub: e.sub, leaving: false, id });
      setTimeout(() => setBanner((b) => (b?.id === id ? { ...b, leaving: true } : b)), 2700);
      setTimeout(() => setBanner((b) => (b?.id === id ? null : b)), 3100);
    }
  }, []);

  useEffect(() => {
    const stage = new Stage(canvasRef.current!, createAgora);
    stageRef.current = stage;
    const off = stage.on(onStageEvent);
    stage.onFrame = (head) => {
      const el = bubbleRef.current;
      if (!el) return;
      const w = el.offsetWidth || BUBBLE_W_GUESS;
      const x = Math.max(40, Math.min(1920 - w - 40, head.x * PIXEL - w / 2));
      const y = head.y * PIXEL - el.offsetHeight - 48;
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    stage.start();
    (window as unknown as { stage: Stage }).stage = stage;
    const hello = setTimeout(() => void stage.wave("HELLO REALM HACK '26!"), 1400);
    setDev(new URLSearchParams(window.location.search).has("dev"));
    return () => {
      clearTimeout(hello);
      off();
      stage.stop();
    };
  }, [onStageEvent]);

  // autonomous director: keeps the mascot alive between real events
  useEffect(() => {
    let alive = true;
    let beat = 0;
    const tick = async () => {
      while (alive) {
        await new Promise((r) => setTimeout(r, rand(3500, 6500)));
        const st = stageRef.current;
        if (!st || st.isBusy || performance.now() - lastInput.current < 8000) continue;
        beat++;
        const h = st.hero;
        const r = Math.random();
        const id = st.momentId;
        // a real moment may start mid-routine: stop touching the hero if so
        const ok = () => st.momentId === id;
        if (beat % 9 === 0) await st.celebrate("HYPE CHECK", "SCAN TO PLAY");
        else if (beat % 7 === 0) await st.attack();
        else if (r < 0.4) {
          await h.walkTo(Math.round(rand(150, WORLD_W - 150)));
          if (ok() && Math.random() < 0.5) await h.walkTo(WORLD_W / 2);
          if (ok()) h.facing = 1;
        } else if (r < 0.65) {
          st.say(photoTotal.current === 0 && Math.random() < 0.5 ? "NO PHOTOS YET. BE THE FIRST!" : pick(IDLE_CHATTER), 3000);
          await h.play("talk");
          await new Promise((res) => setTimeout(res, 2400));
          if (ok()) await h.play("idle");
        } else if (r < 0.85) await h.play("look");
        else await st.wave(pick(["HI HI HI!", "YOU THERE! YES, YOU!", "WAVE BACK!"]));
      }
    };
    void tick();
    return () => {
      alive = false;
    };
  }, []);

  // photo queue: one arrival at a time, never overlapping other moments
  useEffect(() => {
    let alive = true;
    const run = async () => {
      while (alive) {
        await sleep(400);
        const st = stageRef.current;
        if (!st || st.isBusy || showing.current || queue.current.length === 0) continue;
        const item = queue.current.shift()!;
        showing.current = { id: item.submission_id, pulled: false };
        const loaded = await loadPhoto(item.submission_id);
        if (!loaded || showing.current.pulled) {
          showing.current = null;
          continue; // pulled or unavailable: skip silently
        }
        const { image, cutout } = loaded;
        const cur = showing.current;
        await st.moment("photo", async () => {
          const h = st.hero;
          await h.walkTo(150);
          h.facing = 1;
          st.say(
            cutout ? `TEAM ${item.team_name.toUpperCase()} HAS ENTERED THE ARENA!` : `TEAM ${item.team_name.toUpperCase()} SENT A PHOTO!`,
            2600,
          );
          void h.play(cutout ? "celebrate" : "wave");
          setCard({ id: item.submission_id, team: item.team_name, image, cutout, leaving: false });
          await sleep(420); // card lands
          st.landing(CARD_WORLD.x, CARD_WORLD.y);
          if (cutout) void st.fireworks(4, 260, 420);
          for (let t = 0; t < PHOTO_HOLD_MS && !cur.pulled; t += 250) {
            if (t === 3000) {
              st.say(pick(cutout ? CHALLENGER_LINES : PHOTO_LINES), 2600);
              void h.play("talk");
            }
            await sleep(250);
          }
          void h.play("idle");
          setCard((c) => (c ? { ...c, leaving: true } : c));
          await sleep(650);
          setCard(null);
          if ("close" in image) image.close();
          await h.walkTo(WORLD_W / 2);
          h.facing = 1;
        });
        showing.current = null;
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, []);

  // keyboard controls for operators
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const st = stageRef.current;
      if (!st) return;
      lastInput.current = performance.now();
      const h = st.hero;
      switch (e.key.toLowerCase()) {
        case "c":
        case " ":
          e.preventDefault();
          void st.celebrate();
          break;
        case "a":
          void st.attack();
          break;
        case "w":
          void st.wave();
          break;
        case "arrowleft":
          void h.walkTo(Math.max(110, h.x - 70));
          break;
        case "arrowright":
          void h.walkTo(Math.min(WORLD_W - 110, h.x + 70));
          break;
        case "t":
          void st.transition();
          break;
        case "h":
          setDev((d) => !d);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (fn: (st: Stage) => void) => () => {
    lastInput.current = performance.now();
    if (stageRef.current) fn(stageRef.current);
  };

  return (
    <ScreenFrame>
      <canvas ref={canvasRef} className={s.canvas} />

      {banner && <Banner key={banner.id} title={banner.title} sub={banner.sub} leaving={banner.leaving} />}
      {card && <PhotoCard key={card.id} image={card.image} team={card.team} cutout={card.cutout} leaving={card.leaving} />}
      {bubble && <SpeechBubble ref={bubbleRef} text={bubble} />}

      <div className={`${s.corner} ${s.tl}`} />
      <div className={`${s.corner} ${s.tr}`} />
      <div className={`${s.corner} ${s.bl}`} />
      <div className={`${s.corner} ${s.br}`} />
      <div className={s.brand}>
        <div className={s.brandTitle}>
          REALM HACK <em>&apos;26</em>
        </div>
        <div className={s.chip}>
          <span className={s.liveDot} /> LIVE · MASCOT ARENA
        </div>
      </div>
      <Clock />
      {feed.status !== "offline" && (
        <div className={s.feed} data-testid="feed-status">
          <span className={`${s.feedDot} ${feed.status === "live" ? "" : s.feedDotWarn}`} />
          {feed.status === "live"
            ? `LIVE FEED · ${feed.total ?? 0} PHOTO${feed.total === 1 ? "" : "S"}`
            : feed.status === "connecting"
              ? "CONNECTING…"
              : "RECONNECTING…"}
        </div>
      )}
      <JoinQR />
      <Ticker />

      {dev && (
        <div className={s.dev}>
          <button onClick={run((st) => void st.celebrate())}>CELEBRATE</button>
          <button onClick={run((st) => void st.attack())}>ATTACK</button>
          <button onClick={run((st) => void st.wave())}>WAVE</button>
          <button onClick={run((st) => void st.hero.walkTo(Math.max(110, st.hero.x - 70)))}>◀ WALK</button>
          <button onClick={run((st) => void st.hero.walkTo(Math.min(WORLD_W - 110, st.hero.x + 70)))}>WALK ▶</button>
          <button onClick={run((st) => void st.transition())}>WIPE</button>
          <div className={s.devHint}>KEYS: C A W ← → T · H HIDES</div>
        </div>
      )}
      <div className={s.scanlines} />
    </ScreenFrame>
  );
}
