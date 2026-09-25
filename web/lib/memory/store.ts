import { randomUUID } from "node:crypto";
import { behavioralSignals, decryptHistory, encryptHistory, preferenceConfidence, scopeKey, transitionAllowed, type Actor, type KnowledgeStatus } from "./domain.ts";
import type { Query, Transaction } from "./database.ts";
export type Capture = { conversationId?: string; interactionId?: string; scope: unknown; prompt?: string; response: string; tool: "plan_search"|"search"|"browse"|"document_answer"; parameters: unknown; result: unknown; status: "success"|"partial"|"error"; action: "search"|"browse"|"ask"|"summary"|"extract"; duration: number };
const binding = (a:Actor,id:string) => JSON.stringify([a.organizationId,a.projectId,a.userId,id]);
export function safeResult(value: unknown): unknown {
  const text=JSON.stringify(value,(key,v)=>/^(?:cursor|accessToken|refreshToken|authorization|apiKey|access_token|refresh_token)$/i.test(key)?undefined:v);
  return text.length>1_500_000 ? { omitted:true, reason:"history_payload_limit", bytes:Buffer.byteLength(text) } : JSON.parse(text);
}
export function createMemoryStore(tx: Transaction, key: Buffer) {
  return {
    async capture(actor:Actor,input:Capture) {
      return tx(actor,async q=>{
        const id=input.conversationId??randomUUID(), callId=input.interactionId??randomUUID(), scoped=scopeKey(input.scope);
        if(input.conversationId) {
          const rows=await q("SELECT id FROM memory_conversation WHERE id=$1 AND scope_key=$2 AND expires_at>now() FOR UPDATE",[id,scoped]);
          if(!rows.length)throw Error("history_expired_or_out_of_scope");
        } else await q("INSERT INTO memory_conversation(id,organization_id,project_id,user_id,scope_key,scope) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[id,actor.organizationId,actor.projectId,actor.userId,scoped,JSON.stringify(input.scope)]);
        const existing=await q("SELECT conversation_id FROM memory_tool_call WHERE id=$1",[callId]);
        if(existing.length) { if(existing[0].conversation_id!==id)throw Error("history_interaction_mismatch");return {conversationId:id,expiresAt:(await q("SELECT expires_at FROM memory_conversation WHERE id=$1",[id]))[0].expires_at}; }
        const expires=(await q("SELECT expires_at FROM memory_conversation WHERE id=$1",[id]))[0].expires_at;
        for(const [role,content] of [["user",input.prompt],["assistant",input.response]])if(content){
          const messageId=randomUUID();
          await q("INSERT INTO memory_message(id,conversation_id,role,content,expires_at) VALUES($1,$2,$3,$4,$5)",[messageId,id,role,encryptHistory(content,key,binding(actor,messageId)),expires]);
        }
        await q("INSERT INTO memory_tool_call(id,conversation_id,tool_name,parameters,result_status,duration_ms,project_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[callId,id,input.tool,encryptHistory(safeResult(input.parameters),key,binding(actor,callId)),input.status,Math.round(Math.max(0,input.duration)),actor.projectId,expires]);
        const resultId=randomUUID();
        await q("INSERT INTO memory_tool_result(id,tool_call_id,payload,expires_at) VALUES($1,$2,$3,$4)",[resultId,callId,encryptHistory(safeResult(input.result),key,binding(actor,resultId)),expires]);
        if(input.prompt) {
          for(const signal of [...behavioralSignals(input.prompt),{key:"frequent_module",value:"assistant"}]) {
            await q("INSERT INTO memory_user_preference(organization_id,user_id,preference_key,value,observations,confidence) VALUES($1,$2,$3,$4,1,0.05) ON CONFLICT(organization_id,user_id,preference_key,value) DO UPDATE SET observations=memory_user_preference.observations+1,last_seen=now()",[actor.organizationId,actor.userId,signal.key,signal.value]);
            const values=await q("SELECT value,observations FROM memory_user_preference WHERE preference_key=$1",[signal.key]);
            const total=values.reduce((n,row)=>n+Number(row.observations),0);
            for(const row of values)await q("UPDATE memory_user_preference SET confidence=$1 WHERE preference_key=$2 AND value=$3",[preferenceConfidence(Number(row.observations),total),signal.key,row.value]);
          }
        }
        await q("INSERT INTO memory_platform_event(id,organization_id,project_id,user_id,module,event_type,action,result,duration_ms) VALUES($1,$2,$3,$4,'assistant',$5,$6,$7,$8)",[randomUUID(),actor.organizationId,actor.projectId,actor.userId,input.status==="error"?"tool_failed":input.tool==="plan_search"?"ai_intent_detected":input.tool==="search"?"search_executed":"tool_called",input.action,input.status,Math.round(Math.max(0,input.duration))]);
        return {conversationId:id,expiresAt:expires};
      });
    },
    async list(actor:Actor,scope:unknown) {
      return tx(actor,q=>q("SELECT id,created_at,expires_at FROM memory_conversation WHERE scope_key=$1 AND expires_at>now() ORDER BY created_at DESC LIMIT 50",[scopeKey(scope)]));
    },
    async listProject(actor:Actor) {
      // RLS still limits this list to the verified project, organization and user.
      return tx(actor,async q=>{
        const rows=await q(`SELECT c.id,c.scope,c.created_at,c.expires_at,m.id AS message_id,m.content
          FROM memory_conversation c LEFT JOIN LATERAL (
            SELECT id,content FROM memory_message WHERE conversation_id=c.id AND role='user' AND expires_at>now() ORDER BY position LIMIT 1
          ) m ON true WHERE c.expires_at>now() ORDER BY c.created_at DESC LIMIT 50`);
        // postgres.js may return legacy JSONB values encoded as JSON strings.
        // Normalize the stored shape before sending it back to the strict API schema.
        return rows.map(row=>({id:row.id,scope:typeof row.scope==="string"?JSON.parse(row.scope):row.scope,created_at:row.created_at,expires_at:row.expires_at,
          title:row.content?String(decryptHistory(String(row.content),key,binding(actor,String(row.message_id)))).slice(0,160):"Consulta sin pregunta registrada"}));
      });
    },
    async messages(actor:Actor,scope:unknown,id:string) {
      return tx(actor,async q=>{
        const conversation=await q("SELECT id,expires_at FROM memory_conversation WHERE id=$1 AND scope_key=$2 AND expires_at>now()",[id,scopeKey(scope)]);
        if(!conversation.length)throw Error("history_expired_or_out_of_scope");
        const rows=await q("SELECT id,role,content,created_at,expires_at FROM memory_message WHERE conversation_id=$1 AND expires_at>now() ORDER BY position LIMIT 201",[id]);
        return {expiresAt:conversation[0].expires_at,truncated:rows.length>200,messages:rows.slice(0,200).map(row=>({...row,content:decryptHistory(String(row.content),key,binding(actor,String(row.id))),historical:true}))};
      });
    },
    async deleteConversation(actor:Actor,scope:unknown,id:string) {
      return tx(actor,q=>q("DELETE FROM memory_conversation WHERE id=$1 AND scope_key=$2 RETURNING id",[id,scopeKey(scope)]));
    },
    async preferences(actor:Actor) {
      return tx(actor,q=>q("SELECT preference_key,value,observations,confidence,first_seen,last_seen,source,decay_version FROM memory_user_preference ORDER BY preference_key,observations DESC"));
    },
    async resetPreferences(actor:Actor) { return tx(actor,q=>q("DELETE FROM memory_user_preference WHERE organization_id=$1 AND user_id=$2",[actor.organizationId,actor.userId])); },
    async listKnowledge(actor:Actor) { return tx(actor,q=>q("SELECT * FROM memory_project_knowledge ORDER BY created_at DESC LIMIT 100")); },
    async proposeKnowledge(actor:Actor,input:{knowledge_type:string;value:unknown;model_id?:string|null;document_id?:string|null;source_version?:string|null}) {
      return tx(actor,q=>q("INSERT INTO memory_project_knowledge(id,organization_id,project_id,knowledge_type,value,status,source,created_by,model_id,document_id,source_version) VALUES($1,$2,$3,$4,$5::jsonb,'DETECTED','user_proposal',$6,$7,$8,$9) RETURNING id,status",[randomUUID(),actor.organizationId,actor.projectId,input.knowledge_type,JSON.stringify(input.value),actor.userId,input.model_id??null,input.document_id??null,input.source_version??null]));
    },
    async transitionKnowledge(actor:Actor,id:string,status:KnowledgeStatus) {
      return tx(actor,async q=>{
        const records=await q("SELECT * FROM memory_project_knowledge WHERE id=$1 FOR UPDATE",[id]);
        const record=records[0];if(!record||!transitionAllowed(record.status as KnowledgeStatus,status))throw Error("invalid_knowledge_transition");
        const authorized=await q("SELECT user_id FROM memory_knowledge_validator WHERE organization_id=$1 AND project_id=$2 AND user_id=$3",[actor.organizationId,actor.projectId,actor.userId]);
        if(!authorized.length)throw Error("knowledge_validation_forbidden");
        if(status==="VALIDATED") {
          await q("INSERT INTO memory_knowledge_evidence(id,project_knowledge_id,source_type,source_id,source_version,model_id,document_id,validated_by) VALUES($1,$2,'user_confirmation',$3,$4,$5,$6,$3)",[randomUUID(),id,actor.userId,record.source_version,record.model_id,record.document_id]);
          return q("UPDATE memory_project_knowledge SET status='VALIDATED',source='user_confirmation',validated_by=$1,validated_at=now(),valid_from=now() WHERE id=$2 RETURNING id,status",[actor.userId,id]);
        }
        return q("UPDATE memory_project_knowledge SET status=$1,valid_until=CASE WHEN $1='OBSOLETE' THEN now() ELSE valid_until END WHERE id=$2 RETURNING id,status",[status,id]);
      });
    },
  };
}
export async function cleanupExpired(q:Query) {
  // Counts only; no original text survives in aggregates or compliance logs.
  await q("SELECT pg_advisory_xact_lock(749216)");
  const events=await q(`WITH deleted AS (DELETE FROM memory_platform_event WHERE expires_at<=now() RETURNING *), aggregated AS (
    INSERT INTO memory_platform_metric(organization_id,day,module,event_type,action,result,observations,duration_ms)
    SELECT organization_id,(created_at AT TIME ZONE 'UTC')::date,module,event_type,action,result,count(*),sum(duration_ms) FROM deleted GROUP BY 1,2,3,4,5,6
    ON CONFLICT(organization_id,day,module,event_type,action,result) DO UPDATE SET observations=memory_platform_metric.observations+excluded.observations,duration_ms=memory_platform_metric.duration_ms+excluded.duration_ms RETURNING observations) SELECT count(*) AS deleted FROM deleted`);
  const conversations=await q("DELETE FROM memory_conversation WHERE expires_at<=now() RETURNING id");
  const feedback=await q("DELETE FROM memory_intent_feedback WHERE expires_at<=now() RETURNING id");
  await q("INSERT INTO memory_maintenance_log(conversations_deleted,events_deleted,feedback_deleted) VALUES($1,$2,$3)",[conversations.length,Number(events[0].deleted),feedback.length]);
  await q("DELETE FROM memory_maintenance_log WHERE executed_at<now()-interval '30 days'");
  return {conversationsDeleted:conversations.length,eventsDeleted:Number(events[0].deleted),feedbackDeleted:feedback.length};
}
