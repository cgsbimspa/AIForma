import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberConversation,recallConversation,navigationRetentionMs} from '../lib/assistant/navigation.ts';
test('scope navigation restores separate questions, results and drafts without mixing document conversations',()=>{
  const store=new Map(),now=1000;
  const project={messages:['TEST question','TEST result'],draft:'TEST draft',scrollTop:420,conversationId:'TEST project'};
  const file={messages:['TEST document question'],draft:'',scrollTop:0,conversationId:'TEST file'};
  rememberConversation(store,'TEST project scope',project,now+500,now);
  rememberConversation(store,'TEST file scope',file,now+500,now);
  assert.deepEqual(recallConversation(store,'TEST project scope',now+1).data,project);
  assert.deepEqual(recallConversation(store,'TEST file scope',now+1).data,file);
  assert.equal(recallConversation(store,'TEST other scope',now+1),undefined);
});
test('returning never extends history expiry, and expired conversations are removed',()=>{
  const store=new Map(),now=1000;
  rememberConversation(store,'TEST','TEST',now+100,now);
  const restored=recallConversation(store,'TEST',now+50);
  rememberConversation(store,'TEST',restored.data,restored.expiresAt,now+60);
  assert.equal(recallConversation(store,'TEST',now+100),undefined);
  assert.equal(store.size,0);
  rememberConversation(store,'TEST','TEST',Infinity,now);assert.equal(store.size,0);
  rememberConversation(store,'TEST','TEST',now+navigationRetentionMs*2,now);
  assert.equal(recallConversation(store,'TEST',now).expiresAt,now+navigationRetentionMs);
});
