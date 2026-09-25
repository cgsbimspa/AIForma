import test from 'node:test';
import assert from 'node:assert/strict';
import {installQuantityV2} from '../public/quantity-v2/viewer.js';
import {defaultSettings} from '../public/quantity-v2/quantity-service.js';
test('changing filters discards a row subset and preserves visual mode; clearing restores the full model',async()=>{
 const f=fixture();try{
  await f.send({operation:'calculate',binding,settings:defaultSettings()});
  const filter={specialty:'Hormigón',category:'',floor:''};
  await f.send({operation:'filter',filter});
  await f.send({operation:'visibility',filterKey:JSON.stringify(filter),action:'isolate',dbIds:[1]});
  assert.deepEqual(f.calls.findLast(c=>c[0]==='isolate')[1],[1]);
  await f.send({operation:'filter',filter:{...filter,category:'Walls'}});
  assert.equal(f.messages.at(-1).mode,'isolate');assert.deepEqual(f.calls.findLast(c=>c[0]==='isolate')[1],[1,2]);
  await f.send({operation:'visibility',filterKey:JSON.stringify({...filter,category:'Walls'}),action:'attenuate'});
  await f.send({operation:'filter',filter});assert.equal(f.messages.at(-1).mode,'attenuate');
  await f.send({operation:'filter',filter:{specialty:'',category:'',floor:''}});assert.equal(f.messages.at(-1).mode,'filter');assert.deepEqual(f.calls.at(-1),['showAll']);
  const count=f.calls.length;await f.send({operation:'visibility',filterKey:JSON.stringify(filter),action:'isolate',dbIds:[1]});assert.equal(f.calls.length,count);
 }finally{f.close();}
});
const input={urn:'TEST_URN',viewId:'TEST_VIEW'},binding={...input,projectId:'TEST_PROJECT',itemId:'TEST_FILE',versionId:'TEST_V1',versionNumber:1,fileName:'TEST.rvt',viewName:'TEST_VIEW',projectName:'TEST_PROJECT'};
const elements=[1,2,3].map(dbId=>({dbId,externalId:'TEST_'+dbId,properties:[{displayName:'Especialidad',displayValue:dbId===3?'Otro':'Hormigón'},{displayName:'Category',displayValue:'Walls'},{displayName:'Volume',displayValue:dbId,units:'m³'}]}));
test('MEP viewer calculates actual length and filters the same IDs; template changes cannot reuse structural extraction',async()=>{
 const pipes=[1,2].map(dbId=>({dbId,externalId:'TEST_MEP_'+dbId,properties:[{displayName:'ElementId',displayValue:String(dbId)},{displayName:'Especialidad',displayValue:dbId===1?'APF':'APC'},{displayName:'Category',displayValue:'Pipes'},{displayName:'Length',displayValue:dbId*2,units:'m'}]}));
 const f=fixture(async()=>pipes);try{
  await f.send({operation:'calculate',template:'mep',binding,settings:defaultSettings()});const data=f.messages.at(-1).calculation;assert.equal(data.engine,'mep-quantities-v1.0');assert.deepEqual(data.records.map(e=>e.mep.quantity.value),[2,4]);
  await f.send({operation:'filter',filter:{specialty:['APF'],category:[],floor:[],selection:null}});assert.equal(f.messages.at(-1).count,1);assert.deepEqual(f.calls.findLast(c=>c[0]==='isolate')[1],[1]);
  await f.send({operation:'calculate',binding,settings:defaultSettings()});assert.equal(f.messages.at(-1).calculation.engine,'view-quantities-v2.5');assert.ok(f.messages.at(-1).calculation.records.every(e=>!e.mep));
 }finally{f.close();}
});
// TEST viewer and window only. No Autodesk model is mutated.
function fixture(read=async()=>elements){
 const calls=[],messages=[],listeners=new Map(),selectionListeners=new Map(),parent={postMessage:m=>messages.push(m)},old=globalThis.window,oldSdk=globalThis.Autodesk;
 globalThis.window={location:{origin:'https://test.invalid'},parent,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};
 globalThis.Autodesk={Viewing:{SELECTION_CHANGED_EVENT:'TEST_SELECTION'}};
 const viewer={model:{getUnitString:()=>null,getUpVector:()=>[0,0,1],getInstanceTree:()=>({enumNodeChildren:(id,fn)=>{if(id===100)[1,2].forEach(fn);}})},addEventListener:(name,fn)=>selectionListeners.set(name,fn),removeEventListener:name=>selectionListeners.delete(name)};
 const pick=(ids,model=viewer.model)=>selectionListeners.get('TEST_SELECTION')?.({model,dbIdArray:ids});
 for(const m of ['clearSelection','showAll','setGhosting','isolate','hide','fitToView'])viewer[m]=(...args)=>{calls.push([m,...args]);if(m==='clearSelection')pick([]);};
 const dispose=installQuantityV2(viewer,input,read);let id=0;
 return {calls,messages,pick,selectionListeners,send:(data,origin='https://test.invalid',source=parent)=>listeners.get('message')({origin,source,data:{type:'aiforma-quantity-v2',requestId:'TEST_'+(++id),...input,...data}}),close:()=>{dispose();globalThis.window=old;globalThis.Autodesk=oldSdk;}};
}
test('v2 filters automatically isolate and visibility cannot act on IDs outside the active filter',async()=>{const f=fixture();try{await f.send({operation:'calculate',binding,settings:defaultSettings()});assert.equal(f.messages.at(-1).phase,'complete');const filter={specialty:'Hormigón',category:'Walls',floor:''};await f.send({operation:'filter',filter});assert.equal(f.messages.at(-1).count,2);assert.equal(f.calls.some(c=>c[0]==='isolate'),true);await f.send({operation:'visibility',filterKey:JSON.stringify(filter),action:'isolate'});assert.deepEqual(f.calls.findLast(c=>c[0]==='isolate')[1],[1,2]);await f.send({operation:'visibility',filterKey:JSON.stringify(filter),action:'hide'});assert.deepEqual(f.calls.at(-2),['showAll']);assert.deepEqual(f.calls.at(-1),['hide',[1,2]]);const count=f.calls.length;await f.send({operation:'visibility',filterKey:JSON.stringify(filter),action:'isolate',dbIds:[3]});assert.equal(f.calls.length,count);await f.send({operation:'filter',filter:{...filter,specialty:'Enfierradura'}});assert.equal(f.messages.at(-1).count,0);await f.send({operation:'visibility',filterKey:JSON.stringify(filter),action:'hide'});assert.notEqual(f.calls.at(-1)[0],'hide');}finally{f.close();}});
test('cancellation, source mismatch, foreign messages and stale calculation do not yield current results',async()=>{let finish;const f=fixture(()=>new Promise(resolve=>finish=resolve));try{await f.send({operation:'calculate',binding,settings:defaultSettings()},'https://foreign.invalid');assert.equal(f.messages.length,0);await f.send({operation:'calculate',binding:{...binding,urn:'WRONG'},settings:defaultSettings()});assert.equal(f.messages.at(-1).phase,'error');const pending=f.send({operation:'calculate',binding,settings:defaultSettings()});await f.send({operation:'cancel'});finish(elements);await pending;assert.equal(f.messages.some(m=>m.phase==='complete'),false);await f.send({operation:'filter',filter:{specialty:'',category:'',floor:''}});assert.equal(f.messages.at(-1).phase,'error');}finally{f.close();}});

test('category and published-level filters also control visibility for elements missing custom specialty',async()=>{
 const raw=[1,2].map(dbId=>({dbId,properties:[{displayName:'Category',displayValue:'Walls'},{displayName:'Level',displayValue:String(dbId)}]}));
 const f=fixture(async()=>raw);try{
  await f.send({operation:'calculate',binding,settings:defaultSettings()});
  const filter={specialty:'',category:'Walls',floor:'Nivel publicado: 2'};await f.send({operation:'filter',filter});assert.equal(f.messages.at(-1).count,1);assert.equal(f.calls.some(c=>c[0]==='isolate'),true);
  for(const action of ['isolate','hide','attenuate']){await f.send({operation:'visibility',filterKey:JSON.stringify(filter),action});assert.deepEqual(f.calls.findLast(c=>c[0]===(action==='hide'?'hide':'isolate'))[1],[2]);}
  await f.send({operation:'filter',filter:{specialty:'',category:'',floor:''}});assert.equal(f.messages.at(-1).count,2);
 }finally{f.close();}
});

test('manual selection expands groups, narrows data without moving the camera, and rejects a stale filter',async()=>{
 const f=fixture();try{
  await f.send({operation:'calculate',binding,settings:defaultSettings()});
  const calculationId=f.messages.at(-1).requestId,blank={specialty:[],category:[],floor:[],selection:null};
  await f.send({operation:'filter',filter:blank});assert.equal(f.messages.some(m=>m.phase==='selection'),false);
  f.pick([100,1]);const event=f.messages.at(-1);assert.equal(event.phase,'selection');assert.equal(event.requestId,calculationId);assert.deepEqual(event.dbIds,[1,2]);
  const calls=f.calls.length;await f.send({operation:'filter',filter:blank});assert.equal(f.calls.length,calls);
  const selected={...blank,selection:event.dbIds};await f.send({operation:'filter',filter:selected,selectionRevision:event.selectionRevision});
  assert.equal(f.messages.at(-1).count,2);assert.equal(f.messages.at(-1).mode,'selection');assert.equal(f.calls.length,calls);
  await f.send({operation:'visibility',filterKey:JSON.stringify(selected),action:'isolate'});
  assert.deepEqual(f.calls.findLast(c=>c[0]==='isolate')[1],[1,2]);assert.equal(f.messages.filter(m=>m.phase==='selection').length,1,'programmatic deselection must not remove the data scope');
  f.pick([2,3]);assert.deepEqual(f.messages.at(-1).dbIds,[2,3]);
  f.pick([]);const cleared=f.messages.at(-1);assert.equal(cleared.dbIds,null);
  await f.send({operation:'filter',filter:blank,selectionRevision:cleared.selectionRevision});assert.equal(f.messages.at(-1).count,3);assert.equal(f.messages.at(-1).mode,'filter');
  const count=f.messages.length;f.pick([1],{});assert.equal(f.messages.length,count,'foreign models are not accepted');
  await f.send({operation:'cancel'});f.pick([1]);assert.equal(f.messages.length,count);
 }finally{f.close();assert.equal(f.selectionListeners.size,0);}
});

test('multiselect OR filters intersect with exact selection and reject unknown element IDs',async()=>{
 const f=fixture();try{
  await f.send({operation:'calculate',binding,settings:defaultSettings()});
  const filter={specialty:['Hormigón','Enfierradura'],category:['Walls','Floors'],floor:[],selection:null};
  await f.send({operation:'filter',filter});assert.equal(f.messages.at(-1).count,2);
  f.pick([1,999]);const event=f.messages.at(-1);assert.deepEqual(event.dbIds,[1]);
  await f.send({operation:'filter',filter:{...filter,selection:[1]},selectionRevision:event.selectionRevision});assert.equal(f.messages.at(-1).count,1);
  const calls=f.calls.length;await f.send({operation:'filter',filter:{...filter,selection:[999]},selectionRevision:event.selectionRevision});assert.equal(f.calls.length,calls);
  f.pick([999]);assert.deepEqual(f.messages.at(-1).dbIds,[],'unknown selected objects cannot silently display full-model sums');
 }finally{f.close();}
});
