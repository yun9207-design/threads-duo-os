"use client";
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type Dispatch,type SetStateAction} from "react";
import {usePathname} from "next/navigation";
import type {DraftWorkspace} from "@/lib/drafts";
import type {ThreadsConnection} from "@/lib/threads-publishing";
import type {Database,DraftRow} from "@/lib/supabase/database.types";
import type {OperationsData} from "@/lib/content-operations";
import type {PerformanceData} from "@/lib/threads-performance";
import {ClientReadCache} from "@/lib/client-read-cache";

type Worker=Database["public"]["Tables"]["queue_worker_status"]["Row"]|null;
export type ProductSnapshot={userId:string;email:string;workspace:DraftWorkspace;drafts:DraftRow[];connection:ThreadsConnection;worker:Worker;operations:OperationsData;performance:PerformanceData;referenceTime:string};
type Store={snapshot:ProductSnapshot|null;error:string;refresh:()=>void;
  readResource:<T>(key:string,load:()=>Promise<T>,force?:boolean)=>Promise<T>;
  setDrafts:Dispatch<SetStateAction<DraftRow[]>>;setOperations:Dispatch<SetStateAction<OperationsData>>;
  setPerformance:Dispatch<SetStateAction<PerformanceData>>;setConnection:Dispatch<SetStateAction<ThreadsConnection>>;setWorker:Dispatch<SetStateAction<Worker>>};
const Context=createContext<Store|null>(null);
export const useProductData=()=>useContext(Context);
const EMPTY_PERFORMANCE:PerformanceData={posts:[],accounts:[],truncated:false};
const TTL={initial:30000,live:30000,operations:120000,performance:60000};

export function ProductDataProvider({children}:{children:React.ReactNode}){
  const pathname=usePathname(),[snapshot,setSnapshot]=useState<ProductSnapshot|null>(null),[error,setError]=useState("");
  const cache=useRef(new ClientReadCache()),revision=useRef(0),current=useRef(snapshot);
  useEffect(()=>{current.current=snapshot;},[snapshot]);
  const read=useCallback(async(scope:keyof typeof TTL,force=false)=>{
    if(!force&&cache.current.isFresh(scope,TTL[scope]))return;
    const initial=current.current,version=revision.current;
    const result=await cache.current.read(scope,TTL[scope],async()=>{
      const query=new URLSearchParams({scope});
      if(initial)query.set("workspace",initial.workspace.workspace.id);
      if(scope==="initial")query.set("performance","1");
      const response=await fetch("/api/product?"+query,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(20000)});
      if(response.status===401){window.location.replace("/login");throw new Error("로그인이 필요합니다.");}
      if(response.status===404){revision.current++;setSnapshot(null);setError("워크스페이스를 불러올 수 없습니다.");throw new Error("워크스페이스를 불러올 수 없습니다.");}
      const body=await response.json();if(!response.ok)throw new Error(body.error??"잠시 후 다시 불러와 주세요.");
      return body as Partial<ProductSnapshot>;
    },force);
    // A response started before a local mutation must not replace the new rows.
    if(version!==revision.current){cache.current.invalidate(scope);return;}
    if(scope==="initial")for(const key of ["live","operations","performance"] as const)cache.current.seed(key);
    setSnapshot(value=>({...value,performance:value?.performance??EMPTY_PERFORMANCE,...result}) as ProductSnapshot);
    setError("");
  },[]);
  useEffect(()=>{let active=true;read("initial").catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[read]);
  const ready=!!snapshot;
  useEffect(()=>{
    if(!ready)return;
    const refresh=()=>{
      if(document.visibilityState!=="visible")return;
      const scopes:(keyof typeof TTL)[]=["live","operations"];
      if(["/","/planner","/analytics"].includes(pathname))scopes.push("performance");
      for(const scope of scopes)void read(scope).catch(()=>{/* Keep the last successful snapshot on a transient error. */});
    };
    refresh();const timer=setInterval(refresh,30000);
    window.addEventListener("focus",refresh);
    return()=>{clearInterval(timer);window.removeEventListener("focus",refresh);};
  },[pathname,read,ready]);
  const update=useCallback(<K extends "drafts"|"operations"|"performance"|"connection"|"worker">(field:K,action:SetStateAction<ProductSnapshot[K]>)=>{
    revision.current++;cache.current.invalidate(field==="operations"?"operations":field==="performance"?"performance":"live");
    setSnapshot(value=>value?{...value,[field]:typeof action==="function"?(action as (previous:ProductSnapshot[K])=>ProductSnapshot[K])(value[field]):action}:value);
  },[]);
  const setDrafts=useCallback<Store["setDrafts"]>(value=>update("drafts",value),[update]);
  const setOperations=useCallback<Store["setOperations"]>(value=>update("operations",value),[update]);
  const setPerformance=useCallback<Store["setPerformance"]>(value=>update("performance",value),[update]);
  const setConnection=useCallback<Store["setConnection"]>(value=>update("connection",value),[update]);
  const setWorker=useCallback<Store["setWorker"]>(value=>update("worker",value),[update]);
  const refresh=useCallback(()=>{void read(current.current?"live":"initial",true).catch(e=>setError(e.message));},[read]);
  const readResource=useCallback(<T,>(key:string,load:()=>Promise<T>,force=false)=>cache.current.read("resource:"+key,120000,load,force),[]);
  const value=useMemo(()=>({snapshot,error,refresh,readResource,setDrafts,setOperations,setPerformance,setConnection,setWorker}),[snapshot,error,refresh,readResource,setDrafts,setOperations,setPerformance,setConnection,setWorker]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
