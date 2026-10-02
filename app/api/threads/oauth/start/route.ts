import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { threadsAuthorizeUrl } from "@/lib/threads-api";
import { accountOperation, threadsOAuthConfig, threadsOwner, ThreadsAccountError } from "@/lib/threads-accounts";
import { draftRequestInput, draftsErrorResponse, draftsResponse } from "@/lib/drafts-http";
import { isUuid } from "@/lib/drafts-validation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = await draftRequestInput(request) as {workspaceId?: unknown};
    if (!input || typeof input.workspaceId !== "string" || !isUuid(input.workspaceId)) return draftsResponse({error:"워크스페이스를 확인해 주세요."},400);
    await threadsOwner(input.workspaceId);
    const config = threadsOAuthConfig();
    if (!config) return draftsResponse({error:"Meta 앱 설정이 필요합니다. Accounts의 연결 준비 항목을 확인해 주세요."},503);
    // The configured callback must belong to the initiating origin. No arbitrary
    // redirect URI or Host header is ever forwarded to Meta.
    if (new URL(config.redirectUri).origin !== request.headers.get("origin")) return draftsResponse({error:"Production Accounts에서 연결을 시작해 주세요."},400);
    const state = randomBytes(32).toString("base64url");
    await accountOperation(input.workspaceId, "state_create", {hash: createHash("sha256").update(state).digest("hex")});
    (await cookies()).set("threads_oauth", input.workspaceId+"."+state, {httpOnly:true,secure:true,sameSite:"lax",path:"/api/threads/oauth",maxAge:600});
    return draftsResponse({url:threadsAuthorizeUrl(config.appId,config.redirectUri,state)});
  } catch (error) { return error instanceof ThreadsAccountError ? draftsResponse({error:error.message},error.status) : draftsErrorResponse(error); }
}
