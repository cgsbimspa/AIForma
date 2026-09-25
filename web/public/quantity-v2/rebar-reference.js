// Published nominal masses, AZA technical sheet, page 2, table 1.2.
// Explicit opt-in per project; never an implicit model default.
export const AZA_SOURCE='https://www.aza.cl/2024/wp-content/uploads/2024/06/FT-Barras-de-Refuerzo.pdf';
export const AZA_VERSION='FT Barras de Refuerzo · tabla 1.2 · consulta 2026-09-25';
export const AZA_WEIGHTS=[[8,.395],[10,.617],[12,.888],[16,1.58],[18,2],[22,2.98]].map(([diameter,unit_weight_kg_m])=>({diameter,unit_weight_kg_m,source:AZA_SOURCE,version:AZA_VERSION}));
export function addAzaWeights(existing,records){
 const diameters=records.filter(r=>r.specialty==='Enfierradura').map(r=>r.rebar.diameterMm);
 return [...existing,...AZA_WEIGHTS.filter(row=>diameters.some(d=>d!==null&&Math.abs(d-row.diameter)<1e-6)&&!existing.some(e=>Math.abs(e.diameter-row.diameter)<1e-6))].sort((a,b)=>a.diameter-b.diameter);
}
export function rebarDiagnostic(all,filtered){
 const allBars=all.filter(r=>r.specialty==='Enfierradura'),bars=filtered.filter(r=>r.specialty==='Enfierradura'),reasons=new Map();
 for(const r of bars)if(r.quantities.rebar.value===null){const issue=r.quantities.rebar.issue??'Datos pendientes de revisión';reasons.set(issue,(reasons.get(issue)??0)+1);}
 return {total:allBars.length,filtered:bars.length,ready:bars.filter(r=>r.quantities.rebar.value!==null).length,reasons:[...reasons].map(([issue,count])=>({issue,count})),missingDiameters:[...new Set(bars.filter(r=>r.rebar.unitWeightKgM===null&&r.rebar.diameterMm!==null).map(r=>r.rebar.diameterMm))].sort((a,b)=>a-b)};
}
