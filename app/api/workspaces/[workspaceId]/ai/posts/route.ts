import { aiClient,promoteAiPosts } from "@/lib/ai-data";
import { draftRequestInput,draftsResponse } from "@/lib/drafts-http";
import { aiErrorResponse } from "@/lib/ai-http";
import { publishDraft,publishingFailure } from "@/lib/threads-publishing";
export const runtime="nodejs";
export const maxDuration=120;
type Context={params:Promise<{workspaceId:string}>};
export async function POST(request:Request,context:Context){
  try{
    const {workspaceId}=await context.params;
    const result=await promoteAiPosts(workspaceId,await draftRequestInput(request,131072));
    const client=await aiClient(workspaceId);
    const updated=await client.from("ai_generated_posts").select("*").eq("workspace_id",workspaceId).in("draft_id",result.drafts.map((item)=>item.id));
    const response={drafts:result.drafts,posts:updated.data??[]};
    if(!result.immediate)return draftsResponse(response);
    const draft=result.drafts[0];
    try{return draftsResponse({...response,draft:await publishDraft(workspaceId,draft.id,draft.updated_at)});}
    catch(error){const failure=publishingFailure(error);return draftsResponse({...response,draft,saved:true,error:failure?.error??"글은 저장됐지만 게시하지 못했습니다. 계정 연결 상태를 확인해 주세요."},failure?.status??503);}
  }catch(error){return aiErrorResponse(error);}
}
