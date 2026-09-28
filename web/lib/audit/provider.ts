import { z } from 'zod';
import { DataError } from '../autodesk/data.ts';
import type { QuantitySource } from '../quantities/contracts.ts';
import type { AuditElement, AuditInventory } from './contracts.ts';

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
 const leaves=new Set<number>(), ancestors=new Map<number,string[]>();
 function visit(n:TreeNode,parents:string[],depth:number) {
  if(depth>100)throw new DataError('invalid_response');
  if(n.objects?.length)n.objects.forEach(child=>visit(child,[...parents,n.name??''],depth+1));
  else {leaves.add(n.objectid);ancestors.set(n.objectid,parents);}
 }
 nodes.data.objects.forEach(n=>visit(n,[],0));
 const seen=new Set<number>();let excluded=0;
 const elements:AuditElement[]=[];
 for(const row of rows){
  if(seen.has(row.objectid))throw new DataError('invalid_response');seen.add(row.objectid);
  if(!leaves.has(row.objectid)){excluded++;continue;}
  const el:AuditElement={elementId:'',dbId:row.objectid,uniqueId:row.externalId??null,name:row.name,category:null,family:null,type:null,level:null,properties:row.properties};
  el.category=scalar(el,['Category','Categoría']);el.family=scalar(el,['Family','Familia']);el.type=scalar(el,['Type Name','Nombre de tipo','Type','Tipo']);
  const nativeId=scalar(el,['ElementId','Element ID','Id de elemento']);if(nativeId)el.elementId=nativeId;
  // Category nodes are explicit object-tree labels, not a classification inferred from an element name.
  if(!el.category){const known=(ancestors.get(row.objectid)??[]).filter(n=>['Levels','Niveles','Grids','Rejillas','Ejes'].includes(n));if(known.length===1)el.category=known[0];}
  elements.push(el);
 }
 return {elements,levels:elements.filter(e=>['Levels','Niveles'].includes(e.category??'')),grids:elements.filter(e=>['Grids','Rejillas','Ejes'].includes(e.category??'')),endpoint,treeEndpoint,fetchedAt:new Date().toISOString(),missing:[...leaves].filter(id=>!seen.has(id)).length,excluded,population:'Objetos hoja del árbol de la vista publicada con propiedades recuperadas. Los nodos agrupadores se excluyen; no representa todo el archivo RVT.'};
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
 const [tree,properties]=await Promise.all([read(token,treeEndpoint,signal,fetcher),read(token,endpoint,signal,fetcher)]);
 return parseInventory(tree,properties,source,endpoint,treeEndpoint);
}
