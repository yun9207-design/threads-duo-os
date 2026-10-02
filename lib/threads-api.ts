// Transport only. Credentials are supplied exclusively by threads-publishing.ts (server-only).
// Meta's current sample uses graph.threads.com and the app's default API version.
const API_BASE = "https://graph.threads.com/";
type Fetcher = typeof fetch;
import {POST_METRICS,ACCOUNT_METRICS} from "./threads-performance";

export class ThreadsApiError extends Error {
  constructor(message: string, public readonly ambiguous = false,
    public readonly code: string | null = null, public readonly transient = false) { super(message); }
}

function id(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]+$/.test(value);
}

async function graph(token: string, path: string, params: Record<string, string>, method: "GET" | "POST", transport: Fetcher) {
  const url = new URL(path, API_BASE);
  if (method === "GET") for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await transport(url, {
      method, headers: { ...(token ? {Authorization: "Bearer " + token} : {}), ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      ...(method === "POST" ? {body: new URLSearchParams(params)} : {}), cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(15000),
    });
  } catch {
    // Never retain fetch exceptions, request URLs, tokens, or provider error text.
    throw new ThreadsApiError("Threads 응답을 확인할 수 없습니다.", true, "NETWORK", true);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof data?.error?.code === "number" ? String(data.error.code) : String(response.status);
    const transient = response.status >= 500 || [408,429].includes(response.status) || data?.error?.is_transient === true || [4,17,32,613].includes(Number(code));
    throw new ThreadsApiError("Threads 요청 실패 (HTTP " + response.status + " / code " + code + "). 계정 연결·권한과 본문 제한을 확인해 주세요.",
      response.status >= 500 || response.status === 408, code, transient);
  }
  if (!data || typeof data !== "object" || data.error) {
    throw new ThreadsApiError("Threads 응답 형식을 확인할 수 없습니다.", true);
  }
  return data as Record<string, unknown>;
}

export async function threadsIdentity(token: string, transport: Fetcher = fetch) {
  const data = await graph(token, "me", { fields: "id,username" }, "GET", transport);
  if (!id(data.id) || typeof data.username !== "string" || !data.username || data.username.length > 100) {
    throw new ThreadsApiError("Threads 계정 정보를 확인할 수 없습니다.");
  }
  return { userId: data.id, username: data.username };
}

type PublishCallbacks = {
  saveContainer: (containerId: string) => Promise<void>;
  savePublished: (postId: string) => Promise<void>;
  saveFailure: (message: string, retryable: boolean, details?: {code: string | null; transient: boolean}) => Promise<void>;
  savePublishing?: () => Promise<void>;
  saveTest?: () => Promise<void>;
};

export async function publishThreadsText(token: string, userId: string, text: string,
  callbacks: PublishCallbacks, transport: Fetcher = fetch,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 1000)), mode: "TEST" | "LIVE" = "LIVE") {
  if (!id(userId) || !text.trim()) throw new ThreadsApiError("게시 계정과 본문을 확인해 주세요.");
  let publishSent = false;
  let postId: string | null = null;
  try {
    // Omit auto_publish_text: persist the container before causing an external post.
    const container = await graph(token, userId + "/threads", { media_type: "TEXT", text }, "POST", transport);
    if (!id(container.id)) throw new ThreadsApiError("Threads 컨테이너 ID를 확인할 수 없습니다.", true);
    await callbacks.saveContainer(container.id);
    let ready = false;
    const readyDeadline = Date.now() + 30000;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (Date.now() >= readyDeadline) break;
      const status = await graph(token, container.id, { fields: "id,status" }, "GET", transport);
      if (status.status === "FINISHED") { ready = true; break; }
      if (status.status === "PUBLISHED") {
        publishSent = true;
        throw new ThreadsApiError("이미 게시된 컨테이너입니다.", true);
      }
      if (status.status !== "IN_PROGRESS") throw new ThreadsApiError("Threads 컨테이너를 게시할 수 없습니다.");
      await pause();
    }
    if (!ready) throw new ThreadsApiError("Threads 글 준비가 지연되었습니다. 잠시 후 다시 게시해 주세요.", false, "CONTAINER_PENDING", true);
    if (mode === "TEST") {
      if (!callbacks.saveTest) throw new ThreadsApiError("테스트 결과 저장 설정을 확인해 주세요.");
      await callbacks.saveTest(); return null;
    }
    await callbacks.savePublishing?.();
    publishSent = true;
    const published = await graph(token, userId + "/threads_publish", { creation_id: container.id }, "POST", transport);
    if (!id(published.id)) throw new ThreadsApiError("Threads 게시 결과 ID를 확인할 수 없습니다.", true);
    postId = published.id;
    await callbacks.savePublished(postId);
    return postId;
  } catch (failure) {
    if (postId) {
      // A real post exists. Leave the DB claim locked; do not pretend it is retryable.
      throw new ThreadsApiError("Threads 게시 성공(ID " + postId + ") 후 결과 저장이 지연되었습니다. 재게시하지 말고 관리자에게 알려주세요.");
    }
    const error = failure instanceof ThreadsApiError ? failure : new ThreadsApiError("게시 결과를 저장할 수 없습니다.");
    const retryable = !publishSent || !error.ambiguous;
    const message = retryable ? error.message
      : "게시 응답이 불확실합니다. 중복 게시 방지를 위해 재시도를 차단했습니다. Threads에서 게시 여부를 확인해 주세요.";
    try { await callbacks.saveFailure(message, retryable, {code: error.code, transient: error.transient && retryable}); } catch {
      throw new ThreadsApiError("게시 시도가 잠겨 있습니다. 결과 저장을 확인하기 전에는 재게시할 수 없습니다.");
    }
    throw new ThreadsApiError(message);
  }
}

export const THREADS_PUBLISH_PERMISSIONS = ["threads_basic", "threads_content_publish"] as const;
// Insights remains usable when already granted, but cannot block text publishing.
export const THREADS_PERMISSIONS = [...THREADS_PUBLISH_PERMISSIONS, "threads_manage_insights"] as const;
export function threadsAuthorizeUrl(appId: string, redirectUri: string, state: string) {
  const url = new URL("https://www.threads.com/oauth/authorize");
  url.search = new URLSearchParams({client_id: appId, redirect_uri: redirectUri, response_type: "code",
    scope: THREADS_PUBLISH_PERMISSIONS.join(","), state}).toString();
  return url.toString();
}
async function tokenRequest(path: string, params: Record<string, string>, method: "GET"|"POST", token: string, transport: Fetcher) {
  const data = await graph(token, path, params, method, transport);
  if (typeof data.access_token !== "string" || !data.access_token || /\s/.test(data.access_token))
    throw new ThreadsApiError("Threads 토큰 발급을 확인하지 못했습니다.");
  return data;
}
export async function exchangeThreadsCode(appId: string, appSecret: string, redirectUri: string, code: string, transport: Fetcher = fetch) {
  const short = await tokenRequest("oauth/access_token", {client_id: appId, client_secret: appSecret, redirect_uri: redirectUri,
    grant_type: "authorization_code", code}, "POST", "", transport);
  const long = await tokenRequest("access_token", {grant_type: "th_exchange_token", client_secret: appSecret}, "GET", short.access_token as string, transport);
  const expiry = Number(long.expires_in);
  if (!Number.isFinite(expiry) || expiry <= 0 || expiry > 90*86400) throw new ThreadsApiError("Threads 토큰 만료 정보를 확인하지 못했습니다.");
  return {token: long.access_token as string, expiresAt: new Date(Date.now() + expiry*1000).toISOString()};
}
export async function refreshThreadsToken(token: string, transport: Fetcher = fetch) {
  const result = await tokenRequest("refresh_access_token", {grant_type: "th_refresh_token"}, "GET", token, transport);
  const expiry = Number(result.expires_in);
  if (!Number.isFinite(expiry) || expiry <= 0 || expiry > 90*86400) throw new ThreadsApiError("Threads 토큰 갱신 정보를 확인하지 못했습니다.");
  return {token: result.access_token as string, expiresAt: new Date(Date.now()+expiry*1000).toISOString()};
}
export async function threadsPermissions(token: string, appId: string, appSecret: string, transport: Fetcher = fetch) {
  // Official Threads collection: app access token -> /debug_token. Do not
  // assume Facebook's /me/permissions contract applies to Threads.
  const app = await tokenRequest("oauth/access_token", {grant_type:"client_credentials",client_id:appId,client_secret:appSecret},"GET","",transport);
  const result = await graph(app.access_token as string,"debug_token",{input_token:token},"GET",transport);
  const data = result.data as {is_valid?: boolean; scopes?: unknown; app_id?: string|number}|undefined;
  if (!data?.is_valid || !Array.isArray(data.scopes) || (data.app_id!==undefined && String(data.app_id)!==appId))
    throw new ThreadsApiError("Threads 토큰 권한을 확인할 수 없습니다.",false,"190");
  return data.scopes.filter((p: unknown): p is string => typeof p==="string" && THREADS_PERMISSIONS.some(scope=>scope===p));
}
export function threadsMetricValue(payload: unknown, metric: string, account = false, since?: number, until?: number) {
  if (!payload || typeof payload!=="object" || !Array.isArray((payload as {data?:unknown}).data)) return null;
  const row=((payload as {data:Record<string,unknown>[]}).data).find(r=>r?.name===metric);
  if(!row || row.period!== (account?"day":"lifetime"))return null;
  const total=(row.total_value as {value?:unknown}|undefined)?.value;
  if(typeof total==="number" && Number.isSafeInteger(total) && total>=0)return total;
  if(!Array.isArray(row.values)||!row.values.length)return null;
  const values=row.values as {value?:unknown;end_time?:unknown}[];
  const range=account&&since!==undefined&&until!==undefined?values.filter(v=>typeof v.end_time==="string"&&Date.parse(v.end_time)>since*1000&&Date.parse(v.end_time)<=until*1000):values;
  if(!range.length||range.some(v=>typeof v.value!=="number"||!Number.isSafeInteger(v.value)||v.value<0))return null;
  const value=account?range.reduce((n,v)=>n+(v.value as number),0):range[range.length-1].value as number;
  return Number.isSafeInteger(value)?value:null;
}
export async function collectThreadsMetrics(token: string, id: string, account = false, date?: string, transport: Fetcher = fetch) {
  if(!/^[0-9]+$/.test(id))throw new ThreadsApiError("Insights ID를 확인해 주세요.");
  const names=account?ACCOUNT_METRICS:POST_METRICS,metrics:Record<string,number|null>={},unavailable:Record<string,string>={};
  const since=date?Math.floor(Date.parse(date+"T00:00:00+09:00")/1000):undefined,until=since===undefined?undefined:since+86400;
  // Isolate unsupported metrics; one unavailable field cannot hide every other
  // result. Two small batches bound both request concurrency and total latency.
  for(let start=0;start<names.length;start+=3){await Promise.all(names.slice(start,start+3).map(async metric=>{
    try {const params:Record<string,string>={metric};if(account&&since!==undefined&&until!==undefined&&metric!=="followers_count"){params.since=String(since);params.until=String(until);}
      const data=await graph(token,id+(account?"/threads_insights":"/insights"),params,"GET",
        (url,options)=>transport(url,{...options,signal:AbortSignal.any([options!.signal!,AbortSignal.timeout(8000)])}));
      metrics[metric]=threadsMetricValue(data,metric,account,metric==="followers_count"?undefined:since,metric==="followers_count"?undefined:until);
      if(metrics[metric]===null)unavailable[metric]="Unavailable";
    } catch(error){if(error instanceof ThreadsApiError&&!error.transient&&!["190","10","200"].includes(error.code??"")){metrics[metric]=null;unavailable[metric]="Unavailable";}
      else throw error;}
  }));}
  return {metrics,unavailable};
}
