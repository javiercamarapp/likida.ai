# Rendimiento y costo — auditoría 18 · continuación 3

**Nota: 4/10** (antes 3). Razón del movimiento: *se atacó y subió*.

El PR #38 cerró de verdad el CRÍTICO que la ronda 18 nombró —el presupuesto ya
es **por invocación** y no por mensaje (`presupuesto.ts:237`)—, le puso techo al
mutex del viaje, convirtió la bandeja durable en **un** viaje de red, bajó el
`maxDuration` mentiroso de la cola de 600 a 300 y le puso freno y fila de costo
a la sonda de visión. Son nueve arreglos verificados abriendo el archivo. Lo que
impide pasar de 4 es que **los tres CRÍTICOS del piloto de visión están intactos
línea por línea**: `piloto_vision.ts:364` sigue sin `signal`, sus techos siguen
sumando **625.5 s** contra un `maxDuration` de **300**, y `agente.ts:260` sigue
volando ocho tickets en serie sin consultar el reloj ni una vez. El ancla del
rubro es explícita: *4 o menos si el peor caso excede el límite y falla callado*.

**El riesgo mayor hoy:** el presupuesto por invocación ordenó el trabajo NUEVO,
pero **nadie acotó el cierre**: los 18 pasos que `presupuesto.ts:39-62` enumera
suman **173.5 s** de techos declarados contra una reserva de **17 s** y contra
una invocación entera de **120 s** — y ahora que el claim se retoma a los 150 s,
una invocación que muera ahí **vuelve a pagar el turno de agente completo**.

---

## Los techos, sumados a mano

| Cadena | Suma del peor caso | Límite escrito | ¿Cabe? |
|---|---|---|---|
| **A** — un vuelo del piloto de visión, UN ticket | **625.5 s** (sin contar el modelo, que no tiene techo) | 300 s (`cron/facturar/route.ts:33`) | **NO — 2.1×** |
| **B** — corrida del cron con 8 tickets pilotables | 8 × 625.5 = **5,004 s**; 112 llamadas de visión ÷ 300 s = **2.68 s por llamada** | 300 s | **NO — 16.7×** |
| **C** — el CIERRE del turno de WhatsApp (18 pasos de `PASOS_CIERRE`) | 13 × 9.5 s + 5 × 10 s = **173.5 s** | 17 s de reserva (`MARGEN_CIERRE_MS`) / 120 s de invocación | **NO — 10.2× la reserva, 1.45× la invocación** |
| **D** — cron `wa-pendientes`, lote de 10 | trabajo acotado a **103 s** por el reloj ✅, pero 10 `reclamarPendiente` + 10 `anotarFallo` = **190 s** de techo fuera del reloj | 120 s | **NO por los eslabones que el reloj no ve** |
| **E** — `/dashboard/combustible-casetas` con el tenant demo de 5k | **98 viajes PostgREST en serie**, ninguno con techo (`traerTodo` no lleva `acotada`); 96,118 de 100,000 filas del techo de `traerTodo` = **96.1 %** | ninguno: la página no declara `maxDuration` | **el número no existe** |
| **F** — `/api/dashboard/chat` | 40 s de analista + 3 escrituras de costo (9.5 c/u) + `guardarIntercambio` (9.5) + la puerta de auth **sin techo** | 60 s (`chat/route.ts:28`) | **NO** |
| **G** — `/api/admin/copiloto` | 40 modelo + 5 intents + 8 historial = **53 s** ✅ | 60 s | **SÍ** (M23 lo arregló) |
| **H** — un vuelo bueno del piloto por hora, indefinidamente | **$0.09–$0.15** × 24 = **$21/día** · **~$634/mes** por UNA flota | banda de precio del repo: **$0.03–$0.05 por liquidación completa** (`models.ts:17`) | **NO — 2–5 liquidaciones enteras por vuelo, repetido 24×/día** |
| **I** — un turno de cuadre, techo declarado | 6 rondas × 4,000 tok de salida × $10/M = **$0.24** + entrada ≈ **$0.34** | la misma banda de $0.03–$0.05 | **NO — 7–11×, y sin tope diario** |

Fuentes de los unitarios: `TOPE_CONSULTA_MS` 8,000 + `GRACIA_TOPE_MS` 1,500 =
**9.5 s** por consulta (`presupuesto.ts:113,116`); `SEND_TIMEOUT_MS` = **10 s**
(`meta/client.ts:17`); `PAGINA`=1,000 y `MAX_PAGINAS`=100 (`pg.ts:45,48`);
`maxTokensCuadre()`=4,000 y `maxRondasCuadre()`=6 (`agents/run.ts:32,38`);
precio `anthropic/claude-sonnet-5` = [2, 10] (`openrouter.ts:175`, intro vigente
hasta el 31-ago — faltan **nueve días** para el +50 %).

---

## Verificación de los abiertos de la pasada anterior

Uno por uno, abriendo el archivo.

| Hallazgo (c2 / ronda 18) | Estado | Verificación |
|---|---|---|
| CRÍTICO — 625 s de techos del piloto contra `maxDuration` 300 | **REINCIDENTE** | Re-sumado: `TOPE_LECTURA_MS` 3,000 (`pagina_playwright.ts:118`) + 1.5 = 4.5 · captura 2 disparos × (10,000+1.5) = 23 (`:121,738,752`) · `uno()` 4.5 + acción 9.5 = 14 (`:672,681,686`) → **41.5 s/paso** × `PASOS_MAXIMOS` 14 (`piloto_vision.ts:58,138`) = 581 + `abrir` 21.5 + captura final 23 = **625.5 s**. `MARGEN_LOTE_MS` sigue en 150,000 (`cron/facturar/route.ts:166`), dimensionado sobre «~147 s el peor caso de UNA sesión» del adaptador ESCRITO. |
| CRÍTICO — la llamada de visión sin `signal` | **REINCIDENTE** | `piloto_vision.ts:364` sigue siendo `const { data } = await generateStructured<AccionPiloto>({ role, system, messages, schema, images, maxTokens, temperature })` — **ni `signal`**. `getClient()` (`openrouter.ts:23`) no pasa `timeout` ni `maxRetries`; verificado en el paquete: `OpenAI.DEFAULT_TIMEOUT = 600000` y `maxRetries ?? 2` (`node_modules/openai/client.js:747,173`). `generateStructured` encadena hasta **cuatro** `attempt` (`:523,531,542,549`). Es el ÚNICO de los tres llamadores sin techo: el OCR pasa `reloj.senal(25_000)` (`processor.ts:965,1242`), la sonda pasa `AbortSignal.timeout(45_000)` (`ingesta/route.ts:79`) y el redactor `AbortSignal.timeout(30_000)`. |
| CRÍTICO — el ticket del piloto no sale nunca de la cola | **REINCIDENTE** | `agente.ts:274` sigue siendo `incluido: r.ok && (modo === 'ensayo' || Boolean(r.cfdiUuid))`; `al_vuelo.ts:492` sigue siendo `if (!p.incluido || !p.cfdiUuid)`; la consulta de la cola sigue en `.is('cfdi_uuid', null).is('autofactura_bloqueada_en', null)` (`al_vuelo.ts:664-665`) y **no hay columna de intentos ni tope** en ella. |
| ALTO — el gasto del piloto no se registra en ningún lado | **REINCIDENTE** | `grep -rn "registrarCosto\|llm_costo" src/lib/likida/facturacion/ src/app/api/cron/facturar/` → **cero resultados**. `/admin/consumo` sigue leyendo exactamente dos fuentes (`admin/consumo.ts:10-13`). |
| ALTO — 20 de 37 comercios dejan de avisarle al encargado | **REINCIDENTE** | Ejecutado contra el código real: `COMERCIOS` = 37, `PORTALES_CONOCIDOS` = **1** (`capufe`), `COMERCIOS_PILOTABLES` = **20** (10 sin `requiereCuenta`). `avisar.ts:68` sigue usando `portalesOperables()` como `sabeOperarlo`. |
| ALTO — `resolverCuentaOficina` en el camino caliente sin `acotada` | **CERRADO en el techo, REINCIDENTE en la posición** | `contactos.ts:58` ahora es `acotada(...)` y hay prueba guardiana (`acotada_guardiana.test.ts` lista `contactos.ts`). El techo pasó de 300,000 ms a 9,500. Sigue corriendo para **todo texto** de chofer (`processor.ts:847`). |
| ALTO — el mutex del viaje sin techo | **CERRADO** | `conv.ts:547`: `acotada(admin.rpc('try_lock_viaje', …), 'acquireViajeLock')`. |
| ALTO — nueve/diez consultas del camino caliente sin techo | **CERRADO en 6 archivos, REINCIDENTE en 4** | `acotada_guardiana.test.ts` cuenta `.from(`/`.rpc(` contra `acotada(` en `wa_pendientes, avisar_cierre, conv, interruptores, contactos, consulta_chofer`. **Fuera de la lista y con consultas sin techo:** `oficina_wa.ts` (5 consultas / 2 topes), `talacha_wa.ts` (9 / 5), `processor.ts` (5 / 2), `costos.ts` (5 / 4). |
| ALTO — `MARGEN_CIERRE_MS` ya rebasado | **REINCIDENTE, ahora con el número** | Ver hallazgo abajo: **173.5 s contra 17**. |
| CRÍTICO (r18) — presupuesto por mensaje vs `maxDuration` por invocación | **CERRADO** | `crearPresupuesto(totalMs, reloj, inicio)` (`presupuesto.ts:237`); `restante()` descuenta desde el inicio de LA INVOCACIÓN. Los dos llamadores lo pasan: webhook `route.ts:103,274` y cron `wa-pendientes/route.ts:47,107`. Sin presupuesto mínimo (`COSTO_MINIMO_TURNO_MS` 15,000) el turno no arranca (`processor.ts:645`). |
| CRÍTICO (r18) — mensaje matado a media corrida, envenenado por su claim | **CERRADO** | Mig. 0149 `completado_en`; `LEASE_CLAIM_MS = PRESUPUESTO_WEBHOOK_MS + 30_000` = **150,000 ms** (`conv.ts:347`); el huérfano se retoma con UPDATE anclado (`conv.ts:389-401`). |
| MEDIO — la bandeja durable inserta N veces en serie antes del 200 | **CERRADO** | `wa_pendientes.ts:54-56`: **un** `upsert` del lote con `ignoreDuplicates`, envuelto en `acotada`. 22 fotos pasaron de 22 viajes (6.6 s) a **uno** (9.5 s de techo). |
| MEDIO — el camino de LLM sin techo de salida es el del modelo caro | **CERRADO en la declaración** | `run.ts:76-77`: `maxTokens: maxTokensCuadre()` (4,000) y `maxToolRounds: maxRondasCuadre()` (6), movibles por env. Mismos valores que el default mudo — se declara, no se baja. |
| MEDIO — el copiloto necesita 21.3 s más de los que tiene | **CERRADO** | `admin/copiloto/route.ts:87-94`: presupuesto de borde 40 + 5 + 8 = **53 s** contra `maxDuration = 60`, con `PLAZO_INTENTS_MS` y `plazoHistorialMs()` explícitos. |
| BAJO — `maxDuration = 600` de la cola contra un techo verificado de 300 | **CERRADO** | `cron/facturar/cola/route.ts:19` = **300**, y `cola/route.test.ts` mantiene iguales los dos literales. |
| MEDIO — el analista con timeout literal de 35 s y `tenant` sin `acotada` | **REINCIDENTE, sin una línea de cambio** | `oficina_wa.ts:159` sigue siendo `await supabaseAdmin().from('tenant')…` **sin `acotada`**, y `:166` sigue siendo `timeoutMs: 35_000` literal, no `reloj.acotar(35_000)`. Alcanzable desde `processor.ts:872` cuando el dueño-que-maneja escribe sin viaje abierto. |
| MEDIO — loop-guard del piloto de un solo paso de memoria | **REINCIDENTE** | `piloto_vision.ts:169-171` sigue comparando `firma === anterior`. |
| MEDIO — 15 capturas `fullPage` sin tope de dimensión ni caché de prompt | **REINCIDENTE** | `pagina_playwright.ts:729` sigue con `capturaCompleta ?? true`; `MAX_CAPTURA_B64` sigue en 950,000 (`:512`). El `cache_control` de `openrouter.ts:739-742` está en `generateWithTools` y **solo** cuando `/anthropic\//` casa: `generateStructured` —por donde va el piloto— no lo pone nunca. |
| Nuevos del delta que sí bajaron costo | **CERRADOS** | `52ad486`: la sonda tiene `rateLimit` 10/min por usuario, tope diario de **$1/tenant** que falla cerrado, y `registrarCosto` con el modelo real (`ingesta/route.ts:46,68,82`). `d1d8ebd`: `faseDeModelo` solo escala desde `cuadre` (`costos.ts:108-111`) — el tope de $1/día del chat vuelve a existir con un Opus. `be260a7`: el `PartialExecutionError` arrastra el costo de la primera vuelta. |

---

## Hallazgos

### [ALTO] El cierre del turno son 173.5 s de techos declarados contra una reserva de 17 s — y ahora que el claim se retoma, rebasarlo cuesta el turno de agente DOS veces

`src/lib/likida/presupuesto.ts:39-62,84,113,116` · `src/lib/meta/client.ts:17` ·
`src/lib/likida/conv.ts:347` · `src/lib/likida/processor.ts:678-682`

`PASOS_CIERRE` es una tabla de **18 pasos** con su `archivo:línea`, y
`presupuesto.test.ts` compara su suma —14.0 s con costos *típicos*— contra
`MARGEN_CIERRE_MS = 17_000`. Esa prueba compara **el típico contra la reserva**;
nadie ha sumado los **techos**. Sumados:

| Clase de paso | Cuántos | Techo unitario | Fuente | Suma |
|---|---|---|---|---|
| base / storage (`registrarCosto`, `vincularCostos`, `cuadrarDesdeDB`, 3 × `registrarCostoWhatsApp`, `getGastos`, 2 × `createSignedUrl`, `telefonoParaDineroDe`, `resumenDeCierre`, `saveConversation`, `releaseViajeLock`) | **13** | 8,000 + 1,500 = **9.5 s** | `TOPE_CONSULTA_MS` + `GRACIA_TOPE_MS` (`presupuesto.ts:113,116`) | **123.5 s** |
| envíos (3 × `sendText`, 2 × `sendDocument`) | **5** | **10 s** | `SEND_TIMEOUT_MS` (`meta/client.ts:17`) | **50 s** |
| | | | **TOTAL** | **173.5 s** |

**173.5 s contra la reserva de 17 s (10.2×) y contra el `maxDuration = 120` de
la invocación entera (1.45×).** El presupuesto no lo ve: `restante()` solo
descuenta lo transcurrido y solo tres eslabones piden por él
(`reloj.acotar(20_000)`, `acotar(12_000)`, `acotar(40_000)`). Después de
`runAgent` **ningún paso consulta el reloj** — `alcanza()` no aparece ni una vez
en el cierre.

**Escenario:** tres consultas del cierre agotan su tope (9.5 × 3 = 28.5 s) y un
`sendDocument` el suyo (10 s). El cierre lleva 38.5 s de los 17 reservados, la
invocación se pasa de 120 y Vercel la mata con el PDF **ya generado y ya subido
a storage**. Y aquí está lo nuevo: `procesarTurno` termina, pero
`completarMessageClaim` (`processor.ts:681`) es la línea **siguiente** y no
corre. A los `LEASE_CLAIM_MS` = **150 s** (`conv.ts:347`) el claim se declara
huérfano, `claimMessage` lo RETOMA y devuelve `'nuevo'`, y el turno se corre
entero otra vez: `runAgent` completo, con su modelo caro.

**Consecuencia:** el operador espera un PDF que ya existe y nunca recibe, y la
flota paga el turno de cuadre **dos veces** por el mismo mensaje. El retome de
C5 —que es un buen arreglo— convirtió una pérdida silenciosa en un cobro doble
silencioso, porque nada del cierre está acotado por presupuesto.

**Causa raíz probable:** `MARGEN_CIERRE_MS` se dimensionó contra el costo
*típico* de los pasos (0.3 s una consulta, 1.5 s un `sendText`) y su prueba
guardiana compara esa misma tabla típica consigo misma; el techo de cada paso
vive en otro archivo y nunca entró en la suma.

---

### [ALTO] El cron de la bandeja quema un intento por mensaje que **no procesó**: cinco corridas y el comprobante se declara carta muerta sin haber corrido nunca el OCR

`src/app/api/cron/wa-pendientes/route.ts:37,101-119` ·
`src/lib/likida/wa_pendientes.ts:25,78-107` ·
`src/lib/likida/processor.ts:629,645-647`

El bucle del cron hace, por mensaje y **en este orden**:
`reclamarPendiente(p.id, p.intentos)` → que ejecuta
`.update({ intentos: intentosLeidos + 1 })` (`wa_pendientes.ts:99`) → y **después**
llama a `processInbound`, que devuelve `'sin_tiempo'` sin tocar nada cuando
`!reloj.alcanza(15_000)` (`processor.ts:645`). El intento ya quedó contado.
`pendientesPorDrenar` filtra `.lt('intentos', MAX_INTENTOS_PENDIENTE)` con el
tope en **5** (`wa_pendientes.ts:25,83`).

**La aritmética.** Presupuesto útil de la invocación:
`120 − MARGEN_CIERRE_MS 17` = **103 s**. Una foto que llega al cuadre cuesta,
con los techos del propio repo, `esperarIntake` 20 + `acquireViajeLock` 12 +
`runAgent` 40 = **72 s**, así que **cabe UNA por corrida**. `LOTE = 10`
(`route.ts:37`), en serie, sin `break` cuando el presupuesto se acaba. Con un
rezago de **20 mensajes** (un apagón de media hora, o un fajo de fotos que el
webhook no alcanzó):

| Corrida | Lote (orden por `recibido_en`) | Procesa | Intentos que quedan en 5 |
|---|---|---|---|
| 1 | 1..10 | 1 | — |
| 2 | 2..11 | 2 | — |
| 3 | 3..12 | 3 | — |
| 4 | 4..13 | 4 | — |
| 5 | 5..14 | 5 | **6, 7, 8, 9 y 10** |
| 6 | 11..20 (los 6-10 ya no son elegibles) | 11 | — |

**Cinco mensajes de cinco choferes distintos se declaran carta muerta a los 25
minutos** (`5 corridas × 5 min`), y ninguno de los cinco corrió el OCR ni una
sola vez.

**Consecuencia:** el comprobante se pierde. El operador ve
`cron.wa_pendientes.cartas_muertas` y `alertarOperador` dice *«agotaron sus
reintentos»* — la frase afirma que se intentó cinco veces, cuando lo que pasó
es que se reclamó cinco veces y no se intentó ninguna. Es el diagnóstico
equivocado impreso en la única alerta que existe.

**Causa raíz probable:** el contador de intentos se escribió cuando
`processInbound` devolvía `void` y todo retorno era un intento real; C4/A3
introdujeron `'sin_tiempo'` —un no-intento— y el contador no distingue.

---

### [ALTO] La puerta de autorización es el primer eslabón de TODA petición de los dos paneles y es el único sin techo: cuatro `fetch` sin `signal` por delante de cualquier `maxDuration`

`src/lib/auth/session.ts:64-70,86-89` · `src/lib/auth/tenant-efectivo.ts:117,179,201,219` ·
`src/lib/likida/acotada_guardiana.test.ts:14-25`

`grep -c acotada` sobre `src/lib/auth/`: **`session.ts` 0 · `visibilidad.ts` 0 ·
`tenant-efectivo.ts` 0**. `getSessionTenant` hace dos viajes de red por intento
—`sb.auth.getUser()` (`:68`) y el `select` de `app_user` (`:70`)— **y reintenta
el par completo** tras 250 ms cuando la lectura falla (`:86-89`). Ninguno de los
cuatro lleva `AbortSignal`, así que heredan el default de undici: **300,000 ms**,
el mismo número que `presupuesto.ts:91-107` describe como *«el peor final
posible»* y que `acotada` existe para matar.

**La aritmética:** 4 × 300 s = **1,200 s** de techo antes de la primera línea
útil, contra `maxDuration = 60` en `/api/dashboard/chat`, `/api/dashboard/ingesta`,
`/api/dashboard/archivo` y `/api/admin/copiloto`. El presupuesto de borde del
copiloto está cuidadosamente sumado —40 + 5 + 8 = 53 s contra 60
(`copiloto/route.ts:87`)— y **la puerta que corre antes que él no está en esa
suma**. Lo mismo el chat: 40 s de analista + 3 × 9.5 de `registrarCosto` +
9.5 de `guardarIntercambio` = **78 s contra 60**, y eso ya sin la puerta.

`resolverTenantEfectivo`, que corre en cada una de las ~31 páginas del
`/dashboard`, suma hasta **cuatro** consultas más por el mismo camino
(`tenant-efectivo.ts:117,179,201,219`), y esas páginas **no declaran
`maxDuration`**: de 40 rutas bajo `src/app/api/` solo 15 lo declaran, y de las
páginas, cero.

**Consecuencia:** un blip de Supabase Auth —el proveedor que este repo no
controla— cuelga la petición hasta que Vercel la mate, en el único punto por el
que pasan las dos consolas. El contralor ve una pantalla que nunca carga; el
`logger` no escribe nada porque el proceso muere antes del `catch`.

**Causa raíz probable:** `acotada_guardiana.test.ts` lista **seis** archivos, y
los seis son del camino de WhatsApp; la regla se escribió contra el hallazgo
A23, que era del webhook, y la capa de auth nunca entró en la lista.

---

### [ALTO] `traerTodo` está al 96.1 % de su techo con el tenant demo y crece 3,204 filas al día: la pantalla de Combustible & Casetas se rompe el día 32

`src/lib/likida/pg.ts:45,48,190,220` · `src/lib/likida/analytics.ts:1156,384,320-340,1182-1189` ·
`docs/demo-5k.md:115-122,135`

`MAX_PAGINAS × PAGINA` = 100 × 1,000 = **100,000 filas**, y pasarse **LANZA**
`LecturaIncompleta` (`pg.ts:220`) — a propósito, y es lo correcto. El tenant
demo sembrado el 22-ago trae **96,118 gastos** en **30 días**
(`demo-5k.md:135`), o sea **96.1 % del techo** y **3,204 filas/día**. Margen:
`(100,000 − 96,118) ÷ 3,204` = **1.21 días**.

Las cuatro funciones que leen `gasto` **entero, sin ventana de fecha**:
`getGastoPorConcepto` (`:1156`), `detectarAnomalias` (`:384`),
`getGastoPorRuta` (`:1182`) y `getStatsPorOperador` (`:324`). Cuelgan de
`/dashboard` (inicio, vía `inicio-contenido.tsx:94`), `/dashboard/notificaciones`,
`/dashboard/contador` y `/dashboard/combustible-casetas`.

**Escenario:** la flota de 5,000 camiones —la que el propio repo sembró para el
video— llega al día 32. `traerTodo` agota sus 100 páginas, lanza, `safe()` lo
atrapa y las cuatro pantallas quedan en su estado vacío. **Y no vuelven**: una
tabla de gastos solo crece, así que el detector de fraude entre viajes
—`detectarAnomalias`, el que existe para que un «0 anomalías» no sea una
mentira— queda apagado para el cliente más grande, permanentemente. El propio
`demo-5k.md:69-76` lo dice sin rodeos: se sembraron 27,500 viajes y no 70,000
porque con 70,000 «esas pantallas mostrarían el error».

**El segundo número, el de latencia:** ese mismo render son **98 viajes PostgREST
en serie** (96 páginas llenas + la de 118 + la vacía que prueba el final,
`pg.ts:206-209`), **ninguno con techo**: los 21 `traerTodo` de `analytics.ts`
tienen **cero** `acotada` (verificado con grep), igual que
`repo.ts:1036` (`listarSolicitudesArco`). Un solo cursor colgado se lleva el
render entero, y la página no declara `maxDuration`.

**Causa raíz probable:** `traerTodo` se diseñó para *demostrar que la lectura
está completa*, que es una garantía de corrección; el costo —O(n²) por `offset`,
N viajes de red en serie, y un techo duro que un cliente real cruza en un mes—
es la contrapartida que nadie volvió a mirar cuando el volumen dejó de ser cero.

---

### [ALTO] El único camino de LLM sin tope diario es el más caro: el cuadre. El chat y la sonda —20 y 50× más baratos— sí lo tienen

`src/lib/agents/run.ts:30-39,76-77` · `src/lib/llm/models.ts:61,168,175` ·
`src/app/api/dashboard/chat/tope.ts:18` · `src/app/api/dashboard/ingesta/tope.ts:20` ·
`src/app/api/admin/copiloto/route.ts:73`

El delta puso techo de gasto en tres sitios y los tres son baratos:
chat **$1/día/tenant** a ~$0.005 el análisis (`chat/tope.ts:13-18`), sonda de
visión **$1/día/tenant** a ~$0.01 la lectura (`ingesta/tope.ts:20`), copiloto
**300 turnos/día** a ~$0.01 (`copiloto/route.ts:65-75`). No existe ningún tope
—ni por tenant, ni por día, ni por viaje— para la fase **`cuadre`**, que corre
`anthropic/claude-sonnet-5` a **$2/$10 por millón** (`models.ts:61,175`) con
`reasoning: 'high'` (`models.ts:168`).

**La aritmética del techo declarado, que `c74ebc9` acaba de hacer explícito:**
`maxTokensCuadre()` = 4,000 tokens de salida **por ronda** ×
`maxRondasCuadre()` = 6 rondas = **24,000 tokens de salida** × $10/M =
**$0.24**. La entrada medida por el propio repo —*«una liquidación de 21
comprobantes reenvía ~72,000 tokens de entrada en 8 vueltas»*,
`openrouter.ts:723-725`— da a 6 rondas ~50,000 × $2/M = **$0.10**, del que el
`cache_control` del `system` descuenta solo la parte invariante. **≈ $0.34 por
turno**, contra la banda con la que este repo fija su precio: **$0.03–$0.05 por
liquidación COMPLETA** (`models.ts:17`). **7–11× por UN turno**, y una
liquidación son varios turnos (cada foto, cada «listo»).

Y no hay nada que lo frene: el rate limit del webhook son **40 mensajes por
minuto y por teléfono** (`webhook/whatsapp/route.ts:16`), y lo que pasa de ahí
**no se descarta, se aplaza** — Meta lo reentrega y acaba procesándose. Un
teléfono en bucle son 40 × 60 × 24 = **57,600 turnos/día** sin un solo tope de
dinero que consultar. Al costo típico del turno, eso es cuatro cifras de dólares
en un día para un tenant, y el primer aviso es la factura de OpenRouter.

**Consecuencia:** el freno de gasto está exactamente donde el gasto es
despreciable y falta exactamente donde no lo es. El 1-sep vence la tarifa intro
y el mismo archivo manda revertir a $3/$15 (`openrouter.ts:175`): el techo por
turno pasa a **$0.51**.

**Causa raíz probable:** los topes se añadieron uno por uno, cada vez que un
hallazgo señaló una ruta HTTP concreta sin freno; el cuadre no entra por una
ruta HTTP del panel sino por el webhook, así que nunca le tocó su hallazgo.

---

### [MEDIO] El presupuesto acota el trabajo pero no los eslabones: 4 de los 5 pasos que consumen el reloj no lo consultan

`src/lib/likida/presupuesto.ts:207-219,237-254` · `src/lib/likida/oficina_wa.ts:159,166` ·
`src/lib/likida/processor.ts:112,116,253` · `src/lib/likida/talacha_wa.ts:115,139,140,245,359,363,383,403,467`

`Presupuesto` expone `acotar()`, `alcanza()` y `senal()`, y el delta los cableó
bien en los tres sitios grandes (barrera 20 s, mutex 12 s, agente 40 s). Lo que
queda fuera del reloj es todo lo demás, y se puede contar:

- **`oficina_wa.ts:166`** sigue con `timeoutMs: 35_000` **literal**, no
  `reloj.acotar(35_000)`, precedido de `:159` —`supabaseAdmin().from('tenant')`
  **sin `acotada`**, techo 300 s—. Alcanzable desde `processor.ts:872` cuando el
  dueño-que-maneja escribe sin viaje abierto. Cadena: preámbulo + despacho
  (9.5) + asignación (9.5) + `tenant` **sin techo** + 35 s de analista, contra
  los 120 del webhook, **con el reloj mirando**.
- **`talacha_wa.ts`**: 9 consultas, 5 con `acotada`. Cuatro sin techo en el
  camino de la incidencia del chofer (`:115,245,383,403,467`).
- **`processor.ts:112,116`**: el pin de ubicación (`registrarUbicacionChofer`)
  hace `select` sobre `viaje` e `insert` sobre `posicion` **sin `acotada`** —
  camino caliente del webhook, `type: 'location'`.
- **`processor.ts:253`**: `update` sobre `operador` sin techo.

**Escenario:** cualquiera de esas ocho consultas cuelga. `acotada` no dispara
porque no está, el reloj no se entera porque `restante()` solo mira el tiempo
transcurrido —no puede acortar lo que no pasa por él—, y el turno muere a los
120 s con el claim tomado. Con el retome de 150 s, se vuelve a pagar entero.

**Causa raíz probable:** `acotada_guardiana.test.ts` cubre 6 archivos elegidos a
mano; `acotar()` del presupuesto no tiene prueba guardiana ninguna, así que un
`timeoutMs` literal nuevo no rompe nada.

---

### [MEDIO] La caché de lectura de B17 ahorra viajes a la base, no tokens — y el prompt cache sigue apagado para los tres modelos del chat

`src/lib/llm/openrouter.ts:604,739-742,757-761` · `src/lib/llm/models.ts:66,72,92`

`a87a69d` declara `readOnlyTools` en `analista.ts` y `copiloto.ts` y añade el
prefijo `estado_` a `READ_PREFIXES` (`:604`). Lo que eso cachea es el
**resultado de la tool** entre rondas del mismo turno (`crossRound`, `:757`):
ahorra la ejecución —las tres lecturas del cuadre, el barrido del ejercicio de
`getAcumuladoCombustible`— pero el resultado **igual viaja en el `convo` de cada
ronda siguiente** y se vuelve a pagar como tokens de entrada. **El costo por
interacción no bajó: se movió de la base al mismo sitio donde estaba.**

Y el prompt cache de verdad —`cache_control: ephemeral` sobre el `system`— está
tras `const soportaCache = /anthropic\//.test(model)` (`:739`). Los tres modelos
del chat **no son de Anthropic**: `chat` = `google/gemini-3.5-flash-lite`,
`chat_ligero` = `openai/gpt-5-nano`, `analisis` = `openai/gpt-5.6-luna`
(`models.ts:66,72,92`). O sea que la única llamada que sí se beneficia del
breakpoint es la del cuadre —que es la correcta y la cara—, y el commit que dice
*«la caché de lectura cubre los chats»* cubre otra cosa.

**Consecuencia:** ninguna urgente (el chat cuesta ~$0.005 el turno y tiene tope
diario). Se reporta porque el asunto del commit y el efecto medible no dicen lo
mismo, y el rubro se califica por el número.

**Causa raíz probable:** dos mecanismos con el mismo nombre —«caché»— en el
mismo archivo: la de resultados de tool y la de prefijo de prompt.

---

## Lo que revisé y está bien

- **El presupuesto por invocación es correcto, incluido el caso paralelo.**
  `crearPresupuesto(totalMs, reloj, inicio)` mide reloj de pared desde el inicio
  de la invocación (`presupuesto.ts:238`), que es la cuenta buena tanto para el
  cron (10 en serie) como para el pool de 5 del webhook (concurrentes comparten
  wall-clock). `senal()` devuelve una señal **ya abortada** cuando no queda nada
  (`:250`), así que la llamada ni sale. Busqué el error de contar en paralelo
  como si fuera serie y no está.
- **`f9035d6` es exactamente lo que dice.** `cola/route.ts:19` = 300, igual que
  `../route.ts:33`, y `cola/route.test.ts` compara los dos literales y el techo
  del plan. El número contra el número: coinciden.
- **`f7c0b2b` mató el N+1 de verdad.** `wa_pendientes.ts:54-56`: un `upsert` del
  lote con `onConflict: 'id', ignoreDuplicates: true`, envuelto en `acotada`, en
  el camino SÍNCRONO antes del 200. 22 fotos = 1 viaje de red, no 22.
- **La sonda de visión quedó bien acotada por los tres lados**
  (`ingesta/route.ts:46,68,79,82`): rate limit por usuario, tope diario por
  tenant que **falla cerrado** (503 si no se pudo leer, no «$0»), señal de 45 s
  que cubre las cuatro `attempt` de `generateStructured`, y `registrarCosto` con
  el modelo real. **Es literalmente lo que el piloto no hace.**
- **`generateStructured` cobra los intentos fallidos** (`openrouter.ts:436-441,
  501,516`) y `PartialExecutionError` arrastra el consumo de la primera vuelta
  (`be260a7`). La contabilidad está bien construida; lo que falta en el piloto es
  la escritura, no el mecanismo.
- **`meta/client.ts` ya no usa `fetch` pelado**: `SEND_TIMEOUT_MS` 10 s y
  `DOWNLOAD_TIMEOUT_MS` 15 s en los ocho `fetch` del archivo. (El comentario de
  `presupuesto.ts:78-83` que dice lo contrario está **desactualizado** — importa
  porque es el texto contra el que alguien dimensionaría `MARGEN_CIERRE_MS`.)
- **`rateLimit` no puede colgar una invocación**: `AbortSignal.timeout(1200)`
  sobre la REST de Upstash y `null` ante cualquier fallo (`ratelimit.ts:161,200`).
- **`getAcreditables` ya no pagina**: es un RPC agregado
  (`acreditables_liquidacion_tenant`, `analytics.ts:675`). Un viaje de red donde
  antes había ~100 páginas. Ese sí bajó, y se nota en la cadena E.
- **`credencialesDePortales` se lee una vez por flota, no por ticket**
  (`cron/facturar/route.ts:567`) y solo con la palanca puesta. El N+1 del cofre
  no está.
- **`computer_use.ts` es código muerto**: 300 líneas de un segundo adaptador de
  visión con `maxToolRounds: 14` y sin `maxTokens`, cuyo único importador en
  todo `src/` es su propia prueba. No cuesta un dólar porque nadie lo llama —
  pero si alguien lo registra, entra con el mismo perfil de costo del piloto y
  sin fila en `llm_costo`.
- **La palanca del piloto sigue apagada por default** (`.env.example`,
  `registro.ts:180` exige la palabra exacta) y el cron respeta
  `estaApagado('agente:facturas')`. Nada de la cadena A está corriendo hoy.
- **La suite:** `npx vitest run` → **432 archivos, 5,514 pruebas, 1 saltada, 0
  fallos**, 115.75 s.

---

## Lo que NO alcancé a revisar

- **Nada de esto se ejecutó contra red.** Sin `.env`, sin base, sin proveedores y
  con `npm run build` prohibido. Cada cifra de tiempo sale de una constante
  declarada en el repo; las únicas medidas empíricas que existen son las de
  `pagina_playwright.ts:30-39` (Chromium en una Mac, no en el contenedor) y la
  tabla de `docs/demo-5k.md:108-116` (`EXPLAIN ANALYZE`, tiempo de base sin red).
  **El repo sigue sin una sola latencia medida de una llamada de visión.**
- **El `maxDuration` real de las páginas.** Ninguna de las ~31 del `/dashboard`
  ni ninguna de `/admin` lo declara, `vercel.json` no trae bloque `functions`, y
  el default efectivo del plan no está escrito en ningún archivo del repo. La
  cadena E se queda sin límite contra el cual compararse.
- **La latencia Vercel↔Supabase por página de PostgREST.** Los 98 viajes en serie
  de la cadena E los conté en el código; el tiempo de pared depende de un RTT que
  no está medido en ninguna parte.
- **El tamaño del bundle con Chromium.** `pagina_playwright.ts:1163-1167` declara
  67 MB + 13 MB contra 250 MB sin comprimir y ~190 MB en `/tmp`; no verifiqué el
  bundle real, y ahora hay 20 comercios pilotables más colgando de ahí.
- **El arranque en frío del cron de facturación** (descompresión de Chromium
  dentro de los mismos 300 s) y **`/api/dashboard/archivo`** (`maxDuration = 60`,
  sin sumar).
- **El costo de las ~54 corridas del organigrama de agentes** (`agente_corrida`):
  miré que `/admin/consumo` las lee, no que sus techos cuadren.
