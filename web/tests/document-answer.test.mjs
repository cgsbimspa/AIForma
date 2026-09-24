import test from 'node:test';
import assert from 'node:assert/strict';
import { exactQuote, bindDocumentDraft, answerDocuments } from '../lib/assistant/document-answer.ts';
import { collectDocumentEvidence } from '../lib/assistant/document-evidence.ts';
import { documentQuestionSchema } from '../lib/assistant/document-contracts.ts';

// Synthetic TEST content, isolated from product routes and real Autodesk accounts.
const sentence='TEST: Se recomienda una profundidad de 2,50 m, pendiente de aprobación.';
const source={id:'D1',name:'TEST informe.txt',path:'TEST proyecto / TEST carpeta / TEST informe.txt',itemId:'TEST_FILE',projectId:'TEST_PROJECT',version:3,versionId:'TEST_V3',webUrl:'https://acc.autodesk.com/TEST',endpoint:'https://developer.api.autodesk.com/TEST',fetchedAt:new Date().toISOString(),status:'read'};
const evidence={sources:[source],passages:[{id:'S1',documentId:'D1',location:'Línea 7',text:sentence}],partial:false,warnings:[],pending:0,scopePath:source.path};
const draft={status:'answered',blocks:[{label:'Profundidad recomendada',text:'El texto recomienda 2,50 m, pendiente de aprobación.',citations:[{segmentId:'S1',quote:sentence}]}]};
const config={key:'TEST_KEY',model:'TEST_MODEL'};
const output=value=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
test('citations are bound to server-read passages, locations and versions; fabricated references or digits fail closed',()=>{
  const result=bindDocumentDraft(draft,evidence,'ask');
  assert.equal(result[0].citations[0].source.version,3);assert.equal(result[0].citations[0].location,'Línea 7');
  for(const change of [
    {text:'La profundidad es 8,50 m.'},
    {citations:[{segmentId:'OTHER_SELECTION',quote:sentence}]},
    {citations:[{segmentId:'S1',quote:'TEST: Se recomienda una profundidad de 9 m.'}]},
    {citations:[]},
  ])assert.throws(()=>bindDocumentDraft({...draft,blocks:[{...draft.blocks[0],...change}]},evidence,'ask'),/document_unverified/);
  assert.equal(exactQuote('TEST suelo:\n  arcilla plástica.', 'TEST suelo: arcilla plástica.'),'TEST suelo:\n  arcilla plástica.');
  assert.equal(exactQuote(sentence,'profundidad de 2.50 m'),null);
});
test('extracted values must equal a literal source quote, not a generated or calculated value',()=>{
  assert.throws(()=>bindDocumentDraft(draft,evidence,'extract'),/document_unverified/);
  const bound=bindDocumentDraft({...draft,blocks:[{...draft.blocks[0],text:sentence}]},evidence,'extract');
  assert.equal(bound[0].text,sentence);
});

test('OCR citations preserve recognition provenance and low-confidence text cannot support a generated assertion',()=>{
  const recognized={...evidence,passages:[{...evidence.passages[0],method:'ocr',confidence:95,location:'Página 2 · OCR'}]};
  const bound=bindDocumentDraft(draft,recognized,'ask');assert.equal(bound[0].citations[0].method,'ocr');assert.equal(bound[0].citations[0].location,'Página 2 · OCR');
  assert.throws(()=>bindDocumentDraft(draft,{...recognized,passages:[{...recognized.passages[0],confidence:40}]},'ask'),/document_unverified/);
});
test('independent review rejects a changed condition even when the citation is genuine',async()=>{
  let calls=0;
  const result=await answerDocuments(evidence,'¿Qué recomienda el texto?','ask',config,async(url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');
    const payload=JSON.parse(init.body);assert.equal(payload.store,false);assert.equal(payload.tools,undefined);
    calls++;return calls===1?output({...draft,blocks:[{...draft.blocks[0],text:'La profundidad de 2,50 m está aprobada.'}]}):output({allowedTask:true,supported:[false]});
  });
  assert.equal(calls,2);assert.equal(result.status,'unverified');assert.deepEqual(result.blocks,[]);
});
test('supported synthesis carries citations; absent evidence does not call OpenAI; malformed review never passes',async()=>{
  let calls=0;
  const result=await answerDocuments(evidence,'¿Qué recomienda el texto?','summary',config,async()=>++calls===1?output(draft):output({allowedTask:true,supported:[true]}));
  assert.equal(result.status,'answered');assert.equal(result.blocks[0].citations[0].quote,sentence);
  const empty=await answerDocuments({...evidence,passages:[]},'TEST pregunta','ask',config,()=>assert.fail('No evidence must not invoke model'));
  assert.equal(empty.status,'not_available');
  calls=0;const invalid=await answerDocuments(evidence,'TEST pregunta','ask',config,async()=>++calls===1?output(draft):output({allowedTask:true,supported:[]}));
  assert.equal(invalid.status,'unverified');
});
test('missing data and unsupported calculations return no generated assertions',async()=>{
  for(const status of ['not_available','unsupported']){
    const result=await answerDocuments(evidence,'TEST solicitud','ask',config,async()=>output({status,blocks:[]}));
    assert.equal(result.status,status);assert.deepEqual(result.blocks,[]);
  }
});

const folder={kind:'folder',hubId:'TEST_HUB',projectId:'TEST_PROJECT',folderIds:['TEST_ROOT','TEST_NESTED']};
const file={...folder,kind:'file',itemId:'TEST_FILE'};
const row=(type,id,name)=>({type,id,attributes:{name}});
const fixture=async(url)=>{
  const u=new URL(url),path=decodeURIComponent(u.pathname);
  if(path.endsWith('/projects/TEST_PROJECT'))return Response.json({data:row('projects','TEST_PROJECT','TEST proyecto')});
  if(path.endsWith('/topFolders'))return Response.json({data:[row('folders','TEST_ROOT','TEST raíz')]});
  if(path.includes('/folders/TEST_ROOT/'))return Response.json({data:[row('folders','TEST_NESTED','TEST carpeta'),row('folders','TEST_SIBLING','TEST hermana')]});
  if(path.includes('/folders/TEST_NESTED/'))return Response.json({data:[row('items','TEST_FILE','TEST informe.txt'),row('items','TEST_SECOND','TEST segundo.txt')]});
  if(path.endsWith('/tip')){const id=path.split('/').at(-2);return Response.json({data:{id:'TEST_VERSION_'+id,type:'versions',attributes:{name:'TEST informe.txt',versionNumber:3},relationships:{item:{data:{type:'items',id}},storage:{data:{id:'urn:adsk.objects:os.object:TEST_BUCKET/'+id}}}}});}
  if(path.endsWith('/signeds3download'))return Response.json({status:'complete',url:'https://test.s3.amazonaws.com/TEST'});
  if(u.hostname==='test.s3.amazonaws.com')return new Response(sentence);
  throw new Error('Unexpected request outside TEST selection: '+path);
};
const parser=async()=>({status:'parsed',textlessPages:0,segments:[{text:sentence,location:'Línea 1'}]});

test('document answers collect later page batches from the same downloaded version with exact locations',async()=>{
  const starts=[];let downloads=0;
  const fetcher=async(url,init)=>{if(new URL(url).hostname==='test.s3.amazonaws.com')downloads++;return fixture(url,init);};
  const parser=async(bytes,name,signal,{startPage})=>{starts.push(startPage);return {status:'parsed',textlessPages:0,pages:13,pageStart:startPage,pageEnd:startPage===1?12:13,...(startPage===1?{nextPage:13}:{}),segments:[{text:sentence,location:`Página ${startPage}`,page:startPage}]};};
  const result=await collectDocumentEvidence('TEST_TOKEN',file,Date.now()+60000,undefined,{fetcher,parser});
  assert.deepEqual(starts,[1,13]);assert.equal(downloads,1);assert.equal(result.sources.length,1);assert.equal(result.partial,false);assert.equal(result.pending,0);assert.equal(result.sources[0].throughPage,13);assert.equal(result.sources[0].nextPage,undefined);assert.deepEqual(result.passages.map(p=>p.location),['Página 1','Página 13']);
});

test('answer context limits disclose the next unread page instead of claiming that every page was read',async()=>{
  const parser=async()=>({status:'parsed',textlessPages:0,pages:40,pageStart:1,pageEnd:12,nextPage:13,segments:[{text:sentence,location:'Página 1'}]});
  const result=await collectDocumentEvidence('TEST_TOKEN',file,Date.now()+60000,undefined,{fetcher:fixture,parser,maxCharacters:10});
  assert.equal(result.partial,true);assert.equal(result.pending,1);assert.equal(result.sources[0].nextPage,13);assert.equal(result.sources[0].status,'context_limit');
});
test('document analysis reads only selected file and forbids all/project fallback before network',async()=>{
  const visited=[];
  const result=await collectDocumentEvidence('TEST_TOKEN',file,Date.now()+60000,undefined,{fetcher:async(url,init)=>{visited.push(decodeURIComponent(new URL(url).pathname));return fixture(url,init);},parser});
  assert.equal(result.sources.length,1);assert.equal(result.sources[0].itemId,'TEST_FILE');assert.equal(result.passages.length,1);assert.equal(result.partial,false);
  assert.ok(!visited.some(p=>p.includes('TEST_SECOND')||p.includes('/folders/TEST_SIBLING/')));
  for(const scope of [{kind:'all'},{kind:'project',hubId:'TEST_HUB',projectId:'TEST_PROJECT'}]){
    assert.equal(documentQuestionSchema.safeParse({scope,question:'TEST',mode:'ask'}).success,false);
    await assert.rejects(()=>collectDocumentEvidence('TEST_TOKEN',scope,Date.now()+60000,undefined,{fetcher:()=>assert.fail('Forbidden scope network')}),/document_selection_required/);
  }
});
test('folder limits and truncated text report partial coverage instead of claiming complete reading',async()=>{
  const result=await collectDocumentEvidence('TEST_TOKEN',folder,Date.now()+60000,undefined,{fetcher:fixture,parser,maxDocuments:1});
  assert.equal(result.sources.length,1);assert.equal(result.partial,true);assert.equal(result.pending,1);
  const limited=await collectDocumentEvidence('TEST_TOKEN',file,Date.now()+60000,undefined,{fetcher:fixture,parser,maxCharacters:20});
  assert.equal(limited.partial,true);assert.equal(limited.sources[0].status,'context_limit');assert.equal(limited.passages[0].text.length,20);
});
