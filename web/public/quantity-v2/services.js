import { unavailable, normalize, sum } from './properties.js';
const measured=(value,source,formula,inputs=[],extra={})=>Number.isFinite(value)&&value>=0?{value,source,formula,inputs,issue:null,...extra}:unavailable('Resultado geométrico no válido');
// Calculation convention explicitly confirmed by the user on 2026-09-25.
// It defines what to measure; it does not claim that a support was found in Revit.
export const slabFormworkRule={id:'cgs-slab-formwork',version:'2',basis:'Criterio confirmado por el usuario el 25-09-2026: fondo + cantos por defecto; radieres y losas de fundación identificados, sólo cantos'};
export function slabFormworkCriteria(e,settings,binding){
 const role=settings.slabRoles?.find(r=>r.dbId===e.dbId&&settings.levelBinding?.urn===binding.urn&&settings.levelBinding?.viewId===binding.viewId)?.role;
 const inputs=[...(e.text.type?.inputs??[]),...(e.text.family?.inputs??[])];
 const name=normalize([e.text.type?.value,e.text.family?.value].join(' '));
 const identifiedGround=/\bradier\b|losa.*fundacion|foundation slab/.test(name);
 const ground=role==='ground'||identifiedGround;
 return {role:ground?'ground':'elevated',basis:role==='ground'?'Condición por elemento confirmada para esta vista y versión':identifiedGround?'Radier o losa de fundación identificado en familia/tipo publicado':role==='elevated'?'Condición por elemento confirmada para esta vista y versión':slabFormworkRule.basis,source:role==='ground'||role==='elevated'&&!identifiedGround?'ELEMENT_CONFIGURATION':identifiedGround?'PUBLISHED_FAMILY_TYPE':'USER_CONFIRMED_DEFAULT',inputs:identifiedGround?inputs:[],rule:slabFormworkRule};
}
export function concreteQuantity(e){
 if(e.specialty!=='Hormigón')return unavailable('No corresponde a Hormigón');
 if(!['Structural Foundations','Structural Columns','Structural Framing','Walls','Floors'].includes(e.category))return unavailable('Categoría Revit no disponible o fuera del alcance');
 const p=e.measures.volume;if(p.value!==null)return {...p,formula:'Volume neto publicado por Revit'};
 if(e.geometry?.closed)return measured(e.geometry.volume,'BIM_GEOMETRY','Volumen de malla cerrada por tetraedros orientados',[],{precision:'TESSELLATED_GEOMETRY'});
 return unavailable('Volumen Revit no válido y geometría cerrada no disponible. No se usa el volumen de BoundingBox.');
}
export function formworkQuantity(e,settings,binding){
 if(e.specialty!=='Hormigón')return unavailable('Moldaje solo corresponde a Hormigón');
 const m=e.measures,g=e.geometry,ready=g?.closed;
 switch(e.category){
 case 'Walls':
  if(m.area.value!==null)return measured(m.area.value*2,'CALCULATED_PARAMETERS','Área de una cara × 2',m.area.inputs);
  if(ready&&g.rectangularPrism)return measured(g.twoLateralArea,'CALCULATED_GEOMETRY','Suma de las dos caras verticales principales');
  return unavailable('Área de una cara no disponible; geometría de muro no simple');
 case 'Structural Framing':
  if(m.length.value!==null&&m.height.value!==null)return measured(2*m.length.value*m.height.value,'CALCULATED_PARAMETERS','Largo × Altura × 2',[...m.length.inputs,...m.height.inputs]);
  if(ready&&g.rectangularPrism)return measured(g.twoLateralArea,'CALCULATED_GEOMETRY','Suma de dos caras laterales de prisma rectangular');
  return unavailable('Largo/altura no disponibles y geometría no prismática');
 case 'Structural Columns':
  if(m.perimeter.value!==null&&m.height.value!==null)return measured(m.perimeter.value*m.height.value,'CALCULATED_PARAMETERS','Perímetro de sección × Altura',[...m.perimeter.inputs,...m.height.inputs]);
  if(ready&&g.rectangularPrism&&m.width.value!==null&&m.depth.value!==null&&m.height.value!==null)return measured(2*(m.width.value+m.depth.value)*m.height.value,'CALCULATED_PARAMETERS','Pilar rectangular verificado: 2 × (Ancho + Fondo) × Altura',[...m.width.inputs,...m.depth.inputs,...m.height.inputs]);
  if(ready&&g.horizontalPrism)return measured(g.perimeter*g.thickness,'CALCULATED_GEOMETRY','Perímetro geométrico de sección × Altura');
  return unavailable('Perímetro/altura no disponibles y geometría de pilar no verificable');
 case 'Structural Foundations': {
  const name=normalize([e.text.type.value,e.text.family.value].join(' '));
  const linear=/viga.*fundacion|fundacion corrida|strip foundation|wall foundation/.test(name);
  if(linear&&m.length.value!==null&&m.height.value!==null)return measured(2*m.length.value*m.height.value,'CALCULATED_PARAMETERS','Fundación lineal: Largo × Altura × 2',[...m.length.inputs,...m.height.inputs]);
  if(linear&&ready&&g.rectangularPrism)return measured(g.twoLateralArea,'CALCULATED_GEOMETRY','Fundación lineal: dos caras laterales');
  if(ready&&g.verticalArea!==null&&settings.levelBinding?.urn===binding.urn&&settings.levelBinding?.viewId===binding.viewId&&settings.foundationFaces?.some(r=>r.dbId===e.dbId&&r.confirmed))return measured(g.verticalArea,'CALCULATED_GEOMETRY','Caras verticales de fundación confirmadas como expuestas por el usuario',[],{exposureSource:'USER_CONFIGURATION'});
  if(ready&&g.verticalArea!==null)return {...unavailable('Revisar caras expuestas de fundación no lineal; no se descuentan contactos entre elementos'),proposedValue:g.verticalArea,source:'CALCULATED_GEOMETRY',formula:'Área potencial de caras verticales; pendiente de validación'};
  return unavailable('Caras de fundación no disponibles');
 }
 case 'Floors': {
  if(!ready||!g.horizontalPrism)return unavailable('Geometría horizontal y perímetro de la losa no verificables');
  const criteria=slabFormworkCriteria(e,settings,binding),ground=criteria.role==='ground';
  if(!Number.isFinite(g.perimeter)||g.perimeter<0||!Number.isFinite(g.thickness)||g.thickness<=0||!ground&&(!Number.isFinite(g.bottomArea)||g.bottomArea<0))return unavailable('Perímetro, espesor o área inferior de losa no disponibles en la geometría publicada');
  const edges=g.perimeter*g.thickness,bottom=ground?0:g.bottomArea;
  return measured(edges+bottom,'CALCULATED_GEOMETRY',ground?'Radier/fundación: Perímetro × Espesor (sin fondo)':'Losa: Área inferior + Perímetro × Espesor',criteria.inputs,{slabRole:criteria.role,formworkCriteria:criteria,components:{bottomAreaM2:bottom,edgeAreaM2:edges,perimeterM:g.perimeter,thicknessM:g.thickness},precision:'TESSELLATED_GEOMETRY'});
 }
 default:return unavailable('Categoría sin regla de moldaje');
 }
}
export function rebarQuantity(e,settings){
 if(e.specialty!=='Enfierradura'||e.category!=='Structural Rebar')return {diameterMm:null,barLengthM:null,count:null,totalLengthM:null,unitWeightKgM:null,weight:unavailable('No corresponde a Structural Rebar de Enfierradura'),table:null};
 const m=e.measures,diameterMm=m.diameter.value===null?null:m.diameter.value*1000,count=m.count.value;
 const barLengthM=m.barLength.value??(count>0&&m.totalLength.value!==null?m.totalLength.value/count:null);
 const totalLengthM=barLengthM!==null&&count!==null?barLengthM*count:null;
 const table=(settings.rebarWeightTable??[]).filter(r=>diameterMm!==null&&Math.abs(r.diameter-diameterMm)<1e-6);
 const entry=table.length===1?table[0]:null;
 const valid=entry&&Number.isFinite(entry.unit_weight_kg_m)&&entry.unit_weight_kg_m>0&&entry.source?.trim()&&entry.version?.trim();
 const weight=totalLengthM===null?unavailable('Largo individual o cantidad de barras no disponibles'):diameterMm===null?unavailable('Diámetro de barra no disponible o unidad no verificada'):!valid?unavailable('Falta un coeficiente kg/m con fuente y versión para este diámetro'):measured(totalLengthM*entry.unit_weight_kg_m,'CALCULATED_PARAMETERS','Largo individual × Cantidad × kg/m',[...m.barLength.inputs,...m.count.inputs,...(m.barLength.value===null?m.totalLength.inputs:[])],{weightTable:entry});
 return {diameterMm,barLengthM,count,totalLengthM,unitWeightKgM:valid?entry.unit_weight_kg_m:null,weight,table:valid?entry:null};
}
export const metricDefinitions=[{key:'concrete',name:'Hormigón',unit:'m³'},{key:'formwork',name:'Moldaje',unit:'m²'},{key:'rebar',name:'Enfierradura',unit:'kg'}];
export function metricCoverage(records,metric){
 const eligible=records.filter(e=>metric==='rebar'?e.specialty==='Enfierradura':e.specialty==='Hormigón'),read=eligible.filter(e=>e.quantities[metric]?.value!==null&&e.quantities[metric]?.value!==undefined),subtotal=read.length?sum(read.map(e=>e.quantities[metric].value)):null;
 return {eligible:eligible.length,read:read.length,missing:eligible.length-read.length,subtotal,total:eligible.length&&read.length===eligible.length?subtotal:null,status:eligible.length===0?'NOT_APPLICABLE':read.length===eligible.length?'COMPLETE':read.length?'PARTIAL':'NOT_AVAILABLE'};
}
export function formworkDiagnostic(records){
 const concrete=records.filter(r=>r.specialty==='Hormigón'),reasons=new Map();
 for(const r of concrete)if(r.quantities.formwork.value===null){const issue=r.quantities.formwork.issue??'Datos pendientes de revisión';reasons.set(issue,(reasons.get(issue)??0)+1);}
 return {eligible:concrete.length,ready:concrete.filter(r=>r.quantities.formwork.value!==null).length,slabs:concrete.filter(r=>r.category==='Floors').length,reasons:[...reasons].map(([issue,count])=>({issue,count}))};
}
