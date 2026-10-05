import {createHash} from 'node:crypto';
import type {Actor} from '../memory/domain.ts';
import type {Transaction} from '../memory/database.ts';
import type {QuantitySource} from '../quantities/contracts.ts';
import {sourceIdentity} from './configuration.ts';
function canonical(value:unknown):string{
 if(value===undefined)return 'null';
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
}
export function executionKey(module:string,source:QuantitySource,configuration:unknown,rules:unknown,engine:string){return createHash('sha256').update(canonical({module,source:sourceIdentity(source),configuration,rules,engine})).digest('hex');}
export function createExecutionCache(transaction:Transaction){return {
 read:(a:Actor,module:string,digest:string)=>transaction(a,async q=>{const [r]=await q('SELECT run_id FROM project_execution_cache WHERE organization_id=$1 AND project_id=$2 AND module_id=$3 AND digest=$4',[a.organizationId,a.projectId,module,digest]);return r?String(r.run_id):null;}),
 save:(a:Actor,module:string,digest:string,runId:string)=>transaction(a,q=>q('INSERT INTO project_execution_cache(organization_id,project_id,module_id,digest,run_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,project_id,module_id,digest) DO UPDATE SET run_id=EXCLUDED.run_id',[a.organizationId,a.projectId,module,digest,runId]))
};}
