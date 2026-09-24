import test from 'node:test';
import assert from 'node:assert/strict';
import {isDocumentQuestion,needsPlanReading} from '../lib/assistant/intent.ts';
import {planRegions,readPlanRegions} from '../scripts/plan-ocr.mjs';
import {parseWorkerOutput} from '../lib/documents/parser.ts';

test('PDF diagnostic output cannot corrupt or become evidence in the parser response',()=>{
 const result={status:'parsed',textlessPages:0,segments:[{text:'TEST literal evidence',location:'Página 1',page:1}]};
 assert.deepEqual(parseWorkerOutput('Warning: TEST font diagnostic\nAIFORMA_RESULT:'+JSON.stringify(result)),result);
 assert.throws(()=>parseWorkerOutput('Warning: TEST AVENIDA FALSA'));
 assert.throws(()=>parseWorkerOutput('\nAIFORMA_RESULT:{broken}'));
});

test('content questions bypass folder-name search without turning navigation into document reading',()=>{
 for(const q of ['que calles indica aledañas','¿Qué nombres de calles aparecen en el plano?','Cuál es el valor neto','Explícame lo que indica el documento']) assert.equal(isDocumentQuestion(q),true,q);
 for(const q of ['busca ordenes de compra','qué carpetas hay','Muéstrame los proyectos','busca un archivo de emplazamiento','sí','no']) assert.equal(isDocumentQuestion(q),false,q);
 assert.equal(needsPlanReading('Qué CALLES aparecen en la LÁMINA'),true);
 assert.equal(needsPlanReading('Cuál es el subtotal'),false);
});
test('plan regions cover every edge, overlap, and report incomplete OCR instead of claiming a complete page',async()=>{
 const regions=planRegions(6000,4200);
 assert.equal(regions[0].left,0); assert.equal(regions[0].top,0);
 assert.equal(Math.max(...regions.map(r=>r.left+r.width)),6000);
 assert.equal(Math.max(...regions.map(r=>r.top+r.height)),4200);
 assert.ok(regions[1].left<regions[0].left+regions[0].width);
 const warnings=[],segments=[]; let calls=0;
 await readPlanRegions(6000,4200,async()=>Buffer.from('TEST_BYTES'),'Página 7',{page:7},{available:()=>calls<1,recognize:async(_,location,extra)=>{calls++;return {segments:[{text:'TEST CALLE',location,confidence:90,...extra}]};}},(text,location,extra)=>segments.push({text,location,...extra}),w=>warnings.push(w));
 assert.equal(segments[0].page,7);assert.match(segments[0].location,/Página 7.*fila 1, columna 1/);assert.deepEqual(warnings,['plan_regions_partial']);
});
