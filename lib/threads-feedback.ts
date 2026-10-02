import "server-only";
import {aiClient,generateAi} from "./ai-data";
import {performanceOverview} from "./threads-insights";
import {engagementRate,engagementScore,latestInsights,winningPatterns} from "./threads-performance";
import {categoryId,CATEGORY_PURPOSE} from "./content-operations";
import {DraftInputError} from "./drafts-validation";
import type {Category} from "./content-operations";
import type {Json} from "./supabase/database.types";
export async function plannerFeedback(workspaceId:string,categories:Category[]){
 const client=await aiClient(workspaceId),[performance,drafts]=await Promise.all([performanceOverview(workspaceId),client.from("drafts").select("*").eq("workspace_id",workspaceId).eq("publication_status","published").order("published_at",{ascending:false}).limit(500)]);
 if(drafts.error)throw new DraftInputError("실제 성과 기록을 불러오지 못했습니다.");
 const pattern=winningPatterns(drafts.data!,performance.posts,categories);
 return {status:pattern.enough?"observed":"insufficient",sample:pattern.sample,
 categories:pattern.categories.slice(0,3),lengths:pattern.lengths.slice(0,3),times:pattern.times.slice(0,3),replyStyles:pattern.replyStyles.slice(0,3),topics:pattern.topics,
 accountTimes:pattern.byAccount,recentTopics:drafts.data!.slice(0,30).map(d=>({topic:d.topic,excerpt:d.body.slice(0,100)}))};
}
export async function generatePerformanceFollowups(workspaceId:string,value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).some(k=>!["draftId","requestId","count"].includes(k)))throw new DraftInputError("후속 글 입력을 확인해 주세요.");
 const input=value as Record<string,unknown>,id=categoryId(input.draftId),requestId=categoryId(input.requestId),count=Number(input.count);
 if(!id||!requestId||![3,5,10].includes(count))throw new DraftInputError("게시물과 후속 글 수를 확인해 주세요.");
 const client=await aiClient(workspaceId),[draft,performance,categories]=await Promise.all([
 client.from("drafts").select("*").eq("workspace_id",workspaceId).eq("id",id).eq("publication_status","published").maybeSingle(),performanceOverview(workspaceId),client.from("content_categories").select("*").eq("workspace_id",workspaceId)]);
 if(draft.error||categories.error||!draft.data)throw new DraftInputError("선택한 실제 게시물을 찾을 수 없습니다.");
 const source=draft.data,insight=latestInsights(performance.posts).get(source.id),score=engagementScore(insight);
 if(!insight||score===null)throw new DraftInputError("실제 반응 지표 수집 후 후속 글을 생성할 수 있습니다.");
 const category=categories.data?.find(c=>c.id===source.category_id)?.name??"미분류";
 const facts={hook:source.body.split(/[\n.!?]/)[0],length:Array.from(source.body).length,paragraphs:source.body.split(/\n\s*\n/).length,
 ending:source.body.split("\n").filter(Boolean).at(-1)??"",question:source.body.includes("?"),category,topic:source.topic,
 metrics:{views:insight.views,likes:insight.likes,replies:insight.replies,reposts:insight.reposts,quotes:insight.quotes,shares:insight.shares},score,engagementRate:engagementRate(insight),snapshotHours:insight.after_hours};
 const result=await generateAi(workspaceId,{requestId,topic:("후속: "+source.topic).slice(0,180),keyPoints:"선택한 실제 게시물에서 새로운 관점과 후속 정보를 발전시킨다.",audience:"원문에 관심을 보인 Threads 독자",purpose:CATEGORY_PURPOSE[category]??"의견",tone:"자연스러운 대화체",mode:"multiple",count,action:"generate",sourceBody:source.body,templateId:"",sourcePostId:null},
 "성과 기반 후속 글 생성입니다. 아래 원문 첫 문장, 길이, 구조, 말투, CTA, 질문 방식, 카테고리, 주제와 실제 반응 패턴을 분석한 뒤 새로운 글을 작성하세요. 관측 점수는 인과관계나 성공 보장이 아닙니다. null은 Unavailable이며 0으로 바꾸지 마세요. 후속 글은 서로 다른 관점, 더 깊은 정보, 반론/질문, Part 2를 섞으세요. 원문 문장을 재배열하거나 문장만 치환한 복제는 금지합니다. 새로운 사실·수치·경험을 꾸며내지 말고 원문에 있는 사실과 일반적 조언만 사용하세요. 각 angle에 구체적인 후속 관점과 선택한 후킹/말투/CTA 전략을 설명하세요. 관측 사실: "+JSON.stringify(facts),
 {operationKind:"performance_followup",sourceDraftId:source.id,sourceInsightId:insight.id,sourceAnalysis:facts as Json});
 return {...result,analysis:facts};
}
