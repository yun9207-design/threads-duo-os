import type {DraftRow, ThreadsAccountRow} from "./supabase/database.types";
import type {Category} from "./content-operations";

export type SimulationScenario="success"|"transient"|"permanent"|"ambiguous";
export type PublishCheck={label:string;status:"ok"|"warning"|"blocked";detail:string};
export const PUBLISH_STATE_LABELS:Record<string,string>={scheduled:"예약됨",queued:"게시 대기",processing:"작업 시작",
 container_created:"게시 준비",publishing:"게시 요청",published:"게시 완료",retry_wait:"재시도 대기",failed:"실패",
 needs_attention:"확인 필요",cancelled:"예약 취소",test_completed:"Test Publish Completed"};
export function publishChecks(input:{body:string;scheduledAt:string|null;accountId:string|null;categoryId?:string|null;allowDuplicate:boolean},
 drafts:DraftRow[],account:ThreadsAccountRow|null,categories:Category[],draft:DraftRow|null,now=Date.now()):PublishCheck[]{
 const normalize=(s:string)=>s.trim().replace(/\s+/g," ").toLowerCase();
 const duplicates=drafts.some(d=>d.id!==draft?.id&&normalize(d.body)===normalize(input.body));
 const unlocked=!draft||(draft.status==="approved"&&!["published","publishing"].includes(draft.publication_status)&&draft.publish_retryable);
 return [
  {label:"본문",status:input.body.trim()&&Array.from(input.body).length<=500?"ok":"blocked",detail:"1~500자 텍스트"},
  {label:"예약 시각",status:!input.scheduledAt||Date.parse(input.scheduledAt)>now?"ok":"warning",detail:input.scheduledAt?(Date.parse(input.scheduledAt)>now?"미래 예약":"예정 시각이 지났습니다. 실행 대기 여부를 확인하세요."):"즉시 실행"},
  {label:"중복",status:duplicates&&!input.allowDuplicate?"blocked":"ok",detail:duplicates?"같은 본문 존재 · 명시적 확인 필요":"중복 없음"},
  {label:"카테고리",status:!input.categoryId||categories.some(c=>c.id===input.categoryId&&!c.archived_at)?"ok":"blocked",detail:input.categoryId?"선택한 카테고리 확인":"미분류"},
  {label:"작업 잠금",status:unlocked?"ok":"blocked",detail:unlocked?"작업 생성 가능":"게시 중·완료 또는 결과 불확실 · 재실행 차단"},
  {label:"계정",status:account&&account.connection_status!=="disconnected"&&(!input.accountId||input.accountId===account.id)?"ok":"blocked",detail:account?"@"+account.username:"Meta 연결 필요"},
  {label:"게시 권한",status:account&&["threads_basic","threads_content_publish"].every(p=>account.granted_permissions.includes(p))?"ok":"blocked",detail:account?"기본 정보 · 텍스트 게시 권한":"Meta 연결 필요"},
  {label:"토큰",status:account?.token_expires_at&&Date.parse(account.token_expires_at)>now&&account.token_status==="valid"?"ok":"blocked",detail:account?"만료·유효 상태 확인":"Meta 연결 필요"},
 ];
}

export async function runPublishSimulation(scenario:SimulationScenario,step:(name:string,data?:Record<string,string|boolean>)=>Promise<unknown>){
 // No HTTP transport, token, container ID or Post ID exists in this adapter.
 if(scenario==="transient")return step("failed",{error:"[시뮬레이션] 일시적인 네트워크 오류",retryable:true,transient:true,code:"SIM_TRANSIENT"});
 if(scenario==="permanent")return step("failed",{error:"[시뮬레이션] 게시 권한이 없습니다. 설정을 확인하세요.",retryable:true,transient:false,code:"SIM_PERMISSION"});
 await step("simulate_prepare");await step("simulate_publishing");
 if(scenario==="ambiguous")return step("failed",{error:"[시뮬레이션] 최종 응답이 불확실해 재실행을 차단했습니다.",retryable:false,transient:false,code:"SIM_UNCERTAIN"});
 return step("simulate_complete");
}

export function schedulerHealth(worker:{last_run_at:string|null;status:string}|null,connected:boolean,now:number){
 const last=worker?.last_run_at?Date.parse(worker.last_run_at):NaN;
 const fresh=Number.isFinite(last)&&now-last<180000;
 return {label:!fresh?"Scheduler 실행 확인 필요":connected?"Scheduler 정상":"Scheduler 정상 · Threads 연결 대기",
  fresh,next:fresh?new Date(Math.floor(last/60000)*60000+60000).toISOString():null};
}
