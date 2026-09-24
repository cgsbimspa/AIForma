import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import Excel from 'exceljs';
import JSZip from 'jszip';
import { parseDocument } from '../lib/documents/parser.ts';
import { itemTip, downloadDocument } from '../lib/documents/download.ts';
import { findExcerpts, startSearch, advanceSearch } from '../lib/search/engine.ts';
import { packCursor, unpackCursor } from '../lib/search/cursor.ts';
import { matchesTerms } from '../lib/search/contracts.ts';
import { browse, querySchema, scopeSchema, verifyLocation } from '../lib/autodesk/data.ts';

// Synthetic TEST fixtures only. These are never served by application routes.
function testPdf(text) {
  const stream = text ? `BT /F1 12 Tf 40 760 Td (${text}) Tj ET` : '';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n'; const offsets=[0];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
test('isolated PDF extraction preserves real page and exact text; blank PDFs require OCR',async()=>{
  const parsed=await parseDocument(testPdf('TEST Mecanica de suelos, informe original.'),'TEST.pdf');
  assert.equal(parsed.pages,1);assert.equal(parsed.segments[0].page,1);
  const hits=findExcerpts(parsed,[['mecánica','suelos']]);assert.equal(hits.length,1);assert.match(hits[0].excerpt,/TEST Mecanica de suelos/);assert.equal(hits[0].location,'Página 1');
  const blank=await parseDocument(testPdf(''),'TEST-scan.pdf');assert.equal(blank.status,'ocr_required');
});
test('TXT and CSV preserve line or record references',async()=>{
  const txt=await parseDocument(Buffer.from('TEST primera línea\nTEST mecánica de suelos'),'TEST.txt');
  assert.equal(findExcerpts(txt,[['mecanica','suelos']])[0].location,'Línea 2');
  const csv=await parseDocument(Buffer.from('TEST campo;valor\nTEST suelo;arcilla'),'TEST.csv');
  assert.equal(findExcerpts(csv,[['arcilla']])[0].location,'Registro 2');
});
test('Word and Excel extraction keeps paragraph and worksheet row references',async()=>{
  const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>TEST encabezado</w:t></w:r></w:p><w:p><w:r><w:t>TEST mecánica de suelos</w:t></w:r></w:p></w:body></w:document>');
  const doc=await parseDocument(await zip.generateAsync({type:'nodebuffer'}),'TEST.docx');
  assert.equal(findExcerpts(doc,[['mecánica','suelos']])[0].location,'Párrafo 2');
  const book=new Excel.Workbook();const sheet=book.addWorksheet('TEST Geotecnia');sheet.getCell('B3').value='TEST suelo: arcilla';
  const xlsx=await parseDocument(Buffer.from(await book.xlsx.writeBuffer()),'TEST.xlsx');
  assert.equal(xlsx.segments[0].location,'Hoja «TEST Geotecnia», fila 3');assert.match(xlsx.segments[0].text,/B3: TEST suelo/);
});
test('matching handles case, accents and separators without fabricating excerpts',()=>{
  assert.ok(matchesTerms('TEST MECANICA_DE-SUELOS',[['mecánica','suelo']]));
  assert.equal(matchesTerms('TEST arquitectura',[['mecánica','suelo']]),false);
  assert.equal(findExcerpts({segments:[{text:'TEST sin coincidencia',location:'Línea 1'}]},[['suelo']]).length,0);
});
const scope={kind:'project',hubId:'TEST_HUB',projectId:'TEST_PROJECT'};
const row=(type,id,name)=>({type,id,attributes:{name},links:{webView:{href:'https://acc.autodesk.com/TEST-document'}}});
const fixtureFetch=async(url,init)=>{
  const u=new URL(url),p=decodeURIComponent(u.pathname);
  if(u.hostname==='test.s3.amazonaws.com'){assert.equal(init.headers,undefined);return new Response('TEST mecánica de suelos');}
  if(p.endsWith('/signeds3download'))return Response.json({status:'complete',url:'https://test.s3.amazonaws.com/TEST?signed=TEST'});
  if(p.endsWith('/tip'))return Response.json({data:{id:'urn:TEST:version?version=3',type:'versions',attributes:{name:'TEST informe.txt',versionNumber:3},relationships:{item:{data:{type:'items',id:'TEST_FILE'}},storage:{data:{id:'urn:adsk.objects:os.object:TEST_BUCKET/TEST_FILE'}}},links:{webView:{href:'https://acc.autodesk.com/TEST-document'}}}});
  if(p.endsWith('/topFolders'))return Response.json({data:[row('folders','TEST_ROOT','TEST raíz')]});
  if(p.includes('/folders/TEST_ROOT/'))return Response.json({data:[row('folders','TEST_NESTED','TEST subcarpeta')]});
  if(p.includes('/folders/TEST_NESTED/')){
    if(u.searchParams.get('page[number]')==='0')return Response.json({data:[],links:{next:{href:u.origin+u.pathname+'?page[number]=1&page[limit]=100'}}});
    return Response.json({data:[row('items','TEST_FILE','TEST informe.txt')]});
  }
  if(p.endsWith('/projects/TEST_PROJECT'))return Response.json({data:row('projects','TEST_PROJECT','TEST proyecto')});
  throw new Error('Unexpected TEST request');
};

const folderScope={...scope,kind:'folder',folderIds:['TEST_ROOT','TEST_NESTED']};
const fileScope={...folderScope,kind:'file',itemId:'TEST_FILE'};
test('selected subfolder verifies the full path and searches only its descendants across continuation',async()=>{
  const state=await startSearch('TEST_TOKEN',folderScope,[['mecánica','suelos']],Date.now()+60000,fixtureFetch);
  assert.equal(state.queue.length,1);assert.equal(state.queue[0].query.folderId,'TEST_NESTED');
  const visited=[];
  const fetcher=async(url,init)=>{visited.push(decodeURIComponent(new URL(url).pathname));return fixtureFetch(url,init);};
  await advanceSearch(state,'TEST_TOKEN',undefined,{fetcher,steps:1});
  const key=randomBytes(32),resumed=unpackCursor(packCursor(state,key),key,'TEST_TOKEN');
  assert.deepEqual(resumed.scope,folderScope);
  const result=await advanceSearch(resumed,'TEST_TOKEN',undefined,{fetcher,milliseconds:60000});
  assert.equal(result.done,true);assert.equal(result.stats.files,1);assert.equal(result.stats.documentsRead,1);
  assert.equal(result.hits[0].path,'TEST proyecto / TEST raíz / TEST subcarpeta / TEST informe.txt');
  assert.ok(!visited.some(p=>p.endsWith('/topFolders')||p.includes('/folders/TEST_ROOT/')));
});
test('selected file reads exactly one document and never searches siblings or ancestors',async()=>{
  const state=await startSearch('TEST_TOKEN',fileScope,[['mecánica','suelos']],Date.now()+60000,fixtureFetch);
  assert.equal(state.queue.length,1);assert.equal(state.queue[0].entry.id,'TEST_FILE');
  const visited=[];
  const fetcher=async(url,init)=>{visited.push(decodeURIComponent(new URL(url).pathname));return fixtureFetch(url,init);};
  const result=await advanceSearch(state,'TEST_TOKEN',undefined,{fetcher,milliseconds:60000});
  assert.equal(result.done,true);assert.equal(result.stats.files,1);assert.equal(result.stats.documentsRead,1);assert.equal(result.hits.length,1);
  assert.equal(result.hits[0].id,'TEST_FILE');assert.equal(result.hits[0].matches[0].kind,'text');
  assert.ok(!visited.some(p=>p.includes('/folders/')||p.endsWith('/topFolders')));
});
test('stale or forged selection paths fail closed and narrow scopes reject broader browsing before network',async()=>{
  assert.equal(scopeSchema.safeParse({...fileScope,folderIds:[]}).success,false);
  await assert.rejects(()=>verifyLocation('TEST_TOKEN',{...fileScope,folderIds:['TEST_NESTED']},fixtureFetch),/selection_unavailable/);
  await assert.rejects(()=>verifyLocation('TEST_TOKEN',{...fileScope,itemId:'TEST_OTHER_FILE'},fixtureFetch),/selection_unavailable/);
  const noNetwork=()=>{assert.fail('Out-of-scope request reached network');};
  for(const s of [folderScope,fileScope])for(const q of [querySchema.parse({operation:'roots',hubId:scope.hubId,projectId:scope.projectId}),querySchema.parse({operation:'contents',hubId:scope.hubId,projectId:scope.projectId,folderId:'TEST_SIBLING'})])await assert.rejects(()=>browse('TEST_TOKEN',q,s,noNetwork),/out_of_scope/);
});
test('recursive paginated search discovers a text-only hit in nested folders with path, link, version and location',async()=>{
  const state=await startSearch('TEST_TOKEN',scope,[['mecánica','suelos']],Date.now()+60000,fixtureFetch);
  const first=await advanceSearch(state,'TEST_TOKEN',undefined,{fetcher:fixtureFetch,steps:2});assert.equal(first.done,false);
  const key=randomBytes(32),cursor=packCursor(state,key),resumed=unpackCursor(cursor,key,'TEST_TOKEN');
  const last=await advanceSearch(resumed,'TEST_TOKEN',undefined,{fetcher:fixtureFetch,milliseconds:60000});
  assert.equal(last.done,true);assert.equal(last.hits.length,1);const hit=last.hits[0];
  assert.equal(hit.path,'TEST proyecto / TEST raíz / TEST subcarpeta / TEST informe.txt');
  assert.equal(hit.version,3);assert.equal(hit.versionId,'urn:TEST:version?version=3');assert.equal(hit.webUrl,'https://acc.autodesk.com/TEST-document');assert.equal(hit.matches[0].kind,'text');assert.equal(hit.matches[0].location,'Línea 1');
  assert.equal(last.stats.documentsRead,1);assert.equal(last.stats.files,1);assert.equal(last.warnings.length,0);
});
test('search cursors are encrypted, session-bound, expiring and reject tampering',async()=>{
  const state=await startSearch('TEST_TOKEN',scope,[['TEST']],Date.now()+60000,fixtureFetch),key=randomBytes(32),cursor=packCursor(state,key);
  assert.ok(!cursor.includes('TEST_PROJECT'));assert.ok(!JSON.stringify(state).includes('TEST_TOKEN'));
  assert.throws(()=>unpackCursor(cursor,key,'OTHER_TOKEN'),/search_expired/);
  assert.throws(()=>unpackCursor(cursor,key,'TEST_TOKEN',Date.now()+120000),/search_expired/);
  const bytes=Buffer.from(cursor,'base64url');bytes[40]^=1;assert.throws(()=>unpackCursor(bytes.toString('base64url'),key,'TEST_TOKEN'),/search_expired/);
});
test('download binds the version to its item and rejects hostile signed URL hosts',async()=>{
  const version=await itemTip('TEST','TEST_PROJECT','TEST_FILE',fixtureFetch);
  await assert.rejects(itemTip('TEST','TEST_PROJECT','OTHER_FILE',fixtureFetch),/invalid_response/);
  await assert.rejects(downloadDocument('TEST',version,async()=>Response.json({status:'complete',url:'https://evil.example/TEST'})),/invalid_response/);
  await assert.rejects(downloadDocument('TEST',{...version,size:26*1024*1024},fixtureFetch),/document_too_large/);
});
test('inaccessible nested folders leave explicit incomplete coverage, never a verified no-match',async()=>{
  const state=await startSearch('TEST_TOKEN',scope,[['unfindable']],Date.now()+60000,fixtureFetch);
  const result=await advanceSearch(state,'TEST_TOKEN',undefined,{fetcher:(url,init)=>String(url).includes('/contents')?Promise.resolve(new Response(null,{status:403})):fixtureFetch(url,init)});
  assert.equal(result.hits.length,0);assert.ok(result.warnings.includes('forbidden'));assert.ok(result.issues[0].path.includes('TEST raíz'));
});
