# Plantilla MEP

Fuente funcional: especificación «IMPLEMENTAR / GENERAR PLANTILLA DE CUBICACIONES MEP» entregada por el usuario el 25-09-2026. Los ejemplos numéricos de esa especificación no son datos de la aplicación.

Se agrega **MEP · Instalaciones** al catálogo de Cubicaciones. Al agregarla al proyecto se asigna su plantilla base una sola vez. Se conserva el aislamiento de organización/proyecto y la fuente RVT, versión y vista configurada. La mesa reutiliza el encabezado, control de versiones, lectura Autodesk, filtros múltiples, protocolo de selección y motor espacial de estructura.

## Cálculo y cobertura

Motor: `mep-quantities-v1.0`; regla: `cgs-mep-quantities`, versión 1. Servicios independientes de React en `web/public/quantity-v2/mep-service.js` y catálogo extensible en `mep-catalog.js`.

- Pipes, Ducts, Conduits y Cable Trays: suma del largo publicado, con unidad convertida a metros.
- Uniones, accesorios, aparatos sanitarios, terminales, equipos, luminarias y rociadores: conteo de ElementId únicos. Quantity no se usa como multiplicador de instancias.
- Ducto rectangular de forma publicada: `2 × (Width + Height) × Length`; circular: `PI × Diameter × Length`. Ductos ovales o secciones ambiguas quedan pendientes. La superficie es una magnitud derivada, no un área neta de aislación contratada.
- La ausencia de datos no equivale a cero. Si hay lecturas incompletas, las tarjetas identifican subtotal parcial y cantidad de elementos leídos.
- Identificadores repetidos invalidan las cantidades de las instancias involucradas.

Los parámetros y conectores sólo se usan si Autodesk los publicó. Los diámetros y dimensiones de conectores pueden suplir parámetros ausentes; no sustituyen un parámetro ambiguo o con unidad desconocida. Se conserva la lista original completa de propiedades, incluidos caudal, pendiente, potencia y unidades, sin inventar su disponibilidad. No se infiere la longitud de una tubería por la diagonal de su caja envolvente. Sin curva/eje verificable, la falta de largo queda pendiente.

## Clasificación

APF, APC, ALC, GAS, PCI, VNT y ELE forman el catálogo inicial. Pipes nunca determina una especialidad por sí sola. Se usan coincidencias exactas normalizadas de Especialidad, System Type y System Classification; los nombres de archivos, familias o tipos no se interpretan probabilísticamente.

Las clasificaciones publicadas se contrastan con la [enumeración oficial Autodesk MEPSystemClassification](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/43ec0d75-d6bb-2d08-a920-9715e83040e7.htm). Las correspondencias de categorías explícitas (ductos/VNT, conduit/ELE, rociadores/PCI) provienen de la especificación. Otros sistemas o contradicciones requieren una asociación confirmada. La configuración permite asociar valores reales a especialidades existentes o nuevas; se guarda con usuario, fecha, proyecto y revisión de la configuración.

Los grupos separan especialidad, categoría, piso resuelto, sistema, material, familia, tipo y dimensiones exactas, antes del redondeo de presentación. Sistema permanece como dato de resultados, no como cuarto filtro principal.

## Pisos y versiones

Se reutilizan `slabCandidates`, `buildIntervals` y `resolveLevel`. Sólo las losas de hormigón disponibles en la misma vista pueden actuar como referencia; se requiere confirmar los grupos de cotas y sus nombres. Una vista MEP que no publique losas no produce pisos espaciales inventados. Puede configurarse un piso manual, vinculado a la versión y vista, con su origen visible.

El filtro usa exclusivamente el piso resuelto. El nivel Revit original se muestra en evidencia. Los elementos que cruzan intervalos se agrupan en **MULTILEVEL** y conservan su largo íntegro allí; no se reparten sus metros ni se asignan todos al piso predominante. Los intervalos atravesados permanecen en la evidencia, preparados para una futura subdivisión geométrica.

No se federan modelos de distintos archivos ni se reutilizan coordenadas de otro modelo sin una fuente y alineación verificadas. La comparación usa lecturas de la sesión del mismo archivo, identifica versiones/vistas y advierte si cambiaron criterios. No es un historial persistente de resultados.

## Interacción y evidencia

Tres filtros principales: Especialidad, Categoría Revit y Piso; admiten selección múltiple y se restringen mutuamente. La selección manual del modelo limita los resúmenes y partidas. Las filas y tarjetas permiten ver un grupo y atenuar el resto; también se conservan aislar, ocultar y restablecer. Los resultados se exportan con el filtro activo, IDs, fuente, fórmulas y parámetros originales.

La pantalla de escritorio distribuye filtros y resumen arriba, visor y tabla abajo. El desplazamiento de registros es interno a la tabla. En pantallas pequeñas se alternan Modelo y Cubicación para conservar la superficie de trabajo.
