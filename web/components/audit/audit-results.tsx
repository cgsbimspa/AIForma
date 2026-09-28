'use client';
import Link from 'next/link';
import { Suspense,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { QuantityViewer } from '@/components/quantity-viewer';
import { auditResults,type AuditFinding } from '@/lib/audit/contracts';
import { auditHref } from '@/lib/audit/navigation';
import { auditResponse,useAudit } from './audit-context';
import { AuditBadge,AuditEmpty } from './audit-page';

type Finding=AuditFinding & {affectedCount?:number;facets?:{level:string[];category:string[];family:string[];type:string[]}};
export function AuditFindings(){return <Suspense fallback={<p>Cargando hallazgos…</p>}><Findings/></Suspense>;}
function Findings(){
 const a=useAudit(),query=useSearchParams(),[selected,setSelected]=useState<string|null>(null),[filters,setFilters]=useState<Record<string,string>>({}),[page,setPage]=useState(0);
 const [action,setAction]=useState<{id:number;action:'focus'|'isolate'|'select';ids:string[]}|undefined>(),[viewer,setViewer]=useState(false),[localError,setLocalError]=useState(''),[actionBusy,setActionBusy]=useState(false);
 const [elementsPage,setElementsPage]=useState<{findingId:string;elements:AuditFinding['affectedElements'];total:number;nextPage:number|null}|null>(null);
 const run=a.run;
 if(!run)return <AuditEmpty title="Sin hallazgos cargados">Abre una ejecución desde <Link href={auditHref('')}>Resumen</Link> para revisar sus controles y evidencias.</AuditEmpty>;
 const findings=run.findings as Finding[],current=selected??query.get('hallazgo'),finding=findings.find(f=>f.id===current);
 const values={...filters,result:filters.result??query.get('estado')??''};
 const rows=findings.filter(f=>Object.entries(values).every(([k,v])=>!v||(k==='result'?f.result===v:k==='chapter'?f.ruleId.startsWith(v):k==='rule'?f.ruleId===v:(f.facets?.[k as 'category']??f.affectedElements.map(e=>e[k as 'category'])).includes(v))));
 const rule=finding?run.rules.find(r=>r.ruleId===finding.ruleId):null;
 async function detailPage(f:Finding,p=0){
  setActionBusy(true);setLocalError('');try{const d=await auditResponse<{elements:AuditFinding['affectedElements'];total:number;nextPage:number|null}>(a.project,undefined,`&run=${run!.id}&finding=${f.id}&page=${p}`);setElementsPage({findingId:f.id,...d});}catch(e){setLocalError((e as Error).message);}finally{setActionBusy(false);}
 }
 async function locate(f:Finding,mode:'focus'|'select'|'isolate'){
  setActionBusy(true);setLocalError('');try{const detail=await auditResponse<{ids:{uniqueId:string|null}[]}>(a.project,undefined,`&run=${run!.id}&finding=${f.id}`);const ids=detail.ids.flatMap(e=>e.uniqueId?[e.uniqueId]:[]);if(!ids.length)throw Error('Estos objetos no tienen UniqueId publicado para localizarlos de forma segura en el visor.');if(ids.length!==detail.ids.length)setLocalError(`${detail.ids.length-ids.length} objetos sin UniqueId no se pueden localizar en el visor.`);setViewer(true);setAction(previous=>({id:(previous?.id??0)+1,action:mode,ids}));}catch(e){setLocalError((e as Error).message);}finally{setActionBusy(false);}
 }
 const shown=finding?(elementsPage?.findingId===finding.id?elementsPage.elements:finding.affectedElements):[];
 return <>
  <section className="audit-card"><div className="audit-title-row"><h2>Resultados y hallazgos</h2><span>{rows.length} registros · {run.findings.length} total</span></div><p className="audit-muted">Inventarios y controles no evaluados se muestran separados por estado. Un hallazgo no crea una incidencia automáticamente.</p>
   <div className="audit-filters">{['result','chapter','rule','level','category','family','type'].map(k=>{
    const options=k==='result'?[...auditResults]:k==='chapter'?[...new Set(findings.map(f=>f.ruleId.slice(0,3)))]:k==='rule'?[...new Set(findings.map(f=>f.ruleId))]:[...new Set(findings.flatMap(f=>f.facets?.[k as 'category']??f.affectedElements.map(e=>e[k as 'category']).filter((v):v is string=>v!==null)))].sort();
    return <label key={k}>{{result:'Estado',chapter:'Capítulo',rule:'Regla',level:'Nivel',category:'Categoría',family:'Familia',type:'Tipo'}[k]}<select value={values[k as keyof typeof values]??''} onChange={e=>{setFilters(v=>({...v,[k]:e.target.value}));setPage(0);}}><option value="">Todos</option>{options.map(v=><option key={v}>{v}</option>)}</select></label>;
   })}</div><div className="audit-table-wrap"><table><thead><tr><th>Resultado</th><th>Regla</th><th>Elementos</th><th>Categoría / nivel</th><th>Descripción</th></tr></thead><tbody>{rows.slice(page*40,(page+1)*40).map(f=><tr key={f.id} className={f.id===current?'audit-selected':''}><td><AuditBadge value={f.result}/></td><td><button onClick={()=>{setSelected(f.id);setElementsPage(null);}}>{f.ruleId} · {f.title}</button><small>{f.id.slice(0,8)}</small></td><td>{f.affectedCount??f.affectedElements.length}</td><td>{(f.facets?.category??[...new Set(f.affectedElements.map(e=>e.category))]).filter(Boolean).join(', ')||'No disponible'}<br/><small>{(f.facets?.level??[...new Set(f.affectedElements.map(e=>e.level))]).filter(Boolean).join(', ')}</small></td><td>{f.description}</td></tr>)}</tbody></table></div>{!rows.length&&<p>No se encontraron registros para estos filtros.</p>}<div className="audit-actions"><button disabled={!page} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page+1} de {Math.max(1,Math.ceil(rows.length/40))}</span><button disabled={(page+1)*40>=rows.length} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div>
  </section>
  {finding&&<section className="audit-finding-detail"><aside className="audit-card"><div className="audit-title-row"><h2>{finding.ruleId} · {finding.title}</h2><AuditBadge value={finding.result}/></div><p>{finding.description}</p><dl><dt>Observado</dt><dd><pre>{JSON.stringify(finding.observedValue,null,2)??'No disponible'}</pre></dd><dt>Esperado</dt><dd><pre>{JSON.stringify(finding.expectedValue,null,2)??'Por definir'}</pre></dd><dt>Tolerancia usada</dt><dd>{finding.toleranceId?JSON.stringify(run.tolerances.find(t=>t.id===finding.toleranceId)): 'No aplica'}</dd><dt>Método / versión</dt><dd>{rule?.method} · {rule?.version}</dd><dt>Buena práctica</dt><dd>{rule?.goodPractice}</dd><dt>Origen de regla</dt><dd>{rule?.catalog}</dd></dl><details><summary>Evidencia y procedencia</summary>{finding.evidence.map((e,i)=><div key={i}><p>{e.source}</p><p>Propiedad: {e.property} · Consulta: {e.fetchedAt}</p><p>Versión: {run.versionId} · Vista: {run.viewId}</p></div>)}</details>
   <div className="audit-actions">{(['focus','isolate','select'] as const).map(mode=><button key={mode} disabled={actionBusy||!(finding.affectedCount??finding.affectedElements.length)} className="quantity-secondary" onClick={()=>void locate(finding,mode)}>{{focus:'Ver en modelo',isolate:'Aislar',select:'Seleccionar'}[mode]}</button>)}<button className="quantity-secondary" disabled={a.busy} onClick={()=>void a.command({action:'issue',runId:run.id,findingId:finding.id}).then(()=>a.setNotice('Solicitud de incidencia guardada. La integración con Review está pendiente; aún no es una incidencia publicada.')).catch(()=>{})}>Solicitar creación de incidencia</button></div>
   {localError&&<p role="alert" className="audit-alert">{localError}</p>}
   <h3>Elementos afectados</h3><div className="audit-table-wrap"><table><thead><tr><th>ID / UniqueId</th><th>Nombre</th><th>Categoría</th><th>Nivel</th></tr></thead><tbody>{shown.map(e=><tr key={e.dbId}><td>{e.elementId||`Revit ID no disponible · APS ${e.dbId}`} <small>{e.uniqueId??'UniqueId no disponible'}</small></td><td>{e.name}</td><td>{e.category??'No disponible'}</td><td>{e.level??'No disponible'}</td></tr>)}</tbody></table></div>{(finding.affectedCount??0)>50&&<div className="audit-actions"><button disabled={actionBusy} onClick={()=>void detailPage(finding,0)}>Primera página de elementos</button>{elementsPage?.nextPage!=null&&<button disabled={actionBusy} onClick={()=>void detailPage(finding,elementsPage.nextPage!)}>Siguientes elementos</button>}<small>{finding.affectedCount} en total. Las acciones del visor usan el conjunto completo con UniqueId.</small></div>}
  </aside>{viewer&&<div className="audit-card audit-viewer"><div className="audit-title-row"><h2>Vista auditada · V{run.source.version.number}</h2><button onClick={()=>setViewer(false)}>Cerrar visor</button></div><QuantityViewer project={a.project} source={run.source} auditAction={action}/></div>}</section>}
 </>;
}
