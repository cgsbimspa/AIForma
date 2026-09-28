'use client';
import { createContext,useContext,useEffect,useMemo,useState,useCallback,type ReactNode } from 'react';
import { quantityBrowse,quantityResponse } from '@/lib/quantities/client';
import type { Entry } from '@/lib/autodesk/data';
import type { QuantityProject } from '@/lib/quantities/contracts';
import type { AuditWorkspace,AuditRun } from '@/lib/audit/contracts';
import type { score } from '@/lib/audit/engine';

export type AuditReport=AuditRun & {metrics:ReturnType<typeof score>};
type Context={hubs:Entry[];projects:Entry[];hubId:string;projectId:string;project:QuantityProject;workspace:AuditWorkspace|null;run:AuditReport|null;busy:boolean;error:string;notice:string;nextPage:number|null;setHub:(id:string)=>void;setProject:(id:string)=>void;moreProjects:()=>Promise<void>;reload:()=>Promise<void>;command:(c:unknown)=>Promise<unknown>;openRun:(id:string)=>Promise<void>;setNotice:(s:string)=>void};
const AuditContext=createContext<Context|null>(null);
export const useAudit=()=>{const context=useContext(AuditContext);if(!context)throw Error('audit_context_required');return context;};
export const auditMessages:Record<string,string>={audit_view_required:'Selecciona una vista 3D publicada y guarda la configuración.',audit_derivative_pending:'Autodesk está preparando los datos de esta vista. Vuelve a ejecutar en unos momentos.',audit_source_unavailable:'No fue posible recuperar los datos de esta vista. No se generó un resultado técnico.',audit_source_too_large:'La lectura supera el tamaño disponible. Publica una vista de auditoría con un alcance más acotado.',audit_storage_unavailable:'El almacenamiento de auditorías no está disponible. No se ha guardado una ejecución.',audit_invalid_catalog:'Confirma la fuente y unidad de cada tolerancia antes de guardarla.'};
export async function auditResponse<T>(scope:QuantityProject,command?:unknown,query='',signal?:AbortSignal):Promise<T>{
 // Use shared Autodesk session refresh and private API access.
 return quantityResponse<T>(`/api/audit${command?'':`?scope=${encodeURIComponent(JSON.stringify(scope))}${query}`}`,command?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,command}),signal}:{signal});
}
export function AuditProvider({children}:{children:ReactNode}){
 const [hubs,setHubs]=useState<Entry[]>([]),[projects,setProjects]=useState<Entry[]>([]),[hubId,setHubId]=useState(''),[projectId,setProjectId]=useState(''),[nextPage,setNextPage]=useState<number|null>(null);
 const [workspace,setWorkspace]=useState<AuditWorkspace|null>(null),[run,setRun]=useState<AuditReport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const project=useMemo<QuantityProject>(()=>({kind:'project',hubId,projectId}),[hubId,projectId]);
 useEffect(()=>{const abort=new AbortController();void quantityBrowse({operation:'hubs'},abort.signal).then(p=>{setHubs(p.entries);if(p.entries.length===1)setHubId(p.entries[0].id);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return()=>abort.abort();},[]);
 useEffect(()=>{if(!hubId)return;const abort=new AbortController();void quantityBrowse({operation:'projects',hubId},abort.signal).then(p=>{setProjects(p.entries);setNextPage(p.evidence.nextPage);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});return()=>abort.abort();},[hubId]);
 useEffect(()=>{if(!projectId)return;const abort=new AbortController();void auditResponse<AuditWorkspace>(project,undefined,'',abort.signal).then(setWorkspace).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});return()=>abort.abort();},[project,projectId]);
 const reload=useCallback(async()=>{if(!projectId)return;setBusy(true);setError('');try{setWorkspace(await auditResponse<AuditWorkspace>(project));}catch(e){setError((e as Error).message);}finally{setBusy(false);}},[project,projectId]);
 async function command(c:unknown){setBusy(true);setError('');setNotice('');try{const result=await auditResponse<AuditWorkspace|AuditReport>(project,c);if('findings'in result){setRun(result);setWorkspace(await auditResponse<AuditWorkspace>(project));setNotice('Ejecución guardada con su vista, versión, reglas y evidencia.');}else if('configuration'in result){setWorkspace(result);setNotice('Configuración guardada. Las ejecuciones anteriores conservan sus criterios originales.');}return result;}catch(e){setError((e as Error).message);throw e;}finally{setBusy(false);}}
 async function openRun(id:string){setBusy(true);setError('');try{setRun(await auditResponse<AuditReport>(project,undefined,`&run=${encodeURIComponent(id)}`));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function moreProjects(){if(nextPage===null)return;setBusy(true);try{const p=await quantityBrowse({operation:'projects',hubId,page:nextPage});setProjects(old=>[...old,...p.entries]);setNextPage(p.evidence.nextPage);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const setHub=(id:string)=>{setBusy(Boolean(id));setHubId(id);setProjectId('');setProjects([]);setWorkspace(null);setRun(null);setError('');setNotice('');};
 const setProject=(id:string)=>{setBusy(Boolean(id));setProjectId(id);setWorkspace(null);setRun(null);setError('');setNotice('');};
 return <AuditContext.Provider value={{hubs,projects,hubId,projectId,project,workspace,run,busy,error,notice,nextPage,setHub,setProject,moreProjects,reload,command,openRun,setNotice}}>{children}</AuditContext.Provider>;
}
