'use client';
import { useMemo,useState } from 'react';
import Link from 'next/link';
import type { AuditInventory } from '@/lib/audit/contracts';
import { explicitLevelMetres,type AuditAecLevel } from '@/lib/audit/levels';
import { auditHref } from '@/lib/audit/navigation';

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
const unavailable='No disponible';
const numeric=(value:number)=>value.toLocaleString('es-CL',{maximumFractionDigits:6});
const flag=(value:boolean|null)=>value===null?unavailable:value?'Sí':'No';

export function AuditLevels({inventory}:{inventory:AuditInventory}){
 const [tab,setTab]=useState<'inventory'|'coverage'>('inventory');
 const [query,setQuery]=useState(''),[origin,setOrigin]=useState(''),[page,setPage]=useState(0),[selected,setSelected]=useState<string|null>(null);
 const aec=inventory.aec;
 const rows=useMemo(()=>[
  ...inventory.levels.map(e=>({key:`view:${e.dbId}`,name:e.name,id:e.uniqueId??e.elementId,origin:'Vista publicada · origen no confirmado',source:'Vista publicada',path:inventory.endpoint,treePath:e.treePath?.join(' / ')??'',elevation:e.publishedElevation??null,metres:explicitLevelMetres(e.publishedElevation),level:null as AuditAecLevel|null})),
  ...(aec?.files??[]).flatMap(file=>(file.levels?.records??[]).map(level=>({key:level.key,name:level.name??unavailable,id:level.guid??'',origin:`${level.documentId??'Documento no identificado'} · ${level.originPath}`,source:'Datos AEC',path:file.endpoint,treePath:level.originPath,elevation:level.elevation,metres:null,level}))),
 ],[inventory.levels,inventory.endpoint,aec]);
 const origins=useMemo(()=>[...new Set(rows.map(r=>r.origin))],[rows]);
 const filtered=useMemo(()=>rows.filter(r=>(!origin||r.origin===origin)&&normalize([r.name,r.id,r.origin,r.elevation].join(' ')).includes(normalize(query))),[rows,origin,query]);
 const current=rows.find(r=>r.key===selected),pages=Math.max(1,Math.ceil(filtered.length/100)),activePage=Math.min(page,pages-1);
 const aecCount=aec?.files.reduce((n,f)=>n+(f.levels?.records.length??0),0)??0;
 const examined=aec?.files.some(f=>f.levels!==undefined);
 const clear=()=>{setQuery('');setOrigin('');setPage(0);setSelected(null);};
 return <section className="audit-card audit-levels">
  <div className="audit-title-row"><div><h2>Niveles del modelo</h2><p>{inventory.levels.length} registros de la vista · {aecCount} registros AEC</p></div><Link href={auditHref('')}>Ejecutar nueva auditoría →</Link></div>
  <p className="audit-notice">Incluye referencias AEC aunque no estén visibles en la vista 3D. Conserva niveles bajo cero y niveles que no están marcados como planta. Un mismo nivel puede aparecer en ambas fuentes; no se suman como elementos únicos ni se asignan pisos automáticamente.</p>
  <div className="audit-grid-tabs" role="group" aria-label="Secciones de niveles">{([['inventory','Inventario'],['coverage','Cobertura']] as const).map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div>
  {tab==='inventory'&&<>
   <div className="audit-filters"><label>Buscar nivel, ID o elevación<input value={query} placeholder="Nombre, identificador o cota…" onChange={e=>{setQuery(e.target.value);setPage(0);setSelected(null);}}/></label><label>Documento / origen<select value={origin} onChange={e=>{setOrigin(e.target.value);setPage(0);setSelected(null);}}><option value="">Todos los orígenes</option>{origins.map(o=><option key={o}>{o}</option>)}</select></label><button onClick={clear}>Limpiar búsqueda</button></div>
   <p role="status">{filtered.length} {filtered.length===1?'registro encontrado':'registros encontrados'}</p>
   {filtered.length?<div className="audit-table-wrap"><table><thead><tr><th>Nivel</th><th>Elevación publicada</th><th>Documento / fuente</th><th>Planta / estructural</th><th>Detalle</th></tr></thead><tbody>{filtered.slice(activePage*100,(activePage+1)*100).map(r=><tr key={r.key} className={selected===r.key?'audit-selected':''}><td>{r.name}<small>{r.id||'Identificador no disponible'}</small></td><td>{r.elevation===null?unavailable:typeof r.elevation==='number'?numeric(r.elevation):r.elevation}<small>{r.metres!==null?`${numeric(r.metres)} m · unidad explícita`:r.elevation!==null?'Valor original · unidad no verificada':''}</small></td><td>{r.source}<small>{r.origin}</small></td><td>{r.level?`${flag(r.level.buildingStory)} / ${flag(r.level.structure)}`:unavailable}</td><td><button onClick={()=>setSelected(r.key)}>Ver evidencia</button></td></tr>)}</tbody></table></div>:<p className="audit-notice">{rows.length?'No encontré niveles para esta búsqueda. Prueba otro nombre u origen.':'No se recuperaron niveles identificables en las fuentes consultadas. Esto no demuestra que el RVT carezca de niveles. Revisa Cobertura.'}</p>}
   {pages>1&&<div className="audit-detail-navigation"><button disabled={activePage===0} onClick={()=>setPage(activePage-1)}>Anterior</button><span>Página {activePage+1} de {pages}</span><button disabled={activePage+1>=pages} onClick={()=>setPage(activePage+1)}>Siguiente</button></div>}
   {current&&<aside className="audit-editor"><div className="audit-title-row"><h3>{current.name} · Evidencia</h3><button onClick={()=>setSelected(null)}>Cerrar detalle</button></div><dl><dt>Identificador original</dt><dd>{current.id||unavailable}</dd><dt>Origen</dt><dd>{current.origin}</dd><dt>Elevación original</dt><dd>{current.elevation??unavailable}</dd><dt>Fuente / ruta</dt><dd>{current.path}<br/>{current.treePath}</dd><dt>Fecha de consulta</dt><dd>{new Date(current.level&&aec?aec.fetchedAt:inventory.fetchedAt).toLocaleString('es-CL')}</dd>{current.level&&<><dt>Altura publicada hasta el siguiente nivel</dt><dd>{current.level.height===2147483647?'Límite superior no definido por Autodesk':current.level.height??unavailable} · unidades originales</dd><dt>Planta del edificio</dt><dd>{flag(current.level.buildingStory)}</dd><dt>Nivel estructural</dt><dd>{flag(current.level.structure)}</dd><dt>Plano de terreno</dt><dd>{flag(current.level.groundPlane)}</dd><dt>Planos de planta asociados</dt><dd>{flag(current.level.hasAssociatedViewPlans)}</dd></>}</dl><p>La cota AEC se conserva en el marco publicado del documento. No se convierte a metros sin una unidad verificada ni se compara con otros vínculos sin sus transformaciones. Un nombre como N2 no se convierte automáticamente en Piso 2.</p></aside>}
  </>}
  {tab==='coverage'&&<>
   {!examined&&<p className="audit-notice">{aec?.files.length?'Este informe es anterior a la lectura ampliada de niveles. Ejecuta una nueva auditoría.':aec?.message??'Los datos AEC aún no fueron consultados. Ejecuta una nueva auditoría.'}</p>}
   <p>Se consultan el árbol y las propiedades de la vista, además de los niveles y documentos vinculados incluidos en el archivo AEC de esta versión. Declarar un vínculo no garantiza que publique sus niveles; el sistema no le copia los del anfitrión.</p>
   {(aec?.files??[]).map(file=><details key={file.endpoint} open><summary>{file.documentId??'Archivo AEC'} · {file.levels?.records.length??0} niveles leídos</summary>{file.levels?<><p>{file.levels.invalidRecords} registros inválidos · {file.levels.invalidFields} registros con identificador, nombre o elevación incompletos</p><div className="audit-table-wrap"><table><thead><tr><th>Origen publicado</th><th>Lectura de niveles</th></tr></thead><tbody>{file.levels.documents.map(d=><tr key={d.path}><td>{d.documentId??'Documento no identificado'}<small>{d.path}</small></td><td>{d.fieldAvailable?`${d.count} registros publicados`:'Campo levels no disponible; no equivale a cero niveles'}</td></tr>)}</tbody></table></div></>:<p>Lectura ampliada no ejecutada en este informe.</p>}<dl><dt>Fuente</dt><dd>{file.endpoint}</dd><dt>Esquema</dt><dd>{file.schemaVersion??unavailable}</dd></dl></details>)}
   <details><summary>Fuentes consultadas y estado</summary><ul><li>Árbol: {inventory.treeEndpoint}</li><li>Propiedades: {inventory.endpoint}</li>{aec?.attempts.map((a,i)=><li key={i}>{a.status} · {a.endpoint}</li>)}</ul></details>
   <p>Esta lectura no cambia la configuración de pisos ni certifica coincidencias entre especialidades. Esos controles mantienen sus requisitos de unidades, correspondencias y tolerancias verificadas.</p>
  </>}
 </section>;
}
