import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceSearch } from '../lib/search/engine.ts';
import { createDocumentReader } from '../lib/documents/reader.ts';
import { literalSearch, planSearch } from '../lib/search/plan.ts';

// Synthetic TEST fixtures, never production project data.
const state = () => ({schema:1,stage:'files',owner:'TEST',expiresAt:Date.now()+60000,scope:{kind:'project',hubId:'TEST_H',projectId:'TEST_P'},terms:[['test']],queue:Array.from({length:8},(_,n)=>({kind:'list',query:{operation:'contents',hubId:'TEST_H',projectId:'TEST_P',folderId:`TEST_F${n}`,page:0},path:`TEST / ${n}`,project:'TEST'})),seen:[],warnings:[],stats:{folders:0,files:0,documentsRead:0,unread:0,matched:0,requests:0},startedAt:new Date().toISOString()});
test('metadata uses at most four parallel requests, retains every result and respects step limits',async(t)=>{
  let active=0,peak=0;
  const fetcher=async url=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,40));active--;const id=new URL(url).pathname.split('/').at(-2);return Response.json({data:[{type:'items',id,attributes:{name:`TEST ${id}`},links:{webView:{href:'https://acc.autodesk.com/TEST'}}}]});};
  const serialStart=performance.now();for(let i=0;i<8;i++)await fetcher(`https://test.invalid/${i}/contents`);const serial=performance.now()-serialStart;
  peak=0;const started=performance.now();const result=await advanceSearch(state(),'TEST',undefined,{fetcher});const parallel=performance.now()-started;
  assert.equal(peak,4);assert.equal(result.hits.length,8);assert.equal(result.stats.files,8);assert.equal(result.done,true);assert.equal(new Set(result.hits.map(h=>h.key)).size,8);
  t.diagnostic(`TEST eight 40ms listings: serial ${serial.toFixed(0)}ms, parallel ${parallel.toFixed(0)}ms; peak ${peak}`);
  peak=0;const bounded=await advanceSearch(state(),'TEST',undefined,{fetcher,steps:1});assert.equal(peak,1);assert.equal(bounded.stats.requests,1);assert.equal(bounded.pending,7);
});
test('a failed parallel listing remains partial and a rate-limited task stays pending',async()=>{
  const result=await advanceSearch(state(),'TEST',undefined,{fetcher:async url=>new URL(url).pathname.includes('TEST_F0')?new Response(null,{status:429}):Response.json({data:[]})});
  assert.equal(result.done,false);assert.ok(result.warnings.includes('rate_limited'));assert.equal(result.stats.requests,4);assert.equal(result.pending,5);
  const fileState=state();fileState.stage='content';fileState.queue=[{kind:'file',hubId:'TEST_H',projectId:'TEST_P',project:'TEST',entry:{id:'TEST_ITEM',name:'TEST.txt',type:'items'},path:'TEST / TEST.txt',endpoint:'TEST',fetchedAt:new Date().toISOString(),nameHit:false}];
  const fileResult=await advanceSearch(fileState,'TEST',undefined,{fetcher:async()=>new Response(null,{status:429})});
  assert.equal(fileResult.pending,1);assert.equal(fileResult.stats.unread,0);assert.equal(fileResult.done,false);assert.ok(fileResult.warnings.includes('rate_limited'));
});
const version={id:'TEST_V1',number:1,name:'TEST.txt',endpoint:'https://developer.api.autodesk.com/TEST_PROJECT/TEST_ITEM/tip',fetchedAt:new Date().toISOString(),storage:'urn:adsk.objects:os.object:TEST_BUCKET/TEST_FILE'};
test('version-bound reader reuses download and parsing, isolates users/versions/pages, expires and returns independent evidence',async()=>{
  let time=0,downloads=0,parses=0;
  const read=createDocumentReader({now:()=>time,ttl:1000,fetcher:async url=>{if(new URL(url).hostname==='test.s3.amazonaws.com'){downloads++;return new Response('TEST');}return Response.json({status:'complete',url:'https://test.s3.amazonaws.com/TEST'});},parser:async(_bytes,_name,_signal,{startPage})=>{parses++;return {status:'parsed',textlessPages:0,segments:[{text:'TEST evidence',location:`Page ${startPage}`}],pages:2,pageEnd:startPage};}});
  const first=await read('TEST_USER_A',version);first.segments[0].text='CHANGED TEST COPY';
  assert.equal((await read('TEST_USER_A',version)).segments[0].text,'TEST evidence');assert.equal(parses,1);assert.equal(downloads,1);
  await read('TEST_USER_A',version,2);assert.equal(parses,2);assert.equal(downloads,1);
  await read('TEST_USER_B',version);assert.equal(downloads,2);
  await read('TEST_USER_A',{...version,id:'TEST_V2'});assert.equal(downloads,3);
  time=1001;await read('TEST_USER_A',version);assert.equal(downloads,4);assert.equal(parses,5);
  const abort=new AbortController();abort.abort();await assert.rejects(read('TEST_USER_A',version,1,abort.signal));assert.equal(parses,5);
});
test('oversize cache entries and failed/partial readings are not retained as completed evidence',async()=>{
  let downloads=0,parses=0;
  const read=createDocumentReader({byteLimit:2,textLimit:2,fetcher:async url=>{if(new URL(url).hostname==='test.s3.amazonaws.com'){downloads++;return new Response('TEST');}return Response.json({status:'complete',url:'https://test.s3.amazonaws.com/TEST'});},parser:async()=>{parses++;if(parses===1)throw Error('TEST parse failure');return {status:'parsed',partial:true,textlessPages:0,segments:[{text:'TEST',location:'Line 1'}]};}});
  await assert.rejects(read('TEST',version));await read('TEST',version);await read('TEST',version);assert.equal(downloads,3);assert.equal(parses,3);
});
test('explicit literal search skips AI without dropping extra clauses or changing interpretation of general queries',async(t)=>{
  t.mock.method(globalThis,'fetch',()=>{throw Error('Literal query must not call AI');});
  assert.deepEqual(await planSearch([{role:'user',content:'busca "Mecánica de suelos"'}],'TEST','TEST'),{mode:'search',terms:[['mecanica de suelos']]});
  for(const input of ['busca mecánica de suelos','busca "TEST" y también "otro"','resume "TEST"','busca "TEST" dentro de la carpeta anterior'])assert.equal(literalSearch(input),null);
});
