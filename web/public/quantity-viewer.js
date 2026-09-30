/* global Autodesk, THREE */
import { installPropertyInspector } from "./quantity-properties.js";
import { buildViewCalculation } from "./quantity-calculation.js";
import { createQuantityFilter } from "./quantity-filter.js";
import { installQuantityV2 } from './quantity-v2/viewer.js';
import { installBimChat } from "./bim-chat-viewer.js";
import { readViewClassification, classificationInventory, classificationRule } from "./quantity-classification.js";
// Real Autodesk SDK viewer. Never fall back to the model's default geometry:
// the server-verified geometry GUID must be present in this exact version.
(() => {
  const status = document.getElementById("status");
  const input = JSON.parse(document.getElementById("viewer-data").textContent);
  let viewer, disposeBimChat, quantityFilter, disposeQuantityV2, inspector;
  let externalMap, reverseMap;
  let classification;
  const classified = () => classification ??= readViewClassification(viewer.model, (count, total) => {
    window.parent.postMessage({type:'aiforma-viewer',state:'parameters',count,total,viewId:input.viewId,urn:input.urn},window.location.origin);
  }).catch(error => { classification = undefined; throw error; });
  const classificationReport = (state, message) => window.parent.postMessage({ type: 'aiforma-viewer', state: 'classification', result: state, message, viewId: input.viewId, urn: input.urn, ruleId: classificationRule.id, ruleVersion: classificationRule.version }, window.location.origin);
  const inspectProperties = () => inspector ??= installPropertyInspector(viewer).catch(() => { inspector=undefined;classificationReport('error','No se pudo abrir la paleta. Pulsa Propiedades para reintentar.');return null; });
  // Independent of Autodesk's adaptive toolbar: remains reachable in compact
  // and fast-loading views, even when the SDK hides its property button.
  const propertyButton=document.createElement('button');
  propertyButton.id='aiforma-property-button';propertyButton.textContent='Propiedades';propertyButton.type='button';propertyButton.disabled=true;
  propertyButton.onclick=()=>void inspectProperties().then(panel=>panel?.setVisible(!panel.isVisible()));
  document.body.append(propertyButton);
  const mapping = () => externalMap ? Promise.resolve(externalMap) : new Promise((resolve,reject)=>viewer.model.getExternalIdMapping(map=>{externalMap=map;reverseMap=new Map(Object.entries(map).map(([id,dbId])=>[dbId,id]));resolve(map);},reject));
  const selectionMessage = async event => {
    const data=event.data;
    if(event.origin!==window.location.origin||event.source!==window.parent||data?.viewId!==input.viewId||data.urn!==input.urn||!viewer?.model)return;
    if(data.type==='aiforma-coordination-colors'&&Array.isArray(data.groups)&&data.groups.length<=100000&&data.groups.every(g=>typeof g?.id==='string'&&['PASS','WARNING','FAIL','PRELIMINARY','NOT EVALUATED','N/A'].includes(g.state))){
      try{
        const map=await mapping(),rank={'N/A':0,PASS:1,PRELIMINARY:2,'NOT EVALUATED':3,WARNING:4,FAIL:5},palette={'N/A':[.65,.69,.75],PASS:[.1,.75,.4],PRELIMINARY:[.2,.5,.95],'NOT EVALUATED':[.5,.57,.65],WARNING:[1,.65,.05],FAIL:[.95,.16,.2]},worst=new Map();
        for(const g of data.groups){const id=map[g.id];if(Number.isSafeInteger(id)&&(!worst.has(id)||rank[g.state]>rank[worst.get(id)]))worst.set(id,g.state);}
        viewer.clearThemingColors(viewer.model);
        for(const [id,state] of worst)viewer.setThemingColor(id,new THREE.Vector4(...palette[state],1),viewer.model,false);
        window.parent.postMessage({type:'aiforma-viewer',state:'audit-action',viewId:input.viewId,urn:input.urn,message:`Estados aplicados a ${worst.size} elementos localizados en esta vista.`},window.location.origin);
      }catch{window.parent.postMessage({type:'aiforma-viewer',state:'audit-action',viewId:input.viewId,urn:input.urn,message:'No se pudieron aplicar los colores de resultados. Los datos de la revisión se conservan.'},window.location.origin);}
      return;
    }
    if(data.type==='aiforma-audit-action'&&['focus','isolate','select'].includes(data.action)&&Array.isArray(data.ids)&&data.ids.length<=150000&&data.ids.every(id=>typeof id==='string')){
      try{
        const map=await mapping(),ids=[...new Set(data.ids.flatMap(id=>Number.isSafeInteger(map[id])?[map[id]]:[]))];
        if(ids.length){viewer.showAll();if(data.action==='isolate')viewer.isolate(ids);else viewer.select(ids);viewer.fitToView(ids);}
        else if(!data.ids.length&&data.action==='isolate'){viewer.showAll();viewer.select([]);}
        window.parent.postMessage({type:'aiforma-viewer',state:'audit-action',viewId:input.viewId,urn:input.urn,message:`${ids.length} elementos localizados de ${data.ids.length} identificadores solicitados en esta vista.${ids.length<data.ids.length?' Algunos objetos no tienen geometría localizable.':''}`},window.location.origin);
      }catch{window.parent.postMessage({type:'aiforma-viewer',state:'audit-action',viewId:input.viewId,urn:input.urn,message:'No se pudieron resolver los identificadores del hallazgo. No se aplicó una selección inferida.'},window.location.origin);}
      return;
    }
    if(data.type==='aiforma-viewer-action') {
      quantityFilter?.applyVisibility(data.action,data.target,data.filterKey);
      return;
    }
    if(data.type==='aiforma-viewer-calculate' && Number.isSafeInteger(data.requestId)) {
      const send=payload=>window.parent.postMessage({type:'aiforma-viewer',state:'calculation',requestId:data.requestId,viewId:input.viewId,urn:input.urn,...payload},window.location.origin);
      send({phase:'loading',message:'Leyendo propiedades y sumando cantidades de la vista…'});
      try { const elements=await classified();send({phase:'complete',data:buildViewCalculation(elements,{urn:input.urn,viewId:input.viewId})}); }
      catch { send({phase:'error',message:'No se pudo completar la lectura de esta vista. No se han generado totales.'}); }
      return;
    }
    if(data.type!=='aiforma-viewer-selection')return;
    if(!Array.isArray(data.highlightedElementIds)||!data.highlightedElementIds.every(id=>typeof id==="string")||data.filteredElementIds!==null&&(!Array.isArray(data.filteredElementIds)||!data.filteredElementIds.every(id=>typeof id==="string")))return;
    await quantityFilter?.update(data);
  };
  window.addEventListener("message",selectionMessage);
  let done = false;
  const report = (state, message) => {
    if (done && state !== "ready") return;
    status.textContent = message;
    status.className = state === "error" ? "error" : "";
    status.hidden = state === "ready";
    window.parent.postMessage({ type: "aiforma-viewer", state, message, viewId: input.viewId, urn: input.urn }, window.location.origin);
  };
  const fail = message => { report("error", message); done = true; };
  if (typeof Autodesk === "undefined") { fail("No se pudo descargar Autodesk Viewer. Vuelve a cargar el modelo."); return; }
  const timeout = setTimeout(() => fail("La carga del modelo está tardando demasiado. Vuelve a cargar para intentarlo nuevamente."), 150000);
  try {
    Autodesk.Viewing.Initializer({ env: "AutodeskProduction", api: "derivativeV2", shouldInitializeAuth: false, useCredentials: true, endpoint: input.endpoint, language: "es" }, () => {
      viewer = new Autodesk.Viewing.GuiViewer3D(document.getElementById("model"), { extensions: [] });
      if (viewer.start() !== 0) { clearTimeout(timeout); fail("No se pudo iniciar el visor 3D. Comprueba que WebGL esté habilitado en tu navegador."); return; }
      viewer.setTheme("light-theme");
      // The property DB and geometry arrive independently. Read the complete
      // property inventory as soon as its tree is ready, while SVF streams.
      viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, event => {
        if (event.model === viewer.model && !done) void classified().catch(() => {});
      });
      viewer.addEventListener(Autodesk.Viewing.MODEL_ROOT_LOADED_EVENT, event => {
        if (event.model !== viewer.model || done) return;
        report('loading', 'Modelo abierto; descargando geometría y preparando parámetros…');
        propertyButton.disabled=false;
        void inspectProperties();
      });
      viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, async event=>{
        if(quantityFilter?.isApplyingSelection())return;
        try { await mapping();window.parent.postMessage({type:"aiforma-viewer",state:"selection",count:event.dbIdArray.length,ids:event.dbIdArray.flatMap(id=>reverseMap.has(id)?[reverseMap.get(id)]:[]),viewId:input.viewId,urn:input.urn},window.location.origin); } catch { /* No inferred element IDs. */ }
      });
      report("loading", "Cargando la versión y vista seleccionadas…");
      Autodesk.Viewing.Document.load("urn:" + input.urn, doc => {
        const matches = doc.getRoot().search({ guid: input.geometryId, type: "geometry" });
        if (matches.length !== 1) { clearTimeout(timeout); fail("La vista seleccionada no está disponible en el modelo publicado. Selecciona otra vista de esta versión."); return; }
        viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, () => {
          propertyButton.disabled=false;
          clearTimeout(timeout);
          if (!done) {
            void inspectProperties();
            quantityFilter = createQuantityFilter(viewer,{mapping,classified,report:classificationReport,send:payload=>window.parent.postMessage({type:'aiforma-viewer',viewId:input.viewId,urn:input.urn,...payload},window.location.origin)});
            disposeBimChat = installBimChat(viewer, input, classified);
            disposeQuantityV2 = installQuantityV2(viewer, input, classified);
            viewer.fitToView(); report("ready", "Vista seleccionada cargada"); done = true;
            void classified().then(elements=>window.parent.postMessage({type:'aiforma-viewer',state:'inventory',elements:classificationInventory(elements),viewId:input.viewId,urn:input.urn},window.location.origin)).catch(()=>classificationReport('error','No se pudieron cargar las opciones de filtros de esta vista.'));

          }
        });
        // Avoid eager mesh consolidation during opening. Original fragments and
        // the full property database remain available for technical calculations.
        viewer.loadDocumentNode(doc, matches[0], {useConsolidation:false}).catch(() => { clearTimeout(timeout); fail("No se pudo cargar la geometría de esta vista. Verifica sus permisos y su publicación en Autodesk."); });
      }, () => { clearTimeout(timeout); fail("No se pudo leer el modelo publicado en Autodesk. Vuelve a cargar o abre la versión en Autodesk."); });
    });
  } catch { clearTimeout(timeout); fail("No se pudo iniciar Autodesk Viewer."); }
  const resize = new ResizeObserver(() => viewer?.resize()); resize.observe(document.body);
  window.addEventListener("pagehide", () => { done = true; clearTimeout(timeout); resize.disconnect(); disposeBimChat?.(); quantityFilter?.dispose(); disposeQuantityV2?.(); window.removeEventListener("message",selectionMessage); if(inspector)void inspector.then(panel=>{if(panel){viewer?.removePanel(panel);panel.uninitialize();}}); viewer?.finish(); }, { once: true });
})();
