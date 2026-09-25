import test from 'node:test';
import assert from 'node:assert/strict';
import {isDocumentQuestion,needsPlanReading} from '../lib/assistant/intent.ts';
import {planRegions,readPlanRegions} from '../scripts/plan-ocr.mjs';
import {parseWorkerOutput} from '../lib/documents/parser.ts';
import {parseDocument,parseWorkerCheckpoint} from '../lib/documents/parser.ts';
import {createCanvas} from '@napi-rs/canvas';

test('PDF diagnostic output cannot corrupt or become evidence in the parser response',()=>{
 const result={status:'parsed',textlessPages:0,segments:[{text:'TEST literal evidence',location:'Página 1',page:1}]};
 assert.deepEqual(parseWorkerOutput('Warning: TEST font diagnostic\nAIFORMA_RESULT:'+JSON.stringify(result)),result);
 assert.throws(()=>parseWorkerOutput('Warning: TEST AVENIDA FALSA'));
 assert.throws(()=>parseWorkerOutput('\nAIFORMA_RESULT:{broken}'));
 const checkpoint=parseWorkerCheckpoint('\nAIFORMA_CHECKPOINT:'+JSON.stringify(result)+'\n','parse_timeout');
 assert.equal(checkpoint.partial,true);assert.ok(checkpoint.warnings.includes('parse_timeout'));assert.deepEqual(checkpoint.segments,result.segments);
 assert.equal(parseWorkerCheckpoint('\nAIFORMA_CHECKPOINT:{broken}\n','parse_timeout'),undefined);
});

test('content questions bypass folder-name search without turning navigation into document reading',()=>{
 for(const q of ['que calles indica aledañas','¿Qué nombres de calles aparecen en el plano?','Cuál es el valor neto','Explícame lo que indica el documento','Busca las calles dentro de este plano']) assert.equal(isDocumentQuestion(q),true,q);
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

test('regional OCR recovers a rotated TEST street label with page, zone and its own confidence',async()=>{
 const canvas=createCanvas(1500,1000),ctx=canvas.getContext('2d');
 ctx.fillStyle='white';ctx.fillRect(0,0,1500,1000);
 ctx.translate(350,600);ctx.rotate(-Math.PI/6);ctx.fillStyle='black';ctx.font='26px Arial';ctx.fillText('AVENIDA PRUEBA 47',0,0);
 const parsed=await parseDocument(canvas.toBuffer('image/png'),'TEST-rotated-plan.png',undefined,{detail:'plan'});
 const hit=parsed.segments.find(s=>s.text==='AVENIDA PRUEBA 47'&&s.confidence>=75);
 assert.ok(hit,'A literal street label must be recovered without prompting the OCR with its name');
 assert.equal(hit.page,1);assert.equal(hit.method,'ocr');assert.match(hit.location,/fila \d+, columna \d+.*OCR/);
});

test('general summary intent routes content reading without confusing file-name searches',async()=>{
 const {isGeneralSummaryRequest,generalSummaryQuestion}=await import('../lib/assistant/intent.ts');
 assert.equal(needsPlanReading(generalSummaryQuestion),false,'General summaries must not trigger street-plan OCR');
 for(const text of ['Resume este documento','RESÚMEME el PDF','Resumen general','Dame un resumen del documento','Puedes preparar una búsqueda']) {
  assert.equal(isGeneralSummaryRequest(text),text!=='Puedes preparar una búsqueda',text);
 }
 for(const text of ['busca el archivo resumen','¿Dónde está la carpeta Resumen?','No resumas este documento'])assert.equal(isGeneralSummaryRequest(text),false,text);
});
