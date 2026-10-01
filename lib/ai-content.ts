import { DraftInputError, isUuid } from "./drafts-validation";
import { kstInputToIso } from "./draft-scheduling";

export const AI_PURPOSES = ["정보 전달","공감","질문","의견","경험담","브랜드 홍보","제품 홍보","링크 유도","팔로워 참여","교육 콘텐츠"] as const;
export const AI_TONES = ["자연스러운 대화체","전문가","친근함","강한 후킹","담백함","유머","스토리텔링"] as const;
export const AI_ACTIONS = {generate:"글 생성",regenerate:"다시 생성",shorter:"더 짧게",longer:"더 길게",natural:"더 자연스럽게",hook:"후킹 강화",professional:"전문적으로",friendly:"친근하게",question:"질문 추가",cta:"CTA 추가"} as const;
export type AiAction = keyof typeof AI_ACTIONS;
export type AiMode = "single" | "multiple" | "series";
export type AiInput = {requestId:string;topic:string;keyPoints:string;audience:string;purpose:string;tone:string;
  mode:AiMode;count:number;action:AiAction;sourceBody:string;templateId:string;sourcePostId:string|null};
export const BUILTIN_TEMPLATES = [
  ["info","정보형","핵심 사실 하나와 이해를 돕는 구체적인 예를 전한다.","정보 전달"],
  ["tip","꿀팁형","바로 실행할 수 있는 작은 팁과 적용 방법을 전한다.","정보 전달"],
  ["empathy","공감형","독자가 겪는 일상적인 순간을 짚고 따뜻하게 말을 건넨다.","공감"],
  ["question","질문형","선택지나 열린 질문으로 서로의 생각을 나누도록 한다.","질문"],
  ["experience","경험담","제공된 실제 경험만 사용해 상황, 깨달음, 다음 행동을 전한다.","경험담"],
  ["failure","실패담","제공된 실패 사례와 배운 점을 담백하게 전한다. 없는 경험은 만들지 않는다.","경험담"],
  ["solution","문제 해결","독자의 구체적인 문제 하나와 실행 가능한 해결법을 연결한다.","교육 콘텐츠"],
  ["checklist","체크리스트","주제에 맞는 간결한 확인 항목 3~5개를 만든다.","교육 콘텐츠"],
  ["comparison","비교","두 선택지의 장단점과 선택 기준을 균형 있게 전한다.","정보 전달"],
  ["recommend","추천","누구에게 어떤 이유로 도움이 되는지 구체적으로 전한다. 근거 없는 순위를 만들지 않는다.","정보 전달"],
  ["product","제품 소개","사용자의 문제, 제품의 역할, 부담 없는 다음 행동을 연결한다.","제품 홍보"],
  ["service","서비스 홍보","도움을 받을 독자와 서비스 가치를 자연스럽게 전한다.","브랜드 홍보"],
  ["blog","블로그 유입","본문만으로도 유용한 요점을 먼저 제공한 뒤 상세 글을 안내한다.","링크 유도"],
  ["youtube","유튜브 유입","영상에서 얻을 수 있는 한 가지 배움을 먼저 전하고 시청을 제안한다.","링크 유도"],
  ["pdf","PDF 상품 홍보","자료로 해결할 수 있는 구체적인 상황과 내용을 소개한다. 과장된 수익 약속은 하지 않는다.","제품 홍보"],
].map(([id,name,instruction,purpose])=>({id,name,instruction,purpose,tone:"자연스러운 대화체"}));

export function parseAiInput(value:unknown):AiInput {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new DraftInputError("AI 작성 입력을 확인해 주세요.");
  const input=value as Record<string,unknown>;
  const keys=["requestId","topic","keyPoints","audience","purpose","tone","mode","count","action","sourceBody","templateId","sourcePostId"];
  if(Object.keys(input).some((key)=>!keys.includes(key)))throw new DraftInputError("AI 작성 입력을 확인해 주세요.");
  function text(key:string,max:number,required=false){const val=input[key]??"";
    if(typeof val!=="string"||Array.from(val).length>max||(required&&!val.trim()))throw new DraftInputError("주제와 입력 길이를 확인해 주세요.");return val.trim();}
  if(typeof input.requestId!=="string"||!isUuid(input.requestId))throw new DraftInputError("생성 요청을 다시 시작해 주세요.");
  const mode=input.mode as AiMode,action=input.action as AiAction,count=input.count as number;
  if(!["single","multiple","series"].includes(mode)||!Object.hasOwn(AI_ACTIONS,action)
    ||!(mode==="single"?[1]:mode==="series"?[3,5,7,10,15,30]:[1,3,5,10,20,30]).includes(count)
    ||!AI_PURPOSES.includes(input.purpose as typeof AI_PURPOSES[number])||!AI_TONES.includes(input.tone as typeof AI_TONES[number]))throw new DraftInputError("개수·목적·말투를 선택해 주세요.");
  const sourceBody=text("sourceBody",500);
  if(!["generate","regenerate"].includes(action)&&(!sourceBody||count!==1))throw new DraftInputError("다듬을 글 하나를 선택해 주세요.");
  const sourcePostId=input.sourcePostId??null;
  if(sourcePostId!==null&&(typeof sourcePostId!=="string"||!isUuid(sourcePostId)))throw new DraftInputError("원본 글을 확인해 주세요.");
  return {requestId:input.requestId,topic:text("topic",180,true),keyPoints:text("keyPoints",2000),audience:text("audience",200),
    purpose:input.purpose as string,tone:input.tone as string,mode,count,action,sourceBody,templateId:text("templateId",80),sourcePostId};
}

export type GeneratedContent={label:string;angle:string;body:string};
export function validateGeneratedContent(value:unknown,count:number):GeneratedContent[]{
  if(!value||typeof value!=="object"||!("posts" in value)||!Array.isArray(value.posts)||value.posts.length!==count)throw new DraftInputError("AI 응답이 완성되지 않았습니다. 다시 생성해 주세요.");
  const contents:GeneratedContent[]=value.posts.map((item:unknown)=>{
    if(!item||typeof item!=="object")throw new DraftInputError("AI 응답 형식을 확인하지 못했습니다.");
    const row=item as Record<string,unknown>;
    if(typeof row.body!=="string"||!row.body.trim()||Array.from(row.body).length>500
      ||typeof row.label!=="string"||Array.from(row.label).length>100||typeof row.angle!=="string"||!row.angle.trim()||Array.from(row.angle).length>200)throw new DraftInputError("AI 글은 1~500자여야 합니다. 다시 생성해 주세요.");
    return {label:row.label.trim(),angle:row.angle.trim(),body:row.body.trim()};
  });
  const normalized=(text:string)=>text.replace(/\s+/g,"").toLowerCase();
  const bodies=contents.map((post)=>normalized(post.body)),angles=contents.map((post)=>normalized(post.angle));
  const hooks=contents.map((post)=>normalized(post.body.split(/[\n.!?。]/)[0]));
  if(new Set(bodies).size!==count||new Set(angles).size!==count||new Set(hooks).size!==count)throw new DraftInputError("내용이나 후킹이 겹치는 결과입니다. 다른 관점으로 다시 생성해 주세요.");
  // Reject near-copy variants rather than treating word substitution as multi-generation.
  const grams=(text:string)=>new Set(Array.from({length:Math.max(0,text.length-3)},(_,i)=>text.slice(i,i+4)));
  for(let i=0;i<bodies.length;i++)for(let j=0;j<i;j++){
    const a=grams(bodies[i]),b=grams(bodies[j]);const common=[...a].filter((word)=>b.has(word)).length;
    if(a.size+b.size-common>0&&common/(a.size+b.size-common)>.78)throw new DraftInputError("너무 비슷한 글이 포함되어 있습니다. 다시 생성해 주세요.");
  }
  return contents;
}

export type Distribution={startDate:string;endDate:string;perDay:number;startTime:string;endTime:string};
export function distributeAiSchedule(count:number,settings:Distribution,now=Date.now()):string[]{
  const {startDate,endDate,perDay,startTime,endTime}=settings;
  if(!Number.isInteger(count)||count<1||count>30||!Number.isInteger(perDay)||perDay<1||perDay>30)throw new DraftInputError("하루 게시 개수는 1~30개로 선택해 주세요.");
  const first=Date.parse(kstInputToIso(startDate+"T00:00")),last=Date.parse(kstInputToIso(endDate+"T00:00"));
  if(last<first||last-first>366*86400000)throw new DraftInputError("종료 날짜는 시작 날짜부터 1년 이내로 선택해 주세요.");
  const start=Date.parse(kstInputToIso(startDate+"T"+startTime))-first,end=Date.parse(kstInputToIso(startDate+"T"+endTime))-first;
  if(end<start||(perDay>1&&end-start<(perDay-1)*60000))throw new DraftInputError("게시 가능 시간대를 충분히 넓혀 주세요.");
  const days=Math.floor((last-first)/86400000)+1;
  if(days*perDay<count)throw new DraftInputError("기간이 짧습니다. 종료 날짜나 하루 게시 개수를 늘려 주세요.");
  const times=Array.from({length:count},(_,i)=>{
    const day=Math.floor(i/perDay),position=i%perDay;
    const minute=Math.floor((start+(perDay===1?0:(end-start)*position/(perDay-1)))/60000)*60000;
    return new Date(first+day*86400000+minute).toISOString();
  });
  if(times.some((value)=>Date.parse(value)<=now))throw new DraftInputError("게시시간이 지났습니다. 시작 날짜나 시간대를 미래로 바꿔 주세요.");
  return times;
}
