import {productSnapshot} from "@/lib/product-snapshot";
import {workspaceResponse,workspaceErrorResponse} from "@/lib/workspaces";
export const runtime="nodejs";
export async function GET(request:Request){
  const query=new URL(request.url).searchParams;
  const scope=query.get("scope")??"initial";
  if(!["initial","live","connection","operations","performance"].includes(scope))return workspaceResponse({error:"요청을 확인해 주세요."},400);
  try{return workspaceResponse(await productSnapshot(scope,query.get("workspace"),query.get("performance")==="1"));}
  catch(error){return workspaceErrorResponse(error);}
}
