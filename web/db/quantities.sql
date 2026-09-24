BEGIN;
CREATE TABLE IF NOT EXISTS quantity_schema_version(version integer PRIMARY KEY);
CREATE TABLE quantity_configuration (
 id uuid PRIMARY KEY, organization_id text NOT NULL, project_id text NOT NULL, specialty_code text NOT NULL,
 payload text NOT NULL CHECK(octet_length(payload)<200000), revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NOT NULL,
 UNIQUE(organization_id,project_id,specialty_code), UNIQUE(id,organization_id,project_id)
);
CREATE TABLE quantity_template_version (
 id uuid PRIMARY KEY, organization_id text NOT NULL, project_id text NOT NULL, specialty_code text NOT NULL,
 template_id uuid NOT NULL, version integer NOT NULL CHECK(version>0), payload text NOT NULL CHECK(octet_length(payload)<200000),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL,
 UNIQUE(organization_id,project_id,template_id,version)
);
CREATE TABLE quantity_run (
 id uuid PRIMARY KEY, organization_id text NOT NULL, project_id text NOT NULL,
 configuration_id uuid NOT NULL, specialty_code text NOT NULL, payload text NOT NULL CHECK(octet_length(payload)<20000000),
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL,
 FOREIGN KEY(configuration_id,organization_id,project_id) REFERENCES quantity_configuration(id,organization_id,project_id)
);
CREATE INDEX quantity_run_history ON quantity_run(organization_id,project_id,created_at DESC);
CREATE OR REPLACE FUNCTION quantity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'quantity_history_is_immutable'; END $$;
CREATE TRIGGER quantity_template_immutable BEFORE UPDATE OR DELETE ON quantity_template_version FOR EACH ROW EXECUTE FUNCTION quantity_immutable();
CREATE TRIGGER quantity_run_immutable BEFORE UPDATE OR DELETE ON quantity_run FOR EACH ROW EXECUTE FUNCTION quantity_immutable();
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='ai_forma_quantities') THEN CREATE ROLE ai_forma_quantities NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 EXECUTE format('GRANT ai_forma_quantities TO %I',current_user);
END $$;
GRANT USAGE ON SCHEMA public TO ai_forma_quantities;
GRANT SELECT,INSERT,UPDATE ON quantity_configuration TO ai_forma_quantities;
GRANT SELECT,INSERT ON quantity_template_version,quantity_run TO ai_forma_quantities;
ALTER TABLE quantity_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantity_configuration FORCE ROW LEVEL SECURITY;
ALTER TABLE quantity_template_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantity_template_version FORCE ROW LEVEL SECURITY;
ALTER TABLE quantity_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE quantity_run FORCE ROW LEVEL SECURITY;
CREATE POLICY quantity_project_config ON quantity_configuration TO ai_forma_quantities USING(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true)) WITH CHECK(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true) AND updated_by=current_setting('app.user_id',true));
CREATE POLICY quantity_project_template ON quantity_template_version TO ai_forma_quantities USING(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true)) WITH CHECK(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true) AND created_by=current_setting('app.user_id',true));
CREATE POLICY quantity_project_run ON quantity_run TO ai_forma_quantities USING(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true)) WITH CHECK(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true) AND created_by=current_setting('app.user_id',true));
INSERT INTO quantity_schema_version VALUES(1);
COMMIT;
