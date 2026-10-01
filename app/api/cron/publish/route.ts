import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { threadsIdentity,publishThreadsText } from "@/lib/threads-api";
import type { Database,DraftRow } from "@/lib/supabase/database.types";
import { isUuid } from "@/lib/drafts-validation";

export const runtime="nodejs";
export const maxDuration=120;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function workerBody(request:Request){
  const reader=request.body?.getReader();if(!reader)throw Error("Invalid request");
  const chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const next=await reader.read();if(next.done)break;
    length+=next.value.byteLength;if(length>512){await reader.cancel();throw Error("Invalid request");}chunks.push(next.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(bytes);
}

export async function POST(request:Request){
  const secret=request.headers.get("authorization")?.replace(/^Bearer /,"");
  if(!secret || !/^[A-Za-z0-9_-]{43,}$/.test(secret))return reply({error:"Unauthorized"},401);
  let workspaceId:string;
  try{workspaceId=JSON.parse(await workerBody(request)).workspaceId;if(!isUuid(workspaceId))throw Error();}
  catch{return reply({error:"Invalid request"},400);}
  const config=getSupabaseConfig();if(!config)return reply({error:"Worker unavailable"},503);
  const client=createClient<Database>(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
  const op=async(operation:string,data:Record<string,string|boolean>={},draft?:DraftRow)=>{
    const result=await client.rpc("product_worker_operation",{p_workspace_id:workspaceId,p_secret:secret,
      p_operation:operation,p_draft_id:draft?.id,p_attempt_id:draft?.publish_attempt_id ?? undefined,p_data:data});
    if(result.error)throw Error(result.error.code==="42501"?"Unauthorized":"Worker result unavailable");
    return result.data;
  };
  try{await op("heartbeat",{status:"checking",detail:"예약 큐 확인"});}
  catch{return reply({error:"Unauthorized"},401);}
  const token=process.env.THREADS_ACCESS_TOKEN?.trim();
  if(!token || process.env.THREADS_WORKSPACE_ID!==workspaceId){
    await op("heartbeat",{status:"blocked",detail:"Meta 계정 연결 필요"});return reply({status:"blocked",reason:"Meta 계정 연결 필요"});
  }
  const draft=await op("claim_due") as (DraftRow & {account_user_id:string})|null;
  if(!draft){await op("heartbeat",{status:"idle",detail:"실행할 예약 없음"});return reply({status:"idle"});}
  let userId:string;
  try{const identity=await threadsIdentity(token);if(identity.userId!==draft.account_user_id)throw Error();userId=identity.userId;}
  catch{await op("failed",{error:"Threads 토큰과 연결 계정을 확인해 주세요.",retryable:true},draft);
    await op("heartbeat",{status:"error",detail:"계정 확인 실패"});return reply({status:"failed",draftId:draft.id});}
  try{
    await publishThreadsText(token,userId,draft.body,{
      saveContainer:async(containerId)=>{await op("container",{container_id:containerId},draft);},
      savePublished:async(postId)=>{for(let i=0;;i++){try{await op("published",{post_id:postId},draft);return;}catch(error){if(i===2)throw error;}}},
      saveFailure:async(error,retryable)=>{await op("failed",{error,retryable},draft);},
    });
    await op("heartbeat",{status:"ready",detail:"예약 글 게시완료"});return reply({status:"published",draftId:draft.id});
  }catch{
    // Never unlock a successful/ambiguous external publish. Engine owns the failure state.
    await op("heartbeat",{status:"error",detail:"게시 오류 · History에서 확인"});return reply({status:"failed",draftId:draft.id});
  }
}
