import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyProperties,classificationInventory,classificationFacets,matchesClassification} from '../public/quantity-classification.js';
// TEST fixtures only. These values never enter the product.
const p=(displayName,displayValue)=>({displayName,displayValue});
const e=(dbId,properties)=>({dbId,properties,...classifyProperties(properties)});
test('roof variants use Cubierta exclusively and V dimensions override obsolete Muro labels',()=>{
  for(const type of ['METLCON','Metlcon 90 CA','Metalcon90','Metal-con 100','METALCON C 100']) {
    const classified=classifyProperties([p('Nombre de tipo',type),p('Especialidad','Hormigón')]);
    assert.deepEqual(classified.specialties,['Cubierta']);assert.equal(classified.subspecialty,'Acero Galvanizado');
  }
  assert.deepEqual(classifyProperties([p('Especialidad','Acero Galvanizado')]).specialties,['Cubierta']);
  const named=classifyProperties([p('Nombre de tipo','TEST_60CA085'),p('Sub Especialidad','Cerchas')],'Metalcon C [TEST]');
  assert.deepEqual(named.specialties,['Cubierta']);assert.equal(named.subspecialty,'Acero Galvanizado');assert.equal(named.association.parameter,'Nombre de elemento Autodesk');
  assert.equal(named.typeName,'TEST_60CA085');
  for(const type of ['V 15/109','v20/40','V 20 / 40 TEST']) {
    const classified=classifyProperties([p('Nombre de tipo',type),p('Sub Especialidad','Muro')]);
    assert.equal(classified.subspecialty,'Vigas');assert.deepEqual(classified.specialties,['Hormigón']);
  }
  assert.equal(classifyProperties([p('Nombre de tipo','Viga Perfil'),p('Sub Especialidad','Muro')]).subspecialty,'Acero Galvanizado');
  assert.equal(classifyProperties([p('Nombre de tipo','V 20/XX'),p('Sub Especialidad','Muro')]).subspecialty,'muro');
});
test('facets work in every direction over actual geometry including OSB without a quantity',()=>{
  const rows=classificationInventory([
    e(1,[p('Nombre de tipo','METLCON'),p('Nivel',6)]),
    e(2,[p('Nombre de tipo','PL OSB'),p('Nivel',6)]),
    e(3,[p('Nombre de tipo','V 15/109'),p('Sub Especialidad','Muro'),p('Nivel',2)]),
    e(4,[p('Sub Especialidad','Losa Fun'),p('Nivel',1)]),
  ]);
  const base={specialty:'',subspecialty:'',floor:''};
  const roof=classificationFacets(rows,{...base,specialty:'Cubierta'});
  assert.deepEqual(roof.subspecialties,['Acero Galvanizado','Placas de techumbre']);assert.deepEqual(roof.floors,['6']);
  const beam=classificationFacets(rows,{...base,subspecialty:'Vigas'});
  assert.deepEqual(beam.specialties,['Hormigón']);assert.deepEqual(beam.floors,['2']);
  const floor=classificationFacets(rows,{...base,floor:'6'});
  assert.deepEqual(floor.specialties,['Cubierta']);assert.deepEqual(floor.subspecialties,roof.subspecialties);
  assert.deepEqual(rows.filter(r=>matchesClassification(r,{...base,specialty:'Cubierta',floor:'6',subspecialty:'Acero Galvanizado'})).map(r=>r.dbId),[1]);
  assert.deepEqual(classificationFacets([],base),{specialties:[],subspecialties:[],floors:[]});
});
