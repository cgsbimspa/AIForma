import { classificationRule, elementFloor, associateSubspecialty } from './quantity-classification.js';

export const bimActions = ['select', 'isolate', 'attenuate', 'hide', 'color', 'focus', 'properties', 'showAll', 'resetColors', 'clearSelection'];
export const bimColors = { rojo:[0.93,0.16,0.19], azul:[0.07,0.4,0.94], verde:[0.05,0.7,0.35], amarillo:[1,0.78,0.05], naranja:[1,0.4,0.05], violeta:[0.6,0.22,0.9] };
export const normalizeBim = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/\s+/g,' ').trim();
const printable = v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
const propertyKey = p => `p:${p.displayCategory || 'General'} / ${p.displayName}`;

export function elementFacts(element) {
  const facts = new Map();
  const add = (key, value) => { if(printable(value) && normalizeBim(value)) facts.set(key,[...new Set([...(facts.get(key)??[]),String(value)])]); };
  add('@name',element.name); add('@externalId',element.externalId);
  for(const value of element.specialties??[]) add('@specialty',value);
  add('@subspecialty',associateSubspecialty(element.subspecialty).group??element.subspecialty);
  const floor=elementFloor(element.properties); if(floor!=='Piso no verificado') add('@floor',floor);
  for(const property of element.properties) if(property.displayName) add(propertyKey(property),property.displayValue);
  return facts;
}
export function createBimIndex(elements) {
  if(!elements.length || new Set(elements.map(e=>e.dbId)).size!==elements.length || elements.some(e=>!Number.isSafeInteger(e.dbId)||!Array.isArray(e.properties))) throw Error('Lectura de elementos incompleta. Vuelve a cargar el modelo.');
  const rows=elements.map(element=>({element,facts:elementFacts(element)}));
  const fields=new Map();
  for(const {facts} of rows) for(const [key,values] of facts) {
    if(!fields.has(key)) fields.set(key,new Set());
    for(const value of values) fields.get(key).add(value);
  }
  return {rows,fields,ids:new Set(elements.map(e=>e.dbId))};
}
const labels={'@name':'Nombre del elemento','@externalId':'Identificador Revit','@specialty':`Especialidad · criterios validados v${classificationRule.version}`,'@subspecialty':`Subespecialidad · criterios validados v${classificationRule.version}`,'@floor':'Piso · parámetro Nivel'};
export function bimCatalog(index) {
  // Only bounded examples go to the interpreter. Matching always uses every indexed row.
  const ordered=[...index.fields].sort(([a],[b])=>Number(b.startsWith('@'))-Number(a.startsWith('@'))||Number(/tipo|material|categor|nivel|famil|especial/i.test(b))-Number(/tipo|material|categor|nivel|famil|especial/i.test(a))||a.localeCompare(b));
  const fields=[];let bytes=0;
  for(const [id,values] of ordered) {
    const field={id,label:labels[id]??id.slice(2),values:[...values].filter(v=>v.length<=180).slice(0,16),partial:values.size>16||[...values].some(v=>v.length>180)};
    const size=JSON.stringify(field).length;
    if(fields.length>=100||bytes+size>24000)continue;
    fields.push(field);bytes+=size;
  }
  return {total:index.rows.length,fields,partial:fields.length<index.fields.size,ruleVersion:classificationRule.version};
}
export function validateBimPlan(plan) {
  if(!plan||!bimActions.includes(plan.action)||!['model','selection'].includes(plan.target)||!Array.isArray(plan.filters)||plan.filters.length>6)throw Error('La instrucción no se pudo validar. No se aplicó ninguna acción.');
  if(plan.action==='color'&&!Object.hasOwn(bimColors,plan.color))throw Error('Elige rojo, azul, verde, amarillo, naranja o violeta.');
  for(const f of plan.filters)if(typeof f.field!=='string'||!['equals','contains','not_equals'].includes(f.operator)||!Array.isArray(f.values)||!f.values.length||f.values.length>12||f.values.some(v=>typeof v!=='string'||!normalizeBim(v)||v.length>200))throw Error('Los criterios de búsqueda no son válidos.');
  if(['showAll','resetColors','clearSelection'].includes(plan.action)){if(plan.filters.length||plan.target!=='model')throw Error('La acción global no admite filtros.');}
  else if(plan.target==='model'&&!plan.filters.length)throw Error('Indica qué elementos quieres consultar o selecciona elementos en el visor.');
  return plan;
}
export function queryBim(index,plan,selection=[]) {
  validateBimPlan(plan);
  for(const f of plan.filters)if(!index.fields.has(f.field))throw Error('El parámetro solicitado no está disponible en esta vista: '+f.field.replace(/^p:/,''));
  const selected=new Set(selection);
  if(plan.target==='selection'&&(!selected.size||[...selected].some(id=>!index.ids.has(id))))throw Error('No hay una selección válida. Busca elementos o selecciónalos primero en el modelo.');
  return index.rows.filter(({element,facts})=>(plan.target==='model'||selected.has(element.dbId))&&plan.filters.every(f=>{
    const actual=facts.get(f.field)?.map(normalizeBim);if(!actual?.length)return false; // Missing is UNKNOWN, including negative filters.
    const expected=f.values.map(normalizeBim);
    if(f.operator==='not_equals')return actual.every(v=>!expected.includes(v));
    return actual.some(value=>expected.some(term=>f.operator==='equals'?value===term:value.includes(term)));
  }));
}
export function bimEvidence(rows,plan,total) {
  return {count:rows.length,total,criteria:plan.filters.map(f=>`${labels[f.field]??f.field.replace(/^p:/,'')}: ${f.operator==='contains'?'contiene ':f.operator==='not_equals'?'distinto de ':''}${f.values.join(' / ')}`),sample:rows.slice(0,8).map(({element,facts})=>({dbId:element.dbId,name:element.name||'Nombre no disponible',externalId:element.externalId??null,properties:[...facts].filter(([key])=>plan.action==='properties'||plan.filters.some(f=>f.field===key)).slice(0,80).map(([name,values])=>({name:labels[name]??name.replace(/^p:/,''),value:values.join(' · ')})),propertyCount:facts.size})),samplePartial:rows.length>8,propertiesPartial:plan.action==='properties'&&rows.slice(0,8).some(r=>r.facts.size>80),ruleVersion:classificationRule.version,readAt:new Date().toISOString()};
}
