import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createQuantityStore} from '../lib/quantities/store.ts';
import {encryptHistory} from '../lib/memory/domain.ts';
import {processingBlocker} from '../lib/quantities/engine.ts';

// TEST actors and fixtures only. No model quantities are generated.
test('Cálculo defaults persist once, preserve selections, isolate projects and repair legacy configurations',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec(await readFile(new URL('../db/quantities.sql',import.meta.url),'utf8'));
  const tx=(actor,fn)=>db.transaction(async sql=>{await sql.exec('SET LOCAL ROLE ai_forma_quantities');await sql.query("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true),set_config('app.user_id',$3,true)",[actor.organizationId,actor.projectId,actor.userId]);return fn(async(text,values=[])=>(await sql.query(text,values)).rows);});
  const key=randomBytes(32),store=createQuantityStore(tx,key);
  const actor={organizationId:'TEST_ORG',projectId:'TEST_PROJECT',userId:'TEST_USER'};
  const added=await store.add(actor,'structure');
  assert.ok(added.templateVersionId);
  let workspace=await store.workspace(actor);
  const base=workspace.templates[0];
  assert.equal(base.id,added.templateVersionId);
  assert.equal(base.name,'Cálculo base');
  assert.equal(base.configuration,null);
  assert.deepEqual(base.baseDefinition.metrics.map(m=>[m.name,m.unit]),[['Hormigón','m³'],['Moldaje','m²'],['Fe','kg'],['Acero Galvanizado','ml']]);
  assert.deepEqual(base.baseDefinition.groupings,['Subespecialidad','Nombre de Tipo','Piso']);
  assert.match(processingBlocker({...added,source:{view:{id:'TEST'}}},base),/no tiene reglas/);
  await Promise.all([store.prepareTemplates(actor),store.prepareTemplates(actor)]);
  workspace=await store.workspace(actor);
  assert.equal(workspace.templates.length,1);assert.deepEqual(workspace.configurations[0],added);
  const next=await store.template(actor,{configurationId:added.id,name:'TEST next version',templateId:base.templateId});
  await store.prepareTemplates(actor);
  assert.equal((await store.workspace(actor)).configurations[0].templateVersionId,base.id);
  await store.save(actor,{id:added.id,revision:added.revision,source:null,templateVersionId:null});
  await store.prepareTemplates(actor);
  let current=(await store.workspace(actor)).configurations[0];
  assert.equal(current.templateVersionId,next.id);
  await store.template(actor,{configurationId:added.id,name:'TEST another family'});
  await store.save(actor,{id:current.id,revision:current.revision,source:null,templateVersionId:null});
  await store.prepareTemplates(actor);
  assert.equal((await store.workspace(actor)).configurations[0].templateVersionId,null);
  for(const other of [{...actor,projectId:'TEST_OTHER_PROJECT'},{...actor,organizationId:'TEST_OTHER_ORG'}]){
   const otherConfig=await store.add(other,'structure');
   assert.notEqual(otherConfig.templateVersionId,base.id);
   assert.equal((await store.workspace(other)).templates.length,1);
  }
  const legacyActor={...actor,projectId:'TEST_LEGACY'},now=new Date().toISOString();
  const legacy={id:randomUUID(),specialtyCode:'structure',source:null,templateVersionId:null,revision:0,createdAt:now,updatedAt:now,updatedBy:actor.userId};
  const payload=encryptHistory(legacy,key,JSON.stringify(['quantities-v1',legacyActor.organizationId,legacyActor.projectId,legacy.id]));
  await db.query('INSERT INTO quantity_configuration(id,organization_id,project_id,specialty_code,payload,updated_by) VALUES($1,$2,$3,$4,$5,$6)',[legacy.id,legacyActor.organizationId,legacyActor.projectId,legacy.specialtyCode,payload,actor.userId]);
  await store.prepareTemplates(legacyActor);
  const fixed=await store.workspace(legacyActor);
  assert.equal(fixed.templates.length,1);assert.equal(fixed.configurations[0].templateVersionId,fixed.templates[0].id);
  assert.equal((await store.add(legacyActor,'architecture')).templateVersionId,null);
  const mep=await store.add(actor,'mep');
  const mepWorkspace=await store.workspace(actor),mepTemplate=mepWorkspace.templates.find(t=>t.id===mep.templateVersionId);
  assert.equal(mepTemplate.baseDefinition.code,'mep-base');assert.equal(mepTemplate.name,'MEP · Instalaciones');
  assert.deepEqual(mepTemplate.baseDefinition.metrics.map(m=>m.unit),['ml','un','m²']);
  await store.prepareTemplates(actor);assert.equal((await store.workspace(actor)).templates.filter(t=>t.specialtyCode==='mep').length,1);
  assert.equal((await store.workspace({...actor,projectId:'TEST_MEP_OTHER'})).templates.length,0);
 }finally{await db.close();}
});
