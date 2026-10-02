import "server-only";
import {aiClient} from "./ai-data";
import {previewCsv} from "./csv-import";
import {DraftInputError} from "./drafts-validation";
import {PublishingError} from "./threads-publishing";
import type {Json} from "./supabase/database.types";
export async function importCsv(workspaceId:string,value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value))throw new DraftInputError("CSV 입력을 확인해 주세요.");
 const input=value as Record<string,unknown>;
 if(Object.keys(input).some(k=>!["action","csv","rows"].includes(k))||typeof input.csv!=="string"||!["preview","import"].includes(input.action as string))throw new DraftInputError("CSV 입력을 확인해 주세요.");
 const client=await aiClient(workspaceId),[categories,accounts,templates,drafts]=await Promise.all([
 client.from("content_categories").select("id,name,archived_at").eq("workspace_id",workspaceId),client.from("threads_accounts").select("id,username").eq("workspace_id",workspaceId),
 client.from("content_templates").select("id,name").eq("workspace_id",workspaceId).is("deleted_at",null),client.from("drafts").select("body").eq("workspace_id",workspaceId).is("deleted_at",null).order("created_at",{ascending:false}).limit(1000)]);
 if(categories.error||accounts.error||templates.error||drafts.error)throw new PublishingError("CSV 등록 정보를 불러오지 못했습니다.");
 const rows=previewCsv(input.csv,{categories:categories.data!,accounts:accounts.data!,templates:templates.data!,existingBodies:drafts.data!.map(d=>d.body)});
 if(input.action==="preview")return {rows};
 if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>30||input.rows.some(r=>!Number.isInteger(r))||new Set(input.rows).size!==input.rows.length)throw new DraftInputError("저장할 정상 행을 선택해 주세요.");
 const selection=rows.filter(r=>(input.rows as number[]).includes(r.row));
 if(selection.length!==input.rows.length||selection.some(r=>r.errors.length))throw new DraftInputError("미리보기 내용을 다시 확인해 주세요. 오류가 있는 행은 저장할 수 없습니다.");
 const result=await client.rpc("save_csv_posts",{p_workspace_id:workspaceId,p_posts:selection.map(r=>r.post) as Json});
 if(result.error)throw new PublishingError(result.error.code==="23505"?"이미 등록된 본문이 있습니다. 미리보기를 다시 확인해 주세요.":"등록 정보가 변경됐습니다. 미리보기를 다시 확인해 주세요.",409);
 return {drafts:result.data!};
}
