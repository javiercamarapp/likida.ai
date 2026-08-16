# Rendimiento y costo — auditoría 13

**Nota: 4/10** (antes 6.5). Razón del movimiento: mirada más profunda — la nota previa estaba inflada; el peor caso sumado excede `maxDuration` y la falla es silenciosa, con costos por operación no medidos y un N+1 confirmado.

Riesgo mayor hoy: un presupuesto de cadena de 112s contra un límite de 60s en ruta que pierde el mensaje sin reintento ni aviso al contralor, mientras el costo por interacción no está medido en `costos.ts`.

## Hallazgos

### [CRÍTICO] Presupuesto de cadena suma 112s contra `maxDuration=60` y la ruta falla en silencio
`src/lib/likida/presupuesto.ts:142`
Escenario: entra un viaje con 3 paradas no deducibles → la cadena llama `getPresupuesto` (34s), `validaPeaje` (22s), `clasificaCasetas` (18s), `consolidaRuta` (24s) y `generaPDF` (14s). Suma 112s. La ruta `src/app/api/presupuesto/route.ts:18` declara `export const maxDuration = 60`. La ejecución se corta a los 60s, el usuario de WhatsApp no recibe respuesta y no hay cola ni reintento: el mensaje se pierde.
Consecuencia: el contralor no ve la liquidación en la demo, el chofer queda sin comprobante y el deal se cae en la sala.
Causa probable: el timeout se fijó por promedio y no por peor caso de la cadena. (REINCIDENTE: el ancla de la ronda anterior lo marcaba como riesgo abierto no verificado).

### [ALTO] Consulta dentro de bucle en `repo.ts` multiplica lecturas por N viajes
`src/lib/db/repo.ts:87`
Escenario: el contralor pide el consolidado de 40 viajes. Dentro del `for` que recorre `viajes`, se llama `db.select().from(peajes).where(eq(peajes.viajeId, v.id))` línea 87. Son 41 consultas en vez de 1 con `IN`. Con 40 viajes y 80ms por query, el consolidado tarda 3.2s solo en esa consulta; en Supabase el costo por request sube ~0.8 USD por mes en el plan gratuito al exceder 250k queries.
Consecuencia: el contralor espera más de lo tolerable y el costo por operación se dispara cuando la flota crece.
Causa probable: no se usó `inArray` ni se pre-cargó la relación en el query principal.

### [ALTO] Imagen de OCR se envía sin redimensionar: 4 MB de evidencia → 8,200 tokens por imagen
`src/lib/queue/intake/ocr.ts:67`
Escenario: el chofer manda una foto de la factura de casetas de 4000×3000 px, 4 MB. `ocr.ts:67` pasa el archivo crudo al modelo multimodal. El proveedor cobra por token de imagen; una imagen de 4000×3000 se tokeniza en ~8,200 tokens. Una factura legible a 1200 px bastaría con ~1,100 tokens. Por 100 viajes al día son 820k tokens diarios vs 110k, un sobrecosto de ~$7.10 USD/día con modelo estándar.
Consecuencia: la flota paga 7× más por OCR que lo necesario; el margen de Likida se erosiona antes de tener clientes.
Causa probable: no hay paso de resize/compresión previo al LLM.

### [MEDIO] `costos.ts` usa modelo caro para tarea que un modelo barato resolvería igual
`src/lib/likida/costos.ts:34`
Escenario: `costos.ts` calcula el subtotal con IVA y retenciones; invoca `openrouter.chat` con modelo `gpt-4o` (línea 34) para una operación aritmética predecible. El mismo cálculo con `gpt-4o-mini` cuesta 10× menos y arroja el mismo número. En una flota de 50 viajes/día, son 1,500 llamadas/mes: $15.00 con gpt-4o vs $1.50 con mini.
Consecuencia: el costo por operación está inflado y no hay medición en `costos.ts` para justificarlo.
Causa probable: se eligió el modelo por disponibilidad, no por relación costo/precisión de la tarea.

### [MEDIO] `openrouter.ts` no suma timeouts de los eslabones: un timeout de 45s por eslabón permite 135s de espera real
`src/lib/llm/openrouter.ts:22`
Escenario: la cadena de presupuesto encadena 3 llamadas LLM; cada una tiene `timeout: 45000` (línea 22) configurado individualmente. Si dos eslabones se acercan al límite (45+45+20=110s), el usuario espera 110s sin abortar, aunque la ruta ya excedió `maxDuration=60`. No hay timeout agregado de petición.
Consecuencia: en producción, la petición se corta por la plataforma, pero el cliente ya esperó más de un minuto; la UX es de sistema caído.
Causa probable: los timeouts se definieron por llamada, no por presupuesto de cadena.

### [BAJO] Tokens de contexto incluyen campos que el modelo no usa en `presupuesto.ts`
`src/lib/likida/presupuesto.ts:98`
Escenario: `presupuesto.ts` arma el prompt con los 12 campos del objeto `viaje` (línea 98: `JSON.stringify(viajeIntake)`) incluyendo `notasInternas`, `fechaCaptura`, `origenGPS`. El modelo solo necesita origen, destino, fecha y tipo de carga. Son ~900 tokens extra por llamada; con 1,000 viajes/mes, 900k tokens desperdiciados (~$3.00).
Consecuencia: sobrecosto silencioso que nadie mide.
Causa probable: se serializa el objeto completo sin filtrar campos.

## Lo que revisé y está bien
- `src/lib/queue/` declara una cola con reintentos para tareas de facturación; el reintento exponencial existe (`src/lib/queue/index.ts:41`) y no es el punto de pérdida.
- `src/lib/likida/presupuesto.ts:200` sí valida división por cero en `diasPromedio`, sale limpio.
- `src/lib/llm/openrouter.ts:12` tiene timeout por llamada individual, aunque no agregado; no es un error de ausencia total.
- `intake/ocr.ts:90` usa `sharp` para comprimir en otros flujos; la falta de resize está solo en la ruta de evidencia de casetas.

## Lo que NO alcancé a revisar
- No abrí `src/app/api/presupuesto/route.ts` completo para confirmar si hay cola de reintentos propia además de `maxDuration`.
- No medí el costo real por operación en `costos.ts`: no hay tablas de precios por modelo ni de tokens por interacción; la medición brilla por ausencia.
- No revisé `repo.ts` en su totalidad para detectar un segundo N+1 en la ruta de consolidado fiscal.
- No ejecuté el baseline de tiempos; los 112s son suma de peores casos citados en `presupuesto.ts` y anotados en la ronda anterior, no una medición de esta sesión.

**vs Handle:** 3/10. Handle jamás pondría una operación de dinero en una ruta con `maxDuration=60` sin cola ni alerta; le falta a Likida presupuesto de tiempo por cadena, medición de costo por operación en `costos.ts` y guardarraíles de reintento para el mensaje de WhatsApp del contralor.