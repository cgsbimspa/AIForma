import test from 'node:test';
import assert from 'node:assert/strict';
import {readViewClassification} from '../public/quantity-classification.js';
import {readElementProperties} from '../public/quantity-properties.js';
import {verifiedSource} from '../lib/quantities/autodesk.ts';
import {createSessionRefresh} from '../lib/autodesk/session-refresh.ts';

// Synthetic TEST SDK records only. No fabricated BIM data enters the product.
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const row=id=>({dbId:id,externalId:`TEST_${id}`,properties:[
 {displayName:'TEST custom',displayValue:id,units:'mm'},
 {displayName:'TEST internal',displayValue:0,hidden:true},
 {displayName:'TEST duplicate',displayValue:'A'},
 {displayName:'TEST duplicate',displayValue:'B'},
]});
function model(count,bulk){return {
 getObjectTree(ok){ok({getRootId:()=>0,enumNodeChildren(_id,visit){for(let i=1;i<=count;i++)visit(i);},enumNodeFragments(id,visit){if(id)visit(id);}});},
 getBulkProperties2:bulk,
};}
test('bounded property pipeline retains every row and hidden/custom/duplicate property in stable order',async()=>{
 let active=0,maximum=0,calls=0;const progress=[];
 const sdk=model(2001,(ids,options,ok)=>{
  assert.deepEqual(options,{ignoreHidden:false,needsExternalId:true});assert.ok(ids.length<=800);
  maximum=Math.max(maximum,++active);calls++;
  setImmediate(()=>{active--;ok(ids.toReversed().map(row));});
 });
 const read=await readViewClassification(sdk,(done,total)=>progress.push([done,total]));
 assert.equal(maximum,2);assert.equal(calls,3);assert.equal(read.length,2001);
 assert.deepEqual(read.map(r=>r.dbId),Array.from({length:2001},(_,i)=>i+1));
 assert.deepEqual(read[1100].properties,row(1101).properties);
 assert.deepEqual(progress.at(-1),[2001,2001]);
 const property=await readElementProperties(sdk,1101);
 assert.equal(calls,3);assert.deepEqual(property,row(1101));
 await readViewClassification(sdk);assert.equal(calls,3);
 const other=model(1,(ids,_options,ok)=>{calls++;ok(ids.map(id=>({...row(id),externalId:'TEST_OTHER_VERSION'})));});
 assert.equal((await readElementProperties(other,1)).externalId,'TEST_OTHER_VERSION');assert.equal(calls,4);
});
test('incomplete or late worker batches never publish a complete inventory or poison a retry',async()=>{
 let broken=true;const progress=[];
 const sdk=model(1601,(ids,_options,ok)=>setImmediate(()=>ok(broken&&ids[0]===801?ids.slice(1).map(row):ids.map(row))));
 await assert.rejects(readViewClassification(sdk,(n,total)=>progress.push([n,total])),/incomplete_classification/);
 await tick();assert.ok(!progress.some(([n,total])=>n===total));broken=false;
 const read=await readViewClassification(sdk);assert.equal(read.length,1601);assert.equal(read.at(-1).dbId,1601);
});
test('parallel source lookup still requires the live folder chain and exact version/view',async()=>{
 const scope={kind:'file',hubId:'TEST_HUB',projectId:'TEST_PROJECT',folderIds:['TEST_FOLDER'],itemId:'TEST_ITEM'};
 const paths=[];let releaseProject;
 const project=new Promise(resolve=>{releaseProject=resolve;});
 let deny=false;
 const fetcher=async url=>{
  paths.push(url.pathname);
  if(url.pathname.endsWith('/projects/TEST_PROJECT')){await project;return Response.json({data:{id:'TEST_PROJECT',type:'projects',attributes:{name:'TEST project'}}});}
  if(url.pathname.endsWith('/topFolders'))return Response.json({data:deny?[]:[{id:'TEST_FOLDER',type:'folders',attributes:{name:'TEST folder'}}]});
  if(url.pathname.endsWith('/contents'))return Response.json({data:[{id:'TEST_ITEM',type:'items',attributes:{displayName:'TEST.rvt'}}]});
  if(url.pathname.endsWith('/versions/TEST_V1'))return Response.json({data:{id:'TEST_V1',type:'versions',attributes:{name:'TEST.rvt',versionNumber:1},relationships:{item:{data:{id:'TEST_ITEM',type:'items'}},derivatives:{data:{id:'TEST_URN',type:'derivatives'}}}}});
  if(url.pathname.endsWith('/metadata'))return Response.json({data:{type:'metadata',metadata:[{guid:'TEST_VIEW',name:'TEST 3D',role:'3d'}]}});
  throw Error('Unexpected TEST URL');
 };
 let settled=false;
 const result=verifiedSource('TEST_TOKEN',scope,'TEST_V1','TEST_VIEW',undefined,fetcher).then(value=>{settled=true;return value;});
 await tick();assert.ok(paths.some(p=>p.endsWith('/metadata')));assert.equal(settled,false);
 releaseProject();assert.equal((await result).view.id,'TEST_VIEW');
 deny=true;await assert.rejects(verifiedSource('TEST_TOKEN',scope,'TEST_V1','TEST_VIEW',undefined,fetcher),/selection_unavailable/);
 deny=false;await assert.rejects(verifiedSource('TEST_TOKEN',scope,'TEST_V1','TEST_OTHER_VIEW',undefined,fetcher),/view_unavailable/);
});
test('simultaneous session checks share a response; forced renewal waits then runs once',async()=>{
 const calls=[],waiting=[];
 const refresh=createSessionRefresh(force=>{calls.push(force);return new Promise(resolve=>waiting.push(resolve));});
 const a=refresh(),b=refresh();assert.deepEqual(calls,[false]);
 const forcedA=refresh(true),forcedB=refresh(true);assert.deepEqual(calls,[false]);
 waiting.shift()(Response.json({available:true}));await Promise.all([a,b]);await tick();assert.deepEqual(calls,[false,true]);
 waiting.shift()(Response.json({available:true}));
 const responses=await Promise.all([forcedA,forcedB]);assert.notEqual(responses[0],responses[1]);
 assert.deepEqual(await responses[0].json(),await responses[1].json());
 const c=refresh();assert.deepEqual(calls,[false,true,false]);waiting.shift()(Response.json({error:'expired'},{status:401}));assert.equal((await c).status,401);
});
