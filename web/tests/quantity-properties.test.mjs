import test from 'node:test';
import assert from 'node:assert/strict';
import {readElementProperties,filterProperties,propertyText} from '../public/quantity-properties.js';

// TEST-only SDK responses. Production requests always use the real model.
test('property reader requests every category including hidden properties and keeps duplicate names',async()=>{
 const properties=[{displayName:'Volumen',displayValue:0,units:'m³'},{displayName:'Volumen',displayValue:3,displayCategory:'TEST Type'},{displayName:'TEST internal',hidden:true,displayValue:123}];
 const result=await readElementProperties({getBulkProperties2(ids,options,success){assert.deepEqual(ids,[42]);assert.deepEqual(options,{ignoreHidden:false,needsExternalId:true});success([{dbId:42,externalId:'TEST_ID',properties}]);}},42);
 assert.equal(result.properties.length,3);assert.equal(result.properties[0].displayValue,0);assert.equal(result.properties[2].hidden,true);
});
test('missing or wrong property responses are errors rather than complete empty reads',async()=>{
 for(const response of [[],[{dbId:99,properties:[]}],[{dbId:42}],[{dbId:42,properties:[]},{dbId:43,properties:[]}]]){
  await assert.rejects(readElementProperties({getBulkProperties2(ids,options,success){success(response);}},42),/properties_unavailable/);
 }
 await assert.rejects(readElementProperties({getBulkProperties2(ids,options,success,error){error();}},42),/properties_unavailable/);
 await assert.rejects(readElementProperties({getBulkProperties2(){}},42,5),/property_timeout/);
 const empty=await readElementProperties({getBulkProperties2(ids,options,success){success([{dbId:42,properties:[]}]);}},42);
 assert.equal(empty.properties.length,0);
});
test('property filtering is accent insensitive and preserves raw values and unknowns',()=>{
 const properties=[{displayName:'Nivel',displayValue:4},{displayName:'Área',displayValue:0},{displayName:'TEST flag',displayValue:false}];
 assert.equal(filterProperties(properties,'AREA').length,1);
 assert.equal(filterProperties(properties,'').length,3);
 assert.equal(propertyText(0),'0');assert.equal(propertyText(false),'false');assert.equal(propertyText(null),'No disponible');
});
