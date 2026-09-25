"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, RefreshCw, ExternalLink } from 'lucide-react';
import { quantityCommand } from '@/lib/quantities/client';
import type { QuantityProject, QuantitySource } from '@/lib/quantities/contracts';
import { calculationSchema, type CalculationSettings, type ModelBinding, type ViewCalculation, type ViewFilters } from '@/lib/quantities-v2/contracts';
export type VisualRequest={id:number;dbIds:number[];action:'focus'|'isolate'};
export function QuantityV2Viewer({project,source,binding,settings,filters,onResult,visualRequest,recalculate=0}:{project:QuantityProject;source:QuantitySource;binding:ModelBinding;settings:CalculationSettings;filters:ViewFilters;onResult:(data:ViewCalculation|null)=>void;visualRequest:VisualRequest|null;recalculate?:number}){
 const frame=useRef<HTMLIFrameElement>(null),request=useRef(''),viewRequest=useRef(''),lastVisualRequest=useRef<VisualRequest|null>(null);
 const [url,setUrl]=useState(''),[ready,setReady]=useState(false),[read,setRead]=useState(false),[status,setStatus]=useState('Preparando vista…'),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const [readRevision,setReadRevision]=useState(0);
 const [filterState,setFilterState]=useState<{key:string;count:number}|null>(null),[mode,setMode]=useState('filter'),[visualCount,setVisualCount]=useState(0);
 const filterKey=JSON.stringify(filters),filterMatches=filterState?.key===filterKey,readable=read&&filterMatches;
 const post=useCallback((data:Record<string,unknown>)=>frame.current?.contentWindow?.postMessage({type:'aiforma-quantity-v2',urn:binding.urn,viewId:binding.viewId,requestId:crypto.randomUUID(),...data},window.location.origin),[binding]);
 useEffect(()=>{const controller=new AbortController();
 void quantityCommand<{frameUrl:string;versionId:string;viewId:string}>(project,{action:'viewer',file:source.scope,versionId:source.version.id,viewId:source.view!.id},controller.signal).then(r=>{if(controller.signal.aborted)return;if(r.versionId!==binding.versionId||r.viewId!==binding.viewId||!r.frameUrl.startsWith('/api/quantities/viewer-frame?ticket='))throw Error('Fuente de visor no válida');setUrl(r.frameUrl);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();
 },[project,source,binding,onResult,reload]);
 useEffect(()=>{function receive(event:MessageEvent){const d=event.data;if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow||d?.urn!==binding.urn||d.viewId!==binding.viewId)return;
 if(d.type==='aiforma-viewer'){if(d.state==='ready'){setReady(true);setError('');}if(d.state==='error'){setError(String(d.message));setReady(false);setRead(false);onResult(null);}return;}
 if(d.type!=='aiforma-quantity-v2-result')return;
 if(d.phase==='filter'&&d.requestId===viewRequest.current&&Number.isSafeInteger(d.count)){setFilterState({key:d.key,count:d.count});setMode(d.mode);setVisualCount(d.count);return;}
 if(d.phase==='visibility'&&d.requestId===viewRequest.current&&Number.isSafeInteger(d.count)){setMode(d.mode);setVisualCount(d.count);return;}
 if(d.requestId!==request.current)return;
 if(d.phase==='loading'){viewRequest.current='';setRead(false);setFilterState(null);setError('');setStatus(String(d.message));onResult(null);return;}
 if(d.phase==='error'){request.current='';setError(String(d.message));setRead(false);onResult(null);return;}
 if(d.phase==='complete'){request.current='';const parsed=calculationSchema.safeParse(d.calculation);if(!parsed.success||parsed.data.binding.urn!==binding.urn||parsed.data.binding.viewId!==binding.viewId||parsed.data.binding.versionId!==binding.versionId){setError('No se pudo verificar la procedencia de la cubicación.');onResult(null);return;}setReadRevision(n=>n+1);setRead(true);setError('');setStatus(`${parsed.data.coverage.inspected.toLocaleString('es-CL')} elementos leídos`);onResult(parsed.data);}
 }window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[binding,onResult]);
 useEffect(()=>{if(!ready)return;const id=crypto.randomUUID();request.current=id;post({operation:'calculate',requestId:id,binding,settings});const timer=setTimeout(()=>{if(request.current===id){request.current='';post({operation:'cancel'});setError('La lectura excedió el tiempo disponible. No se confirmó un resultado completo.');setRead(false);onResult(null);}},180000);return()=>{clearTimeout(timer);post({operation:'cancel'});};},[ready,binding,settings,post,onResult,recalculate]);
 useEffect(()=>{if(read){const id=crypto.randomUUID();viewRequest.current=id;post({operation:'filter',filter:filters,requestId:id});}},[read,readRevision,filters,post]);
 useEffect(()=>{if(readable&&visualRequest&&visualRequest!==lastVisualRequest.current){lastVisualRequest.current=visualRequest;const id=crypto.randomUUID();viewRequest.current=id;post({operation:'visibility',filterKey,action:visualRequest.action,dbIds:visualRequest.dbIds,requestId:id});}},[visualRequest,readable,filterKey,post]);
 function visibility(action:string){const id=crypto.randomUUID();viewRequest.current=id;post({operation:'visibility',filterKey,action,requestId:id});}
 return <div className={`quantity-live-viewer${readable&&!filterState.count?' quantity-filter-empty':''}`}>
 {readable&&!filterState.count&&<div className="quantity-filter-overlay" role="status">No hay elementos para esta combinación de filtros. Pulsa Limpiar para ver el modelo completo.</div>}
 {url?<iframe ref={frame} src={url} title={`Modelo ${source.fileName} · V${source.version.number} · ${source.view!.name}`} allow="fullscreen" allowFullScreen/>:<div className="quantity-viewer-empty"><Box size={38}/><p>{error||status}</p></div>}
 <div className="quantity-viewer-controls"><p role="status" className={error?'quantity-error':'quantity-help'}>{error||status}</p><div className="quantity-inline-actions"><span>{readable?`${filterState.count.toLocaleString('es-CL')} filtrados`:'Preparando filtro…'}</span>{[['filter','Solo filtrar'],['attenuate','Atenuar resto'],['hide','Ocultar'],['isolate','Aislar']].map(([act,label])=><button key={act} className="quantity-secondary" disabled={!readable||(act!=='filter'&&!filterState.count)} aria-pressed={mode===act} onClick={()=>visibility(act)}>{label}</button>)}</div>{readable&&mode!=='filter'&&<p className="quantity-help">{visualCount===filterState.count?'Visor sincronizado con el filtro: ':'Detalle temporal: '}{visualCount.toLocaleString('es-CL')} elementos{visualCount!==filterState.count?' de '+filterState.count.toLocaleString('es-CL')+'. Cambiar un filtro restablece el conjunto completo.':'.'}</p>}<div className="quantity-inline-actions"><button className="quantity-text-button" onClick={()=>{setReady(false);setRead(false);setUrl('');setError('');setStatus('Verificando versión y vista…');onResult(null);setReload(n=>n+1);}}><RefreshCw size={12}/>Recargar modelo</button>{source.version.webUrl&&<a className="quantity-text-button" href={source.version.webUrl} target="_blank" rel="noopener noreferrer">Abrir en Autodesk<ExternalLink size={12}/></a>}</div></div>
 </div>;
}
