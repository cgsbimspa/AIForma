import {resultCodes,type ResultCode} from './result-status.ts';
import type {CoordinateEvidence} from './coordinates.ts';
import { z } from 'zod';
import { sourceSchema } from '../quantities/contracts.ts';
import type { AuditAecInventory } from './grids.ts';

export const auditResults = resultCodes;
export type AuditResult = ResultCode;
export const toleranceSchema = z.object({ id:z.string().min(1).max(80), area:z.string().min(1).max(120), control:z.string().min(1).max(240), value:z.number().finite().nonnegative(), unit:z.string().min(1).max(40), origin:z.enum(['GLOBAL','COMPANY','PROJECT']), status:z.enum(['Por Configurar','Confirmada']), evidence:z.string().max(2000).default('') }).strict();
export type AuditTolerance = z.infer<typeof toleranceSchema>;
export type AuditRule = {
 ruleId:string; chapter:string; group:string; name:string; description:string; specialty:string; category:string;
 controlType:'INFORMATIVE'|'DETERMINISTIC'|'CALCULATED'|'SEMANTIC_AI'; scope:'VIEW'|'VIEW_AND_MODEL_DATUM'; dataSource:string;
 property:string; method:string; tolerance:string|null; possibleResults:AuditResult[]; severity:string;
 evidenceRequired:string; goodPractice:string; catalog:string; configurationStatus:string; version:string; active:boolean;
};
export const verticalSchema = z.object({ discipline:z.string().min(1).max(100), category:z.string().min(1).max(150), baseReference:z.string().max(150), topReference:z.string().max(150), classificationReference:z.string().max(150), status:z.enum(['Por Configurar','Confirmada']) }).strict();
export type VerticalReferenceCatalog = z.infer<typeof verticalSchema>;
export const configSchema = z.object({
 source:sourceSchema.nullable(), discipline:z.enum(['ESTRUCTURA','ARQUITECTURA','MEP']), ruleSetId:z.literal('audit-master-v1'),
 disabledRules:z.array(z.string().max(80)).max(300), verticalReferences:z.array(verticalSchema).max(100),
}).strict();
export type AuditConfiguration = z.infer<typeof configSchema>;
export const catalogSchema = z.object({ tolerances:z.array(toleranceSchema).max(200), naming:z.record(z.string().max(1000)), equivalences:z.record(z.string().max(1000)), exceptions:z.array(z.string().max(1000)).max(100), rules:z.array(z.string().max(80)).max(300) }).strict();
export type CompanyAuditCatalog = z.infer<typeof catalogSchema> & { companyId:string; version:number };
export type ProjectAuditCatalog = z.infer<typeof catalogSchema> & { projectId:string; version:number };
export type AuditElement = { elementId:string; dbId:number; uniqueId:string|null; name:string; category:string|null; family:string|null; type:string|null; level:string|null; treePath?:string[]; categorySource?:'property'|'tree'|null; publishedElevation?:string|number|null; properties:Record<string,unknown> };
export type AuditEvidence = { source:string; property:string; observedValue:unknown; expectedValue:unknown; unit:string|null; geometryReference:string|null; viewerReference:{urn:string;viewId:string;dbIds:number[]}; fetchedAt:string };
export type AffectedElement = Omit<AuditElement,'properties'> & { findingId:string; modelId:string };
export type AuditFinding = { id:string; auditRunId:string; ruleId:string; result:AuditResult; severity:string; title:string; description:string; observedValue:unknown; expectedValue:unknown; toleranceId:string|null; evidence:AuditEvidence[]; affectedElements:AffectedElement[]; createdAt:string };
export type AuditScope = { id:string; auditRunId:string; scopeType:'VIEW'|'MODEL'|'FILTERED_MODEL'; viewId:string; modelId:string; elementCount:number|null; status:'VERIFIED'|'PARTIAL'|'Por Configurar'; population:string; unavailableCount:number };
export type AuditInventory = { coordinateEvidence?:CoordinateEvidence[]; elements:AuditElement[]; levels:AuditElement[]; grids:AuditElement[]; aec?:AuditAecInventory; endpoint:string; treeEndpoint:string; fetchedAt:string; missing:number; excluded:number; population:string };
export type AuditRun = {
 id:string; projectId:string; modelId:string; versionId:string; viewId:string; discipline:string; ruleSetId:string; ruleSetVersion:string;
 companyCatalogId:string; projectCatalogId:string; startedAt:string; completedAt:string; status:'COMPLETED'|'PARTIAL'; createdBy:string;
 source:z.infer<typeof sourceSchema>; scope:AuditScope; configuration:AuditConfiguration; rules:AuditRule[];
 companyCatalog:CompanyAuditCatalog; projectCatalog:ProjectAuditCatalog; tolerances:AuditTolerance[];
 engineVersion:string; findings:AuditFinding[]; inventory:AuditInventory;
};
export type AuditWorkspace = { configuration:AuditConfiguration|null; revision:number; companyCatalog:CompanyAuditCatalog; projectCatalog:ProjectAuditCatalog; runs:{id:string;createdAt:string;label:string}[]; nextCursor:string|null };
export type AuditComparison = {runAId:string;runBId:string;status:'Por Configurar'};
