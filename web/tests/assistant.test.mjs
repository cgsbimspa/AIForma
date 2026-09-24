import test from 'node:test';
import assert from 'node:assert/strict';
import { browse, nextPage, querySchema, verifyProject } from '../lib/autodesk/data.ts';
import { hasDataAccess } from '../lib/autodesk/oauth.ts';
import { renderAnswer, runChat } from '../lib/assistant/chat.ts';

// TEST fixtures only: no real accounts or project information.
const token = 'TEST_ACCESS_TOKEN';
const row = (type, id, name) => ({type,id,attributes:{name}});
const query = (operation, extra={}) => querySchema.parse({operation,...extra});
const scope = {kind:'project',hubId:'TEST_HUB',projectId:'TEST_PROJECT'};
test('old identity-only sessions require new data consent', () => {
  assert.equal(hasDataAccess({}),false);
  assert.equal(hasDataAccess({scopes:['user-profile:read']}),false);
  assert.equal(hasDataAccess({scopes:['user-profile:read','data:read']}),true);
});
test('read-only browse encodes folder URNs and preserves source, warnings and page boundaries', async () => {
  const result = await browse(token,query('contents',{hubId:'TEST_HUB',projectId:'TEST_PROJECT',folderId:'urn:adsk:TEST'}),scope,async(url,init)=>{
    assert.equal(init.headers.Authorization,'Bearer TEST_ACCESS_TOKEN');
    assert.equal(init.cache,'no-store'); assert.equal(init.redirect,'error');
    assert.match(url.pathname,/urn%3Aadsk%3ATEST/);
    return Response.json({data:[row('folders','TEST_CHILD','TEST FOLDER')],links:{next:{href:url.origin+url.pathname+'?page[number]=1&page[limit]=100'}},meta:{warnings:[{code:'TEST_PARTIAL'}]}});
  });
  assert.equal(result.evidence.nextPage,1); assert.equal(result.evidence.returnedCount,1); assert.equal(result.evidence.partial,true);
  assert.equal(result.entries[0].name,'TEST FOLDER'); assert.equal(result.evidence.projectId,'TEST_PROJECT');
  assert.ok(Date.parse(result.evidence.fetchedAt));
});
test('pagination rejects token exfiltration, different paths and duplicate or looping pages', () => {
  const endpoint = new URL('https://developer.api.autodesk.com/project/v1/hubs/TEST/projects');
  for (const href of ['https://evil.example/?page[number]=1',endpoint+'?page[number]=0',endpoint+'?page[number]=1&page[number]=1',endpoint+'?page[number]=1&other=secret',endpoint+'?page[number]=1&page[limit]=200','https://developer.api.autodesk.com/other?page[number]=1']) assert.throws(()=>nextPage(href,endpoint,0));
  assert.equal(nextPage(undefined,endpoint,0),null);
});
test('project scope blocks other projects and global listings before making any network request', async () => {
  const forbidden = async()=>{assert.fail('must not call network');};
  for (const q of [query('hubs'),query('projects',{hubId:'TEST_HUB'}),query('roots',{hubId:'TEST_HUB',projectId:'OTHER_PROJECT'}),query('contents',{hubId:'OTHER_HUB',projectId:'TEST_PROJECT',folderId:'TEST_FOLDER'})]) await assert.rejects(browse(token,q,scope,forbidden),/out_of_scope/);
});
test('provider errors and malformed rows never become empty successful lists',async()=>{
  for (const status of [401,403,404,429,500]) await assert.rejects(browse(token,query('hubs'),{kind:'all'},async()=>new Response('SECRET_TEST',{status})),error=>error.status!==200 && !error.message.includes('SECRET'));
  for (const body of [{data:[{type:'hubs',id:'TEST',attributes:{}}]}, {data:[row('projects','TEST','TEST')]}, {notData:[]}]) await assert.rejects(browse(token,query('hubs'),{kind:'all'},async()=>Response.json(body)),/invalid_response/);
  assert.equal((await browse(token,query('hubs'),{kind:'all'},async()=>Response.json({data:[]}))).entries.length,0);
});
test('project verification rejects mismatched IDs',async()=>{
  await assert.rejects(verifyProject(token,'TEST_HUB','TEST_PROJECT',async()=>Response.json({data:row('projects','OTHER','TEST')})),/invalid_response/);
});
const source = {id:'F1',label:'TEST ROOTS',endpoint:'https://developer.api.autodesk.com/TEST',projectId:'TEST_PROJECT',fetchedAt:new Date().toISOString(),page:0,returnedCount:1,nextPage:1,partial:true,entries:[{id:'TEST_FOLDER',type:'folders',name:'TEST REAL SOURCE NAME'}]};
test('factual answer is constructed from verified records and rejects invented sources or IDs',()=>{
  const result=renderAnswer({status:'found',selections:[{sourceId:'F1',entryIds:['TEST_FOLDER']}],question:null},[source]);
  assert.match(result.text,/TEST REAL SOURCE NAME/); assert.match(result.text,/no es el total/); assert.match(result.text,/parciales/);
  for (const selection of [{sourceId:'F999',entryIds:['TEST_FOLDER']},{sourceId:'F1',entryIds:['INVENTED']},{sourceId:'F1',entryIds:['TEST_FOLDER','TEST_FOLDER']}]) assert.throws(()=>renderAnswer({status:'found',selections:[selection],question:null},[source]),/ai_invalid_response/);
});
test('assistant uses server-side tools and structured OpenAI response without persisting a conversation',async()=>{
  let aiCalls=0;
  const fetcher=async(url,init)=>{
    if(String(url).includes('/v1/responses')){
      aiCalls++; const body=JSON.parse(init.body);
      assert.equal(body.store,false); assert.equal(body.parallel_tool_calls,false); assert.equal(body.text.format.type,'json_schema');
      assert.ok(!JSON.stringify(body).includes(token));
      return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({status:'found',selections:[{sourceId:'F1',entryIds:['TEST_FOLDER']}],question:null})}]}]});
    }
    return Response.json({data:String(url).includes('topFolders') ? [row('folders','TEST_FOLDER','TEST VERIFIED FOLDER')] : row('projects','TEST_PROJECT','TEST PROJECT')});
  };
  const result=await runChat(token,{scope,messages:[{role:'user',content:'TEST: show root folders'}]},{key:'TEST_OPENAI',model:'gpt-5-mini'},fetcher);
  assert.equal(aiCalls,1); assert.match(result.text,/TEST VERIFIED FOLDER/); assert.equal(result.sources.length,1);
});
test('model cannot use tool arguments to browse an unobserved or out-of-project folder',async()=>{
  let dataCalls=0;
  const fetcher=async(url)=>{
    if(String(url).includes('/v1/responses')) return Response.json({status:'completed',output:[{type:'function_call',name:'browse_forma',call_id:'TEST_CALL',arguments:JSON.stringify(query('contents',{hubId:'TEST_HUB',projectId:'OTHER_PROJECT',folderId:'UNKNOWN'}))}]});
    dataCalls++;return Response.json({data:String(url).includes('topFolders') ? [row('folders','TEST_FOLDER','TEST FOLDER')] : row('projects','TEST_PROJECT','TEST PROJECT')});
  };
  await assert.rejects(runChat(token,{scope,messages:[{role:'user',content:'TEST adversarial'}]},{key:'TEST',model:'gpt-5-mini'},fetcher),/out_of_scope/);
  assert.equal(dataCalls,2);
});
