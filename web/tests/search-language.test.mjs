import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSearchTerms, acceptsNextSearchStage, searchConversation } from '../lib/search/language.ts';
import { matchesTerms } from '../lib/search/contracts.ts';
import { planSearch, literalSearch } from '../lib/search/plan.ts';

// Synthetic TEST names only; no production records or learned preferences.
test('purchase searches tolerate case, accents, plurals and aliases while keeping qualifiers', () => {
  const terms = expandSearchTerms([['ÓRDENES DE COMPRAS', 'BIM']]);
  for (const name of ['TEST Órdenes de Compra BIM', 'TEST orden de compra BIM', 'TEST OC1-CE-BIM.pdf', 'TEST O.C. 001 BIM', 'TEST Purchase Order BIM']) assert.ok(matchesTerms(name, terms), name);
  for (const name of ['TEST documento BIM', 'TEST local BIM', 'TEST OC1 electricidad', 'TEST factura BIM', 'TEST presupuesto BIM']) assert.equal(matchesTerms(name, terms), false, name);
  assert.ok(matchesTerms('TEST órdenes de compra', expandSearchTerms([['oc']])));
  assert.ok(matchesTerms('TEST informe de suelos', expandSearchTerms([['informes', 'suelos']])));
  const constrained=['informe contractual definitivo revisado aprobado vigente', 'TEST'];
  assert.ok(expandSearchTerms([constrained,['presupuesto']]).some(group=>group.includes('informe contractual definitivo revisado aprobado vigente')&&group.includes('test')));
});
test('AI search expansion preserves the literal shortcut and uses no extra AI request', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({mode:'search',terms:[['órdenes de compra','BIM']]})}]}]});
  });
  const plan = await planSearch([{role:'user',content:'busca ordenes de compra BIM'}],'TEST','TEST');
  assert.ok(matchesTerms('TEST OC1-BIM.pdf',plan.terms)); assert.equal(calls,1);
  const literal = await planSearch([{role:'user',content:'busca "Órdenes de compra"'}],'TEST','TEST');
  assert.deepEqual(literal,literalSearch('busca "Órdenes de compra"'));
  assert.equal(matchesTerms('TEST OC1.pdf',literal.terms),false); assert.equal(calls,1);
});
test('stage confirmation is conversational without ignoring negations or new instructions', () => {
  for (const answer of ['Sí','si por favor','dale','adelante','continúa','sí, busca también','amplía la búsqueda','busca en los archivos']) assert.ok(acceptsNextSearchStage(answer),answer);
  for (const answer of ['no','no, busca contratos','sí, pero sólo en otra carpeta','busca facturas','no continúes']) assert.equal(acceptsNextSearchStage(answer),false,answer);
  const partial=searchConversation({stage:'folders',done:false,warnings:[],hits:[]},false);
  assert.match(partial.intro,/pendiente o no disponible/); assert.match(partial.question,/incompleta/);
  const complete=searchConversation({stage:'folders',done:true,warnings:[],hits:[]},false);
  assert.match(complete.question,/¿Quieres que ampliemos/); assert.match(complete.question,/misma selección/);
});
