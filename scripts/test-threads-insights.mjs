import assert from 'node:assert/strict';
import {build} from '../.tools/product-preview/node_modules/esbuild/lib/main.js';
import {productFixture} from './test-pro-product.mjs';
await build({entryPoints:['lib/threads-api.ts','lib/threads-crypto.ts','lib/threads-performance.ts'],outdir:'.tools/p3-tests',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'}});
const api=await import('../.tools/p3-tests/threads-api.mjs'),crypto=await import('../.tools/p3-tests/threads-crypto.mjs'),performance=await import('../.tools/p3-tests/threads-performance.mjs');
const {db,workspace,secret,engine,save}=await productFixture();
const accountOp=async(op,data={})=>(await db.query('select public.threads_account_operation($1,$2,$3,$4::jsonb) value',[workspace,secret,op,JSON.stringify(data)])).rows[0].value;
const insights=async(op,data={})=>(await db.query('select public.threads_insight_operation($1,$2,$3,$4::jsonb) value',[workspace,secret,op,JSON.stringify(data)])).rows[0].value;
try{
 const token='only-test-fixture';await accountOp('connect',{userId:'123456789',username:'product_fixture',envelope:crypto.sealThreadsToken(token,workspace,secret),expiresAt:new Date(Date.now()+60*86400000).toISOString(),permissions:api.THREADS_PERMISSIONS});
 await accountOp('mode',{mode:'LIVE',confirmation:'LIVE'});
 let draft=await save('P3 actual insight contract fixture','now');draft=await engine('claim',draft);await engine('container',draft,{container_id:'223456789'});await engine('publishing',draft);draft=await engine('published',draft,{post_id:'323456789'});
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from private.threads_insight_jobs')).rows[0].n,5);
 await db.query("update public.drafts set published_at=now()-interval '25 hours' where id=$1",[draft.id]);
 await db.query("update private.threads_insight_jobs set due_at=now()+make_interval(hours=>after_hours)-interval '25 hours' where draft_id=$1",[draft.id]);
 await db.exec('set role authenticated');const claim=await insights('claim');assert.equal(claim.post.afterHours,24);assert.equal(claim.post.postId,'323456789');
 assert.equal(await insights('claim'),null); // bounded collection lease
 const result=await api.collectThreadsMetrics(token,'323456789',false,undefined,async url=>{
  const metric=new URL(url).searchParams.get('metric');if(metric==='shares')return Response.json({error:{code:100}},{status:400});
  return Response.json({data:[{name:metric,period:'lifetime',values:[{value:metric==='views'?100:metric==='likes'?0:4}]}]});
 });
 assert.equal(result.metrics.shares,null);assert.equal(result.metrics.likes,0);assert.equal(result.metrics.views,100);assert.equal(result.unavailable.shares,'Unavailable');
 await insights('complete',{jobId:claim.post.id,...result});
 const rows=(await db.query('select row_to_json(s) value from public.threads_post_insight_snapshots s')).rows.map(r=>r.value);
 assert.equal(rows.length,1);assert.equal(rows[0].after_hours,24);assert.equal(rows[0].shares,null);assert.equal(rows[0].likes,0);
 await assert.rejects(db.query("insert into public.threads_post_insight_snapshots(workspace_id,draft_id,account_id,after_hours) values($1,$2,$3,1)",[workspace,draft.id,draft.threads_account_id]),e=>e.code==='42501');
 assert.equal(api.threadsMetricValue({data:[]},'views'),null);assert.equal(api.threadsMetricValue({data:[{name:'views',period:'lifetime',values:[{value:'50'}]}]},'views'),null);
 assert.equal(api.threadsMetricValue({data:[{name:'likes',period:'day',total_value:{value:12}}]},'likes',true),12);
 assert.equal(performance.engagementScore({...result.metrics,likes:null}),null);assert.equal(performance.metricTotal([],'views').value,null);
 assert.equal(performance.winningPatterns([draft],rows,[]).enough,false);
 const fakeRows=Array.from({length:12},(_,i)=>({...rows[0],draft_id:'sample-'+i,views:100,likes:i+1,replies:4,reposts:3,quotes:2}));
 const fakeDrafts=fakeRows.map((r,i)=>({...draft,id:r.draft_id,topic:'Topic '+i,body:'A question?',published_at:new Date(Date.now()-3*86400000).toISOString()}));
 const patterns=performance.winningPatterns(fakeDrafts,fakeRows,[]);assert.equal(patterns.enough,true);assert.ok(patterns.times.length);assert.equal(patterns.byAccount[0].times.length,1);
 console.log('PASS P3 Insights: +1/6/24/72/168 checkpoints, missed-slot coalescing, single collector lease, real response shapes, unavailable vs actual zero, immutable snapshots, minimum mature sample and account-specific time evidence. No live Insights claimed.');
}finally{await db.close();}
