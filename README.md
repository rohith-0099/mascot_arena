# Realm Hack '26 — Live Mascot Arena

Next.js (App Router) + TypeScript. The arena is a pure Canvas 2D engine, with no runtime art assets, paid APIs or cloud generation.

```
npm install
npm run dev
```

| Route | What |
|---|---|
| `/screen` | 1920×1080 projector view (scaled to fit). Add `?dev` for operator buttons. |
| `/join` | Phone page: team name + camera/upload → crop, background removal and a look (sticker / hero / neon / 8-bit) → moderation queue. |
| `/admin` | Moderation queue (Supabase Auth, admins only): approve, reject, pull from screen. |
| `/lab` | Every character × every animation on a transparency checkerboard; PNG + JSON sheet export. |

Without Supabase env vars the arena runs in **offline mode**: the mascot and all effects work, `/join` politely refuses uploads and `/admin` shows a setup notice.

**Operator keys on `/screen`:** `C`/`Space` celebrate · `A` attack · `W` wave · `←`/`→` walk · `T` block-wipe transition · `H` toggle controls.

## Photo pipeline

**On the phone:** crop (drag, pinch, slider) → optional background removal with MediaPipe's selfie segmenter, running fully on the device (no cloud call; the WASM runtime is copied into `public/mediapipe` by `scripts/copy-mediapipe.mjs` before `dev`/`build`, the model is `public/models/selfie_segmenter.tflite`) → a look baked into the pixels, so moderators approve exactly what the screen shows. Cutouts are sent with transparency, stored as WebP and shown on `/screen` as a "new challenger" with light rays and fireworks; full photos stay JPEG and use the arcade card.

```
phone /join ──POST /api/submit──▶ validate + resize + strip EXIF (sharp)
                                   │ service role (server only)
                                   ▼
                     private bucket `submissions` + row status=pending
                                   │
admin /admin ──POST /api/admin/moderate──▶ moderate_submission() RPC
               (session cookie, same-origin)    (refuses non-admins in the DB)
                                   │ trigger
                                   ▼
                       screen_feed (approved only, no file paths)
                                   │ Realtime + backfill/poll
                                   ▼
/screen ──GET /api/screen/photo/:id──▶ streams photo only if still approved
```

### Security model

| Who | Can |
|---|---|
| anyone (publishable key) | read `screen_feed` (approved team names + ids). Nothing else: no submissions, teams, photos, RPCs or writes. |
| signed-in non-admin | nothing beyond the above. |
| admin (row in `admins`) | read submissions/teams, read photos in the private bucket (signed URLs), moderate **only** via `moderate_submission()`. No direct table writes. |
| server (secret key) | insert submissions, upload photos, rate limiting, stream approved photos. Imported via `server-only`, never bundled for the browser. |

Upload safeguards: magic-byte type check (JPEG/PNG/WebP), 4 MB cap (Vercel rejects bodies over 4.5 MB), server-side decode + re-encode (rejects non-images, strips GPS/EXIF, caps 1280 px), 1 upload per device per 30 s and 30 per IP per minute (atomic, in Postgres), idempotent retries via a per-photo token, and duplicate-image rejection (SHA-256). Phones also compress to ≤1280 px JPEG before uploading. Public sign-ups are disabled; admins are created from the dashboard or with a script that reads secrets at hidden prompts. Production refuses uploads unless `SUBMITTER_HASH_SALT` is set.

## Setup

### Local (Docker)

```bash
npm install
npx supabase start -x edge-runtime,logflare,vector,imgproxy,supavisor   # applies supabase/migrations
npx supabase status -o env      # copy API_URL / PUBLISHABLE_KEY / SECRET_KEY into .env.local (see .env.example)
node --env-file=.env.local scripts/create-admin.mjs   # prompts for email + password (hidden)
npm run dev
```

Studio (DB browser) runs at http://127.0.0.1:54323. `npx supabase db reset` wipes and re-applies migrations.

### Hosted (Supabase free tier + Vercel Hobby)

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**: audit results, every environment variable, the step-by-step checklist, creating the admin safely, the production smoke test, kill switches and data cleanup.

## Tests

| Command | What | Needs |
|---|---|---|
| `npm run test:unit` | origin check, client-IP and HTTPS detection | nothing |
| `npm run test:db` | 37 pgTAP checks: grants for every API role, RLS as anon/non-admin/admin, private bucket, storage policy, realtime publication | local Supabase |
| `npm run test:e2e` | full browser flow: 2 phones → pending → reject + approve → 2 screens → pull → sign-out, plus authorization and request-hardening checks | local Supabase + `npm run dev` |
| `npm run test:resilience` | Realtime paused (polling delivers) and API down (arena keeps running, recovers) | same; pauses/stops local containers |

The E2E scripts refuse to run unless both the app and Supabase are on `localhost`. Install the browser once with `npx playwright install chromium`.

## Engine layout (`src/arena`)

- `characters.ts`: the roster as data (palette + head feature). Adding a mascot is one entry here.
- `sprite.ts`: procedural rasteriser. A `Pose` becomes a 56×56 transparent frame with a 1px outline and 3-tone shading. Every character shares the same body maths, so silhouettes stay consistent.
- `animations.ts`: idle, blink, look, walk, wave, celebrate, attack, hurt and talk as stepped keyframes with per-frame timing and events (`jump`, `land`, `impact`…).
- `actor.ts`: per-character state machine. Idle never freezes; blinks are layered on top of any animation.
- `stage.ts`: render loop at 480×270 (×4 = 1080p, integer scaled), camera, parallax, shake, flashes, shockwaves, impact stars, hit-stop and block-wipe transitions, plus the `celebrate()` / `attack()` moments.
- `scenes/`: reusable backdrops (`Scene` interface). `agora.ts` is the Greek temple with an eclipse, braziers, embers and a meander-band stage.

## Third-party repos evaluated

| Repo | Verdict |
|---|---|
| DohaerisAI/kinetome | Skipped. No license (all rights reserved), and its character pipeline depends on Gemini and the Claude CLI. |
| KodoRe/pixel-forge | Skipped. No LICENSE file (MIT is only claimed in a source header), the npm package of the same name can't be verified as the same project, and its generic generators can't produce this specific mascot. |
| MozeeB/pixel-asset-gen | Not used. It is MIT and clean, but it's an offline Python generator in a Kingdom-Rush style that clashes with the brand. Our particle/effect approach is similar in spirit and written directly in Canvas. |

Dependencies: `next`, `react`, `qrcode`, `@mediapipe/tasks-vision` 0.10.35 (Apache-2.0; pinned below 1.x, which adds usage telemetry to Google), `@supabase/supabase-js`, `@supabase/ssr`, `server-only` (MIT), `sharp` (Apache-2.0); dev: `supabase` CLI (MIT). Fonts: Bricolage Grotesque and Silkscreen (OFL, via `next/font`).
