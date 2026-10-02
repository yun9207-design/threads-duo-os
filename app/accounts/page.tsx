import { ProductPage } from "@/lib/product-page";
export const dynamic="force-dynamic";
export default async function AccountsPage({searchParams}:{searchParams:Promise<{connection?:string|string[]}>}){const {connection}=await searchParams;return <ProductPage view="accounts" initialConnectionOutcome={typeof connection==="string"?connection:undefined}/>;}
