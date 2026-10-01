import { listDraftApprovalHistory } from "@/lib/drafts";
import { draftsErrorResponse, draftsResponse } from "@/lib/drafts-http";

type Context = { params: Promise<{ workspaceId: string; draftId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceId, draftId } = await context.params;
    return draftsResponse({ history: await listDraftApprovalHistory(workspaceId, draftId) });
  } catch (error) { return draftsErrorResponse(error); }
}
