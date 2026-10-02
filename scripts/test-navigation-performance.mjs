import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {build} from '../.tools/product-preview/node_modules/esbuild/lib/main.js';
await mkdir('.tools/navigation-tests',{recursive:true});
await build({entryPoints:['lib/client-read-cache.ts','lib/calendar-index.ts'],bundle:true,platform:'node',format:'esm',outdir:'.tools/navigation-tests'});
const {ClientReadCache}=await import('../.tools/navigation-tests/client-read-cache.js');
const {calendarIndex}=await import('../.tools/navigation-tests/calendar-index.js');
await build({entryPoints:['lib/content-operations.ts'],bundle:true,platform:'node',format:'esm',outfile:'.tools/navigation-tests/operations.js'});
const {calendarStatus,recurringSlots}=await import('../.tools/navigation-tests/operations.js');
const cache=new ClientReadCache();let calls=0,resolve;
const load=()=>{calls++;return new Promise(r=>resolve=r);};
const reads=[cache.read('workspace',10000,load),cache.read('workspace',10000,load)];resolve({name:'Duo'});
assert.deepEqual(await Promise.all(reads),[{name:'Duo'},{name:'Duo'}]);assert.equal(calls,1);
await cache.read('workspace',10000,load);assert.equal(calls,1);
assert.notEqual(new ClientReadCache(),cache,'cache is owned by its session');
cache.invalidate('workspace');const next=cache.read('workspace',10000,load);resolve({name:'Updated'});await next;assert.equal(calls,2);
await assert.rejects(cache.read('failed',1000,()=>Promise.reject(new Error('offline'))));
assert.equal(await cache.read('failed',1000,async()=>true),true,'errors can recover');
cache.seed('live');assert.ok(cache.isFresh('live',30000));
const drafts=Array.from({length:5000},(_,i)=>({id:String(i),category_id:i%2?'one':'two',publication_status:i%3?'unpublished':'failed',
  scheduled_at:i%4?new Date(Date.UTC(2026,9,1+i%40,1)).toISOString():null,published_at:null,created_at:new Date(Date.UTC(2026,9,1+i%40)).toISOString()}));
const recurrences=[{id:'recurrence',name:'slot',enabled:true,days:[1,3,5],time_of_day:'10:00',category_id:'one',start_date:'2026-10-01',end_date:null}];
let indexTime=0,scanTime=0;
for(const mode of ['month','week'])for(const category of ['', 'one'])for(const status of ['', 'Scheduled','Failed']){
  let start=performance.now();const index=calendarIndex('2026-10-15',mode,drafts,recurrences,category,status);indexTime+=performance.now()-start;
  const slots=recurringSlots(recurrences,index.days[0],index.days.at(-1));start=performance.now();
  for(const day of index.days){
    const expected=drafts.filter(d=>new Date(Date.parse(d.scheduled_at??d.published_at??d.created_at)+9*3600000).toISOString().slice(0,10)===day&&(!category||d.category_id===category)&&(!status||calendarStatus(d)===status));
    assert.deepEqual((index.byDay.get(day)??[]).map(d=>d.id),expected.map(d=>d.id));
    const expectedSlots=status?[]:slots.filter(s=>new Date(Date.parse(s.at)+9*3600000).toISOString().slice(0,10)===day&&(!category||s.schedule.category_id===category)&&!drafts.some(d=>d.scheduled_at&&Date.parse(d.scheduled_at)===Date.parse(s.at)));
    assert.deepEqual((index.slotsByDay.get(day)??[]).map(s=>s.at),expectedSlots.map(s=>s.at));
  }
  scanTime+=performance.now()-start;
}
console.log(JSON.stringify({cache:'in-flight deduplication, TTL, invalidation, recovery passed',calendar:'5000 rows: month/week/category/status/recurrence results preserved',indexMs:Math.round(indexTime),scanMs:Math.round(scanTime)}));
