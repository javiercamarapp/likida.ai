# Tool calling — auditoría 12

**Nota: 6/10** (antes 6). Razón del movimiento: los tres ALTOS reincidentes siguen abiertos y no hay evidencia de prueba de fallback; la regla de tools sin argumentos se respeta, pero el camino de ejecución de tools no está blindado.

Riesgo mayor: el modelo puede provocar doble ejecución de efectos (dedupe por `tool_call.id`) y un fallback de proveedor esconde el modelo real en la contabilidad de costo, mientras una respuesta truncada se acepta como completa.

## Hallazgos

### [ALTO] El fallback de proveedor no persiste el modelo real en la contabilidad de costos (REINCIDENTE)
`src/lib/llm/openrouter.ts:118`

Escenario: el modelo primario (`claude-sonnet-4-20250514`) falla con HTTP 529; el fallback ejecuta la misma llamada con `gpt-4o-mini`. La respuesta se registra con el costo del primario (US$0.003/1K tokens) cuando el real fue US$0.00015/1K tokens. El contralor ve un costo 20x menor al real en el resumen del viaje.

Consecuencia: la flota toma decisiones de tarifa con un costo de LLM falso; la contabilidad del viaje no cuadra contra la factura real del proveedor.

Causa probable: el costo se calcula contra `params.model` (el modelo solicitado) en lugar de `response.model` (el modelo que respondió). Causa probable: el costo se calcula contra `params.model` (el modelo solicitado) en lugar de `response.model` (el modelo que respondió).

### [ALTO] Una respuesta truncada por `max_tokens` se trata como respuesta completa (REINCIDENTE)
`src/lib/llm/openrouter.ts:89`

Escenario: el modelo empieza a generar una llamada a tool y el límite de `max_tokens` corta el JSON en el carácter 180. La respuesta llega con `finish_reason: "length"`, el JSON está incompleto y el parser de `generateWithTools` no valida `finish_reason`; el sistema interpreta que el modelo no llamó ninguna tool y continúa la conversación. Un `viajeId` válido nunca se escribe y la liquidación queda sin timbrar.

Consecuencia: el chofer no recibe su complemento de pago, el contralor ve el viaje "en proceso" sin explicación, y el error es silencioso: el usuario solo ve que la conversación "se quedó en nada".

Causa probable: se retorna `message` apenas el stream termina, sin rechazar cuando `finish_reason === "length"` ni reintentar con mayor presupuesto de tokens.

### [ALTO] La deduplicación de herramientas se guía por el `id` de la llamada, no por el efecto ya ejecutado (REINCIDENTE)
`src/lib/llm/tool-executor.ts:47`

Escenario: el modelo responde con dos `tool_calls` que tienen `id` distinto pero el mismo `arguments.name = "registrar_pago"` y mismos argumentos resueltos en servidor (mismo `viajeId`, mismo `monto`). La deduplicación mantiene un `Map<id, resultado>` y ejecuta ambas llamadas porque los `id` son diferentes. El pago se inserta dos veces; la idempotencia del efecto queda rota.

Consecuencia: el chofer recibe dos depósitos o el SAT ve dos facturas para el mismo viaje; el contralor descubre el duplicado en la sala y pierde la confianza en el demo.

Causa probable: la llave del mapa es `tool_call.id` (que el modelo puede inventar) en lugar de una huella de la operación resuelta (por ejemplo, `operación + viajeId + monto + timestamp` ya persistida).

## Lo que revisé y está bien

- La definición de tools mantiene la regla estructural: `src/lib/likida/tools.ts` declara `properties: {}` en cada tool y el `tenantId`/`viajeId` se resuelve en el servidor desde el contexto. Revisé la definición de `registrar_pago`, `consultar_saldo` y `liquidar_viaje`; ninguna acepta argumentos del modelo. Esto cierra la inyección de prompt por datos de tool.
- `src/lib/llm/models.ts` expone la lista de modelos permitidos y la función de costo por modelo; la estructura permite saber el modelo antes de llamar, pero no obliga a usarlo después.
- El executor de tools (`src/lib/llm/tool-executor.ts`) valida que la tool exista en el registro antes de ejecutarla; un nombre desconocido se rechaza sin tocar el mundo exterior.

## Lo que NO alcancé a revisar

- Las pruebas unitarias del cliente que implementa el fallback. La ancla de 8+ exige "el camino con fallback tiene prueba"; no encontré un test que fuerce un fallo del proveedor primario y verifique el modelo real registrado en el costo.
- El detector de truncamiento: no pude confirmar si `generateStructured` reintenta cuando `finish_reason === "length"` o si el parser de `tool_calls` parciales tiene guardarraíl.
- La deduplicación por efecto: no recorrí el `tool-executor` completo para ver si hay una tabla de operaciones ya ejecutadas más abajo; la re-verificación del orquestador puede descartar la línea citada, pero el riesgo de doble efecto sigue descrito por el mecanismo actual.
- El cálculo exacto de tokens en el fallback: no alcancé a abrir el contador de costo en el proveedor secundario, así que la magnitud del error (20x) es un ejemplo, no una medición confirmada.