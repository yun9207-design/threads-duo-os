// Isolated PostgreSQL policy tests; no network, Supabase keys, or real Auth users.
// Install: npm install --prefix .tools/rls-tests --no-audit --no-fund @electric-sql/pglite
// Run: node scripts/test-workspace-rls.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "../.tools/rls-tests/node_modules/@electric-sql/pglite/dist/index.js";

const db = new PGlite();
const ids = {
  a: "00000000-0000-0000-0000-00000000000a",
  b: "00000000-0000-0000-0000-00000000000b",
  c: "00000000-0000-0000-0000-00000000000c",
  d: "00000000-0000-0000-0000-00000000000d",
  shared: "10000000-0000-0000-0000-000000000001",
  onlyA: "10000000-0000-0000-0000-000000000002",
  onlyB: "10000000-0000-0000-0000-000000000003",
  onlyC: "10000000-0000-0000-0000-000000000004",
};
let checks = 0;
async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}
async function asUser(id, role = "authenticated") {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
  await db.exec(`set role ${role};`);
}
async function denied(sql, code = "42501") {
  await assert.rejects(db.query(sql), (error) => error.code === code);
  checks++;
}
function equal(actual, expected) {
  assert.deepEqual(actual, expected);
  checks++;
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/202610010001_workspace_access.sql", import.meta.url), "utf8"));
  for (const user of ["a", "b", "c", "d"]) {
    await db.query("insert into auth.users values ($1, now())", [ids[user]]);
    await db.query("insert into public.profiles (id, display_name) values ($1, $2)", [ids[user], `User ${user.toUpperCase()}`]);
  }
  for (const [workspace, creator] of [["shared", "a"], ["onlyA", "a"], ["onlyB", "b"], ["onlyC", "c"]]) {
    await db.query("insert into public.workspaces (id, name, created_by) values ($1, $2, $3)", [ids[workspace], workspace, ids[creator]]);
    await db.query("insert into public.workspace_members (workspace_id, profile_id, role) values ($1, $2, 'owner')", [ids[workspace], ids[creator]]);
  }
  await db.query("insert into public.workspace_members (workspace_id, profile_id) values ($1, $2)", [ids.shared, ids.b]);

  for (const [user, own, foreign, role] of [["a", "onlyA", "onlyB", "owner"], ["b", "onlyB", "onlyA", "member"]]) {
    await asUser(ids[user]);
    equal((await rows("select id from public.workspaces order by id")).map((r) => r.id), [ids.shared, ids[own]]);
    equal((await rows("select profile_id, role from public.workspace_members where workspace_id=$1 order by profile_id", [ids.shared])), [
      { profile_id: ids.a, role: "owner" }, { profile_id: ids.b, role: "member" },
    ]);
    equal(await rows("select * from public.workspaces where id=$1", [ids[foreign]]), []);
    equal(await rows("select * from public.workspace_members where workspace_id=$1", [ids[foreign]]), []);
    equal((await rows("select id from public.profiles order by id")).map((r) => r.id), [ids.a, ids.b]);
    equal((await rows("select role from public.workspace_members where workspace_id=$1 and profile_id=$2", [ids.shared, ids[user]]))[0].role, role);
    for (const table of ["profiles", "workspaces", "workspace_members"]) {
      await denied(`insert into public.${table} default values`);
      await denied(`delete from public.${table}`);
    }
    await denied("update public.workspace_members set role='owner'");
    await denied("update public.workspaces set name='forged'");
    await denied("update public.profiles set display_name='forged'");
  }
  await asUser(ids.d);
  equal(await rows("select * from public.workspaces"), []);
  equal(await rows("select * from public.workspace_members"), []);
  equal((await rows("select id from public.profiles")).map((r) => r.id), [ids.d]);
  await asUser(null);
  for (const table of ["profiles", "workspaces", "workspace_members"]) equal(await rows(`select * from public.${table}`), []);
  await asUser(null, "anon");
  for (const table of ["profiles", "workspaces", "workspace_members"]) await denied(`select * from public.${table}`);
  await denied("select * from private.current_workspace_ids()");

  // Defense in depth: absent write policies still block if a grant is added later.
  await db.exec("reset role; grant insert, update, delete on public.workspace_members to authenticated;");
  await asUser(ids.b);
  await denied(`insert into public.workspace_members values ('${ids.onlyA}', '${ids.b}', 'owner', now())`);
  equal(await rows("update public.workspace_members set role='owner' returning profile_id"), []);
  equal(await rows("delete from public.workspace_members returning profile_id"), []);
  await db.exec("reset role; revoke insert, update, delete on public.workspace_members from authenticated;");

  // Database constraints and trusted provisioning are independent of the UI.
  await denied(`insert into public.workspace_members values ('${ids.shared}', '${ids.c}', 'owner', now())`, "23505");
  await denied(`insert into public.workspace_members values ('${ids.shared}', '${ids.b}', 'member', now())`, "23505");
  await denied(`insert into public.workspace_members values ('${ids.shared}', '${ids.c}', 'admin', now())`, "23514");
  await denied(`insert into public.workspace_members values ('20000000-0000-0000-0000-000000000001', '${ids.c}', 'member', now())`, "23503");
  await db.exec(`create schema evil; create table evil.workspace_members as select * from public.workspace_members;`);
  await asUser(ids.c);
  await db.exec("set search_path = evil, public;");
  equal((await rows("select * from private.current_workspace_ids()")).map((r) => r.current_workspace_ids), [ids.onlyC]);
  await db.exec("reset role;");
  await db.query("delete from public.workspace_members where profile_id=$1", [ids.c]);
  await asUser(ids.c); // Same subject/session: membership revocation is immediate.
  equal(await rows("select * from public.workspaces"), []);
  equal(await rows("select * from public.workspace_members"), []);

  console.log(`PASS: ${checks} PostgreSQL workspace/RLS assertions (isolated fixtures; not real Supabase login verification).`);
} finally {
  await db.close();
}
