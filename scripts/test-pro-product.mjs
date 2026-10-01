// Only P0 product mutations and the new scheduled-worker integration are exercised.
import assert from "node:assert/strict";
import { readFile,readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PGlite } from "../.tools/rls-tests/node_modules/@electric-sql/pglite/dist/index.js";

export async function productFixture(){
  const db=new PGlite();
  const actor="00000000-0000-0000-0000-00000000000a";
  const workspace="10000000-0000-0000-0000-000000000001";
  const secret=randomBytes(32).toString("base64url");
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  const directory=new URL("../supabase/migrations/",import.meta.url);
  for(const name of (await readdir(directory)).filter((name)=>!name.includes("_queue_dispatch")).sort()){
    await db.exec(await readFile(new URL(name,directory),"utf8"));
  }
  await db.query("insert into auth.users values($1,now())",[actor]);
  await db.query("insert into public.profiles(id,display_name) values($1,'Product fixture')",[actor]);
  await db.query("insert into public.workspaces(id,name,created_by) values($1,'Duo Workspace',$2)",[workspace,actor]);
  await db.query("insert into public.workspace_members(workspace_id,profile_id,role) values($1,$2,'owner')",[workspace,actor]);
  await db.query("insert into private.threads_publishing_config values($1,sha256(convert_to($2,'UTF8')))",[workspace,secret]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
  await db.exec("set role authenticated");
  const engine=async(name,draft=null,data={})=>(await db.query(
    "select public.threads_publish_operation($1,$2,$3,$4,$5,$6,$7::jsonb) as value",
    [workspace,secret,name,draft?.id??null,draft?.updated_at??null,draft?.publish_attempt_id??null,JSON.stringify(data)])).rows[0].value;
  const account=await engine("connect",null,{user_id:"123456789",username:"product_fixture"});
  const save=async(body,mode="draft",draft=null,at=null,duplicate=false)=>(await db.query(
    "select row_to_json(d) as value from public.save_product_post($1,$2,$3,$4,$5,$6,$7,$8) d",
    [workspace,body,mode,draft?.id??null,draft?.updated_at??null,at,account.id,duplicate])).rows[0].value;
  const list=async()=>(await db.query("select row_to_json(d) as value from public.drafts d where deleted_at is null order by created_at desc")).rows.map((row)=>row.value);
  return {db,actor,workspace,secret,account,engine,save,list};
}

async function run(){
  const fixture=await productFixture();const {db,workspace,secret,save,engine,list}=fixture;
  const worker=async(operation,draft=null,data={},key=secret)=>(await db.query(
    "select public.product_worker_operation($1,$2,$3,$4,$5,$6::jsonb) as value",
    [workspace,key,operation,draft?.id??null,draft?.publish_attempt_id??null,JSON.stringify(data)])).rows[0].value;
  try{
    let draft=await save("오늘의 첫 이야기");assert.equal(draft.status,"draft");
    assert.ok((await list()).some((row)=>row.id===draft.id));
    const original=draft;draft=await save("수정한 첫 이야기","draft",draft);assert.equal(draft.body,"수정한 첫 이야기");
    await assert.rejects(save("충돌하는 편집","draft",original),(error)=>error.code==="55000");
    await assert.rejects(save("  수정한 첫 이야기  "),(error)=>error.code==="23505");
    await save("수정한 첫 이야기","draft",null,null,true);
    const future=new Date(Date.now()+86400000).toISOString();
    draft=await save(draft.body,"schedule",draft,future,true);assert.equal(draft.auto_publish,true);assert.equal(draft.status,"approved");
    draft=await save(draft.body,"schedule",draft,new Date(Date.now()+172800000).toISOString(),true);assert.notEqual(draft.scheduled_at,future);
    draft=(await db.query("update public.drafts d set scheduled_at=null,auto_publish=false where id=$1 returning row_to_json(d) as value",[draft.id])).rows[0].value;
    assert.equal(draft.scheduled_at,null);assert.equal(draft.auto_publish,false);
    const batch=[{body:"일괄 글 하나",mode:"schedule",scheduledAt:future},{body:"일괄 글 둘",mode:"schedule",scheduledAt:future}];
    const batchResult=await db.query("select * from public.save_product_batch($1,$2::jsonb)",[workspace,JSON.stringify(batch)]);
    assert.equal(batchResult.rows.length,2);assert.ok(batchResult.rows.every((row)=>row.auto_publish));
    const count=(await list()).length;
    await assert.rejects(db.query("select * from public.save_product_batch($1,$2::jsonb)",[workspace,JSON.stringify([
      {body:"롤백할 새 글",mode:"draft"},{body:"일괄 글 하나",mode:"draft"}])]),(error)=>error.code==="23505");
    assert.equal((await list()).length,count);
    // Unscheduled Composer posts must reuse the existing publishing claim/result contract.
    const immediate=await save("즉시 게시 연동","now");assert.equal(immediate.scheduled_at,null);
    const claimed=await engine("claim",immediate);assert.equal(claimed.publication_status,"publishing");
    await engine("container",claimed,{container_id:"223456789"});
    const published=await engine("published",claimed,{post_id:"323456789"});assert.equal(published.publication_status,"published");
    const hidden=(await db.query("update public.drafts d set history_hidden_at=now() where id=$1 returning row_to_json(d) as value",[published.id])).rows[0].value;
    assert.ok(hidden.history_hidden_at);assert.equal(hidden.threads_post_id,"323456789");
    await db.query("update public.drafts set history_hidden_at=null where id=$1",[published.id]);
    const retryDraft=await save("실패 후 다시 예약","now");const failedClaim=await engine("claim",retryDraft);
    const failed=await engine("failed",failedClaim,{error:"Retryable fixture",retryable:true});
    const requeued=await save(failed.body,"schedule",failed,future);assert.equal(requeued.publication_status,"unpublished");assert.equal(requeued.publish_error,null);
    // A due-only worker cannot claim future or manual posts, and cannot double-claim.
    const due=await save("자동 실행할 글","schedule",null,new Date(Date.now()+500).toISOString());
    await new Promise((resolve)=>setTimeout(resolve,650));
    await db.exec("reset role; set role anon");
    await assert.rejects(worker("claim_due",null,{},"x".repeat(43)),(error)=>error.code==="42501");
    const running=await worker("claim_due");assert.equal(running.id,due.id);assert.equal(running.account_user_id,"123456789");
    assert.equal(await worker("claim_due"),null);
    await worker("container",running,{container_id:"423456789"});
    const completed=await worker("published",running,{post_id:"523456789"});assert.equal(completed.publication_status,"published");
    await worker("heartbeat",null,{status:"ready",detail:"Product test complete"});
    await db.exec("reset role; set role authenticated");
    assert.ok((await list()).some((row)=>row.id===due.id&&row.threads_post_id==="523456789"));
    const status=(await db.query("select * from public.queue_worker_status")).rows[0];assert.equal(status.status,"ready");
    console.log("PASS: Composer save/edit/duplicate warning; atomic bulk schedule; queue edit/cancel/requeue; immediate engine integration; due-only worker/result persistence; History hide/restore.");
  }finally{await db.close();}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await run();
