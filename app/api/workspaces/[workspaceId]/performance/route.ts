import {performanceOverview,syncThreadsInsights} from "@/lib/threads-insights";
import {draftRequestInput,draftsResponse} from "@/lib/drafts-http";
import {aiErrorResponse} from "@/lib/ai-http";
export const runtime="nodejs";
export const maxDuration=90;
type Context={params:Promise<{workspaceId:string}>};
export async function GET(_request:Request,context:Context){try{return draftsResponse(await performanceOverview((await context.params).workspaceId));}catch(error){return aiErrorResponse(error);}}
export async function POST(request:Request,context:Context){try{const input=await draftRequestInput(request);if(!input||typeof input!=="object"||Object.keys(input).length)return draftsResponse({error:"수집 입력을 확인해 주세요."},400);return draftsResponse(await syncThreadsInsights((await context.params).workspaceId));}catch(error){return aiErrorResponse(error);}}
