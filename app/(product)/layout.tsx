import {ProductDataProvider} from "@/components/product-data-provider";
import {PersistentProductShell} from "@/components/product-shell";
export default function ProductLayout({children}:{children:React.ReactNode}){
  return <ProductDataProvider><PersistentProductShell>{children}</PersistentProductShell></ProductDataProvider>;
}
