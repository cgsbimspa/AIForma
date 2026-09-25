/* global THREE, Autodesk */
import { createBimIndex, bimCatalog, queryBim, bimEvidence, bimColors, validateBimPlan } from './bim-chat-engine.js';

// The result set is independent of Autodesk's blue/manual selection.
export function installBimChat(viewer,input,readElements) {
  let indexed,revision=0,busy=false,filteredIds=null,suppress=false;
  const processed=new Set();
  const index=()=>indexed??=readElements().then(createBimIndex).catch(error=>{indexed=undefined;throw error;});
  const state=()=>({selectionCount:viewer.getSelection().length,filterActive:filteredIds!==null,filteredCount:filteredIds?.length??0});
  const send=(requestId,payload)=>window.parent.postMessage({type:'aiforma-bim-result',requestId,urn:input.urn,viewId:input.viewId,...payload},window.location.origin);
  const selection=()=>{if(!suppress)send('selection',state());};
  const clearHighlight=()=>{suppress=true;try{viewer.clearSelection();}finally{suppress=false;}};
  viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT,selection);
  const receive=async event=>{
    const data=event.data;
    if(event.origin!==window.location.origin||event.source!==window.parent||data?.type!=='aiforma-bim-request'||data.urn!==input.urn||data.viewId!==input.viewId||typeof data.requestId!=='string')return;
    if(data.operation==='cancel'){
      revision++;busy=false;
      if(data.resetFilter===true){filteredIds=null;clearHighlight();viewer.setGhosting(false);viewer.showAll();send('selection',state());}
      return;
    }
    if(processed.has(data.requestId))return;
    processed.add(data.requestId);if(processed.size>200)processed.delete(processed.values().next().value);
    if(busy){send(data.requestId,{error:'Hay una consulta en curso. Espera a que termine.'});return;}
    const run=++revision;busy=true;
    try {
      const modelIndex=await index();if(run!==revision)return;
      if(data.operation==='catalog'){send(data.requestId,{catalog:bimCatalog(modelIndex)});return;}
      if(data.operation!=='execute')throw Error('Acción no disponible.');
      const plan=validateBimPlan(data.plan);
      const global=['showAll','resetColors','clearSelection','clearFilter'].includes(plan.action);
      const rows=global?[]:queryBim(modelIndex,plan,viewer.getSelection(),filteredIds);
      const ids=rows.map(r=>r.element.dbId);
      // An empty result remains empty. A later "those" can never reuse old hits.
      if(!global)filteredIds=ids;
      if(plan.action==='clearFilter'){filteredIds=null;clearHighlight();viewer.setGhosting(false);viewer.showAll();}
      else if(plan.action==='showAll'){viewer.setGhosting(false);viewer.showAll();clearHighlight();}
      else if(plan.action==='resetColors')viewer.clearThemingColors(viewer.model);
      else if(plan.action==='clearSelection')clearHighlight();
      // Legacy select plans are also interpreted as filters, never blue selection.
      else if(plan.action==='filter'||plan.action==='select')clearHighlight();
      else if(ids.length){
        clearHighlight();
        if(plan.action==='isolate'||plan.action==='attenuate'){viewer.setGhosting(plan.action==='attenuate');viewer.showAll();viewer.isolate(ids);viewer.fitToView(ids);}
        if(plan.action==='hide'){viewer.setGhosting(false);viewer.hide(ids);}
        if(plan.action==='focus')viewer.fitToView(ids);
        if(plan.action==='color'){viewer.show(ids);for(const id of ids)viewer.setThemingColor(id,new THREE.Vector4(...bimColors[plan.color],1),viewer.model,false);}
      }else clearHighlight();
      send(data.requestId,{result:{...bimEvidence(rows,plan,modelIndex.rows.length),action:plan.action,color:plan.color,...state(),applied:global||['filter','select'].includes(plan.action)||ids.length>0}});
    } catch(error){if(run===revision)send(data.requestId,{error:error.message||'No fue posible consultar el modelo. No se confirmó la acción.'});}
    finally{if(run===revision)busy=false;}
  };
  window.addEventListener('message',receive);
  return ()=>{revision++;window.removeEventListener('message',receive);viewer.removeEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT,selection);};
}
