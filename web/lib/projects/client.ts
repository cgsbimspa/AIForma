import {quantityResponse} from '../quantities/client';
import type {QuantityProject} from '../quantities/contracts';
export function activateProjectModule<T>(scope:QuantityProject,disciplineId:string,revision:number,module:'audit'|'quantities'|'coordination',signal?:AbortSignal,systemId?:string){
 return quantityResponse<T>('/api/projects/configuration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope,moduleId:module,command:{action:'activate',disciplineId,revision,module,systemId}}),signal});
}
