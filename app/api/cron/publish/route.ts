import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { threadsIdentity,publishThreadsText,ThreadsApiError } from "@/lib/threads-api";
import type { Database,DraftRow } from "@/lib/supabase/database.types";
import { isUuid } from "@/lib/drafts-validation";
import {accountOperation,maintainThreadsAccount,threadsCredential} from "@/lib/threads-accounts";
import {syncThreadsInsights} from "@/lib/threads-insights";

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
  // Same existing worker, with account-scoped OAuth credentials and bounded
  // daily maintenance. Credentials and SQL responses never enter HTTP output.
  try { const due=await accountOperation(workspaceId,"maintenance_claim",{},client,secret);
    if(due){let ok=false;try{await maintainThreadsAccount(workspaceId,client,secret);ok=true;}finally{await accountOperation(workspaceId,"maintenance_release",{ok},client,secret);}
      // Token exchange/permission introspection gets its own invocation so a
      // slow maintenance request cannot consume the publish deadline.
      await op("heartbeat",{status:"ready",detail:"계정 유지관리 완료 · 다음 실행에서 큐 처리"});return reply({status:"maintenance"});}
  } catch { /* Token failures are visible in Accounts; don't leak diagnostics. */ }
  let credential:Awaited<ReturnType<typeof threadsCredential>>;
  try{credential=await threadsCredential(workspaceId,client,secret);}catch{
    await op("heartbeat",{status:"blocked",detail:"Meta 계정 연결 필요"});return reply({status:"blocked"});}
  if(!["connected","expiring","permission_required"].includes(credential.account.connection_status)
    ||!credential.account.token_expires_at||Date.parse(credential.account.token_expires_at)<=Date.now()
    ||!["threads_basic","threads_content_publish"].every(p=>credential.account.granted_permissions.includes(p))){
    await op("heartbeat",{status:"blocked",detail:"Threads 토큰 또는 게시 권한 확인 필요"});return reply({status:"blocked"});}
  const token=credential.token;
  const draft=await op("claim_due") as (DraftRow & {account_user_id:string})|null;
  if(!draft){let collected=0;try{collected=(await syncThreadsInsights(workspaceId,client,secret)).collected;}catch{}
    await op("heartbeat",{status:"idle",detail:collected?"예약 없음 · Insights 수집 완료":"실행할 예약 없음"});return reply({status:"idle",collected});}
  let userId:string;
  try{const identity=await threadsIdentity(token);if(identity.userId!==draft.account_user_id)throw Error();userId=identity.userId;}
  catch(error){const api=error instanceof ThreadsApiError?error:null;
    await op("failed",{error:"Threads 토큰과 연결 계정을 확인해 주세요.",retryable:true,transient:api?.transient??false,code:api?.code??"IDENTITY"},draft);
    await op("heartbeat",{status:"error",detail:"계정 확인 실패"});return reply({status:"failed",draftId:draft.id});}
  try{
    await publishThreadsText(token,userId,draft.body,{
      saveContainer:async(containerId)=>{await op("container",{container_id:containerId},draft);},
      savePublished:async(postId)=>{for(let i=0;;i++){try{await op("published",{post_id:postId},draft);return;}catch(error){if(i===2)throw error;}}},
      savePublishing:async()=>{await op("publishing",{},draft);},
      saveTest:async()=>{await op("test_completed",{},draft);},
      saveFailure:async(error,retryable,details)=>{await op("failed",{error,retryable,transient:details?.transient??false,code:details?.code??"UNKNOWN"},draft);},
    },fetch,undefined,draft.publish_mode??"TEST");
    const status=draft.publish_mode==="LIVE"?"published":"test_completed";
    await op("heartbeat",{status:"ready",detail:status==="published"?"예약 글 게시완료":"TEST 완료 · 실제 게시 없음"});return reply({status,draftId:draft.id});
  }catch{
    // Never unlock a successful/ambiguous external publish. Engine owns the failure state.
    await op("heartbeat",{status:"error",detail:"게시 오류 · History에서 확인"});return reply({status:"failed",draftId:draft.id});
  }
}
