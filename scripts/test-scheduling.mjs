// Scheduling integration only. Existing Auth/Workspace/approval tests are not rerun.
// node scripts/test-scheduling.mjs
import assert from "node:assert/strict";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { PGlite } from "../.tools/rls-tests/node_modules/@electric-sql/pglite/dist/index.js";

// Compile the pure scheduling helpers without depending on Next's alias resolver.
const source = await readFile(new URL("../lib/draft-scheduling.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  .replace('"./drafts-validation"', JSON.stringify(new URL("../lib/drafts-validation.ts", import.meta.url).href));
const { parseScheduleInput, kstInputToIso, kstInput, scheduleSummary } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const version = "2026-10-01T00:00:00.123456Z";
assert.equal(kstInputToIso("2026-10-02T00:30"), "2026-10-01T15:30:00.000Z");
assert.equal(kstInput("2026-10-01T15:30:00Z"), "2026-10-02T00:30");
assert.throws(() => kstInputToIso("2026-02-30T12:00"));
assert.throws(() => parseScheduleInput({ expectedUpdatedAt: version, scheduledAt: "2026-10-01T00:00:00Z" }, Date.parse("2026-10-01T01:00:00Z")));
assert.throws(() => parseScheduleInput({ expectedUpdatedAt: version, scheduledAt: "2026-10-02T12:00:00" }));
assert.throws(() => parseScheduleInput({ expectedUpdatedAt: version, scheduledAt: "2100-02-30T12:00:00Z" }));
assert.throws(() => parseScheduleInput({ expectedUpdatedAt: version, scheduledAt: null, status: "approved" }));
assert.equal(parseScheduleInput({ expectedUpdatedAt: version, scheduledAt: null }).scheduledAt, null);

const directory = new URL("../.tools/scheduling-tests/" + randomUUID() + "/", import.meta.url);
await mkdir(directory, { recursive: true });
let db = new PGlite(fileURLToPath(directory));
const actor = "00000000-0000-0000-0000-00000000000a";
const workspace = "10000000-0000-0000-0000-000000000001";
const migrations = new URL("../supabase/migrations/", import.meta.url);
const names = await readdir(migrations);
try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
  `);
  for (const suffix of ["_workspace_access.sql", "_drafts_crud.sql", "_draft_approval_history.sql", "_draft_scheduling.sql"]) {
    const name = names.find((name) => name.endsWith(suffix));
    assert.ok(name);
    await db.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  await db.query("insert into auth.users values($1,now())", [actor]);
  await db.query("insert into public.profiles(id) values($1)", [actor]);
  await db.query("insert into public.workspaces(id,name,created_by) values($1,'Scheduling fixture',$2)", [workspace, actor]);
  await db.query("insert into public.workspace_members(workspace_id,profile_id,role) values($1,$2,'owner')", [workspace, actor]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.exec("set role authenticated");
  const future = new Date(Date.now() + 86400000).toISOString();
  const modified = new Date(Date.now() + 172800000).toISOString();
  const ids = {};
  for (const status of ["draft", "pending", "approved"]) {
    ids[status] = (await db.query("insert into public.drafts(workspace_id,author_profile_id,topic,status) values($1,$2,$3,$3) returning id", [workspace, actor, status])).rows[0].id;
  }
  for (const status of ["draft", "pending"]) {
    await assert.rejects(db.query("update public.drafts set scheduled_at=$1 where id=$2", [future, ids[status]]), (error) => error.code === "22023");
  }
  await assert.rejects(db.query("update public.drafts set scheduled_at='2000-01-01Z' where id=$1", [ids.approved]), (error) => error.code === "22023");
  await assert.rejects(db.query("update public.drafts set scheduled_at='infinity' where id=$1", [ids.approved]), (error) => error.code === "22023");
  await db.query("update public.drafts set scheduled_at=$1 where id=$2", [future, ids.approved]);
  const stored = (await db.query("select * from public.drafts where id=$1", [ids.approved])).rows[0];
  assert.equal(stored.status, "approved");
  assert.equal(stored.scheduled_at.toISOString(), future);
  await db.query("update public.drafts set scheduled_at=$1 where id=$2", [modified, ids.approved]);
  await db.close();
  db = new PGlite(fileURLToPath(directory));
  // A fresh connection after reopen represents a fresh read, not browser memory.
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.exec("set role authenticated");
  assert.equal((await db.query("select scheduled_at from public.drafts where id=$1", [ids.approved])).rows[0].scheduled_at.toISOString(), modified);
  await db.query("update public.drafts set scheduled_at=null where id=$1", [ids.approved]);
  assert.equal((await db.query("select scheduled_at from public.drafts where id=$1", [ids.approved])).rows[0].scheduled_at, null);
  // Changes to the approval/deletion state cannot leave an invalid schedule.
  await db.query("update public.drafts set scheduled_at=$1 where id=$2", [future, ids.approved]);
  await db.query("update public.drafts set status='pending' where id=$1", [ids.approved]);
  assert.equal((await db.query("select scheduled_at from public.drafts where id=$1", [ids.approved])).rows[0].scheduled_at, null);
  await db.query("update public.drafts set status='approved' where id=$1", [ids.approved]);
  await db.query("update public.drafts set scheduled_at=$1 where id=$2", [future, ids.approved]);
  await db.query("update public.drafts set deleted_at=now() where id=$1", [ids.approved]);
  assert.equal((await db.query("select scheduled_at from public.drafts where id=$1", [ids.approved])).rows[0].scheduled_at, null);
  const rows = [
    { id: "a", status: "approved", deleted_at: null, scheduled_at: "2026-10-01T14:59:00Z" },
    { id: "b", status: "approved", deleted_at: null, scheduled_at: "2026-10-01T15:00:00Z" },
    { id: "c", status: "approved", deleted_at: null, scheduled_at: "2026-09-30T14:00:00Z" },
    { id: "d", status: "approved", deleted_at: "2026-10-01T00:00:00Z", scheduled_at: future },
  ];
  const summary = scheduleSummary(rows, "2026-10-01T09:00:00Z");
  assert.equal(summary.today, 1); assert.equal(summary.upcoming, 1);
  assert.deepEqual(summary.scheduled.map((row) => row.id), ["c", "a", "b"]);
  console.log("PASS: approved schedule/create/edit/cancel; draft/pending/past/infinite rejection; disk reopen persistence; invalidated approval/deletion cleanup; KST day boundaries and DB-row counts.");
} finally { await db.close(); }
