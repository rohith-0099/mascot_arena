// Full flow on a LOCAL stack: phone upload → pending → admin approve → two screens,
// plus rejection, pulling, authorization and request hardening.
//   npm run dev  (port 3210)  &&  npm run test:e2e
import { chromium, devices } from "playwright";
import sharp from "sharp";
import { BASE, PUBLISHABLE, SUPABASE_URL, check, db, finish, makePhoto, makeUser, removeUser, watch } from "./_setup.mjs";

const problems = [];
const admin = await makeUser(true);
const volunteer = await makeUser(false);
const browser = await chromium.launch();
const tmp = async (buf) => {
  const p = `/tmp/e2e-${Math.random().toString(36).slice(2)}.jpg`;
  await (await import("node:fs/promises")).writeFile(p, buf);
  return p;
};

try {
  // ---------------------------------------------------------------- request hardening (no browser)
  const h = await fetch(`${BASE}/admin/login`);
  check(h.headers.get("x-frame-options") === "DENY", "pages send X-Frame-Options: DENY (clickjacking)");
  check(/frame-ancestors 'none'/.test(h.headers.get("content-security-policy") ?? ""), "pages send CSP frame-ancestors 'none'");
  const nullOrigin = await fetch(`${BASE}/api/admin/moderate`, {
    method: "POST",
    headers: { origin: "null", "content-type": "application/json" },
    body: "{}",
  });
  check(nullOrigin.status === 403, `moderate with Origin: null → ${nullOrigin.status} (not a 500)`);
  const csrfLogout = await fetch(`${BASE}/api/admin/signout`, { method: "POST", headers: { origin: "https://evil.example" }, redirect: "manual" });
  check(csrfLogout.status === 403, `cross-site logout → ${csrfLogout.status}`);
  const big = new FormData();
  big.set("team", "Big Files");
  big.set("token", crypto.randomUUID());
  big.set("photo", new Blob([Buffer.alloc(4.2 * 1024 * 1024, 1)], { type: "image/jpeg" }), "big.jpg");
  const bigRes = await fetch(`${BASE}/api/submit`, { method: "POST", body: big });
  check(bigRes.status === 413 && (await bigRes.json()).code === "too_large", `4.2 MB upload → ${bigRes.status} too_large`);

  // ---------------------------------------------------------------- two screens
  const screens = [];
  for (const n of [1, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const p = await ctx.newPage();
    watch(p, `screen${n}`, problems);
    await p.goto(`${BASE}/screen`, { waitUntil: "networkidle" });
    screens.push(p);
  }
  await Promise.all(screens.map((s) => s.waitForSelector('[data-testid=feed-status]:has-text("LIVE FEED")', { timeout: 20000 })));
  check(true, "both screens are LIVE on the realtime feed");

  // ---------------------------------------------------------------- phone uploads two photos (2nd from a 2nd phone)
  const phones = [];
  for (const n of [1, 2]) {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    const p = await ctx.newPage();
    watch(p, `phone${n}`, problems, [/429/]);
    await p.goto(`${BASE}/join`, { waitUntil: "networkidle" });
    phones.push(p);
  }
  const sendPhoto = async (phone, team, label) => {
    await phone.fill("#team", team);
    await phone.locator("input[type=file]").nth(1).setInputFiles(await tmp(await makePhoto(label)));
    await phone.waitForSelector('img[alt="Your photo"]');
    await phone.getByRole("button", { name: /SEND TO ARENA/ }).click();
  };
  await sendPhoto(phones[0], "E2E Approvers", "APPROVE");
  await phones[0].waitForSelector("text=SENT!", { timeout: 20000 });
  check(true, "phone 1 upload accepted");
  await phones[0].getByRole("button", { name: "SEND ANOTHER" }).click();
  await sendPhoto(phones[0], "E2E Approvers", "TOO-SOON");
  await phones[0].waitForSelector("main [role=alert]", { timeout: 15000 });
  check(/30 seconds/.test(await phones[0].textContent("main [role=alert]")), "phone 1 second upload is rate limited");
  await sendPhoto(phones[1], "E2E Rejects", "REJECT");
  await phones[1].waitForSelector("text=SENT!", { timeout: 20000 });
  check(true, "phone 2 upload accepted");

  const { data: rows } = await db
    .from("submissions")
    .select("id, status, photo_path, width, teams!inner(name)")
    .in("teams.name", ["E2E Approvers", "E2E Rejects"])
    .order("created_at", { ascending: false })
    .limit(2);
  const toApprove = rows.find((r) => r.teams.name === "E2E Approvers");
  const toReject = rows.find((r) => r.teams.name === "E2E Rejects");
  check(toApprove?.status === "pending" && toReject?.status === "pending", "both submissions are pending");
  const stored = await db.storage.from("submissions").download(toApprove.photo_path);
  const meta = await sharp(Buffer.from(await stored.data.arrayBuffer())).metadata();
  check(!meta.exif && meta.width <= 1280, `stored photo has no EXIF and is ≤1280px (${meta.width}px)`);

  // ---------------------------------------------------------------- nothing public while pending
  await screens[0].waitForTimeout(2000);
  check((await screens[0].locator("[data-testid=photo-card]").count()) === 0, "pending photo is not on screen");
  const pend = await fetch(`${BASE}/api/screen/photo/${toApprove.id}`);
  check(pend.status === 404, `pending photo via public route → ${pend.status}`);
  const anonRead = await fetch(`${SUPABASE_URL}/rest/v1/submissions?select=id`, { headers: { apikey: PUBLISHABLE } });
  check(anonRead.status === 401 || anonRead.status === 403, `anon REST read of submissions → ${anonRead.status}`);
  const anonObj = await fetch(`${SUPABASE_URL}/storage/v1/object/public/submissions/${toApprove.photo_path}`);
  check(anonObj.status >= 400, `public storage URL for the photo → ${anonObj.status}`);

  // ---------------------------------------------------------------- non-admin is refused
  const volCtx = await browser.newContext();
  const vol = await volCtx.newPage();
  watch(vol, "volunteer", problems);
  await vol.goto(`${BASE}/admin`);
  check(vol.url().includes("/admin/login"), "signed-out /admin redirects to login");
  await vol.fill("input[type=email]", volunteer.email);
  await vol.fill("input[type=password]", volunteer.password);
  await vol.click('button:has-text("SIGN IN")');
  await vol.waitForSelector("text=is not an admin", { timeout: 15000 });
  check(true, "non-admin sees 'not an admin'");
  const volTry = await vol.request.post(`${BASE}/api/admin/moderate`, { headers: { origin: BASE }, data: { id: toApprove.id, decision: "approved" } });
  check(volTry.status() === 403, `non-admin approve with a valid session → ${volTry.status()}`);

  // ---------------------------------------------------------------- admin: approve one, reject one
  const admCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const adm = await admCtx.newPage();
  // the queue auto-refreshes every 5 s; a reload/sign-out cancels that in-flight RSC fetch
  watch(adm, "admin", problems, [/\/admin\?_rsc=.* net::ERR_ABORTED/]);
  await adm.goto(`${BASE}/admin/login`);
  await adm.fill("input[type=email]", admin.email);
  await adm.fill("input[type=password]", admin.password);
  await adm.click('button:has-text("SIGN IN")');
  await adm.waitForSelector("[data-testid=pending-item]", { timeout: 15000 });
  const approveCard = adm.locator("[data-testid=pending-item]", { hasText: "E2E Approvers" });
  const rejectCard = adm.locator("[data-testid=pending-item]", { hasText: "E2E Rejects" });
  check(await approveCard.locator("img").evaluate((i) => i.complete && i.naturalWidth > 0), "admin sees the private photo");

  await rejectCard.getByRole("button", { name: /REJECT/ }).click();
  await adm.waitForTimeout(1500);
  const rej = await fetch(`${BASE}/api/screen/photo/${toReject.id}`);
  check(rej.status === 404, `rejected photo via public route → ${rej.status}`);

  const t0 = Date.now();
  await approveCard.getByRole("button", { name: /APPROVE/ }).click();
  await Promise.all(screens.map((s) => s.waitForSelector("[data-testid=photo-card]", { timeout: 30000 })));
  check(true, `approved photo appeared on both screens (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  check(!(await screens[1].textContent("[data-testid=photo-card]")).includes("E2E Rejects"), "rejected photo never shown");
  const pub = await fetch(`${BASE}/api/screen/photo/${toApprove.id}`);
  check(pub.status === 200 && /private/.test(pub.headers.get("cache-control") ?? ""), `approved photo served, cache-control private (${pub.status})`);

  // ---------------------------------------------------------------- pull it again
  await screens[0].waitForSelector("[data-testid=photo-card]", { state: "detached", timeout: 20000 });
  await adm.reload();
  await adm.getByRole("button", { name: "PULL FROM SCREEN" }).first().click();
  await adm.waitForTimeout(1500);
  const pulled = await fetch(`${BASE}/api/screen/photo/${toApprove.id}`);
  check(pulled.status === 404, `pulled photo via public route → ${pulled.status}`);

  // ---------------------------------------------------------------- sign out really ends the session
  await adm.getByRole("button", { name: "SIGN OUT" }).click();
  await adm.waitForURL(/\/admin\/login/);
  const after = await adm.request.post(`${BASE}/api/admin/moderate`, { headers: { origin: BASE }, data: { id: toApprove.id, decision: "approved" } });
  check(after.status() === 401, `moderate after sign-out → ${after.status()}`);

  console.log("\n--- console/network problems ---");
  console.log(problems.length ? problems.join("\n") : "none");
  check(problems.length === 0, "no unexpected console errors, page errors or failed requests");
} finally {
  await browser.close();
  await removeUser(admin);
  await removeUser(volunteer);
}
finish();
