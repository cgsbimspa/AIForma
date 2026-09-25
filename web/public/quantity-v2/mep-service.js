import { extractElement, normalize, readText, readMeasure, sum, unavailable } from './properties.js';
import { buildIntervals, resolveLevel, slabCandidates, UNRESOLVED } from './levels.js';
import { validateSettings, filterRecords } from './quantity-service.js';
import { mepCategories, mepSpecialties, mepRule, systemClassifications, systemClassificationSource } from './mep-catalog.js';
export const MEP_ENGINE='mep-quantities-v1.0';
const textNames={
 systemType:['System Type','Tipo de sistema'],systemClassification:['System Classification','Clasificación de sistema'],systemName:['System Name','Nombre de sistema','System','Sistema'],
 referenceLevel:['Reference Level','Nivel de referencia'],scheduleLevel:['Schedule Level','Nivel de planificación'],size:['Size','Tamaño'],shape:['Shape','Forma','Section Shape','Forma de sección'],
 slope:['Slope','Pendiente'],flow:['Flow','Caudal'],velocity:['Velocity','Velocidad'],pressureDrop:['Pressure Drop','Caída de presión','Pérdida de presión'],
 power:['Power','Potencia','Apparent Load','Carga aparente'],voltage:['Voltage','Voltaje','Tensión'],current:['Current','Intensidad','Corriente'],capacity:['Capacity','Capacidad'],circuit:['Circuit Number','Número de circuito','Circuit','Circuito'],
 connectorData:['Connector Data','Datos de conector'],connectorTypes:['Connector Types','Tipos de conector'],coldWaterConnector:['Cold Water Connector'],hotWaterConnector:['Hot Water Connector'],wasteConnector:['Waste Connector'],ventConnector:['Vent Connector'],
};
const measureNames={
 diameter:['Diameter','Diámetro'],insideDiameter:['Inside Diameter','Diámetro interior'],outsideDiameter:['Outside Diameter','Diámetro exterior'],
 offset:['Offset','Desfase'],startElevation:['Start Elevation','Elevación inicial'],endElevation:['End Elevation','Elevación final'],insulationThickness:['Insulation Thickness','Espesor de aislamiento','Espesor de aislamiento térmico'],
 connectorDiameter:['Connector Diameter','Diámetro de conector'],connectorWidth:['Connector Width','Anchura de conector'],connectorHeight:['Connector Height','Altura de conector'],connectorCount:['Connector Count','Número de conectores'],
};
function named(properties,names,key,dimension){
 const keys=new Set(names.map(normalize));
 const selected=properties.filter(p=>keys.has(normalize(p.displayName))&&p.displayCategory!=='__internalref__');
 const renamed=selected.map(p=>({...p,displayName:dimension?'Elevation':'Type'}));
 const result=dimension?readMeasure(renamed,'elevation',dimension):readText(renamed,'type');
 result.inputs=selected.map(p=>({name:p.displayName,category:p.displayCategory??'',rawValue:String(p.displayValue??''),unit:String(p.units??'')}));
 if(dimension&&!['offset','startElevation','endElevation'].includes(key)&&result.value<0)return {...unavailable('Valor negativo no válido'),inputs:result.inputs};
 return result;
}
export function mepCategory(original){return mepCategories.find(c=>[c.category,...c.aliases].some(a=>normalize(a)===normalize(original).replace(/^revit /,'')))??null;}
const explicitCode=value=>mepSpecialties.find(s=>[s.code,s.name].some(n=>normalize(n)===normalize(value)))?.code??null;
export function resolveMEPSystem(element,settings){
 const fields={specialty:element.specialtyEvidence,systemType:element.text.systemType,systemClassification:element.text.systemClassification};
 const configured=(settings.mepSystemRules??[]).filter(r=>fields[r.field]?.value&&normalize(fields[r.field].value)===normalize(r.value));
 const confirmed=[...new Set(configured.map(r=>r.specialty))];
 if(confirmed.length>1)return {specialty:null,issue:'Asociaciones confirmadas contradictorias',inputs:configured.flatMap(r=>fields[r.field].inputs),source:'USER_CONFIGURATION'};
 if(confirmed.length===1)return {specialty:confirmed[0],issue:null,inputs:configured.flatMap(r=>fields[r.field].inputs),source:'USER_CONFIGURATION',rule:mepRule};
 if(Object.values(fields).some(f=>f.inputs.length&&!f.value))return {specialty:null,issue:'Parámetros de especialidad o sistema ambiguos; confirma una asociación',inputs:Object.values(fields).flatMap(f=>f.inputs),source:'NOT_AVAILABLE'};
 const explicit=explicitCode(fields.specialty.value),typeCode=explicitCode(fields.systemType.value);
 const classification=Object.entries(systemClassifications).find(([,values])=>values.some(v=>normalize(v)===normalize(fields.systemClassification.value)))?.[0];
 const codes=[...new Set([explicit,typeCode,classification].filter(Boolean))];
 if(codes.length>1)return {specialty:null,issue:'Especialidad y sistema publicados contradictorios',inputs:Object.values(fields).flatMap(f=>f.inputs),source:'NOT_AVAILABLE'};
 if(fields.specialty.value&&!explicit)return {specialty:null,issue:'Especialidad publicada sin equivalencia confirmada',inputs:fields.specialty.inputs,source:'NOT_AVAILABLE'};
 const category=mepCategory(element.category);
 if(codes.length&&category?.specialty&&category.specialty!==codes[0])return {specialty:null,issue:'Sistema incompatible con la categoría; requiere asociación confirmada',inputs:Object.values(fields).flatMap(f=>f.inputs),source:'NOT_AVAILABLE'};
 if(codes.length)return {specialty:codes[0],issue:null,inputs:Object.values(fields).flatMap(f=>f.inputs),source:explicit?'REVIT_SPECIALTY':classification?'REVIT_SYSTEM_CLASSIFICATION':'REVIT_SYSTEM_TYPE',rule:{...mepRule,documentation:systemClassificationSource}};
 // These category relationships are explicitly stated in the user's spec.
 if(category?.specialty)return {specialty:category.specialty,issue:null,inputs:element.categoryEvidence.inputs,source:'USER_CATEGORY_RULE',rule:mepRule};
 return {specialty:null,issue:'No hay especialidad ni sistema con equivalencia verificable',inputs:Object.values(fields).flatMap(f=>f.inputs),source:'NOT_AVAILABLE'};
}
export function extractMEPElement(raw,binding){
 const base=extractElement(raw,binding),category=mepCategory(base.originalCategory);
 if(!category)return base;
 const text={...base.text,...Object.fromEntries(Object.entries(textNames).map(([key,names])=>[key,named(raw.properties,names,key)]))};
 const measures={...base.measures,...Object.fromEntries(Object.entries(measureNames).map(([key,names])=>[key,named(raw.properties,names,key,key==='connectorCount'?'count':'m')]))};
 // Keep native and reference levels independently, avoiding synthetic equivalences.
 text.level=named(raw.properties,['Level','Nivel'],'level');
 if(!text.level.inputs.length)text.level=text.referenceLevel.inputs.length?text.referenceLevel:text.scheduleLevel;
 for(const [key,fallback] of [['diameter','connectorDiameter'],['width','connectorWidth'],['height','connectorHeight']])if(!measures[key].inputs.length&&measures[fallback].value!==null)measures[key]={...measures[fallback],source:'REVIT_CONNECTOR'};
 const extraProperties=raw.properties.map(p=>({name:p.displayName??'',category:p.displayCategory??'',rawValue:String(p.displayValue??''),unit:String(p.units??'')}));
 return {...base,category:category.category,categoryEvidence:{...base.categoryEvidence,value:category.category},specialty:null,specialtyRule:null,text,measures,mep:{metric:category.metric,unit:category.unit,system:null,rawProperties:extraProperties,rule:mepRule}};
}
export async function inspectMEPElements(elements,binding,geometry,progress=()=>{}){
 if(!elements.length||new Set(elements.map(e=>e.dbId)).size!==elements.length)throw Error('Lectura vacía o elementos duplicados');
 const records=[];let scanned=0;
 for(const raw of elements){const e=extractMEPElement(raw,binding);if(e.mep||e.category==='Floors'&&e.specialty==='Hormigón'){e.geometry=await geometry(e.dbId,e.mep?'bounds':'mesh');records.push(e);}if(++scanned%100===0){progress(scanned,elements.length);await new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(null);});}}
 return records;
}
export function pipeQuantity(e){return {...e.measures.length,unit:'ml',formula:'SUM(Length)',rule:mepRule};}
export function electricalQuantity(e){return pipeQuantity(e);}
export function equipmentQuantity(e){return e.elementId?{value:1,unit:'un',source:'ELEMENT_COUNT',issue:null,inputs:e.text.elementId.inputs,formula:'COUNT(DISTINCT ElementId)',rule:mepRule}: {...unavailable('ElementId no publicado; no se confirma el conteo'),unit:'un',rule:mepRule};}
export function ductQuantity(e){
 const length=pipeQuantity(e),{width,height,diameter}=e.measures;
 let surface={...unavailable('Faltan largo y dimensiones verificables de la sección'),unit:'m²',rule:mepRule};
 if(length.value!==null){
  const rectangular=width.value>0&&height.value>0,circular=diameter.value>0;
  const shape=normalize(e.text.shape.value);
  if(shape&& !['rectangular','rectangle','circular','round','redondo'].includes(shape))surface={...surface,issue:'La forma publicada no tiene una fórmula de superficie habilitada'};
  else if(rectangular&&!['rectangular','rectangle'].includes(shape))surface={...surface,issue:'Confirma la forma rectangular de la sección; ancho y alto también pueden corresponder a un ducto oval'};
  else if(rectangular&&circular||circular&&['rectangular','rectangle'].includes(shape))surface={...surface,issue:'Se publican diámetro y dimensiones rectangulares; sección ambigua'};
  else if(rectangular||circular){const parts=rectangular?[width,height]:[diameter];const value=rectangular?2*(width.value+height.value)*length.value:Math.PI*diameter.value*length.value;
   if(Number.isFinite(value))surface={value,unit:'m²',source:'CALCULATED_PARAMETERS',issue:null,inputs:[...length.inputs,...parts.flatMap(p=>p.inputs)],formula:rectangular?'2 × (Width + Height) × Length':'PI × Diameter × Length',rule:mepRule};
  }
 }
 return {length,surface};
}
export function resolveMEPFloor(e,resolver,settings,binding){
 const floor=resolveLevel(e,resolver,settings,binding);
 if(floor.multilevel)return {...floor,resolvedBuildingLevel:'MULTILEVEL',floor_assignment_method:'MULTILEVEL',issue:'Cruza varios pisos. Largo completo en MULTILEVEL; distribución por piso no calculada'};
 return floor;
}
export function calculateMEPQuantities(inspected,binding,settings){
 validateSettings(settings);
 const resolver=buildIntervals(inspected,settings,binding),candidates=slabCandidates(inspected,settings.levelToleranceM),counts=new Map();
 for(const e of inspected.filter(e=>e.mep))for(const id of [e.externalId&&'external:'+e.externalId,e.elementId&&'element:'+e.elementId].filter(Boolean))counts.set(id,(counts.get(id)??0)+1);
 const records=inspected.filter(e=>e.mep).map(e=>{
  const system=resolveMEPSystem(e,settings),definition=mepCategory(e.category),duct=definition.service==='duct'?ductQuantity(e):null;
  let quantity=duct?.length??(definition.service==='pipe'?pipeQuantity(e):definition.service==='electrical'?electricalQuantity(e):equipmentQuantity(e));
  let surface=duct?.surface??{...unavailable('No aplica a esta categoría'),unit:'m²'};
  if(counts.get('external:'+e.externalId)>1||counts.get('element:'+e.elementId)>1){quantity={...quantity,value:null,source:'NOT_AVAILABLE',issue:'Identificador repetido; requiere revisión'};surface={...surface,value:null,source:'NOT_AVAILABLE',issue:'Identificador repetido; requiere revisión'};}
  const unknown=unavailable('No aplica a la plantilla MEP');
  return {...e,specialty:system.specialty,specialtyRule:system.specialty?{id:mepRule.id,version:mepRule.version,basis:system.source}:null,mep:{...e.mep,system,quantity,surface,isMultiLevel:false},quantities:{concrete:unknown,formwork:unknown,rebar:unknown},rebar:{diameterMm:null,barLengthM:null,count:null,totalLengthM:null,unitWeightKgM:null,weight:unknown,table:null},floor:resolveMEPFloor(e,resolver,settings,binding)};
 }).map(e=>({...e,mep:{...e.mep,isMultiLevel:e.floor.multilevel}}));
 return {binding,engine:MEP_ENGINE,calculatedAt:new Date().toISOString(),settings,records,slabs:candidates,referenceRecords:inspected.filter(e=>!e.mep),resolver,coverage:{inspected:records.length,unclassified:records.filter(e=>!e.specialty).length,unknownCategory:0,geometryUnavailable:records.filter(e=>!e.geometry?.available).length,unresolvedFloors:records.filter(e=>e.floor.resolvedBuildingLevel===UNRESOLVED).length}};
}
export function mepCoverage(records,field='quantity'){
 const values=records.map(e=>e.mep[field].value),valid=values.filter(v=>v!==null),subtotal=valid.length?sum(valid):null;
 return {eligible:values.length,read:valid.length,missing:values.length-valid.length,subtotal,total:values.length&&valid.length===values.length?subtotal:null,status:!values.length?'NOT_APPLICABLE':valid.length===values.length?'COMPLETE':valid.length?'PARTIAL':'NOT_AVAILABLE'};
}
export function mepDimension(e){
 const m=e.measures,diameter=m.diameter.value,width=m.width.value,height=m.height.value,fmt=v=>(v*1000).toLocaleString('es-CL',{maximumFractionDigits:3});
 if(diameter>0&&width>0&&height>0)return 'Sección ambigua';
 return diameter>0?`Ø${fmt(diameter)} mm`:width>0&&height>0?`${fmt(width)} × ${fmt(height)} mm`:e.text.size.value??'Dimensión no disponible';
}
export function presentMEP(data,filter){
 const records=filterRecords(data.records,filter),groups=new Map(),cards=new Map();
 for(const e of records){
  const system=e.text.systemType.value??e.text.systemName.value??e.text.systemClassification.value??'Sistema no disponible',material=e.text.material.value??'Material no disponible',family=e.text.family.value??'Familia no disponible',type=e.text.type.value??e.name,dimension=mepDimension(e),floor=e.floor.resolvedBuildingLevel;
  // Raw dimensions, not rounded labels, define a quantity group.
  const key=JSON.stringify([e.specialty,e.category,floor,system,material,family,type,e.measures.diameter.value,e.measures.width.value,e.measures.height.value,e.text.size.value]);
  const group=groups.get(key)??{id:key,specialty:e.specialty,category:e.category,floor,system,material,family,type,dimension,unit:e.mep.unit,elements:[]};group.elements.push(e);groups.set(key,group);
  const def=mepCategory(e.category),card=cards.get(def.metric)??{metric:def.metric,label:def.label,unit:def.unit,elements:[]};card.elements.push(e);cards.set(def.metric,card);
 }
 const rows=[...groups.values()].map(g=>({...g,dbIds:g.elements.map(e=>e.dbId),count:g.elements.length,coverage:mepCoverage(g.elements),surface:mepCoverage(g.elements,'surface')}));
 return {records,rows,cards:[...cards.values()].map(c=>({...c,coverage:mepCoverage(c.elements),dbIds:c.elements.map(e=>e.dbId)})),multilevel:records.filter(e=>e.floor.multilevel).length};
}
export function compareMEP(previous,current){
 if(previous.binding.projectId!==current.binding.projectId||previous.binding.itemId!==current.binding.itemId||previous.engine!==MEP_ENGINE||current.engine!==MEP_ENGINE)throw Error('Fuentes MEP no comparables');
 const keys=[...new Set([...previous.records,...current.records].map(e=>e.mep.metric))];
 return {previous:previous.binding,current:current.binding,rulesChanged:JSON.stringify(previous.settings)!==JSON.stringify(current.settings),metrics:keys.map(metric=>{const definition=mepCategories.find(d=>d.metric===metric),a=mepCoverage(previous.records.filter(e=>e.mep.metric===metric)),b=mepCoverage(current.records.filter(e=>e.mep.metric===metric));return {metric,label:definition.label,unit:definition.unit,previous:a,current:b,difference:a.total!==null&&b.total!==null?b.total-a.total:null};})};
}
