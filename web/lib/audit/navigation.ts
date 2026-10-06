export const auditNavigation: readonly {label:string;items:readonly (readonly [string,string])[]}[] = [
 {label:'AUDITORÍA',items:[['','Resumen del proyecto'],['modelo','Historial por modelo']]},
 {label:'Configuración',items:[['configuracion','Proyecto y vista'],['referencias','Referencias verticales'],['tolerancias','Tolerancias'],['reglas','Rule Set']]},
 {label:'Contexto',items:[['ficha','Ficha del modelo'],['coordenadas','Coordenadas']]},
 {label:'Auditoría 3D',items:[['niveles','Niveles'],['grillas','Grillas'],['categorias','Categorías'],['familias','Familias y tipos'],['geometria','Geometría'],['salud','Salud técnica']]},
 {label:'Datos',items:[['parametros','Parámetros'],['completitud','Completitud'],['unidades','Tipos y unidades'],['validez','Validez'],['consistencia','Consistencia'],['tipo-instancia','Tipo e instancia'],['requisitos','Requisitos por categoría'],['aptitud','Aptitud para uso']]},
 {label:'Resultados',items:[['hallazgos','Hallazgos'],['comparaciones','Comparaciones']]},
] as const;
export const auditHref=(section:string)=>`/auditoria-bim${section?`/${section}`:''}`;
export const chapterPages:Record<string,string>={G01:'ficha',G02:'coordenadas',G03:'niveles',G04:'grillas',G05:'categorias',G06:'familias',G07:'geometria',G08:'salud'};
