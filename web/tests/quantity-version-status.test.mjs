import test from 'node:test';
import assert from 'node:assert/strict';
import {modelVersionStatus} from '../lib/quantities-v2/version-status.ts';
test('version light only claims current for matching verified IDs',()=>{
 const v3={id:'TEST_V3',number:3},v4={id:'TEST_V4',number:4};
 assert.equal(modelVersionStatus(v3,v3,'',false).state,'current');
 assert.equal(modelVersionStatus(v3,v4,'',false).state,'outdated');
 for(const args of [[v3,null,'',false],[v3,v3,'TEST_API_ERROR',false],[v3,{...v3,id:'TEST_OTHER'},'',false],[null,v4,'',false]])assert.equal(modelVersionStatus(...args).state,'unknown');
 assert.equal(modelVersionStatus(v3,v3,'',true).state,'checking');
});
