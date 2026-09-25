import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectTriangles, geometryFallback } from '../public/quantity-v2/geometry.js';
import { readMeasure, extractElement } from '../public/quantity-v2/properties.js';
import { concreteQuantity, formworkQuantity, rebarQuantity } from '../public/quantity-v2/services.js';
import { defaultSettings, calculateQuantities, inspectElements, presentQuantities, quantityFacets, compareCalculations, UNCLASSIFIED } from '../public/quantity-v2/quantity-service.js';
import { slabCandidates, buildIntervals, resolveLevel } from '../public/quantity-v2/levels.js';
import { calculationSchema, settingsSchema } from '../lib/quantities-v2/contracts.ts';
import { AZA_SOURCE, addAzaWeights, rebarDiagnostic } from '../public/quantity-v2/rebar-reference.js';
// Synthetic TEST geometry and parameters only. Not included in application data.
const binding={projectId:'TEST_PROJECT',itemId:'TEST_FILE',versionId:'TEST_V1',versionNumber:1,urn:'TEST_URN_1',viewId:'TEST_VIEW',fileName:'TEST.rvt',viewName:'TEST_VIEW',projectName:'TEST_PROJECT'};
const property=(displayName,displayValue,units='')=>({displayName,displayValue,units,displayCategory:'TEST_PARAMETERS'});
function box(x,y,z,origin=[0,0,0]){const p=[[0,0,0],[x,0,0],[x,y,0],[0,y,0],[0,0,z],[x,0,z],[x,y,z],[0,y,z]].map(v=>v.map((n,i)=>n+origin[i]));return [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]].flatMap(([a,b,c,d])=>[[p[a],p[b],p[c]],[p[a],p[c],p[d]]]);}
function element(dbId,category='Walls',measures=[],geometry=geometryFallback(null,'TEST_NO_GEOMETRY'),specialty='Hormigón'){return {...extractElement({dbId,externalId:'TEST_EXTERNAL_'+dbId,name:'TEST_ELEMENT_'+dbId,properties:[property('Especialidad',specialty),property('Category',category),...measures]},binding),geometry};}
const settings=()=>settingsSchema.parse(defaultSettings());
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('internal Level references are never floor names; native levels and published AEC Piso remain verifiable',()=>{
 const internal={...property('Level',3),displayCategory:'__internalref__'};
 const slab=element(1,'Floors',[property('Nivel','N2'),internal]);
 assert.equal(slab.text.level.value,'N2');assert.equal(slab.text.levelReference.value,'3');
 const onlyRef=element(2,'Floors',[internal]);assert.equal(onlyRef.text.level.value,null);
 const bar=element(3,'Structural Rebar',[property('AEC Piso','N5')],undefined,'Enfierradura');
 const data=calculateQuantities([slab,onlyRef,bar],binding,settings());
 assert.equal(data.records[2].floor.originalRevitLevel,'N5');assert.equal(data.records[2].floor.evidence.publishedLevel.source,'aecFloor');
 assert.deepEqual(quantityFacets(data.records,{specialty:'',category:'',floor:''}).floors,['Nivel publicado: N2','Nivel publicado: N5','Piso no resuelto']);
 assert.equal(calculationSchema.safeParse(data).success,true);
});
test('native base constraint wins over a conflicting custom level without inventing equivalences',()=>{
 const wall=element(1,'Walls',[property('Nivel','2'),property('Restricción de base','N1'),property('Restricción superior','Hasta nivel: N2')]);
 const data=calculateQuantities([wall],binding,settings());
 assert.deepEqual(quantityFacets(data.records,{specialty:'',category:'',floor:''}).floors,['Nivel publicado: N1']);
 assert.equal(data.records[0].floor.resolvedBuildingLevel,'Piso no resuelto');
 assert.equal(data.records[0].floor.evidence.customLevel,'2');assert.equal(data.records[0].floor.evidence.publishedLevel.source,'baseLevel');
 const ambiguous=element(2,'Walls',[property('Nivel','2'),property('Base Constraint','N1'),property('Restricción de base','N2')]);
 assert.equal(calculateQuantities([ambiguous],binding,settings()).records[0].floor.originalRevitLevel,null);
});
test('approved AZA nominal references apply only to detected diameters and retain custom coefficients',()=>{
 const bars=[8,10,12,16,18,22,9].map((d,i)=>element(i+1,'Structural Rebar',[property('Bar Diameter',d,'mm'),property('Bar Length',2,'m'),property('Quantity',3)],undefined,'Enfierradura'));
 const initial=calculateQuantities(bars,binding,settings());
 const table=addAzaWeights([],initial.records);assert.deepEqual(table.map(r=>r.unit_weight_kg_m),[.395,.617,.888,1.58,2,2.98]);assert.ok(table.every(r=>r.source===AZA_SOURCE));
 const calculated=calculateQuantities(bars,binding,{...settings(),rebarWeightTable:table});
 close(calculated.records[3].quantities.rebar.value,9.48);assert.equal(calculated.records[6].quantities.rebar.value,null);
 const diagnostic=rebarDiagnostic(calculated.records,calculated.records);assert.equal(diagnostic.ready,6);assert.equal(diagnostic.missingDiameters.length,1);close(diagnostic.missingDiameters[0],9);
 assert.equal(rebarDiagnostic(calculated.records,[]).filtered,0);
 const custom={diameter:8,unit_weight_kg_m:.4,source:'TEST_CUSTOM',version:'TEST'};assert.deepEqual(addAzaWeights([custom],initial.records)[0],custom);
});
test('closed translated/rotated tessellation measures volume, centroid and faces, not bounding-box volume',()=>{
 const g=inspectTriangles(box(2,3,4,[1000,-2000,-3]));assert.equal(g.closed,true);close(g.volume,24);assert.deepEqual(g.centroid,[1001,-1998.5,-1]);close(g.surfaceArea,52);close(g.perimeter,10);close(g.bottomArea,6);close(g.twoLateralArea,24);
 const rotate=p=>[p[0]*Math.cos(.3)-p[1]*Math.sin(.3),p[0]*Math.sin(.3)+p[1]*Math.cos(.3),p[2]];
 const rotated=inspectTriangles(box(2,3,4).map(t=>t.map(rotate)));close(rotated.volume,24);close(rotated.twoLateralArea,24);assert.equal(rotated.rectangularPrism,true);
 const opened=inspectTriangles(box(2,3,4).slice(1));assert.equal(opened.closed,false);assert.equal(opened.volume,null);
 assert.equal(concreteQuantity(element(1,'Walls',[],opened)).value,null);
 const reversed=inspectTriangles(box(2,3,4).map(t=>[...t].reverse()));assert.equal(reversed.closed,false);
});
test('parameter units, ambiguity, signed elevation and zero are distinguished',()=>{
 close(readMeasure([property('Volume',1,'autodesk.unit.unit:cubicFeet-1.0.1')],'volume','m3').value,.028316846592);
 assert.equal(readMeasure([property('Volume',0,'m³')],'volume','m3').value,0);
 assert.equal(readMeasure([property('Volume',3)],'volume','m3').value,null);
 assert.equal(readMeasure([property('Volume','1,234','m³')],'volume','m3').value,null);
 assert.equal(readMeasure([property('Height',2,'m'),property('Altura',3,'m')],'height','m').value,null);
 assert.equal(readMeasure([property('Elevation',-3000,'mm')],'elevation','m').value,-3);
 assert.equal(readMeasure([property('Quantity',1.5)],'count','count').value,null);
 assert.equal(element(2,'Estructura').category,null);
});
test('concrete prioritizes Revit and formwork uses category-specific formulas with evidence',()=>{
 const g=inspectTriangles(box(2,3,4)),m=[property('Volume',10,'m³'),property('Area',12,'m²'),property('Length',3,'m'),property('Height',4,'m')];
 const wall=element(1,'Walls',m,g);assert.equal(concreteQuantity(wall).value,10);assert.equal(concreteQuantity(wall).source,'REVIT_PARAMETER');assert.equal(formworkQuantity(wall,settings(),binding).value,24);
 const column=element(2,'Structural Columns',[property('Width',2,'m'),property('Depth',3,'m'),property('Height',4,'m')],g);assert.equal(formworkQuantity(column,settings(),binding).value,40);assert.match(formworkQuantity(column,settings(),binding).formula,/2 ×/);
 assert.equal(formworkQuantity(element(3,'Structural Framing',m,g),settings(),binding).value,24);
 const foundation=element(4,'Structural Foundations',[...m,property('Type','Viga de Fundación TEST')],g);assert.equal(formworkQuantity(foundation,settings(),binding).value,24);
 const other=element(5,'Structural Foundations',[],g);assert.equal(formworkQuantity(other,settings(),binding).value,null);assert.equal(formworkQuantity(other,settings(),binding).proposedValue,40);
 const steel=element(6,'Structural Rebar',[],g,'Enfierradura');assert.equal(formworkQuantity(steel,settings(),binding).value,null);assert.equal(concreteQuantity(steel).value,null);
});
test('ground slabs exclude their bottom and elevated slabs require explicit confirmed role',()=>{
 const e=element(1,'Floors',[],inspectTriangles(box(10,10,.2)));assert.equal(formworkQuantity(e,settings(),binding).value,null);
 const s={...settings(),levelBinding:{urn:binding.urn,viewId:binding.viewId},slabRoles:[{dbId:1,role:'ground'}]};close(formworkQuantity(e,s,binding).value,8);
 s.slabRoles[0].role='elevated';close(formworkQuantity(e,s,binding).value,108);
 assert.equal(formworkQuantity(e,s,{...binding,urn:'TEST_OTHER_VERSION'}).value,null);
});
test('steel derives lengths and weights only from traceable configured coefficients per diameter',()=>{
 const e=element(1,'Structural Rebar',[property('Bar Diameter',12,'mm'),property('Bar Length',2000,'mm'),property('Quantity',3)],undefined,'Enfierradura');
 const missing=rebarQuantity(e,settings());assert.equal(missing.totalLengthM,6);assert.equal(missing.weight.value,null);
 const s={...settings(),rebarWeightTable:[{diameter:12,unit_weight_kg_m:.5,source:'TEST_COEFFICIENT_NOT_ENGINEERING_REFERENCE',version:'TEST_1'}]};
 const r=rebarQuantity(e,s);assert.equal(r.weight.value,3);assert.equal(r.table.source,'TEST_COEFFICIENT_NOT_ENGINEERING_REFERENCE');
 const missingCount=element(2,'Structural Rebar',[property('Diameter',12,'mm'),property('Bar Length',2,'m')],undefined,'Enfierradura');assert.equal(rebarQuantity(missingCount,s).weight.value,null);
 assert.equal(settingsSchema.safeParse({...s,rebarWeightTable:[{...s.rebarWeightTable[0],source:''}]}).success,false);
 assert.equal(settingsSchema.safeParse({...s,rebarWeightTable:[s.rebarWeightTable[0],s.rebarWeightTable[0]]}).success,false);
});
function spatialFixture(){const slabs=[0,3,6].map((z,i)=>element(i+1,'Floors',[property('Level','TEST_LEVEL_'+i)],inspectTriangles(box(10,10,.2,[0,0,z-.2]))));const s={...settings(),levelBinding:{urn:binding.urn,viewId:binding.viewId},levelReferences:slabCandidates(slabs,.002).map((g,i)=>({id:g.id,dbIds:g.dbIds,label:i?`Piso ${i}`:'Fundación',aliases:[]}))};return {slabs,s,resolver:buildIntervals(slabs,s,binding)};}
test('1/2/5 mm are offered as small configurable tolerances and groups cannot drift by chaining',()=>{
 const records=[0,.0015,.003].map((z,i)=>element(i+1,'Floors',[],inspectTriangles(box(10,10,.2,[0,0,z]))));
 assert.deepEqual(slabCandidates(records,.002).map(g=>g.dbIds),[[1,2],[3]]);assert.equal(slabCandidates(records,.001).length,3);assert.equal(slabCandidates(records,.005).length,1);
 assert.equal(buildIntervals(records,settings(),binding).intervals.length,0);
 assert.equal(settingsSchema.safeParse({...settings(),levelToleranceM:0}).success,false);
});
test('spatial resolver retains original level, requires confirmed slabs and preserves ambiguous/multilevel cases',()=>{
 const {slabs,s,resolver}=spatialFixture();const col=element(10,'Structural Columns',[property('Level','INCORRECT_TEST_LEVEL')],inspectTriangles(box(1,1,2.8,[1,1,.1])));
 const result=resolveLevel(col,resolver,s,binding);assert.equal(result.resolvedBuildingLevel,'Piso 1');assert.equal(result.originalRevitLevel,'INCORRECT_TEST_LEVEL');assert.equal(result.floor_assignment_method,'SLAB_INTERVAL');assert.equal(result.floor_confidence,1);
 const multi=element(11,'Walls',[],inspectTriangles(box(1,1,5,[1,1,0])));const mr=resolveLevel(multi,resolver,s,binding);assert.equal(mr.multilevel,true);assert.equal(mr.resolvedBuildingLevel,'Piso 1');close(mr.floor_confidence,.6);
 const tie=element(12,'Walls',[],inspectTriangles(box(1,1,6,[1,1,0])));assert.equal(resolveLevel(tie,resolver,s,binding).resolvedBuildingLevel,'Piso no resuelto');
 const outside=element(13,'Walls',[],inspectTriangles(box(1,1,2,[20,20,0])));assert.equal(resolveLevel(outside,resolver,s,binding).resolvedBuildingLevel,'Piso no resuelto');
 assert.equal(buildIntervals(slabs,s,{...binding,urn:'TEST_V2'}).intervals.length,0);
 const manual={...s,manualFloors:[{dbId:13,label:'Piso revisado'}]};assert.equal(resolveLevel(outside,resolver,manual,binding).floor_assignment_method,'MANUAL');assert.equal(resolveLevel(outside,{intervals:[],issue:'TEST_CHANGED_VERSION'},manual,{...binding,urn:'TEST_V2'}).resolvedBuildingLevel,'Piso no resuelto');
});
test('complete provenance passes validation; totals distinguish zero, missing and partial; facets use other active filters',()=>{
 const {s,slabs}=spatialFixture();const records=[element(10,'Structural Columns',[property('Volume',0,'m³')],inspectTriangles(box(1,1,2,[1,1,.5]))),element(11,'Walls',[property('Volume',8,'m³')]),element(12,'Walls',[])];
 const data=calculateQuantities([...slabs,...records],binding,s);assert.equal(calculationSchema.safeParse(data).success,true);
 const p=presentQuantities(data,{specialty:'Hormigón',category:'Walls',floor:''});assert.equal(p.coverage.concrete.total,null);assert.equal(p.coverage.concrete.subtotal,8);assert.equal(p.coverage.concrete.missing,1);
 const zero=presentQuantities(data,{specialty:'Hormigón',category:'Structural Columns',floor:'Piso 1'});assert.equal(zero.coverage.concrete.total,0);assert.equal(zero.coverage.rebar.total,null);assert.equal(zero.coverage.rebar.status,'NOT_APPLICABLE');
 assert.deepEqual(quantityFacets(data.records,{specialty:'Hormigón',category:'Structural Columns',floor:''}).floors,['Piso 1']);
 assert.equal(calculationSchema.safeParse({...data,binding:{...binding,urn:'WRONG_TEST'}}).success,false);
 const partial=calculateQuantities(records,binding,settings());assert.equal(compareCalculations(partial,partial).metrics[0].difference,null);
 assert.throws(()=>compareCalculations(data,{...data,binding:{...binding,itemId:'ANOTHER_TEST_FILE'}}));
});
test('inspection rejects empty/duplicate records and geometry fallback never creates quantities',async()=>{
 await assert.rejects(inspectElements([],binding,async()=>null));await assert.rejects(inspectElements([{dbId:1},{dbId:1}],binding,async()=>null));
 const e=element(1,'Walls',[],geometryFallback({min:[0,0,0],max:[10,10,10]},'TEST no triangle mesh'));assert.equal(concreteQuantity(e).value,null);
});
test('published Revit-prefixed categories and user-approved subdiscipline rules retain their evidence',()=>{
 const e=extractElement({dbId:123,name:'TEST_WALL',properties:[property('Category','Revit Muros'),property('Sub Especialidad','Muros'),property('Volume',1,'m³')]},binding);
 assert.equal(e.category,'Walls');assert.equal(e.specialty,'Hormigón');assert.equal(e.specialtyEvidence.value,null);assert.equal(e.specialtyRule.id,'cgs-structure-classification');assert.equal(e.text.subspecialty.value,'Muros');
 const foreign=extractElement({dbId:124,name:'TEST_UNKNOWN',properties:[property('Category','Revit Muros'),property('Sub Especialidad','TEST_RANDOM')]},binding);assert.equal(foreign.specialty,null);
 const roof=extractElement({dbId:125,name:'TEST_ROOF',properties:[property('Category','Revit Armazón estructural'),property('Especialidad','Hormigón'),property('Nombre de tipo','Metalcon')]},binding);assert.equal(roof.specialty,null);
});
test('rebar uses published bounds for location and parameters for weight without a triangle analysis',async()=>{
 const calls=[],raw=[{dbId:1,properties:[property('Category','Structural Rebar'),property('AEC Piso','N5'),property('Bar Diameter',12,'mm'),property('Bar Length',2,'m'),property('Quantity',3)]}];
 const inspected=await inspectElements(raw,binding,async(id,detail)=>{calls.push([id,detail]);return {...geometryFallback({min:[0,0,12],max:[1,1,14]},null),boundsOnly:true};});
 assert.deepEqual(calls,[[1,'bounds']]);
 const table=[{diameter:12,unit_weight_kg_m:.888,source:AZA_SOURCE,version:'TEST_APPROVED_REFERENCE'}];
 const result=calculateQuantities(inspected,binding,{...settings(),rebarWeightTable:table});close(result.records[0].quantities.rebar.value,5.328);assert.equal(result.records[0].floor.originalRevitLevel,'N5');
 assert.equal(result.records[0].geometry.volume,undefined);
});
test('disjoint overlapping shells do not create a net geometric volume; approved foundation faces remain version-bound',()=>{
 const overlap=inspectTriangles([...box(2,2,2),...box(2,2,2,[1,1,1])]);assert.equal(overlap.closed,false);assert.equal(overlap.volume,null);
 const e=element(1,'Structural Foundations',[],inspectTriangles(box(2,3,4))),s={...settings(),levelBinding:{urn:binding.urn,viewId:binding.viewId},foundationFaces:[{dbId:1,confirmed:true}]};assert.equal(formworkQuantity(e,s,binding).value,40);assert.equal(formworkQuantity(e,s,{...binding,urn:'TEST_OTHER'}).value,null);
});
test('reads every element metadata but avoids unrelated geometry work; repeated filters never re-read geometry',async()=>{
 const calls=[];const raw=[1,2].map(dbId=>({dbId,name:'TEST_'+dbId,properties:[property('Especialidad',dbId===1?'Hormigón':'Otra'),property('Category','Walls'),property('Volume',3,'m³')]}));
 const records=await inspectElements(raw,binding,async id=>{calls.push(id);return geometryFallback(null,'TEST');});assert.deepEqual(calls,[1]);assert.equal(records.length,2);assert.equal(records[1].measures.volume.value,3);assert.match(records[1].geometry.issue,/fuera de/);
 const data=calculateQuantities(records,binding,settings());presentQuantities(data,{specialty:'Hormigón',category:'',floor:''});presentQuantities(data,{specialty:'',category:'Walls',floor:''});assert.deepEqual(calls,[1]);
});

test('native rebar and unambiguous published concrete material work without a custom specialty',()=>{
 const native=(category,props=[])=>extractElement({dbId:1,name:'TEST_NAME_NOT_CLASSIFICATION',properties:[property('Category',category),...props]},binding);
 const concrete=native('Revit Floors',[property('Material','HORMIGÓN'),property('Volume',3,'m³')]);
 assert.equal(concrete.specialty,'Hormigón');assert.equal(concrete.specialtyEvidence.value,null);
 assert.equal(concrete.specialtyRule.id,'published-concrete-material');assert.equal(concrete.specialtyRule.original,'HORMIGÓN');assert.equal(concreteQuantity(concrete).value,3);
 const rebar=native('Revit Structural Rebar',[property('Diameter',12,'mm')]);assert.equal(rebar.specialty,'Enfierradura');assert.equal(rebar.specialtyRule.id,'published-revit-rebar');assert.equal(rebarQuantity(rebar,settings()).weight.value,null);
 const confirmed=native('Revit Muros',[property('Material','H.A.')]);assert.equal(confirmed.specialty,'Hormigón');assert.equal(confirmed.specialtyRule.id,'user-confirmed-ha-material');assert.equal(confirmed.text.material.value,'H.A.');
 for(const props of [[],[property('Type','Hormigón')],[property('Material','TEST_UNKNOWN')],[property('Material','Hormigón'),property('Material','Madera')],[property('Material','Hormigón'),property('Especialidad','Otra')],[property('Material','Hormigón'),property('Especialidad','Hormigón'),property('Specialty','Otra')]])assert.equal(native('Walls',props).specialty,null);
 assert.equal(native('Doors',[property('Material','Hormigón')]).specialty,null);
});

test('unclassified model elements remain filterable by category and published level without entering technical sums',()=>{
 const raw=(dbId,category,level,extra=[])=>element(dbId,category,[property('Level',level),property('Volume',99,'m³'),...extra],undefined,'');
 const records=[raw(1,'Walls','2',[property('Material','HORMIGON')]),raw(2,'Floors','2'),raw(3,'Revit Doors','02'),raw(4,'Walls','3')];
 const data=calculateQuantities(records,binding,settings()),blank={specialty:'',category:'',floor:''};
 assert.equal(calculationSchema.safeParse(data).success,true);
 const all=presentQuantities(data,blank);assert.deepEqual(all.records.map(r=>r.dbId),[1,2,3,4]);assert.equal(all.coverage.concrete.total,99);assert.equal(all.coverage.concrete.eligible,1);
 const options=quantityFacets(data.records,blank);assert.ok(options.specialties.includes(UNCLASSIFIED));assert.deepEqual(new Set(options.categories),new Set(['Walls','Floors','Revit Doors']));assert.deepEqual(new Set(options.floors),new Set(['Nivel publicado: 2','Nivel publicado: 02','Nivel publicado: 3']));
 const level={...blank,floor:'Nivel publicado: 2'};assert.deepEqual(presentQuantities(data,level).records.map(r=>r.dbId),[1,2]);assert.deepEqual(new Set(quantityFacets(data.records,level).categories),new Set(['Walls','Floors']));
 const unknown={...blank,specialty:UNCLASSIFIED,category:'Walls'};assert.deepEqual(presentQuantities(data,unknown).records.map(r=>r.dbId),[4]);assert.equal(presentQuantities(data,unknown).coverage.concrete.total,null);
 assert.equal(data.records[0].floor.resolvedBuildingLevel,'Piso no resuelto');assert.equal(data.records[0].floor.floor_assignment_method,null);assert.equal(data.records[0].floor.status,'REQUIRES_REVIEW');
 const resolved={...data.records[0],floor:{...data.records[0].floor,resolvedBuildingLevel:'Piso confirmado',floor_assignment_method:'MANUAL'}};
 assert.deepEqual(quantityFacets([resolved],blank).floors,['Piso confirmado']);
});

test('multiple values use OR within a facet and AND across facets; exact model selection controls totals, options and rows',()=>{
 const records=[element(1,'Walls',[property('Level','N1'),property('Volume',2,'m³')]),element(2,'Floors',[property('Level','N2'),property('Volume',3,'m³')]),element(3,'Walls',[property('Level','N3'),property('Volume',5,'m³')]),element(4,'Floors',[property('Level','N1'),property('Volume',7,'m³')])];
 const data=calculateQuantities(records,binding,settings());
 const f={specialty:['Hormigón'],category:['Walls','Floors'],floor:['Nivel publicado: N1','Nivel publicado: N2'],selection:null};
 const result=presentQuantities(data,f);assert.deepEqual(result.records.map(e=>e.dbId),[1,2,4]);assert.equal(result.coverage.concrete.total,12);assert.equal(result.rows.reduce((n,r)=>n+r.count,0),3);
 const selected={...f,selection:[1,3,1]};const exact=presentQuantities(data,selected);assert.deepEqual(exact.records.map(e=>e.dbId),[1]);assert.equal(exact.coverage.concrete.total,2);
 const facets=quantityFacets(data.records,selected);assert.deepEqual(facets.categories,['Walls']);assert.deepEqual(facets.floors,['Nivel publicado: N1','Nivel publicado: N3']);
 const empty=presentQuantities(data,{...f,selection:[]});assert.equal(empty.records.length,0);assert.equal(empty.coverage.concrete.total,null);
 assert.equal(presentQuantities(data,{specialty:[],category:[],floor:[],selection:null}).coverage.concrete.total,17);
});
