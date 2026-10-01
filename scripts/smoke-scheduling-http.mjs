// Only the new scheduling route; no login attempts or foundation retests.
// node scripts/smoke-scheduling-http.mjs [http://127.0.0.1:3000 | Production origin]
import assert from "node:assert/strict";
const origin = process.argv[2] ?? "http://127.0.0.1:3000";
const endpoint = origin + "/api/workspaces/10000000-0000-0000-0000-000000000001/drafts/20000000-0000-0000-0000-000000000001/schedule";
const expectedUpdatedAt = "2026-10-01T00:00:00.123456Z";
const future = new Date(Date.now() + 86400000).toISOString();
for (const [payload, expected, requestOrigin = origin] of [
  [{ expectedUpdatedAt, scheduledAt: future }, 401],
  [{ expectedUpdatedAt, scheduledAt: null }, 401],
  [{ expectedUpdatedAt, scheduledAt: future }, 403, "https://foreign.invalid"],
  [{ expectedUpdatedAt, scheduledAt: "2000-01-01T00:00:00Z" }, 400],
  [{ expectedUpdatedAt, scheduledAt: "2100-02-30T12:00:00Z" }, 400],
  [{ expectedUpdatedAt, scheduledAt: future, status: "approved" }, 400],
  [{ scheduledAt: future }, 400],
]) {
  const response = await fetch(endpoint, {
    method: "PATCH", headers: { Origin: requestOrigin, "Content-Type": "application/json" },
    body: JSON.stringify(payload), redirect: "manual", signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, expected);
  const cache = response.headers.get("cache-control") ?? "";
  assert.match(cache, /\bprivate\b/i); assert.match(cache, /\bno-store\b/i);
  const result = await response.json();
  assert.equal(typeof result.error, "string");
  assert.ok(!/JWT|PGRST|token|postgres|supabase\.co/i.test(result.error));
}
console.log("PASS: scheduling API route privacy, input validation and Origin boundary; no login attempts.");
