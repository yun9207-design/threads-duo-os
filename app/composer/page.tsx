import { ProductPage } from "@/lib/product-page";
export const dynamic="force-dynamic";
export default async function ComposerPage({searchParams}:{searchParams:Promise<{draft?:string;copy?:string;mode?:string}>}){
  const params=await searchParams;return <ProductPage view="composer" draftId={params.draft} copyId={params.copy} initialSchedule={params.mode==="schedule"}/>;
}
