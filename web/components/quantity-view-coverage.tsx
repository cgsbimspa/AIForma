"use client";
import { useMemo, useState } from 'react';
import type { ViewCalculation } from '@/lib/quantities-v2/contracts';
import { normalize } from '@/public/quantity-v2/properties.js';

export function QuantityViewCoverage({data,selection,onLocate,onCriteria}:{data:ViewCalculation;selection:number[]|null;onLocate:(ids:number[])=>void;onCriteria:()=>void}){
 const [query,setQuery]=useState(''),[onlySelected,setOnlySelected]=useState(Boolean(selection?.length)),[page,setPage]=useState(0);
 const inventory=useMemo(()=>[
  ...data.records.map(e=>({...e,reason:e.specialty?'Incluido en esta plantilla':e.mep?.system.issue??'Sin especialidad confirmada'})),
  ...(data.mepContextRecords??[]).map(e=>({...e,reason:e.specialty?`Pertenece a ${e.specialty}; fuera de esta plantilla`:e.mep?.system.issue??'Sin especialidad confirmada'})),
  ...(data.referenceRecords??[]).map(e=>({...e,reason:'Categoría sin regla de cubicación MEP; conservado para revisión'})),
 ],[data]);
 const matches=useMemo(()=>inventory.filter(e=>(!onlySelected||selection?.includes(e.dbId))&&normalize([e.dbId,e.elementId,e.name,e.originalCategory,e.reason].join(' ')).includes(normalize(query))),[inventory,onlySelected,selection,query]);
 return <div className="qv2-evidence">
  <p>{inventory.length} elementos con geometría leídos de la vista · {data.records.length} en la plantilla · {data.mepContextRecords?.length??0} instalaciones fuera de la plantilla · {data.referenceRecords?.length??0} elementos de otras categorías.</p>
  <p>Revisar un elemento lo muestra en el visor sin incorporarlo automáticamente a las sumas. Las asociaciones se confirman en «Configurar sistemas y pisos».</p>
  <button className="quantity-secondary" onClick={onCriteria}>Configurar sistemas y pisos</button>
  <label>Buscar por identificador, nombre o categoría<input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
  <label><input type="checkbox" checked={onlySelected} onChange={e=>{setOnlySelected(e.target.checked);setPage(0);}}/> Sólo la selección del visor ({selection?.length??0})</label>
  <div className="qv2-config-table"><table><thead><tr><th>Elemento / categoría</th><th>Estado y motivo</th><th>Ubicación</th></tr></thead><tbody>{matches.slice(page*30,(page+1)*30).map(e=><tr key={e.dbId}><td>{e.name}<small>{e.originalCategory??'Categoría no publicada'} · ElementId {e.elementId??'no publicado'} · dbId {e.dbId}</small><details><summary>Parámetros y procedencia</summary><pre>{JSON.stringify({source:e.source,externalId:e.externalId,properties:e.mep?.rawProperties??e.publishedProperties??e.text,measures:e.measures,geometry:e.geometry},null,2)}</pre></details></td><td>{e.reason}</td><td><button className="quantity-text-button" onClick={()=>onLocate([e.dbId])}>Ver en el modelo</button></td></tr>)}</tbody></table></div>
  {!matches.length&&<p>No hay elementos para esta búsqueda.</p>}
  <div className="quantity-inline-actions"><button className="quantity-secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>{matches.length} resultados · página {page+1}</span><button className="quantity-secondary" disabled={(page+1)*30>=matches.length} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div>
  <details><summary>Niveles y límites usados para resolver los pisos</summary><p>{data.resolver.issue??'Pisos asignados mediante límites verificables. Las coordenadas se expresan en metros en el marco del modelo cargado.'}</p><pre>{JSON.stringify(data.resolver,null,2)}</pre></details>
 </div>;
}
