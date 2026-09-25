/* global Autodesk */
import { installPropertyInspector } from "./quantity-properties.js";
import { buildViewCalculation } from "./quantity-calculation.js";
import { createQuantityFilter } from "./quantity-filter.js";
import { installBimChat } from "./bim-chat-viewer.js";
import { readViewClassification, classificationInventory, classificationRule } from "./quantity-classification.js";
// Real Autodesk SDK viewer. Never fall back to the model's default geometry:
// the server-verified geometry GUID must be present in this exact version.
(() => {
  const status = document.getElementById("status");
  const input = JSON.parse(document.getElementById("viewer-data").textContent);
  let viewer, disposeBimChat, quantityFilter;
  let externalMap, reverseMap;
  let classification;
  const classified = () => classification ??= readViewClassification(viewer.model).catch(error => { classification = undefined; throw error; });
  const classificationReport = (state, message) => window.parent.postMessage({ type: 'aiforma-viewer', state: 'classification', result: state, message, viewId: input.viewId, urn: input.urn, ruleId: classificationRule.id, ruleVersion: classificationRule.version }, window.location.origin);
  const mapping = () => externalMap ? Promise.resolve(externalMap) : new Promise((resolve,reject)=>viewer.model.getExternalIdMapping(map=>{externalMap=map;reverseMap=new Map(Object.entries(map).map(([id,dbId])=>[dbId,id]));resolve(map);},reject));
  const selectionMessage = async event => {
    const data=event.data;
    if(event.origin!==window.location.origin||event.source!==window.parent||data?.viewId!==input.viewId||data.urn!==input.urn||!viewer?.model)return;
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
      viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, async event=>{
        if(quantityFilter?.isApplyingSelection())return;
        try { await mapping();window.parent.postMessage({type:"aiforma-viewer",state:"selection",count:event.dbIdArray.length,ids:event.dbIdArray.flatMap(id=>reverseMap.has(id)?[reverseMap.get(id)]:[]),viewId:input.viewId,urn:input.urn},window.location.origin); } catch { /* No inferred element IDs. */ }
      });
      report("loading", "Cargando la versión y vista seleccionadas…");
      Autodesk.Viewing.Document.load("urn:" + input.urn, doc => {
        const matches = doc.getRoot().search({ guid: input.geometryId, type: "geometry" });
        if (matches.length !== 1) { clearTimeout(timeout); fail("La vista seleccionada no está disponible en el modelo publicado. Selecciona otra vista de esta versión."); return; }
        viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, () => {
          clearTimeout(timeout);
          if (!done) {
            quantityFilter = createQuantityFilter(viewer,{mapping,classified,report:classificationReport,send:payload=>window.parent.postMessage({type:'aiforma-viewer',viewId:input.viewId,urn:input.urn,...payload},window.location.origin)});
            disposeBimChat = installBimChat(viewer, input, classified);
            viewer.fitToView(); report("ready", "Vista seleccionada cargada"); done = true;
            void classified().then(elements=>window.parent.postMessage({type:'aiforma-viewer',state:'inventory',elements:classificationInventory(elements),viewId:input.viewId,urn:input.urn},window.location.origin)).catch(()=>classificationReport('error','No se pudieron cargar las opciones de filtros de esta vista.'));

            void installPropertyInspector(viewer).catch(() => {
              status.hidden=false;status.textContent="La paleta completa no está disponible. Las propiedades estándar no confirman una lectura completa.";
            });
          }
        });
        viewer.loadDocumentNode(doc, matches[0]).catch(() => { clearTimeout(timeout); fail("No se pudo cargar la geometría de esta vista. Verifica sus permisos y su publicación en Autodesk."); });
      }, () => { clearTimeout(timeout); fail("No se pudo leer el modelo publicado en Autodesk. Vuelve a cargar o abre la versión en Autodesk."); });
    });
  } catch { clearTimeout(timeout); fail("No se pudo iniciar Autodesk Viewer."); }
  const resize = new ResizeObserver(() => viewer?.resize()); resize.observe(document.body);
  window.addEventListener("pagehide", () => { done = true; clearTimeout(timeout); resize.disconnect(); disposeBimChat?.(); quantityFilter?.dispose(); window.removeEventListener("message",selectionMessage); viewer?.finish(); }, { once: true });
})();
