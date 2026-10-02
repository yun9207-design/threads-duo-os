import "server-only";

import { createClient } from "@/lib/supabase/server";

export type WorkspaceClient={client:NonNullable<Awaited<ReturnType<typeof createClient>>>;userId:string};

export class WorkspaceAccessError extends Error {
  constructor(public readonly status: 401 | 404 | 503) {
    super(
      status === 401
        ? "로그인이 필요합니다."
        : status === 404
          ? "워크스페이스를 찾을 수 없습니다."
          : "워크스페이스를 불러올 수 없습니다.",
    );
  }
}

async function authenticatedClient() {
  const client = await createClient();
  if (!client) throw new WorkspaceAccessError(503);

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new WorkspaceAccessError(401);
  return { client, userId: data.user.id };
}

export async function listWorkspaces(context?:WorkspaceClient) {
  const { client } = context??await authenticatedClient();
  // The session's JWT reaches the Data API. RLS supplies the membership boundary.
  const { data, error } = await client
    .from("workspaces")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new WorkspaceAccessError(503);
  return data;
}

export async function readWorkspace(workspaceId: string,context?:WorkspaceClient) {
  const { client, userId } = context??await authenticatedClient();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) {
    throw new WorkspaceAccessError(404);
  }

  const [workspaceResult,membersResult] = await Promise.all([client
    .from("workspaces")
    .select("id, name, created_at")
    .eq("id", workspaceId)
    .maybeSingle(),client
    .from("workspace_members")
    .select("profile_id, role, joined_at, profiles(id, display_name)")
    .eq("workspace_id", workspaceId)
    .order("joined_at", { ascending: true })]);
  const {data:workspace,error:workspaceError}=workspaceResult;
  if (workspaceError) throw new WorkspaceAccessError(503);
  // Both inaccessible and nonexistent IDs have the same response.
  if (!workspace) throw new WorkspaceAccessError(404);

  const {data:members,error:membersError}=membersResult;
  if (membersError) throw new WorkspaceAccessError(503);
  const membership = members.find((member) => member.profile_id === userId);
  // If membership is revoked between reads, fail closed without returning data.
  if (!membership) throw new WorkspaceAccessError(404);

  return { workspace, role: membership.role, members };
}

export function workspaceResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}

export function workspaceErrorResponse(error: unknown) {
  const accessError = error instanceof WorkspaceAccessError
    ? error
    : new WorkspaceAccessError(503);
  // Do not expose SDK errors, identities, tokens, or database internals.
  return workspaceResponse({ error: accessError.message }, accessError.status);
}
