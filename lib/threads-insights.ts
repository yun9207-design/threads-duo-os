import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Database,Json} from "./supabase/database.types";
import {aiClient} from "./ai-data";
import {threadsServerSecret,threadsCredential,ThreadsAccountError} from "./threads-accounts";
import {collectThreadsMetrics,ThreadsApiError} from "./threads-api";
import type {PerformanceData} from "./threads-performance";
type Claim={post:{id:string;draftId:string;accountId:string;afterHours:number;postId:string}|null;account:{id:string;userId:string;date:string}|null};
export async function performanceOverview(workspaceId:string):Promise<PerformanceData>{
 const db=await aiClient(workspaceId),[posts,accounts]=await Promise.all([
 db.from("threads_post_insight_snapshots").select("*").eq("workspace_id",workspaceId).order("fetched_at",{ascending:false}).limit(1000),
 db.from("account_insight_snapshots").select("*").eq("workspace_id",workspaceId).order("date",{ascending:false}).limit(366)]);
 if(posts.error||accounts.error)throw new ThreadsAccountError("성과 데이터를 불러오지 못했습니다.");
 return {posts:posts.data!,accounts:accounts.data!,truncated:posts.data!.length===1000||accounts.data!.length===366};
}
export async function syncThreadsInsights(workspaceId:string,client?:SupabaseClient<Database>,capability?:string){
 const secret=capability??threadsServerSecret(workspaceId),db=client??await aiClient(workspaceId);
 const op=async(operation:string,data:unknown={})=>{const result=await db.rpc("threads_insight_operation",{p_workspace_id:workspaceId,p_secret:secret,p_operation:operation,p_data:JSON.parse(JSON.stringify(data)) as Json});
 if(result.error)throw new ThreadsAccountError("Insights 수집 결과를 저장하지 못했습니다.");return result.data;};
 const claim=await op("claim") as Claim|null;if(!claim)return {status:"waiting",collected:0};
 const credential=await threadsCredential(workspaceId,db,secret);let collected=0;
 if(claim.post){try{const result=await collectThreadsMetrics(credential.token,claim.post.postId);
   await op("complete",{jobId:claim.post.id,...result});collected++;}
 catch(error){await op("failed",{jobId:claim.post.id,transient:error instanceof ThreadsApiError&&error.transient});}}
 if(claim.account){try{const result=await collectThreadsMetrics(credential.token,claim.account.userId,true,claim.account.date);
   await op("account",{date:claim.account.date,...result});collected++;}
 catch{ /* No synthetic account row is stored on an unsuccessful request. */ }}
 return {status:collected?"collected":"waiting",collected};
}
