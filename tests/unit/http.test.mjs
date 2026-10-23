// node --test tests/unit   (Node ≥ 22.18 runs the imported .ts directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, isHttps, isSameOrigin } from "../../src/lib/http.ts";

const req = (headers = {}, url = "https://arena.example/api/x") => ({ headers: new Headers(headers), nextUrl: new URL(url) });

test("same-origin POST is accepted", () => {
  assert.equal(isSameOrigin(req({ origin: "https://arena.example", host: "arena.example" })), true);
});

test("cross-site, missing and malformed origins are rejected (no throw)", () => {
  assert.equal(isSameOrigin(req({ origin: "https://evil.example", host: "arena.example" })), false);
  assert.equal(isSameOrigin(req({ host: "arena.example" })), false);
  assert.equal(isSameOrigin(req({ origin: "null", host: "arena.example" })), false);
  assert.equal(isSameOrigin(req({ origin: "::::", host: "arena.example" })), false);
});

test("x-forwarded-host (set by Vercel) is used when present", () => {
  assert.equal(isSameOrigin(req({ origin: "https://arena.example", host: "internal", "x-forwarded-host": "arena.example" })), true);
});

test("client IP prefers Vercel's non-overridable header", () => {
  assert.equal(clientIp(req({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "9.9.9.9" })), "1.1.1.1");
  assert.equal(clientIp(req({ "x-forwarded-for": "2.2.2.2, 10.0.0.1" })), "2.2.2.2");
  assert.equal(clientIp(req({ "x-real-ip": "3.3.3.3" })), "3.3.3.3");
  assert.equal(clientIp(req({})), "unknown");
});

test("https detection honours the proxy header", () => {
  assert.equal(isHttps(req({}, "http://internal/x")), false);
  assert.equal(isHttps(req({ "x-forwarded-proto": "https" }, "http://internal/x")), true);
  assert.equal(isHttps(req({}, "https://arena.example/x")), true);
});
