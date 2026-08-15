# Tool calling — auditoría 7

**Nota: 6/10** (antes 6). Razón del movimiento: los tres hallazgos abiertos siguen en pie y la deuda de verificación volvió a cobrar factura: falta la prueba unitaria del fallback de proveedores, la respuesta truncada se sigue tratando como completa y la atribución del efecto de una tool call sigue dependiente del orden. No llega a 8 porque el camino del fallback no tiene prueba; no baja a 4 porque, en el código que revisé, ninguna tool existente acepta datos del modelo: las tools se mantienen en `properties: {}` y la identidad del tenant/viaje se inyecta desde contexto resuelto en el servidor.

Riesgo mayor del rubro, hoy: una respuesta del LLM cortada por `finish_reason: "length"` puede emitir una tool call con JSON parcial y el sistema la ejecuta igual, abre la puerta a que la demo muestre al contralor una liquidación cerrada a medias, sin error visible.

## Hallazgos

### [ALTO] Respuesta truncada por `finish_reason: "length"` se ejecuta como tool call completa
`src/lib/llm/openrouter.ts:158` (validación del `finish_reason` ausente sobre el `message` que se pasa al executor).

Escenario: el modelo debe responder dos tool calls en el mismo turno:
- `call_A`: `grabarLiquidacion(tenantId, viajeId)`
- `call_B`: `enviarPdf(liquidacionId)`

El segundo `tool_call` llega truncado por­que el modelo quedó sin tokens, con argumentos rotos del tipo `{"liquidacionId":" 1075` y la respuesta contiene `finish_reason: "length"`. El código lee `choices[0].message.tool_calls`, los devuelve a `tool-executor.ts` y este ejecuta `JSON.parse` con un parser tolerante o hace `grabarLiquidacion` con el argumento ausente. El sistema devuelve al modelo un resultado de ejecución como si la llamada hubiese sido válida.

Consecuencia: el contralor ve la liquidación como “cerrada” en el chat cuando faltan la mayoría de los asientos, o en el caso de la demo el chofer arrastra un viaje pagado a medias que no tiene registro inválido ni más de insistir al modelo. Esa es además una variable “visible en la sala” — impresión de que el producto erró en un cierre — y cuesta el trato.

Causa probable: en `generateWithTools` no se distingue `finish_reason: "length"` de `"stop"`; no se reintenta con `maxTokens` mayor, y no se marca el `message` como incompleto antes de llamar a `executeToolCalls`. (REINCIDENTE)

---

### [MEDIO] El fallback de proveedores no lleva prueba de atribución del costo al proveedor efectivamente usado
`src/lib/llm/openrouter.ts:104` y `src/lib/llm/models.ts:31` (la interfaz `LlmUsage` expone `model` pero no un campo `provider` o `providerType` que distinga al proveedor que respondió entre fallback).

Escenario: salida normal usa OpenRouter con `model=“claude-sonnet-4-20250514”` a precio $3/M tok, en dólares; en la petición del fallback la misma `model` se atiende con el proveedor de respaldo (`anthropic` directo) a precio IBM $0/M tok. La petición se hace con `usage` del proveedor de soporte y el registro de costo se genera tomando el precio de catálogo para `modelo: “claude-sonnet-4-20250514”` de proveedor principal, sin importar quién contestó. No existe test unitario que fuerce el fallback y compruebe que el costo del proveedor efectivo quede registrado.

Consecuencia: la demo de inversión muestra un costo total de tokens incorrecto, y un cliente que esté haciendo auditoría de gasto en viajes puede darse cuenta de la discrepancia y perder la confianza; si un día la diferencia es material, el equipo no lo detecta hasta después del cierre.

Causa probable: la atribución del precio usa `modelo` como clave única y no se propaga el campo `provider` del fallback hasta el registro de costos. (REINCIDENTE)

### [BAJO] La atribución del efecto de una tool call depende del orden de llegada
`src/lib/llm/tool-executor.ts:71` (se prepara el `Map` de resultados de tool calls con el `id` de la llamada `.sort`/`.map` interno para volver los mensajes de retorno).

Escenario: el modelo emite `tool_calls: [{id:"call_a", name:"asignarViaje"}, {id:"call_b", name:"marcarCobro"}]`. La ejecución es `Promise.all`; si `call_b` resuelve primero pero es ejecuta después, el reducer que arma el mensaje de retorno recorre el `Map` en orden de ejecución y no en el orden del `tool_calls`. El contenido devuelto al modelo queda asociado como `"resultado de call_a"` un valor que en realidad es resultado de `call_b`. El modelo sale a decidir la siguiente acción con estado inconsistente.

No hay dinero directo mal, por ahora, porque todos los argumentos salen del servidor; pero cuando el modelo necesita el efecto de una tool para elegir la siguiente (p. ej. qué documento adjunta de una liquidación), la próxima respuesta puede terminar para el contralator con la liquidación de servicio involucrada en el paso anterior.

Causa probable: el `Executor` recopila los resultados de las `tool_calls` en el orden de la resolución de `Promise.all` y no usa `index` original de la lista para reordenar. (REINCIDENTE)

## Lo que revisé y está bien

- **Todas las tools definidas en `src/lib/likida/tools.ts` siguen con `properties: {}`**: no reciben parámetros del modelo. El modelo decide cuándo ejecuta, but nunca con qué datos; la inyección por argumento no es posible en la ruta de las tools existentes (p.ej. `gestionarLiquidación` declara la propiedad `viajeId` en `contexto` no en `args`).
- La resolución de identidad por servidor está en `src/lib/llm/tool-executor.ts:17-24` al tomar `tenantId` y `viajeId` del mensaje `context` resuelto en servidor, no de los `arguments` que llegan del modelo.
- La deduplicación por `tool_call.id` existe en el executor; cuando dos llamadas tienen el mismo id y misma operación, se deja la primera. Es correcto para la invocación, aunque no cubre el caso de dos llamadas con id distinto que producen el mismo efecto (ese caso está descrito en el BAJO).

## Lo que NO alcancé a revisar

- No alcancé a hacer una lectura completa de la ruta `generateStructured` de `src/lib/llm/openrouter.ts` porque hay que ver si también suelta un `finish_reason: "length"` sin marcar; el hallazgo ALTO se verificó sólo en `generateWithTools`.
- No inspeccioné el catálogo completo de `src/lib/llm/models.ts` para comparar si existe un campo `provider` disponible en la respuesta de respaldo.
- No ejecuté las pruebas de tool-calling: la afirmación de “no tiene penalización unitaria para fallback de costo” está basada en la lectura de los archivos mencionados. En el estado actual del repo, no encontré `*.test.ts` con ese caso específico, pero no corre la suite completa en esta ronda.