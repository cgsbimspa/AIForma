/* global Autodesk, THREE */
import { unitFactor } from './properties.js';
import { inspectTriangles, geometryFallback } from './geometry.js';
// APIs checked against APS Viewer 7 source and Autodesk's geometry examples.
export function createGeometryService(viewer){
 const cache=new Map(),model=viewer.model,unit=model.getUnitString?.(),scale=unitFactor(unit,'m'),up=model.getUpVector?.();
 const zUp=Array.isArray(up)&&Math.abs(up[0])<1e-8&&Math.abs(up[1])<1e-8&&Math.abs(up[2]-1)<1e-8;
 return async function geometry(dbId,detail='mesh'){
  const cacheKey=`${dbId}:${detail}`;
  if(cache.has(cacheKey))return cache.get(cacheKey);
  if(scale===null){const value=geometryFallback(null,'Unidad de geometría no publicada');cache.set(cacheKey,value);return value;}
  const fragments=model.getFragmentList(),tree=model.getInstanceTree(),ids=[];
  tree.enumNodeFragments(dbId,id=>ids.push(id),false);
  let bbox=null;
  try{
   const box=new THREE.Box3();
   for(const id of ids){const part=new THREE.Box3();fragments.getOriginalWorldBounds(id,part);box.union(part);}
   if(!box.isEmpty())bbox={min:[box.min.x,box.min.y,box.min.z].map(v=>v*scale),max:[box.max.x,box.max.y,box.max.z].map(v=>v*scale)};
   if(!zUp)throw Error('Eje vertical de la vista no compatible con el análisis Z');
   if(detail==='bounds'){
    const value={...geometryFallback(bbox,bbox?null:'Caja de ubicación no disponible'),available:Boolean(bbox),boundsOnly:true,modelUnit:unit,scaleToMeters:scale,fragmentIds:ids};
    cache.set(cacheKey,value);return value;
   }
   const triangles=[];
   for(const id of ids){
    const dbIds=fragments.getDbIds(id),owners=Array.isArray(dbIds)||ArrayBuffer.isView(dbIds)?Array.from(dbIds):[dbIds];
    if(owners.some(owner=>owner!==dbId))throw Error('Fragmento compartido por varios elementos');
    const mesh=viewer.impl.getRenderProxy(model,id),matrix=new THREE.Matrix4();
    if(!mesh?.geometry||mesh.geometry.isLines||mesh.geometry.isPoints)throw Error('Malla 3D no disponible');
    fragments.getOriginalWorldMatrix(id,matrix);
    let count=0;
    Autodesk.Viewing.Private.enumMeshTriangles(mesh.geometry,(a,b,c)=>{
     if(triangles.length>=250000)throw Error('Geometría compleja: supera el límite de análisis por elemento');
     const tri=[a,b,c].map(p=>{const v=new THREE.Vector3(p.x,p.y,p.z).applyMatrix4(matrix);return [v.x*scale,v.y*scale,v.z*scale];});triangles.push(tri);count++;
    });
    if(!count)throw Error('Triángulos no disponibles');
   }
   const value={...inspectTriangles(triangles),modelUnit:unit,scaleToMeters:scale,fragmentIds:ids};cache.set(cacheKey,value);return value;
  }catch(error){const value={...geometryFallback(bbox,error.message),modelUnit:unit,scaleToMeters:scale,fragmentIds:ids};cache.set(cacheKey,value);return value;}
 };
}
