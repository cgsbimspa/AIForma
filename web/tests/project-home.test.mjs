import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createProjectReader} from '../lib/projects/store.ts';
import {summarizeProject} from '../lib/projects/summary.ts';
import {encryptHistory} from '../lib/memory/domain.ts';
import {ProjectSession,projectSessionKey,readProjectCursor} from '../lib/project-session.ts';

// TEST ONLY data, unrelated to technical measurements of Centro Español.
const scope={kind:'project',hubId:'TEST_COMPANY',projectId:'TEST_PROJECT'};
const now='2026-10-01T12:00:00.000Z';
const source={scope:{...scope,kind:'file',folderIds:['TEST_FOLDER'],itemId:'TEST_ITEM'},projectName:'TEST project',fileName:'TEST.rvt',path:'TEST / TEST.rvt',version:{id:'TEST_V1',number:1,name:'TEST.rvt',createdAt:now,modelId:'TEST_URN',webUrl:null,endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now},view:{id:'TEST_VIEW',name:'TEST view',role:'3d',endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now},versionPolicy:'manual'};
const available=(module,sources=[])=>({module,state:'AVAILABLE',data:{module,runs:0,configurations:sources.length,latestAt:null,sources}});

test('Centro Español verified project identity survives module changes without crossing user/company/project boundaries',async()=>{
  const benchmark=JSON.parse(await readFile(new URL('./fixtures/centro-espanol.json',import.meta.url),'utf8'));
  const cursor={owner:'TEST_SESSION_OWNER',hubId:benchmark.company.id,projectId:benchmark.project.id};
  assert.deepEqual(readProjectCursor(JSON.stringify(cursor),cursor.owner),{hubId:benchmark.company.id,projectId:benchmark.project.id});
  assert.equal(readProjectCursor(JSON.stringify(cursor),'TEST_OTHER_USER'),null);
  const session=new ProjectSession(),key=slot=>projectSessionKey(cursor.owner,cursor.hubId,cursor.projectId,slot);
  session.set(key('audit.workspace'),{marker:'TEST_UI_STATE_ONLY'});
  session.set(key('quantity.workspace'),{marker:'TEST_QUANTITY_UI_ONLY'});
  assert.equal(session.get(key('audit.workspace'),()=>null).marker,'TEST_UI_STATE_ONLY');
  assert.equal(session.get(projectSessionKey(cursor.owner,cursor.hubId,'TEST_OTHER_PROJECT','audit.workspace'),()=>null),null);
  assert.equal(session.get(projectSessionKey(cursor.owner,'TEST_OTHER_COMPANY',cursor.projectId,'audit.workspace'),()=>null),null);
  assert.equal(benchmark.technicalBaseline,null,'identity fixture does not pretend to validate BIM quantities');
});

test('project overview deduplicates files but preserves module/version/view provenance',()=>{
  const result=summarizeProject(scope,[available('audit',[source]),available('coordination',[source]),available('quantities',[source,source,{...source,version:{...source.version,id:'TEST_V2',number:2}}])],now);
  assert.equal(result.modelCount,1);assert.equal(result.models[0].references.length,4);
  assert.equal(result.models[0].references.filter(r=>r.version===2).length,1);
  assert.equal(result.criticalErrors.value,null);assert.equal(result.issues.value,null);
  assert.equal(result.state,'AVAILABLE');
});
test('missing storage remains unknown, while a verified empty history is zero',()=>{
  const result=summarizeProject(scope,[available('audit'),{module:'coordination',state:'NOT_AVAILABLE'},available('quantities',[source])],now);
  assert.equal(result.modelCount,null);assert.equal(result.models.length,1);
  assert.equal(result.modules[0].runs,0);assert.equal(result.modules[1].runs,null);assert.equal(result.state,'PARTIAL');
  assert.throws(()=>summarizeProject({...scope,projectId:'TEST_OTHER'},[available('audit',[source])],now),/out_of_scope/);
  assert.throws(()=>summarizeProject(scope,[{...available('audit'),data:{...available('audit').data,runs:-1}}],now),/invalid_project_summary/);
});
test('overview repository reads only project references and aggregate counts under actual RLS policies',async()=>{
  const db=new PGlite(),key=randomBytes(32);await db.waitReady;
  try{
    for(const file of ['audit','coordination','quantities'])await db.exec(await readFile(new URL(`../db/${file}.sql`,import.meta.url),'utf8'));
    const actor={organizationId:scope.hubId,projectId:scope.projectId,userId:'TEST_USER'};
    const transaction=role=>(a,fn)=>db.transaction(async sql=>{
      await sql.exec(`SET LOCAL ROLE ${role}`);
      await sql.query("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true),set_config('app.user_id',$3,true)",[a.organizationId,a.projectId,a.userId]);
      return fn(async(text,values=[])=>{
        assert.ok(!/SELECT\s+\*\s+FROM\s+quantity_run/i.test(text),'must not read large run payloads');
        return (await sql.query(text,values)).rows;
      });
    });
    const reader=createProjectReader({audit:transaction('ai_forma_audit'),coordination:transaction('ai_forma_audit'),quantities:transaction('ai_forma_quantities')},key);
    const id=randomUUID(),config={id,specialtyCode:'structure',source,templateVersionId:null,revision:1,createdAt:now,updatedAt:now,updatedBy:actor.userId};
    const payload=encryptHistory(config,key,JSON.stringify(['quantities-v1',actor.organizationId,actor.projectId,id]));
    await db.query('INSERT INTO quantity_configuration(id,organization_id,project_id,specialty_code,payload,updated_by) VALUES($1,$2,$3,$4,$5,$6)',[id,actor.organizationId,actor.projectId,'structure',payload,actor.userId]);
    // Sentinel deliberately cannot be decrypted: aggregate must never load a run body.
    await db.query("INSERT INTO audit_record(id,organization_id,project_id,kind,revision,payload,label,created_by) VALUES($1,$2,$3,'run',1,'TEST_SENTINEL','TEST', $4)",[randomUUID(),actor.organizationId,actor.projectId,actor.userId]);
    const quantity=await reader(actor,'quantities');assert.equal(quantity.configurations,1);assert.deepEqual(quantity.sources,[source]);
    assert.equal((await reader(actor,'audit')).runs,1);
    for(const other of [{...actor,projectId:'TEST_OTHER'},{...actor,organizationId:'TEST_OTHER'}]){
      assert.equal((await reader(other,'quantities')).sources.length,0);
      assert.equal((await reader(other,'audit')).runs,0);
    }
  }finally{await db.close();}
});
