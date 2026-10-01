// Approval-history integration only; no login or existing foundation RLS tests.
// node scripts/test-approval-history.mjs
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "../.tools/rls-tests/node_modules/@electric-sql/pglite/dist/index.js";
import { parseDraftInput } from "../lib/drafts-validation.ts";

const db = new PGlite();
const actor = "00000000-0000-0000-0000-00000000000a";
const workspace = "10000000-0000-0000-0000-000000000001";
const migrations = new URL("../supabase/migrations/", import.meta.url);
const historyMigration = (await readdir(migrations)).find((name) => name.endsWith("_draft_approval_history.sql"));
assert.ok(historyMigration);
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
  for (const name of ["202610010001_workspace_access.sql", "202610010002_drafts_crud.sql", historyMigration]) {
    await db.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  await db.query("insert into auth.users values ($1,now())", [actor]);
  await db.query("insert into public.profiles(id) values ($1)", [actor]);
  await db.query("insert into public.workspaces(id,name,created_by) values ($1,'Duo Workspace',$2)", [workspace, actor]);
  await db.query("insert into public.workspace_members(workspace_id,profile_id,role) values ($1,$2,'owner')", [workspace, actor]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.exec("set role authenticated;");
  let draft = (await db.query("insert into public.drafts(workspace_id,author_profile_id,topic,status) values($1,$2,'History test','draft') returning *", [workspace, actor])).rows[0];
  assert.equal((await db.query("select * from public.draft_approval_history")).rows.length, 0);
  for (const [status, note] of [["pending", "검토를 부탁해요"], ["approved", null]]) {
    const input = parseDraftInput({ topic: draft.topic, body: draft.body, status,
      expectedUpdatedAt: draft.updated_at.toISOString(), approvalNote: note }, true);
    draft = (await db.query("select * from public.update_draft_with_history($1,$2,$3,$4,$5,$6,$7)",
      [workspace, draft.id, draft.updated_at, input.topic, input.body, input.status, input.approvalNote])).rows[0];
  }
  // Same-state/content saves must leave precisely the two status-change entries.
  await db.query("update public.drafts set body='Content-only save',status='approved' where id=$1", [draft.id]);
  const history = (await db.query("select * from public.draft_approval_history where draft_id=$1 order by created_at,id", [draft.id])).rows;
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((row) => [row.from_status, row.to_status]), [["draft", "pending"], ["pending", "approved"]]);
  assert.ok(history.every((row) => row.actor_user_id === actor && row.workspace_id === workspace));
  assert.equal(history[0].note, "검토를 부탁해요");
  assert.equal(history[1].note, null);
  assert.ok(history[0].created_at <= history[1].created_at);
  console.log("PASS: draft → pending → approved creates exactly 2 chronological entries, with actor and optional note; content-only save adds none.");
} finally { await db.close(); }
