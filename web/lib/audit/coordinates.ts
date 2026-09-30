import type {AuditInventory} from './contracts.ts';
export const coordinateFields={coordinateSystem:'Sistema de coordenadas',internalOrigin:'Origen interno',projectBasePoint:'Punto base del proyecto',surveyPoint:'Punto topográfico',sharedCoordinates:'Coordenadas compartidas',projectNorth:'Norte de proyecto',trueNorth:'Norte verdadero',transformation:'Transformación de referencia AEC',rotation:'Rotación publicada',elevation:'Elevación publicada'} as const;
export type CoordinateField=keyof typeof coordinateFields;
export type CoordinateEvidence={field:CoordinateField;value:unknown;source:string;path:string;documentId:string|null;dbId:number|null;unit:string|null};
export type CoordinateExtraction={coordinateData:{field:CoordinateField;status:'AVAILABLE'|'NOT_FOUND'|'UNAVAILABLE';values:unknown[];evidenceIndexes:number[]}[];coordinateEvidence:CoordinateEvidence[];coordinateComparison:{status:'NOT_EVALUATED';reason:string};coordinateResult:'INFORMATIVE';};
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const present=(v:unknown)=>v!==null&&v!==undefined&&v!=='';
// Read original published fields. In particular a transformation is not proof
// of an EPSG system, survey point, true north, or shared-coordinate agreement.
export function aecCoordinates(value:unknown,endpoint:string):CoordinateEvidence[]{
 const out:CoordinateEvidence[]=[];
 function walk(raw:unknown,path:string,depth:number){if(depth>12)return;const v=object(raw);if(!v)return;
  const documentId=typeof v.documentId==='string'?v.documentId:null;
  if(Array.isArray(v.refPointTransformation)&&v.refPointTransformation.length===12&&v.refPointTransformation.every(n=>typeof n==='number'&&Number.isFinite(n)))out.push({field:'transformation',value:v.refPointTransformation,source:endpoint,path:`${path}.refPointTransformation`,documentId,dbId:null,unit:null});
  const location=object(v.locationParameters);
  if(location)for(const [key,field] of [['coordinateSystem','coordinateSystem'],['projectNorth','projectNorth'],['trueNorth','trueNorth'],['rotation','rotation'],['elevation','elevation']] as const){if(present(location[key])&&['string','number'].includes(typeof location[key]))out.push({field,value:location[key],source:endpoint,path:`${path}.locationParameters.${key}`,documentId,dbId:null,unit:null});}
  if(Array.isArray(v.linkedDocuments))v.linkedDocuments.slice(0,10000).forEach((child,i)=>walk(child,`${path}.linkedDocuments[${i}]`,depth+1));
 }
 walk(value,'$',0);return out;
}
const pointCategories:Record<string,CoordinateField>={'Internal Origin':'internalOrigin','Origen interno':'internalOrigin','Project Base Point':'projectBasePoint','Punto base del proyecto':'projectBasePoint','Survey Point':'surveyPoint','Punto topográfico':'surveyPoint'};
const explicitFields:Record<string,CoordinateField>={'Coordinate System':'coordinateSystem','Sistema de coordenadas':'coordinateSystem','Shared Coordinates':'sharedCoordinates','Coordenadas compartidas':'sharedCoordinates','Project North':'projectNorth','Norte de proyecto':'projectNorth','True North':'trueNorth','Norte verdadero':'trueNorth','Angle to True North':'rotation','Ángulo al norte real':'rotation','Elevation':'elevation','Elevación':'elevation'};
export function propertyCoordinates(rows:{objectid:number;name:string;properties:Record<string,unknown>}[],endpoint:string):CoordinateEvidence[]{
 const out:CoordinateEvidence[]=[];
 for(const row of rows){let category:string|null=null;const values:{path:string;name:string;value:unknown}[]=[];
  function walk(props:Record<string,unknown>,path:string,depth:number){if(depth>15)return;for(const [name,value] of Object.entries(props)){const next=path?`${path}.${name}`:name;if(['Category','Categoría'].includes(name)&&typeof value==='string')category=value;const nested=object(value);if(nested)walk(nested,next,depth+1);else if(present(value))values.push({name,path:next,value});}}
  walk(row.properties,'',0);
  // Only datum categories. Instance Elevation must never become a project elevation.
  const field=category?pointCategories[category]:undefined;
  if(!field)continue;
  const evidence=(f:CoordinateField,value:unknown,path:string):CoordinateEvidence=>({field:f,value,source:endpoint,path:`collection[objectid=${row.objectid}].properties.${path}`,documentId:null,dbId:row.objectid,unit:null});
  const published=values.filter(v=>!['Category','Categoría'].includes(v.name));
  if(published.length)out.push(evidence(field,Object.fromEntries(published.map(v=>[v.path,v.value])),''));
  for(const v of published){const f=explicitFields[v.name];if(f)out.push(evidence(f,v.value,v.path));}
 }
 return out;
}
export function coordinateExtraction(inventory:AuditInventory):CoordinateExtraction{
 const evidence=[...(inventory.coordinateEvidence??[]),...(inventory.aec?.files??[]).flatMap(f=>f.coordinateEvidence??[])];
 const read=inventory.coordinateEvidence!==undefined;
 return {coordinateData:(Object.keys(coordinateFields) as CoordinateField[]).map(field=>{const indexes=evidence.flatMap((e,i)=>e.field===field?[i]:[]);return {field,status:indexes.length?'AVAILABLE':read?'NOT_FOUND':'UNAVAILABLE',values:indexes.map(i=>evidence[i].value),evidenceIndexes:indexes};}),coordinateEvidence:evidence,coordinateComparison:{status:'NOT_EVALUATED',reason:'Comparación entre modelos pendiente de referencias, unidades, correspondencias y tolerancias verificadas.'},coordinateResult:'INFORMATIVE'};
}
