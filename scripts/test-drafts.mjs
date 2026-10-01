// Drafts-only integration test: real PostgreSQL engine, durable storage, actual SQL/RLS.
// No Auth login, network, keys, or mutations of the real Supabase project.
// npm install --prefix .tools/rls-tests --no-audit --no-fund @electric-sql/pglite
// node scripts/test-drafts.mjs
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "../.tools/rls-tests/node_modules/@electric-sql/pglite/dist/index.js";
import { parseDraftInput, parseDeleteInput, DraftInputError } from "../lib/drafts-validation.ts";

const root = new URL("../.tools/drafts-tests/", import.meta.url);
await mkdir(root, { recursive: true });
const path = new URL(Date.now() + "/", root);
let db = new PGlite(fileURLToPath(path));
const a = "00000000-0000-0000-0000-00000000000a";
const b = "00000000-0000-0000-0000-00000000000b";
const outsider = "00000000-0000-0000-0000-00000000000c";
const shared = "10000000-0000-0000-0000-000000000001";
const foreign = "10000000-0000-0000-0000-000000000002";
const reports = [];
async function rows(sql, params = []) { return (await db.query(sql, params)).rows; }
async function actor(id, role = "authenticated") {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
  await db.exec("set role " + role);
}
async function denied(sql, params = [], code = "42501") {
  await assert.rejects(db.query(sql, params), (error) => error.code === code);
}
const report = (text) => reports.push(text);
try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  for (const migration of ["202610010001_workspace_access.sql", "202610010002_drafts_crud.sql"]) {
    await db.exec(await readFile(new URL("../supabase/migrations/" + migration, import.meta.url), "utf8"));
  }
  for (const [id, name] of [[a, "A"], [b, "B"], [outsider, "Outsider"]]) {
    await db.query("insert into auth.users values ($1, now())", [id]);
    await db.query("insert into public.profiles(id, display_name) values ($1, $2)", [id, name]);
  }
  for (const [id, creator] of [[shared, a], [foreign, outsider]]) {
    await db.query("insert into public.workspaces(id, name, created_by) values ($1, $2, $3)", [id, id === shared ? "Duo Workspace" : "Foreign", creator]);
    await db.query("insert into public.workspace_members(workspace_id, profile_id, role) values ($1, $2, 'owner')", [id, creator]);
  }
  await db.query("insert into public.workspace_members(workspace_id, profile_id) values ($1, $2)", [shared, b]);

  await actor(a);
  const content = parseDraftInput({ topic: "  첫 실제 글  ", body: "첫 본문\n두 사람이 함께 수정합니다.", status: "draft" });
  const [created] = await rows("insert into public.drafts(workspace_id, author_profile_id, topic, body, status) values ($1,$2,$3,$4,$5) returning id, updated_at::text as version", [shared, a, content.topic, content.body, content.status]);
  assert.equal((await rows("select topic, body, status from public.drafts where id=$1", [created.id]))[0].topic, "첫 실제 글");
  report("Create → persisted list: owner A saves topic/body/status/author/workspace");

  await actor(b);
  const updated = await rows("update public.drafts set body=$1, status='pending' where id=$2 and updated_at=$3::timestamptz returning id, body, status, updated_at::text as version", ["B가 수정한 본문", created.id, created.version]);
  assert.equal(updated[0].body, "B가 수정한 본문");
  assert.notEqual(updated[0].version, created.version);
  assert.deepEqual(await rows("update public.drafts set body='stale overwrite' where id=$1 and updated_at=$2::timestamptz returning id", [created.id, created.version]), []);
  assert.equal((await rows("select author_profile_id from public.drafts where id=$1", [created.id]))[0].author_profile_id, a);
  await db.query("update public.drafts set status='approved' where id=$1", [created.id]);
  report("Member B reads/edits A's shared draft; all three statuses work; stale version cannot overwrite");

  await denied("insert into public.drafts(workspace_id,author_profile_id,topic) values ($1,$2,'forged author')", [shared, a]);
  await denied("update public.drafts set author_profile_id=$1 where id=$2", [b, created.id]);
  await denied("update public.drafts set workspace_id=$1 where id=$2", [foreign, created.id]);
  await denied("update public.drafts set status='published' where id=$1", [created.id], "23514");
  await denied("update public.drafts set topic='' where id=$1", [created.id], "23514");
  await denied("update public.drafts set body=repeat('a',5001) where id=$1", [created.id], "23514");
  await denied("delete from public.drafts where id=$1", [created.id]);
  report("Author spoof, identity changes, invalid status/content and physical DELETE are rejected");

  await actor(outsider);
  assert.deepEqual(await rows("select id from public.drafts where id=$1", [created.id]), []);
  assert.deepEqual(await rows("update public.drafts set body='forged' where id=$1 returning id", [created.id]), []);
  assert.deepEqual(await rows("update public.drafts set deleted_at=now() where id=$1 returning id", [created.id]), []);
  await denied("insert into public.drafts(workspace_id,author_profile_id,topic) values($1,$2,'foreign')", [shared, outsider]);
  const [foreignDraft] = await rows("insert into public.drafts(workspace_id,author_profile_id,topic) values($1,$2,'private') returning id", [foreign, outsider]);
  await actor(a);
  assert.deepEqual(await rows("select id from public.drafts where id=$1", [foreignDraft.id]), []);
  await denied("insert into public.drafts(workspace_id,author_profile_id,topic) values($1,$2,'cross workspace')", [foreign, a]);
  report("Forced foreign IDs: SELECT/UPDATE/soft DELETE hidden; INSERT blocked in both directions");

  // Close/reopen durable DB, not an in-memory refresh simulation.
  await db.close();
  db = new PGlite(fileURLToPath(path));
  await actor(b);
  assert.equal((await rows("select body,status from public.drafts where id=$1", [created.id]))[0].status, "approved");
  assert.equal((await rows("select body from public.drafts where id=$1", [created.id]))[0].body, "B가 수정한 본문");
  report("Durability: database close/reopen preserves edited body and approved status");

  await db.query("update public.drafts set deleted_at=now() where id=$1", [created.id]);
  assert.deepEqual(await rows("select id from public.drafts where workspace_id=$1 and deleted_at is null", [shared]), []);
  assert.equal((await rows("select body from public.drafts where id=$1 and deleted_at is not null", [created.id]))[0].body, "B가 수정한 본문");
  report("Delete → active list empty, original row recoverable through deleted_at");

  await actor(null, "anon");
  await denied("select * from public.drafts");
  await denied("insert into public.drafts(workspace_id,author_profile_id,topic) values($1,$2,'anon')", [shared, a]);
  await denied("update public.drafts set topic='anon'");
  report("Anonymous Drafts reads and writes denied");

  await db.exec("reset role; grant update on public.drafts to authenticated;");
  await actor(a);
  await denied("update public.drafts set workspace_id=$1 where id=$2", [foreign, created.id], "23514");
  await denied("update public.drafts set author_profile_id=$1 where id=$2", [b, created.id], "23514");
  await denied("update public.drafts set created_at=now() where id=$1", [created.id], "23514");
  report("Identity trigger blocks future accidental broad UPDATE grants");

  for (const input of [null, [], {}, { ...content, status: "published" }, { ...content, topic: "  " }, { ...content, body: "\0" }, { ...content, author_profile_id: a }, { ...content, workspace_id: shared }]) {
    assert.throws(() => parseDraftInput(input), DraftInputError);
  }
  assert.throws(() => parseDraftInput({ ...content, body: "🙂".repeat(5001) }), DraftInputError);
  assert.equal(parseDraftInput({ ...content, body: "🙂".repeat(5000) }).body.length, 10000);
  assert.throws(() => parseDraftInput(content, true), DraftInputError);
  assert.throws(() => parseDeleteInput({ expectedUpdatedAt: "bad" }), DraftInputError);
  assert.equal(parseDraftInput({ ...content, expectedUpdatedAt: "2026-10-01T12:00:00.123456+00:00" }, true).expectedUpdatedAt, "2026-10-01T12:00:00.123456+00:00");
  report("Strict request validation: lengths, Unicode, unknown/identity fields, status and concurrency version");
  await db.exec("reset role;");
  await db.exec(await readFile(new URL("../supabase/tests/drafts_smoke.sql", import.meta.url), "utf8"));
  report("The real-project SQL smoke script also passes against the isolated database");
  console.log(JSON.stringify({ result: "PASS", scope: "New Drafts CRUD/RLS only; foundation Auth/RLS not rerun", reports }, null, 2));
} finally { await db.close(); }
