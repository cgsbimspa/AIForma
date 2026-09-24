import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { renewOnce } from '../lib/autodesk/renewal.ts';
import { readConfig } from '../lib/autodesk/oauth.ts';
import { autodeskFetch, autodeskStatus } from '../lib/autodesk/client.ts';
import { ownerOf, packCursor, unpackCursor } from '../lib/search/cursor.ts';

// TEST-only synthetic credentials; no real accounts or documents.
test('concurrent renewal consumes a rotating token once, and transient errors remain retryable', async () => {
  const config=readConfig({APS_CLIENT_ID:'TEST',APS_CLIENT_SECRET:'TEST',APS_CALLBACK_URL:'https://test.example/api/autodesk/callback',AUTODESK_SESSION_SECRET:randomBytes(32).toString('hex')});
  const renewal={kind:'renewal',id:'TEST_SESSION',refreshToken:'TEST_CONCURRENT',expiresAt:Date.now()+10000};
  let calls=0;
  const fetcher=async()=>{calls++;return Response.json({access_token:'TEST_NEW',refresh_token:'TEST_ROTATED',expires_in:3600,token_type:'Bearer'});};
  const results=await Promise.all(Array.from({length:10},()=>renewOnce(config,renewal,fetcher)));
  assert.equal(calls,1);assert.ok(results.every(r=>r.session.id===renewal.id));
  const failing={...renewal,refreshToken:'TEST_FAILURE'};
  await assert.rejects(renewOnce(config,failing,async()=>new Response(null,{status:503})),/unavailable/);
  assert.equal((await renewOnce(config,failing,fetcher)).session.accessToken,'TEST_NEW');
});

test('client renews before data, retries authentication once, and does not replay failed AI operations', async(t)=>{
  const calls=[]; let dataCalls=0;
  t.mock.method(globalThis,'fetch',async(url)=>{
    calls.push(url);
    if(url.startsWith('/api/autodesk/refresh'))return Response.json({available:true});
    dataCalls++;return new Response(null,{status:dataCalls===1?401:200});
  });
  assert.equal((await autodeskFetch('/api/TEST')).status,200);
  assert.deepEqual(calls,['/api/autodesk/refresh','/api/TEST','/api/autodesk/refresh?force=1','/api/TEST']);
  t.mock.restoreAll();dataCalls=0;
  t.mock.method(globalThis,'fetch',async(url)=>{
    if(url.startsWith('/api/autodesk/refresh'))return Response.json({available:true});
    dataCalls++;return new Response(null,{status:503});
  });
  assert.equal((await autodeskFetch('/api/TEST')).status,503);assert.equal(dataCalls,1);
});

test('temporary renewal failure is not interpreted as logout; revoked renewal blocks data',async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:503}));
  await assert.rejects(autodeskStatus(),/unavailable/);
  t.mock.restoreAll();let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({error:'expired'},{status:401});});
  assert.equal((await autodeskFetch('/api/TEST')).status,401);assert.equal(calls,1);
});

test('search continuation remains session-bound across access token rotation',()=>{
  const key=randomBytes(32), sessionId='TEST_STABLE_SESSION';
  const state={schema:1,owner:ownerOf(sessionId),expiresAt:Date.now()+10000};
  const cursor=packCursor(state,key);
  assert.equal(unpackCursor(cursor,key,sessionId).owner,state.owner);
  assert.throws(()=>unpackCursor(cursor,key,'TEST_OTHER_SESSION'),/search_expired/);
  assert.throws(()=>unpackCursor(cursor,key,'TEST_NEW_ACCESS_TOKEN'),/search_expired/);
});
