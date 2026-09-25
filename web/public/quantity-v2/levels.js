import { normalize } from './properties.js';
export const UNRESOLVED='Piso no resuelto';
// A native base constraint is stronger evidence than a generic/custom Nivel.
// Keep both inputs visible; never equate labels such as 2 and N2.
export function publishedLevel(record){
 const base=record.text.baseLevel,level=record.text.level,aec=record.text.aecFloor;
 if(base?.inputs.some(input=>input.rawValue.trim()))return {value:base.value,source:'baseLevel',inputs:base.inputs,issue:base.issue};
 if(!level?.inputs.some(input=>input.rawValue.trim())&&aec?.inputs.some(input=>input.rawValue.trim()))return {value:aec.value,source:'aecFloor',inputs:aec.inputs,issue:aec.issue};
 return {value:level?.value??null,source:'level',inputs:level?.inputs??[],issue:level?.issue??'Nivel no publicado'};
}
export function slabCandidates(records,toleranceM){
 const slabs=records.filter(e=>e.specialty==='Hormigón'&&e.category==='Floors'&&e.geometry?.horizontalPrism&&e.geometry?.bbox);
 if(!Number.isFinite(toleranceM)||toleranceM<=0)return [];
 const sorted=[...slabs].sort((a,b)=>a.geometry.bbox.max[2]-b.geometry.bbox.max[2]),groups=[];
 for(const e of sorted){const z=e.geometry.bbox.max[2];let group=groups.find(g=>z-g.minZ<=toleranceM);if(!group){group={id:'slab-'+e.dbId,minZ:z,maxZ:z,z,dbIds:[],area:0,bbox:{min:[...e.geometry.bbox.min],max:[...e.geometry.bbox.max]},originalLevels:[]};groups.push(group);}group.maxZ=z;group.z=(group.minZ+z)/2;group.dbIds.push(e.dbId);group.area+=e.geometry.topArea;for(let i=0;i<3;i++){group.bbox.min[i]=Math.min(group.bbox.min[i],e.geometry.bbox.min[i]);group.bbox.max[i]=Math.max(group.bbox.max[i],e.geometry.bbox.max[i]);}const original=publishedLevel(e).value;if(original&&!group.originalLevels.includes(original))group.originalLevels.push(original);}
 const max=Math.max(0,...groups.map(g=>g.area));return groups.map(g=>({...g,relativeArea:max?g.area/max:0,status:'PROPOSED'}));
}
export function buildIntervals(records,settings,binding){
 if(!settings.levelReferences?.length||settings.levelBinding?.urn!==binding.urn||settings.levelBinding?.viewId!==binding.viewId)return {intervals:[],issue:'Confirma las losas de referencia para esta versión y vista'};
 const candidates=slabCandidates(records,settings.levelToleranceM),refs=settings.levelReferences.map(ref=>({ref,candidate:candidates.find(c=>c.id===ref.id&&JSON.stringify(c.dbIds)===JSON.stringify(ref.dbIds))}));
 if(refs.some(r=>!r.candidate||!r.ref.label.trim())||refs.length<2)return {intervals:[],issue:'Las referencias no corresponden a las losas de esta vista'};
 refs.sort((a,b)=>a.candidate.z-b.candidate.z);
 const intervals=[];
 for(let i=1;i<refs.length;i++){
  const lower=refs[i-1].candidate,upper=refs[i].candidate;
  if(upper.minZ<=lower.maxZ)return {intervals:[],issue:'Los límites de piso se superponen'};
  intervals.push({id:refs[i].ref.id,label:refs[i].ref.label,lowerZ:lower.z,upperZ:upper.z,lowerSlabIds:lower.dbIds,upperSlabIds:upper.dbIds,lowerBounds:lower.bbox,upperBounds:upper.bbox,source:'VALIDATED_SLAB_REFERENCES',aliases:refs[i].ref.aliases??[]});
 }
 return {intervals,base:{...refs[0].candidate,label:refs[0].ref.label},issue:null};
}
const inXY=(p,box)=>p[0]>=box.min[0]&&p[0]<=box.max[0]&&p[1]>=box.min[1]&&p[1]<=box.max[1];
export function resolveLevel(record,resolver,settings,binding){
 const published=publishedLevel(record),original=published.value;
 const empty={originalRevitLevel:original,resolvedBuildingLevel:UNRESOLVED,floor_assignment_method:null,floor_confidence:0,multilevel:false,intervals:[],status:'REQUIRES_REVIEW',issue:resolver.issue??'Elemento fuera de los intervalos confirmados',evidence:{publishedLevel:published,customLevel:record.text.level.value,baseLevel:record.text.baseLevel.value,topLevel:record.text.topLevel.value}};
 const manual=settings.manualFloors?.find(m=>m.dbId===record.dbId);
 const bound=settings.levelBinding?.urn===binding.urn&&settings.levelBinding?.viewId===binding.viewId;
 if(manual&&bound)return {...empty,resolvedBuildingLevel:manual.label,floor_assignment_method:'MANUAL',floor_confidence:1,status:'VALIDATED',issue:null,evidence:{source:'USER_CONFIGURATION'}};
 if(resolver.issue)return empty;
 const g=record.geometry,p=g?.centroid,b=g?.bbox;
 if(p&&b){
  if(resolver.base.dbIds.includes(record.dbId))return {...empty,resolvedBuildingLevel:resolver.base.label,floor_assignment_method:'SLAB_INTERVAL',floor_confidence:1,status:'RESOLVED',issue:null,evidence:{slabDbIds:resolver.base.dbIds,point:p,pointMethod:g.centroidMethod}};
  const spans=resolver.intervals.filter(l=>inXY(p,l.lowerBounds)&&inXY(p,l.upperBounds)).map(l=>({...l,overlap:Math.max(0,Math.min(b.max[2],l.upperZ)-Math.max(b.min[2],l.lowerZ))})).filter(l=>l.overlap>1e-6);
  const containing=spans.find(l=>p[2]>=l.lowerZ&&p[2]<l.upperZ);
  if(spans.length){
   const order=[...spans].sort((a,b)=>b.overlap-a.overlap),multi=spans.length>1,predominant=multi?order[0]:containing;
   if(!predominant||multi&&order.length>1&&Math.abs(order[0].overlap-order[1].overlap)<=1e-6)return {...empty,multilevel:multi,intervals:spans.map(l=>({id:l.id,label:l.label,overlapM:l.overlap})),issue:'Empate o punto representativo fuera de los intervalos'};
   const coverage=predominant.overlap/Math.max(b.max[2]-b.min[2],1e-6),partial=spans.reduce((v,l)=>v+l.overlap,0)<b.max[2]-b.min[2]-1e-6;
   return {...empty,resolvedBuildingLevel:predominant.label,floor_assignment_method:multi?'MULTILEVEL':'SLAB_INTERVAL',floor_confidence:Math.min(1,coverage),multilevel:multi,status:partial?'REQUIRES_REVIEW':'RESOLVED',issue:partial?'Parte del elemento queda fuera de los intervalos':multi?'Cubicación completa asignada al piso predominante; aún no se divide por piso':null,intervals:spans.map(l=>({id:l.id,label:l.label,overlapM:l.overlap})),evidence:{lowerZ:predominant.lowerZ,upperZ:predominant.upperZ,point:p,pointMethod:g.centroidMethod,xyCheck:'BOUNDING_BOX_OVERLAP',confidenceBasis:'Fracción de altura contenida en el piso predominante; no probabilidad de IA'}};
  }
 }
 // Level names are never matched fuzzily or used to override conflicting geometry.
 if(!b&&original){const matches=resolver.intervals.filter(l=>[l.label,...l.aliases].some(a=>normalize(a)===normalize(original)));if(matches.length===1)return {...empty,resolvedBuildingLevel:matches[0].label,floor_assignment_method:'REVIT_LEVEL',floor_confidence:1,status:'VALIDATED',issue:null,evidence:{source:'USER_VALIDATED_ALIAS',original}};}
 return empty;
}
