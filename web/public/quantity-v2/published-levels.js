/* global Autodesk */
import { unitFactor } from './properties.js';
// AECModelData elevations are in Revit feet. Original fragment boxes use the
// loaded placementWithOffset, excluding subsequent viewer animations.
export function aecIntervals(aec,placement,scale){
 const fail=issue=>({intervals:[],issue,source:'AEC_MODEL_DATA'});
 if(!Array.isArray(aec?.levels)||!aec.levels.length)return fail('Autodesk no publicó niveles AEC para esta vista');
 const m=placement??[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 if(m.length!==16||!Array.from(m).every(Number.isFinite)||!Number.isFinite(scale)||scale<=0||Math.abs(m[2])+Math.abs(m[6])+Math.abs(m[8])+Math.abs(m[9])+Math.abs(m[3])+Math.abs(m[7])+Math.abs(m[11])>1e-8||m[10]<=0||Math.abs(m[15]-1)>1e-8)return fail('Transformación de niveles no compatible con el eje vertical del modelo');
 const levels=aec.levels.filter(l=>l.extension?.buildingStory!==false);
 if(!levels.length||levels.some(l=>typeof l.guid!=='string'||!l.guid||typeof l.name!=='string'||!l.name.trim()||!Number.isFinite(l.elevation)))return fail('Nombres o elevaciones AEC incompletos');
 const sorted=[...levels].sort((a,b)=>a.elevation-b.elevation);
 if(new Set(sorted.map(l=>l.guid)).size!==sorted.length||sorted.some((l,i)=>i&&l.elevation<=sorted[i-1].elevation))return fail('Niveles AEC superpuestos: requiere revisar las referencias');
 const z=feet=>feet*.3048*m[10]+m[14]*scale;
 const intervals=[];
 for(let i=0;i<sorted.length;i++){
  const l=sorted[i],next=sorted[i+1];
  // The SDK uses 2147483647 for an unbounded top level. Never use that as a floor.
  const upper=next?.elevation??(Number.isFinite(l.height)&&l.height>0&&l.height<2147483647?l.elevation+l.height:null);
  if(upper===null)continue;
  intervals.push({id:l.guid,label:l.name,lowerZ:z(l.elevation),upperZ:z(upper),source:'AEC_MODEL_DATA',originalElevationFt:l.elevation,upperElevationFt:upper});
 }
 return {intervals,issue:intervals.length?null:'Niveles AEC sin límite superior verificable',source:'AEC_MODEL_DATA',placement:Array.from(m),modelScaleToM:scale};
}
export async function readPublishedLevels(model){
 const fail=issue=>({intervals:[],issue,source:'AEC_MODEL_DATA'});
 try{
  const up=model.getUpVector?.();
  if(!Array.isArray(up)||Math.abs(up[0])+Math.abs(up[1])+Math.abs(up[2]-1)>1e-8)return fail('Eje vertical del modelo no verificado');
  const node=model.getDocumentNode?.();
  if(!node||typeof Autodesk.Viewing.Document?.getAecModelData!=='function')return fail('Metadatos de niveles AEC no disponibles');
  let timer;
  const aec=await Promise.race([Autodesk.Viewing.Document.getAecModelData(node),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),12000);})]).finally(()=>clearTimeout(timer));
  return aecIntervals(aec,model.getData()?.placementWithOffset?.elements,unitFactor(model.getUnitString?.(),'m'));
 }catch{return fail('No se pudieron leer los niveles AEC publicados; revisa la conexión o las referencias de piso');}
}
export function resolveAECFloor(record,resolver,tolerance,base){
 const b=record.geometry?.bbox;
 if(resolver.issue||!b)return {...base,issue:resolver.issue??'Ubicación geométrica no disponible'};
 const min=b.min[2],max=b.max[2],bands=resolver.intervals;
 const spans=bands.filter(l=>Math.min(max,l.upperZ)-Math.max(min,l.lowerZ)>tolerance);
 const one=bands.filter(l=>min>=l.lowerZ-tolerance&&max<=l.upperZ+tolerance);
 const evidence={source:'AEC_MODEL_DATA',bbox:b,placement:resolver.placement,modelScaleToM:resolver.modelScaleToM,toleranceM:tolerance};
 if(one.length===1)return {...base,resolvedBuildingLevel:one[0].label,floor_assignment_method:'AEC_LEVEL_INTERVAL',floor_confidence:1,multilevel:false,status:'RESOLVED',issue:null,intervals:[{id:one[0].id,label:one[0].label,overlapM:Math.max(0,max-min)}],evidence:{...evidence,reference:one[0]}};
 const covered=spans.reduce((s,l)=>s+Math.max(0,Math.min(max,l.upperZ)-Math.max(min,l.lowerZ)),0);
 if(spans.length>1&&covered>=max-min-tolerance)return {...base,resolvedBuildingLevel:'MULTILEVEL',floor_assignment_method:'MULTILEVEL',floor_confidence:1,multilevel:true,status:'RESOLVED',issue:'Cruza niveles AEC. Largo completo en MULTILEVEL; no se divide por piso',intervals:spans.map(l=>({id:l.id,label:l.label,overlapM:Math.min(max,l.upperZ)-Math.max(min,l.lowerZ)})),evidence};
 return {...base,issue:'Elemento fuera de los límites AEC verificables o situado en un límite ambiguo',evidence};
}
