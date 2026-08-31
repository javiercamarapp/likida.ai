# Rendimiento y costo — auditoría 23

**Nota: 6/10** (antes 6). Razón del movimiento: **mirada más profunda — la nota
anterior estaba mal fundada, en las dos direcciones, y se compensan.**

La 22 escribió que `traerTodo()` «tenía UN SOLO llamador en todo el repo» y que
barrer las consultas restantes era «el trabajo de más valor por hora que tiene
este repo hoy». **Eso es falso y se verifica en un comando:** hay **89 sitios de
llamada de `traerTodo`** y **17 de `traerPorIds`** en `src/` (excluyendo pruebas
y `pg.ts`). El barrido que la 22 dejó propuesto **ya estaba hecho**, y de las 147
consultas `.select()` sin `range`/`limit`/`single` que quedan, casi todas están
acotadas de verdad — por `head:true`, por alcance a un viaje/padre, o por un
tope declarado en pantalla. Esa parte de la nota 6 era pesimismo no ganado.

En la otra dirección: **el arreglo de REN-1 de ayer introdujo un modo de falla
nuevo en el mismo PDF firmado que vino a curar**, y lo hizo violando el contrato
escrito del propio `traerTodo` («LA CONSULTA TIENE QUE VENIR ORDENADA POR ALGO
ÚNICO … todos los llamadores desempatan con `id`» — `pg.ts:126-131`, afirmación
que hoy es falsa en 19 sitios). El trinquete que el repo ya tiene para esta
clase (`limite_con_orden.test.ts`) **no la ve**, porque su regex es
`/\.limit\s*\(/g` (`src/lib/pruebas/consultas.ts:144`) y estos sitios paginan
con `.range(`.

**Riesgo mayor hoy:** el cursor de paginación (`.range()`) no tiene trinquete ni
contrato exigible, así que una lectura que se demuestra completa con `count`
puede estar duplicando y saltando filas — y a diferencia de un recorte a 1,000,
esta sale con una cifra que *parece* verificada.

## El barrido de `traerTodo()`

Dos barridos, porque la 22 solo pidió el primero y el primero ya estaba hecho.

### A · `.select()` sin `traerTodo` / `.range()` / `.limit()` que pueda pasar de 1,000 filas

Barrido mecánico sobre `src/` (147 candidatos), leídos uno por uno. Solo
sobreviven estos:

| archivo:línea | tabla | ¿puede pasar de 1,000? | ¿imprime cifra que el contralor ve? | qué usa |
|---|---|---|---|---|
| `cuadre/desde_db.ts:190` | `cfdi_consolidado_linea` | **sí** — 100 unidades × 2 cargas/día × ventana de 7 días ≈ 1,400 líneas; y la ventana la fijan las fechas del OCR, un `2019-05-03` mal leído la abre a 7 años | no — degrada a `{tipo:'ninguna'}` en silencio | **nada** — REINCIDENTE de la 22 |
| `admin/bitacora.ts:54` | `bitacora_auditoria` | sí | no — la pantalla declara «los últimos N» | nada, **declarado** en :45 |
| `jornada/repo.ts:188` | `jornada_asiento` | no — `.eq('jornada_id')`, y `jornada_asiento_marca_unica` limita a 4 tipos | — | alcance de un expediente |
| `analytics.ts:1047` | `liquidacion` | no — `.in()` acotado por `TOPE_PAGINA=100` en `viajes_registro.ts:32` | — | invariante en otro archivo (BAJO de la 22, sigue) |
| `asistencia_coordinacion.ts:541` | `incidencia` | no — `.in()` sobre un padre acotado | — | acotado por el padre |
| `sat_descarga/bandeja.ts:333` | `gasto` | no — `MAX_CANDIDATOS_VIVOS = 300` con `warn` | — | acotado y declarado |
| `mantenimiento.ts:267` (vía `traerTodo`) | `mantenimiento` | **sí y sin fecha** — ver hallazgo MEDIO abajo | indirecto (propuestas de servicio) | `traerTodo`, pero sin tope temporal |

Todo lo demás de los 147 resultó ser una de tres: `count:'exact', head:true`
(cero filas cruzan la red y `count == null` se trata como fallo, no como 0),
alcance a **un** viaje/factura/ticket, o `.limit()` **con** `.order()` y rótulo
honesto. Ejemplos que abrí y descarté: `analytics.ts:910/981/1438/1477`,
`repo.ts:943`, `tools.ts:105`, `consulta_chofer.ts:161`, `fiscal.ts:1359-1360`,
`clientes.ts:722`, `facturacion/pendientes.ts:215`, `agentes/cola.ts:527/653`,
`runner.ts:578`, `saas/suscripcion.ts:210-212`, `escalar_viaje.ts:96`,
`export/liquidaciones/route.ts:99` (cursor por fila, no por OFFSET),
`agentes/exito.ts:676` (tope + bandera `[INCOMPLETO]` en el propio texto).

**Conclusión del barrido A: está hecho.** Queda un reincidente
(`cuadre/desde_db.ts:190`) y el caso de `mantenimiento`.

### B · `traerTodo` con `.range()` SIN desempate total (el barrido que faltaba)

Los 89 llamadores, verificados por el orden que le pasan al cursor. **19 no
terminan en un desempate único.** Cinco son seguros por una unicidad demostrable
en el esquema; los otros catorce, no:

| archivo:línea | orden que pasa al cursor | ¿único? | ¿puede pasar de 1,000? | ¿cifra que el contralor ve? |
|---|---|---|---|---|
| `oficina_wa.ts:93` | **ninguno** | **NO** | **sí** (viajes `abierto\|en_cuadre` de la flota) | **sí — «Anticipos en la calle» y «Viajes sin liquidar» en el PDF firmado** |
| `jornada/repo.ts:339` | `momento` asc | **NO** (timestamptz) | sí (900 expedientes × 4 marcas ≈ 3,600) | sí — el registro LFT 132-XXXIV |
| `mantenimiento.ts:267` | `cerrada_en` desc | **NO** | **sí y crece sin techo** (sin filtro de fecha) | indirecto (propuestas de servicio) |
| `mantenimiento.ts:258` | `abierta_en` desc | **NO** | improbable (órdenes abiertas) | sí (taller) |
| `mantenimiento.ts:252` | `nombre` | **NO** (rutinas homónimas) | no (catálogo) | no |
| `mesa_control.ts:80` | `abierta_en` asc | **NO** | improbable (incidencias vivas) | no |
| `mesa_control.ts:108` | `created_at` asc | **NO** — `now()` es igual dentro de una transacción | improbable | no |
| `asistencia_escalamiento.ts:173` | `abierta_en` asc | **NO** | improbable, y es **cross-tenant** (sin `.eq('tenant_id')`) | no (cron) |
| `cotizador/lector.ts:265` | `nombre` | **NO** (clientes homónimos) | no (catálogo) | no |
| `comercial.ts:492` | `proveedor` | **NO** | no (2-3 filas) | no |
| `libro_viaje.ts:607` | `factura_id` | **NO** | no (`.eq('viaje_id')`) | no |
| `libro_viaje.ts:648` | `factura_id` | **NO** | no (`.in()` de las facturas de 1 viaje) | no |
| `libro_viaje.ts:656` | `factura_id, viaje_id` | sí de hecho | no | no |
| `operacion.ts:162` | `numero_economico` | **sí** — `unidad_economico_unico (tenant_id, numero_economico)`, mig. 0047 | — | — |
| `mantenimiento.ts:246` | `numero_economico` | **sí** — misma constraint | — | — |
| `onboarding.ts:53` | `tenant_id, agente` | **sí** — es la PK, y **está comentado** (:52) | — | — |
| `relojes_legales.ts:454` | `tenant_id, objeto_id, documento, umbral, vence` | **sí** de hecho (`objeto_id` es UUID) | — | — |
| `peajes/evidencia_gps.ts:166` | `unidad_id, dia` | **sí** — sale de un `group by` | — | — |
| `prospectos-mapa.ts:408` | (delega en `traerTodo`) | n/a | — | — |

Y un barrido gemelo que sale del mismo análisis: **29 de los 89 `traerTodo` no
envuelven su página en `acotada()`**, así que cada página hereda el default de
undici (300 s) dentro de funciones de 60-120 s. Los dos que importan porque
corren en el webhook de WhatsApp o detrás de una pantalla del cliente:
`oficina_wa.ts:93` y `jornada/repo.ts:339`. Los 27 restantes viven en `/admin` y
en crons de 300 s.

## Hallazgos

### [CRÍTICO] El arreglo de REN-1 pagina el PDF del jefe **sin ningún `ORDER BY`**, y `count` le firma la lectura como completa
`src/lib/likida/oficina_wa.ts:93-99` (el `.range(desde,hasta)` de :97 sin un solo `.order()`)

`traerTodo` documenta su propia precondición en `pg.ts:126-131`: «LA CONSULTA
TIENE QUE VENIR ORDENADA POR ALGO ÚNICO. El cursor es un `range` por posición:
con un `order` que empate, dos páginas pueden repetir una fila y saltarse otra.
Todos los llamadores desempatan con `id`». Este llamador no pasa **ninguna**
columna de orden. Un `LIMIT/OFFSET` sobre un conjunto sin `ORDER BY` no tiene
orden definido entre dos sentencias.

**Escenario, con números.** Flota con **1,500** viajes en `abierto|en_cuadre`,
anticipos que suman **$7,140,000**. El jefe pide «mándame el informe».
Página 1: `range(0,999)` devuelve 1,000 filas y `count = 1500`. Entre la página 1
y la página 2 —0.3-9.5 s después— el processor de WhatsApp escribe **un** viaje
(cambia `estatus` a `liquidado` al cerrar la liquidación de otro chofer, o
inserta uno nuevo): en un bitmap heap scan la fila actualizada se mueve de página
física y el orden implícito cambia. Página 2: `range(1000,1499)` devuelve 500
filas que ya no son las 500 que faltaban — una fila viene repetida y otra no
viene nunca. `filas.length = 1500 >= esperadas = 1500` → `traerTodo` **devuelve
y declara la lectura completa** (`pg.ts:212`). El PDF imprime «Anticipos en la
calle **$7,187,000**» (un anticipo de $97,000 contado dos veces, otro de
$50,000 ausente) y «Viajes sin liquidar: 1,500».

Es **peor** que el bug que vino a curar: el 1,000 redondo del recorte era un
número sospechoso; esto es un número plausible con una prueba de completitud
adjunta, y la rama honesta de :109-112 («no se pudieron leer completos») nunca
dispara.

**Consecuencia:** el contralor cruza el PDF firmado contra su contabilidad, no
cuadra por $47,000, y no hay nada en el documento ni en el log que diga qué pasó.
Rompe la regla que define al producto en el artefacto que el producto entrega.

**Causa raíz probable:** el arreglo copió el `traerTodo` + `count` del gemelo
`informes_wa.ts:76` pero no su `.order('id')`, y el trinquete que atrapa
exactamente esta clase (`limite_con_orden.test.ts`) solo escanea `.limit(`
(`src/lib/pruebas/consultas.ts:144`), no `.range(`.

(REINCIDENTE de forma: es el mismo `archivo:línea` que la 22 marcó CRÍTICO, con
la causa desplazada del recorte al cursor.)

### [ALTO] La misma lectura del PDF corre **sin techo de consulta** dentro del webhook de 120 s
`src/lib/likida/oficina_wa.ts:93-99` · `src/lib/likida/oficina_wa.ts:180`

La 22 anotó textualmente que la consulta original «ni siquiera [estaba] dentro de
`acotada()`». El arreglo añadió `traerTodo` y **no** añadió `acotada()`. Tampoco
lo tiene el `select tenant.nombre` de :180, ni el de :68 del mismo archivo.

`presupuesto.ts:52-72` explica por qué eso es el peor final que tiene el
producto: sin `abortSignal`, un socket que acepta y calla se bloquea los 300 s de
undici, «180 s DESPUÉS de que Vercel mató la función», y como Meta ya recibió su
200 no reintenta, y el `logger.error` tampoco se escribe porque el proceso muere
antes del `catch`.

**Escenario:** flota con 1,500 viajes abiertos ⇒ el `traerTodo` hace 2 páginas.
Cada una puede bloquear 300 s. Peor caso del eslabón: **600 s contra
`maxDuration = 120`**. Con 5,000 viajes son 5 páginas ⇒ 1,500 s. Contra esto,
todos los pasos que `PASOS_CIERRE` sí contabiliza tienen techo de 9.5 s.

**Consecuencia:** el jefe pide su informe y no recibe nada — ni PDF, ni el
mensaje de error que :110 tiene escrito, ni una línea de log.

**Causa raíz probable:** `acotada()` se aplica por convención de quien escribe la
consulta; nada la exige, y `traerTodo` no la impone desde dentro.

### [ALTO] La rama de oficina corre **fuera del reloj de la invocación**: 139.5 s de peor caso contra `maxDuration = 120`
`src/lib/likida/processor.ts:1144` y `:1380` (llaman `atenderTextoOficina` sin el `reloj`) · `src/lib/likida/oficina_wa.ts:208` (`timeoutMs: 35_000` fijo)

`processor.ts:935-962` crea `crearPresupuesto(PRESUPUESTO_WEBHOOK_MS, …)` en la
primera línea, precisamente porque «20 s de barrera + 12 s de mutex + 40 s de
agente = 72 s contra un presupuesto de 60». El camino del **chofer** lo respeta:
pide `min(40_000, restante())` y tiene su `agente.sin_presupuesto`
(`processor.ts:3348-3361`). El camino del **jefe** no recibe el reloj en ningún
punto: ni `atenderTextoOficina`, ni `mandarInformePdf`, ni `atenderPreguntaLibre`.

**La suma, eslabón por eslabón.** La única compuerta es
`reloj.alcanza(COSTO_MINIMO_TURNO_MS)` con `COSTO_MINIMO_TURNO_MS = 15_000`
(`processor.ts:813`), o sea que se puede entrar con
`120,000 − MARGEN_CIERRE_MS (39,000) − 15,000 = **66,000 ms ya gastados**` —
alcanzable con una ráfaga de 11 fotos en el pool de 5 (`webhook/route.ts:68`),
que Meta entrega en el mismo POST junto al texto del jefe.

| eslabón | dónde | nominal | techo real |
|---|---|---|---|
| gastado al pasar la compuerta | `processor.ts:949` | — | **66.0 s** |
| `select tenant.nombre` (sin `acotada`) | `oficina_wa.ts:180` | 0.3 s | 9.5 s (300 s si se cuelga) |
| `gastoChatHoyUsd` (`traerTodo`) | `api/dashboard/chat/tope.ts:32` | 0.3 s | 9.5 s |
| `ejecutarAnalista` — tope FIJO | `oficina_wa.ts:208` | — | **35.0 s** |
| `registrarCosto` por modelo | `oficina_wa.ts:212` | 0.3 s | 9.5 s |
| `sendText` de la respuesta | `processor.ts:730` | 1.5 s | 10.0 s |
| **total** | | **103.4 s** | **139.5 s** |

**139.5 s contra `maxDuration = 120`.** No hace falta el peor caso: con
**dos** de las cuatro consultas en su tope (9.5 s) la suma es 121.8 s y ya no
cabe. El PDF es peor: `mandarInformePdf` suma 9 viajes de red después de la
misma compuerta de 66 s (143 s con techos sanos).

**Consecuencia:** el jefe pregunta «¿cuánto llevo de diésel este mes?» y no
recibe nada. Meta ya tiene su 200, no reintenta; el proceso muere antes del
`catch` de :226, así que tampoco hay `logger.error`. Desde su lado, preguntó y
el sistema no existió. Es el modo de falla exacto que `presupuesto.ts` se
escribió para eliminar, dejado abierto en la rama del comprador.

**Causa raíz probable:** el reloj se cableó al camino del chofer (el que paga) y
la rama de oficina se agregó después, con topes literales en vez del presupuesto
compartido.

### [ALTO] El turno del jefe que truena por timeout **no registra un centavo**, justo el modo de falla que más gasta
`src/lib/likida/oficina_wa.ts:226-228`

La 22 cerró REN-A1 copiando del gemelo (`api/dashboard/chat/route.ts`) el tope
diario y el registro del camino feliz. **No copió la rama del error.** El gemelo
tiene, desde la auditoría 3 (TC-A1), un bloque explícito para
`PartialExecutionError` con el comentario «el turno que truena YA PAGÓ hasta 9
completions … tirarlo dejaba al tope diario de $1/tenant ciego exactamente al
modo de falla que más gasta» (`chat/route.ts:126-141`). Aquí el `catch (e)` de
:226 loguea y devuelve `null`.

**Escenario, con números.** `ejecutarAnalista` corre hasta **5 rondas** de
`generateWithTools` más el ciclo correctivo de **4** (`analista.ts:365-370` y
`:415-419`) = hasta **9 completions**, y acumula lo pagado en el error
(`analista.ts:437-441` suma explícitamente el primer ciclo al segundo). El
canal de WhatsApp le da **35 s** (`oficina_wa.ts:208`) contra los **40 s** del
panel (`analista.ts:361`), o sea que **truena antes y más seguido**. A ~$0.005
por análisis (`api/dashboard/chat/tope.ts:17`), un jefe que repregunta 20 veces
porque «no me contestó» gasta ~$0.10 con **$0.00 registrados** en `llm_costo`,
y el freno de `gastoChatHoyUsd` —que se lee al entrar, :195— sigue leyendo cero
en cada reintento.

**Consecuencia:** el costo por liquidación (la cifra con la que se fija el
precio, cabecera de `costos.ts`) subcuenta justo en el canal que el producto
empuja como principal, y el tope diario del tenant es inaplicable contra el
bucle más caro que existe.

**Causa raíz probable:** el arreglo replicó el contrato del camino feliz y no el
del error; nada ata los dos consumidores de `ejecutarAnalista` al mismo contrato.

### [MEDIO] El chat del panel: 87.5 s de peor caso contra `maxDuration = 60`, y el analista no mira el reloj de la ruta
`src/app/api/dashboard/chat/route.ts:29` (`maxDuration = 60`) · `:96` (llama sin `timeoutMs` ni `signal`) · `src/lib/agents/analista.ts:361`

La ruta no le pasa `timeoutMs` ni `signal`, así que el analista usa su default de
**40,000 ms** — decidido por él, no por el presupuesto de la ruta.

| eslabón | dónde | nominal | techo |
|---|---|---|---|
| sesión + `tenantEfectivoChat` (2 consultas) | `:40`, `:49` | 0.6 s | 19.0 s |
| `gastoChatHoyUsd` (`traerTodo`) | `:71` | 0.3 s | 9.5 s |
| `ejecutarAnalista` (tope propio) | `:96` | — | **40.0 s** |
| `registrarCosto` por modelo | `:104` | 0.3 s | 9.5 s |
| `guardarIntercambio` | `:113` | 0.3 s | 9.5 s |
| **total** | | **41.5 s** | **87.5 s** |

**87.5 s contra 60.** El analista solo tiene que agotar el tope que le dieron
(40 s) y que **dos** de las cuatro consultas toquen `TOPE_CONSULTA_MS`: 59.9 s,
al filo, sin contar el `await req.json()`. El contralor ve el stream NDJSON
cortarse a media secuencia de pasos, sin evento `{t:'error'}`, porque el proceso
muere dentro del `try`.

**Causa raíz probable:** el tope del agente es una constante del agente en vez de
un `min(tope, loQueQueda)` como en el camino del chofer.

### [MEDIO] REINCIDENTE — El analista corre en el carril `fondo` contra lo que el propio contrato del presupuesto declara
`src/lib/agents/analista.ts:327`

Sin cambios desde la 22: `createLlmBudget(opts.tenantId, runId, 'fondo')`,
mientras `budget.ts:13-15` define `interactivo` como «hay una persona esperando
AHORA: … **los chats del dashboard** y las subidas manuales», y los dos únicos
llamadores son el contralor frente a la pantalla (`chat/route.ts:96`) y el dueño
esperando en WhatsApp (`oficina_wa.ts:203`). Con los defaults ($5.00/día,
reserva interactiva 40 % = $2.00, `budget.ts:119` y :110-113), el chat se frena
a los **$3.00** y deja $2.00 del techo inalcanzables, con el mensaje literal
«presupuesto de IA de fondo agotado por hoy … el chofer no se queda sin servicio
por un lote de fondo» (`budget.ts:35-37`) — dicho al comprador del producto.

### [MEDIO] REINCIDENTE — `lineasEccParaCuadre` sigue sin paginar en el camino caliente del webhook
`src/lib/likida/cuadre/desde_db.ts:190`

Sin cambios desde la 22. `.select('fecha, monto, estacion_rfc')` sobre
`cfdi_consolidado_linea` con la ventana `[min(fecha)−1, max(fecha)+1]` de los
gastos del viaje: sin `range`, sin `limit`, sin `count`. 100 unidades cargando
dos veces al día = ~200 líneas ECC/día; un viaje de 5 días abre una ventana de 7
⇒ ~1,400 líneas ⇒ llegan 1,000 y calla. Y la ventana la fijan las fechas
**leídas por el OCR**: un ticket con `2019-05-03` la abre a siete años y se lleva
las 1,000 líneas más viejas del tenant. Degrada a `{tipo:'ninguna'}` (que por
diseño significa «no lo sabemos», así que no hay cifra falsa) **sin log ni
bandera**: el ticket de monedero se queda sin la nota de la RMF 3.3.1.7 y nadie
se entera.

### [MEDIO] REINCIDENTE — La foto va al modelo de visión sin redimensionar, con `sharp` redimensionando la misma imagen tres líneas antes
`src/lib/likida/intake/ocr.ts:401` · `src/lib/likida/intake/cfdi.ts:249`

Sin cambios desde la 22. `images: [principal]` pasa el data-URL íntegro
(`MAX_IMAGEN_WHATSAPP_BYTES = 6 MB`), mientras `decodeCodigosFromImage` —llamada
en :393, ocho líneas antes, sobre la misma imagen— ya la reduce a 1,600 px con
`sharp` porque «por encima de 1,600 px no encuentra nada que no encuentre» esa
escala. 6 MB ⇒ ~8 MB de base64 materializados dos veces y subidos a OpenRouter
en cada OCR; una ráfaga de 11 fotos con el pool de 5 mueve ~88 MB de subida
dentro de una invocación de 120 s. Y del lado del costo la reserva usa una
tarifa plana (`TOKENS_POR_IMAGEN = 4_000`, `openrouter.ts:495`), así que **no
hay un solo número en el repo que relacione tokens de entrada del OCR con el
tamaño de la foto** — la palanca de costo del camino que más se ejecuta está sin
instrumentar.

### [MEDIO] `getTaller` pagina el historial completo de mantenimiento cerrado de la flota, sin filtro de fecha, en cada carga de la pantalla
`src/lib/likida/mantenimiento.ts:267-272`

`.eq('tenant_id').eq('estado','cerrada').not('rutina_id','is',null)` — **sin
filtro de fecha**, ordenado por `cerrada_en` desc y paginado con `traerTodo`. Lo
único que se necesita de esas filas es el último servicio por (rutina, unidad)
(`ultimos` → `rutinasVencidas`, :293-322): un `max()` agrupado.

**Escenario:** flota de 300 unidades × 8 rutinas × 12 servicios/año = **28,800
filas al año**. Año 1 ⇒ **29 páginas secuenciales** en el camino crítico de
`/dashboard/unidades` (que no declara `maxDuration`); a 0.3 s/página son 8.7 s
solo en esa consulta, y a `TOPE_CONSULTA_MS` son 275 s. Crece linealmente para
siempre: el año 4 son 116 páginas, y hacia el año 4 se acerca al techo de
`MAX_PAGINAS` (100,000 filas) donde `traerTodo` **lanza** y la pantalla deja de
cargar por completo.

**Consecuencia:** la pantalla que avisa del mantenimiento vencido se degrada de
forma monótona con la antigüedad del cliente, y el día que cruce las 100,000
filas se apaga sin previo aviso.

**Causa raíz probable:** el patrón «traer las filas para reducirlas en JS» que
`comercial.ts:500-506` y `costos.ts:262-278` ya retiraron de otras pantallas,
todavía vivo aquí.

### [BAJO] `piloto_vision` mina un `runId` nuevo por paso: el techo por corrida no aplica al camino más caro del repo
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:494`

`budget: op.tenantId ? createLlmBudget(op.tenantId, randomUUID(), 'ocr_lote') : undefined`
está dentro de `decidir()`, que el bucle de `:231` llama una vez por cada uno de
los `PASOS_MAXIMOS = 14`. Consecuencias medibles:

1. `maxRunUsd` (default **$0.50**, `budget.ts:151`) nunca se alcanza: cada paso
   estrena su propia ventana. Con Sonnet 5 a $2/$10 (`models.ts:140`) y la cota
   conservadora de `cotaEntradaEnTokens` (~16,000 «tokens» por paso: el JSON del
   mensaje en caracteres + 4,000 por imagen), la reserva por paso es ~$0.032 y
   los 14 pasos suman ~$0.45 — el techo dispararía alrededor del paso 15-16 y
   **no puede** hacerlo nunca.
2. `budget.reservadoRunUsd` (el chequeo en memoria de `budget.ts:161`, el único
   que no cuesta un viaje a la base) se reinicia en 0 en cada paso: está muerto.
3. El `runId` es la llave de correlación del gasto, así que las 14 completions de
   **una** sesión de portal quedan como 14 corridas sin relación. **No se puede
   calcular el costo por ticket facturado desde el ledger** — y ése es
   justamente el eje 4 de `salud-del-repo`.

Y `op.tenantId` ausente ⇒ `budget: undefined` ⇒ sin techo de ninguna clase.

### [BAJO] El trinquete de `.limit()` sin orden no cubre `.range()`, que es donde el mismo bug es peor
`src/lib/pruebas/consultas.ts:144` (`const re = /\.limit\s*\(/g`)

`limite_con_orden.test.ts` es buen código y su comentario dice la regla exacta
que hoy se viola: «lo que hace determinista un corte es un DESEMPATE TOTAL, y el
único que siempre existe es la llave: `.order('id')` como último criterio».
Cubre 213 sitios de `.limit(` con baseline congelado en
`ci/limite-sin-orden-baseline.json`. **No mira un solo `.range(`**, que es la
forma que usan los 89 `traerTodo`. Un `.limit()` sin orden devuelve una rebanada
arbitraria (visible); un `.range()` sin orden devuelve un **total** con filas
duplicadas y saltadas y una prueba de completitud adjunta (invisible). El bug
menos grave tiene red; el más grave no.

## Sumas del peor caso

| cadena | eslabones | nominal | peor caso | `maxDuration` | ¿cabe? |
|---|---|---|---|---|---|
| **Webhook, chofer** (el que paga) | lock ≤12 s + intake 20 s + agente 40 s + `MARGEN_CIERRE_MS` 39.0 s | — | **111.0 s** | 120 | **sí**, 9 s de holgura |
| **Cierre absoluto** (`TECHO_CIERRE_MS`) | 18 pasos, cada uno a su techo (5 envíos × 10 s + 13 consultas × 9.5 s) | 14.0 s | **173.5 s** | 120 | **no** — declarado y probado; por eso existe `margenDuro()` |
| **Webhook, pregunta libre del jefe** | 66.0 s de compuerta + 9.5 + 9.5 + **35.0 fijos** + 9.5 + 10.0 | 103.4 s | **139.5 s** | 120 | **NO** — ALTO arriba |
| **Webhook, informe PDF** | 66.0 s + tablero 9.5 + tenant 9.5 + N páginas × 9.5 + upload 9.5 + firma 9.5 + doc 10 + acuse 10 | 73.1 s | **143.0 s** (N=2) | 120 | **NO** |
| **Webhook, informe PDF, página colgada** | mismo, con `traerTodo` sin `acotada` | — | **600 s** (2 páginas × 300 s de undici) | 120 | **NO** — ALTO arriba |
| **`/api/dashboard/chat`** | 19.0 + 9.5 + **40.0** + 9.5 + 9.5 | 41.5 s | **87.5 s** | 60 | **NO** — MEDIO arriba |
| **`/dashboard/unidades` (taller)** | 4 `traerTodo` en paralelo; el de `mantenimiento` cerrado crece sin techo | 8.7 s (año 1, 300 unidades) | 275 s | sin declarar | **NO** a plazo |
| **Cron `jornada`** | `venceEn = min(45 s, (60−10) s)` y corte antes de tomar trabajo nuevo | — | 50 s | 60 | **sí** |
| **Cron `facturar` / `runner` / `gps`** | `venceEn = maxDuration − margen`, corte declarado en la respuesta | — | ≤ 290 s | 300 | **sí** |

Aritmética sobre los costos unitarios que el repo declara
(`presupuesto.ts:35-37`: 0.3 s consulta, 1.5 s `sendText`, 2.5 s `sendDocument`,
0.5 s URL firmada; `TECHO_PASO_CONSULTA_MS = 9.5 s`, `TECHO_ENVIO_WHATSAPP_MS =
10 s`). Verifiqué las constantes corriendo `npx vitest run
src/lib/likida/presupuesto.test.ts` (22 pruebas, verde): `COSTO_CIERRE_MS =
14,000`, `MARGEN_CIERRE_MS = 39,000`, `MARGEN_CIERRE_CRITICO_MS = 29,500`,
`TECHO_CIERRE_MS = 173,500`.

## Lo que revisé y está bien

- **`pg.ts` sigue siendo el mejor código del rubro.** `traerTodo` avanza por
  filas leídas y no por número de página (`pg.ts:191`), usa el `count` gratis de
  la primera página como prueba, distingue «página vacía sin `count`» de
  «`count` conocido y faltan filas» (`:214-221`) y **lanza** en vez de devolver
  una cifra parcial. `traerPorIds` parte en tandas de 200 con 5 en vuelo,
  acotando el recorte y el largo de la URL a la vez.
- **La adopción de `traerTodo` es real y masiva:** 89 sitios de llamada, 17 de
  `traerPorIds`, y 61 de los 89 dentro de `acotada()`. La afirmación de la 22 de
  que tenía «un solo llamador» era falsa.
- **REN-1 y REN-2 aguantan en su eje original.** `oficina_wa.ts:93` y
  `jornada/repo.ts:339` ya paginan con `count` y traducen `LecturaIncompleta` a
  un mensaje honesto (`oficina_wa.ts:109-112`, `jornada/repo.ts:347-349`). Lo
  que fallan es el eje nuevo (orden del cursor, techo de consulta).
- **REN-A2 es un arreglo correcto, no un desplazamiento del problema.**
  `derivar.ts:133-141` ordena descendente: la cabeza de la lista avanza entre
  corridas (~14 pares nuevos/hora de frontera) en vez de re-hacer el mismo
  prefijo. El residuo honesto —si las altas superan al rendimiento, los días más
  viejos salen de la ventana de 3 días— sigue reportado por `cortadosPorReloj`.
- **REN-A1 (paralelizar el GPS) está hecho:** `derivar.ts:230-232`,
  `Promise.all` de `primera`/`ultima`, cada una con `.limit(1).maybeSingle()`.
- **`presupuesto.ts` como reloj compartido y `acotada()` en dos capas**
  (abortSignal + carrera contra temporizador) que traduce el agotamiento al
  mismo `{data:null,error}` que un fallo de Postgres, sin cambiar la semántica de
  ningún llamador.
- **Ledger de presupuesto de modelo.** Reserva ANTES de tocar la red con una cota
  conservadora, liquida al `usage.cost` real, conserva la reserva cuando falta
  `usage` (`openrouter.ts:392-397`), y deja la fila en `reservado` ante error de
  red para que la 0193 la expire.
- **Ciclo de tools:** `maxRetries: 0` en el SDK (`openrouter.ts:48`),
  `TIMEOUT_LLM_MS = 30_000`, caché entre rondas, corte del loop-guard antes de
  pagar la última ronda, salida en cuanto corre la tool terminal.
- **El pool del webhook** (`MAX_EN_PARALELO = 5`, `webhook/route.ts:68`)
  dimensionado contra el bloqueo síncrono medido de zxing-wasm, y el presupuesto
  por invocación y no por mensaje.
- **La disciplina de `head:true` + «`count == null` es fallo, no cero»** está
  aplicada de forma consistente y con la excepción escrita: `capacidad.ts:62-64`,
  `negocio.ts:906-916`, `clientes.ts:721-728`, `exito.ts:283-289`,
  `facturacion_escritura.ts:646`, `suscripcion.ts:210`.
- **Topes declarados en pantalla, no ocultos:** `exito.ts:655` imprime
  `[INCOMPLETO]` cuando el mes rebasa `TOPE_LIQUIDACIONES_MES` y dice que el
  conteo sí es exacto porque va en base; `bandeja.ts:455-457` exige `.order()`
  junto a cada `.limit()` con la razón escrita.
- **El cursor del export de liquidaciones** (`export/liquidaciones/route.ts:98-113`)
  es por fila `(created_at, id)` y no por OFFSET, con la segunda rama del `or`
  para el empate de microsegundo — es el modelo a seguir para el barrido B.

## Lo que NO alcancé a revisar

- **Medir de verdad.** Todo lo de arriba es aritmética sobre los costos
  unitarios que el repo declara. No corrí nada contra Supabase ni OpenRouter; la
  latencia real Vercel↔Supabase sigue sin medir y `TOPE_CONSULTA_MS:66-76` lo
  admite por escrito.
- **La probabilidad real del CRÍTICO.** Que un `LIMIT/OFFSET` sin `ORDER BY`
  devuelva órdenes distintos entre dos páginas depende del plan que elija
  Postgres (index scan sobre `idx_viaje_tenant` es estable; bitmap heap scan con
  una actualización concurrente no lo es) y de `synchronize_seqscans`. No pude
  correr un `EXPLAIN` con la base en cero. El defecto de contrato es
  verificable; su frecuencia, no.
- **`EXPLAIN` de las consultas calientes.** Verifiqué que exista un índice con
  el prefijo correcto, no que el planeador lo use ni el costo de los `order` de
  dos columnas sobre tablas grandes.
- **El costo por liquidación de punta a punta.** No hay una corrida real que sume
  OCR + cuadre + WhatsApp contra el rango declarado ($0.03-0.05,
  `models.ts:17`); con la base en cero no hay filas de `llm_costo` que cruzar.
- **Los 54 agentes del back office.** Revisé el carril y el ledger que comparten,
  no el prompt de cada `agentes/*.ts`. Ahí es donde más fácil se esconde un
  prompt que crece sin techo.
- **`piloto_vision` medido.** El BAJO de arriba es un defecto estructural del
  presupuesto, no una medición: no corrí una sesión de portal (son llamadas de
  pago) ni sé cuántos pasos consume un ticket real.
- **Los 27 `traerTodo` sin `acotada` de `/admin` y crons.** Los conté y los listé
  pero no sumé su peor caso contra los 300 s de sus rutas.
- **El bundle y el trabajo de cliente.** La 22 lo midió archivo por archivo
  contra el `.nft.json` real; no lo re-medí y confío en esa medición.
- **`/dashboard/unidades` y las ~31 páginas del panel: ninguna declara
  `maxDuration`.** No verifiqué qué default aplica Vercel a los server
  components de este proyecto, así que el «no cabe» del taller es un peor caso
  sin límite escrito contra el que compararlo.
