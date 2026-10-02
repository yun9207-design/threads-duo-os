"use client";
import {ProductApp,type ProductView} from "@/components/product-app";
import {useProductData} from "@/components/product-data-provider";
import {useLayoutEffect} from "react";
import {finishNavigation} from "@/lib/navigation-metrics";

export type ProductPageProps={view:ProductView;draftId?:string;copyId?:string;initialSchedule?:boolean;initialWritingTab?:"manual"|"ai"|"multiple";initialAiGeneration?:string;initialFill?:boolean;initialConnectionOutcome?:string};
export function ProductLoading(){return <main className="pro-content" aria-busy="true"><section className="pro-card" role="status"><p className="pro-help">화면을 불러오는 중…</p></section></main>;}
export function ProductPage(props:ProductPageProps){
  const store=useProductData(),data=store?.snapshot;
  useLayoutEffect(()=>{if(data)finishNavigation(props.view);},[props.view,data]);
  if(store?.error&&!data)return <main className="pro-content"><section className="pro-card"><h1>워크스페이스를 불러오지 못했습니다.</h1><p>{store.error}</p><button className="pro-button ghost" onClick={store.refresh}>다시 불러오기</button></section></main>;
  if(!data)return <ProductLoading/>;
  return <ProductApp key={props.view+"/"+(props.draftId??props.copyId??"")+"/"+(props.initialWritingTab??"manual")+"/"+(props.initialAiGeneration??"")} {...props}
    embedded email={data.email} workspace={data.workspace} initialDrafts={data.drafts} initialConnection={data.connection} worker={data.worker}
    initialOperations={data.operations} initialPerformance={data.performance} referenceTime={data.referenceTime}/>;
}
