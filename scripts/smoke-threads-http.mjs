// New publishing routes only; no login or previous feature tests.
import assert from "node:assert/strict";
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const workspace = "efe8e127-ae8b-41af-ab76-2308d3347158";
const account = base + "/api/workspaces/" + workspace + "/threads";
const publish = base + "/api/workspaces/" + workspace + "/drafts/00000000-0000-0000-0000-000000000001/publish";
const headers = { Origin: new URL(base).origin, "Content-Type": "application/json" };
for (const [url, options, expected] of [
  [account, {}, 401],
  [account, { method: "POST", headers, body: "{}" }, 401],
  [publish, { method: "POST", headers, body: JSON.stringify({ expectedUpdatedAt: "2026-10-01T00:00:00Z" }) }, 401],
  [publish, { method: "POST", headers: { ...headers, Origin: "https://other.invalid" }, body: "{}" }, 403],
  [publish, { method: "POST", headers, body: JSON.stringify({ expectedUpdatedAt: "2026-10-01T00:00:00Z", accessToken: "forbidden" }) }, 400],
]) {
  const response = await fetch(url, { ...options, redirect: "manual", signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, expected);
  const cache = response.headers.get("cache-control") ?? "";
  assert.match(cache, /private/i); assert.match(cache, /no-store/i);
  const body = await response.json(); assert.equal(typeof body.error, "string");
  assert.equal(/Bearer|secret_digest|sb_secret_|sb_publishable_/.test(JSON.stringify(body)), false);
}
console.log("PASS: new Threads routes fail closed without session; same-origin and strict payload; private/no-store; no credential response. No login or external post attempted. " + base);
