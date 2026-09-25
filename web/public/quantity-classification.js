// Classification supplied by the user on 2026-09-24. These rules select
// elements; they do not define volume, formwork, weight or length quantities.
export const classificationRule = {
  id: 'cgs-structure-classification', version: '4',
  concreteSubspecialties: ['Emplantillado', 'Muro', 'Losa', 'Losa Fundación', 'Fundación', 'Viga Fundacion', 'Pilar', 'Hormigón', 'Enfierradura', 'Metalcon', 'Acero Galvanizado'],
};
export const normalizeClassification = value => typeof value === 'string'
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ') : '';

// User-authorized associations. Whole labels only: foundation slabs must not
// fall into Losas, and an unrelated label containing "fund" must not match.
export const subspecialtyCriteria = [
  { group: 'Fundaciones', aliases: ['Fundación', 'Fundaciones', 'Losa Fundación', 'Losas Fundación', 'Losa de Fundación', 'Losas de Fundación', 'Losa Fund', 'Losas Fund', 'Losa Fun', 'Losas Fun', 'Losa de Fund', 'Losa de Fun'] },
  { group: 'Vigas de Fundación', aliases: ['Viga Fundación', 'Vigas Fundación', 'Viga de Fundación', 'Vigas de Fundación', 'Viga Fund', 'Vigas Fund', 'Viga Fun', 'Vigas Fun', 'Viga de Fund', 'Viga de Fun'] },
  { group: 'Losas', aliases: ['Losa', 'Losas'] },
  { group: 'Vigas', aliases: ['Viga', 'Vigas'] },
  { group: 'Muros', aliases: ['Muro', 'Muros'] },
  { group: 'Pilares', aliases: ['Pilar', 'Pilares'] },
  { group: 'Emplantillado', aliases: ['Emplantillado', 'Emplantillados'] },
  { group: 'Hormigón', aliases: ['Hormigón'] },
  { group: 'Enfierradura', aliases: ['Enfierradura', 'Enfierraduras'] },
  { group: 'Acero Galvanizado', aliases: ['Acero Galvanizado', 'Acero Galv', 'Ac Galvanizado', 'Ac Galv', 'Metalcon', 'Metlcon', 'Metal con'] },
  { group: 'Placas de techumbre', aliases: ['Placas de techumbre', 'Placa de techumbre'] },
];
const normalizeLabel = value => normalizeClassification(value).replace(/[._\-/]+/g, ' ').trim().replace(/\s+/g, ' ');
const associationIndex = new Map();
for (const {group, aliases} of subspecialtyCriteria) {
  for (const alias of [group, ...aliases]) {
    const key = normalizeLabel(alias);
    if (associationIndex.has(key) && associationIndex.get(key) !== group) throw new Error('ambiguous_subspecialty_criteria');
    associationIndex.set(key, group);
  }
}
export function associateSubspecialty(value) {
  const original = typeof value === 'string' ? value : '';
  return { original, group: associationIndex.get(normalizeLabel(original)) ?? null, ruleId: classificationRule.id, ruleVersion: classificationRule.version };
}

export function parameter(properties, name) {
  const matching = properties.filter(p => normalizeClassification(p.displayName) === normalizeClassification(name));
  const values = matching
    .map(p => normalizeClassification(typeof p.displayValue === 'number' ? String(p.displayValue) : p.displayValue)).filter(Boolean);
  const unique = [...new Set(values)];
  // Duplicate names with conflicting values require explicit category mapping.
  return { value: unique.length === 1 ? unique[0] : '', originals: matching.map(p => p.displayValue), ambiguous: unique.length > 1 };
}
export function classifyProperties(properties, elementName = '') {
  const specialty = parameter(properties, 'Especialidad');
  const subspecialty = parameter(properties, 'Sub Especialidad');
  const type = parameter(properties, 'Nombre de tipo');
  const association = associateSubspecialty(subspecialty.originals.find(value => normalizeClassification(value)) ?? '');
  const evidence = { originalSubspecialties: subspecialty.originals, originalSpecialties: specialty.originals, typeName: type.originals.find(value => normalizeClassification(value)) ?? '', association };
  // Explicit type rules take priority over legacy specialty labels. An OSB
  // board is not steel merely because another field mentions Metalcon.
  const label = normalizeLabel(type.value);
  const metalcon = value => /(?:^|\s)met(?:al|l)\s*con(?:\s|\d|$)/.test(normalizeLabel(value));
  const steelType = /(?:^|\s)(?:40ca085|viga perfil)(?:\s|$)/.test(label) || metalcon(label);
  const steelName = metalcon(elementName);
  const steel = steelType || steelName;
  const board = /(?:^|\s)(?:pl|placa|placas|tablero|tableros)\s+osb(?:\s|$)/.test(label);
  if (type.ambiguous || steel && board) return { specialties: [], subspecialty: '', status: 'ambiguous', ...evidence };
  if (steel || board) {
    const group = steel ? 'Acero Galvanizado' : 'Placas de techumbre';
    return { ...evidence, specialties: ['Cubierta'], subspecialty: group, status: 'read', association: { ...associateSubspecialty(group), original: steelName && !steelType ? elementName : evidence.typeName, parameter: steelName && !steelType ? 'Nombre de elemento Autodesk' : 'Nombre de tipo' } };
  }
  if (specialty.ambiguous || subspecialty.ambiguous) return { specialties: [], subspecialty: '', status: 'ambiguous', ...evidence };
  if (association.group === 'Acero Galvanizado' || specialty.value === 'acero galvanizado' || metalcon(specialty.value) || metalcon(subspecialty.value)) return { ...evidence, specialties: ['Cubierta'], subspecialty: 'Acero Galvanizado', status: 'read' };
  if (association.group === 'Placas de techumbre' || ['planchas','placas de techumbre'].includes(specialty.value)) return { ...evidence, specialties: ['Cubierta'], subspecialty: 'Placas de techumbre', status: 'read' };
  if (specialty.value === 'cubierta') return { specialties: ['Cubierta'], subspecialty: subspecialty.value, status: 'read', ...evidence };
  const specialties = [];
  // Preserve the user's OR; one element can qualify for multiple filters.
  if (specialty.value === 'hormigon' || association.group !== null && association.group !== 'Placas de techumbre') specialties.push('Hormigón');
  if (specialty.value === 'enfierradura') specialties.push('Enfierradura');
  if (specialty.value === 'acero galvanizado') specialties.push('Acero Galvanizado');
  const beam = /^v\s*\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?(?:\s|$)/.test(type.value);
  return { ...evidence, specialties, subspecialty: beam ? 'Vigas' : subspecialty.value, status: !specialty.value && !subspecialty.value && !beam ? 'missing' : 'read', ...(beam ? {association:{...associateSubspecialty('Vigas'),original:evidence.typeName,parameter:'Nombre de tipo'}} : {}) };
}

export function elementFloor(properties) {
  const level = parameter(properties, 'Nivel');
  return level.ambiguous || !level.value ? 'Piso no verificado' : String(level.originals.find(v => typeof v === 'number' || normalizeClassification(v)));
}
export function classificationInventory(elements) {
  return elements.map(e => ({dbId:e.dbId, specialties:e.specialties, subspecialty:associateSubspecialty(e.subspecialty).group ?? e.subspecialty, floor:elementFloor(e.properties)}));
}
export function matchesClassification(e, filter) {
  return (!filter.specialty || e.specialties.includes(filter.specialty)) && (!filter.subspecialty || e.subspecialty === filter.subspecialty) && (!filter.floor || e.floor === filter.floor);
}
export function classificationFacets(elements, filter) {
  const unique = values => [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
  return {
    specialties:unique(elements.filter(e=>matchesClassification(e,{...filter,specialty:''})).flatMap(e=>e.specialties)),
    subspecialties:unique(elements.filter(e=>matchesClassification(e,{...filter,subspecialty:''})).map(e=>e.subspecialty)),
    floors:unique(elements.filter(e=>matchesClassification(e,{...filter,floor:''})).map(e=>e.floor)),
  };
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
    for (const result of results) elements.push({ dbId: result.dbId, name: result.name ?? '', externalId: result.externalId ?? null, properties: result.properties, ...classifyProperties(result.properties, result.name) });
    progress(elements.length, ordered.length);
  }
  return elements;
}

export function selectClassifiedElements(elements, specialty, subspecialty) {
  const group = associateSubspecialty(subspecialty).group;
  return elements.filter(e => (!specialty || e.specialties.includes(specialty)) && (!subspecialty || group !== null && associateSubspecialty(e.subspecialty).group === group)).map(e => e.dbId);
}
