type Version={id:string;number:number};
export function modelVersionStatus(selected:Version|null,latest:Version|null,error:string,checking:boolean){
 if(!selected)return {state:'unknown',label:'Sin versión',detail:'Selecciona un archivo y su versión.'};
 if(checking)return {state:'checking',label:'Verificando',detail:'Consultando la última publicación en Autodesk.'};
 if(error||!latest)return {state:'unknown',label:'Por verificar',detail:error||'La última publicación no se ha podido verificar.'};
 if(selected.id===latest.id)return {state:'current',label:'Actualizada',detail:`V${selected.number} coincide con la última publicación consultada.`};
 if(latest.number>selected.number)return {state:'outdated',label:'Actualizar',detail:`Usando V${selected.number}. Autodesk tiene publicada V${latest.number}.`};
 return {state:'unknown',label:'Por verificar',detail:'Los identificadores de versión no coinciden con la última publicación consultada.'};
}
