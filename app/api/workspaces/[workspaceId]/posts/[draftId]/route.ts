import { changeProductPost } from "@/lib/product-data";
import { draftsResponse, draftRequestInput, draftsErrorResponse } from "@/lib/drafts-http";
import { publishingFailure } from "@/lib/threads-publishing";
type Context={params:Promise<{workspaceId:string;draftId:string}>};
export async function PATCH(request:Request,context:Context){
  try{const {workspaceId,draftId}=await context.params;
    return draftsResponse({draft:await changeProductPost(workspaceId,draftId,await draftRequestInput(request))});
  }catch(error){const failure=publishingFailure(error);return failure?draftsResponse({error:failure.error},failure.status):draftsErrorResponse(error);}
}
