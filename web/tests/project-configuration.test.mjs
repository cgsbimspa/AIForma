import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createConfigurationStore} from '../lib/projects/configuration-store.ts';
import {configurationInput,activeDiscipline,auditDiscipline,sourceIdentity,availableDisciplines,selectableDiscipline,sourceInProject} from '../lib/projects/configuration.ts';
import {projectIntent} from '../lib/projects/intent.ts';
import {snapshotState,validateCapture,createSnapshotStore} from '../lib/projects/snapshots.ts';
import {calculateQuantities,defaultSettings} from '../public/quantity-v2/quantity-service.js';
// TEST-ONLY fixtures; no technical measurements of a real project.
const actor={organizationId:'TEST_HUB',projectId:'TEST_PROJECT',userId:'TEST_USER'},now='2026-10-01T12:00:00.000Z';
const source={scope:{kind:'file',hubId:actor.organizationId,projectId:actor.projectId,folderIds:['TEST_FOLDER'],itemId:'TEST_ITEM'},projectName:'TEST project',fileName:'TEST.rvt',path:'TEST / TEST.rvt',version:{id:'TEST_V1',number:1,name:'TEST.rvt',createdAt:now,modelId:'TEST_URN',webUrl:null,endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now},view:{id:'TEST_VIEW',name:'TEST view',role:'3d',endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now},versionPolicy:'manual'};
const discipline=()=>({id:randomUUID(),code:'structure',name:'Estructura TEST',enabled:true,source,lastValidatedAt:now});
test('adding a discipline uses an available selection after structure is recovered; MEP is not a discipline',()=>{
 const rows=[discipline()];assert.equal(selectableDiscipline('structure',rows),'architecture');
 assert.equal(selectableDiscipline('cold-water',rows),'cold-water');
 const options=availableDisciplines(rows);assert.ok(!options.some(d=>d.code==='mep'));
 for(const code of ['architecture','sewer','cold-water','hot-water','ventilation','hvac','electricity'])assert.ok(options.some(d=>d.code===code));
 assert.equal(selectableDiscipline('',options),'structure');
 assert.equal(selectableDiscipline('custom',rows),'custom');
 assert.ok(configurationInput.safeParse({revision:0,projectName:'TEST',disciplines:[{...discipline(),source:null,lastValidatedAt:null}]}).success);
});
test('legacy sources must match both company and project, regardless of matching names',()=>{
 const scope={hubId:actor.organizationId,projectId:actor.projectId};assert.ok(sourceInProject(source,scope));
 assert.equal(sourceInProject({...source,scope:{...source.scope,projectId:'OTHER'}},scope),false);
 assert.equal(sourceInProject({...source,scope:{...source.scope,hubId:'OTHER'}},scope),false);
 assert.equal(sourceInProject(null,scope),false);
});
test('central discipline selection never chooses among ambiguous sources or infers unsupported engineering families',()=>{
 const a=discipline(),b={...discipline(),code:'sewer'};assert.equal(activeDiscipline({disciplines:[a,b]},''),null);assert.equal(activeDiscipline({disciplines:[a,b]},b.id),b);assert.equal(activeDiscipline({disciplines:[a,{...b,enabled:false}]},''),a);assert.equal(auditDiscipline('landscape'),null);assert.equal(auditDiscipline('structure'),'ESTRUCTURA');
 assert.equal(configurationInput.safeParse({revision:0,projectName:'TEST',disciplines:[a,a]}).success,false);
 assert.notEqual(sourceIdentity(source),sourceIdentity({...source,scope:{...source.scope,projectId:'OTHER'}}));
});
test('project intent routes language without turning it into a technical conclusion',()=>{
 for(const [q,expected] of [['MUÉSTRAME los hormigones','MODEL_ACTION'],['Busca el informe PDF','DOCUMENT_QUERY'],['Propiedades de las vigas','DATA_QUERY'],['Cuál es el volumen de hormigón','QUANTITY_QUERY'],['Última auditoría','AUDIT_QUERY'],['Revisión normativa RIDAA','REGULATION_QUERY'],['Incidencias del proyecto','ISSUE_QUERY'],['Ayúdame con esto',null]])assert.equal(projectIntent(q),expected);
});
test('project configuration uses append-only history, optimistic conflicts and tenant RLS',async()=>{
 const db=new PGlite(),key=randomBytes(32);await db.waitReady;try{
  await db.exec('CREATE ROLE ai_forma_quantities NOLOGIN');await db.exec(await readFile(new URL('../db/projects.sql',import.meta.url),'utf8'));
  const tx=(a,fn)=>db.transaction(async sql=>{await sql.exec('SET LOCAL ROLE ai_forma_projects');await sql.query("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true),set_config('app.user_id',$3,true)",[a.organizationId,a.projectId,a.userId]);return fn(async(t,v=[])=> (await sql.query(t,v)).rows);});
  const store=createConfigurationStore(tx,key),d=discipline(),first=await store.save(actor,{revision:0,projectName:'TEST',disciplines:[d]});
  assert.equal(first.revision,1);assert.deepEqual(await store.read(actor),first);
  await assert.rejects(()=>store.save(actor,{revision:0,projectName:'TEST',disciplines:[d]}),/configuration_conflict/);
  const second=await store.save(actor,{revision:1,projectName:'TEST',disciplines:[{...d,enabled:false}]});assert.equal(second.revision,2);assert.equal(second.configuredAt,first.configuredAt);
  assert.equal(await store.read({...actor,projectId:'OTHER'}),null);assert.equal(await store.read({...actor,organizationId:'OTHER'}),null);
  await assert.rejects(()=>store.save(actor,{revision:2,projectName:'TEST',disciplines:[{...d,source:{...source,scope:{...source.scope,projectId:'OTHER'}}}]}),/out_of_scope/);
  assert.equal((await db.query('SELECT count(*) AS n FROM project_configuration')).rows[0].n,2);
  await assert.rejects(()=>db.query('DELETE FROM project_configuration'),/immutable/);
  const binding={projectId:actor.projectId,itemId:source.scope.itemId,versionId:source.version.id,versionNumber:1,urn:source.version.modelId,viewId:source.view.id,fileName:source.fileName,viewName:source.view.name,projectName:source.projectName};
  const data=calculateQuantities([],binding,defaultSettings());assert.equal(validateCapture(data,source).coverage.inspected,0);
  assert.throws(()=>validateCapture(data,{...source,version:{...source.version,id:'TEST_V2'}}),/capture_source_mismatch/);
  const captures=createSnapshotStore(tx,key),saved=await captures.save(actor,source,'structure',2,data,'TEST_COMPRESSED_PLACEHOLDER');
  assert.equal(saved.origin,'VIEWER_CAPTURE');assert.equal((await captures.save(actor,source,'structure',2,data,'TEST_COMPRESSED_PLACEHOLDER')).id,saved.id);
  assert.equal((await captures.list(actor)).runs.length,1);assert.equal((await captures.list({...actor,projectId:'OTHER'})).runs.length,0);assert.equal(await captures.read({...actor,organizationId:'OTHER'},saved.id),null);
  assert.equal(snapshotState(saved,source),'NOT_VERIFIED');assert.equal(snapshotState(saved,source,source.version.id),'CURRENT');assert.equal(snapshotState(saved,source,'TEST_V2'),'OUTDATED');assert.equal(snapshotState(saved,{...source,view:{...source.view,id:'OTHER'}},source.version.id),'OUTDATED');
 }finally{await db.close();}
});
