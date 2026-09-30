import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectSession,projectSessionKey,readProjectCursor} from '../lib/project-session.ts';
import {specialtyState} from '../lib/quantities/specialty-state.ts';
// Synthetic TEST ONLY UI cursors, never project/BIM data.
test('UI session isolates users, accounts, projects and modules; A survives a visit to B',()=>{
 const cache=new ProjectSession(),key=(user,project,slot='board')=>projectSessionKey(user,'TEST_HUB',project,slot);
 cache.set(key('TEST_U1','TEST_A'),{selected:'TEST_STRUCTURE'});
 cache.set(key('TEST_U1','TEST_B'),{selected:'TEST_MEP'});
 assert.equal(cache.get(key('TEST_U1','TEST_A'),()=>null).selected,'TEST_STRUCTURE');
 assert.equal(cache.get(key('TEST_U2','TEST_A'),()=>null),null);
 assert.equal(cache.get(key('TEST_U1','TEST_A','audit'),()=>null),null);
 cache.clear();assert.equal(cache.get(key('TEST_U1','TEST_A'),()=>null),null);
});
test('restoration uses the authenticated owner and rejects malformed cursors',()=>{
 const raw=JSON.stringify({owner:'TEST_USER',hubId:'TEST_HUB',projectId:'TEST_PROJECT'});
 assert.deepEqual(readProjectCursor(raw,'TEST_USER'),{hubId:'TEST_HUB',projectId:'TEST_PROJECT'});
 assert.equal(readProjectCursor(raw,'TEST_OTHER'),null);assert.equal(readProjectCursor('{','TEST_USER'),null);
});
test('session TTL remains bounded at five days and never promotes an old result to another view',t=>{
 t.mock.timers.enable({apis:['Date'],now:1000});const cache=new ProjectSession();cache.set('TEST',42);
 t.mock.timers.tick(5*86400000+1);assert.equal(cache.get('TEST',()=>null),null);
 const c={revision:1,enabled:true,templateVersionId:'TEST',source:{version:{id:'TEST_V1'},view:{id:'TEST_3D'}}};
 assert.equal(specialtyState(c,undefined,{configurationRevision:1,versionId:'TEST_V2',viewId:'TEST_3D'}).code,'ready');
 assert.equal(specialtyState(c,undefined,{configurationRevision:1,versionId:'TEST_V1',viewId:'TEST_OTHER'}).code,'ready');
 assert.equal(specialtyState(c,undefined,{configurationRevision:1,versionId:'TEST_V1',viewId:'TEST_3D'}).code,'processed');
 assert.equal(specialtyState({...c,enabled:false}).code,'inactive');
 assert.equal(specialtyState(undefined).code,'unconfigured');
});
