import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readWorkspace } from "@/lib/workspaces";
import { DraftAccessError } from "@/lib/drafts";
import { DraftInputError, isUuid, parseDeleteInput } from "@/lib/drafts-validation";
import { parseScheduleInput } from "@/lib/draft-scheduling";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database} from "./supabase/database.types";
import { PublishingError } from "@/lib/threads-publishing";

export type PostInput = {
  body: string; mode: "draft" | "now" | "schedule"; draftId?: string; expectedUpdatedAt?: string;
  scheduledAt: string | null; accountId: string | null; allowDuplicate: boolean; categoryId?:string|null;
};

export function parsePostInput(value: unknown): PostInput {
  const allowed = ["body","mode","draftId","expectedUpdatedAt","scheduledAt","accountId","allowDuplicate","categoryId"];
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.includes(key))) throw new DraftInputError("글 입력을 확인해 주세요.");
  const input = value as Record<string, unknown>;
  if (typeof input.body !== "string" || !input.body.trim() || Array.from(input.body).length > 500
    || !["draft","now","schedule"].includes(input.mode as string)) throw new DraftInputError("본문은 1~500자로 작성해 주세요.");
  if (input.draftId !== undefined && (typeof input.draftId !== "string" || !isUuid(input.draftId))) throw new DraftInputError("글 ID를 확인해 주세요.");
  if (input.accountId != null && (typeof input.accountId !== "string" || !isUuid(input.accountId))) throw new DraftInputError("게시 계정을 확인해 주세요.");
  if(input.categoryId!=null&&(typeof input.categoryId!=="string"||!isUuid(input.categoryId)))throw new DraftInputError("카테고리를 확인해 주세요.");
  if (input.allowDuplicate !== undefined && typeof input.allowDuplicate !== "boolean") throw new DraftInputError("중복 게시 확인을 다시 해 주세요.");
  let scheduledAt: string | null = null;
  if (input.mode === "schedule") {
    scheduledAt = parseScheduleInput({ scheduledAt: input.scheduledAt, expectedUpdatedAt: new Date().toISOString() }).scheduledAt;
    if (!scheduledAt) throw new DraftInputError("예약 날짜와 시간을 선택해 주세요.");
  }
  return {
    body: input.body.trim(), mode: input.mode as PostInput["mode"],
    draftId: input.draftId as string | undefined,
    expectedUpdatedAt: input.draftId ? parseDeleteInput({ expectedUpdatedAt: input.expectedUpdatedAt }) : undefined,
    scheduledAt, accountId: input.accountId as string | null ?? null, allowDuplicate: input.allowDuplicate === true,
    ...(input.categoryId!==undefined?{categoryId:input.categoryId as string|null}:{}),
  };
}

async function productClient(workspaceId: string) {
  await readWorkspace(workspaceId);
  const client = await createClient();
  if (!client) throw new DraftAccessError(503);
  return client;
}

function mutationError(code?: string) {
  if (code === "23505") throw new PublishingError("같은 본문의 글이 있습니다. 중복 경고를 확인한 뒤 저장해 주세요.",409);
  if (code === "55000") throw new PublishingError("글이 변경됐거나 게시 중입니다. 최신 목록에서 다시 열어 주세요.",409);
  if (code === "22023" || code === "23514" || code === "23503") throw new DraftInputError("본문·미래 예약시간·게시 계정을 확인해 주세요.");
  throw new PublishingError("글을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export async function saveProductPost(workspaceId: string, input: PostInput) {
  const client = await productClient(workspaceId);
  const result = await client.rpc("save_categorized_posts",{p_workspace_id:workspaceId,p_posts:[input]});
  if (result.error || !result.data?.[0]) mutationError(result.error?.code);
  return result.data![0];
}

export async function saveProductBatch(workspaceId: string, value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) throw new DraftInputError("한 번에 1~30개의 글을 등록할 수 있습니다.");
  const posts = value.map(parsePostInput);
  if (posts.some((post) => post.draftId || post.mode === "now")) throw new DraftInputError("여러 글은 임시저장 또는 전체 예약으로 등록해 주세요.");
  const client = await productClient(workspaceId);
  const result = await client.rpc("save_categorized_posts", { p_workspace_id: workspaceId,
    p_posts: posts.map((post) => ({ body: post.body, mode: post.mode, scheduledAt: post.scheduledAt,
      accountId: post.accountId, allowDuplicate: post.allowDuplicate,...(post.categoryId!==undefined?{categoryId:post.categoryId}:{}) })) });
  if (result.error) mutationError(result.error.code);
  return result.data!;
}

export async function changeProductPost(workspaceId: string, draftId: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["action","expectedUpdatedAt"].includes(key))) throw new DraftInputError("작업 입력을 확인해 주세요.");
  const input = value as Record<string, unknown>;
  if (!["cancel","hide","show"].includes(input.action as string) || !isUuid(draftId)) throw new DraftInputError("작업을 확인해 주세요.");
  const version = parseDeleteInput({ expectedUpdatedAt: input.expectedUpdatedAt });
  const client = await productClient(workspaceId);
  const changes = input.action === "cancel" ? { scheduled_at: null, auto_publish: false }
    : { history_hidden_at: input.action === "hide" ? new Date().toISOString() : null };
  const result = await client.from("drafts").update(changes).eq("workspace_id",workspaceId)
    .eq("id",draftId).eq("updated_at",version).is("deleted_at",null).select("*").maybeSingle();
  if (result.error) mutationError(result.error.code);
  if (!result.data) mutationError("55000");
  return result.data!;
}

export async function queueWorkerStatus(workspaceId: string,verifiedClient?:SupabaseClient<Database>) {
  const client = verifiedClient??await productClient(workspaceId);
  const result = await client.from("queue_worker_status").select("*").eq("workspace_id",workspaceId).maybeSingle();
  return result.data;
}
