import { decryptHistory,type Actor } from '../memory/domain.ts';
import type { Transaction } from '../memory/database.ts';
import {configSchema} from '../audit/contracts.ts';
import {configurationSchema as regulatorySchema} from '../coordination/contracts.ts';
import {configurationSchema as quantitySchema} from '../quantities/contracts.ts';
import type {ModuleOverview,SummaryModule} from './summary.ts';

export function createProjectReader(transactions:{audit:Transaction;coordination:Transaction;quantities:Transaction},key:Buffer){
  return async function read(actor:Actor,module:SummaryModule):Promise<ModuleOverview>{
    return transactions[module](actor,async q=>{
      // All queries remain under existing least-privilege RLS roles. Never load run payloads.
      const table=module==='audit'?'audit_record':module==='coordination'?'coordination_record':'quantity_run';
      const [totals]=await q(`SELECT count(*) AS runs,max(created_at) AS latest FROM ${table} WHERE organization_id=$1 AND project_id=$2${module==='quantities'?'':" AND kind='run'"}`,[actor.organizationId,actor.projectId]);
      if(module==='quantities'){const [installed]=await q("SELECT to_regclass('public.project_quantity_capture') AS name");if(installed?.name){const [captures]=await q('SELECT count(*) AS runs,max(created_at) AS latest FROM project_quantity_capture WHERE organization_id=$1 AND project_id=$2',[actor.organizationId,actor.projectId]);totals.runs=Number(totals.runs)+Number(captures.runs);if(captures.latest&&(!totals.latest||new Date(String(captures.latest))>new Date(String(totals.latest))))totals.latest=captures.latest;}}
      const rows=module==='quantities'
        ?await q('SELECT id,payload,updated_at AS updated FROM quantity_configuration WHERE organization_id=$1 AND project_id=$2',[actor.organizationId,actor.projectId])
        :module==='audit'
          ?await q("SELECT id,payload,created_at AS updated FROM audit_record WHERE organization_id=$1 AND project_id=$2 AND kind='configuration' ORDER BY revision DESC LIMIT 1",[actor.organizationId,actor.projectId])
          :await q("SELECT DISTINCT ON(system_id) id,payload,created_at AS updated FROM coordination_record WHERE organization_id=$1 AND project_id=$2 AND kind='configuration' ORDER BY system_id,revision DESC",[actor.organizationId,actor.projectId]);
      const sources=rows.flatMap(row=>{
        const prefix=module==='audit'?'audit-v1':module==='coordination'?'coordination-v1':'quantities-v1';
        const data=decryptHistory(String(row.payload),key,JSON.stringify([prefix,actor.organizationId,actor.projectId,String(row.id)]));
        const config=module==='audit'?configSchema.parse(data):module==='coordination'?regulatorySchema.parse(data):quantitySchema.parse(data);
        return config.source?[config.source]:[];
      });
      const timestamps=[totals?.latest,...rows.map(r=>r.updated)].filter(Boolean).map(d=>new Date(String(d)).toISOString()).sort();
      return {module,runs:Number(totals?.runs??0),configurations:rows.length,latestAt:timestamps.at(-1)??null,sources};
    });
  };
}
