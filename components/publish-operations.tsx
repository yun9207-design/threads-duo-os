"use client";
import {useState} from "react";
import type {DraftRow,PublishJobEvent} from "@/lib/supabase/database.types";
import {PUBLISH_STATE_LABELS,type PublishCheck,type SimulationScenario} from "@/lib/publish-operations";
import {useProductData} from "./product-data-provider";

export function PublishSimulation({base,post,draft,onSaved,onBusy,disabled=false}:{base:string;post?:unknown;draft?:DraftRow;
 onSaved:(draft:DraftRow)=>void;onBusy?:(busy:boolean)=>void;disabled?:boolean}){
 const [busy,setBusy]=useState(false),[checks,setChecks]=useState<PublishCheck[]>([]),[status,setStatus]=useState(""),[error,setError]=useState("");
 const [scenario,setScenario]=useState<SimulationScenario>("success"),[ready,setReady]=useState(false),[open,setOpen]=useState(false);
 const value=post??{draftId:draft?.id,expectedUpdatedAt:draft?.updated_at};
 async function run(action:"inspect"|"simulate"){
  if(busy)return;setBusy(true);onBusy?.(true);setError("");
  try{
   const response=await fetch(base+"/publishing",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(action==="inspect"?{action,post:value}:post?{action,post,scenario}:{action,draftId:draft?.id,expectedUpdatedAt:draft?.updated_at,scenario}),signal:AbortSignal.timeout(30000)});
   const result=await response.json();if(!response.ok)throw new Error(result.error??"처리하지 못했습니다.");
   if(action==="inspect"){setChecks(result.checks);setStatus(result.status);setReady(result.simulationAvailable);}
   else{onSaved(result.draft);setStatus(result.draft.publish_stage==="test_completed"?"Test Publish Completed · 실제 게시 없음":result.draft.publish_next_retry_at?"TEST 재시도 대기 · 1/5/15분 간격":"TEST 확인 필요 · History에서 처리 이력 확인");setReady(false);}
  }catch(e){setError(e instanceof Error?e.message:"처리하지 못했습니다.");}
  finally{setBusy(false);onBusy?.(false);}
 }
 return <div className="publish-simulation"><button className="pro-text-link" disabled={disabled||busy} onClick={()=>setOpen(v=>!v)}>게시 시뮬레이션 {open?"접기":"열기"}</button>
  {open&&<div className="publish-simulation-panel"><p className="pro-help">검사는 읽기 전용입니다. TEST 실행은 글과 처리 이력을 저장하며 Meta에 요청하지 않습니다. 실제 계정·게시 ID·성과 데이터는 만들지 않습니다.</p>
   <button className="pro-button ghost" disabled={busy||disabled} onClick={()=>run("inspect")}>{busy?"처리 중…":"게시 준비 검사"}</button>
   {status&&<p role="status">{status}</p>}{error&&<p role="alert" className="pro-inline-error">{error}</p>}
   {checks.length>0&&<ul className="publish-check-list">{checks.map(c=><li key={c.label}><span className={"pro-badge "+(c.status==="ok"?"success":c.status==="warning"?"warning":"danger")}>{c.label}</span><span>{c.detail}</span></li>)}</ul>}
   <label className="pro-label">TEST 시나리오<select value={scenario} disabled={busy} onChange={e=>setScenario(e.target.value as SimulationScenario)}>
    <option value="success">성공 · 실제 게시 없음</option><option value="transient">일시 오류 · 자동 재시도</option><option value="permanent">권한 오류 · 격리</option><option value="ambiguous">응답 불확실 · 중복 방지 잠금</option></select></label>
   <button className="pro-button ghost" disabled={busy||disabled||!ready} onClick={()=>run("simulate")}>TEST pipeline 실행</button>
  </div>}
 </div>;
}

export function PublishTimeline({base,draft}:{base:string;draft:DraftRow}){
 const shared=useProductData(),[open,setOpen]=useState(false),[events,setEvents]=useState<PublishJobEvent[]|null>(null),[error,setError]=useState("");
 async function toggle(){
  if(open){setOpen(false);return;}setOpen(true);setError("");
  try{
   const load=async()=>{const r=await fetch(base+"/drafts/"+draft.id+"/timeline",{credentials:"same-origin",cache:"no-store",signal:AbortSignal.timeout(20000)});
    const result=await r.json();if(!r.ok)throw new Error(result.error??"처리 이력을 불러오지 못했습니다.");return result.events as PublishJobEvent[];};
   const key="publish-timeline:"+draft.id+":"+draft.updated_at;
   setEvents(shared?await shared.readResource(key,load):await load());
  }catch(e){setError(e instanceof Error?e.message:"처리 이력을 불러오지 못했습니다.");}
 }
 const fmt=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
 return <div className="publish-timeline"><button className="pro-text-link" onClick={toggle}>처리 이력 {open?"접기":"보기"}</button>
  {open&&<>{error&&<p role="alert">{error}</p>}{!events&&!error&&<p role="status">이력을 불러오는 중…</p>}
   {events&&<><p className="pro-help">작업 {draft.publish_job_id?.slice(0,8)} · 재시도는 같은 작업에 기록됩니다.</p><ol aria-label="시간순 게시 처리 이력">
    {events.map(e=><li key={e.id}><time>{fmt.format(new Date(e.created_at))} KST</time><strong>{PUBLISH_STATE_LABELS[e.to_state]??e.to_state}</strong>
     <span>{e.simulated?"시뮬레이션 · ":""}{e.mode??"작업 준비"} · 재시도 {e.retry_count}회</span>{e.summary&&<p>{e.summary}</p>}</li>)}</ol>
    {!events.length&&<p className="pro-help">운영 이력 도입 이전의 기록입니다. 다음 상태 변경부터 이력이 저장됩니다.</p>}</>}
  </>}
 </div>;
}
