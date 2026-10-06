'use client';
import {usePathname,useSearchParams} from 'next/navigation';
import { useProjectContext, useProjectState } from '../project-context';
import { createContext,useContext,useEffect,useMemo,useState,useCallback,type ReactNode } from 'react';
import {activateProjectModule} from '@/lib/projects/client';
import { quantityResponse } from '@/lib/quantities/client';
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
 const {hubs,projects,hubId,projectId,nextPage,setHub,setProject,moreProjects,selectedDiscipline,configuration}=useProjectContext();
 const pathname=usePathname(),query=useSearchParams(),requestedRun=query.get('run');
 const disciplineId=selectedDiscipline?.source?.view?selectedDiscipline.id:undefined,centralRevision=configuration?.revision;
 const [workspace,setWorkspace]=useProjectState<AuditWorkspace|null>(`audit.workspace:${disciplineId??"none"}`,null),[run,setRun]=useProjectState<AuditReport|null>(`audit.report:${disciplineId??"none"}`,null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const project=useMemo<QuantityProject>(()=>({kind:'project',hubId,projectId}),[hubId,projectId]);
 useEffect(()=>{if(!projectId||pathname==='/auditoria-bim')return;const abort=new AbortController();queueMicrotask(()=>{if(!abort.signal.aborted)setBusy(true);});void (!requestedRun&&disciplineId&&centralRevision?activateProjectModule<AuditWorkspace>(project,disciplineId,centralRevision,'audit',abort.signal):auditResponse<AuditWorkspace>(project,undefined,'',abort.signal)).then(value=>{if(!abort.signal.aborted)setWorkspace(value);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});return()=>abort.abort();},[project,projectId,setWorkspace,disciplineId,centralRevision,pathname,requestedRun]);
 const reload=useCallback(async()=>{if(!projectId)return;setBusy(true);setError('');try{setWorkspace(await auditResponse<AuditWorkspace>(project));}catch(e){setError((e as Error).message);}finally{setBusy(false);}},[project,projectId,setWorkspace]);
 async function command(c:unknown){setBusy(true);setError('');setNotice('');try{const result=await auditResponse<AuditWorkspace|AuditReport>(project,c);if('findings'in result){setRun(result);setWorkspace(await auditResponse<AuditWorkspace>(project));setNotice('reused' in result&&result.reused?'Resultado vigente para esta fuente y configuración. No existen cambios desde la última ejecución.':'Ejecución guardada con su vista, versión, reglas y evidencia.');}else if('configuration'in result){setWorkspace(result);setNotice('Configuración guardada. Las ejecuciones anteriores conservan sus criterios originales.');}return result;}catch(e){setError((e as Error).message);throw e;}finally{setBusy(false);}}
 const openRun=useCallback(async(id:string)=>{setBusy(true);setError('');try{setRun(await auditResponse<AuditReport>(project,undefined,`&run=${encodeURIComponent(id)}`));}catch(e){setError((e as Error).message);}finally{setBusy(false);}},[project,setRun]);
 useEffect(()=>{if(!requestedRun)return;const controller=new AbortController();void auditResponse<AuditReport>(project,undefined,'&run='+encodeURIComponent(requestedRun),controller.signal).then(value=>{if(!controller.signal.aborted)setRun(value);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[project,requestedRun,setRun]);
 return <AuditContext.Provider value={{hubs,projects,hubId,projectId,project,workspace,run:requestedRun&&run?.id!==requestedRun?null:run,busy,error,notice,nextPage,setHub,setProject,moreProjects,reload,command,openRun,setNotice}}>{children}</AuditContext.Provider>;
}

export function AuditProjectProvider({children}:{children:ReactNode}){const p=useProjectContext();return <AuditProvider key={`${p.owner}:${p.hubId}:${p.projectId}:${p.selectedDiscipline?.id}:${p.configuration?.revision}`}>{children}</AuditProvider>;}
