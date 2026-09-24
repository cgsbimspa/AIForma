/* global Autodesk */
// Real Autodesk SDK viewer. Never fall back to the model's default geometry:
// the selected published view GUID must be present in this exact version.
(() => {
  const status = document.getElementById("status");
  const input = JSON.parse(document.getElementById("viewer-data").textContent);
  let viewer;
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
      report("loading", "Cargando la versión y vista seleccionadas…");
      Autodesk.Viewing.Document.load("urn:" + input.urn, doc => {
        const matches = doc.getRoot().search({ guid: input.geometryId, type: "geometry" });
        if (matches.length !== 1) { clearTimeout(timeout); fail("La vista seleccionada no está disponible en el modelo publicado. Selecciona otra vista de esta versión."); return; }
        viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, () => { clearTimeout(timeout); if (!done) { viewer.fitToView(); report("ready", "Vista seleccionada cargada"); done = true; } });
        viewer.loadDocumentNode(doc, matches[0]).catch(() => { clearTimeout(timeout); fail("No se pudo cargar la geometría de esta vista. Verifica sus permisos y su publicación en Autodesk."); });
      }, () => { clearTimeout(timeout); fail("No se pudo leer el modelo publicado en Autodesk. Vuelve a cargar o abre la versión en Autodesk."); });
    });
  } catch { clearTimeout(timeout); fail("No se pudo iniciar Autodesk Viewer."); }
  const resize = new ResizeObserver(() => viewer?.resize()); resize.observe(document.body);
  window.addEventListener("pagehide", () => { done = true; clearTimeout(timeout); resize.disconnect(); viewer?.finish(); }, { once: true });
})();
