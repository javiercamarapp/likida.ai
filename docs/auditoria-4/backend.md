# Backend y API — auditoría 4

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura · mirada
más profunda**. De los once hallazgos que dejó el pase 3, **se cerró uno** (el BAJO
del `req.json()` de `/api/demo`); los otros diez —incluido BE-C1— siguen ahí,
línea por línea, en el árbol de hoy. Y el módulo estrella de esta ronda —la bandeja
durable del apagado, que existe precisamente para que un mensaje no se pierda—
tiene su propio camino de pérdida silenciosa que además se **sella como
«procesado»** y pinta el cron en verde. La superficie nueva bien escrita
(`cola.ts`, los chequeos de forma de la 0112, el cron que sí sale 500 con fallos)
es lo único que sostiene el 5 en vez de un 4.

El riesgo mayor del rubro, hoy: **hay dos caminos donde el trabajo no se hace y el
sistema afirma que sí** — el histórico importado que se come la siguiente foto del
chofer (BE-C1), y el drenado de `wa_evento_pendiente` que convierte un timeout del
cron en un evento marcado como procesado que nunca se procesó (BE-C2). Los dos
terminan en una liquidación firmada con el dinero equivocado y ni un log de error.

## Hallazgos

### [CRÍTICO] El histórico importado sigue naciendo `abierto`, y se come la siguiente foto del chofer
`src/lib/likida/importar_viajes.ts:425` × `src/lib/likida/conv.ts:164-181`
(**REINCIDENTE** — es BE-C1, tercera ronda, sigue cerrado a la mitad.)

**Verificado hoy, abriendo los dos archivos.** `importar_viajes.ts:425` sigue
diciendo `estatus: 'abierto'` literal dentro del `lote` del upsert. El pre-chequeo
de ocupados que llegó en `17dd02b` sigue puesto y sigue siendo correcto
(`:376-394` lee, falla CERRADO si la lectura truena; `:397-405` salta la fila y la
reporta en `operadorOcupado`), pero solo actúa cuando el operador **YA** está
ocupado. El caso de onboarding —el único que existe hoy, con la base en 0 viajes—
es el contrario.

Escenario, con valores: flota nueva, Pedro Ramírez sin viaje abierto. El contralor
sube el export del TMS de julio: `TMS-900`, operador «Pedro Ramírez», `anticipo:
12000`, `fecha_inicio: 2026-07-03`. Se crea con `estatus: 'abierto'`. Al día
siguiente Pedro sale de verdad y manda por WhatsApp la foto del diésel de $3,400 →
`getOpenViaje` (`conv.ts:164-181`, `.in('estatus', ['abierto','en_cuadre'])
.order('created_at', desc).limit(1)`) devuelve `TMS-900` porque es el único
`abierto` de Pedro → el gasto se ancla ahí → Pedro escribe «listo» → el cuadre
corre contra **$12,000 de anticipo de un viaje de julio** y emite una liquidación
con $8,600 en contra de Pedro. El cierre es IRREVERSIBLE (triggers 0036/0037).

Consecuencia: el chofer queda debiendo $8,600 que no recibió, y el contralor firma
un PDF con el anticipo equivocado. Nadie recibe un error: importar y liquidar
reportan éxito los dos.

Efecto lateral medible sin escenario, también intacto: por
`uq_viaje_abierto_por_operador` (0029) más el `ocupados.add(id)` de `:404`, **entra
UNA sola fila por operador y por corrida**. Un export de 180 viajes de 20
operadores importa 20 y reporta 160 «saltados porque su operador ya trae un viaje
abierto», culpando a la flota de una condición que creó el import.

Causa raíz probable: un histórico no es un viaje abierto; el estatus del import se
decidió por default y no por el dato del archivo.

**Prueba que lo cubra: ninguna.** `importar_viajes_escritura.test.ts` prueba a
fondo el dedup y los dos candados (incluido `:214`, «el operador que YA trae viaje
abierto en la base se salta con su folio»), y no prueba nada de lo que pasa
DESPUÉS con el viaje creado.

### [CRÍTICO] El drenado del apagado sella como «procesado» un mensaje que nunca se procesó, y sale 200 verde
`src/app/api/cron/wa-pendientes/route.ts:78-91` × `src/lib/likida/processor.ts:369-373`
× `src/lib/likida/wa_pendientes.ts:103-109`
(Superficie NUEVA de esta ronda — `d682d7a`, mig. 0119.)

El lazo de drenado corre **en serie** (`route.ts:78`, declarado a propósito) hasta
`LOTE = 10` mensajes, y **no tiene reloj**: no hay `venceEn`, no hay corte por
presupuesto — a diferencia de `cron/facturar/route.ts:130-160`, que sí corta el
lote por reloj antes de abrir otra sesión. Cada `processInbound` se auto-asigna
`PRESUPUESTO_WEBHOOK_MS = 120_000` (`presupuesto.ts:188`), que es **el
`maxDuration` entero del cron** (`route.ts:17`). Un solo «listo» que dispara el
cierre completo (barrera 20s + mutex 12s + agente ~40s ≈ 72s) ya se lleva más de la
mitad de la ventana.

Y cuando la invocación muere a media pasada, la recuperación no recupera: la
convierte en un sello falso.

Escenario, con valores. Javier apaga `global` 30 minutos. Doce choferes mandan
fotos → doce filas en `wa_evento_pendiente`. A las 10:00 sube la palanca; el cron
de las 10:05 toma diez:

1. `wamid.1` es el «listo» de Pedro → cierre completo, **72 s**.
2. `wamid.2` y `wamid.3`, dos fotos con OCR ~20 s → **112 s**.
3. `wamid.4`: `reclamarPendiente` estampa `intentos 0→1` (`wa_pendientes.ts:87-98`)
   → `processInbound` → `claimMessage('wamid.4')` **INSERTA** en
   `wa_mensaje_procesado` (`conv.ts:343-348`) → a los 120 s Vercel mata la
   invocación. El OCR nunca corrió, el `gasto` nunca se escribió.
4. 10:10, corrida siguiente: `wamid.4` vuelve a salir en `pendientesPorDrenar`
   (`procesado_en` sigue null), `reclamarPendiente` lo toma (`intentos 1→2`),
   `processInbound` → `claimMessage` devuelve **`'duplicado'`** → `processor.ts:370-373`
   hace `logger.info('wa.duplicate')` y **`return`** → el cron ejecuta
   `marcarPendienteProcesado('wamid.4')` (`route.ts:83`) → `procesado_en = now()`,
   `procesados++` → **`{ corrio: true, procesados: N, fallidos: 0, cartasMuertas: 0 }`
   con status 200**.

Salida: la foto del diésel de $3,400 de ese chofer no existe en ninguna parte. La
bandeja dice «procesado». `cartasMuertas` es 0, así que `alertarOperador` no suena.
Vercel pinta el cron en verde. El único rastro es un `wa.duplicate` a nivel `info`
que afirma lo contrario de lo que pasó.

Consecuencia: la liquidación de ese viaje cierra sin esos $3,400 y el chofer los
paga de su bolsa; y el mecanismo que se construyó para que «apagado = pausado y
durable» entrega exactamente la pérdida silenciosa que su cabecera
(`wa_pendientes.ts:1-16`) declara haber cerrado. Con `LOTE = 10` en serie y
`processInbound` autorizado a gastar los 120 s completos, esto no es un borde: es
el comportamiento esperado de cualquier lote con dos o tres mensajes pesados.

Causa raíz probable: dos cosas juntas. (a) el lazo no tiene presupuesto de reloj,
así que un lote grande siempre parte a alguien por la mitad; y (b) `processInbound`
devuelve `void`, así que el cron **no puede distinguir «lo procesé» de «lo salté
por duplicado»** — y trata el segundo como prueba de completitud. `claimMessage`
significa «alguien reclamó ese wamid», nunca «ese wamid terminó de procesarse».

**Prueba que lo cubra: ninguna.** `cron/wa-pendientes/route.test.ts` tiene ocho
casos y los ocho mockean `processInbound` como `async () => {}` instantáneo
(`:12`, `:53`): cubre el sello (`:75`), el rechazo (`:84`), el claim perdido
(`:93`), el SLA (`:102`, `:109`) y las cartas muertas (`:117`). No hay ningún caso
con reloj, ninguno con un lote que no cabe, y **ninguno donde `processInbound`
retorne sin haber hecho nada**.

### [ALTO] Dos pagos simultáneos a la misma factura se escriben los dos: el saldo sale negativo y «cobrado» sale al doble
`src/lib/likida/facturacion_escritura.ts:395-413`
(**REINCIDENTE** — sin cambios respecto al pase 3, verificado línea por línea hoy.)

`registrarPago` lee la suma de pagos previos (`:395-401`), decide con `evaluarAbono`
(`:403`) y **después** inserta (`:406-413`). Entre la lectura y el insert no hay
lock, no hay `Idempotency-Key`, y `pago_recibido` no tiene más constraint que
`pago_monto_positivo` (0049): la base no arbitra nada.

Escenario: factura `emitida` por $50,000.00, saldo $50,000.00. Dos POST del server
action `guardarPago` a la vez (dos pestañas, o el `useFormStatus` reactivado tras
un timeout del edge). Los dos leen `pagado = 0`, los dos calculan `saldo = 50000`,
los dos pasan el tope, los dos insertan. En la vista `factura_saldo`: `pagado =
100000`, `saldo = -50000`. El segundo `update … .eq('estatus','emitida')` toca 0
filas y se registra como `facturacion.estatus_pagada_no_escribio` (`:425-431`) — el
log culpa a un fallo de escritura que no ocurrió.

Consecuencia: la cartera le dice al contralor que ese cliente pagó $100,000 cuando
su banco dice $50,000. Es exactamente la cifra que cruza contra su estado de cuenta.

Causa raíz probable: la regla de dinero (`evaluarAbono`) es pura y está probada,
pero se aplica sobre una lectura sin candado y sin respaldo en la base. El patrón
correcto ya existe en el repo, doce archivos más allá: el claim condicional de
`facturacion/al_vuelo.ts:626-659`.

**Prueba que lo cubra: ninguna.** `facturacion_escritura.test.ts:11` sigue
declarándolo textualmente: «Las escrituras (`crearFactura`, `registrarPago`) no se
prueban». `grep registrarPago --include=*.test.ts` devuelve **solo ese comentario**.

### [ALTO] Un blip de la base al guardar la factura de proveedor cierra el correo en 200 y ese CFDI no vuelve jamás
`src/app/api/correo/entrante/route.ts:267` × `src/lib/likida/proveedores.ts:54-56, :147-151`
(**REINCIDENTE** — el tipo y la línea del webhook están idénticos.)

`ResultadoIngesta` sigue siendo `{ ok: false; motivo: 'duplicada' | 'error' }`
(`proveedores.ts:56`): no tiene un valor para «fallo nuestro y transitorio». Así,
`motivo: 'error'` sale tanto de un CFDI inservible (permanente) como de cualquier
fallo del INSERT que no sea 23505 (`:149-150`, transitorio). El webhook solo mira
`r.ok` (`route.ts:267`: `if (r.ok) guardadas++; else ignoradas++;`), e `ignoradas`
no toca `caidas`, que es la única variable que dispara el 503 y la liberación de
`correo_procesado` (`:277-306`).

Escenario: la refaccionaria manda el CFDI de $18,400.00. Firma correcta, buzón
resuelto, `correo_procesado` ya insertado, XML parseado, y el `insert` en
`factura_proveedor` devuelve `57014 statement timeout`. → `motivo: 'error'` →
`ignoradas = 1`, `caidas = 0` → **no** se libera la fila de dedup → la corrida se
anota `estado: 'ok'` → `200 {ok:true, guardadas:0, ignoradas:1}`. Resend no
reintenta un 200; si el correo se reentrega, el insert de `correo_procesado` choca
con la PK y sale «ya_procesado».

Consecuencia: la factura de $18,400 no existe para la contabilidad de la flota, la
bandeja de Proveedores dice que la corrida salió bien, y el único rastro es un
`proveedores.guardar_fallo`. Es el modo de falla que la cabecera del archivo
(`route.ts:33-43`) declara estar evitando.

**Prueba que lo cubra: ninguna.** `route.test.ts` cubre a fondo la descarga caída
(el `fetch`), no el fallo del escritor.

### [ALTO] Stripe entrega desordenado y la suscripción cancelada se reactiva sola
`src/lib/saas/suscripcion.ts:339-353` × `src/app/api/stripe/webhook/route.ts`
(**REINCIDENTE** — `aplicarSuscripcion` sigue sin leer ningún reloj.)

`marcarEvento` (`:282-294`) dedupea por `evt.id`, que cubre el REINTENTO del mismo
evento. No cubre dos eventos DISTINTOS aplicados en orden invertido:
`aplicarSuscripcion` arma `campos` (`:339-349`) y escribe `estado`, `periodo_fin` y
`cancelada_en` **sin comparar contra nada** (`:351-353`). La interfaz `EventoStripe`
del route no lee el `created` del evento, así que no hay con qué ordenar.

Escenario, con valores: 10:00:00 llega `customer.subscription.updated` (evt_A,
`status: 'active'`) para `sub_1XYZ` → base caída → `aplicar` lanza → `desmarcar`
borra la marca → 500, Stripe lo encola. 10:00:20 llega
`customer.subscription.deleted` (evt_B) → se aplica → `suscripcion.estado =
'cancelada'`, `cancelada_en = now()`, `tenant.plan = 'basico'`. 10:05:00 Stripe
reintenta evt_A → `marcarEvento` dice «nuevo» → `aplicarSuscripcion` busca por
`stripe_subscription_id` (`:332-336`), encuentra la MISMA fila, y escribe `estado:
'activa'`, `cancelada_en: null`.

Consecuencia: la flota que canceló conserva el plan pagado indefinidamente y en
`/admin` aparece como activa. Los tres eventos contestaron 200; nadie se entera.

Causa raíz probable: la idempotencia está resuelta (por `evt.id`) y el **orden**
no; son dos problemas distintos y solo hay defensa para uno.

**Prueba que lo cubra: ninguna.** `suscripcion_eventos.test.ts` prueba el repetido
y el aplicado; `stripe/webhook/route.test.ts` prueba el repetido. Ningún caso
invierte dos eventos.

### [ALTO] El cron de escalación con el 100% de sus envíos fallidos contesta 200 y no alerta a nadie
`src/app/api/cron/escalar/route.ts:104-106, :148` × `src/lib/likida/escalar_viaje.ts:268, :307, :344, :351, :358`
(**REINCIDENTE** — verificado hoy contra el árbol; OP-C1 sigue cerrado solo para la
excepción.)

`huboFallo` (`route.ts:90`) solo se pone en `true` en los dos `catch` (`:118`,
`:140`). Los fallos POR VIAJE no lanzan: se recogen en `r.fallos`
(`escalar_viaje.ts:268, :307, :344, :351, :358`) y la función retorna normal.

Escenario: el token de WhatsApp Cloud caduca. La corrida de las 09:00 revisa 20
viajes sin aceptar; los 20 `sendText` tiran 401 y caen en el catch por viaje.
`r = { revisados: 20, escalados: 0, fallos: [20 strings] }`. `huboFallo` sigue
`false` → `logger.info('cron.escalar.ok', {...r})` (`:105`) →
`NextResponse.json(resultado, { status: 200 })` (`:148`). Vercel en verde, Sentry
mudo, `alertarOperador` sin llamar.

Consecuencia: los 20 jefes de flota no se enteran de que su chofer no aceptó,
durante los días que tarde alguien en abrir el JSON de la corrida.

Contraste que vale la pena anotar: el cron NUEVO de esta ronda **sí** lo hace bien
—`wa-pendientes/route.ts:101` sale `status: fallidos > 0 ? 500 : 200`—. El criterio
correcto ya está escrito en el repo; a este archivo no se le aplicó.

**Prueba que lo cubra: ninguna.** `cron/escalar/route.test.ts` tiene nueve casos
(`:55, :61, :75, :82, :99, :113, :126, :146, :155`) y todos los de fallo son
`mockRejectedValue`, o sea la excepción. **No hay ningún caso con
`fallos.length === revisados`.**

### [ALTO] La guardia de cadencia de 48 h se apoya en una escritura cuyo error solo se loguea — y la pantalla afirma que sí se escribió
`src/lib/likida/agentes/cola.ts:316-340` × `:365-373` × `src/app/admin/aprobaciones/page.tsx:66`
(Superficie NUEVA — mig. 0118/0120, `884c8c0`/`d682d7a`.)

`enviarPiezaPorCorreo` lee `prospecto_contacto` de las últimas 48 h antes de mandar
(`:322-340`) y falla CERRADO si la lectura truena — correcto y probado. Pero el
**único escritor** de esa tabla en el camino de salida es el insert de `:367-371`,
cuyo error **solo se loguea** (`:372`, `logger.error('cola.contacto_no_registrado')`)
y no cambia el resultado: la función devuelve `{ ok: true, … }`. Lo mismo en
`marcarEnviada:241-248`.

Escenario, determinista y sin carrera: pieza P1 para el prospecto «Transportes del
Bajío» (correo `contraloria@tdb.mx`). Claim OK → Resend acepta → `provider_message_id`
escrito → el insert en `prospecto_contacto` devuelve un `57014 statement timeout`
→ `logger.error` y `return ok`. La pantalla imprime, textual: «Enviada a
contraloria@tdb.mx — Resend la aceptó (re_abc123) **y el contacto quedó en el
historial del prospecto**» (`page.tsx:66`), que es falso. Al día siguiente el
agente de leads encola P2 para el mismo prospecto, Javier la aprueba y la manda: la
guardia lee `prospecto_contacto` → **cero filas en 48 h** → la deja pasar → segundo
correo en frío a la misma persona en 24 h.

La variante de carrera existe también y no está cubierta: dos piezas aprobadas del
mismo prospecto enviadas casi a la vez; los dos claims son de filas DISTINTAS de
`cola_aprobacion`, así que los dos ganan, los dos leen el historial vacío y los dos
salen. La guardia es lectura-decide-escribe sobre una tabla sin candado; la base no
arbitra nada (no hay unique por prospecto+ventana).

Consecuencia: exactamente lo que el comentario de `:316-321` dice venir a evitar —
«Un lead del censo es finito: dos correos en menos de 48 h lo queman» —, con el
agravante de que el acuse en pantalla afirma que el eslabón que lo impide quedó
escrito.

Causa raíz probable: la guardia es fail-closed del lado de la LECTURA y best-effort
del lado de la ESCRITURA; el dato que decide vive en una tabla que se puede quedar
vacía sin que nadie lo note.

**Prueba que lo cubra: parcial y por el lado equivocado.** `cola.test.ts:230` cubre
«contactado hace <48h no se vuelve a tocar» y `:244` «historial ilegible → no se
manda». Ninguna cubre el insert del historial que falla (el análogo existe solo
para `marcarEnviada`, `:141`, y ahí se prueba que **no se deshace** — no que la
cadencia siguiente quede ciega), ni dos piezas del mismo prospecto.

### [ALTO] El rescate de claims huérfanos de Cobranza borra el claim de un WhatsApp que SÍ salió, y lo vuelve a mandar
`src/lib/likida/agentes/cobranza.ts:226-232` × `:311-315`

El rescate borra toda fila de `cobranza_contacto` con `enviado = false AND detalle
IS NULL` y más de una hora de antigüedad, con este argumento explícito: «Las filas
legítimas no caen aquí: las de sin-teléfono y las de envío rechazado siempre llevan
`detalle`» (`:224-225`). **El camino feliz no lleva `detalle`.** `detalle` se
inicializa en `null` (`:275`) y en un envío exitoso nunca se toca: el update de
`:311-314` escribe `{ enviado: true, detalle: null }` — y su error se traga con un
`logger.warn('cobranza.resultado_sin_anotar')` dentro de un `.then()`
(`:315`), sin cambiar nada del resultado de la corrida.

Escenario, con valores: viaje `TMS-441`, tier 1, operador Juan Pérez (`5215512345678`).
09:00 el claim entra (`enviado=false, detalle=null`). `sendText` devuelve el wamid:
**Juan recibe el recordatorio**. El `update({enviado:true, detalle:null})` choca con
un timeout → `warn` → la fila se queda `enviado=false, detalle=null`. `r.contactados++`
igual, la corrida sale bien. 10:00 la corrida siguiente ejecuta el rescate: la fila
tiene >1 h, `enviado=false`, `detalle=null` → **la borra**. El unique
`(viaje, tier)` queda libre → `colaCobranza` vuelve a incluir `TMS-441` en el tier 1
→ Juan recibe **el mismo recordatorio otra vez**, y el tier se consume dos veces.

Consecuencia: el chofer recibe mensajes repetidos de un agente automático (el
escenario que la cadencia y los tiers existen para evitar), y la bitácora que el
panel enseña como «lo que el agente hizo» pierde el primer contacto. En un piloto,
un bot que le escribe dos veces lo mismo al chofer del cliente es lo que el
contralor ve en su teléfono.

Causa raíz probable: el rescate usa `detalle IS NULL` como sinónimo de «crashó
antes de mandar», y ese estado también es el del **éxito cuya segunda escritura
falló** — que es justo el error que solo se loguea.

**Prueba que lo cubra: ninguna** de las cuatro (`cobranza.test.ts`,
`cobranza_cola.test.ts`, `cobranza_global.test.ts`, `cobranza_reloj.test.ts`) hace
fallar el update del resultado y luego corre el rescate.

### [MEDIO] La segunda escritura del webhook de Stripe se ignora con un `warn`, y es la que ve Javier
`src/lib/saas/suscripcion.ts:381-382`
(**REINCIDENTE**, sin cambios.)

`aplicarSuscripcion` escribe `suscripcion` y luego sincroniza `tenant.plan`; si esa
segunda escritura falla, solo hay `logger.warn('stripe.tenant_plan')` y la función
retorna éxito → el webhook contesta 200 → el evento queda consumido para siempre.

Escenario: `customer.subscription.deleted` de la flota Innovativos.
`suscripcion.estado` pasa a `cancelada`. El `update` de `tenant` devuelve error
(RLS, timeout) → warn → 200. `lib/admin/negocio.ts` lee `tenant.plan` para pintar la
consola de Javier: la flota sigue apareciendo como del plan que ya no paga.

Consecuencia: la única pantalla donde Javier ve quién paga qué miente sobre una
flota cancelada — y el comentario de `:378-380` describe ese daño exacto dos líneas
antes de permitirlo.

### [MEDIO] El mismo folio tiene dos reglas según por qué puerta entre: 400 en la API, recorte silencioso en el importador
`src/lib/likida/importar_viajes.ts:160` vs `src/app/api/v1/_escritura.ts:175-180` × `src/app/api/v1/viajes/route.ts:191`
(**REINCIDENTE**, las tres líneas verificadas hoy.)

`viajes/route.ts:191` declara `texto(cuerpo, 'folio', { obligatorio: true, max: 64 })`
y `_escritura.ts:176-179` **lanza** con el porqué escrito: «un folio truncado
dedupea contra el folio equivocado, que es peor que un 400». `importar_viajes.ts:160`
hace `.slice(0, 40)` sin decir nada, sobre la MISMA columna que sostiene
`viaje_folio_unico` (0092).

Escenario: el TMS emite folios tipo `INNOVATIVOS-2026-SUCURSAL-QRO-000000000000901`
(45 chars). El POST a `/v1/viajes` lo crea entero. El contralor sube el mismo export
por pantalla: el importador lo recorta a `INNOVATIVOS-2026-SUCURSAL-QRO-0000000000`
(40), que no empata con el existente en `existentes` ni choca con el unique → si el
operador está libre, se crea un **segundo viaje** para el mismo viaje real, con su
anticipo contado dos veces en el Registro.

Consecuencia: la doble contabilización del anticipo que la mig. 0092 existe para
impedir, entrando por la única puerta que no respeta su regla.

### [MEDIO] El aviso de «solo leí las primeras 2,000 filas» se pierde antes de llegar a la pantalla
`src/lib/likida/importar_viajes.ts:153, :210` × `src/app/dashboard/viajes/page.tsx:95, :99-115`
(**REINCIDENTE**.)

`interpretarFilasViajes` corta en `f <= 2000` (`:153`) y devuelve `{ viajes,
descartadas, error: 'El archivo trae más de 2,000 filas — se leyeron las primeras
2,000…' }` (`:210`) — con el error puesto Y las 2,000 filas leídas. El server action
solo trata el error como fatal si `viajes` vino vacío (`page.tsx:95`); si hay filas,
importa y arma el `resumen` (`:100-115`), que no tiene campo donde quepa una
advertencia.

Escenario: el contralor sube el export anual de 3,140 viajes. Se leen 2,000, se
importan los que pasan los candados, y la pantalla dice «creados: N». Las 1,140
filas restantes no se leyeron nunca y no aparecen en ninguna parte de la respuesta.

Consecuencia: el Registro queda con un pedazo del periodo y el rótulo dice que el
import salió bien — rótulo que no es verdad, en la pantalla que alimenta el cruce
de peajes.

### [MEDIO] `/api/dashboard/ingesta` gasta visión por petición sin tope, sin rate limit y sin registrar el costo
`src/app/api/dashboard/ingesta/route.ts:28-71`
(**REINCIDENTE** — verificado hoy: el archivo no importa `rateLimit` ni
`registrarCosto`.)

Sigue siendo el único endpoint que llama al modelo sin ninguna de las tres defensas
de sus vecinos: no llama `rateLimit` (grep sobre el archivo: cero ocurrencias), no
tiene el tope diario por tenant que `chat/route.ts` sí impone, y no llama
`registrarCosto` — aunque **sí calcula** el costo y lo tira a un log
(`:52`, `costoUsd: r.costo.costoUsd`).

Escenario: un contador con sesión válida deja una pestaña reenviando la misma foto
de 6 MB. Cada POST es una llamada de visión a ~$0.005 USD. 1,000 llamadas en una
tarde son ~$5 USD que no entran a `llm_costo`: no los ve el tope diario del chat, no
los ve `resumen_costo_ia_tenant()` y no los ve la pantalla «Costo de IA» de `/admin`.

Consecuencia: el panel de costo de Javier reporta un gasto menor al real y no hay
freno ninguno para un bucle. El costo ya está medido en la mano, tres líneas antes
de tirarse.

### [MEDIO] El rate limit del webhook de WhatsApp ahora es un viaje de red POR MENSAJE, en serie y antes del 200
`src/app/api/webhook/whatsapp/route.ts:146-148` × `src/lib/ratelimit.ts:188-197, :253-263`
(Consecuencia NUEVA de `d682d7a`: `rateLimit` pasó a ser `async` con backend
Upstash.)

`for (const m of messages) { if (await rateLimit(\`wa:${m.from}\`, …)) … }` corre
**una llamada HTTP a Upstash por mensaje, en serie, dentro del handler y antes de
contestar**. `intentarRedis` tiene `TIMEOUT_REDIS_MS = 1200` (`ratelimit.ts:161`) y
ante fallo cae a memoria — pero solo **después** de esperar el timeout completo.

Escenario: Meta entrega en un POST la ráfaga de 22 fotos de un chofer y Upstash
está degradado (no caído: lento). 22 × 1.2 s = **26.4 s antes de la primera línea
de negocio**, todo consumido antes del 200 y antes de que arranque el `after()` que
tiene el presupuesto real de procesamiento. Meta deja de esperar y reentrega el
payload completo → la reentrega paga los mismos 26 s → y así hasta que Meta se
rinde. El log queda con 22 `ratelimit.redis_fallo`.

Consecuencia: la ráfaga entera se pierde por el camino que el propio archivo
(`:128-143`) declara ser la red de seguridad, y `MAX_EN_PARALELO` —que se puso para
que la ráfaga cupiera— no llega a ejercerse. Un limitador cuyo modo de falla es
alargar la petición que protege está del lado equivocado.

Causa raíz probable: el limitador cambió de síncrono-en-memoria a red sin que
cambiara su punto de llamada, que es dentro de un bucle serial en el borde.

### [BAJO] `/api/admin/copiloto` gasta modelo sin rate limit ni tope diario
`src/app/api/admin/copiloto/route.ts:54-116`

La puerta está bien (401/403 re-chequeados en el route, `:32-37`), la validación del
historial es estricta (`:41-52`, 24 turnos × 2,000 chars, último turno obligado a
`usuario`), y la decisión de no cargar el costo a `llm_costo` está razonada
(`:15-19`). Lo que no hay es freno: ni `rateLimit`, ni el tope diario que
`chat/route.ts` sí impone, y el costo solo va a un `logger.info('copiloto.costo')`
(`:101-104`) que ninguna pantalla suma. Hoy solo Javier alcanza la ruta, así que es
deuda, no incidente — pero es el único agente que **lee la compañía entera** por
llamada, o sea el turno más caro del repo, y el único sin techo.

### [BAJO] Los límites del plan se enseñan y no se imponen en ninguna escritura
`src/lib/saas/suscripcion.ts:183-195` × `src/app/api/v1/viajes/route.ts`
(**REINCIDENTE**.)

`getUso` y los `limite_*` se leen únicamente para pintar `/dashboard/suscripcion`.
Ni `crearViaje`, ni `POST /v1/viajes`, ni el importador los consultan. Una flota en
el plan más chico mete viajes sin techo por API. Deuda de negocio hoy (0 clientes);
cobra factura el día que haya dos planes con precios distintos.

## Lo que revisé y está bien

Con nombre de test donde lo hay. Digo explícitamente qué caminos de concurrencia
están cubiertos y cuál es el `it()`.

**CERRADO desde el pase 3: el cuerpo mal formado de `/api/demo`.**
`api/demo/route.ts:44-51` ahora lee `req.text()`, mide el largo REAL contra
`MAX_BODY` (segunda medición, la que `bodyExcede` no puede hacer) y envuelve el
`JSON.parse` en `try/catch` → 400, no 500. El BAJO del pase 3 está muerto.

**`cola_aprobacion` (0117/0120) — la superficie nueva mejor escrita de la ronda.**
Toda transición va anclada a `estado = 'pendiente'` y el cero-filas SE DICE
(`cola.ts:187-192`, `:214-219`); el envío real es CLAIM → proveedor → prueba con
compensación (`:287-374`); el snapshot del actor se exige antes de resolver
(`:150-157`, y si el email no se lee la resolución se DETIENE); `encolarPieza`
traduce el 23503 de la FK a texto de pantalla (`:57-58`).
**Tests de concurrencia, nombrados:** `cola.test.ts:83` («cero filas = alguien la
resolvió antes, y se dice»), `:89` (el UPDATE anclado + snapshot del actor), `:99`
(sin poder confirmar quién resuelve, se detiene), `:165` («CLAIM anclado a
(aprobada ∧ no enviada) — dos clicks: el segundo toca cero filas y se dice»),
`:201` (Resend rechaza → compensación, la pieza sigue enviable), `:244` (historial
ilegible → no se manda). Los 17 casos pasan (corrida verificada esta sesión).

**`wa_pendientes.ts` — el claim y la lectura.** `reclamarPendiente` (`:87-98`) es un
UPDATE anclado a `(id, intentos, procesado_en is null)` que devuelve filas: Postgres
arbitra la carrera, y el intento viaja EN el claim, así que un proceso que revienta
ya dejó contado su intento. `pendientesPorDrenar` (`:69-79`) y `cartasMuertas`
(`:122-131`) LANZAN ante error y `cartasMuertas` además exige que el `count` sea un
número — «0 vencidas con la base caída» no puede pasar. `guardarEventosPendientes`
(`:33-57`) trata el 23505 como dedup y no como pérdida, y grita con ids completos lo
que sí lo es. **Tests:** `cron/wa-pendientes/route.test.ts:93` (el claim perdido no
procesa ni cuenta como fallo) — es el único camino de concurrencia de este módulo
que tiene prueba, y sí la tiene. Mi CRÍTICO BE-C2 está en el lazo del cron, no aquí.

**El apagado del webhook.** `webhook/whatsapp/route.ts:208-218` consulta el
interruptor DENTRO del `after()`, persiste en vez de tirar, y corre
`flushObservabilidad` también en esa rama. **Tests:** `apagado.test.ts:95` (apagado,
NINGÚN mensaje llega al procesador y TODOS quedan guardados), `:110` (una ráfaga
entera queda guardada), `:121` (encendido, la bandeja NI SE TOCA), `:127` (ni
siquiera el primero de una ráfaga), `:142` (deja rastro con los ids), `:154` (el
flush corre), `:163` (se consulta el interruptor GLOBAL). Ocho casos, y cubren el
contrato declarado.

**Los agregados vía RPC de la 0112 fallan CERRADO por FORMA, no solo por error.**
`analytics.ts:107-134` exige `Array.isArray(data) && data.length === pasos`;
`:179-190` y `:640-650` exigen que los seis/cuatro campos sean `number`;
`repo.ts:900-925` exige exactamente una fila y dos finitos. En los cuatro, «¿migración
sin aplicar?» lanza en vez de devolver ceros que se verían medidos — que es
exactamente la regla dura de CLAUDE.md aplicada al caso nuevo. Las cuatro funciones
SQL filtran `tenant_id = p_tenant` en cada CTE (verificado línea por línea en
`0112_agregados_rpc.sql:152-157, :219-249, :312-320, :375-382`), son `security
invoker`, llevan `set search_path = public, pg_catalog` y su `revoke … from public,
anon, authenticated` + `grant … to service_role`. `p_tenant` va sin default en las
cuatro.

**El backend de rate limit se migró sin dejar un `await` atrás.** `grep -rn
"rateLimit("` sobre `src/` no devuelve **ni un** call site sin `await` — que era el
modo de falla obvio de volver síncrona una función asíncrona (`if (!promesa)` es
siempre `false` y el limitador desaparece). `_comun.ts:190, :218, :251` corregidos.

**`/v1` — el camino de escritura idempotente sigue intacto.** `_escritura.ts:694-780`
(memoria → recuerdo durable 0098 → llave natural → insert, 409 si el contenido no
coincide, relectura si el insert choca); `chocoContra` exige las DOS señales (23505 +
nombre de la restricción). **Tests de carrera, nombrados:** `_escritura.test.ts:309,
:332, :357, :375, :389, :405, :469` (carrera con contenido distinto → 409), `:505`
(la que pierde recibe la fila que ganó, no un 500), `:528` (chocó y la fila no
aparece → ruidoso, no se inventa id), `:777` (carrera de unidad). Sigue siendo el
único rubro del repo donde cada camino de concurrencia tiene su prueba con nombre.

**La puerta de `/v1`** (`_comun.ts:188-266`): tasa por IP antes de gastar un viaje a
Supabase, `urlSinTenant` borrando el `?tenant=` en el borde, la llave mandando sobre
la cookie, área explícita sin default, `areaDeLlaveAlcanza` fallando cerrado ante un
área desconocida. **Tests:** `_escritura.test.ts:205, :221, :233, :263`.

**Mutex por viaje.** `conv.ts:418-464` distingue RPC ausente de error transitorio;
`processor.ts:1984-2000` abandona el turno liberando el claim y re-verifica que el
viaje siga abierto después de tomar el lock. **Tests:** `conv_lock.test.ts:30, :36,
:42, :47, :56, :63` — los seis caminos, incluido el transitorio que no cede.

**Barrera de intake.** `conv.ts:524-549` (`null` es «no sé» y no abre la barrera),
`:567-611` (`esperarIntake` con gracia inicial). **Tests:** `barrera.test.ts`,
`barrera_fail_closed.test.ts`, `barrera_sondeo.test.ts`.

**Claim de la cola de facturación.** `facturacion/al_vuelo.ts:626-659`: UPDATE
condicional que devuelve filas, con la condición sobre la misma columna que pisa, y
falla CERRADO si el claim no se confirmó. Es el patrón que le falta a `registrarPago`
y a la guardia de cadencia.

**`alertarOperador`** (`observability/alerta.ts:59-105`): nunca lanza, piso de una
hora por evento antes del envío (la marca se pone ANTES, `:76`), y sin `ALERTA_EMAIL`
no es error. Mata el modo de falla obvio del monitor de SLA nuevo, que si no
alertaría 288 veces al día por la misma pieza urgente.

**`definiciones.ts` (0116)** — validación pura separada de la IO, `ID_RE` acotado,
23505 traducido a pantalla, `listarAgentes` LANZA ante error de lectura, y un agente
nuevo nace `disenado` sin poder ejecutarse. Sin hallazgos.

**`copiloto-acciones.ts`** — el catálogo es `readonly`, `implementada: false` rebota
con texto, el `userId` viene de la sesión y jamás del cuerpo, y la única acción viva
(`apagar_agente`) valida contra `INTERRUPTORES` antes de tocar nada. La confirmación
la exige el SERVIDOR (`route.ts:66-70`), no el botón.

**`pg_errores.ts`** — `violaIndice` exige código Y nombre de índice; `llegoTarde`
distingue el CU001 de la 0036. Correcto y sin cambios.

**`duplicados.ts`** — lógica pura, sin IO, sin hallazgos.

**Los server actions de `/admin/aprobaciones`** re-verifican `requireSuperadmin()`
dentro de cada acción (`page.tsx:38, :62`), no solo en el render.

## Lo que NO alcancé a revisar

- **`processor.ts` completo (2,490 líneas).** Recorrí la entrada (`:368-400`), el
  camino de cierre con lock y el `finally`. Las ramas de XML consolidado, huérfanos,
  POD y talacha siguen sin recorrer — igual que en el pase 3.
- **`lib/agents/copiloto.ts` y `copiloto-tools.ts`.** Solo abrí su route y su
  ejecutor de acciones. El agente que cruza tenants, sus tools y el guardia A0
  (`lib/admin/guardia.ts`) los dejo a agéntico/tool calling/seguridad; desde backend
  solo afirmo lo del contrato HTTP.
- **Las ~31 páginas de `/dashboard` como superficie de escritura.** Abrí
  `viajes/page.tsx`, `facturacion/page.tsx` y `admin/aprobaciones/page.tsx`. Los
  server actions de clientes, unidades, tarifas, peajes y proveedores pueden tener
  el mismo patrón lectura-decide-escribe de `registrarPago`; no lo comprobé.
- **`escalar_viaje.ts` por dentro** (solo lo leí desde el cron, para confirmar dónde
  se acumulan `fallos`).
- **Las migraciones contra una base viva.** Leí el SQL del repo. Nota al margen que
  NO cuento como hallazgo de este rubro porque es de modelo de datos: hay **dos
  migraciones con el prefijo 0112** (`0112_agregados_rpc.sql` y
  `0112_config_llave_agentes.sql`) — vale la pena que ese rubro confirme el orden de
  aplicación.
- **La cobertura la afirmo leyendo los `.test.ts` y citando el `it()` por número de
  línea.** Sí corrí `npx vitest run` sobre tres archivos concretos
  (`cola.test.ts`, `cron/wa-pendientes/route.test.ts`, `cron/escalar/route.test.ts`:
  34 pruebas, todas en verde) para verificar que los casos que cito existen y pasan.
  No corrí la suite completa ni `tsc`/`lint`: es la compuerta del orquestador.
