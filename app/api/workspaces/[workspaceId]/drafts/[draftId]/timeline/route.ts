import {publishTimeline} from "@/lib/publish-operations-data";
import {draftsResponse,draftsErrorResponse} from "@/lib/drafts-http";
import {WorkspaceAccessError,workspaceErrorResponse} from "@/lib/workspaces";
export const runtime="nodejs";
export async function GET(_request:Request,context:{params:Promise<{workspaceId:string;draftId:string}>}){
 try{const {workspaceId,draftId}=await context.params;return draftsResponse({events:await publishTimeline(workspaceId,draftId)});}
 catch(error){return error instanceof WorkspaceAccessError?workspaceErrorResponse(error):draftsErrorResponse(error);}
}
