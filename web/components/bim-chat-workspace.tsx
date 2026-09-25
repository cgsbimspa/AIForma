"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, MessageSquare, ArrowUp, Settings2, RefreshCw, ExternalLink, Plus, ShieldCheck } from 'lucide-react';
import { AutodeskConnection } from './autodesk-connection';
import { QuantitySourcePicker } from './quantity-source-picker';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { quantityBrowse, quantityCommand, quantityResponse } from '@/lib/quantities/client';
import type { Entry } from '@/lib/autodesk/data';
import type { QuantityProject, QuantitySource } from '@/lib/quantities/contracts';
import { catalogSchema, resultSchema, describeBimResult, type BimCatalog, type BimPlan, type BimResult } from '@/lib/bim-chat/contracts';

export function BimChatWorkspace(){
  const [hubs,setHubs]=useState<Entry[]>([]),[hubId,setHubId]=useState('');
  const [projects,setProjects]=useState<Entry[]>([]),[projectId,setProjectId]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[nextPage,setNextPage]=useState<number|null>(null),[partial,setPartial]=useState(false);
  useEffect(()=>{const controller=new AbortController();void quantityBrowse({operation:'hubs'},controller.signal).then(page=>{if(controller.signal.aborted)return;setHubs(page.entries);setPartial(page.evidence.partial);if(page.entries.length===1)setHubId(page.entries[0].id);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[retry]);
  useEffect(()=>{if(!hubId)return;const controller=new AbortController();async function load(){setBusy(true);setError('');try{const page=await quantityBrowse({operation:'projects',hubId},controller.signal);if(controller.signal.aborted)return;setProjects(page.entries);setNextPage(page.evidence.nextPage);setPartial(page.evidence.partial);}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setBusy(false);}}void load();return()=>controller.abort();},[hubId,retry]);
  async function more(){if(nextPage===null)return;setBusy(true);try{const page=await quantityBrowse({operation:'projects',hubId,page:nextPage});setProjects(old=>[...new Map([...old,...page.entries].map(p=>[p.id,p])).values()]);setNextPage(page.evidence.nextPage);setPartial(page.evidence.partial);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const project=useMemo<QuantityProject>(()=>({kind:'project',hubId,projectId}),[hubId,projectId]);
  return <div className="bim-chat-page">
    <header className="bim-chat-heading"><div><p className="eyebrow">CONVERSA CON TU MODELO</p><h1>Chat BIM IA</h1><p>Elige una vista. Consulta sus elementos y actúa sobre el modelo.</p></div><AutodeskConnection/></header>
    <div className="bim-chat-projects"><label>Cuenta Autodesk<select value={hubId} disabled={busy} onChange={e=>{setHubId(e.target.value);setProjects([]);setProjectId('');setNextPage(null);}}><option value="">Seleccionar cuenta</option>{hubs.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>Proyecto<select value={projectId} disabled={!hubId||busy} onChange={e=>setProjectId(e.target.value)}><option value="">Seleccionar proyecto</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{nextPage!==null&&<button className="quantity-secondary" disabled={busy} onClick={()=>void more()}>Más proyectos</button>}<button className="quantity-icon-button" aria-label="Recargar proyectos" disabled={busy} onClick={()=>setRetry(n=>n+1)}><RefreshCw size={17}/></button>{busy&&<span role="status">Consultando Autodesk…</span>}</div>
    {error&&<p role="alert" className="quantity-error">{error}</p>}{partial&&<p className="quantity-help">La lista de Autodesk puede estar incompleta. Carga más proyectos o vuelve a consultar.</p>}
    {projectId?<BimProject key={`${hubId}:${projectId}`} project={project}/>:<div className="bim-chat-welcome"><Box size={42}/><h2>Tu modelo, una conversación</h2><p>Selecciona el proyecto y después un archivo RVT, su versión y una vista publicada.</p><div><span>Modelo a la izquierda</span><span>Chat y acciones a la derecha</span></div></div>}
  </div>;
}
function BimProject({project}:{project:QuantityProject}){
  const [source,setSource]=useState<QuantitySource|null>(null),[configure,setConfigure]=useState(true),[reload,setReload]=useState(0);
  const key=source?.view?`${source.scope.itemId}:${source.version.id}:${source.view.id}:${reload}`:'empty';
  return <><div className="bim-chat-modelbar"><div><strong>{source?.fileName??'Selecciona un modelo BIM'}</strong><span>{source?`V${source.version.number} · ${source.view?.name??'Vista pendiente'}`:'Archivo RVT de Autodesk Forma'}</span></div><button className="quantity-secondary" onClick={()=>setConfigure(true)}><Settings2 size={15}/>Configurar archivo y vista</button>{source?.view&&<button className="quantity-icon-button" aria-label="Recargar modelo" onClick={()=>setReload(n=>n+1)}><RefreshCw size={16}/></button>}</div>
    <Dialog open={configure} onOpenChange={setConfigure}><DialogContent className="bim-chat-config"><DialogTitle>Elegir modelo y vista</DialogTitle><DialogDescription>Selecciona el RVT, su versión y la vista publicada. Al cambiar la fuente se inicia otra conversación.</DialogDescription><QuantitySourcePicker project={project} source={source} disabled={false} onChange={value=>{setSource(value);if(value?.view)setConfigure(false);}}/></DialogContent></Dialog>
    {source?.view?<BimModelSession key={key} project={project} source={source}/>:<div className="bim-chat-welcome"><Box size={42}/><h2>Prepara tu vista de trabajo</h2><p>El chat se habilitará cuando el visor termine de leer los elementos y sus propiedades.</p><button className="quantity-primary" onClick={()=>setConfigure(true)}>Elegir archivo y vista</button></div>}</>;
}
type Turn={id:string;question:string;answer?:string;result?:BimResult;plan?:BimPlan;error?:boolean};
type Reply={catalog?:unknown;result?:unknown;error?:string};
const quickActions:[string,BimPlan['action']][]=[['Aislar','isolate'],['Atenuar resto','attenuate'],['Ocultar','hide'],['Propiedades','properties'],['Mostrar todo','showAll'],['Restaurar colores','resetColors']];

function BimModelSession({project,source}:{project:QuantityProject;source:QuantitySource}){
  const frame=useRef<HTMLIFrameElement>(null),bottom=useRef<HTMLDivElement>(null);
  const pending=useRef(new Map<string,{resolve:(r:Reply)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>());
  const controller=useRef<AbortController|null>(null),revision=useRef(0),createdAt=useRef(Date.now());
  const invalidate=useCallback(()=>{revision.current++;controller.current?.abort();},[]);
  const [frameUrl,setFrameUrl]=useState(''),[status,setStatus]=useState('Verificando la versión y vista…'),[loadError,setLoadError]=useState('');
  const [catalog,setCatalog]=useState<BimCatalog|null>(null),[selectionCount,setSelectionCount]=useState(0),[turns,setTurns]=useState<Turn[]>([]),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[color,setColor]=useState<BimPlan['color']>('azul');
  const post=useCallback((data:Record<string,unknown>)=>frame.current?.contentWindow?.postMessage({...data,type:'aiforma-bim-request',viewId:source.view!.id,urn:source.version.modelId},window.location.origin),[source]);
  const requestFrame=useCallback((operation:string,plan?:BimPlan)=>new Promise<Reply>((resolve,reject)=>{
    if(!frame.current?.contentWindow){reject(Error('El visor no está disponible.'));return;}
    const requestId=crypto.randomUUID();const timer=setTimeout(()=>{pending.current.delete(requestId);post({operation:'cancel',requestId:crypto.randomUUID()});reject(Error('La lectura del modelo está tardando demasiado. Recarga el modelo para volver a intentarlo.'));},120000);
    pending.current.set(requestId,{resolve,reject,timer});post({operation,requestId,plan});
  }),[post]);
  useEffect(()=>{
    const loading=new AbortController(),queue=pending.current;
    function receive(event:MessageEvent){
      const data=event.data;if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow||data?.urn!==source.version.modelId||data.viewId!==source.view!.id)return;
      if(data.type==='aiforma-bim-result'){
        if(data.requestId==='selection'&&Number.isSafeInteger(data.selectionCount)){setSelectionCount(data.selectionCount);return;}
        const job=queue.get(data.requestId);if(!job)return;clearTimeout(job.timer);queue.delete(data.requestId);if(data.error)job.reject(Error(data.error));else job.resolve(data);
      }
      if(data.type!=='aiforma-viewer')return;
      if(data.state==='loading')setStatus(String(data.message));
      if(data.state==='error'){setLoadError(String(data.message));setCatalog(null);}
      if(data.state==='ready'){
        setStatus('Leyendo los elementos y propiedades de la vista…');
        void requestFrame('catalog').then(reply=>{if(loading.signal.aborted)return;const parsed=catalogSchema.parse(reply.catalog);setCatalog(parsed);setStatus(`${parsed.total.toLocaleString('es-CL')} elementos con geometría leídos · Vista lista`);}).catch(e=>{if(!loading.signal.aborted)setLoadError(e.message);});
      }
    }
    window.addEventListener('message',receive);
    void quantityCommand<{frameUrl:string;versionId:string;viewId:string}>(project,{action:'viewer',file:source.scope,versionId:source.version.id,viewId:source.view!.id},loading.signal).then(result=>{if(loading.signal.aborted)return;if(result.versionId!==source.version.id||result.viewId!==source.view!.id||!result.frameUrl.startsWith('/api/quantities/viewer-frame?ticket='))throw Error('La fuente del visor no coincide con la selección.');setFrameUrl(result.frameUrl);}).catch(e=>{if(!loading.signal.aborted)setLoadError(e.message);});
    return()=>{loading.abort();invalidate();window.removeEventListener('message',receive);for(const job of queue.values()){clearTimeout(job.timer);job.reject(Error('La vista cambió.'));}queue.clear();};
  },[project,source,requestFrame,invalidate]);
  useEffect(()=>{if(turns.length||busy)bottom.current?.scrollIntoView({block:'nearest'});},[turns,busy]);
  const reset=useCallback(()=>{revision.current++;controller.current?.abort();for(const job of pending.current.values()){clearTimeout(job.timer);job.reject(Error('Conversación cancelada.'));}pending.current.clear();post({operation:'cancel',requestId:crypto.randomUUID()});setTurns([]);setQuestion('');setBusy(false);createdAt.current=Date.now();},[post]);
  useEffect(()=>{const timer=setInterval(()=>{if(Date.now()-createdAt.current>=5*86400000)reset();},30000);return()=>clearInterval(timer);},[reset]);
  async function submit(text:string,direct?:BimPlan){
    if(!catalog||busy||!text.trim())return;
    const id=crypto.randomUUID(),run=++revision.current;
    const abort=new AbortController();controller.current=abort;
    const previous=turns.filter(t=>t.plan&&t.result).slice(-4).map(t=>({question:t.question,plan:t.plan!}));
    setTurns(old=>[...old,{id,question:text}]);setQuestion('');setBusy(true);
    try {
      let plan=direct;
      if(!plan){const response=await quantityResponse<{plan:BimPlan;versionId:string;viewId:string}>('/api/bim-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:source.scope,versionId:source.version.id,viewId:source.view!.id,question:text,catalog,previous,selectionCount}),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(85000)])});if(response.versionId!==source.version.id||response.viewId!==source.view!.id)throw Error('La respuesta corresponde a otra versión o vista.');plan=response.plan;}
      if(run!==revision.current)return;
      if(plan.kind==='clarify'){
        const answer=plan.reason==='unsupported'?'Puedo buscar elementos, contar coincidencias, leer sus propiedades y actuar sobre la vista. Para cantidades físicas usa Cubicaciones; para leer documentos, Asistente IA. ¿Qué elementos quieres revisar?':plan.reason==='unknown_property'?'No puedo identificar el parámetro necesario con la información disponible. Revisa «Parámetros del modelo» o selecciona un elemento para consultar sus propiedades.':'Necesito un criterio más preciso para hacer esa selección. Indica el tipo de elemento, el valor de un parámetro o el color; también puedes seleccionar elementos en el visor.';
        setTurns(old=>old.map(t=>t.id===id?{...t,answer}:t));return;
      }
      const reply=await requestFrame('execute',plan);if(run!==revision.current)return;
      const result=resultSchema.parse(reply.result);if(result.action!==plan.action||result.color!==plan.color||result.count>result.total)throw Error('No se pudo validar la ejecución de la acción.');
      setSelectionCount(result.selectionCount);setTurns(old=>old.map(t=>t.id===id?{...t,plan,result,answer:describeBimResult(result)}:t));
    }catch(e){if(run===revision.current)setTurns(old=>old.map(t=>t.id===id?{...t,error:true,answer:(e as Error).message}:t));}
    finally{if(run===revision.current)setBusy(false);}
  }
  function action(action:BimPlan['action'],label:string){void submit(label,{kind:'execute',reason:'none',action,target:['showAll','resetColors','clearSelection'].includes(action)?'model':'selection',color:action==='color'?color:null,filters:[]});}
  return <div className="bim-chat-board"><section className="bim-chat-model"><header><Box size={19}/><strong>Modelo BIM</strong><span>{source.view!.name}</span>{source.version.webUrl&&<a href={source.version.webUrl} target="_blank" rel="noopener noreferrer" title="Abrir versión en Autodesk"><ExternalLink size={16}/></a>}</header>
    {frameUrl?<iframe ref={frame} src={frameUrl} title={`Modelo ${source.fileName} · V${source.version.number} · ${source.view!.name}`} allow="fullscreen" allowFullScreen/>:<div className="bim-chat-loading"><Box size={38}/><p>{loadError||status}</p></div>}
    <footer><span role="status" className={loadError?'quantity-error':''}>{loadError||status}</span><small>Solo elementos y propiedades de esta vista publicada. No incluye contenido omitido por Autodesk.</small></footer></section>
    <section className="bim-chat-conversation" aria-label="Chat BIM IA"><header><MessageSquare size={21}/><div><h2>Tu asistente BIM</h2><p>{selectionCount.toLocaleString('es-CL')} elementos en la selección</p></div><button className="quantity-text-button" disabled={!catalog} onClick={reset}><Plus size={14}/>Nueva conversación</button></header>
      <div className="bim-chat-context"><strong>{source.projectName}</strong><span>{source.fileName} · V{source.version.number} · {source.view!.name}</span></div>
      <div className="bim-chat-messages" aria-live="polite">
        {!turns.length&&<div className="bim-chat-intro"><div><MessageSquare size={28}/></div><h3>¿Qué quieres ver en el modelo?</h3><p>Puedo encontrar elementos por sus propiedades, seleccionarlos y ayudarte a revisar la vista.</p>{['Muéstrame los hormigones','Selecciona las vigas','Muéstrame los elementos de Cubierta'].map(q=><button key={q} disabled={!catalog||busy} onClick={()=>void submit(q)}>{q}<ArrowUp size={14}/></button>)}<small>Después puedes decir «aíslalos» o «píntalos de rojo».</small></div>}
        {turns.map(turn=><article key={turn.id} className="bim-chat-turn"><p className="bim-chat-question">{turn.question}</p><div className={`bim-chat-answer${turn.error?' is-error':''}`}><strong>Chat BIM IA</strong><p>{turn.answer??'Consultando el modelo…'}</p>{turn.result&&<BimEvidence result={turn.result} source={source}/>}</div></article>)}<div ref={bottom}/>
      </div>
      <details className="bim-chat-tools"><summary>Acciones del visor{selectionCount?` · ${selectionCount.toLocaleString('es-CL')} seleccionados`:''}</summary><div className="bim-chat-actions">{quickActions.map(([label,act])=><button key={act} disabled={!catalog||busy||(!['showAll','resetColors'].includes(act)&&!selectionCount)} onClick={()=>action(act,label)}>{label}</button>)}<div><select aria-label="Color para la selección" value={color??'azul'} onChange={e=>setColor(e.target.value as BimPlan['color'])}>{['azul','rojo','verde','amarillo','naranja','violeta'].map(c=><option key={c}>{c}</option>)}</select><button disabled={!catalog||busy||!selectionCount} onClick={()=>action('color',`Pintar selección de ${color}`)}>Pintar selección</button></div></div></details>
      <form className="bim-chat-composer" onSubmit={e=>{e.preventDefault();void submit(question);}}><label className="sr-only" htmlFor="bim-chat-question">Pregunta sobre el modelo</label><textarea id="bim-chat-question" value={question} maxLength={2000} disabled={!catalog} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void submit(question);}}} placeholder={catalog?'Muéstrame elementos, consulta propiedades o pide una acción…':'Selecciona una vista y espera a que termine su lectura…'}/><button className="quantity-primary" aria-label="Enviar al chat BIM" disabled={!catalog||busy||!question.trim()}><ArrowUp size={19}/></button></form>
      <details className="bim-chat-catalog"><summary>Parámetros del modelo{catalog?` · ${catalog.fields.length}`:''}</summary>{catalog?<><p>Ejemplos de valores disponibles. Las consultas revisan todos los elementos leídos; esta lista es acotada.</p>{catalog.fields.map(f=><p key={f.id}><strong>{f.label}</strong>: {f.values.join(' · ')}{f.partial?' · …':''}</p>)}</>:<p>Lectura pendiente.</p>}</details>
      <details className="bim-chat-privacy"><summary><ShieldCheck size={12}/>Consulta con evidencia · Alcance y privacidad</summary><p className="bim-chat-note">Acciones locales de visualización. Se envían a OpenAI tu consulta y ejemplos de propiedades para interpretar la intención. Conversación de esta sesión; se borra al salir o al cambiar de modelo.</p></details>
    </section></div>;
}
function BimEvidence({result,source}:{result:BimResult;source:QuantitySource}){
  return <details className="bim-chat-evidence"><summary>Ver criterios y evidencia{result.count?` · ${result.count.toLocaleString('es-CL')} elementos`:''}</summary><p>{source.fileName} · V{source.version.number} · {source.view!.name}</p><p>{result.criteria.length?result.criteria.join(' + '):'Selección activa / acción visual'}.</p><p>Leídos: {result.total.toLocaleString('es-CL')} elementos con geometría. Consultado: {new Date(result.readAt).toLocaleString('es-CL')}.</p>{result.samplePartial&&<p>Se muestran 8 ejemplos del resultado; la acción usa todas las coincidencias.</p>}{result.propertiesPartial&&<p>La lista muestra hasta 80 parámetros por ejemplo. La paleta del visor permite revisar el resto.</p>}{result.sample.map(row=><div key={row.dbId}><strong>{row.name}</strong><dl>{row.properties.map(p=><div key={p.name}><dt>{p.name}</dt><dd>{p.value}{p.units&&<small> · Unidad Autodesk: {p.units}</small>}</dd></div>)}</dl></div>)}{source.version.webUrl&&<a href={source.version.webUrl} target="_blank" rel="noopener noreferrer">Abrir versión en Autodesk ↗</a>}</details>;
}
