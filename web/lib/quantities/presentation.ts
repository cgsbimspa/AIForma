import type { QuantityRun, QuantitySource } from "./contracts.ts";

// Explicit presentation metadata only. Never infer a material from a BIM type,
// unit or configuration discipline (e.g. Cálculo is not Hormigón).
export const quantityMetrics = [
  {key:"concrete_volume_m3", name:"Hormigón", unit:"m³"},
  {key:"formwork_area_m2", name:"Moldaje", unit:"m²"},
  {key:"reinforcement_weight_kg", name:"Fe", unit:"kg"},
  {key:"galvanized_steel_length_ml", name:"Acero Galvanizado", unit:"ml"},
] as const;
export const filterSpecialties = ["Hormigón", "Enfierradura", "Acero Galvanizado"];
export const filterSubspecialties = ["Emplantillado", "Fundación", "Metalcon", "Vigas de Fundación", "Enfierradura", "Losas", "Muros", "Pilares"];
export type Metric = typeof quantityMetrics[number]["key"];
export type QuantityFiltersValue = {specialty:string; subspecialty:string; floor:string};
export type QuantityTableRow = {id:string; specialty:string; subspecialty:string; typeName:string; floor:string; values:Partial<Record<Metric,number>>; elementIds:string[]};
export function matchingRun(runs:QuantityRun[], source:QuantitySource|null, templateId:string) {
  return runs.find(r=>r.source.scope.itemId===source?.scope.itemId && r.source.version.id===source?.version.id && r.source.view?.id===source?.view?.id && r.template.id===templateId);
}
export function projectQuantityRows(run:QuantityRun|undefined) {
  const rows:QuantityTableRow[]=[]; let unavailable=0;
  for (const result of run?.results??[]) {
    const g=result.groupingData, metric=quantityMetrics.find(m=>m.key===g.metric && m.unit===result.unit);
    if (!metric || !filterSpecialties.includes(g.specialty) || !filterSubspecialties.includes(g.subspecialty) || !g.typeName || !g.floor || !Number.isFinite(result.quantity)) { unavailable++; continue; }
    rows.push({id:result.id,specialty:g.specialty,subspecialty:g.subspecialty,typeName:g.typeName,floor:g.floor,values:{[metric.key]:result.quantity},elementIds:result.elementIds});
  }
  return {rows,unavailable};
}
export function filterQuantityRows(rows:QuantityTableRow[], filter:QuantityFiltersValue) {
  return rows.filter(r=>(!filter.specialty||r.specialty===filter.specialty)&&(!filter.subspecialty||r.subspecialty===filter.subspecialty)&&(!filter.floor||r.floor===filter.floor));
}
export function quantityTotals(rows:QuantityTableRow[], unavailable=0) {
  return Object.fromEntries(quantityMetrics.map(m=>{
    const values=rows.flatMap(r=>r.values[m.key]===undefined?[]:[r.values[m.key]!]);
    const sum=values.reduce((a,b)=>a+b,0);
    return [m.key,!unavailable&&values.length&&Number.isFinite(sum)?sum:null];
  })) as Record<Metric,number|null>;
}
