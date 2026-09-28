'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useCoordination} from './context';
import {systemHref} from '@/lib/coordination/catalog';
import type {Configuration,ModelCoverage,PropertyCatalog} from '@/lib/coordination/contracts';
import type {QuantitySource} from '@/lib/quantities/contracts';

export const originLabel=(key:string)=>key==='host'?'Modelo anfitrión':key==='unresolved'?'Procedencia no identificada':key==='No disponible'?key:`Vínculo · ${key.split('/').map(id=>id.slice(-8)).join(' / ')}`;
export function useInspect(source:QuantitySource|null){
 const c=useCoordination(),[snapshot,setSnapshot]=useState<{key:string;data:PropertyCatalog}|null>(null);
 const key=JSON.stringify(source);
 return {catalog:snapshot?.key===key?snapshot.data:null,inspect:async()=>{
  if(!source?.view)return;
  try{const data=await c.command<PropertyCatalog>({action:'inspect',source});setSnapshot({key,data});}catch{/* Provider reports the actual failure. */}
 }};
}
export function CoverageDetail({coverage}:{coverage:ModelCoverage}){
 return <><p>{coverage.readCount.toLocaleString('es-CL')} elementos leídos · <strong>{coverage.linkedElements.toLocaleString('es-CL')} en vínculos</strong> · {coverage.missingCount} objetos sin propiedades.</p><div className="coord-origin-list">{coverage.groups.map(g=><details key={g.key}><summary>{originLabel(g.key)} · {g.count.toLocaleString('es-CL')} elementos</summary><p>{g.categories.join(' · ')||'Categorías no disponibles'}</p>{g.kind==='LINKED'&&<p>Instancia publicada: <code>{g.key}</code></p>}{g.samplePaths.map(p=><p key={p}>{p}</p>)}</details>)}</div><p className="coord-help">{coverage.scope} Cada instancia repetida conserva su identificador completo; no se fusionan elementos entre vínculos.</p></>;
}
export function LinkedModelsPanel({configuration}:{configuration:Configuration}){
 const c=useCoordination(),{catalog,inspect}=useInspect(configuration.source);
 return <section className="coord-card coord-inspection"><h2>Modelos y vínculos de la vista</h2><p>Consulta todas las ramas publicadas en esta vista: anfitrión y elementos vinculados. La lectura no se limita a la raíz del RVT.</p><button className="coord-primary" disabled={!configuration.source?.view||c.busy} onClick={()=>void inspect()}>{c.busy?'Leyendo host y vínculos…':'Leer modelos y parámetros'}</button>{!configuration.source?.view&&<p><Link href={`${systemHref(configuration.systemId)}/configuracion`}>Selecciona primero el archivo y la vista →</Link></p>}{catalog&&<><CoverageDetail coverage={catalog.coverage}/><h3>Datos recuperados</h3><p>{catalog.categories.length} categorías · {catalog.properties.length} parámetros · Lectura: {new Date(catalog.fetchedAt).toLocaleString('es-CL')}</p><details><summary>Consultar parámetros y valores publicados</summary><div className="coord-catalog-scroll"><table><thead><tr><th>Parámetro</th><th>Elementos</th><th>Muestra de valores</th></tr></thead><tbody>{catalog.properties.map(p=><tr key={p.path}><td>{p.path}</td><td>{p.count}</td><td>{p.examples.join(' · ')||'Sin valor'}</td></tr>)}</tbody></table></div></details><p><Link href={`${systemHref(configuration.systemId)}/reglas`}>Preparar las comprobaciones RIDAA con estos parámetros →</Link></p></>}<p className="coord-help">Un vínculo visible no aporta por sí solo conectores, dirección de flujo ni condiciones de aplicación normativa. Esas entradas se verifican por separado.</p></section>;
}
