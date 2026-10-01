import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "./supabase/server";
import { readWorkspace } from "./workspaces";
import { DraftAccessError } from "./drafts";
import { DraftInputError,isUuid,parseDeleteInput } from "./drafts-validation";
import { parsePostInput } from "./product-data";
import { AI_PURPOSES,AI_TONES,BUILTIN_TEMPLATES,parseAiInput } from "./ai-content";
import { AiProviderError,aiModel,generateThreadsContent } from "./ai-provider";
import type { AiGenerationRow,Json } from "./supabase/database.types";

export async function aiClient(workspaceId:string){await readWorkspace(workspaceId);const client=await createClient();if(!client)throw new DraftAccessError(503);return client;}
export async function aiCredential(workspaceId:string,client:Awaited<ReturnType<typeof aiClient>>){
  const localKey=process.env.OPENAI_API_KEY?.trim();if(localKey)return localKey;
  const capability=process.env.THREADS_PUBLISHING_SECRET?.trim();
  if(!capability||process.env.THREADS_WORKSPACE_ID!==workspaceId)return null;
  const result=await client.rpc("ai_server_credential",{p_workspace_id:workspaceId,p_server_secret:capability});
  // The credential stays in this server-only module; overview returns a boolean.
  if(result.error)return null;return result.data?.trim()||null;
}
function aiDbError(code?:string):never{
  if(code==="P0001")throw new AiProviderError("이미 생성 중이거나 생성 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",429);
  if(code==="55000"||code==="23505")throw new AiProviderError("기록이 변경됐거나 같은 내용의 글이 있습니다. 최신 결과를 다시 열어 주세요.",409);
  if(code==="22023"||code==="23514"||code==="23503")throw new DraftInputError("글 내용·예약시간·선택한 글을 확인해 주세요.");
  if(code==="42501")throw new DraftAccessError(404);
  throw new AiProviderError("AI 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",503);
}

export async function listAiPosts(workspaceId:string,generationId:string){
  if(!isUuid(generationId))throw new DraftInputError("생성 기록을 확인해 주세요.");
  const client=await aiClient(workspaceId);
  const {data,error}=await client.from("ai_generated_posts").select("*").eq("workspace_id",workspaceId).eq("generation_id",generationId)
    .is("deleted_at",null).order("position");if(error)aiDbError(error.code);
  return data!;
}
export async function readAiGeneration(workspaceId:string,generationId:string){
  if(!isUuid(generationId))throw new DraftInputError("생성 기록을 확인해 주세요.");
  const client=await aiClient(workspaceId);
  const job=await client.from("ai_generation_jobs").select("*").eq("workspace_id",workspaceId).eq("id",generationId).maybeSingle();
  if(job.error)aiDbError(job.error.code);if(!job.data)throw new DraftAccessError(404);
  return {job:job.data,posts:await listAiPosts(workspaceId,generationId)};
}
export async function aiOverview(workspaceId:string){
  const client=await aiClient(workspaceId);
  const [jobs,templates]=await Promise.all([
    client.from("ai_generation_jobs").select("*").eq("workspace_id",workspaceId).order("created_at",{ascending:false}).limit(20),
    client.from("content_templates").select("*").eq("workspace_id",workspaceId).is("deleted_at",null).order("created_at",{ascending:false}),
  ]);
  if(jobs.error||templates.error)aiDbError(jobs.error?.code??templates.error?.code);
  const posts=jobs.data!.length?await client.from("ai_generated_posts").select("generation_id,draft_id").eq("workspace_id",workspaceId).in("generation_id",jobs.data!.map((job)=>job.id)):{data:[],error:null};
  if(posts.error)aiDbError(posts.error.code);
  const ids=posts.data!.flatMap((post)=>post.draft_id?[post.draft_id]:[]);
  const outcomes=ids.length?await client.from("drafts").select("id,publication_status").eq("workspace_id",workspaceId).in("id",ids):{data:[],error:null};
  if(outcomes.error)aiDbError(outcomes.error.code);
  const published=new Set(outcomes.data!.filter((draft)=>draft.publication_status==="published").map((draft)=>draft.id));
  return {configured:!!await aiCredential(workspaceId,client),jobs:jobs.data!.filter(job=>(job.parameters as Record<string,unknown>)?.operationKind!=="planner").map((job)=>({...job,published_count:posts.data!.filter((post)=>post.generation_id===job.id&&post.draft_id&&published.has(post.draft_id)).length})),templates:templates.data!};
}
export async function generateAi(workspaceId:string,value:unknown,operationInstruction=""){
  const input=parseAiInput(value),client=await aiClient(workspaceId);
  const credential=await aiCredential(workspaceId,client);
  if(!credential)throw new AiProviderError("AI 연결 설정이 필요합니다. 관리자에게 서버 API 키 설정을 요청해 주세요.",503);
  let instruction="";
  if(input.templateId){const builtin=BUILTIN_TEMPLATES.find((item)=>item.id===input.templateId);
    if(builtin)instruction=builtin.instruction;
    else{if(!isUuid(input.templateId))throw new DraftInputError("템플릿을 확인해 주세요.");
      const result=await client.from("content_templates").select("instruction").eq("id",input.templateId).eq("workspace_id",workspaceId).is("deleted_at",null).maybeSingle();
      if(result.error||!result.data)throw new DraftInputError("템플릿을 찾을 수 없습니다.");instruction=result.data.instruction;}}
  if(input.sourcePostId){const source=await client.from("ai_generated_posts").select("id").eq("workspace_id",workspaceId).eq("id",input.sourcePostId).is("deleted_at",null).maybeSingle();
    if(!source.data)throw new DraftInputError("다듬을 글을 찾을 수 없습니다.");}
  const {requestId,...parameters}=input;
  instruction+="\n"+operationInstruction;
  const hash=createHash("sha256").update(JSON.stringify({...parameters,operationInstruction})).digest("hex");
  const reservation=await client.rpc("reserve_ai_generation",{p_workspace_id:workspaceId,p_id:requestId,p_hash:hash,
    p_parameters:{...parameters,...(operationInstruction?{operationKind:operationInstruction.startsWith("주간 콘텐츠 기획")?"planner":"planner_posts"}:{})} as Json,p_model:aiModel()});if(reservation.error)aiDbError(reservation.error.code);
  const reserved=reservation.data as {claimed:boolean;job:AiGenerationRow};
  if(!reserved.claimed){
    if(reserved.job.status==="completed")return {job:reserved.job,posts:await listAiPosts(workspaceId,requestId)};
    throw new AiProviderError(reserved.job.status==="failed"?"이 생성 요청은 종료됐습니다. 다시 생성 버튼으로 시작해 주세요.":"이미 생성 중입니다. 잠시 후 생성 기록에서 확인해 주세요.",409);
  }
  try{
    const posts=await generateThreadsContent(input,instruction,credential,operationInstruction.startsWith("주간 콘텐츠 기획"),operationInstruction);
    const finished=await client.rpc("finish_ai_generation",{p_workspace_id:workspaceId,p_id:requestId,p_posts:posts as Json});
    if(finished.error)aiDbError(finished.error.code);
    return {job:{...reserved.job,status:"completed" as const,results:posts,completed_at:new Date().toISOString()},posts:finished.data!};
  }catch(error){
    const message=error instanceof AiProviderError||error instanceof DraftInputError?error.message:"AI 생성을 완료하지 못했습니다. 생성 기록을 확인해 주세요.";
    await client.from("ai_generation_jobs").update({status:"failed",error:message,completed_at:new Date().toISOString()})
      .eq("id",requestId).eq("workspace_id",workspaceId).eq("status","generating");
    throw error instanceof AiProviderError||error instanceof DraftInputError?error:new AiProviderError(message);
  }
}

export async function editAiPost(workspaceId:string,id:string,value:unknown){
  if(!isUuid(id)||!value||typeof value!=="object"||Array.isArray(value))throw new DraftInputError("글을 확인해 주세요.");
  const input=value as Record<string,unknown>;
  if(Object.keys(input).some((key)=>!["body","delete","expectedUpdatedAt"].includes(key))||
    (input.delete!==undefined&&input.delete!==true)||(!input.delete&&(typeof input.body!=="string"||!input.body.trim()||Array.from(input.body).length>500)))throw new DraftInputError("본문은 1~500자로 작성해 주세요.");
  const client=await aiClient(workspaceId),version=parseDeleteInput({expectedUpdatedAt:input.expectedUpdatedAt});
  const changes=input.delete?{deleted_at:new Date().toISOString()}:{body:(input.body as string).trim()};
  let query=client.from("ai_generated_posts").update(changes).eq("workspace_id",workspaceId).eq("id",id).eq("updated_at",version).is("deleted_at",null);
  if(!input.delete)query=query.is("draft_id",null);
  const result=await query.select("*").maybeSingle();if(result.error)aiDbError(result.error.code);if(!result.data)aiDbError("55000");return result.data!;
}
export async function promoteAiPosts(workspaceId:string,value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==1||!("posts" in value)||!Array.isArray(value.posts)||value.posts.length<1||value.posts.length>30)throw new DraftInputError("예약할 글을 선택해 주세요.");
  const posts=value.posts.map((val:unknown)=>{
    if(!val||typeof val!=="object"||Array.isArray(val))throw new DraftInputError("선택한 글을 확인해 주세요.");
    const input=val as Record<string,unknown>,{id,expectedUpdatedAt,draftUpdatedAt,...post}=input;
    if(typeof id!=="string"||!isUuid(id))throw new DraftInputError("글 ID를 확인해 주세요.");
    const parsed=parsePostInput(post);
    if(parsed.draftId)throw new DraftInputError("AI 글 ID로 저장해 주세요.");
    return {id,expectedUpdatedAt:parseDeleteInput({expectedUpdatedAt}),draftUpdatedAt:draftUpdatedAt?parseDeleteInput({expectedUpdatedAt:draftUpdatedAt}):null,...parsed};
  });
  if(new Set(posts.map((item)=>item.id)).size!==posts.length||posts.some((item)=>item.mode==="now")&&posts.length!==1)throw new DraftInputError("즉시 게시는 글 하나만 선택해 주세요.");
  const client=await aiClient(workspaceId),result=await client.rpc("save_categorized_posts",{p_workspace_id:workspaceId,p_posts:posts as Json,p_ai:true});
  if(result.error)aiDbError(result.error.code);return {drafts:result.data!,immediate:posts[0].mode==="now"};
}

export async function saveContentTemplate(workspaceId:string,value:unknown){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new DraftInputError("템플릿을 확인해 주세요.");
  const input=value as Record<string,unknown>;
  if(Object.keys(input).some((key)=>!["name","instruction","purpose","tone","id","expectedUpdatedAt","delete"].includes(key)))throw new DraftInputError("템플릿을 확인해 주세요.");
  const client=await aiClient(workspaceId);
  if(input.delete===true&&typeof input.id==="string"&&isUuid(input.id)){
    const result=await client.from("content_templates").update({deleted_at:new Date().toISOString()}).eq("workspace_id",workspaceId).eq("id",input.id)
      .eq("updated_at",parseDeleteInput({expectedUpdatedAt:input.expectedUpdatedAt})).is("deleted_at",null).select("*").maybeSingle();
    if(result.error)aiDbError(result.error.code);if(!result.data)aiDbError("55000");return result.data!;
  }
  if(typeof input.name!=="string"||!input.name.trim()||Array.from(input.name).length>60
    ||typeof input.instruction!=="string"||!input.instruction.trim()||Array.from(input.instruction).length>1200
    ||!AI_PURPOSES.includes(input.purpose as typeof AI_PURPOSES[number])||!AI_TONES.includes(input.tone as typeof AI_TONES[number]))throw new DraftInputError("템플릿 이름·작성 규칙·목적·말투를 확인해 주세요.");
  const fields={name:input.name.trim(),instruction:input.instruction.trim(),purpose:input.purpose as string,tone:input.tone as string};
  if(input.id){if(typeof input.id!=="string"||!isUuid(input.id))throw new DraftInputError("템플릿을 확인해 주세요.");
    const result=await client.from("content_templates").update(fields).eq("workspace_id",workspaceId).eq("id",input.id)
      .eq("updated_at",parseDeleteInput({expectedUpdatedAt:input.expectedUpdatedAt})).is("deleted_at",null).select("*").maybeSingle();
    if(result.error)aiDbError(result.error.code);if(!result.data)aiDbError("55000");return result.data!;}
  const user=await client.auth.getUser();if(!user.data.user)throw new DraftAccessError(401);
  const result=await client.from("content_templates").insert({...fields,workspace_id:workspaceId,created_by:user.data.user.id}).select("*").single();
  if(result.error)aiDbError(result.error.code);return result.data!;
}
