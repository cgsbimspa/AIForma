import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyProperties, readViewClassification, selectClassifiedElements, classificationRule, associateSubspecialty} from '../public/quantity-classification.js';
import {visibleQuantityMetrics, projectQuantityRows, filterQuantityRows, filterSubspecialties} from '../lib/quantities/presentation.ts';

// TEST properties, isolated from product routes and real quantities.
const prop = (displayName, displayValue) => ({displayName, displayValue});
test('user classification respects the concrete OR, accents, strict other specialties and no inferred quantities', () => {
  assert.deepEqual(classifyProperties([prop('ESPECIALIDAD',' HORMIGON ')]).specialties,['Hormigón']);
  for (const sub of classificationRule.concreteSubspecialties) assert.ok(classifyProperties([prop('Sub Especialidad',sub)]).specialties.includes('Hormigón'));
  assert.deepEqual(classifyProperties([prop('Especialidad','Enfierradura'),prop('Sub Especialidad','Enfierradura')]).specialties,['Hormigón','Enfierradura']);
  assert.deepEqual(classifyProperties([prop('Especialidad','Metalcon')]).specialties,[]);
  assert.deepEqual(classifyProperties([prop('Especialidad','Acero Galvanizado'),prop('Sub Especialidad','Metalcon')]).specialties,['Hormigón','Acero Galvanizado']);
  assert.deepEqual(classifyProperties([prop('Especialidad','Hormigón armado')]).specialties,[]);
  assert.equal(classifyProperties([]).status,'missing');
  assert.equal(classifyProperties([prop('Especialidad','Hormigón'),prop('Especialidad','Otra')]).status,'ambiguous');
  assert.equal(visibleQuantityMetrics('Hormigón').some(m=>m.name==='Moldaje'),true);
  assert.equal(visibleQuantityMetrics('Enfierradura').some(m=>m.name==='Moldaje'),false);
  assert.equal(visibleQuantityMetrics('').length,4);
});
test('controlled label associations group foundation slabs before generic slabs and preserve source text', () => {
  for (const value of ['Losa Fundacion','LOSA FUN','Losa Fun.',' Losa_de_Fundación ', 'Losa-Fund', 'Fundación','Fundaciones']) {
    const associated=associateSubspecialty(value);
    assert.equal(associated.group,'Fundaciones'); assert.equal(associated.original,value);
    assert.equal(associated.ruleVersion,'2');
    const classified=classifyProperties([prop('Sub Especialidad',value)]);
    assert.deepEqual(classified.originalSubspecialties,[value]);
    assert.ok(classified.specialties.includes('Hormigón'));
    assert.deepEqual(selectClassifiedElements([{dbId:1,...classified}],'Hormigón','Fundaciones'),[1]);
    assert.deepEqual(selectClassifiedElements([{dbId:1,...classified}],'Hormigón','Losas'),[]);
  }
  for (const [input,group] of [['Losa','Losas'],['Losas','Losas'],['Muro','Muros'],['Pilar','Pilares'],['Viga Fun.','Vigas de Fundación'],['Vigas de Fundación','Vigas de Fundación'],['Acero Galv.','Acero Galvanizado']]) assert.equal(associateSubspecialty(input).group,group);
  for (const value of ['Losa funeraria','Fundación eléctrica especial','Muro de fundación','Losa por definir','Viga cualquiera','']) assert.equal(associateSubspecialty(value).group,null);
});
test('table and viewer use the same association without rewriting historical result labels or values', () => {
  const results=['Losa Fun','Losa Fundación','Losas'].map((subspecialty,i)=>({id:String(i),unit:'m³',quantity:10+i,elementIds:[String(i)],groupingData:{metric:'concrete_volume_m3',specialty:'Hormigón',subspecialty,typeName:'TEST_TYPE',floor:'TEST_FLOOR'}}));
  const projected=projectQuantityRows({results}); assert.equal(projected.unavailable,0);
  const filtered=filterQuantityRows(projected.rows,{specialty:'Hormigón',subspecialty:'Fundaciones',floor:''});
  assert.deepEqual(filtered.map(r=>r.subspecialty),['Losa Fun','Losa Fundación']);
  assert.deepEqual(filtered.map(r=>r.values.concrete_volume_m3),[10,11]);
  const elements=results.map(r=>({dbId:Number(r.id),...classifyProperties([prop('Sub Especialidad',r.groupingData.subspecialty)])}));
  assert.deepEqual(selectClassifiedElements(elements,'Hormigón','Fundaciones'),[0,1]);
  assert.deepEqual(selectClassifiedElements(elements,'Hormigón','UNKNOWN'),[]);
  assert.equal(filterQuantityRows(projected.rows,{specialty:'',subspecialty:'UNKNOWN',floor:''}).length,0);
  assert.ok(filterSubspecialties.includes('Fundaciones'));assert.ok(!filterSubspecialties.includes('Losa Fun'));
});
function modelFixture(transform = rows => rows) {
  return {
    getObjectTree(ok) {ok({getRootId:()=>1, enumNodeChildren(_id, visit) {visit(2);visit(3);},enumNodeFragments(id, visit, recursive) {assert.equal(recursive,false);if(id===2||id===3)visit(id*10);}});},
    getBulkProperties2(ids, options, ok) {
      assert.deepEqual(ids,[2,3]); assert.deepEqual(options,{ignoreHidden:false,needsExternalId:true});
      ok(transform(ids.map(dbId=>({dbId,properties:[prop('Especialidad',dbId===2?'Hormigón':'Enfierradura')]}))));
    },
  };
}
test('classification reads only geometry owners, excludes type parents and returns no duplicate IDs', async () => {
  const elements=await readViewClassification(modelFixture());
  assert.equal(elements.length,2);
  assert.deepEqual(selectClassifiedElements(elements,'Hormigón',''),[2]);
  assert.deepEqual(selectClassifiedElements(elements,'Acero Galvanizado',''),[]);
});
test('missing, duplicate or wrong property records and API failures never produce a complete classification', async () => {
  for (const transform of [r=>r.slice(1),r=>[r[0],r[0]],r=>[r[0],{...r[1],dbId:99}]]) await assert.rejects(readViewClassification(modelFixture(transform)),/incomplete_classification/);
  await assert.rejects(readViewClassification({...modelFixture(), getBulkProperties2(_ids,_opts,_ok,fail){fail();}}),/classification_unavailable/);
});
