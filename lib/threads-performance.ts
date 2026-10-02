import type {DraftRow} from "./supabase/database.types";
import type {Category} from "./content-operations";
import {kstInput} from "./draft-scheduling";
export const POST_METRICS=["views","likes","replies","reposts","quotes","shares"] as const;
export const ACCOUNT_METRICS=["views","likes","replies","reposts","quotes","followers_count"] as const;
export type PostMetrics=Record<typeof POST_METRICS[number],number|null>;
export type PostInsight=PostMetrics & {id:string;workspace_id:string;draft_id:string;account_id:string;after_hours:1|6|24|72|168;fetched_at:string;unavailable:Record<string,string>};
export type AccountInsight=Record<typeof ACCOUNT_METRICS[number],number|null>&{workspace_id:string;account_id:string;date:string;fetched_at:string;unavailable:Record<string,string>};
export type PerformanceData={posts:PostInsight[];accounts:AccountInsight[];truncated:boolean};
export const ENGAGEMENT_WEIGHTS={likes:1,replies:3,reposts:4,quotes:4} as const;
export function engagementScore(metrics:PostMetrics|null|undefined){
 if(!metrics||Object.keys(ENGAGEMENT_WEIGHTS).some(k=>metrics[k as keyof typeof ENGAGEMENT_WEIGHTS]===null))return null;
 return Object.entries(ENGAGEMENT_WEIGHTS).reduce((n,[metric,weight])=>n+metrics[metric as keyof typeof ENGAGEMENT_WEIGHTS]!*weight,0);
}
export function engagementRate(metrics:PostMetrics|null|undefined){
 if(!metrics||!metrics.views||Object.keys(ENGAGEMENT_WEIGHTS).some(k=>metrics[k as keyof typeof ENGAGEMENT_WEIGHTS]===null))return null;
 return Object.keys(ENGAGEMENT_WEIGHTS).reduce((n,key)=>n+metrics[key as keyof typeof ENGAGEMENT_WEIGHTS]!,0)/metrics.views*100;
}
export function latestInsights(rows:PostInsight[]){const map=new Map<string,PostInsight>();for(const row of rows){const old=map.get(row.draft_id);if(!old||Date.parse(row.fetched_at)>Date.parse(old.fetched_at))map.set(row.draft_id,row);}return map;}
export function metricTotal(rows:PostMetrics[],metric:keyof PostMetrics){const valid=rows.filter(r=>r[metric]!==null);return {value:valid.length?valid.reduce((n,r)=>n+r[metric]!,0):null,coverage:valid.length,total:rows.length};}
export function rankedPosts(drafts:DraftRow[],insights:PostInsight[],period:"24h"|"7d"|"30d"|"all",sort:"engagement"|"replies"|"reposts"|"views",now=Date.now()){
 const cut=period==="all"?-Infinity:now-({"24h":1,"7d":7,"30d":30}[period]*86400000),latest=latestInsights(insights);
 return drafts.filter(d=>d.publication_status==="published"&&d.published_at&&Date.parse(d.published_at)>=cut).map(d=>({draft:d,insight:latest.get(d.id),score:engagementScore(latest.get(d.id)),rate:engagementRate(latest.get(d.id))}))
 .sort((a,b)=>{const x=sort==="engagement"?a.score:a.insight?.[sort],y=sort==="engagement"?b.score:b.insight?.[sort];return (y??-1)-(x??-1)||Date.parse(b.draft.published_at!)-Date.parse(a.draft.published_at!);});
}
// Observational comparisons, not causal claims: require 10 mature, comparable
// 24h snapshots overall and >=3 observations per group before suggesting it.
export const MIN_PATTERN_SAMPLE=10,MIN_GROUP_SAMPLE=3;
export function winningPatterns(drafts:DraftRow[],rows:PostInsight[],categories:Category[],now=Date.now()){
 const cutoff=now-30*86400000;
 const mature=rows.filter(r=>r.after_hours===24&&engagementScore(r)!==null).flatMap(r=>{
  const d=drafts.find(d=>d.id===r.draft_id&&d.publication_status==="published"&&d.published_at&&Date.parse(d.published_at)>=cutoff);
  if(!d)return [];const local=kstInput(d.published_at!),length=Array.from(d.body).length;
  return [{draft:d,insight:r,score:engagementScore(r)!,category:categories.find(c=>c.id===d.category_id)?.name??"미분류",length:length<100?"100자 미만":length<=180?"100~180자":length<=300?"181~300자":"301~500자",hour:Number(local.slice(11,13)),day:new Date(local.slice(0,10)+"T00:00:00Z").getUTCDay(),question:d.body.includes("?")}];
 });
 const group=(key:(r:typeof mature[number])=>string)=>{
  const map=new Map<string,{total:number;count:number;replies:number}>();for(const r of mature){const name=key(r),v=map.get(name)??{total:0,count:0,replies:0};v.total+=r.score;v.count++;v.replies+=r.insight.replies??0;map.set(name,v);}
  return [...map].filter(([,v])=>v.count>=MIN_GROUP_SAMPLE).map(([label,v])=>({label,count:v.count,score:v.total/v.count,replies:v.replies/v.count})).sort((a,b)=>b.score-a.score);
 };
 const enough=mature.length>=MIN_PATTERN_SAMPLE;
 const accountIds=[...new Set(mature.map(r=>r.insight.account_id))];
 const byAccount=accountIds.map(accountId=>{const subset=mature.filter(r=>r.insight.account_id===accountId),map=new Map<string,{n:number;score:number}>();for(const r of subset){const name=["일","월","화","수","목","금","토"][r.day]+" "+String(r.hour).padStart(2,"0")+":00",v=map.get(name)??{n:0,score:0};v.n++;v.score+=r.score;map.set(name,v);}return {accountId,sample:subset.length,times:subset.length<MIN_PATTERN_SAMPLE?[]:[...map].filter(([,v])=>v.n>=MIN_GROUP_SAMPLE).map(([label,v])=>({label,count:v.n,score:v.score/v.n})).sort((a,b)=>b.score-a.score).slice(0,3)};});
 return {enough,sample:mature.length,categories:enough?group(r=>r.category):[],lengths:enough?group(r=>r.length):[],times:enough?group(r=>["일","월","화","수","목","금","토"][r.day]+" "+String(r.hour).padStart(2,"0")+":00"):[],replyStyles:enough?group(r=>r.question?"질문 포함":"질문 없음").sort((a,b)=>b.replies-a.replies):[],byAccount,
 topics:enough?[...mature].sort((a,b)=>b.score-a.score).slice(0,5).map(r=>({topic:r.draft.topic,score:r.score})):[]};
}
