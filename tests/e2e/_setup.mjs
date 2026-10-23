// Shared setup for the local end-to-end tests. Refuses to run against anything
// but a local stack so it can never touch production data.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3210";
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isLocal = (u) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u);
if (!isLocal(BASE) || !isLocal(SUPA)) {
  console.error(`Refusing to run: E2E tests only target a local stack (app ${BASE}, supabase ${SUPA || "unset"}).`);
  process.exit(2);
}

export const db = createClient(SUPA, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
export const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const SUPABASE_URL = SUPA;

let failures = 0;
export function check(cond, msg) {
  console.log(cond ? "✓" : "✗ FAIL:", msg);
  if (!cond) failures++;
}
export function finish() {
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

/** throwaway users with random passwords (never printed) */
export async function makeUser(admin) {
  const email = `e2e-${randomBytes(4).toString("hex")}@test.local`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  if (admin) {
    const { error: e } = await db.from("admins").insert({ user_id: data.user.id });
    if (e) throw e;
  }
  return { email, password, id: data.user.id };
}

export async function removeUser(u) {
  await db.auth.admin.deleteUser(u.id);
}

/** a unique test photo (unique pixels → unique hash, so no duplicate rejections) */
export async function makePhoto(label, { exif = true, size = 1600 } = {}) {
  const hue = Math.floor(Math.random() * 255);
  const svg = `<svg width="${size}" height="${size * 0.75}"><rect width="100%" height="100%" fill="rgb(${hue},40,120)"/>
    <circle cx="${size / 2}" cy="${size * 0.35}" r="${size / 6}" fill="#ff6a00"/>
    <text x="40" y="${size * 0.7}" font-size="${size / 10}" fill="#fff">${label} ${randomBytes(3).toString("hex")}</text></svg>`;
  let img = sharp(Buffer.from(svg)).jpeg({ quality: 92 });
  if (exif) img = img.withMetadata({ exif: { IFD0: { Artist: "e2e", ImageDescription: "GPS 51.5,-0.12" } } });
  return img.toBuffer();
}

/** page watcher: collects console errors, page errors and failed requests */
export function watch(page, name, problems, allow = []) {
  const ok = (s) => allow.some((re) => re.test(s));
  page.on("console", (m) => m.type() === "error" && !ok(m.text()) && problems.push(`[${name}] console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on("response", (r) => r.status() >= 500 && problems.push(`[${name}] HTTP ${r.status()} ${r.url()}`));
  page.on("requestfailed", (r) => {
    const s = `${r.url()} ${r.failure()?.errorText}`;
    if (!r.url().includes("webpack-hmr") && !ok(s)) problems.push(`[${name}] failed ${s}`);
  });
}
