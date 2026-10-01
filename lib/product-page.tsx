import "server-only";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { currentDraftWorkspace,listDrafts } from "@/lib/drafts";
import { threadsConnection } from "@/lib/threads-publishing";
import { queueWorkerStatus } from "@/lib/product-data";
import { ProductApp, type ProductView } from "@/components/product-app";
import { operationsOverview } from "@/lib/content-operations-data";

export async function ProductPage({view,draftId,copyId,initialSchedule,initialWritingTab,initialAiGeneration,initialFill}:{view:ProductView;draftId?:string;copyId?:string;initialSchedule?:boolean;initialWritingTab?:"manual"|"ai"|"multiple";initialAiGeneration?:string;initialFill?:boolean}){
  const user=await getAuthenticatedUser();if(!user)redirect("/login");
  const load=async()=>{
    const workspace=await currentDraftWorkspace();
    const [drafts,connection,worker,operations]=await Promise.all([
      listDrafts(workspace.workspace.id),threadsConnection(workspace.workspace.id),queueWorkerStatus(workspace.workspace.id),
      operationsOverview(workspace.workspace.id),
    ]);
    return {workspace,drafts,connection,worker,operations};
  };
  let data:Awaited<ReturnType<typeof load>>|null=null;
  try{data=await load();}catch{/* Render the recoverable data error outside the loading boundary. */}
  if(!data)return <div className="pro-load-error"><h1>워크스페이스를 불러오지 못했습니다.</h1>
    <p>잠시 후 페이지를 다시 열어 주세요.</p><Link href="/">다시 불러오기</Link><a href="/MASTER_PLAN.html">마스터플랜</a></div>;
  const {workspace,drafts,connection,worker,operations}=data;
  return <ProductApp key={view+"/"+(draftId??copyId??"")+"/"+(initialWritingTab??"manual")+"/"+(initialAiGeneration??"")} view={view} email={user.email??"사용자"}
      workspace={workspace} initialDrafts={drafts} initialConnection={connection} worker={worker} initialOperations={operations} initialFill={initialFill}
      referenceTime={new Date().toISOString()} draftId={draftId} copyId={copyId} initialSchedule={initialSchedule} initialWritingTab={initialWritingTab} initialAiGeneration={initialAiGeneration}/>;
}
