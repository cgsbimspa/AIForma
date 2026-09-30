// UI cursors only in sessionStorage. Technical results stay in their existing
// backend or in this bounded, user/project-scoped, volatile session cache.
export const projectSessionKey = (owner:string, hub:string, project:string, slot:string) => JSON.stringify([owner,hub,project,slot]);
export function readProjectCursor(raw:string|null, owner:string):{hubId:string;projectId:string}|null {
  try { const v=JSON.parse(raw??'null');return v?.owner===owner&&typeof v.hubId==='string'&&typeof v.projectId==='string'?{hubId:v.hubId,projectId:v.projectId}:null; } catch { return null; }
}
export class ProjectSession {
  private entries=new Map<string,{value:unknown;expires:number}>();
  get<T>(key:string, fallback:()=>T):T { const entry=this.entries.get(key);if(entry&&entry.expires>Date.now())return entry.value as T;this.entries.delete(key);const value=fallback();this.set(key,value);return value; }
  set(key:string,value:unknown) { this.entries.delete(key);this.entries.set(key,{value,expires:Date.now()+5*86400000});while(this.entries.size>80)this.entries.delete(this.entries.keys().next().value!); }
  clear(){this.entries.clear();}
}
