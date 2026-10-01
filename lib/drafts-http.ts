import "server-only";

import { DraftInputError } from "@/lib/drafts-validation";
import { DraftAccessError } from "@/lib/drafts";

export function draftsResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}

class DraftRequestError extends Error {
  constructor(public readonly status: 400 | 403 | 413) {
    super(status === 403 ? "허용되지 않은 요청입니다." : "글 입력을 확인해 주세요.");
  }
}

export async function draftRequestInput(request: Request) {
  // Cookie-authenticated mutations accept only same-origin JSON requests.
  const publicUrl = new URL(request.url);
  // Next's internal dev URL can use localhost while the browser uses 127.0.0.1.
  // Compare the browser Origin with the incoming public Host, not that internal alias.
  publicUrl.host = request.headers.get("host") ?? publicUrl.host;
  if (request.headers.get("origin") !== publicUrl.origin) throw new DraftRequestError(403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new DraftRequestError(400);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new DraftRequestError(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        throw new DraftRequestError(413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof DraftRequestError) throw error;
    throw new DraftRequestError(400);
  } finally { reader.releaseLock(); }
}

export function draftsErrorResponse(error: unknown) {
  if (error instanceof DraftInputError) return draftsResponse({ error: error.message }, 400);
  const failure = error instanceof DraftAccessError || error instanceof DraftRequestError
    ? error : new DraftAccessError(503);
  return draftsResponse({ error: failure.message }, failure.status);
}
