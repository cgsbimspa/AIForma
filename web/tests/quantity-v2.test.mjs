import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectTriangles, geometryFallback } from '../public/quantity-v2/geometry.js';
import { readMeasure, extractElement } from '../public/quantity-v2/properties.js';
import { concreteQuantity, formworkQuantity, rebarQuantity } from '../public/quantity-v2/services.js';
import { defaultSettings, calculateQuantities, inspectElements, presentQuantities, quantityFacets, compareCalculations } from '../public/quantity-v2/quantity-service.js';
import { slabCandidates, buildIntervals, resolveLevel } from '../public/quantity-v2/levels.js';
import { calculationSchema, settingsSchema } from '../lib/quantities-v2/contracts.ts';
// Synthetic TEST geometry and parameters only. Not included in application data.
const binding={projectId:'TEST_PROJECT',itemId:'TEST_FILE',versionId:'TEST_V1',versionNumber:1,urn:'TEST_URN_1',viewId:'TEST_VIEW',fileName:'TEST.rvt',viewName:'TEST_VIEW',projectName:'TEST_PROJECT'};
const property=(displayName,displayValue,units='')=>({displayName,displayValue,units,displayCategory:'TEST_PARAMETERS'});
function box(x,y,z,origin=[0,0,0]){const p=[[0,0,0],[x,0,0],[x,y,0],[0,y,0],[0,0,z],[x,0,z],[x,y,z],[0,y,z]].map(v=>v.map((n,i)=>n+origin[i]));return [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]].flatMap(([a,b,c,d])=>[[p[a],p[b],p[c]],[p[a],p[c],p[d]]]);}
function element(dbId,category='Walls',measures=[],geometry=geometryFallback(null,'TEST_NO_GEOMETRY'),specialty='Hormigón'){return {...extractElement({dbId,externalId:'TEST_EXTERNAL_'+dbId,name:'TEST_ELEMENT_'+dbId,properties:[property('Especialidad',specialty),property('Category',category),...measures]},binding),geometry};}
const settings=()=>settingsSchema.parse(defaultSettings());
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
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
