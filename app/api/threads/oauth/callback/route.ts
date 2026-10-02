import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { exchangeThreadsCode } from "@/lib/threads-api";
import { accountOperation, storeThreadsConnection, threadsOAuthConfig, threadsOwner } from "@/lib/threads-accounts";
import { isUuid } from "@/lib/drafts-validation";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function GET(request: Request) {
  const config = threadsOAuthConfig(), jar = await cookies();
  const saved = jar.get("threads_oauth")?.value;
  jar.set("threads_oauth","",{httpOnly:true,secure:true,sameSite:"lax",path:"/api/threads/oauth",maxAge:0});
  let outcome = "failed";
  try {
    if (!config || !saved) throw Error();
    const [workspaceId, expected] = saved.split("."), url = new URL(request.url), state = url.searchParams.get("state"), code = url.searchParams.get("code");
    if (!isUuid(workspaceId) || !state || !/^[A-Za-z0-9_-]{43}$/.test(state) || expected?.length !== state.length
      || !timingSafeEqual(Buffer.from(expected),Buffer.from(state))) throw Error();
    await threadsOwner(workspaceId);
    await accountOperation(workspaceId,"state_consume",{hash:createHash("sha256").update(state).digest("hex")});
    if (url.searchParams.has("error")) { outcome="cancelled"; }
    else {
      if (!code || code.length>4096) throw Error();
      const credential = await exchangeThreadsCode(config.appId,config.appSecret,config.redirectUri,code);
      const account=await storeThreadsConnection(workspaceId,credential.token,credential.expiresAt);
      outcome=account.connection_status==="permission_required"?"permission_required":"connected";
    }
  } catch { /* Never echo the code, token, URL, or provider error into the redirect. */ }
  const origin = config ? new URL(config.redirectUri).origin : "https://threads-duo-os.vercel.app";
  return new Response(null,{status:303,headers:{Location:origin+"/accounts?connection="+outcome,
    "Cache-Control":"private, no-store","Referrer-Policy":"no-referrer",Vary:"Cookie"}});
}
