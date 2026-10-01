// New publishing path only: isolated Postgres + deterministic Meta transport.
import assert from "node:assert/strict";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { PGlite } from "../.tools/rls-tests/node_modules/@electric-sql/pglite/dist/index.js";

const source = await readFile(new URL("../lib/threads-api.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { publishThreadsText, threadsIdentity } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const directory = new URL("../.tools/publishing-tests/" + randomUUID() + "/", import.meta.url);
await mkdir(directory, { recursive: true });
let db = new PGlite(fileURLToPath(directory));
const actor = "00000000-0000-0000-0000-00000000000a";
const workspace = "10000000-0000-0000-0000-000000000001";
const secret = randomBytes(32).toString("base64url");
const token = "test-transport-token-never-real";
const migrations = new URL("../supabase/migrations/", import.meta.url);
let calls = [];
const json = (data, status = 200) => Response.json(data, { status });
function transport(responses) {
  calls = [];
  return async (url, options) => {
    calls.push({ url: new URL(url), options });
    assert.equal(new URL(url).origin, "https://graph.threads.com");
    assert.equal(options.headers.Authorization, "Bearer " + token);
    assert.equal(new URL(url).searchParams.has("access_token"), false);
    assert.equal(options.redirect, "error");
    assert.ok(responses.length, "Unexpected duplicate API request");
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
}
async function op(name, draftId, version, attemptId, data = {}, key = secret) {
  return (await db.query("select public.threads_publish_operation($1,$2,$3,$4,$5,$6,$7::jsonb) as value",
    [workspace, key, name, draftId ?? null, version ?? null, attemptId ?? null, JSON.stringify(data)])).rows[0].value;
}
async function fixture(status = "approved", scheduled = true) {
  await db.exec("reset role");
  const row = (await db.query(`insert into public.drafts(workspace_id,author_profile_id,topic,body,status,scheduled_at)
    values($1,$2,'Publishing fixture','Threads Duo OS test body',$3,$4) returning *`,
  [workspace, actor, status, scheduled ? new Date(Date.now() + 86400000).toISOString() : null])).rows[0];
  await db.exec("set role authenticated");
  return { ...row, updated_at: row.updated_at.toISOString() };
}
function callbacks(draft) {
  return {
    saveContainer: (containerId) => op("container", draft.id, null, draft.publish_attempt_id, { container_id: containerId }),
    savePublished: (postId) => op("published", draft.id, null, draft.publish_attempt_id, { post_id: postId }),
    saveFailure: (error, retryable) => op("failed", draft.id, null, draft.publish_attempt_id, { error, retryable }),
  };
}
try {
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  const names = await readdir(migrations);
  for (const suffix of ["_workspace_access.sql", "_drafts_crud.sql", "_draft_approval_history.sql", "_draft_scheduling.sql", "_threads_text_publishing.sql"]) {
    const name = names.find((item) => item.endsWith(suffix)); assert.ok(name);
    await db.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  await db.query("insert into auth.users values($1,now())", [actor]);
  await db.query("insert into public.profiles(id) values($1)", [actor]);
  await db.query("insert into public.workspaces(id,name,created_by) values($1,'Publishing fixture',$2)", [workspace, actor]);
  await db.query("insert into public.workspace_members(workspace_id,profile_id,role) values($1,$2,'owner')", [workspace, actor]);
  await db.query("insert into private.threads_publishing_config values($1,sha256(convert_to($2,'UTF8')))", [workspace, secret]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.exec("set role authenticated");
  const identity = await threadsIdentity(token, transport([json({ id: "123456789", username: "fixture" })]));
  const account = await op("connect", null, null, null, { user_id: identity.userId, username: identity.username });
  assert.equal(account.threads_user_id, "123456789");
  await assert.rejects(op("connect", null, null, null, { user_id: "123456789", username: "fixture" }, "invalid"), (error) => error.code === "42501");
  for (const state of ["draft", "pending"]) {
    const draft = await fixture(state, false);
    await assert.rejects(op("claim", draft.id, draft.updated_at), (error) => error.code === "55000");
  }
  const unscheduled = await fixture("approved", false);
  await assert.rejects(op("claim", unscheduled.id, unscheduled.updated_at), (error) => error.code === "55000");
  const original = await fixture();
  const claimed = await op("claim", original.id, original.updated_at);
  await assert.rejects(op("claim", original.id, original.updated_at), (error) => error.code === "55000");
  await assert.rejects(db.query("update public.drafts set body='changed' where id=$1", [original.id]), (error) => error.code === "55000");
  await assert.rejects(db.query("update public.drafts set publication_status='published' where id=$1", [original.id]), (error) => error.code === "42501");
  assert.equal(await publishThreadsText(token, identity.userId, claimed.body, callbacks(claimed),
    transport([json({ id: "223456789" }), json({ status: "IN_PROGRESS" }), json({ status: "FINISHED" }), json({ id: "323456789" })]), async () => {}), "323456789");
  assert.deepEqual(calls.map((call) => [call.options.method, call.url.pathname]), [
    ["POST", "/123456789/threads"], ["GET", "/223456789"], ["GET", "/223456789"], ["POST", "/123456789/threads_publish"],
  ]);
  assert.equal(calls[0].url.searchParams.get("text"), claimed.body);
  assert.equal(calls[0].url.searchParams.has("auto_publish_text"), false);
  const saved = await op("published", claimed.id, null, claimed.publish_attempt_id, { post_id: "323456789" });
  assert.equal(saved.publication_status, "published"); assert.equal(saved.status, "approved");
  assert.equal(saved.threads_container_id, "223456789"); assert.equal(saved.threads_post_id, "323456789");
  assert.ok(saved.published_at); assert.equal(saved.publish_error, null);
  await assert.rejects(op("claim", saved.id, saved.updated_at), (error) => error.code === "55000");
  const rejected = await fixture();
  const bad = await op("claim", rejected.id, rejected.updated_at);
  await assert.rejects(publishThreadsText(token, identity.userId, bad.body, callbacks(bad),
    transport([json({ error: { code: 190, message: "secret: " + token } }, 400)])), /HTTP 400/);
  const failed = (await db.query("select * from public.drafts where id=$1", [bad.id])).rows[0];
  assert.equal(failed.publication_status, "failed"); assert.equal(failed.publish_retryable, true);
  assert.equal(failed.publish_error.includes(token), false);
  const ambiguous = await fixture(); const uncertain = await op("claim", ambiguous.id, ambiguous.updated_at);
  await assert.rejects(publishThreadsText(token, identity.userId, uncertain.body, callbacks(uncertain),
    transport([json({ id: "423456789" }), json({ status: "FINISHED" }), new Error("timeout " + token)])), /재시도를 차단/);
  const blocked = (await db.query("select * from public.drafts where id=$1", [uncertain.id])).rows[0];
  assert.equal(blocked.publication_status, "failed"); assert.equal(blocked.publish_retryable, false);
  await assert.rejects(op("claim", blocked.id, blocked.updated_at.toISOString()), (error) => error.code === "55000");
  let recordedFailure = false;
  await assert.rejects(publishThreadsText(token, identity.userId, "result persistence failure", {
    saveContainer: async () => {}, savePublished: async () => { throw Error("DB unavailable"); },
    saveFailure: async () => { recordedFailure = true; },
  }, transport([json({ id: "523456789" }), json({ status: "FINISHED" }), json({ id: "623456789" })])), /재게시하지 말고/);
  assert.equal(recordedFailure, false);
  await db.close(); db = new PGlite(fileURLToPath(directory));
  const reopened = (await db.query("select publication_status,threads_post_id,published_at from public.drafts where id=$1", [saved.id])).rows[0];
  assert.equal(reopened.publication_status, "published"); assert.equal(reopened.threads_post_id, "323456789");
  assert.ok(reopened.published_at);
  console.log("PASS: container → readiness → publish → DB result; durable IDs/time; safe failure; ambiguous retry blocked; duplicate claim blocked; server-only result writes. Meta transport mocked; no real external post.");
} finally { await db.close(); }
