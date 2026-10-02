import {inspectPublish,simulatePublish,simulateProductPost} from "@/lib/publish-operations-data";
import {draftRequestInput,draftsErrorResponse,draftsResponse} from "@/lib/drafts-http";
import {publishingFailure} from "@/lib/threads-publishing";
import {DraftInputError} from "@/lib/drafts-validation";
import type {SimulationScenario} from "@/lib/publish-operations";
export const runtime="nodejs";
type Context={params:Promise<{workspaceId:string}>};
export async function POST(request:Request,context:Context){
 try{
  const {workspaceId}=await context.params,input=await draftRequestInput(request) as Record<string,unknown>;
  if(input?.action==="inspect")return draftsResponse(await inspectPublish(workspaceId,input.post));
  if(input?.action==="simulate"&&input.post){
   if(!["success","transient","permanent","ambiguous"].includes(input.scenario as string))throw new DraftInputError("시뮬레이션 유형을 확인해 주세요.");
   return draftsResponse({draft:await simulateProductPost(workspaceId,input.post,input.scenario as SimulationScenario)});
  }
  if(input?.action!=="simulate"||typeof input.draftId!=="string"||typeof input.expectedUpdatedAt!=="string"||typeof input.scenario!=="string")throw new DraftInputError("게시 시뮬레이션 입력을 확인해 주세요.");
  return draftsResponse({draft:await simulatePublish(workspaceId,input.draftId,input.expectedUpdatedAt,input.scenario as SimulationScenario)});
 }catch(error){const failure=publishingFailure(error);return failure?draftsResponse({error:failure.error},failure.status):draftsErrorResponse(error);}
}
