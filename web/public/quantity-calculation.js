import { associateSubspecialty, classificationRule, normalizeClassification, parameter } from './quantity-classification.js';

export const viewQuantityRules = [
  { metric: 'concrete_volume_m3', name: 'Hormigón', parameter: 'Volumen', unit: 'm³', apsUnit: 'cubicMeters' },
  { metric: 'galvanized_steel_length_ml', name: 'Acero Galvanizado', parameter: 'Longitud', unit: 'ml', apsUnit: 'meters' },
];
export function readQuantity(properties, rule) {
  const matches = properties.filter(p => !p.hidden && normalizeClassification(p.displayName) === normalizeClassification(rule.parameter));
  const empty = { quantity: null, property: rule.parameter, category: '', rawValue: '', rawUnit: '' };
  if (!matches.length) return { ...empty, issue: 'Parámetro no encontrado' };
  // Do not choose a category or collapse multiple source properties silently.
  if (matches.length !== 1) return { ...empty, issue: 'Más de un parámetro con ese nombre; requiere seleccionar categoría' };
  const p = matches[0];
  const evidence = { property: p.displayName, category: p.displayCategory || '', rawValue: String(p.displayValue ?? ''), rawUnit: String(p.units ?? '') };
  const units = rule.unit === 'm³' ? ['m³', 'm3', 'm^3'] : ['m', 'ml'];
  const validUnit = units.includes(evidence.rawUnit) || new RegExp(`^autodesk\\.unit\\.unit:${rule.apsUnit}-\\d+\\.\\d+\\.\\d+$`).test(evidence.rawUnit);
  if (!validUnit) return { ...empty, ...evidence, issue: 'Unidad no disponible o distinta de la unidad requerida' };
  const raw = p.displayValue;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < 0) return { ...empty, ...evidence, issue: 'Valor numérico no válido' };
  return { ...evidence, quantity: value, issue: null };
}
export function buildViewCalculation(elements, binding, now = new Date().toISOString()) {
  if (new Set(elements.map(e => e.dbId)).size !== elements.length) throw new Error('duplicate_model_elements');
  const records = [];
  const externalCounts = new Map();
  for(const e of elements)if(e.externalId)externalCounts.set(e.externalId,(externalCounts.get(e.externalId)??0)+1);
  for (const e of elements) {
    if (e.status === 'ambiguous' || e.status === 'missing') continue;
    const sub = associateSubspecialty(e.subspecialty).group;
    const rules = viewQuantityRules.filter(rule => rule.metric === 'concrete_volume_m3'
      ? e.specialties.includes('Hormigón')
      : sub === 'Acero Galvanizado' && (e.specialties.includes('Cubierta') || e.specialties.includes('Acero Galvanizado')));
    const level = parameter(e.properties, 'Nivel');
    for (const rule of rules) {
      const quantity=readQuantity(e.properties,rule);
      if(e.externalId&&externalCounts.get(e.externalId)>1){quantity.quantity=null;quantity.issue='Identificador externo repetido en la vista; cantidad no confirmada';}
      records.push({ metric: rule.metric, dbId: e.dbId, externalId: e.externalId,
        specialty: e.specialties.includes('Cubierta') ? 'Cubierta' : rule.metric === 'concrete_volume_m3' ? 'Hormigón' : 'Acero Galvanizado',
        subspecialty: sub || e.subspecialty || 'Subespecialidad no disponible',
        typeName: e.typeName || 'Tipo no disponible',
        floor: level.ambiguous || !level.value ? 'Piso no verificado' : String(level.originals.find(v => typeof v === 'number' || normalizeClassification(v))),
        unit: rule.unit, ...quantity });
    }
  }
  return { ...binding, calculatedAt: now, engine: 'published-view-quantities-v1', ruleId: classificationRule.id, ruleVersion: classificationRule.version,
    inspected: elements.length, unclassified: elements.filter(e => !e.specialties.length).length, records };
}

export function sumVerified(values) {
  let sum = 0, correction = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) throw new Error('invalid_quantity');
    const adjusted = value - correction, next = sum + adjusted;
    correction = (next - sum) - adjusted; sum = next;
  }
  if (!Number.isFinite(sum)) throw new Error('quantity_overflow');
  return sum;
}
