# Backend y API — auditoría 3

**Nota: 5/10** (antes 5). Razón del movimiento: **se atacó y subió** (BE-C1 está
vivo y con prueba propia; la escalación, el mutex, la barrera y el claim de
autofactura tienen pruebas de carrera de verdad) **y a la vez mirada más
profunda**: el importador de viajes y el mutex sin techo llevaban aquí desde
antes y ningún pase los había abierto. El neto se queda en 5 porque sigue
existiendo un camino donde el dinero del chofer se escribe en el viaje
equivocado y nadie se entera.

El riesgo mayor hoy: **el kit del PoC (`importar_viajes.ts`) inserta viajes
históricos como `abierto` y con el operador amarrado, y `getOpenViaje` prefiere
el más reciente — el siguiente ticket que ese chofer mande por WhatsApp aterriza
en un viaje de julio con el anticipo de julio.**

## Hallazgos

### [CRÍTICO] El import del TMS se roba el viaje vivo del chofer: sus comprobantes aterrizan en un viaje histórico
`src/lib/likida/importar_viajes.ts:207-217` (el `insert` del lote:
`estatus: 'abierto'` + `operador_id` resuelto por nombre) contra
`src/lib/likida/conv.ts:164-181` (`getOpenViaje`: `.in('estatus',
['abierto','en_cuadre']).order('created_at', {ascending:false}).limit(1)`).

Escenario: la flota sube su export del TMS desde
`/dashboard/viajes` (`src/app/dashboard/viajes/page.tsx:97`). El archivo trae
`folio=TMS-900, fecha=2026-07-01, anticipo=12000, operador="Pedro Ruiz"`.
`importarViajes` lo inserta hoy con `estatus='abierto'`, `operador_id=<Pedro>`,
`avisado_en=NULL`. Pedro ya tenía el viaje real `V-88` (avisado y aceptado hoy,
anticipo $5,000). Pedro manda la foto de su diésel de $3,200 →
`processInbound` llama `getOpenViaje(tenant, Pedro)` →
**devuelve `TMS-900`**, porque su `created_at` es de hace un minuto y el de
`V-88` es de esta mañana → `addGasto(tenant, TMS-900, …)`. Pedro escribe
`listo` → el cuadre corre contra el anticipo de **$12,000** y la liquidación
sale con **$8,800 en contra del chofer**. `V-88` se queda vacío y abierto.

El resto de los candados no lo tapan y por eso no se ve: `viajesPorConfirmar`
(`src/lib/likida/confirmar_viaje.ts:37`) y `viajesSinAceptar`
(`src/lib/likida/escalar_viaje.ts:94`) SÍ filtran `avisado_en is not null`, así
que el viaje importado nunca se ofrece a confirmar ni escala; el único camino
que no filtra es justamente el que escribe el gasto. Como efecto secundario, la
re-verificación posterior al mutex (`processor.ts:1811`) puede contestarle
"Ese viaje ya quedó cerrado 👍" sobre un viaje que sigue abierto, si el import
corre entre dos mensajes suyos.

Consecuencia: el contralor firma una liquidación que le cobra al operador un
anticipo que no recibió en esa ruta, y el viaje real queda sin comprobantes.
Es el escenario más probable del PoC: importar el histórico del prospecto es el
paso 1 del kit y demostrar WhatsApp es el paso 2.

Causa raíz probable: `viaje.estatus` no tiene un valor para "histórico
importado" y el importador reusó `abierto` con el operador amarrado, mientras
`getOpenViaje` elige por `created_at` sin exigir `avisado_en`.

Prueba que lo cubra: **ninguna**. `importar_viajes.test.ts` solo prueba los
parsers puros (`leerCifraImportada`, `leerFechaImportada`,
`interpretarFilasViajes`); `importarViajes` —la función que escribe— no tiene
un solo caso.

### [ALTO] El XML de diésel puede borrar el `ocr_extra` entero del ticket, y el error que lo provoca se descarta
`src/lib/likida/repo.ts:520-526` (`updateGastoCfdiXml`).

```ts
const { data: actual } = await acotada(supabaseAdmin().from('gasto')
  .select('ocr_extra').eq('id', gastoId)…, 'updateGastoCfdiXml.leerOcrExtra');
const ocrExtra = { ...((actual?.ocr_extra as … ) ?? {}) };
ocrExtra.litros = x.cantidad;
extra.ocr_extra = ocrExtra;          // ← reemplaza el jsonb ENTERO
```

Escenario: el gasto `g1` tiene
`ocr_extra = {producto:"Diesel", estacion:"EST 12", urlFacturacion:"https://facturacion.oxxogas.com/", webId:"65038155", folioPortal:"A991X…", montoDiscrepante:{leido:3180}}`.
Llega por WhatsApp el XML 1:1 con `ClaveUnidad="LTR" Cantidad="113.00"`
(`processor.ts:1453`). La relectura de `ocr_extra` devuelve
`{data:null, error}` — basta con que `acotada` agote su tope de 8 s
(`presupuesto.ts:148-165` devuelve el error POR VALOR, no lanza). El
destructuring no mira `error`, `actual` queda `undefined`, y el UPDATE escribe
`ocr_extra = {"litros":113}`.

Consecuencia: se pierden en silencio el `folioPortal` (el que la oficina teclea
en el portal para timbrar — el mismo repo lo registra como `logger.error` cuando
se pierde en `processor.ts:117`), la `urlFacturacion`/`webId` de los que depende
`armar()`/`decidirAutofactura` para saber a qué portal va el ticket, y
`montoDiscrepante` / `textoSospechoso` / `noFiscal`, que son diferencias que
`engine.ts:377-403` levanta en el PDF del contralor. La liquidación sale sin una
alerta que sí correspondía.

Causa raíz probable: el propio comentario de tres líneas de arriba dice que el
jsonb "no se reemplaza… una escritura a ciegas lo borraría", y la lectura que
sostiene esa promesa es la única de `repo.ts` que no comprueba `error`.

Prueba que lo cubra: **ninguna**. `repo_escritura.test.ts` no ejercita esta rama
con la lectura caída.

### [ALTO] El mutex del viaje es la ÚNICA consulta del cierre sin techo, y la prueba guardián no lo ve
`src/lib/likida/conv.ts:426` — `const { data, error } = await admin.rpc('try_lock_viaje', …)`,
sin `acotada(…)`. Comparar con sus vecinas: `releaseViajeLock` (conv.ts:615),
`intakeDelta` (conv.ts:489) y `intakePendientes` (conv.ts:525) sí la llevan.

Escenario: el chofer escribe `listo`. `processor.ts:1798` llama
`acquireViajeLock(viajeId, {maxWaitMs: reloj.acotar(12_000)})`. El balanceador de
Supabase acepta el socket y no contesta. `supabaseAdmin()` construye el cliente
sin `fetch` propio, así que hereda el default de undici: 300 000 ms
(medido en `repo_tope.test.ts`: `fetch()` seguía bloqueado a los 20 036 ms). El
`maxWaitMs` no salva nada porque solo se comprueba DESPUÉS del `await`
(conv.ts:450). Vercel mata la invocación a los 120 s
(`webhook/whatsapp/route.ts:77`), Meta ya recibió su 200 y no reintenta, y el
`catch` general de `processInbound` nunca corre → **cero líneas de log**.

Consecuencia: el `listo` del operador desaparece sin rastro. Es exactamente el
final que `TOPE_CONSULTA_MS` (`presupuesto.ts:75-101`) documenta como "el peor
que tiene este producto", y el mutex está nombrado con todas sus letras entre
los once que se creían cerrados.

Causa raíz probable: la prueba guardián `tope_consulta.test.ts:35` cuenta
`/await supabaseAdmin\(\)/g`, y aquí el cliente se guarda antes en
`const admin = supabaseAdmin()` (conv.ts:421) — la llamada real es
`await admin.rpc(...)`, que el regex no ve. Es el único punto del repo con esa
forma (verificado con
`grep -n "await admin\.\|await supabaseAdmin()" repo.ts conv.ts costos.ts config.ts`).

(REINCIDENTE de la auditoría 8, ALTO "el tope protegía un solo archivo": el
mecanismo se movió a la frontera y la prueba se escribió, pero este llamador
quedó fuera del patrón que la prueba busca.)

### [ALTO] Un viaje reasignado ya no vuelve a escalar nunca — y reasignar es justo lo que la escalación pide
`src/lib/likida/repo.ts:129-139` (`reasignarOperador`: el UPDATE toca solo
`operador_id`) + `src/lib/likida/operacion.ts:672-675`
(`avisarAlChofer` marca `avisado_en` con `.is('avisado_en', null)`) +
`src/lib/likida/escalar_viaje.ts:92-95` (`viajesSinAceptar` filtra
`.is('aceptado_en', null).is('escalado_en', null)`).

Escenario: `V-77` se le asigna a Juan y se le avisa a las 10:00
(`avisado_en=10:00`). Juan no contesta. A las 15:00 el cron escala:
`escalado_en=15:00` y el jefe recibe "Juan no ha confirmado V-77 en 5 horas…
conviene reasignarlo desde Despacho". El jefe hace exactamente eso:
`/dashboard/despacho` → "Asignar y avisar"
(`src/app/dashboard/despacho/page.tsx:115-121`). `reasignarOperador` pone
`operador_id=Pedro`; `avisarAlChofer` manda el WhatsApp a Pedro, pero su UPDATE
lleva `.is('avisado_en', null)` → **0 filas**: `avisado_en` sigue en 10:00 y
`escalado_en` sigue en 15:00. Pedro tampoco contesta. `viajesSinAceptar` filtra
`escalado_en is null` → **`V-77` no vuelve a aparecer jamás**. Nadie le avisa al
jefe una segunda vez, y el reloj de las 5 h que sí debería correr desde el aviso
a Pedro no arranca.

Consecuencia: el jefe hace lo que el sistema le pidió y el sistema deja de
vigilar el viaje. El camión no sale y el aviso que existía para evitarlo se
apagó al usarlo.

Causa raíz probable: el `.is('avisado_en', null)` se escribió para el *reaviso
al mismo chofer* ("el primer aviso manda: un reaviso no reinicia el plazo",
operacion.ts:675) y la reasignación reusa esa misma función sin limpiar el
estado de escalación del chofer anterior.

Prueba que lo cubra: **ninguna**. `repo_operadores.test.ts` prueba
`reasignarOperador` (que ancla tenant y valida que el operador sea propio) y
`escalar_viaje.test.ts` prueba el claim; nada cruza los dos.

### [ALTO] El consolidado dice "ya quedó ligado ✅" con cero líneas escritas, y el reenvío desliga lo que ya estaba bien
`src/lib/likida/intake/consolidado.ts:293-298` (el error del upsert de líneas se
loguea y no cambia el resultado) + `:230-237` (el guardia de idempotencia es
fail-open ante error de lectura).

Escenario A (primera pasada): la oficina reenvía su CFDI consolidado de TAG con
3 líneas por WhatsApp (`processor.ts:1401`). El JOIN concilia las 3, `ligarLineaAGasto`
escribe `cfdi_uuid`+`cfdi_orden` en los 3 gastos, y el `upsert` de
`cfdi_consolidado_linea` devuelve error (timeout / RLS / columna nueva). Se
registra un `logger.error` y se sigue: `return {totalLineas:3, conciliadas:3,
porConciliar:0}` → el remitente recibe *"Recibí tu XML consolidado (3
movimientos) y ya quedó ligado ✅"* mientras `cfdi_consolidado_linea` tiene
**cero filas** para ese CFDI y el panel de Combustible & Casetas
(`analytics.ts:1670`) no enseña nada.

Escenario B (el reenvío, que es lo normal cuando el acuse no convence): el mismo
XML entra otra vez. El guardia lee `cfdi_consolidado_linea` y no encuentra filas
(escenario A) —o la lectura falla y `if (!errExistentes && …)` cae de largo—, así
que el JOIN se re-corre. `candidatosDb` filtra `.is('cfdi_uuid', null)` y los 3
gastos ya llevan UUID → **0 candidatos** → las 3 líneas salen `por_conciliar`
con `candidatos: []` y el upsert las escribe con `gasto_id: null`. El acuse dice
ahora *"Ninguno lo pude ligar solo… quedaron en el panel para que tu contador
los revise a mano"*, y en la mesa esas 3 líneas **no se pueden resolver**:
`resolverLineaAMano` con `tipo:'ligar'` devuelve `candidato_no_ofrecido`
(consolidado.ts:382) porque la lista de candidatos está vacía; lo único
disponible es marcarlas `sin_match`, que es falso — sí tienen gasto.

Consecuencia: el contador ve un contador de "por revisar" que no baja sobre
líneas que en la tabla `gasto` ya están correctamente ligadas, y el acuse por
WhatsApp afirmó dos cosas contradictorias sobre el mismo CFDI. El propio
comentario del archivo (`:223-229`) predice este daño y el guardia que lo evita
se abre ante un error.

Causa raíz probable: el guardia de idempotencia trata "no pude leer" igual que
"no hay filas", y la escritura de las líneas no forma parte del contrato de
éxito de la función.

Prueba que lo cubra: **ninguna**. `consolidado.test.ts` prueba `conciliarLineas`,
`rangoFechasLineas`, `mensajeConsolidadoRecibido` y `resolverLineaAMano`;
`guardarYConciliarConsolidado` —la única que escribe— no tiene ni un caso.

### [MEDIO] El rescate de claims de cobranza borra también el claim de un mensaje que SÍ salió
`src/lib/likida/agentes/cobranza.ts:207-215` (el `delete` de rescate) contra
`:272-275` (el `update` del resultado, que solo deja un `warn` si falla).

Escenario: tier 1 de `V-1`. El claim entra (`enviado=false, detalle=null`),
`sendText` devuelve `wamid.OK` y el chofer **recibe** "Llevas 7 días…". El
`update({enviado:true, detalle:null})` falla (blip). La fila queda
`enviado=false, detalle=null`. Una hora después, la corrida siguiente ejecuta el
rescate: `enviado=false AND detalle IS NULL AND created_at < ahora-1h` →
**borra la fila**. El tier queda libre, `tierPendiente` lo vuelve a proponer y
el chofer recibe **el mismo mensaje otra vez**.

Consecuencia: el canal que el propio módulo dice cuidar ("un canal que insiste
todos los días se aprende a ignorar", cobranza.ts:29) manda el duplicado
justamente por el mecanismo que se agregó esta ronda para arreglar otra cosa.

Causa raíz probable: el rescate identifica "crash antes de enviar" por la
ausencia de `detalle`, pero un envío exitoso también deja `detalle` nulo — la
señal no distingue "no se mandó" de "se mandó y no se pudo anotar".

Prueba que lo cubra: **ninguna**. `cobranza_reloj.test.ts` fija el corte por
reloj y los claims, pero no asserta el `delete` de rescate.

### [MEDIO] El `?tenant=` de las páginas cae en silencio a la flota de la sesión cuando la validación falla
`src/lib/auth/tenant-efectivo.ts:121` —
`const { data: t } = await supabaseAdmin().from('tenant').select('id, nombre').eq('id', sp.tenant).maybeSingle();`
sin `error` y sin `acotada`.

Escenario: Javier abre `/dashboard/agentes/cobranza?tenant=<uuid de Transportes
Innovativos>` en el demo. La lectura de `tenant` devuelve `{data:null, error}`
(bache de red). `t` es falsy → `tenantId` se queda en el de la sesión (la flota
DEMO) y `tenantNombre` se queda en `null`, que es justo el valor que apaga el
badge "viendo como superadmin" (ver el contrato de `tenantNombre` en `:28-31`).
La URL dice una flota y la pantalla enseña las cifras de otra, sin cinta.

Consecuencia: en una sala, enseñar los números de la flota demo diciendo que son
los del prospecto. El repo ya cerró esta misma clase de fallo dos veces
(`tenant-api.ts:63-67` devuelve 503; `resolverTenantPedido` existe y su docstring
dice "los ~14 sitios que resolvían el pedido a mano sin mirar `error` hoy usan
esto") — este sitio quedó fuera.

Causa raíz probable: la ruta de páginas nunca migró al helper que se escribió
para ella.

### [MEDIO] La cola de QStash se creó para romper el techo de 300 s y sigue cortando a los 150 s
`src/app/api/cron/facturar/cola/route.ts:11` (`export const maxDuration = 600`)
contra `src/app/api/cron/facturar/route.ts:129` (`PRESUPUESTO_LOTE_MS =
maxDuration * 1000`, con el `maxDuration = 300` de *ese* módulo) y `:469` /
`:509` (`Date.now() - inicioLote >= PRESUPUESTO_LOTE_MS - MARGEN_LOTE_MS`).

Escenario: 8 tickets de 4 flotas entran por el callback de QStash, que tiene 600 s.
`procesarLoteEnCola` arranca su reloj y, en cuanto pasan 150 s, deja de abrir
navegadores: las flotas 3 y 4 salen como `sinTiempo` y esperan a la corrida de la
hora siguiente, con 450 s del presupuesto real sin usar.

Consecuencia: la facturación automática difiere trabajo que sí cabía; con
plazos de 7-15 días en gasolineras no es urgente, pero el mecanismo que se
construyó para arreglarlo no arregla nada y la respuesta no lo dice —solo dice
`sinTiempo`, que se lee como "no había presupuesto" cuando sí lo había.

Causa raíz probable: `PRESUPUESTO_LOTE_MS` es una constante de módulo del cron
directo y `procesarLoteEnCola` la usa aunque corra en otra ruta con otro
`maxDuration`; el presupuesto debería viajar como argumento junto a `inicioLote`.

### [MEDIO] `viaje.folio` no tiene índice único: el dedup del importador es un SELECT y `crearViaje` no dedupea
`src/lib/likida/importar_viajes.ts:174-183` (lee todos los folios y filtra en
memoria) y `src/lib/likida/operacion.ts:560-569` (`crearViaje` inserta el `folio`
del formulario sin comprobar nada). No hay `create unique index` sobre
`viaje(tenant_id, folio)` en `supabase/migrations/` (los únicos folios únicos son
`factura_folio_unico`, 0049:69, y `cotizacion_folio_unico`, 0051:105).

Escenario: la importación de 2,000 filas tarda; el contralor cree que no pasó
nada y vuelve a apretar "Importar". Las dos invocaciones leen `existentes` antes
de que ninguna inserte → se crean **2,000 viajes duplicados**, cada folio dos
veces. El resumen dice `creados: 2000, saltados: 0` en las dos.

Consecuencia: el Registro duplicado y, encima, el mapa `liqPorFolio` de
`/dashboard/viajes` (`page.tsx:70`) empieza a resolver el folio a la
liquidación equivocada. La promesa del encabezado del módulo —"el mismo archivo
subido dos veces no duplica viajes"— solo se cumple en serie.

Causa raíz probable: la unicidad se implementó en la aplicación en vez de en la
base, así que no hay carrera que perder.

### [BAJO] El XML que encuentra el mutex ocupado deja su mensaje reclamado para siempre
`src/lib/likida/processor.ts:1421-1426`: cuando `acquireViajeLock` devuelve
`false` se manda "Estoy terminando de procesar otro XML…" y se hace `return` sin
`releaseMessageClaim(msg.waMessageId)`. Las otras dos ramas que abandonan el
turno sí lo liberan y explican por qué: el mutex del texto
(`processor.ts:1805`) y el `+1` de intake fallido (`processor.ts:733`, con su
párrafo "un mensaje que no se procesó no puede quedar contado como procesado").

Escenario: dos XML del mismo viaje en el mismo POST; el segundo pierde el mutex.
Su `wa_message_id` queda en `wa_mensaje_procesado` marcado como procesado. Si
el lote llevaba además mensajes diferidos, `route.ts:244` contesta 429 y Meta
reentrega el payload completo → el XML perdido vuelve como `duplicado`
(`processor.ts:331`) y se descarta en silencio.

Consecuencia: se pierde el estímulo/IVA acreditable de esa carga en el viaje
—el operador reenvía a mano o no reenvía—. Bajo porque el aviso al operador sí
sale.

Causa raíz probable: la asimetría se corrigió en dos de las tres salidas
tempranas y esta quedó.

### [BAJO] `/api/demo` revienta con 500 sin log ante un cuerpo malformado
`src/app/api/demo/route.ts:32` — `const body = (await req.json()) as {…}` sin
`try/catch`, a diferencia de las otras cuatro rutas de API que lo envuelven
(`chat/route.ts:57`, `ingesta/route.ts:36`, `archivo/route.ts:32`,
`webhook/whatsapp/route.ts:100`).

Escenario: `POST /api/demo` con `Content-Type: application/json` y cuerpo
`{` → excepción sin atrapar → 500 genérico de Next, sin `logger`. Además
`bodyExcede` (`ratelimit.ts:109`) solo mira `content-length`, y su propio
comentario nombra a este archivo como el que no vuelve a medir tras leer, así
que con `Transfer-Encoding: chunked` el tope de 64 KB no aplica.

Consecuencia: la ruta pública del demo devuelve un 500 desnudo en vez de un 400
y no deja rastro. Es la única ruta sin sesión que queda además del webhook.

Causa raíz probable: se escribió antes que el resto de rutas de API y no se
alineó con el patrón.

## Lo que revisé y está bien

- **BE-C1 (el bombardeo de la cobranza) está VIVO y sin hueco.**
  `agentes/cobranza.ts:116` (`.not('avisado_en','is',null)` en la consulta) y
  `:142` (`if (!v.avisado_en) continue`, el cinturón en el bucle). Verifiqué los
  dos únicos caminos de entrada a la cola: el cron
  (`api/cron/escalar/route.ts:85` → `ejecutarCobranzaGlobal` →
  `ejecutarCobranza` → `colaCobranza`) y el botón "Ejecutar ahora"
  (`dashboard/agentes/cobranza/page.tsx:53` y `:102`, que también pasa por
  `colaCobranza`). No hay tercer camino. Prueba: `cobranza_cola.test.ts:45`,
  *"la fila con forma de import (avisado_en null) no entra a NINGUNA cubeta"* —
  alimenta la fila saltándose el filtro de la consulta, así que quitar
  cualquiera de los dos candados la pone roja.
- **El claim de la escalación se toma antes de mandar nada.**
  `escalar_viaje.ts:300-320` (`reclamarEscalacion`: UPDATE condicional sobre la
  columna que él mismo pisa, acotado por tenant, fail-closed ante error).
  Prueba: `escalar_viaje.test.ts` (`updates[0].fila.avisos_enviados` :273,
  el caso de dos viajes :356-377).
- **El claim de la autofactura cierra el doble CFDI.**
  `facturacion/al_vuelo.ts:627-655` (`reclamarIntentos`: UPDATE condicional con
  `cfdi_uuid is null`, `autofactura_bloqueada_en is null` y el claim vencido a
  10 min; ante error de la propia consulta devuelve el Set vacío, o sea no se
  toca el portal). Esto también neutraliza el único riesgo del despacho por
  QStash: si `publishJSON` truena después de que QStash aceptó
  (`cron/facturar/route.ts:331-336`), el lote se procesa síncrono **y** por
  callback, pero el segundo no gana el claim. Prueba: `al_vuelo.test.ts`.
- **El mutex del viaje, la barrera de ráfaga y el pool del webhook.**
  `conv.ts:418-464`, `conv.ts:567-610`, `webhook/whatsapp/route.ts:49-59`.
  Pruebas: `conv_lock.test.ts` (6 casos, incluidos RPC ausente vs. transitorio),
  `barrera_fail_closed.test.ts` (`null` no abre la barrera),
  `barrera_sondeo.test.ts`, `processor_lock.test.ts` (con el lock ocupado NO
  corre el agente y SÍ libera el claim), `xml_race_mutex.test.ts` (5 casos),
  `route_pool.test.ts` (22 fotos con techo 5, y el 429 que aplaza en vez de
  descartar).
- **La carrera del insert de conversación.** `conv.ts:247-286` (choca, relee y
  lanza si aun así no aparece — nunca `id: ''`). Prueba:
  `conv_carrera_insert.test.ts`, 9 casos.
- **El cierre de la liquidación es una sola transacción.** `repo.ts:699-727`
  (`guardar_liquidacion_tx`, mig. 0013, con `unique(viaje_id)`), y el snapshot
  `liq` viaja con el resultado de la tool (`tools.ts:218`) para que el PDF y el
  WhatsApp narren el mismo cuadre.
- **Los tres crones fallan cerrado y lo dicen.** `escalar/route.ts:99`
  (`status: huboFallo ? 500 : 200` — el arreglo OP-C1 está vivo),
  `purgar/route.ts:75-78`, `facturar/route.ts:541-563` (503 sin marcar los
  tickets). Prueba: `api/cron/escalar/route.test.ts:51` (un motor reventado ya
  no responde 200).
- **Idempotencia y firma de los webhooks externos.** Stripe:
  `stripe/webhook/route.ts:48` (HMAC sobre el cuerpo crudo), `:62` (el insert
  ES la carrera, no un select), `:74` (desmarca antes de rendirse para que el
  reintento sí se aplique). QStash: `cron/facturar/cola/route.ts:35-47`
  (verificación con las signing keys reales, antes de tocar nada) y `:62-69`
  (re-valida que los gastos sigan sin CFDI). Pruebas:
  `stripe/webhook/route.test.ts`, `api/cron/facturar/route.test.ts`.
- **Las puertas de las rutas de export y del chat.**
  `export/liquidaciones/route.ts:47-55` y `export/pdf/[id]/route.ts:63-71`
  (área `dinero` **y** `puedeExportar`, más el filtro explícito por tenant sobre
  service-role), `export/facturas-proveedor/route.ts:26-33`, y
  `resolverTenantApi` (`auth/tenant-api.ts:63-67`), que sí devuelve 503 cuando
  no puede validar el `?tenant=`. El tope diario del chat falla cerrado
  (`chat/route.ts:78-81`) y el turno que truena también se cobra (`:137-146`,
  el arreglo TC-A1). Prueba: `chat/costo_parcial.test.ts`,
  `chat/validacion.test.ts`.
- **La paginación no devuelve cifras parciales.** `pg.ts:137-175`
  (`traerTodo` exige `count` o página vacía, y si no, lanza `LecturaIncompleta`)
  y `repo.ts:909-971` (`getAcumuladoCombustible`, fail-closed con `leidas <
  esperadas`). Pruebas: `pg.test.ts`, `repo_acumulado.test.ts`,
  `analytics_paginacion.test.ts`.
- **`acotada` cubre todo lo demás del cierre.** Confirmado con
  `grep -n "await admin\.\|await supabaseAdmin()"` sobre `repo.ts`, `conv.ts`,
  `costos.ts`, `config.ts`: un solo resultado, el del hallazgo ALTO de arriba.
  Prueba (con el hueco ya descrito): `tope_consulta.test.ts`, `repo_tope.test.ts`.
- **El gate de sesión del proxy.** `proxy.ts:117-148` (matcher que excluye
  `/api` a propósito, cookies del refresh que viajan también en el redirect,
  cabeceras aplicadas en un solo sitio al final). Prueba: `proxy.test.ts`.

## Lo que NO alcancé a revisar

- `src/lib/likida/facturacion/adaptadores/*` (Playwright, CAPUFE, el registro de
  portales): solo miré el contrato desde el cron. El camino `emitir` está
  apagado por decisión de negocio, pero es el que se estrena el día que importa.
- `src/lib/agents/run.ts` y `src/lib/llm/openrouter.ts` (reintentos, fallback de
  proveedor, `PartialExecutionError`): los toqué solo por sus consumidores.
  Ese es el rubro de tool calling, pero el contrato de error entre esa capa y
  `processor.ts:1937-1997` merece una pasada de backend.
- Los server actions de `/admin/**` y `lib/admin/negocio.ts` (la única función
  que cruza tenants a propósito).
- `src/lib/meta/client.ts`: el comentario de `presupuesto.ts:63-71` afirma que
  `sendText`/`sendDocument` usan `fetch` pelado con el default de 300 s de
  undici contra un `maxDuration` de 120. No lo verifiqué; si es cierto, es un
  hermano exacto del ALTO del mutex y debería mirarse en el próximo pase.
- `duplicados.ts` lo leí completo y es puro y correcto, pero no encontré quién
  lo llama con datos de TODA la flota; no verifiqué que el detector de fraude
  entre viajes esté cableado a una pantalla.
