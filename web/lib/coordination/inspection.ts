import type {AuditInventory} from '../audit/contracts.ts';
import type {Element, ModelOrigin, ModelCoverage, ParameterCandidate} from './contracts.ts';
import {ridaaRules} from './ridaa.ts';

// Preserve the full APS externalId. Linked occurrences can share the final
// Revit UniqueId; stripping the instance prefix merges different elements.
const revitId=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}-[a-f\d]{8}$/i;
export function modelOrigin(externalId:string|null):ModelOrigin {
 const parts=externalId?.split('/')??[];
 if(!parts.length||!parts.every(p=>revitId.test(p)))return {kind:'UNRESOLVED',key:'unresolved',instancePath:[],elementUniqueId:null};
 return {kind:parts.length>1?'LINKED':'HOST',key:parts.length>1?parts.slice(0,-1).join('/'):'host',instancePath:parts.slice(0,-1),elementUniqueId:parts.at(-1)!};
}
export function modelCoverage(elements:Pick<Element,'uniqueId'|'origin'|'category'|'categoryPath'>[],inventory:Pick<AuditInventory,'missing'>):ModelCoverage {
 const groups=new Map<string,ModelCoverage['groups'][number]>();
 for(const e of elements){const origin=e.origin??modelOrigin(e.uniqueId),g=groups.get(origin.key)??{...origin,count:0,categories:[],samplePaths:[]};g.count++;if(e.category&&!g.categories.includes(e.category))g.categories.push(e.category);const path=e.categoryPath.join(' / ');if(path&&!g.samplePaths.includes(path)&&g.samplePaths.length<3)g.samplePaths.push(path);groups.set(origin.key,g);}
 return {groups:[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key)),linkedElements:elements.filter(e=>(e.origin??modelOrigin(e.uniqueId)).kind==='LINKED').length,readCount:elements.length,missingCount:inventory.missing,scope:'Sólo host y vínculos incluidos en la vista publicada de esta versión. No demuestra que se hayan publicado todos los vínculos del RVT. La versión independiente de cada vínculo no está disponible en esta lectura.'};
}
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
// Candidate discovery only. Matching a property label does not confirm the
// legal scope, material, role (e.g. principal ventilation) or exceptions.
const labels:Record<string,string[]>={
 'RIDAA-88-MIN':['Slope','Pendiente'],'RIDAA-88-MAX':['Slope','Pendiente'],
 'RIDAA-89':['Water Seal Depth','Trap Seal Depth','Carga del cierre hidráulico','Altura de sello hidráulico'],
 'RIDAA-97-D':['Diameter','Diámetro','Nominal Diameter','Diámetro nominal'],
 'RIDAA-52-CU':['Diameter','Diámetro','Nominal Diameter','Diámetro nominal'],
 'RIDAA-52-PL':['Diameter','Diámetro','Nominal Diameter','Diámetro nominal'],
};
export function parameterCandidates(elements:Element[],measure:(v:unknown,u:string)=>number|null):ParameterCandidate[]{
 const output:ParameterCandidate[]=[];
 for(const rule of ridaaRules.filter(r=>r.check)){
  const names=new Set((labels[rule.id]??[]).map(normalize)),candidates=new Map<string,ParameterCandidate>();
  for(const e of elements)for(const [path,value] of Object.entries(e.values)){
   if(!names.has(normalize(path.split('.').at(-1)!)))continue;
   const candidate=candidates.get(path)??{ruleId:rule.id,property:path,count:0,readableCount:0,linkedCount:0,categories:[],examples:[]};
   candidate.count++;if(measure(value,rule.check!.unit)!==null)candidate.readableCount++;
   if(e.origin?.kind==='LINKED')candidate.linkedCount++;
   if(e.category&&!candidate.categories.includes(e.category))candidate.categories.push(e.category);
   const example=String(value??'');if(candidate.examples.length<4&&!candidate.examples.includes(example))candidate.examples.push(example.slice(0,160));
   candidates.set(path,candidate);
  }
  output.push(...candidates.values());
 }
 return output;
}
