# Production deployment — Realm Hack '26 Live Mascot Arena

Target: **one fresh Supabase project (free tier) + one Vercel project (Hobby)**.
Follow the sections in order. Nothing here needs a paid plan.

- [1. Audit results](#1-audit-results)
- [2. Environment variables](#2-environment-variables)
- [3. Deployment checklist](#3-deployment-checklist)
- [4. Creating the production admin safely](#4-creating-the-production-admin-safely)
- [5. Production smoke test](#5-production-smoke-test)
- [6. During the event: kill switches](#6-during-the-event-kill-switches)
- [7. After the event: data cleanup](#7-after-the-event-data-cleanup)

---

## 1. Audit results

### Verified and fixed (tested locally)

| # | Issue | Impact if unfixed | Fix | How verified |
|---|---|---|---|---|
| 1 | **Fresh hosted projects no longer grant table access to `service_role` by default** (Supabase changelog 45329: default for projects created after 2026-05-30; enforced on all projects from 2026-10-30). The first migration relied on the old defaults. | Every upload returned **500 "permission denied for table teams"**; photo route broken. | New migration `20261023000100_explicit_service_role_grants.sql` grants exactly what the server uses. | Reproduced by recreating the schema on a local DB with the new defaults (upload → 500); after the fix, unit + 37 DB tests + full E2E + resilience pass on that DB. pgTAP now asserts the grants. |
| 2 | **Vercel rejects request bodies > 4.5 MB** before the function runs; the route allowed 8 MB, and the phone showed a generic error for Vercel's non-JSON 413. | Large photos failed with a confusing message. | Server cap 4 MB, phone refuses >4 MB after compression, phone handles a bare 413. | E2E: 4.2 MB upload → 413 `too_large`. |
| 3 | `SUBMITTER_HASH_SALT` silently fell back to a public default. | Device/IP hashes guessable in production. | Production now **fails closed**: missing/short (<16 chars) salt → uploads return 503 and a log line. | `next start` without salt → 503 + `SUBMITTER_HASH_SALT is missing…` in logs. |
| 4 | Admin moderate route crashed (500) on malformed `Origin` (e.g. `null`). | Noisy 500s; CSRF check not robust. | Shared `isSameOrigin()` that never throws. | Unit tests; E2E: `Origin: null` → 403. |
| 5 | Sign-out had no CSRF check. | A malicious page could log the moderator out mid-event. | Same-origin check. | E2E: cross-site logout → 403. |
| 6 | Pages could be framed. | Clickjacking of the Approve button. | `X-Frame-Options: DENY` + `CSP frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` on all routes. | E2E + `next start` header check. |
| 7 | Device cookie `Secure` flag depended on `nextUrl.protocol`, which can read `http` behind a TLS proxy. | Cookie might be sent without `Secure`. | Also honours `x-forwarded-proto`. | `next start` behind `x-forwarded-proto: https` → `Secure; HttpOnly; SameSite=lax`. |
| 8 | Client IP read only `x-forwarded-for`. | Fine on Vercel, but less robust. | Prefers `x-vercel-forwarded-for` (Vercel-set, not overridable by an upstream proxy), then `x-forwarded-for`. Vercel documents that it overwrites client-supplied values. | Unit tests. |
| 9 | `create-admin.mjs` took the password as a CLI argument and the README told you to. | Password in shell history and `ps` output. | Script refuses passwords in arguments, reads password (twice) and the secret key at **hidden prompts**, refuses non-TTY. README corrected. | Run in a pseudo-terminal: password never echoed; login with it works; argument form refused. |

Also verified unchanged: no secret key or service-role code in browser bundles; `/admin` responses are `Cache-Control: private, no-store`; photo route is `Cache-Control: private` (Vercel's CDN won't cache it); offline mode works with no Supabase env vars.

### Accepted / residual risks (not code bugs)

| Risk | Notes / mitigation |
|---|---|
| **Approved photos are public.** Anyone can list approved ids from `screen_feed` and fetch them via `/api/screen/photo/:id`. | By design: they are on a projector. Pending/rejected/pulled photos are never served. |
| **Per-device limit is bypassable** by scripts that drop cookies. | Per-IP cap (30/min) is the backstop; every photo still needs human approval. If abused: kill switch in §6, or add a Vercel Firewall rate-limit rule on `/api/submit`. |
| **Whole venue shares one IP.** 30 uploads/min per IP may say "arena is busy" in a rush. | Tune `IP_MAX` in `src/app/api/submit/route.ts` if needed. |
| Admin session cookies are readable by page JavaScript (how `@supabase/ssr` works). | No HTML injection paths exist (React escapes all text). Keep admins few, strong passwords; MFA not configured. |
| `next@15.5.28` bundles `postcss@8.4.31` (npm audit: high). | Advisories need attacker-controlled CSS at build time; we only process our own CSS. The fix requires Next 16 (breaking), out of scope. |
| Realtime `DELETE` events (photo pulled) reach anon subscribers with the submission id only. | Postgres changes cannot RLS-filter deletes. No content is exposed. |
| Rejected/pulled photos stay in the private bucket. | Only admins can read them. Purge after the event (§7). |
| `rate_limits` grows one small row per device/IP. | Negligible for an event. Truncate afterwards (§7). |

### Needs testing against hosted Supabase / Vercel / real devices

These cannot be proven locally; §5 covers each one.

1. Migrations apply cleanly on hosted (especially the storage bucket insert and `storage.objects` policy).
2. Hosted Realtime delivers `screen_feed` changes to anonymous screens (project Realtime settings).
3. `sharp` loads on Vercel's Linux runtime (first upload).
4. Vercel's IP headers and HTTPS cookie flags behave as documented.
5. Real phones: iPhone camera (HEIC → JPEG in the browser), Android camera, gallery uploads, slow venue Wi-Fi.
6. Latency between the Vercel function region and the Supabase region.
7. Admin sessions on the production domain (cookie scope, sign-out).

---

## 2. Environment variables

Set these in **Vercel → your project → Settings → Environment Variables**. Tick **Production only** for every variable (preview deployments of other branches must not get production secrets). Mark the two server secrets as **Sensitive**.

| Variable | Required | Where to get it | Browser-visible? | Verify |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase Dashboard → **Connect** (top bar) or **Project Settings → Data API → Project URL**. Looks like `https://<ref>.supabase.co`. | yes (safe) | `/screen` shows **LIVE FEED · 0 PHOTOS** top-right |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | **Project Settings → API Keys → Publishable key** (`sb_publishable_…`). Legacy `anon` key also works (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). | yes (safe; RLS protects data) | same as above |
| `SUPABASE_SECRET_KEY` | yes | **Project Settings → API Keys → Secret keys** → create/reveal (`sb_secret_…`). Legacy `service_role` key works as `SUPABASE_SERVICE_ROLE_KEY`. | **NO. Never prefix with `NEXT_PUBLIC_`.** Mark **Sensitive**. | a `/join` upload succeeds |
| `SUBMITTER_HASH_SALT` | yes (prod) | Generate locally: `openssl rand -hex 32` (≥16 chars). Paste straight into Vercel; don't store it elsewhere. | **NO.** Mark **Sensitive**. | uploads work; if missing, `/join` says "Submissions are not open yet" and Vercel Runtime Logs show `SUBMITTER_HASH_SALT is missing…` |
| `NEXT_PUBLIC_SITE_URL` | recommended | Your final production URL, e.g. `https://realmhack-arena.vercel.app` or your custom domain. No trailing slash. | yes | QR caption on `/screen` shows this host |
| `NEXT_PUBLIC_EVENT_END` | optional | ISO time, e.g. `2026-10-25T09:00:00+05:30` | yes | clock label switches to **TIME LEFT** |

`NEXT_PUBLIC_*` values are **baked in at build time**. After changing any variable, **redeploy** (Deployments → ⋯ → Redeploy).

Local development keeps working without these: with no Supabase variables the arena runs in offline mode. With the local Docker stack, use `.env.local` as described in the README.

---

## 3. Deployment checklist

### A. Supabase project

1. **Create the project**: supabase.com → New project. Pick the **region closest to the venue** and note it. Save the database password in a password manager (you need it once, for `supabase link`).
2. **Disable public sign-ups**: Authentication → Sign In / Providers → turn **off** "Allow new users to sign up". Keep the **Email** provider **enabled** (admins log in with it).
3. **Password policy** (if offered): Authentication → Sign In / Providers → Email → minimum password length **12**.
4. **URL configuration**: Authentication → URL Configuration → **Site URL** = your production URL.
5. **Data API**: Project Settings → Data API → API **enabled**, `public` in exposed schemas. Don't enable automatic exposure of new tables; our migrations grant explicitly.
6. **Realtime**: Realtime → Settings → make sure public channels are **allowed** (not "private channels only"). The screens use a public channel and rely on RLS for postgres changes.
7. **Apply migrations** from the repo root:
   ```bash
   npx supabase login                                  # opens a browser; token is stored by the CLI, not in the repo
   npx supabase link --project-ref <ref>               # prompts for the DB password (hidden)
   npx supabase db push --linked --dry-run             # must list exactly the 2 migrations
   npx supabase db push --linked
   ```
   Fallback without the CLI: SQL Editor → paste `supabase/migrations/20261023000000_submissions.sql`, Run; then `…000100_explicit_service_role_grants.sql`, Run.
8. **Verify the schema** (fresh project, *before* real data). This runs the 37 security tests inside a transaction that is rolled back:
   ```bash
   npx supabase test db --linked
   ```
   Expect `Result: PASS`. Or check by hand in the SQL Editor:
   ```sql
   select id, public, file_size_limit from storage.buckets where id = 'submissions';         -- public = false
   select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'; -- includes "admins read submission photos"
   select tablename from pg_publication_tables where pubname = 'supabase_realtime';          -- screen_feed (and NOT submissions)
   select has_table_privilege('service_role','public.teams','insert'),
          has_table_privilege('service_role','public.submissions','insert'),
          has_table_privilege('service_role','public.screen_feed','select'),
          has_table_privilege('anon','public.submissions','select');                         -- t, t, t, f
   ```
9. **Create the admin(s)**: see §4.

### B. Vercel project

10. **Import** the Git repository (Vercel → Add New → Project). Framework preset: Next.js. Defaults for build/output. Node.js 20+ (default is fine).
11. **Function region**: Settings → Functions → Function Region → the **same region as Supabase** (Hobby allows one).
12. **Environment variables**: add all from §2, **Production** only, the two secrets marked **Sensitive**.
13. **Deploy**. When live, set `NEXT_PUBLIC_SITE_URL` to the final URL if you didn't know it before, then **Redeploy**.
14. **Check that no secret leaked into the browser bundle**:
    ```bash
    SITE=https://your-site.example
    for js in $(curl -s $SITE/screen $SITE/join $SITE/admin/login | grep -o '/_next/static/[^"]*\.js' | sort -u); do
      curl -s "$SITE$js" | grep -qE 'sb_secret_[A-Za-z0-9_-]{10,}|InNlcnZpY2Vfcm9sZ|JzZXJ2aWNlX3JvbG|ic2VydmljZV9yb2xl' && echo "LEAK in $js"
    done; echo "bundle check done"
    ```
    Must print only `bundle check done`. It looks for an actual secret key value or a legacy JWT whose payload says `service_role`.
15. **Check the headers**:
    ```bash
    curl -sI $SITE/admin/login | grep -iE "x-frame-options|content-security-policy"   # DENY / frame-ancestors 'none'
    ```
16. Run the **smoke test** (§5) end to end.
17. Supabase free projects **pause after ~7 days of inactivity**. Open the dashboard and run the smoke test **the day before** the event.

---

## 4. Creating the production admin safely

Goal: the password and the secret key never appear in shell history, process lists, logs, terminal scrollback or files in the repo.

### Option A: Dashboard only (recommended; no secret key on your laptop)

1. Supabase → Authentication → Users → **Add user → Create new user**. Enter the email and a password from your password manager (≥12 chars), tick **Auto Confirm User**.
2. SQL Editor → run (replace the email):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'moderator@yourteam.org'
   on conflict do nothing;
   ```
3. Verify: `select u.email from public.admins a join auth.users u on u.id = a.user_id;`

### Option B: the script (hidden prompts)

```bash
node scripts/create-admin.mjs
```
It prompts for: project URL (visible), **secret key (hidden)**, admin email (visible), **password (hidden, typed twice)**.

- Do **not** pass the password as an argument; the script refuses.
- Do **not** export `SUPABASE_SECRET_KEY` in your shell or put it in a file in the repo. Paste it at the hidden prompt.
- If the user already exists, it asks before resetting the password.
- Afterwards, if you copied the secret key to the clipboard, clear the clipboard.

### Removing / rotating an admin

```sql
delete from public.admins where user_id = (select id from auth.users where email = 'moderator@yourteam.org');
```
This takes effect immediately: every moderation call is re-checked in the database. Also end their sessions: Authentication → Users → the user → **Sign out user** (or delete the user).
If the secret key is ever exposed: Project Settings → API Keys → **create a new secret key**, update Vercel, redeploy, then **delete the old key**.

---

## 5. Production smoke test

Use: 1 laptop for admin, 2 screens (or two browser windows on different machines), 2 real phones (one iPhone, one Android) on the **venue Wi-Fi** if possible, plus one private/incognito window. Tick each box.

**Setup**
- [ ] Screen 1 and Screen 2 open `$SITE/screen`: arena animates, top-right shows **LIVE FEED · 0 PHOTOS**, QR caption shows your domain.
- [ ] Scanning the QR on a phone opens `$SITE/join` over HTTPS.

**Phone upload → pending**
- [ ] iPhone: enter a team name, **TAKE PHOTO** with the camera, **SEND**. Shows **SENT!**
- [ ] Android: same, but use **UPLOAD** from the gallery. Shows **SENT!**
- [ ] Same phone again within 30 s → "Easy there! One photo every 30 seconds" with a countdown.
- [ ] Neither photo appears on the screens.
- [ ] Incognito window: `$SITE/api/screen/photo/<id of a pending photo>` returns **404**. (Get the id from SQL Editor: `select id, status from submissions order by created_at desc limit 5;`)

**Moderation**
- [ ] `$SITE/admin` in a fresh window redirects to `/admin/login`.
- [ ] Sign in as the admin: both photos are in **PENDING** with previews.
- [ ] **Reject** one. It never appears on any screen; its photo URL returns 404.
- [ ] **Approve** the other. Within ~5 s it drops onto **both screens at the same time**, with the team name. Counter becomes **1 PHOTO**.
- [ ] The phone that sent it still shows **SENT!** (no change needed).

**Pulling an approved photo**
- [ ] Approve another photo; while it is on screen, click **PULL FROM SCREEN** in Recent decisions. It leaves the screens early (or is skipped if still queued). Its photo URL returns **404** within a minute.

**Unauthorized access** (incognito window, nobody signed in)
- [ ] `curl -s "$SUPABASE_URL/rest/v1/submissions?select=*" -H "apikey: <publishable key>"` → permission denied (401/403), not data.
- [ ] `curl -s -o /dev/null -w "%{http_code}\n" "$SUPABASE_URL/storage/v1/object/public/submissions/<photo_path>"` → 400/404, not 200.
- [ ] `curl -s -X POST $SITE/api/admin/moderate -H "origin: $SITE" -H "content-type: application/json" -d '{"id":"<uuid>","decision":"approved"}'` → **401**.
- [ ] Sign in as a non-admin user (create a throwaway user in the dashboard without adding it to `admins`): `/admin` says **not an admin**. Delete that user afterwards.
- [ ] `curl -s -X POST $SITE/api/admin/moderate -H "origin: https://evil.example" …` → **403**.

**Outage recovery**
- [ ] Turn Wi-Fi off on Screen 2 for ~30 s: arena keeps animating; top-right shows **RECONNECTING…**. Approve a photo meanwhile. Turn Wi-Fi back on: status returns to **LIVE FEED** and the photo plays (it arrives through backfill/polling within ~15 s).
- [ ] Reload Screen 1 during a photo: it reconnects and does **not** replay old photos.
- [ ] Vercel → Deployments → Runtime Logs: no unexpected 5xx during the test.

**Clean up test data** before doors open (§7, "Before the event").

---

## 6. During the event: kill switches

| Situation | Action (SQL Editor unless noted) | Undo |
|---|---|---|
| Inappropriate photo on screen | Admin → **PULL FROM SCREEN** | approve again isn't offered; re-upload |
| Upload spam | `revoke insert on public.submissions from service_role;` (instant: uploads fail, screens keep running) | `grant insert on public.submissions to service_role;` |
| Compromised admin account | `delete from public.admins where user_id = …;` + Dashboard → Users → Sign out user | re-insert |
| Leaked secret key | Rotate (§4), redeploy | — |

---

## 7. After the event: data cleanup

**Before the event** (remove smoke-test data): Storage → `submissions` → select all files → Delete; then
```sql
truncate public.screen_feed, public.submissions, public.teams, public.rate_limits;
```

**After the event**: export what you want to keep (Storage → download), then delete all files in the `submissions` bucket (Storage UI) and run the same `truncate`. Deleting rows does **not** delete files, so delete files first or you'll have to find them by path. Delete admin users you no longer need.
