import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createQuantityStore} from '../lib/quantities/store.ts';
import {defaultSettings} from '../public/quantity-v2/quantity-service.js';
// TEST fixtures only. This database is ephemeral and independent of Autodesk.
test('v2 criteria persist encrypted and remain bound to project/version/view with revision checks',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
 await db.exec(await readFile(new URL('../db/quantities.sql',import.meta.url),'utf8'));
 const tx=(actor,fn)=>db.transaction(async sql=>{await sql.exec('SET LOCAL ROLE ai_forma_quantities');await sql.query("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true),set_config('app.user_id',$3,true)",[actor.organizationId,actor.projectId,actor.userId]);return fn(async(text,values=[])=>(await sql.query(text,values)).rows);});
 const actor={organizationId:'TEST_ORG',projectId:'TEST_PROJECT',userId:'TEST_USER'},store=createQuantityStore(tx,randomBytes(32)),config=await store.add(actor,'structure'),now=new Date().toISOString();
 const source={scope:{kind:'file',hubId:actor.organizationId,projectId:actor.projectId,folderIds:['TEST_FOLDER'],itemId:'TEST_FILE'},projectName:'TEST project',fileName:'TEST.rvt',path:'TEST / TEST.rvt',version:{id:'TEST_VERSION_1',number:1,name:'TEST.rvt',createdAt:now,modelId:'TEST_DERIVATIVE',webUrl:null,endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now},view:{id:'TEST_VIEW',name:'TEST view',role:'3d',endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now},versionPolicy:'manual'};
 const settings={...defaultSettings(),levelToleranceM:.001,levelBinding:{urn:'TEST_DERIVATIVE',viewId:'TEST_VIEW'},manualFloors:[{dbId:1,label:'TEST_VALIDATED_FLOOR'}],foundationFaces:[{dbId:2,confirmed:true}],rebarWeightTable:[{diameter:12,unit_weight_kg_m:.5,source:'TEST_ONLY_NOT_NORMATIVE',version:'TEST_1'}]};
 const saved=await store.save(actor,{id:config.id,revision:config.revision,source,templateVersionId:config.templateVersionId,calculationSettings:settings});assert.deepEqual(saved.calculationSettings,settings);
 assert.deepEqual((await store.workspace(actor)).configurations[0].calculationSettings,settings);
 const raw=(await db.query('SELECT payload FROM quantity_configuration')).rows;assert.ok(raw.every(r=>!r.payload.includes('TEST_VALIDATED_FLOOR')));
 assert.equal((await store.workspace({...actor,projectId:'TEST_OTHER'})).configurations.length,0);
 await assert.rejects(store.save(actor,{id:config.id,revision:config.revision,source,templateVersionId:config.templateVersionId,calculationSettings:settings}),/configuration_conflict/);
 await assert.rejects(store.save(actor,{id:config.id,revision:saved.revision,source:{...source,version:{...source.version,modelId:'TEST_OTHER_DERIVATIVE'}},templateVersionId:config.templateVersionId,calculationSettings:settings}),/out_of_scope/);
 await assert.rejects(store.save(actor,{id:config.id,revision:saved.revision,source,templateVersionId:config.templateVersionId,calculationSettings:{...settings,rebarWeightTable:[{diameter:12,unit_weight_kg_m:2,source:'',version:''}]}}));
 }finally{await db.close();}
});
