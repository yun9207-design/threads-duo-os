"use client";

import { useEffect,useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import {ProductShell} from "./product-shell";
import {useProductData} from "./product-data-provider";
import { DraftApprovalHistory } from "@/components/draft-approval-history";
import { AiComposer } from "@/components/ai-composer";
import {OperationsPanel} from "@/components/content-operations";
import {ThreadsAccounts} from "@/components/threads-accounts";
import {ThreadsPerformance} from "@/components/threads-performance";
import {CsvImport} from "@/components/csv-import";
import {PublishSimulation,PublishTimeline} from "./publish-operations";
import {schedulerHealth} from "@/lib/publish-operations";
import type {PerformanceData} from "@/lib/threads-performance";
import type {OperationsData} from "@/lib/content-operations";
import type { DraftWorkspace } from "@/lib/drafts";
import type { ThreadsConnection } from "@/lib/threads-publishing";
import type { AiPostRow,Database,DraftRow } from "@/lib/supabase/database.types";
import { kstInput,kstInputToIso,scheduledDate } from "@/lib/draft-scheduling";

export type ProductView="dashboard"|"composer"|"queue"|"history"|"accounts"|"bulk"|"calendar"|"planner"|"recurring"|"categories"|"analytics";
type Worker=Database["public"]["Tables"]["queue_worker_status"]["Row"]|null;
const normalize=(value:string)=>value.trim().replace(/\s+/g," ").toLowerCase();
const isLocked=(draft:DraftRow)=>draft.publication_status==="published"||draft.publication_status==="publishing"||!draft.publish_retryable;
function badge(draft:DraftRow){
  if(draft.publish_stage==="cancelled")return {text:"예약 취소",className:"neutral"};
  if(draft.publish_stage==="test_completed")return {text:"TEST 완료 · 미게시",className:"warning"};
  if(draft.publish_needs_attention)return {text:"Needs Attention",className:"danger"};
  if(draft.publish_next_retry_at)return {text:"재시도 대기",className:"warning"};
  if(draft.publication_status==="published")return {text:"게시 성공",className:"success"};
  if(draft.publication_status==="failed")return {text:"게시 실패",className:"danger"};
  if(draft.publication_status==="publishing")return {text:"게시 중",className:"violet"};
  return draft.scheduled_at?{text:"게시 대기",className:"warning"}:{text:draft.status==="draft"?"임시저장":"게시 준비",className:"neutral"};
}
function Status({draft}:{draft:DraftRow}){const value=badge(draft);return <span className={"pro-badge "+value.className}>{value.text}</span>;}
const time=(value:string|null)=>value?scheduledDate(value):"—";
type BulkItem={id:string;body:string;date:string;time:string};

export function ProductApp({view,email,workspace,initialDrafts,initialConnection,worker,referenceTime,draftId,copyId,initialSchedule=false,initialWritingTab="manual",initialAiGeneration,initialOperations,initialPerformance={posts:[],accounts:[],truncated:false},initialFill,initialConnectionOutcome,embedded=false}:{
  view:ProductView;email:string;workspace:DraftWorkspace;initialDrafts:DraftRow[];initialConnection:ThreadsConnection;
  worker:Worker;referenceTime:string;draftId?:string;copyId?:string;initialSchedule?:boolean;initialWritingTab?:"manual"|"ai"|"multiple";initialAiGeneration?:string;
  embedded?:boolean;initialOperations:OperationsData;initialPerformance?:PerformanceData;initialFill?:boolean;initialConnectionOutcome?:string;
}){
  const shared=useProductData();
  const [localDrafts,setLocalDrafts]=useState(initialDrafts),[localOperations,setLocalOperations]=useState(initialOperations),[localPerformance,setLocalPerformance]=useState(initialPerformance);
  const drafts=shared?.snapshot?.drafts??localDrafts,setDrafts=shared?.setDrafts??setLocalDrafts;
  const operations=shared?.snapshot?.operations??localOperations,setOperations=shared?.setOperations??setLocalOperations;
  const performance=shared?.snapshot?.performance??localPerformance,setPerformance=shared?.setPerformance??setLocalPerformance;
  const [categoryFilter,setCategoryFilter]=useState("");
  const [localConnection,setLocalConnection]=useState(initialConnection),[localWorker]=useState(worker);
  const connection=shared?.snapshot?.connection??localConnection,setConnection=shared?.setConnection??setLocalConnection;
  const workerState=shared?.snapshot?shared.snapshot.worker:localWorker;
  const initial=initialDrafts.find((draft)=>draft.id===(draftId??copyId));
  const [categoryId,setCategoryId]=useState(initial?.category_id??"");
  const [editing,setEditing]=useState<DraftRow|null>(draftId?initial??null:null);
  const [writingTab,setWritingTab]=useState(initialWritingTab);
  const [aiSource,setAiSource]=useState<AiPostRow|null>(null);
  const [body,setBody]=useState(initial?.body??"");
  const [accountId,setAccountId]=useState(initial?.selected_threads_account_id??initialConnection.account?.id??"");
  const [date,setDate]=useState(initial?.scheduled_at?kstInput(initial.scheduled_at).slice(0,10):"");
  const [clock,setClock]=useState(initial?.scheduled_at?kstInput(initial.scheduled_at).slice(11):"09:00");
  const [mode,setMode]=useState<"now"|"schedule">(initialSchedule||initial?.scheduled_at?"schedule":"now");
  const [allowDuplicate,setAllowDuplicate]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [queueFilter,setQueueFilter]=useState("all");
  const [historyFilter,setHistoryFilter]=useState("all");
  const [showHidden,setShowHidden]=useState(false);
  const [deleteConfirmation,setDeleteConfirmation]=useState<string|null>(null);
  const [now,setNow]=useState(referenceTime);
  const [bulk,setBulk]=useState<BulkItem[]>([{id:"initial",body:"",date:"",time:"09:00"}]);
  const [bulkStart,setBulkStart]=useState("");
  const [bulkTime,setBulkTime]=useState("09:00");
  const [bulkGap,setBulkGap]=useState(60);
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date().toISOString()),30000);return()=>clearInterval(timer);},[]);
  const base="/api/workspaces/"+workspace.workspace.id;
  const account=connection.account;
  const canPublish=!!account&&connection.configured&&!connection.error&&account.token_status!=="invalid";
  const queue=drafts.filter((draft)=>draft.scheduled_at&&draft.publication_status!=="published")
    .sort((a,b)=>Date.parse(a.scheduled_at!)-Date.parse(b.scheduled_at!));
  const published=drafts.filter((draft)=>draft.publication_status==="published");
  const queueEntries=drafts.filter((draft)=>draft.scheduled_at||draft.publish_needs_attention||draft.publish_stage==="cancelled").sort((a,b)=>Date.parse(a.publish_next_retry_at??a.scheduled_at??a.updated_at)-Date.parse(b.publish_next_retry_at??b.scheduled_at??b.updated_at)||Date.parse(a.created_at)-Date.parse(b.created_at));
  const failures=drafts.filter((draft)=>draft.publication_status==="failed"&&!draft.publish_simulated);
  const history=drafts.filter((draft)=>["published","failed","publishing"].includes(draft.publication_status)||draft.publish_stage==="test_completed")
    .sort((a,b)=>Date.parse(b.published_at??b.publish_started_at??b.updated_at)-Date.parse(a.published_at??a.publish_started_at??a.updated_at));
  const today=kstInput(now).slice(0,10);
  const todayPublished=published.filter((draft)=>draft.published_at&&kstInput(draft.published_at).slice(0,10)===today).length;
  const next=queue.find((draft)=>!draft.publish_simulated&&draft.publication_status==="unpublished"&&draft.publish_stage!=="test_completed");
  const duplicates=body.trim()?drafts.filter((draft)=>draft.id!==editing?.id&&normalize(draft.body)===normalize(body)):[];
  const locked=!!editing&&isLocked(editing);
  const savedDrafts=drafts.filter((draft)=>!draft.scheduled_at&&draft.publication_status==="unpublished");
  const accountLabel=account?"@"+account.username:"연결할 Threads 계정";
  const workerFresh=workerState?.last_run_at&&Date.parse(now)-Date.parse(workerState.last_run_at)<180000;
  const health=schedulerHealth(workerState,canPublish,Date.parse(now));
  const retries=drafts.filter(d=>!!d.publish_next_retry_at&&!d.publish_needs_attention);
  const attention=drafts.filter(d=>d.publish_needs_attention);
  const insightPending=published.filter(d=>!performance.posts.some(s=>s.draft_id===d.id)).length;
  const operationalDrafts=drafts.filter(d=>!d.publish_simulated);
  let simulationSchedule:string|null=null;
  try{if(mode==="schedule"&&date&&clock)simulationSchedule=kstInputToIso(date+"T"+clock);}catch{}
  function queueMatch(draft:DraftRow){
    if(queueFilter==="attention")return draft.publish_needs_attention;
    if(queueFilter==="retry")return !!draft.publish_next_retry_at&&!draft.publish_needs_attention;
    if(queueFilter==="cancelled")return draft.publish_stage==="cancelled";
    if(queueFilter==="test")return draft.publish_simulated||draft.publish_stage==="test_completed";
    if(queueFilter==="all")return true;
    return draft.publish_stage!=="cancelled"&&draft.publish_stage!=="test_completed"&&draft.publication_status===queueFilter;
  }

  async function request(path:string,method="GET",payload?:unknown){
    const response=await fetch(path,{method,cache:"no-store",credentials:"same-origin",
      ...(payload===undefined?{}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),
      signal:AbortSignal.timeout(path.endsWith("/publish")||path.endsWith("/posts")?115000:20000)});
    const result=await response.json();
    if(!response.ok){
      if(result.draft){setEditing(result.draft);setDrafts((items)=>[result.draft,...items.filter((item)=>item.id!==result.draft.id)]);}
      throw new Error(result.error??"요청을 완료하지 못했습니다.");
    }return result;
  }
  function replaceDraft(draft:DraftRow){setDrafts((items)=>[draft,...items.filter((item)=>item.id!==draft.id)]);}
  async function refresh(){
    const result=await request(base+"/drafts");setDrafts(result.drafts);
    if(editing){const draft=result.drafts.find((item:DraftRow)=>item.id===editing.id);if(draft)setEditing(draft);}
  }
  async function action(callback:()=>Promise<void>){
    if(busy)return;setBusy(true);setError("");setNotice("");
    try{await callback();}catch(failure){setError(failure instanceof Error?failure.message:"처리하지 못했습니다.");
      try{await refresh();}catch{/* Keep the actionable error without retrying a mutation. */}}
    finally{setBusy(false);}
  }
  async function save(intent:"draft"|"now"|"schedule"){
    await action(async()=>{
      const categoryPayload=operations.categories.some(c=>c.id===categoryId&&c.archived_at)?{}:{categoryId:categoryId||null};
      const payload={body,mode:intent,...categoryPayload,
        ...(editing?{draftId:editing.id,expectedUpdatedAt:editing.updated_at}:{}),
        scheduledAt:intent==="schedule"?kstInputToIso(date+"T"+clock):null,accountId:accountId||null,allowDuplicate};
      let result;
      if(aiSource){const response=await request(base+"/ai/posts","POST",{posts:[{id:aiSource.id,expectedUpdatedAt:aiSource.updated_at,
        draftUpdatedAt:editing?.updated_at??null,body,mode:intent,scheduledAt:payload.scheduledAt,accountId:accountId||null,...categoryPayload,allowDuplicate}]});
        setAiSource(response.posts[0]??aiSource);result={draft:response.draft??response.drafts[0]};}
      else result=await request(base+"/posts","POST",payload);
      replaceDraft(result.draft);setEditing(result.draft);setBody(result.draft.body);
      setNotice(intent==="draft"?"임시저장했습니다. 나중에 이어서 작성할 수 있어요.":intent==="schedule"?"예약 큐에 등록했습니다. 지정 시간부터 자동 게시를 시도합니다.":result.draft.publish_stage==="test_completed"?"TEST 완료 · 실제 게시 없이 준비를 확인했습니다.":"Threads에 게시했습니다.");
    });
  }
  async function publish(draft:DraftRow){
    await action(async()=>{const result=await request(base+"/drafts/"+draft.id+"/publish","POST",{expectedUpdatedAt:draft.updated_at});
      replaceDraft(result.draft);setNotice(result.draft.publish_stage==="test_completed"?"TEST 완료 · 실제 게시되지 않았습니다.":"게시가 완료되었습니다. History에서 결과를 확인하세요.");});
  }
  async function mutate(draft:DraftRow,kind:"cancel"|"hide"|"show"){
    await action(async()=>{const result=await request(base+"/posts/"+draft.id,"PATCH",{action:kind,expectedUpdatedAt:draft.updated_at});
      replaceDraft(result.draft);setNotice(kind==="cancel"?"예약을 취소했습니다. 글은 임시 글 목록에 보존됩니다.":kind==="hide"?"게시 내역을 숨겼습니다. 숨긴 내역 보기에서 복구할 수 있어요.":"게시 내역을 다시 표시합니다.");});
  }
  async function deleteDraft(draft:DraftRow){
    if(deleteConfirmation!==draft.id){setDeleteConfirmation(draft.id);return;}
    await action(async()=>{await request(base+"/drafts/"+draft.id,"DELETE",{expectedUpdatedAt:draft.updated_at});
      setDrafts((items)=>items.filter((item)=>item.id!==draft.id));setDeleteConfirmation(null);
      if(editing?.id===draft.id){setEditing(null);setBody("");}
      setNotice("글을 삭제했습니다. 데이터는 복구 가능한 상태로 보관됩니다.");});
  }
  function distribute(){
    try{const start=Date.parse(kstInputToIso(bulkStart+"T"+bulkTime));
      setBulk((items)=>items.map((item,index)=>{const local=kstInput(new Date(start+index*bulkGap*60000).toISOString());
        return {...item,date:local.slice(0,10),time:local.slice(11)};}));setError("");
    }catch{setError("시작 날짜와 시간을 먼저 선택해 주세요.");}
  }
  async function saveBulk(intent:"draft"|"schedule"){
    await action(async()=>{const result=await request(base+"/posts","POST",{posts:bulk.map((item)=>({body:item.body,mode:intent,
      scheduledAt:intent==="schedule"?kstInputToIso(item.date+"T"+item.time):null,accountId:accountId||null,allowDuplicate}))});
      setDrafts((items)=>[...result.drafts,...items]);setBulk([{id:crypto.randomUUID(),body:"",date:"",time:"09:00"}]);
      setNotice(result.drafts.length+"개 글을 "+(intent==="schedule"?"예약 큐에 등록했습니다.":"임시저장했습니다."));});
  }
  const duplicateWarning=duplicates.length>0;
  const invalidBody=!body.trim()||Array.from(body).length>500;
  const title={dashboard:"오늘의 운영",composer:"새로운 이야기",queue:"예약 게시 큐",history:"게시 내역",accounts:"Threads 계정",bulk:"여러 글 한 번에",calendar:"콘텐츠 캘린더",planner:"이번 주 콘텐츠 계획",recurring:"꾸준한 게시 리듬",categories:"콘텐츠 카테고리",analytics:"운영 데이터 분석"}[view];
  const subtitle={dashboard:"오늘의 게시와 이번 주 준비를 한눈에 확인하세요.",composer:"생각을 글로 만들고, 원하는 순간에 전하세요.",queue:"예약한 시간에 맞춰 글을 차례로 게시합니다.",history:"게시 결과를 확인하고 다음 콘텐츠를 준비하세요.",accounts:"안전하게 계정을 연결하고 게시 준비를 마치세요.",bulk:"최대 30개 글을 편집하고 한 번에 예약하세요.",calendar:"콘텐츠 흐름을 보고, 다음 이야기를 배치하세요.",planner:"목표 하나에서 한 주의 글과 예약까지.",recurring:"콘텐츠 유형마다 원하는 요일과 시간을 지정하세요.",categories:"작성부터 게시까지 같은 분류로 관리하세요.",analytics:"실제 게시 기록으로 운영을 개선하세요."}[view];

  const content=<main className="pro-content" data-page-ready={view}><div className="pro-page-heading"><div><div className="pro-eyebrow">THREADS, IN SYNC</div><h1>{title}<span>.</span></h1><p>{subtitle}</p></div>
        {view!=="composer"&&view!=="bulk"&&<div className="pro-heading-actions"><Link className="pro-button ghost" href="/composer?mode=schedule"><Icon name="calendar" size={16}/>예약 게시</Link>
          <Link className="pro-button primary" href="/composer"><Icon name="plus" size={16}/>새 글 작성</Link></div>}</div>
      {error&&<div className="pro-feedback error" role="alert"><Icon name="warning" size={18}/>{error}</div>}
      {notice&&<div className="pro-feedback success" role="status"><Icon name="check" size={18}/>{notice}</div>}
      {!canPublish&&view!=="accounts"&&<div className="pro-connection-banner"><div><strong>Meta 계정 연결이 필요해요.</strong><p>글 작성과 예약은 지금 시작할 수 있습니다. 실제 게시는 계정 연결 후 실행됩니다.</p></div><Link href="/accounts">계정 연결 <Icon name="arrow" size={16}/></Link></div>}
      {["dashboard","analytics"].includes(view)&&<ThreadsPerformance view={view as "dashboard"|"analytics"} base={base} data={performance} drafts={operationalDrafts} categories={operations.categories} connection={connection} now={now} onChange={setPerformance}/>}

      {["dashboard","calendar","planner","recurring","categories","analytics"].includes(view)&&<OperationsPanel key={view} view={view} base={base} data={operations} performance={performance} drafts={view==="analytics"||view==="dashboard"?operationalDrafts:drafts} now={now} accountId={accountId} accountLabel={accountLabel} onChange={setOperations} onDrafts={rows=>setDrafts(items=>[...rows,...items.filter(i=>!rows.some(row=>row.id===i.id))])} initialFill={initialFill}/>}
      {view==="dashboard"&&<>
        <section className="publish-health" aria-label="자동게시 운영 상태">
          <article className="pro-card"><h3>{health.label}</h3><p>마지막 실행 <strong>{time(workerState?.last_run_at??null)}</strong></p><p>다음 검사 예정 <strong>{time(health.next)}</strong></p><p>처리 대기 {queue.filter(d=>!d.publish_simulated&&d.publication_status==="unpublished"&&d.publish_stage!=="test_completed").length} · Retry {retries.length} · Attention {attention.length}</p></article>
          <article className="pro-card"><h3>계정 & 게시 모드</h3><p><strong>{canPublish?"Threads Connected":"Threads 연결 대기"}</strong> · {account?.publishing_mode??"TEST"}</p><p>TEST 시뮬레이션은 실제 게시·성과 수치에 포함하지 않습니다.</p><Link className="pro-text-link" href="/queue">Retry / Attention 관리</Link></article>
          <article className="pro-card"><h3>게시 후 Insights</h3><p>Waiting <strong>{insightPending}</strong> · Updated <strong>{new Set(performance.posts.map(s=>s.draft_id)).size}</strong></p><p>{!account?.granted_permissions.includes("threads_manage_insights")?"Threads Insights 연결 후 제공":"실제 게시 후 +1h · 6h · 24h · 72h · 7d 수집"}</p><Link className="pro-text-link" href="/analytics">운영 데이터 보기</Link></article>
        </section>
        <section className="pro-stats" aria-label="운영 현황">{([
          ["오늘 게시",todayPublished,"한국 시간 오늘", "pen"], ["오늘 게시 예정",queue.filter((draft)=>!draft.publish_simulated&&draft.publish_stage!=="test_completed"&&draft.publication_status==="unpublished"&&kstInput(draft.scheduled_at!).slice(0,10)===today).length,"오늘 게시를 기다리는 글","calendar"],
          ["게시 성공",published.length,"전체 성공 내역","check"],["게시 실패",failures.length,"확인이 필요한 글","warning"],
        ] as const).map(([label,value,caption,icon])=><article key={label} className={"pro-stat "+(icon==="warning"&&value?"has-error":"")}><div><span>{label}</span><Icon name={icon} size={20}/></div><strong>{value}<small>건</small></strong><p>{caption}</p></article>)}</section>
        {failures.length>0&&<div className="pro-feedback error"><Icon name="warning" size={18}/><span>{failures.length}개 글의 게시가 실패했습니다.</span><Link href="/history">실패 내역 확인</Link></div>}
        <div className="pro-overview-grid"><section className="pro-card pro-next"><span className="pro-eyebrow">UP NEXT</span><h2>다음 예약 게시</h2>
          <strong className="pro-next-time">{next?time(next.scheduled_at):"다음 이야기를 준비해 보세요"}</strong>
          <p>{next?next.body:"아직 예약된 글이 없습니다. 글을 작성하고 원하는 날짜에 예약하세요."}</p>
          <div className="pro-next-footer"><span>{accountLabel}</span><Link href={next?"/queue":"/composer"}>{next?"큐 관리":"글 작성"}<Icon name="arrow" size={15}/></Link></div></section>
          <section className="pro-card"><div className="pro-card-title"><h2>계정 & 자동 게시</h2><Icon name="settings" size={18}/></div>
            <div className="pro-account-summary"><span className="pro-account-avatar">@</span><div><strong>{account?"@"+account.username:"Threads 계정 연결"}</strong><p>{canPublish?"텍스트 게시 가능":"Meta 계정 연결 필요"}</p></div></div>
            <div className="pro-detail-row"><span>예약 실행</span><span>{canPublish?(workerFresh?"1분마다 큐 확인":"실행기 상태 확인 필요"):"토큰 연결 대기"}</span></div>
            <div className="pro-detail-row"><span>최근 큐 확인</span><span>{time(workerState?.last_run_at??null)}</span></div><Link className="pro-text-link" href="/accounts">계정 관리 <Icon name="arrow" size={14}/></Link></section></div>
        <section className="pro-card"><div className="pro-card-title"><h2>최근 게시 <span>5개</span></h2><Link href="/history">전체 보기 <Icon name="arrow" size={14}/></Link></div>
          {history.slice(0,5).map((draft)=><div className="pro-recent-row" key={draft.id}><Status draft={draft}/><p>{draft.body}</p><time>{time(draft.published_at??draft.publish_started_at)}</time></div>)}
          {!history.length&&<div className="pro-empty"><Icon name="pen" size={28}/><h3>첫 게시가 여기에 기록됩니다.</h3><p>작성한 글을 게시하면 성공과 실패를 바로 확인할 수 있어요.</p><Link href="/composer">첫 글 작성 <Icon name="arrow" size={14}/></Link></div>}</section>
      </>}

      {view==="composer"&&<div className="pro-writing-tabs" role="tablist" aria-label="글 작성 방식">{([["manual","직접 작성"],["ai","AI 작성"],["multiple","대량 생성"]] as const).map(([value,label])=>
        <button key={value} role="tab" aria-selected={writingTab===value} disabled={busy} className={writingTab===value?"selected":""} onClick={()=>setWritingTab(value)}>{value!=="manual"&&<Icon name="sparkle" size={16}/>} {label}</button>)}</div>}
      {view==="composer"&&<div className="pro-card ops-composer-category"><label htmlFor="composer-category">콘텐츠 카테고리</label><select id="composer-category" value={categoryId} disabled={busy||locked} onChange={e=>setCategoryId(e.target.value)}><option value="">미분류</option>{operations.categories.filter(c=>!c.archived_at||c.id===categoryId).map(c=><option key={c.id} value={c.id} disabled={!!c.archived_at}>{c.name}{c.archived_at?" (보관)":""}</option>)}</select></div>}
      {["composer","queue"].includes(view)&&<div className={"p3-mode-banner "+(account?.publishing_mode==="LIVE"?"live":"")}><strong>{account?.publishing_mode??"TEST"}</strong> · {account?.publishing_mode==="LIVE"?"즉시 게시와 예약 실행이 실제 Threads에 게시됩니다.":"실제 게시 직전에 멈추는 테스트 모드입니다. LIVE 전환은 Accounts에서 진행하세요."}</div>}
      {view==="composer"&&writingTab!=="manual"&&<AiComposer key={writingTab} base={base} initialMode={writingTab==="multiple"?"multiple":"single"} initialGeneration={initialAiGeneration} categoryId={categoryId}
        initialBody={body} accountId={accountId} accountLabel={accountLabel} canPublish={canPublish} drafts={drafts} referenceTime={now}
        onBusy={setBusy} onSaved={(rows)=>setDrafts((items)=>[...rows,...items.filter((item)=>!rows.some((row)=>row.id===item.id))])}
        onUse={(post)=>{const linked=drafts.find((draft)=>draft.id===post.draft_id)??null;setAiSource(post);setEditing(linked);
          setBody(linked?.body??post.body);setCategoryId(linked?.category_id??categoryId);setWritingTab("manual");setAllowDuplicate(false);setNotice("AI 글을 Composer에 넣었습니다. 편집한 뒤 저장하거나 예약하세요.");
          const at=linked?.scheduled_at?kstInput(linked.scheduled_at):"";setDate(at.slice(0,10));setClock(at.slice(11)||"09:00");setMode(at?"schedule":"now");}}/>}
      {view==="composer"&&writingTab==="manual"&&<div className="pro-composer-grid"><div>
        <section className="pro-card"><div className="pro-card-title"><h2>{editing?"글 편집":"글 작성"}</h2>{editing&&<Status draft={editing}/>}</div>
          {(draftId&&!initial)&&<p className="pro-feedback error">이 글을 찾을 수 없습니다. 새 글로 작성할 수 있습니다.</p>}
          <label className="pro-label" htmlFor="post-account">게시 계정</label><select id="post-account" value={accountId} onChange={(event)=>setAccountId(event.target.value)} disabled={busy||locked}>
            <option value="">{account?"기본 Threads 계정":"계정 연결 후 기본 계정 사용"}</option>{account&&<option value={account.id}>@{account.username}</option>}</select>
          <label className="pro-label" htmlFor="post-body">본문</label><textarea id="post-body" rows={11} value={body} disabled={busy||locked}
            placeholder="어떤 이야기를 나누고 싶나요?" onChange={(event)=>{setBody(event.target.value);setAllowDuplicate(false);}}/>
          <div className={"pro-character-count "+(Array.from(body).length>500?"over":"")}><span>텍스트 게시</span><span>{Array.from(body).length} / 500자</span></div>
          {duplicateWarning&&<div className="pro-duplicate"><strong><Icon name="warning" size={15}/>같은 본문의 글이 {duplicates.length}개 있어요.</strong>
            <label><input type="checkbox" checked={allowDuplicate} onChange={(event)=>setAllowDuplicate(event.target.checked)}/>중복 내용을 확인했으며 새 글로 등록합니다.</label></div>}
          <div className="pro-mode-tabs"><button type="button" className={mode==="now"?"selected":""} onClick={()=>setMode("now")}>즉시 게시</button>
            <button type="button" className={mode==="schedule"?"selected":""} onClick={()=>setMode("schedule")}>예약 게시</button></div>
          {mode==="schedule"&&<div className="pro-date-fields"><div><label htmlFor="post-date">예약 날짜 (한국 시간)</label><input id="post-date" type="date" min={today} value={date} onChange={(event)=>setDate(event.target.value)} disabled={busy||locked}/></div>
            <div><label htmlFor="post-time">시간</label><input id="post-time" type="time" value={clock} onChange={(event)=>setClock(event.target.value)} disabled={busy||locked}/></div></div>}
          {mode==="schedule"&&<p className="pro-help">지정 시간부터 1분 간격으로 자동 게시를 시도합니다. 계정 연결 전에는 큐에서 대기합니다.</p>}
          {locked&&<p className="pro-help">게시 중이거나 결과 확인이 필요한 글입니다. 내용 변경과 재게시가 잠겨 있습니다.</p>}
          <div className="pro-composer-actions"><button className="pro-button ghost" disabled={busy||locked||invalidBody||(duplicateWarning&&!allowDuplicate)} onClick={()=>save("draft")}>임시저장</button>
            <button className="pro-button primary" disabled={busy||locked||invalidBody||(duplicateWarning&&!allowDuplicate)||(mode==="now"&&!canPublish)||(mode==="schedule"&&!date)} onClick={()=>save(mode)}>
              {busy?"처리 중…":mode==="now"?"지금 게시":"예약 등록"}<Icon name={mode==="now"?"arrow":"calendar"} size={16}/></button></div>
          {notice&&editing&&<Link className="pro-text-link" href={editing.publication_status==="published"?"/history":editing.scheduled_at?"/queue":"/composer"}>저장된 글 확인 <Icon name="arrow" size={14}/></Link>}
          <PublishSimulation base={base} disabled={busy||locked||invalidBody||(mode==="schedule"&&!simulationSchedule)} onBusy={setBusy}
            post={{body,mode,...(editing?{draftId:editing.id,expectedUpdatedAt:editing.updated_at}:{}),scheduledAt:simulationSchedule,accountId:accountId||null,categoryId:categoryId||null,allowDuplicate}}
            onSaved={draft=>{replaceDraft(draft);setEditing(draft);setBody(draft.body);setNotice("시뮬레이션 결과가 저장되었습니다. History에서 처리 이력을 확인하세요.");}}/>
        </section>
        {editing&&<section className="pro-card"><PublishTimeline base={base} draft={editing} key={"timeline"+editing.updated_at}/><DraftApprovalHistory workspaceId={workspace.workspace.id} draftId={editing.id} key={editing.id+editing.updated_at}
          actorName={(id)=>workspace.members.find((member)=>member.profile_id===id)?.profiles?.display_name??"워크스페이스 멤버"}/></section>}
        {savedDrafts.length>0&&<section className="pro-card"><div className="pro-card-title"><h2>이어서 작성하기</h2><span>{savedDrafts.length}개</span></div>{savedDrafts.map((draft)=><div className="pro-saved-row" key={draft.id}>
          <Link className="pro-draft-link" href={"/composer?draft="+draft.id}><p>{draft.body||draft.topic}</p><Icon name="arrow" size={14}/></Link>
          <button disabled={busy} className="pro-draft-delete" onClick={()=>deleteDraft(draft)}>{deleteConfirmation===draft.id?"삭제 확인":"삭제"}</button>
          {deleteConfirmation===draft.id&&<button className="pro-draft-delete" onClick={()=>setDeleteConfirmation(null)}>유지</button>}</div>)}</section>}
      </div><aside><section className="pro-card pro-preview"><span className="pro-eyebrow">LIVE PREVIEW</span><h2>게시물 미리보기</h2><div className="pro-preview-profile"><span className="pro-account-avatar">@</span><div><strong>{account?.username??"your_account"}</strong><small>방금 전</small></div><b>···</b></div>
        <p className={"pro-preview-body "+(!body?"placeholder":"")}>{body||"작성한 글이 이곳에 미리 표시됩니다. 줄바꿈도 그대로 유지돼요."}</p><div className="pro-preview-icons">♡　☏　↻　↗</div></section>
        <div className="pro-writing-tip"><Icon name="sparkle" size={18}/><h3>아이디어를 더 넓게 펼쳐보세요.</h3><p>주제 하나로 서로 다른 글을 만들고,<br/>선택한 이야기를 한 번에 예약하세요.</p><button disabled={busy} className="pro-text-link" onClick={()=>setWritingTab("ai")}>AI 작성 시작 <Icon name="arrow" size={14}/></button><Link href="/bulk">직접 여러 글 등록 <Icon name="arrow" size={14}/></Link></div></aside></div>}

      {["queue","history"].includes(view)&&<div className="ops-list-filter"><label htmlFor="list-category">카테고리</label><select id="list-category" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">전체 카테고리</option>{operations.categories.filter(c=>!c.archived_at).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
      {view==="queue"&&<>
        <div className="pro-queue-summary"><span><b>{queue.length}</b>개 글이 큐에 있어요</span><span className={"pro-badge "+(canPublish&&workerFresh?"success":"warning")}>{canPublish?(workerFresh?"자동 게시 운영 중":"실행기 상태 확인 필요"):"계정 연결 후 자동 게시"}</span>
          <button disabled={busy} onClick={()=>action(async()=>{await refresh();setNotice("최신 큐를 불러왔습니다.");})}>새로고침</button></div>
        <section className="pro-card"><div className="pro-tabs">{[["all","전체"],["unpublished","게시 대기"],["publishing","게시 중"],["published","성공"],["failed","실패"],["retry","Retry"],["attention","Needs Attention"],["cancelled","취소"],["test","TEST"]].map(([key,label])=><button key={key} className={queueFilter===key?"selected":""} onClick={()=>setQueueFilter(key)}>{label}</button>)}</div>
          <div className="pro-table-wrap"><table className="pro-table"><thead><tr><th>게시 예정</th><th>계정 / 본문</th><th>상태</th><th>관리</th></tr></thead><tbody>
            {queueEntries.filter((draft)=>(!categoryFilter||draft.category_id===categoryFilter)&&queueMatch(draft)).map((draft)=><tr key={draft.id}><td><strong>{time(draft.scheduled_at)}</strong><small>KST{draft.publication_status==="unpublished"&&Date.parse(draft.scheduled_at!)<Date.parse(now)?" · 실행 대기":""}</small></td>
              <td><small>{accountLabel} · {operations.categories.find(c=>c.id===draft.category_id)?.name??"미분류"}</small><p>{draft.body}</p>{draft.publish_error&&<span className="pro-inline-error">{draft.publish_error}</span>}</td><td><Status draft={draft}/><small>{draft.auto_publish?"자동 게시":"수동 예약"}</small></td>
              <td><span className="publish-job-detail">{draft.publish_simulated?"TEST 시뮬레이션 · ":""}재시도 {draft.publish_retry_count}회{draft.publish_next_retry_at?" · 다음 "+time(draft.publish_next_retry_at):""}{draft.publish_error_code?" · "+draft.publish_error_code:""}</span>
                {draft.publish_needs_attention&&!draft.publish_retryable&&<p className="pro-help">결과 확인 전 수정·취소·재시도 잠금</p>}
                <div className="pro-row-actions"><Link aria-disabled={isLocked(draft)} href={"/composer?draft="+draft.id}>수정</Link><button disabled={busy||isLocked(draft)||draft.publish_stage==="cancelled"} onClick={()=>mutate(draft,"cancel")}>취소</button>
                <button className="accent" disabled={busy||isLocked(draft)||!canPublish||draft.publish_simulated} onClick={()=>publish(draft)}>{draft.publication_status==="failed"?"수동 재시도":"즉시 게시"}</button></div>
                <PublishSimulation base={base} draft={draft} disabled={busy||isLocked(draft)||!!draft.publish_next_retry_at} onBusy={setBusy} onSaved={replaceDraft}/>
                <PublishTimeline base={base} draft={draft} key={draft.updated_at}/></td></tr>)}
          </tbody></table></div>
          {!queueEntries.length&&<div className="pro-empty"><Icon name="calendar" size={30}/><h3>예약한 글이 아직 없어요.</h3><p>글을 작성하고 게시할 날짜와 시간을 지정해 보세요.</p><Link href="/composer?mode=schedule">첫 예약 만들기 <Icon name="arrow" size={14}/></Link></div>}
        </section></>}

      {view==="history"&&<section className="pro-card"><div className="pro-card-title"><div className="pro-tabs">{[["all","전체"],["published","성공"],["failed","실패"],["test","TEST"]].map(([key,label])=><button key={key} className={historyFilter===key?"selected":""} onClick={()=>setHistoryFilter(key)}>{label}</button>)}</div>
        <label className="pro-check-label"><input type="checkbox" checked={showHidden} onChange={(event)=>setShowHidden(event.target.checked)}/>숨긴 내역 보기</label></div>
        {history.filter((draft)=>(showHidden||!draft.history_hidden_at)&&(!categoryFilter||draft.category_id===categoryFilter)&&(historyFilter==="all"||draft.publication_status===historyFilter||historyFilter==="test"&&draft.publish_stage==="test_completed")).map((draft)=><article className={"pro-history-item "+(draft.history_hidden_at?"hidden-item":"")} key={draft.id}>
          <div className="pro-history-top"><div><Status draft={draft}/><span>{accountLabel} · {operations.categories.find(c=>c.id===draft.category_id)?.name??"미분류"}</span>{draft.history_hidden_at&&<small>숨김</small>}</div><time>{time(draft.published_at??draft.publish_started_at??draft.updated_at)} KST</time></div>
          <p className="pro-history-body">{draft.body}</p>{draft.threads_post_id&&<p className="pro-post-id">Threads Post ID <code>{draft.threads_post_id}</code></p>}
          {draft.publish_error&&<div className="pro-feedback error">{draft.publish_error}</div>}<p className="pro-help">{draft.publish_mode??"—"} · {draft.publish_stage} · 재시도 {draft.publish_retry_count}회{draft.publish_error_code?" · 오류 "+draft.publish_error_code:""}{draft.publish_next_retry_at?" · 다음 시도 "+time(draft.publish_next_retry_at):""}</p>{draft.threads_container_id&&<p className="pro-post-id">Container ID <code>{draft.threads_container_id}</code></p>}
          {!draft.publish_retryable&&draft.publication_status==="failed"&&<p className="pro-help">결과가 불확실해 자동 재시도를 차단했습니다. Threads에서 실제 게시 여부를 확인해야 합니다.</p>}
          <PublishTimeline base={base} draft={draft} key={draft.updated_at}/>
          <div className="pro-row-actions">{draft.publication_status==="failed"&&<button className="accent" disabled={busy||!draft.publish_retryable||!canPublish||draft.publish_simulated} onClick={()=>publish(draft)}>재시도</button>}
            {draft.publication_status==="failed"&&draft.publish_retryable&&<Link href={"/composer?draft="+draft.id}>수정 후 재시도</Link>}
            <Link href={"/composer?copy="+draft.id}>새 글로 다시 게시</Link><button onClick={()=>action(async()=>{await navigator.clipboard.writeText(draft.body);setNotice("본문을 복사했습니다.");})}>복사</button>
            <button disabled={busy} onClick={()=>mutate(draft,draft.history_hidden_at?"show":"hide")}>{draft.history_hidden_at?"다시 표시":"숨김"}</button></div>
        </article>)}
        {!history.filter((draft)=>showHidden||!draft.history_hidden_at).length&&<div className="pro-empty"><Icon name="clock" size={30}/><h3>게시 내역이 아직 없어요.</h3><p>게시가 끝나면 성공·실패와 Threads ID를 이곳에서 확인할 수 있습니다.</p></div>}
      </section>}

      {view==="accounts"&&<ThreadsAccounts outcome={initialConnectionOutcome} connection={connection} workspaceId={workspace.workspace.id} owner={workspace.role==="owner"} onChange={value=>{setConnection(value);setAccountId(value.account?.id??"");}}/>}

      {view==="bulk"&&<>
        <CsvImport base={base} onBusy={setBusy} onSaved={rows=>setDrafts(items=>[...rows,...items.filter(item=>!rows.some(row=>row.id===item.id))])}/>
        <section className="pro-card"><div className="pro-card-title"><h2>일괄 예약 설정</h2><span>{bulk.length} / 30개</span></div>
          <div className="pro-bulk-settings"><div><label htmlFor="bulk-start">시작 날짜 (KST)</label><input id="bulk-start" type="date" min={today} value={bulkStart} onChange={(event)=>setBulkStart(event.target.value)}/></div>
            <div><label htmlFor="bulk-clock">시작 시간</label><input id="bulk-clock" type="time" value={bulkTime} onChange={(event)=>setBulkTime(event.target.value)}/></div>
            <div><label htmlFor="bulk-gap">게시 간격</label><select id="bulk-gap" value={bulkGap} onChange={(event)=>setBulkGap(Number(event.target.value))}><option value={30}>30분</option><option value={60}>1시간</option><option value={120}>2시간</option><option value={1440}>하루</option></select></div>
            <button className="pro-button ghost" disabled={busy||!bulkStart} onClick={distribute}>시간 일괄 지정</button></div>
          <div className="pro-bulk-toolbar"><button onClick={()=>setBulk((items)=>items.length>=30?items:[...items,{id:crypto.randomUUID(),body:"",date:"",time:"09:00"}])} disabled={busy||bulk.length>=30}>+ 글 추가</button>
            <button disabled={busy||bulk.length>=30} onClick={()=>setBulk((items)=>[...items,...Array.from({length:Math.min(10,30-items.length)},()=>({id:crypto.randomUUID(),body:"",date:"",time:"09:00"}))])}>+ 빈 글 10개</button><span>각 글을 편집한 뒤 전체 저장 또는 예약하세요.</span></div>
        </section>
        <div className="pro-bulk-grid">{bulk.map((item,index)=><section className="pro-card pro-bulk-item" key={item.id}><div className="pro-card-title"><h2><span className="pro-number">{index+1}</span>글 {index+1}</h2>
          <button aria-label={"글 "+(index+1)+" 제거"} disabled={busy||bulk.length===1} onClick={()=>setBulk((items)=>items.filter((row)=>row.id!==item.id))}>제거</button></div>
          <label className="pro-sr-only" htmlFor={"bulk-body-"+item.id}>글 {index+1} 본문</label><textarea id={"bulk-body-"+item.id} rows={5} value={item.body} placeholder="본문을 작성하세요." disabled={busy}
            onChange={(event)=>setBulk((items)=>items.map((row)=>row.id===item.id?{...row,body:event.target.value}:row))}/><div className="pro-character-count"><span>텍스트</span><span>{Array.from(item.body).length} / 500자</span></div>
          <div className="pro-date-fields"><div><label htmlFor={"bulk-date-"+item.id}>글 {index+1} 예약 날짜</label><input id={"bulk-date-"+item.id} type="date" value={item.date} min={today} onChange={(event)=>setBulk((items)=>items.map((row)=>row.id===item.id?{...row,date:event.target.value}:row))}/></div>
            <div><label htmlFor={"bulk-time-"+item.id}>시간</label><input id={"bulk-time-"+item.id} type="time" value={item.time} onChange={(event)=>setBulk((items)=>items.map((row)=>row.id===item.id?{...row,time:event.target.value}:row))}/></div></div></section>)}</div>
        <div className="pro-bulk-save"><label className="pro-check-label"><input type="checkbox" checked={allowDuplicate} onChange={(event)=>setAllowDuplicate(event.target.checked)}/>중복 내용을 확인하고 등록</label>
          <button className="pro-button ghost" disabled={busy||bulk.some((item)=>!item.body.trim()||Array.from(item.body).length>500)} onClick={()=>saveBulk("draft")}>전체 임시저장</button>
          <button className="pro-button primary" disabled={busy||bulk.some((item)=>!item.body.trim()||Array.from(item.body).length>500||!item.date)} onClick={()=>saveBulk("schedule")}>{busy?"등록 중…":"전체 예약"}<Icon name="calendar" size={16}/></button></div>
      </>}
      <footer className="pro-footer"><span>Threads Duo OS · Built for your next story.</span><span>한국 시간 KST · {workspace.members.length}명의 workspace</span></footer>
      </main>;
  return embedded?content:<ProductShell view={view} email={email} workspace={workspace} queueCount={queue.length} canPublish={canPublish}>{content}</ProductShell>;
}
