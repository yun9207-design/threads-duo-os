import "server-only";
import {createClient} from "./supabase/server";
import {readWorkspace,WorkspaceAccessError} from "./workspaces";
import {DraftAccessError,listDrafts} from "./drafts";
import {DraftInputError,isUuid,parseDeleteInput} from "./drafts-validation";
import {parsePostInput} from "./product-data";
import {threadsServerSecret} from "./threads-accounts";
import {PublishingError} from "./threads-publishing";
import {publishChecks,runPublishSimulation,type SimulationScenario} from "./publish-operations";
import type {Database,DraftRow,Json} from "./supabase/database.types";
import type {SupabaseClient} from "@supabase/supabase-js";

async function context(workspaceId:string){
 const db=await createClient();if(!db)throw new WorkspaceAccessError(503);
 const {data,error}=await db.auth.getUser();if(error||!data.user)throw new WorkspaceAccessError(401);
 await readWorkspace(workspaceId,{client:db,userId:data.user.id});return {client:db,userId:data.user.id};
}
export async function inspectPublish(workspaceId:string,value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value))throw new DraftInputError("검사할 글을 확인해 주세요.");
 const verified=await context(workspaceId),db=verified.client,raw=value as Record<string,unknown>;
 const [drafts,accounts,categories]=await Promise.all([
  listDrafts(workspaceId,verified),
  db.from("threads_accounts").select("*").eq("workspace_id",workspaceId),
  db.from("content_categories").select("*").eq("workspace_id",workspaceId)]);
 if(accounts.error||categories.error)throw new DraftAccessError(503);
 let draft:DraftRow|null=null;
 if(raw.draftId){if(typeof raw.draftId!=="string"||!isUuid(raw.draftId))throw new DraftAccessError(404);draft=drafts.find(d=>d.id===raw.draftId)??null;if(!draft)throw new DraftAccessError(404);
  if(raw.expectedUpdatedAt!==draft.updated_at)throw new DraftAccessError(409);}
 const input=raw.body===undefined&&draft?{body:draft.body,scheduledAt:draft.scheduled_at,accountId:draft.selected_threads_account_id,
  categoryId:draft.category_id,allowDuplicate:false}:parsePostInput(raw);
 const checks=publishChecks(input,drafts,accounts.data[0]??null,categories.data,draft);
 return {status:!accounts.data.length?"Meta 연결 필요":checks.some(c=>c.status==="blocked")?"설정 확인 필요":"게시 준비 완료",checks,
  simulationAvailable:checks.slice(0,5).every(c=>c.status!=="blocked"),externalPublish:false};
}
export async function simulatePublish(workspaceId:string,draftId:string,version:string,scenario:SimulationScenario){
 if(!isUuid(draftId))throw new DraftAccessError(404);parseDeleteInput({expectedUpdatedAt:version});
 if(!["success","transient","permanent","ambiguous"].includes(scenario))throw new DraftInputError("시뮬레이션 유형을 확인해 주세요.");
 const {client:db}=await context(workspaceId),secret=threadsServerSecret(workspaceId);
 const claim=await db.rpc("threads_publish_operation",{p_workspace_id:workspaceId,p_secret:secret,p_operation:"simulate_claim",
  p_draft_id:draftId,p_expected_updated_at:version,p_data:{scenario}});
 if(claim.error)throw new PublishingError("글이 변경됐거나 실행 중·완료·재시도 대기 상태입니다. 최신 글에서 다시 확인하세요.",409);
 return runClaimedSimulation(db,workspaceId,secret,claim.data as DraftRow,scenario);
}
export async function simulateProductPost(workspaceId:string,value:unknown,scenario:SimulationScenario){
 const post=parsePostInput(value);if(post.mode==="draft")throw new DraftInputError("즉시 또는 예약 모드로 검사해 주세요.");
 const {client:db}=await context(workspaceId),secret=threadsServerSecret(workspaceId);
 const claim=await db.rpc("save_publish_simulation",{p_workspace_id:workspaceId,p_secret:secret,p_post:JSON.parse(JSON.stringify(post)) as Json,p_scenario:scenario});
 if(claim.error)throw new PublishingError(claim.error.code==="23505"?"같은 본문의 글이 있습니다. 중복 확인 후 다시 실행하세요.":"글이 변경됐거나 작업 준비가 되지 않았습니다. 최신 글에서 다시 확인하세요.",409);
 return runClaimedSimulation(db,workspaceId,secret,claim.data as DraftRow,scenario);
}
async function runClaimedSimulation(db:SupabaseClient<Database>,workspaceId:string,secret:string,claimed:DraftRow,scenario:SimulationScenario){
 const result=await runPublishSimulation(scenario,async(operation,data)=>{
  const result=await db.rpc("threads_publish_operation",{p_workspace_id:workspaceId,p_secret:secret,p_operation:operation,
   p_draft_id:claimed.id,p_attempt_id:claimed.publish_attempt_id!,p_data:data??{}});
  if(result.error)throw new PublishingError("시뮬레이션 단계 저장이 중단됐습니다. 잠금 상태를 확인해 주세요.");return result.data;
 });
 return result as DraftRow;
}
export async function publishTimeline(workspaceId:string,draftId:string){
 if(!isUuid(draftId))throw new DraftAccessError(404);const {client:db}=await context(workspaceId);
 const events=await db.from("publish_job_events").select("*").eq("workspace_id",workspaceId).eq("draft_id",draftId)
  .order("created_at").order("id").limit(500);
 if(events.error)throw new DraftAccessError(503);return events.data;
}
