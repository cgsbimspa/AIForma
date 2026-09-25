import { createGeometryService } from './geometry-viewer.js';
import { inspectElements, calculateQuantities, validateSettings, filterRecords } from './quantity-service.js';
import { inspectMEPElements, calculateMEPQuantities } from './mep-service.js';
export function installQuantityV2(viewer,input,readElements){
 let inspected,inspectedMode,calculated,revision=0,filterRevision=0,activeIds=null,activeKey=null,visualMode='isolate';
 let applyingVisibility=false,selectionRevision=0,selectionPending=false,calculationId=null;
 const readGeometry=createGeometryService(viewer),seen=new Set();
 const send=(requestId,payload)=>window.parent.postMessage({type:'aiforma-quantity-v2-result',requestId,urn:input.urn,viewId:input.viewId,...payload},window.location.origin);
 const withoutSelectionEvents=fn=>{applyingVisibility=true;try{fn();}finally{applyingVisibility=false;}};
 const display=(ids,mode)=>withoutSelectionEvents(()=>{
  viewer.clearSelection();viewer.setGhosting(false);viewer.showAll();
  if(!ids.length)return; // Parent masks the canvas; isolate([]) means show all in APS.
  if(mode==='attenuate'||mode==='isolate'){viewer.setGhosting(mode==='attenuate');viewer.isolate(ids);viewer.fitToView(ids);}
  if(mode==='hide')viewer.hide(ids);
 });
 const selectionChanged=event=>{
  if(applyingVisibility||!calculated||event.model!==viewer.model||!Array.isArray(event.dbIdArray))return;
  const known=new Set(calculated.records.map(e=>e.dbId)),ids=new Set(),tree=viewer.model.getInstanceTree();
  for(const id of event.dbIdArray){if(!Number.isSafeInteger(id))continue;if(known.has(id))ids.add(id);tree?.enumNodeChildren(id,child=>{if(known.has(child))ids.add(child);},true);}
  selectionRevision++;selectionPending=true;activeKey=null;
  send(calculationId,{phase:'selection',selectionRevision,dbIds:event.dbIdArray.length?[...ids].sort((a,b)=>a-b):null});
 };
 const receive=async event=>{
  const d=event.data;
  if(event.origin!==window.location.origin||event.source!==window.parent||d?.type!=='aiforma-quantity-v2'||d.urn!==input.urn||d.viewId!==input.viewId||typeof d.requestId!=='string')return;
  if(d.operation==='cancel'){revision++;calculated=null;calculationId=null;activeIds=null;activeKey=null;return;}
  if(seen.has(d.requestId))return;seen.add(d.requestId);if(seen.size>500)seen.delete(seen.values().next().value);
  if(d.operation==='calculate'){
   const run=++revision;calculated=null;calculationId=null;activeIds=null;activeKey=null;
   try{
    validateSettings(d.settings);
    if(d.template!==undefined&&!['structure','mep'].includes(d.template))throw Error('Plantilla de cálculo no válida');
    const mep=d.template==='mep';if(inspectedMode!==mep){inspected=undefined;inspectedMode=mep;}
    if(d.binding?.urn!==input.urn||d.binding?.viewId!==input.viewId)throw Error('La fuente no coincide con el visor');
    send(d.requestId,{phase:'loading',message:'Leyendo parámetros y geometría de la vista…'});
    inspected??=readElements().then(elements=>(mep?inspectMEPElements:inspectElements)(elements,d.binding,readGeometry,(done,total)=>{if(run===revision)send(d.requestId,{phase:'loading',message:`Geometría y propiedades: ${done} de ${total} elementos`});})).catch(error=>{inspected=undefined;throw error;});
    const elements=await inspected;if(run!==revision)return;
    calculated=(mep?calculateMEPQuantities:calculateQuantities)(elements,d.binding,d.settings);calculationId=d.requestId;
    send(d.requestId,{phase:'complete',calculation:calculated});
   }catch(e){if(run===revision)send(d.requestId,{phase:'error',message:e.message||'Lectura no disponible'});}
   return;
  }
  if(!calculated){send(d.requestId,{phase:'error',message:'Espera a que termine el cálculo de esta vista'});return;}
  if(d.operation==='filter'){
   const f=d.filter;
   if(!f||!['specialty','category','floor'].every(k=>typeof f[k]==='string'||Array.isArray(f[k])&&f[k].every(v=>typeof v==='string')))return;
   if((d.selectionRevision??0)!==selectionRevision)return;
   const known=new Set(calculated.records.map(e=>e.dbId));
   if(f.selection!=null&&(!Array.isArray(f.selection)||f.selection.some(id=>!Number.isSafeInteger(id)||!known.has(id))))return;
   activeIds=filterRecords(calculated.records,f).map(e=>e.dbId);activeKey=JSON.stringify(f);filterRevision++;
   const hasFilter=['specialty','category','floor'].some(k=>f[k].length>0)||f.selection!=null;
   // A manual pick narrows the data but keeps the camera and geometry available
   // for Ctrl-click additions. Later facet changes still update the viewer.
   const preserveSelection=selectionPending&&f.selection!=null;
   const mode=preserveSelection?'selection':hasFilter?visualMode:'filter';
   selectionPending=false;if(!preserveSelection)display(activeIds,mode);
   send(d.requestId,{phase:'filter',mode,count:activeIds.length,key:activeKey,revision:filterRevision});return;
  }
  if(d.operation==='visibility'){
   if(d.filterKey!==activeKey||!activeIds)return;
   let ids=activeIds;
   if(Array.isArray(d.dbIds)){
    if(d.dbIds.some(id=>!Number.isSafeInteger(id)||!activeIds.includes(id))){send(d.requestId,{phase:'error',message:'Elementos fuera del filtro actual'});return;}
    ids=d.dbIds;
   }
   if(!['filter','attenuate','hide','isolate','focus'].includes(d.action)||d.action!=='filter'&&!ids.length)return;
   if(d.action==='focus')withoutSelectionEvents(()=>{viewer.clearSelection();viewer.fitToView(ids);});
   else {visualMode=d.action;display(ids,visualMode);}
   send(d.requestId,{phase:'visibility',mode:d.action,count:ids.length,key:activeKey});
  }
 };
 const selectionEvent=Autodesk.Viewing.SELECTION_CHANGED_EVENT;
 viewer.addEventListener(selectionEvent,selectionChanged);
 window.addEventListener('message',receive);return()=>{revision++;viewer.removeEventListener(selectionEvent,selectionChanged);window.removeEventListener('message',receive);};
}
