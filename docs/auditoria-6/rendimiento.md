# Rendimiento y costo — auditoría 6

**Nota: 4.5/10** (antes 6.5). Razón del movimiento: mirada más profunda destapó que el presupuesto de tiempo del peor caso excede el `maxDuration` real de la ruta y la falla es silenciosa; el promedio estaba inflado y la nota previa se anclaba por inercia, no por lectura de esta ronda.

Riesgo mayor hoy: una liquidación de WhatsApp con 50 viajes puede perderse sin reintento tras ~112 s de procesamiento contra un límite escrito de 60 s.

## Hallazgos

### [CRÍTICO] El peor caso de la cadena de liquidación excede `maxDuration` y el mensaje se pierde sin reintento
`src/app/api/liquidacion/route.ts:14` y `src/lib/likida/presupuesto.ts:210`
Escenario: entra un mensaje de WhatsApp con 50 viajes. La suma del peor caso es OCR 15 s + LLM 45 s (timeout de OpenRouter) + presupuesto 30 s + encolado 22 s = 112 s. La ruta declara `export const maxDuration = 60;` en `route.ts:14`. A los 60 s la plataforma corta la ejecución sin reintento ni callback; el contralor nunca recibe la preliquidación y el chofer no cobra.
Consecuencia: el contralor ve un silencio en la sala de demo; la flota pierde el trato por una falla que no deja traza.
Causa probable: el presupuesto se armó con promedios por eslabón y no se sumó el peor caso contra el límite escrito.

### [ALTO] N+1 en `repo.ts`: una consulta por cada viaje para obtener el operador
`src/lib/likida/repo.ts:88`
Escenario: una liquidación con 50 viajes dispara 50 consultas `getOperadorById` dentro del bucle de viajes. Con una latencia p95 de 200 ms por query, son 10 s solo en esa consulta; en peor caso con reintentos de pool llega a 20 s. El presupuesto de esa fase era 2 s.
Consecuencia: la liquidación se arrastra, el timeout global se alcanza antes y el costo de conexiones a Postgres sube; el contralor percibe lentitud incluso en el promedio.
Causa probable: no se precargaron los operadores con una sola consulta `IN (...)` antes del bucle.

### [ALTO] Modelo caro para clasificación de intención donde uno barato bastaba
`src/lib/llm/openrouter.ts:34`
Escenario: el clasificador de intención usa `anthropic/claude-3-opus` a $75 por millón de tokens de entrada. Para un mensaje de 2,000 tokens, cada interacción cuesta $0.15; `claude-3-haiku` resolvería la misma intención a $0.003. Con 500 mensajes de prueba al mes la diferencia es $75 vs $1.50.
Consecuencia: quema el margen operativo pre-revenue y encarece el costo por operación real que el contralor verá en la factura.
Causa probable: se eligió el modelo por percepción de calidad sin medir costo por operación con `costos.ts`.

### [MEDIO] Imagen de WhatsApp enviada a OCR sin redimensionar
`src/lib/intake/ocr.ts:21`
Escenario: una foto del viaje de 5 MB y 4000×3000 px se manda directo al proveedor OCR. El proveedor cobra por megapíxel y tarda 8 s; redimensionada a 1600 px tardaría 2 s y costaría 60% menos. Con 50 viajes y 3 fotos por viaje, el ahorro es de 150 imágenes × 6 s = 900 s de latencia evitada.
Consecuencia: cada viaje con imagen suma latencia innecesaria y costo al OCR; el mensaje se acerca al límite solo por no normalizar.
Causa probable: no hay un paso de normalización/compresión de imagen antes de llamar al OCR.

### [BAJO] Timeouts por eslabón no cubren la suma de la cadena y el job queda en cola fantasma
`src/lib/queue/bull.ts:25`
Escenario: cada eslabón (OCR, LLM, presupuesto) tiene `timeout: 30000` individual, pero tres reintentos de un eslabón pueden sumar 90 s. Como la ruta tiene `maxDuration = 60`, el job queda encolado, el worker lo marca como completado y el mensaje nunca se entrega al contralor.
Consecuencia: falla silenciosa en producción cuando la cola se encola; el equipo cree que se procesó porque el job aparece en `completed`.
Causa probable: timeouts configurados por eslabón sin un presupuesto global con dead-letter explícito.

## Lo que revisé y está bien
- `src/lib/likida/costos.ts:45` sí mide tokens por operación y guarda el costo en logs accesibles.
- `src/lib/queue/backoff.ts:12` aplica backoff exponencial con jitter en reintentos, evitando tormentas.
- `src/lib/llm/openrouter.ts:120` persiste modelo, tokens y costo en metadatos para auditoría posterior.
- `src/lib/likida/presupuesto.ts:180` valida que el total no exceda el límite de la flota y devuelve error temprano si excede.

## Lo que NO alcancé a revisar
- El flujo real de OCR con la librería de WhatsApp y si hay caché de imágenes por hash.
- La configuración de `maxDuration` en Vercel para todas las rutas de API, no solo liquidación.
- El uso de streaming o confirmación temprana al cliente de WhatsApp mientras se procesa.
- La capacidad de concurrencia de la cola y si hay límite de jobs activos por flota.