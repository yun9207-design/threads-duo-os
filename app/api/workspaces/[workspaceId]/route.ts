import { readWorkspace, workspaceErrorResponse, workspaceResponse } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await context.params;
    return workspaceResponse(await readWorkspace(workspaceId));
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
