"use client";
import { useMemo, useState } from 'react';
import type { ModelElement, ViewCalculation } from '@/lib/quantities-v2/contracts';
export function QuantityFloorAssignment({data,records,selection,busy,onApply}:{data:ViewCalculation;records:ModelElement[];selection:number[]|null;busy:boolean;onApply:(ids:number[],label:string|null)=>Promise<void>}){
 const [chosen,setChosen]=useState<number[]>(()=>selection?records.filter(e=>selection.includes(e.dbId)).map(e=>e.dbId):[]),[label,setLabel]=useState(''),[error,setError]=useState(''),[page,setPage]=useState(0),[pending,setPending]=useState(!selection?.length);
 const shown=useMemo(()=>records.filter(e=>!pending||e.floor.multilevel||e.floor.resolvedBuildingLevel==='Piso no resuelto'),[records,pending]);
 const names=useMemo(()=>[...new Set([...data.resolver.intervals.map(l=>l.label),...data.records.map(e=>e.floor.resolvedBuildingLevel),'-1'])].filter(n=>n!=='MULTILEVEL'&&n!=='Piso no resuelto').sort((a,b)=>a.localeCompare(b,'es',{numeric:true})),[data]);
 const selected=new Set(chosen),all=shown.length>0&&shown.every(e=>selected.has(e.dbId));
 async function apply(value:string|null){setError('');try{await onApply(chosen,value);}catch(e){setError((e as Error).message);}}
 return <div className="qv2-criteria qv2-floor-assignment">
 <p>Marca los elementos y elige su piso. La asignación se guarda para este archivo, versión y vista. Se asigna la cantidad completa de cada elemento, sin dividir ni duplicar metros.</p>
 <label className="qv2-floor-pending"><input type="checkbox" checked={pending} disabled={busy} onChange={e=>{setPending(e.target.checked);setChosen([]);setPage(0);}}/> Mostrar sólo MULTILEVEL y piso no resuelto dentro del filtro actual</label>
 <p>{records.length} elementos en el filtro actual · {shown.length} en esta lista · <strong>{chosen.length} marcados</strong></p>
 <div className="qv2-config-table"><table><thead><tr><th><input type="checkbox" aria-label="Marcar todos los elementos de esta lista" checked={all} disabled={busy||!shown.length} onChange={e=>setChosen(e.target.checked?shown.map(r=>r.dbId):[])}/></th><th>Elemento / categoría</th><th>Piso actual y motivo</th></tr></thead><tbody>{shown.slice(page*25,(page+1)*25).map(e=><tr key={e.dbId}><td><input type="checkbox" aria-label={`Asignar piso a dbId ${e.dbId}`} checked={selected.has(e.dbId)} disabled={busy} onChange={ev=>setChosen(ids=>ev.target.checked?[...ids,e.dbId]:ids.filter(id=>id!==e.dbId))}/></td><td>{e.name}<small>{e.category??e.originalCategory??'Sin categoría'} · {e.elementId??`dbId ${e.dbId}`}</small></td><td>{e.floor.resolvedBuildingLevel}<small>{e.floor.issue??e.floor.floor_assignment_method}</small></td></tr>)}</tbody></table></div>
 {!shown.length&&<p>No hay elementos para esta lista. Desmarca «Mostrar sólo MULTILEVEL…» para revisar los demás elementos del filtro.</p>}
 <div className="quantity-inline-actions"><button className="quantity-secondary" disabled={!page||busy} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page+1} de {Math.max(1,Math.ceil(shown.length/25))}</span><button className="quantity-secondary" disabled={(page+1)*25>=shown.length||busy} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div>
 <label>Piso de destino<input list="quantity-floor-destinations" value={label} maxLength={500} placeholder="Selecciona un nivel o escribe, por ejemplo, -1" disabled={busy} onChange={e=>setLabel(e.target.value)}/><datalist id="quantity-floor-destinations">{names.map(name=><option key={name} value={name}/>)}</datalist></label>
 <p className="quantity-help">Puedes usar un nivel publicado o un nombre confirmado por tu equipo. «Restablecer automático» elimina la asignación manual de los elementos marcados.</p>
 {error&&<p className="quantity-error" role="alert">{error}</p>}
 <div className="quantity-inline-actions"><button className="quantity-primary" disabled={busy||!chosen.length||!label.trim()} onClick={()=>void apply(label)}>{busy?'Guardando…':`Guardar piso para ${chosen.length} elementos`}</button><button className="quantity-secondary" disabled={busy||!chosen.length} onClick={()=>void apply(null)}>Restablecer automático</button></div>
 </div>;
}
