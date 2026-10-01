"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { Icon } from "./icon";
import { AI_ACTIONS,AI_PURPOSES,AI_TONES,BUILTIN_TEMPLATES,distributeAiSchedule,type AiAction,type AiMode } from "@/lib/ai-content";
import { kstInput,kstInputToIso,scheduledDate } from "@/lib/draft-scheduling";
import type { AiGenerationRow,AiPostRow,ContentTemplateRow,DraftRow } from "@/lib/supabase/database.types";

type Result=AiPostRow&{selected:boolean;date:string;time:string};
type Props={base:string;initialMode?:AiMode;initialGeneration?:string;initialBody:string;accountId:string;accountLabel:string;canPublish:boolean;drafts:DraftRow[];categoryId?:string;
  referenceTime:string;onUse:(post:AiPostRow)=>void;onSaved:(drafts:DraftRow[])=>void;onBusy:(value:boolean)=>void};
const asResult=(post:AiPostRow,drafts:DraftRow[]):Result=>{const draft=drafts.find((row)=>row.id===post.draft_id);
  const at=draft?.scheduled_at?kstInput(draft.scheduled_at):"";return {...post,body:draft?.body??post.body,selected:!post.draft_id,date:at.slice(0,10),time:at.slice(11)||"10:00"};};

export function AiComposer({base,initialMode="single",initialGeneration,initialBody,accountId,accountLabel,canPublish,drafts,referenceTime,onUse,onSaved,onBusy,categoryId}:Props){
  const [topic,setTopic]=useState(initialBody.split("\n")[0].slice(0,180));
  const [keyPoints,setKeyPoints]=useState("");const [audience,setAudience]=useState("");
  const [purpose,setPurpose]=useState<string>(AI_PURPOSES[0]),[tone,setTone]=useState<string>(AI_TONES[0]);
  const [generationMode,setGenerationMode]=useState<AiMode>(initialMode),[count,setCount]=useState(initialMode==="single"?1:10);
  const [configured,setConfigured]=useState<boolean|null>(null),[jobs,setJobs]=useState<(AiGenerationRow&{published_count?:number})[]>([]);
  const [templates,setTemplates]=useState<ContentTemplateRow[]>([]),[templateId,setTemplateId]=useState("");
  const [results,setResults]=useState<Result[]>([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
  const [toolsId,setToolsId]=useState<string|null>(null),[allowDuplicate,setAllowDuplicate]=useState(false);
  const [startDate,setStartDate]=useState(""),[endDate,setEndDate]=useState(""),[perDay,setPerDay]=useState(5);
  const [startTime,setStartTime]=useState("10:00"),[endTime,setEndTime]=useState("22:00");
  const [templateName,setTemplateName]=useState(""),[templateInstruction,setTemplateInstruction]=useState("");
  const today=kstInput(referenceTime).slice(0,10),selected=results.filter((post)=>post.selected);
  const allTemplates=[...BUILTIN_TEMPLATES,...templates];
  const allowedCounts=generationMode==="single"?[1]:generationMode==="series"?[3,5,7,10,15,30]:[1,3,5,10,20,30];
  const counts=generationMode==="multiple"&&!allowedCounts.includes(count)?[...allowedCounts,count].sort((a,b)=>a-b):allowedCounts;

  async function request(path:string,method="GET",payload?:unknown){
    const response=await fetch(path,{method,cache:"no-store",credentials:"same-origin",
      ...(payload===undefined?{}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),
      signal:AbortSignal.timeout(method==="POST"&&path===base+"/ai"?175000:140000)});
    const data=await response.json();
    if(!response.ok){if(data.draft)onSaved([data.draft]);throw new Error(data.error??"요청을 완료하지 못했습니다.");}return data;
  }
  useEffect(()=>{
    const controller=new AbortController();
    fetch(base+"/ai",{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])})
      .then(async(response)=>{const data=await response.json();if(!response.ok)throw new Error(data.error??"AI 기록을 불러오지 못했습니다.");
        if(!controller.signal.aborted){setConfigured(data.configured);setJobs(data.jobs);setTemplates(data.templates);}})
      .catch((failure)=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:"AI 기록을 불러오지 못했습니다.");});
    return()=>controller.abort();
  },[base]);
  useEffect(()=>{
    if(!initialGeneration)return;
    const controller=new AbortController();
    fetch(base+"/ai?generation="+encodeURIComponent(initialGeneration),{cache:"no-store",signal:controller.signal})
      .then(async(response)=>{const data=await response.json();if(!response.ok)throw new Error(data.error??"생성 기록을 불러오지 못했습니다.");
        if(controller.signal.aborted)return;const job=data.job as AiGenerationRow,params=job.parameters as Record<string,unknown>;
        setResults(data.posts.map((item:AiPostRow)=>asResult(item,drafts)));setTopic(job.topic);setPurpose(job.purpose);setTone(job.tone);
        setKeyPoints(typeof params.keyPoints==="string"?params.keyPoints:"");setAudience(typeof params.audience==="string"?params.audience:"");
        setGenerationMode(job.mode);setCount(job.post_count);setTemplateId(typeof params.templateId==="string"?params.templateId:"");
        setNotice("저장된 생성 결과를 불러왔습니다. 예약된 글은 Composer에서 수정할 수 있습니다.");})
      .catch((failure)=>{if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:"생성 기록을 불러오지 못했습니다.");});
    return()=>controller.abort();
  },[base,initialGeneration,drafts]);
  async function reloadHistory(){const data=await request(base+"/ai");setConfigured(data.configured);setJobs(data.jobs);setTemplates(data.templates);}
  async function action(callback:()=>Promise<void>){if(busy)return;setBusy(true);onBusy(true);setError("");setNotice("");
    try{await callback();}catch(failure){setError(failure instanceof Error?failure.message:"처리하지 못했습니다.");}
    finally{setBusy(false);onBusy(false);}}
  const update=(id:string,changes:Partial<Result>)=>setResults((items)=>items.map((item)=>item.id===id?{...item,...changes}:item));
  function changeMode(value:AiMode){setGenerationMode(value);setCount(value==="single"?1:value==="series"?7:10);}
  function selectTemplate(id:string){setTemplateId(id);const template=allTemplates.find((item)=>item.id===id);
    if(template){setPurpose(template.purpose);setTone(template.tone);}}
  async function generate(actionName:AiAction="generate",post?:Result){
    await action(async()=>{
      const single=!!post||!["generate","regenerate"].includes(actionName);
      const data=await request(base+"/ai","POST",{requestId:crypto.randomUUID(),topic,keyPoints,audience,purpose,tone,templateId,
        mode:single?"single":generationMode,count:single?1:count,action:actionName,
        sourceBody:post?.body??(single?initialBody:""),sourcePostId:post?.id??null});
      const rows=(data.posts as AiPostRow[]).map((item)=>asResult(item,drafts));
      setResults((items)=>post?[...rows,...items.map((item)=>item.id===post.id?{...item,selected:false}:item)]:rows);
      setJobs((items)=>[data.job,...items.filter((job)=>job.id!==data.job.id)].slice(0,20));
      setNotice(rows.length+"개 글을 생성하고 DB에 저장했습니다. 내용을 확인한 뒤 선택해 주세요.");
    });
  }
  async function edit(post:Result,remove=false){
    await action(async()=>{const data=await request(base+"/ai/posts/"+post.id,"PATCH",{expectedUpdatedAt:post.updated_at,...(remove?{delete:true}:{body:post.body})});
      if(remove)setResults((items)=>items.filter((item)=>item.id!==post.id));else update(post.id,data.post);
      setNotice(remove?"생성 목록에서 제외했습니다. 원래 생성 기록과 예약된 글은 보존됩니다.":"수정한 본문을 저장했습니다.");});
  }
  function distribute(){try{
    const times=distributeAiSchedule(selected.length,{startDate,endDate,perDay,startTime,endTime});let index=0;
    setResults((items)=>items.map((item)=>{if(!item.selected)return item;const local=kstInput(times[index++]);return {...item,date:local.slice(0,10),time:local.slice(11)};}));
    setError("");setNotice(selected.length+"개 글에 시간을 배분했습니다. 각 시간을 수정한 뒤 전체 예약을 누르세요.");
  }catch(failure){setError(failure instanceof Error?failure.message:"시간대를 확인해 주세요.");}}
  async function promote(items:Result[],intent:"draft"|"schedule"|"now"){
    await action(async()=>{
      const data=await request(base+"/ai/posts","POST",{posts:items.map((item)=>({id:item.id,expectedUpdatedAt:item.updated_at,
        draftUpdatedAt:drafts.find((draft)=>draft.id===item.draft_id)?.updated_at??null,body:item.body,mode:intent,
        scheduledAt:intent==="schedule"?kstInputToIso(item.date+"T"+item.time):null,accountId:accountId||null,categoryId:categoryId||null,allowDuplicate}))});
      const saved=data.draft?[data.draft]:data.drafts;onSaved(saved);
      const updated=new Map<string,AiPostRow>(data.posts.map((item:AiPostRow)=>[item.id,item]));
      setResults((rows)=>rows.map((item)=>updated.has(item.id)?{...item,...updated.get(item.id)!,selected:false}:item));
      setNotice(items.length+"개 글을 "+(intent==="schedule"?"예약 큐에 등록했습니다.":intent==="now"?"Threads에 게시했습니다.":"Composer에 임시저장했습니다."));
    });
  }
  async function saveTemplate(){
    await action(async()=>{const data=await request(base+"/ai/templates","POST",{name:templateName,instruction:templateInstruction,purpose,tone});
      setTemplates((items)=>[data.template,...items]);selectTemplate(data.template.id);setTemplateId(data.template.id);
      setTemplateName("");setTemplateInstruction("");setNotice("워크스페이스 템플릿을 저장했습니다.");});
  }
  async function removeTemplate(template:ContentTemplateRow){
    await action(async()=>{await request(base+"/ai/templates","POST",{id:template.id,expectedUpdatedAt:template.updated_at,delete:true});
      setTemplates((items)=>items.filter((item)=>item.id!==template.id));if(templateId===template.id)setTemplateId("");setNotice("템플릿을 목록에서 제외했습니다.");});
  }
  const invalid=(post:Result)=>!post.body.trim()||Array.from(post.body).length>500;
  return <div className="ai-studio">
    {configured===false&&<div className="pro-feedback warning" role="status"><Icon name="sparkle" size={18}/><div><strong>AI 연결 준비 중</strong><p>관리자가 서버 API 키를 연결하면 바로 생성할 수 있어요. 기존 작성·예약은 계속 사용할 수 있습니다.</p></div></div>}
    {error&&<div className="pro-feedback error" role="alert">{error}</div>}
    {notice&&<div className="pro-feedback success" role="status">{notice}</div>}
    <div className="ai-studio-inputs"><section className="pro-card ai-brief"><div className="pro-card-title"><div><span className="pro-eyebrow">YOUR IDEA, MANY STORIES</span><h2>하나의 주제에서 시작하세요.</h2></div><Icon name="sparkle" size={22}/></div>
      <label htmlFor="ai-topic">주제 <span className="ai-required">필수</span></label><input id="ai-topic" value={topic} maxLength={180} placeholder="예: 초보자를 위한 AI 활용법" disabled={busy} onChange={(event)=>setTopic(event.target.value)}/>
      <details className="ai-details"><summary>핵심 내용과 독자 더하기</summary><label htmlFor="ai-points">핵심 내용</label><textarea id="ai-points" rows={3} value={keyPoints} maxLength={2000} placeholder="꼭 담을 사실, 실제 경험, 링크 등을 알려 주세요." disabled={busy} onChange={(event)=>setKeyPoints(event.target.value)}/>
        <label htmlFor="ai-audience">타깃 독자</label><input id="ai-audience" value={audience} maxLength={200} placeholder="예: AI를 업무에 처음 쓰는 직장인" disabled={busy} onChange={(event)=>setAudience(event.target.value)}/></details>
      <div className="ai-field-grid"><div><label htmlFor="ai-purpose">목적</label><select id="ai-purpose" value={purpose} disabled={busy} onChange={(event)=>setPurpose(event.target.value)}>{AI_PURPOSES.map((item)=><option key={item}>{item}</option>)}</select></div>
        <div><label htmlFor="ai-tone">말투</label><select id="ai-tone" value={tone} disabled={busy} onChange={(event)=>setTone(event.target.value)}>{AI_TONES.map((item)=><option key={item}>{item}</option>)}</select></div></div>
      <label htmlFor="ai-template">콘텐츠 템플릿</label><select id="ai-template" value={templateId} disabled={busy} onChange={(event)=>selectTemplate(event.target.value)}><option value="">자유롭게 작성</option>
        <optgroup label="기본 템플릿">{BUILTIN_TEMPLATES.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
        {!!templates.length&&<optgroup label="우리 템플릿">{templates.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}</select>
      {templateId&&<p className="pro-help">{allTemplates.find((item)=>item.id===templateId)?.instruction}</p>}
      <details className="ai-details"><summary>우리 템플릿 저장·관리</summary><label htmlFor="ai-template-name">템플릿 이름</label><input id="ai-template-name" value={templateName} maxLength={60} disabled={busy} onChange={(event)=>setTemplateName(event.target.value)} placeholder="예: 우리 브랜드의 작은 팁"/>
        <label htmlFor="ai-template-instruction">작성 규칙</label><textarea id="ai-template-instruction" value={templateInstruction} maxLength={1200} rows={3} disabled={busy} onChange={(event)=>setTemplateInstruction(event.target.value)} placeholder="예: 한 가지 팁, 짧은 사례, 독자에게 질문. 과장 없이 담백하게."/>
        <p className="pro-help">현재 목적과 말투도 함께 저장됩니다.</p><button className="pro-button ghost" disabled={busy||!templateName.trim()||!templateInstruction.trim()} onClick={saveTemplate}>템플릿 저장</button>
        {templates.map((item)=><div className="ai-template-row" key={item.id}><span>{item.name}</span><button disabled={busy} onClick={()=>removeTemplate(item)}>제외</button></div>)}</details>
    </section><section className="pro-card ai-generation-settings"><span className="pro-eyebrow">MADE FOR THREADS</span><h2>어떤 흐름으로 만들까요?</h2>
      <div className="pro-mode-tabs" aria-label="AI 생성 모드">{[["single","한 개 글"],["multiple","여러 버전"],["series","시리즈 만들기"]].map(([value,label])=><button key={value} className={generationMode===value?"selected":""} disabled={busy} onClick={()=>changeMode(value as AiMode)}>{label}</button>)}</div>
      <p className="pro-help">{generationMode==="series"?"기초부터 응용까지 이어지는 Day별 콘텐츠를 만듭니다.":generationMode==="multiple"?"같은 주제도 서로 다른 관점과 후킹으로 풀어냅니다.":"짧은 후킹과 자연스러운 문장으로 한 가지 이야기를 전합니다."}</p>
      <label htmlFor="ai-count">생성 개수</label><select id="ai-count" value={count} disabled={busy} onChange={(event)=>setCount(Number(event.target.value))}>{counts.map((item)=><option key={item} value={item}>{item}개</option>)}</select>
      <ul className="ai-rules"><li>첫 문장은 짧고 구체적으로</li><li>불필요한 제목과 과장 없이</li><li>읽기 쉬운 줄바꿈, 500자 이내</li><li>사람이 검토하고 선택한 뒤 게시</li></ul>
      <button className="pro-button primary ai-generate" disabled={busy||configured!==true||!topic.trim()} onClick={()=>generate()}><Icon name="sparkle" size={17}/>{busy?"생성·저장 중…":generationMode==="series"?"시리즈 생성":count+"개 글 생성"}</button>
      <p className="pro-help">생성 결과는 자동 저장됩니다. 30개 생성은 시간이 더 걸릴 수 있어요.</p>
      {!!results.length&&<button className="pro-button ghost ai-generate" disabled={busy||configured!==true||!topic.trim()} onClick={()=>generate("regenerate")}>다시 생성</button>}
      <div className="ai-account-note"><Icon name="check" size={16}/><span>게시 계정: {accountLabel}<br/>Meta 연결 전에도 생성·저장·예약 가능</span></div>
    </section></div>

    {!!results.length&&<section className="ai-results"><div className="ai-results-heading"><div><span className="pro-eyebrow">PICK YOUR NEXT STORIES</span><h2>생성한 글 <span>{results.length}개</span></h2></div>
      <div className="pro-row-actions"><button disabled={busy} onClick={()=>setResults((rows)=>rows.map((row)=>({...row,selected:!row.draft_id})))}>미등록 글 전체 선택</button><button disabled={busy} onClick={()=>setResults((rows)=>rows.map((row)=>({...row,selected:false})))}>선택 해제</button></div></div>
      <section className="pro-card ai-distribution"><div className="pro-card-title"><h3>자동 시간 배분</h3><span>한국 시간 KST · 선택한 {selected.length}개</span></div>
        <div className="ai-schedule-fields"><div><label htmlFor="ai-start-date">시작 날짜</label><input id="ai-start-date" type="date" min={today} value={startDate} disabled={busy} onChange={(event)=>setStartDate(event.target.value)}/></div>
          <div><label htmlFor="ai-end-date">종료 날짜</label><input id="ai-end-date" type="date" min={startDate||today} value={endDate} disabled={busy} onChange={(event)=>setEndDate(event.target.value)}/></div>
          <div><label htmlFor="ai-per-day">하루 게시 개수</label><input id="ai-per-day" type="number" min={1} max={30} value={perDay} disabled={busy} onChange={(event)=>setPerDay(Number(event.target.value))}/></div>
          <div><label htmlFor="ai-start-time">게시 시작 시간</label><input id="ai-start-time" type="time" value={startTime} disabled={busy} onChange={(event)=>setStartTime(event.target.value)}/></div>
          <div><label htmlFor="ai-end-time">게시 종료 시간</label><input id="ai-end-time" type="time" value={endTime} disabled={busy} onChange={(event)=>setEndTime(event.target.value)}/></div>
        </div><div className="ai-distribute-actions"><p className="pro-help">하루 시간대 안에서 고르게 배분합니다. 아래에서 각 예약시간을 다시 수정할 수 있어요.</p><button className="pro-button ghost" disabled={busy||!selected.length} onClick={distribute}>자동 시간 배분</button></div>
      </section>
      <div className="ai-result-grid">{results.map((post,index)=>{const linked=drafts.find((item)=>item.id===post.draft_id);return <article className={"pro-card ai-result-card "+(post.selected?"chosen":"")} key={post.id}>
        <div className="ai-result-top"><label className="pro-check-label"><input type="checkbox" checked={post.selected} disabled={busy||!!post.draft_id} onChange={(event)=>update(post.id,{selected:event.target.checked})}/><strong>{post.label||"버전 "+(index+1)}</strong></label>
          <button disabled={busy} aria-label={"생성 글 "+(index+1)+" 삭제"} onClick={()=>edit(post,true)}>삭제</button></div>
        <p className="ai-angle">{post.angle}</p><label className="pro-sr-only" htmlFor={"ai-body-"+post.id}>생성 글 {index+1} 본문</label>
        <textarea id={"ai-body-"+post.id} rows={8} value={post.body} disabled={busy||!!post.draft_id} onChange={(event)=>update(post.id,{body:event.target.value})}/>
        <div className={"pro-character-count "+(invalid(post)?"invalid":"")}><span>{post.draft_id?(!linked?"연결된 글 확인 필요":linked.publication_status==="published"?"실제 게시 완료":linked.scheduled_at?"예약 등록됨":"임시저장됨"):"수정 가능"}</span><span>{Array.from(post.body).length} / 500자</span></div>
        {post.draft_id?<div className="pro-row-actions"><button disabled={busy} onClick={()=>onUse(post)}>Composer에서 수정</button><Link href={linked?.publication_status==="published"?"/history":"/queue"}>등록한 글 보기</Link></div>:<>
          <div className="pro-row-actions"><button disabled={busy||invalid(post)} onClick={()=>edit(post)}>수정 저장</button><button disabled={busy||invalid(post)} onClick={()=>onUse(post)}>Composer로 이동</button>
            <button disabled={busy||configured!==true} onClick={()=>generate("regenerate",post)}>재생성</button><button disabled={busy} onClick={()=>setToolsId(toolsId===post.id?null:post.id)}>AI 다듬기</button></div>
          {toolsId===post.id&&<div className="ai-refine-tools">{Object.entries(AI_ACTIONS).filter(([key])=>!["generate","regenerate"].includes(key)).map(([key,label])=><button key={key} disabled={busy||configured!==true||invalid(post)} onClick={()=>generate(key as AiAction,post)}>{label}</button>)}</div>}
          <div className="pro-date-fields"><div><label htmlFor={"ai-date-"+post.id}>개별 예약 날짜</label><input id={"ai-date-"+post.id} type="date" min={today} value={post.date} disabled={busy} onChange={(event)=>update(post.id,{date:event.target.value})}/></div>
            <div><label htmlFor={"ai-time-"+post.id}>시간</label><input id={"ai-time-"+post.id} type="time" value={post.time} disabled={busy} onChange={(event)=>update(post.id,{time:event.target.value})}/></div></div>
          <div className="ai-card-publish"><button className="pro-button ghost" disabled={busy||invalid(post)||!canPublish} onClick={()=>promote([post],"now")}>지금 게시</button><button className="pro-button ghost" disabled={busy||invalid(post)||!post.date} onClick={()=>promote([post],"schedule")}>예약</button></div>
        </>}
      </article>;})}</div>
      <div className="pro-card ai-selection-bar"><div><strong>{selected.length}개 선택됨</strong><label className="pro-check-label"><input type="checkbox" disabled={busy} checked={allowDuplicate} onChange={(event)=>setAllowDuplicate(event.target.checked)}/>기존 글과 중복 내용을 확인하고 등록</label></div>
        <button className="pro-button ghost" disabled={busy||!selected.length||selected.some(invalid)} onClick={()=>promote(selected,"draft")}>선택 글 임시저장</button>
        <button className="pro-button primary" disabled={busy||!selected.length||selected.some((post)=>invalid(post)||!post.date)} onClick={()=>promote(selected,"schedule")}>{busy?"처리 중…":"전체 예약"}<Icon name="calendar" size={16}/></button><Link href="/queue" className="pro-text-link">Queue 확인 <Icon name="arrow" size={14}/></Link>
      </div>
    </section>}

    <section className="pro-card ai-history"><div className="pro-card-title"><h2>AI 생성 기록</h2><button disabled={busy} onClick={()=>action(reloadHistory)}>기록 새로고침</button></div>
      {!jobs.length&&<p className="pro-help">주제·스타일·목적·생성 결과와 연결한 글의 게시 여부를 여기에 보관합니다.</p>}
      {jobs.map((job)=><div className="ai-history-row" key={job.id}><div><strong>{job.topic}</strong><p>{job.mode==="series"?"시리즈":job.mode==="multiple"?"여러 버전":"한 개 글"} · {job.post_count}개 · {job.purpose} · {job.tone} · 실제 게시 {job.published_count??0}개</p><small>{scheduledDate(job.created_at)} KST</small>{job.error&&<p className="pro-inline-error">{job.error}</p>}</div>
        <span className={"pro-badge "+(job.status==="completed"?"success":job.status==="failed"?"danger":"neutral")}>{job.status==="completed"?"저장 완료":job.status==="failed"?"생성 실패":"생성 요청 중"}</span>
        {job.status==="completed"&&!busy&&<Link className="pro-button ghost" href={"/composer?tab=ai&generation="+job.id}>결과 열기</Link>}</div>)}
    </section>
  </div>;
}
