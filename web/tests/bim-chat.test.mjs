import test from 'node:test';
import assert from 'node:assert/strict';
import { createBimIndex,bimCatalog,queryBim,bimEvidence,validateBimPlan } from '../public/bim-chat-engine.js';
import { classifyProperties } from '../public/quantity-classification.js';
import { catalogSchema,describeBimResult } from '../lib/bim-chat/contracts.ts';
import { checkedBimPlan,planBim } from '../lib/bim-chat/plan.ts';
import { installBimChat } from '../public/bim-chat-viewer.js';

// Explicit TEST fixtures, never imported into the product.
const property=(displayName,displayValue)=>({displayCategory:'TEST',displayName,displayValue});
const element=(dbId,name,properties)=>({dbId,name,externalId:`TEST-${dbId}`,properties,...classifyProperties(properties,name)});
const elements=[element(1,'TEST Muro A',[property('Especialidad','HORMIGÓN'),property('Sub Especialidad','Muro'),property('Nivel','2'),property('Material','Hormigón G25')]),element(2,'TEST Viga',[property('Especialidad','Hormigón'),property('Sub Especialidad','Viga'),property('Nivel','20')]),element(3,'TEST 40CA085',[property('Nombre de tipo','40CA085'),property('Nivel','2')]),element(4,'TEST sin nivel',[property('Especialidad','Hormigón')])];
const index=createBimIndex(elements),catalog=bimCatalog(index);
const plan=(filters=[],action='filter',target='model')=>({kind:'execute',reason:'none',action,target,color:null,filters});
const filter=(field,values,operator='equals')=>({field,values,operator});

test('catalog only describes observed properties and retains rule provenance',()=>{assert.ok(catalogSchema.safeParse(catalog).success);assert.equal(catalog.total,4);assert.ok(catalog.fields.some(f=>f.id==='@specialty'));assert.ok(!catalog.fields.some(f=>f.id.includes('Costo')));});
test('case/accent insensitive criteria match exact facts and known classification',()=>{assert.deepEqual(queryBim(index,plan([filter('@specialty',['hormigon'])])).map(r=>r.element.dbId),[1,2,4]);assert.deepEqual(queryBim(index,plan([filter('@specialty',['Cubierta']),filter('@subspecialty',['Acero Galvanizado'])])).map(r=>r.element.dbId),[3]);});
test('level 2 cannot silently become level 20 and missing is not a negative match',()=>{assert.deepEqual(queryBim(index,plan([filter('@floor',['2'])])).map(r=>r.element.dbId),[1,3]);assert.deepEqual(queryBim(index,plan([filter('@floor',['2'],'not_equals')])).map(r=>r.element.dbId),[2]);});
test('unknown properties fail rather than return an apparent zero; unmatched values are explicit zero',()=>{assert.throws(()=>queryBim(index,plan([filter('p:Costo',['1'])])),/no está disponible/);assert.equal(queryBim(index,plan([filter('@floor',['TEST NO EXISTE'])])).length,0);});
test('partial name search exposes the textual criterion',()=>{const p=plan([filter('@name',['40CA'],'contains')]);const rows=queryBim(index,p);assert.equal(rows.length,1);assert.match(bimEvidence(rows,p,index.rows.length).criteria[0],/contiene 40CA/);});
test('selection actions never broaden to the whole model or accept foreign dbIds',()=>{const p=plan([],'hide','selection');assert.equal(queryBim(index,p,[1]).length,1);assert.throws(()=>queryBim(index,p,[]),/selección válida/);assert.throws(()=>queryBim(index,p,[999]),/selección válida/);assert.throws(()=>queryBim(index,plan()),/Indica qué elementos/);});
test('forbidden action, blank filters and unsafe color fail closed',()=>{assert.throws(()=>validateBimPlan(plan([],'delete')));assert.throws(()=>validateBimPlan({...plan([],'color','selection'),color:'javascript:alert(1)'}));assert.throws(()=>validateBimPlan(plan([filter('@name',[' '])])));assert.throws(()=>validateBimPlan(plan([filter('@floor',['2'])],'showAll')));});
test('planner only accepts known fields; user-facing count comes from deterministic result',()=>{assert.throws(()=>checkedBimPlan(plan([filter('imaginary',['X'])]),catalog));const p=checkedBimPlan(plan([filter('@specialty',['Hormigón'])]),catalog);const r={...bimEvidence(queryBim(index,p),p,index.rows.length),action:p.action};assert.match(describeBimResult(r),/Encontré 3 elementos/);});
test('partial samples never change the actual count',()=>{const many=createBimIndex(Array.from({length:12},(_,n)=>element(n,`TEST ${n}`,[property('Especialidad','Hormigón')])));const p=plan([filter('@specialty',['Hormigón'])]);const evidence=bimEvidence(queryBim(many,p),p,many.rows.length);assert.equal(evidence.count,12);assert.equal(evidence.sample.length,8);assert.equal(evidence.samplePartial,true);});
test('property evidence preserves published units without converting or inferring missing units',()=>{const local=createBimIndex([element(1,'TEST',[{...property('Volumen',1.5),units:'autodesk.unit.unit:cubicMeters-1.0.1'},property('Altura',2)])]);const p=plan([],'properties','selection');const properties=bimEvidence(queryBim(local,p,[1]),p,1).sample[0].properties;assert.equal(properties.find(p=>p.name==='TEST / Volumen').units,'autodesk.unit.unit:cubicMeters-1.0.1');assert.equal(properties.find(p=>p.name==='TEST / Altura').units,'');});
test('incomplete model reads fail; generated plan never executes returned code',async()=>{assert.throws(()=>createBimIndex([...elements,elements[0]]));const fake=async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...plan([filter('@name',['TEST'])]),action:'executeJavaScript'})}]}]}));await assert.rejects(()=>planBim({question:'TEST',catalog,previous:[],selectionCount:0},{key:'TEST',model:'TEST'},AbortSignal.timeout(1000),fake));});

function fakeViewer(){
  const calls=[],messages=[],listeners=new Map(),viewerListeners=new Map();
  const parent={postMessage:data=>messages.push(data)},window={location:{origin:'https://test.invalid'},parent,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  let selection=[];
  const viewer={model:{},getSelection:()=>selection,addEventListener:(name,fn)=>viewerListeners.set(name,fn),removeEventListener:name=>viewerListeners.delete(name)};
  for(const method of ['setGhosting','showAll','show','isolate','fitToView','hide','clearThemingColors','setThemingColor'])viewer[method]=(...args)=>calls.push([method,...args]);
  viewer.select=ids=>{selection=ids;viewerListeners.get('selection')?.();calls.push(['select',ids]);};viewer.clearSelection=()=>viewer.select([]);
  globalThis.window=window;globalThis.Autodesk={Viewing:{SELECTION_CHANGED_EVENT:'selection'}};globalThis.THREE={Vector4:class{constructor(...values){this.values=values;}}};
  const input={urn:'TEST-URN',viewId:'TEST-VIEW'};
  const send=(requestId,p,overrides={})=>listeners.get('message')({origin:window.location.origin,source:parent,data:{type:'aiforma-bim-request',...input,requestId,operation:'execute',plan:p,...overrides}});
  return {viewer,calls,messages,send,input};
}
test('filtering leaves geometry untouched and actions use the filter independently of native clicks',async()=>{
  const f=fakeViewer(),dispose=installBimChat(f.viewer,f.input,async()=>elements);
  await f.send('wrong',plan([filter('@specialty',['Hormigón'])]),{urn:'OTHER'});assert.equal(f.calls.length,0);
  await f.send('filter',plan([filter('@specialty',['Hormigón'])]));
  assert.equal(f.messages.at(-1).result.filteredCount,3);assert.equal(f.messages.at(-1).result.selectionCount,0);
  assert.equal(f.messages.at(-1).result.filterActive,true);
  assert.ok(f.calls.every(c=>c[0]==='select'&&c[1].length===0),'filter never isolates, colors, selects or moves camera');
  f.viewer.select([3]);assert.equal(f.messages.at(-1).selectionCount,1);assert.equal(f.messages.at(-1).filteredCount,3);
  await f.send('color',{...plan([],'color','filter'),color:'rojo'});
  assert.deepEqual(f.calls.filter(c=>c[0]==='setThemingColor').map(c=>c[1]),[1,2,4]);assert.equal(f.messages.at(-1).result.selectionCount,0);
  f.viewer.select([]);
  await f.send('isolate',plan([],'isolate','filter'));assert.deepEqual(f.calls.find(c=>c[0]==='isolate')[1],[1,2,4]);
  const count=f.calls.length;await f.send('isolate',plan([],'isolate','filter'));assert.equal(f.calls.length,count);
  await f.send('not-found',plan([filter('@floor',['999'])]));assert.equal(f.messages.at(-1).result.filteredCount,0);
  const hides=f.calls.filter(c=>c[0]==='hide').length;
  f.viewer.select([1]);await f.send('no-current',plan([],'hide','filter'));
  assert.equal(f.messages.at(-1).result.count,0);assert.equal(f.calls.filter(c=>c[0]==='hide').length,hides);
  await f.send('clear',plan([],'clearFilter'));assert.equal(f.messages.at(-1).result.filterActive,false);
  await f.send('no-filter',plan([],'hide','filter'));assert.match(f.messages.at(-1).error,/filtro válido/);
  dispose();
});
test('legacy select plans filter and a new conversation clears the filter',async()=>{
  const f=fakeViewer(),dispose=installBimChat(f.viewer,f.input,async()=>elements);
  await f.send('legacy',plan([filter('@floor',['2'])],'select'));
  assert.equal(f.messages.at(-1).result.filteredCount,2);assert.deepEqual(f.viewer.getSelection(),[]);
  assert.ok(f.calls.every(c=>c[0]!=='select'||c[1].length===0));
  await f.send('reset',null,{operation:'cancel',resetFilter:true});
  assert.equal(f.messages.at(-1).filterActive,false);
  await f.send('stale',plan([],'hide','filter'));assert.match(f.messages.at(-1).error,/filtro válido/);dispose();
});
test('filter cannot fall back to manual selection or the model; explicit manual actions remain possible',()=>{
  const p=plan([],'properties','filter');
  assert.throws(()=>queryBim(index,p,[1],null),/filtro válido/);
  assert.throws(()=>queryBim(index,p,[1],[999]),/filtro válido/);
  assert.deepEqual(queryBim(index,p,[1],[]),[]);
  assert.deepEqual(queryBim(index,p,[3],[1,2]).map(r=>r.element.dbId),[1,2]);
  assert.deepEqual(queryBim(index,plan([],'properties','selection'),[3],[1,2]).map(r=>r.element.dbId),[3]);
});

test('model changed/cancelled while reading never applies stale action',async()=>{const f=fakeViewer();let finish;const dispose=installBimChat(f.viewer,f.input,()=>new Promise(resolve=>finish=resolve));const running=f.send('slow',plan([filter('@specialty',['Hormigón'])]));await f.send('cancel',null,{operation:'cancel'});finish(elements);await running;assert.equal(f.calls.length,0);assert.equal(f.messages.length,0);dispose();});
