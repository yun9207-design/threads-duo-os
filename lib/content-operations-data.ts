import "server-only";
import {aiClient,generateAi} from "./ai-data";
import {AiProviderError} from "./ai-provider";
import {DraftInputError,isUuid,parseDeleteInput} from "./drafts-validation";
import {apportionMix,CATEGORY_PURPOSE,categoryId,periodDates,text,validDate,validTime,validateMix,type OperationsData,type PlanItem} from "./content-operations";
import {parsePostInput} from "./product-data";
import type {Json} from "./supabase/database.types";
import {BUILTIN_TEMPLATES} from "./ai-content";
import {plannerFeedback} from "./threads-feedback";
function dbError(code?:string):never{throw new AiProviderError(code==="55000"||code==="23505"?"계획 또는 예약 시간이 변경됐습니다. 최신 화면에서 다시 시도해 주세요.":"운영 데이터를 저장하지 못했습니다. 입력과 연결 상태를 확인해 주세요.",code==="55000"||code==="23505"?409:503);}
const asJson=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Json;
export async function operationsOverview(workspaceId:string):Promise<OperationsData>{
 const client=await aiClient(workspaceId);
 const [categories,plans,recurrences,aiPosts,templates,accounts]=await Promise.all([
 client.from("content_categories").select("*").eq("workspace_id",workspaceId).order("created_at"),
 client.from("content_plans").select("*").eq("workspace_id",workspaceId).order("created_at",{ascending:false}).limit(100),
 client.from("recurring_schedules").select("*").eq("workspace_id",workspaceId).order("created_at"),
 client.from("ai_generated_posts").select("draft_id").eq("workspace_id",workspaceId).not("draft_id","is",null),
 client.from("content_templates").select("*").eq("workspace_id",workspaceId).is("deleted_at",null),
 client.from("threads_accounts").select("*").eq("workspace_id",workspaceId)]);
 if(categories.error||plans.error||recurrences.error||aiPosts.error||templates.error||accounts.error)dbError();
 return {categories:categories.data!,plans:plans.data!,recurrences:recurrences.data!,aiPosts:aiPosts.data!,templates:templates.data!,accounts:accounts.data!};
}
function itemsInput(value:unknown):PlanItem[]{
 if(!Array.isArray(value)||!value.length||value.length>30)throw new DraftInputError("계획에는 1~30개 글이 필요합니다.");
 const items=value.map(item=>{
 if(!item||typeof item!=="object"||typeof item.id!=="string"||!isUuid(item.id))throw new DraftInputError("계획 항목을 확인해 주세요.");
 const aiPostId=categoryId(item.aiPostId),draftId=categoryId(item.draftId);let scheduledAt:string|undefined;
 if(item.scheduledAt){if(typeof item.scheduledAt!=="string"||!Number.isFinite(Date.parse(item.scheduledAt)))throw new DraftInputError("예약시간을 확인해 주세요.");scheduledAt=new Date(item.scheduledAt).toISOString();}
 return {id:item.id,topic:text(item.topic,180,true),purpose:text(item.purpose,100,true),categoryId:categoryId(item.categoryId),day:validDate(item.day),body:text(item.body??"",500),
 ...(aiPostId?{aiPostId}:{}),...(draftId?{draftId}:{}),...(scheduledAt?{scheduledAt}:{})};});
 if(new Set(items.map(i=>i.id)).size!==items.length)throw new DraftInputError("중복 계획 항목입니다.");return items;
}
export async function operate(workspaceId:string,value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value))throw new DraftInputError("작업을 확인해 주세요.");
 const input=value as Record<string,unknown>,client=await aiClient(workspaceId),user=(await client.auth.getUser()).data.user!;
 const overview=await operationsOverview(workspaceId);
 const checkCategory=(id:string|null)=>{if(id&&!overview.categories.some(c=>c.id===id&&!c.archived_at))throw new DraftInputError("카테고리를 찾을 수 없습니다.");};
 if(input.action==="category"){
 const id=categoryId(input.id);const changes=input.archive?{archived_at:new Date().toISOString()}:{name:text(input.name,40,true),color:text(input.color,7,true)};
 if("color" in changes&&!/^#[0-9a-fA-F]{6}$/.test(changes.color!))throw new DraftInputError("색상을 확인해 주세요.");
 const result=id?await client.from("content_categories").update(changes).eq("workspace_id",workspaceId).eq("id",id).eq("updated_at",parseDeleteInput({expectedUpdatedAt:input.expectedUpdatedAt})).select("*").single():
 await client.from("content_categories").insert({workspace_id:workspaceId,created_by:user.id,name:text(input.name,40,true),color:text(input.color,7,true)}).select("*").single();
 if(result.error)dbError(result.error.code);return {category:result.data};
 }
 if(input.action==="recurrence"){
 const id=categoryId(input.id);
 if(typeof input.enabled==="boolean"&&id&&!input.name){const result=await client.from("recurring_schedules").update({enabled:input.enabled}).eq("workspace_id",workspaceId).eq("id",id).eq("updated_at",parseDeleteInput({expectedUpdatedAt:input.expectedUpdatedAt})).select("*").single();if(result.error)dbError(result.error.code);return {recurrence:result.data};}
 if(!Array.isArray(input.days)||!input.days.length||input.days.length>7||input.days.some(n=>!Number.isInteger(n)||n<0||n>6))throw new DraftInputError("반복 요일을 선택해 주세요.");
 const category=categoryId(input.categoryId);checkCategory(category);const start=validDate(input.startDate),end=input.endDate?validDate(input.endDate):null;if(end&&end<start)throw new DraftInputError("반복 종료 날짜를 확인해 주세요.");
 const template=text(input.templateId??"",80);if(template&&isUuid(template)){const t=await client.from("content_templates").select("id").eq("workspace_id",workspaceId).eq("id",template).is("deleted_at",null).maybeSingle();if(!t.data)throw new DraftInputError("템플릿을 찾을 수 없습니다.");}
 const changes={name:text(input.name,100,true),days:[...new Set(input.days)] as number[],time_of_day:validTime(input.time),category_id:category,template_id:template,
 content_type:text(input.contentType??"정보 전달",100,true),enabled:input.enabled!==false,start_date:start,end_date:end};
 const result=id?await client.from("recurring_schedules").update(changes).eq("workspace_id",workspaceId).eq("id",id).eq("updated_at",parseDeleteInput({expectedUpdatedAt:input.expectedUpdatedAt})).select("*").single():
 await client.from("recurring_schedules").insert({...changes,workspace_id:workspaceId,created_by:user.id}).select("*").single();
 if(result.error)dbError(result.error.code);return {recurrence:result.data};
 }
 if(input.action==="createPlan"||input.action==="fill"){
 const business=text(input.business,180,true),goal=text(input.goal,500,true),audience=text(input.audience??"",200),start=validDate(input.startDate),end=validDate(input.endDate);
 const days=periodDates(start,end),mix=validateMix(input.mix);let count=Number(input.count);
 if(days.length>32)throw new DraftInputError("계획 기간은 32일 이내로 선택해 주세요.");
 if(!Number.isInteger(count)||count<1||count>30)throw new DraftInputError("게시 목표는 1~30개로 입력해 주세요.");
 if(Object.keys(mix).some(name=>!overview.categories.some(c=>c.name===name&&!c.archived_at)))throw new DraftInputError("콘텐츠 믹스 카테고리를 확인해 주세요.");
 const drafts=await client.from("drafts").select("body,scheduled_at,publication_status").eq("workspace_id",workspaceId).is("deleted_at",null);if(drafts.error)dbError(drafts.error.code);
 if(input.action==="fill"){const present=drafts.data!.filter(d=>d.scheduled_at&&d.publication_status!=="failed"&&Date.parse(d.scheduled_at)>=Date.parse(start+"T00:00:00+09:00")&&Date.parse(d.scheduled_at)<Date.parse(end+"T23:59:59+09:00")).length;count=Math.max(0,count-present);if(!count)return {complete:true,message:"기간의 목표가 이미 채워졌습니다."};}
 const requestId=categoryId(input.requestId);if(!requestId)throw new DraftInputError("생성 요청을 확인해 주세요.");
 const old=await client.from("content_plans").select("*").eq("workspace_id",workspaceId).eq("request_id",requestId).maybeSingle();if(old.data)return {plan:old.data};
 const allocation=apportionMix(count,mix);
 const feedback=input.performanceFeedback===true?await plannerFeedback(workspaceId,overview.categories):null;
 const generated=await generateAi(workspaceId,{requestId,topic:business+" — "+goal.slice(0,120),keyPoints:goal,audience,purpose:"정보 전달",tone:"자연스러운 대화체",mode:"multiple",count,action:"generate",sourceBody:"",templateId:"",sourcePostId:null},
 "주간 콘텐츠 기획입니다. label은 100자 이내 구체적 주제, angle은 독자 문제/관점, body는 최종 게시물 대신 짧은 개요입니다. 순서별 유형: "+JSON.stringify(allocation)+". 기존 내용과 주제가 겹치지 않게 하세요: "+JSON.stringify(drafts.data!.slice(0,50).map(d=>d.body.slice(0,100)))+
 (feedback?". 최근 실제 성과 참고: "+JSON.stringify(feedback)+". 사용자 믹스와 목표를 우선하고 원문은 복제하지 마세요. 표본 부족(insufficient)이면 성공 패턴이나 추천 시간을 추론하지 말고 기존 주제 중복만 피하세요.":""));
 const items=generated.posts.map((post,index)=>({id:crypto.randomUUID(),topic:post.label.slice(0,180),purpose:CATEGORY_PURPOSE[allocation[index]]??"정보 전달",
 categoryId:overview.categories.find(c=>c.name===allocation[index])!.id,day:days[Math.min(days.length-1,Math.floor(index*days.length/count))],body:""}));
 const result=await client.from("content_plans").insert({workspace_id:workspaceId,created_by:user.id,request_id:requestId,business,goal,audience,start_date:start,end_date:end,target_count:Number(input.count),mix,items,performance_feedback:input.performanceFeedback===true}).select("*").single();
 if(result.error)dbError(result.error.code);return {plan:result.data};
 }
 const id=categoryId(input.planId),plan=overview.plans.find(p=>p.id===id);if(!plan)throw new DraftInputError("계획을 찾을 수 없습니다.");
 if(plan.status==="scheduled")throw new AiProviderError("이미 배치한 계획입니다. Calendar 또는 Queue에서 수정하세요.",409);
 if(plan.updated_at!==parseDeleteInput({expectedUpdatedAt:input.expectedUpdatedAt}))throw new AiProviderError("계획이 변경됐습니다. 최신 화면에서 다시 열어 주세요.",409);
 if(input.action==="savePlan"){
 const items=itemsInput(input.items);items.forEach(item=>{checkCategory(item.categoryId);if(item.day<plan.start_date||item.day>plan.end_date)throw new DraftInputError("계획 날짜가 기간 밖에 있습니다.");
 const original=plan.items.find(o=>o.id===item.id);if(!original||original.aiPostId!==item.aiPostId||original.draftId!==item.draftId)throw new DraftInputError("계획 연결을 변경할 수 없습니다.");});
 const result=await client.from("content_plans").update({items}).eq("workspace_id",workspaceId).eq("id",plan.id).eq("updated_at",plan.updated_at).select("*").single();if(result.error)dbError(result.error.code);return {plan:result.data};
 }
 if(input.action==="generatePosts"){
 if(plan.items.every(i=>i.aiPostId))return {plan};const requestId=categoryId(input.requestId);if(!requestId)throw new DraftInputError("생성 요청을 확인해 주세요.");
 const feedback=plan.performance_feedback?await plannerFeedback(workspaceId,overview.categories):null;
 const generated=await generateAi(workspaceId,{requestId,topic:plan.business+" — "+plan.goal.slice(0,120),keyPoints:plan.goal,audience:plan.audience,purpose:"정보 전달",tone:"자연스러운 대화체",mode:"multiple",count:plan.items.length,action:"generate",sourceBody:"",templateId:"",sourcePostId:null},
 "다음 계획 순서와 개수를 정확히 지켜 각 주제의 최종 게시물을 작성하세요. 계획: "+JSON.stringify(plan.items.map(i=>({topic:i.topic,purpose:i.purpose,categoryId:i.categoryId})))+
 ". 카테고리에 연결된 반복 슬롯의 콘텐츠 유형과 템플릿 지침: "+JSON.stringify(overview.recurrences.filter(r=>r.enabled).map(r=>({categoryId:r.category_id,purpose:r.content_type,instruction:[...BUILTIN_TEMPLATES,...(overview.templates??[])].find(t=>t.id===r.template_id)?.instruction??""})))+
 (feedback?". 실제 성과 참고: "+JSON.stringify(feedback)+". 표본 부족이면 성공 패턴을 만들지 마세요. 기존 주제나 문장을 복사하지 않습니다.":""));
 const items=plan.items.map((item,index)=>({...item,body:generated.posts[index].body,aiPostId:generated.posts[index].id}));
 const result=await client.from("content_plans").update({items,status:"ready"}).eq("workspace_id",workspaceId).eq("id",plan.id).eq("updated_at",plan.updated_at).select("*").single();if(result.error)dbError(result.error.code);return {plan:result.data};
 }
 if(input.action==="place"){
 if(input.reviewed!==true||!plan.items.every(i=>i.aiPostId&&i.body.trim()&&i.scheduledAt))throw new DraftInputError("생성한 글과 예약시간을 검토해 주세요.");
 const sources=await client.from("ai_generated_posts").select("*").eq("workspace_id",workspaceId).in("id",plan.items.map(i=>i.aiPostId!)).is("deleted_at",null);if(sources.error)dbError(sources.error.code);
 const posts=plan.items.map(item=>{const source=sources.data!.find(p=>p.id===item.aiPostId);if(!source||source.draft_id)throw new DraftInputError("이미 사용됐거나 없는 AI 글입니다.");checkCategory(item.categoryId);
 return {...parsePostInput({body:item.body,mode:"schedule",scheduledAt:item.scheduledAt,accountId:input.accountId??null,categoryId:item.categoryId}),id:source.id,expectedUpdatedAt:source.updated_at,draftUpdatedAt:null};});
 const result=await client.rpc("place_content_plan",{p_workspace_id:workspaceId,p_plan_id:plan.id,p_expected_updated_at:plan.updated_at,p_posts:asJson(posts)});if(result.error)dbError(result.error.code);return {drafts:result.data};
 }
 throw new DraftInputError("지원하지 않는 작업입니다.");
}
