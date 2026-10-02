import { DraftInputError,isUuid } from "./drafts-validation";
import { kstInput,kstInputToIso } from "./draft-scheduling";
import type { DraftRow,AiPostRow } from "./supabase/database.types";
export type Category={id:string;workspace_id:string;name:string;color:string;archived_at:string|null;updated_at:string};
export type PlanItem={id:string;topic:string;purpose:string;categoryId:string|null;day:string;body:string;aiPostId?:string;scheduledAt?:string;draftId?:string};
export type ContentPlan={id:string;workspace_id:string;request_id:string;business:string;goal:string;audience:string;start_date:string;end_date:string;target_count:number;mix:Record<string,number>;items:PlanItem[];status:"planning"|"ready"|"scheduled";updated_at:string;created_at:string;performance_feedback?:boolean};
export type RecurringSchedule={id:string;workspace_id:string;name:string;days:number[];time_of_day:string;category_id:string|null;template_id:string;content_type:string;enabled:boolean;start_date:string;end_date:string|null;updated_at:string};
export type OperationsData={categories:Category[];plans:ContentPlan[];recurrences:RecurringSchedule[];aiPosts:Pick<AiPostRow,"draft_id">[];templates?:import("./supabase/database.types").ContentTemplateRow[];accounts?:import("./supabase/database.types").ThreadsAccountRow[]};
export const DEFAULT_MIX:Record<string,number>={"정보":30,"공감":20,"질문":20,"제품":15,"홍보":5,"경험":10};
export const CATEGORY_PURPOSE:Record<string,string>={"정보":"정보 전달","팁":"정보 전달","교육":"교육 콘텐츠","질문":"질문","공감":"공감","경험":"경험담","브랜드":"브랜드 홍보","제품":"제품 홍보","홍보":"브랜드 홍보","유입":"링크 유도","커뮤니티":"팔로워 참여","기타":"의견"};
export function text(value:unknown,max:number,required=false){if(typeof value!=="string"||value.length>max||(required&&!value.trim()))throw new DraftInputError("입력 길이와 필수 항목을 확인해 주세요.");return value.trim();}
export function validDate(value:unknown){if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)throw new DraftInputError("날짜를 확인해 주세요.");return value;}
export function validTime(value:unknown){if(typeof value!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new DraftInputError("시간을 확인해 주세요.");return value;}
export function categoryId(value:unknown){if(value===null||value===undefined||value==="")return null;if(typeof value!=="string"||!isUuid(value))throw new DraftInputError("카테고리를 확인해 주세요.");return value;}
export function validateMix(value:unknown):Record<string,number>{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new DraftInputError("콘텐츠 믹스를 확인해 주세요.");
 const rows=Object.entries(value);if(rows.length<1||rows.length>30||rows.some(([name,n])=>!name||name.length>40||typeof n!=="number"||!Number.isFinite(n)||n<0||n>100)||Math.abs(rows.reduce((sum,[,n])=>sum+(n as number),0)-100)>.001)throw new DraftInputError("콘텐츠 믹스 합계는 100%여야 합니다.");
 return value as Record<string,number>;
}
export function apportionMix(count:number,mix:Record<string,number>){
 const rows=Object.entries(validateMix(mix)).map(([name,percent])=>({name,n:Math.floor(count*percent/100),fraction:count*percent/100%1}));
 let remaining=count-rows.reduce((s,r)=>s+r.n,0);for(const row of [...rows].sort((a,b)=>b.fraction-a.fraction)){if(remaining-->0)row.n++;}
 // Spread each category through the plan after largest-remainder apportionment.
 return rows.flatMap(row=>Array.from({length:row.n},(_,i)=>({name:row.name,rank:(i+.5)/row.n}))).sort((a,b)=>a.rank-b.rank).map(r=>r.name);
}
export function periodDates(start:string,end:string){validDate(start);validDate(end);const first=Date.parse(start),last=Date.parse(end);if(last<first||last-first>62*86400000)throw new DraftInputError("기간은 63일 이내로 선택해 주세요.");return Array.from({length:(last-first)/86400000+1},(_,i)=>new Date(first+i*86400000).toISOString().slice(0,10));}
export function recurringSlots(schedules:RecurringSchedule[],start:string,end:string,now=Date.now()){
 return periodDates(start,end).flatMap(day=>schedules.filter(s=>s.enabled&&day>=s.start_date&&(!s.end_date||day<=s.end_date)&&s.days.includes(new Date(day+"T00:00:00Z").getUTCDay()))
 .map(s=>({schedule:s,at:kstInputToIso(day+"T"+s.time_of_day.slice(0,5))}))).filter(s=>Date.parse(s.at)>now).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
}
export function allocatePlan(items:PlanItem[],start:string,end:string,perDay:number,startTime:string,endTime:string,occupied:string[],recurrences:RecurringSchedule[]=[],now=Date.now()){
 if(!Number.isInteger(perDay)||perDay<1||perDay>30)throw new DraftInputError("하루 게시 수는 1~30개입니다.");
 validTime(startTime);validTime(endTime);const startMinute=Number(startTime.slice(0,2))*60+Number(startTime.slice(3)),endMinute=Number(endTime.slice(0,2))*60+Number(endTime.slice(3));
 if(endMinute<startMinute||endMinute-startMinute<perDay-1)throw new DraftInputError("게시 가능 시간대를 넓혀 주세요.");
 const used=new Set(occupied.map(v=>Date.parse(v)));const days=periodDates(start,end);const dayCounts=new Map<string,number>();
 for(const value of occupied){const day=kstInput(value).slice(0,10);dayCounts.set(day,(dayCounts.get(day)??0)+1);}
 const candidates=recurringSlots(recurrences,start,end,now).filter(s=>{const t=kstInput(s.at).slice(11);return t>=startTime&&t<=endTime;}).map(s=>({at:s.at,categoryId:s.schedule.category_id}));
 for(const day of days)for(let i=0;i<perDay;i++){const minute=Math.floor(startMinute+(perDay===1?0:(endMinute-startMinute)*i/(perDay-1)));candidates.push({at:kstInputToIso(day+"T"+String(Math.floor(minute/60)).padStart(2,"0")+":"+String(minute%60).padStart(2,"0")),categoryId:null});}
 return items.map(item=>{const available=(c:{at:string})=>!used.has(Date.parse(c.at))&&Date.parse(c.at)>now&&(dayCounts.get(kstInput(c.at).slice(0,10))??0)<perDay;
 const preferred=candidates.find(c=>available(c)&&c.categoryId===item.categoryId);
 const slot=preferred??candidates.find(available);if(!slot)throw new DraftInputError("빈 시간이 부족합니다. 기간이나 하루 게시 수를 늘려 주세요.");
 used.add(Date.parse(slot.at));const day=kstInput(slot.at).slice(0,10);dayCounts.set(day,(dayCounts.get(day)??0)+1);return {...item,day,scheduledAt:slot.at};});
}
export function calendarStatus(draft:DraftRow,now=Date.now()){
 if(draft.publication_status==="published")return "Published";if(draft.publication_status==="failed")return "Failed";
 if(draft.publication_status==="publishing"||(draft.scheduled_at&&Date.parse(draft.scheduled_at)<=now))return "Queued";
 return draft.scheduled_at?"Scheduled":"Draft";
}
export function weekBounds(now:string){const day=kstInput(now).slice(0,10),d=new Date(day+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return {start:d.toISOString().slice(0,10),end:new Date(d.getTime()+6*86400000).toISOString().slice(0,10)};}
export function operationsMetrics(drafts:DraftRow[],data:OperationsData,start:string,end:string){
 const inPeriod=(value:string|null)=>!!value&&kstInput(value).slice(0,10)>=start&&kstInput(value).slice(0,10)<=end;
 const published=drafts.filter(d=>d.publication_status==="published"&&inPeriod(d.published_at));
 const failed=drafts.filter(d=>d.publication_status==="failed"&&inPeriod(d.publish_started_at??d.updated_at));
 const scheduled=drafts.filter(d=>inPeriod(d.scheduled_at));const prepared=new Set([...scheduled.filter(d=>d.publication_status!=="failed"),...published].map(d=>d.id));
 const due=scheduled.filter(d=>Date.parse(d.scheduled_at!)<=Date.now());
 const target=data.plans.filter(p=>p.start_date<=end&&p.end_date>=start).reduce((n,p)=>Math.max(n,p.target_count),0);
 const aiIds=new Set(data.aiPosts.map(p=>p.draft_id));
 const group=(key:(d:DraftRow)=>string)=>Object.entries(published.reduce<Record<string,number>>((map,d)=>{const k=key(d);map[k]=(map[k]??0)+1;return map;},{})).map(([label,value])=>({label,value}));
 return {published:published.length,failed:failed.length,scheduled:scheduled.filter(d=>d.publication_status==="unpublished").length,target,prepared:prepared.size,
 missing:Math.max(0,target-prepared.size),executionRate:due.length?Math.round(due.filter(d=>d.publication_status==="published").length/due.length*100):null,
 ai:published.filter(d=>aiIds.has(d.id)).length,manual:published.filter(d=>!aiIds.has(d.id)).length,
 days:group(d=>kstInput(d.published_at!).slice(0,10)),categories:group(d=>data.categories.find(c=>c.id===d.category_id)?.name??"미분류"),
 hours:group(d=>kstInput(d.published_at!).slice(11,13)+"시"),accounts:group(d=>d.threads_account_id??"기본 계정")};
}
