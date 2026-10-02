import "server-only";
import { createClient as createPublicClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { getSupabaseConfig } from "./supabase/config";
import { readWorkspace } from "./workspaces";
import type { Database, Json, ThreadsAccountRow } from "./supabase/database.types";
import { openThreadsToken, sealThreadsToken } from "./threads-crypto";
import { refreshThreadsToken, threadsIdentity, threadsPermissions, ThreadsApiError, THREADS_PUBLISH_PERMISSIONS } from "./threads-api";
export class ThreadsAccountError extends Error {
  constructor(message: string, public readonly status = 503) { super(message); }
}
export function threadsServerSecret(workspaceId: string) {
  const value = process.env.THREADS_PUBLISHING_SECRET?.trim();
  if (process.env.THREADS_WORKSPACE_ID !== workspaceId || !value || !/^[A-Za-z0-9_-]{43,}$/.test(value))
    throw new ThreadsAccountError("Threads 서버 설정을 준비해야 합니다.");
  return value;
}
export function threadsOAuthConfig() {
  const appId = process.env.THREADS_APP_ID?.trim(), appSecret = process.env.THREADS_APP_SECRET?.trim();
  const raw = process.env.THREADS_REDIRECT_URI?.trim();
  if (!appId || !/^[0-9]+$/.test(appId) || !appSecret || !raw) return null;
  try {
    const redirect = new URL(raw);
    if (redirect.protocol !== "https:" || redirect.pathname !== "/api/threads/oauth/callback" || redirect.search || redirect.hash || redirect.username || redirect.password) return null;
    return {appId, appSecret, redirectUri: redirect.href};
  } catch { return null; }
}
export async function accountOperation(workspaceId: string, operation: string, data: unknown = {},
  client?: SupabaseClient<Database>, capability?: string) {
  const secret = capability ?? threadsServerSecret(workspaceId), db = client ?? await createClient();
  if (!db) throw new ThreadsAccountError("계정 정보를 불러올 수 없습니다.");
  const result = await db.rpc("threads_account_operation", {p_workspace_id: workspaceId, p_secret: secret,
    p_operation: operation, p_data: JSON.parse(JSON.stringify(data)) as Json});
  if (result.error) throw new ThreadsAccountError(result.error.code === "55000"
    ? "연결이 만료됐거나 기존 게시 계정과 다릅니다. 같은 계정으로 다시 연결해 주세요."
    : "Threads 연결 정보를 저장할 수 없습니다.", result.error.code === "42501" ? 403 : result.error.code === "55000" ? 409 : 503);
  return result.data;
}
export async function threadsOwner(workspaceId: string) {
  const access = await readWorkspace(workspaceId);
  if (access.role !== "owner") throw new ThreadsAccountError("계정 연결과 LIVE 전환은 owner가 진행할 수 있습니다.", 403);
  return access;
}
export function workerClient() {
  const config = getSupabaseConfig();
  if (!config) throw new ThreadsAccountError("Worker unavailable");
  return createPublicClient<Database>(config.url, config.key, {auth: {persistSession: false, autoRefreshToken: false}});
}
// Never return this object from an HTTP handler. Page/API responses use only
// threads_accounts metadata; the capability and decrypted credential stay here.
export async function threadsCredential(workspaceId: string, client?: SupabaseClient<Database>, capability?: string) {
  const secret = capability ?? threadsServerSecret(workspaceId);
  const result = await accountOperation(workspaceId, "credential", {}, client, secret) as
    {envelope: string; account: ThreadsAccountRow; issuedAt: string}|null;
  if (!result) throw new ThreadsAccountError("Threads 계정을 다시 연결해 주세요.", 409);
  let token: string;
  try { token = openThreadsToken(result.envelope, workspaceId, secret); }
  catch { throw new ThreadsAccountError("토큰을 복원할 수 없습니다. 같은 계정으로 다시 연결해 주세요.", 409); }
  return {token, account: result.account, issuedAt: result.issuedAt, secret};
}
export async function storeThreadsConnection(workspaceId: string, token: string, expiresAt: string) {
  await threadsOwner(workspaceId);
  const secret = threadsServerSecret(workspaceId);
  const config=threadsOAuthConfig();if(!config)throw new ThreadsAccountError("Meta 앱 설정을 준비해야 합니다.");
  const [identity, permissions] = await Promise.all([threadsIdentity(token), threadsPermissions(token,config.appId,config.appSecret)]);
  return await accountOperation(workspaceId, "connect", {userId: identity.userId, username: identity.username,
    envelope: sealThreadsToken(token, workspaceId, secret), expiresAt, permissions}) as ThreadsAccountRow;
}
export async function maintainThreadsAccount(workspaceId: string, client?: SupabaseClient<Database>, capability?: string) {
  const secret = capability ?? threadsServerSecret(workspaceId);
  const config=threadsOAuthConfig();if(!config)throw new ThreadsAccountError("Meta 앱 설정을 준비해야 합니다.");
  let account: ThreadsAccountRow;
  try {
    const credential = await threadsCredential(workspaceId, client, secret);
    account = credential.account;
    let token = credential.token;
    const remaining = account.token_expires_at ? Date.parse(account.token_expires_at) - Date.now() : 0;
    if (remaining > 0 && remaining < 7*86400000 && Date.now() - Date.parse(credential.issuedAt) >= 86400000) {
      const refreshed = await refreshThreadsToken(token); token = refreshed.token;
      account = await accountOperation(workspaceId, "refresh", {envelope: sealThreadsToken(token, workspaceId, secret), expiresAt: refreshed.expiresAt}, client, secret) as ThreadsAccountRow;
    }
    const [identity, permissions] = await Promise.all([threadsIdentity(token), threadsPermissions(token,config.appId,config.appSecret)]);
    if (identity.userId !== account.threads_user_id) throw new ThreadsApiError("게시 계정과 토큰이 다릅니다.", false, "IDENTITY_MISMATCH");
    const status = THREADS_PUBLISH_PERMISSIONS.every(p => permissions.includes(p))
      ? account.token_expires_at && Date.parse(account.token_expires_at)-Date.now()<7*86400000 ? "expiring" : "connected" : "permission_required";
    return await accountOperation(workspaceId, "health", {status, ok: true, permissions}, client, secret) as ThreadsAccountRow;
  } catch (error) {
    // Transient connectivity is not token invalidation. Preserve the last usable
    // state and record a generic health message, then back off maintenance.
    const transient = error instanceof ThreadsApiError && error.transient;
    if (transient) throw new ThreadsAccountError("Threads가 잠시 응답하지 않습니다. 연결 확인을 잠시 후 다시 시도하세요.");
    await accountOperation(workspaceId, "health", {status: error instanceof ThreadsApiError && ["10","200"].includes(error.code??"") ? "permission_required" : "token_error",
      ok: false, code: error instanceof ThreadsApiError ? error.code : "RECONNECT", message: "계정의 토큰 또는 권한을 확인하고 다시 연결해 주세요."}, client, secret);
    throw new ThreadsAccountError("계정의 토큰 또는 권한을 확인하고 다시 연결해 주세요.", 409);
  }
}
