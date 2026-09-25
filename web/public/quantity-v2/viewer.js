import { createGeometryService } from './geometry-viewer.js';
import { inspectElements, calculateQuantities, validateSettings, matchesFilter } from './quantity-service.js';
export function installQuantityV2(viewer,input,readElements){
 let inspected,calculated,revision=0,filterRevision=0,activeIds=null,activeKey=null;
 const readGeometry=createGeometryService(viewer),seen=new Set();
 const send=(requestId,payload)=>window.parent.postMessage({type:'aiforma-quantity-v2-result',requestId,urn:input.urn,viewId:input.viewId,...payload},window.location.origin);
 const receive=async event=>{
  const d=event.data;
  if(event.origin!==window.location.origin||event.source!==window.parent||d?.type!=='aiforma-quantity-v2'||d.urn!==input.urn||d.viewId!==input.viewId||typeof d.requestId!=='string')return;
  if(d.operation==='cancel'){revision++;calculated=null;activeIds=null;activeKey=null;return;}
  if(seen.has(d.requestId))return;seen.add(d.requestId);if(seen.size>500)seen.delete(seen.values().next().value);
  if(d.operation==='calculate'){
   const run=++revision;calculated=null;activeIds=null;activeKey=null;
   try{
    validateSettings(d.settings);
    if(d.binding?.urn!==input.urn||d.binding?.viewId!==input.viewId)throw Error('La fuente no coincide con el visor');
    send(d.requestId,{phase:'loading',message:'Leyendo parámetros y geometría de la vista…'});
    inspected??=readElements().then(elements=>inspectElements(elements,d.binding,readGeometry,(done,total)=>{if(run===revision)send(d.requestId,{phase:'loading',message:`Geometría y propiedades: ${done} de ${total} elementos`});})).catch(error=>{inspected=undefined;throw error;});
    const elements=await inspected;if(run!==revision)return;
    calculated=calculateQuantities(elements,d.binding,d.settings);
    send(d.requestId,{phase:'complete',calculation:calculated});
   }catch(e){if(run===revision)send(d.requestId,{phase:'error',message:e.message||'Lectura no disponible'});}
   return;
  }
  if(!calculated){send(d.requestId,{phase:'error',message:'Espera a que termine el cálculo de esta vista'});return;}
  if(d.operation==='filter'){
   const f=d.filter;
   if(!f||!['specialty','category','floor'].every(k=>typeof f[k]==='string'))return;
   activeIds=calculated.records.filter(e=>matchesFilter(e,f)).map(e=>e.dbId);activeKey=JSON.stringify(f);filterRevision++;
   viewer.clearSelection();viewer.setGhosting(false);viewer.showAll();
   send(d.requestId,{phase:'filter',count:activeIds.length,key:activeKey,revision:filterRevision});return;
  }
  if(d.operation==='visibility'){
   if(d.filterKey!==activeKey||!activeIds)return;
   let ids=activeIds;
   if(Array.isArray(d.dbIds)){
    if(d.dbIds.some(id=>!Number.isSafeInteger(id)||!activeIds.includes(id))){send(d.requestId,{phase:'error',message:'Elementos fuera del filtro actual'});return;}
    ids=d.dbIds;
   }
   if(!['filter','attenuate','hide','isolate','focus'].includes(d.action)||d.action!=='filter'&&!ids.length)return;
   viewer.clearSelection();
   if(d.action!=='focus'){viewer.setGhosting(false);viewer.showAll();}
   if(d.action==='attenuate'||d.action==='isolate'){viewer.setGhosting(d.action==='attenuate');viewer.isolate(ids);viewer.fitToView(ids);}
   if(d.action==='hide')viewer.hide(ids);
   if(d.action==='focus')viewer.fitToView(ids);
   send(d.requestId,{phase:'visibility',mode:d.action,count:ids.length,key:activeKey});
  }
 };
 window.addEventListener('message',receive);return()=>{revision++;window.removeEventListener('message',receive);};
}
