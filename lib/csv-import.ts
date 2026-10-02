import {BUILTIN_TEMPLATES} from "./ai-content";
import {DraftInputError} from "./drafts-validation";
import {kstInputToIso,parseScheduleInput} from "./draft-scheduling";
export const CSV_MAX_BYTES=65536,CSV_MAX_ROWS=30;
export type CsvContext={categories:{id:string;name:string;archived_at?:string|null}[];accounts:{id:string;username:string}[];templates:{id:string;name:string}[];existingBodies:string[]};
export type CsvRow={row:number;content:string;category:string;scheduled_at:string;account:string;template:string;errors:string[];
 post:{body:string;mode:"draft"|"schedule";scheduledAt:string|null;accountId:string|null;categoryId:string|null;templateId:string|null;allowDuplicate:false}};
const normalize=(body:string)=>body.trim().replace(/\s+/g," ").toLowerCase();
export function parseCsv(text:string){
 if(new TextEncoder().encode(text).length>CSV_MAX_BYTES||text.includes("\0"))throw new DraftInputError("CSV는 64 KB 이하의 UTF-8 텍스트여야 합니다.");
 const input=text.replace(/^\uFEFF/,"");let field="",row:string[]=[],quoted=false,closed=false;const rows:string[][]=[];
 function pushField(){row.push(field);field="";closed=false;}function pushRow(){pushField();if(row.some(f=>f.trim()))rows.push(row);row=[];if(rows.length>CSV_MAX_ROWS+1)throw new DraftInputError("CSV는 최대 30개 글을 등록할 수 있습니다.");}
 for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'){if(input[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c==='"'){if(field||closed)throw new DraftInputError("CSV 따옴표 형식을 확인해 주세요.");quoted=true;}
  else if(c===',')pushField();else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;pushRow();}
  else{if(closed)throw new DraftInputError("따옴표 뒤에는 쉼표 또는 줄바꿈만 사용할 수 있습니다.");field+=c;}}
 if(quoted)throw new DraftInputError("CSV의 닫히지 않은 따옴표를 확인해 주세요.");if(field||row.length||closed)pushRow();
 if(rows.length<2)throw new DraftInputError("헤더와 글 한 개 이상이 필요합니다.");
 const headers=rows[0].map(h=>h.trim().toLowerCase()),allowed=["content","category","scheduled_at","account","template"];
 if(!headers.includes("content")||new Set(headers).size!==headers.length||headers.some(h=>!allowed.includes(h)))throw new DraftInputError("content 헤더는 필수입니다. category, scheduled_at, account, template만 추가할 수 있습니다.");
 return {headers,rows:rows.slice(1)};
}
export function previewCsv(text:string,context:CsvContext,now=Date.now()):CsvRow[]{
 const parsed=parseCsv(text),seen=new Set<string>(),existing=new Set(context.existingBodies.map(normalize));
 return parsed.rows.map((cells,index)=>{
  const raw=Object.fromEntries(parsed.headers.map((h,i)=>[h,(cells[i]??"").trim()])),errors:string[]=[];
  if(cells.length!==parsed.headers.length)errors.push("헤더와 열 수가 다릅니다.");
  if(!raw.content||Array.from(raw.content).length>500)errors.push("본문은 1~500자여야 합니다.");
  const key=normalize(raw.content);if(seen.has(key)||existing.has(key))errors.push("같은 본문이 CSV 또는 기존 글에 있습니다.");seen.add(key);
  const category=raw.category?context.categories.find(c=>!c.archived_at&&(c.id===raw.category||c.name===raw.category)):undefined;
  if(raw.category&&!category)errors.push("사용 가능한 카테고리가 아닙니다.");
  const account=raw.account?context.accounts.find(a=>a.id===raw.account||a.username===raw.account.replace(/^@/,"")):undefined;
  if(raw.account&&!account)errors.push("현재 workspace 계정이 아닙니다.");
  const template=raw.template?[...BUILTIN_TEMPLATES,...context.templates].find(t=>t.id===raw.template||t.name===raw.template):undefined;
  if(raw.template&&!template)errors.push("사용 가능한 템플릿이 아닙니다.");
  let scheduledAt:string|null=null;if(raw.scheduled_at){try{const rawDate=raw.scheduled_at.replace(" ","T");const value=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawDate)?kstInputToIso(rawDate):rawDate;
   scheduledAt=parseScheduleInput({scheduledAt:value,expectedUpdatedAt:new Date(now).toISOString()},now).scheduledAt;}catch{errors.push("미래 예약시간을 입력하세요. 시간대가 없으면 KST YYYY-MM-DD HH:mm 형식입니다.");}}
  return {row:index+2,content:raw.content,category:raw.category??"",scheduled_at:raw.scheduled_at??"",account:raw.account??"",template:raw.template??"",errors,
   post:{body:raw.content,mode:scheduledAt?"schedule":"draft",scheduledAt,accountId:account?.id??null,categoryId:category?.id??null,templateId:template?.id??null,allowDuplicate:false}};
 });
}
