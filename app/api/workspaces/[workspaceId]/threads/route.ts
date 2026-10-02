import { connectThreads, threadsConnection, threadsConnectionMetadata, publishingFailure } from "@/lib/threads-publishing";
import type {ThreadsAccountRow} from "@/lib/supabase/database.types";
import { draftRequestInput, draftsErrorResponse, draftsResponse } from "@/lib/drafts-http";
import { DraftInputError } from "@/lib/drafts-validation";
import {accountOperation,threadsOwner} from "@/lib/threads-accounts";

export const runtime = "nodejs";
type Context = { params: Promise<{ workspaceId: string }> };

function failure(error: unknown) {
  const result = publishingFailure(error);
  return result ? draftsResponse({ error: result.error }, result.status) : draftsErrorResponse(error);
}

export async function GET(_request: Request, context: Context) {
  try { return draftsResponse(await threadsConnection((await context.params).workspaceId)); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const input = await draftRequestInput(request);
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) {
      throw new DraftInputError("계정 연결 입력을 확인해 주세요.");
    }
    const {workspaceId}=await context.params;
    return draftsResponse(threadsConnectionMetadata(workspaceId,await connectThreads(workspaceId)));
  } catch (error) { return failure(error); }
}
export async function PATCH(request:Request,context:Context){
  try {
    const {workspaceId}=await context.params;await threadsOwner(workspaceId);
    const input=await draftRequestInput(request) as {action?:string;mode?:string;confirmation?:string};
    if(!input || !["mode","disconnect"].includes(input.action??"") || Object.keys(input).some(k=>!["action","mode","confirmation"].includes(k)))
      throw new DraftInputError("계정 작업을 확인해 주세요.");
    const account=await accountOperation(workspaceId,input.action!,{mode:input.mode,confirmation:input.confirmation}) as ThreadsAccountRow|null;
    return draftsResponse(threadsConnectionMetadata(workspaceId,account));
  }catch(error){return failure(error);}
}
