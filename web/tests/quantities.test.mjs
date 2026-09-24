import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {compareRuns,quantityState,processingBlocker} from '../lib/quantities/engine.ts';
import {runSchema} from '../lib/quantities/contracts.ts';
import {modelVersion,modelViews} from '../lib/quantities/autodesk.ts';
import {createQuantityStore} from '../lib/quantities/store.ts';
import {encryptHistory} from '../lib/memory/domain.ts';

// TEST fixtures only. No synthetic model quantities or source records enter the app.
const actor={organizationId:'TEST_ORG',projectId:'TEST_PROJECT',userId:'TEST_USER'};
const now='2026-09-24T12:00:00.000Z';
const source={scope:{kind:'file',hubId:actor.organizationId,projectId:actor.projectId,folderIds:['TEST_FOLDER'],itemId:'TEST_FILE'},projectName:'TEST project',fileName:'TEST.rvt',path:'TEST project / TEST_FOLDER / TEST.rvt',version:{id:'TEST_VERSION_1',number:1,name:'TEST.rvt',createdAt:now,modelId:'TEST_DERIVATIVE',webUrl:null,endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now},view:{id:'TEST_VIEW',name:'TEST view',role:'3d',endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now},versionPolicy:'manual'};
const template={id:randomUUID(),templateId:randomUUID(),specialtyCode:'architecture',name:'TEST template',version:1,configuration:{TEST_ONLY:'Explicit test rule'},createdAt:now,createdBy:actor.userId};
const row=(code,quantity,unit='TEST_UNIT')=>({id:code,itemCode:code,itemName:code,description:'TEST',quantity,unit,elementCount:1,elementIds:['TEST_ELEMENT_'+code],groupingData:{},sourceMetadata:{endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now,ruleId:'TEST_RULE',ruleVersion:'1'}});
const run=(results,version=1)=>({id:randomUUID(),...actor,specialtyCode:'architecture',quantitySourceId:randomUUID(),source:{...source,version:{...source.version,id:'TEST_VERSION_'+version,number:version}},template,status:'COMPLETED',coverage:'complete',engine:{name:'TEST_ENGINE',version:'1'},startedAt:now,completedAt:now,createdBy:actor.userId,results});

test('quantity differences classify all change types and handle zero/absence without invented percentages',()=>{
 const a=run([row('UP',10),row('DOWN',20),row('SAME',3),row('REMOVE',4),row('ZERO',0)]);
 const b=run([row('UP',15),row('DOWN',10),row('SAME',3),row('ADD',7),row('ZERO',8)],2);
 const result=compareRuns(a,b,now);
 assert.deepEqual(result.summary,{ADDED:1,REMOVED:1,INCREASED:2,DECREASED:1,UNCHANGED:1});
 assert.equal(result.items.find(r=>r.itemCode==='UP').percentageDifference,50);
 assert.equal(result.items.find(r=>r.itemCode==='REMOVE').currentQuantity,null);
 assert.equal(result.items.find(r=>r.itemCode==='REMOVE').absoluteDifference,-4);
 assert.equal(result.items.find(r=>r.itemCode==='ZERO').percentageDifference,null);
 assert.equal(result.items.find(r=>r.itemCode==='ADD').previousQuantity,null);
 assert.equal(result.items.find(r=>r.itemCode==='ADD').percentageDifference,null);
 assert.equal(result.elements.status,'NOT_CALCULATED');
 assert.equal(compareRuns(a,{...b,template:{...template,id:randomUUID(),version:2}},now).templateChanged,true);
});
test('comparison rejects partial, incompatible and untraceable results',()=>{
 const a=run([row('TEST',10)]),b=run([row('TEST',11)],2);
 for(const invalid of [{...b,coverage:'partial'},{...b,projectId:'TEST_OTHER'},{...b,source:{...b.source,view:{...source.view,id:'OTHER_VIEW'}}},{...b,results:[row('TEST',11,'OTHER_UNIT')]},{...b,results:[row('TEST',11),row('TEST',12)]},{...b,results:[{...row('TEST',11),elementIds:[]}]},{...b,template:{...template,configuration:null}}]) assert.throws(()=>compareRuns(a,invalid));
 assert.throws(()=>compareRuns(a,a));assert.throws(()=>compareRuns(b,a));
 assert.equal(runSchema.safeParse({...a,results:[row('TEST',NaN)]}).success,false);
});
test('CURRENT requires a verified matching latest version and configuration; missing rules block processing',()=>{
 const r=run([]),config={id:r.quantitySourceId,specialtyCode:'architecture',source,templateVersionId:template.id,revision:0,createdAt:now,updatedAt:now,updatedBy:actor.userId};
 assert.equal(quantityState(config,template,r,source.version).state,'CURRENT');
 assert.equal(quantityState(config,template,r,{...source.version,id:'TEST_VERSION_2',number:2}).state,'STALE');
 assert.equal(quantityState(config,template,r,undefined).state,'ERROR');
 assert.equal(quantityState({...config,source:{...source,version:{...source.version,id:'TEST_VERSION_2',number:2}}},template,r,source.version).state,'READY');
 assert.equal(quantityState({...config,source:null},template,undefined,undefined).state,'NOT_CONFIGURED');
 assert.equal(quantityState(config,template,undefined,undefined).state,'READY');
 assert.match(processingBlocker(config,{...template,configuration:null}),/no tiene reglas/);
 assert.match(processingBlocker(config,template),/aún no está habilitado/);
});
test('Autodesk adapter verifies version membership, derivative availability and view IDs',async()=>{
 const raw={data:{id:'TEST_VERSION_1',type:'versions',attributes:{name:'TEST.rvt',versionNumber:1,createTime:now},relationships:{item:{data:{id:'TEST_FILE',type:'items'}},derivatives:{data:{id:'TEST_DERIVATIVE',type:'derivatives'}}}}};
 const v=await modelVersion('TEST_TOKEN',source.scope,'TEST_VERSION_1',async()=>Response.json(raw));
 assert.equal(v.modelId,'TEST_DERIVATIVE');assert.equal(v.createdAt,now);
 await assert.rejects(modelVersion('TEST_TOKEN',{...source.scope,itemId:'TEST_OTHER'},'TEST_VERSION_1',async()=>Response.json(raw)),/invalid_model/);
 await assert.rejects(modelVersion('TEST_TOKEN',source.scope,'TEST_OTHER_VERSION',async()=>Response.json(raw)),/invalid_response/);
 assert.deepEqual(await modelViews('TEST_TOKEN',{...v,modelId:null},()=>{throw Error('must not fetch');}),{views:[],unavailable:true});
 const views=await modelViews('TEST_TOKEN',v,async url=>{assert.match(url.pathname,/modelderivative\/v2\/designdata\/TEST_DERIVATIVE\/metadata/);return Response.json({data:{type:'metadata',metadata:[{guid:'TEST_VIEW',name:'TEST view',role:'3d'}]}});});
 assert.equal(views.views[0].id,'TEST_VIEW');
});
test('quantity storage: persistent project sharing, tenant isolation, duplicate prevention, conflicts and immutable history',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec(await readFile(new URL('../db/quantities.sql',import.meta.url),'utf8'));
  const tx=(actor,fn)=>db.transaction(async db=>{await db.exec('SET LOCAL ROLE ai_forma_quantities');await db.query("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true),set_config('app.user_id',$3,true)",[actor.organizationId,actor.projectId,actor.userId]);return fn(async(text,values=[])=>(await db.query(text,values)).rows);});
  const key=randomBytes(32),store=createQuantityStore(tx,key),config=await store.add(actor,'architecture');
  await assert.rejects(store.add(actor,'architecture'),/duplicate_specialty/);
  assert.equal((await store.workspace(actor)).configurations.length,1);
  assert.equal((await store.workspace({...actor,userId:'TEST_COLLEAGUE'})).configurations.length,1);
  for(const other of [{...actor,projectId:'TEST_OTHER'},{...actor,organizationId:'TEST_OTHER'}]){
   assert.equal((await store.workspace(other)).configurations.length,0);
   await assert.rejects(store.save(other,{id:config.id,revision:0,source:null,templateVersionId:null}),/not_found/);
  }
  const draft=await store.template(actor,{configurationId:config.id,name:'TEST DRAFT'});
  const draft2=await store.template(actor,{configurationId:config.id,name:'TEST DRAFT',templateId:draft.templateId});
  assert.equal(draft.configuration,null);assert.equal(draft2.version,2);assert.equal((await store.workspace(actor)).templates.length,2);
  const saved=await store.save(actor,{id:config.id,revision:0,source,templateVersionId:draft.id});assert.equal(saved.revision,1);
  const structure=await store.add(actor,'structure');
  const structureSource={...source,view:{...source.view,id:'TEST_STRUCTURE_VIEW',name:'TEST structure view'}};
  await store.save(actor,{id:structure.id,revision:0,source:structureSource,templateVersionId:null});
  const distinct=(await store.workspace(actor)).configurations;
  assert.equal(distinct.find(c=>c.id===config.id).source.view.id,'TEST_VIEW');
  assert.equal(distinct.find(c=>c.id===structure.id).source.view.id,'TEST_STRUCTURE_VIEW');
  await assert.rejects(store.save(actor,{id:structure.id,revision:1,source:structureSource,templateVersionId:draft.id}),/invalid_template/);
  await assert.rejects(store.save(actor,{id:config.id,revision:0,source:null,templateVersionId:null}),/configuration_conflict/);
  await assert.rejects(store.save(actor,{id:config.id,revision:1,source:{...source,scope:{...source.scope,projectId:'TEST_OTHER'}},templateVersionId:null}),/out_of_scope/);
  await assert.rejects(tx(actor,q=>q('UPDATE quantity_template_version SET version=9 WHERE id=$1',[draft.id])));
  // Insert a reviewed TEST-only template through the test admin connection; never product UI.
  const binding=id=>JSON.stringify(['quantities-v1',actor.organizationId,actor.projectId,id]);
  await db.query('INSERT INTO quantity_template_version(id,organization_id,project_id,specialty_code,template_id,version,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[template.id,actor.organizationId,actor.projectId,'architecture',template.templateId,1,encryptHistory(template,key,binding(template.id)),actor.userId]);
  const a={...run([row('TEST',10)]),quantitySourceId:config.id},b={...run([row('TEST',12)],2),quantitySourceId:config.id};
  await store.appendRun(actor,a);await store.appendRun(actor,b);assert.equal((await store.workspace(actor)).runs.length,2);
  await assert.rejects(tx(actor,q=>q('UPDATE quantity_run SET payload=$1 WHERE id=$2',['TEST_TAMPER',a.id])));
  await assert.rejects(db.query('DELETE FROM quantity_run WHERE id=$1',[a.id]),/quantity_history_is_immutable/);
  const raw=(await db.query('SELECT payload FROM quantity_run')).rows;assert.ok(raw.every(r=>!r.payload.includes('TEST')));
  const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='quantity_run'")).rows;
  assert.ok(!columns.some(c=>c.column_name==='expires_at'));
 }finally{await db.close();}
});
