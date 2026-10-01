import { changeDraft, readDraft } from "@/lib/drafts";
import { parseDraftInput, parseDeleteInput } from "@/lib/drafts-validation";
import { draftRequestInput, draftsErrorResponse, draftsResponse } from "@/lib/drafts-http";

type Context = { params: Promise<{ workspaceId: string; draftId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceId, draftId } = await context.params;
    return draftsResponse({ draft: await readDraft(workspaceId, draftId) });
  } catch (error) { return draftsErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { expectedUpdatedAt, ...content } = parseDraftInput(await draftRequestInput(request), true);
    const { workspaceId, draftId } = await context.params;
    return draftsResponse({ draft: await changeDraft(workspaceId, draftId, expectedUpdatedAt, content) });
  } catch (error) { return draftsErrorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const version = parseDeleteInput(await draftRequestInput(request));
    const { workspaceId, draftId } = await context.params;
    await changeDraft(workspaceId, draftId, version, { deleted_at: new Date().toISOString() });
    return draftsResponse({ deleted: true });
  } catch (error) { return draftsErrorResponse(error); }
}
