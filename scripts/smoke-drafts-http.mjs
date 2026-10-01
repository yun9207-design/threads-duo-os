// New Drafts API boundary checks only. No login attempts or existing Auth/RLS retests.
// node scripts/smoke-drafts-http.mjs http://127.0.0.1:3000
import assert from "node:assert/strict";
const origin = process.argv[2] ?? "http://127.0.0.1:3000";
const workspace = "10000000-0000-0000-0000-000000000001";
const draft = "20000000-0000-0000-0000-000000000001";
const collection = "/api/workspaces/" + workspace + "/drafts";
const detail = collection + "/" + draft;
const version = { expectedUpdatedAt: "2026-10-01T12:00:00.000000+00:00" };
const valid = { topic: "Anonymous must not save", body: "Draft API boundary test", status: "draft" };
const checks = [
  ["GET", collection, undefined, 401],
  ["GET", detail, undefined, 401],
  ["POST", collection, valid, 403, "https://foreign.invalid"],
  ["POST", collection, { ...valid, author_profile_id: draft }, 400],
  ["POST", collection, { ...valid, workspace_id: workspace }, 400],
  ["POST", collection, { ...valid, status: "published" }, 400],
  ["POST", collection, valid, 401],
  ["PATCH", detail, valid, 400],
  ["PATCH", detail, { ...valid, ...version }, 401],
  ["DELETE", detail, version, 401],
  ["POST", collection, { ...valid, body: "a".repeat(33000) }, 413],
];
for (const [method, route, payload, expected, requestOrigin = origin] of checks) {
  const response = await fetch(origin + route, {
    method, redirect: "manual", signal: AbortSignal.timeout(20000),
    ...(payload === undefined ? {} : { headers: { Origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  });
  assert.equal(response.status, expected, method + " " + route);
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
  const result = await response.json();
  assert.equal(typeof result.error, "string");
  assert.ok(!/token|postgres|JWT|PGRST|supabase\.co/i.test(result.error));
}
console.log("PASS: new Drafts HTTP privacy, anonymous writes, CSRF, input and size limits (no login attempts)");
