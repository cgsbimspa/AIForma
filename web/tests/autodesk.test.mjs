import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readConfig, seal, unseal, begin, validState, trustedMutation, exchange, profile, SCOPE, TOKEN_URL, PROFILE_URL } from '../lib/autodesk/oauth.ts';

// TEST fixtures only. No real account, credentials or BIM data.
const config = readConfig({ APS_CLIENT_ID: 'TEST_CLIENT', APS_CLIENT_SECRET: 'TEST_SECRET', APS_CALLBACK_URL: 'https://test.example/api/autodesk/callback', AUTODESK_SESSION_SECRET: randomBytes(32).toString('hex') });
test('configuration fails closed and rejects unsafe callback origins', () => {
  assert.throws(() => readConfig({}));
  const env = { APS_CLIENT_ID: 'TEST', APS_CLIENT_SECRET: 'TEST', AUTODESK_SESSION_SECRET: randomBytes(32).toString('hex') };
  for (const url of ['http://example.com/api/autodesk/callback','https://user:pass@example.com/api/autodesk/callback','https://example.com/other']) assert.throws(() => readConfig({ ...env, APS_CALLBACK_URL: url }));
});
test('state is unpredictable, browser-bound, short lived and separate from session', () => {
  const a = begin(config), b = begin(config);
  const url = new URL(a.url), state = url.searchParams.get('state');
  assert.equal(url.searchParams.get('scope'), SCOPE);
  assert.equal(url.searchParams.get('redirect_uri'), config.callbackUrl);
  assert.ok(validState(a.cookie, state, config));
  assert.equal(validState(b.cookie, state, config), false);
  assert.equal(validState(undefined, state, config), false);
  assert.equal(validState(a.cookie, 'untrusted', config), false);
  assert.equal(unseal(a.cookie, config.key, 'session'), null);
  assert.equal(unseal(a.cookie, config.key, 'attempt', Date.now() + 601000), null);
});
test('session confidentiality, tampering, expiry, wrong keys and oversized cookies', () => {
  const token = 'TEST_ONLY_ACCESS_TOKEN';
  const cookie = seal({ kind: 'session', accessToken: token, expiresAt: Date.now() + 10000 }, config.key);
  assert.ok(!cookie.includes(token));
  assert.equal(unseal(cookie, config.key, 'session').accessToken, token);
  const tampered = Buffer.from(cookie, 'base64url'); tampered[30] ^= 1;
  assert.equal(unseal(tampered.toString('base64url'), config.key, 'session'), null);
  assert.equal(unseal(cookie, randomBytes(32), 'session'), null);
  assert.equal(unseal(cookie, config.key, 'session', Date.now() + 11000), null);
  assert.throws(() => seal({kind:'session', accessToken:'X'.repeat(6000), expiresAt:Date.now()+10000},config.key));
});
test('connection and logout require same-origin POST', () => {
  const req = (method, origin, site) => new Request(config.origin, { method, headers: { origin, 'sec-fetch-site': site } });
  assert.ok(trustedMutation(req('POST', config.origin, 'same-origin'), config));
  assert.equal(trustedMutation(req('GET', config.origin, 'same-origin'), config), false);
  assert.equal(trustedMutation(req('POST', 'https://evil.example', 'cross-site'), config), false);
  assert.equal(trustedMutation(req('POST', 'null', 'same-origin'), config), false);
});
test('authorization code exchanged only on server; refresh token never stored', async () => {
  let calls = 0;
  const session = await exchange(config, 'TEST_CODE', async (url, init) => {
    calls++; assert.equal(url, TOKEN_URL); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(new URLSearchParams(init.body).get('redirect_uri'), config.callbackUrl);
    assert.ok(init.headers.Authorization.startsWith('Basic '));
    return Response.json({ access_token:'TEST_TOKEN', refresh_token:'TEST_REFRESH', expires_in:7200, token_type:'Bearer', scope:SCOPE });
  });
  assert.equal(calls,1); assert.equal(session.accessToken,'TEST_TOKEN');
  assert.ok(session.expiresAt <= Date.now() + 3600000); assert.ok(!JSON.stringify(session).includes('TEST_REFRESH'));
});
test('OAuth rejects malformed tokens, wrong scope and provider errors without leaking secrets or retrying', async () => {
  for (const data of [{access_token:'TEST'}, {access_token:'TEST',token_type:'Bearer',expires_in:0}, {access_token:'TEST',token_type:'Bearer',expires_in:3600,scope:'data:write'}]) await assert.rejects(exchange(config,'TEST',async()=>Response.json(data)),/invalid_response/);
  let calls=0;
  await assert.rejects(exchange(config,'TEST',async()=>{calls++;return new Response('SECRET_PROVIDER_BODY',{status:400});}),/^Error: rejected$/);
  assert.equal(calls,1);
});
test('connected identity must come from validated Autodesk userinfo', async () => {
  const result = await profile('TEST_TOKEN', async (url,init) => {
    assert.equal(url,PROFILE_URL); assert.equal(init.headers.Authorization,'Bearer TEST_TOKEN');
    return Response.json({sub:'TEST_ID',name:'TEST USER',email:'test@example.invalid'});
  });
  assert.deepEqual(result,{id:'TEST_ID',name:'TEST USER'});
  for (const data of [{}, {name:'Invented without id'}, {sub:'TEST_ID',name:''}]) await assert.rejects(profile('TEST',async()=>Response.json(data)),/invalid_response/);
  await assert.rejects(profile('TEST',async()=>new Response(null,{status:401})),/rejected/);
  await assert.rejects(profile('TEST',async()=>{throw new Error('TEST_NETWORK');}),/unavailable/);
});
