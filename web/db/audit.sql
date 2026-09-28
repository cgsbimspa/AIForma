BEGIN;
CREATE TABLE IF NOT EXISTS audit_schema_version(version integer PRIMARY KEY);
CREATE TABLE audit_record (
 id uuid PRIMARY KEY, organization_id text NOT NULL, project_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('configuration','catalog','run','issue-request')),
 revision integer NOT NULL CHECK(revision>0), payload text NOT NULL CHECK(octet_length(payload)<100000000),
 label text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_history ON audit_record(organization_id,project_id,kind,created_at DESC,id DESC);
CREATE UNIQUE INDEX audit_config_revision ON audit_record(organization_id,project_id,kind,revision) WHERE kind IN ('configuration','catalog');
CREATE FUNCTION audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit_history_is_immutable'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_record FOR EACH ROW EXECUTE FUNCTION audit_immutable();
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ai_forma_audit') THEN CREATE ROLE ai_forma_audit NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 EXECUTE format('GRANT ai_forma_audit TO %I',current_user);
END $$;
GRANT USAGE ON SCHEMA public TO ai_forma_audit;
GRANT SELECT,INSERT ON audit_record TO ai_forma_audit;
ALTER TABLE audit_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_record FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_tenant ON audit_record TO ai_forma_audit
 USING(organization_id=current_setting('app.organization_id',true) AND (project_id=current_setting('app.project_id',true) OR (project_id='' AND kind='catalog')))
 WITH CHECK(organization_id=current_setting('app.organization_id',true) AND (project_id=current_setting('app.project_id',true) OR (project_id='' AND kind='catalog')) AND created_by=current_setting('app.user_id',true));
INSERT INTO audit_schema_version VALUES(1);
COMMIT;
