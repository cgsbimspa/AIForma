import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createProjectRegistry} from '../lib/projects/registry.ts';
import {createConfigurationStore} from '../lib/projects/configuration-store.ts';
import {createExecutionCache,executionKey} from '../lib/projects/execution-cache.ts';
import {moduleForPath} from '../lib/projects/modules.ts';
// TEST fixtures, never production project data.
const actor={organizationId:'TEST_HUB',projectId:'TEST_PROJECT',userId:'TEST_USER'};
const source={scope:{kind:'file',hubId:actor.organizationId,projectId:actor.projectId,folderIds:['TEST_FOLDER'],itemId:'TEST_FILE'},version:{id:'TEST_VERSION',number:1},view:{id:'TEST_VIEW'}};
test('module routing keeps configuration in its owning module',()=>{
 for(const [path,id] of [['/auditoria-bim/grillas','audit'],['/configuracion/audit','audit'],['/cubicaciones','quantities'],['/control-documental','documents'],['/configuracion/documents','documents'],['/chat-bim','assistant']])assert.equal(moduleForPath(path),id);
 assert.equal(moduleForPath('/'),null);assert.equal(moduleForPath('/configuracion/unknown'),null);
});
test('execution reuse includes tenant, version, view, rules, engine and configuration',()=>{
 const key=(s=source,c={revision:1},r={rule:1},e='TEST_ENGINE')=>executionKey('audit',s,c,r,e);
 assert.equal(key(),key({...source,version:{...source.version,fetchedAt:'later'}}));
 for(const s of [{...source,scope:{...source.scope,projectId:'OTHER'}},{...source,scope:{...source.scope,hubId:'OTHER'}},{...source,view:{id:'OTHER'}},{...source,version:{id:'OTHER'}}])assert.notEqual(key(),key(s));
 assert.notEqual(key(),key(source,{revision:2}));assert.notEqual(key(),key(source,{revision:1},{rule:2}));assert.notEqual(key(),key(source,{revision:1},{rule:1},'NEW_ENGINE'));
 assert.equal(executionKey('audit',source,{a:1,b:2},{},'v'),executionKey('audit',source,{b:2,a:1},{},'v'));
});
test('one Autodesk project, independent module revisions, scoped references and isolated result cache',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
 await db.exec('CREATE ROLE ai_forma_quantities NOLOGIN');
 for(const name of ['projects.sql','project-context.sql'])await db.exec(await readFile(new URL('../db/'+name,import.meta.url),'utf8'));
 const tx=(a,fn)=>db.transaction(async sql=>{await sql.exec('SET LOCAL ROLE ai_forma_projects');await sql.query("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true),set_config('app.user_id',$3,true)",[a.organizationId,a.projectId,a.userId]);return fn(async(t,v=[])=>(await sql.query(t,v)).rows);});
 const registry=createProjectRegistry(tx),first=await registry.enter(actor,'TEST name'),again=await registry.enter(actor,'TEST renamed');
 assert.equal(first.id,again.id);assert.equal(again.name,'TEST renamed');
 const other=await registry.enter({...actor,projectId:'OTHER'},'TEST renamed');assert.notEqual(first.id,other.id);
 const key=randomBytes(32),audit=createConfigurationStore(tx,key,'audit'),quantities=createConfigurationStore(tx,key,'quantities'),documents=createConfigurationStore(tx,key,'documents');
 const draft={revision:0,projectName:'TEST',disciplines:[{id:randomUUID(),code:'structure',name:'TEST structure',enabled:true,source:null,lastValidatedAt:null}]};
 const a=await audit.save(actor,draft),q=await quantities.save(actor,draft);
 await audit.save(actor,{...draft,revision:1,disciplines:[]});assert.equal((await quantities.read(actor)).revision,1);assert.deepEqual((await quantities.read(actor)).disciplines,q.disciplines);
 assert.equal((await audit.read(actor)).revision,2);assert.equal(await audit.read({...actor,projectId:'OTHER'}),null);
 await assert.rejects(()=>audit.save(actor,draft),/configuration_conflict/);
 const ref={scope:{kind:'folder',hubId:actor.organizationId,projectId:actor.projectId,folderIds:['TEST_FOLDER']},label:'TEST folder'};
 await documents.save(actor,{revision:0,projectName:'TEST',disciplines:[],documents:[ref]});assert.deepEqual((await documents.read(actor)).documents,[ref]);
 await assert.rejects(()=>documents.save(actor,{revision:1,projectName:'TEST',disciplines:[],documents:[{...ref,scope:{...ref.scope,projectId:'OTHER'}}]}),/out_of_scope/);
 assert.equal(await createConfigurationStore(tx,key).read(actor),null); // no writes to legacy global config
 const cache=createExecutionCache(tx),id=randomUUID();await cache.save(actor,'audit','TEST_KEY',id);assert.equal(await cache.read(actor,'audit','TEST_KEY'),id);assert.equal(await cache.read(actor,'quantities','TEST_KEY'),null);assert.equal(await cache.read({...actor,projectId:'OTHER'},'audit','TEST_KEY'),null);
 await assert.rejects(()=>db.exec('DELETE FROM project_module_configuration'),/immutable/);
 assert.equal(a.revision,1);
 }finally{await db.close();}
});
