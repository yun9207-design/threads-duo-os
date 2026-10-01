import { publishDraft, parsePublishInput, publishingFailure } from "@/lib/threads-publishing";
import { draftRequestInput, draftsErrorResponse, draftsResponse } from "@/lib/drafts-http";

export const runtime = "nodejs";
export const maxDuration = 120;
type Context = { params: Promise<{ workspaceId: string; draftId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceId, draftId } = await context.params;
    const expectedUpdatedAt = parsePublishInput(await draftRequestInput(request));
    return draftsResponse({ draft: await publishDraft(workspaceId, draftId, expectedUpdatedAt) });
  } catch (error) {
    const result = publishingFailure(error);
    return result ? draftsResponse({ error: result.error }, result.status) : draftsErrorResponse(error);
  }
}
