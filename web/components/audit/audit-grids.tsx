'use client';
import { useMemo,useState } from 'react';
import Link from 'next/link';
import type { AuditInventory } from '@/lib/audit/contracts';
import { gridChordAngle,type AuditAecGrid } from '@/lib/audit/grids';
import { auditHref } from '@/lib/audit/navigation';

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
const unavailable='No disponible';
const angle=(value:number|null)=>value===null?unavailable:`${value.toLocaleString('es-CL',{maximumFractionDigits:4})}°`;

export function AuditGrids({inventory}:{inventory:AuditInventory}) {
 const [tab,setTab]=useState<'inventory'|'geometry'|'coverage'>('inventory');
 const [query,setQuery]=useState(''),[document,setDocument]=useState(''),[page,setPage]=useState(0),[selected,setSelected]=useState<string|null>(null);
 const aec=inventory.aec;
 const rows=useMemo(()=>[
  ...inventory.grids.map(e=>({key:`view:${e.dbId}`,name:e.name,id:e.uniqueId??e.elementId,document:'Origen no confirmado · vista',source:'Vista publicada',path:(e.treePath??[]).join(' / '),grid:null as AuditAecGrid|null,apsId:e.dbId})),
  ...(aec?.files??[]).flatMap(file=>file.grids.map(grid=>({key:grid.key,name:grid.label??unavailable,id:grid.id??'',document:grid.document??'Documento no publicado · AEC',source:'Datos AEC',path:file.endpoint,grid,apsId:null}))),
 ],[inventory.grids,aec]);
 const documents=useMemo(()=>[...new Set(rows.map(r=>r.document))].sort((a,b)=>a.localeCompare(b,'es')),[rows]);
 const filtered=useMemo(()=>rows.filter(r=>(!document||r.document===document)&&normalize([r.name,r.id,r.document,r.path].join(' ')).includes(normalize(query))),[rows,document,query]);
 const current=rows.find(r=>r.key===selected),pages=Math.max(1,Math.ceil(filtered.length/100)),activePage=Math.min(page,pages-1);
 const status=aec?({AVAILABLE:'AEC recuperado',PARTIAL:'AEC parcial',NOT_FOUND:'AEC no publicado',UNAVAILABLE:'AEC no disponible'}[aec.status]):'AEC aún no consultado';
 return <section className="audit-card audit-grids">
  <div className="audit-title-row"><div><h2>Ejes y grillas del modelo</h2><p>{inventory.grids.length} registros de la vista · {aec?.files.reduce((n,f)=>n+f.grids.length,0)??0} registros AEC · {status}</p></div><Link href={auditHref('')}>Ejecutar nueva auditoría →</Link></div>
  <p className="audit-notice">La búsqueda combina objetos de la vista y referencias AEC del modelo y sus vínculos publicados. Un mismo eje puede aparecer en ambas fuentes: estos conteos no se suman como elementos únicos.</p>
  <div className="audit-grid-tabs" role="group" aria-label="Secciones de grillas">{([['inventory','Inventario'],['geometry','Geometría'],['coverage','Cobertura']] as const).map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div>
  {tab!=='coverage'&&<>
   <div className="audit-filters"><label>Buscar eje, ID o documento<input value={query} placeholder="Nombre, vínculo o identificador…" onChange={e=>{setQuery(e.target.value);setPage(0);setSelected(null);}}/></label><label>Documento de origen<select value={document} onChange={e=>{setDocument(e.target.value);setPage(0);setSelected(null);}}><option value="">Todos los documentos</option>{documents.map(d=><option key={d}>{d}</option>)}</select></label><button onClick={()=>{setQuery('');setDocument('');setPage(0);setSelected(null);}}>Limpiar búsqueda</button></div>
   {tab==='geometry'&&<p className="audit-notice">Las coordenadas se muestran en las unidades originales de Autodesk, sin conversión. El ángulo XY describe la dirección entre extremos; no certifica la orientación de una curva ni la alineación entre vínculos. Para medir separaciones entre modelos faltan unidades, transformaciones y correspondencias verificadas.</p>}
   <div role="status">{filtered.length} {filtered.length===1?'registro encontrado':'registros encontrados'}</div>
   {filtered.length?<div className="audit-table-wrap"><table><thead><tr><th>Eje</th><th>Documento / fuente</th><th>{tab==='inventory'?'Identificador publicado':'Segmentos / lectura geométrica'}</th><th>Detalle</th></tr></thead><tbody>{filtered.slice(activePage*100,(activePage+1)*100).map(r=><tr key={r.key} className={selected===r.key?'audit-selected':''}><td>{r.name}</td><td>{r.document}<small>{r.source}</small></td><td>{tab==='inventory'?(r.id||unavailable):r.grid?`${r.grid.segments.length} segmentos · ${r.grid.geometryComplete?'extremos disponibles':'lectura incompleta'}`:'Sin segmentos AEC asociados'}{r.apsId!==null&&<small>APS dbId: {r.apsId}</small>}</td><td><button onClick={()=>setSelected(r.key)}>Ver evidencia</button></td></tr>)}</tbody></table></div>:<p className="audit-notice">{rows.length?'No encontré grillas para esta búsqueda. Prueba otro nombre o documento.':'No se recuperaron grillas identificables en las fuentes consultadas. Esto no demuestra que el modelo carezca de ejes. Consulta Cobertura.'}</p>}
   {pages>1&&<div className="audit-detail-navigation"><button disabled={activePage===0} onClick={()=>setPage(activePage-1)}>Anterior</button><span>Página {activePage+1} de {pages}</span><button disabled={activePage+1>=pages} onClick={()=>setPage(activePage+1)}>Siguiente</button></div>}
   {current&&<aside className="audit-editor"><div className="audit-title-row"><h3>{current.name} · Evidencia</h3><button onClick={()=>setSelected(null)}>Cerrar detalle</button></div><dl><dt>Documento</dt><dd>{current.document}</dd><dt>Identificador original</dt><dd>{current.id||unavailable}</dd><dt>Fuente / ruta</dt><dd>{current.path||unavailable}</dd></dl>{current.grid?<><p>No se asigna un dbId ni una instancia de vínculo por similitud de nombres.</p><div className="audit-table-wrap"><table><thead><tr><th>Segmento / tipo Autodesk</th><th>Inicio XYZ</th><th>Fin XYZ</th><th>Dirección XY entre extremos</th></tr></thead><tbody>{current.grid.segments.map((s,i)=><tr key={i}><td>{s.guid??`Registro ${i+1}`}<small>Tipo publicado: {s.type??unavailable} · clasificación recta/curva no verificada</small></td><td>{s.start?.join(' ; ')??unavailable}</td><td>{s.end?.join(' ; ')??unavailable}</td><td>{angle(gridChordAngle(s))}</td></tr>)}</tbody></table></div><p>Unidad de coordenadas: no verificada. No se usa para emitir cumplimiento de distancias.</p></>:<p>Registro de la vista. No se ha establecido una correspondencia inequívoca con un segmento AEC.</p>}</aside>}
  </>}
  {tab==='coverage'&&<>
   <p>{aec?.message??'Esta ejecución anterior no consultó datos AEC. Ejecuta una nueva auditoría con esta versión del motor para ampliar la búsqueda.'}</p>
   <dl><dt>Lectura de la vista</dt><dd>{new Date(inventory.fetchedAt).toLocaleString('es-CL')} · {inventory.missing} objetos hoja sin propiedades</dd><dt>Lectura AEC</dt><dd>{aec?new Date(aec.fetchedAt).toLocaleString('es-CL'):'No consultada'}</dd><dt>Alcance</dt><dd>Versión configurada. No recorre otros RVT del proyecto ni declara que todos los vínculos están publicados.</dd></dl>
   {aec?.files.map(f=><details key={f.endpoint}><summary>{f.documentId??'Archivo AEC'} · {f.grids.length} grillas · {f.invalidRecords} registros y {f.invalidSegments} segmentos incompletos</summary><dl><dt>Esquema</dt><dd>{f.schemaVersion??unavailable}</dd><dt>Documentos vinculados declarados</dt><dd>{f.linkedDocumentCount??unavailable}</dd><dt>Campo de grillas</dt><dd>{f.gridsFieldAvailable?'Disponible':'No disponible; no equivale a cero grillas'}</dd><dt>Fuente</dt><dd>{f.endpoint}</dd></dl></details>)}
   <details><summary>Fuentes consultadas y estado</summary><ul><li>Árbol: {inventory.treeEndpoint}</li><li>Propiedades: {inventory.endpoint}</li>{aec?.attempts.map((a,i)=><li key={i}>{a.status} · {a.endpoint}</li>)}</ul></details>
   <p>Para auditar coincidencias entre especialidades se necesita identificar el modelo de referencia y verificar unidades, transformaciones de cada vínculo y tolerancias. Los datos que falten se mantienen pendientes.</p>
  </>}
 </section>;
}
