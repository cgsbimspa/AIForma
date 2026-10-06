import test from 'node:test';
import assert from 'node:assert/strict';
import {projectAuditConfiguration,projectAuditResult} from '../lib/audit/project.ts';
import {defaultConfiguration} from '../lib/audit/catalog.ts';
import {executeAudit} from '../lib/audit/engine.ts';
import {executionKey} from '../lib/projects/execution-cache.ts';
// TEST ONLY: sources and inventories below are synthetic regression fixtures.
const source={scope:{kind:'file',hubId:'TEST_HUB',projectId:'TEST_PROJECT',itemId:'TEST_FILE',folderIds:[]},fileName:'TEST.rvt',projectName:'TEST',path:'TEST',version:{id:'TEST_V1',number:1,name:'TEST',createdAt:null,modelId:'TEST_URN',webUrl:null,endpoint:'TEST',fetchedAt:'2026-10-05T00:00:00Z'},view:{id:'TEST_VIEW',name:'TEST',role:'3d',endpoint:'TEST',fetchedAt:'2026-10-05T00:00:00Z'},versionPolicy:'manual'};
const row={id:'TEST_ID',code:'architecture',name:'TEST ARCH',enabled:true,source,lastValidatedAt:null};
test('project audit resolves every discipline without mutating the active configuration or resetting rules',()=>{
 const settings={...structuredClone(defaultConfiguration),disabledRules:['G01-001']};const before=structuredClone(settings);
 const a=projectAuditConfiguration(row,settings),b=projectAuditConfiguration({...row,code:'structure',source:{...source,scope:{...source.scope,itemId:'TEST_STRUCTURE'}}},settings);
 assert.equal(a.discipline,'ARQUITECTURA');assert.equal(b.discipline,'ESTRUCTURA');assert.equal(b.source.scope.itemId,'TEST_STRUCTURE');assert.deepEqual(settings,before);assert.deepEqual(a.disabledRules,['G01-001']);
 for(const r of [{...row,enabled:false},{...row,source:null},{...row,source:{...source,view:null}},{...row,source:{...source,view:{...source.view,role:'2d'}}},{...row,code:'unknown'}])assert.equal(projectAuditConfiguration(r,settings),null);
});
test('each model, version, rule setting and project has a distinct execution identity',()=>{
 const c=projectAuditConfiguration(row,null),key=(s,cfg=c)=>executionKey('audit',s,{...cfg,source:null},{rules:'TEST'},'TEST_ENGINE');
 assert.notEqual(key(source),key({...source,scope:{...source.scope,projectId:'OTHER_PROJECT'}}));assert.notEqual(key(source),key({...source,version:{...source.version,id:'V2'}}));assert.notEqual(key(source),key(source,{...c,disabledRules:['G01-001']}));
 assert.equal(key(source),key({...source,path:'Display label changed'}));
});
test('consolidation preserves unavailable evidence and never merges model-local element identifiers',()=>{
 const inventory={elements:[{elementId:'1',dbId:1,uniqueId:null,name:'TEST wall',category:'Walls',family:null,type:null,level:null,properties:{}}],levels:[],grids:[],endpoint:'TEST',treeEndpoint:'TEST',fetchedAt:'2026-10-05T00:00:00Z',missing:2,excluded:0,population:'TEST ONLY'};
 const catalog={version:0,tolerances:[],rules:[],naming:{},equivalences:{},exceptions:[]};
 const run=executeAudit({configuration:projectAuditConfiguration(row,null),inventory,companyCatalog:{...catalog,companyId:'TEST_HUB'},projectCatalog:{...catalog,projectId:'TEST_PROJECT'},createdBy:'TEST_USER',startedAt:'2026-10-05T00:00:00Z'});
 const result=projectAuditResult(run);assert.equal(result.id,run.id);assert.equal(result.source.scope.projectId,'TEST_PROJECT');assert.equal(result.missing,2);assert.deepEqual(result.categories,[{name:'Walls',count:1}]);assert.ok(result.coordinates.coordinateData.every(d=>d.status!=='AVAILABLE'));assert.equal(result.coordinates.coordinateComparison.status,'NOT_EVALUATED');assert.equal(result.status,'PARTIAL');assert.ok(result.metrics.pending>0);
});
