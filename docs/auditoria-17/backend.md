# Backend y API — auditoría 17 · pase 4 (11-ago-2026)

**Nota: 5/10** (antes 4). Razón del movimiento: **se atacó y subió**. Los dos
hallazgos que el pase 3 abrió se atacaron de verdad, no de nombre: `3404616` ató
el TTL del lease a `PRESUPUESTO_WEBHOOK_MS` (`presupuesto.ts:223`) y fijó la
**invariante** con `conv_lock_expira.test.ts` (5 casos, `:66` "la constante del
lease no se puede quedar corta contra el peor caso" — se pone roja si alguien
sube el techo del agente sin subir el lease); y `ea23059` sustituyó el `in` suelto
del recordatorio por `traerTodo` + `conteo` + `order('id')`
(`recordatorio_comprobacion.ts:108-116`), que es el guardarraíl que este repo ya
tenía construido. Eso cierra el camino por el que el dinero se escribía dos veces.

Lo que impide llegar a 6: **la otra mitad del mismo CRÍTICO no se tocó.**
`unlock_viaje` sigue siendo un `delete ... where viaje_id = $1` sin token de dueño
(`0005_concurrencia.sql:45-50`) y `releaseViajeLock` lo llama incondicionalmente
(`conv.ts:620`); el arreglo del TTL quitó la forma de entrar por *vencimiento*,
pero dejó intacta la de entrar por el **fail-open** de `acquireViajeLock`. Y los
dos ALTO donde el dinero *no se escribe y nadie se entera* —el evento de Stripe
que se marca sin aplicar y el `corrio: true` de QStash— llevan **cuatro pases**
sin una sola prueba de ruta.

Compuerta corrida hoy por mí (HEAD `0f6ebce`, árbol limpio salvo `MAPA.md`):
`npx tsc --noEmit -p .` → **0 errores** · `npx vitest run` sobre
`conv_lock.test.ts`, `conv_lock_expira.test.ts`, `processor_lock.test.ts`,
`recordatorio_comprobacion.test.ts`, `stripe/webhook/route.test.ts`,
`cron/facturar/route.test.ts`, `visibilidad.test.ts` → **94 verdes, 7 archivos**.

**El riesgo mayor del rubro hoy:** un turno que pide el mutex durante un bache de
Supabase se lo concede a sí mismo (fail-open documentado) y, al terminar, **borra
el lease del turno que sí lo tenía** — no hay dueño en la tabla, así que el
candado que la 0005 existe para sostener se lo lleva quien nunca lo tuvo.

---

## Hallazgos abiertos de pases anteriores: qué pasó con cada uno

| Título | Estado | archivo:línea de hoy |
|---|---|---|
| **[CRÍTICO p3]** Lease del mutex (60 s) más corto que el turno | **CERRADO POR ARREGLO — la mitad del TTL** | `conv.ts:424` → `TTL_LOCK_VIAJE_MS`; `presupuesto.ts:223` = `PRESUPUESTO_WEBHOOK_MS` (120 s); prueba `conv_lock_expira.test.ts:50-84` (5 verdes) |
| **[CRÍTICO p3]** …y `unlock_viaje` borra el candado de quien sea | **REINCIDENTE** (mitad no atendida) | `conv.ts:618-624`, `0005_concurrencia.sql:45-50`. Ver N1 abajo |
| **[ALTO p3]** La consulta de comprobación puede venir recortada a 1,000 filas | **CERRADO POR ARREGLO** (`ea23059`) | `recordatorio_comprobacion.ts:108-116`: `traerTodo` + `conteo(d)` + `.order('id')` + `.range(d,h)`; `pg.ts:137-175` lanza `LecturaIncompleta` |
| **[ALTO p3]** `/api/cron/escalar` contesta 200 aunque los dos chequeos revienten | **REINCIDENTE** | `escalar/route.ts:64-83` (los dos `catch` escriben en `resultado`) y `:89` `return NextResponse.json(resultado)` sin `status` |
| **[ALTO p3]** Evento de Stripe no atribuible queda marcado como aplicado | **REINCIDENTE** | `stripe/webhook/route.ts:62-63` (marca antes), `:74` (`desmarcar` solo en el `catch`); las tres salidas mudas siguen en `:121`, `:130`, `:154` |
| **[BAJO p3]** `revisados` cuenta la lista ya filtrada | **REINCIDENTE** | `recordatorio_comprobacion.ts:156` (`revisados: viajes.length`) y `:188` (el `logger.info`) |
| **[ALTO p1]** El cron de facturación declara `corrio: true` cuando solo encoló | **REINCIDENTE** | `cron/facturar/route.ts:308` (el `if`) y `:324-330` (el `return`); `cola/route.ts:26-28` sigue devolviendo 503 sin que el cron se entere. `grep -n UPSTASH_QSTASH_TOKEN src/app/api/cron/facturar/route.test.ts` → vacío (20 pruebas, ninguna) |
| **[ALTO p1]** `updateGastoCfdiXml` descarta el error de su lectura | **REINCIDENTE** | `repo.ts:415` — sigue `const { data: actual } = await acotada(...)`. Contrasta con `repo.ts:926-927`, misma casa, sí comprueba `errLee` |
| **[ALTO p2]** El recordatorio sale por `sendText`, que fuera de 24 h no entrega, y el claim ya se quemó | **REINCIDENTE** | `recordatorio_comprobacion.ts:180` (`sendText`) contra `:162` (el claim, antes). `escalar_viaje.ts` sí hace el fallback a `sendTemplate` |
| **[ALTO p2]** La misma corrida puede mandar dos WhatsApps contradictorios | **REINCIDENTE** | `escalar/route.ts:65-83`: los dos bloques en serie, ninguno mira las columnas del otro |
| **[ALTO p2]** La 0087 sin compuerta de arranque alcanza todo el histórico | **REINCIDENTE** | `recordatorio_comprobacion.ts:55-62` — sin cota inferior de `fecha_inicio`, `.limit(100)` sin `order` |
| **[MEDIO p1]** La cola de QStash se presupuesta con los 300 s del cron | **REINCIDENTE** | `facturar/route.ts:25` (`maxDuration = 300`) y `:129` (`PRESUPUESTO_LOTE_MS = maxDuration * 1000`, constante de módulo) contra `cola/route.ts:11` (`maxDuration = 600`) |
| **[MEDIO p1]** Dos handlers resuelven `?tenant=` a mano sin mirar `error` | **MITAD CERRADA POR SUPRESIÓN, MITAD REINCIDENTE** | `dashboard/contador/cfdi/export/route.ts` **borrado** en `003c88a`. Sigue vivo `api/dashboard/asistente/route.ts:57`. Ver N3 |
| **[MEDIO p1]** `tenant.config` con lee-modifica-escribe desde dos módulos | **REINCIDENTE** | `administracion.ts:286-292` (`guardarPolitica`) y `repo.ts:926-935` (`actualizarFacilidad15`): los dos comprueban el error de lectura, ninguno usa condición de versión |
| **[MEDIO p2]** Dos lotes de envíos comparten 120 s sin medirlos | **REINCIDENTE** | `escalar/route.ts:11` (`maxDuration = 120`) y `:65-83`; nada en el archivo mide ese presupuesto |
| **[BAJO p1]** La URL destino del job firmado sale de la cabecera `Host` | **REINCIDENTE** | `facturar/route.ts:316` textual |
| **[BAJO p1]** `receiver.verify` sin `url` | **REINCIDENTE** | `cola/route.ts:36-39` |
| **[BAJO p1]** `/api/demo` parsea el cuerpo sin red | **REINCIDENTE** | `demo/route.ts:32` — `await req.json()` sin try/catch |
| **[BAJO p2]** Un viaje sin teléfono quema su recordatorio | **REINCIDENTE** | `recordatorio_comprobacion.ts:162` (claim) antes de `:172` (`if (!v.operadorTelefono)`) |
| **[BAJO p2]** `viajesSinComprobar` sin `order` ni filtro de `activo` | **REINCIDENTE** | `recordatorio_comprobacion.ts:55-62` |

**Cerrados por supresión: 1** (la mitad de `cfdi/export/route.ts` del MEDIO de
`?tenant=`). **Cerrados por arreglo: 2** (el TTL del CRÍTICO y el ALTO del
recorte). Todo lo demás de mi rubro sobrevivió al borrado: `src/app/api/` perdió
**cero** rutas (`git diff --stat 20ecbb1..HEAD -- src/app/api/` → vacío), y
`repo.ts`, `conv.ts`, `duplicados.ts`, `pg_errores.ts` y `processor.ts` no tienen
un solo cambio de master en esta ventana — el único diff en `src/lib/likida/` es
`analytics.ts` (+32) y `conv.ts` (+9, el arreglo del lease de esta misma rama).

---

## El código movido / nuevo: ¿el movimiento fue fiel?

### `a47d1d7` — `getLiquidaciones` de `cuadre/page.tsx` a `analytics.ts`: **fiel**

Comparé `git show 20ecbb1:src/app/dashboard/cuadre/page.tsx` (líneas 19-40)
contra `analytics.ts:1548-1567`. El cuerpo es **idéntico carácter por carácter**:

- el filtro de tenant sigue puesto — `.eq('tenant_id', tenantId)` (`:1555`);
- el `if (error) throw new Error(...)` sigue puesto (`:1560`), con su comentario
  de por qué (auditoría 5, frontend, CRÍTICO);
- **no se perdió ningún `exigir()` ni `traerTodo()` porque la versión vieja
  tampoco los tenía**: el `.limit(50)` de `:1556` es intencional ("las últimas
  50 de la tabla de Cuadre"), no un recorte disimulado — con un límite explícito
  y menor que `max_rows`, PostgREST no puede recortar en silencio.

Nota, no hallazgo: hoy **no tiene ni un llamador**
(`grep -rn "getLiquidaciones\b" src/` solo encuentra la definición). Se movió
precisamente para que borrar la página no se la llevara. Es deuda declarada, no
un bug.

### `6463e93` — server actions que ya no cierran sobre funciones locales: **no rompe el contrato**

De las 6 páginas que tocó, solo sobreviven dos. Leí las dos:

- `combustible-casetas/page.tsx:54-66`: `tenantYUsuarioDelAction(sufijo, tenantPedido)`
  subió a nivel de módulo y **conserva las dos comprobaciones**:
  `requireSessionTenant` (sesión REAL, no la previsualizada) y la revalidación de
  `puedeVerRuta` dentro de la acción. El `s.rol === 'superadmin' && tenantPedido`
  que gatea `resolverTenantPedido` sigue puesto.
- `suscripcion/page.tsx:40-48`: `tenantDelAction(tenantPedido)` igual, y las tres
  acciones (`:123`, `:165`, `:184`) siguen comprobando `puedeAdministrar(r)`
  **después** de resolver el tenant.

Lo que cambió es de dónde sale `sp?.tenant`: antes del closure de render, ahora
de un argumento explícito. Semánticamente es el mismo valor, con el mismo gate de
rol. `npx tsc --noEmit -p .` → 0. No encontré contrato roto aquí.

### `003c88a` — `opcionesDe` de `contador/comun.tsx` a `fiscal.ts`: **fiel**

`git show 003c88a^:src/app/dashboard/contador/comun.tsx` líneas 127-139 contra
`fiscal.ts:206-223`: idéntico, incluida la lógica de tres estados de `elegible15`
(`true` / `false` / `undefined` cuando la flota no declaró), que es lo que impide
ofrecerle el 15% a quien no le toca.

---

## Hallazgos

### [ALTO] El mutex del viaje se suelta por `viaje_id` sin dueño: el turno que entró por el fail-open borra, al salir, el lease del turno que sí lo tenía

`src/lib/likida/conv.ts:620` (`releaseViajeLock` → `rpc('unlock_viaje', { p_viaje: viajeId })`),
`supabase/migrations/0005_concurrencia.sql:45-50` (`delete from viaje_lock where viaje_id = p_viaje`, sin token),
`src/lib/likida/conv.ts:462-466` (el fail-open: `if (ultimoError) { logger.error('viaje.lock_error_persistente'); return true; }`),
`src/lib/likida/processor.ts:1751-1752` (`if (await acquireViajeLock(...)) { lockedViaje = viajeId; }` — **no distingue el `true` de "lo tengo" del `true` de "me rendí"**),
`src/lib/likida/processor.ts:2267` (`finally { if (lockedViaje) await releaseViajeLock(lockedViaje); }`).

**Escenario, con valores.** Viaje `44444444-…-0001`, folio `VJ-2026-0042`, chofer
manda seis fotos y "listo".

- **12:00:30** — turno A (`wamid.AAA`, el "listo") toma el lease legítimamente.
  Con el arreglo de `3404616` vale hasta **12:02:30** (`TTL_LOCK_VIAJE_MS` = 120 s).
- **12:00:34** — llega `wamid.BBB` ("¿ya quedó?"). Turno B entra a
  `acquireViajeLock(viajeId, { maxWaitMs: 12_000 })`. En ese momento el pooler de
  Supabase está saturado (o hay un `statement timeout`): cada `rpc('try_lock_viaje')`
  vuelve con un error **transitorio**, no con `data === false`.
- **12:00:46** — se agotan los 12 s. `conv.ts:463` escribe
  `viaje.lock_error_persistente` y **devuelve `true`** — el fail-open documentado
  ("se abre para no dejar al operador colgado").
- `processor.ts:1752` pone `lockedViaje = viajeId` **sin saber que no lo tiene**.
  El guard de `:1764` (`getOpenViaje(...) !== viajeId`) pasa: A todavía no cerró.
  Dos agentes corren sobre el mismo viaje. Eso ya es el modo de falla que
  `processor.ts:1725-1728` describe ("el operador recibe el cierre y el PDF DOS
  veces, y se paga el LLM dos veces") — pero es un trato aceptado y escrito.
- **12:00:52** — turno B termina (era una pregunta corta). Su `finally`
  (`:2267`) llama `releaseViajeLock` → `delete from viaje_lock where viaje_id = …`
  → **borra la fila de A**. Esto NO está escrito en ninguna parte, y no es un
  trato aceptado.
- **12:00:55** — llega `wamid.CCC` (otro "listo", el chofer insiste). `try_lock_viaje`
  no encuentra fila: `insert` limpio, lo concede al instante. Turno C arranca el
  ciclo completo mientras A sigue cuadrando. Entre medias entró por OCR la caseta
  de $1,400 que faltaba: A cierra con **$5,600**, C con **$7,000**. El
  `on conflict (viaje_id) do update` de `0013_guardar_liquidacion_tx.sql:33-44`
  sobrescribe la fila, el `upsert: true` de `tools.ts:180-183` sobrescribe los dos
  PDF en storage, y `guardar_liquidacion` no mira `viaje.estatus` antes de escribir.
  Ninguno de los dos caminos lanza.

**Consecuencia.** Es exactamente lo que el CRÍTICO del pase 3 describía, por la
puerta que el arreglo del TTL no cerró: el chofer tiene en el teléfono un PDF de
$5,600 y el contralor que aprieta "Descargar PDF"
(`api/export/pdf/[id]/route.ts:78-105`, que sirve `liquidacion.pdf_url`) baja uno
de $7,000, mismo folio y misma fecha. Y aplica igual a
`administracion.ts:419-479` (`reabrirViaje`): esa función **sí** comprueba el
`false` y aborta (`:420-425`), pero no puede distinguir el `true` honesto del
`true` del fail-open, y su `finally` (`:479`) borra el lease ajeno igual —
justamente durante la carrera borrar→re-crear que su docstring de `:372-392`
dice existir para cerrar.

**Prueba que lo cubra: NO existe, y lo digo con nombres.**
`conv_lock.test.ts:63` ("transitorio que no cede: acaba abriendo, pero después de
intentarlo") cubre que el fail-open devuelva `true`, y ahí se detiene: no hay
`releaseViajeLock` en ese archivo. `processor_lock.test.ts` tiene cuatro casos
(`:114`, `:127`, `:140`, `:148`), todos sobre `acquireViajeLock` devolviendo
`true`/`false` limpio, ninguno sobre soltar. `startup_mutex_ajeno.test.ts:53`
("si el lease es de otra invocación (try_lock=false), NO llama unlock_viaje")
cubre el `unlock` ajeno **solo para el probe de arranque** — `startup.ts:71-72`
documenta el peligro con todas sus letras y lo arregla **solo ahí**.
`grep -rn "releaseViajeLock" src --include=*.test.ts` → **cero coincidencias**.

**Causa raíz probable:** `viaje_lock` no guarda quién tomó el lease, así que
`unlock_viaje` no puede comprobar dueño; y `acquireViajeLock` devuelve el mismo
`true` para "lo tengo" y para "me rendí", de modo que el llamador no puede decidir
si le toca soltar.

---

### [ALTO] `/dashboard/[id]` se traga las 18 rutas que se borraron ayer y las contesta con un error de servidor, no con un 404

`src/app/dashboard/[id]/page.tsx:86` (`const d = await getLiquidacionDetalle(id, tenantId);`),
`src/lib/likida/analytics.ts:1154-1165` (`.eq('id', id)` sobre la columna `uuid`,
seguido de `exigir(res, 'getLiquidacionDetalle')`),
`src/lib/likida/pg.ts:33-36` (`exigir` **lanza** si `res.error`).
No hay ni una validación de forma del `id` en el camino: `grep -n "isUuid\|UUID\|22P02"`
sobre esos dos archivos → vacío.

**Escenario, con valores.** `2be4b1c` y `003c88a` borraron los directorios
`despacho/`, `viajes/`, `incidencias/`, `operadores/`, `cuadre/`, `facturacion/`,
`cobranza/`, `valor-ahorro/`, `unidades/`, `pod/`, `analitica/`, `chat/`,
`rentabilidad/`, `clientes/`, `mapa/`, `cotizador/`, `documentos/` y `contador/`.
En Next.js el segmento estático ganaba al dinámico; sin el directorio, esas **18
URL de un solo segmento pasan a coincidir con `[id]`**.

El contralor (rol `flota_admin`) abre el marcador que hizo ayer,
`https://app.likida.ai/dashboard/cuadre`:

1. `requireSessionTenant('/dashboard/cuadre')` → sesión válida, pasa.
2. `puedeVerArea('flota_admin', 'dinero')` → `true`, no redirige (`:53`).
3. `getLiquidacionDetalle('cuadre', '<tenant>')` construye
   `select … from liquidacion where id = 'cuadre'`. Postgres responde
   **`22P02: invalid input syntax for type uuid: "cuadre"`**.
4. `exigir` lo convierte en `throw new Error('getLiquidacionDetalle: invalid input syntax…')`.
5. La página revienta → sube al error boundary `dashboard/error.tsx`, que pinta
   **"No se pudo cargar el panel"** con un `digest`.

O sea: donde correspondía un 404 ("esa pantalla ya no existe") sale la pantalla
roja de fallo del sistema. Y no es un 404 disfrazado: `notFound()` (`:87`) nunca
se alcanza, porque el `throw` ocurre una línea antes.

**Consecuencia.** Para el contralor de Transportes Innovativos, que estuvo usando
`/dashboard/cuadre` y `/dashboard/viajes` en el demo del 6-ago: cualquier
marcador, cualquier entrada de historial y cualquier autocompletado del navegador
sobre esas 18 direcciones ahora dice que **el producto está roto**, no que la
pantalla se movió. Para el equipo: 18 URL distintas producen la misma línea
`getLiquidacionDetalle: invalid input syntax for type uuid` en el log, sin decir
que el problema es de ruteo. (Las 5 subrutas del contador —`/dashboard/contador/cfdi`
y hermanas— sí dan 404 limpio: son dos segmentos y `[id]` no las alcanza.)

**Prueba que lo cubra: no existe.** `ls src/app/dashboard/[id]/` devuelve
`page.tsx` y `loading.tsx` — ni un `.test.tsx`. Y la única puerta que sí trata el
error como error es la de API: `api/export/pdf/[id]/route.ts:85-88` comprueba
`error` y devuelve 500 con texto controlado (aunque para un id malformado el
código correcto tampoco sea 500). La página no hace ni eso.

**Causa raíz probable:** el contrato de `[id]` acepta cualquier string como id de
liquidación y lo pasa crudo a una columna `uuid`; mientras existieron las 18
páginas estáticas el defecto estaba tapado por el ruteo, y borrarlas lo destapó
de golpe.

---

### [MEDIO] El rail del asistente resuelve `?tenant=` sin mirar `error`, y el archivo que lo hace existe para impedir exactamente ese síntoma

`src/app/api/dashboard/asistente/route.ts:57` —
`const { data: t } = await supabaseAdmin().from('tenant').select('id, nombre').eq('id', pedido).maybeSingle();`
y `:58` `if (t) { tenantId = t.id; tenantNombre = t.nombre; }`. Sin `error`.
Contrastar con `tenant-api.ts:64-71` (`resolverTenantApi`), que en el mismo repo,
para la misma pregunta, devuelve **503** cuando la lectura falla; y con
`tenant-api.ts:92-98` (`resolverTenantPedido`), que **lanza**.

**Escenario, con valores.** Javier (superadmin) abre
`/dashboard?tenant=7f3e…-Transportes-Innovativos` para enseñar la flota del
cliente. La página resuelve su tenant con `resolverTenantEfectivo` y pinta las
cifras de Transportes. El rail —componente de cliente— pide
`/api/dashboard/asistente?tenant=7f3e…`. En ese instante hay un bache de red
contra Supabase: la consulta de `:57` vuelve con
`error = { message: 'fetch failed' }` y `data = null`. El `if (t)` no entra,
`tenantId` se queda en el de la sesión → **`tenantDemo()`** (`:51`), y
`tenantNombre` se queda en `null`.

Resultado en pantalla: la página dice "Transportes Innovativos · Comprobado
$847,300" y el rail de al lado dice, sin rótulo de flota, "$12,400". **Dos
verdades distintas en la misma pantalla** — que es, palabra por palabra, lo que el
encabezado de este archivo (`:6-9`) declara como su razón de existir.

**Consecuencia.** Es el único caso del repo donde un error de lectura no produce
un vacío sino una **cifra de otra flota**, y va sin marca: `errorCarga` (`:85`)
solo se pone si fallan `getKpis`/`getAcreditables`/`detectarAnomalias`, no si
falló la resolución del tenant. Rompe "nunca inventar una cifra" por la vía peor:
la cifra es real, pero de otra empresa. Si pasa en la sala, el contralor está
mirando el dinero de un tercero.

**Prueba que lo cubra: no existe.** `find src/app/api -name "*.test.ts"` devuelve
seis archivos (`cron/facturar/route.test.ts`, `cron/facturar/cola/*`,
`stripe/webhook/route.test.ts`, `demo/*`, `export/*`) y **ninguno** es de
`dashboard/asistente`.

**Causa raíz probable:** este handler es el que `tenant-api.ts` dice haber venido
a unificar ("el mismo criterio estaba escrito en `/api/dashboard/asistente`"), y
se unificó en los dos endpoints de export sin volver por el original.

---

## Lo que revisé y está bien

- **El arreglo del lease es real y fija la invariante, no el número.**
  `presupuesto.ts:206-223` ata `TTL_LOCK_VIAJE_MS` a `PRESUPUESTO_WEBHOOK_MS` con
  el argumento correcto (el techo duro, no la suma de eslabones estimada), y
  `conv_lock_expira.test.ts:66` ("la constante del lease no se puede quedar corta
  contra el peor caso") se pone roja si alguien sube `maxDuration` sin subir el
  lease. `:73` verifica que un `ttlMs` explícito se siga respetando — que es como
  `startup.ts` pide leases de 1 ms.
- **El arreglo del recorte usa el guardarraíl del repo, no una copia.**
  `recordatorio_comprobacion.ts:108-116` pasa por `traerTodo` con `conteo(d)` y
  `.order('id')`; `pg.ts:137-175` avanza por filas leídas (no por número de
  página, para sobrevivir a un `max_rows` bajo) y **lanza** `LecturaIncompleta`
  en vez de devolver el recorte. El `if (candidatos.length === 0) return []` de
  `:81` evita además el `in` vacío. 19 pruebas verdes en su archivo.
- **`resolverTenantApi` y `resolverTenantPedido` son el estándar correcto.**
  `tenant-api.ts:64-71` distingue "ese uuid no existe" (fallback silencioso, y
  está argumentado) de "no pude preguntar" (503); `:92-98` lanza. Los dos
  endpoints de export y las dos páginas con server action los usan.
- **`/api/cron/purgar` sigue siendo el modelo.** `purgar/route.ts:56-61` (500 sin
  secreto), `:75-78` (comprueba el `error` del RPC **por valor**, registra y
  devuelve 500), `:82-86` (igual con la excepción). Cero 200 con el fallo dentro.
- **El webhook de WhatsApp cierra el ciclo de contrapresión sin perder mensajes.**
  `webhook/whatsapp/route.ts:91-104` (cap de cuerpo → HMAC → parse con try/catch,
  en ese orden), `:49-59` (pool de 5 con `i++` justificado), `:244-249` (429 con
  `Retry-After` apoyado en la idempotencia de `claimMessage`), `:168-195` (un solo
  `after()` que **espera** `flushObservabilidad`). Es la única ruta del repo que
  espera la telemetría antes de morir.
- **El callback de QStash revalida antes de facturar.** `cola/route.ts:22-28`
  (503 si falta config), `:31-47` (firma verificada **antes** de tocar nada),
  `:50-54` (JSON con try/catch), y relee los `gasto` del lote con
  `.is('cfdi_uuid', null)` comprobando el `error`. El lote es ≤ `TOPE_POR_CORRIDA`,
  así que aquí el `in` no puede tocar el techo de 1,000.
- **El claim del recordatorio sigue siendo el único camino que cumple el ancla de 8.**
  `recordatorio_comprobacion.ts:198-215`: UPDATE condicional sobre la misma columna
  que pisa, acotado por `id` **y** `tenant_id`, cero filas = "perdí la carrera"
  (`:215`), error = fallo cerrado (`:211-213`). Pruebas con nombre: "DOS CORRIDAS
  SOLAPADAS: solo UNA gana el claim y manda el mensaje" y "el UPDATE va acotado por
  tenant, no solo por id".
- **`reabrirViaje` comprueba el `false` del lock y aborta con mensaje humano**
  (`administracion.ts:419-425`), y su orden de operaciones (borrar `liquidacion`
  → abrir `viaje` → limpiar `wa_conversacion`) está razonado para que un fallo
  intermedio deje el viaje **liquidado y coherente**, no abierto e incapaz de
  recibir gastos (`:452-462`).
- **`saveLiquidacion` sigue siendo una sola transacción.** `repo.ts:594-620` →
  `guardar_liquidacion_tx` (0013), que hace el upsert y el `update viaje` en la
  misma función plpgsql, y comprueba el `error` por valor.
- **`pg_errores.ts:40-45` exige el código 23505 ADEMÁS del nombre del índice**, y
  sus llamadores nombran el índice concreto. Sin cambios desde el pase 1.
- **`duplicados.ts` es puro** (`detectarDuplicadosEntreViajes`, sin I/O): no hay
  camino de concurrencia que auditar. Sin cambios.
- **`visibilidad.ts` reescrita no dejó una puerta abierta del lado de la API.**
  Las tres rutas que la usan (`export/liquidaciones/route.ts:47`,
  `export/pdf/[id]/route.ts:63`, `dashboard/asistente/route.ts:43`) gatean por
  `'dinero'`, y `puedeVerRuta` niega por default para toda ruta sin área
  (`visibilidad.ts:98-101`), así que las 18 rutas borradas quedaron negadas para
  todos los roles. `visibilidad.test.ts` → 35 verdes.
- **`getLiquidaciones` no perdió nada al mudarse** — ya detallado arriba.

---

## Lo que NO alcancé a revisar

- **Nada ejercitado contra una base, un Meta o un Stripe reales.** Los tres
  hallazgos nuevos están verificados por lectura de código, de SQL y del diff, y
  por la **ausencia comprobada** de pruebas que los cubran (con nombre de archivo
  y de caso). En particular no reproduje el `22P02` contra Postgres: la cadena
  `id: string` → `.eq('id', 'cuadre')` sobre `liquidacion.id uuid` → `exigir` que
  lanza está leída línea por línea, pero el código de error concreto lo tomo del
  comportamiento documentado de Postgres, no de una corrida.
- **Cuánto dura de verdad un bache del pooler de Supabase.** N1 necesita 12 s de
  errores transitorios seguidos (`maxWaitMs` por default en `processor.ts:1751`).
  La aritmética está, la medición no.
- **`processor.ts` completo** (136 KB). Leí el bloque del mutex (`:1700-1800`),
  el del XML (`:1380-1495`) y el `finally` (`:2245-2270`).
- **Las funciones plpgsql `intake_delta` y `mantenimiento_de_datos`**: caja negra.
  Sí abrí `try_lock_viaje`/`unlock_viaje` (0005) y `guardar_liquidacion_tx` (0013)
  porque N1 depende de su texto.
- **`escalar_viaje.ts` entero**: lo leí solo hasta confirmar que su fallback a
  `sendTemplate` existe y que el recordatorio no lo copió.
- **Las 18 URL huérfanas fuera de `src/`**: `grep` no encuentra ni un enlace vivo
  en el código (`grep -rn "'/dashboard/(viajes|contador|cuadre|…)"` → vacío), pero
  no revisé `docs/`, plantillas de Meta ni correos ya enviados.
