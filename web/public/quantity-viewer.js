/* global Autodesk */
import { installPropertyInspector } from "./quantity-properties.js";
// Real Autodesk SDK viewer. Never fall back to the model's default geometry:
// the server-verified geometry GUID must be present in this exact version.
(() => {
  const status = document.getElementById("status");
  const input = JSON.parse(document.getElementById("viewer-data").textContent);
  let viewer;
  let externalMap, reverseMap, applyingSelection = false, selectionRevision = 0;
  const mapping = () => externalMap ? Promise.resolve(externalMap) : new Promise((resolve,reject)=>viewer.model.getExternalIdMapping(map=>{externalMap=map;reverseMap=new Map(Object.entries(map).map(([id,dbId])=>[dbId,id]));resolve(map);},reject));
  const selectionMessage = async event => {
    const data=event.data;
    if(event.origin!==window.location.origin||event.source!==window.parent||data?.type!=="aiforma-viewer-selection"||data.viewId!==input.viewId||data.urn!==input.urn||!viewer?.model)return;
    if(!Array.isArray(data.highlightedElementIds)||!data.highlightedElementIds.every(id=>typeof id==="string")||data.filteredElementIds!==null&&(!Array.isArray(data.filteredElementIds)||!data.filteredElementIds.every(id=>typeof id==="string")))return;
    const revision=++selectionRevision;
    try {
      if(data.filteredElementIds===null&&!data.highlightedElementIds.length){viewer.isolate([]);return;}
      const map=await mapping();if(revision!==selectionRevision)return;
      const all=[...data.highlightedElementIds,...(data.filteredElementIds??[])];
      if(all.some(id=>!Object.hasOwn(map,id))) { status.hidden=false;status.textContent="No se pudo vincular esta selección a elementos de esta vista. No se aplicó el filtro.";return; }
      viewer.isolate(data.filteredElementIds===null?[]:data.filteredElementIds.map(id=>map[id]));
      const desired=data.highlightedElementIds.map(id=>map[id]), current=viewer.getSelection();
      if(current.length!==desired.length||current.some(id=>!desired.includes(id))){applyingSelection=true;viewer.select(desired);applyingSelection=false;}
      if(data.highlightedElementIds.length)viewer.fitToView(data.highlightedElementIds.map(id=>map[id]));
    } catch { status.hidden=false;status.textContent="No se pudieron verificar los identificadores de los elementos."; }
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
        if(applyingSelection)return;
        try { await mapping();window.parent.postMessage({type:"aiforma-viewer",state:"selection",ids:event.dbIdArray.flatMap(id=>reverseMap.has(id)?[reverseMap.get(id)]:[]),viewId:input.viewId,urn:input.urn},window.location.origin); } catch { /* No inferred element IDs. */ }
      });
      report("loading", "Cargando la versión y vista seleccionadas…");
      Autodesk.Viewing.Document.load("urn:" + input.urn, doc => {
        const matches = doc.getRoot().search({ guid: input.geometryId, type: "geometry" });
        if (matches.length !== 1) { clearTimeout(timeout); fail("La vista seleccionada no está disponible en el modelo publicado. Selecciona otra vista de esta versión."); return; }
        viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, () => {
          clearTimeout(timeout);
          if (!done) {
            viewer.fitToView(); report("ready", "Vista seleccionada cargada"); done = true;
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
  window.addEventListener("pagehide", () => { done = true; clearTimeout(timeout); resize.disconnect(); window.removeEventListener("message",selectionMessage); viewer?.finish(); }, { once: true });
})();
