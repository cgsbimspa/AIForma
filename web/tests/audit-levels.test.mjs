import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAecLevels,repeatedLevelNames,explicitLevelMetres} from '../lib/audit/levels.ts';
import {parseAecGrids} from '../lib/audit/grids.ts';
import {readAuditAec,parseInventory} from '../lib/audit/provider.ts';
import {executeAudit} from '../lib/audit/engine.ts';
import {defaultConfiguration} from '../lib/audit/catalog.ts';
// TEST ONLY: synthetic records, origins and measurements. Not project evidence.
const endpoint='https://developer.api.autodesk.com/TEST_AEC';
const level=(guid,name,elevation,extra={})=>({guid,name,elevation,height:3,...extra});
const payload={version:'TEST',documentId:'TEST_HOST',grids:[],levels:[level('TEST_NEG','TEST bajo cero',-2),level('TEST_ZERO','TEST cero',0,{extension:{buildingStory:false}})],linkedDocuments:[{documentId:'TEST_LINK',levels:[level('TEST_LINK_LEVEL','TEST cero',0)]},{documentId:'TEST_LINK_UNPUBLISHED'}]};
const source={scope:{kind:'file',hubId:'TEST_HUB',projectId:'TEST_PROJECT',folderIds:['TEST_FOLDER'],itemId:'TEST_ITEM'},fileName:'TEST.rvt',projectName:'TEST PROJECT',path:'TEST',version:{id:'TEST_VERSION',number:1,name:'TEST.rvt',createdAt:null,modelId:'TEST_URN',webUrl:null,endpoint:'TEST_ENDPOINT',fetchedAt:new Date().toISOString()},view:{id:'TEST_VIEW',role:'3d',name:'TEST VIEW',endpoint:'TEST_ENDPOINT',fetchedAt:new Date().toISOString()},versionPolicy:'manual'};
const catalog={companyId:'TEST_HUB',projectId:'TEST_PROJECT',version:0,tolerances:[],rules:[],naming:{},equivalences:{},exceptions:[]};
function run(file){return executeAudit({configuration:{...defaultConfiguration,source},inventory:{elements:[],grids:[],levels:[],aec:{status:'AVAILABLE',files:[file],attempts:[],fetchedAt:new Date().toISOString(),message:'TEST'},endpoint:'TEST_PROPERTIES',treeEndpoint:'TEST_TREE',fetchedAt:new Date().toISOString(),missing:0,excluded:0,population:'TEST view'},companyCatalog:catalog,projectCatalog:catalog,createdBy:'TEST_ACTOR',startedAt:new Date().toISOString()});}

test('AEC includes zero, negative and non-story levels with original GUID and origin, without invented units or dbIds',()=>{
 const parsed=parseAecLevels(payload,endpoint);
 assert.equal(parsed.records.length,3);assert.deepEqual(parsed.records.map(r=>r.elevation),[-2,0,0]);
 assert.equal(parsed.records[1].buildingStory,false);assert.equal(parsed.records[0].groundPlane,null);
 assert.equal(parsed.records[2].documentId,'TEST_LINK');assert.equal(parsed.records[2].originPath,'root.linkedDocuments[0]');
 assert.ok(parsed.records.every(r=>r.dbId===undefined&&r.floorNumber===undefined&&r.elevationMetres===undefined));
 assert.equal(parsed.documents[2].fieldAvailable,false);assert.equal(parsed.invalidRecords,0);
});
test('absent, empty, malformed and partial levels are distinct; known values survive a partial record',()=>{
 assert.equal(parseAecLevels({},endpoint).documents[0].fieldAvailable,false);
 assert.equal(parseAecLevels({levels:[]},endpoint).documents[0].fieldAvailable,true);
 const parsed=parseAecLevels({levels:[null,level('TEST','TEST',NaN),{name:'TEST missing',elevation:0},level('TEST_2','TEST top',12,{height:2147483647})]},endpoint);
 assert.equal(parsed.invalidRecords,1);assert.equal(parsed.invalidFields,2);assert.equal(parsed.records[0].elevation,null);
 assert.equal(parsed.records[1].elevation,0);assert.equal(parsed.records[2].height,2147483647);
});
test('duplicate names stay separated by source/linked record; name similarity never creates equivalences',()=>{
 assert.equal(repeatedLevelNames(parseAecLevels(payload,endpoint)).length,0);
 const p=structuredClone(payload);p.levels.push(level('TEST_OTHER','TEST cero',1));
 assert.equal(repeatedLevelNames(parseAecLevels(p,endpoint)).length,1);
});
test('only explicit recognized units are converted; unitless AEC elevations stay in original form',()=>{
 assert.equal(explicitLevelMetres(12),null);assert.equal(explicitLevelMetres('12'),null);
 assert.equal(explicitLevelMetres('12 mystery'),null);assert.equal(explicitLevelMetres('0 mm'),0);
 assert.equal(explicitLevelMetres('-2500 mm'),-2.5);assert.equal(explicitLevelMetres('10 ft'),3.048);
 assert.equal(explicitLevelMetres('1,25 m'),1.25);
});
test('same AEC download supplies grids and levels without extra calls; bounded traversal rejects oversized data',async()=>{
 let calls=0;const manifest={derivatives:[{role:'Autodesk.AEC.ModelData',urn:'urn:adsk.viewing:fs.file:TEST/AECModelData.json'}]};
 const aec=await readAuditAec('TEST_TOKEN','TEST_URN',undefined,async url=>{calls++;return new Response(JSON.stringify(String(url).endsWith('/manifest')?manifest:payload));});
 assert.equal(calls,2);assert.equal(aec.files[0].levels.records.length,3);assert.equal(aec.files[0].grids.length,0);
 assert.throws(()=>parseAecLevels({levels:Array.from({length:20001},()=>level('TEST','TEST',0))},endpoint),/too_large/);
});
test('engine reports AEC levels even with no view Levels, retains provenance and partial link coverage, never inflates counts',()=>{
 const audit=run(parseAecGrids(payload,endpoint));
 const found=audit.findings.find(f=>f.ruleId==='G03-A01'&&f.result==='INFORMATIVE');
 assert.equal(found.observedValue.length,3);assert.equal(found.evidence[0].source,endpoint);
 assert.deepEqual(found.evidence[0].viewerReference.dbIds,[]);assert.deepEqual(found.affectedElements,[]);
 assert.equal(audit.scope.elementCount,0);assert.equal(audit.inventory.elements.length,0);
 assert.ok(audit.findings.some(f=>f.ruleId==='G03-A01'&&f.result==='NOT_EVALUATED'&&f.description.includes('Cobertura')));
 assert.ok(audit.findings.filter(f=>['G03-B03','G03-B04','G03-C02'].includes(f.ruleId)).every(f=>f.result==='NOT_EVALUATED'));
 assert.ok(!audit.findings.some(f=>f.result==='FAIL'));
});
test('old AEC reports remain readable and do not claim the expanded level reading occurred',()=>{
 const file=parseAecGrids(payload,endpoint);delete file.levels;
 assert.equal(run(file).findings.find(f=>f.ruleId==='G03-A01').result,'NOT_EVALUATED');
});
test('view datum parent levels are read without classifying element names that merely mention a level',()=>{
 const tree={data:{objects:[{objectid:9,name:'TEST_ROOT',objects:[{objectid:1,name:'TEST N1',objects:[{objectid:2,name:'TEST detail'}]},{objectid:3,name:'TEST Nivel'}]}]}};
 const props={data:{collection:[{objectid:1,name:'TEST N1',properties:{Category:'Levels',Elevation:'0 mm'}},{objectid:2,name:'TEST detail',properties:{}},{objectid:3,name:'TEST Nivel',properties:{}}]}};
 const inv=parseInventory(tree,props,source,'TEST','TEST');assert.equal(inv.levels.length,1);assert.equal(inv.levels[0].dbId,1);assert.equal(inv.elements.length,2);
});
