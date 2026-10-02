import {calendarStatus,recurringSlots,weekBounds,type RecurringSchedule} from "./content-operations";
import {kstInput} from "./draft-scheduling";
import type {DraftRow} from "./supabase/database.types";

// Convert dates once per row, rather than scanning every row for all 42 cells.
export function calendarIndex(focus:string,mode:"month"|"week",drafts:DraftRow[],recurrences:RecurringSchedule[],categoryFilter:string,statusFilter:string){
  const date=new Date(focus+"T00:00:00Z");
  const first=mode==="week"?weekBounds(focus+"T12:00:00+09:00").start:new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1)).toISOString().slice(0,10);
  const origin=new Date(first+"T00:00:00Z");if(mode==="month")origin.setUTCDate(origin.getUTCDate()-origin.getUTCDay());
  const days=Array.from({length:mode==="week"?7:42},(_,i)=>new Date(origin.getTime()+i*86400000).toISOString().slice(0,10));
  const byDay=new Map<string,DraftRow[]>(),slotsByDay=new Map<string,ReturnType<typeof recurringSlots>>();
  const occupied=new Set<number>();
  for(const draft of drafts){
    if(draft.scheduled_at)occupied.add(Date.parse(draft.scheduled_at));
    if(categoryFilter&&draft.category_id!==categoryFilter||statusFilter&&calendarStatus(draft)!==statusFilter)continue;
    const day=kstInput(draft.scheduled_at??draft.published_at??draft.created_at).slice(0,10);
    if(day<days[0]||day>days.at(-1)!)continue;
    const rows=byDay.get(day)??[];rows.push(draft);byDay.set(day,rows);
  }
  if(!statusFilter)for(const slot of recurringSlots(recurrences,days[0],days.at(-1)!)){
    if(categoryFilter&&slot.schedule.category_id!==categoryFilter||occupied.has(Date.parse(slot.at)))continue;
    const day=kstInput(slot.at).slice(0,10),rows=slotsByDay.get(day)??[];rows.push(slot);slotsByDay.set(day,rows);
  }
  return {days,byDay,slotsByDay};
}
