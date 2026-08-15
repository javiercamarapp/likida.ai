# Sistema agéntico y orquestación — auditoría 8

**Nota: 5/10** (antes 6). Razón del movimiento: mirada más profunda — la nota previa estaba inflada por falta de lectura real del ciclo de vida; hoy se atacaron los puntos de muerte y aparecieron bordes sin cierre definido.

El riesgo mayor hoy: **un mensaje procesado parcialmente puede dejar la base con efecto duplicado o una confirmación que el humano nunca ve, porque el ciclo agéntico no distingue de forma determinística a quién responde ni qué hacer si muere a la mitad.**

## Hallazgos

### [CRÍTICO] El enrutador de salida usa el último emisor en lugar del rol destinatario; un veredicto del contralor puede llegar al chofer
`src/lib/likida/processor.ts:312`

Escenario: en una ráfaga del lote 204, el chofer envía «acepto viaje 1234» y, 2 segundos después, el contralor envía «autorizo viáticos $1,800». El procesador agrupa ambos y responde al último `from` de la ráfaga (el chofer). El chofer recibe el veredicto de autorización de viáticos que era para el contralor; el contralor no recibe confirmación de su autorización.

Consecuencia: el chofer ve una aprobación que no le corresponde y puede cobrar viáticos no decididos; el contralor cree que el sistema no registró su autorización y la reenvía, duplicando el registro.

Causa probable: la salida se enruta con `message.from` en lugar de un actor/rol explícito calculado por el flujo agéntico.

### [ALTO] Ciclo agéntico sin timeout deja el mutex tomado y el usuario nunca recibe su salida
`src/lib/agents/run.ts:143`

Escenario: el contralor pide «resumen de viajes de la semana». El LLM tarda >120 s (proveedor lento o reintento interno). `run.ts` no libera el mutex de `conv.ts` al colgarse. El siguiente mensaje «líquida viaje 1234» queda encolado indefinidamente. El usuario cierra, reenvía y, cuando el primer ciclo muere, se libera el mutex y el mensaje duplicado se procesa dos veces.

Consecuencia: el contralor no recibe salida en minutos, abandona y reintenta; al liberarse el mutex hay doble ejecución del cierre de lote, con líneas de pago duplicadas en base.

Causa probable: ausencia de `AbortSignal`/timeout en la llamada al modelo y de `finally` que libere el mutex.

### [ALTO] Reintento de cierre de lote sin idempotencia duplica el efecto
`cuadre/guardia.ts:88`

Escenario: `guardia.ts` envía el POST de cierre del lote 204 a `processor.ts`; hay timeout de red a 5 s. El reintento automático no incluye clave de idempotencia. El lote se procesa dos veces: cada viaje genera dos líneas de pago en base.

Consecuencia: el contralor ve en sala dos pagos por el mismo viaje; la base queda con efecto duplicado y la conciliación no cuadra.

Causa probable: reintento sin `Idempotency-Key` ni verificación de lote ya cerrado antes de persistir.

### [MEDIO] Prompt autoriza al modelo a narrar montos que deberían ser determinísticos
`src/lib/agents/prompts.ts:36`

Escenario: en cierre de viaje, el prompt dice «calcula el total de casetas y muéstralo». El modelo responde «total: $1,200» sin ejecutar la herramienta de cálculo. El total real es $1,340. El contralor ve $1,200, autoriza y liquida con 140 pesos de diferencia no detectados.

Consecuencia: el contralor toma decisión sobre una cifra narrada por el LLM, no calculada por el motor; error silencioso que puede acumularse en la liquidación.

Causa probable: el prompt no obliga a usar la herramienta determinística para montos; permite narración aritmética.

### [MEDIO] Barrera de ráfaga envía confirmación parcial sin informar del mensaje fallido
`conv.ts:22`

Escenario: llegan 5 mensajes en ráfaga para liquidar viajes. Se procesan 4; el quinto falla por validación de placas. `conv.ts` envía confirmación de los 4 exitosos («4 liquidaciones registradas») pero no notifica del quinto fallido. El usuario cree que los 5 entraron.

Consecuencia: una liquidación queda sin registrar en base y el contralor no lo sabe hasta que el chofer reclama; el ciclo no cierra con el humano.

Causa probable: la barrera de ráfaga agrega resultados y descarta errores sin emitir un reporte de fallos por lote.

## Lo que revisé y está bien

- `src/lib/agents/registry.ts:12` — el registro de agentes expone los agentes correctos y no hay colisión de nombres.
- `src/lib/likida/processor.ts:45` — el camino feliz de procesamiento de pago calcula correctamente el monto y persiste una línea por viaje.
- `startup.ts:18` — la inicialización arranca el mutex y la cola sin carreras evidentes.
- `presupuesto.ts:30` — el presupuesto compara contra el saldo disponible y no permite sobregiros en el caso probado.

## Lo que NO alcancé a revisar

- No pude verificar la trazabilidad completa de un mensaje desde WhatsApp hasta la persistencia: falta seguir `conv.ts` en el flujo real de entrada de la API.
- No revisé `cuadre/resumen.ts` en el escenario de cierre mensual con viajes anidados; el hallazgo de duplicado en `guardia.ts` no cubre ese archivo.
- No simulee la concurrencia real de dos mensajes simultáneos del mismo lote para confirmar si el mutex cubre también la escritura en base, no solo la cola de entrada.
- No inspeccioné `src/lib/agents/prompts.ts` completo: solo abrí la línea indicada; el resto del prompt puede tener más autorizaciones de narración.
- No verifiqué si los reintentos de `guardia.ts` usan `fetch` con `keepalive` o reintento por encima de la capa de transporte; el hallazgo se basa en la lógica visible.