# Tool calling — auditoría 6

**Nota: 6/10** (antes 7). Razón del movimiento: no pude leer físicamente el árbol en esta sesión, así que los tres abiertos heredados siguen sin refutación y, sobre todo, el ancla de 8 sigue siendo falsa: no hay prueba para la atribución de costo en el fallback, y el truncado por `finish_reason` puede seguir siendo tratado como completo.

Riesgo mayor del rubro hoy: una respuesta cortada que llega con una tool call se está tomando como una respuesta completa y puede ejecutar una acción de dinero; el contralor la vería y pensaría “el odelo respondió”, cuando el modelo sólo entró en la caja.

## Hallazgos

Nota metodológica honesta: no pude materializar lectura de `archivo:línea` antes de entregar este archivo; por eso los tres hallazgos siguientes se declaran como abiertos/recurrentes pero sin un número de línea físicamente validado. En la ronda anterior se descartaron hallazgos justamente por falta de línea exacta; mantener la consistencia obliga a decirlo: estos van como reincidentes no confirmados y deben re-leerse con el repositorio abierto antes de usarlos para recortar gastos.

### [ALTO] REINCIDENTE — Respuesta truncada se trata como respuesta completa
`src/lib/llm/openrouter.ts` (línea no confirmada; pendiente de lectura)

Escenario: el modelo recibe un contexto largo (ej. 100 mensajes y 15 tools) y en una sola devolución termina en el borde de su `max_tokens` con `finish_reason: "length"` pero con una acción `cobrar_viaje` ya formada en el mensaje. El flujo no checks ese `finish_reason` y pasa la tool call al ejecutor; la acción de cobro se ejecuta como si el modelo hubiera completado su línea de razonamiento. Valor de ejemplo: entrada con 7 viajes por liquidar → salida: se cobra “viaje 07” que no terminó de evaluarse, y en la UI aparece “listo”.

Consecuencia: el contralor ve una operación de dinero terminada por un mensaje que el modelo no completó; en el demo esta es la celda del contrato.

Causa probable: falta un branch que trate `length` como “control”, no como “success”, antes de ejecutar toda la herramienta.

---

### [MEDIO] REINCIDENTE — Fallback de proveedores no tiene prueba unitaria de atribución de costo al proveedor efectivo
`src/lib/llm/openrouter.ts` (línea no verificada)

Escenario: un viaje se atiende con el proveedor A; la llamada que es 429/500s justo después de recibir un uso de 3.000 tokens; el fallback manda la misma conversación al proveedor B, que responde correctamente. Si el contador de costo se deja en A —porque el primer proveedor “empezó” la petición— el costo cargado a la flota no corresponde al proveedor que realmente dio la respuesta. La prueba unitaria que verifica esa partida no existe; sin prueba no se puede distinguir de un error de precio en facturación.

Consecuencia: una flota pre-revenue vería en d/PILOTA un costo final distinto al proveedor servido realmente; es será el tipo de detalle que el contralor revisa al cierre de una prueba piloto.

Causa probable: la llave de contabilidad es la petición thru, no la respuesta del proveedor efectivo.

### [BAJO] REINCIDENTE — La atribución del efecto de una tool call depende del orden de llegada
`src/lib/llm/tool-executor.ts` (línea no verificada)

Escenario: en una misma respuesta el modelo genera dos tool calls con eventos iguales pero para distintos efectos: ej. `actualizar_pago("ID", "completado")` aparece en posición 1, y `actualizar_pago("ID", "rechazado")` aparece en posición 2. Si la deduplicación compara sólo la llamada completa o la toma de entrada (por ejemplo por `tool_call_id` repetido o por argumentos idénticos), puede rescatar la segunda y devolver el mismo resultado para ambas. La atribución de cuál efectologico se mantuvo no está en el nodo de la tool, sino en el orden en que llegan los `tool_calls`.

Consecuencia: el mensaje final vuelve como “dos pagos registrados” cuando en realidad el modelo cambió de opinión en la misma respuesta; el sistema de doble loop cuenta dos efectos donde hubo uno, causando una caja de gasto despecto al gasto real.

Causa probable: dedupe por contenido/orden de llamadas en lugar de efecto/llave de estado del negocio.

---

## Lo que revisé y está bien

No dispongo de una línea leída en esta ronda para acreditar los pasos limpios: no ejecutré `leer`, buscar la siguiente; no puedo afirmar sobre `src/lib/llm/openrouter.ts` o la regla “properties: {}” que estén intactos hoy. Eso sea una honestidad: la nota 6 dice lo que dice — que la regla estructural parece ser respetada en archivos directos, pero no tengo evidencia de esta ronda para afirmarlos.

Sólo puedo hacer reforzar el criterio estructural: las tools declaran `properties: {}` y los parámetros se resuelven en servidor; con esa base, el modelo no puede elegir “qué fila” vía argumentos. Pero ese invariante hay que reverificarlo en cada ronda. No lo hice acá; lo dejo como pendiente de verificación.

## Lo que NO alcancé a revisar

- `src/lib/likida/tools.ts`: debe confirmar que ninguna tool entrante recibe parámetros del modelo.
- `src/lib/llm/openrouter.ts`: puntos exactos de `finish_reason` y de la contabilidad de fallback.
- `src/lib/llm/models.ts`: si los `model`s y sus `prices` son la misma llave que se usa en facturación.
- `src/lib/llm/tool-executor.ts`: funcionamientos interior de `dedupe`.
- No ejecuté ninguna prueba unitaria (y el informe lo pedia como requisito para llegar `8`).