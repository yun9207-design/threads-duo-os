import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {build} from '../.tools/product-preview/node_modules/esbuild/lib/main.js';
import {productFixture} from './test-pro-product.mjs';
await mkdir('.tools/p3-tests',{recursive:true});
await build({entryPoints:['lib/threads-api.ts','lib/threads-crypto.ts'],outdir:'.tools/p3-tests',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'}});
const api=await import('../.tools/p3-tests/threads-api.mjs'),crypto=await import('../.tools/p3-tests/threads-crypto.mjs');
const {db,workspace,secret,engine,save,list}=await productFixture();
const accountOp=async(op,data={})=>(await db.query('select public.threads_account_operation($1,$2,$3,$4::jsonb) value',[workspace,secret,op,JSON.stringify(data)])).rows[0].value;
const worker=async(op,draft=null,data={})=>(await db.query('select public.product_worker_operation($1,$2,$3,$4,$5,$6::jsonb) value',[workspace,secret,op,draft?.id??null,draft?.publish_attempt_id??null,JSON.stringify(data)])).rows[0].value;
try{
 const token='fixture-only-'+randomBytes(24).toString('hex'),envelope=crypto.sealThreadsToken(token,workspace,secret);
 assert.equal(crypto.openThreadsToken(envelope,workspace,secret),token);assert.ok(!envelope.includes(token));
 assert.throws(()=>crypto.openThreadsToken(envelope,crypto.randomUUID?.()??'another-workspace',secret));
 assert.throws(()=>crypto.openThreadsToken(envelope,workspace,randomBytes(32).toString('base64url')));
 const expiry=new Date(Date.now()+60*86400000).toISOString();
 let account=await accountOp('connect',{userId:'123456789',username:'product_fixture',envelope,expiresAt:expiry,permissions:api.THREADS_PERMISSIONS});
 assert.equal(account.publishing_mode,'TEST');assert.equal(account.connection_status,'connected');assert.ok(!JSON.stringify(account).includes(envelope));
 await assert.rejects(db.query('select * from private.threads_account_credentials'),e=>e.code==='42501');
 await accountOp('state_create',{hash:'a'.repeat(64)});await accountOp('state_consume',{hash:'a'.repeat(64)});
 await assert.rejects(accountOp('state_consume',{hash:'a'.repeat(64)}),e=>e.code==='55000');
 await assert.rejects(accountOp('mode',{mode:'LIVE'}),e=>e.code==='55000');
 const calls=[],fake=async(url,options)=>{
   const endpoint=new URL(url).pathname;calls.push(endpoint);
   if(endpoint.endsWith('/threads')){assert.equal(new URLSearchParams(options.body).get('media_type'),'TEXT');return Response.json({id:'223456789'});}
   if(endpoint.endsWith('/threads_publish'))return Response.json({id:'323456789'});
   if(endpoint==='/223456789')return Response.json({id:'223456789',status:'FINISHED'});
   throw Error('Unexpected fake endpoint');
 };
 const step=async(name,claimed,data)=>{try{return await engine(name,claimed,data);}catch(e){console.error('P3 SQL stage',name,e.code,e.message);throw e;}};
 const callbacks=claimed=>({saveContainer:id=>step('container',claimed,{container_id:id}),savePublishing:()=>step('publishing',claimed),
 savePublished:id=>engine('published',claimed,{post_id:id}),saveTest:()=>engine('test_completed',claimed),
 saveFailure:(error,retryable,details)=>engine('failed',claimed,{error,retryable,code:details?.code??'UNKNOWN',transient:details?.transient??false})});
 let draft=await save('P3 TEST pipeline','now'),claim=await engine('claim',draft);
 await assert.rejects(engine('claim',draft),e=>e.code==='55000');
 assert.equal(await api.publishThreadsText(token,'123456789',claim.body,callbacks(claim),fake,async()=>{},claim.publish_mode),null);
 assert.equal(calls.filter(p=>p.endsWith('/threads_publish')).length,0);
 draft=(await list()).find(d=>d.id===draft.id);assert.equal(draft.publish_stage,'test_completed');assert.equal(draft.publication_status,'unpublished');assert.equal(draft.threads_post_id,null);
 await accountOp('mode',{mode:'LIVE',confirmation:'LIVE'});claim=await engine('claim',draft);
 assert.equal(await api.publishThreadsText(token,'123456789',claim.body,callbacks(claim),fake,async()=>{},claim.publish_mode),'323456789');
 draft=(await list()).find(d=>d.id===draft.id);assert.equal(draft.publish_stage,'published');assert.equal(draft.threads_post_id,'323456789');assert.ok(draft.published_at);
 await assert.rejects(engine('claim',draft),e=>e.code==='55000');assert.equal((await engine('published',claim,{post_id:'323456789'})).threads_post_id,'323456789');
 // Only proven pre-publish transient failures can receive automatic retries.
 let retry=await save('P3 bounded retries','schedule',null,new Date(Date.now()+100).toISOString());await new Promise(r=>setTimeout(r,150));
 for(let attempt=0;attempt<4;attempt++){
  await db.exec('reset role; set role anon');claim=await worker('claim_due');assert.equal(claim.id,retry.id);
  const fail=await worker('failed',claim,{error:'Temporary fixture',retryable:true,transient:true,code:'429'});
  assert.equal(fail.publish_retry_count,attempt);assert.equal(fail.publish_needs_attention,attempt===3);
  assert.equal(!!fail.publish_next_retry_at,attempt<3);
  await db.exec('reset role');if(attempt<3)await db.query("update public.drafts set publish_next_retry_at=now()-interval '1 second' where id=$1",[retry.id]);
 }
 await db.exec('set role anon');assert.equal(await worker('claim_due'),null);
 await db.exec('reset role; set role authenticated');
 let permanent=await save('P3 permanent failure','now');claim=await engine('claim',permanent);
 await assert.rejects(api.publishThreadsText(token,'123456789',claim.body,callbacks(claim),async()=>Response.json({error:{code:190,message:token}},{status:400}),async()=>{},'LIVE'),e=>!e.message.includes(token));
 permanent=(await list()).find(d=>d.id===permanent.id);assert.equal(permanent.publish_needs_attention,true);assert.equal(permanent.publish_next_retry_at,null);assert.equal(permanent.publish_error_code,'190');
 // An ambiguous final publish must remain non-retryable, regardless of HTTP retry rules.
 let uncertain=await save('P3 uncertain final response','now');claim=await engine('claim',uncertain);
 await assert.rejects(api.publishThreadsText(token,'123456789',claim.body,callbacks(claim),async(url,options)=>new URL(url).pathname.endsWith('/threads_publish')?Response.json({error:{code:2}},{status:500}):fake(url,options),async()=>{},'LIVE'));
 uncertain=(await list()).find(d=>d.id===uncertain.id);assert.equal(uncertain.publish_retryable,false);assert.equal(uncertain.publish_next_retry_at,null);
 await accountOp('disconnect');assert.equal(await accountOp('credential'),null);
 console.log('PASS P3: encrypted credentials, one-use OAuth state, TEST final-publish gate, LIVE stage/IDs, original double-claim protection, bounded 1/5/15 retries, permanent and ambiguous dead letters. Fake Meta transport only; no live post created.');
}finally{await db.close();}
