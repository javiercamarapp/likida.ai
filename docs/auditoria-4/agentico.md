# Sistema agéntico y orquestación — auditoría 4

**Nota: 4/10** (antes 3). Razón del movimiento: **se atacó y subió**, poco y
verificado por los dos extremos. De los tres CRÍTICOS que traía, **AG-C3 sí
cerró de verdad** —abrí uno por uno los siete lectores nuevos de `estaApagado`,
no el catálogo— y le queda una sola puerta abierta; y la superficie nueva
(apagado durable, cola de aprobación, copiloto) llegó con la disciplina que este
rubro pide: claim anclado, compensación, ventana declarada. Pero **AG-C1 y AG-C2
están byte por byte donde estaban**: sigue existiendo el estado en que la base
dice `liquidado` y el operador lee "se me trabó", y sigue existiendo el camino
por el que dos ciclos completos de agente corren sobre el mismo viaje. El ancla
de este rubro pone piso 3 mientras ese estado exista; el punto extra es por el
kill switch cerrado y por lo nuevo, no por el ciclo de WhatsApp.

El riesgo mayor de hoy: el único candado del camino del dinero —el mutex por
viaje— se puede borrar sin ser su dueño desde **dos** archivos distintos de
Likida, y ninguno de los dos comprueba nunca haberlo tomado.

## Hallazgos

### [CRÍTICO] Cierre parcial: la liquidación cierra, el operador oye "se me trabó" y su reenvío cae en "no tienes viaje abierto" — REINCIDENTE (3ª ronda)

`src/lib/likida/processor.ts:2276` × `src/lib/meta/client.ts:122-128` ×
`src/lib/likida/processor.ts:2449-2486` × `src/lib/likida/processor.ts:770`

Escenario, con el punto de muerte exacto: el chofer Juan cierra `VJ-2026-0847`
con un anticipo de $12,000 y 6 comprobantes. El agente llama
`guardar_liquidacion`, `closed = true` (`:2099`), la liquidación queda escrita,
`viaje.estatus = 'liquidado'` y los dos PDF suben a storage. La siguiente línea
que toca la red es `const entregado = await say(reply)` (`:2276`). `say`
(`:790-795`) llama `sendText`, y `sendText` en `meta/client.ts:123-128` es un
`fetch` con `AbortSignal.timeout(10_000)` **sin try/catch**: un corte de red o
10 s de latencia de la Graph API **lanzan**.

El control salta al catch general de `:2449`. Ese catch **sigue sin mirar
`ctxCerro` para decidir qué decirle al humano**: la única bifurcación
(`:2481-2485`) distingue `OperadorAmbiguo` y `ConsultaFallida`, y todo lo demás
—incluido el cierre consumado— cae en `:2485`:

> *«Perdón, se me trabó tantito. ¿Me reenvías tu último mensaje? 🙏»*

El bloque del PDF (`:2319-2429`) queda por encima del salto y no corre nunca.
Juan obedece y reenvía "listo" → `getOpenViaje` devuelve `null` porque el viaje
ya no está abierto → `processor.ts:770`:

> *«No tienes un viaje abierto para liquidar ahorita.»*

Callejón sin salida: liquidación cerrada e irreversible (triggers 0036/0037),
dos PDF existentes en storage, y ningún camino por el que le lleguen. `:2473`
loguea `cerroSinEntregar: true` — eso cierra el ciclo con el equipo, no con el
operador, que es lo que este rubro mide.

Consecuencia: el chofer queda debiendo o cobrando una liquidación que no puede
ver, y alguien tiene que entrar a mano a la base para saber cuál fue. En un demo
es el paso 3 del guion muriendo en silencio delante del contralor.

Causa raíz probable: el catch general trata "no pasó nada" y "ya cerró y no
entregué" como el mismo suceso; el único brazo que distingue el cierre vive
dentro del `try`.

### [CRÍTICO] El mutex del viaje se borra sin ser su dueño — desde el arranque y desde el propio turno — REINCIDENTE

`src/lib/likida/startup.ts:63-70` × `supabase/migrations/0005_concurrencia.sql:45-49`
× `src/lib/likida/conv.ts:613-619` × `src/lib/likida/conv.ts:439-441,455-457`
× `src/lib/likida/processor.ts:1984-1985,2487-2489`

`unlock_viaje` sigue siendo `delete from viaje_lock where viaje_id = p_viaje`
(mig. 0005, línea 49): **sin token de dueño**. Cualquiera que lo llame borra el
lease de quien sea. Hoy lo llaman dos caminos que nunca comprobaron tenerlo.

**Puerta 1 — el sondeo de arranque (idéntica al pase 3).** Juan escribe *listo*
sobre `VJ-2026-0847`; `processInbound` toma el lease (`conv.ts:427`, TTL 60 s) y
arranca el agente (~25 s con Sonnet + tools). En esos 25 s entra otro POST y
Vercel levanta una instancia fría — con la base en cero y sin tráfico, casi
*todos* los mensajes caen en instancia fría. `instrumentation.ts:27` corre
`verificarMigracionesCriticas()`:

```
63  const { data: viajeReal } = await admin.from('viaje').select('id').limit(1);
65    const { error } = await admin.rpc('try_lock_viaje', { p_viaje: viajeReal[0].id, p_ttl_ms: 1 });
70    await admin.rpc('unlock_viaje', { p_viaje: viajeReal[0].id }); // liberar el lock de prueba
```

`select id from viaje limit 1` sin `order` ni filtro devuelve una fila
arbitraria: en la base del demo es **el** viaje. `try_lock_viaje` devuelve
`data: false` con `error: null` (el lease está tomado) y la línea 66 solo mira
`error`, así que no se entera de que **no consiguió nada**. La línea 70 corre
igual y borra el lease del turno vivo.

**Puerta 2 — el propio turno, por el fail-open del mutex (nueva).**
`acquireViajeLock` devuelve `true` sin haber tomado nada en dos ramas
deliberadas: `rpcAusente` (`conv.ts:439-441`) y error persistente tras agotar la
ventana (`conv.ts:455-457`). En las dos, `processor.ts:1985` escribe
`lockedViaje = viajeId`, y el `finally` de `:2487-2489` llama
`releaseViajeLock` → `unlock_viaje`. Con un blip de 12 s en el pool de Supabase,
el turno B se abre por fail-open, corre, y **al terminar borra el lease legítimo
del turno A**, que sigue vivo.

Sale mal igual en las dos: el segundo "listo" (o el que Juan repite a los 5 s)
consigue el lock de inmediato, la re-verificación de `processor.ts:1997` todavía
ve el viaje `abierto` porque el turno 1 no llegó a `guardar_liquidacion`, y
corren **dos ciclos completos de agente sobre el mismo viaje**: dos
`cuadrar_viaje`, dos `guardar_liquidacion`, dos generaciones de los dos PDF, dos
"Listo, cuadré tu viaje 👇" y dos `liquidacion.pdf` al teléfono de Juan, dos
`avisarCierreAlJefe`, y el turno de Sonnet cobrado dos veces.

Consecuencia: el contralor ve su liquidación duplicada en la sala, con dos
mensajes y dos PDF del mismo folio; el costo por liquidación —la cifra con la
que se pone precio— sale al doble.

Causa raíz probable: `unlock_viaje` no distingue "libero lo mío" de "borro lo de
quien sea", así que todo llamador que se abra por fail-open acaba desarmando el
candado que se abrió por no poder verificarlo.

### [ALTO] «Ejecutar ahora» de Cobranza sigue sin leer el kill switch, y la pantalla del cliente afirma lo contrario — REINCIDENTE (residual de AG-C3)

`src/app/dashboard/agentes/cobranza/page.tsx:97-119` ×
`src/lib/likida/agentes/cobranza.ts:202-213` ×
`src/app/dashboard/agentes/cobranza/vista.tsx:79` ×
`src/app/dashboard/agentes/peajes/apagado.ts:23-29` (el patrón que sí se adoptó)

Verifiqué el cableado que los commits `4169069`/`d682d7a`/`b1e5671` dicen haber
hecho, abriendo cada lector: **cerró de verdad en 6 de las 7 puertas**.
`agente:liquidacion` se pregunta dentro de `guardar_liquidacion`
(`tools.ts:174`), `global` en el borde del webhook
(`api/webhook/whatsapp/route.ts:208`), `agente:peajes` en las cuatro server
actions vía `peajes/apagado.ts`, `agente:proveedores` en
`api/correo/entrante/route.ts:159`, `agente:ventas` en `vendedores.ts:577`,
`agente:conductores` y `agente:facturas` en sus crons. Ya no es un catálogo
decorativo.

La que queda: `ejecutarAhora` (`cobranza/page.tsx:97-119`) valida permiso
(`:101`) y llama `ejecutarCobranza` en `:108` **sin pasar por `estaApagado`**.
`ejecutarCobranza` (`cobranza.ts:207-210`) solo mira `config.activo`, que es la
pausa **de la flota**, no la palanca de plataforma. Escenario: Javier apaga
`agente:cobranza` a las 10:00 con motivo "el agente mandó el folio equivocado a
tres choferes"; `/admin/agentes` pinta **APAGADO** en rojo (`contenido.tsx:108`)
y el copiloto lo reporta apagado con su tool `estado_agentes`
(`copiloto-tools.ts:170-181`). A las 10:03 el encargado de la flota entra a
`/dashboard/agentes/cobranza`, aprieta *Ejecutar ahora* con `ignorarVentana:
true`, y salen los WhatsApp a los mismos choferes. Peor: `vista.tsx:79` le
enseña al cliente *«El agente está pausado: no contacta a nadie, ni con Ejecutar
ahora»* — cierto para `config.activo`, falso para el kill switch.

Consecuencia: el único control de incidente miente en el único momento para el
que se construyó, y rompe la regla dura del repo — un rótulo que dice APAGADO
tiene que ser verdad.

Causa raíz probable: `peajes` movió la palanca a un módulo compartido que las
cuatro actions consultan; `cobranza` se quedó con la palanca solo en su cron.

### [ALTO] La tarjeta que Javier confirma en el Copiloto describe el efecto equivocado cuando el objetivo es `global`

`src/lib/agents/copiloto-acciones.ts:36-39` × `src/lib/agents/copiloto.ts:79` ×
`src/app/admin/copiloto.tsx:223,230-231` ×
`src/app/api/webhook/whatsapp/route.ts:208-217`

`proponer_accion` acepta el `objetivo` **como texto libre del modelo**
(`copiloto.ts:79`: `String(a.objetivo ?? '').slice(0, 80)`), sin validarlo contra
`INTERRUPTORES`. La tarjeta que se pinta (`copiloto.tsx:223`) dice *«Voy a
apagar `<objetivo>`»* y debajo imprime `a.efecto` (`:230`), que es **una sola
cadena del catálogo, la misma para los ocho interruptores**
(`copiloto-acciones.ts:37`):

> *«Corta la corrida siguiente de ese agente en TODAS las flotas (la palanca es
> global por agente, no por tenant). Los crons responden 200 con "saltado".»*

Escenario con valores: Javier escribe *«algo anda mal, apaga todo mientras
reviso»*. El modelo llama `proponer_accion({accion:'apagar_agente',
objetivo:'global'})`. `'global'` está en `INTERRUPTORES`, así que
`ejecutarAccionCopiloto` (`copiloto-acciones.ts:109-116`) lo acepta y lo apaga.
Pero lo que `global` hace de verdad no es saltarse un cron: en
`api/webhook/whatsapp/route.ts:208-217` **detiene el camino entrante de
WhatsApp entero**. El chofer Juan manda sus 6 fotos y "listo" a las 11:00, ve
sus dos palomitas azules, y no recibe **nada** — el propio comentario del
webhook (`:190-193`) declara que a propósito no se contesta. Sus mensajes se
guardan en `wa_evento_pendiente` y ahí se quedan hasta que alguien suba la
palanca.

Consecuencia: el fundador aprieta un botón cuya previsualización promete "se
salta la corrida siguiente" y lo que ocurre es que el producto deja de
contestarle a todos los choferes de todas las flotas, sin aviso a nadie. Es
exactamente la clase de mentira que el bloque de acción gateada existe para
impedir.

Causa raíz probable: `efecto`/`revertir` son propiedades de la ACCIÓN
(`apagar_agente`) y no del par (acción, objetivo), y el objetivo lo elige el
modelo sin pasar por el dominio.

### [ALTO] El apagado durable guarda el mensaje y no cierra el ciclo con nadie: ni con el chofer ni con Javier

`src/app/api/webhook/whatsapp/route.ts:190-217` × `src/lib/likida/wa_pendientes.ts:33-57`
× `src/app/api/cron/wa-pendientes/route.ts:66-69` (búsqueda en todo `src/`:
`wa_evento_pendiente` no aparece en una sola pantalla)

La bandeja durable arregla la pérdida (el 200 vuelve a ser verdad) y el claim
anclado de `reclamarPendiente` (`wa_pendientes.ts:87-98`) es correcto. Lo que
no existe es el cierre con el humano en ninguno de los dos extremos:

- **El chofer**: silencio total, por decisión declarada (`route.ts:190-193`). Juan
  manda 6 comprobantes y "listo" a las 09:00 con `global` abajo; recibe cero
  mensajes, y por WhatsApp la entrega se ve idéntica a un día normal. Cree que su
  liquidación va en camino. En la base hay 7 filas en `wa_evento_pendiente` y el
  viaje sigue `abierto`.
- **Javier**: `wa_evento_pendiente` **no se lee desde ninguna pantalla**. No está
  en `/admin/observabilidad`, no es una fuente de `getBandejaEscalaciones`
  (`lib/admin/escalaciones.ts`, seis fuentes: arco, corridas, talachas,
  facturas_proveedor, tickets, liquidaciones) y por lo tanto tampoco entra al
  guardia A0 (`lib/admin/guardia.ts`). La única señal existe **cuando la palanca
  ya está arriba**: `cartasMuertas()` tras 5 intentos fallidos
  (`cron/wa-pendientes/route.ts:96-100`). Con la palanca abajo, el cron sale en
  `:66-69` sin mirar la bandeja, así que el conteo de mensajes represados no lo
  publica nada más que `logger.warn('wa.entrante_apagado')`.

Consecuencia: el estado "el producto está apagado y hay N choferes esperando" no
tiene representación en ninguna pantalla del sistema. La palanca se puede quedar
abajo un día entero sin que nada lo recuerde, y el chofer lo vive como un bot
que dejó de contestar.

Causa raíz probable: la bandeja se construyó como plomería del cron (persistir +
drenar) y no como estado del producto; ninguna de las dos lecturas que Javier ya
mira aprendió a preguntar por ella.

### [ALTO] El PDF que se le manda al jefe es el ejemplar del OPERADOR — sin los veredictos fiscales — REINCIDENTE

`src/lib/likida/processor.ts:2346` × `:2372` × `:2411` ×
`src/lib/likida/avisar_cierre.ts:127-128` ×
`src/lib/likida/liquidacion/pdf.ts:429` × `src/lib/likida/cuadre/resumen.ts:24-33`

Escenario con valores: el viaje trae un ticket de diésel de $8,000 cuyo emisor
está en la lista 69-B; el motor levanta `cfdi_efos`. `tools.ts` genera **dos**
ejemplares a propósito: `{tenant}/{viaje}.pdf` (contralor, con la sección
DIFERENCIAS DETECTADAS incluyendo esa línea) y `{tenant}/{viaje}-operador.pdf`,
donde `pdf.ts:429` filtra `SOLO_CONTRALOR` (`resumen.ts:24-33`, que incluye
`cfdi_efos`, `cfdi_cancelado`, `rfc_receptor`, `complemento_hidrocarburos`,
`ieps_no_desglosado`, `texto_sospechoso`). `processor.ts:2346` arma **la ruta del
operador**, `:2372` la firma, y `:2411` pasa esa misma URL a
`avisarCierreAlJefe`, que en `avisar_cierre.ts:128` la manda al teléfono de
oficina como `liquidacion-VJ-2026-0847.pdf`.

Sale mal así: el jefe recibe, archiva y le entrega a su contador un PDF con el
mismo folio y los mismos totales que el del panel, pero **sin la línea del
proveedor en lista negra de $8,000**. El texto de WhatsApp sí se la dice, así
que el mensaje y su adjunto se contradicen en el mismo hilo.

Consecuencia: el contralor —el comprador— archiva el documento equivocado y
descubre la contradicción al cruzarlo contra el panel. El propio encabezado de
`avisar_cierre.ts:14-19` dice que ese PDF "es el documento que va a archivar y
que le va a dar a su contador".

Causa raíz probable: `data.signedUrl` se reusa para los dos destinatarios porque
es la que ya estaba firmada; el ejemplar del contralor nunca se firma.

### [ALTO] La recuperación del cierre parcial sigue detrás de un flag apagado por código — REINCIDENTE

`src/lib/likida/processor.ts:2134`

Escenario: el ciclo ejecuta `guardar_liquidacion` con éxito en la ronda 3 y la
ronda 4 revienta (timeout de `reloj.acotar`, o el `LoopGuardError` de
`openrouter.ts`). `generateWithTools` envuelve todo en `PartialExecutionError`
con esa tool en `partialToolCalls` — y la recuperación de `:2153-2178` solo corre
si `process.env.LIKIDA_RECUPERAR_CIERRE_PARCIAL === '1'`. El default del código
es **apagado**; con él apagado se cae al `else` de `:2179` y el operador recibe
*«Perdón, se me trabó el sistema tantito»* (`:2183`) sobre una liquidación que
**ya está cerrada en la base**, con el mismo callejón del primer CRÍTICO.

Consecuencia: el brazo del cierre parcial —el punto de muerte más caro del
ciclo— está construido, probado y desconectado, y el modo de falla es silencioso:
nada en el sistema dice si el flag está puesto.

Causa raíz probable: un default conservador ("HARD RULE 3: el flag preserva el
comportamiento actual") que sobrevivió a su propia justificación.

### [ALTO] Todo el camino de los agentes de fondo sigue consultando Supabase sin techo de tiempo — REINCIDENTE

`src/lib/likida/agentes/notificaciones.ts:622, 654, 678, 700, 738, 765, 794, 811`
· `src/lib/likida/agentes/cobranza.ts` (cero `acotada` en el archivo entero) ·
`src/lib/likida/pg.ts` (cero) · `src/lib/likida/agentes/cobranza.ts:399` contra
`:401`

Verificado por conteo en el árbol de hoy: `notificaciones.ts` 0 ocurrencias de
`acotada`, `cobranza.ts` 0, `pg.ts` 0; solo `corridas.ts` la importa (3).

Escenario: `ejecutarCobranzaGlobal` gasta sus 90 s presupuestados
(`PLAZO_COBRANZA_GLOBAL_MS`, `:337`) y en el segundo 91 llama
`avisarCorridasPorFlota` (`:399`), que entra a `leerEstado`
(`notificaciones.ts:699-700`). Ese `fetch` hereda el default de undici:
**300,000 ms**, contra el `maxDuration = 120` del cron. Un socket aceptado que no
contesta cuelga la invocación; Vercel la mata a los 120 s.

Sale mal así: se mandaron 40 WhatsApp a choferes reales y **no queda ninguna
fila** en `agente_corrida` para ninguna flota — `registrarCorrida` va después, en
`:401` — y la pestaña "Historial de corridas" del cliente enseña esa hora
**vacía**, que se lee como "el agente no corrió" cuando corrió y contactó a su
gente.

Consecuencia: el historial que se le vende al cliente como la prueba de que el
agente trabaja miente por omisión, y una corrida colgada se lleva el cron entero
sin dejar un error.

Causa raíz probable: `acotada` se importa por archivo y no está impuesta en la
capa de acceso (`pg.ts`), así que cada agente nuevo nace fuera de la red.

### [MEDIO] El rescate de claims de Cobranza puede reenviar un recordatorio ya entregado — REINCIDENTE

`src/lib/likida/agentes/cobranza.ts:225-233` × `:311-315`

Escenario: el tier 3 de Juan se reclama, `sendText` **sí** entrega el mensaje
("llevas 3 días sin cerrar el viaje VJ-2026-0847"), y acto seguido el
`update({ enviado, detalle })` de `:311-315` falla por un blip de Supabase — el
código solo deja un `logger.warn` (`:315`). La fila queda `enviado = false,
detalle = null`. Una hora después, la corrida siguiente ejecuta el DELETE de
rescate de `:225-233`, cuya condición es exactamente `enviado = false AND detalle
IS NULL AND created_at < ahora - 1h`, con el comentario *«Una fila sin resultado
después de 1 hora es un crash probado»*. El unique se libera, `colaCobranza`
vuelve a ver el tier pendiente y **Juan recibe el mismo recordatorio por segunda
vez**.

Consecuencia: el canal que este agente cuida de volverse ignorable manda
duplicados, y la bitácora que el cliente lee pierde el registro del primer
contacto.

Causa raíz probable: la fila-claim usa la misma firma (`enviado=false`,
`detalle=null`) para "aún no sé el resultado" y para "murió antes de saberlo".

### [MEDIO] «Ejecutar ahora» de Cobranza que truena no deja corrida ni dice qué alcanzó a mandar — REINCIDENTE

`src/app/dashboard/agentes/cobranza/page.tsx:97-119` contra
`src/app/dashboard/agentes/peajes/page.tsx:207-233` (el mismo botón, hecho bien)

Escenario: el encargado aprieta *Ejecutar ahora*. `ejecutarCobranza` (`:108`) no
está en try/catch, y `leerConfigCobranza` (`cobranza.ts:207`) **lanza** ante un
error de lectura; `colaCobranza` también. La server action rechaza, el cliente
cae al error boundary, y `registrarCorrida` —que está en `:110`, después— no se
ejecuta: no queda fila en `agente_corrida`. Si el fallo ocurre a mitad del bucle
de envíos (`cobranza.ts:246-325`), hubo mensajes enviados y la bitácora dice que
esa corrida manual **no existió**. Además `estado` aquí solo puede valer `'ok'` o
`'parcial'` (`:113`): el dominio tiene `'fallo'` y este llamador no lo produce
nunca. El gemelo de Peajes (`peajes/page.tsx:210-233`) sí envuelve en try/catch y
registra corrida en las dos ramas — la asimetría es del mismo día.

Consecuencia: el cliente aprieta un botón que manda WhatsApp a sus choferes y no
tiene forma de saber si salieron.

Causa raíz probable: el registro de la corrida se escribió para el camino feliz y
vive fuera de un `finally`.

### [MEDIO] Una pieza de la cola que muera entre el claim y el envío queda "enviada" sin haberse enviado, y sin camino de vuelta

`src/lib/likida/agentes/cola.ts:290-297` × `:136-145` ×
`src/app/admin/aprobaciones/page.tsx:32-33, 118, 145-151`

Escenario: Javier aprueba la pieza «Propuesta a Transportes García» y aprieta
*Enviar*. `enviarPiezaPorCorreo` estampa el claim (`cola.ts:290-293`:
`enviado_en = now()`), y **antes** de llamar a Resend hace la consulta de
cadencia a `prospecto_contacto` (`:325-331`). Si la invocación muere en esa
ventana —consulta colgada, deploy a medio vuelo—, la compensación de `:302-309`
no corre. Estado en la base: `estado = 'aprobado'`, `enviado_en` puesto,
`provider_message_id` null, **cero correos enviados**.

Estado en pantalla: `aprobadasSinEnviar` filtra `is('enviado_en', null)`
(`:139`), así que la pieza desaparece de "Aprobadas por enviar" y **no hay botón
para reintentar**. En "Últimas resueltas" aparece como *«enviada SIN prueba del
proveedor — revisar»* (`page.tsx:150`), que dice lo contrario de lo que pasó (no
se envió, no es que falte la prueba); y esa lista es `ultimasResueltas(8)`
(`page.tsx:33`), sobre una bandeja diseñada para «20-40/día»
(`page.tsx:111`): ocho resoluciones más y la pieza atorada es invisible en todo
el producto. La caída suave de `porEnviar` (`page.tsx:32`, `.catch(() => null)`)
empeora el mismo hueco: si esa lectura falla, la sección entera no se pinta y no
se dice, al revés que las dos bandejas de arriba, que sí declaran "no se pudo
leer ESTA bandeja".

Hoy es latente y por eso no es ALTO: **nadie llama `encolarPieza`** (grep en todo
`src/`: el único escritor de `cola_aprobacion` es `cola.ts`, y su único llamador
es el panel), así que la cola nace vacía y ningún agente produce piezas — pese a
que `page.tsx:91` le promete al lector *«Las piezas llegan aquí cuando un agente
redacta algo que necesita tu aprobación»*.

Causa raíz probable: la ventana declarada en el encabezado (`cola.ts:274-278`)
se documentó como "inconsistencia VISIBLE que el panel pinta", pero el sitio
donde se pinta es una lista de ocho renglones que rota, y no hay acción de
reparación en ninguna pantalla.

### [MEDIO] El Copiloto es el único agente que habla con un humano sin techo de gasto, y su costo no entra en la cifra que lo mediría

`src/app/api/admin/copiloto/route.ts:101-104` × `src/lib/agents/copiloto.ts:197,
199-247` contra `src/app/api/dashboard/chat/route.ts:39-42, 80-102`

El analista del panel tiene tope diario por tenant leído de `llm_costo` y falla
cerrado si no lo puede leer (`chat/route.ts:91-102`). El copiloto no tiene
ninguno: no consulta gasto previo, no tiene rate limit, y su única contabilidad
es `logger.info('copiloto.costo', …)` (`route.ts:101`). El propio archivo declara
por qué no escribe en `llm_costo` (`:15-19`: esa tabla exige `tenant_id` y el
gasto es de Likida), lo cual es correcto — pero la consecuencia es que
`lib/admin/negocio.ts`, que agrega `llm_costo` para la pantalla de **Costo de
IA** de `/admin`, no ve un solo centavo del copiloto.

Escenario con valores: cada turno son hasta 5 rondas de tools + un reintento
correctivo de 4 rondas más (`copiloto.ts:206, 236`), con `maxTokens: 900` y
tools que leen la compañía entera. Una tarde de 60 preguntas gasta lo que gaste;
nada lo frena y la única pantalla que mide costo de IA sigue diciendo la misma
cifra de siempre. `definiciones.ts:12-14` escribe la regla que el copiloto no
cumple: *«un agente que se activa solo y gasta sin techo es exactamente cómo se
rompe una empresa de una persona»*.

Causa raíz probable: el techo se implementó como propiedad de `llm_costo` por
tenant, y el agente que no tiene tenant se quedó sin ambas cosas —el techo y la
medición— en vez de solo sin una.

### [BAJO] `getSystemPrompt` cae al prompt de liquidación ante una llave desconocida — REINCIDENTE

`src/lib/agents/prompts.ts:5-16`

Escenario: alguien agrega un agente con `systemPromptKey: 'analista_flota_v2'` en
`registry.ts` y olvida el `case`. `getSystemPrompt` no lanza: el `default` de
`:13-15` devuelve `liquidacionPrompt(ctx)`. El agente nuevo —que puede estar
hablando con el contralor en el panel— arranca con *«Hablas por WhatsApp con
OPERADORES (choferes de carga)»* y con la REGLA DE CIERRE que lo autoriza a
llamar `guardar_liquidacion`.

Consecuencia: destinatario equivocado por una llave mal escrita, sin un solo
error. Hoy hay tres llaves y tres `case`; con `agente_definicion` (0116)
invitando a que "un agente nuevo sea una fila", es deuda que cobra factura.

Causa raíz probable: un `default` que adivina en vez de fallar cerrado.

### [BAJO] «Encender exige doble confirmación» no es verdad en ninguna de las dos pantallas que la tarjeta cita

`src/lib/agents/copiloto-acciones.ts:38` × `src/lib/agents/copiloto.ts:164` ×
`src/app/admin/observabilidad/interruptores-ui.tsx:82-101` ×
`src/app/admin/command-palette.tsx:201-204`

La tarjeta que Javier confirma imprime *«Revertir: Encender desde
/admin/observabilidad o el ⌘K (encender exige doble confirmación)»*
(`copiloto-acciones.ts:38`, pintado en `copiloto.tsx:231`), y el system prompt lo
repite (`copiloto.ts:164`: *«Encender un agente … son 🔴 (doble
confirmación)»*). En el árbol de hoy, encender en `/admin/observabilidad` es un
solo submit sin motivo ni confirmación (`interruptores-ui.tsx:82-101`: el campo
`motivo` solo se renderiza cuando la palanca está encendida), y en el ⌘K es un
solo Enter (`command-palette.tsx:204`: `if (i.apagado) void
ejecutarInterruptor('encender', i.id)`).

Consecuencia: el único texto que le explica al fundador cómo deshacer lo que
acaba de hacer describe un mecanismo que no existe — en la tarjeta cuyo trabajo
entero es decir la verdad sobre consecuencias.

Causa raíz probable: el catálogo se escribió contra el diseño §3c (donde encender
es 🔴) y no contra las dos pantallas que ya existían.

## Lo que revisé y está bien

**El cableado nuevo del kill switch, puerta por puerta (no por catálogo).** Abrí
los siete lectores y los conté contra `INTERRUPTORES` (`interruptores.ts:32-37`):
`tools.ts:174` (dentro de `guardar_liquidacion`, la única mutación que cierra —
y a propósito NO en `cuadrar_viaje`, que es lectura), `webhook/route.ts:208`,
`peajes/apagado.ts:23-29` consultado desde las cuatro actions
(`peajes/page.tsx:90,127,174,207`), `correo/entrante/route.ts:159`,
`vendedores.ts:577`, `cron/escalar/route.ts:79,99,124`,
`cron/facturar/route.ts:277-279` y `cola/route.ts:66-68`,
`cron/purgar/route.ts:77`, `cron/wa-pendientes/route.ts:66`. Con `estaApagado`
fail-closed (`interruptores.ts:65-87`). Es cierre por los dos extremos, salvo el
residual de Cobranza que reporto arriba.

**El apagado durable, como plomería.** `guardarEventosPendientes` nunca lanza y
trata 23505 como dedup, no como pérdida (`wa_pendientes.ts:41-49`);
`reclamarPendiente` es un UPDATE anclado a `(intentos, procesado_en is null)` con
el intento contado DENTRO del claim (`:87-98`), así que un evento que revienta el
proceso ya quedó contado; el tope convierte la fila en carta muerta visible, no
en fila borrada (`:69-79`, `:122-131`); el drenado corre EN SERIE para preservar
el orden de llegada (`cron/wa-pendientes/route.ts:77-91`) y el cron está
registrado en `vercel.json` cada 5 minutos, que era lo primero que había que
comprobar. Con `global` abajo el cron sale por `:66-69` y la bandeja espera —
contrato correcto.

**El copiloto NO ejecuta.** El modelo solo arma una previsualización; la
ejecución llega por un POST aparte que exige `confirmado === true` validado en el
servidor (`api/admin/copiloto/route.ts:66-70`), corre sin modelo
(`copiloto-acciones.ts:96-122`), toma el `userId` de la sesión y jamás del cuerpo
(`route.ts:76`), valida el objetivo contra `INTERRUPTORES` antes de tocar nada
(`:109-111`) y reusa `apagar()` —la misma función del ⌘K, con su bitácora—
en vez de escribir la fila por su cuenta (`:115`). La puerta se re-gatea en la
ruta `/api` porque no pasa por el layout (`route.ts:32-37`). El bloque `accion`
se ANEXA aunque la guardia de cifras tumbe la narración (`copiloto.ts:271-275`):
la previsualización es determinista y no depende de que el modelo redacte bien.

**El guardia A0 es determinista de verdad** (`lib/admin/guardia.ts:60-109`): la
severidad sale de reglas con su cita (`:67-85`), el LLM solo redacta, cada fuente
ciega cuenta como su propio S2 (`:97-98`) y `limites` declara por escrito lo que
esta clasificación NO puede detectar (`:104-107`) en vez de fingir cobertura.

**La cola de aprobación, en sus transiciones.** Todo cambio de estado va anclado
a `estado = 'pendiente'` y la segunda resolución simultánea toca cero filas y SE
DICE (`cola.ts:187-192`, `:214-219`); el actor se resuelve con snapshot de email
y la resolución se detiene si no se puede confirmar quién (`:150-157`); el envío
es claim → proveedor → prueba con compensación explícita (`:288-374`); la guardia
de cadencia de 48 h vive en la puerta de salida y falla cerrado si no puede leer
el historial (`:316-340`); una "edición" idéntica al original se limpia para no
mentirle al aprendizaje (`:193-199`).

**`/admin/agentes` no confunde las dos palancas** (`agentes/contenido.tsx:100-111`):
distingue "Sin palanca propia" de "No se pudo leer", y solo pinta kill switch
para los `vivo`; `definiciones.ts:144-149` hace nacer todo agente nuevo
`disenado`, nunca `vivo`.

**Los doce puntos de muerte del turno de WhatsApp que el pase 3 verificó siguen
verificados** contra el árbol de hoy: claim y reentrega de Meta (`:369-382`),
gate del aviso de privacidad (`:617-636`), rama sin viaje abierto (`:638-771`),
barrera de ráfaga fail-closed (`conv.ts:488-610`), mutex ocupado que avisa y
libera claim (`:1984-1993`), re-verificación tras el lock (`:1997-2000`), freno
de cierre sin comprobantes con marca por viaje (`:2023-2034`), sin presupuesto →
resumen determinístico (`:2070-2080`), guardias de salida sobre el snapshot
(`:2262-2274`), entrega del PDF con sus dos modos de fallo dichos al operador
(`:2319-2429`, incluida la frase de `:2390` cuando Meta rechaza el documento), y
`saveConversation` guardando solo lo que el operador leyó (`:2438-2447`).

## Lo que NO alcancé a revisar

- **El ciclo completo del analista del panel** (`agents/analista.ts`,
  `chat-tools.ts`): verifiqué su tope diario y su tool terminal desde la ruta,
  pero no recorrí sus rondas de tools ni su reintento correctivo con la pregunta
  de punto de muerte. Es el otro agente que habla con un humano.
- **`despacho_wa.ts` / `asignar_wa.ts` / `talacha_wa.ts`**: el pendiente único y
  su confirmación SÍ/NO es una máquina de estados con destinatario de oficina;
  el orden de precedencia en `processor.ts:485-558` parece cuidado, pero no lo
  verifiqué contra carreras.
- **El cron de facturación** (`api/cron/facturar/**`, con Chromium): confirmé que
  consulta sus interruptores; su ciclo —claim, CAPTCHA, `cola_atorada`— no lo
  recorrí.
- **El agente de Proveedores por correo**: verifiqué el kill switch en
  `api/correo/entrante/route.ts:159`, no el ciclo "llegó el correo, no se cerró".
- **El drenado sobre eventos viejos**: no comprobé qué pasa cuando
  `processInbound` reprocesa un `mediaId` de Meta con horas de antigüedad
  (`downloadMediaAsDataUrl`), ni si un fallo de descarga ahí consume los 5
  intentos de la carta muerta.
- No pude comprobar el valor real de `LIKIDA_RECUPERAR_CIERRE_PARCIAL` en Vercel
  (sin credenciales). Ese hallazgo se basa en el default del código.
