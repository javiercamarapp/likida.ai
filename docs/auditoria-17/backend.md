# Backend y API — auditoría 17 · pase 3 (10-ago-2026)

**Nota: 4/10** (antes 5). Razón del movimiento: **mirada más profunda**. El
arreglo `709e410` es real y cierra lo que dice cerrar en el caso del demo —con
cuatro pruebas propias, una de ellas de fallo cerrado—, y eso solo justificaría
subir. Lo que baja la nota es lo que abrí en este pase y los dos anteriores no:
**el mutex del viaje se pide con un lease de 60 s dentro de una invocación que el
propio repo presupuestó en 120 s y documentó con un peor caso de 72 s.** El lease
vence a mitad del turno, entra un segundo turno sobre el mismo viaje, y los dos
cierran: el `on conflict do update` de la 0013 y el `upsert: true` del storage
sobrescriben la liquidación y el PDF sin que ninguno de los dos caminos lance.
Eso es, con las palabras del ancla del brief, *el dinero escrito dos veces sin
que nadie se entere* — y el ancla fija la nota en 4 o menos. Sin ese hallazgo
esto sería un 6.

Compuerta corrida hoy por mí (HEAD `ce7ca09`, árbol limpio):
`npx tsc --noEmit -p .` → 0 · `npx vitest run` sobre
`recordatorio_comprobacion.test.ts`, `conv_lock.test.ts`, `processor_lock.test.ts`,
`stripe/webhook/route.test.ts`, `cron/facturar/route.test.ts`,
`escalar_viaje.test.ts` → **82 verdes**. Coincide con el MAPA.

**El riesgo mayor del rubro hoy:** un turno del agente que pase de 60 s suelta su
propio candado sin saberlo, y el segundo mensaje del mismo chofer reescribe la
liquidación y el PDF que el contralor ya tiene en la mano — con otras cifras y
sin un solo error en ningún log.

---

## Estado de los hallazgos que traía

### El CRÍTICO del pase 2

**[CRÍTICO] El recordatorio afirma "sin mandarme comprobantes" sin haber mirado
un solo comprobante** — **CERRADO por `709e410`**, con reserva (ver N1 abajo).

Cómo lo verifiqué, no por el mensaje del commit:

- Abrí `src/lib/likida/recordatorio_comprobacion.ts:95-106`. La segunda lectura
  existe: `.from('gasto').select('viaje_id').in('viaje_id', candidatos.map(...))`,
  y `:105-106` filtra con un `Set` los que ya tienen algo.
- **Falla cerrado de verdad**: `:103` es `if (errGasto) throw new Error(...)`,
  no un `?? []`. La excepción sube por `viajesSinComprobar` →
  `enviarRecordatoriosComprobacion` → el `try` de `escalar/route.ts:75-83`. Con
  la base caída no sale un solo mensaje. Esto es lo que el brief me pidió
  comprobar y **sí está**.
- **El sello no se quema** en el viaje que sí tenía gastos: el filtro ocurre
  ANTES del `for` que reclama (`:143-145`), así que el viaje descartado conserva
  `recordatorio_comprobacion_en IS NULL` y sigue disponible. La prueba lo afirma
  explícitamente (`recordatorio_comprobacion.test.ts:279`, `expect(updates).toEqual([])`).
- **Las pruebas son cuatro y ejercitan el mecanismo, no el nombre**: el arnés
  aprendió a contestar distinto por tabla (`cadenaLectura(tabla)` +
  `lecturaPorTabla`), y hay caso mixto (`v-con` con gasto / `v-sin` sin gasto)
  que verifica que el UPDATE solo cae sobre `v-sin`. La de fallo cerrado usa
  `rejects.toThrow(/connection reset/)` y comprueba `sendText` no llamado.
- **Sin secuela en el cron `escalar`**: el nuevo throw entra por el mismo
  `catch` que ya existía (`escalar/route.ts:79-83`), no ciega al bloque 1, y no
  cambia el orden de nada. Lo que sí deja es que el fallo se convierta en un 200
  — pero eso ya estaba antes del arreglo y va como N2.

**La reserva:** la consulta que se agregó **no tiene tope ni paginación**, y el
comentario que la acompaña (`:92-94`) dice *"se pide `limit` amplio"* sobre un
código que no pide ningún `limit`. Con más de 1,000 gastos en el lote, PostgREST
recorta en silencio y el CRÍTICO vuelve, más estrecho. Va como N1.

### Los ocho del pase 1

Reverificados uno por uno abriendo el archivo. `git diff --stat 94c0733..HEAD`
sobre `src/app/api/`, `repo.ts`, `conv.ts`, `duplicados.ts`, `pg_errores.ts`
devuelve **solo** `cron/escalar/route.ts`, `processor.ts`, `proxy.ts` y
`recordatorio_comprobacion.ts`: ninguno de los ocho vive en esos cuatro.

1. **[ALTO] El cron de facturación declara `corrio: true` cuando solo encoló** —
   **REINCIDENTE**. `src/app/api/cron/facturar/route.ts:324-330`: el
   `return NextResponse.json({ corrio: true, encolado: true, messageId, tickets, quedaron })`
   sigue dentro del `if (process.env.UPSTASH_QSTASH_TOKEN && lote.length > 0)`
   (`:308`), y `cola/route.ts:26-28` sigue devolviendo 503 sin que el cron se
   entere. `grep -n UPSTASH_QSTASH_TOKEN src/app/api/cron/facturar/route.test.ts`
   → vacío. Sigue sin una sola prueba. La nota colateral también: `:258` sigue
   calculando `modo` sin usarlo en el `GET`.
2. **[ALTO] `updateGastoCfdiXml` descarta el error de su lectura** —
   **REINCIDENTE**. `src/lib/likida/repo.ts:415-419`: sigue siendo
   `const { data: actual } = await acotada(...)` sin `error`. Un fallo de lectura
   se lee como "no había `ocr_extra`" y `:419` escribe el objeto reconstruido
   encima. Contrasta con `repo.ts:926-927` (`actualizarFacilidad15`), que sí
   comprueba `errLee` — la misma casa, dos criterios.
3. **[MEDIO] La cola de QStash se presupuesta con los 300 s del cron** —
   **REINCIDENTE**. `facturar/route.ts:25` sigue en `maxDuration = 300`;
   `cola/route.ts:11` en 600; `PRESUPUESTO_LOTE_MS` sigue siendo constante de
   módulo, así que el worker de 10 min mide contra el presupuesto de 5.
4. **[MEDIO] Dos handlers resuelven `?tenant=` a mano sin mirar `error`** —
   **REINCIDENTE**. `src/app/api/dashboard/asistente/route.ts:57` y
   `src/app/dashboard/contador/cfdi/export/route.ts:55`, los dos con
   `const { data: t } = await supabaseAdmin().from('tenant')…maybeSingle()`.
   `resolverTenantApi` sigue cableado solo en los dos endpoints de `export`
   (`api/export/pdf/[id]/route.ts:39`, `api/export/liquidaciones/route.ts:24`).
5. **[MEDIO] `tenant.config` con lee-modifica-escribe desde dos módulos** —
   **REINCIDENTE**. `administracion.ts:265-292` (`guardarPolitica`) y
   `repo.ts:921-935` (`actualizarFacilidad15`) leen el jsonb entero, lo mutan en
   Node y lo reescriben completo. Los dos comprueban su error de lectura, pero
   ninguno usa condición de versión: dos escrituras solapadas se pisan, y la que
   pierde no se entera.
6. **[BAJO] La URL destino del job firmado sale de la cabecera `Host`** —
   **REINCIDENTE**. `facturar/route.ts:316`:
   `process.env.NEXT_PUBLIC_APP_URL ?? \`https://${req.headers.get('host')}\``.
7. **[BAJO] `receiver.verify` sin `url`** — **REINCIDENTE**.
   `cola/route.ts:34-38`: sigue `receiver.verify({ signature, body })`.
8. **[BAJO] `/api/demo` parsea el cuerpo sin red** — **REINCIDENTE**.
   `src/app/api/demo/route.ts:32`: `const body = (await req.json()) as {…}` sin
   try/catch, después del cap de tamaño y del rate limit. Un cuerpo no-JSON
   revienta con un 500 sin cuerpo controlado.

---

## Hallazgos nuevos

### [CRÍTICO] El lease del mutex del viaje (60 s) es más corto que el turno que protege (hasta ~85 s), y `unlock_viaje` borra el candado de quien sea

`src/lib/likida/conv.ts:419` (`const ttlMs = opts?.ttlMs ?? 60_000;`),
`src/lib/likida/processor.ts:1751` (única llamada del camino de texto: pasa
`maxWaitMs`, **nunca** `ttlMs`), `src/lib/likida/presupuesto.ts:186-195`
(`PRESUPUESTO_WEBHOOK_MS = 120_000`, con el comentario que dice *"el peor caso de
la ruta son ~72s: lock (≤12s) + espera de intake (20s) + cuadre (~40s)"*),
`src/lib/likida/conv.ts:613-618` (`releaseViajeLock`) y
`supabase/migrations/0005_concurrencia.sql:45-50` (`unlock_viaje` es un
`delete from viaje_lock where viaje_id = p_viaje`, sin token de dueño).

**Escenario, con valores.** El chofer manda seis fotos y "listo".

- `processor.ts:1718` espera el intake (hasta 20 s) **fuera** del candado.
- `processor.ts:1751` toma el lease a las **12:00:32** con TTL de 60 s → vence
  **12:01:32**.
- El presupuesto que le queda al agente es `restante() = 120 000 − 12 000 −
  32 000 = 76 000 ms` (`presupuesto.ts:222`). O sea: **el reloj de la invocación
  autoriza explícitamente al agente a correr 76 s mientras sostiene un candado de
  60 s.** El turno típico usa ~20 s, pero el repo subió `maxDuration` de 60 a 120
  justamente porque 60 no alcanzaba; nadie subió el lease.
- A las **12:01:40** el chofer manda "¿ya?". Nuevo `waMessageId` → `claimMessage`
  dice `nuevo`. `try_lock_viaje` ve `locked_until (12:01:32) < now()` y **lo
  concede** (`0005:31-43`). El guard de `processor.ts:1764`
  (`getOpenViaje(...) !== viajeId`) **pasa**: el turno 1 todavía no ha cerrado.
- Dos turnos corren el agente sobre el mismo viaje. Los dos llaman
  `guardar_liquidacion` (`tools.ts:161-193`), que **no comprueba
  `viaje.estatus`** antes de escribir.
- Turno 1 cierra a las 12:01:50 con $5,600 comprobados, sube
  `t/v.pdf` y `t/v-operador.pdf` con **`upsert: true`** (`tools.ts:180-189`, el
  flag en `:183`) y
  manda el PDF por WhatsApp.
- Turno 2 cierra a las 12:02:20. Entre medias entró por OCR la caseta de $1,400
  que faltaba, así que `computeCuadre` da **$7,000**. El
  `on conflict (viaje_id) do update set total_comprobado = excluded…` de
  `0013_guardar_liquidacion_tx.sql:33-44` **sobrescribe la fila**, el
  `upsert: true` **sobrescribe el PDF en storage**, y el RPC devuelve el mismo
  `id` sin lanzar. Los dos caminos reportan éxito.
- Y de remate: el `finally` del turno 1 (`processor.ts:2266-2267`) llama
  `releaseViajeLock`, que **borra el lease del turno 2** — un tercer mensaje
  entra sin esperar.

**Consecuencia.** El chofer tiene en su teléfono un PDF que dice $5,600 y la
base dice $7,000. El contralor que aprieta "Descargar PDF"
(`api/export/pdf/[id]/route.ts:93-105`, que sirve `liquidacion.pdf_url`) baja el
segundo documento, distinto del que su chofer le reenvió, con el mismo folio y la
misma fecha. Es exactamente el modo de falla que `processor.ts:1725-1728`
describe como la razón de existir del candado (*"el operador recibe el cierre y el
PDF DOS veces, y se paga el LLM dos veces"*), y la defensa que `repo.ts:603-604`
invoca —*"con unique(viaje_id) dos cierres concurrentes producen UN registro (el
motor es determinístico)"*— solo vale si los dos turnos ven los mismos gastos,
que es precisamente lo que el mutex y la barrera de intake existen para
garantizar.

**Prueba que lo cubra: NO existe, y lo digo con nombres.** `conv_lock.test.ts:27-68`
tiene seis casos: adquiere a la primera, ocupado-reintenta, ocupado-todo-el-rato,
RPC ausente, error transitorio, transitorio persistente. **Ninguno hace vencer el
lease a mitad del turno**, y ninguno pasa `ttlMs`. `processor_lock.test.ts:102-152`
tiene cuatro casos, todos sobre `acquireViajeLock` devolviendo `true`/`false`, no
sobre el lease expirando. `startup_mutex_ajeno.test.ts` cubre el `unlock_viaje`
ajeno **solo para el probe de arranque**, no para el camino del processor.
`grep -rn "ttlMs\|locked_until" src --include=*.test.ts` → cero coincidencias.

**Causa raíz probable:** el TTL del lease es una constante de `conv.ts` que nadie
ajustó cuando `maxDuration` pasó de 60 a 120 s, y `unlock_viaje` libera por
`viaje_id` sin comprobar quién lo tomó, así que el que llega tarde suelta el
candado del que llegó después.

---

### [ALTO] La consulta que `709e410` agregó para no mentir puede venir recortada a 1,000 filas, y entonces vuelve a mentir

`src/lib/likida/recordatorio_comprobacion.ts:95-98` — sin `.limit()`, sin
`range`, sin `count`, sin `traerTodo`. El comentario de `:92-94` afirma *"Se pide
`limit` amplio porque lo único que importa es la EXISTENCIA de una fila por
viaje"*: **no se pide ningún limit.** Contrastar con `src/lib/likida/pg.ts:38-48`
(*"PostgREST recorta en silencio a `max_rows` (1,000 por default) sin avisar — no
lanza, no loguea"*) y con `src/app/api/export/liquidaciones/route.ts:64-79`, que
para el mismo problema sí usa `traerTodo` + `conteo`.

**Escenario, con valores.** La consulta de arriba (`:54-61`) trae hasta **100**
viajes candidatos. La de `gasto` pide una fila **por gasto**, no por viaje. Una
flota con 40 unidades acumula viajes abiertos con diésel ×3, casetas ×6, fianzas,
maniobras: 12 gastos por viaje es corriente. 100 × 12 = **1,200 filas** → PostgREST
devuelve **1,000** y calla. La consulta no lleva `order`, así que cuáles 200 se
caen es arbitrario. Los viajes cuyas filas quedaron del lado cortado no entran al
`Set` de `:105`, y `:106` los devuelve como candidatos limpios.

Y esto se compone con el hallazgo del pase 2 que sigue abierto (la 0087 sin
compuerta de arranque): la primera corrida tras el despliegue es exactamente la
que llena los 100 cupos con viejos viajes abiertos, que son los que más gastos
acumulados tienen. Es el peor momento posible para el recorte.

Resultado: al chofer de `VJ-2026-0042`, que subió catorce recibos, le llega
*"Llevas 9 días con tu viaje VJ-2026-0042 sin mandarme comprobantes. 📋"*, y el
sello se quema para siempre.

**Consecuencia.** Vuelve el CRÍTICO que este commit cerró, en el rango en que
importa (una flota de verdad, no el seed de dos gastos), y por el camino que el
CLAUDE.md llama *"la familia de bugs más repetida del repo"*. Para el chofer: una
acusación falsa firmada por el producto. Para el equipo: indistinguible de "no
había gastos", porque no hay log de cuántas filas volvieron.

**Prueba que lo cubra: no existe.** Las cuatro pruebas nuevas devuelven listas de
1 y 2 filas (`recordatorio_comprobacion.test.ts:268-317`); el arnés
(`cadenaLectura`) ni siquiera modela un recorte, porque devuelve entero lo que le
pongan sin mirar el `limit`.

**Causa raíz probable:** la segunda lectura se escribió como un `in` a pelo en
vez de pasar por `traerTodo`/`conteo`, que es el borde que este repo ya tiene
construido para exactamente esto; el comentario documenta un `limit` que no llegó
a escribirse.

---

### [ALTO] `/api/cron/escalar` contesta 200 aunque los dos chequeos hayan reventado — y el archivo argumenta en contra de eso 40 líneas más arriba

`src/app/api/cron/escalar/route.ts:65-83` (los dos `catch` que escriben
`resultado.aceptacion = { error }` / `resultado.comprobacion = { error }`) y
`:89` (`return NextResponse.json(resultado)`, sin `status`, o sea **200**).

**Escenario, con valores.** Rotan la llave de service-role de Supabase y no se
actualiza `SUPABASE_SERVICE_ROLE_KEY` en Vercel. A las 13:00 corre el cron:

- bloque 1 lanza → `resultado.aceptacion = { error: 'Invalid API key' }`;
- bloque 2 lanza en `viajesSinComprobar` (`:63`) → `resultado.comprobacion =
  { error: 'viajesSinComprobar: Invalid API key' }`;
- la ruta devuelve **HTTP 200** con
  `{"aceptacion":{"error":"…"},"comprobacion":{"error":"…"}}`.

Vercel Cron marca la corrida como **exitosa** (solo un no-2xx la marca fallida).
Se repite 24 veces al día. Ni un viaje escalado, ni un recordatorio enviado,
durante semanas.

El único otro canal es `logger.error`, que llega a Sentry por
`logger.ts:149` → `void import('./observability/sentry').then(s => s.reportar(...))`
— **fire-and-forget**, y esta ruta no llama `flushObservabilidad()`
(`grep -rn flushObservabilidad src` solo la encuentra en
`api/webhook/whatsapp/route.ts:194`). El propio `sentry.ts:39` avisa de que hay
que esperar los envíos antes de que la invocación se congele. En una función que
devuelve y muere, el evento tiene buena probabilidad de no salir nunca.

**La contradicción está en el mismo archivo.** `:33-40` argumenta, con todas sus
letras, por qué la falta de `CRON_SECRET` devuelve **500 y no 200**: *"un 200 le
diría a Vercel que la corrida salió bien, el cron se vería verde en el panel para
siempre, y nadie se enteraría de que la escalación lleva meses sin correr"*. Ese
razonamiento se aplicó al caso improbable (nadie configuró el secreto) y no al
probable (la corrida reventó). Compárese con `cron/facturar/route.ts:339-343` y
`cron/purgar/route.ts:75-78`, que en el mismo repo sí devuelven **500**.

**Consecuencia.** Para el equipo: el modo de falla que las tres rutas de cron
dicen existir para cerrar, abierto en la única de las tres que manda WhatsApp a
personas. Para la flota: los viajes sin aceptar y los recordatorios dejan de
salir y el síntoma es indistinguible de "no había nada que hacer".

**Prueba que lo cubra: no existe.** No hay `route.test.ts` bajo
`src/app/api/cron/escalar/`: `find src/app/api -name "*.test.ts"` devuelve seis
archivos y ninguno es de esta ruta.

**Causa raíz probable:** el código de salida se decidió por "la ruta no lanzó" en
vez de por "los chequeos hicieron su trabajo".

---

### [ALTO] Un evento de Stripe que no se pudo atribuir queda marcado como aplicado, y el reintento —incluido el reenvío manual— lo salta

`src/app/api/stripe/webhook/route.ts:62-63` (`marcarEvento` ANTES de aplicar) y
`:74` (`desmarcar` **solo** en el `catch`), contra las tres salidas de `aplicar`
que devuelven sin aplicar y sin lanzar: `:118-123` (sin tenant), `:128-131`
(price desconocido), `:152-155` (factura sin tenant). Y
`src/lib/saas/suscripcion.ts:288`, cuyo comentario cristaliza el supuesto falso:
*"23505 = unique_violation: ya estaba, o sea que **ya se aplicó**"*.

**Escenario, con valores.** Javier crea en el panel de Stripe el price
`price_1QzEmpresa` para el plan Empresa a $4,900 MXN/mes y olvida escribir
`stripe_price_id` en la fila de `plan`. Una flota contrata:

1. Llega `customer.subscription.created`, id `evt_1AbC`. `marcarEvento` **inserta**
   la fila en `evento_stripe` y devuelve `true` (`suscripcion.ts:283-287`).
2. `aplicar` resuelve el tenant por metadata, llama `planDePrice('price_1QzEmpresa')`
   → `null`, registra `stripe.suscripcion.price_desconocido` y hace **`return`**
   (`route.ts:128-131`).
3. `POST` devuelve **200 `{ok:true}`**. Stripe da el evento por entregado y **no
   reintenta**.
4. Javier ve el log, arregla la fila de `plan`, y aprieta **Resend** en el panel
   de Stripe. Llega el **mismo** `evt_1AbC`: `marcarEvento` choca con el 23505 y
   devuelve `false` → `route.ts:63` contesta `{ok:true, repetido:true}` **sin
   aplicar nada**.

La flota pagó, `suscripcion` sigue sin fila, y la única salida es escribirla a
mano. Lo mismo con `:118-123` cuando `customer.subscription.updated` llega para un
customer cuya fila de `suscripcion` aún no existe (`tenantDeCustomer` es un
`select` sobre `suscripcion`, `suscripcion.ts:433-443`): el evento que **crearía**
la relación se marca y se descarta.

**Consecuencia.** Dinero cobrado sin producto entregado, y el mecanismo de
recuperación que Stripe ofrece (reintento y reenvío) queda desarmado por el
candado de idempotencia. El comentario de `route.ts:25-27` promete lo contrario:
*"SE CONTESTA 200 SOLO SI SE APLICÓ"*.

**Prueba que lo cubra: no existe.** `src/app/api/stripe/webhook/route.test.ts`
tiene cinco casos (`:54,:61,:68,:79,:89`): sin secreto, firma inválida, evento
nuevo, evento repetido y `aplicar` que **lanza**. Ninguno ejercita una salida de
`aplicar` que devuelve sin aplicar.

**Causa raíz probable:** el candado se pone antes de aplicar (correcto) pero solo
se suelta cuando `aplicar` lanza; las salidas de "no pude atribuir" salen por
`return`, que es indistinguible de "aplicado" para el marcador.

---

### [BAJO] Tras el arreglo, `revisados` del recordatorio ya no cuenta lo revisado, y con eso se pierde la única señal que delataría el recorte de N1

`src/lib/likida/recordatorio_comprobacion.ts:139`
(`revisados: viajes.length`, sobre la lista **ya filtrada**) y `:171`
(`logger.info('viaje.recordatorio_comprobacion', { revisados, recordados, fallos })`).

**Escenario.** El cron corre sobre 100 candidatos y los 100 tienen gastos.
El log dice `{revisados: 0, recordados: 0, fallos: 0}` — el mismo renglón,
carácter por carácter, que cuando no había ni un viaje vencido.

**Consecuencia.** Para el equipo: no hay forma de distinguir "no había nada" de
"había cien y todos estaban al corriente", ni de notar que la consulta de `gasto`
está descartando de más (N1) o de menos. Es la misma ambigüedad que este repo
persigue en `exigir()` y en `intakeDelta`, movida de sitio por el arreglo.

**Causa raíz probable:** el filtro nuevo se metió dentro de `viajesSinComprobar`,
que era la función de la que salía el conteo de "revisados"; el rótulo se quedó.

---

## Lo que revisé y está bien

- **`709e410` falla cerrado de verdad y no deja secuela en el cron** — ya
  detallado arriba. `recordatorio_comprobacion.ts:103` lanza; el throw sube por
  `escalar/route.ts:79-83` sin cegar al bloque 1; el sello no se quema en el
  viaje descartado (`:143-145` corre después del filtro), y la prueba lo afirma.
- **El claim del recordatorio sigue siendo correcto Y con prueba propia.**
  `recordatorio_comprobacion.ts:181-199`: UPDATE condicional sobre la misma
  columna que pisa, acotado por `id` **y** `tenant_id`, cero filas tratada como
  "perdí la carrera" (`:198`) y error tratado como fallo cerrado (`:194-197`).
  Prueba: `recordatorio_comprobacion.test.ts` — "DOS CORRIDAS SOLAPADAS: solo UNA
  gana el claim y manda el mensaje" (`:179`), más "el UPDATE va acotado por tenant,
  no solo por id" (`:215`).
  Este camino sí cumple el ancla de 8.
- **`/api/cron/purgar` es el modelo de cómo debería salir `escalar`.**
  `purgar/route.ts:75-78` comprueba el `error` del RPC por valor, lo registra y
  devuelve **500**; `:82-86` hace lo mismo con la excepción. Nada de 200 con el
  fallo dentro.
- **El callback de QStash revalida antes de facturar.**
  `cron/facturar/cola/route.ts:58-68`: relee los `gasto` del lote con
  `.is('cfdi_uuid', null)` y comprueba el `error` (devuelve 500 → QStash
  reintenta). El lote es de ≤`TOPE_POR_CORRIDA` filas, así que aquí el `in` no
  puede tocar el techo de 1,000 (a diferencia de N1). La firma se verifica
  **antes** de tocar nada (`:31-47`) y el JSON se parsea con try/catch (`:50-54`).
- **Los dos endpoints de export son el estándar del repo.**
  `api/export/liquidaciones/route.ts:24-79`: `resolverTenantApi` + `puedeVerArea`
  + `puedeExportar` + filtro explícito de tenant + `traerTodo` con `conteo` y
  `LecturaIncompleta` traducida a 500 con mensaje humano.
  `api/export/pdf/[id]/route.ts:78-105`: filtro por tenant explícito sobre el
  service-role, `error` distinguido de `!data?.pdf_url`, 404 indistinguible entre
  "no existe" y "no tiene papel", y URL firmada de 60 s.
- **El webhook de WhatsApp cierra el ciclo de contrapresión sin perder mensajes.**
  `webhook/whatsapp/route.ts:91-104` (cap de cuerpo antes del HMAC, HMAC antes
  del parse, JSON con try/catch), `:49-59` (pool de 5, `i++` sin candado
  justificado), `:244-249` (429 con `Retry-After` para que Meta reentregue lo
  aplazado, apoyado en la idempotencia de `claimMessage`), `:168-195` (un solo
  `after()` con `flushObservabilidad` al final). Es la única ruta del repo que
  espera la telemetría antes de morir.
- **`claimMessage` distingue los tres estados.** `conv.ts:343-354`: `nuevo` /
  `duplicado` (23505) / `indeterminado`, y el llamador decide. Lo contrario —
  tratar cualquier error como duplicado — era el bug documentado en `:331-341`.
- **`pg_errores.ts:40-45` exige el código 23505 ADEMÁS del nombre del índice**,
  así que un mensaje que mencione el índice por casualidad no se traga un error
  real. Sus cuatro llamadores (`al_vuelo.ts:528-530`, `conv.ts:269`,
  `processor.ts:1019,1053`) nombran el índice concreto, nunca la categoría.
- **`duplicados.ts` es puro** (`detectarDuplicadosEntreViajes`, una función sin
  I/O): no hay camino de concurrencia que auditar ahí.
- **`traerTodo` (`pg.ts:137-175`) cumple su contrato**: avanza por filas leídas y
  no por número de página (para sobrevivir a un `max_rows` bajo), y lanza
  `LecturaIncompleta` en vez de devolver un recorte. Es la pieza que N1 no usa.
- **`proxy.ts` sigue limpio tras el retiro del rol `operador`**: `:110` reduce
  `RUTAS_CON_SESION` a `['/dashboard','/admin']`, `npx vitest run src/proxy.test.ts`
  → 11 verdes.

---

## Lo que NO alcancé a revisar

- **Nada ejercitado contra una base, un Meta o un Stripe reales.** Los cuatro
  hallazgos nuevos están verificados por lectura de código y de SQL, y por la
  ausencia comprobada de pruebas que los cubran (con nombre de archivo y de
  caso). El del lease del mutex (N1 CRÍTICO) depende de un turno del agente que
  pase de 60 s: la aritmética del presupuesto lo autoriza (76 s de techo) y el
  repo documenta un peor caso de 72 s, pero **no medí una latencia real de
  `runAgent` en producción**.
- **`processor.ts` completo** (136 KB). Leí los bloques del mutex
  (`:1700-1800`), el `finally` (`:2240-2270`) y el del XML (`:1380-1490`).
- **Las funciones plpgsql `intake_delta` y `mantenimiento_de_datos`**: caja
  negra. Sí abrí `try_lock_viaje`/`unlock_viaje` (0005) y
  `guardar_liquidacion_tx` (0013) porque el CRÍTICO depende de su texto.
- **`administracion.ts:372-479`** (`reabrirViaje`, que toma el mismo lock con el
  mismo TTL de 60 s): lo leí lo justo para confirmar que hereda el defecto de N1,
  no audité el resto de su flujo.
- **Aviso al orquestador, no hallazgo del código:** a las 11:07 una corrida de
  `npx tsc --noEmit -p .` reportó
  `recordatorio_comprobacion.ts(104,64): error TS18047: 'errGasto' is possibly 'null'`.
  **No es reproducible**: cuatro corridas posteriores (una con
  `tsconfig.tsbuildinfo` borrado) dan 0 errores y `git status` quedó limpio. El
  `mtime` del archivo (11:11:14) demuestra que **otro agente estaba editando el
  mismo árbol de trabajo mientras yo auditaba**. Lo dejo escrito porque una
  compuerta corrida sobre un árbol que otro agente muta no es una compuerta.

---

# Backend y API — auditoría 17 (pase 2)

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura**. Los
siete hallazgos del pase 1 siguen abiertos sin una línea tocada (lo verifiqué con
`git diff 94c0733..HEAD` sobre cada archivo: `cron/facturar/`, `repo.ts`,
`api/demo/`, `asistente/route.ts`, `cfdi/export/route.ts` no tienen ni un cambio;
`administracion.ts` sí cambió, pero en `crearFlota`, no en `guardarPolitica`).
Encima entró un camino nuevo que **manda WhatsApp solo a personas reales** —
`recordatorio_comprobacion.ts` — y ahí la disciplina de concurrencia sí subió
(el claim tiene prueba propia, cosa que QStash nunca tuvo), pero el **contrato de
selección** no: la consulta que decide a quién escribirle no comprueba ninguna de
las tres cosas que el mensaje afirma.

Compuerta corrida hoy por mí: `npx vitest run src/lib/likida/recordatorio_comprobacion.test.ts
src/lib/likida/escalar_viaje.test.ts src/proxy.test.ts` → 54 verdes. Coincide con
el MAPA.

**El riesgo mayor del rubro hoy:** el cron de las :00 puede mandarle al chofer del
viaje del demo —el teléfono de Javier, `seed.sql:75`— un mensaje que dice "llevas
N días sin mandarme comprobantes" sobre un viaje que tiene dos comprobantes
cargados y a la vista en la pantalla.

---

## Estado de los hallazgos del pase 1

Ninguno cerrado. Siete de siete **REINCIDENTES**, y los verifiqué por línea, no
por diff:

1. **[ALTO] El cron de facturación declara `corrio: true` cuando solo encoló** —
   **REINCIDENTE**. `cron/facturar/route.ts:308-330` intacto: sigue el
   `return NextResponse.json({corrio: true, encolado: true, …})` dentro del `if
   (process.env.UPSTASH_QSTASH_TOKEN …)`, y `cola/route.ts:25-28` sigue
   devolviendo 503 sin que el cron se entere. `grep UPSTASH_QSTASH_TOKEN
   src/app/api/cron/facturar/route.test.ts` → **vacío**; `grep -rn "facturar/cola"
   src --include=*.test.ts` → **vacío**. Sigue sin una sola prueba.
   La nota colateral también: `route.ts:258` sigue calculando `modo` sin usarlo.
2. **[ALTO] `updateGastoCfdiXml` descarta el error de su lectura y reemplaza
   `ocr_extra`** — **REINCIDENTE**. `repo.ts:415-419` sigue siendo
   `const { data: actual } = await acotada(...)` sin `error`, y `:419-420`
   sigue escribiendo `extra.ocr_extra = ocrExtra` completo.
3. **[MEDIO] La cola de QStash se presupuesta con los 300 s del cron** —
   **REINCIDENTE**. `route.ts:25` sigue en `maxDuration = 300` y `cola/route.ts:11`
   en 600; `PRESUPUESTO_LOTE_MS` sigue siendo constante de módulo.
4. **[MEDIO] Dos handlers resuelven `?tenant=` a mano sin mirar `error`** —
   **REINCIDENTE**. `api/dashboard/asistente/route.ts:57` sigue con
   `const { data: t } = await supabaseAdmin().from('tenant')…maybeSingle()`;
   `dashboard/contador/cfdi/export/route.ts:55` igual. `resolverTenantApi` sigue
   cableado solo en los dos endpoints de `export`.
5. **[MEDIO] `tenant.config` con lee-modifica-escribe desde dos módulos** —
   **REINCIDENTE**. `administracion.ts` cambió en esta ventana (`crearFlota`,
   régimen 624), pero `guardarPolitica` y `repo.ts:926-934` (`actualizarFacilidad15`)
   siguen exactamente igual.
6. **[BAJO] La URL destino del job firmado sale de la cabecera `Host`** —
   **REINCIDENTE**. `cron/facturar/route.ts:316` textual.
7. **[BAJO] `receiver.verify` sin `url`** — **REINCIDENTE**.
   `cola/route.ts:36-39`: sigue `receiver.verify({ signature, body })`.
8. **[BAJO] `/api/demo` parsea el cuerpo sin red** — **REINCIDENTE**.
   `api/demo/route.ts:32`: `const body = (await req.json()) as {…}` sin try/catch.

---

## Hallazgos

### [CRÍTICO] El recordatorio afirma "sin mandarme comprobantes" sin haber mirado un solo comprobante

`src/lib/likida/recordatorio_comprobacion.ts:54-61` (la consulta) y `:84-92`
(el texto). Contrastar con `supabase/migrations/0087_recordatorio_comprobacion.sql:5`,
que describe la funcionalidad como *"un viaje abierto/en_cuadre con `fecha_inicio`
vieja **y sin comprobantes recientes**"*.

**Escenario, con valores.** La consulta filtra por cuatro cosas:
`estatus in ('abierto','en_cuadre')`, `recordatorio_comprobacion_en is null`,
`fecha_inicio is not null` y `fecha_inicio <= hoy-3d`. **No hay ni un `join`, ni
un `exists`, ni una lectura a `gasto`.** Tomo el viaje del propio seed:
`seed.sql:115-121` inserta `44444444-…-0001` / folio `VJ-2026-0001`,
`estatus='abierto'`, `fecha_inicio = current_date`, operador
`33333333-…-0001`; y `seed.sql:130-140` le carga **dos gastos**: diésel $4,200 con
CFDI timbrado y caseta $1,400. El teléfono de ese operador es
`529993700779`, y `seed.sql:71` dice qué número es: *"OP-101 (el del viaje demo)
usa el teléfono de Javier"*.

Se siembra el lunes, el demo es el jueves. El jueves a las 12:00 corre
`/api/cron/escalar`, `fecha_inicio` (lunes) ya es `<= hoy-3d`, y a ese teléfono le
entra:

> Llevas 3 días con tu viaje *VJ-2026-0001* sin mandarme comprobantes. 📋

sobre un viaje que tiene $5,600 comprobados y un CFDI con complemento
HidroYPetro ya cuadrados.

**Consecuencia.** Rompe "un rótulo tiene que ser verdad" en el único canal que el
comprador ve en vivo: el hilo de WhatsApp proyectado. El contralor de Transportes
Innovativos está viendo la pantalla donde el motor acaba de leer esos dos
comprobantes, y el producto le escribe al chofer que no mandó ninguno. En
producción es peor y más callado: el chofer que **sí** está comprobando a diario
recibe un reclamo falso, y el canal —que este repo protege en todos lados con el
argumento de "no se quema"— se quema con el primer mensaje.

**Causa raíz probable:** el predicado que el nombre de la columna, el comentario
de la migración y el texto del mensaje prometen (*sin comprobantes*) nunca se
escribió en la consulta; el único proxy es la antigüedad de `fecha_inicio`.

---

### [ALTO] El recordatorio se manda con `sendText`, que fuera de la ventana de 24 h no entrega — y el claim de un solo tiro ya se quemó

`src/lib/likida/recordatorio_comprobacion.ts:133-140` (el envío) y `:117-125`
(el claim, que ocurre antes). Contrastar con `escalar_viaje.ts:220-233`, que en el
mismo repo sí hace el fallback.

**Escenario, con valores.** El destinatario de este recordatorio es, por
construcción, alguien que lleva ≥3 días sin actividad en el viaje. WhatsApp solo
entrega texto libre dentro de las 24 h desde el último mensaje **del usuario**;
`meta/client.ts:204-214` lo documenta con todas sus letras (*"Todo lo que Likida
INICIA —pedir un POD, avisar de un anticipo, recordar un cierre— tiene que ir por
aquí"*, refiriéndose a `sendTemplate`) y `meta/client.ts:285-286` ya tiene el
mensaje del error concreto: `131047`.

Corrida: viaje `v-1`, folio `VJ-104`, chofer con última respuesta hace 4 días.
`reclamarRecordatorio` (`:158-164`) escribe `recordatorio_comprobacion_en = now()`
y devuelve `ganado: true`. `sendText` (`:135`) pega a Meta, Meta contesta 400 con
`code: 131047`, `sendText` registra `wa.sendText` y devuelve `null` (`client.ts:96`),
y aquí eso se convierte en `r.fallos.push('VJ-104: WhatsApp rechazó el envío')`.
El sello ya está puesto: `recordatorio_comprobacion_en IS NULL` nunca vuelve a ser
cierto, y **ese viaje jamás vuelve a entrar a la consulta**. El único rastro es un
string dentro del JSON que devuelve el cron, que Vercel no persiste, y una línea
`wa.sendText` con el status.

Lo llamativo: `escalar_viaje.ts:222-228` resuelve exactamente esto —
`recordado = Boolean(await sendText(...)); if (!recordado) await avisarAlChofer(...)`,
y `avisarAlChofer` → `notificarAsignacion` → `sendTemplate` (`notificar.ts:170`).
El camino nuevo copió el claim de `escalar_viaje.ts` y no copió el fallback.

**Prueba que lo cubra: no existe.** `recordatorio_comprobacion.test.ts:82` fija
`sendText.mockResolvedValue('wamid.TEST')` y ningún caso lo pone en `null`. Está
probada la excepción (`:221-230`) y el teléfono ausente (`:148-157`), pero no el
rechazo de Meta, que es el caso de casi todos.

**Consecuencia.** La funcionalidad entera puede tener una tasa de entrega cercana
a cero y reportar `recordados: 0, fallos: [...]` en un cuerpo HTTP que nadie lee;
para el chofer, el recordatorio automático que Javier pidió el 8-ago simplemente
no existe, y no hay segunda oportunidad porque el sello es de un solo tiro y sin
expiración (a diferencia de `al_vuelo.ts`, que sí tiene `CLAIM_MINUTOS = 10`).

**Causa raíz probable:** se reusó el mecanismo de claim de `escalar_viaje.ts` sin
reusar su distinción entre "el canal rechazó" y "el canal entregó".

---

### [ALTO] La misma corrida del cron puede mandarle al mismo chofer dos WhatsApps contradictorios sobre el mismo viaje

`src/app/api/cron/escalar/route.ts:65-83` (los dos bloques, uno tras otro, sin
intersección) contra `escalar_viaje.ts:81-92` y
`recordatorio_comprobacion.ts:54-61`.

**Escenario, con valores.** Los dos filtros pueden ser ciertos a la vez sobre la
misma fila. `viajesSinAceptar` pide `estatus='abierto'`, `aceptado_en is null`,
`escalado_en is null`, `avisado_en <= ahora-5h`. `viajesSinComprobar` pide
`estatus in ('abierto','en_cuadre')`, `recordatorio_comprobacion_en is null`,
`fecha_inicio <= hoy-3d`. **Ninguno de los dos mira las columnas del otro.**

Caso concreto y común: el despacho captura el lunes 3 de agosto un viaje cuya
`fecha_inicio` es el **viernes 31 de julio** (registro retroactivo — el viaje ya
salió). `crear_viaje_wa.ts` llama a `avisarAlChofer`, que pone `avisado_en =
lunes 08:00`. El chofer no contesta. El lunes a las 13:00 corre el cron:

- bloque 1 (`escalarViajesSinAceptar`): `avisado_en` tiene 5 h → gana el claim de
  `escalado_en` y manda *"Te recuerdo tu viaje **VJ-104**: lo tienes asignado desde
  hace 5 horas y todavía no me confirmas si lo arrancas"* (`escalar_viaje.ts:138-146`);
- bloque 2 (`enviarRecordatoriosComprobacion`): `fecha_inicio` (31-jul) es ≤ 5-ago
  → gana el claim de `recordatorio_comprobacion_en` y manda, segundos después,
  *"Llevas 3 días con tu viaje **VJ-104** sin mandarme comprobantes"*.

Dos mensajes en la misma pantalla, en el mismo minuto, sobre el mismo folio: uno
dice que el viaje ni siquiera arrancó y el otro le reclama los comprobantes de
tres días de ese viaje.

**Consecuencia.** El chofer no puede actuar sobre ninguno de los dos y aprende a
ignorar el hilo — que es el modo de falla que los dos archivos citan como su razón
de existir (`escalar_viaje.ts:20-25`, `recordatorio_comprobacion.ts:23-29`). Si
pasa durante el demo, es el producto contradiciéndose a sí mismo por WhatsApp
delante del comprador. El encabezado de la ruta (`escalar/route.ts:15-19`) afirma
que los dos chequeos *"son 'viaje abierto que se está pasando de tiempo', misma
cadencia"* y que juntarlos era lo económico — pero juntarlos sin cruzarlos es lo
que hace posible el doble mensaje.

**Prueba que lo cubra: no existe.** No hay `route.test.ts` bajo
`src/app/api/cron/escalar/` (`find src/app/api -name "*.test.ts"` devuelve seis
archivos, ninguno del cron de escalar), y las dos suites de módulo se ejecutan
aisladas con mocks distintos, así que nada ejercita las dos consultas contra la
misma fila.

**Causa raíz probable:** los dos chequeos comparten invocación y destinatario pero
no comparten estado; ninguno excluye los viajes que el otro acaba de reclamar.

---

### [ALTO] La mig. 0087 no tiene compuerta de arranque: la primera corrida alcanza todo el histórico de viajes abiertos, con la antigüedad impresa en el mensaje

`supabase/migrations/0087_recordatorio_comprobacion.sql:14-15` (la columna nace
`NULL` para todas las filas existentes) y
`src/lib/likida/recordatorio_comprobacion.ts:52-61` (sin cota inferior de fecha),
`:134` (el cálculo de `dias`).

**Escenario, con valores.** La 0058 —el patrón que este archivo dice copiar—
quedó protegida por accidente feliz: `escalado_en` depende de `avisado_en`, una
columna que también nacía `NULL`, y su propia migración lo dice
(`0058:9-10`: *"Sin esto puesto, el viaje es INVISIBLE para la escalación"*). El
histórico entero quedó fuera. La 0087 se cuelga de `fecha_inicio`, que existe
**desde `0001_init.sql:53`** y está poblada en todo viaje jamás creado.

Entonces: se aplica la 0087 y se despliega. A la hora siguiente, la primera
corrida del cron levanta hasta **100 viajes** (`:61`, `.limit(100)`, sin `order`)
de cualquier antigüedad, con tal de que sigan en `abierto`/`en_cuadre` — o sea,
todos los viajes de prueba, de seed, y los que alguien abrió y abandonó desde que
existe la base. `dias` (`:134`) no tiene tope: un viaje de febrero produce

> Llevas 187 días con tu viaje *VJ-2026-0009* sin mandarme comprobantes. 📋

y sale a los teléfonos que estén capturados en `operador` — incluidos los
`+521111111102…105` inventados del seed (`seed.sql:76-79`) y el de Javier
(`seed.sql:75`). Todo en un solo minuto, sin reversa: los 100 claims quedan
puestos.

**Consecuencia.** Un solo despliegue dispara una ráfaga saliente proporcional al
tamaño del histórico, con textos absurdos, hacia números que el propio seed marca
como placeholders. Para la flota: mensajes del sistema que nadie pidió sobre
viajes muertos. Para Likida: consumo de mensajes de Meta y calidad del número
degradada por reportes de spam, en la cuenta con la que se hace el demo.
La única prueba que toca la fecha (`recordatorio_comprobacion.test.ts:98-104`)
verifica el **límite superior** (`lte`), y confirma que no hay inferior.

**Causa raíz probable:** el sello se diseñó como "no se le ha mandado" sin
distinguirlo de "nació antes de que esta funcionalidad existiera"; falta el
backfill o el piso de fecha que la 0058 tuvo gratis.

---

### [MEDIO] Dos lotes de envíos secuenciales comparten 120 s sin medirlos: el segundo puede no correr nunca y el resultado de los dos se pierde

`src/app/api/cron/escalar/route.ts:11` (`maxDuration = 120`), `:65-83` (los dos
bloques en serie) y `:89` (el único lugar donde salen los `fallos`).

**Escenario, con valores.** `escalarViajesSinAceptar` procesa hasta 100 viajes
(`escalar_viaje.ts:92`) y por cada uno puede hacer hasta cuatro llamadas a Meta
con `AbortSignal.timeout(10_000)` cada una (`client.ts:17`): `sendText` al chofer,
`sendTemplate` de respaldo dentro de `avisarAlChofer`, `sendText` al jefe y
`sendTemplate` al jefe. Con Meta lento —no caído, lento— a 2 s por llamada y 40
viajes en el lote, el primer bloque consume ~240 s. La invocación muere a los
120 s: el `for` se corta a media lista, y **el `return` de la línea 89 nunca
ocurre**, así que se pierden los `fallos` de los dos bloques, y
`enviarRecordatoriosComprobacion` no llega a ejecutarse ni una vez. Mientras
tanto, los viajes ya reclamados en el bloque 1 quedan con `escalado_en` puesto y
sin mensaje enviado, que es el trato aceptado del claim — pero sin nadie que sepa
cuáles.

Si el volumen de viajes sin aceptar se mantiene alto, el bloque 2 se queda en
**inanición permanente**: la funcionalidad nueva nunca corre y el síntoma es
indistinguible de "no hay viajes que recordar".

**Consecuencia.** Para el equipo: el cron se ve verde salvo por el timeout en los
logs de Vercel, y el único inventario de lo que falló vive en un cuerpo HTTP que
se perdió. Es la misma clase de "cron en verde que no hace nada" que la propia
ruta declara evitar (`:33-40`) — pero por agotamiento, no por falta de secreto. El
comentario de `:8-11` dice *"el presupuesto es para los envíos"*; nada en el código
mide ese presupuesto, a diferencia de `cron/facturar/route.ts:129,158`, que sí
tiene `PRESUPUESTO_LOTE_MS` y `MARGEN_LOTE_MS`.

**Causa raíz probable:** el lote está acotado en filas (100) pero no en tiempo, y
los dos chequeos se encadenaron en una invocación sin repartir el presupuesto.

---

### [BAJO] Un viaje sin teléfono capturado quema su recordatorio para siempre, y la condición se conocía antes del claim

`src/lib/likida/recordatorio_comprobacion.ts:117` (el claim) y `:127-131` (la
comprobación del teléfono, después).

**Escenario.** Se da de alta una flota y se capturan cinco operadores sin
teléfono (`operador.telefono` es nulable; el seed marca cuatro de cinco como
placeholders). Tres días después corre el cron: los viajes ganan el claim, luego
entra el `if (!v.operadorTelefono)`, se registra `recordatorio_comprobacion.sin_telefono`
y se sigue. Cuando el encargado captura los teléfonos esa misma tarde, el
recordatorio de esos viajes **ya se consumió**: no hay reintento.

**Consecuencia.** Es la decisión documentada (`:100-108`) y probada
(`test:148-157`), heredada de `escalar_viaje.ts` — la anoto en BAJO porque, a
diferencia de allá, aquí `operadorTelefono` ya viene en la fila leída (`:75`) y se
podría descartar **antes** de gastar el claim, sin cambiar el resto del trato.
Deuda: al equipo le va a costar entender por qué un viaje "ya recordado" nunca
recibió nada.

---

### [BAJO] `viajesSinComprobar` cruza todos los tenants sin filtro de actividad ni orden

`src/lib/likida/recordatorio_comprobacion.ts:54-61`.

La consulta no lleva `tenant_id` (correcto: es un cron global) pero tampoco lleva
`order`, ni excluye tenants dados de baja, ni operadores con `activo = false`
(`seed.sql:75-79` muestra que la columna existe). Con `.limit(100)` sobre un
`select` sin `order by`, el subconjunto que Postgres devuelve es arbitrario;
como los reclamados salen de la consulta la cola se drena igual, así que el orden
no produce inanición — pero un operador dado de baja sigue recibiendo mensajes de
una flota en la que ya no trabaja, y eso sí es un dato de viaje enviado a alguien
que ya no debería recibirlo. **Consecuencia:** ruido saliente y un dato de
operación (folio, días) a un ex-empleado. **Causa raíz probable:** la consulta se
calcó de `viajesSinAceptar`, que tampoco filtra por `activo`.

---

## Lo que revisé y está bien

- **El claim del recordatorio es correcto Y tiene prueba propia — la respuesta a
  la pregunta dura del brief es NO.** Dos corridas solapadas **no** pueden mandar
  dos mensajes al mismo viaje. `recordatorio_comprobacion.ts:158-164` es un
  `UPDATE … .eq('id') .eq('tenant_id') .is('recordatorio_comprobacion_en', null)
  .select('id')`: la condición cae sobre la misma columna que el UPDATE pisa, así
  que bajo READ COMMITTED la segunda transacción bloquea, reevalúa el predicado
  sobre la fila ya actualizada y devuelve **cero filas**. Cero filas se trata como
  "perdí la carrera", no como error (`:170`), y un error de la base se trata como
  fallo cerrado: no se manda nada (`:118-121`). La prueba que lo cubre se llama
  **`recordatorio_comprobacion.test.ts:171` — "DOS CORRIDAS SOLAPADAS: solo UNA
  gana el claim y manda el mensaje"**, más `:159` (claim con error → `sendText` no
  se llama) y `:188` (un viaje malo no tumba el lote, con tres `resultadosUpdate`
  distintos). Esto es exactamente lo que le faltó a QStash en el pase 1.
- **El claim va acotado por tenant además de por id** (`:161-163`), con prueba
  nombrada (`test:207`, "el UPDATE va acotado por tenant, no solo por id").
- **`viajesSinComprobar` falla cerrado**: `:63` lanza en vez de devolver `[]`, con
  prueba (`test:106`, "UN ERROR NO ES UNA LISTA VACÍA"). Es la regla del CLAUDE.md
  aplicada al camino nuevo.
- **El cron nuevo no afloja la puerta**: `escalar/route.ts:50-61` sigue exigiendo
  `CRON_SECRET` presente (500 si falta, no 200) y comparando el `Bearer` completo,
  y el 401 va sin cuerpo. Los dos chequeos van en `try/catch` independientes
  (`:65-83`), así que uno que truene no ciega al otro — verificado leyendo, sin
  prueba de ruta que lo cubra.
- **`startup.ts:65-85` cerró un lock que se pedía y no se respetaba**, y con
  prueba: el `unlock_viaje` incondicional del probe borraba el lease de un
  proceso ajeno (`unlock_viaje` es un `delete where viaje_id` sin token de dueño,
  mig. 0005). Ahora solo suelta si `tomado === true`. La prueba se llama
  **`startup_mutex_ajeno.test.ts`** (89 líneas nuevas). Es el único camino de
  concurrencia que este pase cerró.
- **El retiro del rol `operador` no dejó agujeros de ruteo.** `proxy.ts:110`
  reduce `RUTAS_CON_SESION` a `['/dashboard','/admin']` y las páginas
  correspondientes ya no existen (`ls src/app` no lista `chofer` ni `mis-viajes`);
  `guard.ts` perdió `requireOperador` sin dejar importadores
  (`grep -rn requireOperador src/` solo devuelve comentarios), y `PANEL_PROPIO`
  vacío hace que un `app_user` con `rol='operador'` residual caiga a `/sin-acceso`
  por el `??` de `areasDe` — fail closed. `proxy.test.ts` verde (11 pruebas).
- **El arreglo del PDF del contralor en `processor.ts:2160-2190` está bien del
  lado del servidor:** la segunda firma va dentro de `acotada` con etiqueta
  propia, distingue `error` de `!data?.signedUrl`, registra
  `pdf.contralor_no_firmado` con tenant y viaje, y degrada a "aviso sin adjunto"
  en vez de mandar el ejemplar censurado. El paso nuevo se anotó en
  `PASOS_CIERRE` (`presupuesto.ts:47-53`), que es la disciplina de ese archivo.
- **`duplicados.ts`, `pg_errores.ts`, `conv.ts` y `repo.ts`** no tienen un solo
  cambio en esta ventana (`git diff --stat 94c0733..HEAD -- src/lib/`), así que
  los cierres que verifiqué en el pase 1 sobre esos archivos siguen puestos: el
  claim del doble CFDI (`al_vuelo.ts:627-659`, probado en
  `al_vuelo.test.ts:649-790`), la transacción única del cierre
  (`repo.ts:605-620`), la idempotencia del webhook (`conv.ts:343-353`) y el mutex
  del viaje (`conv.ts:418-464`).

---

## Lo que NO alcancé a revisar

- **El comportamiento real de Meta ante el 131047 en este flujo.** El hallazgo del
  `sendText` fuera de ventana está verificado por lectura del código
  (`client.ts:204-214`, `:285-286`) y por el hecho de que `escalar_viaje.ts` ya
  hace el fallback; **no** pude ejercitarlo contra la Graph API (sin credenciales
  aquí y las `pruebas-manuales/*` están vetadas).
- **El volumen real del histórico de viajes `abierto`.** El hallazgo del arranque
  sin compuerta está verificado en el mecanismo (columna nueva `NULL` + columna
  vieja poblada desde `0001_init.sql:53`); cuántas filas dispara la primera
  corrida solo se sabe consultando la base de producción, que no tengo.
- **`processor.ts` completo** (136 KB). Solo leí el bloque que cambió
  (`:2100-2200`).
- **`cron/purgar/route.ts`** — no lo abrí en ninguno de los dos pases.
- **Las funciones plpgsql** (`try_lock_viaje`, `unlock_viaje`,
  `guardar_liquidacion_tx`, `intake_delta`): caja negra; son del auditor de modelo
  de datos. La afirmación de que `unlock_viaje` borra sin token de dueño la tomé
  del comentario de `startup.ts:70-72`, no del SQL.
- **Ninguna ruta ejercitada contra una base o un Meta reales.**
