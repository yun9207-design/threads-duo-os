import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isUuid, type DraftContent } from "@/lib/drafts-validation";
import { listWorkspaces, readWorkspace } from "@/lib/workspaces";

export type DraftWorkspace = Awaited<ReturnType<typeof readWorkspace>>;

export class DraftAccessError extends Error {
  constructor(public readonly status: 401 | 404 | 409 | 503) {
    super(status === 401 ? "로그인이 필요합니다."
      : status === 404 ? "글 또는 워크스페이스를 찾을 수 없습니다."
      : status === 409 ? "다른 사용자가 글을 변경했습니다. 목록을 새로 불러온 뒤 다시 수정해 주세요."
      : "글을 불러오거나 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }
}

async function workspaceClient(workspaceId: string) {
  const client = await createClient();
  if (!client) throw new DraftAccessError(503);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new DraftAccessError(401);
  if (!isUuid(workspaceId)) throw new DraftAccessError(404);
  const result = await client.from("workspace_members").select("profile_id")
    .eq("workspace_id", workspaceId).eq("profile_id", data.user.id).maybeSingle();
  if (result.error) throw new DraftAccessError(503);
  if (!result.data) throw new DraftAccessError(404);
  return { client, userId: data.user.id };
}

export async function currentDraftWorkspace(): Promise<DraftWorkspace> {
  const workspaces = await listWorkspaces();
  // The display name chooses the current Duo workspace; RLS still enforces access.
  // Do not silently choose a private test workspace if Duo has not been provisioned.
  const matches = workspaces.filter((item) => item.name === "Duo Workspace");
  if (matches.length !== 1) throw new DraftAccessError(404);
  const workspace = matches[0];
  return readWorkspace(workspace.id);
}

export async function listDrafts(workspaceId: string) {
  const { client } = await workspaceClient(workspaceId);
  // Page through Data API limits so the list and counts reflect all saved drafts.
  const drafts = [];
  for (let start = 0; ; start += 100) {
    const { data, error } = await client.from("drafts").select("*")
      .eq("workspace_id", workspaceId).is("deleted_at", null)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(start, start + 99);
    if (error) throw new DraftAccessError(503);
    drafts.push(...data);
    if (data.length < 100) return drafts;
  }
}

export async function readDraft(workspaceId: string, draftId: string) {
  const { client } = await workspaceClient(workspaceId);
  if (!isUuid(draftId)) throw new DraftAccessError(404);
  const { data, error } = await client.from("drafts").select("*")
    .eq("workspace_id", workspaceId).eq("id", draftId).is("deleted_at", null).maybeSingle();
  if (error) throw new DraftAccessError(503);
  if (!data) throw new DraftAccessError(404);
  return data;
}

export async function createDraft(workspaceId: string, content: DraftContent) {
  const { client, userId } = await workspaceClient(workspaceId);
  const { data, error } = await client.from("drafts")
    .insert({ ...content, workspace_id: workspaceId, author_profile_id: userId }).select("*").single();
  if (error || !data) throw new DraftAccessError(503);
  return data;
}

export async function changeDraft(workspaceId: string, draftId: string, expectedUpdatedAt: string,
  changes: DraftContent | { deleted_at: string }) {
  const { client } = await workspaceClient(workspaceId);
  if (!isUuid(draftId)) throw new DraftAccessError(404);
  const { data, error } = await client.from("drafts").update(changes)
    .eq("workspace_id", workspaceId).eq("id", draftId).eq("updated_at", expectedUpdatedAt)
    .is("deleted_at", null).select("*").maybeSingle();
  if (error) throw new DraftAccessError(503);
  if (!data) {
    await readDraft(workspaceId, draftId); // Same generic 404 for absent/inaccessible rows.
    throw new DraftAccessError(409);
  }
  return data;
}
