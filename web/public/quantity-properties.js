/* global Autodesk */
// Read every property returned by the selected model's published property DB.
// No name/category filter and no hidden-property exclusion. No BIM calculations.
export function readElementProperties(model, dbId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('property_timeout')), timeoutMs);
    const fail = () => { clearTimeout(timer); reject(new Error('properties_unavailable')); };
    try {
      model.getBulkProperties2([dbId], { ignoreHidden: false, needsExternalId: true }, results => {
        clearTimeout(timer);
        if (!Array.isArray(results) || results.length !== 1 || results[0]?.dbId !== dbId || !Array.isArray(results[0]?.properties)) {
          reject(new Error('properties_unavailable')); return;
        }
        resolve(results[0]);
      }, fail);
    } catch { fail(); }
  });
}

export function propertyText(value) {
  return value === null || value === undefined ? 'No disponible' : typeof value === 'object' ? JSON.stringify(value) : String(value);
}
const normalize = value => propertyText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
export function filterProperties(properties, query) {
  const term = normalize(query).trim();
  return term ? properties.filter(p => [p.displayName, p.attributeName, p.displayCategory, p.displayValue, p.units].some(v => normalize(v).includes(term))) : properties;
}
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};

export async function installPropertyInspector(viewer) {
  const manager = await viewer.loadExtension('Autodesk.PropertiesManager');
  class CompletePropertiesPanel extends Autodesk.Viewing.UI.PropertyPanel {
    constructor() {
      super(viewer.container, 'aiforma-properties', 'Propiedades del elemento', { localizeTitle: false });
      this.setGlobalManager(viewer.globalManager);
      this.revision = 0;
      this.result = null;
      this.disposed = false;
      this.container.classList.add('aiforma-properties');
      this.container.style.width = `${Math.min(450, Math.max(300, viewer.container.clientWidth * .48))}px`;
      this.container.style.height = `${Math.max(200, viewer.container.clientHeight - 76)}px`;
      this.container.style.top = '8px';
      this.scrollContainer.hidden = true;
      this.body = node('div', undefined, 'aiforma-properties-body');
      this.container.append(this.body);
      this.choice = node('select');
      this.choice.setAttribute('aria-label', 'Elemento seleccionado para consultar propiedades');
      this.choice.addEventListener('change', () => void this.read(Number(this.choice.value)));
      this.search = node('input');
      this.search.type = 'search';
      this.search.placeholder = 'Buscar propiedad o valor…';
      this.search.setAttribute('aria-label', 'Buscar propiedad o valor');
      this.search.addEventListener('input', () => this.renderRows());
      this.summary = node('p', '', 'aiforma-property-summary');
      this.summary.setAttribute('role', 'status');
      this.identity = node('details', undefined, 'aiforma-property-identity');
      this.tableArea = node('div', undefined, 'aiforma-property-table');
      this.body.append(this.choice, this.search, this.summary, this.identity, this.tableArea);
      this.selectionChanged = () => { if (this.isVisible()) this.refresh(); else { this.revision++; this.result = null; } };
      viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.selectionChanged);
    }
    setVisible(show) {
      super.setVisible(show);
      if (show && this.body) this.refresh();
    }
    refresh() {
      const ids = viewer.getSelection();
      this.choice.replaceChildren();
      this.result = null;
      this.revision++;
      this.search.value = '';
      this.identity.replaceChildren();
      this.tableArea.replaceChildren();
      this.choice.hidden = ids.length < 2;
      if (!ids.length) {
        this.setTitle('Propiedades del elemento', { localizeTitle: false });
        this.summary.textContent = 'Selecciona un elemento para leer sus propiedades publicadas.';
        return;
      }
      ids.forEach((id, index) => { const option = node('option', `Elemento ${index + 1} de ${ids.length} · dbId ${id}`); option.value = String(id); this.choice.append(option); });
      void this.read(ids[0]);
    }
    async read(dbId) {
      const revision = ++this.revision;
      const model = viewer.model;
      this.result = null;
      this.tableArea.replaceChildren();
      this.identity.replaceChildren();
      this.setTitle('Consultando propiedades…', { localizeTitle: false });
      this.summary.textContent = 'Leyendo todas las propiedades devueltas por Autodesk, incluidas las internas…';
      try {
        const result = await readElementProperties(model, dbId);
        if (this.disposed || revision !== this.revision || viewer.model !== model) return;
        this.result = result;
        this.setTitle(result.name || `Elemento dbId ${dbId}`, { localizeTitle: false });
        this.identity.append(node('summary', `Procedencia · dbId ${dbId}`), node('p', `Identificador externo: ${result.externalId || 'No disponible'}`), node('p', 'Fuente: base de propiedades de la versión y vista publicadas seleccionadas. Esta lectura no certifica parámetros ausentes del RVT original.'));
        this.renderRows();
      } catch {
        if (this.disposed || revision !== this.revision) return;
        this.setTitle('Propiedades no disponibles', { localizeTitle: false });
        this.summary.textContent = 'No se pudo completar la lectura de este elemento. No se confirma cobertura completa.';
        const retry = node('button', 'Reintentar lectura');
        retry.addEventListener('click', () => void this.read(dbId));
        this.tableArea.append(retry);
      }
    }
    renderRows() {
      if (!this.result) return;
      const properties = this.result.properties;
      const shown = filterProperties(properties, this.search.value);
      const hiddenCount = properties.filter(p => p.hidden).length;
      this.summary.textContent = `${shown.length} de ${properties.length} propiedades publicadas · ${hiddenCount} internas. ${this.search.value ? 'Filtro de texto activo.' : 'Sin filtros de propiedades.'}`;
      this.tableArea.replaceChildren();
      if (!properties.length) { this.tableArea.append(node('p', 'Autodesk no devolvió propiedades para este elemento.')); return; }
      if (!shown.length) { this.tableArea.append(node('p', 'No hay coincidencias con el filtro.')); return; }
      const groups = new Map();
      shown.forEach(p => { const category = p.displayCategory || 'Sin categoría publicada'; if (!groups.has(category)) groups.set(category, []); groups.get(category).push(p); });
      for (const [category, values] of groups) {
        const section = node('section');
        section.append(node('h3', `${category} (${values.length})`));
        const table = node('table');
        table.setAttribute('aria-label', category);
        const body = node('tbody');
        for (const property of values) {
          const row = node('tr');
          const label = node('th', property.displayName || property.attributeName || 'Nombre no disponible');
          label.scope = 'row';
          label.title = property.attributeName || property.displayName || '';
          if (property.hidden) label.append(node('small', 'Interna'));
          const value = node('td', propertyText(property.displayValue));
          if (property.units) value.append(node('small', property.units));
          row.append(label, value);body.append(row);
        }
        table.append(body);section.append(table);this.tableArea.append(section);
      }
    }
    uninitialize() {
      this.disposed = true;this.revision++;
      viewer.removeEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.selectionChanged);
      super.uninitialize();
    }
  }
  const panel = new CompletePropertiesPanel();
  if (!manager.setPanel(panel)) { panel.uninitialize(); throw new Error('property_panel_unavailable'); }
  return panel;
}
