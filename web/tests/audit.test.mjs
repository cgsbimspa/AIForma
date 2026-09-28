import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {auditRules,defaultConfiguration,globalTolerances,effectiveTolerances} from '../lib/audit/catalog.ts';
import {parseInventory,readAuditView} from '../lib/audit/provider.ts';
import {executeAudit,score,explicitMillimetres} from '../lib/audit/engine.ts';
import {createAuditStore} from '../lib/audit/store.ts';
// All fixtures in this file are TEST ONLY, not real model data or technical criteria.
const now=new Date().toISOString(),actor={organizationId:'TEST_ORG',projectId:'TEST_PROJECT',userId:'TEST_USER'};
const source={scope:{kind:'file',hubId:actor.organizationId,projectId:actor.projectId,folderIds:['TEST_FOLDER'],itemId:'TEST_FILE'},fileName:'TEST.rvt',projectName:'TEST project',path:'TEST / TEST.rvt',version:{id:'TEST_V1',number:1,name:'TEST.rvt',createdAt:now,modelId:'TEST_URN',webUrl:null,endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now},view:{id:'TEST_VIEW',name:'TEST audit view',role:'3d',endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now},versionPolicy:'manual'};
const configuration={...structuredClone(defaultConfiguration),source};
const company={companyId:actor.organizationId,version:0,tolerances:[],rules:[],naming:{},equivalences:{},exceptions:[]};
const project={...company,projectId:actor.projectId};
function row(id,name,category,extra={}){return {objectid:id,name,externalId:`TEST_UID_${id}`,properties:{Identity:{Category:category,'Element ID':String(1000+id)},Constraints:extra}};}
function inventory(rows,missing=[]){return parseInventory({data:{objects:[{objectid:900,name:'TEST ROOT',objects:[...rows.map(r=>({objectid:r.objectid,name:r.name})),...missing.map(objectid=>({objectid}))]}]}},{data:{collection:rows}},source,'https://developer.api.autodesk.com/TEST/properties','https://developer.api.autodesk.com/TEST/tree');}
function execute(inv,overrides={}){return executeAudit({configuration,inventory:inv,companyCatalog:company,projectCatalog:project,createdBy:actor.userId,startedAt:now,...overrides});}
test('controlled matrix covers all chapters; every initial tolerance is zero but unconfigured',()=>{
 assert.equal(globalTolerances.length,20);assert.ok(globalTolerances.every(t=>t.value===0&&t.status==='Por Configurar'));
 assert.equal(new Set(auditRules.map(r=>r.ruleId)).size,auditRules.length);
 assert.deepEqual([...new Set(auditRules.map(r=>r.chapter))],['G01','G02','G03','G04','G05','G06','G07','G08']);
 assert.ok(auditRules.filter(r=>r.controlType==='SEMANTIC_AI').every(r=>!r.possibleResults.includes('FAIL')));
});
test('scope intersects published property rows with exact view leaves, excluding parent nodes and another view',()=>{
 const rows=[row(1,'TEST level','Levels',{Elevation:'0 mm'}),row(2,'TEST slab','Floors',{Level:'TEST level'}),row(77,'TEST other view','Floors'),row(900,'TEST grouping','Floors')];
 const inv=parseInventory({data:{objects:[{objectid:900,objects:[{objectid:1},{objectid:2},{objectid:3}]}]}},{data:{collection:rows}},source,'TEST_URL','TEST_TREE');
 assert.deepEqual(inv.elements.map(e=>e.dbId),[1,2]);assert.equal(inv.excluded,2);assert.equal(inv.missing,1);
 assert.throws(()=>parseInventory({data:{objects:[]}},{data:{collection:[rows[0],rows[0]]}},source,'TEST','TEST'),/invalid_response/);
});
test('does not invent native Revit IDs or classifications from names',()=>{
 const inv=inventory([{objectid:1,name:'TEST Walls Levels Grid',properties:{}}]);assert.equal(inv.elements[0].category,null);assert.equal(inv.elements[0].elementId,'');assert.equal(inv.elements[0].uniqueId,null);
});
test('APS direct child and nested properties are both supported; conflicting values remain unresolved',()=>{
 const inv=inventory([{objectid:1,name:'TEST floor',properties:{Category:'Floors',Constraints:{Level:'TEST N1'}}},{objectid:2,name:'TEST ambiguous',properties:{Category:'Floors',A:{Level:'TEST N1'},B:{Level:'TEST N2'}}}]);
 assert.equal(inv.elements[0].category,'Floors');const run=execute(inv);
 assert.equal(run.inventory.elements[0].level,'TEST N1');assert.equal(run.inventory.elements[1].level,null);
});
test('published category ancestors enable exact vertical mappings, retaining source paths and rejecting ambiguity',()=>{
 const properties={data:{collection:[{objectid:1,name:'TEST object',externalId:'TEST_UID_1',properties:{Constraints:{'Base Constraint':'TEST N1','Top Constraint':'TEST N2'}}}]}};
 const tree={data:{objects:[{objectid:900,name:'TEST model',objects:[{objectid:901,name:'Walls',objects:[{objectid:902,name:'TEST family',objects:[{objectid:1}]}]}]}]}};
 const inv=parseInventory(tree,properties,source,'TEST_PROPERTIES','TEST_TREE');
 assert.equal(inv.elements[0].category,'Walls');assert.equal(inv.elements[0].categorySource,'tree');
 const finding=execute(inv).findings.find(f=>f.ruleId==='G03-C01'&&f.result==='PASS');
 assert.ok(finding);assert.equal(finding.affectedElements[0].level,'TEST N1');
 assert.equal(finding.evidence[1].source,'TEST_TREE');assert.deepEqual(finding.evidence[1].observedValue[0].path,['TEST model','Walls','TEST family']);
 tree.data.objects[0].objects[0].objects[0].name='Floors';
 assert.equal(parseInventory(tree,properties,source,'TEST_PROPERTIES','TEST_TREE').elements[0].category,null);
});
test('unavailable levels are not declared nonexistent; incomplete data is not PASS or FAIL',()=>{
 const run=execute(inventory([row(1,'TEST slab','Floors',{Level:'N2'})],[2]));
 assert.equal(run.scope.status,'PARTIAL');assert.equal(run.findings.find(f=>f.ruleId==='G03-B01').result,'NOT EVALUATED');
 assert.ok(run.findings.filter(f=>['G03-C02','G03-C03'].includes(f.ruleId)).every(f=>f.result==='NOT EVALUATED'));
 assert.ok(!run.findings.some(f=>f.result==='FAIL'));
});
test('unit-aware level comparisons require confirmed tolerance and preserve evidence, duplicates only WARNING',()=>{
 const inv=inventory([row(1,'TEST N1','Levels',{Elevation:'1 m'}),row(2,'TEST N1','Levels',{Elevation:'1001 mm'})]);
 assert.equal(execute(inv).findings.find(f=>f.ruleId==='G03-B03').result,'NOT EVALUATED');
 const t={...globalTolerances[0],origin:'PROJECT',status:'Confirmada',value:2,evidence:'TEST explicitly validated criterion'};
 const run=execute(inv,{projectCatalog:{...project,version:1,tolerances:[t]}}),f=run.findings.find(f=>f.ruleId==='G03-B03');
 assert.equal(f.result,'WARNING');assert.equal(f.observedValue.differenceMm,1);assert.equal(f.affectedElements.length,2);assert.equal(f.evidence[0].viewerReference.viewId,'TEST_VIEW');assert.equal(run.tolerances[0].value,2);
 assert.equal(explicitMillimetres(1),null);assert.equal(explicitMillimetres('1 foo'),null);assert.equal(explicitMillimetres('1.5 cm'),15);
 assert.equal(run.findings.find(f=>f.ruleId==='G03-B01').result,'WARNING');
});
test('catalog inheritance, zero confirmed and zero unconfigured remain distinct',()=>{
 const c={...globalTolerances[0],value:3,origin:'COMPANY',status:'Confirmada',evidence:'TEST'};
 const p={...c,value:0,origin:'PROJECT',status:'Por Configurar'};
 assert.equal(effectiveTolerances([c],[p])[0].status,'Por Configurar');assert.equal(effectiveTolerances([c],[])[0].value,3);
});
test('vertical mapping never guesses equivalents and checks both base and top references',()=>{
 const inv=inventory([row(1,'N2','Levels',{Elevation:'2 m'}),row(2,'TEST Wall','Walls',{'Base Constraint':'N2'}),row(3,'TEST Slab','Floors',{Level:'Piso 2'})]);
 const run=execute(inv);const c=run.findings.filter(f=>f.ruleId==='G03-C01');assert.ok(c.some(f=>f.result==='NOT EVALUATED'&&f.affectedElements.some(e=>e.dbId===2)));
 assert.ok(run.findings.filter(f=>f.ruleId==='G03-C02'&&f.affectedElements.some(e=>e.dbId===3)).every(f=>f.result==='NOT EVALUATED'));
});
test('informational, unevaluated and N/A records never reduce conformity, including mixed rules',()=>{
 const findings=[{ruleId:'TEST_A',result:'PASS',affectedElements:[]},{ruleId:'TEST_A',result:'NOT EVALUATED',affectedElements:[]},{ruleId:'TEST_B',result:'INFORMATION',affectedElements:[]},{ruleId:'TEST_C',result:'N/A',affectedElements:[]}];
 assert.equal(score(findings).conformity,100);assert.equal(score(findings).pending,1);assert.equal(score(findings.slice(1)).conformity,null);
});
test('MEP element-grid rules are N/A and disabled rules do not execute',()=>{
 const run=execute(inventory([]),{configuration:{...configuration,discipline:'MEP',disabledRules:['G01-001']}});
 assert.ok(run.findings.filter(f=>f.ruleId.startsWith('G04-E')).every(f=>f.result==='N/A'));assert.ok(!run.findings.some(f=>f.ruleId==='G01-001'));
});
test('category, family and type inventories count verified values and retain unavailable groups without guessing',()=>{
 const a=row(1,'TEST instance A','Floors',{Level:'TEST N1'}),b=row(2,'TEST instance B','Floors');
 a.properties.Identity.Family='TEST family';a.properties.Identity['Type Name']='TEST type';
 const run=execute(inventory([a,b]));
 assert.equal(run.findings.find(f=>f.ruleId==='G05-A01'&&f.result==='INFORMATION').observedValue[0].count,2);
 assert.equal(run.findings.find(f=>f.ruleId==='G06-A01'&&f.result==='INFORMATION').observedValue[0].value,'TEST family');
 assert.equal(run.findings.find(f=>f.ruleId==='G06-A03'&&f.result==='NOT EVALUATED').affectedElements[0].dbId,2);
 assert.equal(run.findings.find(f=>f.ruleId==='G08-A01').result,'INFORMATION');
});
test('provider handles 202 pending without interpreting it as an empty model',async()=>{
 await assert.rejects(readAuditView('TEST_TOKEN',source,undefined,async()=>new Response('{}',{status:202})),/audit_derivative_pending/);
 await assert.rejects(readAuditView('TEST_TOKEN',{...source,view:{...source.view,role:'2d'}},undefined,async()=>new Response('{}')),/audit_view_required/);
});
test('append-only encrypted storage isolates projects, versions criteria and rejects stale changes',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec(await readFile(new URL('../db/audit.sql',import.meta.url),'utf8'));
  const tx=(actor,fn)=>db.transaction(async sql=>{await sql.exec('SET LOCAL ROLE ai_forma_audit');await sql.query("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true),set_config('app.user_id',$3,true)",[actor.organizationId,actor.projectId,actor.userId]);return fn(async(text,values=[])=>(await sql.query(text,values)).rows);});
  const store=createAuditStore(tx,randomBytes(32));assert.equal(await store.save(actor,0,configuration),1);
  await assert.rejects(store.save(actor,0,configuration),/configuration_conflict/);
  const run=execute(inventory([row(1,'TEST slab','Floors',{Level:'TEST N1'})]));await store.appendRun(actor,run);
  const w=await store.workspace(actor);assert.equal(w.runs.length,1);assert.equal((await store.run(actor,run.id)).versionId,'TEST_V1');
  assert.equal((await store.workspace({...actor,projectId:'TEST_OTHER'})).runs.length,0);
  await assert.rejects(store.run({...actor,projectId:'TEST_OTHER'},run.id),/not_found/);
  await assert.rejects(store.run({...actor,organizationId:'TEST_OTHER'},run.id),/not_found/);
  await store.save(actor,1,{...configuration,discipline:'MEP'});assert.equal((await store.run(actor,run.id)).discipline,'ESTRUCTURA');
  const encrypted=(await db.query('SELECT payload,label FROM audit_record')).rows;assert.ok(encrypted.every(r=>!r.payload.includes('TEST.rvt')&&!r.label.includes('TEST.rvt')));
  await assert.rejects(db.query('UPDATE audit_record SET label=$1 WHERE id=$2',['TEST',run.id]),/audit_history_is_immutable/);
  const criterion={...globalTolerances[0],origin:'COMPANY',value:2,status:'Confirmada',evidence:'TEST source'};
  await store.catalog(actor,'COMPANY',0,{rules:[],naming:{},equivalences:{},exceptions:[],tolerances:[criterion]});assert.equal((await store.workspace({...actor,projectId:'TEST_OTHER'})).companyCatalog.tolerances[0].value,2);
  assert.equal((await store.workspace({...actor,organizationId:'TEST_OTHER'})).companyCatalog.tolerances.length,0);
 }finally{await db.close();}
});
