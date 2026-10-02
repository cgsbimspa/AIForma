export type ProjectIntent='DOCUMENT_QUERY'|'DATA_QUERY'|'MODEL_ACTION'|'AUDIT_QUERY'|'QUANTITY_QUERY'|'REGULATION_QUERY'|'ISSUE_QUERY';
export const intentLabels:Record<ProjectIntent,string>={DOCUMENT_QUERY:'Documentos',DATA_QUERY:'Datos del modelo',MODEL_ACTION:'Ver elementos',AUDIT_QUERY:'Auditorías',QUANTITY_QUERY:'Cubicaciones',REGULATION_QUERY:'Normativa',ISSUE_QUERY:'Incidencias'};
// Routing only. This never classifies BIM objects or computes technical results.
export function projectIntent(question:string):ProjectIntent|null{
 const q=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/\b(incidencias?|issues?)\b/.test(q))return 'ISSUE_QUERY';
 if(/\b(ridaa|normativa|norma|reglamento|cumplimiento|revision normativa)\b/.test(q))return 'REGULATION_QUERY';
 if(/\b(auditoria|auditar|hallazgos?|errores?|advertencias?)\b/.test(q))return 'AUDIT_QUERY';
 if(/\b(cubicacion|cubicaciones|volumen|m3|m³|moldaje|peso|cantidad de hormigon)\b/.test(q))return 'QUANTITY_QUERY';
 if(/\b(pdf|documentos?|carpetas?|archivos?|informe|resum\w*|contrato|orden\w* de compra|especificaciones)\b/.test(q))return 'DOCUMENT_QUERY';
 if(/\b(muestra\w*|aisla\w*|oculta\w*|pinta\w*|filtra\w*|selecciona\w*|ver elementos)\b/.test(q))return 'MODEL_ACTION';
 if(/\b(parametros?|propiedades|elementos|vigas|muros|losas|tuberias|niveles|pisos|grillas)\b/.test(q))return 'DATA_QUERY';
 return null;
}
