import { randomUUID } from "node:crypto";
import { DataError } from "../autodesk/data.ts";
import { decryptHistory, encryptHistory, type Actor } from "../memory/domain.ts";
import type { Query, Transaction } from "../memory/database.ts";
import { configurationSchema, runSchema, templateVersionSchema, type QuantityConfiguration, type QuantitySource, type QuantityWorkspace } from "./contracts.ts";
import { structureTemplateDefinition } from "./template-defaults.ts";
import type { CalculationSettings } from '../quantities-v2/contracts.ts';

export function createQuantityStore(transaction: Transaction, key: Buffer) {
  const binding = (actor: Actor, id: string) => JSON.stringify(["quantities-v1", actor.organizationId, actor.projectId, id]);
  const encode = (actor: Actor, id: string, value: unknown) => encryptHistory(value, key, binding(actor, id));
  const decode = (actor: Actor, row: Record<string, unknown>) => decryptHistory(String(row.payload), key, binding(actor, String(row.id)));
  async function config(q: Query, actor: Actor, id: string) {
    const [row] = await q("SELECT * FROM quantity_configuration WHERE id=$1 FOR UPDATE", [id]);
    if (!row) throw new DataError("not_found", 404);
    return configurationSchema.parse(decode(actor, row));
  }
  async function assignTemplate(q: Query, actor: Actor, previous: QuantityConfiguration) {
    // A saved version is a deliberate choice. Never replace it with a newer one.
    if (previous.templateVersionId || previous.specialtyCode !== "structure") return previous;
    const rows = await q("SELECT * FROM quantity_template_version WHERE specialty_code=$1 ORDER BY version DESC", [previous.specialtyCode]);
    const families = new Map<string, ReturnType<typeof templateVersionSchema.parse>>();
    for (const row of rows) {
      const template = templateVersionSchema.parse(decode(actor, row));
      if (!families.has(template.templateId)) families.set(template.templateId, template);
    }
    // Multiple different templates require an explicit choice, not a guess.
    if (families.size > 1) return previous;
    let template = [...families.values()][0];
    if (!template) {
      template = templateVersionSchema.parse({
        id: randomUUID(), templateId: randomUUID(), specialtyCode: "structure",
        name: "Cálculo base", version: 1, configuration: null,
        baseDefinition: structureTemplateDefinition,
        createdAt: new Date().toISOString(), createdBy: actor.userId,
      });
      await q("INSERT INTO quantity_template_version(id,organization_id,project_id,specialty_code,template_id,version,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [template.id, actor.organizationId, actor.projectId, template.specialtyCode, template.templateId, template.version, encode(actor, template.id, template), actor.userId]);
    }
    const value = configurationSchema.parse({ ...previous, templateVersionId: template.id, revision: previous.revision + 1, updatedAt: new Date().toISOString(), updatedBy: actor.userId });
    await q("UPDATE quantity_configuration SET payload=$1,revision=$2,updated_at=now(),updated_by=$3 WHERE id=$4", [encode(actor, value.id, value), value.revision, actor.userId, value.id]);
    return value;
  }
  return {
    async prepareTemplates(actor: Actor) {
      return transaction(actor, async q => {
        // Lock project configurations so simultaneous openings do not duplicate defaults.
        const rows = await q("SELECT * FROM quantity_configuration ORDER BY id FOR UPDATE");
        for (const row of rows) await assignTemplate(q, actor, configurationSchema.parse(decode(actor, row)));
      });
    },
    async workspace(actor: Actor): Promise<QuantityWorkspace> {
      return transaction(actor, async q => {
        const configurations = (await q("SELECT * FROM quantity_configuration ORDER BY created_at")).map(r => configurationSchema.parse(decode(actor, r)));
        const templates = (await q("SELECT * FROM quantity_template_version ORDER BY created_at DESC")).map(r => templateVersionSchema.parse(decode(actor, r)));
        const rows = await q("SELECT * FROM quantity_run ORDER BY created_at DESC LIMIT 501");
        return { configurations, templates, runs: rows.slice(0, 500).map(r => runSchema.parse(decode(actor, r))), historyPartial: rows.length > 500 };
      });
    },
    async add(actor: Actor, specialtyCode: string) {
      return transaction(actor, async q => {
        const id = randomUUID(), now = new Date().toISOString();
        const value: QuantityConfiguration = { id, specialtyCode, source: null, templateVersionId: null, revision: 0, createdAt: now, updatedAt: now, updatedBy: actor.userId };
        const inserted = await q("INSERT INTO quantity_configuration(id,organization_id,project_id,specialty_code,payload,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,project_id,specialty_code) DO NOTHING RETURNING id", [id, actor.organizationId, actor.projectId, specialtyCode, encode(actor, id, value), actor.userId]);
        if (!inserted.length) throw new DataError("duplicate_specialty", 409);
        return assignTemplate(q, actor, value);
      });
    },
    async save(actor: Actor, input: { id: string; revision: number; source: QuantitySource | null; templateVersionId: string | null; calculationSettings?:CalculationSettings }) {
      return transaction(actor, async q => {
        const previous = await config(q, actor, input.id);
        if (previous.revision !== input.revision) throw new DataError("configuration_conflict", 409);
        if (input.source && (input.source.scope.hubId !== actor.organizationId || input.source.scope.projectId !== actor.projectId)) throw new DataError("out_of_scope", 403);
        if (input.templateVersionId) {
          const [row] = await q("SELECT * FROM quantity_template_version WHERE id=$1 AND specialty_code=$2", [input.templateVersionId, previous.specialtyCode]);
          if (!row) throw new DataError("invalid_template", 422);
        }
        if(input.calculationSettings?.levelBinding&&(input.calculationSettings.levelBinding.urn!==input.source?.version.modelId||input.calculationSettings.levelBinding.viewId!==input.source?.view?.id))throw new DataError('out_of_scope',403);
        const value = configurationSchema.parse({ ...previous, source: input.source, templateVersionId: input.templateVersionId, ...(input.calculationSettings?{calculationSettings:input.calculationSettings}:{}), revision: previous.revision + 1, updatedAt: new Date().toISOString(), updatedBy: actor.userId });
        await q("UPDATE quantity_configuration SET payload=$1,revision=$2,updated_at=now(),updated_by=$3 WHERE id=$4", [encode(actor, value.id, value), value.revision, actor.userId, value.id]);
        return value;
      });
    },
    async template(actor: Actor, input: { configurationId: string; name: string; templateId?: string }) {
      return transaction(actor, async q => {
        const configuration = await config(q, actor, input.configurationId);
        let version = 1;
        let templateId: string = randomUUID();
        if (input.templateId) {
          const [row] = await q("SELECT * FROM quantity_template_version WHERE template_id=$1 AND specialty_code=$2 ORDER BY version DESC LIMIT 1", [input.templateId, configuration.specialtyCode]);
          if (!row) throw new DataError("invalid_template", 422);
          const previous = templateVersionSchema.parse(decode(actor, row));
          templateId = previous.templateId; version = previous.version + 1;
        }
        const value = templateVersionSchema.parse({ id: randomUUID(), templateId, specialtyCode: configuration.specialtyCode, name: input.name, version, configuration: null, createdAt: new Date().toISOString(), createdBy: actor.userId });
        await q("INSERT INTO quantity_template_version(id,organization_id,project_id,specialty_code,template_id,version,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [value.id, actor.organizationId, actor.projectId, value.specialtyCode, value.templateId, value.version, encode(actor, value.id, value), actor.userId]);
        return value;
      });
    },
    // Server-only integration seam. No HTTP endpoint accepts uploaded/fabricated results.
    async appendRun(actor: Actor, input: unknown) {
      const run = runSchema.parse(input);
      if (run.organizationId !== actor.organizationId || run.projectId !== actor.projectId || run.createdBy !== actor.userId) throw new DataError("out_of_scope", 403);
      return transaction(actor, async q => {
        const configuration = await config(q, actor, run.quantitySourceId);
        if (configuration.specialtyCode !== run.specialtyCode) throw new DataError("incompatible_runs", 422);
        const [template] = await q("SELECT * FROM quantity_template_version WHERE id=$1", [run.template.id]);
        if (!template || JSON.stringify(decode(actor, template)) !== JSON.stringify(run.template)) throw new DataError("invalid_template", 422);
        await q("INSERT INTO quantity_run(id,organization_id,project_id,configuration_id,specialty_code,payload,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)", [run.id, actor.organizationId, actor.projectId, run.quantitySourceId, run.specialtyCode, encode(actor, run.id, run), actor.userId]);
        return run;
      });
    },
  };
}
