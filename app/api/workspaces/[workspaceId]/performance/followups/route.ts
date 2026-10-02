import {generatePerformanceFollowups} from "@/lib/threads-feedback";
import {draftRequestInput,draftsResponse} from "@/lib/drafts-http";
import {aiErrorResponse} from "@/lib/ai-http";
export const runtime="nodejs";
export const maxDuration=180;
type Context={params:Promise<{workspaceId:string}>};
export async function POST(request:Request,context:Context){try{return draftsResponse(await generatePerformanceFollowups((await context.params).workspaceId,await draftRequestInput(request)));}catch(error){return aiErrorResponse(error);}}
