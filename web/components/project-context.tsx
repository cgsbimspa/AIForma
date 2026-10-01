'use client';
import {createContext,useContext,useEffect,useMemo,useRef,useState,useCallback,type ReactNode,type Dispatch,type SetStateAction} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {RefreshCw} from 'lucide-react';
import {quantityBrowse} from '@/lib/quantities/client';
import {autodeskStatus} from '@/lib/autodesk/client';
import type {Entry} from '@/lib/autodesk/data';
import type {QuantitySource} from '@/lib/quantities/contracts';
import {ProjectSession,projectSessionKey,readProjectCursor} from '@/lib/project-session';

function useProjectValue(){
 const [owner,setOwner]=useState(''),[hubId,setHubId]=useState(''),[projectId,setProjectId]=useState('');
 const [hubs,setHubs]=useState<Entry[]>([]),[projects,setProjects]=useState<Entry[]>([]),[nextPage,setNextPage]=useState<number|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [connection,setConnection]=useState<'checking'|'connected'|'disconnected'|'unavailable'>('checking');
 const [session]=useState(()=>new ProjectSession()),identity=useRef(''),generation=useRef(0);
 const [sources,setSources]=useState<Record<string,QuantitySource|null>>({});
 const pathname=usePathname(),activeModule=pathname.split('/')[1]||'inicio';
 useEffect(()=>{let disposed=false,inFlight=false;const abort=new AbortController();async function check(){if(inFlight)return;inFlight=true;try{const r=await autodeskStatus(abort.signal),v=await r.json();if(disposed)return;const id=v.connected&&typeof v.user?.id==='string'?v.user.id:'';if(v.error==='unavailable'){setConnection('unavailable');return;}setConnection(id?'connected':'disconnected');if(id!==identity.current){generation.current++;identity.current=id;session.clear();setSources({});setOwner(id);setHubs([]);setProjects([]);let cursor=null;try{cursor=readProjectCursor(sessionStorage.getItem('aiforma-project-cursor'),id);if(!id)sessionStorage.removeItem('aiforma-project-cursor');}catch{}setHubId(cursor?.hubId??'');setProjectId(cursor?.projectId??'');}}catch{if(!disposed)setConnection('unavailable');/* Keep context during transient network failures; server authorization still applies. */}finally{inFlight=false;}}void check();const timer=setInterval(()=>{if(document.visibilityState==='visible')void check();},60000);window.addEventListener('focus',check);return()=>{disposed=true;abort.abort();clearInterval(timer);window.removeEventListener('focus',check);};},[session,revision]);
 useEffect(()=>{if(!owner)return;try{sessionStorage.setItem('aiforma-project-cursor',JSON.stringify({owner,hubId,projectId}));}catch{}},[owner,hubId,projectId]);
 useEffect(()=>{if(!owner)return;const abort=new AbortController();queueMicrotask(()=>{if(!abort.signal.aborted){setBusy(true);setError('');}});void quantityBrowse({operation:'hubs'},abort.signal).then(p=>{if(abort.signal.aborted)return;setHubs(p.entries);if(!hubId&&p.entries.length===1)setHubId(p.entries[0].id);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});return()=>abort.abort();},[owner,revision]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!owner||!hubId)return;const abort=new AbortController();queueMicrotask(()=>{if(!abort.signal.aborted){setBusy(true);setError('');}});async function load(){try{let page=await quantityBrowse({operation:'projects',hubId},abort.signal),rows=page.entries;let n=0;while(projectId&&!rows.some(p=>p.id===projectId)&&page.evidence.nextPage!==null&&n++<30){page=await quantityBrowse({operation:'projects',hubId,page:page.evidence.nextPage},abort.signal);rows=[...rows,...page.entries];}if(!abort.signal.aborted){setProjects(rows);setNextPage(page.evidence.nextPage);}}catch(e){if(!abort.signal.aborted)setError((e as Error).message);}finally{if(!abort.signal.aborted)setBusy(false);}}void load();return()=>abort.abort();},[owner,hubId,revision]); // eslint-disable-line react-hooks/exhaustive-deps
 const setHub=useCallback((id:string)=>{generation.current++;setHubId(id);setProjectId('');setProjects([]);setNextPage(null);setError('');},[]);
 const setProject=useCallback((id:string)=>{generation.current++;setProjectId(id);setError('');},[]);
 const selectProject=useCallback((hub:string,project:string)=>{generation.current++;setHubId(hub);setProjectId(project);setError('');},[]);
 async function moreProjects(){if(nextPage===null)return;const epoch=generation.current;setBusy(true);try{const p=await quantityBrowse({operation:'projects',hubId,page:nextPage});if(epoch!==generation.current)return;setProjects(old=>[...new Map([...old,...p.entries].map(e=>[e.id,e])).values()]);setNextPage(p.evidence.nextPage);}catch(e){if(epoch===generation.current)setError((e as Error).message);}finally{if(epoch===generation.current)setBusy(false);}}
 const sourceKey=projectSessionKey(owner,hubId,projectId,activeModule);
 const publishSource=useCallback((value:QuantitySource|null)=>{setSources(old=>old[sourceKey]===value?old:{...old,[sourceKey]:value});},[sourceKey]);
 const source=sources[sourceKey]??null;
 const project=useMemo(()=>({kind:'project' as const,hubId,projectId}),[hubId,projectId]);
 return {owner,connection,hubId,projectId,hubs,projects,nextPage,busy,error,setHub,setProject,selectProject,moreProjects,refresh:()=>setRevision(v=>v+1),project,source,publishSource,session:session};
}
const Context=createContext<ReturnType<typeof useProjectValue>|null>(null);
export function ProjectProvider({children}:{children:ReactNode}){return <Context.Provider value={useProjectValue()}>{children}</Context.Provider>;}
export function useProjectContext(){const c=useContext(Context);if(!c)throw Error('project_context_required');return c;}
export function useProjectState<T>(slot:string,initial:T|(()=>T)):[T,Dispatch<SetStateAction<T>>]{
 const {owner,hubId,projectId,session}=useProjectContext(),key=projectSessionKey(owner,hubId,projectId,slot);
 const fallback=()=>typeof initial==='function'?(initial as ()=>T)():initial;
 const [state,setState]=useState<{key:string;value:T}>(()=>({key,value:session.get(key,fallback)}));
 const value=state.key===key?state.value:session.get(key,fallback);
 const set=useCallback<Dispatch<SetStateAction<T>>>((update)=>{setState(old=>{const before=old.key===key?old.value:session.get(key,fallback),next=typeof update==='function'?(update as (v:T)=>T)(before):update;session.set(key,next);return{key,value:next};});},[key,session]); // eslint-disable-line react-hooks/exhaustive-deps
 return [value,set];
}
export function useModelContext(source:QuantitySource|null|undefined){const {publishSource}=useProjectContext();useEffect(()=>{publishSource(source??null);},[source,publishSource]);}
export function ProjectPicker(){const p=useProjectContext(),router=useRouter();return <div className="global-project-picker"><label>Empresa · Cuenta Autodesk<select aria-label="Empresa · Cuenta Autodesk" value={p.hubId} disabled={p.busy||!p.owner} onChange={e=>{p.setHub(e.target.value);router.push('/');}}><option value="">Seleccionar empresa</option>{p.hubs.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>Proyecto<select aria-label="Proyecto" value={p.projectId} disabled={!p.hubId||p.busy} onChange={e=>{p.setProject(e.target.value);router.push('/');}}><option value="">Seleccionar proyecto</option>{p.projectId&&!p.projects.some(v=>v.id===p.projectId)&&<option value={p.projectId}>Proyecto por verificar</option>}{p.projects.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>{p.nextPage!==null&&<button onClick={()=>void p.moreProjects()} disabled={p.busy}>Más proyectos</button>}<button aria-label="Actualizar lista de proyectos" disabled={p.busy} onClick={p.refresh}><RefreshCw size={16}/></button>{p.error&&<span role="alert" className="global-context-error">{p.error}</span>}</div>;}
export function ModelContext(){const {source}=useProjectContext();return <div className="global-model-context">{source?<><strong title={source.fileName}>{source.fileName}</strong><span>V{source.version.number} · {source.view?.name??'Vista no seleccionada'}</span></>:<span>Modelo y vista por configurar en este módulo</span>}</div>;}
