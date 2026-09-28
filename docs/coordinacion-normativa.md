# Coordinación Normativa: primera versión sanitaria

La estructura solicitada se integra en `/coordinacion-normativa`. El menú y las rutas se generan desde `web/lib/coordination/catalog.ts`: resumen, Sanitario y cinco sistemas (alcantarillado interior/exterior, agua fría interior/exterior y agua caliente). Las especialidades y cruces futuros quedan identificados como próximos, sin motores habilitados.

Cada sistema separa Revisión, Archivo y alcance, Reglas RIDAA e Historial. El visor utiliza la fuente Autodesk verificada, la versión y la vista exactas. No reemplaza una vista ausente por la geometría predeterminada.

## Base legal consultada

- Reglamento de Instalaciones Domiciliarias de Agua Potable y Alcantarillado, D.S. MOP 50/2002.
- Texto consolidado de BCN: versión 10-02-2009, consulta 28-09-2026.
- Fuente: https://www.bcn.cl/leychile/navegar?idNorma=207101&idVersion=2009-02-10
- PDF oficial: https://nuevo.leychile.cl/servicios/Consulta/Exportar?exportar_con_notas_al_pie=True&exportar_con_notas_bcn=True&exportar_con_notas_originales=True&exportar_formato=pdf&hddResultadoExportar=207101.2009-02-10.0.0%23&nombrearchivo=Decreto-50_28-ENE-2003&radioExportar=Normas

El catálogo es una **base de 18 controles**, no una codificación completa del reglamento. Cada entrada conserva artículo, ámbito, requisitos de datos y excepciones. Los artículos 1 y 5 distinguen las tablas interiores de las normas necesarias para redes privadas exteriores; se conserva también la referencia del artículo 94. No se copian límites interiores a redes exteriores.

Los controles numéricos iniciales son: pendiente ordinaria mínima/máxima del artículo 88; carga de sifón del artículo 89; diámetro de ventilación principal del artículo 97 a); mínimos de cobre y plástico del artículo 52 a). Se requiere una asociación de parámetro/categoría/filtro, una justificación y confirmación del ámbito. Por ejemplo, la excepción de pendiente hasta 1 % no queda convertida en un FAIL automático: el conjunto ordinario debe excluir casos exceptuados. No se aplica el diámetro de ventilación principal a todas las ventilaciones.

Los restantes controles conservan sus dependencias. Las condiciones de las NCh citadas no se han transcrito sin una fuente controlada. No se infirió el valor perdido en la extracción del texto de presión del artículo 52 d). Las fórmulas publicadas, como QMP, permanecen documentadas sin ejecutarse sobre caudales o artefactos no verificados.

## Flujo técnico y límites

1. Autorización Autodesk por usuario, organización y proyecto; validación de archivo, versión y vista.
2. Extractor de objetos hoja y propiedades de Model Derivative. Se informa la población y cuántos objetos no tienen propiedades. Categorías MEP sólo desde propiedades o ancestros exactos del árbol publicado, nunca del nombre del elemento.
3. Alcance confirmado por vista o igualdad exacta de parámetro/valor. Los cambios de fuente retiran asociaciones anteriores y requieren revisar el alcance.
4. Estructura de grafo con nodos, adyacencias, elevaciones, UEH y campos hidráulicos. **Conectores no disponibles** en este extractor: campos desconocidos permanecen nulos. No se infiere conectividad por proximidad.
5. Motor de reglas determinístico. Unidades explícitas; conversión dimensional sólo entre mm/cm/m. Los valores sin unidad o ambiguos permanecen sin evaluar. Los controles de pendiente comparan el parámetro de diseño publicado; no afirman haber medido la geometría.
6. Resultado/evidencia por regla y elemento: fuente, versión, vista, fecha, parámetro original, requisito y configuración, método y motor. PASS indica únicamente que se satisface ese criterio bajo el alcance confirmado. No se presenta una certificación integral.
7. Incidencias internas, comentarios y marcas de revisión asociados a la ejecución. No se crean issues en ACC ni se alteran resultados calculados.

Los motores de geometría de red, continuidad, recorridos, sentido de flujo y cálculo hidráulico completo requieren datos de conectores y demás entradas verificadas. Esta versión **no los sustituye por IA**; su estado es No evaluado / No disponible. El visor permite focalizar, aislar elementos y colorear resultados localizables por UniqueId; no representa una red calculada sin conectores.

## Persistencia y comparación

`coordination_record` mantiene configuración versionada, ejecuciones inmutables y anotaciones, con cifrado autenticado, RLS por organización/proyecto, autor verificado y control de revisión concurrente. Se reutiliza el rol de auditoría existente, con una tabla separada. Migración: `node scripts/migrate-coordination.mjs` con la conexión administrativa existente suministrada por entorno. No hay claves en el repositorio.

La comparación exige el mismo archivo, proyecto, sistema, alcance, motor y criterios. Usa UniqueId + regla. No declara corregido un elemento desaparecido o ambiguo. Un cambio FAIL → PASS permite marcar corregido; una mera revisión manual no lo permite. Las revisiones históricas conservan su fuente y no se renombran como resultados de la configuración actual.

## Verificación

`web/tests/coordination.test.mjs` contiene exclusivamente datos sintéticos rotulados TEST. Cubre los límites normativos, exclusión de redes exteriores, confirmación de alcance, ausencia de unidades, trazabilidad, comparación y aislamiento/cifrado/inmutabilidad de almacenamiento. Las pruebas de auditoría y del visor compartido verifican que la integración no cambie sus garantías existentes.
