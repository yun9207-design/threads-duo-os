import { aiOverview,generateAi,readAiGeneration } from "@/lib/ai-data";
import { draftRequestInput,draftsResponse } from "@/lib/drafts-http";
import { aiErrorResponse } from "@/lib/ai-http";
export const runtime="nodejs";
export const maxDuration=180;
type Context={params:Promise<{workspaceId:string}>};
export async function GET(request:Request,context:Context){
  try{const {workspaceId}=await context.params;const id=new URL(request.url).searchParams.get("generation");
    return draftsResponse(id?await readAiGeneration(workspaceId,id):await aiOverview(workspaceId));
  }catch(error){return aiErrorResponse(error);}
}
export async function POST(request:Request,context:Context){
  try{const {workspaceId}=await context.params;return draftsResponse(await generateAi(workspaceId,await draftRequestInput(request)));}
  catch(error){return aiErrorResponse(error);}
}
