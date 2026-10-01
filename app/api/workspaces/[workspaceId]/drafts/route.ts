import { createDraft, listDrafts } from "@/lib/drafts";
import { parseDraftInput } from "@/lib/drafts-validation";
import { draftRequestInput, draftsErrorResponse, draftsResponse } from "@/lib/drafts-http";

type Context = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    return draftsResponse({ drafts: await listDrafts(workspaceId) });
  } catch (error) { return draftsErrorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const content = parseDraftInput(await draftRequestInput(request));
    const { workspaceId } = await context.params;
    return draftsResponse({ draft: await createDraft(workspaceId, content) }, 201);
  } catch (error) { return draftsErrorResponse(error); }
}
