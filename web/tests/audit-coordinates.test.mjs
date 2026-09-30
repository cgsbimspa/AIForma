import test from 'node:test';
import assert from 'node:assert/strict';
import {aecCoordinates,propertyCoordinates,coordinateExtraction} from '../lib/audit/coordinates.ts';
import {normalizeResult,resultCodes} from '../lib/audit/result-status.ts';
// Synthetic TEST ONLY published response shapes, not engineering results.
test('coordinate extraction preserves signed raw transformations per linked document, with no assumed north or units',()=>{
 const matrix=[1,0,0,0,1,0,0,0,1,-12,0,7];
 const evidence=aecCoordinates({documentId:'TEST_A',refPointTransformation:matrix,linkedDocuments:[{documentId:'TEST_B',refPointTransformation:[...matrix.slice(0,9),2,3,-4]}]},'https://example.test/AEC');
 assert.equal(evidence.length,2);assert.deepEqual(evidence[0].value,matrix);assert.equal(evidence[0].unit,null);assert.equal(evidence[1].documentId,'TEST_B');
 assert.equal(evidence.some(e=>e.field==='trueNorth'||e.field==='sharedCoordinates'),false);
 assert.deepEqual(aecCoordinates({refPointTransformation:[1,2]},'TEST'),[]);
});
test('native datum properties are read even when zero; instance elevation never becomes model elevation',()=>{
 const evidence=propertyCoordinates([{objectid:1,name:'TEST point',properties:{Identity:{Category:'Project Base Point'},Location:{Elevation:'0 m','E/W':'-12 m','N/S':'7 m'}}},{objectid:2,name:'TEST slab',properties:{Identity:{Category:'Floors'},Constraints:{Elevation:'9 m'}}}],'https://example.test/properties');
 assert.equal(evidence.length,2);assert.ok(evidence.every(e=>e.dbId===1));assert.equal(evidence.find(e=>e.field==='elevation').value,'0 m');
 assert.match(evidence[0].path,/objectid=1/);
});
test('unread historical data is unavailable; a completed search without values is not-found, not a passed rule',()=>{
 const legacy=coordinateExtraction({});assert.ok(legacy.coordinateData.every(d=>d.status==='UNAVAILABLE'));
 const read=coordinateExtraction({coordinateEvidence:[]});assert.ok(read.coordinateData.every(d=>d.status==='NOT_FOUND'));
 assert.equal(read.coordinateComparison.status,'NOT_EVALUATED');assert.equal(read.coordinateResult,'INFORMATIVE');
});
test('a single result catalog supports historical aliases without rewriting history',()=>{
 assert.equal(resultCodes.length,6);assert.equal(normalizeResult('NOT EVALUATED'),'NOT_EVALUATED');assert.equal(normalizeResult('N/A'),'NOT_APPLICABLE');assert.equal(normalizeResult('INFORMATION'),'INFORMATIVE');assert.equal(normalizeResult('FAILED_OR_UNKNOWN'),null);
});
