// Published fields: https://aps.autodesk.com/blog/add-revit-levels-and-2d-minimap-your-3d
// An AEC level is a datum record, not a Viewer dbId or an inferred floor number.
export type AuditAecLevel = {
 key:string; guid:string|null; name:string|null; documentId:string|null; originPath:string;
 elevation:number|null; height:number|null; buildingStory:boolean|null; structure:boolean|null;
 groundPlane:boolean|null; hasAssociatedViewPlans:boolean|null;
};
export type AuditLevelDocument = { path:string; documentId:string|null; fieldAvailable:boolean; count:number };
export type AuditAecLevels = { records:AuditAecLevel[]; documents:AuditLevelDocument[]; invalidRecords:number; invalidFields:number };
export function explicitLevelMetres(value:unknown):number|null {
 if(typeof value!=='string')return null;
 const match=value.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m|ft|in)$/i);if(!match)return null;
 const scale:Record<string,number>={mm:0.001,cm:0.01,m:1,ft:0.3048,in:0.0254};
 const converted=Number(match[1].replace(',','.'))*scale[match[2].toLowerCase()];
 return Number.isFinite(converted)?converted:null;
}
const record=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const text=(v:unknown)=>typeof v==='string'&&v.trim()&&v.length<=2000?v:null;
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
const boolean=(v:unknown)=>typeof v==='boolean'?v:null;

export function parseAecLevels(value:unknown,endpoint:string):AuditAecLevels {
 const result:AuditAecLevels={records:[],documents:[],invalidRecords:0,invalidFields:0};
 let visited=0;
 function visit(value:unknown,path:string,depth:number){
  if(depth>16||++visited>2000)throw Error('audit_aec_levels_too_large');
  const data=record(value);if(!data){result.invalidRecords++;return;}
  const documentId=text(data.documentId),raw=Array.isArray(data.levels)?data.levels:null;
  result.documents.push({path,documentId,fieldAvailable:raw!==null,count:raw?.length??0});
  if(raw){
   if(result.records.length+raw.length>20000)throw Error('audit_aec_levels_too_large');
   raw.forEach((value,index)=>{
    const level=record(value);if(!level){result.invalidRecords++;return;}
    const extension=record(level.extension),guid=text(level.guid),name=text(level.name),elevation=number(level.elevation);
    if(!guid||!name||elevation===null)result.invalidFields++;
    result.records.push({key:`${endpoint}#${path}.levels[${index}]`,guid,name,documentId,originPath:path,elevation,height:number(level.height),buildingStory:boolean(extension?.buildingStory),structure:boolean(extension?.structure),groundPlane:boolean(extension?.groundPlane),hasAssociatedViewPlans:boolean(extension?.hasAssociatedViewPlans)});
   });
  }
  // Inspect only linked records actually present in this payload. A declared
  // link with no levels is explicitly uncovered; host levels are never copied.
  if(Array.isArray(data.linkedDocuments))data.linkedDocuments.forEach((link,index)=>visit(link,`${path}.linkedDocuments[${index}]`,depth+1));
 }
 visit(value,'root',0);return result;
}

export function repeatedLevelNames(levels:AuditAecLevels){
 const groups=new Map<string,AuditAecLevel[]>();
 for(const level of levels.records){
  if(!level.name)continue;
  const key=JSON.stringify([level.originPath,level.documentId,level.name]);
  const rows=groups.get(key)??[];rows.push(level);groups.set(key,rows);
 }
 return [...groups.values()].filter(rows=>rows.length>1);
}
