import "server-only";
import {collectThreadsMetrics,ThreadsApiError} from "./threads-api";

// The one collector boundary. A missing credential never yields synthetic data.
export class ThreadsInsightsClient{
 constructor(private readonly token:string,private readonly transport:typeof fetch=fetch){}
 post(postId:string){return this.collect(postId,false);}
 account(userId:string,date:string){return this.collect(userId,true,date);}
 private collect(id:string,account:boolean,date?:string){
  if(!this.token)throw new ThreadsApiError("Threads Insights 연결 후 제공",false,"META_REQUIRED");
  return collectThreadsMetrics(this.token,id,account,date,this.transport);
 }
}
