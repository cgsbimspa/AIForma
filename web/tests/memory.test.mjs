import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes,randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createMemoryStore,cleanupExpired } from '../lib/memory/store.ts';
import { behavioralSignals,preferenceConfidence,encryptHistory,decryptHistory,reusableKnowledge } from '../lib/memory/domain.ts';

// TEST-only synthetic tenants; SQL runs in an actual PostgreSQL engine (PGlite).
test('persistent memory SQL: RLS isolation, encrypted history, learning thresholds, authorized knowledge, deletion and TTL',async()=>{
 const db=new PGlite();await db.waitReady;
 try {
  await db.exec(await readFile(new URL('../db/memory.sql',import.meta.url),'utf8'));
  const tx=(actor,fn)=>db.transaction(async db=>{
   await db.exec('SET LOCAL ROLE ai_forma_memory');
   await db.query("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true),set_config('app.user_id',$3,true)",[actor.organizationId,actor.projectId,actor.userId]);
   return fn(async(text,values=[]) => (await db.query(text,values)).rows);
  });
  const actor={organizationId:'TEST_ORG',projectId:'TEST_PROJECT',userId:'TEST_USER'},scope={kind:'project',hubId:'TEST_ORG',projectId:'TEST_PROJECT'},key=randomBytes(32),store=createMemoryStore(tx,key);
  const capture={scope,prompt:'agrupa por nivel',response:'TEST historical response',tool:'search',parameters:{scope},result:{TEST:'evidence',cursor:'TEST_SECRET_CURSOR'},action:'search',status:'success',duration:10};
  const {conversationId:id}=await store.capture(actor,capture);
  assert.equal((await store.list(actor,scope)).length,1);
  const messages=await store.messages(actor,scope,id);assert.equal(messages.messages[0].role,'user');assert.equal(messages.messages[0].content,'agrupa por nivel');assert.equal(messages.messages[1].role,'assistant');
  const raw=(await db.query('SELECT content FROM memory_message')).rows;assert.ok(raw.every(r=>!r.content.includes('agrupa')&&!r.content.includes('TEST historical')));
  const dates=(await db.query('SELECT extract(epoch FROM(expires_at-created_at)) AS seconds FROM memory_conversation')).rows;assert.equal(Number(dates[0].seconds),432000);
  for(const other of [{...actor,userId:'TEST_OTHER'},{...actor,organizationId:'TEST_OTHER'},{...actor,projectId:'TEST_OTHER'}]) {
   assert.equal((await store.list(other,scope)).length,0);await assert.rejects(store.messages(other,scope,id));await store.deleteConversation(other,scope,id);
  }
  assert.equal((await store.list(actor,scope)).length,1);
  const callId=randomUUID();await store.capture(actor,{...capture,conversationId:id,interactionId:callId});await store.capture(actor,{...capture,conversationId:id,interactionId:callId});
  assert.equal(Number((await store.preferences(actor)).find(p=>p.preference_key==='preferred_grouping').observations),2);
  for(let n=0;n<3;n++)await store.capture(actor,{...capture,conversationId:id});
  const pref=(await store.preferences(actor)).find(p=>p.preference_key==='preferred_grouping');assert.equal(pref.observations,5);assert.equal(pref.confidence,0.25);
  await assert.rejects(tx(actor,q=>q("INSERT INTO memory_user_preference(organization_id,user_id,preference_key,value,observations,confidence) VALUES($1,$2,'level_tolerance','25mm',1,1)",[actor.organizationId,actor.userId])));
  const [knowledge]=await store.proposeKnowledge(actor,{knowledge_type:'level_mapping',value:{TEST_N2:'TEST_Piso2'},document_id:'TEST_DOC',source_version:'TEST_V1'});
  await assert.rejects(store.transitionKnowledge(actor,knowledge.id,'VALIDATED'));
  await assert.rejects(store.transitionKnowledge(actor,knowledge.id,'SUGGESTED'),/forbidden/);
  await db.query('INSERT INTO memory_knowledge_validator VALUES($1,$2,$3)',[actor.organizationId,actor.projectId,actor.userId]);
  await store.transitionKnowledge(actor,knowledge.id,'SUGGESTED');await store.transitionKnowledge(actor,knowledge.id,'VALIDATED');
  const [validated]=await store.listKnowledge(actor);assert.equal(validated.status,'VALIDATED');assert.equal(validated.validated_by,actor.userId);
  assert.equal(reusableKnowledge(validated,1,'TEST_V2'),false);assert.equal(reusableKnowledge(validated,1,'TEST_V1'),true);
  assert.equal((await store.listKnowledge({...actor,projectId:'TEST_OTHER'})).length,0);
  await store.transitionKnowledge(actor,knowledge.id,'OBSOLETE');assert.equal((await store.listKnowledge(actor))[0].status,'OBSOLETE');
  // Simulate elapsed time in the TEST database; no product endpoint can set dates.
  await db.query("UPDATE memory_conversation SET created_at=created_at-interval '6 days',expires_at=expires_at-interval '6 days' WHERE id=$1",[id]);
  assert.equal((await store.list(actor,scope)).length,0);await assert.rejects(store.messages(actor,scope,id));
  await db.exec("UPDATE memory_platform_event SET created_at=created_at-interval '6 days',expires_at=expires_at-interval '6 days'");
  const maintenance=()=>db.transaction(async db=>{await db.exec('SET LOCAL ROLE ai_forma_retention');return cleanupExpired(async(text,values=[])=>(await db.query(text,values)).rows);});
  assert.equal((await maintenance()).conversationsDeleted,1);await maintenance();
  assert.equal((await db.query('SELECT count(*)::int AS n FROM memory_message')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM memory_tool_result')).rows[0].n,0);
  assert.equal(Number((await db.query('SELECT sum(observations) AS n FROM memory_platform_metric')).rows[0].n),5);
  assert.equal((await store.preferences(actor)).length,2);assert.equal((await store.listKnowledge(actor)).length,1);
  const {conversationId:another}=await store.capture(actor,capture);await store.deleteConversation(actor,scope,another);assert.equal((await store.list(actor,scope)).length,0);
  await store.resetPreferences(actor);assert.equal((await store.preferences(actor)).length,0);
 }finally{await db.close();}
});
test('behavior is conservative and cannot become technical knowledge',()=>{
 assert.deepEqual(behavioralSignals('agrupa por nivel'),[{key:'preferred_grouping',value:'level'}]);
 for(const text of ['no agrupa por nivel','N2 = Piso 2','tolerancia 25 mm','"agrupa por nivel"','El documento dice agrupa por nivel'])assert.deepEqual(behavioralSignals(text),[]);
 assert.equal(preferenceConfidence(1,1),0.05);assert.equal(preferenceConfidence(20,20),1);assert.equal(preferenceConfidence(5,20),0.25);
 assert.equal(reusableKnowledge({status:'SUGGESTED'},100),false);assert.equal(reusableKnowledge({status:'VALIDATED'},0),false);
});
test('history encryption is bound to tenant, user and record, and rejects tampering',()=>{
 const key=randomBytes(32),value=encryptHistory({content:'TEST PRIVATE'},key,'TEST_BINDING');assert.deepEqual(decryptHistory(value,key,'TEST_BINDING'),{content:'TEST PRIVATE'});
 assert.throws(()=>decryptHistory(value,key,'OTHER_USER'));assert.throws(()=>decryptHistory(value,randomBytes(32),'TEST_BINDING'));
 const tampered=Buffer.from(value,'base64');tampered[15]^=1;assert.throws(()=>decryptHistory(tampered.toString('base64'),key,'TEST_BINDING'));
});

test('project history finds other folders while restoring only their original scope',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec(await readFile(new URL('../db/memory.sql',import.meta.url),'utf8'));
  const tx=(actor,fn)=>db.transaction(async db=>{
   await db.exec('SET LOCAL ROLE ai_forma_memory');
   await db.query("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true),set_config('app.user_id',$3,true)",[actor.organizationId,actor.projectId,actor.userId]);
   return fn(async(text,values=[])=>(await db.query(text,values)).rows);
  });
  const actor={organizationId:'TEST_ORG',projectId:'TEST_PROJECT',userId:'TEST_USER'};
  const folder={kind:'folder',hubId:actor.organizationId,projectId:actor.projectId,folderIds:['TEST_FOLDER']};
  const file={...folder,kind:'file',itemId:'TEST_FILE'};
  const store=createMemoryStore(tx,randomBytes(32));
  const capture={scope:folder,prompt:'TEST pregunta carpeta',response:'TEST respuesta',tool:'browse',parameters:{},result:{},action:'browse',status:'success',duration:1};
  const first=await store.capture(actor,capture);
  const second=await store.capture(actor,{...capture,scope:file,prompt:'TEST pregunta archivo'});
  const list=await store.listProject(actor);
  assert.equal(list.length,2);assert.equal(list.find(row=>row.id===second.conversationId).title,'TEST pregunta archivo');
  assert.deepEqual(list.find(row=>row.id===second.conversationId).scope,file);
  assert.equal((await store.messages(actor,file,second.conversationId)).messages.length,2);
  await assert.rejects(store.messages(actor,folder,second.conversationId));
  for(const other of [{...actor,userId:'TEST_OTHER'},{...actor,projectId:'TEST_OTHER'},{...actor,organizationId:'TEST_OTHER'}])assert.equal((await store.listProject(other)).length,0);
  await db.query("UPDATE memory_conversation SET created_at=created_at-interval '6 days',expires_at=expires_at-interval '6 days' WHERE id=$1",[first.conversationId]);
  assert.equal((await store.listProject(actor)).length,1);
 }finally{await db.close();}
});
