import { AiProviderError } from "./ai-provider";
import { draftsResponse,draftsErrorResponse } from "./drafts-http";
import { publishingFailure } from "./threads-publishing";
export function aiErrorResponse(error:unknown){
  if(error instanceof AiProviderError)return draftsResponse({error:error.message},error.status);
  const failure=publishingFailure(error);return failure?draftsResponse({error:failure.error},failure.status):draftsErrorResponse(error);
}
