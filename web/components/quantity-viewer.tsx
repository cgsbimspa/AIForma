"use client";
import { useEffect, useRef, useState } from "react";
import { Box, ExternalLink, RefreshCw } from "lucide-react";
import { quantityCommand } from "@/lib/quantities/client";
import type { QuantityProject, QuantitySource } from "@/lib/quantities/contracts";
import { inventorySchema, type ClassificationInventory, liveCalculationSchema, type CalculationEvent } from "@/lib/quantities/live";

export function QuantityViewer({ project, source, highlightedElementIds=[], filteredElementIds=null, onSelectElements, classificationFilter, calculationRequest=0, onCalculation, onInventory }: { project: QuantityProject; source: QuantitySource | null; highlightedElementIds?:string[]; filteredElementIds?:string[]|null; onSelectElements?:(ids:string[])=>void; classificationFilter?: {specialty:string; subspecialty:string; floor:string}; onInventory?:(data:ClassificationInventory)=>void; calculationRequest?:number; onCalculation?:(event:CalculationEvent)=>void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);
  const [status, setStatus] = useState(""), [error, setError] = useState("");
  const [classification, setClassification] = useState<{selection:string; message:string; result:string}|null>(null);
  const [selectionCount,setSelectionCount]=useState(0);
  const [filterState,setFilterState]=useState<{key:string;active:boolean;count:number;phase:string;mode:string}|null>(null);
  const filterKey=JSON.stringify([filteredElementIds,classificationFilter??null]);
  const calculationTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const selection = source?.view ? `${source.scope.projectId}:${source.scope.itemId}:${source.version.id}:${source.view.id}` : "";
  useEffect(() => {
    if (!source?.view || !source.version.modelId) return;
    const controller = new AbortController();
    const selectedSource = source;
    async function load() {
      setStatus("Verificando acceso a la versión y vista seleccionadas…"); setError(""); setLoaded(null); setClassification(null); setSelectionCount(0); setFilterState(null);
      try {
        const result = await quantityCommand<{ frameUrl: string; versionId: string; viewId: string }>(project, { action: "viewer", file: selectedSource.scope, versionId: selectedSource.version.id, viewId: selectedSource.view!.id }, controller.signal);
        if (controller.signal.aborted) return;
        if (result.versionId !== selectedSource.version.id || result.viewId !== selectedSource.view!.id || !result.frameUrl.startsWith("/api/quantities/viewer-frame?ticket=")) throw Error("La fuente del visor no coincide con la selección.");
        setLoaded({ key: selection, url: result.frameUrl }); setStatus("Cargando modelo BIM…");
      } catch (e) { if (!controller.signal.aborted) { setError((e as Error).message); setStatus(""); } }
    }
    void load();
    return () => controller.abort();
  }, [project, source, selection, retry]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.type !== "aiforma-viewer" || event.data?.viewId !== source?.view?.id || event.data?.urn !== source?.version.modelId) return;
      if (event.data.state === "ready") { setStatus("Vista seleccionada cargada"); setError(""); }
      else if(event.data.state==='inventory'){const data=inventorySchema.safeParse(event.data.elements);if(data.success)onInventory?.(data.data);}
      else if(event.data.state==='filter'&&typeof event.data.key==='string'&&typeof event.data.active==='boolean'&&Number.isSafeInteger(event.data.count)&&event.data.count>=0&&['loading','ready','error'].includes(event.data.phase)&&['filter','isolate','attenuate','hide'].includes(event.data.mode))setFilterState({key:event.data.key,active:event.data.active,count:event.data.count,phase:event.data.phase,mode:event.data.mode});
      else if (event.data.state === "selection-count" && Number.isSafeInteger(event.data.count) && event.data.count >= 0) setSelectionCount(event.data.count);
      else if (event.data.state === "selection" && Array.isArray(event.data.ids) && event.data.ids.every((id:unknown)=>typeof id==="string")) {setSelectionCount(Number.isSafeInteger(event.data.count)?event.data.count:event.data.ids.length);onSelectElements?.(event.data.ids);}
      else if(event.data.state==='calculation'&&calculationRequest>0&&event.data.requestId===calculationRequest){
        if(event.data.phase==='loading')onCalculation?.({state:'loading',message:'Leyendo propiedades y sumando cantidades de la vista…'});
        else {
          if(calculationTimer.current)clearTimeout(calculationTimer.current);
          const result=liveCalculationSchema.safeParse(event.data.data);
          if(event.data.phase==='complete'&&result.success&&result.data.urn===source?.version.modelId&&result.data.viewId===source?.view?.id)onCalculation?.({state:'complete',data:result.data});
          else onCalculation?.({state:'error',message:'No se pudo validar la lectura de cantidades. Vuelve a procesar la vista.'});
        }
      }
      else if (event.data.state === "classification" && typeof event.data.message === "string") setClassification({selection, message:event.data.message, result:event.data.result});
      else if (event.data.state === "error") { setError(String(event.data.message)); setStatus(""); if(calculationRequest)onCalculation?.({state:'error',message:'El modelo no está disponible; no se pudo calcular.'}); }
      else if (event.data.state === "loading") setStatus(String(event.data.message));
    }
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, [source?.view?.id, source?.version.modelId,onSelectElements,selection,calculationRequest,onCalculation,onInventory]);
  useEffect(()=>{
    if(!calculationRequest||status!=="Vista seleccionada cargada")return;
    frame.current?.contentWindow?.postMessage({type:'aiforma-viewer-calculate',requestId:calculationRequest,viewId:source?.view?.id,urn:source?.version.modelId},window.location.origin);
    calculationTimer.current=setTimeout(()=>onCalculation?.({state:'error',message:'La lectura superó el tiempo disponible. No se confirmó un cálculo completo; vuelve a procesar.'}),120000);
    return ()=>{if(calculationTimer.current)clearTimeout(calculationTimer.current);};
  },[calculationRequest,status,source?.view?.id,source?.version.modelId,onCalculation]);
  useEffect(()=>{
    if(status!=="Vista seleccionada cargada")return;
    frame.current?.contentWindow?.postMessage({type:"aiforma-viewer-selection",viewId:source?.view?.id,urn:source?.version.modelId,highlightedElementIds,filteredElementIds,classificationFilter},window.location.origin);
  },[highlightedElementIds,filteredElementIds,source?.view?.id,source?.version.modelId,status,classificationFilter]);
  const canLoad = Boolean(source?.view && source.version.modelId);
  const filterReady=filterState?.key===filterKey&&filterState.phase==='ready';
  const filterActive=filterReady&&filterState.active;
  const actionCount=filterReady?(filterActive?filterState.count:selectionCount):0;
  const targetLabel=filterActive?'filtrados':'seleccionados manualmente';
  function visibility(action:'filter'|'isolate'|'attenuate'|'hide'|'showAll') {
    frame.current?.contentWindow?.postMessage({type:'aiforma-viewer-action',action,target:filterActive?'filter':'selection',filterKey,viewId:source?.view?.id,urn:source?.version.modelId},window.location.origin);
  }
  return <div className="quantity-live-viewer">
    {canLoad && loaded?.key === selection ? <iframe ref={frame} src={loaded.url} title={`Modelo ${source!.fileName} · V${source!.version.number} · ${source!.view!.name}`} allow="fullscreen" allowFullScreen/> : <div className="quantity-viewer-empty"><div><Box size={46} strokeWidth={1}/></div><h3>{canLoad ? "Cargando modelo BIM" : "Modelo BIM no cargado"}</h3><p>{!source ? "Selecciona un archivo RVT y su versión." : !source.view ? "Selecciona la vista publicada que quieres visualizar." : !source.version.modelId ? "Autodesk no tiene un modelo derivado disponible para esta versión." : status}</p></div>}
    <div className="quantity-viewer-controls">{error ? <p className="quantity-error" role="alert">{error}</p> : canLoad && <p className="quantity-help" role="status">{status}</p>}{classification?.selection===selection&&classification.message&&<p className={classification.result==="error"?"quantity-error":"quantity-help"} role="status">{classification.message}</p>}{status==='Vista seleccionada cargada'&&<><div className="quantity-inline-actions" aria-label="Visibilidad de elementos filtrados"><span>{filterReady?`${actionCount.toLocaleString('es-CL')} ${targetLabel}`:'Actualizando filtro…'}</span><button className="quantity-secondary" disabled={!filterReady} aria-pressed={filterState?.mode==='filter'} onClick={()=>visibility('filter')}>Solo filtrar</button><button className="quantity-secondary" disabled={!actionCount} aria-pressed={filterState?.mode==='attenuate'} onClick={()=>visibility('attenuate')}>Atenuar resto</button><button className="quantity-secondary" disabled={!actionCount} aria-pressed={filterState?.mode==='hide'} onClick={()=>visibility('hide')}>Ocultar {filterActive?'filtrados':'selección'}</button><button className="quantity-secondary" disabled={!actionCount} aria-pressed={filterState?.mode==='isolate'} onClick={()=>visibility('isolate')}>Aislar {filterActive?'filtrados':'selección'}</button></div>{filterReady&&<p className="quantity-help">{filterState.mode==='filter'?'Filtro listo. Elige cómo visualizar los elementos.':'Visibilidad aplicada. Las sumas mantienen los filtros de cubicación.'}</p>}</>}<div className="quantity-inline-actions">{canLoad && <button className="quantity-text-button" onClick={() => setRetry(n => n + 1)}><RefreshCw size={13}/>Volver a cargar modelo</button>}{source?.version.webUrl && <a className="quantity-text-button" href={source.version.webUrl} target="_blank" rel="noopener noreferrer">Abrir versión en Autodesk <ExternalLink size={13}/></a>}</div></div>
  </div>;
}
