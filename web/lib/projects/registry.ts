import {randomUUID} from 'node:crypto';
import type {Actor} from '../memory/domain.ts';
import type {Transaction} from '../memory/database.ts';
export type AppProject={id:string;autodeskHubId:string;autodeskProjectId:string;name:string;createdAt:string;updatedAt:string};
export function createProjectRegistry(transaction:Transaction){return {
 enter:(actor:Actor,verifiedName:string)=>transaction(actor,async q=>{
  // Only call after Autodesk authorization; names never identify a project.
  const [r]=await q(`INSERT INTO app_project(id,organization_id,project_id,name) VALUES($1,$2,$3,$4)
   ON CONFLICT(organization_id,project_id) DO UPDATE SET name=EXCLUDED.name,updated_at=now()
   RETURNING *`,[randomUUID(),actor.organizationId,actor.projectId,verifiedName]);
  return {id:String(r.id),autodeskHubId:String(r.organization_id),autodeskProjectId:String(r.project_id),name:String(r.name),createdAt:new Date(String(r.created_at)).toISOString(),updatedAt:new Date(String(r.updated_at)).toISOString()} satisfies AppProject;
 })
};}
