// Opt-in diagnostics only. No content, user identifiers or credentials are logged.
let enabled=false;
let pending:{view:string;start:number;at:string}|null=null;
export function enableNavigationMetrics(){enabled=new URLSearchParams(window.location.search).get("__nav_perf")==="1";}
export function beginNavigation(view:string){if(enabled)pending={view,start:performance.now(),at:new Date().toISOString()};}
export function finishNavigation(view:string){
  if(!enabled||pending?.view!==view)return;
  const navigation=pending;pending=null;
  requestAnimationFrame(()=>{
    const resources=(performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter(r=>r.startTime>=navigation.start);
    const requests=resources.filter(r=>new URL(r.name).pathname.startsWith("/api/"));
    const slowest=[...requests].sort((a,b)=>b.duration-a.duration)[0];
    console.info("[navigation-metrics] "+JSON.stringify({view,start:navigation.at,end:new Date().toISOString(),
      elapsedMs:Math.round((performance.now()-navigation.start)*10)/10,documentTimeOrigin:performance.timeOrigin,
      browserApiRequests:requests.length,slowestApi:slowest?new URL(slowest.name).pathname:null,
      slowestApiMs:slowest?Math.round(slowest.duration):null}));
  });
}
