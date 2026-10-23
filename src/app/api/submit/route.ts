import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp, isHttps } from "@/lib/http";
import { MAX_UPLOAD_BYTES, PHOTO_TYPES, hashWithSalt, normaliseImage, sniffImage, submitterSalt } from "@/lib/image";
import { PHOTO_BUCKET } from "@/lib/supabase/env";
import { serviceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const DEVICE_COOKIE = "rh_device";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEAM_RE = /^[\p{L}\p{N} _\-'.&!]+$/u;

// 1 upload per device every 30 s; a looser per-IP cap because a whole venue
// usually shares one Wi-Fi address.
const DEVICE_WINDOW_S = 30;
const IP_WINDOW_S = 60;
const IP_MAX = 30;

type Fail = { code: string; message: string; retryAfter?: number };
const fail = (status: number, body: Fail, res?: NextResponse) => {
  const r = NextResponse.json({ ok: false, ...body }, { status });
  res?.cookies.getAll().forEach((c) => r.cookies.set(c));
  if (body.retryAfter) r.headers.set("Retry-After", String(body.retryAfter));
  return r;
};

const TOO_LARGE = "Photo is too large (max 4 MB).";

export async function POST(req: NextRequest) {
  const db = serviceClient();
  const salt = submitterSalt();
  if (!db || !salt) {
    if (db && !salt) console.error("SUBMITTER_HASH_SALT is missing or shorter than 16 characters");
    return fail(503, { code: "not_configured", message: "Submissions are not open yet." });
  }

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, { code: "too_large", message: TOO_LARGE });

  // device id cookie (httpOnly, random) for per-device limits
  const cookieRes = new NextResponse();
  let device = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!device || !UUID_RE.test(device)) {
    device = randomUUID();
    cookieRes.cookies.set(DEVICE_COOKIE, device, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps(req),
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, { code: "bad_request", message: "Could not read the upload." }, cookieRes);
  }

  const team = String(form.get("team") ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
  const token = String(form.get("token") ?? "");
  const file = form.get("photo");

  if (team.length < 2 || team.length > 32 || !TEAM_RE.test(team))
    return fail(400, { code: "bad_team", message: "Team name must be 2–32 letters, numbers or spaces." }, cookieRes);
  if (!UUID_RE.test(token)) return fail(400, { code: "bad_request", message: "Missing submission token." }, cookieRes);
  if (!(file instanceof Blob) || file.size === 0)
    return fail(400, { code: "no_photo", message: "Please choose a photo." }, cookieRes);
  if (file.size > MAX_UPLOAD_BYTES) return fail(413, { code: "too_large", message: TOO_LARGE }, cookieRes);

  // idempotent retry: same token → same answer, no new upload, no rate-limit hit
  const { data: existing } = await db.from("submissions").select("id, status").eq("client_token", token).maybeSingle();
  if (existing) {
    const r = NextResponse.json({ ok: true, id: existing.id, status: existing.status, repeated: true });
    cookieRes.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  }

  const raw = Buffer.from(await file.arrayBuffer());
  if (!sniffImage(raw))
    return fail(415, { code: "bad_type", message: "Only JPEG, PNG or WebP photos are accepted." }, cookieRes);

  const ipHash = hashWithSalt(`ip:${clientIp(req)}`, salt);
  const [{ data: devOk, error: e1 }, { data: ipOk, error: e2 }] = await Promise.all([
    db.rpc("take_rate_limit", { p_key: `dev:${device}`, p_window_seconds: DEVICE_WINDOW_S, p_max: 1 }),
    db.rpc("take_rate_limit", { p_key: `ip:${ipHash}`, p_window_seconds: IP_WINDOW_S, p_max: IP_MAX }),
  ]);
  if (e1 || e2) {
    console.error("rate limit rpc failed", e1 ?? e2);
    return fail(500, { code: "server_error", message: "Something went wrong. Try again." }, cookieRes);
  }
  if (!devOk)
    return fail(429, { code: "rate_limited", message: "Easy there! One photo every 30 seconds.", retryAfter: DEVICE_WINDOW_S }, cookieRes);
  if (!ipOk)
    return fail(429, { code: "rate_limited", message: "The arena is busy. Try again in a minute.", retryAfter: IP_WINDOW_S }, cookieRes);

  let img: Awaited<ReturnType<typeof normaliseImage>>;
  try {
    img = await normaliseImage(raw);
  } catch {
    return fail(415, { code: "bad_image", message: "That file doesn't look like a valid photo." }, cookieRes);
  }

  // team: create on first use (case-insensitive unique)
  const { error: teamErr } = await db.from("teams").upsert({ name: team }, { onConflict: "name", ignoreDuplicates: true });
  const { data: teamRow } = await db.from("teams").select("id, name").eq("name", team).single();
  if (teamErr || !teamRow) {
    console.error("team upsert failed", teamErr);
    return fail(500, { code: "server_error", message: "Could not save your team. Try again." }, cookieRes);
  }

  const type = PHOTO_TYPES[img.format];
  const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${type.ext}`;
  const up = await db.storage.from(PHOTO_BUCKET).upload(path, img.data, { contentType: type.mime, upsert: false });
  if (up.error) {
    console.error("storage upload failed", up.error);
    return fail(500, { code: "server_error", message: "Upload failed. Try again." }, cookieRes);
  }

  const { data: row, error: insErr } = await db
    .from("submissions")
    .insert({
      team_id: teamRow.id,
      photo_path: path,
      client_token: token,
      content_sha256: img.sha256,
      submitter_hash: hashWithSalt(`dev:${device}`, salt),
      width: img.width,
      height: img.height,
      bytes: img.data.length,
    })
    .select("id, status")
    .single();

  if (insErr || !row) {
    await db.storage.from(PHOTO_BUCKET).remove([path]);
    if (insErr?.code === "23505") {
      if (insErr.message.includes("client_token")) {
        const { data: again } = await db.from("submissions").select("id, status").eq("client_token", token).single();
        if (again) return NextResponse.json({ ok: true, id: again.id, status: again.status, repeated: true });
      }
      return fail(409, { code: "duplicate", message: "This photo was already submitted." }, cookieRes);
    }
    console.error("submission insert failed", insErr);
    return fail(500, { code: "server_error", message: "Could not save your photo. Try again." }, cookieRes);
  }

  const res = NextResponse.json({ ok: true, id: row.id, status: row.status, team: teamRow.name });
  cookieRes.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}
