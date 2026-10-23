// Outage behaviour on a LOCAL stack (pauses/stops local Supabase containers).
//   npm run dev  &&  npm run test:resilience
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { BASE, PUBLISHABLE, SUPABASE_URL, check, finish, makePhoto, makeUser, removeUser } from "./_setup.mjs";

const PROJECT = process.env.SUPABASE_PROJECT_ID ?? "mascot_arena";
const docker = (...args) => execFileSync("docker", args, { stdio: "pipe" }).toString().trim();
const admin = await makeUser(true);
const browser = await chromium.launch();
const errors = [];

const submitAndApprove = async (team) => {
  const form = new FormData();
  form.set("team", team);
  form.set("token", crypto.randomUUID());
  form.set("photo", new Blob([await makePhoto(team)], { type: "image/jpeg" }), "p.jpg");
  const sub = await (await fetch(`${BASE}/api/submit`, { method: "POST", body: form })).json();
  if (!sub.ok) throw new Error(`submit failed: ${JSON.stringify(sub)}`);
  const user = createClient(SUPABASE_URL, PUBLISHABLE, { auth: { persistSession: false } });
  await user.auth.signInWithPassword({ email: admin.email, password: admin.password });
  const { error } = await user.rpc("moderate_submission", { p_submission_id: sub.id, p_decision: "approved" });
  if (error) throw error;
};

try {
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${BASE}/screen`, { waitUntil: "networkidle" });
  await p.waitForSelector('[data-testid=feed-status]:has-text("LIVE FEED")', { timeout: 20000 });

  // 1) realtime down → polling still delivers
  docker("pause", `supabase_realtime_${PROJECT}`);
  try {
    const t0 = Date.now();
    await submitAndApprove("Offline Owls");
    await p.waitForSelector("[data-testid=photo-card]", { timeout: 45000 });
    check(true, `realtime paused: approved photo still arrived by polling (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } finally {
    docker("unpause", `supabase_realtime_${PROJECT}`);
  }
  await p.waitForSelector("[data-testid=photo-card]", { state: "detached", timeout: 20000 });

  // 2) whole API down → arena keeps animating; feed recovers
  docker("stop", `supabase_kong_${PROJECT}`);
  try {
    await p.waitForTimeout(4000);
    const before = await p.evaluate(() => JSON.stringify(window.stage.hero.pose));
    await p.evaluate(() => void window.stage.celebrate());
    await p.waitForTimeout(500);
    const during = await p.evaluate(() => JSON.stringify(window.stage.hero.pose));
    check(before !== during, "supabase down: mascot animates and celebrate still works");
    check(/RECONNECTING/.test(await p.textContent("[data-testid=feed-status]")), "HUD shows RECONNECTING while down");
  } finally {
    docker("start", `supabase_kong_${PROJECT}`);
  }
  await p.waitForSelector('[data-testid=feed-status]:has-text("LIVE FEED")', { timeout: 60000 });
  check(true, "feed recovered to LIVE");
  check(errors.length === 0, `no uncaught page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
} finally {
  await browser.close();
  await removeUser(admin);
}
finish();
