export function localClient(db,actor){
 const identifier=name=>{if(!/^[a-z_]+$/.test(name))throw Error("Preview identifier");return '"'+name+'"';};
 class Query{
 constructor(table){this.table=table;this.kind='select';this.filters=[];this.orders=[];this.values=[];this.limitN=null;this.columns='*';this.one=false;}
 select(columns='*'){this.columns=columns;return this;}
 eq(k,v){this.filters.push(identifier(k)+' = '+this.bind(v));return this;}
 is(k,v){this.filters.push(identifier(k)+(v===null?' is null':' = '+this.bind(v)));return this;}
 not(k,op,v){if(op==='is'&&v===null)this.filters.push(identifier(k)+' is not null');else throw Error("Preview filter");return this;}
 in(k,v){this.filters.push(identifier(k)+' in ('+v.map(x=>this.bind(x)).join(',')+')');return this;}
 order(k,options={}){this.orders.push(identifier(k)+(options.ascending===false?' desc':' asc'));return this;}
 limit(n){this.limitN=n;return this;}
 insert(v){this.kind='insert';this.changes=v;return this;}
 update(v){this.kind='update';this.changes=v;return this;}
 single(){this.one=true;return this;}
 maybeSingle(){this.one=true;return this;}
 bind(v){this.values.push(typeof v==='object'&&v!==null&&!Array.isArray(v)?JSON.stringify(v):v);return '$'+this.values.length;}
 async execute(){try{
 const table='public.'+identifier(this.table),where=this.filters.length?' where '+this.filters.join(' and '):'';
 let sql;if(this.kind==='select'){const cols=this.columns==='*'?'*':this.columns.split(',').map(identifier).join(',');sql='select row_to_json(q) value from (select '+cols+' from '+table+where+(this.orders.length?' order by '+this.orders.join(','):'')+(this.limitN?' limit '+this.limitN:'')+') q';}
 else if(this.kind==='insert'){const entries=Object.entries(this.changes);sql='insert into '+table+' ('+entries.map(([k])=>identifier(k)).join(',')+') values ('+entries.map(([k,v])=>this.bind(k==='days'?'{'+v.join(',')+'}':Array.isArray(v)?JSON.stringify(v):v)).join(',')+') returning row_to_json('+identifier(this.table)+') value';}
 else sql='update '+table+' set '+Object.entries(this.changes).map(([k,v])=>identifier(k)+' = '+this.bind(k==='days'?'{'+v.join(',')+'}':Array.isArray(v)?JSON.stringify(v):v)).join(',')+where+' returning row_to_json('+identifier(this.table)+') value';
 const rows=(await db.query(sql,this.values)).rows.map(r=>r.value);return {data:this.one?rows[0]??null:rows,error:this.one&&!rows.length?{code:'55000'}:null};
 }catch(e){console.log('Preview SQL failure',e.code,e.message);return {data:null,error:{code:e.code,message:e.message}};}}
 then(resolve,reject){return this.execute().then(resolve,reject);}
 }
 const rpcArgs={reserve_ai_generation:['p_workspace_id','p_id','p_hash','p_parameters','p_model'],finish_ai_generation:['p_workspace_id','p_id','p_posts'],save_categorized_posts:['p_workspace_id','p_posts','p_ai'],place_content_plan:['p_workspace_id','p_plan_id','p_expected_updated_at','p_posts']};
 return {auth:{getUser:async()=>({data:{user:{id:actor,email:'p2-preview@example.test'}},error:null})},from:name=>new Query(name),rpc:async(name,args)=>{
 try{const keys=rpcArgs[name];const values=keys.map(k=>args[k]??(k==='p_ai'?false:null));const calls=values.map((_,i)=>'$'+(i+1)).join(',');
 if(name==='reserve_ai_generation')return {data:(await db.query('select public.'+identifier(name)+'('+calls+') value',values.map(v=>typeof v==='object'?JSON.stringify(v):v))).rows[0].value,error:null};
 const rows=(await db.query('select row_to_json(q) value from public.'+identifier(name)+'('+calls+') q',values.map(v=>typeof v==='object'&&v!==null?JSON.stringify(v):v))).rows.map(r=>r.value);return {data:rows,error:null};
 }catch(e){console.log('Preview SQL failure',e.code,e.message);return {data:null,error:{code:e.code,message:e.message}};}}};
}

