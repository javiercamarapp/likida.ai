# Rendimiento y costo — auditoría 18

**Nota: 4/10** (antes 6). Razón del movimiento: **mirada más profunda**. El
código no empeoró — la nota anterior estaba inflada porque midió el camino que
el propio repo modela: **UN mensaje**. `presupuesto_camino.test.ts` simula un
solo `processInbound` y ahí la cuenta cierra (la verifiqué a mano: 91.3s contra
120s, con 28.7s de holgura). Nadie había sumado nunca la ráfaga ni el cron, que
es donde `crearPresupuesto` deja de significar algo: el presupuesto es **por
mensaje** y el `maxDuration` es **por invocación**, y no hay ningún reloj que
una las dos cosas.

**El riesgo mayor hoy:** un fajo de seis fotos o más en un solo POST agota los
120s de la invocación, y el mensaje que quedaba a medias no se recupera nunca —
su `claim` de idempotencia sobrevive a la muerte del proceso y convierte cada
reintento del cron en un `return` inmediato que además **sella la fila como
procesada**. El comprobante se pierde, y la bandeja durable, las cartas muertas
y la alerta dicen que todo salió bien.

---

## La suma del peor caso

Costos unitarios: los del propio repo (`presupuesto.ts:37-51`) — 0.3s una
consulta, 1.5s un `sendText`, 2.5s un `sendDocument`, 0.5s una URL firmada.
"Techo" = el que el código impone (`acotada` → `TOPE_CONSULTA_MS` 8s +
`GRACIA_TOPE_MS` 1.5s = 9.5s; `SEND_TIMEOUT_MS` 10s; `DOWNLOAD_TIMEOUT_MS` 15s).

### Cadena 1 — webhook, un "listo" que cierra la liquidación (UN mensaje)

| # | Eslabón | Peor caso (s) | Fuente | Acum. |
|---|---|---|---|---|
| 1 | HMAC + `req.text()` | 0.1 | `webhook/whatsapp/route.ts:94-98` | 0.1 |
| 2 | `rateLimit` (Upstash REST) | 1.2 | `ratelimit.ts:161,200` | 1.3 |
| 3 | `guardarEventosPendientes` — 1 insert **sin techo** | 0.3 (sano) | `wa_pendientes.ts:48` | 1.6 |
| 4 | `estaApagado('global')` — **sin techo** | 0.3 (sano) | `interruptores.ts:67` | 1.9 |
| 5 | `reclamarPendiente` — **sin techo** | 0.3 (sano) | `wa_pendientes.ts:98` | 2.2 |
| 6 | `claimMessage` | 0.3 | `conv.ts:345` | 2.5 |
| — | **↑ TODO ESTO ES INVISIBLE PARA EL RELOJ** | | `processor.ts:444` arranca aquí | |
| 7 | 8 consultas de preámbulo (operador, viaje, aviso, consulta, talacha, conv, huérfanos) | 2.4 | `processor.ts:477-2052` | 4.9 |
| 8 | `esperarIntake` | `acotar(20)` = 20 | `processor.ts:2057` | 24.9 |
| 9 | `acquireViajeLock` | `acotar(12)` = 12 | `processor.ts:2090` | 36.9 |
| 10 | 4 consultas (viaje, tenant, conv, freno) | 1.2 | `processor.ts:2103-2133` | 38.1 |
| 11 | `runAgent` | `acotar(40)` = 40 | `processor.ts:2200` | 78.1 |
| 12 | `registrarCosto` + `vincularCostos` | 0.6 | `processor.ts:2226-2234` | 78.7 |
| 13 | Cierre tabulado (8 pasos restantes de `PASOS_CIERRE`) | 7.2 | `presupuesto.ts:41-51` | 85.9 |
| 14 | **`avisarCierreAlJefe` — 4 pasos NO tabulados** | 4.6 | `processor.ts:2523` · `avisar_cierre.ts:95,103,109,127` | 90.5 |
| 15 | `saveConversation` + `releaseViajeLock` | 0.8 | `presupuesto.ts:49-50` | **91.3** |

**Límite: 120s** (`webhook/whatsapp/route.ts:80`). **CABE**, con 28.7s de
holgura. Confirma el "~90.8s contra 120" que `presupuesto.ts:93-94` afirma.

Dos cosas que la tabla enseña y el archivo no dice:

- el cierre real (pasos 12-15) cuesta **13.2s** contra una reserva
  `MARGEN_CIERRE_MS` de **12s** (`presupuesto.ts:72`) — la reserva ya está
  rebasada en el caso *típico*, no en el peor;
- los pasos 1-6 (2.5s) corren **antes** de que el reloj exista.

### Cadena 2 — webhook, ráfaga de fotos (lo que el producto promete)

Techos que el código **concede a UNA foto**, con el viaje abierto:

| # | Eslabón | Techo concedido (s) | Fuente | Acum. |
|---|---|---|---|---|
| 1 | preámbulo + `intakeDelta` | 1.2 | `processor.ts:947` | 1.2 |
| 2 | `downloadMediaAsDataUrl` — **2 fetch en serie, fuera del reloj** | 15 + 15 = **30** | `meta/client.ts:10,455,461` | 31.2 |
| 3 | `extraerComprobante` (visión) | `reloj.senal(25_000)` = **25** | `processor.ts:1058` | 56.2 |
| 4 | `consultarCFDI` (no recibe la señal) | 4 | `intake/sat.ts:36` | 60.2 |
| 5 | `registrarCosto`, `getGastos`+ventana, `addGasto`, `await subida` | 1.2 | `processor.ts:1060-1270` | 61.4 |
| 6 | `intakeDelta(-1)` + resumen + `marcarPendienteProcesado` | 0.9 | `processor.ts:1551` · `webhook/whatsapp/route.ts:255` | **62.3** |

**Una foto se lleva un techo de 62.3s de una invocación de 120s.** El pool son
5 (`route.ts:43`), así que:

| Fotos en el POST | Olas (⌈N/5⌉) | Techo acumulado | Límite | ¿Cabe? |
|---|---|---|---|---|
| 5 | 1 | 62.3s | 120 | sí |
| **6** | **2** | **124.6s** | **120** | **NO** |
| 12 (`route.ts:16`: "una ráfaga de 12 fotos cabe holgada") | 3 | 186.9s | 120 | NO |
| 22 (`route.ts:21`: el caso que el pool vino a resolver) | 5 | 311.5s | 120 | NO |

La ola 2 arranca con **un presupuesto nuevo de 120s** — `crearPresupuesto`
(`processor.ts:444`) se llama por mensaje, sin recibir cuándo empezó la
invocación. Le concede a su foto los 30s de descarga y los 25s de visión
completos, con el reloj de Vercel en 62.

### Cadena 3 — el cron que "recupera" lo perdido

| Eslabón | Techo (s) | Fuente | Acum. |
|---|---|---|---|
| `urgentesVencidas` + `estaApagado` + `pendientesPorDrenar` | 1 | `cron/wa-pendientes/route.ts:57,68,77` | 1 |
| `processInbound` × **10, EN SERIE, sin un solo chequeo de reloj** | 10 × 62.3 = **623** | `cron/wa-pendientes/route.ts:37,78-90` | 624 |
| `cartasMuertas` + alerta | 1 | `:93` | **625** |

**Límite: 120s** (`cron/wa-pendientes/route.ts:17`). **NO CABE por 5×.** El
comentario del propio archivo (`:26-29`) dice "10 por corrida drenan un apagón
típico… sin acercarse al techo de 120s"; el número no está sostenido por
ninguna medición y las constantes del repo lo contradicen: `reloj.senal(25_000)`
sola, ×10, ya son 250s.

### Cadena 4 — copiloto de admin

| # | Eslabón | Techo (s) | Fuente | Acum. |
|---|---|---|---|---|
| 1 | `sesionSuperadmin` (auth + rol, sin techo declarado) | 0.6 | `admin/copiloto/puerta.ts:11` | 0.6 |
| 2 | `rateLimit` × 2 (minuto + día) | 2.4 | `admin/copiloto/route.ts:85,88` · `ratelimit.ts:161` | 3.0 |
| 3 | `ejecutarCopiloto` — `AbortController` de 40s | 40 | `copiloto.ts:197` | 43.0 |
| 4 | tools de la ronda en vuelo cuando aborta (`ctx.signal` no lo lee nadie) | 9.5 | `tool-executor.ts:28-49` | 52.5 |
| 5 | `crearIntent` — **sin `acotada`** | 0.3 (sano) | `copiloto/route.ts:189` · `copiloto-intents.ts:117` | 52.8 |
| 6 | `guardarIntercambioCopiloto` — **3 consultas en serie** | 3 × 9.5 = 28.5 | `copiloto/route.ts:201` · `copiloto-historial.ts:107,118,128` | **81.3** |
| 7 | `manda({t:'fin'})` | — | `copiloto/route.ts:214` | — |

**Límite: 60s** (`admin/copiloto/route.ts:47`). **NO CABE por 21.3s.** Basta
que *una* de las tres escrituras del historial pegue su techo (0.6+2.4+40+9.5
+0.3+0.3+0.3+9.5 = **62.9s**) para que Vercel corte el stream **antes** del
evento `fin`. La respuesta ya se pagó y el navegador se queda en el último
`t:'paso'`.

---

## Hallazgos

### [CRÍTICO] El presupuesto es por mensaje; el `maxDuration` es por invocación

`src/lib/likida/processor.ts:444` · `src/app/api/webhook/whatsapp/route.ts:43,249`
· `src/app/api/cron/wa-pendientes/route.ts:17,37,78-90`

`crearPresupuesto(PRESUPUESTO_WEBHOOK_MS)` se construye dentro de
`processInbound`, arrancando su reloj en `Date.now()` de **ese** mensaje. Los
dos llamadores procesan N mensajes en UNA invocación —`conPool(…, 5, …)` en el
webhook, un `for` en serie de `LOTE = 10` en el cron— y ninguno le pasa cuánto
lleva gastado la invocación. Cada mensaje se cree dueño de 120s.

**Escenario:** el chofer termina la ruta y manda su fajo de 8 fotos; Meta las
entrega en un POST. Ola 1 (fotos 1-5) consume hasta 62.3s de techos concedidos
(30s de descarga + 25s de visión + 4s de SAT + 3.3s de base). Ola 2 (fotos 6-8)
arranca en t=62.3 con un presupuesto nuevo de 120s y le concede a la foto 6 sus
25s de visión completos. **La cadena suma 124.6s contra un `maxDuration` de
120.** Vercel mata la invocación mientras las fotos 6-8 están en vuelo.

**Consecuencia:** las fotos 6, 7 y 8 no entran a la liquidación. Con el hallazgo
siguiente, no vuelven a entrar nunca. El chofer paga de su bolsa tres tickets
que sí mandó, y su liquidación sale con esa diferencia en su contra.

**Causa raíz probable:** la abstracción del presupuesto se diseñó para el caso
"un webhook = un mensaje" (`presupuesto.ts:6-18`) y sobrevivió intacta a la
llegada del pool y del cron, que son justo los dos que rompen esa premisa.

---

### [CRÍTICO] Un mensaje matado a media corrida queda envenenado por su propio claim

`src/lib/likida/processor.ts:420-424` · `src/lib/likida/conv.ts:343-353` ·
`src/app/api/cron/wa-pendientes/route.ts:80-90`

`processInbound` reclama el `waMessageId` en `wa_mensaje_procesado` en su
**primera línea**, antes de hacer nada. `wa_mensaje_procesado` no tiene lease ni
TTL: se purga a los 30 días (mig. 0072) y se borra solo por
`releaseMessageClaim`, que vive en el `catch` general y en cuatro `return`
tempranos. Una muerte por `maxDuration` no ejecuta ninguno de los dos.

**Escenario, encadenado al anterior:** la foto 7 muere a los 120s con su wamid
ya reclamado y su fila de `wa_evento_pendiente` con `procesado_en` en NULL.
Cinco minutos después el cron la vuelve a reclamar (`reclamarPendiente`, intentos
1→2) y llama `processInbound`. `claimMessage` devuelve `'duplicado'`, la función
hace `logger.info('wa.duplicate')` y **`return` sin lanzar**
(`processor.ts:421-424`). El cron interpreta ese retorno limpio como éxito y
ejecuta `marcarPendienteProcesado(claim.id)` (`cron/wa-pendientes/route.ts:83`): la fila queda
**sellada como procesada**. El OCR nunca corrió, el gasto nunca se insertó.

**Consecuencia:** la pérdida es definitiva y silenciosa. `cartasMuertas` cuenta
`intentos >= 5 AND procesado_en IS NULL` (`wa_pendientes.ts:132-137`), así que
la fila sellada nunca dispara la alerta; en el log solo hay un `wa.duplicate` de
nivel `info`, que es exactamente lo que se escribe cuando todo va bien. Es el
mismo final que el bloque de `presupuesto.ts:6-11` describe como "el peor final
posible", con el agravante de que ahora hay un mecanismo de recuperación
—`wa_evento_pendiente`, mig. 0119— que **afirma por escrito** que el mensaje se
procesó.

**Causa raíz probable:** la idempotencia (mig. 0002) se escribió contra el
reintento de Meta, donde "duplicado" sí significa "ya hecho". La bandeja durable
(0119) reusó el mismo `processInbound` sin distinguir "duplicado porque ya se
completó" de "duplicado porque yo mismo lo reclamé y me morí".

---

### [ALTO] El mutex del viaje sigue sin techo — y lo nombra el comentario de su propio arreglo

`src/lib/likida/conv.ts:426`

`presupuesto.ts:137-145` documenta el arreglo de la auditoría 8 con estas
palabras: *"`costos.ts`, `conv.ts` y `config.ts` llamaban a `supabaseAdmin()` en
crudo — ONCE de los trece pasos del cierre, **incluido el mutex del viaje** y la
barrera de ráfaga. Un cuelgue ahí no tenía techo y se comía los 120s de la
función entera."* En `conv.ts` hay 14 llamadas a Supabase; **trece pasan por
`acotada` y una no**: `admin.rpc('try_lock_viaje', …)`, la del mutex, la que el
comentario nombra. `releaseViajeLock` (`:615`), `intakeDelta` (`:489`) e
`intakePendientes` (`:525`) sí la tienen.

**Escenario:** el chofer escribe "listo". `processor.ts:2090` llama
`acquireViajeLock(viajeId, { maxWaitMs: reloj.acotar(12_000) })`. La RPC va a un
socket que acepta y calla; `fetch` hereda el default de undici, 300 000ms. El
chequeo `Date.now() - start >= maxWaitMs` (`conv.ts:450`) está **después** del
`await`, así que los 12s del `maxWaitMs` no se evalúan nunca. La cadena 1 sube
de 91.3s a **379s contra un `maxDuration` de 120**. Y como está dentro de un
`for (;;)`, cada vuelta puede volver a colgarse.

**Consecuencia:** el turno muere sin que se haya escrito nada (el mutex va antes
del agente), pero el mensaje queda envenenado por el hallazgo anterior: el
"listo" del chofer se pierde para siempre y él ve dos palomitas azules y ningún
cuadre.

**Causa raíz probable:** el arreglo se aplicó archivo por archivo con búsqueda
de `.from(`, y `.rpc(` en la misma línea que la asignación de `admin` se quedó
fuera de la rejilla.

---

### [ALTO] Nueve consultas del camino caliente siguen sin techo, y con una basta

`src/lib/likida/wa_pendientes.ts:48,80,98,114,122,133` ·
`src/lib/likida/interruptores.ts:67` · `src/lib/likida/avisar_cierre.ts:53-59` ·
`src/lib/likida/contactos.ts:55` · `src/lib/likida/consulta_chofer.ts`

El razonamiento de `TOPE_CONSULTA_MS` (`presupuesto.ts:91-95`) es explícito:
*"el peor caso sumado de la ruta son ~90.8s contra 120: cada consulta colgada
gasta `TOPE − 0.3`s de esa holgura, y con 8s la invocación sobrevive a TRES
colgadas."* Verifiqué la aritmética y es correcta — **para las consultas que
tienen el techo**. Sobre el camino de un "listo" que cierra hay al menos nueve
que no lo tienen:

| Consulta | Archivo:línea | Cuándo corre |
|---|---|---|
| `insert wa_evento_pendiente` | `wa_pendientes.ts:48` | **antes del 200**, una por mensaje |
| `update … intentos` (claim) | `wa_pendientes.ts:98` | al entrar al `after()` |
| `update … procesado_en` | `wa_pendientes.ts:114` | al salir |
| `select interruptor` | `interruptores.ts:67` | primera línea del `after()` |
| `rpc try_lock_viaje` | `conv.ts:426` | antes del agente (hallazgo anterior) |
| `select tenant` (teléfono del jefe) | `contactos.ts:55` | en el cierre |
| `select liquidacion` + `select viaje` | `avisar_cierre.ts:54,58` | en el cierre |

Cada una cae al default de undici: **300 000ms contra un `maxDuration` de 120.**
No sobrevive a una, mucho menos a tres.

**Escenario:** Supabase acepta la conexión y no contesta —el modo de falla que
`presupuesto.ts:82-84` dice haber medido en esta misma máquina—. La liquidación
YA está cerrada en la base y el PDF del operador ya salió; el proceso se cuelga
en `avisar_cierre.ts:54` mandándole el aviso al jefe. La invocación muere a los
120s. **Consecuencia:** `saveConversation` (`processor.ts:2550`) nunca corre, así
que el turno del asistente no queda en la conversación y el agente, en el
siguiente mensaje, contesta como si no hubiera cerrado nada. Cinco de esas nueve
consultas (`wa_pendientes.ts`, mig. 0119, 16-ago) son **posteriores** al arreglo
que declaró cerrado el hueco.

**Causa raíz probable:** `acotada` se exportó desde `presupuesto.ts` para que
"cualquier archivo lo importe sin volver a copiarlo" (`:143-144`), pero no hay
ninguna prueba ni regla de lint que exija que un `supabaseAdmin()` nuevo lo use
— a diferencia de `toLocaleString('es-MX')`, que sí tiene su prueba guardiana.

---

### [ALTO] `MARGEN_CIERRE_MS` ya está rebasado, y la prueba que debía atraparlo suma una tabla escrita a mano

`src/lib/likida/presupuesto.ts:29-32,37-54,72` ·
`src/lib/likida/presupuesto.test.ts:107-108` · `src/lib/likida/processor.ts:2523`

`PASOS_CIERRE` enumera 13 pasos y suma 8.9s; `MARGEN_CIERRE_MS` reserva 12s, y
el comentario promete el mecanismo: *"Meter un paso más al cierre sin ampliar el
margen deja de ser un descuido silencioso y pasa a ser una prueba en rojo."*
Pasó, y no se puso roja. `processor.ts:2523` llama `avisarCierreAlJefe`, que
añade **cuatro pasos de red** que la tabla no tiene:

| Paso añadido | Fuente | Costo unitario del propio repo |
|---|---|---|
| `telefonoJefeDe` | `avisar_cierre.ts:95` · `contactos.ts:55` | 0.3s |
| `resumenDeCierre` (2 consultas en paralelo) | `avisar_cierre.ts:53-59` | 0.3s |
| `sendText` del aviso | `avisar_cierre.ts:109` | 1.5s |
| `sendDocument` del PDF al jefe | `avisar_cierre.ts:127` | 2.5s |

**Escenario:** el cierre real cuesta **8.9 + 4.6 = 13.5s** contra una reserva de
12s. Sumado a un turno en que el agente use su techo (`acotar(40)`), la
invocación llega al cierre en t=78.7 con 41.3s de reloj y lo gasta en 13.2s
(cadena 1, pasos 12-15) — sobra, pero la reserva que el sistema *cree* tener ya
no existe: el `alcanza(COSTO_AGENTE_MS)` de `processor.ts:2176` lanza el agente
apoyándose en un `restante()` calculado con 12s apartados para un cierre que
cuesta 13.5s. Añádase una sola consulta lenta del cierre (9.5s por `acotada`) y
el PDF no sale.

**Consecuencia:** la liquidación queda cerrada en la base (irreversible por los
triggers 0036/0037) y el operador no recibe el documento. Es exactamente el
`pdf.no_entregado` que `presupuesto.ts:85-88` describe, salvo que el proceso
muere antes del `catch` y la línea de log tampoco se escribe.

`presupuesto.test.ts:107-108` asserta `COSTO_CIERRE_MS === sum(PASOS_CIERRE)` y
`MARGEN_CIERRE_MS >= COSTO_CIERRE_MS`. Las dos son ciertas sobre la tabla y
ninguna lee `processor.ts`. La prueba verifica que la tabla sea consistente
consigo misma, no que describa el cierre.

**Causa raíz probable:** una tabla mantenida a mano se presenta como verificable
porque tiene una prueba, pero la prueba solo cierra el circuito
tabla↔constante, nunca tabla↔código.

---

### [MEDIO] El único camino de LLM sin techo de salida es el del modelo caro

`src/lib/agents/run.ts:49-57` · `src/lib/llm/openrouter.ts:50,646` ·
`src/lib/llm/models.ts:53,144`

`runAgent` no pasa `maxTokens` ni `maxToolRounds`, así que el ciclo del cuadre
cae a `DEFAULT_MAX_TOKENS = 4000` y a `maxRounds = 6`. El rol `cuadre` es
`anthropic/claude-sonnet-5` con `reasoning: 'high'`, o sea $10 por millón de
salida (y $15 desde el 1-sep-2026, cuando venza el intro). **Todos** los demás
agentes del repo sí lo acotan a 900: `analista.ts:326,368`, `copiloto.ts:207,237`,
`redactor.ts:181`.

**Escenario:** un cuadre de 6 rondas con el techo lleno son 6 × 4,000 = 24,000
tokens de salida × $10/M = **$0.24 por liquidación en salida sola**, contra una
banda documentada de **$0.03–0.05 por liquidación completa** (`models.ts:17`,
repetida en `docs/escala-15k.md:227` y usada ahí para proyectar $360-600/mes a
12,000 liquidaciones). Del lado de la entrada, la medición del propio repo
(`openrouter.ts:672-676`) dice que una liquidación de 21 comprobantes reenvía
~72,000 tokens en 8 vueltas: a $2/M son **$0.144 más**, y la caché de prompt solo
cubre el bloque `system` (`openrouter.ts:689-693`) — lo que crece es la
conversación, que no se marca.

**Consecuencia:** el negocio va a cobrar por liquidación y la única cifra que
tiene para fijar precio es una banda de julio que su propio código puede exceder
un orden de magnitud en el caso que más importa (el fajo grande, que es el
cliente que más valor recibe). `docs/escala-15k.md:239` ya lo dice con todas sus
letras — *"los tokens del cuadre no están registrados"*—; lo que este hallazgo
añade es que el techo tampoco existe.

**Causa raíz probable:** `run.ts` se escribió antes que los tres agentes que sí
acotan, y ninguno de ellos volvió a pasar por él.

---

### [MEDIO] La bandeja durable inserta N veces en serie antes de contestarle a Meta

`src/lib/likida/wa_pendientes.ts:43-65` · `src/app/api/webhook/whatsapp/route.ts:182-196`

`guardarEventosPendientes` recorre los mensajes con un `for` y hace un
`insert` por vuelta, secuencial, sin `acotada`. Corre en la ruta **síncrona**,
antes del código de salida — es la premisa del diseño ("receive → PERSIST → 2xx
→ worker", `route.ts:166-180`) y por eso no se puede mover al `after()`.

**Escenario:** el fajo de 22 fotos llega en un POST. Son 22 viajes de red en
serie: **6.6s** con el costo unitario del repo (0.3s) antes de que Meta reciba
su 200. Si uno se cuelga, no hay techo: la respuesta se retrasa hasta que Vercel
mate la invocación a los 120s, y Meta reentrega el payload completo — que
vuelve a ejecutar los 22 inserts (dedupeados por PK, `:52`, pero pagados igual
en tiempo).

**Consecuencia:** el acuse a Meta escala linealmente con el tamaño del fajo justo
en el caso que el producto promete atender. No se pierde nada —la reentrega es
el diseño— pero el POST es O(N) sin cota, y ese N lo elige el chofer.

**Causa raíz probable:** un `insert` por fila para poder devolver
`filas[i].guardado` individualmente; un insert por lote con `select` de los
insertados daría lo mismo en un viaje.

---

### [MEDIO] El copiloto concede 40s al modelo y necesita 21.3s más de los que tiene

`src/app/api/admin/copiloto/route.ts:47,189,201` · `src/lib/agents/copiloto.ts:197`
· `src/lib/agents/copiloto-historial.ts:107,118,128` ·
`src/lib/agents/copiloto-intents.ts:117`

Ver la cadena 4 arriba: 81.3s de techos contra `maxDuration = 60`. El
`AbortController` de 40s (`copiloto.ts:197`) es el único tope de todo el POST y
no cubre nada de lo que va después: las tools de la ronda en vuelo (que no leen
`ctx.signal`, documentado en `tool-executor.ts:28-49`), `crearIntent` (sin
`acotada`) ni las **tres escrituras en serie** del historial.

**Escenario:** Javier pregunta "¿cómo va el negocio?". El modelo tarda 38s (dentro
de su tope). `guardarIntercambioCopiloto` hace tres consultas y una pega su techo
de 9.5s: 0.6 + 2.4 + 38 + 0.3 + 0.3 + 0.3 + 9.5 = 51.4s… con dos lentas, 60.9s.
Vercel corta el stream **antes** de `manda({t:'fin'})` (`route.ts:214`).

**Consecuencia:** la interfaz se queda pintando el último `t:'paso'` para
siempre, sin evento de error, y el turno ya se cobró (el `logger.info
('copiloto.costo')` de `:192` sí alcanzó a escribirse). El comentario de
`:196-197` —*"Si falla, la respuesta IGUAL sale — el historial es una
comodidad"*— es cierto para un `throw` y falso para un cuelgue: el `manda` está
después del `await`.

**Causa raíz probable:** el `try/catch` alrededor del historial protege contra el
error y no contra la latencia, y el único reloj del endpoint vive dentro del
motor en vez de en el borde.

---

### [BAJO] Un `maxDuration` de 600 contra un techo de plataforma verificado en 300

`src/app/api/cron/facturar/cola/route.ts:12` · `src/lib/likida/presupuesto.ts:181-183`
· `src/app/api/cron/facturar/route.ts:32,136`

La ruta declara `maxDuration = 600` argumentando que "QStash permite hasta 10 min
de timeout" y que "el techo de 300s de una invocación directa es justo lo que
esta cola existe para romper". QStash no extiende el límite de Vercel: espera
más, no deja correr más. Y el plan está verificado dos veces en el repo como
**pro, tope 300s** (`presupuesto.ts:181-183`, `webhook/whatsapp/route.ts:72-74`).

**Escenario:** el lote se procesa con `procesarLoteEnCola`, cuyo presupuesto es
`PRESUPUESTO_LOTE_MS = maxDuration * 1000` importado de **la otra ruta**
(`facturar/route.ts:136`, donde `maxDuration = 300`), y corta a los 150s
(`MARGEN_LOTE_MS`). O sea que el trabajo real nunca pasa de 150s y el 600 no
llega a doler hoy — pero el número escrito en la ruta no es el que la ruta
respeta, ni el que la plataforma puede conceder.

**Consecuencia:** quien suba `MARGEN_LOTE_MS` leyendo "tengo 600s" va a
dimensionar contra un presupuesto que no existe.

**Causa raíz probable:** el timeout del *cliente* (QStash) se anotó como si fuera
el del *servidor*.

---

## Lo que revisé y está bien

- **`acotada` y `TOPE_CONSULTA_MS`** (`presupuesto.ts:101-169`). Las dos capas
  —`abortSignal` para cancelar el socket de verdad, carrera contra temporizador
  como red— son correctas, y que el agotamiento entre por el mismo
  `{ data: null, error }` que un error de Postgres es la decisión que conserva la
  semántica probada de cada llamador. Los 8s están bien elegidos: 26× el costo
  típico. El problema no es el mecanismo, es su cobertura (ver ALTOs).
- **La sincronía `PRESUPUESTO_WEBHOOK_MS` ↔ `maxDuration`**
  (`presupuesto.test.ts:80-88`). Esta prueba sí **lee el archivo de la ruta** con
  una regex y compara. Es el único de los dos mecanismos de tabla que de verdad
  cierra el circuito con el código; el de `PASOS_CIERRE` debería copiarlo.
- **El camino de un solo "listo"**: lo sumé a mano y cabe con 28.7s de holgura
  (cadena 1). La afirmación de `presupuesto.ts:93-94` es correcta.
- **`conPool`** (`route.ts:52-62`): la razón del 5 está fundamentada en algo real
  (zxing-wasm es síncrono y bloquea el event loop, `:36-42`) y hay prueba de que
  el pool se llena y no degrada a serie (`route_pool.test.ts:136`). Lo que a esa
  prueba le falta es sumar el reloj, no la concurrencia.
- **`costoReal`** (`openrouter.ts:195-206`): preferir el costo que reporta el
  proveedor sobre la tabla es la decisión correcta y está justificada con una
  medición (la caché de prompt ahorrando 91.6% que la tabla no podía ver).
- **`costoPorModelo`** (`openrouter.ts:661-665`, consumido en
  `processor.ts:2222-2230`): una fila de `llm_costo` por modelo real cuando el
  ciclo cruzó de proveedor. Es la clase de contabilidad que casi nadie hace.
- **El loop-guard corta ANTES de gastar la ronda** (`openrouter.ts:792-794`): no
  se paga una ronda —ni se ejecuta una mutación— cuyo resultado nadie va a leer.
- **`llaveDeCache`** (`openrouter.ts:594-606`): el arreglo de la caché de tools
  sin parámetros está medido (3 ejecuciones, 0 aciertos → 1) y ataca justo la
  tool más cara del turno.
- **`traerTodo` y `docs/escala-15k.md` §6**: no lo reporto como hallazgo porque
  ya está mejor documentado de lo que yo podría hacerlo — fail-closed que lanza
  en vez de truncar, fecha de caducidad **calculable por función**, y las cuatro
  del camino más caliente ya movidas a RPC en la 0112 con prueba de equivalencia.
  Para el primer cliente: con `PAGINA = 1_000` (`pg.ts:45`) el dolor empieza a las
  **~5,000 filas de `gasto`** (5 viajes de red en serie por función, y el Resumen
  dispara varias en paralelo → >1.5s de servidor) y el corte duro está en
  **100,000** (`MAX_PAGINAS`, `pg.ts:48`), donde la pantalla del cliente pasa a
  su estado de error. Una flota de 30 unidades con 8 comprobantes por viaje y 2
  viajes por semana llega a 5,000 en **~2.6 meses** y a 100,000 en ~4.3 años.
- **La imagen sin redimensionar**: lo busqué y lo descarto. No hay resize en
  ningún lado (`meta/client.ts:451-470` manda el data-URL completo), pero la
  entrada está **medida** en 4,076 tokens contra 1,536 de salida
  (`.env.example:167-168`), y con la tarifa del modelo en producción la salida
  domina el costo. La palanca es el razonamiento del OCR
  (`openrouter.ts:233-270`), y ya está identificada, cuantificada (~50%) y
  deliberadamente apagada por una razón de calidad que comparto.
- **Corrección a un comentario**: `presupuesto.ts:66-70` afirma que
  `sendText`/`sendDocument` "siguen usando `fetch` pelado… el techo es el default
  de undici: 300s". Ya no es cierto: `meta/client.ts:17` define
  `SEND_TIMEOUT_MS = 10_000` y las cinco llamadas de envío lo pasan. El
  comentario sobreestima el riesgo, que es el lado seguro, pero desvía la
  atención de los nueve casos donde el riesgo sí sigue vivo.

## Lo que NO alcancé a revisar

- **No hay una sola latencia medida en el repo.** Todo lo de arriba son techos
  declarados por el código y los costos unitarios que `presupuesto.ts` se asigna
  a sí mismo (0.3s / 1.5s / 2.5s). No existe p50 ni p95 de la llamada de visión,
  de Supabase desde Vercel, ni del ciclo de cuadre. La columna "típico" es
  aritmética, no evidencia; la columna "techo" sí es verificable línea por línea.
- **Las ~31 páginas del `/dashboard` y las de `/admin`**: ninguna declara
  `maxDuration`, así que heredan el default de la plataforma — un número que no
  está escrito en ningún archivo del repo. Con `getSeriesKpiCards` y compañía
  encadenando varias lecturas, ese número importa y nadie lo ha fijado.
- **`/api/cron/facturar` y el adaptador de Playwright**
  (`facturacion/adaptadores/pagina_playwright.ts`): solo lo hojeé para el hallazgo
  BAJO. La cadena real de un timbrado en portal (arranque del navegador, sesión,
  navegación, descarga) contra `MARGEN_LOTE_MS = 150_000` no la sumé.
- **`/api/dashboard/chat` (el analista)**, `ingesta` y `archivo` — `maxDuration
  = 60` cada una, sin sumar. El analista comparte el chasis del copiloto, así que
  es probable que herede la cadena 4.
- **El arranque en frío**: `next` + `supabase-js` + `zxing-wasm` + el generador de
  PDF se inicializan dentro de los mismos 120s del webhook y no hay ninguna
  medición de cuánto cuesta esa inicialización en una instancia fría.
- **Nada de esto se ejecutó.** Sin `.env`, sin base, sin red hacia proveedores y
  con `npm run build` prohibido en esta corrida, todo se sostiene por lectura de
  código y por las constantes que el propio repo declara.
