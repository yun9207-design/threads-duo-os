// P1-only: provider contract, content/schedule validation and AI-record -> existing Queue integration.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createHash,randomUUID } from "node:crypto";
import { build } from "../.tools/product-preview/node_modules/esbuild/lib/main.js";
import { productFixture } from "./test-pro-product.mjs";
await mkdir(new URL("../.tools/ai-tests/",import.meta.url),{recursive:true});
await build({stdin:{contents:'export * from "./lib/ai-content"; export * from "./lib/ai-provider";',resolveDir:process.cwd()},
  outfile:".tools/ai-tests/content.mjs",bundle:true,platform:"node",format:"esm",
  plugins:[{name:"server-only-test",setup(builder){builder.onResolve({filter:/^server-only$/},()=>({path:"server-only",namespace:"test"}));
    builder.onLoad({filter:/.*/,namespace:"test"},()=>({contents:"",loader:"js"}));}}]});
const {parseAiInput,validateGeneratedContent,distributeAiSchedule,aiResponseRequest,generateThreadsContent}=await import("../.tools/ai-tests/content.mjs");
const params={topic:"초보자를 위한 AI 활용법",keyPoints:"확인 가능한 정보만",audience:"직장인",purpose:"교육 콘텐츠",tone:"자연스러운 대화체",
  mode:"multiple",count:10,action:"generate",sourceBody:"",sourcePostId:null,templateId:"checklist"};
const input=parseAiInput({requestId:randomUUID(),...params});
assert.throws(()=>parseAiInput({...input,count:31}));assert.throws(()=>parseAiInput({...input,action:"cta",sourceBody:""}));
const contents=Array.from({length:10},(_,index)=>({label:"버전 "+(index+1),angle:["질문 구체화","독자 설정","결과 검토","작게 시작","개인정보","반복 업무","역할 지정","예시 제공","조건 제한","피드백"][index],
  body:["AI에게 질문할 때, 원하는 결과부터 말해 보세요.\n답변이 짧아야 하는지 먼저 정하면 요청도 선명해집니다.",
    "누가 읽을 글인가요?\nAI에게 독자의 상황을 알려주면 어려운 설명을 쉽게 바꿀 수 있어요.",
    "그럴듯한 답을 바로 믿지 마세요.\n날짜와 숫자는 원문과 대조하는 작은 습관이 필요합니다.",
    "큰 프로젝트보다 작은 일 하나로 시작해요.\n회의 제목 세 개를 부탁하는 것만으로도 차이를 느낄 수 있습니다.",
    "입력하기 전에 한 번 멈춰 보세요.\n이름과 연락처 같은 정보가 꼭 필요한지 먼저 확인합니다.",
    "반복하는 업무를 적어봤나요?\n형식이 비슷한 메일에서 공통 항목을 찾으면 첫 자동화 소재가 됩니다.",
    "역할은 답변의 방향을 잡아 줍니다.\n편집자의 시선으로 읽어달라는 요청도 좋은 출발이에요.",
    "원하는 예시 하나가 긴 설명보다 낫습니다.\n직접 쓴 문장을 보여주고 비슷한 길이를 부탁해 보세요.",
    "조건이 많다면 우선순위를 정해요.\n가장 중요한 규칙 하나를 먼저 전달하면 결과를 비교하기 쉽습니다.",
    "좋은 초안도 한 번에 끝나지 않아요.\n마음에 드는 부분과 바꿀 부분을 나눠 피드백해 보세요."][index]}));
assert.equal(validateGeneratedContent({posts:contents},10).length,10);
assert.throws(()=>validateGeneratedContent({posts:[contents[0],contents[0]]},2));
assert.throws(()=>validateGeneratedContent({posts:[{...contents[0],body:"가".repeat(501)}]},1));
const request=aiResponseRequest(input,"체크리스트로 구성","gpt-5.4-mini");assert.equal(request.text.format.type,"json_schema");assert.equal(request.store,false);
assert.ok(request.instructions.includes("단순 문장 치환"));assert.ok(request.instructions.includes("500자"));
const tomorrow=new Date(Date.now()+86400000+32400000).toISOString().slice(0,10);
const dayAfter=new Date(Date.now()+172800000+32400000).toISOString().slice(0,10);
const schedule={startDate:tomorrow,endDate:dayAfter,perDay:5,startTime:"10:00",endTime:"22:00"};
const times=distributeAiSchedule(10,schedule);assert.equal(times.length,10);assert.equal(new Set(times).size,10);
assert.equal(times[0],tomorrow+"T01:00:00.000Z");assert.equal(times[4],tomorrow+"T13:00:00.000Z");assert.equal(times[5],dayAfter+"T01:00:00.000Z");
assert.throws(()=>distributeAiSchedule(10,{...schedule,endDate:tomorrow}));assert.throws(()=>distributeAiSchedule(10,{...schedule,startTime:"22:00",endTime:"10:00"}));
assert.throws(()=>distributeAiSchedule(1,{...schedule,startDate:"2020-01-01",endDate:"2020-01-01"}));
const originalFetch=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;let calls=0;
try{
  delete process.env.OPENAI_API_KEY;
  globalThis.fetch=async()=>{calls++;throw new Error("must not call without key");};
  await assert.rejects(generateThreadsContent(input,""),(error)=>error.status===503);assert.equal(calls,0);
  process.env.OPENAI_API_KEY="local-fixture-not-a-real-api-key";
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,"https://api.openai.com/v1/responses");assert.equal(options.redirect,"error");
    const sent=JSON.parse(options.body);assert.equal(sent.text.format.strict,true);assert.equal(sent.store,false);
    return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({posts:contents})}]}]});};
  assert.equal((await generateThreadsContent(input,"チェック")).length,10);assert.equal(calls,1);
  globalThis.fetch=async()=>Response.json({error:{message:"private upstream error"}},{status:429});
  await assert.rejects(generateThreadsContent(input,""),(error)=>error.status===429&&!error.message.includes("private"));
}finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;}

const fixture=await productFixture();const {db,workspace,actor,list,account,secret}=fixture;
const reserve=async(id,parameters=params)=>(await db.query("select public.reserve_ai_generation($1,$2,$3,$4::jsonb,'gpt-5.4-mini') value",
  [workspace,id,createHash("sha256").update(JSON.stringify(parameters)).digest("hex"),JSON.stringify(parameters)])).rows[0].value;
const finish=async(id,posts)=>(await db.query("select * from public.finish_ai_generation($1,$2,$3::jsonb)",[workspace,id,JSON.stringify(posts)])).rows;
const promote=async(posts)=>(await db.query("select * from public.save_ai_posts($1,$2::jsonb)",[workspace,JSON.stringify(posts)])).rows;
try{
  // Vault read is a new P1 boundary: membership alone cannot reveal credentials.
  await db.exec("reset role; create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text)");
  await db.query("insert into vault.decrypted_secrets values($1,'isolated-fixture-key')",["threads_pro_ai_"+workspace]);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select public.ai_server_credential($1,$2)",[workspace,"wrong-capability"]),(error)=>error.code==="42501");
  await assert.rejects(db.query("select * from vault.decrypted_secrets"),(error)=>error.code==="42501");
  assert.equal((await db.query("select public.ai_server_credential($1,$2) value",[workspace,secret])).rows[0].value,"isolated-fixture-key");
  const id=randomUUID(),reserved=await reserve(id);assert.equal(reserved.claimed,true);assert.equal(reserved.job.actor_user_id,actor);
  assert.equal((await reserve(id)).claimed,false);
  await assert.rejects(reserve(randomUUID()),(error)=>error.code==="P0001");
  await assert.rejects(finish(id,contents.slice(0,9)),(error)=>error.code==="22023");
  let posts=await finish(id,contents);assert.equal(posts.length,10);
  assert.equal((await reserve(id)).job.status,"completed");
  const edited=(await db.query("update public.ai_generated_posts set body=$1 where id=$2 and updated_at=$3 returning *",
    ["修正ではなく、編集した 한국어 글입니다.\n실제 Queue 연결을 확인합니다.",posts[0].id,posts[0].updated_at])).rows[0];posts[0]=edited;
  const selection=posts.map((post,index)=>({id:post.id,expectedUpdatedAt:post.updated_at,body:post.body,mode:"schedule",scheduledAt:times[index],accountId:account.id}));
  const drafts=await promote(selection);assert.equal(drafts.length,10);assert.ok(drafts.every((draft)=>draft.auto_publish&&draft.status==="approved"));
  assert.equal(drafts[0].body,edited.body);assert.equal((await list()).filter((draft)=>draft.scheduled_at).length,10);
  const reread=(await db.query("select * from public.ai_generated_posts where generation_id=$1 order by position",[id])).rows;
  assert.ok(reread.every((post)=>post.draft_id));assert.equal((await db.query("select results from public.ai_generation_jobs where id=$1",[id])).rows[0].results[0].body,contents[0].body);
  // Re-read after scheduling preserves the original generation and links to actual publishing status.
  assert.equal((await db.query("select count(*)::int n from public.ai_generated_posts a join public.drafts d on d.id=a.draft_id and d.workspace_id=a.workspace_id where a.generation_id=$1 and d.scheduled_at is not null",[id])).rows[0].n,10);
  await assert.rejects(promote(selection),(error)=>error.code==="55000");
  const one={...selection[0],expectedUpdatedAt:reread[0].updated_at,draftUpdatedAt:drafts[0].updated_at,scheduledAt:dayAfter+"T02:00:00.000Z"};
  const rescheduled=await promote([one]);assert.equal(rescheduled[0].id,drafts[0].id);assert.equal((await list()).length,10);
  const id2=randomUUID();await reserve(id2);const posts2=await finish(id2,contents.map((item,i)=>({...item,body:item.body+"\n새 기록 "+i})));
  await assert.rejects(promote(posts2.map((post,i)=>({id:post.id,expectedUpdatedAt:post.updated_at,body:post.body,mode:"schedule",scheduledAt:i===9?"2020-01-01T00:00:00Z":times[i]}))),error=>error.code==="22023");
  assert.equal((await list()).length,10);assert.equal((await db.query("select count(*)::int n from public.ai_generated_posts where generation_id=$1 and draft_id is not null",[id2])).rows[0].n,0);
  const template=(await db.query("insert into public.content_templates(workspace_id,created_by,name,instruction,purpose,tone) values($1,$2,'나만의 팁','한 가지 팁과 사례','정보 전달','담백함') returning *",[workspace,actor])).rows[0];assert.equal(template.name,"나만의 팁");
  await db.query("update public.content_templates set deleted_at=now() where id=$1",[template.id]);
  assert.equal((await db.query("select count(*)::int n from public.content_templates where deleted_at is null")).rows[0].n,0);
  console.log("PASS: P1 provider contract / 10 distinct results / edits / KST distribution / atomic Queue / persistence / reuse / templates");
}finally{await db.close();}
