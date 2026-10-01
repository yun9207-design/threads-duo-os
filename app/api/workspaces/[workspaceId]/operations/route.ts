import {operate,operationsOverview} from "@/lib/content-operations-data";
import {draftRequestInput,draftsResponse} from "@/lib/drafts-http";
import {aiErrorResponse} from "@/lib/ai-http";
export const runtime="nodejs";
export const maxDuration=180;
type Context={params:Promise<{workspaceId:string}>};
export async function GET(_request:Request,context:Context){try{return draftsResponse(await operationsOverview((await context.params).workspaceId));}catch(error){return aiErrorResponse(error);}}
export async function POST(request:Request,context:Context){try{return draftsResponse(await operate((await context.params).workspaceId,await draftRequestInput(request,131072)));}catch(error){return aiErrorResponse(error);}}
