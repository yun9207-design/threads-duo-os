import assert from 'node:assert/strict';
import {build} from '../.tools/product-preview/node_modules/esbuild/lib/main.js';
import {productFixture} from './test-pro-product.mjs';
await build({entryPoints:['lib/publish-operations.ts','lib/threads-api.ts'],outdir:'.tools/p3-tests',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'}});
const {runPublishSimulation,schedulerHealth}=await import('../.tools/p3-tests/publish-operations.mjs');
const {threadsAuthorizeUrl}=await import('../.tools/p3-tests/threads-api.mjs');
assert.ok(!new URL(threadsAuthorizeUrl('123','https://example.com/callback','state')).searchParams.get('scope').includes('threads_manage_insights'));
assert.ok(new URL(threadsAuthorizeUrl('123','https://example.com/callback','state',true)).searchParams.get('scope').includes('threads_manage_insights'));
const {db,workspace,secret,engine,save,list,account}=await productFixture();
const worker=async(op,draft=null,data={})=>(await db.query('select public.product_worker_operation($1,$2,$3,$4,$5,$6::jsonb) value',
 [workspace,secret,op,draft?.id??null,draft?.publish_attempt_id??null,JSON.stringify(data)])).rows[0].value;
const simulate=async(draft,scenario)=>{const claim=await engine('simulate_claim',draft,{scenario});return runPublishSimulation(scenario,(op,data)=>engine(op,claim,data));};
const reload=async id=>(await list()).find(d=>d.id===id);
try{
 const simulateSave=async(body,key=secret)=>(await db.query('select public.save_publish_simulation($1,$2,$3::jsonb,$4) value',
  [workspace,key,JSON.stringify({body,mode:'now',accountId:account.id}),'success'])).rows[0].value;
 const before=(await list()).length;await assert.rejects(simulateSave('원자적 TEST 롤백','x'.repeat(43)));assert.equal((await list()).length,before);
 const atomic=await simulateSave('원자적 TEST 저장 + 잠금');assert.equal(atomic.publish_stage,'processing');assert.equal(atomic.publish_simulated,true);
 await runPublishSimulation('success',(op,data)=>engine(op,atomic,data));
 // No account credential exists, yet the explicit simulation runs the real DB pipeline.
 let d=await save('운영 안정화 TEST 성공','schedule',null,new Date(Date.now()+86400000).toISOString());
 assert.equal(d.publish_stage,'scheduled');const original=d;
 const claims=await Promise.allSettled([engine('simulate_claim',original,{scenario:'success'}),engine('simulate_claim',original,{scenario:'success'})]);
 assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);const claim=claims.find(r=>r.status==='fulfilled').value;
 await assert.rejects(engine('published',claim,{post_id:'999'}));
 d=await runPublishSimulation('success',(op,data)=>engine(op,claim,data));
 assert.equal(d.publish_stage,'test_completed');assert.equal(d.publication_status,'unpublished');
 assert.equal(d.publish_simulated,true);assert.equal(d.threads_post_id,null);assert.equal(d.threads_container_id,null);assert.equal(d.published_at,null);
 let events=(await db.query('select * from public.publish_job_events where draft_id=$1 order by created_at,id',[d.id])).rows;
 assert.deepEqual(events.map(e=>e.to_state),['scheduled','processing','container_created','publishing','test_completed']);
 assert.equal(new Set(events.map(e=>e.job_id)).size,1);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from private.threads_insight_jobs')).rows[0].n,0);
 await db.exec('set role authenticated');
 // Only safe transient errors enter the same 1/5/15 retry budget.
 let retry=await save('운영 안정화 TEST 재시도','schedule',null,new Date(Date.now()+86400000).toISOString());
 const job=retry.publish_job_id;
 for(let i=0;i<4;i++){
  if(i===0)retry=await simulate(retry,'transient');
  else{await db.exec('reset role; set role anon');const c=await worker('claim_simulation_due');assert.equal(c.id,retry.id);
   assert.equal(await worker('claim_simulation_due'),null);retry=await runPublishSimulation('transient',(op,data)=>worker(op,c,data));await db.exec('reset role; set role authenticated');}
  assert.equal(retry.publish_job_id,job);assert.equal(retry.publish_retry_count,i);
  assert.equal(retry.publish_stage,i===3?'needs_attention':'retry_wait');
  if(i<3){const minutes=[1,5,15][i];assert.ok(Math.abs(Date.parse(retry.publish_next_retry_at)-Date.now()-minutes*60000)<3000);
   await db.exec('reset role');await db.query("update public.drafts set publish_next_retry_at=now()-interval '1 second' where id=$1",[retry.id]);await db.exec('set role authenticated');}
 }
 await db.exec('reset role; set role anon');assert.equal(await worker('claim_simulation_due'),null);await db.exec('reset role; set role authenticated');
 const perm=await simulate(await save('운영 안정화 TEST 영구 오류','now'),'permanent');assert.equal(perm.publish_stage,'needs_attention');assert.equal(perm.publish_next_retry_at,null);
 const ambiguous=await simulate(await save('운영 안정화 TEST 불확실','now'),'ambiguous');assert.equal(ambiguous.publish_retryable,false);assert.equal(ambiguous.publish_next_retry_at,null);
 await assert.rejects(engine('simulate_claim',ambiguous,{scenario:'success'}));
 // Lease expiry can replay only processing before any container/final request.
 let stale=await engine('simulate_claim',await save('운영 안정화 TEST stale 안전','now'),{scenario:'success'});
 await db.exec('reset role');await db.query("update public.drafts set publish_lease_until=now()-interval '1 second' where id=$1",[stale.id]);await db.exec('set role anon');
 await worker('recover_stale');await db.exec('reset role; set role authenticated');assert.equal((await reload(stale.id)).publish_stage,'retry_wait');
 await assert.rejects(engine('simulate_prepare',stale));
 stale=await engine('simulate_claim',await save('운영 안정화 TEST stale 불확실','now'),{scenario:'success'});await engine('simulate_prepare',stale);await engine('simulate_publishing',stale);
 await db.exec('reset role');await db.query("update public.drafts set publish_lease_until=now()-interval '1 second' where id=$1",[stale.id]);await db.exec('set role anon');
 await worker('recover_stale');await db.exec('reset role; set role authenticated');stale=await reload(stale.id);assert.equal(stale.publish_stage,'needs_attention');assert.equal(stale.publication_status,'publishing');assert.equal(stale.publish_retryable,false);
 // A newly edited safe job clears simulation intent; a cancellation is journaled.
 const cancelled=(await db.query("update public.drafts d set scheduled_at=null,auto_publish=false where id=$1 returning row_to_json(d) value",[retry.id])).rows[0].value;
 assert.equal(cancelled.publish_stage,'cancelled');assert.equal(cancelled.publish_simulated,false);assert.notEqual(cancelled.publish_job_id,job);
 assert.equal(schedulerHealth({last_run_at:new Date().toISOString(),status:'blocked'},false,Date.now()).label,'Scheduler 정상 · Threads 연결 대기');
 // New collector fields + claim fencing, using isolated fixture metadata only.
 await db.exec('reset role');await db.query("update public.threads_accounts set publishing_mode='LIVE',connection_status='connected',token_expires_at=now()+interval '1 day',granted_permissions=array['threads_basic','threads_content_publish','threads_manage_insights'] where id=$1",[account.id]);await db.exec('set role authenticated');
 let real=await engine('claim',await save('격리 DB Post ID 계약 검사','now'));await engine('container',real,{container_id:'12345'});await engine('publishing',real);real=await engine('published',real,{post_id:'67890'});
 const insight=async(op,data={})=>(await db.query('select public.threads_insight_operation($1,$2,$3,$4::jsonb) value',[workspace,secret,op,JSON.stringify(data)])).rows[0].value;
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from private.threads_insight_jobs where draft_id=$1',[real.id])).rows[0].n,5);
 await db.query("update private.threads_insight_jobs set due_at=now()-interval '1 second' where draft_id=$1",[real.id]);await db.exec('set role authenticated');
 const lease=await insight('claim');assert.ok(lease.post.attempt);const metrics={views:1,likes:0,replies:0,reposts:null,quotes:null,shares:null};
 await assert.rejects(insight('complete',{jobId:lease.post.id,attempt:lease.post.attempt-1,metrics}),e=>e.code==='55000');
 await insight('complete',{jobId:lease.post.id,attempt:lease.post.attempt,metrics,unavailable:{reposts:'Unavailable'},errorCode:'100'});
 const snap=(await db.query('select * from public.threads_post_insight_snapshots')).rows[0];assert.equal(snap.threads_post_id,'67890');assert.equal(snap.collection_status,'partial');assert.equal(snap.error_code,'100');assert.equal(snap.reposts,null);assert.equal(snap.likes,0);
 console.log('PASS: credential-free TEST, double-claim rejection, stable job key + ordered timeline, 1/5/15 retry exhaustion, permanent/ambiguous isolation, safe/uncertain stale recovery, cancellation, scheduler state, 5 Insights checkpoints + collector attempt fencing + NULL availability. Isolated DB only; no Meta calls.');
}finally{await db.close();}
