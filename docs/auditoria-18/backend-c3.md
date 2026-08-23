# Backend y API — auditoría 18 · continuación 3

**Nota: 7/10** (antes 6). Razón del movimiento: **se atacó y subió**. De los 13
hallazgos que traía abierta la pasada anterior, el PR #38 cerró **8** —incluido
un CRÍTICO y cinco de los seis ALTO— y, lo que sostiene la nota, los cerró **con
prueba nombrada**, no con un comentario: `conv_claim_lease.test.ts:60-107` y
`processor_lock.test.ts:164-203` fijan el ciclo de vida del claim que llevaba
tres rondas abierto; `despacho_wa.test.ts:411,428` y
`conv_error_disfrazado.test.ts:81` fijan las dos direcciones del choque de
`wa_conversacion.estado`. No sube a 8 porque el ancla del rubro pide que **cada
camino que toca dinero tenga prueba propia**, y el único camino de escritura de
dinero que el cliente teclea a diario —`registrarPago`— sigue siendo un
lee-decide-escribe sin llave única, sin candado y sin una sola prueba de
concurrencia.

El riesgo mayor del rubro hoy: **la captura de cobranza del panel es la única
escritura de dinero del producto sin idempotencia. Dos abonos simultáneos de
$116,000 sobre la misma factura de $116,000 pasan los dos el veredicto de
`evaluarAbono` —que existe precisamente para prohibirlo— y la cartera del
contralor queda con saldo −$116,000.**

## Verificación de los abiertos de la pasada anterior

| # | Hallazgo (c2) | Estado | Dónde lo verifiqué |
|---|---|---|---|
| 1 | CRÍTICO — el piloto de visión apaga el aviso de 10 comercios y no factura ninguno | **REINCIDENTE** | `avisar.ts:68` sigue siendo `portalesOperables()` por default y `:134` llama `armarAviso(tickets)` pelado; `registro.ts:194-197` sigue metiendo los pilotables con la palanca; `al_vuelo.ts:277-289` sigue devolviendo `intentado:true, facturado:false` **sin `bloqueado`** para el ensayo. `git log` de los tres archivos: nada del PR #38 los tocó. |
| 2 | CRÍTICO — el dueño que maneja no puede cerrar su liquidación 30 min | **CERRADO** | `processor.ts:872` entra con `{ incluirPreguntaLibre: !viajeId, incluirDespacho: !viajeId }` y `:510` gatea despacho y asignación con eso. Con viaje abierto, `atenderDespachoOficina` ya no se llama y su re-pregunta no puede comerse el «listo». Prueba: `processor_dueno_maneja.test.ts:132,142,155`. |
| 3 | ALTO — `guardarPendiente` y `saveConversation` se borran el estado | **CERRADO** | Las dos direcciones. `conv.ts:485-509`: lee la fila por `convId`, parte de `{...estadoPrevio}` y solo pisa `turns`/marcas. `despacho_wa.ts:115-140`: lee, fusiona **solo** `viajePendiente` y **omite `viaje_id`/`operador_id` del payload del upsert** (una columna ausente no entra al `SET` del `ON CONFLICT`), que era lo que nulificaba el viaje del chofer. Pruebas: `despacho_wa.test.ts:411,428`, `conv_error_disfrazado.test.ts:81`. Queda declarada la carrera SELECT→UPDATE no atómica (`despacho_wa.ts:61-70`), aceptada por escrito. |
| 4 | ALTO — `avisar.ts` no conoce la cuenta compartida | **REINCIDENTE** | `avisar.ts:70` sigue llamando `repartir(tickets, sabeOperarlo)` y `:98` `enrutar(t, …)` con dos argumentos; `armarAviso` (`:66-68`) sigue sin aceptar `cuentaCompartida`, y su único llamador (`:134`) tampoco lo pasa. `al_vuelo.ts:233` sí lee `cuentasCompartidas`. Las dos opiniones sobre el mismo ticket siguen ahí. |
| 5 | ALTO — el veto contra emitir del piloto es un regex de cinco palabras | **REINCIDENTE** | `piloto_vision.ts:90` (`HUELE_A_EMITIR`) y `:253-254` idénticos: `inv.botones.find(...)` sigue devolviendo `undefined` para un botón sin `id` ni `name`, y entonces se prueba contra `''`. `selectorDelInventario` (`:282-288`) sigue siendo un `includes` de subcadena. Archivo sin tocar desde `feb0f6b`. |
| 6 | ALTO — el cron sella como procesado el mensaje que nunca se procesó | **CERRADO** | Es el arreglo más completo del delta. `processInbound` devuelve `ResultadoInbound` (`processor.ts:614,631-683`); el claim tiene `completado_en` y lease (`conv.ts:371-413`, mig. 0149), así que una invocación muerta vuelve como `'en_curso'` y no como `'duplicado'`; y los dos llamadores no sellan lo pospuesto (`cron/wa-pendientes/route.ts:41-44,105-118`, `webhook/whatsapp/route.ts:51-53,265-277`). Pruebas: `conv_claim_lease.test.ts:66,81,87`, `processor_lock.test.ts:183,197,203`, `wa-pendientes/route.test.ts:100,111,138`, `route_pospuesto.test.ts:66-92`. |
| 7 | ALTO — el webhook de correo nunca escribe: `neq` sobre NULL | **CERRADO** | `correo/eventos/route.ts:92-96`: el `.neq(...)` desapareció; ahora es `.or('entrega_estado.is.null,entrega_estado.eq.entregado')` solo para el «entregado», y la mala noticia escribe siempre. Sin `<>` sobre columna anulable. |
| 8 | ALTO — el detector de fraude acusa un consolidado | **CERRADO** | `duplicados.ts:86-90` (`llaveCfdi` = `uuid#orden`) y `analytics.ts:384-402`, que ya pide `cfdi_orden` en el `select` y lo mapea a `cfdiOrden`. Las 40 casetas de un consolidado (0065) ya no son un duplicado. |
| 9 | ALTO — `/api/dashboard/ingesta` sin techo ni medidor | **CERRADO** | `ingesta/route.ts:46` (`rateLimit` por usuario), `:66-75` (tope diario que **falla cerrado** con 503 si no se puede leer) y `:82-85` (`registrarCosto` con `fase:'ocr'`, `viajeId:null`). El tope vive en `ingesta/tope.ts` con `acotada()`. Pruebas: `ingesta/route.test.ts`, `ingesta/tope.test.ts`. |
| 10 | MEDIO — `crearFlota` tira los datos fiscales capturados a medias | **REINCIDENTE** | `administracion.ts:132-141`: `fiscalCompleto` sigue exigiendo los cinco y `filaFiscal` sigue siendo `null` si falta uno; el insert de `:177-190` sigue escribiendo solo `nombre`, `rfc`, `ciudad` y `regimen_fiscal`. Razón social y CP fiscal capturados se siguen perdiendo sin decirlo. |
| 11 | MEDIO — la cola pide 600 s y corta a los 150 s | **CERRADO** | `cron/facturar/cola/route.ts:19` ahora declara `maxDuration = 300`, el mismo de `cron/facturar/route.ts:33` del que sale `PRESUPUESTO_LOTE_MS`. El comentario `:9-18` explica el error anterior. Prueba: `cola/route.test.ts` (mantiene iguales los dos números). |
| 12 | BAJO — un id no-UUID en `/admin/mapa-prospectos/[id]` da 500, no 404 | **REINCIDENTE** | `prospectos-mapa.ts:539-551` sigue haciendo `.eq('id', id)` sin comprobar la forma y `exigir` (`pg.ts:33-35`) sigue lanzando ante el `22P02`. |
| 13 | BAJO — `/api/lead` dedupe leyendo antes de escribir | **CERRADO (mitigado)** | `lead/route.ts:166-170`: antes del read-then-write hay `rateLimit('lead:llave:<correo|empresa>', 1, 10_000)`, que en producción es un `EVAL` atómico en Redis (`ratelimit.ts`). Queda el resto: si Redis no contesta se degrada al `Map` de la instancia, así que dos instancias concurrentes siguen pudiendo escribir dos filas; la tabla sigue sin unique por decisión de la 0139. |

**8 cerrados de 13, cero regresiones sobre lo cerrado.** Comprobé además que
ninguno de los ocho arreglos rompió a otro: la compuerta de esta rama la corrí
completa (`npx vitest run`, 432 archivos / 5,515 pruebas). Salió **1 fallo**, en
`cuadre/engine_iva_medio_pago.test.ts`, y **no es real**: al re-correr ese
archivo solo pasa (3/3). El árbol tenía `src/lib/likida/acuse_ticket.ts`
modificado por otro agente a media corrida y HEAD se movió de `38eef84` a
`ccd48b7` mientras yo medía. La compuerta base de `docs/auditoria-18/compuerta.md:52`
también la reporta verde.

## Hallazgos

### [ALTO] `registrarPago` decide con una lectura y escribe sin llave: dos abonos simultáneos pasan los dos y la cartera queda en saldo negativo

`src/lib/likida/facturacion_escritura.ts:384-416` ·
`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:93-109` (`pago_recibido`,
sin un solo unique) · `src/app/dashboard/facturacion/page.tsx:111-127`

Escenario, con valores. Factura `F-1042` a Transportes del Bajío, `total =
116,000.00`, `estatus = 'emitida'`, sin abonos. El contador y la auxiliar
registran la misma transferencia SPEI de $116,000 casi a la vez (dos pestañas,
dos personas, o el contador con la pestaña de cobranza abierta en dos monitores
— el botón se deshabilita con `useFormStatus` **por formulario**, no por
factura):

1. Las dos peticiones leen la factura (`:384-388`) y la suma de pagos
   (`:395-399`): las dos obtienen `pagado = 0`.
2. Las dos evalúan `evaluarAbono({estatus:'emitida', total:116000, pagado:0},
   116000)` → `rechazo: null`, `quedaSaldada: true`.
3. Las dos insertan en `pago_recibido` (`:406-413`). **No hay unique que las
   arbitre**: la tabla solo tiene dos índices no únicos y el check
   `pago_monto_positivo`.

Sale mal: `factura_saldo` (la vista de la 0049) devuelve `pagado = 232,000`,
`saldo = −116,000`. `clientes.ts:663` suma ese saldo al cliente, así que
«Saldo por cobrar» de Transportes del Bajío queda **$116,000 por debajo de lo
real**, y la regla que el propio módulo escribió para esto —«el sobrepago se
rechaza CON el saldo exacto»— no se aplicó nunca porque las dos lecturas vieron
un mundo sin el otro pago. La misma carrera con dos abonos parciales REALES
distintos ($60,000 + $60,000 sobre $116,000) produce el sobrepago sin que nadie
haya hecho nada raro.

Y el rastro miente: el segundo `update ... .eq('estatus','emitida')` (`:422-424`)
toca 0 filas porque el primero ya la puso `pagada`, y eso dispara
`logger.error('facturacion.estatus_pagada_no_escribio', … 'el estatus hay que
corregirlo a mano')` — una alerta que describe un problema distinto del que
ocurrió.

Consecuencia: el contralor cruza su estado de cuenta contra la cartera de
Likida y le sobra un cobro de $116,000 en el sistema. Es exactamente la cifra
que este producto promete no inventar. Y a diferencia de `/v1`, aquí no hay
`Idempotency-Key` ni llave natural que lo detenga.

Sin prueba: `facturacion_escritura_cableado.test.ts:54-115` cubre el veredicto
**secuencial** (rechazo, parcial, salda, otra flota, base caída); ninguna prueba
del repo ejecuta dos `registrarPago` solapados, y `facturacion_escritura.test.ts`
es todo función pura. `evaluarAbono` está probadísima y es justo la que la
carrera esquiva.

Causa raíz probable: la regla de dinero se validó en TypeScript sobre una foto
leída, y la 0049 no dejó ninguna llave natural (ni `(factura_id, referencia)` ni
un `Idempotency-Key`) que el segundo escritor pudiera chocar.

---

### [ALTO] El dueño que maneja pierde el despacho entero y nadie se lo dice: su «nuevo viaje para Juan Pérez» se lo contesta el agente del chofer

`src/lib/likida/processor.ts:872` (`incluirDespacho: !viajeId`) ·
`src/lib/likida/processor.ts:510-542` · `src/lib/likida/informes_wa.ts:49-55`
(`PATRONES`) · `src/lib/likida/processor_dueno_maneja.test.ts:142`

Es la otra mitad del CRÍTICO que sí se cerró, y llegó con el merge `673496f`.

Escenario, con valores. Javier es `flota_admin` **y** operador con el mismo
número `529993700779`. Trae su propio viaje `v1` abierto (el caso que
`contactos.ts` documenta como normal en flota chica). Escribe:

> «nuevo viaje para Juan Pérez, Puebla a Monterrey, anticipo 8000»

1. `processor.ts:825` resuelve `viajeId = 'v1'`.
2. `:872` entra a `atenderTextoOficina` con `incluirDespacho: false`, así que el
   bloque `:510-542` —despacho **y** asignación— se salta entero.
3. `pideInformePdf` no casa. `interpretarInforme` tampoco: sus cinco patrones
   están anclados con `^…$` (`informes_wa.ts:49-55`) y ninguno admite «nuevo
   viaje…». `incluirPreguntaLibre` también es `false`.
4. `atenderTextoOficina` devuelve `false` → el texto **sigue de largo** por el
   camino del chofer y lo acaba contestando el agente LLM con el contexto de
   `v1`.

Sale mal: el viaje de Juan Pérez con anticipo $8,000 **no se crea**, no hay
pendiente que confirmar, y el jefe recibe una respuesta sobre SU viaje. Lo mismo
con «asígnale la unidad 12 al viaje de Juan». El saludo de oficina
(`processor.ts:795-796`) le sigue prometiendo por escrito que «también puedes
despacharme viajes» y «asignar unidad o reasignar chofer».

La intención sí está decidida —el nombre de la prueba lo dice: «CON VIAJE
ABIERTO tampoco se despacha un “nuevo viaje…”: **primero cierra el suyo**»
(`processor_dueno_maneja.test.ts:142`)— pero esa frase no existe en el código:
la prueba solo afirma `expect(atenderDespachoOficina).not.toHaveBeenCalled()` y
no comprueba ni un mensaje de salida. Se detectó la condición y no se contestó.

Consecuencia: Juan Pérez nunca sale a carretera y el dueño —la persona que
compra el producto— cree que despachó. Es el mismo silencio que la ronda
anterior cobró en el otro sentido, movido de lugar por la resolución del merge:
`master` eligió «saltar despacho entero» y esa opción es más amplia que el
`reengancharPendiente` de la rama, pero se llevó también los casos legítimos.

Causa raíz probable: el desempate se implementó como un booleano que apaga el
reconocedor, no como una rama que responda; el reconocedor era el único que
sabía que ese texto era un despacho.

---

### [MEDIO] El Registro de Viajes v2 pagina con `range()` sobre un orden que empata, y un import de 100 viajes empata de verdad

`src/lib/likida/analytics.ts:1042-1071` (`getViajesRegistro`, orden
`fecha_inicio desc` + `created_at desc`, `.range(desde, desde + porPagina)`) ·
`src/lib/likida/importar_viajes.ts:410-435` (upsert de 100 filas por statement) ·
`supabase/migrations/0001_init.sql:54` (`created_at … default now()`) ·
`src/lib/likida/pg.ts` (la advertencia que este código no siguió)

Escenario, con valores. El PoC importa el export del TMS del prospecto: 200
viajes, en dos lotes de 100 (`importar_viajes.ts:410`). `now()` en Postgres es
**el reloj de la transacción**, no de la fila: los 100 viajes de un lote quedan
con `created_at` **idéntico al microsegundo**. De esos 200, unos 8-12 comparten
además `fecha_inicio` (un TMS mueve varios viajes por día). Ese grupo empata en
las DOS claves del `order`.

El contralor abre `/dashboard/registro`, ve la página 1 (100 filas) y pide la
página 2 (`range(100, 200)`). Entre las dos peticiones cualquier `update` sobre
un viaje del grupo empatado —y hay muchos: `intake_pendientes` se mueve con cada
foto, `avisado_en`, `avisos_enviados`, `estatus`— cambia su posición dentro del
empate. Resultado: **el viaje `TDB-0417` aparece dos veces (una en cada página)
y `TDB-0423` no aparece en ninguna**. Postgres no está fallando: un `LIMIT/OFFSET`
sobre un orden sin desempate único no promete nada, y `pg.ts` lo dice con todas
sus letras para otro caso.

Consecuencia: el Registro —la pantalla que el contralor cruza contra su ERP—
esconde un viaje entero y duplica otro, sin un solo aviso. En una sala, es la
pantalla que se abre para demostrar que «están todos».

Nota de honestidad: `GET /v1/viajes` tiene la misma raíz y **sí** la lleva
anotada (`src/app/api/v1/viajes/route.ts:87-96`: «`getViajes` ordena por
`created_at` SIN desempate único… ANOTADO, no se toca en esta entrega») — pero
la mitiga solo dentro de UNA petición: la página 2 es una consulta nueva, y
entre las dos el orden de los empates puede haber cambiado igual. En
`getViajesRegistro`, que es código de este delta (`c007312`), la anotación no
existe.

Sin prueba: `analytics_registro*.test.ts` cubre el filtro y la búsqueda, no dos
páginas consecutivas del mismo dataset con `created_at` repetido.

Causa raíz probable: se paginó por posición sobre columnas que no desempatan, en
la única tabla del repo que nace con `created_at` idéntico en lotes de 100.

---

### [BAJO] Un viaje creado entre dos consultas paralelas convierte `GET /v1/viajes` en un 500 `lectura_incompleta`

`src/app/api/v1/viajes/route.ts:97-115` · `src/lib/likida/analytics.ts:1001-1007`
(`getViajes`) y `:893-915` (`contarViajes`) · `src/app/api/v1/_comun.ts:88`
(`lectura_incompleta` → 500)

Escenario, con valores. Flota nueva con 30 viajes. El TMS pide
`GET /v1/viajes?limite=50` (o el default). `Promise.all` dispara `getViajes(50)`
y `contarViajes()` **sin snapshot común**. Si en esos milisegundos un chofer
cierra un viaje por WhatsApp y el despacho crea el siguiente, `getViajes`
devuelve 30 y `contarViajes` devuelve 31 → `todos.length (30) < pedidas (50)` y
`total (31) > todos.length (30)` → la ruta contesta **500** con
`codigo: 'lectura_incompleta'` y el mensaje «El servidor de datos recortó la
lectura».

Sale mal: el integrador recibe un 500 que le dice que su flota rebasó lo que una
lectura puede demostrar —con 30 viajes— y el propio texto del error le pide
«pedir un `desplazamiento` menor», que no arregla nada porque no había nada roto.
La condición que detecta el recorte silencioso de PostgREST no distingue «me
recortaron» de «alguien escribió mientras leía».

Consecuencia: ruido de 500 en el TMS del cliente y una alerta que apunta al
lugar equivocado. Baja frecuencia (ventana de una consulta), pero cada
ocurrencia es un error duro sobre una lectura correcta.

Causa raíz probable: la guarda compara dos cifras tomadas en dos instantes y
atribuye toda diferencia al servidor.

---

### [BAJO] Un borrador sin folio y sin UUID no tiene ninguna llave natural: se puede dar de alta dos veces

`src/lib/likida/facturacion_escritura.ts:117` (folio opcional), `:120-131`
(UUID opcional) y `:279-296` (el insert) ·
`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:65-70` (los dos
uniques son **parciales**: `where cfdi_uuid is not null` / `where folio is not null`)

Escenario, con valores. El contador registra la factura del mes a Transportes
del Bajío: subtotal $100,000, IVA $16,000, sin folio todavía y sin UUID (todavía
no la timbra el PAC). `validarFactura` la deja nacer en `borrador` con
`folio = null` y `cfdi_uuid = null`, así que **ninguno de los dos índices únicos
participa** (`NULLS DISTINCT`). Dos envíos —o el reintento tras un timeout del
server action— crean dos borradores de $116,000 con las mismas ligas de viajes.

Consecuencia: acotada a propósito. `clientes.ts:663` excluye los borradores del
saldo, así que la cartera no miente; lo que queda es
`facturacion_clientes.ts:325-330` contando `borradores: 2` y el segundo
`marcarEmitida` chocando contra `factura_cfdi_unico` cuando llegue el UUID. Es
confusión y recaptura, no una cifra mala — por eso BAJO y no ALTO, a diferencia
del pago.

Causa raíz probable: la protección durable se delegó a dos uniques parciales, y
el estado que el flujo recomienda («captúrala como borrador y séllala después»)
es exactamente el que deja las dos columnas en NULL.

---

### [BAJO] `reengancharPendiente` quedó sin un solo llamador: código defensivo que nadie ejecuta

`src/lib/likida/despacho_wa.ts:226-238,362` ·
`src/lib/likida/asignar_wa.ts:296-298,359` · `src/lib/likida/processor.ts:515-517,531-533`

Escenario: los dos módulos aceptan `opciones: { reengancharPendiente?: boolean }`
y lo consultan en su rama de re-pregunta (`if (opciones.reengancharPendiente ===
false) return null;`). Sus **únicos** llamadores, `processor.ts:515` y `:531`,
pasan tres argumentos: ni `ahora` ni `opciones`. `grep` sobre `src/` no devuelve
ninguna otra llamada. La bandera nunca vale `false`, así que la rama es
inalcanzable — es la secuela del merge `673496f`, que se quedó con la forma de
`master` (`incluirDespacho`) y dejó viva la de la rama.

Consecuencia: quien mantenga esto en tres meses lee un parámetro documentado con
su hallazgo («auditoría 18-c2, AGEN-C2-1») y su razonamiento, y va a creer que el
desempate vive ahí. El desempate vive en `processor.ts:872`. Dos mecanismos
declarados para la misma regla, uno muerto.

Causa raíz probable: la resolución del merge tomó el arreglo más amplio y no
retiró el más angosto.

## Lo que revisé y está bien

**Caminos de concurrencia, cada uno con su prueba nombrada o su ausencia
declarada:**

- **Claim del mensaje de WhatsApp** — `conv.ts:371-413`, `:421-432`, `:746-753`.
  El lease (`retomarClaimHuerfano`) distingue las tres situaciones que antes se
  aplastaban: huérfano vencido → `nuevo`; en vuelo → `en_curso`; completado →
  `duplicado`; y una relectura fallida **no inventa ninguna** de las dos.
  Cubierto por `conv_claim_lease.test.ts:61-107` (los cinco casos, más la
  aserción de que el lease es mayor que el `maxDuration`).
- **Resultado del turno → sello de la fila durable** — `processor.ts:614,644-682`.
  El `soltarClaim` con bandera (`:672-676`) es lo que permite distinguir
  «abandonado» de «terminado» sin un `finally` que no podría saber la diferencia.
  Cubierto por `processor_lock.test.ts:164-203` y, del lado de los dos
  llamadores, por `route_pospuesto.test.ts:66-92` y
  `wa-pendientes/route.test.ts:100,111,138`.
- **Claim de la bandeja durable** — `wa_pendientes.ts:97-108`: `update` anclado
  a `(id, intentos, procesado_en is null)`, con el intento **dentro** del claim,
  así que un proceso que revienta ya dejó contado su intento. Cubierto por
  `wa-pendientes/route.test.ts:138`. El upsert de ingreso (`:56-58`) usa
  `ignoreDuplicates` sobre la PK = wamid: la reentrega de Meta es un no-op, y el
  503 del webhook (`whatsapp/route.ts:198-213`) deja que la cola de Meta sea la
  cola durable cuando ni guardar se pudo.
- **Idempotencia de `/v1`** — `_escritura.ts:684-780`. Las tres capas están
  ordenadas de la barata a la que manda, y el árbitro real es el unique de la
  base: el `catch` de `crear()` (`:759-771`) relee y contesta la fila ganadora en
  vez de un 500. Verifiqué que `leerRecuerdoDurable` (`:464-496`) trate un error
  de lectura como «no hay recuerdo» **a propósito y solo aquí**, y que
  `guardarRecuerdoDurable` no lance nunca (el viaje ya se creó). Cubierto por
  `_escritura.test.ts`.
- **Mutex del viaje** — `processor.ts:2301-2311`: `acquireViajeLock` con
  `reloj.acotar(12_000)`, y el que pierde **avisa** y suelta el claim en vez de
  callarse. La re-verificación de `getOpenViaje` tras tomar el lock (`:2314`)
  cierra el doble «listo». Cubierto por `processor_lock.test.ts:116-160`.
- **Choque de escritores sobre `wa_conversacion.estado`** — descrito arriba en
  el hallazgo 3 de la tabla; las dos direcciones tienen prueba
  (`despacho_wa.test.ts:411,428`, `conv_error_disfrazado.test.ts:81`).
- **Interruptor ilegible ≠ apagado** — `cron/escalar/route.ts:54-62,87-95,115-121`,
  `cron/purgar/route.ts:80-92`, `cron/wa-pendientes/route.ts:79-90`,
  `cron/facturar/route.ts:285-296`. Los cuatro contestan 500 con
  `codigo: 'interruptor_ilegible'` y el nombre del interruptor, y el apagado a
  propósito sigue siendo 200 con `saltado`. Es la diferencia entre un cron rojo y
  cinco crons verdes que no corrieron.
- **Re-validación del lote en la cola de facturación** —
  `cron/facturar/cola/route.ts:87-93`: antes de procesar, relee los `gasto` con
  `is('cfdi_uuid', null)`, así que un reintento de QStash (`retries: 2`) no
  vuelve a volar un ticket que ya se facturó.
- **La puerta de `/v1`** — `_comun.ts:187-265`. El orden (tasa por IP → credencial
  → tasa por flota → área) es el correcto, la llave manda sobre la cookie, y
  `urlSinTenant` borra el `?tenant=` **antes** de `resolverTenantApi`, que es lo
  único que lo honraría para un superadmin. `areaDeLlaveAlcanza` (`:178-185`)
  falla cerrado ante un área desconocida.
- **`leerPagina`** — `_comun.ts:315-344`: un `limite=5000` se contesta 400 en vez
  de recortarse a 200 en silencio. Es el criterio correcto y es raro verlo.
- **`traducirFalla`** — `_escritura.ts:598-620`: reconoce por texto (frágil, y lo
  admite) pero su modo de falla es caer al 500 genérico, nunca dejar cruzar el
  mensaje de Postgres. `chocoContra` exige las dos señales (23505 + nombre de la
  restricción).
- **`escribir()` no recuerda los 409** (`_escritura.ts:741-748`): si alguien
  corrige la fila desde el panel, el siguiente POST idéntico deja de chocar. Es
  la decisión correcta y está razonada.
- **Errores por valor en el delta**: revisé los archivos nuevos/tocados que
  consultan la base (`wa_pendientes.ts`, `ingesta/tope.ts`, `correo/eventos/route.ts`,
  `facturacion_escritura.ts`, `worker/bus/[accion]/route.ts`) buscando `data` sin
  su `error`. **No encontré ninguno.**

## Lo que NO alcancé a revisar

- `procesarLoteEnCola` completo (`cron/facturar/route.ts:400-560`): leí el corte
  por `MARGEN_LOTE_MS` y la re-validación, no el reparto de un mismo UUID sobre N
  gastos con `cfdi_orden` ni `anotarBloqueo`. Es justo el otro lado del hallazgo
  de duplicados que sí se cerró.
- `src/app/api/export/*` (cuatro rutas): las dejé al auditor de seguridad porque
  su hallazgo vivo es de IDOR; no revisé su manejo de errores ni sus topes.
- `src/lib/likida/repo.ts` entero (la frontera única pretendida): solo miré el
  `select` de `cfdi_orden` que el hallazgo 8 necesitaba.
- `adaptadores/pagina_playwright.ts` (~840 líneas): sigue sin revisar sus topes
  de tiempo y su manejo de pestañas, igual que en la pasada anterior.
- No ejecuté ninguno de los dos hallazgos nuevos contra una base real (aquí no
  hay). El de `registrarPago` se sostiene en que la tabla no tiene unique
  —verificado en la 0049— y en que las dos lecturas preceden a la escritura;
  el del despacho, en que los cinco patrones de `informes_wa.ts` están anclados
  con `^…$` y ningún otro reconocedor reclama ese texto.
