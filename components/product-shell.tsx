"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect} from "react";
import {enableNavigationMetrics,beginNavigation} from "@/lib/navigation-metrics";
import {Icon,type IconName} from "./icon";
import {SessionControls} from "./session-controls";
import {useProductData} from "./product-data-provider";
import type {ProductView} from "./product-app";
import type {DraftWorkspace} from "@/lib/drafts";
const navigation: {view:ProductView;href:string;label:string;icon:IconName}[]=[
  {view:"dashboard",href:"/",label:"대시보드",icon:"grid"},
  {view:"composer",href:"/composer",label:"글 작성",icon:"pen"},
  {view:"planner",href:"/planner",label:"주간 플래너",icon:"sparkle"},
  {view:"calendar",href:"/calendar",label:"콘텐츠 캘린더",icon:"calendar"},
  {view:"queue",href:"/queue",label:"예약 큐",icon:"calendar"},
  {view:"history",href:"/history",label:"게시 내역",icon:"clock"},
  {view:"accounts",href:"/accounts",label:"Threads 계정",icon:"settings"},
  {view:"bulk",href:"/bulk",label:"여러 글 등록",icon:"plus"},
  {view:"recurring",href:"/recurring",label:"반복 스케줄",icon:"clock"},
  {view:"categories",href:"/categories",label:"카테고리",icon:"grid"},
  {view:"analytics",href:"/analytics",label:"운영 분석",icon:"chart"},
];

export function ProductShell({view,email,workspace,queueCount,canPublish,children}:{view:ProductView;email:string;workspace:DraftWorkspace|null;queueCount:number;canPublish:boolean;children:React.ReactNode}){
  return <div className="pro-shell">
    <aside className="pro-sidebar">
      <Link href="/" className="pro-brand"><span className="pro-brand-mark">t</span><span>threads<span className="pro-brand-pro">PRO</span><small>YOUR CONTENT, ON TIME.</small></span></Link>
      <div className="pro-workspace"><span>DUO</span><div><strong>{workspace?.workspace.name??"불러오는 중…"}</strong><small>{workspace?workspace.members.length+"명 · "+workspace.role:"잠시만 기다려 주세요."}</small></div></div>
      <p className="pro-nav-caption">WORKSPACE</p>
      <nav aria-label="주 메뉴">{navigation.map((item)=><Link key={item.view} href={item.href} prefetch={true} onNavigate={()=>beginNavigation(item.view)} className={"pro-nav "+(view===item.view?"active":"")}>
        <Icon name={item.icon}/><span>{item.label}</span>{item.view==="queue"&&queueCount>0&&<b>{queueCount}</b>}
      </Link>)}</nav>
      <div className="pro-sidebar-bottom"><div className="pro-sidebar-tip"><Icon name="sparkle" size={19}/><strong>꾸준함을 더 쉽게.</strong><p>좋은 글을 준비하세요.<br/>게시 시간은 큐에 맡기세요.</p></div>
        <a href="/MASTER_PLAN.html" target="_blank" rel="noreferrer" className="pro-plan"><Icon name="book" size={16}/>프로젝트 마스터플랜</a></div>
    </aside>
    <div className="pro-main"><header className="pro-topbar"><span>Workspace <i>/</i> {navigation.find((item)=>item.view===view)?.label}</span>
      <span className={"pro-badge "+(canPublish?"success":"warning")}>{canPublish?"게시 준비 완료":"Meta 계정 연결 필요"}</span></header>
      {email&&<SessionControls email={email}/>}

      {children}
    </div>
  </div>;
}
export function PersistentProductShell({children}:{children:React.ReactNode}){
  useEffect(()=>{enableNavigationMetrics();},[]);
  const pathname=usePathname(),data=useProductData()?.snapshot;
  const view=navigation.find(item=>item.href===pathname)?.view??"dashboard";
  const connection=data?.connection,account=connection?.account;
  const canPublish=!!account&&!!connection?.configured&&!connection.error&&account.token_status!=="invalid";
  return <ProductShell view={view} email={data?.email??""} workspace={data?.workspace??null}
    queueCount={data?.drafts.filter(d=>d.scheduled_at&&d.publication_status!=="published").length??0} canPublish={canPublish}>{children}</ProductShell>;
}
