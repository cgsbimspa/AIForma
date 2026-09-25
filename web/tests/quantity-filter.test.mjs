import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuantityFilter} from '../public/quantity-filter.js';
import {classifyProperties} from '../public/quantity-classification.js';
// Synthetic TEST-only model. Never used by the application.
const elements=[1,2,3].map(dbId=>{const properties=[{displayName:'Especialidad',displayValue:dbId===3?'Cubierta':'Hormigón'}];return {dbId,properties,...classifyProperties(properties)};});
const base={highlightedElementIds:[],filteredElementIds:null,classificationFilter:{specialty:'Hormigón',subspecialty:'',floor:''}};
const key=data=>JSON.stringify([data.filteredElementIds,data.classificationFilter??null]);
function fixture(read=async()=>elements){
  let selected=[];const calls=[],messages=[],reports=[];
  const viewer={getSelection:()=>selected};
  for(const method of ['setGhosting','showAll','isolate','hide','fitToView'])viewer[method]=(...args)=>calls.push([method,...args]);
  viewer.select=ids=>{selected=ids;calls.push(['select',ids]);};
  const controller=createQuantityFilter(viewer,{mapping:async()=>({'TEST-1':1,'TEST-2':2,'TEST-3':3}),classified:read,send:m=>messages.push(m),report:(...args)=>reports.push(args)});
  return {viewer,calls,messages,reports,controller};
}
test('Cubicaciones filters without selection and manual visibility targets all matching IDs',async()=>{
  const f=fixture();await f.controller.update(base);
  assert.equal(f.messages.findLast(m=>m.state==='filter').count,2);assert.deepEqual(f.viewer.getSelection(),[]);
  assert.equal(f.calls.some(c=>c[0]==='select'&&c[1].length>0),false);
  f.viewer.select([3]);
  f.controller.applyVisibility('isolate','filter',key(base));assert.deepEqual(f.calls.findLast(c=>c[0]==='isolate')[1],[1,2]);assert.deepEqual(f.viewer.getSelection(),[]);
  f.controller.applyVisibility('attenuate','filter',key(base));assert.deepEqual(f.calls.findLast(c=>c[0]==='setGhosting'),['setGhosting',true]);
  f.controller.applyVisibility('hide','filter',key(base));assert.deepEqual(f.calls.findLast(c=>c[0]==='hide')[1],[1,2]);
  f.controller.applyVisibility('filter','filter',key(base));assert.equal(f.messages.findLast(m=>m.state==='filter').mode,'filter');assert.equal(f.messages.findLast(m=>m.state==='filter').count,2);
});
test('empty, pending, failed and outdated filters cannot act on previous matches or native selection',async()=>{
  let finish;const f=fixture(()=>new Promise(resolve=>finish=resolve));const pending=f.controller.update(base);
  f.viewer.select([3]);f.controller.applyVisibility('hide','filter',key(base));assert.equal(f.calls.some(c=>c[0]==='hide'),false);
  const empty={...base,filteredElementIds:[]};await f.controller.update(empty);finish(elements);await pending;
  assert.equal(f.messages.findLast(m=>m.state==='filter').count,0);
  f.controller.applyVisibility('hide','filter',key(base));f.controller.applyVisibility('hide','filter',key(empty));assert.equal(f.calls.some(c=>c[0]==='hide'),false);
  await f.controller.update({...base,filteredElementIds:['TEST-404']});
  assert.equal(f.messages.findLast(m=>m.state==='filter').phase,'error');
  f.controller.applyVisibility('hide','selection',key({...base,filteredElementIds:['TEST-404']}));assert.equal(f.calls.some(c=>c[0]==='hide'),false);
});
test('table clicks can select explicitly without replacing the active filter',async()=>{
  const f=fixture();await f.controller.update(base);await f.controller.update({...base,highlightedElementIds:['TEST-1']});
  assert.deepEqual(f.viewer.getSelection(),[1]);f.controller.applyVisibility('hide','filter',key(base));assert.deepEqual(f.calls.findLast(c=>c[0]==='hide')[1],[1,2]);
  const changed={...base,highlightedElementIds:['TEST-1'],classificationFilter:{...base.classificationFilter,specialty:'Cubierta'}};
  await f.controller.update(changed);assert.deepEqual(f.viewer.getSelection(),[]);assert.equal(f.messages.findLast(m=>m.state==='filter').count,1);
});
