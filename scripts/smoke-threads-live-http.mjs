import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.argv[2]??'http://127.0.0.1:3004';
const workspace='efe8e127-ae8b-41af-ab76-2308d3347158',results=[];
async function request(path,method='GET',body){const response=await fetch(base+path,{method,redirect:'manual',headers:body?{'Content-Type':'application/json',Origin:base}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});return {response,body:await response.text()};}
const login=await request('/login');assert.equal(login.response.status,200);assert.ok(login.body.includes('로그인'));results.push({path:'/login',status:200});
const master=await request('/MASTER_PLAN.html');assert.equal(master.response.status,200);const hash=createHash('sha256').update(master.body).digest('hex');assert.equal(hash,createHash('sha256').update(await readFile('MASTER_PLAN.html')).digest('hex'));results.push({path:'/MASTER_PLAN.html',status:200,hash});
for(const path of ['/accounts','/analytics','/bulk']){const {response}=await request(path);assert.ok([303,307].includes(response.status));assert.ok(response.headers.get('location')?.endsWith('/login'));results.push({path,status:response.status,target:'login'});}
// Valid new-route requests reach authorization, not a malformed-input branch.
for(const [path,method,body] of [
 ['/api/threads/oauth/start','POST',{workspaceId:workspace}],
 ['/api/workspaces/'+workspace+'/performance','GET'],
 ['/api/workspaces/'+workspace+'/performance','POST',{}],
 ['/api/workspaces/'+workspace+'/performance/followups','POST',{draftId:crypto.randomUUID(),requestId:crypto.randomUUID(),count:3}],
 ['/api/workspaces/'+workspace+'/import','POST',{csv:'content\nsmoke',action:'preview'}],
]){const {response,body:message}=await request(path,method,body);assert.equal(response.status,401,path+' '+message);assert.match(response.headers.get('cache-control')??'',/no-store/);results.push({path,method,status:response.status,private:true});}
const callback=await request('/api/threads/oauth/callback');assert.equal(callback.response.status,303);assert.equal(new URL(callback.response.headers.get('location')).pathname+new URL(callback.response.headers.get('location')).search,'/accounts?connection=failed');assert.match(callback.response.headers.get('set-cookie')??'',/threads_oauth=.*Max-Age=0/);results.push({path:'/api/threads/oauth/callback',status:303,invalidState:'safely rejected'});
console.log('PASS P3 HTTP smoke: '+JSON.stringify({base,results}));
