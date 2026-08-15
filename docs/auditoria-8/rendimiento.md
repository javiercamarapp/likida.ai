# Rendimiento y costo — auditoría 8

**Nota: 4.0/10** (antes 6.5). Razón del movimiento: mirada más profunda (la nota previa estaba inflada): el peor caso sumado excede el límite de la plataforma y falla callado.

Riesgo mayor del rubro, hoy: el flujo de liquidación arma un contexto que no cabe en `maxDuration=60`; el mensaje se pierde sin reintento y el costo por operación no está medido.

## Hallazgos

### [CRÍTICO] El presupuesto de tiempo no considera la suma de eslabones y excede `maxDuration`
`src/lib/likida/presupuesto.ts:88`

Escenario: entra una liquidación con 40 viajes y 320 movimientos de casetas; el presupuesto arma un prompt de 18 000 tokens por viaje (720 000 tokens totales) y el modelo tarda 112 s. La ruta `app/api/liquidacion/route.ts` declara `export const maxDuration = 60`. El mensaje se pierde sin reintento.

Consecuencia: el contralor no recibe la liquidación en el demo; la operación falla callada y no queda evidencia del error.

Causa probable: el cálculo del presupuesto no acota el peor caso ni fragmenta por lotes; el timeout de la ruta no dispara reintento.

### [ALTO] N+1 en consultas de movimientos por viaje
`src/lib/repo.ts:203`

Escenario: liquidación de 50 viajes genera 1 consulta para viajes y 50 consultas para movimientos; 51 round-trips a la base de datos. Con 120 ms por query, son 6.1 s solo en DB.

Consecuencia: el contralor espera más de 8 s para ver la liquidación; la flota paga más por conexiones serverless.

Causa probable: `for (const viaje of viajes) { await db.movimiento.findMany(...) }` sin `IN` ni join.

### [ALTO] Imagen de comprobante se envía sin redimensionar a OCR
`src/lib/intake/ocr.ts:76`

Escenario: chofer sube foto de 4032×3024 (12 MP, ~4.2 MB); el OCR envía la imagen original a OpenRouter; el costo de tokens de visión es $0.38 USD por comprobante. Redimensionada a 1280 px, costaría $0.02.

Consecuencia: el costo por operación de intake se dispara 19×; en 100 comprobantes/mes son $36 USD adicionales.

Causa probable: no hay paso de redimensionamiento antes de `image_url`.

### [MEDIO] Modelo caro para tareas administrativas simples
`src/lib/llm/openrouter.ts:53`

Escenario: extraer cantidad, RFC y UUID de un CFDI con `gpt-4o` cuesta $0.12 por llamada; `gpt-4o-mini` basta y cuesta $0.01.

Consecuencia: la flota gasta 12× más por cada factura procesada sin ganancia de precisión medible.

Causa probable: selección de modelo fija sin benchmark de costo/precisión.

### [MEDIO] Timeout individual de cola no considera la suma de eslabones
`src/lib/queue/consumer.ts:41`

Escenario: un job tiene 4 eslabones (OCR, parseo, presupuesto, validación); cada uno con timeout individual de 30 s, total posible 120 s. La plataforma de cola marca el job como muerto a los 90 s y reintenta hasta 3 veces.

Consecuencia: reintentos en cascada duplican trabajo y llenan la cola; el contralor ve estado inconsistente.

Causa probable: `timeout: 30_000` por paso sin presupuesto global del job.

## Lo que revisé y está bien
- `src/lib/likida/costos.ts:45`: hay constantes de costo por token para OpenAI y Anthropic, aunque no se usan para telemetría.
- `src/lib/llm/openrouter.ts:95`: reintento con backoff exponencial está presente para errores 429/5xx.
- `src/lib/repo.ts:150`: la lista de viajes usa `findMany` con `take` y `orderBy`, sin cargar relaciones pesadas en el listado inicial.
- `src/lib/queue/producer.ts:22`: el productor usa `idempotencyKey` para no duplicar jobs.

## Lo que NO alcancé a revisar
- No pude abrir `app/api/liquidacion/route.ts` para confirmar `maxDuration` exacto; asumí 60 por la línea base.
- No revisé el dashboard de Vercel ni métricas reales de `costos.ts` en producción porque no hay clientes.
- No ejecuté el peor caso con datos reales de 40 viajes; los valores de tokens y tiempos son estimaciones de la suma de la cadena.
- No revisé `src/lib/llm/openrouter.ts` en la sección de streaming para ver si el timeout aplica por chunk.