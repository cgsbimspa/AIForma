BEGIN;
CREATE TABLE coordination_record (
 id uuid PRIMARY KEY, organization_id text NOT NULL, project_id text NOT NULL, system_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('configuration','run','comment','reviewed','issue')),
 revision integer NOT NULL CHECK(revision>0), payload text NOT NULL CHECK(octet_length(payload)<100000000),
 label text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coordination_history ON coordination_record(organization_id,project_id,kind,created_at DESC);
CREATE UNIQUE INDEX coordination_configuration ON coordination_record(organization_id,project_id,system_id,revision) WHERE kind='configuration';
CREATE TRIGGER coordination_immutable BEFORE UPDATE OR DELETE ON coordination_record FOR EACH ROW EXECUTE FUNCTION audit_immutable();
GRANT SELECT,INSERT ON coordination_record TO ai_forma_audit;
ALTER TABLE coordination_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE coordination_record FORCE ROW LEVEL SECURITY;
CREATE POLICY coordination_tenant ON coordination_record TO ai_forma_audit
 USING(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true))
 WITH CHECK(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true) AND created_by=current_setting('app.user_id',true));
COMMIT;
