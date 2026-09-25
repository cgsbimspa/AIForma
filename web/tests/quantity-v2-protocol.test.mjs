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
// TEST viewer and window only. No Autodesk model is mutated.
function fixture(read=async()=>elements){const calls=[],messages=[],listeners=new Map(),parent={postMessage:m=>messages.push(m)},old=globalThis.window;globalThis.window={location:{origin:'https://test.invalid'},parent,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};const viewer={model:{getUnitString:()=>null,getUpVector:()=>[0,0,1]}};for(const m of ['clearSelection','showAll','setGhosting','isolate','hide','fitToView'])viewer[m]=(...args)=>calls.push([m,...args]);const dispose=installQuantityV2(viewer,input,read);let id=0;return {calls,messages,send:(data,origin='https://test.invalid',source=parent)=>listeners.get('message')({origin,source,data:{type:'aiforma-quantity-v2',requestId:'TEST_'+(++id),...input,...data}}),close:()=>{dispose();globalThis.window=old;}};}
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
