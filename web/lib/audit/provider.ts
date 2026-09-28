import { z } from 'zod';
import { DataError } from '../autodesk/data.ts';
import type { QuantitySource } from '../quantities/contracts.ts';
import type { AuditElement, AuditInventory } from './contracts.ts';
import { verticalReferences } from './catalog.ts';
import { aecAssetUrns,parseAecGrids,type AuditAecInventory } from './grids.ts';

// Published APS API: https://aps.autodesk.com/blog/advanced-query-model-derivative-api
const propertiesSchema=z.object({data:z.object({collection:z.array(z.object({objectid:z.number().int().nonnegative(),externalId:z.string().optional(),name:z.string(),properties:z.record(z.unknown())})).max(150000)})});
type TreeNode={objectid:number;name?:string;objects?:TreeNode[]};
const nodeSchema:z.ZodType<TreeNode>=z.lazy(()=>z.object({objectid:z.number().int().nonnegative(),name:z.string().optional(),objects:z.array(nodeSchema).optional()}));
const treeSchema=z.object({data:z.object({objects:z.array(nodeSchema)})});
export function property(element:AuditElement,names:string[]) {
 const values:{name:string;group:string;value:unknown}[]=[];
 function walk(props:Record<string,unknown>,group:string,depth:number){
  if(depth>20)return;
  for(const [name,value] of Object.entries(props)){
   const path=group?`${group}.${name}`:name;
   if((names.includes(name)||names.includes(path))&&value!==null&&value!=='')values.push({name,group,value});
   if(value&&typeof value==='object'&&!Array.isArray(value))walk(value as Record<string,unknown>,path,depth+1);
  }
 }
 walk(element.properties,'',0);
 const unique=[...new Set(values.map(p=>JSON.stringify(p.value)))];
 return unique.length===1?values[0]:null;
}
function scalar(element:AuditElement,names:string[]) { const p=property(element,names);return p&&['string','number'].includes(typeof p.value)?String(p.value):null; }
export function parseInventory(tree:unknown,properties:unknown,source:QuantitySource,endpoint:string,treeEndpoint:string):AuditInventory {
 const nodes=treeSchema.parse(tree), rows=propertiesSchema.parse(properties).data.collection;
 const leaves=new Set<number>(), allNodes=new Set<number>(), ancestors=new Map<number,string[]>();
 function visit(n:TreeNode,parents:string[],depth:number) {
  if(depth>100)throw new DataError('invalid_response');
  allNodes.add(n.objectid);ancestors.set(n.objectid,parents);
  if(n.objects?.length)n.objects.forEach(child=>visit(child,[...parents,n.name??''],depth+1));
  else {leaves.add(n.objectid);ancestors.set(n.objectid,parents);}
 }
 nodes.data.objects.forEach(n=>visit(n,[],0));
 const seen=new Set<number>();let excluded=0;
 const elements:AuditElement[]=[],grids:AuditElement[]=[],levels:AuditElement[]=[];
 for(const row of rows){
  if(seen.has(row.objectid))throw new DataError('invalid_response');seen.add(row.objectid);
  if(!allNodes.has(row.objectid)){excluded++;continue;}
  const el:AuditElement={elementId:'',dbId:row.objectid,uniqueId:row.externalId??null,name:row.name,category:null,family:null,type:null,level:null,properties:row.properties};
  el.category=scalar(el,['Category','Categoría']);el.family=scalar(el,['Family','Familia']);el.type=scalar(el,['Type Name','Nombre de tipo','Type','Tipo']);
  const nativeId=scalar(el,['ElementId','Element ID','Id de elemento']);if(nativeId)el.elementId=nativeId;
  // Revit Model Tree publishes Category → Family → Type. Preserve the path and
  // accept only unambiguous, exact category labels from the defined catalog.
  // Never classify using words in the instance name or a similar family name.
  el.treePath=ancestors.get(row.objectid)??[];el.categorySource=el.category?'property':null;
  if(!el.category){
   const categories=new Set([...verticalReferences.map(m=>m.category),'Levels','Niveles','Grids','Rejillas','Ejes']);
   const known=el.treePath.filter(n=>categories.has(n));
   if(known.length===1){el.category=known[0];el.categorySource='tree';}
  }
  // Datum objects may be parent nodes (multi-segment grids). Search all nodes
  // belonging to this view; the technical element population remains leaves.
  if(['Grids','Rejillas','Ejes'].includes(el.category??''))grids.push(el);
  if(['Levels','Niveles'].includes(el.category??''))levels.push(el);
  if(leaves.has(row.objectid))elements.push(el);else excluded++;
 }
 return {elements,levels,grids,endpoint,treeEndpoint,fetchedAt:new Date().toISOString(),missing:[...leaves].filter(id=>!seen.has(id)).length,excluded,population:'Objetos hoja del árbol de la vista publicada con propiedades recuperadas. Los nodos agrupadores se excluyen; no representa todo el archivo RVT. El inventario de ejes y niveles también consulta nodos de referencia y datos AEC, sin sumarlos como elementos de la vista.'};
}
async function read(token:string,endpoint:string,signal?:AbortSignal,fetcher:typeof fetch=fetch) {
 const response=await fetcher(endpoint,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},cache:'no-store',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000)});
 if(response.status===202)throw new DataError('audit_derivative_pending',409);
 if(!response.ok)throw new DataError(response.status===401?'expired':response.status===403?'forbidden':'audit_source_unavailable',response.status===401?401:502);
 const reader=response.body?.getReader();if(!reader)throw new DataError('invalid_response');let bytes=0;const chunks:Uint8Array[]=[];
 while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>80*1024*1024){await reader.cancel();throw new DataError('audit_source_too_large',413);}chunks.push(part.value);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function readAuditView(token:string,source:QuantitySource,signal?:AbortSignal,fetcher:typeof fetch=fetch) {
 if(!source.version.modelId||source.view?.role!=='3d')throw new DataError('audit_view_required',422);
 const root=`https://developer.api.autodesk.com/modelderivative/v2/designdata/${encodeURIComponent(source.version.modelId)}/metadata/${encodeURIComponent(source.view.id)}`;
 const endpoint=`${root}/properties?forceget=true`,treeEndpoint=`${root}?forceget=true`;
 const [tree,properties,aec]=await Promise.all([read(token,treeEndpoint,signal,fetcher),read(token,endpoint,signal,fetcher),readAuditAec(token,source.version.modelId,signal,fetcher)]);
 return {...parseInventory(tree,properties,source,endpoint,treeEndpoint),aec};
}

export async function readAuditAec(token:string,modelUrn:string,signal?:AbortSignal,fetcher:typeof fetch=fetch):Promise<AuditAecInventory> {
 const result:AuditAecInventory={status:'UNAVAILABLE',fetchedAt:new Date().toISOString(),attempts:[],files:[],message:''};
 // Supplemental reading has a single 25 s budget, shared by both manifests and
 // assets, so a missing AEC file cannot indefinitely block the view audit.
 const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(25000)]):AbortSignal.timeout(25000);
 const root=`https://developer.api.autodesk.com/modelderivative/v2/designdata/${encodeURIComponent(modelUrn)}`;
 const manifests=[`${root}/manifest`,`https://developer.api.autodesk.com/derivativeservice/v2/manifest/${encodeURIComponent(modelUrn)}`];
 let hadManifest=false,failed=false;const assets=new Set<string>();
 for(const endpoint of manifests){
  try{const value=await read(token,endpoint,deadline,fetcher);const urns=aecAssetUrns(value);hadManifest=true;result.attempts.push({endpoint,status:urns.length?'AEC_FOUND':'AEC_NOT_FOUND'});urns.forEach(urn=>assets.add(urn));if(urns.length)break;}
  catch(error){if(error instanceof DataError&&error.code==='expired')throw error;failed=true;result.attempts.push({endpoint,status:error instanceof DataError?error.code:'AEC_READ_ERROR'});}
  if(deadline.aborted)break;
 }
 const urns=[...assets];if(urns.length>8)failed=true;
 // Standard derivative GET, scoped to the authorized version's manifest.
 // https://github.com/Autodesk-Forge/forge-api-nodejs-client/blob/master/docs/DerivativesApi.md
 await Promise.all(urns.slice(0,8).map(async urn=>{
  const endpoint=`${root}/manifest/${encodeURIComponent(urn)}`;
  try{const file=parseAecGrids(await read(token,endpoint,deadline,fetcher),endpoint);result.files.push(file);if(file.invalidRecords||file.invalidSegments||!file.gridsFieldAvailable)failed=true;result.attempts.push({endpoint,status:file.gridsFieldAvailable?'AEC_READ':'GRIDS_FIELD_UNAVAILABLE'});}
  catch(error){if(error instanceof DataError&&error.code==='expired')throw error;failed=true;result.attempts.push({endpoint,status:error instanceof DataError?error.code:'AEC_READ_ERROR'});}
 }));
 result.files.sort((a,b)=>a.endpoint.localeCompare(b.endpoint));
 result.status=result.files.length?(failed?'PARTIAL':'AVAILABLE'):hadManifest&&!failed&&!assets.size?'NOT_FOUND':'UNAVAILABLE';
 result.message=result.status==='NOT_FOUND'?'Los manifiestos consultados no incluyen datos AEC. Esto no demuestra que el RVT carezca de ejes.':result.status==='UNAVAILABLE'?'No fue posible recuperar datos AEC; se conserva la lectura de la vista. Reintenta la auditoría y revisa la publicación si persiste.':result.status==='PARTIAL'?'Lectura AEC parcial: hay fuentes o segmentos no disponibles. Consulta el detalle de cobertura.':'Datos AEC recuperados de esta versión: referencias del modelo y documentos vinculados publicados. Su presencia no demuestra visibilidad en la vista ni cobertura de todos los vínculos.';
 return result;
}
