/* global THREE, Autodesk */
import { createBimIndex, bimCatalog, queryBim, bimEvidence, bimColors, validateBimPlan } from './bim-chat-engine.js';

// Shares the authenticated, version-bound Viewer; no arbitrary code, URLs or dbIds from the LLM.
export function installBimChat(viewer,input,readElements) {
  let indexed,revision=0,busy=false,lastSelection=[],suppress=false;
  const processed=new Set();
  const index=()=>indexed??=readElements().then(createBimIndex).catch(error=>{indexed=undefined;throw error;});
  const send=(requestId,payload)=>window.parent.postMessage({type:'aiforma-bim-result',requestId,urn:input.urn,viewId:input.viewId,...payload},window.location.origin);
  const selection=()=>{if(!suppress){lastSelection=viewer.getSelection();send('selection',{selectionCount:lastSelection.length});}};
  viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT,selection);
  const receive=async event=>{
    const data=event.data;
    if(event.origin!==window.location.origin||event.source!==window.parent||data?.type!=='aiforma-bim-request'||data.urn!==input.urn||data.viewId!==input.viewId||typeof data.requestId!=='string')return;
    if(data.operation==='cancel'){revision++;busy=false;return;}
    if(processed.has(data.requestId))return;
    processed.add(data.requestId);if(processed.size>200)processed.delete(processed.values().next().value);
    if(busy){send(data.requestId,{error:'Hay una consulta en curso. Espera a que termine.'});return;}
    const run=++revision;busy=true;
    try {
      const modelIndex=await index();if(run!==revision)return;
      if(data.operation==='catalog'){send(data.requestId,{catalog:bimCatalog(modelIndex)});return;}
      if(data.operation!=='execute')throw Error('Acción no disponible.');
      const plan=validateBimPlan(data.plan);
      const global=['showAll','resetColors','clearSelection'].includes(plan.action);
      const rows=global?[]:queryBim(modelIndex,plan,lastSelection);
      const ids=rows.map(r=>r.element.dbId);
      if(ids.length||global) {
        suppress=true;
        try {
          if(plan.action==='showAll'){viewer.setGhosting(false);viewer.showAll();viewer.clearSelection();lastSelection=[];}
          else if(plan.action==='resetColors')viewer.clearThemingColors(viewer.model);
          else if(plan.action==='clearSelection'){viewer.clearSelection();lastSelection=[];}
          else {
            lastSelection=ids;
            if(plan.action==='select'){viewer.setGhosting(false);viewer.showAll();viewer.select(ids);viewer.fitToView(ids);}
            if(plan.action==='isolate'||plan.action==='attenuate'){viewer.setGhosting(plan.action==='attenuate');viewer.showAll();viewer.isolate(ids);viewer.select(ids);viewer.fitToView(ids);}
            if(plan.action==='hide'){viewer.clearSelection();viewer.setGhosting(false);viewer.hide(ids);}
            if(plan.action==='focus')viewer.fitToView(ids);
            if(plan.action==='color'){viewer.clearSelection();viewer.show(ids);for(const id of ids)viewer.setThemingColor(id,new THREE.Vector4(...bimColors[plan.color],1),viewer.model,false);}
          }
        } finally{suppress=false;}
      } else {lastSelection=[];suppress=true;try{viewer.clearSelection();}finally{suppress=false;}}
      send(data.requestId,{result:{...bimEvidence(rows,plan,modelIndex.rows.length),action:plan.action,color:plan.color,selectionCount:lastSelection.length,applied:global||ids.length>0}});
    } catch(error){if(run===revision)send(data.requestId,{error:error.message||'No fue posible consultar el modelo. No se confirmó la acción.'});}
    finally{if(run===revision)busy=false;}
  };
  window.addEventListener('message',receive);
  return ()=>{revision++;window.removeEventListener('message',receive);viewer.removeEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT,selection);};
}
