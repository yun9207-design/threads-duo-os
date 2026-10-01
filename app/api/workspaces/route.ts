import { listWorkspaces, workspaceErrorResponse, workspaceResponse } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return workspaceResponse({ workspaces: await listWorkspaces() });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
