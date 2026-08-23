# Backend y API — auditoría 18

**Nota: 7/10** (antes 6). Razón del movimiento: **se atacó y subió** — desde la
auditoría 2 los caminos de concurrencia dejaron de estar solo "leídos": el mutex,
la barrera, el claim de mensaje, la carrera del insert de conversación y la
idempotencia de `/v1` tienen hoy prueba propia y nombre (los listo abajo). Lo que
impide llegar a 8 es lo que encontré: **tres de los cuatro ALTOs son casos donde
la prueba verifica la FORMA de la llamada y no el COMPORTAMIENTO de la base**, y
uno es una regla de negocio que el esquema dejó atrás sin que su prueba se
enterara.

El riesgo mayor hoy: la bandeja durable de WhatsApp (0119) —construida para que
un mensaje no se pierda cuando la invocación muere— **no cierra ese caso**,
porque `claimMessage` sobrevive a la muerte y convierte el reintento del cron en
un "duplicado" que se sella como procesado.

## Hallazgos

### [ALTO] Si la invocación muere a media ráfaga, el cron sella como procesado el mensaje que nunca se procesó

`src/app/api/webhook/whatsapp/route.ts:249-259` · `src/lib/likida/processor.ts:420-424` ·
`src/lib/likida/processor.ts:2589` · `src/app/api/cron/wa-pendientes/route.ts:79-84`

Escenario, con valores: un chofer manda un fajo de 22 fotos. Meta las entrega en
un POST; las 22 se persisten en `wa_evento_pendiente` (`intentos = 0`) y el
`after()` las procesa con `conPool(..., MAX_EN_PARALELO = 5, ...)`. Cada foto es
OCR de hasta 25 s: 22 fotos ÷ 5 obreros ≈ 5 tandas ≈ 125 s contra
`maxDuration = 120`. Vercel mata la invocación.

En ese instante hay **5 fotos en vuelo**. Para cada una ya corrió
`processInbound` → `claimMessage(wamid)` (processor.ts:420), que insertó su fila
en `wa_mensaje_procesado`. `releaseMessageClaim` vive **solo en el `catch`**
(processor.ts:2589); el `finally` (2599-2601) únicamente suelta el lock del
viaje. Una muerte dura no ejecuta ni uno ni otro, así que el claim queda tomado.

Cinco minutos después corre `cron/wa-pendientes`: `pendientesPorDrenar` trae esas
5 filas (`procesado_en` null, `intentos = 1 < 5`), `reclamarPendiente(id, 1)`
gana, llama `processInbound` → `claimMessage` devuelve `'duplicado'` →
`logger.info('wa.duplicate')` y `return` (processor.ts:421-423) → de vuelta en el
cron, línea 83, `marcarPendienteProcesado(claim.id)` y `procesados++`.

Sale mal: las 5 fotos quedan con `procesado_en` sellado, el cron responde
`{corrio:true, procesados:5, fallidos:0}` y el único rastro es un `info`. La
reentrega de Meta tampoco las salva: en el webhook el claim está **cableado a
cero** (`reclamarPendiente(f.id, 0)`, route.ts:251), y con `intentos = 1` el
UPDATE anclado no empata. `wa_mensaje_procesado` se purga a los 30 días
(mig. 0072), no en minutos.

Consecuencia: hasta 5 comprobantes por invocación muerta desaparecen sin que
nadie lo sepa — con el agravante de que el sistema **reporta éxito**. Si uno de
los cinco era el diésel de $8,000, la liquidación cierra corta y el operador paga
de su bolsa un gasto que sí hizo; el contralor ve un total comprobado que no
cuadra con el fajo que el chofer jura haber mandado. Es exactamente el modo de
falla que la bandeja 0119 se construyó para eliminar.

Sin test: `cron/wa-pendientes/route.test.ts` mockea `processInbound` como éxito o
como throw; ningún caso ejercita "processInbound retorna porque el wamid ya está
reclamado". `apagado.test.ts` y `route_pool.test.ts` tampoco.

Causa raíz probable: dos candados de idempotencia con ciclos de vida distintos
(`wa_mensaje_procesado` sobrevive al proceso, la fila pendiente espera reintento)
y ningún camino que le diga al reclamante de la fila durable que el "duplicado"
que recibió es su propio cadáver.

---

### [ALTO] El webhook de entrega de correo nunca escribe nada: `neq` descarta las filas con `entrega_estado` NULL

`src/app/api/correo/eventos/route.ts:81-95` (la línea es la **85**)

```ts
.eq('provider_message_id', emailId)
.neq('entrega_estado', estado === 'entregado' ? 'rebotado' : '~nunca~')
```

Escenario, con valores: se envía una pieza de la cola; Resend la acepta y se
guarda `provider_message_id = 're_abc123'`. `cola_aprobacion.entrega_estado`
nace **NULL** — la 0124 lo dice con todas sus letras
(`0124_cadencia_atomica_y_entrega.sql:64-69`: «NULL = aceptado sin noticia de
entrega todavía»). Llega `email.delivered`. PostgREST traduce `neq` a
`entrega_estado <> 'rebotado'`, y en SQL `NULL <> 'rebotado'` es **NULL**, no
`true`: la fila no entra al `WHERE`. El UPDATE afecta 0 filas, `data` sale `[]`,
y la ruta contesta `200 {"sinPieza": true}` con un `logger.info` de nivel info
(línea 92-94).

Lo mismo, y peor, con la mala noticia: para `email.bounced` el filtro es
`.neq('entrega_estado', '~nunca~')` — el centinela pensado para "no excluyas
nada" —, y `NULL <> '~nunca~'` también es NULL. **Un rebote sobre una pieza que
nunca recibió un evento previo tampoco se escribe.** Como el primer evento es
justamente el que dejaría la columna no-nula, la columna se queda NULL para
siempre: el circuito de entrega completo de la 0124 es código muerto en
producción.

Consecuencia: la pantalla sigue vendiendo "aceptado" como si fuera "entregado" —
el problema que la migración 0124 existe para resolver—, y una dirección que
rebota o marca queja nunca se marca, así que la cadencia le sigue escribiendo:
reputación del subdominio de envío quemada sin una sola señal en el panel.

Sin test que lo cubra: `route.test.ts:82-85` mockea Supabase entero y solo afirma
que `.neq('entrega_estado','rebotado')` **fue llamado** (`filtros[0].neq`); el
doble devuelve `[{id:'pz-1'}]` pase lo que pase, así que la lógica de tres
valores de SQL nunca se ejerce.

Causa raíz probable: se expresó "no pises un rebote" con un `<>` sobre una
columna anulable, sin la rama `OR entrega_estado IS NULL` que SQL exige.

---

### [ALTO] El detector de fraude acusa a la flota de duplicar un CFDI cada vez que concilia un consolidado

`src/lib/likida/duplicados.ts:85-93` (agrupa solo por `cfdiUuid`) ·
`src/lib/likida/duplicados.ts:15-21` (`FilaGasto` no tiene `cfdiOrden`) ·
`src/lib/likida/analytics.ts:349-366` (la consulta no trae `cfdi_orden`)

Escenario, con valores: la oficina reenvía el estado de cuenta mensual del TAG de
casetas. `guardarYConciliarConsolidado` busca candidatos con
`.eq('tenant_id', …).is('cfdi_uuid', null).gte('fecha', …).lte('fecha', …)`
(`intake/consolidado.ts:298-307`) — **por tenant y por rango de fechas, no por
viaje** — y sella cada gasto que empata con
`{cfdi_uuid: 'a1b2c3d4-…', cfdi_orden: 1..N}` (`consolidado.ts:174-180`). Un mes
de casetas son, por construcción, gastos de muchos viajes: digamos 40 cruces
repartidos en 12 viajes.

Eso es **legal desde la mig. 0065**, que movió el índice a
`unique (tenant_id, cfdi_uuid, cfdi_orden)` precisamente para permitir "N gastos,
un CFDI" (`0065_cfdi_de_varias_casetas.sql:68-70`). Pero `detectarAnomalias`
selecciona `viaje_id, concepto, monto, folio, cfdi_uuid` y **no** `cfdi_orden`, y
`detectarDuplicadosEntreViajes` agrupa por UUID a secas: el grupo toca 12 viajes
→ `{tipo: 'cfdi_duplicado', detalle: 'CFDI a1b2c3d4… liquidado en 12 viajes'}`.

Sale mal en cuatro pantallas a la vez: `/dashboard` (inicio-contenido.tsx:94),
`/dashboard/combustible-casetas` (:122), `/dashboard/notificaciones` (:40) y la
vista del contador. Y el `monto` que acompaña la alarma es el del **primer** gasto
del grupo (`duplicados.ts:36`: `?? { viajes: new Set(), monto: f.monto }`), o sea
una caseta suelta de $87 presentada como el monto duplicado — una cifra que no es
ninguna de las que el contralor puede cruzar.

Consecuencia: el producto acusa a los choferes de la flota del fraude número uno
del sector — con nombre, con viajes y con un monto inventado — por haber usado
bien la conciliación de consolidados que le vendimos. En la sala, el contralor
abre esa notificación y lo primero que ve es una acusación falsa contra su gente.

El test que debería atraparlo **fija lo contrario**:
`duplicados.test.ts:13-21` («el mismo CFDI en dos viajes es una anomalía») se
escribió cuando el índice era el de la 0019 —«un CFDI, un gasto»— y nadie lo
revisó cuando la 0065 legitimó el N:1.

Causa raíz probable: una regla que era cierta bajo el esquema viejo sobrevivió al
cambio de esquema porque su entrada (`FilaGasto`) no llegó a conocer la columna
que hace la distinción.

---

### [ALTO] `/api/dashboard/ingesta` gasta visión sin techo y su costo no lo cuenta ningún medidor

`src/app/api/dashboard/ingesta/route.ts:29-77` (no importa `rateLimit`, no llama
`registrarCosto`) · contrastar con `src/app/api/dashboard/chat/route.ts:62-77`

Escenario, con valores: un `contador` con sesión válida abre la sonda "Ingest" de
*Preguntar a la IA*. La ruta acepta un data-URL de hasta `MAX_DATAURL = 9_000_000`
bytes (~6 MB de imagen) y llama `extraerComprobante` —una completion de visión—
por petición. No hay `rateLimit` de ninguna clase: ni por IP, ni por usuario, ni
por tenant. Un `for (let i=0;i<500;i++) fetch('/api/dashboard/ingesta',…)` desde
la consola del navegador, o un `useEffect` con dependencia mal puesta en el
cliente, son 500 llamadas de visión seguidas.

Y el costo **no se registra**: `extraerComprobante` devuelve `r.costo.costoUsd` y
la ruta lo mete en un `logger.info` (línea 51-54) y ahí se acaba. Nunca entra a
`llm_costo`. Por comparación, el camino de WhatsApp sí lo registra
(`processor.ts:1060`) y el chat también (`chat/route.ts:94`).

Sale mal en dos sitios a la vez: (1) el tope diario del chat lo lee
`gastoChatHoyUsd(tenantId)` contra `llm_costo`, así que este gasto **no descuenta
del presupuesto que dice cuidarlo**; (2) `/admin` "Costo de IA" y la pantalla de
costo por flota enseñan un total que no incluye ni un centavo de esta ruta. Un
rótulo que dice "lo que llevas gastado en IA" y no lo dice.

Consecuencia: gasto de modelo real, sin freno, que ningún tablero cuenta — y por
tanto sin la señal que haría que alguien lo notara. Para el rubro de "una cifra
tiene que ser verdad", el número de costo del panel es falso por construcción en
cuanto alguien use la sonda.

Sin test: el directorio `src/app/api/dashboard/ingesta/` contiene **solo**
`route.ts`. `chat/` tiene `tope.test.ts`, `validacion.test.ts` y
`costo_parcial.test.ts`.

Causa raíz probable: la ruta se copió de `/api/dashboard/asistente` por su
*autorización* (así lo dice su encabezado) y no por su *contabilidad*; las dos
capas anti-quemadura del hermano se quedaron del otro lado.

---

### [MEDIO] La cola de facturación pide 600 s de presupuesto y corta el lote a los 150 s

`src/app/api/cron/facturar/cola/route.ts:12` (`maxDuration = 600`) y `:87-90` ·
`src/app/api/cron/facturar/route.ts:32` (`maxDuration = 300`), `:136`
(`PRESUPUESTO_LOTE_MS = maxDuration * 1000`), `:165`
(`MARGEN_LOTE_MS = 150_000`), `:535`

Escenario, con valores: el cron encola un lote de 8 tickets repartidos en 4
flotas distintas, cada una con su propio portal (peor caso medido de una sesión:
~147 s). El callback de QStash arranca con `inicio = Date.now()` y llama
`procesarLoteEnCola(loteVigente, req, hoy, inicio, …)`. Dentro, el corte es
`Date.now() - inicioLote >= PRESUPUESTO_LOTE_MS - MARGEN_LOTE_MS`, y
`PRESUPUESTO_LOTE_MS` es una constante derivada del `maxDuration` **de la ruta
del cron** (300 s), no del de la cola. O sea: corta a los **150 s**.

Flota 1 termina en ~148 s; flota 2 arranca (148 < 150) y termina en ~295 s;
flotas 3 y 4 caen en `sinTiempo` y quedan para la corrida de dentro de una hora
— con 305 s del presupuesto de la invocación sin usar.

Consecuencia: la cola drena a la mitad de la velocidad para la que se construyó,
y el encabezado de `cola/route.ts:9-12` afirma lo contrario («el techo de 300 s
de una invocación directa es justo lo que esta cola existe para romper»). En
plazos de facturación de 7-15 días en gasolineras no es fatal; en cierre de mes
fiscal de casetas, cada hora perdida cuenta. Quien mantenga esto va a leer el
comentario y creer que el problema es el portal.

Causa raíz probable: `PRESUPUESTO_LOTE_MS` se derivó de un `maxDuration` local en
vez de recibirse como parámetro cuando la función se extrajo para compartirla.

---

### [BAJO] `POST /api/lead` dedupe leyendo antes de escribir, sobre una tabla sin unique

`src/app/api/lead/route.ts:173-194`

Escenario, con valores: el visitante de `likida.ai/getdemo` hace doble clic en
"Enviar" (dos POST con ~150 ms de diferencia, dentro del `rateLimit` de 10/min).
Los dos ejecutan `.eq('correo','director@flotax.mx').limit(1)`, los dos reciben
`[]` porque ninguno ha escrito todavía, y los dos caen al `escribir(db,'insert',…)`
de la línea 194. `prospecto` no tiene índice único ni por `correo` ni por
`empresa` — la 0139 lo dice explícitamente
(`0139_prospecto_calidad.sql:46-48`: el unique no se creó porque hay 1,227 grupos
duplicados vivos). Resultado: dos filas.

Consecuencia: dos prospectos para la misma empresa en la cartera comercial, y
—como `/api/admin/mapa-prospectos/mensaje` cobra una llamada de modelo por `id`—
dos primeros toques generados y potencialmente dos mensajes al mismo decisor. Es
la misma clase de duplicado que la 0139 acaba de medir y marcar a mano.

Causa raíz probable: el único endpoint de escritura público del repo es también
el único sin llave natural ni `Idempotency-Key`, mientras `/v1` exige las dos
(`_escritura.ts:393-417`).

## Lo que revisé y está bien

**Caminos de concurrencia, con su prueba nombrada:**

- Mutex por viaje — `conv.ts:418-464` (`acquireViajeLock`), abandono del turno en
  `processor.ts:2090-2099`. Cubierto por `processor_lock.test.ts` y
  `conv_lock.test.ts`; el caso "el `return` del mutex libera el claim" está
  fijado en `processor_lock.test.ts:136`.
- Barrera de ráfaga (`intake_delta`, fail-closed ante `null`) — `conv.ts:488-497`
  y `567-610`. Cubierto por `barrera.test.ts`, `barrera_fail_closed.test.ts`,
  `barrera_sondeo.test.ts`; el `+1` que falla, por
  `processor_intake_delta_falla.test.ts`.
- Carrera del INSERT de `wa_conversacion` (choque contra
  `wa_conversacion_tenant_tel_uidx` → relectura, nunca upsert) —
  `conv.ts:247-286`. Cubierto por `conv_carrera_insert.test.ts`.
- Idempotencia de escritura de `/v1` (memoria → tabla `api_idempotencia` → llave
  natural → carrera resuelta por el unique) — `_escritura.ts:694-780`. Cubierto
  por `_escritura.test.ts`. Verifiqué en particular que la huella se calcula
  sobre el cuerpo **normalizado** (`:429-432`), así que un `tenant_id` colado en
  el JSON no puede alterarla, y que el 409 por contenido distinto no se cachea
  (`:740-747`).
- Consumo atómico del `AdminActionIntent` (UPDATE con las guardas en el WHERE,
  `armar`/`gastar`) — `copiloto-intents.ts:131-149`. La ruta ata la acción
  ejecutada a la propuesta por `argsHash` (`copiloto/route.ts:124-129`), así que
  el `accionId` del cliente no puede divergir del intent; y el `gateo` sale del
  catálogo, no del modelo (`copiloto.ts:74-83`).
- Claim de la fila durable de WhatsApp (UPDATE anclado a `intentos`) —
  `wa_pendientes.ts:97-108`. Cubierto por `cron/wa-pendientes/route.test.ts`
  **para el caso feliz y para el claim perdido**; NO para el caso del hallazgo 1.
- Claim del código pendiente (DELETE + `.select()`, atómico) —
  `repo.ts:652-661`, usado en `processor.ts:160-177`. Cubierto por
  `pegar_codigo_en_espera_log.test.ts` y `repo_enriquecer.test.ts`.
- Reserva/confirmación del aviso de privacidad (reserva antes de enviar,
  constancia solo si Meta acusó, liberación si rebotó) —
  `processor.ts:295-341`, `repo.ts:787-860`. Cubierto por
  `aviso_constancia.test.ts` y `aviso_blip_de_red.test.ts`.
- Cierre atómico de la liquidación vía `guardar_liquidacion_tx` —
  `repo.ts:700-728`. Sin prueba de integración (la RPC vive en la 0013), pero el
  contrato de una sola transacción está fuera del alcance del código TS.
- Idempotencia del webhook de Stripe (`marcarEvento` es un INSERT, no un SELECT;
  'pendiente' re-aplica, la marca no se borra) — `stripe/webhook/route.ts:62-82`.
  El `default` del switch responde 200 y los casos que sí nos conciernen
  **lanzan** para que Stripe reintente (`:97-199`): correcto, y raro de ver bien.
- Idempotencia del correo entrante, con la liberación de la fila de dedup cuando
  una descarga se cayó — `correo/entrante/route.ts:182-196` y `:278-307`.
  El orden firma → tenant desde el DESTINATARIO → kill switch → llave → dedup
  está bien argumentado y es el correcto.
- Errores por valor de supabase-js: revisé los ~40 `route.ts` buscando `data` sin
  su `error`. **No encontré ninguno**. Los sitios donde el error se trata como
  "no hay nada" lo hacen a propósito y lo declaran: `_escritura.ts:475-485`
  (capa de conveniencia con el unique detrás), `repo.ts:186-196`
  (`gastoExistePorHash`, prefiere un duplicado raro a perder un gasto),
  `tenant-api.ts:63-72` (uuid inexistente vs. error, separados).
- El recorte silencioso de PostgREST está atrapado en el borde de la API:
  `v1/viajes/route.ts:102-115` compara lo pedido contra `contarViajes` y contesta
  `lectura_incompleta` en vez de servir una página corta. Es la implementación
  más honesta de esto que vi en el repo.
- Puerta de `/v1`: `_comun.ts:187-265`. El `?tenant=` se **borra** antes de
  llegar a `resolverTenantApi` (`urlSinTenant`, `:149-153`), la llave manda sobre
  la cookie, y el área no tiene default. `areaDeLlaveAlcanza` falla cerrado ante
  un área desconocida (`:178-185`).
- `resolverTenantPedido` no comprueba el rol por sí sola (`tenant-api.ts:86-100`);
  revisé sus 6 llamadores (`dashboard/{politicas,[id],combustible-casetas,
  suscripcion,arco}`) y **los 6** gatean con `s.rol === 'superadmin'` antes.
- Zonas nuevas de la ronda: `auth/correo/route.ts` verifica firma Standard
  Webhooks siempre, corta a 32 KB antes del HMAC, falla cerrado y ruidoso, y no
  registra el correo en el log (LFPDPPP). `admin/mapa-prospectos/{toque,mensaje}`
  y `admin/copiloto/*` re-chequean su propia puerta (las rutas `/api` no pasan
  por el layout de `/admin`) y el historial del copiloto ancla `user_id` en las
  cuatro consultas (`copiloto-historial.ts:43,63,110,139`).
- `middleware.ts` figura en el rubro pero **no existe** en el repo (no hay
  `src/middleware.ts` ni `middleware.ts` en la raíz). Cada ruta es su propia
  puerta, que es lo que los encabezados afirman.

**Sigue abierto y no lo cuento como hallazgo nuevo** porque está documentado en
cinco lugares (`00-MEJORAS.md` M0.1, `00-ROADMAP.md:132`,
`40-auditoria-codigo.md:299`, `DECISIONES-PENDIENTES.md:18`,
`runbook-de-llaves.md:16`): `LIKIDA_DEDUP_FOTOS` está apagada por defecto
(`processor.ts:992`), así que `img_hash` va NULL y `uq_gasto_img_hash` nunca
dispara. Vale la pena confirmar el valor en el entorno antes del siguiente demo:
el candado existe y está apagado.

## Lo que NO alcancé a revisar

- `v1/openapi/route.ts` (763 líneas): no comparé campo por campo el spec contra
  lo que las rutas devuelven de verdad. Un spec que declara un campo no anulable
  y una ruta que devuelve `null` es exactamente el modo de falla que este
  producto no puede tener, y aquí ese cruce no está hecho.
- `facturacion/al_vuelo.ts` completo (solo leí `facturarLoteAlVuelo`,
  `guardarUno` y `escribirUuid`, líneas 415-530): no verifiqué la re-lectura
  anti-doble-emisión de `facturarAlVuelo`, que es el único candado entre el cron
  y un segundo CFDI por el mismo consumo.
- `src/lib/auth/llave-api.ts` (`resolverLlave`): no revisé la comparación del
  hash ni la escritura de `last_used_at`.
- `export/{liquidaciones,facturas-proveedor,bitacora-peaje}`: solo leí
  `export/pdf/[id]`.
- Los ~1,700 renglones restantes de `processor.ts` (leí ~700): en particular el
  bloque de despacho de oficina, talacha y hitos, y el camino del XML.
- No corrí la suite completa (`npx tsc --noEmit`, `npx eslint src/`,
  `npx vitest run` entero). Sí corrí en verde los archivos que nombro arriba —
  `duplicados`, `correo/eventos/route`, `cron/wa-pendientes/route`,
  `processor_lock`, `barrera_fail_closed`, `conv_carrera_insert`,
  `v1/_escritura`: 6 archivos, 100 pruebas, todas pasan. Que pasen es parte del
  argumento de los hallazgos 1, 2 y 3: el verde de hoy no cubre esos caminos.
