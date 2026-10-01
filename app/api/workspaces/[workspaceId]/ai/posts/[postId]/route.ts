import { editAiPost } from "@/lib/ai-data";
import { draftRequestInput,draftsResponse } from "@/lib/drafts-http";
import { aiErrorResponse } from "@/lib/ai-http";
type Context={params:Promise<{workspaceId:string;postId:string}>};
export async function PATCH(request:Request,context:Context){
  try{const {workspaceId,postId}=await context.params;return draftsResponse({post:await editAiPost(workspaceId,postId,await draftRequestInput(request))});}
  catch(error){return aiErrorResponse(error);}
}
