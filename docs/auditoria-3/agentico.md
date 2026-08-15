# Sistema agéntico y orquestación — auditoría 3 (pase 3)

**Nota: 3/10** (antes 5). Razón del movimiento: mirada más profunda — y deuda que
cobró factura. El camino feliz mejoró de verdad esta ronda (barrera fail-closed,
rejilla de mutaciones, snapshot de cierre, piso de una hora, B7/B8), pero
recorriendo punto-de-muerte por punto-de-muerte aparecieron dos cosas que nadie
había mirado: **el sondeo de arranque suelta el mutex de un viaje vivo** y **cinco
de los ocho interruptores no los lee nadie**. Y AG-C1 sigue exactamente donde
estaba. Con un estado en el que la base dice "liquidado" y el operador lee "se me
trabó", el ancla de este rubro manda 3 o menos.

El riesgo mayor de hoy: la protección contra el doble cierre —el único candado
del camino del dinero por WhatsApp— se puede desarmar desde el propio código de
arranque de Likida, sin que nada lo diga.

## Hallazgos

### [CRÍTICO] El sondeo de migraciones libera el mutex de un viaje que se está liquidando

`src/lib/likida/startup.ts:63-70`

Escenario: el chofer Juan escribe *listo* sobre `VJ-2026-0847`.
`processInbound` toma el lease (`conv.ts:418`, TTL 60 s) y arranca el agente
(~25 s reales con Sonnet + tools). En esos 25 s entra otro POST del webhook y
Vercel levanta una instancia fría — con la base en cero y sin tráfico, casi
*todos* los mensajes caen en instancia fría. `instrumentation.ts` corre
`register()` → `verificarMigracionesCriticas()`:

```
63  const { data: viajeReal } = await admin.from('viaje').select('id').limit(1);
65    const { error } = await admin.rpc('try_lock_viaje', { p_viaje: viajeReal[0].id, p_ttl_ms: 1 });
70    await admin.rpc('unlock_viaje', { p_viaje: viajeReal[0].id }); // liberar el lock de prueba
```

`select id from viaje limit 1` sin `order` ni filtro devuelve una fila
arbitraria: en la base del demo es **el** viaje. `try_lock_viaje` devuelve
`data: false` y `error: null` (el lease está tomado) — y la línea 66 solo mira
`error`, así que no se entera de que **no consiguió nada**. La línea 70 corre
igual, y `unlock_viaje` es un `delete from viaje_lock where viaje_id = ...` sin
token de dueño (`supabase/migrations/0005_concurrencia.sql:45-50`): borra el
lease del turno vivo.

Sale mal así: el segundo "listo" (o el "listo" que el chofer repite a los 5 s)
consigue el lock de inmediato, la re-verificación de `processor.ts:1997` todavía
ve el viaje `abierto` porque el turno 1 no llegó a `guardar_liquidacion`, y
corren **dos ciclos completos de agente sobre el mismo viaje**: dos
`cuadrar_viaje`, dos `guardar_liquidacion`, dos generaciones de los dos PDF, dos
"Listo, cuadré tu viaje 👇" y dos `liquidacion.pdf` al teléfono de Juan, dos
`avisarCierreAlJefe` al jefe, y el turno de Sonnet cobrado dos veces.

Consecuencia: el contralor ve su liquidación duplicada en la sala, con dos
mensajes y dos PDF del mismo folio; el costo por liquidación —la cifra con la
que se pone precio— sale al doble. Y el candado que `startup.ts` existe para
verificar es justo el que este archivo desarma.

Causa raíz probable: un sondeo de producción que ESCRIBE sobre estado
compartido, y que suelta un lock que nunca comprobó haber tomado.

### [CRÍTICO] Cierre parcial: la liquidación cierra, el operador oye "se me trabó" y su reenvío cae en "no tienes viaje abierto"

`src/lib/likida/processor.ts:2276` × `2435-2471` × `770` — **REINCIDENTE** (AG-C1
del pase 2, sigue abierto contra el árbol de hoy).

Escenario, con el punto de muerte exacto: el agente cerró
(`closed = true`, `processor.ts:2099`). La siguiente línea que toca la red es
`const entregado = await say(reply)` (`:2276`). `say` llama a `sendText`, que en
`src/lib/meta/client.ts:120-127` usa `AbortSignal.timeout(10_000)` sobre un
`fetch` **sin try/catch**: ante un corte de red o 10 s de latencia, **lanza**. El
control salta al catch general de `:2435`, que no mira `ctxCerro` para decidir
qué decir (`:2467-2471`) y manda:

> *«Perdón, se me trabó tantito. ¿Me reenvías tu último mensaje? 🙏»*

El bloque del PDF (`:2319-2415`) queda por encima del salto y no corre nunca.
Estado al morir: `liquidacion` escrita, `viaje.estatus = 'liquidado'`, los dos
PDF en storage, `wa_mensaje_procesado` liberado (`:2463`). Estado del humano:
nada. Juan obedece y reenvía "listo" → `getOpenViaje` devuelve `null` porque el
viaje ya no está abierto → `processor.ts:770`:

> *«No tienes un viaje abierto para liquidar ahorita.»*

Callejón sin salida: liquidación cerrada e irreversible (triggers 0036/0037), PDF
existente, y ningún camino por el que llegue. El log de `:2459` sí lo dice
(`cerroSinEntregar: true`) — pero eso cierra el ciclo con el equipo, no con el
operador, que es lo que este rubro mide.

Consecuencia: el chofer se queda debiendo/cobrando una liquidación que no puede
ver, y alguien tiene que entrar a mano a la base para saber cuál fue. En un
demo es el paso 3 del guion muriendo en silencio.

Causa raíz probable: el catch general trata "no pasó nada" y "ya cerró y no
entregué" como el mismo suceso; el único brazo que distingue el cierre está
dentro del `try`.

### [CRÍTICO] El kill switch del agente de liquidación no lo lee nadie (y "Ejecutar ahora" se salta el único que sí está cableado)

`src/lib/likida/interruptores.ts:32-37` (catálogo de ocho) contra sus únicos
lectores: `src/app/api/cron/escalar/route.ts:79,115`,
`src/app/api/cron/facturar/route.ts:277-279`,
`src/app/api/cron/facturar/cola/route.ts:66-68`,
`src/app/api/cron/purgar/route.ts:77`.

Escenario: el agente empieza a cerrar con cifras raras con un cliente real
encima. Javier abre el ⌘K o `/admin/observabilidad`, apaga
**`agente:liquidacion`** con motivo. La fila se escribe, `listarInterruptores`
la devuelve y `interruptores-ui.tsx:79,100` pinta **APAGADO** en rojo con su
nombre y la hora. Treinta segundos después un chofer manda "listo":
`processInbound` (`processor.ts:367`) **no consulta ningún interruptor en
ninguna de sus 2,476 líneas** — corre `runAgent`, llama `guardar_liquidacion`,
cierra irreversiblemente y manda el PDF. Lo mismo con `global`: **no existe
ninguna palanca que detenga el camino de WhatsApp**.

Cinco de los ocho no tienen lector: `agente:liquidacion`, `agente:conductores`
(la escalación de `escalar_viaje.ts`, que sí es un agente del catálogo de
notificaciones), `agente:peajes`, `agente:proveedores`, `agente:ventas`.

Y el único agente de flota con palanca cableada la pierde por el botón: el
"Ejecutar ahora" de Cobranza
(`src/app/dashboard/agentes/cobranza/page.tsx:96-119`) valida permiso
(`:102`) y llama `ejecutarCobranza` en `:108` **sin pasar por `estaApagado`**.
Con `agente:cobranza` apagado por incidente, cualquier `flota_admin` que apriete
ese botón dispara los WhatsApp a los choferes que Javier acaba de detener.

Consecuencia: un control de seguridad que miente en el único momento para el que
se construyó — y el propio archivo lo escribe en su encabezado ("un agente
portándose mal con un cliente real en WhatsApp… si Javier lo apaga"). Rompe
además la regla dura del repo: un rótulo que dice APAGADO tiene que ser verdad.

Causa raíz probable: el catálogo y la UI se construyeron completos y el cableado
se hizo solo donde había cron; no hay una tabla `CON_LECTOR` como la
`CON_EMISOR` que `notificaciones.ts:186-205` sí usa para el mismo problema.

### [ALTO] El PDF que se le manda al jefe es el ejemplar del OPERADOR — sin los veredictos fiscales

`src/lib/likida/processor.ts:2346` × `:2397` × `src/lib/likida/avisar_cierre.ts:127`
× `src/lib/likida/tools.ts:202-203` × `src/lib/likida/liquidacion/pdf.ts:429`

Escenario, con valores: el viaje trae un ticket de diésel de $8,000 cuyo emisor
está en la lista 69-B; el motor levanta `cfdi_efos`. `tools.ts` genera **dos**
ejemplares a propósito: `{tenant}/{viaje}.pdf` (contralor, imprime la sección
DIFERENCIAS DETECTADAS con esa línea) y `{tenant}/{viaje}-operador.pdf`, donde
`pdf.ts:429` filtra `SOLO_CONTRALOR` (`cuadre/resumen.ts:24-33`, que incluye
`cfdi_efos`, `cfdi_cancelado`, `rfc_receptor`, `complemento_hidrocarburos`,
`ieps_no_desglosado`, `texto_sospechoso`). `processor.ts:2346` firma **la ruta
del operador** y pasa esa misma URL a `avisarCierreAlJefe` (`:2397`), que la
manda al teléfono de la oficina como `liquidacion-VJ-2026-0847.pdf`
(`avisar_cierre.ts:127`).

Sale mal así: el jefe recibe, archiva y le entrega a su contador un PDF con el
mismo folio y los mismos totales que el del panel, pero **sin la línea del
proveedor en lista negra de $8,000**. El texto de WhatsApp sí se la dice
(`RUTA_DE_DIFERENCIA.cfdi_efos = 'decision'`), así que el mensaje y su adjunto
se contradicen en el mismo hilo.

Consecuencia: el contralor —el comprador— archiva el documento equivocado y
descubre la contradicción al cruzarlo contra el panel; es exactamente el "se lee
distinto en dos pantallas" que el producto promete no hacer. El propio
encabezado de `avisar_cierre.ts:14-19` dice que ese PDF "es el documento que va a
archivar y que le va a dar a su contador".

Causa raíz probable: `data.signedUrl` se reusa para los dos destinatarios porque
es la que ya estaba firmada; el ejemplar del contralor nunca se firma.

### [ALTO] La recuperación del cierre parcial está detrás de un flag apagado por código

`src/lib/likida/processor.ts:2134`

Escenario: el ciclo del agente ejecuta `guardar_liquidacion` con éxito en la
ronda 3 y la ronda 4 revienta (timeout de los 40 s de `reloj.acotar`, o el
`LoopGuardError` de `openrouter.ts:731`). `generateWithTools` envuelve todo en
`PartialExecutionError` con esa tool en `partialToolCalls` — y la recuperación
solo corre si `process.env.LIKIDA_RECUPERAR_CIERRE_PARCIAL === '1'`. El default
del código es **apagado**; con él apagado se cae al `else` de `:2179` y el
operador recibe *«Perdón, se me trabó el sistema tantito»* sobre una liquidación
que **ya está cerrada en la base**, con el mismo callejón del hallazgo AG-C1.

`.env.example:81` lo trae en `1` y `docs/conocimiento/51-boletin-tecnico.md:101`
lo lista como *«Ya está resuelto detrás del flag; falta prenderlo»* — o sea que
el arreglo depende de una variable de entorno que, según la propia
documentación, sigue sin ponerse en Vercel.

Consecuencia: el brazo del cierre parcial —el punto de muerte más caro del
ciclo— está construido, probado y desconectado. El modo de falla es silencioso:
nada en el sistema dice si el flag está puesto.

Causa raíz probable: un default conservador que sobrevivió a su propia
justificación (HARD RULE 3, "el flag preserva el comportamiento actual").

### [ALTO] Todo el camino de los agentes de fondo consulta Supabase sin techo de tiempo

`src/lib/likida/agentes/notificaciones.ts:622, 654, 678, 700, 738, 765, 794, 811`
· `src/lib/likida/agentes/corridas.ts:54` · `src/lib/likida/pg.ts` (sin una sola
llamada a `acotada`) · `src/lib/likida/agentes/cobranza.ts` (cero `acotada`).

Escenario: `ejecutarCobranzaGlobal` gasta sus 90 s presupuestados
(`cobranza.ts:339,362`) y en el segundo 91 llama `avisarCorridasPorFlota`
(`:399`), que entra a `leerEstado` (`notificaciones.ts:700`). Ese `fetch` hereda
el default de undici: **300 000 ms**, contra el `maxDuration = 120` del cron. Un
socket aceptado que no contesta cuelga la invocación; Vercel la mata a los 120 s.

Sale mal así: se mandaron 40 WhatsApp a choferes reales y **no queda ninguna
fila** en `agente_corrida` para ninguna flota (`registrarCorrida` va después, en
`:401`), no sale el correo de `corrida_fallida` de las que sí fallaron, y la
pestaña "Historial de corridas" del cliente enseña esa hora **vacía** — que se
lee como "el agente no corrió", cuando corrió y contactó a su gente.

`presupuesto.ts:78-101` documenta este modo de falla palabra por palabra y creó
`acotada()` justamente para él; los agentes nuevos de esta ronda nacieron fuera
de esa red.

Consecuencia: el historial que se le vende al cliente como la prueba de que el
agente trabaja puede mentir por omisión, y una corrida colgada se lleva el cron
entero sin dejar un error.

Causa raíz probable: `acotada` se importa por archivo, no está impuesta en una
capa; `corridas.ts` sí la importa (`:17`) pero solo para las lecturas de panel,
no para el `insert` de `:54`.

### [MEDIO] El rescate de claims de Cobranza puede reenviar un recordatorio ya entregado

`src/lib/likida/agentes/cobranza.ts:225-232` × `:312-316`

Escenario: el tier 3 de Juan se reclama, `sendText` **sí** entrega el mensaje
("llevas 3 días sin cerrar el viaje VJ-2026-0847"), y acto seguido el
`update({ enviado: true, detalle: null })` de `:312` falla por un blip de
Supabase — el código solo deja un `logger.warn` (`:316`). La fila queda
`enviado = false, detalle = null`. Una hora después, la corrida siguiente ejecuta
el DELETE de rescate de `:225-232`, cuya condición es exactamente
`enviado = false AND detalle IS NULL AND created_at < ahora - 1h`, con el
comentario *«Una fila sin resultado después de 1 hora es un crash probado»*. El
unique se libera, `colaCobranza` vuelve a ver el tier pendiente y **Juan recibe
el mismo recordatorio por segunda vez**.

Consecuencia: el canal que este agente cuida de volverse ignorable manda
duplicados, y la bitácora que el cliente lee pierde el registro del primer
contacto. El único caso que el rescate no puede distinguir es justo el de un
envío que sí salió.

Causa raíz probable: la fila-claim usa la misma firma (`enviado=false`,
`detalle=null`) para "aún no sé el resultado" y para "murió antes de saberlo".

### [MEDIO] "Ejecutar ahora" que truena no deja corrida ni dice qué alcanzó a mandar

`src/app/dashboard/agentes/cobranza/page.tsx:96-119`

Escenario: el encargado aprieta *Ejecutar ahora*. `ejecutarCobranza` (`:108`) no
está en try/catch, y `leerConfigCobranza` (`cobranza.ts:41`) **lanza** ante un
error de lectura; `colaCobranza` también. La server action rechaza, el cliente
cae al error boundary, y `registrarCorrida` —que está en `:110`, después— no se
ejecuta: no queda fila en `agente_corrida`. Si el fallo ocurre a mitad del bucle
de envíos, hubo mensajes enviados y la bitácora de corridas dice que esa corrida
manual **no existió**.

Además `estado` aquí solo puede valer `'ok'` o `'parcial'` (`:114`): el dominio
tiene `'fallo'` y este llamador no puede producirlo nunca.

Consecuencia: el cliente aprieta un botón que manda WhatsApp a sus choferes y no
tiene forma de saber si salieron; el historial que la ficha promete queda con un
hueco donde sí hubo actuación.

Causa raíz probable: el registro de la corrida se escribió para el camino feliz y
vive fuera de un `finally`.

### [BAJO] `getSystemPrompt` cae al prompt de liquidación ante una llave desconocida

`src/lib/agents/prompts.ts:13-15`

Escenario: alguien agrega un agente con `systemPromptKey: 'analista_flota_v2'` en
`registry.ts` y olvida el `case`. `getSystemPrompt` no lanza: devuelve
`liquidacionPrompt(ctx)`. El agente nuevo —que puede estar hablando con el
contralor en el panel— arranca con *«Eres Likida, el asistente de liquidación de
viajes de {flota}. Hablas por WhatsApp con OPERADORES (choferes de carga)»* y con
la REGLA DE CIERRE que lo autoriza a llamar `guardar_liquidacion`.

Consecuencia: destinatario equivocado por una llave mal escrita, sin un solo
error. Hoy no muerde (dos llaves y un `analista_flota`), pero es deuda que cobra
factura en cuanto haya un séptimo agente.

Causa raíz probable: un `default` que adivina en vez de fallar cerrado.

## Lo que revisé y está bien

**El recorrido punto-de-muerte por punto-de-muerte del turno de WhatsApp**
(`processor.ts`, de arriba a abajo). En cada punto pregunté: si el proceso muere
aquí, ¿qué ve el humano y qué quedó en la base?

1. **Antes del claim** (`:369`) — Meta reintenta solo si la ruta no devolvió 2xx;
   `route.ts:244-249` ya contesta 429 con `Retry-After` para lo que no cupo, y el
   claim convierte la reentrega en no-op. Cierre definido.
2. **Claim indeterminado** (`:374-382`) — no se abandona el turno; se acepta
   reprocesar porque los efectos con dinero tienen candado propio (hash de
   imagen, `on conflict(viaje_id)`). Correcto y documentado.
3. **Gate del aviso de privacidad** (`:617-636`) — cuatro desenlaces, no dos; el
   claim se libera solo cuando el fallo es nuestro y transitorio. Cierre definido
   en los cuatro.
4. **Sin viaje abierto** (`:638-771`) — el XML se conserva por UUID, el
   consolidado se concilia, la foto huérfana se guarda con su imagen, y cada
   rama tiene su frase. La única pérdida declarada (huérfano con `monto: 0` que
   nunca se ofrece) está escrita en el código, no escondida.
5. **Barrera de ráfaga** (`conv.ts:488-610`) — `intakeDelta`/`intakePendientes`
   devuelven `null` y no `0` ante un error, la gracia anti-carrera de 2 s cubre
   fotos y "listo" en el mismo lote, y el `+1` fallido corta la foto en vez de
   sostener la barrera con un incremento que no ocurrió (`processor.ts:855-871`,
   con liberación de claim). Fail-closed real.
6. **Mutex ocupado** (`:1984-1993`) — ya no se abandona en silencio: avisa y
   libera el claim.
7. **Re-verificación tras el lock** (`:1997`) — el segundo "listo" no re-corre el
   agente.
8. **Sin presupuesto para el agente** (`:2070-2080`) — se manda el resumen
   determinístico del motor en vez de arrancar un ciclo que Vercel va a cortar.
   Es el mejor cierre del archivo.
9. **Ciclo del agente** (`openrouter.ts:731-838`) — el loop-guard corta **antes**
   de pagar la última ronda de tools (`:697-700`), el fallback solo reintenta el
   *completado* (nunca re-ejecuta una mutación), la caché cross-round solo guarda
   lecturas exitosas, y la rejilla de `tool-executor.ts:147-169` impide dos
   `guardar_liquidacion` en el mismo ciclo. No encontré un reintento que duplique
   efecto por esta vía.
10. **Guardias de salida** — `guardiaCifras` usa el **snapshot** que
    `guardar_liquidacion` devolvió (`guardia.ts:69-72`, `tools.ts:230`) en vez de
    releer la base, así que el PDF archivado y el WhatsApp narran la misma
    fotografía; `resumenCuadre(..., 'operador')` va explícito en los tres sitios
    (`guardia.ts:114`, `processor.ts:2074`, `:2174`); `guardiaFundamento` recibe
    el historial crudo y decide por tema; `guardiaEstado` cotejando `closed`
    contra las tool calls, con `entrego: 'pendiente'` y no `false`. El portón de
    `cifras.ts:79-90` evalúa por cláusula y cubre cardinales sueltos y palabras.
11. **Entrega del PDF** (`:2319-2415`) — se revisa `pdf_generado`,
    `pdf_contralor_generado`, el resultado de `sendDocument`, y hay frase al
    operador en los dos modos de fallo.
12. **`saveConversation`** (`:2424-2433`) — solo guarda el turno del asistente si
    el envío salió; las marcas se arrastran explícitamente para no borrarlas al
    reescribir el jsonb.

**Lo que llegó de master y aguanta el examen:**

- **Peajes ya es agente**: `desglose_peaje.ts:600-640` registra corrida con
  disparo real y `registrarCorrida` nunca lanza.
- **El escalado se emite de verdad**: `escalar_viaje.ts:260-360` reclama ANTES de
  mandar (`reclamarEscalacion`, UPDATE condicional con `is('escalado_en', null)`),
  cada envío en su propio try/catch para no tumbar el lote, y el par
  `conductores:escalado` está en `CON_EMISOR` con su llamador real.
- **`CON_EMISOR`** (`notificaciones.ts:186-205`) es el patrón correcto para no
  ofrecer interruptores decorativos — y `validarConfigNotificaciones:294-302`
  descarta en el guardado los eventos sin emisor, no solo en el render.
- **El piso de una hora y el parpadeo (B7/B8)**: `debeAvisar:441-517` distingue
  `ultimoDeIncidenteCerrado`, `cerrarIncidente` conserva la huella y
  `guardarMagnitud` la degrada a la marca 1 — el agente que falla un lote sí y
  uno no manda un correo por hora, no uno por lote. `reclamarAviso:773-789` mueve
  la decisión a Postgres con `.or(avisado_en.is.null,avisado_en.lt.<umbral>)`.
- **`FalloDePlataforma`** (`:917-923`) evita acusar al cliente de un problema
  nuestro.
- **Destinatarios**: `repartoDe:565-601` filtra por `puedeVerRuta`, deduplica por
  correo, topa en 20 y declara cada exclusión con su porqué. Nunca operadores.
- **Corte por reloj de Cobranza** (`cobranza.ts:255-266`, `:362-380`): el corte
  ocurre **antes** del claim, así que un tier no se consume sin mandar nada.
- **`avisarCorridasPorFlota`** con `allSettled` y sin propagar: un Resend caído no
  convierte una corrida buena en fallida.

## Lo que NO alcancé a revisar

- **El agente analista del panel** (`agents/analista.ts`, `chat-tools.ts`, 675
  líneas): solo leí su prompt. No recorrí su ciclo de tools, su
  `entregar_respuesta` ni el tope diario `LIKIDA_CHAT_TOPE_DIA_USD`. Es el otro
  agente que habla con un humano y merece su propio recorrido.
- **El agente de Proveedores por correo** (`0108`, disparo `'correo'`): no abrí
  el buzón ni el webhook de entrada; ahí vive el punto de muerte "llegó el
  correo, no se cerró el ciclo".
- **El cron de facturación** (`api/cron/facturar/**`, con Chromium): solo
  verifiqué que consulta los interruptores. Su ciclo de vida completo —claim,
  CAPTCHA, `cola_atorada`— no lo recorrí.
- **`despacho_wa.ts` / `asignar_wa.ts` / `talacha_wa.ts`**: el pendiente único y
  su confirmación SÍ/NO es una máquina de estados con destinatario de oficina que
  no auditté; el orden de precedencia en `processor.ts:485-558` parece cuidado,
  pero no lo verifiqué contra carreras.
- No pude comprobar el valor real de `LIKIDA_RECUPERAR_CIERRE_PARCIAL` en Vercel
  (sin credenciales). El hallazgo se basa en el default del código y en lo que la
  propia documentación del repo dice que falta.
