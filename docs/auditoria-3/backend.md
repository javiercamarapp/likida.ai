# Backend y API — auditoría 3 (pase 3)

**Nota: 6/10** (antes 5). Razón del movimiento: se atacó y subió · deuda que cobró
factura. La superficie NUEVA de `/v1` es lo mejor escrito del repo en concurrencia
—tres capas de idempotencia, el 409 de folio ocupado, y **pruebas propias para cada
carrera** (`_escritura.test.ts:469, :505, :528, :777`)—; los escritores de dinero que
llegaron con ella (`facturacion_escritura.ts`) llegaron **sin una sola prueba de
escritura** y con una carrera de lectura-antes-de-insertar que la base no cubre. Sube
uno, baja el otro.

El riesgo mayor del rubro hoy: **el importador sigue metiendo viajes históricos como
`abierto`**, así que el siguiente ticket que el chofer mande por WhatsApp se cuelga de
un viaje de julio con el anticipo de julio. El candado que llegó de master mató el robo
del viaje vivo, no la creación del viaje fantasma.

## Hallazgos

### [CRÍTICO] El histórico importado sigue naciendo `abierto`, y se come la siguiente foto del chofer
`src/lib/likida/importar_viajes.ts:425` × `src/lib/likida/conv.ts:164-181`
(REINCIDENTE — es BE-C1, **cerrado a la mitad**.)

**Qué sí mató `17dd02b`.** El importador ahora lee los operadores ocupados de la base
(`importar_viajes.ts:376-396`) y salta su fila (`:398-405`), y falla CERRADO si esa
lectura truena (`:384-394`). Con Pedro trayendo un viaje vivo, `TMS-900` **ya no se
crea**: sale en `operadorOcupado` con su folio. La mitad de BE-C1 que decía "se roba el
viaje vivo" está muerta, y hay prueba que lo fija
(`importar_viajes_escritura.test.ts:214` — «el operador que YA trae viaje abierto en la
base se salta con su folio»).

**Qué NO mató.** La raíz —`estatus: 'abierto'` literal en el insert,
`importar_viajes.ts:425`— sigue ahí, y el candado solo actúa cuando el operador YA
está ocupado. El caso de onboarding es el contrario.

Escenario: flota nueva, Pedro sin viaje abierto (0 viajes en la base, que es el estado
real hoy). El contralor sube el export del TMS del mes: `TMS-900`, operador «Pedro
Ramírez», `anticipo: 12000`, `fecha_inicio: 2026-07-03`. Se crea con `estatus:
'abierto'`. Al día siguiente Pedro sale de verdad y manda por WhatsApp la foto del
diésel de $3,400 → `getOpenViaje` (`conv.ts:164-181`) devuelve `TMS-900` porque es el
único `abierto` de Pedro → el gasto se ancla ahí → Pedro escribe «listo» → el cuadre
corre contra **$12,000 de anticipo de un viaje de julio** y emite una liquidación con
$8,600 en contra de Pedro. El cierre es IRREVERSIBLE (triggers 0036/0037).

Consecuencia: el chofer queda debiendo $8,600 que no recibió, y el contralor firma un
PDF con el anticipo equivocado. Nadie recibe un error: los dos caminos —importar y
liquidar— reportan éxito.

Efecto lateral del mismo `abierto`, medible sin escenario: por el `uq_viaje_abierto_por
_operador` (0029) **solo entra UNA fila por operador y por corrida**
(`importar_viajes.ts:400-405` mete al operador en `ocupados` tras la primera). Un export
de 180 viajes de 20 operadores importa 20 y reporta 160 «saltados porque su operador ya
trae un viaje abierto», culpando a la flota de una condición que creó el import mismo.
El PoC de peajes —el motivo declarado del módulo, `importar_viajes.ts:11-13`— se queda
sin el periodo contra el que cruzar.

Causa raíz probable: un histórico no es un viaje abierto; el estatus del import se
decidió por default y no por el dato del archivo.

Prueba que lo cubra: **ninguna**. `importar_viajes_escritura.test.ts` prueba a fondo el
dedup y los dos candados, y no prueba qué pasa DESPUÉS con el viaje creado.

### [ALTO] Dos pagos simultáneos a la misma factura se escriben los dos: el saldo sale negativo y «cobrado» sale al doble
`src/lib/likida/facturacion_escritura.ts:395-413`

`registrarPago` lee la suma de pagos previos (`:395-401`), decide con `evaluarAbono`
(`:403`) y **después** inserta (`:406-413`). Entre la lectura y el insert no hay lock,
no hay `Idempotency-Key`, y `pago_recibido` no tiene más constraint que
`pago_monto_positivo` (mig. `0049_cobranza.sql`, tabla `pago_recibido`): la base no
arbitra nada.

Escenario: factura `emitida` por $50,000.00, saldo $50,000.00. El contador la abre en
dos pestañas (o el `useFormStatus` de `forma.tsx:19` se reactiva tras un timeout del
edge y vuelve a enviar). Dos POST del server action `guardarPago`
(`dashboard/facturacion/page.tsx:110-128`) corren a la vez: los dos leen `pagado = 0`,
los dos calculan `saldo = 50000`, los dos pasan `monto > saldo + 0.005`
(`:196`), los dos insertan. Resultado en la vista `factura_saldo`: `pagado = 100000`,
`saldo = -50000`. Los dos calculan `quedaSaldada`, el segundo `update … .eq('estatus',
'emitida')` toca 0 filas y se registra como `facturacion.estatus_pagada_no_escribio`
(`:425-431`) — o sea que el log culpa a un fallo de escritura que no ocurrió.

Consecuencia: `getFacturacionClientes` suma `cobrado += f.pagado`
(`facturacion_clientes.ts:339, :348`), así que la cartera le dice al contralor que ese
cliente pagó $100,000 cuando su banco dice $50,000. Es exactamente la cifra que el
contralor cruza contra su estado de cuenta.

Causa raíz probable: la regla de dinero (`evaluarAbono`) es pura y está probada, pero
se aplica sobre una lectura sin candado y sin respaldo en la base.

Prueba que lo cubra: **ninguna**. `facturacion_escritura.test.ts:11` lo declara:
«Las escrituras (`crearFactura`, `registrarPago`) no se prueban». Lo probado es
`evaluarAbono` en serie (`:100-131`), que es justo el caso que no falla.

### [ALTO] Un blip de la base al guardar la factura de proveedor cierra el correo en 200 y ese CFDI no vuelve jamás
`src/app/api/correo/entrante/route.ts:249-250` × `src/lib/likida/proveedores.ts:54-56, :147-151`

`guardarFacturaProveedor` colapsa dos cosas opuestas en el mismo valor: `motivo:
'error'` sale tanto de un CFDI inservible (`proveedores.ts:121`, permanente) como de
**cualquier fallo del INSERT que no sea 23505** (`:149-150`, transitorio). El webhook
solo distingue `r.ok` (`route.ts:250`): todo lo demás es `ignoradas++`, y `ignoradas`
no toca `caidas`, que es la única variable que dispara el 503 y la liberación de
`correo_procesado` (`route.ts:261-290`).

Escenario: la refaccionaria manda por correo el CFDI de $18,400.00. La firma cuadra, el
buzón resuelve la flota, `correo_procesado` ya quedó insertado (`:165-166`), el XML
parsea, y el `insert` en `factura_proveedor` devuelve un `57014 statement timeout` de
Supabase. → `motivo: 'error'` → `ignoradas = 1`, `caidas = 0` → **no** se libera la
fila de dedup → se registra la corrida como `estado: 'ok'` (`:298-306`) → `200 {ok:true,
guardadas:0, ignoradas:1}`. Resend no reintenta un 200. Si el correo vuelve a entregarse,
el insert de `correo_procesado` choca con la PK y sale «ya_procesado».

Consecuencia: la factura de $18,400 no existe para la contabilidad de la flota, la
bandeja de Proveedores dice que la corrida salió bien, y el único rastro es un
`proveedores.guardar_fallo` en el log. Es literalmente el modo de falla que la cabecera
del archivo declara estar evitando (`route.ts:33-43`, `:186-191`).

Causa raíz probable: el tipo `ResultadoIngesta` (`proveedores.ts:54-56`) no tiene un
valor para «fallo nuestro y transitorio», así que el caller no puede decidir bien
aunque quiera.

Prueba que lo cubra: **ninguna**. `route.test.ts:284-358` cubre la descarga caída
(fetch), no el fallo del escritor.

### [ALTO] Stripe entrega desordenado y la suscripción cancelada se reactiva sola
`src/lib/saas/suscripcion.ts:322-376` × `src/app/api/stripe/webhook/route.ts:110-145`

`marcarEvento` (`suscripcion.ts:282-294`) dedupea por `evt.id`, que cubre el REINTENTO
del mismo evento. No cubre dos eventos DISTINTOS aplicados en orden invertido:
`aplicarSuscripcion` escribe `estado`, `periodo_fin` y `cancelada_en` sin comparar
contra nada (`:339-353`). La interfaz `EventoStripe` (`webhook/route.ts:30-34`) ni
siquiera lee el `created` del evento, así que no hay con qué ordenar.

Escenario, con valores: 10:00:00 llega `customer.subscription.updated` (evt_A,
`status: 'active'`) para `sub_1XYZ` → nuestra base está caída → `aplicar` lanza →
`desmarcar` borra la marca → **500**, Stripe lo encola. 10:00:20 llega
`customer.subscription.deleted` (evt_B) → se aplica → `suscripcion.estado = 'cancelada'`,
`cancelada_en = now()`, `tenant.plan = 'basico'`. 10:05:00 Stripe reintenta evt_A →
`marcarEvento` dice «nuevo» → `aplicarSuscripcion` escribe `estado: 'activa'`,
`cancelada_en: null` sobre la MISMA fila (el `existente` se busca por
`stripe_subscription_id`, `:332-336`).

Consecuencia: la flota que canceló conserva el plan pagado indefinidamente y en
`/admin` aparece como activa. Nadie se entera: los tres eventos contestaron 200.

Causa raíz probable: la idempotencia está resuelta (por `evt.id`) y el **orden** no;
son dos problemas distintos y solo hay defensa para uno.

Prueba que lo cubra: **ninguna**. `suscripcion_eventos.test.ts:50-100` prueba el
repetido y el aplicado; `stripe/webhook/route.test.ts:79` prueba el repetido. Ningún
caso invierte dos eventos.

### [ALTO] El cron de escalación con el 100% de sus envíos fallidos contesta 200, lo loguea como `.ok` y no alerta a nadie
`src/app/api/cron/escalar/route.ts:92-98, :139` × `src/lib/likida/escalar_viaje.ts:307, :344, :358, :367`

OP-C1 se cerró **solo para la excepción**: si `escalarViajesSinAceptar()` LANZA, hoy es
500 + `alertarOperador` (`route.ts:96-105`). Pero los fallos por viaje no lanzan: se
recogen en `r.fallos` (`escalar_viaje.ts:307, :344, :351, :358`) y la función retorna
normal.

Escenario: el token de WhatsApp Cloud caduca. La corrida de las 09:00 revisa 20 viajes
sin aceptar; los 20 `sendText` tiran 401 y caen en el catch por viaje. `r = { revisados:
20, escalados: 0, fallos: [20 strings] }`. `huboFallo` sigue `false` →
`logger.info('cron.escalar.ok', {...r})` (`route.ts:94`) → `NextResponse.json(resultado,
{ status: 200 })` (`:139`). Vercel pinta el cron en verde, Sentry no ve nada,
`alertarOperador` no se llama.

Consecuencia: los 20 jefes de flota no se enteran de que su chofer no aceptó, durante
los días que tarde alguien en abrir el JSON de la corrida. Es la forma exacta que OP-C1
describía —«100% de fallos → HTTP 200 y nivel info»— sobreviviendo al arreglo que se le
puso.

Causa raíz probable: `huboFallo` mira si el motor tronó, no si el motor logró algo.

Prueba que lo cubra: `cron/escalar/route.test.ts` existe; no hay caso con
`fallos.length === revisados`.

### [MEDIO] La segunda escritura del webhook de Stripe se ignora con un `warn`, y es la que ve Javier
`src/lib/saas/suscripcion.ts:381-382`

`aplicarSuscripcion` escribe `suscripcion` y luego sincroniza `tenant.plan`; si esa
segunda escritura falla, solo hay `logger.warn('stripe.tenant_plan')` y la función
retorna éxito → el webhook contesta 200 → el evento queda consumido para siempre.

Escenario: `customer.subscription.deleted` de la flota Innovativos. `suscripcion.estado`
pasa a `cancelada`. El `update` de `tenant` devuelve error (RLS, timeout, lo que sea) →
warn → 200. `lib/admin/negocio.ts:180-181` lee `tenant.plan` para pintar la consola de
Javier: la flota sigue apareciendo en `empresa`.

Consecuencia: la consola que cruza todos los tenants —la única pantalla donde Javier ve
quién paga qué— miente sobre una flota cancelada, y el comentario de `:378-380` describe
exactamente ese daño dos líneas antes de permitirlo.

Causa raíz probable: no hay transacción entre las dos tablas y el fallo se degradó a
aviso en vez de a reintento (Stripe reintentaría solo si se contestara no-2xx).

### [MEDIO] El mismo folio tiene dos reglas según por qué puerta entre: 400 en la API, recorte silencioso en el importador
`src/lib/likida/importar_viajes.ts:160` vs `src/app/api/v1/_escritura.ts:176-180`

`_escritura.ts:176-180` rechaza con 400 un folio de más de 64 caracteres y escribe el
porqué: «un folio truncado dedupea contra el folio equivocado, que es peor que un 400».
`importar_viajes.ts:160` hace `.slice(0, 40)` sin decir nada, sobre la MISMA columna que
sostiene `viaje_folio_unico` (0092).

Escenario: el TMS emite folios tipo
`INNOVATIVOS-2026-SUCURSAL-QRO-000000000000901` (45 chars). El POST a `/v1/viajes` lo
crea entero. El contralor sube el mismo export por pantalla: el importador lo recorta a
`INNOVATIVOS-2026-SUCURSAL-QRO-0000000000` (40), que **no** empata con el existente en
`existentes` (`:283-292`) ni choca con el unique → si el operador está libre, se crea un
**segundo viaje** para el mismo viaje real, con su anticipo contado dos veces en el
Registro.

Consecuencia: la doble contabilización del anticipo que la mig. 0092 existe para
impedir, entrando por la única puerta que no respeta su regla.

Causa raíz probable: dos validadores para una sola llave natural, escritos en semanas
distintas.

### [MEDIO] El aviso de «solo leí las primeras 2,000 filas» se pierde antes de llegar a la pantalla
`src/app/dashboard/viajes/page.tsx:95, :99-115` × `src/lib/likida/importar_viajes.ts:209-211`

`interpretarFilasViajes` devuelve `{ viajes, descartadas, error }` con el `error` puesto
Y las 2,000 filas leídas. El server action solo trata el error como fatal si `viajes`
vino vacío (`page.tsx:95`); si hay filas, importa y arma el `resumen` — y
`ResultadoImportarUI` (`importar.tsx:9-29`) **no tiene campo** donde quepa una
advertencia junto a un resumen.

Escenario: el contralor sube el export anual de 3,140 viajes. Se leen 2,000, se importan
los que pasan los candados, y la pantalla dice «creados: N». Las 1,140 filas restantes
no se leyeron nunca y no aparecen en ninguna parte de la respuesta.

Consecuencia: el Registro queda con un pedazo del periodo y el rótulo dice que el import
salió bien — rótulo que no es verdad, en la pantalla que alimenta el cruce de peajes.

Causa raíz probable: el contrato de retorno de la acción es «o error o resumen», y este
caso es los dos.

### [MEDIO] `/api/dashboard/ingesta` gasta visión por petición sin tope, sin rate limit y sin registrar el costo
`src/app/api/dashboard/ingesta/route.ts:28-71`

Es el único endpoint que llama al modelo y no tiene ninguna de las tres defensas que sus
vecinos sí: no aparece en `lib/ratelimit` (comprobado: los únicos usuarios de
`rateLimit` en `src/app/api/` son whatsapp, v1, openapi, los cuatro export y demo), no
tiene el tope diario por tenant que `chat/route.ts:36-42, :96-102` sí impone, y **no
llama a `registrarCosto`** (`costos.ts:115`) — el comentario `:5-8` lo declara: «NO
ESCRIBE NADA: ni gasto, ni foto, ni costo por liquidación».

Escenario: un contador con sesión válida deja una pestaña reenviando la misma foto de
6 MB. Cada POST es una llamada de visión a ~$0.005 USD. 1,000 llamadas en una tarde son
~$5 USD que **no** entran a `llm_costo`, o sea que no los ve el tope diario del chat, no
los ve `resumen_costo_ia_tenant()` y no los ve la pantalla «Costo de IA» de `/admin`.

Consecuencia: el panel de costo de Javier reporta un gasto menor al real, y no hay
freno ninguno para un bucle.

Causa raíz probable: se declaró «es una sonda, no escribe» y de ahí se dedujo también
que no hace falta medirla ni acotarla.

### [BAJO] Un cuerpo mal formado en `/api/demo` es un 500 con traza del framework
`src/app/api/demo/route.ts:32`

`const body = (await req.json()) as {...}` sin `try`. Un POST con `{` o con `null` lanza
antes de la primera línea de negocio y Next contesta 500. Todos sus vecinos lo atrapan
(`v1/_escritura.ts:107-113`, `chat/route.ts:59`, `ingesta/route.ts:35-39`).

Consecuencia: es el endpoint del simulador que se enseña en la sala. Un 500 en la
consola del navegador durante el demo es exactamente lo que este repo no se puede
permitir; el arreglo cuesta tres líneas.

### [BAJO] Los límites del plan se enseñan y no se imponen en ninguna escritura
`src/lib/saas/suscripcion.ts:183-195` × `src/app/api/v1/viajes/route.ts:225-293`

`limite_viajes_mes` y `limite_operadores` se leen únicamente para pintar
`/dashboard/suscripcion` (`suscripcion/page.tsx:103`). Ni `crearViaje`, ni
`POST /v1/viajes`, ni el importador los consultan.

Consecuencia: una flota en el plan más chico puede meter viajes sin techo por API. Es
deuda de negocio hoy (0 clientes) y va a cobrar factura el día que haya dos planes con
precios distintos.

## Lo que revisé y está bien

**`/v1` — el camino de escritura idempotente.** `_escritura.ts:694-780` (`escribir`):
memoria → recuerdo durable (0098) → llave natural → insert, con el 409 cuando el
contenido no coincide y la relectura cuando el insert choca. `chocoContra`
(`:628-631`) exige las DOS señales (23505 + nombre de la restricción) y falla ruidoso si
el texto de PostgREST cambia, que es el lado correcto para equivocarse.
**Tests, nombrados:** `_escritura.test.ts:309` (misma llave, mismo cuerpo, una sola
creación), `:332` (el reintento cae en OTRA instancia), `:357` (recuerdo purgado, manda
el unique), `:375` (misma llave, otro cuerpo, cruzando instancias), `:389` (la tabla de
idempotencia ilegible NO revienta la petición), `:405` (el recuerdo no se guarda y la
creación ya ocurrida se contesta igual), `:469` (**carrera** con contenido distinto →
409), `:505` (**carrera**: la que pierde recibe la fila que ganó, no un 500), `:528`
(chocó y la fila no aparece → ruidoso, no se inventa id), `:777` (carrera de unidad).
Es el único rubro del repo donde cada camino de concurrencia tiene su prueba con nombre.

**`leerRecuerdoDurable` / `guardarRecuerdoDurable` no lanzan, y está justificado**
(`_escritura.ts:464-538`): degradan a la conducta anterior a la 0098, que no puede
duplicar porque el unique sigue puesto. Es la única excepción documentada a «fallar
cerrado» del repo y el argumento se sostiene.

**La puerta de `/v1`** (`_comun.ts:188-266`): tasa por IP antes de gastar un viaje a
Supabase, `urlSinTenant` borrando el `?tenant=` en el borde (`:150-154`), la llave
mandando sobre la cookie (`:194-229`), área explícita sin default. `areaDeLlaveAlcanza`
(`:179-186`) falla cerrado ante un área desconocida. **Tests:** `_escritura.test.ts:205`
(tenant del cuerpo ignorado), `:221` (no entra a la huella), `:233` (la búsqueda por
llave natural también va contra el tenant de la credencial), `:263` (llave de tablero no
escribe).

**`resolverLlave`** (`auth/llave-api.ts:134-174`): 401 con texto único para inválida y
revocada, **503 y no 401** ante error de lectura, `timingSafeEqual`, recorrido completo
de candidatas para no filtrar cuántas comparten prefijo, sello de último uso
best-effort.

**Webhook de correo — el orden y la liberación.** `correo/entrante/route.ts:158-179`
(el insert ES la comprobación, no un select previo), `:147-156` (la llave del canal se
verifica ANTES de consumir el correo), `:261-290` (con descargas caídas se libera la
fila y se contesta 503). **Tests:** `route.test.ts:167, :174, :180, :186, :290, :299,
:313, :328, :348`. El hueco que reporto arriba es el único que este juego no cubre.

**Mutex por viaje.** `conv.ts:418-464` distingue RPC ausente (abre, con ERROR) de error
transitorio (reintenta con backoff), y `processor.ts:1984-2000` abandona el turno si no
lo consigue **liberando el claim** para que el mensaje no quede atascado, y re-verifica
que el viaje siga abierto después de tomar el lock. **Tests:** `conv_lock.test.ts:30,
:36, :42, :47, :56, :63` — los seis caminos, incluido el transitorio que no cede.

**Barrera de intake.** `conv.ts:524-549` (`intakePendientes`): `null` es «no sé» y no
abre la barrera; el contador vencido a 10 min (`:555`) se olvida del lado del cliente
sin escribir. `esperarIntake` (`:567-611`) con gracia inicial contra la carrera
fotos+«listo». **Tests:** `barrera.test.ts`, `barrera_fail_closed.test.ts`,
`barrera_sondeo.test.ts`.

**Claim de la cola de facturación.** `facturacion/al_vuelo.ts:626-659`: UPDATE
condicional que devuelve filas, con la condición sobre la misma columna que pisa —
Postgres arbitra la carrera, no la memoria— y falla CERRADO si el claim no se confirmó.
Es el patrón correcto y es el que le falta a `registrarPago`.

**`claimMessage`** (`conv.ts:343-354`) distingue `duplicado` (23505) de `indeterminado`,
y `processor.ts:376-382` decide seguir con el riesgo explicado. `saveLiquidacion`
(`repo.ts:700-737`) va por una sola RPC transaccional (0013) en vez de dos statements.

**Crones.** `purgar/route.ts:56-68` y `escalar/route.ts:56-70` fallan cerrado sin
`CRON_SECRET` (500, no 200) y respetan el kill switch con fail-closed
(`purgar:77-80`). `facturar/route.ts:130-160` corta el lote por reloj antes de abrir
otra sesión de navegador. `mantenimiento_de_datos` y `purgar_api_idempotencia` (0098)
llevan sus `revoke … from anon` — verificado línea por línea; **no quedó otra función
`security definer` alcanzable por `anon`**.

**Stripe, la mitad buena:** firma sobre el cuerpo crudo, sin modo «todavía no
configurado» (`webhook/route.ts:36-51`), `marcarEvento` como insert-claim y no select
(`suscripcion.ts:282-294`), 500 con `desmarcar` para que el reintento pueda volver a
aplicar (`route.ts:67-76`).

**BE-C1, la mitad cerrada:** dicho arriba con su línea y su prueba.

## Lo que NO alcancé a revisar

- `processor.ts` completo (2,476 líneas). Revisé la entrada (`:368-400`), el camino de
  cierre con lock (`:1950-2060`) y el `finally` (`:2474`). Las ramas de XML consolidado,
  huérfanos, POD y talacha quedaron sin recorrer.
- Las 31 páginas de `/dashboard` como superficie de escritura: solo abrí
  `facturacion/page.tsx` y `viajes/page.tsx`. Los server actions de clientes, unidades,
  tarifas, peajes y proveedores pueden tener el mismo patrón lectura-decide-escribe que
  `registrarPago`; no lo comprobé.
- `lib/likida/agentes/*` (cobranza, corridas, notificaciones) — solo desde el cron.
- No corrí `npx vitest run` (regla del pase). Todo lo que afirmo sobre cobertura sale de
  leer los archivos `.test.ts` y citar el `it()` por número de línea, no de una corrida.
- No verifiqué contra la base viva ninguna migración: leí el SQL del repo.
