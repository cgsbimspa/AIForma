// Classification supplied by the user on 2026-09-24. These rules select
// elements; they do not define volume, formwork, weight or length quantities.
export const classificationRule = {
  id: 'cgs-structure-classification', version: '1',
  concreteSubspecialties: ['Emplantillado', 'Muro', 'Losa', 'Losa Fundación', 'Fundación', 'Viga Fundacion', 'Pilar', 'Hormigón', 'Enfierradura', 'Metalcon', 'Acero Galvanizado'],
};
export const normalizeClassification = value => typeof value === 'string'
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ') : '';

function parameter(properties, name) {
  const values = properties.filter(p => normalizeClassification(p.displayName) === normalizeClassification(name))
    .map(p => normalizeClassification(p.displayValue)).filter(Boolean);
  const unique = [...new Set(values)];
  // Duplicate names with conflicting values require explicit category mapping.
  return { value: unique.length === 1 ? unique[0] : '', ambiguous: unique.length > 1 };
}
export function classifyProperties(properties) {
  const specialty = parameter(properties, 'Especialidad');
  const subspecialty = parameter(properties, 'Sub Especialidad');
  if (specialty.ambiguous || subspecialty.ambiguous) return { specialties: [], subspecialty: '', status: 'ambiguous' };
  const specialties = [];
  // Preserve the user's OR; one element can qualify for multiple filters.
  if (specialty.value === 'hormigon' || classificationRule.concreteSubspecialties.some(v => normalizeClassification(v) === subspecialty.value)) specialties.push('Hormigón');
  if (specialty.value === 'enfierradura') specialties.push('Enfierradura');
  if (specialty.value === 'acero galvanizado') specialties.push('Acero Galvanizado');
  return { specialties, subspecialty: subspecialty.value, status: !specialty.value && !subspecialty.value ? 'missing' : 'read' };
}

// Only objects owning geometry in the selected published view are inspected.
// Parent/type records without geometry are not counted again as elements.
export async function readViewClassification(model, progress = () => {}, timeoutMs = 30000) {
  const call = run => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('classification_timeout')), timeoutMs);
    const ok = value => { clearTimeout(timer); resolve(value); };
    const fail = () => { clearTimeout(timer); reject(new Error('classification_unavailable')); };
    try { run(ok, fail); } catch { fail(); }
  });
  const tree = await call((ok, fail) => model.getObjectTree(ok, fail));
  const ids = new Set();
  const inspect = id => { tree.enumNodeFragments(id, () => ids.add(id), false); };
  inspect(tree.getRootId()); tree.enumNodeChildren(tree.getRootId(), inspect, true);
  if (!ids.size) throw new Error('view_geometry_unavailable');
  const elements = [], ordered = [...ids];
  for (let offset = 0; offset < ordered.length; offset += 400) {
    const batch = ordered.slice(offset, offset + 400);
    const results = await call((ok, fail) => model.getBulkProperties2(batch, { ignoreHidden: false, needsExternalId: true }, ok, fail));
    if (!Array.isArray(results) || results.length !== batch.length || new Set(results.map(r => r.dbId)).size !== batch.length || results.some(r => !batch.includes(r.dbId) || !Array.isArray(r.properties))) throw new Error('incomplete_classification');
    for (const result of results) elements.push({ dbId: result.dbId, ...classifyProperties(result.properties) });
    progress(elements.length, ordered.length);
  }
  return elements;
}

export function selectClassifiedElements(elements, specialty, subspecialty) {
  const sub = normalizeClassification(subspecialty);
  return elements.filter(e => (!specialty || e.specialties.includes(specialty)) && (!sub || e.subspecialty === sub)).map(e => e.dbId);
}
