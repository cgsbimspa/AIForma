BEGIN;
CREATE TABLE IF NOT EXISTS app_project (
 id uuid PRIMARY KEY, organization_id text NOT NULL, project_id text NOT NULL,
 name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,project_id)
);
CREATE TABLE IF NOT EXISTS project_module_configuration (
 id uuid PRIMARY KEY, organization_id text NOT NULL, project_id text NOT NULL,
 module_id text NOT NULL CHECK(module_id IN ('audit','quantities','coordination','assistant','documents')),
 revision integer NOT NULL CHECK(revision>0), payload text NOT NULL,
 created_by text NOT NULL, created_at timestamptz NOT NULL,
 UNIQUE(organization_id,project_id,module_id,revision)
);
CREATE TRIGGER project_module_configuration_immutable BEFORE UPDATE OR DELETE ON project_module_configuration FOR EACH ROW EXECUTE FUNCTION project_configuration_immutable();
GRANT SELECT,INSERT,UPDATE ON app_project TO ai_forma_projects;
GRANT SELECT,INSERT ON project_module_configuration TO ai_forma_projects;
ALTER TABLE app_project ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_project FORCE ROW LEVEL SECURITY;
ALTER TABLE project_module_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_module_configuration FORCE ROW LEVEL SECURITY;
CREATE POLICY app_project_tenant ON app_project TO ai_forma_projects USING(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true)) WITH CHECK(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true));
CREATE POLICY project_module_configuration_tenant ON project_module_configuration TO ai_forma_projects USING(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true)) WITH CHECK(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true) AND created_by=current_setting('app.user_id',true));
CREATE TABLE project_execution_cache(organization_id text NOT NULL,project_id text NOT NULL,module_id text NOT NULL,digest text NOT NULL,run_id uuid NOT NULL,PRIMARY KEY(organization_id,project_id,module_id,digest));
GRANT SELECT,INSERT,UPDATE ON project_execution_cache TO ai_forma_projects;
ALTER TABLE project_execution_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_execution_cache FORCE ROW LEVEL SECURITY;
CREATE POLICY execution_cache_tenant ON project_execution_cache TO ai_forma_projects USING(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true)) WITH CHECK(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true));
CREATE TABLE project_module_activation(organization_id text NOT NULL,project_id text NOT NULL,module_id text NOT NULL,system_id text NOT NULL,discipline_id uuid NOT NULL,revision integer NOT NULL,PRIMARY KEY(organization_id,project_id,module_id,system_id));
GRANT SELECT,INSERT,UPDATE ON project_module_activation TO ai_forma_projects;
ALTER TABLE project_module_activation ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_module_activation FORCE ROW LEVEL SECURITY;
CREATE POLICY activation_tenant ON project_module_activation TO ai_forma_projects USING(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true)) WITH CHECK(organization_id=current_setting('app.organization_id',true) AND project_id=current_setting('app.project_id',true));
INSERT INTO project_schema_version VALUES(2);
COMMIT;
