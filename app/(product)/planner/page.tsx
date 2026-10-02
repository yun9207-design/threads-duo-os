import {ProductPage} from "@/lib/product-page";
export default async function Page({searchParams}:{searchParams:Promise<{fill?:string}>}){return <ProductPage view="planner" initialFill={(await searchParams).fill==="1"}/>;}
