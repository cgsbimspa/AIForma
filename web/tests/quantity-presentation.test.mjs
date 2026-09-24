import test from 'node:test';
import assert from 'node:assert/strict';
import {projectQuantityRows,filterQuantityRows,quantityTotals,matchingRun} from '../lib/quantities/presentation.ts';
// TEST metadata. Never available to product routes.
const row={id:'TEST_ROW',quantity:2,unit:'m³',elementIds:['TEST_EXTERNAL_ID'],groupingData:{metric:'concrete_volume_m3',specialty:'Hormigón',subspecialty:'Muros',typeName:'TEST_TYPE',floor:'TEST_LEVEL'}};
test('presentation requires explicit metric, classification, BIM type and level instead of guessing from units or names',()=>{
 const result=projectQuantityRows({results:[row,{...row,id:'TEST_MISSING',groupingData:{}}]});
 assert.equal(result.rows.length,1);assert.equal(result.unavailable,1);
 assert.equal(quantityTotals(result.rows,result.unavailable).concrete_volume_m3,null);
 assert.equal(quantityTotals(result.rows).concrete_volume_m3,2);
 assert.equal(quantityTotals(result.rows).formwork_area_m2,null);
 assert.equal(projectQuantityRows({results:[{...row,unit:'m²'}]}).rows.length,0);
 assert.equal(quantityTotals([]).concrete_volume_m3,null);
 assert.equal(quantityTotals([{...result.rows[0],values:{concrete_volume_m3:0}}]).concrete_volume_m3,0);
});
test('all three filters share one selection; quantities never follow another source version, view or template',()=>{
 const {rows}=projectQuantityRows({results:[row]});
 assert.equal(filterQuantityRows(rows,{specialty:'Hormigón',subspecialty:'Muros',floor:'TEST_LEVEL'}).length,1);
 assert.equal(filterQuantityRows(rows,{specialty:'Enfierradura',subspecialty:'',floor:''}).length,0);
 const source={scope:{itemId:'TEST_FILE'},version:{id:'TEST_V1'},view:{id:'TEST_VIEW'}};
 const run={source,template:{id:'TEST_TEMPLATE'}};
 assert.equal(matchingRun([run],source,'TEST_TEMPLATE'),run);
 assert.equal(matchingRun([run],{...source,version:{id:'TEST_V2'}},'TEST_TEMPLATE'),undefined);
 assert.equal(matchingRun([run],{...source,view:{id:'TEST_OTHER_VIEW'}},'TEST_TEMPLATE'),undefined);
 assert.equal(matchingRun([run],source,'TEST_OTHER_TEMPLATE'),undefined);
});
