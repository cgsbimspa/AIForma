// AEC payload fields: https://aps.autodesk.com/blog/consume-aec-data-which-are-model-derivative-api
// AEC records are model datum data, not dbIds or a count of visible Revit elements.
export type GridPoint = [number, number, number];
export type AuditGridSegment = { guid:string|null; type:string|number|null; start:GridPoint|null; end:GridPoint|null };
export type AuditAecGrid = { key:string; id:string|null; label:string|null; document:string|null; segments:AuditGridSegment[]; geometryComplete:boolean };
export type AuditAecFile = { endpoint:string; documentId:string|null; schemaVersion:string|null; grids:AuditAecGrid[]; invalidRecords:number; invalidSegments:number; gridsFieldAvailable:boolean; linkedDocumentCount:number|null };
export type AuditAecInventory = { status:'AVAILABLE'|'PARTIAL'|'NOT_FOUND'|'UNAVAILABLE'; fetchedAt:string; attempts:{endpoint:string;status:string}[]; files:AuditAecFile[]; message:string };
const record=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const text=(v:unknown)=>typeof v==='string'&&v.trim()&&v.length<=2000?v:null;
const point=(v:unknown):GridPoint|null=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n))?v as GridPoint:null;

export function parseAecGrids(value:unknown,endpoint:string):AuditAecFile {
 const data=record(value);if(!data)throw Error('audit_aec_invalid');
 const grids:AuditAecGrid[]=[];let invalidRecords=0,invalidSegments=0;
 const raw=Array.isArray(data.grids)?data.grids:[];
 if(raw.length>20000)throw Error('audit_aec_too_large');
 for(const [i,value] of raw.entries()){
  const grid=record(value);if(!grid){invalidRecords++;continue;}
  const segments:AuditGridSegment[]=[];
  const rawSegments=Array.isArray(grid.segments)?grid.segments:[];
  if(rawSegments.length>1000)throw Error('audit_aec_too_large');
  for(const value of rawSegments){
   const segment=record(value),points=record(segment?.points);
   const start=point(points?.start),end=point(points?.end);
   if(!start||!end)invalidSegments++;
   segments.push({guid:text(segment?.guid),type:typeof segment?.type==='string'||typeof segment?.type==='number'?segment.type:null,start,end});
  }
  grids.push({key:`${endpoint}#grids[${i}]`,id:text(grid.id),label:text(grid.label),document:text(grid.document),segments,geometryComplete:segments.length>0&&segments.every(s=>s.start!==null&&s.end!==null)});
 }
 return {endpoint,documentId:text(data.documentId),schemaVersion:text(data.version),grids,invalidRecords,invalidSegments,gridsFieldAvailable:Array.isArray(data.grids),linkedDocumentCount:Array.isArray(data.linkedDocuments)?data.linkedDocuments.length:null};
}

// Values are original coordinates. No conversion to mm or assumption of shared
// coordinates across links; no reconstruction of an arc from its chord.
export function gridChordAngle(segment:AuditGridSegment):number|null {
 if(!segment.start||!segment.end)return null;
 const dx=segment.end[0]-segment.start[0],dy=segment.end[1]-segment.start[1];
 if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)===0)return null;
 return ((Math.atan2(dy,dx)*180/Math.PI)%180+180)%180;
}

export function repeatedGridLabels(file:AuditAecFile) {
 const groups=new Map<string,AuditAecGrid[]>();
 for(const grid of file.grids){if(!grid.document||!grid.label)continue;const key=JSON.stringify([grid.document,grid.label]);const group=groups.get(key)??[];group.push(grid);groups.set(key,group);}
 return [...groups.values()].filter(rows=>rows.length>1);
}

export function aecAssetUrns(value:unknown):string[] {
 const out=new Set<string>();let visited=0;
 function walk(value:unknown,depth:number){
  if(depth>50||++visited>100000)throw Error('audit_aec_manifest_invalid');
  const node=record(value);if(!node)return;
  if(node.role==='Autodesk.AEC.ModelData'){
   // Only derivative identifiers, discovered in this version's manifest. Never
   // accept a supplied URL or forward the user's token to another host.
   if(typeof node.urn!=='string'||!/^urn:adsk\.[a-z0-9.:-]+:[^\s?#]+$/i.test(node.urn)||node.urn.length>8000)throw Error('audit_aec_asset_invalid');
   out.add(node.urn);
  }
  for(const key of ['derivatives','children'])if(Array.isArray(node[key]))for(const child of node[key])walk(child,depth+1);
 }
 walk(value,0);return [...out];
}
