import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyProperties} from '../public/quantity-classification.js';
import {buildViewCalculation,readQuantity,viewQuantityRules,sumVerified} from '../public/quantity-calculation.js';
import {liveCalculationSchema,presentLiveCalculation} from '../lib/quantities/live.ts';
// TEST model properties only. No fixtures are loaded by product routes.
const p=(displayName,displayValue,units)=>({displayName,displayValue,units,displayCategory:'TEST_CATEGORY'});
const element=(dbId,properties)=>({dbId,externalId:`TEST-${dbId}`,properties,...classifyProperties(properties)});
const binding={urn:'TEST_MODEL',viewId:'TEST_VIEW'};
const filters={specialty:'',subspecialty:'',floor:''};
test('roof type criteria override legacy concrete classifications, while OSB is not steel',()=>{
 for(const name of ['40CA085','Viga Perfil','Metalcon','METALCON 40CA085','Viga Perfil 100']){
  const value=classifyProperties([p('Nombre de tipo',name),p('Especialidad','Hormigón')]);
  assert.deepEqual(value.specialties,['Cubierta']);assert.equal(value.subspecialty,'Acero Galvanizado');assert.equal(value.typeName,name);
 }
 for(const name of ['PL OSB','PL. OSB 11 mm','Placa OSB 15mm','Tablero OSB']){
  const value=classifyProperties([p('Nombre de tipo',name)]);assert.deepEqual(value.specialties,['Cubierta']);assert.equal(value.subspecialty,'Placas de techumbre');
 }
 for(const name of ['140CA085','40CA0850','metalconcreto','PL OSBC'])assert.deepEqual(classifyProperties([p('Nombre de tipo',name)]).specialties,[]);
 assert.equal(classifyProperties([p('Nombre de tipo','PL OSB Metalcon')]).status,'ambiguous');
});
test('only unique published numeric quantities with verified units are summed; unknown never means zero',()=>{
 const rule=viewQuantityRules[0];
 assert.equal(readQuantity([p('Volumen',0,'autodesk.unit.unit:cubicMeters-1.0.1')],rule).quantity,0);
 for(const props of [[],[p('Volumen',2)],[p('Volumen',2,'m²')],[p('Volumen',-1,'m³')],[p('Volumen','1,234','m³')],[p('Volumen',2,'m³'),p('Volumen',2,'m³')]])assert.equal(readQuantity(props,rule).quantity,null);
 assert.equal(sumVerified([.1,.2,.3]),.6);
 assert.throws(()=>sumVerified([Number.MAX_VALUE,Number.MAX_VALUE]),/overflow/);
});
test('live sums bind view, element and raw property evidence; missing values produce partial subtotals',()=>{
 const elements=[element(1,[p('Sub Especialidad','Losa Fun'),p('Volumen',10,'m³'),p('Nivel',4),p('Nivel','5° PISO')]),element(2,[p('Nombre de tipo','40CA085'),p('Longitud',3,'autodesk.unit.unit:meters-1.0.0'),p('Volumen',99,'m³')]),element(3,[p('Nombre de tipo','PL OSB'),p('Volumen',88,'m³')]),element(4,[p('Sub Especialidad','Muros')])];
 const result=liveCalculationSchema.parse(buildViewCalculation(elements,binding));
 assert.equal(result.records.length,3);assert.equal(result.records[0].floor,'Piso no verificado');assert.equal(result.urn,binding.urn);
 const shown=presentLiveCalculation(result,filters);
 assert.equal(shown.totals.concrete_volume_m3,null);assert.equal(shown.coverage[0].subtotal,10);assert.equal(shown.coverage[0].missing,1);
 assert.equal(shown.totals.galvanized_steel_length_ml,3);
 assert.equal(presentLiveCalculation(result,{...filters,specialty:'Cubierta'}).records.length,1);
 assert.equal(presentLiveCalculation(result,{...filters,subspecialty:'Fundaciones'}).totals.concrete_volume_m3,10);
 assert.equal(presentLiveCalculation(result,{...filters,subspecialty:'Losas'}).totals.concrete_volume_m3,null);
 assert.equal(result.records[1].rawValue,'3');assert.equal(result.records[1].externalId,'TEST-2');
 assert.throws(()=>buildViewCalculation([elements[0],elements[0]],binding),/duplicate/);
 assert.equal(liveCalculationSchema.safeParse({...result,records:[result.records[0],result.records[0]]}).success,false);
});
