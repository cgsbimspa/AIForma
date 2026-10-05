'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {useState} from 'react';
import {ArrowUp,Sparkles,ArrowLeft} from 'lucide-react';
import {useProjectContext,useProjectState} from './project-context';
import {intentLabels,projectIntent,type ProjectIntent} from '@/lib/projects/intent';
import {quantityResponse} from '@/lib/quantities/client';
import type {ProjectSummary} from '@/lib/projects/summary';
const Documents=dynamic(()=>import('./assistant-workspace').then(m=>m.AssistantWorkspace),{loading:()=> <p role='status'>Abriendo documentos…</p>});
const Model=dynamic(()=>import('./bim-chat-workspace').then(m=>m.BimChatWorkspace),{loading:()=> <p role='status'>Abriendo consulta del modelo…</p>});
type Request={id:string;text:string;intent:ProjectIntent;submitted:boolean};
export function ProjectAI(){
 const p=useProjectContext(),[question,setQuestion]=useProjectState('project-ai.draft',''),[request,setRequest]=useProjectState<Request|null>('project-ai.request',null),[ambiguous,setAmbiguous]=useState(false);
 const [summary,setSummary]=useState<ProjectSummary|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function start(intent?:ProjectIntent){if(!question.trim())return;const route=intent??projectIntent(question);if(!route){setAmbiguous(true);return;}const next={id:crypto.randomUUID(),text:question.trim(),intent:route,submitted:false};setRequest(next);setAmbiguous(false);setError('');setSummary(null);
  if(['AUDIT_QUERY','QUANTITY_QUERY','REGULATION_QUERY','ISSUE_QUERY'].includes(route)){setBusy(true);try{setSummary(await quantityResponse<ProjectSummary>(`/api/projects/summary?scope=${encodeURIComponent(JSON.stringify(p.project))}`));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 }
 const model=request&&['MODEL_ACTION','DATA_QUERY'].includes(request.intent),document=request?.intent==='DOCUMENT_QUERY';
 const handled=()=>setRequest(old=>old?{...old,submitted:true}:null);
 const choices=p.configuration?.disciplines.filter(d=>d.enabled&&d.source?.view)??[];
 const currentSummary=summary?.scope.hubId===p.hubId&&summary.scope.projectId===p.projectId?summary:null;
 const resultModule=request?.intent==='AUDIT_QUERY'?'audit':request?.intent==='QUANTITY_QUERY'?'quantities':'coordination';
 const result=currentSummary?.modules.find(m=>m.module===resultModule),href=resultModule==='audit'?'/auditoria-bim':resultModule==='quantities'?'/cubicaciones':'/coordinacion-normativa';
 return <div className='project-ai' key={`${p.hubId}:${p.projectId}`}><header className='project-ai-heading'><div><h1><Sparkles size={22}/>Consultar IA</h1><p>Pregunta sobre los documentos, datos y resultados de este proyecto.</p></div>{request&&<button className='quantity-secondary' onClick={()=>{setRequest(null);setAmbiguous(false);}}><ArrowLeft size={14}/>Cambiar consulta</button>}</header>
 {!request?<section className='project-ai-start'><Sparkles size={36}/><h2>¿Qué quieres consultar?</h2><form onSubmit={e=>{e.preventDefault();void start();}}><label className='sr-only' htmlFor='project-ai-question'>Consulta del proyecto</label><textarea id='project-ai-question' value={question} onChange={e=>setQuestion(e.target.value)} maxLength={2000} placeholder='Busca un documento, muéstrame elementos o consulta los resultados del proyecto…'/><button className='quantity-primary' disabled={!question.trim()} aria-label='Enviar consulta'><ArrowUp size={19}/></button></form>{ambiguous&&<p>No puedo determinar qué fuente necesitas. ¿Dónde quieres que busquemos?</p>}<div className='project-ai-intents'>{Object.entries(intentLabels).map(([key,label])=><button key={key} disabled={!question.trim()} onClick={()=>void start(key as ProjectIntent)}>{label}</button>)}</div><small>Los cálculos y comprobaciones se obtienen de los motores y fuentes del proyecto.</small></section>:<>
 <div className='project-ai-request'><strong>Tú</strong><span>{request.text}</span><small>{intentLabels[request.intent]}</small></div>
 {document&&<Documents key={request.id} compact initialQuestion={request.submitted?'':request.text} onQuestionHandled={handled}/>}
 {model&&(p.selectedDiscipline?.source?.view?<Model key={`${request.id}:${p.selectedDiscipline.id}`} contextual initialQuestion={request.submitted?'':request.text} onQuestionHandled={handled}/>:<section className='configuration-card'><h2>¿Qué modelo quieres consultar?</h2><p>Elige una especialidad configurada. No abriré una fuente por aproximación.</p>{choices.map(d=><button className='quantity-secondary' key={d.id} onClick={()=>p.selectDiscipline(d.id)}>{d.name} · {d.source!.fileName} · V{d.source!.version.number}</button>)}{!choices.length&&<Link href='/configuracion/assistant'>Configurar archivo y vista →</Link>}</section>)}
 {!model&&!document&&<section className='configuration-card' aria-live='polite'>{busy?<p>Consultando registros guardados…</p>:error?<p role='alert'>{error}</p>:request.intent==='ISSUE_QUERY'?<><h2>Incidencias</h2><p>No hay un inventario unificado de incidencias disponible para esta consulta. No puedo confirmar un recuento. Las incidencias internas se revisan en sus ejecuciones de origen.</p><Link href='/incidencias'>Abrir Incidencias →</Link></>:<><h2>Resultados guardados del proyecto</h2>{result?.state==='AVAILABLE'?<><p>{result.runs===0?'No encontré ejecuciones guardadas en este módulo. Ejecuta el análisis para disponer de evidencia.':`Encontré ${result.runs} ejecuciones guardadas. El registro más reciente es del ${new Date(result.latestAt!).toLocaleString('es-CL')}.`}</p><p>Este recuento no responde por sí solo la pregunta técnica. Abre la ejecución para consultar sus hallazgos, cantidades, versión y evidencia; no he deducido valores ni cumplimiento.</p></>:<p>Los registros no están disponibles. Esto no significa que el proyecto no tenga resultados.</p>}<Link className='quantity-secondary' href={href}>Consultar resultados y evidencia →</Link><small>Fuente: registros guardados de este proyecto · {currentSummary?new Date(currentSummary.checkedAt).toLocaleString('es-CL'):'Consulta pendiente'}</small></>}</section>}
 </>}</div>;
}
