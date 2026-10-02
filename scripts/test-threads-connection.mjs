// Only the changed publishing permission contract and cache boundaries.
import assert from 'node:assert/strict';
import {build} from '../.tools/product-preview/node_modules/esbuild/lib/main.js';
import {productFixture} from './test-pro-product.mjs';
await build({entryPoints:['lib/product-cache-policy.ts','lib/client-read-cache.ts'],bundle:true,platform:'node',format:'esm',outdir:'.tools/p3-tests/connection',outExtension:{'.js':'.mjs'}});
const {PRODUCT_RESOURCE_SCOPES,freshProductFields}=await import('../.tools/p3-tests/connection/product-cache-policy.mjs');
const {ClientReadCache}=await import('../.tools/p3-tests/connection/client-read-cache.mjs');
const before={drafts:0,worker:0,connection:0,operations:0,performance:0};
const pending={connection:{account:'old'},drafts:['unchanged'],operations:{templates:['unchanged']}};
assert.deepEqual(freshProductFields(pending,before,{...before,connection:1}),{drafts:['unchanged'],operations:{templates:['unchanged']}});
assert.equal(PRODUCT_RESOURCE_SCOPES.connection,'connection');assert.equal(PRODUCT_RESOURCE_SCOPES.drafts,'live');
const cache=new ClientReadCache();for(const key of ['live','operations','performance','connection'])cache.seed(key);
cache.invalidate(PRODUCT_RESOURCE_SCOPES.connection);
for(const key of ['live','operations','performance'])assert.equal(cache.isFresh(key,120000),true);
cache.seed('connection');cache.invalidate(PRODUCT_RESOURCE_SCOPES.drafts);assert.equal(cache.isFresh('connection',120000),true);assert.equal(cache.isFresh('operations',120000),true);
const {db,workspace,secret}=await productFixture();
try{
 const operation=async(name,data)=>(await db.query('select public.threads_account_operation($1,$2,$3,$4::jsonb) value',[workspace,secret,name,JSON.stringify(data)])).rows[0].value;
 const connection={userId:'123456789',username:'product_fixture',envelope:'v1.'+'x'.repeat(100),expiresAt:new Date(Date.now()+60*86400000).toISOString()};
 let account=await operation('connect',{...connection,permissions:['threads_basic']});assert.equal(account.connection_status,'permission_required');
 account=await operation('connect',{...connection,permissions:['threads_basic','threads_content_publish']});assert.equal(account.connection_status,'connected');assert.equal(account.publishing_mode,'TEST');
 assert.ok(!('envelope' in account));
 account=await operation('mode',{mode:'LIVE',confirmation:'LIVE'});assert.equal(account.publishing_mode,'LIVE');
 console.log('PASS: publishing-only permissions connect and enable LIVE; missing publish permission stays blocked; connection and draft caches remain isolated; old in-flight connection cannot replace a mutation. Isolated DB, no actual Meta post.');
}finally{await db.close();}
