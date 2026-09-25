import { geometryFallback } from './geometry.js';
import { extractElement, sum } from './properties.js';
import { concreteQuantity, formworkQuantity, rebarQuantity, metricCoverage } from './services.js';
import { slabCandidates, buildIntervals, resolveLevel, UNRESOLVED } from './levels.js';
export const ENGINE='view-quantities-v2.1';
// Yield between batches without the nested-timer delay of an inactive tab.
function yieldRead(){return new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(null);});}
export function defaultSettings(){return {version:1,levelToleranceM:.002,levelBinding:null,levelReferences:[],manualFloors:[],slabRoles:[],foundationFaces:[],rebarWeightTable:[]};}
export function validateSettings(s){
 if(!s||s.version!==1||!Number.isFinite(s.levelToleranceM)||s.levelToleranceM<.0001||s.levelToleranceM>.05)throw Error('Tolerancia de elevación no válida (0,1 a 50 mm)');
 if(!Array.isArray(s.rebarWeightTable)||s.rebarWeightTable.length>100||s.rebarWeightTable.some(r=>!Number.isFinite(r.diameter)||r.diameter<=0||!Number.isFinite(r.unit_weight_kg_m)||r.unit_weight_kg_m<=0||!r.source?.trim()||!r.version?.trim())||new Set(s.rebarWeightTable.map(r=>r.diameter)).size!==s.rebarWeightTable.length)throw Error('Tabla de acero no válida; diámetro único, kg/m positivo, fuente y versión obligatorios');
 for(const key of ['levelReferences','manualFloors','slabRoles'])if(!Array.isArray(s[key])||s[key].length>10000)throw Error('Configuración de niveles no válida');
 if(s.levelReferences.some(r=>typeof r.id!=='string'||!r.label?.trim()||!Array.isArray(r.dbIds)||r.dbIds.some(id=>!Number.isSafeInteger(id))||!Array.isArray(r.aliases)||r.aliases.some(a=>typeof a!=='string')))throw Error('Referencias de losas no válidas');
 if(new Set(s.levelReferences.map(r=>r.id)).size!==s.levelReferences.length||new Set(s.levelReferences.map(r=>r.label)).size!==s.levelReferences.length)throw Error('Referencias de pisos duplicadas');
 if(s.manualFloors.some(r=>!Number.isSafeInteger(r.dbId)||!r.label?.trim())||new Set(s.manualFloors.map(r=>r.dbId)).size!==s.manualFloors.length)throw Error('Asignaciones manuales no válidas');
 if(s.slabRoles.some(r=>!Number.isSafeInteger(r.dbId)||!['ground','elevated'].includes(r.role))||new Set(s.slabRoles.map(r=>r.dbId)).size!==s.slabRoles.length)throw Error('Tipos de losas no válidos');
 if(!Array.isArray(s.foundationFaces)||s.foundationFaces.some(r=>!Number.isSafeInteger(r.dbId)||r.confirmed!==true)||new Set(s.foundationFaces.map(r=>r.dbId)).size!==s.foundationFaces.length)throw Error('Confirmación de caras de fundación no válida');
 if((s.levelReferences.length||s.manualFloors.length||s.slabRoles.length||s.foundationFaces.length)&&(!s.levelBinding?.urn||!s.levelBinding?.viewId))throw Error('Las reglas espaciales deben vincularse a una vista y versión');
 return s;
}
export async function inspectElements(elements,binding,geometry,progress=()=>{}){
 if(!elements.length||new Set(elements.map(e=>e.dbId)).size!==elements.length)throw Error('Lectura vacía o elementos duplicados');
 const records=[];
 for(const e of elements){const record=extractElement(e,binding);record.geometry=record.specialty?await geometry(e.dbId):geometryFallback(null,'Geometría no analizada: elemento fuera de las especialidades de esta cubicación');records.push(record);if(records.length%25===0){progress(records.length,elements.length);await yieldRead();}}
 return records;
}
export function calculateQuantities(inspected,binding,settings){
 validateSettings(settings);
 const resolver=buildIntervals(inspected,settings,binding),externalCounts=new Map();
 for(const e of inspected)if(e.externalId)externalCounts.set(e.externalId,(externalCounts.get(e.externalId)??0)+1);
 const records=inspected.map(e=>{
  const rebar=rebarQuantity(e,settings),quantities={concrete:concreteQuantity(e),formwork:formworkQuantity(e,settings,binding),rebar:rebar.weight};
  if(e.externalId&&externalCounts.get(e.externalId)>1){rebar.totalLengthM=null;for(const q of Object.values(quantities)){q.value=null;q.issue='Identificador externo repetido; requiere revisión';q.source='NOT_AVAILABLE';}}
  return {...e,quantities,rebar,floor:resolveLevel(e,resolver,settings,binding)};
 });
 return {binding,engine:ENGINE,calculatedAt:new Date().toISOString(),settings,records,slabs:slabCandidates(records,settings.levelToleranceM),resolver,coverage:{inspected:records.length,unclassified:records.filter(r=>!r.specialty).length,unknownCategory:records.filter(r=>r.specialty&&!r.category).length,geometryUnavailable:records.filter(r=>r.specialty&&!r.geometry?.closed).length,unresolvedFloors:records.filter(r=>r.specialty&&r.floor.resolvedBuildingLevel===UNRESOLVED).length}};
}
export const UNCLASSIFIED='Sin especialidad de cubicación';
// Browsing and visibility must not depend on eligibility for a quantity formula.
// A published level remains filterable without claiming a spatial assignment.
export function filterValues(e){return {specialty:e.specialty??UNCLASSIFIED,category:e.category??e.originalCategory??'Categoría no disponible',floor:e.floor.resolvedBuildingLevel!==UNRESOLVED?e.floor.resolvedBuildingLevel:e.floor.originalRevitLevel?`Nivel Revit: ${e.floor.originalRevitLevel}`:UNRESOLVED};}
export function matchesFilter(e,filter){const values=filterValues(e);return ['specialty','category','floor'].every(key=>!filter[key]||filter[key]===values[key]);}
export function quantityFacets(records,filter){const unique=a=>[...new Set(a)].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));return {specialties:unique(records.filter(e=>matchesFilter(e,{...filter,specialty:''})).map(e=>filterValues(e).specialty)),categories:unique(records.filter(e=>matchesFilter(e,{...filter,category:''})).map(e=>filterValues(e).category)),floors:unique(records.filter(e=>matchesFilter(e,{...filter,floor:''})).map(e=>filterValues(e).floor))};}
export function presentQuantities(data,filter){
 const records=data.records.filter(e=>matchesFilter(e,filter)),coverage=Object.fromEntries(['concrete','formwork','rebar'].map(m=>[m,metricCoverage(records,m)]));
 const groups=new Map();
 for(const e of records){const values=filterValues(e),diameter=e.rebar.diameterMm,key=JSON.stringify([e.specialty,values.category,values.floor,diameter]);const group=groups.get(key)??{id:key,specialty:e.specialty,category:values.category,floor:values.floor,diameterMm:diameter,elements:[]};group.elements.push(e);groups.set(key,group);}
 const rows=[...groups.values()].map(g=>{const steel=g.elements.filter(e=>e.specialty==='Enfierradura'),length=steel.length&&steel.every(e=>e.rebar.totalLengthM!==null)?sum(steel.map(e=>e.rebar.totalLengthM)):null,weights=[...new Set(steel.map(e=>e.rebar.unitWeightKgM))];return {...g,dbIds:g.elements.map(e=>e.dbId),count:g.elements.length,quantities:Object.fromEntries(['concrete','formwork','rebar'].map(m=>[m,metricCoverage(g.elements,m)])),totalLengthM:length,unitWeightKgM:weights.length===1?weights[0]:null};});
 return {records,coverage,rows};
}
export function compareCalculations(previous,current){
 if(previous.binding.projectId!==current.binding.projectId||previous.binding.itemId!==current.binding.itemId)throw Error('No se comparan archivos o proyectos diferentes');
 const fields=['concrete','formwork','rebar'];
 return {previous:previous.binding,current:current.binding,previousAt:previous.calculatedAt,currentAt:current.calculatedAt,rulesChanged:JSON.stringify(previous.settings)!==JSON.stringify(current.settings),metrics:fields.map(metric=>{const a=metricCoverage(previous.records,metric),b=metricCoverage(current.records,metric);return {metric,previous:a,current:b,difference:a.total!==null&&b.total!==null?b.total-a.total:null};}),elementCorrespondence:'NOT_CALCULATED'};
}
