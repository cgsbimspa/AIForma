'use client';
import {useProjectContext,useProjectState} from '../project-context';
import {createContext,useContext,useState,useEffect,useMemo,useRef,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {quantityResponse} from '@/lib/quantities/client';
import type {Entry} from '@/lib/autodesk/data';
import type {QuantityProject} from '@/lib/quantities/contracts';
import type {Workspace,Report} from '@/lib/coordination/contracts';
import {root} from '@/lib/coordination/catalog';
export async function coordinationRequest<T>(scope:QuantityProject,command?:unknown,query='',signal?:AbortSignal):Promise<T>{return quantityResponse<T>(`/api/coordination${command?'':`?scope=${encodeURIComponent(JSON.stringify(scope))}${query}`}`,command?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,command}),signal}:{signal});}
type Context={hubs:Entry[];projects:Entry[];hubId:string;projectId:string;project:QuantityProject;workspace:Workspace|null;report:Report|null;busy:boolean;error:string;notice:string;setNotice:(v:string)=>void;setHub:(v:string)=>void;setProject:(v:string)=>void;nextPage:number|null;more:()=>Promise<void>;reload:()=>Promise<void>;command:<T>(c:unknown)=>Promise<T>;openRun:(id:string)=>Promise<void>};
const CoordinationContext=createContext<Context|null>(null);
export const useCoordination=()=>{const c=useContext(CoordinationContext);if(!c)throw Error('coordination_context_required');return c;};
export function CoordinationProvider({children}:{children:ReactNode}){
 const {hubs,projects,hubId,projectId,nextPage,setHub,setProject,moreProjects:more}=useProjectContext();
 const active=usePathname().startsWith(root),[workspace,setWorkspace]=useProjectState<Workspace|null>('coordination.workspace',null),[report,setReport]=useProjectState<Report|null>('coordination.report',null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const epoch=useRef(0),project=useMemo<QuantityProject>(()=>({kind:'project',hubId,projectId}),[hubId,projectId]);
 useEffect(()=>{if(!active||!projectId)return;const abort=new AbortController();coordinationRequest<Workspace>(project,undefined,'',abort.signal).then(setWorkspace).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});return()=>abort.abort();},[project,projectId,active,setWorkspace]);
 async function reload(){if(!projectId)return;const n=epoch.current;setBusy(true);try{const result=await coordinationRequest<Workspace>(project);if(n===epoch.current){setWorkspace(result);setError('');}}catch(e){if(n===epoch.current)setError((e as Error).message);}finally{if(n===epoch.current)setBusy(false);}}
 async function command<T>(c:unknown):Promise<T>{const n=epoch.current;setBusy(true);setError('');setNotice('');try{const result=await coordinationRequest<T>(project,c);if(n!==epoch.current)throw Error('El proyecto cambió durante la operación.');if(result&&typeof result==='object'&&'configurations'in result)setWorkspace(result as unknown as Workspace);if(result&&typeof result==='object'&&'findingCount'in result){setReport(result as unknown as Report);const w=await coordinationRequest<Workspace>(project);if(n===epoch.current)setWorkspace(w);}return result;}catch(e){if(n===epoch.current)setError((e as Error).message);throw e;}finally{if(n===epoch.current)setBusy(false);}}
 async function openRun(id:string){const n=epoch.current;setBusy(true);setError('');try{const r=await coordinationRequest<Report>(project,undefined,`&run=${encodeURIComponent(id)}`);if(n===epoch.current)setReport(r);}catch(e){if(n===epoch.current)setError((e as Error).message);}finally{if(n===epoch.current)setBusy(false);}}
 return <CoordinationContext.Provider value={{hubs,projects,hubId,projectId,project,workspace,report,busy,error,notice,setNotice,setHub,setProject,nextPage,more,reload,command,openRun}}>{children}</CoordinationContext.Provider>;
}
