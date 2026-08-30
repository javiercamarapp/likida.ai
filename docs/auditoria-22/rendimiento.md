# Rendimiento y costo — auditoría 22

**Nota: 6/10** (antes: s/d). Razón: línea base nueva, sin ancla previa legible.
El camino caliente está genuinamente medido —el peor caso del webhook suma
~111 s contra `maxDuration=120` con la tabla `PASOS_CIERRE` probada, `traerTodo`
falla cerrado ante una lectura parcial, el pool del webhook está dimensionado
contra el bloqueo real de zxing y el trace del bundle se midió archivo por
archivo—, pero **dos cifras se presentan como completas sin serlo** (el ancla de
8 pide que el costo por operación esté medido y el peor caso quepa; aquí hay un
canal de costo que no se mide y dos lecturas que se recortan en silencio a 1,000
filas). No baja de 6 porque el peor caso del camino que paga el producto sí cabe
y está probado.

**Riesgo mayor hoy:** los guardarraíles de paginación (`traerTodo`, `traerPorIds`,
`conteo`) existen y son buenos, pero se aplican por convención de quien escribe
la consulta — y las tres copias más recientes de una consulta ya paginada
(`oficina_wa.ts`, `jornada/repo.ts`, `cuadre/desde_db.ts`) se escribieron sin
ellos, en pantallas que afirman una suma.

## Hallazgos

### [CRÍTICO] El informe PDF del jefe suma anticipos con una lectura recortada a 1,000 viajes y la presenta como medida
`src/lib/likida/oficina_wa.ts:77`
El mismo dato que `informes_wa.ts:76` lee con `traerTodo` + `conteo(d)`, aquí se
lee con `.select('anticipo').eq('tenant_id',…).in('estatus',['abierto','en_cuadre'])`
y nada más: sin `range`, sin `count`, sin `traerTodo`, y ni siquiera dentro de
`acotada()`. El comentario de la línea 74 afirma «La MISMA consulta que el
informe de texto (informes_wa)» — y no lo es.
Escenario: una flota con 1,400 viajes en `abierto|en_cuadre` (300 unidades con
viajes que el TMS importó y nunca se cerraron, o dos semanas de operación sin
liquidar) pide «mándame el informe» por WhatsApp. PostgREST devuelve 1,000 filas
y calla. El PDF imprime «Anticipos en la calle $7,140,000» sobre 1,000 de 1,400
viajes (~29 % de menos) y «Viajes sin liquidar: 1,000» — un número redondo que
es exactamente el techo del servidor, no la realidad. A partir de la fila 1,001
la cifra ya no se mueve: la flota crece y el PDF repite 1,000.
Consecuencia: el contralor cruza ese PDF contra su contabilidad, no cuadra, y
la única regla que define al producto («nunca inventar una cifra») queda rota en
el documento que el producto entrega. Peor que el error: la rama de fallo
(línea 79-80) sí dice «no se pudo leer», así que el usuario aprende que cuando
el sistema no puede, lo dice — y por lo tanto que este número sí es bueno.
Causa raíz probable: la consulta se copió del informe de texto sin copiar su
`traerTodo`/`conteo`; el `.io.test.ts` mockea `in: () => Promise.resolve(...)`, así
que ninguna prueba puede notar la ausencia del `range`.

### [CRÍTICO] El registro de jornada (LFT) pierde marcas en silencio: los asientos se leen con un `.in()` de hasta 900 expedientes y PostgREST corta a 1,000 filas
`src/lib/likida/jornada/repo.ts:324`
`leerJornadas` trae hasta `TOPE_EXPEDIENTES = 900` días de `jornada_dia` y luego
pide TODOS sus asientos en una sola consulta `.in('jornada_id', ids)` ordenada
por `momento` ascendente, sin `traerPorIds`, sin `range`, sin `count`. El
`truncada` que devuelve (línea 351) mide **sólo** la lista de días
(`filas.length >= TOPE_EXPEDIENTES`), no los asientos.
Escenario, con números: la 0241 permite 4 tipos (`inicio_jornada`, `fin_jornada`,
`inicio_descanso`, `fin_descanso`) y el select no filtra `anulado_en`, así que un
día con jornada + una comida son 4 filas y una corrección deja 5.
· `/api/export/jornada` admite `MAX_DIAS = 400` (línea 33): **un solo operador**
pidiendo su año son 400 expedientes × 4 = 1,600 asientos → llegan 1,000 y se
pierden ~150 días. `filas.length` es 400 < 900, así que `truncada` es `false`.
· La pantalla `/dashboard/jornada` abre con 14 días (`DIAS_POR_OMISION`): una
flota de 20 operadores son 280 expedientes × 4 = 1,120 asientos → se cortan los
últimos por `momento`, o sea **los días más recientes**.
Como el orden es global por `momento` ascendente, lo que se pierde no está
repartido: son los expedientes del final de la ventana, que se quedan con
`asientos: []` (línea 349) y `componerJornada([])` los compone como un día sin
inicio ni fin.
Consecuencia: el documento que la propia función declara que «se enseña en un
juicio» (comentario en :288) afirma «sin registro declarado» sobre días que sí
tienen marcas asentadas. `asientosDeJornada` (:379) sí protege el caso de una
sola jornada con el comentario «una lista vacía significaría "este día no tiene
marcas", que es exactamente la mentira que esta feature no puede permitirse» —
la lectura por lotes, que es la que alimenta la pantalla y el export, no.
Causa raíz probable: el tope se puso sobre la tabla padre y se asumió que
acotarla acotaba la hija; el fan-out de 1→N no se contó.

### [ALTO] La pregunta libre del jefe por WhatsApp corre el analista completo y no registra un centavo en `llm_costo`
`src/lib/likida/oficina_wa.ts:157`
`atenderPreguntaLibre` llama `ejecutarAnalista` (línea 161) y devuelve el texto.
No hay `registrarCosto` en todo el archivo, y `ejecutarAnalista` no lo hace por
su cuenta: liquida contra el ledger de reservas, no contra `llm_costo`. El
camino gemelo —`/api/dashboard/chat/route.ts:103`— sí lo registra, por modelo, y
además atrapa el `PartialExecutionError` para cobrar el turno que truena
(:133), con el comentario «YA PAGÓ hasta 9 completions».
Escenario: el dueño manda «¿cuánto llevo de diésel este mes?» por WhatsApp. Eso
son hasta 5 rondas de `generateWithTools` más el ciclo correctivo de 4
(`analista.ts:370` y `:419`) = hasta 9 completions, cada una reenviando system +
tools + historial. A ~$0.005 el análisis medido (`api/dashboard/chat/tope.ts:17`)
y 20 preguntas al día son ~$0.10/día por flota que **no existe** en `llm_costo`.
Con `LIKIDA_MODEL_CHAT` apuntando a algo más caro, el hueco escala solo y
tampoco dispara la advertencia de `faseDeModelo` (B18) porque nunca se llama.
Consecuencia doble: (1) el costo por liquidación —la cifra con la que se fija el
precio, según la cabecera de `costos.ts`— se subestima justo en el canal que
Javier declaró como el principal («el ciclo queda cerrado desde WhatsApp»,
:16-19 de este mismo archivo); (2) el freno de $1/día por tenant
(`gastoChatHoyUsd`, que filtra `fase='chat'`) **no aplica en este canal**: no hay
chequeo previo y no hay filas que contar, así que un bucle o un usuario curioso
por WhatsApp sólo topa con el techo diario del tenant.
Causa raíz probable: el segundo consumidor de `ejecutarAnalista` se cableó sin
replicar el contrato «el llamador registra el costo» que sólo estaba escrito en
la ruta HTTP.

### [ALTO] La derivación del registro de jornada es un N+1 puro: 6-7 viajes de red en serie por (operador, día), y a partir de cierta flota no alcanza nunca los días recientes
`src/lib/likida/jornada/derivar.ts:222`
El bucle no tiene un solo `Promise.all`. Por cada trabajo hace, estrictamente en
serie: `asegurarDiaJornada` (:230 — 1 insert, y **2** viajes cuando ya existe,
porque el conflicto obliga a releer, `repo.ts:105`+`:117`), `asentarMarca` del
hito (:232), `extremosGps` (:255 — dos consultas encadenadas, `repo`-style
`primera` y luego `ultima`, `derivar.ts:163`+`:166`) y hasta dos `asentarMarca`
más. Son **6 consultas en la primera pasada y 7 en cada repetición**.
Escenario con números: el reloj de la corrida es `PLAZO_DERIVACION_MS = 45_000`
y el cron es horario. Con el costo unitario que el propio repo usa para una
consulta (0.3 s, `presupuesto.ts:37`), un trabajo cuesta ~2.0 s → **~22 trabajos
por corrida**; con una latencia optimista de 50 ms serían ~128. Pero
`listaDeTrabajo` (:110) ordena por `aceptado_en` **ascendente** y el bucle
arranca siempre en el índice 0, así que cada corrida vuelve a recorrer el mismo
prefijo ya asentado — y recorrerlo cuesta *más* que hacerlo (7 consultas contra
6). En régimen: si la ventana de 3 días contiene más de ~22 (o ~128) pares
(operador, día), la corrida se consume entera re-haciendo la cabeza de la lista
y **los días recientes salen de la ventana de 3 días sin derivarse jamás**. Eso
son ~7 viajes aceptados/día en el escenario conservador, ~42 en el optimista:
cualquier flota mediana.
Consecuencia: el expediente laboral queda vacío en los días recientes de forma
permanente, no transitoria. El cron lo dice (`parcial` + `cortadosPorReloj`, que
es honesto), pero el latido «parcial» perpetuo es indistinguible de un pico de
carga, y lo que se pierde es un documento con valor probatorio.
Causa raíz probable: el motor se escribió fila por fila con un reloj encima en
vez de por lotes (los expedientes del día se pueden asegurar en un `upsert` y los
extremos de GPS de todas las unidades del día en un `group by`), y el cursor de
la lista de trabajo no avanza entre corridas.

### [MEDIO] `lineasEccParaCuadre` corre en cada cuadre sin paginar, y una fecha mal leída por el OCR le abre la ventana a años
`src/lib/likida/cuadre/desde_db.ts:189`
Camino B de `evidenciaMonedero` (RMF 3.3.1.7). En el camino caliente del webhook
lee `cfdi_consolidado_linea` filtrando `fuente='ecc12'` y la ventana
`[min(fecha)−1, max(fecha)+1]` de los gastos del viaje. Sin `limit`, sin `range`,
sin `traerTodo` — recorte silencioso a 1,000.
Escenario: una flota de 100 unidades cargando dos veces al día produce ~200
líneas ECC diarias; un viaje de 5 días abre una ventana de 7 → ~1,400 líneas →
llegan 1,000. Y peor: la ventana la fijan las fechas **leídas por el OCR**; un
ticket con la fecha volteada o mal leída a `2019-05-03` convierte la ventana en
siete años y la consulta se lleva las 1,000 líneas más viejas del tenant, que no
sirven para nada.
Consecuencia: `evidenciaMonedero` degrada a `{tipo:'ninguna'}`, que por diseño
significa «no lo sabemos» — así que no hay cifra falsa, pero sí un ticket de
monedero al que no se le pone la nota de la RMF 3.3.1.7 y que el operador puede
seguir intentando facturar en la gasolinera. La degradación no deja rastro: no
hay log ni bandera de lectura parcial. El índice parcial de la 0242 está bien
puesto; lo que falta es el techo.
Causa raíz probable: se optimizó el WHERE (mover el filtro del matcher a la
base, comentario :163-179) sin revisar el otro borde de PostgREST.

### [MEDIO] El chat del panel del cliente y la pregunta del jefe corren en el carril `fondo`, contra lo que el propio contrato del presupuesto declara
`src/lib/agents/analista.ts:327`
`createLlmBudget(opts.tenantId, runId, 'fondo')`. Pero `budget.ts:16` define
`interactivo` como «hay una persona esperando AHORA: … **los chats del
dashboard** y las subidas manuales», y los dos únicos llamadores de
`ejecutarAnalista` son `/api/dashboard/chat/route.ts:96` (el contralor delante
de la pantalla) y `oficina_wa.ts:161` (el dueño esperando en WhatsApp).
Escenario: con los defaults ($5.00/día por tenant, reserva interactiva 40 % =
$2.00), el chat del contralor se frena a los **$3.00** y deja $2.00 del techo
inalcanzables. En un día en que el runner de back-office (cada 4 h) haya gastado
esos $3.00, el contralor recibe literalmente: «presupuesto de IA de fondo
agotado por hoy … el chofer no se queda sin servicio por un lote de fondo. El
trabajo de fondo reintenta en su siguiente corrida» (`budget.ts:35-37`).
Consecuencia: al comprador del producto se le niega el servicio con un mensaje
sobre trabajos de fondo que no explica nada de lo que él hizo, y con 40 % del
presupuesto de su flota sin usar. La invariante de la reserva no se rompe —se
aplica contra quien no debía.
Causa raíz probable: se clasificó por «dónde vive el código» (un agente) en vez
de por «quién espera» (una persona), que es el criterio que el propio archivo
del presupuesto escribe.

### [MEDIO] La foto va al modelo de visión sin redimensionar, con `sharp` ya cargado y ya redimensionando la misma imagen dos líneas antes
`src/lib/likida/intake/ocr.ts:401` · `src/lib/meta/client.ts:628`
`downloadMediaAsDataUrl` acota el tamaño (`MAX_IMAGEN_WHATSAPP_BYTES = 6 MB`,
cierre de la ronda 21) pero devuelve el binario **íntegro** como data-URL, y
`extraerComprobante` lo pasa tal cual: `images: [principal]`. En la misma
llamada, `decodeCodigosFromImage` (`intake/cfdi.ts:249`) ya reduce esa imagen a
1,600 px con `sharp` para el lector de códigos — y el propio comentario mide que
por encima de 1,600 px «no encuentra nada que no encuentre» esa escala.
Escenario: un comprobante de 6 MB se convierte en ~8 MB de base64 que se
materializan dos veces (aquí y al serializar el cuerpo en el SDK) y se suben a
OpenRouter en cada llamada de OCR. Una ráfaga de 11 fotos con el pool de 5
(`webhook/route.ts:72`) puede mover ~88 MB de subida dentro de una sola
invocación de 120 s. Del lado del costo: la reserva asume una tarifa plana
(`TOKENS_POR_IMAGEN = 4_000`, `openrouter.ts:495`) y el precio real se toma del
`usage` del proveedor, así que el sistema **cobra bien pero no mide** cuánto de
la entrada es resolución que nadie necesita: no hay un solo número en el repo
que relacione tokens de entrada del OCR con el tamaño de la foto.
Consecuencia: latencia y egreso que crecen con la cámara del chofer, no con el
trabajo; y una palanca de costo del camino que más se ejecuta que está
literalmente sin instrumentar, en un producto cuyo margen es el costo por
liquidación. El daño hoy es acotado porque WhatsApp comprime; el tope de 6 MB
dice que el sistema acepta el caso en que no.
Causa raíz probable: la ronda 21 cerró la mitad «sin tope» del hallazgo y la
mitad «sin redimensionar» quedó abierta.

### [BAJO] `getLiquidacionesDeViajes` usa `.in()` desnudo sobre `liquidacion`
`src/lib/likida/analytics.ts:1044`
Hoy es seguro porque el único llamador pagina a `TOPE_PAGINA = 100`
(`viajes_registro.ts:32`). Pero es un `.in(viaje_id, ids)` sin `traerPorIds`, y
`pg.ts:146` documenta que ese patrón tiene dos modos de falla mudos (recorte a
1,000 y URL rebotada por el proxy). La invariante que lo salva vive en otro
archivo y nada la ata: subir el tope de página a 1,200 lo rompe sin un error.

## Consultas sin paginar que pueden pasar de 1,000 filas

| archivo:línea | tabla | ¿usa `traerTodo`/`traerPorIds`? | ¿la cifra se presenta como completa? |
|---|---|---|---|
| `oficina_wa.ts:77` | `viaje` | **no** (ni `acotada`) | **sí** — «Anticipos en la calle» y «Viajes sin liquidar» en el PDF |
| `jornada/repo.ts:324` | `jornada_asiento` | **no** (`.in` de hasta 900 padres) | **sí** — `truncada` sólo cubre `jornada_dia`; los días sin asientos se pintan «sin registro» |
| `cuadre/desde_db.ts:189` | `cfdi_consolidado_linea` | **no** | no — degrada a `{tipo:'ninguna'}`, pero en silencio y sin log |
| `analytics.ts:1044` | `liquidacion` | no (`.in` desnudo) | acotado hoy por `TOPE_PAGINA=100` en otro archivo |
| `asistencia_coordinacion.ts:541` | `incidencia` | no (`.in`) | acotado: el padre trae `.limit(3)` |
| `sat_descarga/bandeja.ts:333` | `gasto` | no (`.in`) | acotado y **declarado**: `MAX_CANDIDATOS_VIVOS = 300` con `warn` |
| `facturacion/al_vuelo.ts:387` | `gasto` | no (`.in`) | acotado: `LOTE_POR_FLOTA = 20` |
| `intake/desglose_peaje.ts:891` | `viaje` | no (`.in`) | acotado: `limitePorCubeta = 12` |
| `mesa_control.ts:181` | varias (rótulos) | no (`.in`) | acotado por la página de la mesa |
| `carta_porte_timbre.ts:500` | `viaje` | no (`.in`) | acotado: `.slice(0, limite)` |
| `estadias/lector.ts:196/213/232` | `cliente`/`unidad`/`geocerca` | **sí**, `traerPorIds` | correcto (modelo a seguir) |
| `agentes/cobranza.ts:127` | `viaje` | **sí**, `traerTodo` + `conteo` | correcto |
| `informes_wa.ts:76` | `viaje` | **sí**, `traerTodo` + `conteo` | correcto — es el gemelo de la primera fila |

## Lo que revisé y está bien

- **`presupuesto.ts` como reloj compartido.** Sumé la cadena a mano: peor caso
  declarado lock ≤12 s + intake 20 s + agente 40 s = 72 s, más
  `MARGEN_CIERRE_MS` = 39.0 s (los 3 pasos `critico` a su techo duro + el resto
  a nominal) = **111 s contra `maxDuration = 120`**. Cabe, con la salvedad que
  el propio archivo declara y prueba (`TECHO_CIERRE_MS` ≈ 173 s no cabe, y por
  eso existe `margenDuro()`). `acotada()` cubre las dos capas (abortSignal +
  carrera contra temporizador) y traduce el agotamiento al mismo
  `{data:null,error}` que un fallo de Postgres, así que ningún llamador cambia
  de semántica.
- **`pg.ts`.** `traerTodo` avanza por filas leídas (no por número de página), usa
  el `count` gratis de la primera página como prueba y **lanza** `LecturaIncompleta`
  en vez de devolver una cifra parcial; `traerPorIds` parte en tandas de 200 con 5
  en vuelo, acotando a la vez el recorte y el largo de la URL. Es el mejor código
  del rubro en el repo.
- **Ledger de presupuesto de modelo.** `reserveLlmBudget`/`settleLlmBudget` reservan
  ANTES de llamar al proveedor con una cota conservadora, liquidan al costo real
  del proveedor (`costoReal` prefiere `usage.cost` sobre la tabla, medido contra
  el ahorro del 91.6 % de la caché de prompt), conservan la reserva cuando falta
  `usage`, y dejan la fila en `reservado` ante error de red para que la 0193 la
  expire. Un modelo sin precio no cuesta $0: se estima con la tarifa más cara y
  se loguea.
- **Ciclo de tools.** Caché de lectura entre rondas con llave que ignora `arguments`
  para tools sin parámetros (el bug de los 3 aciertos en 0), dedup dentro de la
  ronda, corte del loop-guard **antes** de pagar la última ronda, salida en cuanto
  corre la tool terminal, `maxRetries: 0` en el SDK para que la escalera de
  reintentos no se multiplique, y costo acumulado por modelo real de cada ronda.
- **Pool del webhook.** `MAX_EN_PARALELO = 5`, dimensionado contra el bloqueo
  síncrono medido de zxing-wasm (1.7 s con 20 en paralelo), y el presupuesto por
  **invocación** —no por mensaje— desde la ronda 18.
- **Índices.** Revisé las 252 migraciones contra las consultas calientes que abrí:
  `idx_viaje_tenant(tenant_id,estatus)`, `viaje_registro_keyset_idx`,
  `idx_gasto_viaje`, `idx_gasto_viaje_hash`, `idx_costo_tenant(tenant_id,created_at desc)`,
  `posicion_unidad_tiempo_idx`, `cfdi_consolidado_linea_ecc_por_fecha_idx` (predicado
  idéntico al WHERE de `lineasEccParaCuadre`), `ticket_cola_idx`. No encontré una
  consulta caliente sin índice que la soporte.
- **Agregación en SQL donde tocaba.** `resumen_costo_ia_tenant` (0064),
  `kpis_liquidacion_tenant`, `conteos_viajes_tenant` (0154), `serie_comparativa_tenant`,
  `presencia_en_sitios` en tandas de 500 — el patrón «traer 790k filas para sumarlas
  en JS» está retirado y documentado.
- **Bundle.** No hay librería de gráficas: los charts son SVG propio.
  `serverExternalPackages` + `outputFileTracingExcludes` están medidos contra el
  `.nft.json` real (145→20 archivos del proyecto, 4.22→2.51 MB) con el comando de
  re-medición escrito. `xlsx` y `pdf-lib` sólo entran por componentes de servidor.
  El único cliente pesado (leaflet + markercluster) está detrás de `next/dynamic`
  y sólo en `/admin/mapa-prospectos`. No encontré trabajo de cliente que debiera
  estar en el servidor.
- **Waterfalls del panel.** `inicio-contenido.tsx` dispara sus ~16 lecturas sin
  `await` y las cosecha por bloque; el registro de viajes navega por cursor (no
  OFFSET) desde la escala 50k.
- **Historial del agente.** `MAX_TURNS = 12` aplicado a la carga y al guardado
  (`conv.ts:404` y `:623`), y descartado cuando la fila es de otro viaje: el
  prompt no crece sin techo. La caché de prompt de Anthropic marca el system en
  los dos caminos (`generateResponse` y `generateWithTools`).

## Lo que NO alcancé a revisar

- **Medir de verdad.** Todo lo de arriba es aritmética sobre los costos unitarios
  declarados en el repo (0.3 s por consulta, 1.5/2.5 s por envío de WhatsApp).
  No corrí nada contra Supabase ni contra OpenRouter: la latencia real
  Vercel↔Supabase sigue sin medir y el propio `TOPE_CONSULTA_MS` lo admite.
- **`EXPLAIN` de las consultas calientes.** Verifiqué que exista un índice con
  el prefijo correcto, no que el planeador lo use ni el costo de los `order` con
  dos columnas sobre tablas grandes.
- **El costo por liquidación de punta a punta.** No hay una corrida real que sume
  OCR + cuadre + WhatsApp de una liquidación completa contra el rango declarado
  ($0.03–0.05, `models.ts:17`); con la base en cero no hay filas de `llm_costo`
  que cruzar. La skill `salud-del-repo` lo lista como su cuarto eje.
- **`/admin` cruzando tenants.** `lib/admin/negocio.ts` y `corridas-cruzadas.ts`
  los abrí sólo por encima: con un solo tenant en producción no hay carga que
  justifique el escrutinio, pero son los que peor van a escalar.
- **Los 54 agentes del back office.** Revisé el presupuesto que comparten
  (`fondo` y su reserva) pero no el consumo de cada `agentes/*.ts`; ahí es donde
  más fácil se esconde un prompt que crece sin techo.
- **El piloto de visión de facturación** (`piloto_vision.ts`, Sonnet 5 por PASO,
  8–14 pasos por portal): sólo confirmé que corre en el carril `ocr_lote` y
  detrás de `FACTURACION_PILOTO=si`. Es el costo unitario más alto del repo y no
  lo audité.
