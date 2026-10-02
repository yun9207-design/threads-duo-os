import {importCsv} from "@/lib/csv-import-data";
import {draftRequestInput,draftsResponse,draftsErrorResponse} from "@/lib/drafts-http";
import {publishingFailure} from "@/lib/threads-publishing";
export const runtime="nodejs";
type Context={params:Promise<{workspaceId:string}>};
export async function POST(request:Request,context:Context){try{const {workspaceId}=await context.params;return draftsResponse(await importCsv(workspaceId,await draftRequestInput(request,131072)));}
 catch(error){const failure=publishingFailure(error);return failure?draftsResponse({error:failure.error},failure.status):draftsErrorResponse(error);}}
