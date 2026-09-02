# Backend y API — auditoría 24

**Nota: 7/10** (antes 7). Razón del movimiento: **se atacó y subió, y una deuda
nueva se comió la subida**. Los tres ALTO abiertos (BE-1, BE-2, BE-3) están
cerrados de verdad y —esto es lo que valía la nota— cerrados **con prueba en dos
capas**: vitest del cableado y bloque SQL contra Postgres real. El sesgo que la
22 castigó («correcto por lectura, no por prueba») ya no aplica a los caminos de
dinero. Lo que impide el 8 es que la funcionalidad más nueva del rubro —la firma
humana de la liquidación, mig. 0299— escribe cifras nuevas en la base y **no
toca el papel que el contralor archiva**, y ese seam no tiene una sola prueba.

El riesgo mayor del rubro hoy: **el ajuste del contralor mueve el total en la
base y deja el PDF con la cifra vieja** — dos cifras para la misma liquidación,
en el único documento que sale de Likida hacia un tercero.

## Hallazgos

### [CRÍTICO] `revisar_liquidacion(... 'ajustar')` cambia el total y NO regenera el PDF: el papel del contralor queda con la cifra corregida
`supabase/migrations/0299_revision_liquidacion.sql:391-397` · `src/lib/likida/revision.ts:353-424` · `src/app/dashboard/[id]/page.tsx:226-252` · `src/app/api/export/pdf/[id]/route.ts:88-105`

Escenario (es el ejemplo canónico del propio feature, WA-3, y el que corre el
bloque 246 de `verificaciones.sql:15781`): el motor cerró el viaje V-119 con un
ticket de diésel leído como **$800**. El PDF del contralor
(`{tenant}/{viajeId}.pdf`) y el del operador se generaron en el cierre con esa
cifra y `liquidacion.pdf_url` quedó apuntando a ellos. El contralor abre
`/dashboard/{id}`, corrige a **$8,000** y firma «ajustar».

`revisar_liquidacion` hace, en la misma transacción, `update gasto set monto =
8000` y `update liquidacion set total_comprobado = total_comprobado + 7200,
diferencia = diferencia − 7200, revision = 'ajustada'`
(`0299_revision_liquidacion.sql:391-396`). En esa función **no aparece la
palabra `pdf` ni una sola vez** (`grep -n pdf 0299_*.sql` → 0 resultados), y
`revisarLiquidacion` en `revision.ts` no vuelve a generar nada: su único efecto
posterior es el `sendText` al chofer, y solo en el camino `rechazar`
(`revision.ts:404-421`). El server action `revisar()` hace `revalidatePath` de
dos rutas y devuelve el mensaje «El comprobado quedó en $8,000.00»
(`page.tsx:242-247`), y el botón «Descargar PDF» sigue pintado porque
`d.pdfPath` no cambió (`page.tsx:267`). `/api/export/pdf/[id]` no regenera:
lee `liquidacion.pdf_url` y firma una URL al objeto que ya está en el bucket
(`route.ts:88-105`).

Entra: ajuste de $800 → $8,000 sobre V-119.
Sale mal: pantalla, `GET /v1/liquidaciones` y el export fiscal dicen comprobado
$8,000 / diferencia −$3,000; el PDF descargado —el mismo archivo, byte por
byte— dice $800 y su diferencia vieja. Ninguna pantalla advierte que el papel
quedó viejo (`src/app/dashboard/[id]/detalle.tsx:124-126` sigue diciendo
«Disponible para descargar»).

Consecuencia: el contralor archiva y le manda a su contador un PDF que
contradice al panel en la cifra exacta que él acaba de corregir. Es la regla que
define al producto («una cifra fiscal que se lee distinto en dos pantallas se
lee como dos cálculos») rota en el único artefacto que sale de Likida. Y el
chofer, si el PDF ya se le entregó, se queda con la versión que le carga los
$7,200 de diferencia.

Causa raíz probable: la 0299 se diseñó como transacción en SQL y el PDF vive
fuera de SQL (`tools.ts` lo sube antes del RPC de cierre); nadie cerró el puente
—ni regenerando, ni invalidando `pdf_url`, ni rotulando el papel como
superado—. `reabrir` sí lo contempla («Borra la liquidación actual y su PDF»,
`detalle.tsx:426`); `ajustar` no.

Prueba que lo cubra: **ninguna**. `revision.test.ts` no menciona `pdf` (grep = 0),
y ningún `*.test.ts` que toque `pdf_url`/`pdfPath` toca revisión.

### [ALTO] El arreglo BE-11 abrió un fail-open nuevo en el mutex del viaje: si el reintento sin token también falla, el lock se concede sobre una base que no contestó
`src/lib/likida/conv.ts:850-874`

Escenario: se despliega esta rama y la migración 0280 todavía no se aplicó
(exactamente la ventana que el comentario de `conv.ts:851-855` dice cubrir). El
chofer escribe «listo»; `procesarTurno` llama `intentarLockViaje(viajeId,
{ttlMs: 120000, token: 'tok-A'})`. La llamada de tres argumentos vuelve con
`PGRST202` → `rpcAusente(error)` es true → se reintenta la firma de dos
argumentos (`conv.ts:862`). Si **esa segunda llamada también trae `error`** —un
`acotada` que se rinde a los 9.5 s con `{data:null, error:{message:'sin
respuesta en 8000 ms (tope de consulta)'}}`, un 503 del pooler, un `57014`— la
rama `if (!viejo.error)` no entra, no hay `continue`, y la ejecución cae al
`logger.error('viaje.lock_rpc_ausente')` de la línea 872 y **`return
'obtenido'`**.

Entra: mutex indeterminado por dos errores seguidos → sale «el lock es tuyo».
El chofer manda «listo» dos veces con 3 s de diferencia (lo normal cuando el
bot tarda): los dos turnos reciben `'obtenido'`, los dos corren `runAgent`
completo, los dos generan y suben dos PDFs, y los dos llaman
`guardar_liquidacion_tx`. El `unique(viaje_id)` impide la segunda fila, pero el
segundo turno ya pagó su ciclo de LLM y el operador recibe dos veces el cierre.

Consecuencia: es el mismo estado que DAT-21 declaró inaceptable en este archivo
(«fallar abierto cuesta una liquidación cerrada dos veces»), reintroducido por
el parche que vino a arreglar otra cosa — y justo cuando la infraestructura está
peor, que es cuando el doble cierre es más probable. Para el equipo que lo
mantenga, el archivo afirma en prosa que ese fail-open ya no existe.

Causa raíz probable: la rama del token no tiene salida propia para «el fallback
también falló»; cae por gravedad al `return 'obtenido'` que solo era correcto
para el caso *sin* token.

Prueba que lo cubra: **ninguna**. `conv_lock_dueno_aud24.test.ts:69-88` prueba
los tres caminos vecinos (fallback OK, fallback ocupado, sin token) y no el
cuarto —fallback con error—, que es el único que abre el mutex.

### [ALTO] Un error de lectura por VALOR silencia el reloj legal matpel, y lo sella para siempre
`src/lib/likida/relojes_legales.ts:337-345` (con `:254-255`, `:263-266` y `:208-213`)

`flotaDeclaraHazmat` hace `const { data } = await acotada(...)` — **sin leer
`error`**. `acotada` reporta el fallo por valor (`presupuesto.ts:230-233`:
resuelve `{data:null, error:{...}}`, no lanza), así que el `try/catch` de la
línea 344 nunca dispara y el flujo llega a `hazmatDeclarado(null)`, que devuelve
`null` (`perfil/preguntas.ts:354-356`).

Entra: incidencia de tipo `siniestro` en un viaje sin CFDI emitido de una flota
que **sí** declaró materiales peligrosos, y la lectura de `tenant.perfil` se
topa con el tope de 8 s de `acotada` en esa corrida del cron.
Sale mal: `hazmat === true` es falso → `partesOperacion` queda vacío →
`partesDinero` también (no hay factura) → se entra al bloque de
`relojes_legales.ts:263-266` y se escribe
`anotarEventoIncidencia(..., EVENTO_RELOJ, { aviso: 'sin_relojes_aplicables' })`.
Ese sello es **permanente**: el anti-join de `:208-213` descarta para siempre
las incidencias selladas, así que ninguna corrida posterior vuelve a evaluar esa
incidencia — ni cuando la base ya responde bien.

Consecuencia: el jefe de flota nunca recibe el aviso de los plazos SICT/ASEA de
un siniestro con materiales peligrosos, y no queda rastro de que se decidió no
avisar por un blip de red: en la bitácora dice «sin relojes aplicables», que es
una afirmación falsa. Un blip de ocho segundos apaga un reloj legal de forma
irreversible.

Causa raíz probable: la trampa nº1 del repo (`CLAUDE.md`: «supabase-js reporta
errores POR VALOR») dentro de una función cuyo comentario afirma fallar cerrado;
y un sello que no distingue «no aplica» de «no se pudo saber si aplica».

Prueba que lo cubra: no encontré ninguna que fuerce el `error` por valor en
`flotaDeclaraHazmat`.

### [MEDIO] Un 200 de Meta sin `wamid` se trata como envío fallido: el mensaje se reencola y se vuelve a mandar
`src/app/api/cron/wa-outbox/route.ts:116-118` con `supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:107-116`

Escenario: `POST graph.facebook.com/v21.0/{phoneId}/messages` devuelve **200**
(Meta aceptó el mensaje y lo va a entregar) pero el cuerpo no trae
`messages[0].id` —un cambio de forma de la respuesta, un `messages: []`, un
cuerpo truncado—. El código hace `fallidas++` y llama
`finalizarYAvisarSiMurio(s, undefined, 'Meta aceptó sin wamid')`. Con
`p_message_id` nulo, `finalizar_wa_outbox` deja la fila en `estado='pending'`
con `proximo_intento_en = now() + 15·2^intentos` s
(`0180:112-115`), o sea la vuelve a la cola.

Entra: 200 sin wamid sobre la salida «Tu liquidación del viaje V-119 se regresó
a revisión».
Sale mal: el chofer recibe el mismo mensaje otra vez 30 s después, y otra vez a
los 60, hasta agotar los 8 intentos — porque el primero SÍ salió.

Consecuencia: el chofer recibe hasta ocho copias del mismo aviso; en el peor
caso es un aviso de cobranza o de rechazo de liquidación repetido, que es
exactamente lo que el módulo de ráfaga existe para no hacer. El archivo ya
razonó esta ambigüedad para el `catch` de red (`wa_outbox.ts:30-57`,
`RETRASO_AMBIGUO_SEGUNDOS`) y no la aplicó a la rama gemela del 200 sin wamid,
que es MENOS ambigua: ahí Meta ya dijo que sí.

Causa raíz probable: «no pude leer el id» se codificó como «no se envió», cuando
lo que falta es el identificador, no el envío.

### [BAJO] `marcarExportadas` cuenta los ids que mandó, no las filas que marcó
`src/lib/likida/proveedores.ts:507-521`

`marcadas += tanda.length` suma el tamaño de la tanda enviada, pero el `update`
lleva `.eq('estado','aprobada').is('exportada_en', null)` y no lleva `.select()`,
así que las filas que ya estaban exportadas —que el propio comentario de
`:497-499` dice que vienen incluidas en `ids`— se cuentan como recién marcadas.
Entra: 400 ids de los cuales 120 ya tenían `exportada_en` → sale
`{marcadas: 400}` cuando se marcaron 280. Consecuencia: `tareasHechas` en
`agente_corrida` y el «no se pudo marcar N de M» del aviso dentro del CSV
(`facturas-proveedor/route.ts:87-89`) reportan una cifra que no midió nada. No
mueve dinero, pero es un contador con cara de medición en la ruta que
precisamente existe para no reimportar facturas al ERP.

### [BAJO] La sonda de OCR no registra costo cuando aborta, y el tope diario no lo ve
`src/app/api/dashboard/ingesta/route.ts:96-127`

`extraerComprobante` corre con `AbortSignal.timeout(45_000)`. Si aborta después
de que el modelo ya consumió tokens, el `catch` de `:124` responde 502 y **no
llama a `registrarCosto`**, así que `gastoSondaHoyUsd` (el tope diario de
`:87-94`) no ve ese gasto. `processor.ts:4195-4205` ya trata este caso
explícitamente («el dinero se fue de todos modos») registrando el costo del
`PartialExecutionError` antes de decidir nada; esta ruta no. El rate limit por
usuario acota la frecuencia, no el importe.

## Lo que revisé y está bien

**Los tres abiertos de la 23, cerrados de verdad (no inertes):**

- **BE-1 · cerrado.** El registro sintético habla el vocabulario de la tool
  (`pdf_generado`, `pdf_contralor_generado`) y **no lleva campo `error`**, así
  que el `find(t => ... && !t.error)` de `processor.ts:4203` sí lo encuentra:
  `confirmarCierreEnBase` en `processor.ts:1160-1181`, consumido en el camino
  feliz (`:3823-3834`) y en el de excepción (`:3921-3940`). Prueba:
  `processor_cierre_parcial.test.ts`.
- **BE-2 · cerrado.** `bandejasAbiertas()` devuelve `{viajeId, telefono}`
  (`intake/rafaga.ts:168-170`) y `cerrarRafagasPorCorte(telefono)` filtra
  `if (tel !== telefono) continue` (`processor.ts:1201-1204`). Prueba:
  `processor_corte_rafaga_aud24.test.ts:85` (dos choferes, se cierra uno).
- **BE-3 · cerrado.** El conteo y la cancelación viven en un solo RPC con la
  factura `for update`: `cancelar_factura_tx`
  (`supabase/migrations/0284_cancelar_factura_tx.sql:61-105`), llamado en
  `facturacion_escritura.ts:679-684`. Cubierto por los dos lados:
  `facturacion_escritura_cableado.test.ts:233-280` (traducción y orden de las
  escrituras) y `verificaciones.sql:16469-16565` contra Postgres real.

**Muestra de cierres nuevos, verificados uno por uno y todos reales:**

- BE-6 · `qstashConfigurado()` exige las tres envs (`cron/facturar/route.ts:185-192`)
  y el cruce «encolé y nadie procesó» cae al camino síncrono con latido
  `parcial` (`:405-416`).
- BE-13 · `DatoInvalido` sale como 400 `parametro_invalido`, no 500
  (`v1/_escritura.ts:622-625`).
- BE-15 · el canal de WhatsApp se comprueba **antes** de `reclamarSalidasWhatsApp`
  (`cron/wa-outbox/route.ts:84-98`), así que un token rotado no quema intentos.
- BE-17 · `soltarReclamacion` borra la clave de idempotencia cuando el UPDATE
  del prospecto falla, para que el reintento de Cal.com sí entre
  (`webhook/calcom/route.ts:90-93`, `:121-126`).
- BE-19 · las **siete** rutas de export declaran `maxDuration = 120` (verificado
  archivo por archivo).
- BE-20 · `rateLimit('chat:'+userId, TURNOS_POR_MINUTO, 60_000)` en
  `dashboard/chat/route.ts:55`.
- BE-22 · `corrida-fin` ancla a `.is('fin', null)` y devuelve `cerro` por valor;
  `ordenes-claim`/`ordenes-resolver` firman con `quien.nombre` de la llave, no
  del cuerpo (`worker/bus/[accion]/route.ts:58-67`, `:129-163`).
- BE-14 · el latido `parcial` cuando hay pospuestos existe y está en el sitio
  correcto (`cron/wa-pendientes/drenado.ts:185`).

**Otros caminos que revisé y sostienen:**

- La idempotencia de `/v1` (`v1/_escritura.ts:705-791`): memoria → tabla durable
  0098 → llave natural → carrera contra el unique, con 409 cuando la llave se
  reusa con otro contenido; lo que no promete (candado «en vuelo») está escrito
  en `:49-52`. Prueba: `v1/_escritura.test.ts`.
- `saveLiquidacion` preserva `error.code` para que `cerrarLiquidacion` distinga
  el CU003 de un fallo cualquiera (`repo.ts:1088-1097`).
- `buscarViajePorFolio` / `buscarUnidadPorEconomico` fallan **cerrado** ante un
  error de lectura (`_escritura.ts:876-879`, `:929`), que es lo correcto: un
  `null` ahí diría «no existe» y mandaría a insertar.
- La puerta de `/v1` borra `?tenant=` antes de resolver la credencial y aplica la
  llave por encima de la cookie (`v1/_comun.ts:150-229`), con CSRF solo sobre
  métodos que escriben (`:242-250`).
- El cursor keyset de `/v1/viajes` y `/v1/liquidaciones` desempata por `id` y
  atrapa el recorte silencioso de PostgREST comparando página corta contra
  `total` (`v1/viajes/route.ts:119-135`, `:158-165`).
- `/api/pago/registrar` — la única ruta pública que toca dinero: tope de cuerpo,
  tasa por IP, honeypot, 404 con texto único para las cuatro razones, 503 cuando
  no se pudo *preguntar*, y 409 sobre factura cancelada aunque la página ya no
  pinte el formulario (`pago/registrar/route.ts:61-140`).
- El webhook de WhatsApp persiste el inbox **antes** del código de salida y
  contesta 503 si no pudo (`webhook/whatsapp/route.ts:248-263`), sella solo lo
  que de verdad terminó (`:400-426`) y deja de cobrar cupo a lo ya dedupeado
  (`:202-221`).
- `intentarLockViaje` distingue `ocupado` de `indeterminado` y el llamador falla
  cerrado con dos mensajes distintos (`conv.ts:828-897`,
  `processor.ts:3669-3694`); el lease se firma con token y solo con él se suelta.
- `duplicados.ts` agrupa por `(uuid, orden)` y no por uuid a secas, y el segundo
  pase por folio exige concepto + folio + monto (`duplicados.ts:107-137`).
- `pg_errores.ts:40-45` exige código **y** nombre de índice antes de tragarse un
  23505 — el guardarraíl correcto para el `violaIndice(e,'gasto_pkey')` nuevo de
  `processor.ts:3506`.

## Lo que NO alcancé a revisar

- `src/app/api/mcp/*` (las tres rutas de OAuth y el servidor MCP) y
  `src/lib/worker/llaves.ts`.
- `src/app/api/stripe/webhook/route.ts` completo — solo miré la superficie de
  `cancelarFacturaDeStripe` (`:280-303`).
- `src/app/api/cron/{descarga-sat,purgar,jornada,asistencia,portales-vivos,runner}`
  y `cron/gps` + `conectores/sincronizar_gps.ts`.
- `src/app/api/admin/qa/*` (BE-26/BE-27 quedaron sin verificar) y
  `src/app/api/correo/{entrante,eventos,baja}` (BE-21 sin verificar).
- Los `~30` upserts de `src/lib/likida/**` fuera de los que nombré: solo
  comprobé `onConflict` en `wa_pendientes.ts:63`, `repo.ts:47`,
  `worker/bus/[accion]/route.ts:87-94` y `conectores/sincronizar_gps.ts:230`.
- No corrí ninguna prueba: la compuerta la corre el orquestador. Todo lo de
  arriba es lectura de fuente y de migraciones.
