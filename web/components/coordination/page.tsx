'use client';
import {useModelContext,useProjectContext} from '../project-context';
import Link from 'next/link';
import {useState} from 'react';
import {ShieldCheck,ChevronRight,RefreshCw,Play,FileCheck2,Settings2,History,BookOpen,Box} from 'lucide-react';
import {useCoordination} from './context';
import {systems,specialties,href,systemHref,futureCoordination,hotWaterFuture} from '@/lib/coordination/catalog';
import {regulatoryDisciplines,sourceIdentity} from '@/lib/projects/configuration';
import {ridaaRules,ridaaSource} from '@/lib/coordination/ridaa';
import {emptyConfiguration,type Report} from '@/lib/coordination/contracts';
import {quantityCommand} from '@/lib/quantities/client';
import type {ModelVersion} from '@/lib/quantities/contracts';
import {ConfigurationPanel,RulesPanel} from './settings';
import {LinkedModelsPanel} from './inspection';
import {ReviewPanel,HistoryPanel} from './results';

export const date=(v:string)=>new Date(v).toLocaleString('es-CL');
export function CoordinationPage({systemId,section}:{systemId?:string;section:string}){
 const central=useProjectContext();
 const c=useCoordination(),system=systems.find(s=>s.id===systemId),saved=c.workspace?.configurations.find(s=>s.configuration.systemId===systemId),config=saved?.configuration??emptyConfiguration(systemId??'SAN-01'),revision=saved?.revision??0;
 const compatible=!systemId||Boolean(central.selectedDiscipline&&regulatoryDisciplines[systemId]?.includes(central.selectedDiscipline.code));
 const synchronized=compatible&&sourceIdentity(config.source)===sourceIdentity(central.selectedDiscipline?.source);
 const report=c.report?.systemId===systemId?c.report:null;
 const [publication,setPublication]=useState<{key:string;latest:ModelVersion}|null>(null),[checking,setChecking]=useState(false),[checkError,setCheckError]=useState('');
 const source=config.source,sourceKey=source?`${c.projectId}:${source.scope.itemId}:${source.version.id}`:'';
 useModelContext(source);
 const latest=publication?.key===sourceKey?publication.latest:null;
 async function verify(){if(!source)return;setChecking(true);setCheckError('');try{const v=await quantityCommand<{latest:ModelVersion}>(c.project,{action:'versions',file:source.scope});setPublication({key:sourceKey,latest:v.latest});}catch(e){setCheckError((e as Error).message);}finally{setChecking(false);}}
 async function run(){try{await c.command<Report>({action:'run',systemId,revision});}catch{/* Provider displays error. */}}
 const selectedProject=c.projects.find(p=>p.id===c.projectId);
 return <div className="coord-page">
  <div className="coord-context-actions"><button disabled={c.busy||!c.projectId} onClick={()=>void c.reload()}><RefreshCw size={14}/>Recargar configuración</button></div>
  {(c.error||checkError)&&<p className="coord-alert" role="alert">{c.error||checkError}</p>}{c.notice&&<p role="status" className="coord-notice">{c.notice}</p>}
  <div className="coord-title"><div><div className="coord-crumb"><Link href={href()}>Coordinación</Link>{system&&<><ChevronRight size={12}/><Link href={href('sanitario')}>Sanitario</Link></>}</div><h1>{system?.name??(section==='resumen'?'Resumen de coordinación':specialties.find(s=>s.slug===section)?.name??'Sanitario')}</h1></div>{system&&<div className="coord-actions"><button disabled={!source||checking||c.busy} onClick={()=>void verify()}><RefreshCw size={14}/>{checking?'Verificando…':'Verificar versión'}</button><button className="coord-primary" disabled={c.busy||!source?.view||!config.scope.confirmed||!synchronized} onClick={()=>void run()}><Play size={14}/>{c.busy?'Procesando…':'Ejecutar revisión'}</button></div>}</div>
  {system&&!compatible&&<div className="coord-notice">Selecciona una especialidad compatible con {system.name} en el encabezado o en Configuración. La revisión guardada conserva su fuente original.<Link href="/configuracion"> Configurar →</Link></div>}
  {system&&<><div className="coord-modelbar"><span className={`coord-version ${latest?latest.id===source?.version.id?'current':'old':''}`}><i/>{latest?(latest.id===source?.version.id?'Última publicación verificada':`Actualización disponible · V${latest.number}`):'Publicación por verificar'}</span><Link href={`${systemHref(system.id)}/configuracion`}>Actualizar / versión anterior</Link><Link href={`${systemHref(system.id)}/historial`}>Comparar versiones</Link></div><nav className="coord-tabs" aria-label="Vistas del sistema">{[['revision','Revisión',FileCheck2],['configuracion','Archivo y alcance',Settings2],['vinculos','Modelos y vínculos',Box],['reglas','Reglas RIDAA',BookOpen],['historial','Historial',History]].map(([id,name,Icon])=>{const I=Icon as typeof FileCheck2;return <Link key={id as string} href={`${systemHref(system.id)}${id==='revision'?'':`/${id}`}`} aria-current={section===id?'page':undefined}><I size={15}/>{name as string}</Link>;})}</nav></>}
  {!system?<Overview section={section}/>:section==='reglas'?<RulesPanel key={`${c.projectId}:${system.id}:${revision}`} configuration={config} revision={revision}/>:!c.projectId?<div className="coord-empty"><ShieldCheck size={34}/><h2>Selecciona la cuenta y el proyecto</h2><p>El catálogo RIDAA está disponible en el resumen y en Reglas RIDAA. El modelo, las reglas asociadas y los resultados se guardan por proyecto.</p></div>:!c.workspace?<div className="coord-empty">{c.busy?'Cargando configuración…':'La configuración no está disponible. Reintenta la carga del proyecto.'}</div>:<div key={`${c.projectId}:${system.id}:${section}:${revision}`} className="coord-view">{section==='vinculos'?<LinkedModelsPanel configuration={config}/>:section==='configuracion'?<ConfigurationPanel configuration={config} revision={revision}/>:section==='historial'?<HistoryPanel systemId={system.id}/>:<ReviewPanel configuration={config} report={report} projectName={selectedProject?.name??''}/>}</div>}
 </div>;
}
function Overview({section}:{section:string}){
 const context=useProjectContext();
 const c=useCoordination(),future=specialties.find(s=>s.slug===section&&!s.enabled);
 if(future)return <div className="coord-empty"><ShieldCheck size={36}/><h2>{future.name} · Próximamente</h2><p>La estructura está preparada. No hay un motor técnico habilitado para esta especialidad.</p>{section==='entre-especialidades'&&<ul>{futureCoordination.map(s=><li key={s}>{s}</li>)}</ul>}</div>;
 return <div className="coord-overview"><div className="coord-intro"><div><h2>Sanitario</h2><p>Cinco sistemas, cada uno con su archivo, alcance, reglas y revisiones.</p></div><span className="coord-tag">Primera versión</span></div><div className="coord-system-grid">{systems.map(s=>{const config=c.workspace?.configurations.find(v=>v.configuration.systemId===s.id)?.configuration,runs=c.workspace?.runs.filter(r=>r.systemId===s.id)??[],issues=c.workspace?.annotations.filter(a=>a.systemId===s.id&&a.kind==='issue')??[];return <article className="coord-card" key={s.id}><span className="coord-kicker">{s.id}</span><h3>{s.name}</h3><p>{config?.source?`${config.source.fileName} · V${config.source.version.number}`:'Fuente BIM por configurar'}</p><div className="coord-card-facts"><span>{c.workspace?`${runs.length} revisiones recientes`:'Selecciona proyecto para ver revisiones'}</span>{issues.length>0&&<span>{issues.length} incidencias internas</span>}</div><Link className="coord-primary" href={systemHref(s.id)} onClick={()=>{const eligible=context.configuration?.disciplines.filter(d=>d.enabled&&regulatoryDisciplines[s.id]?.includes(d.code))??[];if(eligible.length===1)context.selectDiscipline(eligible[0].id);}}>Abrir sistema <ChevronRight size={15}/></Link></article>;})}</div><section className="coord-card"><div className="coord-intro"><h2>Base normativa · RIDAA</h2><a href={ridaaSource.url} target="_blank" rel="noopener noreferrer">Consultar fuente oficial ↗</a></div><p>{ridaaRules.length} controles base con artículo, ámbito y dependencias. D.S. MOP 50/2002, texto consolidado del {ridaaSource.version}, consultado el {ridaaSource.checkedAt}.</p><p>Las verificaciones requieren asociar parámetros publicados y confirmar a qué elementos aplica cada regla. Las redes exteriores mantienen sus normas NCh referidas como pendientes. Un control sin datos aparece como «No evaluado».</p><details><summary>Ver controles de la base</summary><div className="coord-rule-grid">{ridaaRules.map(r=><div key={r.id}><strong>{r.name}</strong><small>{r.id} · Art. {r.article}</small><p>{r.requirement}</p></div>)}</div></details></section><section className="coord-card"><h2>Especialidades futuras</h2><div className="coord-tags">{specialties.filter(s=>!s.enabled).map(s=><Link key={s.id} href={href(s.slug)}>{s.name} · Próximamente</Link>)}</div><details><summary>Agua caliente: ampliaciones previstas</summary><p>{hotWaterFuture.join(' · ')}</p></details></section></div>;
}
