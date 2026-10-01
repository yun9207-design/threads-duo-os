import { saveContentTemplate } from "@/lib/ai-data";
import { draftRequestInput,draftsResponse } from "@/lib/drafts-http";
import { aiErrorResponse } from "@/lib/ai-http";
type Context={params:Promise<{workspaceId:string}>};
export async function POST(request:Request,context:Context){
  try{const {workspaceId}=await context.params;return draftsResponse({template:await saveContentTemplate(workspaceId,await draftRequestInput(request))});}
  catch(error){return aiErrorResponse(error);}
}
