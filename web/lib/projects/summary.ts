import type { QuantitySource } from '../quantities/contracts.ts';

export type ProjectScope = {kind:'project';hubId:string;projectId:string};
export type SummaryModule = 'audit'|'coordination'|'quantities';
export type ModuleOverview = {module:SummaryModule;runs:number;configurations:number;latestAt:string|null;sources:QuantitySource[]};
export type SummaryInput = {module:SummaryModule;state:'AVAILABLE';data:ModuleOverview}|{module:SummaryModule;state:'NOT_AVAILABLE'};
export type ProjectSummary = ReturnType<typeof summarizeProject>;

// Only configured references are counted. This is not an inventory of all cloud files.
export function summarizeProject(scope:ProjectScope, inputs:SummaryInput[], checkedAt:string) {
  const models=new Map<string,{itemId:string;name:string;references:{module:SummaryModule;versionId:string;version:number;viewId:string|null;viewName:string|null;path:string;checkedAt:string}[]}>();
  const modules=inputs.map(input=>{
    if(input.state!=='AVAILABLE')return {module:input.module,state:input.state,runs:null,configurations:null,latestAt:null};
    const data=input.data;
    if(data.module!==input.module||!Number.isSafeInteger(data.runs)||data.runs<0||!Number.isSafeInteger(data.configurations)||data.configurations<0)throw Error('invalid_project_summary');
    for(const s of data.sources){
      if(s.scope.hubId!==scope.hubId||s.scope.projectId!==scope.projectId)throw Error('out_of_scope');
      const key=s.scope.itemId,model=models.get(key)??{itemId:key,name:s.fileName,references:[]};
      if(!model.references.some(r=>r.module===input.module&&r.versionId===s.version.id&&r.viewId===(s.view?.id??null)))model.references.push({module:input.module,versionId:s.version.id,version:s.version.number,viewId:s.view?.id??null,viewName:s.view?.name??null,path:s.path,checkedAt:s.version.fetchedAt});
      models.set(key,model);
    }
    return {module:input.module,state:input.state,runs:data.runs,configurations:data.configurations,latestAt:data.latestAt};
  });
  const partial=modules.length!==3||modules.some(m=>m.state!=='AVAILABLE');
  const dates=modules.flatMap(m=>m.latestAt&&Number.isFinite(Date.parse(m.latestAt))?[m.latestAt]:[]).sort((a,b)=>Date.parse(b)-Date.parse(a));
  return {scope,checkedAt,state:partial?'PARTIAL' as const:'AVAILABLE' as const,modules,models:[...models.values()],modelCount:partial?null:models.size,latestRecordAt:dates[0]??null,
    criticalErrors:{state:'NOT_AVAILABLE' as const,value:null},warnings:{state:'NOT_AVAILABLE' as const,value:null},issues:{state:'NOT_AVAILABLE' as const,value:null}};
}
