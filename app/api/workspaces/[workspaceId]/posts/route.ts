import { parsePostInput, saveProductPost, saveProductBatch,queueWorkerStatus } from "@/lib/product-data";
import { draftsResponse, draftRequestInput, draftsErrorResponse } from "@/lib/drafts-http";
import { publishDraft, publishingFailure,threadsConnection } from "@/lib/threads-publishing";

export const maxDuration=120;
export const runtime="nodejs";
type Context={params:Promise<{workspaceId:string}>};
export async function GET(_request:Request,context:Context){
  try{const {workspaceId}=await context.params;
    const [worker,connection]=await Promise.all([queueWorkerStatus(workspaceId),threadsConnection(workspaceId)]);
    return draftsResponse({worker,connection});
  }catch(error){return draftsErrorResponse(error);}
}
export async function POST(request:Request,context:Context){
  try{
    const {workspaceId}=await context.params;
    // A 30-post Korean/emoji batch can exceed the single-draft 32 KB limit.
    const value=await draftRequestInput(request,131072);
    if(value && typeof value==="object" && !Array.isArray(value) && "posts" in value){
      if(Object.keys(value).length!==1) return draftsResponse({error:"등록 입력을 확인해 주세요."},400);
      return draftsResponse({drafts:await saveProductBatch(workspaceId,value.posts)});
    }
    const input=parsePostInput(value);
    const draft=await saveProductPost(workspaceId,input);
    if(input.mode!=="now") return draftsResponse({draft});
    try { return draftsResponse({draft:await publishDraft(workspaceId,draft.id,draft.updated_at)}); }
    catch(error){
      const failure=publishingFailure(error);
      return draftsResponse({draft,saved:true,error:failure?.error ?? "글은 저장됐지만 게시하지 못했습니다. 계정 연결 상태를 확인해 주세요."},failure?.status ?? 503);
    }
  }catch(error){const failure=publishingFailure(error);return failure?draftsResponse({error:failure.error},failure.status):draftsErrorResponse(error);}
}
