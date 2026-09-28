// Synthetic TEST fixtures only; no project elevations or quantities.
import test from 'node:test';
import assert from 'node:assert/strict';
import { aecIntervals, resolveAECFloor } from '../public/quantity-v2/published-levels.js';
import { createGeometryService } from '../public/quantity-v2/geometry-viewer.js';
const aec={levels:[{guid:'TEST_A',name:'TEST_BASE',elevation:0,height:10},{guid:'TEST_B',name:'TEST_UPPER',elevation:10,height:10},{guid:'TEST_C',name:'TEST_TOP',elevation:20,height:2147483647}]};
const base={resolvedBuildingLevel:'Piso no resuelto',floor_assignment_method:null};
const record=(lo,hi)=>({geometry:{bbox:{min:[0,0,lo],max:[1,1,hi]}}});
test('AEC uses source names and transforms feet into the original fragment coordinate frame',()=>{
 const m=[1,0,0,0,0,1,0,0,0,0,1,0,10,20,-5,1],r=aecIntervals(aec,m,.3048);
 assert.equal(r.intervals.length,2);assert.equal(r.intervals[0].lowerZ,-1.524);assert.equal(r.intervals[0].upperZ,1.524);
 const floor=resolveAECFloor(record(-1,1),r,.002,base);assert.equal(floor.resolvedBuildingLevel,'TEST_BASE');assert.equal(floor.floor_assignment_method,'AEC_LEVEL_INTERVAL');
 assert.deepEqual(floor.evidence.placement,m);
 assert.equal(resolveAECFloor(record(1,2),r,.002,base).resolvedBuildingLevel,'MULTILEVEL');
 assert.equal(resolveAECFloor(record(-2,1),r,.002,base).resolvedBuildingLevel,'Piso no resuelto');
 assert.equal(resolveAECFloor(record(6,7),r,.002,base).resolvedBuildingLevel,'Piso no resuelto');
});
test('missing, overlapping and tilted references fail closed; exact boundaries are not guessed',()=>{
 assert.ok(aecIntervals(null,null,1).issue);
 assert.ok(aecIntervals({levels:[aec.levels[0],{...aec.levels[1],elevation:0}]},null,1).issue);
 assert.ok(aecIntervals(aec,[1,0,1,0,0,1,0,0,0,0,1,0,0,0,0,1],1).issue);
 const r=aecIntervals(aec,null,1);
 assert.equal(resolveAECFloor(record(3.048,3.048),r,.002,base).resolvedBuildingLevel,'Piso no resuelto');
 assert.equal(resolveAECFloor(record(.01,3.049),r,.002,base).resolvedBuildingLevel,'TEST_BASE');
 assert.equal(resolveAECFloor(record(.01,3.051),r,.002,base).resolvedBuildingLevel,'MULTILEVEL');
});
test('original bounds API receives six coordinates, combines all fragments and ignores display explosion',async()=>{
 // Minimal TEST implementation of the THREE bounds operations only.
 class Vector3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}}
 class Box3{constructor(min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity)){Object.assign(this,{min,max});}union(b){for(const k of ['x','y','z']){this.min[k]=Math.min(this.min[k],b.min[k]);this.max[k]=Math.max(this.max[k],b.max[k]);}}isEmpty(){return this.max.x<this.min.x;}}
 const old=globalThis.THREE;globalThis.THREE={Vector3,Box3};let incomplete=false;
 try{
  const model={getUnitString:()=> 'ft',getUpVector:()=>[0,0,1],getInstanceTree:()=>({enumNodeFragments:(_,fn)=>[0,1].forEach(fn)}),getFragmentList:()=>({getOriginalWorldBounds:(id,dst)=>{assert.equal(dst.length,6);if(!incomplete)dst.set(id?[2,2,2,3,3,3]:[0,0,0,1,1,1]);},getWorldBounds:()=>{throw Error('Exploded display bounds must not be read');}})};
  const g=await createGeometryService({model})(1,'bounds');assert.equal(g.available,true);assert.equal(g.bbox.max[2],3*.3048);assert.deepEqual(g.bbox.min,[0,0,0]);
  incomplete=true;const missing=await createGeometryService({model})(1,'bounds');assert.equal(missing.available,false);assert.equal(missing.bbox,null);
 }finally{globalThis.THREE=old;}
});
