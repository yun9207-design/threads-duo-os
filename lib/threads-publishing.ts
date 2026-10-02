import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readWorkspace, WorkspaceAccessError } from "@/lib/workspaces";
import { readDraft, DraftAccessError } from "@/lib/drafts";
import { DraftInputError, parseDeleteInput } from "@/lib/drafts-validation";
import { ThreadsApiError, threadsIdentity, publishThreadsText } from "@/lib/threads-api";
import type { DraftRow, ThreadsAccountRow } from "@/lib/supabase/database.types";
import { threadsCredential, threadsServerSecret, threadsOAuthConfig, threadsOwner, maintainThreadsAccount, ThreadsAccountError } from "./threads-accounts";

export type ThreadsConnection = { account: ThreadsAccountRow | null; configured: boolean; error: string; oauthConfigured?: boolean };

export class PublishingError extends Error {
  constructor(message: string, public readonly status = 503) { super(message); }
}

export function parsePublishInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => key !== "expectedUpdatedAt")) {
    throw new DraftInputError("게시 입력을 확인해 주세요.");
  }
  return parseDeleteInput(value);
}

export async function threadsConnection(workspaceId: string): Promise<ThreadsConnection> {
  await readWorkspace(workspaceId);
  const client = await createClient();
  if (!client) throw new DraftAccessError(503);
  const result = await client.from("threads_accounts").select("*").eq("workspace_id", workspaceId).maybeSingle();
  const account = result.data;
  let configured = false;
  try { threadsServerSecret(workspaceId); configured = !!account && ["connected","expiring","permission_required"].includes(account.connection_status)
    && ["threads_basic","threads_content_publish"].every(p=>account.granted_permissions.includes(p)) && !!account.token_expires_at && Date.parse(account.token_expires_at)>Date.now(); } catch {}
  return { account, configured, oauthConfigured: !!threadsOAuthConfig(),
    error: result.error ? "Threads 연결 정보를 불러오지 못했습니다." : "" };
}

async function operation(workspaceId: string, name: string, args: {
  draftId?: string; version?: string; attemptId?: string;
  data?: Record<string, string | boolean>;
}) {
  const secret = threadsServerSecret(workspaceId);
  const client = await createClient();
  if (!client) throw new DraftAccessError(503);
  const result = await client.rpc("threads_publish_operation", {
    p_workspace_id: workspaceId, p_secret: secret, p_operation: name,
    p_draft_id: args.draftId, p_expected_updated_at: args.version,
    p_attempt_id: args.attemptId, p_data: args.data ?? {},
  });
  if (result.error) {
    if (result.error.code === "P0002") throw new DraftAccessError(404);
    if (result.error.code === "55000") throw new PublishingError("글이 변경됐거나 게시 중·게시완료 상태입니다. 목록을 다시 불러와 주세요.", 409);
    if (result.error.code === "22023") throw new DraftInputError("저장된 본문과 Threads 계정 정보를 확인해 주세요.");
    throw new PublishingError("Threads 게시 설정 또는 결과를 저장할 수 없습니다.");
  }
  return result.data;
}

export async function connectThreads(workspaceId: string) {
  await threadsOwner(workspaceId);
  return maintainThreadsAccount(workspaceId);
}

export async function publishDraft(workspaceId: string, draftId: string, expectedUpdatedAt: string) {
  await readDraft(workspaceId, draftId);
  const connection = await threadsConnection(workspaceId);
  if (!connection.configured || !connection.account || connection.error) throw new PublishingError("Threads 계정을 먼저 연결해 주세요.");
  const config = await threadsCredential(workspaceId);
  const identity = await threadsIdentity(config.token);
  if (identity.userId !== connection.account.threads_user_id) throw new PublishingError("토큰과 게시 계정이 다릅니다. 같은 계정으로 다시 연결해 주세요.",409);
  const claimed = await operation(workspaceId, "claim", { draftId, version: expectedUpdatedAt }) as DraftRow;
  if (!claimed.publish_attempt_id) throw new PublishingError("게시 시도를 저장하지 못했습니다.");
  const args = { draftId, attemptId: claimed.publish_attempt_id };
  await publishThreadsText(config.token, identity.userId, claimed.body, {
    saveContainer: async (containerId) => { await operation(workspaceId, "container", { ...args, data: { container_id: containerId } }); },
    savePublished: async (postId) => {
      // Retry only the idempotent DB result write, never Meta's publish POST.
      for (let attempt = 0; ; attempt++) {
        try { await operation(workspaceId, "published", { ...args, data: { post_id: postId } }); return; }
        catch (error) { if (attempt === 2) throw error; }
      }
    },
    savePublishing: async () => { await operation(workspaceId,"publishing",args); },
    saveTest: async () => { await operation(workspaceId,"test_completed",args); },
    saveFailure: async (error, retryable, details) => { await operation(workspaceId, "failed", { ...args,
      data: { error, retryable, code: details?.code??"UNKNOWN", transient: details?.transient??false } }); },
  },fetch,undefined,claimed.publish_mode??"TEST");
  return readDraft(workspaceId, draftId);
}

export function publishingFailure(error: unknown) {
  if (error instanceof ThreadsAccountError) return {error:error.message,status:error.status};
  if (error instanceof WorkspaceAccessError) return { error: error.message, status: error.status };
  if (error instanceof PublishingError) return { error: error.message, status: error.status };
  if (error instanceof ThreadsApiError) return { error: error.message, status: 502 };
  return null;
}
