# Backend y API — auditoría 18 · continuación 4

**Nota: 7/10** (antes 7). **Sin movimiento**, y la razón se escribe entera porque
hay fuerza en las dos direcciones y se cancelan:

- *Se atacó y subió* — el hallazgo que sostenía la nota anterior está **cerrado
  en la base, no en TypeScript**: `registrar_pago_tx` (0159:72-142) lee el saldo
  con la factura `for update` y mete suma, veredicto e insert en una
  transacción; `facturacion_escritura.ts:558` ya no decide nada, y
  `verificaciones.sql:6641-6665` corre las cuatro reglas contra Postgres. Eso es
  exactamente lo que el ancla del rubro pedía.
- *Deuda que cobró factura* — el mismo delta que arregló «Stripe no promete
  orden» (RES-11) lo arregló **solo para la suscripción**. `aplicarFactura` y
  `cancelarFacturaDeStripe` quedaron sin guardia, y ahí el efecto es que una
  factura **pagada vuelve a decir «Falló el cobro»**. Un arreglo a medias en el
  módulo del dinero pesa lo mismo que el que se cerró.

El riesgo mayor del rubro hoy: **la mensualidad de Likida a la flota no tiene
árbitro de orden. Un `invoice.payment_failed` que Stripe reentrega horas después
del `invoice.paid` sobreescribe la factura ya cobrada: `estado='fallida'`,
`pagada_en=null`, y `/dashboard/suscripcion` le pide al cliente que vuelva a
transferir $11,600 que ya transfirió.**

## Verificación de los abiertos de la c3

| # | Hallazgo | Estado | Evidencia |
|---|---|---|---|
| 1 | ALTO — `registrarPago` decide con una lectura y escribe sin llave | **CERRADO** | `facturacion_escritura.ts:558-570` ya no lee/decide/escribe: llama `rpc('registrar_pago_tx')`. La RPC (`0159:72-142`) hace `select … for update` sobre `factura_emitida` (`:94-99`), suma `pago_recibido` **con la fila trabada** (`:105-107`), aplica las cuatro reglas en el mismo orden que `evaluarAbono` (`:113-122`) e inserta y pone `pagada` en la misma transacción (`:126-135`). Los SQLSTATE propios (`CU010`/`CU011`) se traducen en `:504-523`. Probado contra Postgres en `verificaciones.sql:6641-6665`. El aviso `facturacion.estatus_pagada_no_escribio` desapareció con las dos escrituras. |
| 2 | ALTO — el dueño que maneja pierde el despacho y nadie se lo dice | **REINCIDENTE** | `processor.ts:920` sigue siendo `{ incluirPreguntaLibre: !viajeId, incluirDespacho: !viajeId }` y `:558` sigue gateando despacho **y** asignación con ese booleano. Con viaje abierto, «nuevo viaje para Juan Pérez…» no lo reclama ningún reconocedor y `atenderTextoOficina` devuelve `false` (`:639`). Ninguna línea contesta. Detalle abajo. |
| 3 | MEDIO — el Registro de Viajes pagina con `range()` sobre un orden que empata | **CERRADO (con residuo)** | El camino vivo es keyset: `viajes_registro.ts:129-163` llama `viajes_registro_tenant` (0154), que compara **fila** `(fecha_inicio, created_at, id) < (…)` con `id desc` en el índice (`0154:72`) y separa la rama `fecha_inicio is null`; el cursor se valida al entrar (`:57-70`) y se lee como «primera página» si viene roto. `dashboard/viajes/page.tsx:59` importa de ahí. El residuo: `analytics.ts:1038-1071` —la versión con `.range(desde, desde + porPagina)`— **sigue exportada con el mismo nombre y sin un solo llamador**. Va como hallazgo BAJO. |
| 4 | BAJO — un viaje creado entre dos consultas convierte `GET /v1/viajes` en 500 | **CERRADO** | Ya no hay dos consultas: `route.ts:114-135` pide filas y `count` en **la misma** (`.select(COLUMNAS_VIAJE, conConteo ? { count: 'exact' } : {})`), así que las dos cifras salen del mismo instante. Además el `count` es opt-in (`?conteo=1`, `_comun.ts:473-492`) y `hayMas` se mide con una fila de más (`:167`), así que el camino por default ni siquiera evalúa la guarda. La guarda de recorte silencioso sobrevive y tiene prueba: `paginacion.test.ts:231`. |
| 5 | BAJO — un borrador sin folio y sin UUID no tiene llave natural | **REINCIDENTE** | La 0166 rehízo el índice (`0166:157,185`) pero conservó `where folio is not null`, y su propia cabecera lo declara (`0166:62-64`: «una factura en borrador sin folio todavía no ocupa lugar en ningún consecutivo»). Dos envíos del mismo borrador de $116,000 siguen creando dos filas. |
| 6 | BAJO — `reengancharPendiente` sin un solo llamador | **REINCIDENTE** | `despacho_wa.ts:238,362` y `asignar_wa.ts:298,359` siguen consultando la bandera. Sus únicos llamadores de producción, `processor.ts:558-560` y `:577-579`, siguen pasando **tres** argumentos. El único código que la pasa es una prueba (`despacho_wa.test.ts:206,215`), que por tanto verifica una rama que producción nunca alcanza. |
| c2-10 | MEDIO — `crearFlota` tira los datos fiscales capturados a medias | **REINCIDENTE** | `administracion.ts:164-172`: `fiscalCompleto` sigue exigiendo los cinco y `filaFiscal` sigue siendo `null` si falta uno; el insert de `:208-217` sigue escribiendo solo `nombre`, `rfc`, `ciudad`, `regimen_fiscal` y la config. Razón social y CP fiscal capturados se pierden sin decirlo. |
| c2-12 | BAJO — un id no-UUID en `/admin/mapa-prospectos/[id]` da 500, no 404 | **REINCIDENTE** | `prospectos-mapa.ts:754-756` sigue haciendo `.eq('id', id)` sin comprobar forma y pasando por `exigir`, que lanza ante el `22P02`. (La familia hermana **sí** aprendió: `mapa-prospectos/textos/route.ts:27,38` filtra por `ES_UUID` antes de consultar.) |

**3 cerrados de 8** — pero los tres cerrados son los que tocan dinero o
paginación de dinero, y los cinco reincidentes son de las capas de captura y de
mensajería. Los cinco reincidentes llevan **tres rondas**; eso ya es una señal
sobre el criterio de priorización, no sobre el código.

## Hallazgos

### [ALTO] Stripe: la mensualidad **pagada** vuelve a decir «Falló el cobro» — la guardia de orden de RES-11 se aplicó a la suscripción y no a la factura

`src/lib/saas/suscripcion.ts:795-846` (`aplicarFactura`, upsert sin guardia) ·
`:645-654` (la guardia que **sí** existe, para suscripción) ·
`src/app/api/stripe/webhook/route.ts:214-266` (los dos tipos entran al mismo
`aplicarFactura`) · `src/app/dashboard/suscripcion/page.tsx:101,475-476` ·
`src/lib/saas/transferencia.ts:444`

Escenario, con valores. Flota «Transportes del Bajío», plan Empresa, mensualidad
**$11,600 MXN**, invoice `in_1QX…`.

1. **10:02** — el cargo falla (tarjeta vencida). Stripe entrega
   `invoice.payment_failed` (`evt_A`, `created` 10:02). `marcarEvento`
   (`:555-576`) inserta la fila y `aplicar()` lanza porque Supabase está
   respondiendo 503 → el webhook contesta **500** (`route.ts:109-117`), la fila
   queda con `aplicado_en = null`.
2. **10:20** — el cliente cambia la tarjeta. Stripe cobra y entrega
   `invoice.paid` (`evt_B`, `created` 10:20). Esta vez todo funciona:
   `aplicarFactura` upsertea por `stripe_invoice_id` con
   `estado: 'pagada'`, `pagada_en: 2026-08-23T10:20:07Z`, `monto: 11600`.
3. **11:05** — Stripe **reintenta** `evt_A` (backoff normal: reintenta hasta 3
   días). `marcarEvento` ve el 23505, lee `aplicado_en = null` y devuelve
   `'pendiente'` → `aplicar()` **vuelve a correr** (`route.ts:99-106`, y es la
   decisión correcta de la 0132). Cae otra vez en `case 'invoice.payment_failed'`
   → `aplicarFactura({ pagada: false, monto: amount_remaining })`.

Sale mal: el upsert de `:819-844` **fija** `estado: 'fallida'`,
`pagada_en: null`, `url_pago` el del cobro fallido. La factura ya cobrada
retrocede a fallida sin un solo error en el log — el 200 es honesto porque desde
el punto de vista del webhook el evento se aplicó.

Y no hay nada que lo arbitre: `aplicarSuscripcion` **sí** compara
`evt.created` contra el último aplicado (`:645-654`, con su ledger `orden:<subId>`
en `:757-784`), pero ese parámetro (`eventoCreadoUnix`) solo se pasa desde
`route.ts:209`, en el `case` de suscripción. `aplicarFactura` ni siquiera lo
recibe en su firma (`:795-813`).

La otra dirección del mismo agujero es peor: `cancelarFacturaDeStripe`
(`:867-896`) pone `estado='cancelada'` y cancela el CFDI ante el PAC tras un
`charge.refunded`; un `invoice.paid` reentregado después lo pisa con
`estado='pagada'` y `pagada_en`, dejando la fila **pagada con
`cfdi_cancelado_en` puesto**. `cancelarFacturaDeStripe` se protege de su propio
repetido (`:889`, `'ya_cancelada'`); de que otro handler la resucite, no.

Consecuencia: el contralor abre `/dashboard/suscripcion`, ve el `StatusPill`
rojo «Falló el cobro» (`page.tsx:475-476`) y el botón de pagar sobre la
mensualidad que ya transfirió, porque `porPagar` busca justamente
`'pendiente' | 'fallida'` (`page.tsx:101`). Del otro lado, `getPorCobrar`
(`transferencia.ts:440-446`, la pantalla de Javier) la vuelve a listar como
cobrable: Likida le cobra dos veces a su primer cliente de pago. Es la clase de
error que el producto entero promete no cometer, en la única factura donde
Likida es el emisor.

Sin prueba: `webhook/route.test.ts` cubre monto, periodo y `pagadaEn` de los dos
tipos (`:280-302`) pero ninguna prueba entrega dos eventos de la misma factura
en orden invertido; `plan_price.test.ts:114` solo verifica `metodo_cobro`.

Causa raíz probable: RES-11 se implementó como un parámetro opcional de UNA
función en vez de como una puerta del webhook, y el `switch` que reparte los
eventos no obliga a que cada rama la cruce.

---

### [ALTO] `updateGastoCfdiXml` descarta el `error` de la lectura que hace justo antes de fusionar: un tope de consulta borra la bandera de moneda extranjera

`src/lib/likida/repo.ts:680-688` ·
`src/lib/likida/presupuesto.ts:160-177` (`acotada` entrega el tope agotado
**por valor**, como Postgres) · `src/lib/likida/cuadre/engine.ts:529,571-577`

```ts
const { data: actual } = await acotada(supabaseAdmin().from('gasto')
  .select('ocr_extra').eq('id', gastoId).eq('tenant_id', tenantId).maybeSingle(),
  'updateGastoCfdiXml.leerOcrExtra');
const ocrExtra = { ...((actual?.ocr_extra as Record<string, unknown> | null) ?? {}) };
```

`error` no se desestructura. Es la firma exacta del bug que `pg.ts:12-22`
describe como «la familia de bugs más repetida del repo», tres líneas debajo de
un comentario (`:674-676`) que dice que aquí **no** se puede escribir a ciegas
porque «ahí viven producto, estacion, fechaImpresa… que una escritura a ciegas
borraría».

Escenario, con valores. Un chofer manda la foto de un diésel de **USD 450.00**
comprado en la frontera. El intake escribe
`ocr_extra = { producto:'Diesel', estacion:'Pemex 4412', litros:210.5,
moneda:'USD', tipoCambio:18.90, montoDiscrepante:true, montoOcr:8505 }`.
Días después llega el XML del emisor (`ClaveUnidad=LTR`, `Cantidad=212.0`, sin
nodo de moneda porque el parser no lo trajo). `litrosDelXml` es `true`, así que
se entra al bloque. Si esa lectura se pasa de `TOPE_CONSULTA_MS`,
`acotada` resuelve `{ data: null, error: {…} }` — **a propósito**, para que cada
llamador conserve su semántica— y aquí nadie la mira: `actual` es `null`,
`ocrExtra` arranca en `{}`, y el update de `:690-702` escribe
`ocr_extra = { litros: 212 }`.

Sale mal: se pierden `moneda:'USD'` y `tipoCambio:18.90`. En el cuadre,
`engine.ts:571-577` lee `extraOcr?.moneda`, no la encuentra, y **no emite
`moneda_extranjera`**: el comprobante de USD 450 se comprueba como $450.00 MXN
contra el anticipo y su IVA se acredita sobre esa cifra. Es literalmente el
daño que DAT-19 vino a cerrar (`engine.ts:562-570` lo narra con esos números),
reabierto por un `error` sin leer. En el mismo golpe se pierden
`montoDiscrepante`, `noEsComprobanteFiscal`, `montoImplausible` y
`textoSospechoso` — las cuatro banderas que `engine.ts:529-583` convierte en
diferencias para la bandeja del contralor.

Consecuencia: el contralor liquida un gasto extranjero como si fuera en pesos,
sin la leyenda que le diría que lo convierta a mano, y sin las tres alertas de
lectura dudosa que el intake ya había levantado. Nada queda en el log: la
lectura fallida no se registra y el update posterior sí funciona.

No es CRÍTICO solo porque hace falta que la lectura previa falle; sí es ALTO
porque cuando falla el producto imprime una cifra mal y afirma haber revisado.

Causa raíz probable: el patrón lee-fusiona-escribe se copió sin la mitad del
contrato de `acotada` — que el tope llega por el mismo canal que el error de
Postgres, no por una excepción.

---

### [ALTO · REINCIDENTE] El dueño que maneja pierde el despacho entero y sigue sin recibir una sola palabra

`src/lib/likida/processor.ts:920` · `:558-590` · `:639` ·
`src/lib/likida/informes_wa.ts` (`PATRONES`, anclados con `^…$`)

Idéntico a la c3, con el mismo número de línea corrido por el delta. Javier es
`flota_admin` y operador con el mismo número; trae su viaje `v1` abierto y
escribe «nuevo viaje para Juan Pérez, Puebla a Monterrey, anticipo 8000».
`processor.ts:920` entra con `incluirDespacho: false`, el bloque `:558-590`
—despacho y asignación— se salta entero, ningún otro reconocedor reclama el
texto, `atenderTextoOficina` devuelve `false` en `:639` y el mensaje lo acaba
contestando el agente del chofer con el contexto de `v1`.

Sale mal: el viaje de Juan Pérez con anticipo $8,000 no se crea, no hay
pendiente que confirmar, y el saludo de oficina le sigue prometiendo por escrito
que «también puedes despacharme viajes». El comentario `:540-557` explica muy
bien **por qué** se apaga; no hay una línea que diga **qué se contesta**. La
prueba que lo cubre (`processor_dueno_maneja.test.ts`) sigue afirmando solo
`not.toHaveBeenCalled()`: verifica el silencio, no la respuesta.

Consecuencia: Juan Pérez no sale a carretera y el dueño —la persona que compra
el producto— cree que despachó.

Causa raíz probable: el desempate se implementó como un booleano que apaga el
reconocedor; el reconocedor era el único que sabía que ese texto era un despacho.

---

### [MEDIO] El CSV de liquidaciones pagina por OFFSET sobre `created_at desc`: una liquidación nueva a media descarga duplica una fila y esconde otra

`src/app/api/export/liquidaciones/route.ts:84-93` (`.range(d, d + PAGINA - 1)`)
y `:111-130` (el corte por `esperadas`) · `src/lib/likida/pg.ts:132-135,202-204`

Escenario, con valores. Flota a escala objetivo (50k viajes/mes). El contralor
descarga `?desde=2026-08-01&hasta=2026-08-23`; la primera página trae
`count = 4,000`, que se congela en `esperadas` (`:111`). El stream va pidiendo
`pagina(leidas)` = `range(1000,1999)`, `range(2000,2999)`… sobre
`order('created_at', desc).order('id', desc)`.

Entre la página 1 y la 2, un chofer cierra su viaje por WhatsApp y se escribe la
liquidación **4,001** con `created_at = 14:03:11`. Como el orden es
**descendente**, esa fila entra en la **posición 0** y desplaza todo un lugar.
`range(1000,1999)` devuelve ahora lo que antes eran las filas 999..1998: la fila
999 sale **dos veces** y la 1999 no sale nunca. Al final `leidas` llega a 4,000 y
el bucle corta (`:122`) antes de leer la que se recorrió.

La guarda que existe no lo ve: `LecturaIncompleta` (`:123-128`) solo dispara con
una página **vacía**, y aquí ninguna lo está. El archivo sale con 4,000 renglones
—el número que el contralor esperaba— con uno duplicado y uno ausente.

`pg.ts:132-135` advierte de este modo de falla para el caso del orden que empata,
y `traerTodo` razonó el caso vecino (`:202-204`, «entre la primera página y la
última pudo entrar una fila nueva; sobrar no es el fallo que se persigue») — pero
ese razonamiento vale porque **todos** sus llamadores ordenan `id` ascendente y
la fila nueva cae al final. Este export es de los tres del repo que ordenan
descendente (con `proveedores.ts:453` y `vendedores.ts:313`), y ahí la fila nueva
cae al principio.

Consecuencia: el CSV que el contador importa a su ERP para conciliar trae una
liquidación duplicada y le falta otra. MEDIO y no ALTO porque el duplicado deja
huella visible (un folio repetido en el archivo) y el contador tiene una
oportunidad de notarlo; la ausencia, sola, sería silenciosa.

Sin prueba: no hay ningún test del stream de este export con escrituras
concurrentes.

Causa raíz probable: el streaming se resolvió con `range` por posición sobre el
mismo orden que la pantalla usa para mostrar lo más nuevo primero; el cursor que
`/v1/viajes` ya tiene no se llevó aquí.

---

### [MEDIO] `?conteo=1` + `?despues=` devuelve «lo que queda», y el OpenAPI promete «el total de la flota»

`src/app/api/v1/viajes/route.ts:114-135` · `src/app/api/v1/openapi/route.ts:213`
y `:570-571` · `src/app/api/v1/viajes/paginacion.test.ts:71,76,117`

El `count: 'exact'` va en **la misma consulta** que lleva el filtro del cursor
(`route.ts:116` y `:123-125`), así que PostgREST cuenta las filas que quedan
**después** del cursor, no las de la flota.

Escenario, con valores. Flota con 5,000 viajes. El TMS sincroniza como el propio
OpenAPI le indica (`:570-571`: «pide la primera página con `?conteo=1` … y
después repite con `?despues=`»), pero deja el `conteo=1` puesto en el bucle:

- `GET /v1/viajes?limite=200&conteo=1` → `pagina.total = 5000`. Correcto.
- `GET /v1/viajes?limite=200&conteo=1&despues=<cursor>` → `pagina.total = 4800`.
- siguiente vuelta → `4600`, y así hasta `pagina.total = 200` en la última.

El parámetro está documentado como «Pide **el total de la flota**
(`pagina.total`) … un `count(*)` sobre **todos los viajes de la flota** EN CADA
petición» (`openapi:213`). Con cursor no es ninguna de las dos cosas: ni es el
total de la flota, ni cuesta lo que dice.

Consecuencia: el integrador que use `total` como denominador de progreso ve una
barra que nunca avanza, y el que lo use para decidir «ya los traje todos»
(`leidos === total`) corta la sincronización en la segunda página con 400 viajes
de 5,000. Es un rótulo que no es verdad en el único contrato que este producto
publica hacia afuera.

Refutación intentada y descartada: el `Sobre` genérico de `_comun.ts:375-378`
dice «del otro lado del filtro», que sí es cierto — pero es la descripción del
campo, no la del parámetro que el integrador lee para decidir si lo manda, y las
dos viven en el mismo archivo de OpenAPI diciendo cosas distintas.

Sin prueba, y el arnés ya sabría reproducirlo: el mock de
`paginacion.test.ts:71,76` aplica el filtro del cursor **antes** de calcular
`count`, o sea que modela la semántica real. `:117` («con `?conteo=1` … el total
es el de la flota») solo se ejecuta sobre la primera página; ninguna prueba
combina los dos parámetros.

Causa raíz probable: el `count` se dejó pegado a la consulta cuando ésa era la
única forma de paginar, y el cursor se añadió a la misma consulta en vez de a una
aparte.

---

### [MEDIO] El webhook cuenta como intento fallido el mensaje que nunca miró — el arreglo ESC-1 llegó al cron y no al webhook

`src/app/api/webhook/whatsapp/route.ts:295-308` ·
`src/app/api/cron/wa-pendientes/drenado.ts:91-108` (el mismo caso, resuelto) ·
`src/lib/likida/wa_pendientes.ts:168-186` (`devolverIntentoPendiente`) y `:23-25`
(`MAX_INTENTOS_PENDIENTE = 5`)

El drenado distingue explícitamente los pospuestos:

```ts
if (resultado === 'sin_tiempo') {
  await devolverIntentoPendiente(claim.id, claim.intentos);   // drenado.ts:102
  return;
}
await anotarFalloPendiente(claim.id, `pospuesto: ${resultado}`);
```

y el comentario `:98-101` dice por qué: «quedarse sin presupuesto NO es un
intento fallido — el mensaje ni se miró. Contarlo convertía en carta muerta … una
foto que nadie llegó a procesar». El webhook, que corre el **mismo** ciclo sobre
las **mismas** filas, no hace esa distinción: `:301-304` mete `sin_tiempo`,
`en_curso` y `reintentable` en el mismo `anotarFalloPendiente` y el intento que
`reclamarPendiente(f.id, 0)` acaba de consumir (`wa_pendientes.ts:147`) no se
devuelve.

Escenario, con valores. Un chofer manda **22 fotos** en la misma ráfaga. El
webhook las persiste todas (`route.ts:220-221`) y las procesa con
`conPool(…, MAX_EN_PARALELO = 5, …)` (`:295`) contra
`PRESUPUESTO_WEBHOOK_MS = 120_000` (`presupuesto.ts:200`). Con OCR real a
~20 s por foto caben ~30; las últimas ~13 entran a `processInbound`, encuentran
el reloj agotado y salen con `'sin_tiempo'` (`processor.ts:692-695`). Las 13 se
quedan con `intentos = 1` de 5 y con
`ultimo_error = "pospuesto: sin_tiempo"`.

Sale mal en dos formas, ninguna con log propio:

1. **La pista de aterrizaje se acorta un 20%**: esas fotos llegan al cron con 4
   reintentos en vez de 5, y el cron es justo el que se cuida de no gastarlos.
   Si además hay un fallo real intermitente del OCR, la foto se vuelve carta
   muerta una corrida antes de lo que el diseño previó.
2. **El triage miente**: `/admin` y el reporte del cron leen `ultimo_error`. Un
   operador que abre la bandeja después de una ráfaga ve trece mensajes con un
   error que no ocurrió — no falló nada, se acabó el minuto.

El daño está acotado (el webhook ancla su claim a `.eq('intentos', 0)`, así que
quema **un** intento por mensaje y no cinco), y por eso es MEDIO y no ALTO.

Consecuencia: el chofer que manda su ráfaga completa —el comportamiento que este
producto pide— es el que más cerca queda de que una de sus fotos se declare
irrecuperable.

Causa raíz probable: `quedoPendiente()` se duplicó en los dos llamadores
(`drenado.ts:37-39` y el webhook) pero la política de qué hacer con cada valor
solo se escribió en uno.

---

### [MEDIO] `pago_recibido` sigue sin llave natural: el mismo SPEI capturado dos veces suma dos veces

`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:93-109` (dos índices,
ninguno único) · `supabase/migrations/0159_rpcs_atomicas.sql:113-124` (el
veredicto solo mira el **saldo**) · `src/app/dashboard/facturacion/page.tsx:111-129`

Es el residuo del hallazgo #1, y hay que decirlo con precisión porque el
cierre fue real: `registrar_pago_tx` impide el **sobrepago** (dos abonos que
sumados pasen el total), no el **abono repetido** que cabe dentro del saldo.

Escenario, con valores. Factura `F-1042`, total **$116,000**, sin abonos. El
contador registra la transferencia parcial de **$50,000**, referencia
`SPEI-88213`. El server action tarda, él vuelve a enviar (o la auxiliar captura
la misma ficha del banco). Los dos abonos entran: el segundo ve saldo $66,000,
$50,000 no lo rebasa, `registrar_pago_tx` lo acepta y `pago_recibido` queda con
dos filas de $50,000 y la **misma** `referencia`.

Sale mal: `factura_saldo` dice $16,000 por cobrar cuando el banco recibió
$50,000. La cartera de Transportes del Bajío está $50,000 **por debajo** de lo
real, y no hay ningún índice ni ninguna validación que oponga la referencia —que
existe precisamente para identificar la transferencia— contra la que ya está.

Consecuencia: el contralor deja de perseguir $50,000 que sí le deben. A
diferencia del sobrepago (que se ve porque el saldo sale negativo), un saldo
demasiado bajo es la dirección que nadie revisa.

Refutación intentada: el botón usa `useFormStatus`, pero eso deshabilita **por
formulario**, no por factura ni entre pestañas; y `validarPago`
(`facturacion_escritura.ts`) valida forma, no unicidad.

Causa raíz probable: la protección durable se dejó en el veredicto de saldo, que
por construcción no puede distinguir dos abonos legítimos de uno capturado dos
veces.

---

### [BAJO] Hay dos `getViajesRegistro`, y el que sigue exportado en `analytics.ts` es el que se acaba de reemplazar por roto

`src/lib/likida/analytics.ts:1038-1071` · `src/lib/likida/viajes_registro.ts:129-163`

`analytics.ts` sigue exportando `getViajesRegistro` con el
`.range(desde, desde + porPagina)` sobre `fecha_inicio desc, created_at desc` —el
que la c3 reportó y la 0154 vino a sustituir— **sin un solo llamador**: los tres
consumidores (`dashboard/viajes/page.tsx:8`, `inicio-contenido.tsx:31`,
`barra-acciones.tsx`) importan el de `viajes_registro.ts`.

Escenario: alguien añade una pantalla que necesita el registro, escribe
`import { getViajesRegistro } from '@/lib/likida/analytics'` —que es el archivo
donde vive el resto de las lecturas del dashboard, y donde el autocompletado lo
ofrece primero— y se lleva la paginación por OFFSET sin desempate único, sin que
tsc ni eslint digan nada. El keyset probado con EXPLAIN queda del otro lado.

Consecuencia: para el equipo que mantiene esto, dos funciones con el mismo nombre
y el mismo propósito, una arreglada y otra no, y ninguna señal de cuál es cuál.

Causa raíz probable: la extracción a `viajes_registro.ts` movió a los llamadores
y no retiró el original.

---

### [BAJO] `cron/wa-pendientes/route.ts` conserva 17 imports muertos, incluidas las tres perillas del drenado

`src/app/api/cron/wa-pendientes/route.ts:1-16` ·
`src/app/api/cron/wa-pendientes/drenado.ts:26-32`

Verificado corriendo `npx eslint` sobre el archivo: 17 `no-unused-vars`, todos
**warning**, así que la compuerta sigue verde y nada obliga a limpiarlos. Entre
ellos están `LOTE`, `ANCHO_POOL` y `MAX_VUELTAS_QSTASH` (`:12`), que es lo que
importa: quien abra el `route.ts` para ajustar el caudal del drenado ve las tres
constantes importadas ahí y creerá que las toca en ese archivo. Las toca en
`drenado.ts:26-32`; el `route.ts` no las usa para nada. Igual con
`processInbound`, `conPool`, `pendientesPorDrenar`, `reclamarPendiente`,
`appUrl` y `QstashClient`: el archivo **parece** el que drena la bandeja y ya no
lo es.

Consecuencia: deuda de mantenimiento con una trampa concreta de lectura, en el
cron que corre cada minuto y manda WhatsApp a personas reales.

## Lo que revisé y está bien

- **El drenado nuevo, entero** (`drenado.ts:60-154`). El paralelismo es **por
  chofer** (`:76-83`), que es lo único que conserva el orden dentro de una
  conversación mientras multiplica el caudal; el claim sigue siendo el `update`
  anclado a `(id, intentos, procesado_en is null)` de `wa_pendientes.ts:144-155`,
  así que dos vueltas encadenadas de QStash y el cron del minuto siguiente no se
  pisan; el `sin_tiempo` corta la cadena de ESE chofer con `return` (`:105`) sin
  tumbar el pool; el auto-reencolado tiene techo (`MAX_VUELTAS_QSTASH = 20`) y es
  best-effort declarado (`:156-184`) — sin QStash, el cron del minuto siguiente
  toma exactamente el mismo lote y no se pierde nada.
- **`cola/route.ts` verifica la firma de QStash antes de tocar la base**
  (`:27-45`), y el kill switch se re-mira ahí (`:58-69`) contestando **200** y no
  5xx cuando está apagado — la razón está escrita (`:54-57`): un 5xx haría que
  QStash reintentara, o sea insistir en correr lo apagado.
- **La puerta de los crons es una y las cinco rutas la usan**: `puertaCron` en
  `escalar`, `purgar`, `facturar`, `runner` y `wa-pendientes` (verificado por
  grep, cinco llamadas, cero rutas de cron sin ella). `autorizaCron`
  (`auth/cron.ts:40-47`) pasa los dos lados por SHA-256 antes del
  `timingSafeEqual` para que el largo del secreto no sea observable, y devuelve
  `false` —nunca lanza— ante cualquier duda.
- **Los caminos de agregación RPC de `analytics.ts` fallan cerrados de FORMA, no
  solo de error**: `leerRpc0150` (`:41-51`) y sus cinco hermanas fuera del molde
  (`:145-172`, `:220-250`, `:677-702`, `:851-870`, `:1799-1817`) comprueban
  `error` **y** que la forma sea la esperada, y **lanzan** con el nombre de la
  migración que faltaría. Ninguna deja que un `?? 0` pinte un cero que se lea como
  medición. Respondiendo a la pregunta del encargo: **no encontré ningún camino
  de `analytics.ts` que lea `error` por valor sin comprobarlo.** El único que
  encontré en todo el acceso a datos es el de `repo.ts:680`, que va como hallazgo.
- **El keyset del Registro de Viajes, de punta a punta.** `decodificarCursor`
  (`viajes_registro.ts:57-70`) valida forma de fecha, UUID y `Date.parse` y
  devuelve `null` —«primera página»— ante cualquier basura, sin lanzar; la RPC
  (`0154:143-227`) tiene las tres ramas con su predicado fijo, la comparación de
  fila `(fecha_inicio, created_at, id) < (…)`, `nulls last` explícito en cada
  `ORDER BY` (lo que el EXPLAIN de la cabecera demuestra que es la diferencia
  entre Index Cond y un Sort de 90k filas) y topa `p_limite` **en la base**
  (`0154:141`, `least(greatest(coalesce(p_limite,100),1),100)+1`), no solo en JS. `mapearFila` (`:96-104`) lanza si falta un campo:
  «un campo que falta es una migración a medias, no un viaje raro».
- **El cursor de `/v1/viajes` no se puede usar para inyectar en el `or()` de
  PostgREST**: `decodificarCursor` (`_comun.ts:449-458`) exige UUID, fecha
  parseable y rechaza explícitamente `"`, `(`, `)` y `,` en el `created_at`, que
  son justo los metacaracteres del filtro que se construye en `route.ts:124`.
- **Los topes de subida son coherentes con el límite real de la plataforma.**
  `MAX_DATAURL` y `MAX_BASE64` valen 4,000,000 contra los 4.5 MB que Vercel corta
  antes de que la ruta exista (`ingesta/limites.ts:24`, `archivo/limites.ts:21`),
  con el margen para cabeceras explicado. Respondiendo a la pregunta del encargo:
  **el tope se aplica DESPUÉS de `req.json()`** (`ingesta/route.ts:49,56`;
  `archivo/route.ts:30,39`), pero eso no es un hallazgo porque el cuerpo ya viene
  acotado por la plataforma a 4.5 MB — comprobar `content-length` antes solo
  ahorraría medio mega de parseo. El 413 con texto nuestro (`:57-59`) es lo que
  el usuario ve, y ése era el objetivo de ESC-14/RES-20.
- **La ruta nueva `admin/mapa-prospectos/textos`**: `sesionSuperadmin()` primero
  (`:30-31`), `TOPE_IDS = 2000` con 400 explícito (`:39-41`), filtro por forma de
  UUID que **descarta** el id basura en vez de tumbar la tanda (`:36-38`), `Set`
  para deduplicar, `Cache-Control: no-store` (`:44`) sobre datos comerciales, y
  POST en vez de GET con razón escrita (mil UUIDs son 37 KB de URL). `traerPorIds`
  (`pg.ts:162-181`) parte en tandas de 200 y usa `exigir`, así que no hay recorte
  silencioso.
- **La idempotencia de `/v1` sigue firme** (`_escritura.ts`): las tres capas y el
  árbitro real que es el unique de la base; `POST /v1/viajes` exige `folio`
  precisamente porque con `folio` NULL el unique no participa
  (`viajes/route.ts:208-212`), y lo dice donde el integrador lo lee.
- **`leerPeriodo`** (`export/liquidaciones/periodo.ts:16-53`): valida día de
  calendario real (rechaza `2026-02-31`), exige los dos extremos, topa a 3 meses y
  arma el rango medio abierto en `-06:00` fijo. Sin sorpresas.
- **`mezclaQueSoloRellena`** (`lead/mezcla.ts:25-44`): un endpoint público que
  nunca pisa un dato que ya existe, manda lo distinto a `notas` con tope de 4,000
  y no manda `null` jamás (`:36`) para no borrar el teléfono que trajo el DENUE.
  La decisión está aislada de la base para poder probarse sola.
- **CSRF, respondiendo a «cuáles no»**: `vieneDeNuestroSitio` se usa en exactamente
  dos lugares — `v1/_comun.ts` y `admin/palette/route.ts`. Las **catorce** rutas
  POST restantes no lo llaman. Lo miré una por una y **no lo reporto como
  hallazgo**, porque todas exigen `application/json` con cuerpo (lo que fuerza
  preflight CORS y deja fuera el `<form>` cross-site), la cookie es `sameSite:lax`,
  y las de `/admin` que ejecutan algo exigen además un `intentId` que el servidor
  emitió y el atacante no puede conocer (`admin/copiloto/route.ts`). Queda como
  observación para el auditor de seguridad, no como falla mía.
- **`acotada`, y dónde no llega.** La guardiana (`acotada_guardiana.test.ts`) cubre
  18 archivos y ninguno se le escapa hoy. Fuera de la lista noté dos que sí
  consultan sin techo y son de dinero: `src/lib/saas/suscripcion.ts` (30
  `.from(`/`.rpc(`, cero `acotada`) y `src/lib/admin/prospectos-mapa.ts` (6, cero).
  No lo levanto como hallazgo porque el daño es de presupuesto de invocación, no
  de dato, y le toca a Rendimiento — pero el webhook de Stripe declara
  `maxDuration = 60` y su capa de datos no tiene techo propio.

## Lo que NO alcancé a revisar

- **`procesarLoteEnCola` completo** (`cron/facturar/route.ts:400-560`): tercera
  ronda que se queda fuera. Leí el corte por presupuesto y la re-validación de
  `cfdi_uuid is null`, no el reparto de un mismo UUID sobre N gastos con
  `cfdi_orden` ni `anotarBloqueo`.
- **`src/lib/likida/repo.ts` entero.** Abrí `updateGastoCfdiXml` y el conteo de
  `acotada` (38 de 39); no recorrí las otras 38 consultas buscando más `error`
  descartados. El que encontré salió de un barrido por patrón, no de una lectura
  completa: puede haber otros escondidos en un `const { data: x } =` con alias.
- **`src/lib/saas/transferencia.ts`** (cobranza por transferencia y timbrado con
  Facturapi): solo leí `getPorCobrar` y el `.in(['pendiente','fallida'])` que el
  hallazgo de Stripe necesitaba. El camino de `timbrando_en` como candado y el
  compensado del PAC no los abrí.
- **`adaptadores/pagina_playwright.ts`** (~840 líneas): cuarta ronda sin revisar
  sus topes de tiempo y su manejo de pestañas.
- **Los otros tres exports** (`bitacora-peaje`, `facturas-proveedor`,
  `pdf/[id]`): verifiqué sus dos puertas (área `dinero` + `puedeExportar`), no su
  paginación ni sus topes.
- **No ejecuté nada contra una base real** — aquí no hay. Los dos hallazgos ALTO
  se sostienen por lectura: el de Stripe, en que `eventoCreadoUnix` solo se pasa
  desde el `case` de suscripción (grep exhaustivo: 3 apariciones, todas ahí) y en
  que el upsert de `aplicarFactura` fija `estado` incondicionalmente; el de
  `repo.ts`, en que `acotada` documenta y ejecuta la entrega del tope **por
  valor** (`presupuesto.ts:171-174`) y en que la línea no desestructura `error`.
- **No corrí la suite completa** en esta pasada: corrí `npx eslint` sobre las
  rutas nuevas del foco. La compuerta global la reporta verde el MAPA; no la
  re-medí, así que no la cito como propia.
