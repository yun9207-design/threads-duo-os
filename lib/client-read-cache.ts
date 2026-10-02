// Owned by one mounted session provider, never shared across users or persisted.
export class ClientReadCache {
  private entries=new Map<string,{updatedAt:number;promise?:Promise<unknown>;value?:unknown}>();
  isFresh(key:string,ttl:number){const entry=this.entries.get(key);return !!entry&&!entry.promise&&Date.now()-entry.updatedAt<ttl;}
  seed(key:string){this.entries.set(key,{updatedAt:Date.now(),value:{}});}
  async read<T>(key:string,ttl:number,load:()=>Promise<T>,force=false):Promise<T>{
    const entry=this.entries.get(key);
    if(entry?.promise)return entry.promise as Promise<T>;
    if(!force&&entry&&Date.now()-entry.updatedAt<ttl)return entry.value as T;
    const next:{updatedAt:number;promise?:Promise<T>;value?:T}={updatedAt:0};
    const promise=load().then(value=>{next.value=value;next.updatedAt=Date.now();return value;})
      .catch(error=>{if(this.entries.get(key)===next)this.entries.delete(key);throw error;})
      .finally(()=>{delete next.promise;});
    next.promise=promise;this.entries.set(key,next);return promise;
  }
  invalidate(key:string){this.entries.delete(key);}
}
