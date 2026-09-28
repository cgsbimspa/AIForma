import { randomUUID } from 'node:crypto';
import { auditRules, effectiveTolerances } from './catalog.ts';
import { property } from './provider.ts';
import type { AuditConfiguration, AuditElement, AuditFinding, AuditInventory, AuditResult, AuditRun, CompanyAuditCatalog, ProjectAuditCatalog } from './contracts.ts';

// Do not interpret unitless values, display strings containing unknown units or ambiguous properties.
export function explicitMillimetres(value:unknown):number|null {
 if(typeof value!=='string')return null;
 const match=value.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m|ft|in)$/i);if(!match)return null;
 const scale:Record<string,number>={mm:1,cm:10,m:1000,ft:304.8,in:25.4};return Number(match[1].replace(',','.'))*scale[match[2].toLowerCase()];
}
export function score(findings:AuditFinding[]) {
 const counts=Object.fromEntries((['PASS','WARNING','FAIL','NOT EVALUATED','N/A','INFORMATION'] as AuditResult[]).map(s=>[s,findings.filter(f=>f.result===s).length])) as Record<AuditResult,number>;
 const byRule=new Map<string,AuditFinding[]>();for(const f of findings)byRule.set(f.ruleId,[...(byRule.get(f.ruleId)??[]),f]);
 let pass=0,evaluated=0,pending=0,executed=0;
 for(const fs of byRule.values()){
  const technical=fs.filter(f=>['PASS','WARNING','FAIL'].includes(f.result));
  if(technical.length){evaluated++;if(technical.every(f=>f.result==='PASS'))pass++;}
  if(fs.some(f=>f.result==='NOT EVALUATED'))pending++;
  if(fs.some(f=>!['NOT EVALUATED','N/A'].includes(f.result)))executed++;
 }
 // Mixed rules remain visibly partial; information, N/A and unavailable evidence never count as violations.
 return {counts,executed,evaluated,pending,totalRules:byRule.size,conformity:evaluated?100*pass/evaluated:null,coverage:byRule.size?100*executed/byRule.size:null,affected:new Set(findings.filter(f=>['WARNING','FAIL'].includes(f.result)).flatMap(f=>f.affectedElements.map(e=>e.dbId))).size};
}
export function executeAudit(input:{configuration:AuditConfiguration;inventory:AuditInventory;companyCatalog:CompanyAuditCatalog;projectCatalog:ProjectAuditCatalog;createdBy:string;startedAt:string}):AuditRun {
 const {configuration,inventory,companyCatalog,projectCatalog}=input,source=configuration.source;
 if(!source?.view||!source.version.modelId)throw Error('audit_view_required');
 const id=randomUUID(),completedAt=new Date().toISOString(),findings:AuditFinding[]=[],tolerances=effectiveTolerances(companyCatalog.tolerances,projectCatalog.tolerances);
 const rules=auditRules.map(r=>({...r,active:!configuration.disabledRules.includes(r.ruleId)}));
 const elements=inventory.elements.map(e=>({...e}));
 const mappings=configuration.verticalReferences.filter(m=>m.discipline===configuration.discipline&&m.status==='Confirmada');
 for(const e of elements){const m=mappings.find(m=>m.category===e.category),p=m?property(e,[m.baseReference||m.classificationReference].filter(Boolean)):null;e.level=p?String(p.value):null;}
 const byId=new Map(elements.map(e=>[e.dbId,e]));
 function add(ruleId:string,result:AuditResult,description:string,affected:AuditElement[]=[],observedValue:unknown=null,expectedValue:unknown=null,prop='') {
  const rule=rules.find(r=>r.ruleId===ruleId)!;const fid=randomUUID();
  findings.push({id:fid,auditRunId:id,ruleId,result,severity:result==='INFORMATION'?'Informativa':result==='WARNING'?'Revisión':result==='FAIL'?'Incumplimiento comprobado':'No evaluativa',title:rule.name,description,observedValue,expectedValue,toleranceId:rule.tolerance,createdAt:completedAt,
   affectedElements:affected.map(raw=>{const e=byId.get(raw.dbId)??raw;return {findingId:fid,modelId:source!.scope.itemId,elementId:e.elementId,dbId:e.dbId,uniqueId:e.uniqueId,name:e.name,category:e.category,family:e.family,type:e.type,level:e.level};}),
   evidence:[{source:ruleId==='G01-004'?'Configuración declarada por el usuario; snapshot de esta ejecución':['G01-001','G01-006'].includes(ruleId)?`https://developer.api.autodesk.com/project/v1/hubs/${encodeURIComponent(source!.scope.hubId)}/projects/${encodeURIComponent(source!.scope.projectId)}`:ruleId.startsWith('G01')?source!.version.endpoint:inventory.endpoint,property:prop||rule.property,observedValue,expectedValue,unit:null,geometryReference:null,viewerReference:{urn:source!.version.modelId!,viewId:source!.view!.id,dbIds:affected.map(e=>e.dbId)},fetchedAt:inventory.fetchedAt}]});
 }
 function duplicates(ruleId:string,rows:AuditElement[]) {
  if(!rows.length){add(ruleId,'NOT EVALUATED','No se recuperaron objetos de esta categoría desde la vista. No demuestra su ausencia en el RVT.');return;}
  const names=new Map<string,AuditElement[]>();for(const e of rows)names.set(e.name,[...(names.get(e.name)??[]),e]);
  const repeated=[...names.values()].filter(es=>es.length>1);
  for(const es of repeated)add(ruleId,'WARNING','Nombre idéntico en objetos distintos de esta vista; revisar su intención.',es,es[0].name,'Nombre sin duplicación en el alcance','name');
  if(!repeated.length)add(ruleId,inventory.missing?'NOT EVALUATED':'PASS',inventory.missing?'La lectura incompleta impide descartar duplicados.':'No hay nombres duplicados en los objetos recuperados de esta vista.',[],rows.map(e=>({id:e.elementId,name:e.name})),null,'name');
 }
 const metadata:Record<string,unknown>={'G01-001':source.projectName,'G01-003':source.fileName,'G01-004':configuration.discipline,'G01-006':source.scope.hubId,'G01-007':`V${source.version.number}`,'G01-008':source.version.createdAt};
 for(const rule of rules.filter(r=>r.active)){
  const r=rule.ruleId;
  if(r in metadata){const v=metadata[r];add(r,v===null||r==='G01-008'?'NOT EVALUATED':'INFORMATION',r==='G01-004'?'Especialidad declarada por el usuario; no inferida del contenido.':r==='G01-008'?'Autodesk devuelve createTime, fecha de creación de esta versión. No confirma por separado la fecha de publicación de la vista en Revit.':'Dato de la fuente Autodesk verificada.',[],v);continue;}
  if(r==='G03-A01'){add(r,inventory.levels.length?'INFORMATION':'NOT EVALUATED',inventory.levels.length?'Niveles recuperados en la vista; elevaciones sin unidad explícita permanecen no disponibles.':'La vista no publica objetos de nivel identificables. Las referencias de los elementos se muestran por separado.',inventory.levels,inventory.levels.map(e=>({id:e.elementId,uniqueId:e.uniqueId,name:e.name,elevation:property(e,['Elevation','Elevación'])?.value??null})));continue;}
  if(r==='G03-B01'||r==='G04-B01'){duplicates(r,r==='G03-B01'?inventory.levels:inventory.grids);continue;}
  if(r==='G03-B03'||r==='G03-B04'){
   const t=tolerances.find(t=>t.id===rule.tolerance);
   if(t?.status!=='Confirmada'||t.unit!=='mm'){add(r,'NOT EVALUATED',`${rule.tolerance}: Por Configurar. Cero no equivale a una tolerancia confirmada.`);continue;}
   const levels=inventory.levels.map(e=>({e,z:explicitMillimetres(property(e,['Elevation','Elevación'])?.value)}));
   if(levels.length<2||levels.some(l=>l.z===null)){add(r,'NOT EVALUATED','Se necesitan al menos dos niveles con elevaciones y unidades explícitas.');continue;}
   let count=0;
   for(let i=0;i<levels.length;i++)for(let j=i+1;j<levels.length;j++){const delta=Math.abs(levels[i].z!-levels[j].z!);if(r==='G03-B03'?delta<=t.value:delta>0&&delta<t.value){count++;add(r,'WARNING',`Diferencia de elevación ${delta} mm; revisar estos niveles de la vista.`,[levels[i].e,levels[j].e],{differenceMm:delta,elevationsMm:[levels[i].z,levels[j].z]},{tolerance:t},'Elevation');}}
   if(!count)add(r,inventory.missing?'NOT EVALUATED':'PASS',inventory.missing?'Lectura incompleta; no se descartan otras parejas.':'Ninguna pareja recuperada cumple el criterio de advertencia.',[],levels.map(l=>({id:l.e.elementId,elevationMm:l.z})),t,'Elevation');continue;
  }
  if(['G03-C01','G03-C02','G03-C04'].includes(r)){
   const unmapped=elements.filter(e=>!mappings.some(m=>m.category===e.category));
   if(r==='G03-C04'){add(r,unmapped.length?'NOT EVALUATED':'INFORMATION',unmapped.length?'Estas categorías requieren un mapeo vertical confirmado.':'Todas las categorías del alcance tienen mapeo confirmado.',unmapped,[...new Set(unmapped.map(e=>e.category))]);continue;}
   let evaluated=0;
   for(const m of mappings){const group=elements.filter(e=>e.category===m.category);if(!group.length)continue;
    const referenceNames=[m.baseReference||m.classificationReference,m.topReference].filter(Boolean);
    const available=group.filter(e=>referenceNames.every(name=>property(e,[name])!==null)),missing=group.filter(e=>!available.includes(e));
    if(missing.length)add(r,'NOT EVALUATED','La referencia configurada no se obtuvo de forma inequívoca. No se declara que falte en Revit.',missing,null,m.baseReference||m.classificationReference);
    if(r==='G03-C01'&&available.length){evaluated++;add(r,'PASS','Referencia vertical publicada disponible para estos elementos.',available,available.map(e=>({id:e.elementId,reference:e.level})),m.baseReference||m.classificationReference);}
    if(r==='G03-C02'){
     const valid=available.filter(e=>referenceNames.every(name=>{const value=String(property(e,[name])!.value);return inventory.levels.filter(l=>l.name===value||l.elementId===value||l.uniqueId===value).length===1;}));
     if(valid.length){evaluated++;add(r,'PASS','La referencia coincide exactamente con un nivel único recuperado en esta vista.',valid,valid.map(e=>({id:e.elementId,reference:e.level})));}
     const unresolved=available.filter(e=>!valid.includes(e));if(unresolved.length)add(r,'NOT EVALUATED','No se puede resolver la referencia con el inventario de niveles de esta vista. No se considera nivel inexistente.',unresolved,unresolved.map(e=>({id:e.elementId,reference:e.level})));
    }
   }
   if(!evaluated&&!findings.some(f=>f.ruleId===r))add(r,'NOT EVALUATED','No hay referencias verticales evaluables con el catálogo actual.');continue;
  }
  if(r==='G03-D01'){
   const names=['Base Offset','Top Offset','Offset','Height Offset From Level'];
   const observations=elements.flatMap(e=>names.flatMap(name=>{const p=property(e,[name]);return p?[{id:e.elementId,dbId:e.dbId,property:`${p.group}.${p.name}`,value:p.value,millimetres:explicitMillimetres(p.value)}]:[];}));
   add(r,observations.length?'INFORMATION':'NOT EVALUATED','Offsets publicados, sin inferir unidades ni considerar automáticamente un valor distinto de cero como fallo.',elements.filter(e=>observations.some(o=>o.dbId===e.dbId)),observations,null,'Offsets publicados');continue;
  }
  if(r.startsWith('G03-E')){
   const available=elements.filter(e=>e.level!==null);const byLevel=new Map<string,AuditElement[]>();for(const e of available)byLevel.set(e.level!,[...(byLevel.get(e.level!)??[]),e]);
   add(r,available.length?'INFORMATION':'NOT EVALUATED','Distribución según referencias publicadas exactas; no se equiparan nombres parecidos ni se asignan pisos por inferencia.',[],[...byLevel].map(([level,es])=>({level,count:es.length,values:r==='G03-E02'?[...new Set(es.map(e=>e.category))]:r==='G03-E03'?[...new Set(es.map(e=>e.family))]:r==='G03-E04'?[...new Set(es.map(e=>e.type))]:es.map(e=>e.elementId)})));continue;
  }
  if(['G04-A01','G04-A02'].includes(r)){add(r,inventory.grids.length?'INFORMATION':'NOT EVALUATED',inventory.grids.length?'Objetos de grilla publicados en la vista.':'No se recuperaron objetos de grilla identificables de esta vista; no se afirma que el RVT carezca de ejes.',inventory.grids,inventory.grids.map(e=>({id:e.elementId,uniqueId:e.uniqueId,name:e.name})));continue;}
  if(r.startsWith('G04-E')&&configuration.discipline==='MEP'){add(r,'N/A','Relación elemento / grilla no aplicable inicialmente a MEP según el alcance definido.');continue;}
  add(r,'NOT EVALUATED',rule.tolerance?`${rule.tolerance}: ${tolerances.find(t=>t.id===rule.tolerance)?.status??'Por Configurar'}. Método, geometría o criterios adicionales pendientes de definición/verificación.`:rule.method==='Por definir'?'Método o criterio: Por definir. No se ha emitido una conclusión técnica.':'La fuente no entrega evidencia suficiente para esta comprobación.');
 }
 return {id,projectId:source.scope.projectId,modelId:source.scope.itemId,versionId:source.version.id,viewId:source.view.id,discipline:configuration.discipline,ruleSetId:configuration.ruleSetId,ruleSetVersion:'1.0.0',companyCatalogId:`${companyCatalog.companyId}:v${companyCatalog.version}`,projectCatalogId:`${projectCatalog.projectId}:v${projectCatalog.version}`,startedAt:input.startedAt,completedAt,status:findings.some(f=>f.result==='NOT EVALUATED')?'PARTIAL':'COMPLETED',createdBy:input.createdBy,source,configuration,rules,companyCatalog,projectCatalog,tolerances,engineVersion:'audit-engine-1.0.0',findings,inventory:{...inventory,elements},scope:{id:randomUUID(),auditRunId:id,scopeType:'VIEW',viewId:source.view.id,modelId:source.scope.itemId,elementCount:elements.length,status:inventory.missing?'PARTIAL':'VERIFIED',population:inventory.population,unavailableCount:inventory.missing}};
}
