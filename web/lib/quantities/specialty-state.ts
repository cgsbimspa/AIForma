import type {QuantityConfiguration,QuantityRun} from './contracts.ts';
export type ProcessReceipt={versionId:string;viewId:string;configurationRevision:number|null;readAt:string;inspected:number};
export function specialtyState(c:QuantityConfiguration|undefined,run?:QuantityRun,receipt?:ProcessReceipt|null,error?:string){
 if(c?.enabled===false)return {code:'inactive',label:'Inactiva',symbol:'—'};
 if(error)return {code:'error',label:'Error de lectura',symbol:'!'};
 if(!c?.source?.view||!c.templateVersionId)return {code:'unconfigured',label:'Sin configurar',symbol:'○'};
 const source=c.source,viewId=c.source.view.id;
 const processed=run?.source.version.id===source.version.id&&run.source.view?.id===viewId;
 const sessionProcessed=receipt?.versionId===source.version.id&&receipt.viewId===viewId&&receipt.configurationRevision===c.revision;
 if(processed||sessionProcessed)return {code:'processed',label:processed?'Procesada':'Procesada en esta sesión',symbol:'✓'};
 return {code:'ready',label:'Configurada · sin procesar',symbol:'◷'};
}
