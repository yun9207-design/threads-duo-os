import assert from 'node:assert/strict';import {build} from '../.tools/product-preview/node_modules/esbuild/lib/main.js';import {productFixture} from './test-pro-product.mjs';
await build({entryPoints:['lib/csv-import.ts'],outfile:'.tools/p3-tests/csv.mjs',bundle:true,platform:'node',format:'esm'});
const {parseCsv,previewCsv}=await import('../.tools/p3-tests/csv.mjs'),{db,workspace,actor,list}=await productFixture();
try{
 await db.query('insert into public.content_categories(workspace_id,created_by,name,color) values($1,$2,$3,$4)',[workspace,actor,'정보','#5085cb']);
 const category=(await db.query('select id,name from public.content_categories')).rows[0],account=(await db.query('select id,username from public.threads_accounts')).rows[0];
 const context={categories:[category],accounts:[account],templates:[],existingBodies:[]};
 const csv='\uFEFFcontent,category,scheduled_at,account,template\r\n"쉼표, 따옴표 ""한 가지""\n두 줄 본문",정보,2099-10-15 10:00,@'+account.username+',info\r\n임시 글,,,,\r\n오류 행,없는 카테고리,,,없는 템플릿';
 const preview=previewCsv(csv,context);assert.equal(preview.length,3);assert.equal(preview[0].content,'쉼표, 따옴표 "한 가지"\n두 줄 본문');assert.deepEqual(preview[0].errors,[]);assert.equal(preview[0].post.scheduledAt,'2099-10-15T01:00:00.000Z');assert.equal(preview[1].post.mode,'draft');assert.equal(preview[2].errors.length,2);
 assert.throws(()=>parseCsv('content\n"unclosed'));assert.throws(()=>parseCsv('content,unexpected\none,x'));assert.throws(()=>parseCsv('content\n'+Array.from({length:31},(_,i)=>'row'+i).join('\n')));assert.throws(()=>parseCsv('content\n'+"가".repeat(23000)));
 assert.ok(previewCsv('content,scheduled_at\na,2099-02-31 10:00',context)[0].errors.length);assert.ok(previewCsv('content,scheduled_at\na,2020-01-01 10:00',context)[0].errors.length);assert.ok(previewCsv('content\na\nA',context)[1].errors.length);assert.ok(previewCsv('content\n임시 글',{...context,existingBodies:['임시 글']})[0].errors.length);
 const save=async(posts)=>(await db.query('select row_to_json(d) value from public.save_csv_posts($1,$2::jsonb) d',[workspace,JSON.stringify(posts)])).rows.map(r=>r.value);
 const saved=await save(preview.filter(r=>!r.errors.length).map(r=>r.post));assert.equal(saved.length,2);assert.equal(saved[0].source_template_id,'info');assert.equal(saved[0].category_id,category.id);assert.equal(saved[0].auto_publish,true);assert.equal(saved[1].scheduled_at,null);assert.ok((await list()).find(d=>d.id===saved[0].id&&d.scheduled_at===saved[0].scheduled_at));
 const size=(await list()).length;await assert.rejects(save([{...preview[1].post,body:'롤백할 CSV 글'},preview[1].post]),e=>e.code==='23505');assert.equal((await list()).length,size);
 await assert.rejects(save([{...preview[1].post,body:'임의 템플릿 차단',templateId:'00000000-0000-0000-0000-0000000000ff'}]),e=>e.code==='23503');
 await assert.rejects(save([{...preview[1].post,body:'즉시 게시 차단',mode:'now'}]),e=>e.code==='22023');
 console.log('PASS CSV: quoted commas/newlines/escaped quotes/BOM, 64KB and 30-row bounds, row-specific errors, valid-only save, future KST, category/account/template provenance, persistence, duplicate rollback and no immediate publish.');
}finally{await db.close();}
