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
5. Motor de reglas determinístico. Unidades explícitas; conversión dimensional entre mm/cm/m/ft/in y pendiente porcentual, mm/m, cm/m, m/m, in/ft o ángulo explícito menor que 90° en valor absoluto. Los valores sin unidad o ambiguos permanecen sin evaluar. Los controles de pendiente comparan el parámetro de diseño publicado; no afirman haber medido la geometría.
6. Resultado/evidencia por regla y elemento: fuente, versión, vista, fecha, parámetro original, requisito y configuración, método y motor. PASS indica únicamente que se satisface ese criterio bajo el alcance confirmado. No se presenta una certificación integral.
7. Incidencias internas, comentarios y marcas de revisión asociados a la ejecución. No se crean issues en ACC ni se alteran resultados calculados.

Los motores de geometría de red, continuidad, recorridos, sentido de flujo y cálculo hidráulico completo requieren datos de conectores y demás entradas verificadas. Esta versión **no los sustituye por IA**; su estado es No evaluado / No disponible. El visor permite focalizar, aislar elementos y colorear resultados localizables por UniqueId; no representa una red calculada sin conectores.

## Persistencia y comparación

`coordination_record` mantiene configuración versionada, ejecuciones inmutables y anotaciones, con cifrado autenticado, RLS por organización/proyecto, autor verificado y control de revisión concurrente. Se reutiliza el rol de auditoría existente, con una tabla separada. Migración: `node scripts/migrate-coordination.mjs` con la conexión administrativa existente suministrada por entorno. No hay claves en el repositorio.

La comparación exige el mismo archivo, proyecto, sistema, alcance, motor y criterios. Usa UniqueId + regla. No declara corregido un elemento desaparecido o ambiguo. Un cambio FAIL → PASS permite marcar corregido; una mera revisión manual no lo permite. Las revisiones históricas conservan su fuente y no se renombran como resultados de la configuración actual.

## Lectura de vínculos y preparación de reglas (motor 1.1)

El inventario recorre recursivamente el árbol completo de la vista publicada, también sus ramas vinculadas. Conserva el `externalId` completo publicado por APS. En identificadores compuestos de Revit, la cadena de instancias y el identificador final se mantienen separados para mostrar procedencia, pero las acciones del visor y las comparaciones usan siempre la cadena completa. Dos instancias del mismo vínculo no se deduplican por el último identificador. Los formatos no reconocidos se muestran con procedencia no identificada.

La subvista **Modelos y vínculos** muestra cobertura, categorías, muestras de rutas publicadas y parámetros. No afirma que el RVT original haya publicado todos sus vínculos ni inventa la versión individual de un vínculo. Los resultados históricos pueden mostrar un desglose derivado de los identificadores que ya conservaron, sin modificar sus resultados originales.

**Reglas RIDAA** sugiere parámetros por nombres explícitos (por ejemplo, Pendiente/Slope o Diámetro/Diameter), cuenta los valores con unidad interpretable y muestra cuántos proceden de vínculos. Son propuestas: no confirman material, ventilación principal, régimen ordinario ni excepciones. Antes de ejecutar un criterio se conserva la confirmación de ámbito exigida por el proyecto. Las unidades desconocidas siguen sin producir cumplimiento.

Los pendientes distinguen asociación faltante, entradas adicionales de la regla, conjunto sin coincidencias y parámetro/unidad no disponible. Si no se ejecuta ninguna regla numérica, la vista explica la causa y enlaza directamente a la preparación. Los conectores y la red hidráulica no se deducen del nombre ni de la existencia de vínculos.

### Pruebas de vínculos

Se prueban vínculos repetidos y anidados, conservación de identidad, evaluación separada, propuestas sin aprobación automática, filtros por procedencia/motivo y compatibilidad de informes históricos sin mutación.

`web/tests/coordination.test.mjs` contiene exclusivamente datos sintéticos rotulados TEST. Cubre los límites normativos, exclusión de redes exteriores, confirmación de alcance, ausencia de unidades, trazabilidad, comparación y aislamiento/cifrado/inmutabilidad de almacenamiento. Las pruebas de auditoría y del visor compartido verifican que la integración no cambie sus garantías existentes.

## Comparación automática sobre evidencia publicada (motor 1.2)

Al ejecutar una revisión, las reglas numéricas sin asociación manual buscan nombres de parámetros reconocidos y unidades explícitas en los elementos del alcance confirmado, incluidos vínculos. Para pendientes y diámetros se usan únicamente las categorías de tubería reconocidas; las dimensiones nominales de accesorios no se usan como diámetro de tubería. No se convierte un número sin unidad ni se elige silenciosamente entre parámetros con valores diferentes.

Cada valor legible produce una comparación `PRELIMINARY` con valor, operador, referencia, diferencia, parámetro original, versión e identidad completa del elemento. No modifica la configuración ni activa una asociación normativa. Todos esos resultados, estén dentro o fuera de la referencia, quedan **por confirmar ámbito**. No afirman que una tubería sea ventilación principal, que un ramal esté sometido al régimen ordinario, ni que no tenga excepciones. Las reglas asociadas explícitamente conservan prioridad y siguen produciendo PASS/FAIL exclusivamente bajo su ámbito confirmado.

La interfaz distingue reglas confirmadas de comparaciones automáticas, permite filtrar dentro/fuera de la referencia y colorea los preliminares en azul. Las revisiones antiguas mantienen sus resultados y muestran la necesidad de ejecutar el nuevo motor. La comparación de versiones nunca cuenta un resultado preliminar como incumplimiento corregido. Los parámetros faltantes, sin unidad o ambiguos y las dependencias de red pendientes permanecen identificados como No evaluado.

La norma base y sus umbrales no cambian en esta mejora. Referencia contrastada: copia BCN de la versión 2009-02-10 publicada por [SMAPA](https://media.smapa.cl/media/documentos/2021/11/reglamento-de-instalaciones-domiciliarias-de-agua-potable-y-alcantarillado.pdf). No se equipara automáticamente 1 % a incumplimiento: el artículo 88 contempla casos que requieren justificar su aplicación.
