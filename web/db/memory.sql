-- Run with a migration/admin connection, never from an HTTP request.
BEGIN;
CREATE TABLE IF NOT EXISTS memory_schema_version(version integer PRIMARY KEY);
CREATE TABLE IF NOT EXISTS memory_conversation (
 id uuid PRIMARY KEY, organization_id text NOT NULL, project_id text NOT NULL, user_id text NOT NULL,
 scope_key text NOT NULL, scope jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '5 days',
 UNIQUE(id,organization_id,project_id,user_id), CHECK(expires_at=created_at+interval '5 days')
);
CREATE INDEX IF NOT EXISTS memory_conversation_owner ON memory_conversation(organization_id,project_id,user_id,scope_key,created_at DESC);
CREATE INDEX IF NOT EXISTS memory_conversation_expiry ON memory_conversation(expires_at);
CREATE TABLE IF NOT EXISTS memory_message (
 id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES memory_conversation(id) ON DELETE CASCADE,
 position bigint GENERATED ALWAYS AS IDENTITY,
 role text NOT NULL CHECK(role IN ('user','assistant')), content text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 CHECK(octet_length(content)<=3000000)
);
CREATE TABLE IF NOT EXISTS memory_tool_call (
 id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES memory_conversation(id) ON DELETE CASCADE,
 tool_name text NOT NULL CHECK(tool_name IN ('plan_search','search','browse','document_answer')),
 parameters text NOT NULL, result_status text NOT NULL CHECK(result_status IN ('success','partial','error')),
 duration_ms integer NOT NULL CHECK(duration_ms>=0), project_id text NOT NULL,
 model_id text, version_id text, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS memory_tool_result (
 id uuid PRIMARY KEY, tool_call_id uuid NOT NULL REFERENCES memory_tool_call(id) ON DELETE CASCADE,
 payload text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 CHECK(octet_length(payload)<=3000000)
);
CREATE OR REPLACE FUNCTION memory_recent_expiry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='memory_tool_result' THEN
   SELECT expires_at INTO NEW.expires_at FROM memory_tool_call WHERE id=NEW.tool_call_id;
 ELSE
   SELECT expires_at INTO NEW.expires_at FROM memory_conversation WHERE id=NEW.conversation_id;
 END IF;
 IF NEW.expires_at IS NULL OR NEW.expires_at<=now() THEN RAISE EXCEPTION 'recent_context_expired'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER memory_message_ttl BEFORE INSERT OR UPDATE ON memory_message FOR EACH ROW EXECUTE FUNCTION memory_recent_expiry();
CREATE OR REPLACE TRIGGER memory_tool_call_ttl BEFORE INSERT OR UPDATE ON memory_tool_call FOR EACH ROW EXECUTE FUNCTION memory_recent_expiry();
CREATE OR REPLACE TRIGGER memory_tool_result_ttl BEFORE INSERT OR UPDATE ON memory_tool_result FOR EACH ROW EXECUTE FUNCTION memory_recent_expiry();

CREATE TABLE IF NOT EXISTS memory_user_preference (
 organization_id text NOT NULL, user_id text NOT NULL, preference_key text NOT NULL, value text NOT NULL,
 observations integer NOT NULL CHECK(observations>0), confidence double precision NOT NULL CHECK(confidence BETWEEN 0 AND 1),
 first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(),
 source text NOT NULL DEFAULT 'behavioral_learning' CHECK(source='behavioral_learning'),
 decay_version text NOT NULL DEFAULT 'not_activated',
 PRIMARY KEY(organization_id,user_id,preference_key,value),
 CHECK((preference_key='preferred_grouping' AND value IN ('level','discipline','document')) OR
       (preference_key='preferred_export_format' AND value IN ('xlsx','csv','pdf')) OR
       (preference_key='preferred_model_version' AND value='latest') OR
       (preference_key='preferred_result_density' AND value IN ('brief','detailed')) OR
       (preference_key='preferred_language_style' AND value IN ('plain','technical')) OR
       (preference_key='preferred_view_mode' AND value IN ('table','list')) OR
       (preference_key='frequent_module' AND value='assistant'))
);
CREATE TABLE IF NOT EXISTS memory_project_knowledge (
 id uuid PRIMARY KEY, organization_id text NOT NULL, project_id text NOT NULL, knowledge_type text NOT NULL,
 value jsonb NOT NULL, status text NOT NULL CHECK(status IN ('DETECTED','SUGGESTED','VALIDATED','REJECTED','OBSOLETE')),
 source text NOT NULL, created_by text NOT NULL, validated_by text, created_at timestamptz NOT NULL DEFAULT now(), validated_at timestamptz,
 valid_from timestamptz, valid_until timestamptz, model_id text, document_id text, source_version text,
 CHECK(status<>'VALIDATED' OR (validated_by IS NOT NULL AND validated_at IS NOT NULL)),
 CHECK((model_id IS NULL AND document_id IS NULL) OR source_version IS NOT NULL),
 CHECK(valid_until IS NULL OR valid_from IS NULL OR valid_until>valid_from)
);
CREATE TABLE IF NOT EXISTS memory_knowledge_evidence (
 id uuid PRIMARY KEY, project_knowledge_id uuid NOT NULL REFERENCES memory_project_knowledge(id) ON DELETE CASCADE,
 source_type text NOT NULL CHECK(source_type IN ('autodesk','deterministic_result','user_confirmation','configured_rule')),
 source_id text NOT NULL, source_version text, model_id text, element_id text, document_id text, rule_id text,
 created_at timestamptz NOT NULL DEFAULT now(), validated_by text
);
-- Grant validation authority explicitly with an admin connection; no self-enrollment API.
CREATE TABLE IF NOT EXISTS memory_knowledge_validator (
 organization_id text NOT NULL, project_id text NOT NULL, user_id text NOT NULL,
 PRIMARY KEY(organization_id,project_id,user_id)
);
CREATE OR REPLACE FUNCTION memory_validate_knowledge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='VALIDATED' THEN
   IF TG_OP='INSERT' THEN RAISE EXCEPTION 'knowledge_requires_confirmation'; END IF;
   IF OLD.status<>'SUGGESTED' OR NEW.validated_by IS DISTINCT FROM current_setting('app.user_id',true)
     OR NOT EXISTS(SELECT FROM memory_knowledge_validator WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND user_id=NEW.validated_by)
     OR NOT EXISTS(SELECT FROM memory_knowledge_evidence WHERE project_knowledge_id=NEW.id AND validated_by=NEW.validated_by AND source_type='user_confirmation')
   THEN RAISE EXCEPTION 'knowledge_requires_authorized_evidence'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.value IS DISTINCT FROM NEW.value OR OLD.source_version IS DISTINCT FROM NEW.source_version OR OLD.document_id IS DISTINCT FROM NEW.document_id OR OLD.model_id IS DISTINCT FROM NEW.model_id) THEN RAISE EXCEPTION 'knowledge_revision_required'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER memory_knowledge_validation BEFORE INSERT OR UPDATE ON memory_project_knowledge FOR EACH ROW EXECUTE FUNCTION memory_validate_knowledge();
CREATE TABLE IF NOT EXISTS memory_platform_event (
 id uuid PRIMARY KEY, organization_id text NOT NULL, user_id text NOT NULL, project_id text NOT NULL,
 module text NOT NULL CHECK(module='assistant'),
 event_type text NOT NULL CHECK(event_type IN ('module_opened','tool_called','tool_failed','document_opened','search_executed','ai_intent_detected','ai_intent_corrected')),
 action text NOT NULL CHECK(action IN ('search','browse','ask','summary','extract','history_open','document_open')),
 result text NOT NULL CHECK(result IN ('success','partial','error')), duration_ms integer NOT NULL CHECK(duration_ms>=0),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '5 days',
 CHECK(expires_at=created_at+interval '5 days')
);
CREATE TABLE IF NOT EXISTS memory_platform_metric (
 organization_id text NOT NULL, day date NOT NULL, module text NOT NULL, event_type text NOT NULL, action text NOT NULL,
 result text NOT NULL, observations bigint NOT NULL, duration_ms bigint NOT NULL,
 PRIMARY KEY(organization_id,day,module,event_type,action,result)
);
CREATE TABLE IF NOT EXISTS memory_intent_feedback (
 id uuid PRIMARY KEY, organization_id text NOT NULL, project_id text NOT NULL, user_id text NOT NULL,
 original_intent text NOT NULL CHECK(original_intent IN ('find_documents','browse','ask','summary','extract')),
 corrected_intent text NOT NULL CHECK(corrected_intent IN ('find_documents','browse','ask','summary','extract','find_elements')),
 tool_selected text NOT NULL CHECK(tool_selected IN ('search','browse','document_answer')),
 tool_expected text NOT NULL CHECK(tool_expected IN ('search','browse','document_answer','bim_elements')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '5 days',
 CHECK(expires_at=created_at+interval '5 days')
);
CREATE TABLE IF NOT EXISTS memory_maintenance_log (
 executed_at timestamptz PRIMARY KEY DEFAULT now(), conversations_deleted integer NOT NULL, events_deleted integer NOT NULL, feedback_deleted integer NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_event_expiry ON memory_platform_event(expires_at);

DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ai_forma_memory') THEN CREATE ROLE ai_forma_memory NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ai_forma_retention') THEN CREATE ROLE ai_forma_retention NOLOGIN; END IF;
 EXECUTE format('GRANT ai_forma_memory, ai_forma_retention TO %I',current_user);
END $$;
CREATE OR REPLACE FUNCTION memory_actor(org text, project text DEFAULT NULL, usr text DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT org=current_setting('app.organization_id',true)
 AND (project IS NULL OR project=current_setting('app.project_id',true))
 AND (usr IS NULL OR usr=current_setting('app.user_id',true))
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['memory_conversation','memory_message','memory_tool_call','memory_tool_result','memory_user_preference','memory_project_knowledge','memory_knowledge_evidence','memory_knowledge_validator','memory_platform_event','memory_platform_metric','memory_intent_feedback','memory_maintenance_log'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
CREATE POLICY conversation_actor ON memory_conversation TO ai_forma_memory USING(memory_actor(organization_id,project_id,user_id) AND expires_at>now()) WITH CHECK(memory_actor(organization_id,project_id,user_id) AND expires_at>now());
CREATE POLICY message_actor ON memory_message TO ai_forma_memory USING(expires_at>now() AND EXISTS(SELECT FROM memory_conversation c WHERE c.id=conversation_id));
CREATE POLICY call_actor ON memory_tool_call TO ai_forma_memory USING(expires_at>now() AND EXISTS(SELECT FROM memory_conversation c WHERE c.id=conversation_id AND c.project_id=memory_tool_call.project_id));
CREATE POLICY result_actor ON memory_tool_result TO ai_forma_memory USING(expires_at>now() AND EXISTS(SELECT FROM memory_tool_call c WHERE c.id=tool_call_id));
CREATE POLICY preference_actor ON memory_user_preference TO ai_forma_memory USING(memory_actor(organization_id,NULL,user_id));
CREATE POLICY knowledge_actor ON memory_project_knowledge TO ai_forma_memory USING(memory_actor(organization_id,project_id));
CREATE POLICY evidence_actor ON memory_knowledge_evidence TO ai_forma_memory USING(EXISTS(SELECT FROM memory_project_knowledge k WHERE k.id=project_knowledge_id));
CREATE POLICY validator_actor ON memory_knowledge_validator FOR SELECT TO ai_forma_memory USING(memory_actor(organization_id,project_id,user_id));
CREATE POLICY event_actor ON memory_platform_event TO ai_forma_memory USING(memory_actor(organization_id,project_id,user_id) AND expires_at>now());
CREATE POLICY feedback_actor ON memory_intent_feedback TO ai_forma_memory USING(memory_actor(organization_id,project_id,user_id) AND expires_at>now());
CREATE POLICY metric_actor ON memory_platform_metric TO ai_forma_memory USING(memory_actor(organization_id));
-- Maintenance role sees only expired event metadata and deletes expired context.
CREATE POLICY conversation_ttl ON memory_conversation TO ai_forma_retention USING(expires_at<=now());
CREATE POLICY event_ttl ON memory_platform_event TO ai_forma_retention USING(expires_at<=now());
CREATE POLICY feedback_ttl ON memory_intent_feedback TO ai_forma_retention USING(expires_at<=now());
CREATE POLICY metric_maintenance ON memory_platform_metric TO ai_forma_retention USING(true);
CREATE POLICY maintenance_log ON memory_maintenance_log TO ai_forma_retention USING(true);
GRANT USAGE ON SCHEMA public TO ai_forma_memory,ai_forma_retention;
GRANT SELECT,INSERT,DELETE ON memory_conversation,memory_message,memory_tool_call,memory_tool_result,memory_platform_event,memory_intent_feedback TO ai_forma_memory;
GRANT USAGE ON SEQUENCE memory_message_position_seq TO ai_forma_memory;
GRANT UPDATE(id) ON memory_conversation TO ai_forma_memory;
GRANT SELECT,INSERT,UPDATE,DELETE ON memory_user_preference,memory_project_knowledge,memory_knowledge_evidence TO ai_forma_memory;
GRANT SELECT ON memory_knowledge_validator TO ai_forma_memory;
-- Metrics are not exposed to end users until organization-admin roles exist.
GRANT SELECT,DELETE ON memory_conversation,memory_platform_event,memory_intent_feedback TO ai_forma_retention;
GRANT SELECT,INSERT,UPDATE ON memory_platform_metric TO ai_forma_retention;
GRANT SELECT,INSERT,DELETE ON memory_maintenance_log TO ai_forma_retention;
INSERT INTO memory_schema_version VALUES(1) ON CONFLICT DO NOTHING;
COMMIT;
