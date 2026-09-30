import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAecGrids,aecAssetUrns,gridChordAngle,repeatedGridLabels} from '../lib/audit/grids.ts';
import {readAuditAec,readAuditView,parseInventory} from '../lib/audit/provider.ts';
import {executeAudit} from '../lib/audit/engine.ts';
import {defaultConfiguration} from '../lib/audit/catalog.ts';
// TEST ONLY. These coordinates, grids and API responses are not project data.
const endpoint='https://developer.api.autodesk.com/TEST_AEC';
const grid=(id,label,document,start=[0,0,0],end=[10,0,0])=>({id,label,document,segments:[{guid:id,type:1,points:{start,end}}]});
const payload={version:'TEST_SCHEMA',documentId:'TEST_DOC',linkedDocuments:[{}],grids:[grid('TEST_1','A','TEST HOST.rvt'),grid('TEST_2','A','TEST LINK.rvt')]};
const asset='urn:adsk.viewing:fs.file:TEST/output/AECModelData.json';
const manifest={derivatives:[{children:[{role:'Autodesk.AEC.ModelData',urn:asset}]}]};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const source={scope:{kind:'file',hubId:'TEST_HUB',projectId:'TEST_PROJECT',folderIds:['TEST_FOLDER'],itemId:'TEST_ITEM'},fileName:'TEST.rvt',projectName:'TEST PROJECT',path:'TEST',version:{id:'TEST_VERSION',number:1,name:'TEST.rvt',createdAt:null,modelId:'TEST_URN',webUrl:null,endpoint:'TEST_ENDPOINT',fetchedAt:new Date().toISOString()},view:{id:'TEST_VIEW',role:'3d',name:'TEST VIEW',endpoint:'TEST_ENDPOINT',fetchedAt:new Date().toISOString()},versionPolicy:'manual'};
const catalog={companyId:'TEST_HUB',projectId:'TEST_PROJECT',version:0,tolerances:[],rules:[],naming:{},equivalences:{},exceptions:[]};
function run(aec,grids=[]){return executeAudit({configuration:{...defaultConfiguration,source},inventory:{elements:[],grids,levels:[],aec,endpoint:'TEST_PROPERTIES',treeEndpoint:'TEST_TREE',fetchedAt:new Date().toISOString(),missing:0,excluded:0,population:'TEST view'},companyCatalog:catalog,projectCatalog:catalog,createdBy:'TEST_ACTOR',startedAt:new Date().toISOString()});}

test('AEC retains origin, published IDs and segment coordinates without inventing dbIds or units',()=>{
 const file=parseAecGrids(payload,endpoint);assert.equal(file.grids.length,2);assert.equal(file.linkedDocumentCount,1);
 assert.deepEqual(file.grids[0].segments[0].start,[0,0,0]);assert.equal(file.grids[0].document,'TEST HOST.rvt');assert.equal(file.grids[0].dbId,undefined);
 assert.notEqual(file.grids[0].key,file.grids[1].key);assert.deepEqual(repeatedGridLabels(file),[]);
 const repeated=parseAecGrids({...payload,grids:[...payload.grids,grid('TEST_3','A','TEST LINK.rvt')]},endpoint);
 assert.equal(repeatedGridLabels(repeated).length,1);assert.equal(repeatedGridLabels(repeated)[0][0].document,'TEST LINK.rvt');
});
test('malformed and absent records remain distinguishable from a verified empty array',()=>{
 const absent=parseAecGrids({},endpoint);assert.equal(absent.gridsFieldAvailable,false);
 assert.equal(parseAecGrids({grids:[]},endpoint).gridsFieldAvailable,true);
 const file=parseAecGrids({grids:[null,{label:'TEST A',segments:[{points:{start:[0,NaN,0],end:[1,2]}}]}]},endpoint);
 assert.equal(file.invalidRecords,1);assert.equal(file.invalidSegments,1);assert.equal(file.grids[0].geometryComplete,false);assert.equal(file.grids[0].id,null);assert.equal(gridChordAngle(file.grids[0].segments[0]),null);
});
test('XY chord angle is deterministic, direction-independent, not a curve tangent or a distance',()=>{
 const segment=(a,b)=>parseAecGrids({grids:[grid('TEST','TEST','TEST',a,b)]},endpoint).grids[0].segments[0];
 assert.equal(gridChordAngle(segment([1,0,0],[1,10,0])),90);assert.equal(gridChordAngle(segment([1,10,0],[1,0,0])),90);
 assert.equal(gridChordAngle(segment([0,0,0],[1,1,0])),45);assert.equal(gridChordAngle(segment([0,0,0],[0,0,2])),null);
});
test('manifest only accepts discovered Autodesk derivative URNs; arbitrary URLs are rejected',()=>{
 assert.deepEqual(aecAssetUrns(manifest),[asset]);assert.throws(()=>aecAssetUrns({children:[{role:'Autodesk.AEC.ModelData',urn:'https://evil.example/TOKEN'}]}),/asset_invalid/);
 assert.deepEqual(aecAssetUrns({children:[{role:'other',urn:asset}]}),[]);
});
test('fetch AEC through the verified version manifest; credentials stay on APS with redirect disabled',async()=>{
 const calls=[];const result=await readAuditAec('TEST_TOKEN','TEST_URN',undefined,async(url,init)=>{calls.push(String(url));assert.equal(new URL(url).origin,'https://developer.api.autodesk.com');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer TEST_TOKEN');return response(String(url).endsWith('/manifest')?manifest:payload);});
 assert.equal(result.status,'AVAILABLE');assert.equal(calls.length,2);assert.match(calls[1],/TEST_URN\/manifest\/urn%3Aadsk/);assert.equal(result.files[0].grids.length,2);
});
test('viewer manifest fallback, missing AEC, invalid payload, unavailable asset and expired session are explicit',async()=>{
 const fallback=await readAuditAec('TEST_TOKEN','TEST_URN',undefined,async url=>response(String(url).includes('derivativeservice')?manifest:String(url).endsWith('/manifest')?{}:payload));assert.equal(fallback.status,'AVAILABLE');assert.equal(fallback.attempts.length,3);
 const missing=await readAuditAec('TEST_TOKEN','TEST_URN',undefined,async()=>response({}));assert.equal(missing.status,'NOT_FOUND');
 const unavailable=await readAuditAec('TEST_TOKEN','TEST_URN',undefined,async url=>String(url).endsWith('/manifest')?response(manifest):response({},403));assert.equal(unavailable.status,'UNAVAILABLE');
 const partial=await readAuditAec('TEST_TOKEN','TEST_URN',undefined,async url=>response(String(url).endsWith('/manifest')?manifest:{grids:[null,payload.grids[0]]}));assert.equal(partial.status,'PARTIAL');assert.equal(partial.files[0].grids.length,1);
 await assert.rejects(readAuditAec('TEST_TOKEN','TEST_URN',undefined,async()=>response({},401)),/expired/);
});
test('view reading survives optional AEC failure and searches datum parents without changing the element population',async()=>{
 const tree={data:{objects:[{objectid:9,name:'TEST ROOT',objects:[{objectid:1,name:'TEST GRID',objects:[{objectid:2,name:'TEST SEGMENT'}]}]}]}};
 const props={data:{collection:[{objectid:1,name:'TEST GRID',properties:{Category:'Grids'}},{objectid:2,name:'TEST SEGMENT',properties:{}}]}};
 const inv=await readAuditView('TEST_TOKEN',source,undefined,async url=>String(url).includes('/metadata/')?response(String(url).includes('/properties')?props:tree):response({},503));
 assert.equal(inv.elements.length,1);assert.equal(inv.grids.length,1);assert.equal(inv.grids[0].dbId,1);assert.equal(inv.aec.status,'UNAVAILABLE');
 assert.equal(parseInventory(tree,props,source,'TEST','TEST').excluded,1);
});
test('engine uses AEC with no visible Grids, keeps provenance, does not inflate view counts or infer duplicate link instances',async()=>{
 const aec=await readAuditAec('TEST_TOKEN','TEST_URN',undefined,async url=>response(String(url).endsWith('/manifest')?manifest:payload));
 const audit=run(aec);assert.equal(audit.scope.elementCount,0);
 for(const id of ['G04-A01','G04-A02','G04-A03','G04-A04','G04-A05']){
  const finding=audit.findings.find(f=>f.ruleId===id);assert.equal(finding.result,'INFORMATIVE');assert.equal(finding.evidence[0].source,aec.files[0].endpoint);assert.deepEqual(finding.affectedElements,[]);assert.deepEqual(finding.evidence[0].viewerReference.dbIds,[]);
 }
 assert.equal(audit.findings.find(f=>f.ruleId==='G04-A05').evidence[0].unit,null);
 assert.equal(audit.findings.find(f=>f.ruleId==='G04-A04').observedValue[0].segments[0].chordAngleXYDegrees,0);
 assert.equal(audit.findings.find(f=>f.ruleId==='G04-B01').result,'INFORMATIVE');
 assert.ok(audit.findings.filter(f=>f.ruleId.startsWith('G04-C')).every(f=>f.result==='NOT_EVALUATED'));
});
test('old reports and ambiguous same-name view grids cannot become false duplicate warnings',()=>{
 const viewGrid={elementId:'',dbId:1,uniqueId:null,name:'A',category:'Grids',family:null,type:null,level:null,properties:{}};
 const audit=run(undefined,[viewGrid,{...viewGrid,dbId:2}]);assert.equal(audit.findings.find(f=>f.ruleId==='G04-B01').result,'NOT_EVALUATED');
});
