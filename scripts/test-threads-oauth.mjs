import assert from 'node:assert/strict';
import {build} from '../.tools/product-preview/node_modules/esbuild/lib/main.js';
await build({entryPoints:['lib/threads-api.ts'],outfile:'.tools/p3-tests/oauth-api.mjs',bundle:true,platform:'node',format:'esm'});
const api=await import('../.tools/p3-tests/oauth-api.mjs');
const redirect='https://threads-duo-os.vercel.app/api/threads/oauth/callback',authorize=new URL(api.threadsAuthorizeUrl('123',redirect,'one-use-state'));
assert.equal(authorize.origin,'https://threads.net');assert.equal(authorize.searchParams.get('redirect_uri'),redirect);assert.equal(authorize.searchParams.get('state'),'one-use-state');assert.equal(authorize.searchParams.get('scope'),api.THREADS_PERMISSIONS.join(','));
const requests=[];const transport=async(raw,options)=>{const url=new URL(raw);requests.push({url,options});assert.equal(url.origin,'https://graph.threads.com');
 if(url.pathname==='/oauth/access_token'&&options.method==='POST'){assert.equal(url.searchParams.has('client_secret'),false);const form=new URLSearchParams(options.body);assert.equal(form.get('grant_type'),'authorization_code');assert.equal(form.get('redirect_uri'),redirect);assert.equal(form.get('code'),'fixture-code');return Response.json({access_token:'short-fixture'});}
 if(url.pathname==='/access_token'){assert.equal(options.headers.Authorization,'Bearer short-fixture');assert.equal(url.searchParams.get('grant_type'),'th_exchange_token');return Response.json({access_token:'long-fixture',expires_in:5184000});}
 if(url.pathname==='/refresh_access_token'){assert.equal(options.headers.Authorization,'Bearer long-fixture');return Response.json({access_token:'refreshed-fixture',expires_in:5184000});}
 if(url.pathname==='/oauth/access_token'){assert.equal(url.searchParams.get('grant_type'),'client_credentials');return Response.json({access_token:'app-fixture'});}
 if(url.pathname==='/debug_token'){assert.equal(url.searchParams.get('input_token'),'long-fixture');assert.equal(options.headers.Authorization,'Bearer app-fixture');return Response.json({data:{is_valid:true,app_id:'123',scopes:[...api.THREADS_PERMISSIONS,'unrelated']}});}
 throw Error('Unexpected OAuth request');};
const token=await api.exchangeThreadsCode('123','fixture-secret',redirect,'fixture-code',transport);assert.equal(token.token,'long-fixture');assert.ok(Date.parse(token.expiresAt)>Date.now()+59*86400000);
assert.equal((await api.refreshThreadsToken(token.token,transport)).token,'refreshed-fixture');assert.deepEqual(await api.threadsPermissions(token.token,'123','fixture-secret',transport),api.THREADS_PERMISSIONS);
await assert.rejects(api.threadsPermissions('long-fixture','123','fixture-secret',async(raw)=>new URL(raw).pathname==='/debug_token'?Response.json({data:{is_valid:true,app_id:'other',scopes:api.THREADS_PERMISSIONS}}):Response.json({access_token:'app-fixture'})),e=>e.code==='190');
console.log('PASS OAuth official request contract: code exchange, long-lived token, refresh, app-token debug_token permissions and wrong-app rejection. Mock transport; no live Meta authorization claimed.');
