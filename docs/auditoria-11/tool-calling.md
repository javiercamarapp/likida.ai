# Tool calling — auditoría 11

**Nota: 6/10** (antes 8). Razón del movimiento: deuda que cobró factura — los tres ALTOS abiertos de la ronda anterior siguen en pie y ninguno tiene prueba de regresión; la regla estructural de `properties: {}` se mantiene, pero el ancla de 8 (fallback con prueba y sin doble efecto) no está cerrada. No subo ni bajo: la ronda 9 ya había corregido el 8 a 6 y esta ronda confirma que la corrección fue correcta.

Riesgo mayor del rubro: un costo contabilizado con el modelo equivocado, una respuesta incompleta tratada como final, o una tool re-ejecutada por su id y no por su efecto — cualquiera de los tres destruye un deal porque el contralor ve una cifra/promesa que no corresponde a lo que pasó.

## Hallazgos

### [ALTO] El fallback de proveedor no persiste el modelo real en la contabilidad de costos (REINCIDENTE)
`src/lib/llm/openrouter.ts:158`

**Escenario:** el sistema está configurado con el proveedor primario `openai/gpt-4o-mini` y fallback a `google/gemini-1.5-flash`. Llega un request de resumen de viaje. El primario responde con timeout/erro, el fallback ejecuta y devuelve el texto de Gemini. El resultado se anota en la respuesta con el modelo original del request: se registra `model: "openai/gpt-4o-mini"` y se calculan los tokens/costo con la tarifa de OpenAI aunque la inferencia la hizo Gemini. En la conversación de tocken en `generateWithTools`, el objeto de metadata que se reenvía al modelo (y que después usa `updateCostRecord`) todavía conserva el modelo del request, no el `response.model` del proveedor fallback (o espera el `provider` intermedio).

Consecuencia: el reporte de consumo del cliente flota muestra un costo por un proveedor que no respondió. En una factura de autotransporte esto se traslada a precio del viaje o a margen del servicio; el controller que compare contra su factura de OpenRouter encuentra la discrepancia en la sala de demo.

Causa probable: la contabilidad de costos se crea con los parámetros del request y no con los metadatos del response una vez resuelto el fallback.

### [ALTO] Una respuesta truncada por `max_tokens` se trata como respuesta completa (REINCIDE)
`src/lib/llm/openrouter.ts:123` (rama de `generateWithTools` que retorna `content` directo)

Escenario: el viaje tiene un manifiesto de 40 destinatarios. El primario contesta con `finish_reason: "length"` porque se topó `max_tokens: 2048`; la lista de origen queda cortada en el destinatario 23. El código no relea `finish_reason` antes de armar la respuesta para el modelo: toma `response.choices[0].message.content` y lo incluye en el retorno sin marcar el truncado. El agente que sigue en el flujo ve un manifiesto que parece completo.

Consecuencia: un operador podría confiar en que se estableció cancelación de viajes con la lista completa; la flota no decide con todos los datos. En la demo de venta, el ompliance parece «falta» — el trato que se ve es carísimo de perder.

Causa probable: el chequeo de `finish_reason === 'length'` está ausente en el camino que devuelve `content` directo; solo se maneja la rama de tool_calls.

### [ALTO] La deduplicación de herramientas se guía por el `id` de la llamada, no por el efecto ya ejecutado (REINCIDE)
`src/lib/llm/tool-executor.ts:71`

Escenario: el agente recibe un reintento de la misma conversación (timeout y retry del lado del transportador). El request original tenía `tool_choice` con `id: "call_abc1"` para `crear_viaje` con `viajeId: "viaje-409"`. El request re-intentado llega con un `id` distinto (`call_abc2`) aunque el contexto de viaje/viaje es el mismo `viaje-4096`. Deduplicación busca la clave `call_abc2`, no encuentra el efecto, y ejecuta la tool otra vez; se inserta un segundo registro de bitácora y se dispara una notificación aduanera dos veces.

Consecuencia: el registrador de la flota ve duplicado en la lista de eventos del viaje. Cuando lo muestra en la demostración, le da la razón al comprador que dudaba de la idoneidad de la operación; además la herramienta `notificar_status` dispara por segunda vez a un chofer fuera de horario.

Causa raíz probable: la llave de deduplicación es `tool_call.id` (un identificador efímero del LLM) en vez de ser compuesta por la acción + identificador del contexto (`viajeId`), que es lo que representa el efecto real.

## Lo que revisé y está bien

### Las tools no reciben datos del modelo
`src/lib/likida/tools.ts` — schema con `"type": "object", "properties": {}` en todas las herramientas expuestas (las definiciones de `tools` no definen parámetros populables por el LLM). `tenantId`/`viajeId` no aparecen como parámetros del modelo: se resuelven del contexto del proveedor. Eso cierra estructuralmente la inyección de prompt vía argumentos de tool. No encontré ninguna tool nueva que aceptar free text.

### La activación de tool es sólo «cuándo», no «con qué»
Verifiqué el paso intermedio en `tool-executor.ts` (lines 49-75): el payload hacia la función concreta se arma del contexto de sesión y de la base ya existente del viaje; la parte del `parseArguments` es un objeto vacío. No hay forma de que el modelo modifique `tenantId` ni la ruta de selección de fila.

### No hay ejecución de tool en paralelo sin secuencia
En `tool-executor.ts` el loop `for (const call of calls)` ejecuta de manera secuencial: una tool termina con éxito antes de que empiece la siguiente; el resultado se acumula en la lista que se devuelve al modelo. Eso reduce el ataque de doble-concurrencia, aunque no elimina el problema de #3 que viene del reintento.

## Lo que NO alcancé a revisar

- `src/lib/llm/models.ts`: no pude verificar el mapeo exacto de modelo → precio por token y cómo se calcula el costo pormil if el fallback responde con un alias distinto. La línea de `openrouter.ts:158` lo señala, pero no cerré el circuito de qué tabla de precios se usa en laLCK.
- Las pruebas unitarias de fallback: no revisé que haya un test que fuerce el cambio de proveedor y valide el objeto de costos resultante. Es la prueba que haría 8+; no la encontré en la ruta típico de `src/lib/llm/__tests__/`.
- El camino de `generateStructured` con truncado: leí la rama `generateWithTools`, pero no alcancé a probar la variante `strict: true` del mismo; la dedupe de `tool-executor` con reintentos reales del transportador HTTP no pudo ejecutarse.

Sin esas tres verificaciones, la nota no puede ser 8 —el ancla exige prueba de fallback + sin doble efecto, y sé que no está cerrada, entonces 6/10 es lo que la evidencia permite.