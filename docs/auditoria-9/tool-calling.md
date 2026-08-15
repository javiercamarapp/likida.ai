# Tool calling — auditoría 9

**Nota: 6/10** (antes 6). Razón del movimiento: no subió ni bajó; la regla estructural de tools sin parámetros del modelo se mantiene, pero no hay evidencia de que el camino de fallback esté cubierto por pruebas unitarias, y siguen apareciendo puntos débiles de ejecución en la frontera herramienta/LLM. Me quedo en 6: el ancla de 8 exige “ninguna tool acepta datos del modelo” + “fallback con prueba”, y la segunda pata no está cerrada.

Riesgo mayor del rubro hoy: una herramienta que vuelve a ejecutarse porque la deduplicación mira el `id` de llamada y no el efecto que la tool produce; con un retry del proveedor, eso imprime un doble registro delante del contralor en estado de qué silencioso.

## Hallazgos

### [ALTO] El fallback de proveedor no persiste el modelo real en la contabilidad de costos
`src/lib/llm/openrouter.ts:104`
Escenario: la salida sale con un modelo primario (`openai/gpt-4o-mini`), el provider `openrouter` responde 503 en el primer intento y el fallback ejecuta en modo `anthropic/claude-3.5-haiku`. El resultado vuelve a la función `generateStructured` con el nombre del modelo original (`gpt-4o-mini`) y el `usage` del proveedor secundario. Eso inventó un costo parcial: la operación es de `H` tokens de *Claude* pero el acumulador suma contra `gpt-4o-mini`; si el producto calcula el costo por modelo, la cifra del dashboard no puede ser cierta.
Consecuencia: el contralor no ve $ correcto para el demo; el costo por viaje se imputa a un modelo que no ejecutó la transacción y el resto del equipo no puede distinguir qué proveedor salió caro/barato. La nota 6 no baja solo porque la inducción no decide sobre dinero, pero la atribución de costos es parte del contrato de este rubro.
Causa probable: en el `catch` se conserva `model` de la llamada original y no se reasigna con la respuesta real del `fallback`.

### [ALTO] Una respuesta truncada por `max_tokens` se trata como respuesta completa
`src/lib/llm/openrouter.ts:158`
Escenario: `samePath` con `max_tokens: 80`; el modelo responde con dos `tool_calls`, pero `finish_reason = "length"`. El código comprueba `message.tool_calls` y no comprueba `finish_reason`, por lo que la CPU de asistentes inserta el mensaje en el historial, se ejecuta la primera tool (p. ej. `registrar_evento(viajeId: "vj-7")`) y la segunda tool queda fuera, sin replicarse. El secondary tiende a que el efacto que el modelo pedi es la mitad, pero para el sistema la iteración está completa. El `loop-guard` no entra porque el guard no distingue “terminó” de “no usó todo”.
Consecuencia: un operación de un viaje se registra sin una de sus actividades; el contralor ve en la demo una terminal que no avanzó y el resto de la acción se pierde. El flujo trata el silencio del modelo como “sin tool calls” y sigue el flujo fragmentado.
Causa probable: se valida la presencia de `tool_calls` como “todavía no termina” y no se valida que la razón final sea `stop`/`tool_calls`.

### [ALTO] La deduplicación de herramientas se guía por el `id` de la llamada y no por el efecto ejecutado
`src/lib/llm/tool-executor.ts:71`
Escenario: el modelo envía `gastar_viaje` una vez con `call.id="call_abc"`; el provider cuelga desp ses de ejecutar la tool. En el reintento vuelve a ejecutarse la misma tool física pero con id `call_def`; la caché de herramientas almacena el `call_id` (`call_abc`) y no encuentra `call_def`, así que vuelve a ejecutar el efecto. En el ledger se choca `vj1` y `vj2` para el mismo viaje, y se escribe un monto según el que llegó en los casos idénticos. Lo que el sistema usa es único: un universo con el mismo `viajeId` está duplicado.
Consecuencia: el contralor ve fácilmente un mismo viaje liquidador dos veces; en la demo se acusará un cargo falso y el dato de quién pertenece al viaje queda ambiguo porque el procesado es el que repite la ejecución de la herramienta. Es el “efecto duplicado” por el que el ancla baja la nota en este rubro.
Causa probable: la memoria dedup esta clave única de chiamada, no de `(tool_name + canonical args)`; reintencionados produce dos efectos reales aunque la llamada tenga IDs distintos.

## Lo que revisé y está bien

- En `src/lib/likida/tools.ts` la regla de fondo está respetada: las tools se declaran sin parámetros dirigibles desde el modelo; `properties: {}` obliga al modelo a decidir solo *cuándo* invocar, no con qué datos. `tenantId`/`viajeId` no entran por argumentos del modelo, sino por contexto resuelto en servidor. Esto cierra la inyección de prompt por argumento de tool.
El hallazgo potencial “validar mejor argumentos” no es aplicable: no hay argumentos que validar.

- `src/lib/llm/openrouter.ts`: la estructura de `generateWithTools` llama a `generateStructured` y para a una sola vía: si la respuesta del modelo no incluye `tool_calls`, no se pasa un executor (cuando la condición no lleva herramientas disponibles). Ese camino no abre una segunda llamada duplicada en el flujo básico.

## Lo que NO alcancé a revisar

- `src/lib/llm/models.ts` completo: no tenía forma de identificar el mapeo exacto de alias de proveedor y cómo se elige el modelo de fallback hay titular; puede afectar el assegnation de costes.
- El cliente real de pruebas (unit tests) del camino con fallback: no hay evidencia de que exista un test que provoque 503 en el proveedor primario y garantice la atribución correcta en el resultado.
- La ejecución real de `tool-executor.ts` con un simulacro de `stale` tras la primera tool (no llegué a simular una llamada que fuerce el retry del proveedor).
- Diferentes caminos de `generateStructured` que no pasan por la feature principal, incluyendo el caso en se caiga la API y retome con el `request` del fallback; no verifiqu la assignación de `tokens` final.

Sin lo anterior, el 6 es doctrinal, no podré subir a 8 sin un test que lea que la demo soporta el fallback con la atribución correcta; tampoco subiré sin verificar que `tool-executor` evita el doble efecto en el caso de reintento.