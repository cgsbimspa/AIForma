import {randomUUID} from 'node:crypto';
import {DataError} from '../autodesk/data.ts';
import type {AuditInventory,AuditElement} from '../audit/contracts.ts';
import {property} from '../audit/provider.ts';
import {engineVersion,reviewTopics} from './catalog.ts';
import {ridaaRules} from './ridaa.ts';
import {mepCategories} from '../../public/quantity-v2/mep-catalog.js';
import {configurationSchema,states,type Configuration,type Element,type Evidence,type Finding,type Run,type Report,type Results,type NetworkGraph} from './contracts.ts';

export function flatten(props:Record<string,unknown>,prefix='',depth=0):Record<string,unknown>{
 if(depth>20)return {};
 return Object.fromEntries(Object.entries(props).flatMap(([k,v])=>{const key=prefix?`${prefix}.${k}`:k;return v&&typeof v==='object'&&!Array.isArray(v)?Object.entries(flatten(v as Record<string,unknown>,key,depth+1)):[[key,v]];}));
}
const scalar=(e:AuditElement,names:string[])=>{const p=property(e,names);return p&&['string','number'].includes(typeof p.value)?String(p.value):null;};
function category(e:AuditElement){if(e.category)return e.category;const labels=new Set(mepCategories.flatMap(c=>[c.category,...c.aliases])),matches=(e.treePath??[]).filter(n=>labels.has(n));return matches.length===1?matches[0]:null;}
export function extractModel(inventory:AuditInventory):Element[]{return inventory.elements.map(e=>({dbId:e.dbId,uniqueId:e.uniqueId,elementId:e.elementId||null,name:e.name,category:category(e),categorySource:e.categorySource??(category(e)?'tree':null),categoryPath:e.treePath??[],system:scalar(e,['System Name','Nombre de sistema'])??scalar(e,['System Type','Tipo de sistema']),subspecialty:scalar(e,['Sub Especialidad','Subespecialidad']),level:scalar(e,['Reference Level','Nivel de referencia','Level','Nivel']),building:scalar(e,['Building','Edificio','Torre']),zone:scalar(e,['Zone','Zona','Sector']),values:flatten(e.properties)}));}
export function propertyCatalog(inventory:AuditInventory){const elements=extractModel(inventory),map=new Map<string,{count:number;examples:Set<string>}>();for(const e of elements)for(const [k,v] of Object.entries(e.values)){const p=map.get(k)??{count:0,examples:new Set<string>()};p.count++;if(p.examples.size<8&&v!=null)p.examples.add(String(v).slice(0,200));map.set(k,p);}return {readCount:elements.length,missingCount:inventory.missing,population:inventory.population,categories:[...new Set(elements.flatMap(e=>e.category?[e.category]:[]))].sort(),properties:[...map].map(([path,v])=>({path,count:v.count,examples:[...v.examples]})).sort((a,b)=>a.path.localeCompare(b.path)),fetchedAt:inventory.fetchedAt};}
// Units must be published explicitly. Never interpret an unlabelled number as SI.
export function measurement(value:unknown,unit:string):number|null{
 if(typeof value!=='string')return null;
 const match=value.trim().match(/^([+-]?\d+(?:[.,]\d+)?)\s*(mm|cm|m|%|l\/s|m\/s|kPa|mca|UEH|un)$/i);if(!match)return null;
 const number=Number(match[1].replace(',','.'));if(!Number.isFinite(number))return null;
 const input=match[2].toLowerCase(),target=unit.toLowerCase();if(input===target)return number;
 const scale:Record<string,number>={mm:.001,cm:.01,m:1};return scale[input]&&scale[target]?number*scale[input]/scale[target]:null;
}
export function buildNetwork(elements:Element[]):NetworkGraph{return {state:'NOT AVAILABLE',reason:'La lectura de propiedades no publica conectores ni adyacencias verificadas. No se infieren redes, sentido de flujo o recorridos por cercanía.',elements:elements.map(e=>({id:e.uniqueId??`dbId:${e.dbId}`,system:e.system,type:e.category,startNode:null,endNode:null,upstream:null,downstream:null,diameter:null,length:null,startElevation:null,endElevation:null,level:e.level,building:e.building,zone:e.zone,connectionState:'NOT AVAILABLE',upstreamUEH:null,downstreamUEH:null,slope:null,flowDirection:null,qi:null,qmp:null,flow:null,velocity:null,pressureLoss:null,availablePressure:null}))};}
export function executeReview(configuration:Configuration,inventory:AuditInventory,createdBy:string,revision:number):Run{
 const c=configurationSchema.parse(configuration),source=c.source;
 if(!source?.view||!source.version.modelId||source.view.role!=='3d'||!c.scope.confirmed)throw new DataError('coordination_scope_required',422);
 const all=extractModel(inventory),elements=all.filter(e=>c.scope.mode==='VIEW'||String(e.values[c.scope.property]??'')===c.scope.value);
 if(!elements.length)throw new DataError('coordination_empty_scope',422);
 if(elements.length>25000||elements.length*Math.max(1,c.criteria.length)>100000)throw new DataError('coordination_scope_too_large',413);
 const id=randomUUID(),createdAt=new Date().toISOString();
 const evidence=(e:Element|null,path:string|null,raw:unknown,unit:string|null):Evidence=>({endpoint:inventory.endpoint,treeEndpoint:inventory.treeEndpoint,fetchedAt:inventory.fetchedAt,projectId:source.scope.projectId,modelId:source.scope.itemId,versionId:source.version.id,viewId:source.view!.id,dbId:e?.dbId??null,uniqueId:e?.uniqueId??null,property:path,raw,unit,method:'Comparación determinística del parámetro publicado; no equivale a un cálculo hidráulico ni a medición geométrica.'});
 const findings:Finding[]=[];let rulesExecuted=0;
 for(const rule of ridaaRules.filter(r=>r.systems.includes(c.systemId))){
  const criterion=c.criteria.find(r=>r.ruleId===rule.id)??null;
  const base={ruleId:rule.id,systemId:c.systemId,group:rule.group,title:rule.name,criterion,confidence:null};
  if(!criterion){findings.push({...base,id:randomUUID(),state:'NOT EVALUATED',kind:'NOT EVALUATED',element:null,observed:null,required:rule.check?.value??null,difference:null,description:`${rule.requirement} Pendiente: ${rule.dependencies}${rule.check?' Asocia el parámetro BIM y confirma el ámbito y las excepciones.':''}`,evidence:evidence(null,null,null,rule.check?.unit??null)});continue;}
  const applicable=elements.filter(e=>criterion.categories.includes(e.category??'')&&(!criterion.filter.property||String(e.values[criterion.filter.property]??'')===criterion.filter.value));
  if(!applicable.length){findings.push({...base,id:randomUUID(),state:'NOT EVALUATED',kind:'NOT EVALUATED',element:null,observed:null,required:criterion.value,difference:null,description:'No se recuperaron elementos que coincidan con el ámbito configurado. No se demuestra que la regla no aplique al proyecto.',evidence:evidence(null,criterion.property,null,criterion.unit)});continue;}
  let evaluated=false;
  for(const e of applicable){const raw=e.values[criterion.property]??null,n=measurement(raw,criterion.unit),pass=n===null?null:criterion.operator==='>='?n>=criterion.value:n<=criterion.value;
   const state=pass===null?'NOT EVALUATED':pass?'PASS':'FAIL';if(pass!==null)evaluated=true;
   findings.push({...base,id:randomUUID(),state,kind:pass===null?'NOT EVALUATED':pass?'INFORMATION':'NORMATIVE FAIL',element:{...e,values:{[criterion.property]:raw}},observed:n,required:criterion.value,difference:n===null?null:n-criterion.value,description:pass===null?'El parámetro no está disponible o no contiene una unidad interpretable. No se emite cumplimiento.':`${n} ${criterion.unit} ${pass?'satisface':'no satisface'} ${criterion.operator} ${criterion.value} ${criterion.unit}, bajo el ámbito confirmado. ${rule.application}`,evidence:evidence(e,criterion.property,raw,criterion.unit)});
  }if(evaluated)rulesExecuted++;
 }
 // Functional review topics remain visible without inventing requirements from a title.
 for(const topic of reviewTopics.filter(t=>t.systemId===c.systemId&&t.group==='CONECTIVIDAD'))findings.push({id:randomUUID(),ruleId:topic.id,systemId:c.systemId,group:topic.group,title:topic.name,state:'NOT EVALUATED',kind:'NOT EVALUATED',element:null,observed:null,required:null,difference:null,description:'Requiere conectores y grafo de red verificados. Los nombres y la cercanía de elementos no demuestran conectividad.',criterion:null,confidence:null,evidence:evidence(null,null,null,null)});
 return {id,systemId:c.systemId,source,configuration:c,configurationRevision:revision,createdBy,createdAt,engineVersion,population:inventory.population,readCount:elements.length,excludedCount:all.length-elements.length,missingCount:inventory.missing,rulesExecuted,findings,graph:buildNetwork(elements),status:inventory.missing||findings.some(f=>f.state==='NOT EVALUATED')?'PARTIAL':'COMPLETED'};
}
export function report(run:Run):Report{const {findings,graph,...rest}=run;return {...rest,findingCount:findings.length,counts:Object.fromEntries(states.map(s=>[s,findings.filter(f=>f.state===s).length])) as Report['counts'],graph:{state:graph.state,reason:graph.reason}};}
export function results(run:Run,filters:Record<string,string>,offset=0):Results{
 const value=(f:Finding,key:string)=>String(key==='state'?f.state:key==='group'?f.group:key==='rule'?f.ruleId:key==='system'?f.systemId:key==='subspecialty'?f.element?.subspecialty??'No disponible':key==='building'?f.element?.building??'No disponible':key==='level'?f.element?.level??'No disponible':'');
 const rows=run.findings.filter(f=>Object.entries(filters).every(([k,v])=>!v||value(f,k)===v));
 return {rows:rows.slice(offset,offset+50),total:rows.length,offset,facets:Object.fromEntries(['state','group','rule','system','subspecialty','building','level'].map(k=>[k,[...new Set(run.findings.map(f=>value(f,k)))].sort()]))};
}
export function compareRuns(a:Run,b:Run){
 if(a.id===b.id||a.source.version.number>b.source.version.number||a.createdAt>b.createdAt)throw new DataError('coordination_comparison_mismatch',422);
 if(a.source.scope.projectId!==b.source.scope.projectId||a.source.scope.hubId!==b.source.scope.hubId||a.source.scope.itemId!==b.source.scope.itemId||a.systemId!==b.systemId||a.engineVersion!==b.engineVersion||JSON.stringify(a.configuration.criteria)!==JSON.stringify(b.configuration.criteria)||JSON.stringify(a.configuration.scope)!==JSON.stringify(b.configuration.scope))throw new DataError('coordination_comparison_mismatch',422);
 const key=(f:Finding)=>f.element?.uniqueId?`${f.ruleId}:${f.element.uniqueId}`:null;
 const ambiguous=new Set<string>();for(const run of [a,b]){const seen=new Set<string>();for(const f of run.findings){const k=key(f);if(k){if(seen.has(k))ambiguous.add(k);seen.add(k);}}}
 const previous=new Map(a.findings.flatMap(f=>key(f)&&!ambiguous.has(key(f)!)?[[key(f)!,f] as const]:[]));
 const counts={corrected:0,persistent:0,new:0,notEvaluated:0};
 const current=new Set<string>();for(const f of b.findings){const k=key(f);if(!k||ambiguous.has(k)){counts.notEvaluated++;continue;}current.add(k);const old=previous.get(k);if(f.state==='NOT EVALUATED'||!old){if(f.state==='FAIL'&&!old)counts.new++;else counts.notEvaluated++;}else if(f.state==='FAIL'&&old.state==='FAIL')counts.persistent++;else if(f.state==='PASS'&&old.state==='FAIL')counts.corrected++;else if(f.state==='FAIL'&&old.state==='PASS')counts.new++;else if(old.state==='NOT EVALUATED'&&f.state==='FAIL')counts.notEvaluated++;}
 for(const [k,f] of previous)if(f.state==='FAIL'&&!current.has(k))counts.notEvaluated++;
 return {previous:a.id,current:b.id,counts,note:'Sólo compara el mismo archivo, sistema, alcance, motor y criterios, con UniqueId persistente. Un elemento ausente no se declara corregido.'};
}
