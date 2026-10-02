import {performanceOverview,syncThreadsInsights} from "@/lib/threads-insights";
import {draftRequestInput,draftsResponse,draftsErrorResponse} from "@/lib/drafts-http";
import {ThreadsAccountError} from "@/lib/threads-accounts";
export const runtime="nodejs";
export const maxDuration=90;
type Context={params:Promise<{workspaceId:string}>};
const failure=(error:unknown)=>error instanceof ThreadsAccountError?draftsResponse({error:error.message},error.status):draftsErrorResponse(error);
export async function GET(_request:Request,context:Context){try{return draftsResponse(await performanceOverview((await context.params).workspaceId));}catch(error){return failure(error);}}
export async function POST(request:Request,context:Context){try{const input=await draftRequestInput(request);if(!input||typeof input!=="object"||Object.keys(input).length)return draftsResponse({error:"수집 입력을 확인해 주세요."},400);return draftsResponse(await syncThreadsInsights((await context.params).workspaceId));}catch(error){return failure(error);}}
