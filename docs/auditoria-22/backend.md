# Backend y API — auditoría 22

**Nota: 7/10** (antes: s/d). Razón: línea base nueva, sin ancla previa legible
(`.gitignore` deja los reportes de la 21 fuera de este clon). El 7 lo sostiene
algo verificable, no la lectura: **cada camino de concurrencia que abrí tiene
prueba propia y la pude nombrar por archivo** (ver la lista de abajo) — el
mutex del viaje, la barrera de ráfaga, el lease del claim, la carrera del
insert de `wa_conversacion`, la idempotencia de tres capas de `/v1`, el keyset
del export y el CU003 del cierre. Eso es la mitad del ancla de 8. Lo que impide
el 8 es la otra mitad: encontré **tres caminos donde el artefacto del cierre o
del export se pierde/queda viejo y el sistema reporta éxito**, y ninguno de los
tres tiene prueba. No es "correcto por lectura y no por prueba" (eso sería 6):
es correcto y probado en el núcleo, con los bordes del artefacto sin arnés.

El riesgo mayor del rubro hoy: **el papel del cierre —el PDF que el contralor
archiva y el chofer recibe— se puede perder o quedarse viejo sin que nada
falle**, porque el único generador vive detrás de un `catch` que solo loguea y
la liquidación ya se persistió de forma irreversible cuando eso pasa.

## Hallazgos

### [ALTO] El saneador del PDF deja pasar los controles C1 (0x7F–0x9F): un solo byte cierra la liquidación sin papel, para siempre, y al chofer se le dice que el contralor sí lo tiene

`src/lib/likida/liquidacion/pdf.ts:123` (el saneador) · `src/lib/likida/tools.ts:359-361` (el `catch` que se lo traga) · `src/lib/likida/processor.ts:3745` (el mensaje falso)

El saneador es `.replace(/[^ -ÿ–—•€]/g, '?')`: conserva todo U+0020–U+00FF. La
fuente que usa el PDF es `StandardFonts.Helvetica` (`pdf.ts:96`), o sea
WinAnsi, y WinAnsi **no puede codificar 33 de esos puntos de código**
(U+007F y U+0080–U+009F). Lo verifiqué corriendo el saneador real contra el
codificador real del repo:

```
0x001b (C0)  -> el saneador lo convierte en '?'   -> OK
0x0092 (C1)  -> SOBREVIVE al saneador             -> LANZA: WinAnsi cannot encode "" (0x0092)
0x007f (DEL) -> SOBREVIVE al saneador             -> LANZA: WinAnsi cannot encode "" (0x007f)
```

El comentario de `pdf.ts:110-115` documenta exactamente este fallo para el
rango C0 («un `\x1b` de una impresora térmica mal leído tumbaba la
generación») y lo cerró a medias: arregló 0x00–0x1F y dejó abierto 0x7F–0x9F.
`pdf.test.ts:35-47` prueba `\x01`, `\x1b`, `\x00`, `\x07`, `\r`, `\t` — todos
C0. **Ninguna prueba toca la banda C1.**

Escenario, con valores: el TMS de la flota hace
`POST /v1/viajes` con `{"folio":"VJ-8812","destino":"CANCUN", ...}` —
el caso normal de un ERP mexicano que exporta CP1252 y alguien decodifica como
Latin-1; `texto()` (`src/app/api/v1/_escritura.ts:160`) solo valida tipo y
largo, así que el campo entra tal cual. Semanas después el chofer escribe
"listo":

1. `computeCuadre` da 5 comprobantes, $5,000 comprobados contra $6,000 de
   anticipo. Todo bien.
2. `generarLiquidacionPDF` imprime `destino` y **lanza** en la primera línea de
   `subir(...)` (`tools.ts:357`).
3. El `catch` de `tools.ts:359` escribe `logger.error('pdf.gen')` y sigue.
   `pdfPath` y `pdfOperadorPath` quedan `undefined`.
4. `saveLiquidacion(..., pdfUrl = undefined)` **persiste igual**: el viaje pasa
   a `liquidado` (irreversible; el trigger de la 0036 ya no deja entrar nada).
5. `guardar_liquidacion` devuelve `pdf_generado: false`, y `processor.ts:3745`
   le manda al chofer: *«Tu liquidación ya quedó cerrada ✅, pero no pude
   generarte el PDF. Tu contralor ya la tiene en el panel; si necesitas el
   documento, pídeselo.»*

Eso último es **falso y verificable**: `liquidacion.pdf_url` quedó en NULL, así
que `src/app/api/export/pdf/[id]/route.ts:97` contesta 404 («No hay PDF para
esta liquidación») al botón de descarga del contralor. Y no hay reparación:
`generarLiquidacionPDF` tiene **un solo llamador en todo el repo**
(`tools.ts:357-358`, comprobado con grep), dentro de `guardar_liquidacion`; no
existe ninguna ruta ni acción de regeneración.

Consecuencia: el chofer se queda sin su comprobante de liquidación y va a
pedírselo a un contralor que recibe un 404; el contralor tiene una liquidación
cerrada, con diferencia calculada, sin el documento que el producto promete y
sin forma de emitirlo. Es además un rótulo que miente en el único canal que el
chofer tiene.

Causa raíz probable: el saneador se escribió contra el rango de controles C0 y
el rango permitido `[ -ÿ]` incluye los C1, que WinAnsi tampoco mapea.

### [ALTO] Al reimprimir por CU003, `generarPdfs` no reinicia las rutas: si la segunda impresión falla se archiva —y se le manda al chofer— el PDF del cuadre VIEJO, reportando éxito

`src/lib/likida/tools.ts:322-323` (las variables) · `tools.ts:329-362` (`generarPdfs`) · `tools.ts:386-388` (la reimpresión)

`pdfPath` y `pdfOperadorPath` viven FUERA de `generarPdfs` y solo se asignan
cuando `subir(await generarLiquidacionPDF(...))` llega a completarse
(`tools.ts:357-358`). Si `generarLiquidacionPDF` **lanza**, la asignación no
ocurre y la variable conserva el valor de la corrida anterior; el `catch` de
`:359` solo loguea. Los dos objetos de storage se suben con `upsert: true` a
rutas fijas (`${tenant}/${viaje}.pdf` y `${tenant}/${viaje}-operador.pdf`), así
que la ruta vieja sigue apuntando al archivo viejo.

Escenario, con valores (encadena con el hallazgo anterior, que es lo que hace
que la segunda impresión falle y la primera no):

1. Cuadre 1: 5 comprobantes, `totalComprobado = $5,000`, anticipo $6,000,
   `diferencia = $1,000` a favor de la empresa. `generarPdfs` imprime y sube
   los dos ejemplares. `pdfPath = 't-1/v-9.pdf'`.
2. Entra en la ventana un diésel de $1,200 cuyo `ocr_extra.estacion` trae un
   0x92 (viene del XML del CFDI por `updateGastoCfdiXml`). La 0158 cuenta 6
   donde el papel imprimió 5 → `saveLiquidacion` lanza **CU003**.
3. `tools.ts:386-387`: recuadre (6 comprobantes, `totalComprobado = $6,200`,
   `diferencia = -$200`) y `await generarPdfs(liq)` otra vez. Ahora
   `generarLiquidacionPDF` **lanza** por el 0x92 → `catch` de `:359` →
   `pdfPath` y `pdfOperadorPath` **siguen valiendo las rutas de la corrida 1**.
4. `tools.ts:388`: `saveLiquidacion(ctx.tenantId, liq, 't-1/v-9.pdf', 6)`
   guarda la fila con **$6,200 / −$200** y `pdf_url` apuntando al PDF que dice
   **$5,000 / $1,000**.
5. El resultado sale con `pdf_generado: true` y `pdf_contralor_generado: true`
   (`tools.ts:415, 424`), así que `processor.ts:3679` no lanza y el chofer
   recibe por WhatsApp el ejemplar **viejo** como si fuera su liquidación.

Consecuencia: el contralor descarga del panel un PDF que dice que el chofer
debe $1,000 mientras la fila del panel dice que la empresa le debe $200 a él;
el chofer tiene en la mano ese mismo papel viejo. Es exactamente lo que el
comentario de `tools.ts:326-328` declara que no puede pasar («reimprimir con la
fotografía vieja archivaría el PDF que causó el hallazgo»), y es una cifra
fiscal que se lee distinto en dos lugares.

Prueba que lo cubra: **ninguna.** `src/lib/likida/tools_cierre_conteo.test.ts`
prueba el reintento CU003 (línea 106-123) pero su doble de
`generarLiquidacionPDF` (`:51`) **nunca falla**, y su doble de storage (`:71`)
tampoco: el caso "la segunda impresión truena" no existe en la suite.

Causa raíz probable: `generarPdfs` muta variables del closure en vez de
devolver el par de rutas, así que un fallo parcial deja el estado de la corrida
anterior en pie.

### [ALTO] El export de liquidaciones cierra el CSV en limpio al agotar las 100 páginas: a partir de 100,000 filas el archivo sale corto con cara de completo

`src/app/api/export/liquidaciones/route.ts:141-161`

El bucle es `for (let n = 0; n < MAX_PAGINAS; n++)` con `MAX_PAGINAS = 100` y
`PAGINA = 1000` (`src/lib/likida/pg.ts:45,48`). Todas las salidas del cuerpo
lanzan o cortan cuando ya se leyó todo; **la salida por agotamiento del `for`
no**: cae directo en `controlador.close()` (`:161`), que cierra el stream
limpio sobre un 200 ya enviado. Es la misma condición que `traerTodo` sí trata
como fallo — `pg.ts:219-220` loguea `pg.lectura_incompleta` y lanza
`LecturaIncompleta` justo ahí.

Escenario, con valores: el propio archivo declara la escala de diseño.
`periodo.ts:10-13` dice literalmente *«Tope del periodo de un export: 3 meses.
A 50k viajes/mes son ~150k liquidaciones como máximo por archivo»*. Un
contralor pide `?desde=2026-06-01&hasta=2026-08-31` sobre una flota con 150,000
liquidaciones en la ventana:

- primera página: `count: 'exact'` → `esperadas = 150000`;
- se sirven 100 páginas × 1,000 filas → `leidas = 100000`, `esperadas` sigue en
  150,000, así que `leidas >= esperadas` (`:151`) nunca se cumple y `filas.length`
  nunca es 0 (`:152`), así que `LecturaIncompleta` nunca se lanza;
- el `for` termina por `n === 100`, se ejecuta `controlador.close()`, el
  navegador marca la descarga como **completa** y el ERP importa
  **100,000 de 150,000** liquidaciones.

No hay 500, no hay abort, no hay una sola línea de log: `logger.error` de
`:166` solo corre dentro del `catch`.

Consecuencia: el contralor concilia contra un CSV al que le falta un tercio del
trimestre, sin ninguna señal de que falte. Es el modo de falla que el
comentario de `:153-156` dice combatir («un archivo corto con cara de completo
es justo lo que no sale») y que la prueba de `rutas_export.test.ts:305-311` sí
ancla, pero solo para el caso "la base deja de entregar", no para el
agotamiento de páginas: no hay ninguna prueba en ese archivo que mencione
`MAX_PAGINAS`.

Consecuencia acotada, y lo digo: hoy la base está en cero, así que esto no
muerde en un demo. Muerde exactamente en la escala que el propio archivo
declara soportar.

Causa raíz probable: el `for` acotado se copió de `traerTodo` sin copiar su
`throw` de salida.

### [MEDIO] El aviso «esa foto ya está en otro viaje» se pierde en silencio cuando la lectura de dedup falla, que es el caso que la función existe para cubrir

`src/lib/likida/repo.ts:437` · `src/lib/likida/processor.ts:2166-2175`

`ubicarGastoPorHash` hace `const fila = !error ? data?.[0] : null;`: un error de
lectura y "no existe" salen iguales. Encima el llamador le pone un
`.catch(() => null)` (`processor.ts:2167`). Con `null`, el processor cae al
`logger.info('foto.dedup_race')` de `:2174` y **no le dice nada al chofer**.

Escenario, con valores: el chofer reenvía su fajo del viaje anterior (10 fotos
ya registradas en el viaje V-118). El pre-chequeo `gastoExistePorHash` mira
solo el viaje ACTUAL (V-120) y no las encuentra; `addGasto` choca con
`uq_gasto_img_hash`, que es `unique(tenant_id, img_hash)` —toda la flota—; se
llama `ubicarGastoPorHash`, y en ese momento la consulta agota el
`TOPE_CONSULTA_MS` de `acotada` (8 s, que llega **por valor** como
`{data:null, error}`). Resultado: `donde = null`, se registra un
`foto.dedup_race` de nivel info, y el chofer no recibe ni el mensaje de
"ya estaba registrado en tu viaje V-118" ni ningún otro.

Consecuencia: se reabre exactamente el incidente que el comentario de
`repo.ts:416-426` fecha el 1-ago («diez fotos rechazadas, cero mensajes.
Desde su lado, las mandó y no pasó nada»), solo que ahora condicionado a un
blip de base. No lo subo a ALTO porque **el dinero no se pierde**: el gasto ya
está registrado en el otro viaje y el índice hizo su trabajo; lo que se pierde
es el aviso.

Causa raíz probable: la función se escribió con la semántica best-effort de su
hermana `gastoExistePorHash` (donde `false` ante error es correcto: "no
bloquear el intake"), pero aquí `null` significa "no hay nada que decir", que
no es lo mismo.

## Lo que revisé y está bien

Concurrencia, cada camino con la prueba que lo cubre **nombrada** (es el sesgo
que el rubro me pide corregir: leer no es verificar):

- **Mutex del viaje** — `src/lib/likida/conv.ts:725` `intentarLockViaje`.
  Distingue `ocupado` de `indeterminado` y NO abre el mutex ante un error
  persistente (solo ante RPC ausente, con `logger.error`). Cubierto por
  `src/lib/likida/conv_lock.test.ts` y `src/lib/likida/processor_lock.test.ts`.
- **Lease + fencing del claim de mensaje** — `conv.ts:482` `claimMessage`,
  `:520` `completarMessageClaim`, `:538` `renovarMessageClaim`, contra las RPC
  de `supabase/migrations/0187_wa_evento_pendiente_leases_fencing.sql` (leí el
  SQL: el UPDATE va anclado a `claim_token` + `claim_owner`, con
  `for update skip locked` y el orden causal por chofer impuesto en la base).
  Cubierto por `src/lib/likida/conv_claim_lease.test.ts` y
  `src/lib/likida/wa_pendientes_leases.test.ts`.
- **Carrera del INSERT de `wa_conversacion`** — `conv.ts:341-384`: choca contra
  `wa_conversacion_tenant_tel_uidx`, relee, y lanza si tampoco aparece (nunca
  devuelve `id: ''`). Cubierto por `src/lib/likida/conv_carrera_insert.test.ts`.
- **Barrera de ráfaga** — `conv.ts:801` `intakeDelta` y `:837`
  `intakePendientes` devuelven `null` (no 0) ante error, y `esperarIntake`
  (`:880`) es fail-closed sobre ese `null`. Cubierto por
  `src/lib/likida/barrera.test.ts`, `barrera_fail_closed.test.ts` y
  `barrera_sondeo.test.ts`.
- **Idempotencia de escritura de `/v1`** — `src/app/api/v1/_escritura.ts:694`
  `escribir`: memoria → tabla durable `api_idempotencia` → llave natural, y el
  árbitro real es el unique de la base (`viaje_folio_unico`,
  `unidad_economico_unico`), con relectura tras el 23505 y 409 cuando la fila
  existe con OTRO contenido. Cubierto por `src/app/api/v1/_escritura.test.ts`.
- **Keyset del export de liquidaciones** — `route.ts:98-120`: el cursor es
  `(created_at, id)` con la rama de empate, no `range` por posición. La prueba
  `src/app/api/export/rutas_export.test.ts:329` interpreta de verdad el filtro
  `.or()` e inserta una fila concurrente entre páginas; el arreglo de la 21
  aguanta.
- **CU003 del cierre** — `src/lib/likida/repo.ts:994-1038` preserva `code` y
  `tools.ts:378-389` reintenta **una** vez, refotografiando y reimprimiendo.
  Cubierto por `src/lib/likida/tools_cierre_conteo.test.ts` (su hueco es el
  hallazgo 2, no el mecanismo).
- **Conciliación de un pago del portal** — `src/lib/likida/portal_pago_escritura.ts:233`:
  la idempotencia es el índice `pago_recibido_propuesta_unica`, no un
  `select`-luego-`insert`; el abono nace antes del sello y el camino
  "abono creado, sello perdido" se releé y se resuelve sin duplicar. Cubierto
  por `src/lib/likida/portal_pago_escritura.test.ts`.
- **Webhook de Stripe** — `src/app/api/stripe/webhook/route.ts`: HMAC sobre el
  cuerpo crudo, `livemode` comparado con el modo de la llave (400 sin marcar el
  evento), `marcarEvento` antes de aplicar y 500 deliberado para que Stripe
  reintente. Los casos "nos concierne pero falló" lanzan en vez de `return`
  (`:141-147, :162-169, :174-180, :219-225`), que es justo el `if` sin `return`
  que este rubro persigue: aquí está bien puesto.
- **Bandeja durable de WhatsApp** — `src/app/api/webhook/whatsapp/route.ts`:
  persiste ANTES del código de salida y contesta 503 si no pudo guardar; el
  429 aplaza en vez de descartar; `quedoPendiente` no sella
  `sin_tiempo`/`en_curso`/`reintentable`; `devolverIntentoPendiente` no cobra
  intento cuando la invocación no tuvo presupuesto.
- **`acotada`** — `src/lib/likida/presupuesto.ts:195`: dos capas
  (`abortSignal` + carrera con temporizador) y el tope agotado entra por el
  MISMO camino que un error de Postgres, así que cada llamador conserva su
  semántica probada.
- **Cacheo de rutas GET multi-tenant**: revisé las 8 rutas sin
  `dynamic = 'force-dynamic'` (las 6 de `export/`, el webhook y `demo`). En
  Next 16 (`node_modules/next/package.json` → 16.3.2) los route handlers ya no
  se cachean por default, y las de export además leen `req.url` y cookies y
  mandan `Cache-Control: no-store`. **Lo descarto por escrito**: no es hallazgo.
- **Escrituras sin filtro de tenant**: barrí `src/` buscando
  `update`/`delete` sin `tenant_id` en el mismo builder. Los 50 casos son
  tablas globales por diseño (`tenant`, `suscripcion`, `mcp_oauth_*`,
  `prospecto`, `cola_aprobacion`) o están detrás de guardias explícitos
  (`qa-motor.ts:360` `exigirTenantZZZ` + `:386` `exigirPrefijoQA` antes del
  `delete` sobre `wa_mensaje_procesado`). Ninguno es hallazgo.
- **`ingerirRep`** (`src/lib/likida/intake/rep.ts:182`): es idempotente
  (upsert `ignoreDuplicates` sobre `(tenant, cfdi_uuid, docto)` y sello
  condicionado a `.is('pagado_en', null)`), así que el 503 con reintento de
  `correo/entrante` no acredita el IVA dos veces. Lo verifiqué a propósito
  porque ese 503 reprocesa el correo entero.

## Lo que NO alcancé a revisar

- `src/lib/mcp/oauth.ts` (536 líneas) y las tres rutas de `/api/mcp`: solo leí
  la puerta de `route.ts:1-120`. La rotación/revocación de tokens y el flujo
  del código de autorización quedaron sin abrir.
- `src/app/api/worker/bus/[accion]/route.ts` y `src/lib/admin/bus.ts`.
- `src/app/api/cron/facturar/` (y su vuelta por QStash), `cron/runner`,
  `cron/purgar`, `cron/portales-vivos`, `cron/jornada`, `cron/asistencia`,
  `cron/escalar`: solo abrí `cron/gps` y `cron/wa-pendientes`.
- `src/app/api/admin/qa/*` y `src/app/api/admin/mapa-prospectos/*` (tocadas
  esta ronda por el CSRF, no por su lógica).
- `src/lib/likida/facturacion_escritura.ts` completo: leí `evaluarAbono` y el
  traductor de folio duplicado, no las ~900 líneas restantes ni
  `registrar_pago_tx` en SQL.
- No corrí `npm test` ni `npx tsc --noEmit`: la compuerta base de la ronda
  (MAPA.md) los reporta verdes sobre este mismo commit (`86813f4`) y volver a
  correrlos no habría cambiado ningún hallazgo. Los dos repros que sí corrí
  fueron fuera del árbol de pruebas: el saneador de `pdf.ts` contra
  `@pdf-lib/standard-fonts` (hallazgo 1) y el barrido de escrituras sin
  `tenant_id`.
