# Cubicaciones de la vista activa — motor 2.0

Implementa la especificación del usuario del 24 de septiembre de 2026. Sustituye la mesa de Cálculo por Especialidad → Categoría Revit → Piso resuelto. Los módulos restantes y los resultados históricos del motor anterior conservan su comportamiento.

## Alcance y procedencia

Cada lectura se vincula a proyecto, archivo, versión, derivado y GUID de vista verificados por el servidor. Solo se leen propietarios de geometría de esa vista; se excluyen nodos padre sin geometría para evitar doble conteo. Especialidad debe estar publicada como Hormigón o Enfierradura (normalización de mayúsculas y acentos); las categorías usan equivalencias explícitas Revit inglés/español. No se deduce material, categoría o especialidad de un LLM.

Todos los parámetros conservan nombre, categoría, valor y unidad originales. Las unidades se convierten a metros, m², m³ mediante factores dimensionales explícitos. Parámetros ambiguos o sin unidades no producen cantidades. ElementId, familia, tipo, material, dimensiones, niveles, host y datos de barra ausentes se mantienen como no disponibles. Los identificadores externos repetidos no se suman.

Los servicios independientes están en `web/public/quantity-v2/`: propiedades, geometría, hormigón/moldaje/enfierradura, resolución de pisos, agregación y protocolo del visor. Los adaptadores de versiones y autorización existentes continúan en `web/lib/quantities/autodesk.ts` y `viewer.ts`. React no contiene fórmulas técnicas.

## Fórmulas

- Hormigón: Volume de Revit con unidad válida; en su ausencia, volumen de malla cerrada orientada. Nunca volumen de BoundingBox.
- Vigas y fundaciones lineales: Largo × Altura × 2. Si faltan dimensiones y existe un prisma rectangular verificado, suma de sus dos caras laterales principales.
- Pilares: Perímetro × Altura. En sección rectangular verificada, 2 × (Ancho + Fondo) × Altura. Puede derivarse de un prisma geométrico vertical.
- Muros: Área publicada de una cara × 2; alternativa geométrica para prismas rectangulares.
- Losas elevadas: área inferior + perímetro × espesor. Radier/fundación: solo perímetro × espesor. La condición de apoyo se confirma por tipo en la vista; las denominaciones explícitas radier/losa de fundación identifican el caso sin fondo.
- Fundaciones no lineales: se calcula el área potencial de caras verticales y se excluye del total hasta que el usuario confirme que todas requieren moldaje y no hay contactos que descontar. No se realiza una unión booleana entre elementos.
- Barras Structural Rebar: largo individual × cantidad; luego largo total × kg/m. El diámetro se mantiene como agrupación obligatoria. Los coeficientes requieren diámetro, kg/m, fuente y versión aportados por el usuario. No hay pesos normativos precargados ni cantidad de barras implícita.

Las sumas usan acumulación compensada. Un total solo aparece completo cuando todos los elementos elegibles tienen cantidad. En otro caso se muestra subtotal parcial y su cobertura; cero sigue siendo un valor distinto de pendiente/no disponible.

## Geometría y precisión

Se emplea la geometría teselada publicada por Autodesk Viewer, transformaciones originales y unidad del modelo verificada. La cámara y la explosión del visor no alteran las cantidades. Las mallas abiertas, degeneradas, orientaciones inválidas, fragmentos compartidos, varios cuerpos sin unión validada o más de 250.000 triángulos por elemento no proporcionan cantidades geométricas aparentemente válidas. Se conserva el motivo y se prioriza el parámetro Revit válido.

El análisis de prisma requiere caras inferior y superior planas únicas. Perímetros incluyen los cantos de huecos que formen parte de la malla cerrada. La precisión está limitada por la teselación; el resultado no se presenta como obtenido del núcleo original Revit. El eje vertical debe ser Z; las cotas son las coordenadas originales de la vista en metros, no una cota topográfica inferida.

APIs contrastadas con el SDK y documentación oficial:
- [Volumen y superficies en Viewer](https://aps.autodesk.com/blog/get-volume-and-surface-area-viewer).
- [Escenas y fragmentos](https://aps.autodesk.com/blog/working-2d-and-3d-scenes-and-geometry-forge-viewer).

## Pisos y tolerancia

Se ofrecen 1 mm, 2 mm y 5 mm, con valor personalizado entre 0,1 y 50 mm. 2 mm es una propuesta inicial configurable, no una regla normativa. Se agrupan cotas superiores con diferencia máxima dentro del grupo, sin encadenar desviaciones sucesivas.

Se presentan las losas horizontales de Hormigón, sus cotas, áreas, área relativa, IDs y niveles originales. El usuario confirma las plataformas principales y sus nombres para excluir descansos, balcones o grupos secundarios. Se necesitan al menos dos referencias para construir intervalos. Las referencias están ligadas a derivado/vista: otra versión debe revisarse de nuevo.

La asignación utiliza centroide geométrico o centro de BoundingBox, extensión MinZ/MaxZ e intersección XY con las cajas de las plataformas. No se confunde esa comprobación XY con una prueba exacta de contención dentro de huecos de losa. Para multinivel se informa el intervalo predominante; un empate queda sin resolver. No se fracciona aún la cantidad por piso. La confianza espacial guarda la fracción de altura en el intervalo predominante y explica su significado; no es una probabilidad del LLM. Se conserva el nivel original y se permite una corrección manual explícita.

## Configuración y versiones

Criterios, referencias, condiciones de apoyo, confirmación de caras y tabla de pesos se guardan cifrados en la configuración existente del proyecto con control de revisión concurrente. No requieren nuevas tablas ni migración. No se aceptan resultados calculados por el navegador como un registro técnico certificado en el servidor.

La comparación usa lecturas efectivamente calculadas del mismo archivo en la sesión (hasta seis). Muestra ambos modelos/vistas/versiones y cambios de criterio; las diferencias de totales incompletos no se calculan. No se infieren altas/bajas por dbId. La exportación JSON conserva las entradas, fórmulas, cobertura, criterios y filtro activo. Las lecturas de sesión no se anuncian como historial persistente.

El filtro no usa la selección azul del SDK. Atenuar, ocultar y aislar se aplican explícitamente al conjunto filtrado, sin cambiar su suma; filas y tarjetas permiten aislar sus propios elementos. Mensajes de otras ventanas, orígenes, vistas, revisiones o IDs ajenos al filtro no pueden aplicar acciones.
