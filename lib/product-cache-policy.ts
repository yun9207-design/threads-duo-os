// A connection mutation must never invalidate drafts, plans or templates.
export const PRODUCT_RESOURCE_SCOPES={drafts:"live",worker:"live",connection:"connection",operations:"operations",performance:"performance"} as const;
export type ProductResource=keyof typeof PRODUCT_RESOURCE_SCOPES;
export type ProductRevisions=Record<ProductResource,number>;
export function freshProductFields<T extends Partial<Record<ProductResource,unknown>>>(result:T,before:ProductRevisions,after:ProductRevisions):T {
  const fresh={...result};
  for(const field of Object.keys(PRODUCT_RESOURCE_SCOPES) as ProductResource[]){
    if(before[field]!==after[field])delete fresh[field];
  }
  return fresh;
}
