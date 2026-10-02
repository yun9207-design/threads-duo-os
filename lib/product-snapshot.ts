import "server-only";
import {createClient} from "./supabase/server";
import {listWorkspaces,readWorkspace,WorkspaceAccessError} from "./workspaces";
import {listDrafts} from "./drafts";
import {threadsConnection} from "./threads-publishing";
import {queueWorkerStatus} from "./product-data";
import {operationsOverview} from "./content-operations-data";
import {performanceOverview} from "./threads-insights";

// One verified session and membership per request. No shared server/user cache.
export async function productSnapshot(scope:string,workspaceId:string|null,withPerformance:boolean){
  const client=await createClient();if(!client)throw new WorkspaceAccessError(503);
  const {data,error}=await client.auth.getUser();
  if(error||!data.user)throw new WorkspaceAccessError(401);
  const context={client,userId:data.user.id};
  if(!workspaceId){
    const choices=(await listWorkspaces(context)).filter(w=>w.name==="Duo Workspace");
    if(choices.length!==1)throw new WorkspaceAccessError(404);
    workspaceId=choices[0].id;
  }
  const workspace=await readWorkspace(workspaceId,context);
  if(scope==="operations")return {operations:await operationsOverview(workspaceId,client)};
  if(scope==="performance")return {performance:await performanceOverview(workspaceId,client)};
  if(scope==="connection")return {connection:await threadsConnection(workspaceId,client)};
  if(scope==="live"){
    const [drafts,worker]=await Promise.all([listDrafts(workspaceId,context),queueWorkerStatus(workspaceId,client)]);
    return {drafts,worker,referenceTime:new Date().toISOString()};
  }
  const accountRows=Promise.resolve(client.from("threads_accounts").select("*").eq("workspace_id",workspaceId)).then(result=>{
    if(result.error)throw new WorkspaceAccessError(503);return result.data;
  });
  const [drafts,connection,worker,operations,performance]=await Promise.all([
    listDrafts(workspaceId,context),threadsConnection(workspaceId,client,accountRows),queueWorkerStatus(workspaceId,client),
    scope==="initial"?operationsOverview(workspaceId,client,accountRows):Promise.resolve(undefined),
    withPerformance?performanceOverview(workspaceId,client):Promise.resolve(undefined),
  ]);
  return {email:data.user.email??"사용자",userId:data.user.id,workspace,drafts,connection,worker,
    ...(operations?{operations}:{}),...(performance?{performance}:{}),referenceTime:new Date().toISOString()};
}
