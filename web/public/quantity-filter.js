import { classificationInventory, matchesClassification, classificationRule } from './quantity-classification.js';

// A filter is a verified result set, not the Viewer's native selection.
export function createQuantityFilter(viewer,{mapping,classified,report,send}) {
  let revision=0,key,ids=null,phase='idle',applying=false,mode='filter';
  const publish=()=>send({state:'filter',key,active:ids!==null,count:ids?.length??0,phase,mode});
  const nativeSelect=values=>{applying=true;try{viewer.select(values);}finally{applying=false;}};
  const restore=()=>{viewer.setGhosting(false);viewer.showAll();};
  async function update(data){
    const nextKey=JSON.stringify([data.filteredElementIds,data.classificationFilter??null]);
    const run=++revision;
    try {
      if(nextKey!==key||phase!=='ready'){
        key=nextKey;ids=null;phase='loading';mode='filter';publish();
        let matches=null,message='Sin filtros: modelo completo.';
        if(data.filteredElementIds!==null){
          const map=await mapping();
          if(data.filteredElementIds.some(id=>!Object.hasOwn(map,id)))throw Error('unmapped_filter');
          matches=[...new Set(data.filteredElementIds.map(id=>map[id]))];
          message=`${matches.length} elementos filtrados por las partidas.`;
        }else if(data.classificationFilter){
          const filter=data.classificationFilter;
          if(!['specialty','subspecialty','floor'].every(k=>typeof filter[k]==='string'))throw Error('invalid_filter');
          if(filter.specialty||filter.subspecialty||filter.floor){
            const elements=await classified();
            matches=classificationInventory(elements).filter(e=>matchesClassification(e,filter)).map(e=>e.dbId);
            message=`${matches.length} de ${elements.length} elementos filtrados. Criterios v${classificationRule.version}.`;
          }
        }
        if(run!==revision)return;
        ids=matches;phase='ready';restore();nativeSelect([]);publish();
        send({state:'selection-count',count:0});
        report('ready',message);
        return; // A filter change never re-applies a previous table highlight.
      }
      // Explicit table clicks may select; changing a filter never does.
      if(!data.highlightedElementIds.length)return;
      const map=await mapping();if(run!==revision)return;
      if(data.highlightedElementIds.some(id=>!Object.hasOwn(map,id)))throw Error('unmapped_selection');
      const desired=data.highlightedElementIds.map(id=>map[id]),current=viewer.getSelection();
      if(current.length!==desired.length||current.some(id=>!desired.includes(id))){nativeSelect(desired);viewer.fitToView(desired);}
      send({state:'selection-count',count:viewer.getSelection().length});
    }catch{
      if(run!==revision)return;
      ids=null;phase='error';mode='filter';restore();nativeSelect([]);publish();send({state:'selection-count',count:0});
      report('error','No se pudo completar la lectura del filtro. Vuelve a cargar el modelo.');
    }
  }
  function applyVisibility(action,target,expectedKey){
    if(phase!=='ready'||expectedKey!==key)return;
    if(!['filter','isolate','attenuate','hide','showAll'].includes(action))return;
    const matches=target==='filter'?ids:target==='selection'?viewer.getSelection():null;
    if(!['showAll','filter'].includes(action)&&!matches?.length)return;
    if(action==='showAll'||action==='filter'){restore();nativeSelect([]);}
    else if(action==='isolate'||action==='attenuate'){
      nativeSelect([]);restore();viewer.setGhosting(action==='attenuate');viewer.isolate(matches);viewer.fitToView(matches);
    }else if(action==='hide'){nativeSelect([]);restore();viewer.hide(matches);}
    mode=['showAll','filter'].includes(action)?'filter':action;publish();send({state:'selection-count',count:viewer.getSelection().length});
  }
  return {update,applyVisibility,isApplyingSelection:()=>applying,dispose:()=>{revision++;}};
}
