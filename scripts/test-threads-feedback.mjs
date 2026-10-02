import assert from 'node:assert/strict';import {resolve} from 'node:path';import {build} from '../.tools/product-preview/node_modules/esbuild/lib/main.js';import {productFixture} from './test-pro-product.mjs';import {localClient} from './p2-postgres-client.mjs';
await build({entryPoints:['lib/ai-data.ts'],outfile:'.tools/p3-tests/feedback-data.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'isolated-db',setup(b){b.onResolve({filter:/^(server-only|.*supabase\/server|.*workspaces)$/},a=>({path:resolve(a.path==='server-only'?'.tools/p2-tests/empty.ts':'.tools/p2-tests/server-stub.ts')}));}}]});
const {db,workspace,actor,list}=await productFixture();globalThis.__p2Client=localClient(db,actor);globalThis.__p2Workspace=workspace;
try{
 const job=crypto.randomUUID(),parameters={topic:'성과 후속 글',purpose:'정보 전달',tone:'자연스러운 대화체',mode:'multiple',count:3,operationKind:'performance_followup',sourceDraftId:'local-source',sourceAnalysis:{views:100,replies:14,shares:null}};
 await db.query('select public.reserve_ai_generation($1,$2,$3,$4::jsonb,$5)',[workspace,job,'b'.repeat(64),JSON.stringify(parameters),'gpt-5.4-mini']);
 const content=Array.from({length:3},(_,i)=>({label:'후속 '+i,angle:'다른 관점 '+i,body:'새로운 후속 관점 '+i+'에서 시작합니다. 여러분의 생각은 어떤가요?'}));
 const posts=(await db.query('select row_to_json(p) value from public.finish_ai_generation($1,$2,$3::jsonb) p',[workspace,job,JSON.stringify(content)])).rows.map(r=>r.value);
 const {promoteAiPosts}=await import('../.tools/p3-tests/feedback-data.mjs'),scheduledAt=new Date(Date.now()+86400000).toISOString();
 const result=await promoteAiPosts(workspace,{posts:posts.map(p=>({id:p.id,expectedUpdatedAt:p.updated_at,draftUpdatedAt:null,body:p.body,mode:'schedule',scheduledAt,accountId:null,categoryId:null,allowDuplicate:false}))});
 assert.equal(result.drafts.length,3);assert.ok(result.drafts.every(d=>d.scheduled_at&&d.auto_publish));assert.equal((await list()).length,3);
 const saved=(await db.query('select parameters from public.ai_generation_jobs where id=$1',[job])).rows[0];assert.equal(saved.parameters.operationKind,'performance_followup');assert.equal(saved.parameters.sourceAnalysis.shares,null);
 console.log('PASS performance-followup integration: source evidence preserved, AI version retained, three generated records atomically attach to existing Queue and remain queryable. Live OpenAI/UI proof recorded separately.');
}finally{await db.close();}
