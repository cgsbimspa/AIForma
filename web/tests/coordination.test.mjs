import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {parseInventory} from '../lib/audit/provider.ts';
import {configurationSchema,emptyConfiguration} from '../lib/coordination/contracts.ts';
import {ridaaRules,ridaaSource} from '../lib/coordination/ridaa.ts';
import {systems,reviewTopics} from '../lib/coordination/catalog.ts';
import {measurement,executeReview,report,results,compareRuns,extractModel} from '../lib/coordination/engine.ts';
import {createCoordinationStore} from '../lib/coordination/store.ts';
import {modelOrigin,modelCoverage,parameterCandidates} from '../lib/coordination/inspection.ts';
import {automaticReading} from '../lib/coordination/automatic.ts';
// Synthetic TEST ONLY fixtures. No project/model observations are asserted here.
const actor={organizationId:'TEST_ORG',projectId:'TEST_PROJECT',userId:'TEST_USER'},now=new Date().toISOString();
const source={scope:{kind:'file',hubId:actor.organizationId,projectId:actor.projectId,folderIds:['TEST_FOLDER'],itemId:'TEST_FILE'},fileName:'TEST.rvt',projectName:'TEST project',path:'TEST / TEST.rvt',version:{id:'TEST_V1',number:1,name:'TEST.rvt',createdAt:now,modelId:'TEST_URN',webUrl:null,endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now},view:{id:'TEST_VIEW',name:'TEST view',role:'3d',endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:now},versionPolicy:'manual'};
const configuration={...emptyConfiguration('SAN-01'),source,scope:{mode:'VIEW',property:'',value:'',confirmed:true}};
const rule=ridaaRules.find(r=>r.id==='RIDAA-88-MIN');
const criterion={ruleId:rule.id,property:'Dimensions.Slope',...rule.check,categories:['Pipes'],kind:'NORMATIVE',source:ridaaSource.url,article:rule.article,sourceVersion:ridaaSource.version,confirmed:true,applicationEvidence:'TEST ONLY ordinary pipe fixture, excluded exceptions',filter:{property:'',value:''}};
function row(id,slope,extra={}){return {objectid:id,name:`TEST pipe ${id}`,externalId:`TEST_UID_${id}`,properties:{Category:'Pipes',Dimensions:{Slope:slope},Constraints:{Level:'TEST N1'},...extra}};}
function inventory(rows,missing=[]){return parseInventory({data:{objects:[{objectid:900,objects:[...rows.map(r=>({objectid:r.objectid})),...missing.map(objectid=>({objectid}))]}]}},{data:{collection:rows}},source,'https://developer.api.autodesk.com/TEST/properties','https://developer.api.autodesk.com/TEST/tree');}
const execute=(rows,config={...configuration,criteria:[criterion]},missing=[])=>executeReview(config,inventory(rows,missing),actor.userId,1);

test('RIDAA base has stable source-linked controls; exterior does not inherit interior thresholds',()=>{
 assert.equal(systems.length,5);assert.equal(ridaaRules.length,18);assert.equal(new Set(ridaaRules.map(r=>r.id)).size,18);assert.equal(new Set(reviewTopics.map(r=>r.id)).size,reviewTopics.length);
 assert.ok(ridaaRules.every(r=>r.article&&r.application&&r.dependencies));
 assert.ok(ridaaRules.filter(r=>r.systems.includes('SAN-02')||r.systems.includes('SAN-04')).every(r=>!r.check));
 assert.ok(rule.requirement.includes('1 %'));assert.ok(rule.application.includes('No ventilación'));
});
test('unmapped rules and unverified networks produce no invented PASS or FAIL',()=>{
 const run=execute([row(1,'5 %')],configuration);assert.ok(run.findings.every(f=>['NOT EVALUATED','PRELIMINARY'].includes(f.state)));assert.equal(run.preliminaryComparisons,2);assert.equal(run.rulesExecuted,0);assert.equal(run.status,'PARTIAL');assert.equal(run.graph.state,'NOT AVAILABLE');assert.equal(run.graph.elements[0].upstream,null);assert.equal(report(run).counts.PASS,0);assert.equal(report(run).counts.FAIL,0);
});
test('scope confirmation, 3D source and exact system membership are required',()=>{
 assert.throws(()=>execute([row(1,'3 %')],{...configuration,scope:{...configuration.scope,confirmed:false}}),/coordination_scope_required/);
 assert.throws(()=>execute([row(1,'3 %')],{...configuration,source:{...source,view:{...source.view,role:'2d'}}}),/coordination_scope_required/);
 assert.throws(()=>execute([row(1,'3 %')],{...configuration,scope:{mode:'PROPERTY',property:'System',value:'TEST_MATCH',confirmed:true}}),/coordination_empty_scope/);
 const run=execute([row(1,'3 %',{System:'TEST_MATCH'}),row(2,'1 %',{System:'TEST_OTHER'})],{...configuration,criteria:[criterion],scope:{mode:'PROPERTY',property:'System',value:'TEST_MATCH',confirmed:true}});
 assert.equal(run.readCount,1);assert.equal(run.excludedCount,1);assert.equal(report(run).counts.FAIL,0);
});
test('thresholds, article, scope and units cannot be silently altered or promoted',()=>{
 for(const patch of [{value:1},{unit:'m'},{article:'TEST'},{source:'https://example.com'},{sourceVersion:'2099'},{confirmed:false},{applicationEvidence:''},{categories:[]},{filter:{property:'A',value:''}}])assert.equal(configurationSchema.safeParse({...configuration,criteria:[{...criterion,...patch}]}).success,false);
 assert.equal(configurationSchema.safeParse({...configuration,systemId:'SAN-02',criteria:[criterion]}).success,false);
 assert.equal(configurationSchema.safeParse({...configuration,criteria:[criterion,criterion]}).success,false);
});
test('numeric evaluation preserves published value, unit, identities, input version and controlled rule',()=>{
 const run=execute([row(1,'2,1 %'),row(2,'3 %'),row(3,'4 %')]),findings=run.findings.filter(f=>f.ruleId===rule.id);
 assert.deepEqual(findings.map(f=>f.state),['FAIL','PASS','PASS']);assert.ok(Math.abs(findings[0].difference+0.9)<1e-9);
 assert.equal(findings[0].evidence.raw,'2,1 %');assert.equal(findings[0].evidence.versionId,source.version.id);assert.equal(findings[0].evidence.viewId,source.view.id);assert.equal(findings[0].evidence.uniqueId,'TEST_UID_1');assert.equal(findings[0].criterion.source,ridaaSource.url);assert.equal(findings[0].confidence,null);
});
test('missing units and ambiguous formats remain not evaluated; explicit units convert deterministically',()=>{
 for(const raw of [null,3,'3','approx 3 %','3 m','1,000.00 %'])assert.equal(execute([row(1,raw)]).findings.find(f=>f.ruleId===rule.id).state,'NOT EVALUATED');
 assert.equal(measurement('0.075 m','mm'),75);assert.equal(measurement('5 cm','mm'),50);assert.equal(measurement('3,2 %','%'),3.2);assert.ok(Math.abs(measurement('3 ft','m')-.9144)<1e-9);
});
test('partial property population is disclosed, never zero-filled',()=>{
 const run=execute([row(1,'3 %')],undefined,[999]);assert.equal(run.missingCount,1);assert.equal(run.status,'PARTIAL');assert.equal(report(run).counts.PASS,1);assert.equal(run.readCount,1);
});
test('category uses exact published ancestors only; names and conflicting ancestors are not classifiers',()=>{
 const inv=inventory([{objectid:1,name:'TEST Pipes guessing forbidden',externalId:'TEST',properties:{}}]);inv.elements[0].treePath=['TEST RVT','Pipes','TEST FAMILY'];assert.equal(extractModel(inv)[0].category,'Pipes');inv.elements[0].treePath=['TEST RVT','TEST FAMILY'];assert.equal(extractModel(inv)[0].category,null);inv.elements[0].treePath=['Pipes','Pipe Fittings'];assert.equal(extractModel(inv)[0].category,null);
});

const testLinkA='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-00000001',testLinkB='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb-00000002',testElement='cccccccc-cccc-cccc-cccc-cccccccccccc-00000003';
test('linked instances are traversed, evaluated and retained separately even with the same native element id',()=>{
 const rows=[{...row(1,'2 %'),externalId:`${testLinkA}/${testElement}`},{...row(2,'4 %'),externalId:`${testLinkB}/${testElement}`}];
 const tree={data:{objects:[{objectid:900,name:'TEST HOST',objects:[{objectid:901,name:'TEST LINK A',objects:[{objectid:1}]},{objectid:902,name:'TEST LINK B',objects:[{objectid:2}]}]}]}};
 const inv=parseInventory(tree,{data:{collection:rows}},source,'TEST_PROPERTIES','TEST_TREE');
 const run=executeReview({...configuration,criteria:[criterion]},inv,actor.userId,1),findings=run.findings.filter(f=>f.ruleId===rule.id);
 assert.deepEqual(findings.map(f=>f.state),['FAIL','PASS']);assert.equal(run.readCount,2);
 assert.equal(run.coverage.linkedElements,2);assert.equal(run.coverage.groups.length,2);
 assert.deepEqual(findings.map(f=>f.element.origin.key),[testLinkA,testLinkB]);
 assert.deepEqual(findings.map(f=>f.evidence.uniqueId),rows.map(r=>r.externalId));
 assert.equal(findings[0].element.origin.elementUniqueId,findings[1].element.origin.elementUniqueId);
 assert.equal(results(run,{origin:testLinkB,state:'PASS'}).total,1);
 assert.deepEqual(findings[0].element.categoryPath,['TEST HOST','TEST LINK A']);
});
test('nested link paths preserve every instance; unknown identifier formats are never labelled as host',()=>{
 assert.deepEqual(modelOrigin(`${testLinkA}/${testLinkB}/${testElement}`).instancePath,[testLinkA,testLinkB]);
 assert.equal(modelOrigin(testElement).kind,'HOST');
 for(const id of [null,'TEST_ID','file.rvt/object',`${testLinkA}/invalid`])assert.equal(modelOrigin(id).kind,'UNRESOLVED');
});
test('parameter proposals read linked values and units but never activate a rule or assume its scope',()=>{
 const inv=inventory([{...row(1,'3 %'),externalId:`${testLinkA}/${testElement}`},row(2,3),row(3,'5 %',{Other:{Pendiente:'7 %'}})]);
 const elements=extractModel(inv),proposals=parameterCandidates(elements,measurement).filter(p=>p.ruleId===rule.id);
 assert.equal(proposals.length,2);assert.equal(proposals.find(p=>p.property==='Dimensions.Slope').count,3);
 assert.equal(proposals.find(p=>p.property==='Dimensions.Slope').readableCount,2);
 assert.equal(proposals.find(p=>p.property==='Dimensions.Slope').linkedCount,1);
 const run=executeReview(configuration,inv,actor.userId,1);
 assert.equal(run.rulesExecuted,0);assert.ok(run.findings.every(f=>['NOT EVALUATED','PRELIMINARY'].includes(f.state)));
 assert.equal(run.findings.find(f=>f.ruleId===rule.id).pendingReason,'APPLICABILITY_REQUIRED');
 assert.equal(run.findings.find(f=>f.ruleId==='RIDAA-87-DOWN').pendingReason,'INPUT_REQUIRED');
 assert.equal(modelCoverage(elements,inv).readCount,3);
});
test('missing mapping, missing readable value and an unmatched category have distinct actionable reasons',()=>{
 assert.equal(execute([row(1,null)]).findings.find(f=>f.ruleId===rule.id).pendingReason,'VALUE_UNAVAILABLE');
 assert.equal(execute([row(1,'3 %')],{...configuration,criteria:[{...criterion,categories:['TEST other category']}]}).findings.find(f=>f.ruleId===rule.id).pendingReason,'NO_MATCHING_ELEMENTS');
});

test('automatic comparison runs without mappings, preserves link occurrence and never certifies applicability',()=>{
 const original=JSON.stringify(configuration),a={...row(1,'1 %'),externalId:`${testLinkA}/${testElement}`},b={...row(2,'4 %'),externalId:`${testLinkB}/${testElement}`};
 const run=execute([a,b],configuration),min=run.findings.filter(f=>f.ruleId===rule.id);
 assert.equal(run.preliminaryRulesExecuted,2);assert.equal(run.preliminaryComparisons,4);
 assert.deepEqual(min.map(f=>f.observed),[1,4]);assert.deepEqual(min.map(f=>f.difference),[-2,1]);
 assert.deepEqual(min.map(f=>f.comparison.matches),[false,true]);
 assert.ok(min.every(f=>f.state==='PRELIMINARY'&&f.criterion===null&&f.comparison.basis==='REFERENCE_ONLY'&&f.pendingReason==='APPLICABILITY_REQUIRED'));
 assert.deepEqual(min.map(f=>f.evidence.uniqueId),[a.externalId,b.externalId]);
 assert.equal(report(run).counts.PASS,0);assert.equal(report(run).counts.FAIL,0);assert.equal(run.rulesExecuted,0);
 assert.equal(JSON.stringify(configuration),original);assert.equal(results(run,{origin:testLinkA,comparison:'OUTSIDE_REFERENCE'}).rows[0].observed,1);
 assert.equal(results(run,{}).rows[0].state,'PRELIMINARY');
});

test('Spanish published paths, units and separate pipe occurrences are read without nominal fitting dimensions',()=>{
 const rows=[{objectid:1,name:'TEST linked pipe',externalId:`${testLinkA}/${testElement}`,properties:{Category:'Tuberías',Restricciones:{Pendiente:'1.615 %'},Mecánica:{Diámetro:'110.000 mm'}}},
 {objectid:2,name:'TEST fitting',properties:{Category:'Uniones de tubería',Cotas:{'Diámetro nominal':'40.000 mm'}}}];
 const run=execute(rows,configuration),d=run.findings.filter(f=>f.ruleId==='RIDAA-97-D'&&f.observed!==null);
 assert.equal(d.length,1);assert.equal(d[0].observed,110);assert.equal(d[0].evidence.property,'Mecánica.Diámetro');assert.equal(d[0].state,'PRELIMINARY');
 assert.ok(d[0].description.includes('Sólo ventilación principal'));assert.equal(run.preliminaryComparisons,3);
});

test('missing, ambiguous and unlabelled values stay pending, never silently substituted',()=>{
 const rows=[row(1,null),row(2,3),row(3,'3 %',{Other:{Pendiente:'5 %'}}),row(4,'3 %',{Other:{Pendiente:'3 %'}})];
 const run=execute(rows,configuration),min=run.findings.filter(f=>f.ruleId===rule.id);
 assert.deepEqual(min.map(f=>f.state),['NOT EVALUATED','NOT EVALUATED','NOT EVALUATED','PRELIMINARY']);
 assert.equal(min[2].pendingReason,'AMBIGUOUS_PARAMETER');assert.equal(min[2].observed,null);
 assert.deepEqual(min[2].evidence.raw,{'Dimensions.Slope':'3 %','Other.Pendiente':'5 %'});
 const e=extractModel(inventory([row(10,null)]))[0];delete e.values['Dimensions.Slope'];
 assert.equal(automaticReading(rule.id,e,'%').reason,'PARAMETER_NOT_FOUND');
});

test('automatic reading supports explicit slope units, preserves zero and does not infer vertical application',()=>{
 assert.equal(measurement('30 mm/m','%'),3);assert.equal(measurement('0,03 m/m','%'),3);assert.equal(measurement('3 cm/m','%'),3);
 assert.ok(Math.abs(measurement('0.36 in/ft','%')-3)<1e-9);assert.ok(Math.abs(measurement('45 °','%')-100)<1e-9);
 assert.equal(measurement('90 °','%'),null);assert.equal(measurement('1:100','%'),null);assert.equal(measurement(.03,'%'),null);
 const run=execute([row(1,'0.000 %'),row(2,'109654.772 %')],configuration),min=run.findings.filter(f=>f.ruleId===rule.id);
 assert.deepEqual(min.map(f=>f.observed),[0,109654.772]);assert.ok(min.every(f=>f.state==='PRELIMINARY'));
});

test('manual scopes take precedence and reference-only comparisons cannot be counted as corrected violations',()=>{
 const a=execute([row(1,'1 %')],configuration),b=execute([row(1,'5 %')],configuration);
 b.source=structuredClone(source);b.source.version.id='TEST_V2';b.source.version.number=2;
 assert.equal(compareRuns(a,b).counts.corrected,0);assert.equal(compareRuns(a,b).counts.new,0);
 const confirmed=execute([row(1,'1 %'),row(2,'4 %')]);
 assert.equal(confirmed.rulesExecuted,1);assert.deepEqual(confirmed.findings.filter(f=>f.ruleId===rule.id).map(f=>f.state),['FAIL','PASS']);
 assert.equal(confirmed.preliminaryRulesExecuted,1);
});

test('automatic comparisons obey selected project scope and never apply interior references to exterior systems',()=>{
 const run=execute([row(1,'1 %',{System:'TEST_A'}),row(2,'4 %',{System:'TEST_B'})],{...configuration,scope:{mode:'PROPERTY',property:'System',value:'TEST_A',confirmed:true}});
 assert.equal(run.readCount,1);assert.ok(run.findings.every(f=>!f.element||f.element.dbId===1));
 const exterior=execute([row(1,'4 %')],{...configuration,systemId:'SAN-02'});
 assert.equal(exterior.preliminaryComparisons,0);assert.equal(exterior.rulesExecuted,0);
});
test('comparing repeated link occurrences does not collapse their equal native ids',()=>{
 const rows=[{...row(1,'2 %'),externalId:`${testLinkA}/${testElement}`},{...row(2,'2 %'),externalId:`${testLinkB}/${testElement}`}];
 const a=execute(rows),b=execute([{...rows[0],properties:row(1,'4 %').properties},rows[1]]);
 b.source=structuredClone(source);b.source.version.number=2;b.source.version.id='TEST_V2';
 const comparison=compareRuns(a,b);assert.equal(comparison.counts.corrected,1);assert.equal(comparison.counts.persistent,1);
});
test('historical reports expose recorded link coverage and pending reasons without changing stored findings',()=>{
 const run=execute([{...row(1,'2 %'),externalId:`${testLinkA}/${testElement}`}],configuration);
 delete run.coverage;delete run.candidates;for(const f of run.findings)delete f.pendingReason;
 const original=JSON.stringify(run),summary=report(run),page=results(run,{pending:'MAPPING_REQUIRED'});
 assert.equal(summary.coverage.linkedElements,1);assert.equal(summary.coverage.groups[0].key,testLinkA);
 assert.ok(page.total>0);assert.ok(page.rows.every(f=>f.pendingReason==='MAPPING_REQUIRED'));
 assert.equal(JSON.stringify(run),original);assert.equal(summary.rulesExecuted,0);
});
test('facets and pagination only return findings within this immutable review',()=>{
 const run=execute(Array.from({length:55},(_,i)=>row(i+1,'1 %')));const filtered=results(run,{state:'FAIL',level:'TEST N1'});assert.equal(filtered.total,55);assert.equal(filtered.rows.length,50);assert.equal(results(run,{state:'FAIL'},50).rows.length,5);assert.equal(results(run,{level:'TEST_UNKNOWN'}).total,0);
});
test('comparison distinguishes corrected, persistent, new and unavailable without treating disappearance as correction',()=>{
 const a=execute([row(1,'1 %'),row(2,'1 %'),row(3,'3 %'),row(4,'1 %')]);const b=execute([row(1,'3 %'),row(2,'1 %'),row(3,'1 %'),row(5,'1 %')]);b.source=structuredClone(source);b.source.version.number=2;b.source.version.id='TEST_V2';
 const v=compareRuns(a,b);assert.equal(v.counts.corrected,1);assert.equal(v.counts.persistent,1);assert.equal(v.counts.new,2);assert.ok(v.counts.notEvaluated>0);
 assert.throws(()=>compareRuns(b,a),/coordination_comparison_mismatch/);assert.throws(()=>compareRuns(a,{...b,engineVersion:'TEST_CHANGED'}),/coordination_comparison_mismatch/);
 const duplicate=structuredClone(b);duplicate.findings.push(duplicate.findings.find(f=>f.element?.uniqueId==='TEST_UID_1'));assert.equal(compareRuns(a,duplicate).counts.corrected,0);
});
test('encrypted append-only records enforce project/company boundaries and optimistic configuration revisions',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec(await readFile(new URL('../db/audit.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../db/coordination.sql',import.meta.url),'utf8'));
  const tx=(a,fn)=>db.transaction(async sql=>{await sql.exec('SET LOCAL ROLE ai_forma_audit');await sql.query("SELECT set_config('app.organization_id',$1,true),set_config('app.project_id',$2,true),set_config('app.user_id',$3,true)",[a.organizationId,a.projectId,a.userId]);return fn(async(text,values=[])=>(await sql.query(text,values)).rows);});
  const store=createCoordinationStore(tx,randomBytes(32));await store.save(actor,0,configuration);await assert.rejects(store.save(actor,0,configuration),/configuration_conflict/);
  const run=execute([row(1,'2 %')]);await store.append(actor,run);await store.annotate(actor,run,run.findings[0].id,'issue','TEST issue');const w=await store.workspace(actor);assert.equal(w.runs.length,1);assert.equal(w.annotations.length,1);assert.equal(w.configurations[0].revision,1);
  assert.equal((await store.workspace({...actor,projectId:'TEST_OTHER'})).runs.length,0);await assert.rejects(store.run({...actor,organizationId:'TEST_OTHER'},run.id),/not_found/);
  await assert.rejects(store.annotate(actor,run,'TEST_MISSING','comment','TEST'),/not_found/);
  await assert.rejects(store.save({...actor,projectId:'TEST_OTHER'},0,configuration),/out_of_scope/);
  const encrypted=(await db.query('SELECT payload,label FROM coordination_record')).rows;assert.ok(encrypted.every(r=>!r.payload.includes('TEST.rvt')&&!r.label.includes('TEST.rvt')));
  await assert.rejects(db.query('UPDATE coordination_record SET label=$1 WHERE id=$2',['TEST',run.id]),/audit_history_is_immutable/);
  assert.equal((await store.run(actor,run.id)).source.version.id,'TEST_V1');
 }finally{await db.close();}
});
