import { changeDraftSchedule } from "@/lib/drafts";
import { parseScheduleInput } from "@/lib/draft-scheduling";
import { draftRequestInput, draftsErrorResponse, draftsResponse } from "@/lib/drafts-http";

type Context = { params: Promise<{ workspaceId: string; draftId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceId, draftId } = await context.params;
    const input = parseScheduleInput(await draftRequestInput(request));
    return draftsResponse({ draft: await changeDraftSchedule(
      workspaceId, draftId, input.expectedUpdatedAt, input.scheduledAt,
    ) });
  } catch (error) { return draftsErrorResponse(error); }
}
