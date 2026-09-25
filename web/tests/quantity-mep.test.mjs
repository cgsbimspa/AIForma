import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMEPElement, calculateMEPQuantities, inspectMEPElements, presentMEP, resolveMEPSystem, compareMEP, resolveMEPFloor } from '../public/quantity-v2/mep-service.js';
import { mepCategories } from '../public/quantity-v2/mep-catalog.js';
import { defaultSettings, filterRecords, quantityFacets } from '../public/quantity-v2/quantity-service.js';
import { calculationSchema, settingsSchema } from '../lib/quantities-v2/contracts.ts';
// Synthetic TEST fixtures only; never used by the app or sent to Autodesk.
const binding={projectId:'TEST_PROJECT',itemId:'TEST_ITEM',versionId:'TEST_V1',versionNumber:1,urn:'TEST_URN',viewId:'TEST_VIEW',fileName:'TEST_MEP.rvt',viewName:'TEST_3D',projectName:'TEST_PROJECT'};
const p=(displayName,displayValue,units='')=>({displayName,displayValue,units,displayCategory:'TEST'});
const blank={specialty:[],category:[],floor:[],selection:null};
function raw(id,category,properties=[]){return {dbId:id,externalId:'TEST_UNIQUE_'+id,name:'TEST_ELEMENT',properties:[p('ElementId',String(id)),p('Category',category),p('Type','TEST_TYPE'),...properties]};}
function element(id,category,properties=[]){return {...extractMEPElement(raw(id,category,properties),binding),geometry:{available:false,issue:'TEST_NO_GEOMETRY'}};}
const calculate=(records,settings=defaultSettings())=>calculateMEPQuantities(records,binding,settings);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
test('MEP does not classify Pipes from category, file names, or approximate system text',()=>{
 for(const props of [[],[p('System Type','TEST_APF_Anything')],[p('System Classification','OtherPipe')]]){
  const r=calculate([element(1,'Pipes',props)]).records[0];assert.equal(r.specialty,null);assert.ok(r.mep.system.issue);assert.equal(r.mep.quantity.value,null);
 }
 const r=calculate([element(1,'Pipes',[p('System Classification','Domestic Cold Water'),p('Length',12540,'mm')])]).records[0];assert.equal(r.specialty,'APF');near(r.mep.quantity.value,12.54);assert.equal(r.mep.system.source,'REVIT_SYSTEM_CLASSIFICATION');
});
test('explicit MEP specialty and system conflicts are visible, not silently combined',()=>{
 const e=element(1,'Pipes',[p('Especialidad','APF'),p('System Classification','DomesticHotWater')]);assert.equal(resolveMEPSystem(e,defaultSettings()).specialty,null);
 const settings={...defaultSettings(),mepSystemRules:[{field:'systemClassification',value:'DomesticHotWater',specialty:'APC'}]};
 const r=calculate([e],settings).records[0];assert.equal(r.specialty,'APC');assert.equal(r.mep.system.source,'USER_CONFIGURATION');assert.equal(settingsSchema.safeParse(settings).success,true);
 assert.equal(settingsSchema.safeParse({...settings,mepSystemRules:[...settings.mepSystemRules,...settings.mepSystemRules]}).success,false);
});
test('all configured categories have deterministic count or length and keep source/version',()=>{
 const data=calculate(mepCategories.map((c,i)=>element(i+1,c.category,[p('Length',10,'ft')])));
 for(const e of data.records){assert.equal(e.source.versionId,binding.versionId);assert.equal(e.mep.rule.version,'1');if(e.mep.unit==='ml')near(e.mep.quantity.value,3.048);else {assert.equal(e.mep.quantity.value,1);assert.equal(e.mep.quantity.source,'ELEMENT_COUNT');}}
 assert.equal(calculationSchema.safeParse(data).success,true);
});
test('count uses unique ElementId, not published Quantity or geometry instances',()=>{
 const r=calculate([element(1,'Pipe Fittings',[p('Quantity',20)])]).records[0];assert.equal(r.mep.quantity.value,1);
 const rawElement=raw(2,'Pipe Fittings');rawElement.properties=rawElement.properties.filter(p=>p.displayName!=='ElementId');
 const missing=extractMEPElement(rawElement,binding);missing.geometry={available:false,issue:'TEST'};assert.equal(calculate([missing]).records[0].mep.quantity.value,null);
 const duplicate=element(2,'Pipe Fittings');duplicate.elementId='1';const data=calculate([element(1,'Pipe Fittings'),duplicate]);assert.ok(data.records.every(e=>e.mep.quantity.value===null));
});
test('unknown and ambiguous units or measures stay pending; zero is retained only when published',()=>{
 const data=calculate([element(1,'Pipes',[p('Length',10)]),element(2,'Pipes',[p('Length',0,'m')]),element(3,'Pipes',[p('Length',2,'m'),p('Longitud',5,'m')]),element(4,'Pipes',[p('Length',-2,'m')])]);
 assert.deepEqual(data.records.map(e=>e.mep.quantity.value),[null,0,null,null]);const c=presentMEP(data,blank).cards[0].coverage;assert.equal(c.total,null);assert.equal(c.subtotal,0);assert.equal(c.read,1);
});
test('rectangular and circular ducts use metric section dimensions and traced formulas',()=>{
 const d=calculate([element(1,'Ducts',[p('Length',10,'m'),p('Width',400,'mm'),p('Height',200,'mm'),p('Shape','Rectangular')]),element(2,'Ducts',[p('Length',10,'m'),p('Diameter',250,'mm')]),element(3,'Ducts',[p('Length',10,'m'),p('Diameter',250,'mm'),p('Width',400,'mm'),p('Height',200,'mm')])]);
 near(d.records[0].mep.surface.value,12);near(d.records[1].mep.surface.value,Math.PI*.25*10);assert.equal(d.records[2].mep.surface.value,null);assert.match(d.records[0].mep.surface.formula,/Width/);assert.equal(d.records[0].mep.surface.inputs.length,3);
});
test('published connector size is used only if the corresponding parameter is absent',()=>{
 const d=calculate([element(1,'Pipes',[p('Connector Diameter',25,'mm')]),element(2,'Pipes',[p('Diameter',32,'mm'),p('Connector Diameter',25,'mm')]),element(3,'Pipes',[p('Diameter',32),p('Connector Diameter',25,'mm')])]);
 assert.equal(d.records[0].measures.diameter.source,'REVIT_CONNECTOR');near(d.records[0].measures.diameter.value,.025);near(d.records[1].measures.diameter.value,.032);assert.equal(d.records[2].measures.diameter.value,null);
});
test('oval or unknown duct section never receives a rectangular surface formula',()=>{
 for(const shape of [null,'Oval']){const d=calculate([element(1,'Ducts',[p('Length',10,'m'),p('Width',400,'mm'),p('Height',200,'mm'),...(shape?[p('Shape',shape)]:[])])]);assert.equal(d.records[0].mep.surface.value,null);assert.equal(d.records[0].mep.quantity.value,10);}
});
test('MEP group keys preserve exact dimensions and systems, and all three facets intersect selections',()=>{
 const data=calculate([element(1,'Pipes',[p('Especialidad','APF'),p('System Type','TEST_S1'),p('Diameter',25,'mm'),p('Length',2,'m')]),element(2,'Pipes',[p('Especialidad','APF'),p('System Type','TEST_S2'),p('Diameter',25,'mm'),p('Length',3,'m')]),element(3,'Pipes',[p('Especialidad','APC'),p('Diameter',25.00001,'mm'),p('Length',4,'m')])]);
 assert.equal(presentMEP(data,blank).rows.length,3);assert.equal(presentMEP(data,{...blank,specialty:['APF']}).cards[0].coverage.total,5);
 const filter={...blank,specialty:['APF','APC'],selection:[2,3]};assert.deepEqual(filterRecords(data.records,filter).map(e=>e.dbId),[2,3]);assert.deepEqual(quantityFacets(data.records,{...blank,selection:[3]}).specialties,['APC']);
});
test('floor filter never substitutes original Revit level for a resolved floor',()=>{
 const data=calculate([element(1,'Pipes',[p('Level','NIV_INST_+6.10')])]);assert.deepEqual(quantityFacets(data.records,blank).floors,['Piso no resuelto']);assert.equal(data.records[0].floor.originalRevitLevel,'NIV_INST_+6.10');
 const settings={...defaultSettings(),levelBinding:{urn:binding.urn,viewId:binding.viewId},manualFloors:[{dbId:1,label:'TEST_Piso 3'}]};assert.equal(calculate([element(1,'Pipes')],settings).records[0].floor.floor_assignment_method,'MANUAL');
 assert.equal(calculate([element(1,'Pipes')],{...settings,levelBinding:{urn:'TEST_OLD',viewId:binding.viewId}}).records[0].floor.resolvedBuildingLevel,'Piso no resuelto');
});
test('multilevel pipe retains complete length in MULTILEVEL instead of a predominant floor',()=>{
 const e=element(1,'Pipes',[p('Length',12,'m')]);e.geometry={available:true,issue:null,bbox:{min:[1,1,.5],max:[2,2,5.5]},centroid:[1.5,1.5,3]};
 const bounds={min:[0,0,0],max:[10,10,6]},resolver={issue:null,base:{dbIds:[]},intervals:[{id:'TEST_A',label:'TEST_P1',lowerZ:0,upperZ:3,lowerBounds:bounds,upperBounds:bounds},{id:'TEST_B',label:'TEST_P2',lowerZ:3,upperZ:6,lowerBounds:bounds,upperBounds:bounds}]};
 const floor=resolveMEPFloor(e,resolver,defaultSettings(),binding);assert.equal(floor.resolvedBuildingLevel,'MULTILEVEL');assert.equal(floor.floor_assignment_method,'MULTILEVEL');assert.equal(floor.intervals.length,2);assert.equal(e.measures.length.value,12);
});
test('inspection retains actual reference slabs and MEP bounds, never a made-up length from bounding boxes',async()=>{
 const geometries=[];const read=await inspectMEPElements([raw(1,'Pipes'),raw(2,'Floors',[p('Material','H.A.')]),raw(3,'Walls')],binding,async(id,mode)=>{geometries.push([id,mode]);return {available:true,issue:null,bbox:{min:[0,0,0],max:[1,2,3]}};});
 assert.deepEqual(geometries,[[1,'bounds'],[2,'mesh']]);const data=calculate(read);assert.equal(data.records.length,1);assert.equal(data.referenceRecords.length,1);assert.equal(data.records[0].mep.quantity.value,null);assert.equal(calculationSchema.safeParse(data).success,true);
});
test('comparison rejects other models, separates metrics, and does not turn missing into zero',()=>{
 const a=calculate([element(1,'Pipes',[p('Length',2,'m')])]),b=calculate([element(1,'Pipes',[p('Length',5,'m')]),element(2,'Pipe Fittings')]);b.binding={...binding,versionId:'TEST_V2',versionNumber:2};
 assert.equal(compareMEP(a,b).metrics.find(m=>m.metric==='pipes').difference,3);assert.equal(compareMEP(a,b).metrics.find(m=>m.metric==='pipeFittings').difference,null);
 assert.throws(()=>compareMEP(a,{...b,binding:{...b.binding,itemId:'TEST_OTHER'}}));
 assert.equal(calculationSchema.safeParse({...a,records:a.records.map(e=>({...e,source:{...e.source,projectId:'TEST_FOREIGN'}}))}).success,false);
});
