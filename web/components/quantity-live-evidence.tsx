"use client";
import { presentLiveCalculation, type LiveCalculation } from '@/lib/quantities/live';
import { quantityMetrics, type QuantityFiltersValue } from '@/lib/quantities/presentation';
const amount=(value:number|null)=>value===null?'No disponible':new Intl.NumberFormat('es-CL',{maximumFractionDigits:6}).format(value);
export function QuantityLiveEvidence({calculation,filters}:{calculation:LiveCalculation;filters:QuantityFiltersValue}) {
  const result=presentLiveCalculation(calculation,filters);
  return <div className="quantity-live-evidence">
    <p>Calculado: {new Date(calculation.calculatedAt).toLocaleString('es-CL')} · Criterio v{calculation.ruleVersion}.</p>
    <p>{calculation.inspected} elementos con geometría revisados; {calculation.unclassified} sin clasificación. Las sumas cubren los elementos clasificados que cumplen los filtros actuales.</p>
    <p>Hormigón: suma de «Volumen» publicado en m³. Acero Galvanizado: suma de «Longitud» publicada en metros. Los nombres ambiguos, valores ausentes y unidades no verificadas quedan pendientes.</p>
    {result.coverage.map(c=><section key={c.metric}><h3>{quantityMetrics.find(m=>m.key===c.metric)?.name}</h3><p>{c.read} de {c.eligible} cantidades leídas. {c.missing} pendientes.</p><strong>{c.eligible===0?'Sin elementos elegibles':c.missing?'Subtotal de lecturas válidas (no es un total completo): ':'Total de elementos clasificados: '}{c.eligible>0&&amount(c.subtotal)}</strong></section>)}
    <p>Estas sumas pertenecen a la versión y vista abiertas. No están guardadas en el historial. Ocultar o aislar elementos sólo cambia la visualización.</p>
    <div className="quantity-grid-scroll"><table><thead><tr><th>Elemento / tipo</th><th>Parámetro y unidad</th><th>Valor / estado</th></tr></thead><tbody>{result.records.map(r=><tr key={`${r.metric}:${r.dbId}`}><td>{r.typeName}<br/>dbId {r.dbId}<details><summary>Procedencia</summary>{r.externalId??'Identificador externo no disponible'}<br/>{r.specialty} / {r.subspecialty}<br/>{r.floor}</details></td><td>{r.category} / {r.property}<br/>{r.rawUnit||'Unidad no disponible'}</td><td>{r.issue??`${amount(r.quantity)} ${r.unit}`}<br/><small>Dato original: {r.rawValue||'No disponible'}</small></td></tr>)}</tbody></table></div>
  </div>;
}
