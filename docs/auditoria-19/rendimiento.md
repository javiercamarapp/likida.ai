# Rendimiento y costo — auditoría 19

**Nota: 5/10** (antes 5). Razón del movimiento: *mirada más profunda* — la
disciplina que la ronda 18 enseñó (`acotada` en toda consulta nueva) SÍ llegó a
los módulos nacidos hoy, y el default caro del OCR murió; pero los dos crons
nuevos repiten, letra por letra, el fallo arquetípico del rubro —un presupuesto
de tiempo que no cabe en su propio `maxDuration` y muere callado— y el export
más nuevo del producto reintroduce el «todo en memoria, sin paginar» que su
hermano de la misma carpeta documenta haber quitado.

**El riesgo mayor hoy:** `/api/cron/gps` declara `maxDuration = 60` con un
comentario que dimensiona el número contando **una** llamada HTTP por flota
(`route.ts:11`), cuando el lector hace hasta **diez** de 15 s cada una
(`posiciones.ts:77`) más tres consultas de 8 s: **174 s de techo por flota**,
2.9× su propio límite, sin latido, sin alerta y con la corrida repitiéndose
cada cinco minutos.

---

## Verificación de los abiertos de la auditoría 18

Uno por uno, abriendo el archivo.

| Hallazgo de la c4 | Estado | Evidencia |
|---|---|---|
| CRÍTICO — `gastos_fiscales_agregados_tenant` agrupa por el `emisor` que leyó el OCR | **REINCIDENTE, sin una línea** | `0151:128` sigue con `nullif(b.ocr_extra->>'emisor','')`, y el `group by 1..17` de `:155` sigue incluyendo además `dia_viaje` (`:132`), que es **un `viaje_id` por celda**. Ninguna migración posterior toca la función (`grep -l gastos_fiscales_agregados_tenant supabase/migrations/` → solo la 0151). Ver R19-C1. |
| CRÍTICO — `anomalias_gasto_tenant`: anti-join por `position()` + CTE materializado | **REINCIDENTE, idéntico** | `0150:138,168-171` intactos. Ver R19-C2. |
| CRÍTICO — la bandeja durable declara carta muerta lo que otra invocación procesa (`'en_curso'`) | **CERRADO** | `0177:53-70` le dio lease a `wa_evento_pendiente` (`lease_expires_at`, `claim_token`), `pendientesPorDrenar` filtra con `.or('lease_expires_at.is.null,lease_expires_at.lt.<ahora>')` (`wa_pendientes.ts:126`) y `reclamar_wa_pendiente` lo comprueba en el `where` (`0177:69`). El camino vivo también reclama (`webhook/whatsapp/route.ts:344`), o sea que la fila que el webhook está procesando queda invisible al cron 180 s. Las cuatro vueltas dentro de los 72 s ya no ocurren. |
| ALTO — el auto-reencolado cuenta filas **leídas**, no reclamadas | **REINCIDENTE atenuado** | `drenado.ts:69` (`tomados = lote.length`), `:86` (`if (!claim) continue`) y `:132` (`tomados >= LOTE`) sin cambio. Lo que cambió es que ahora `pendientesPorDrenar` ya no devuelve filas en vuelo, así que el lote lleno de filas ajenas es mucho menos probable. El techo de 864,000 invocaciones/mes sigue existiendo, sin renglón en la nota de costo. |
| ALTO — la capa de auth es el único eslabón sin techo | **REINCIDENTE, sin una línea, y peor** | Contado hoy: `auth/session.ts` 1 consulta / **0** `acotada`; `auth/tenant-efectivo.ts` 4 / **0**; `admin/prospectos-mapa.ts` **7** (era 6) / **0**; `admin/escalaciones.ts` 3 / **0**. `acotada_guardiana.test.ts:14-52` sigue con los mismos diecisiete archivos: **ninguno de los ocho módulos nuevos de esta ronda entró**. Ver R19-A6. |
| ALTO — el único camino de LLM sin tope diario es el más caro (el cuadre) | **REINCIDENTE en el cuadre, CERRADO en el runner** | `grep -rn "topeDiaUsd\|gastoChatHoyUsd"` → sigue solo `api/dashboard/chat/route.ts:24,62,68`. `processor.ts` y `agents/run.ts` no leen un tope de dinero. La novedad real: `0180:24-45` añadió `reservar_presupuesto_agente` (lock por agente+día, aparta el saldo antes de gastar) y `agentes/runner.ts:84,213` lo usa — eso es exactamente lo que el hallazgo pedía, aplicado al organigrama y **no** al camino del cuadre. |
| ALTO — el gasto del piloto no se registra en ningún lado | **REINCIDENTE** | `grep -rn "registrarCosto\|llm_costo" src/lib/likida/facturacion/ src/app/api/cron/facturar/` → **cero resultados**, igual que en la c3 y la c4. |
| ALTO — el cierre son 173.5 s de techos contra 17 s de reserva | **REINCIDENTE** | `presupuesto.ts:39-62` sigue con 18 pasos, `COSTO_CIERRE_MS` 14.0 s y `MARGEN_CIERRE_MS = 17_000` (`:84`). Ningún paso del cierre consulta `alcanza()`. |
| ALTO — tres RPC del panel sin ventana de fecha | **REINCIDENTE** | `0150:89,231,273` sin cambio. |
| MEDIO — el `ilike` de la 0154 bajo plan genérico | **REINCIDENTE** | `0154:161,173,192,204,222` sin cambio. |
| MEDIO — `prospectos-mapa`: el servidor sigue leyendo `notas` | **REINCIDENTE y creció** | El archivo pasó de 6 a 7 consultas, sigue con 0 `acotada` y `PAGINAS_EN_PARALELO` sin señal de aborto. |
| MEDIO — `COSTO-VERCEL-50K.md` | **REINCIDENTE y ahora también desactualizado en su tabla MEDIDO** | Ver R19-M5. |
| MEDIO — `carga_operadores_tenant` calcula un `exists` por viaje liquidado | **REINCIDENTE** | `0152:509-526` sin cambio. |
| MEDIO — el pre-chequeo del hash de foto es por viaje y el índice es por flota | **REINCIDENTE** | `repo.ts:328` sigue con `.eq('viaje_id', viajeId)`. |
| BAJO — `piloto_vision`: ~1,886 s contra `maxDuration = 300` | **REINCIDENTE** | `piloto_vision.ts:58` `PASOS_MAXIMOS = 14`; la llamada de visión de `:364` **sigue sin `signal`**; `cron/facturar/route.ts:219` `MARGEN_LOTE_MS = 150_000`. Sigue en BAJO por la misma razón: `FACTURACION_PILOTO` apagada. |

---

## Hallazgos

### [CRÍTICO] El agregado fiscal sigue agrupando por el nombre del emisor tal como lo leyó el modelo de visión — y por `viaje_id` (REINCIDENTE)

`supabase/migrations/0151_fiscal_agregado.sql:128,132,155` ·
`src/lib/likida/intake/ocr.ts:524` · `src/lib/likida/fiscal.ts:1190-1193`

Sin una línea de cambio desde la c4. El `group by 1..17` de `:155` incluye
`emisor` (`:128`, texto libre que escribe `ocr.ts:524` con lo que el modelo
leyó «tal cual»), `rfc_sin_cfdi` (`:121`) y `dia_viaje` (`:132`, que es
literalmente un `viaje_id`): tres llaves cuya cardinalidad crece con el
**volumen de comprobantes**, no con las dimensiones.

Escenario: 3.6M gastos/año por flota (`docs/escala-50k/MAPA.md`), 30 % sin CFDI
= 1.08M comprobantes. Si el OCR colapsa 20 a 1 son 54,000 celdas de ~24 campos
jsonb (`0151:158-185`, ≈400 bytes) = 22 MB; si no colapsa —que es lo que
`ocr.ts` dice que pasa— son ~430 MB, en UNA respuesta, y
`getGastosFiscalesSeries` (`fiscal.ts:1190-1193`) dispara **tres** más la de
`getGastosFiscales`. `acotada` corta a los 8 s (`presupuesto.ts:113`) y las tres
fallan en bloque a propósito (`fiscal.ts:1196-1201`).

Consecuencia: «en riesgo/perdido» y «recuperable pidiendo factura» —las dos
cifras que el contralor cruza contra su contador— desaparecen de `/dashboard` y
de `/dashboard/contador` en la flota grande, con un `logger.error` como único
rastro. La cabecera de la migración sigue afirmando «cientos de celdas»
(`0151:21`) y el JSDoc lo repite (`fiscal.ts:1148`): un supuesto escrito como
hecho, en dos sitios.

Causa raíz probable: al elegir las dimensiones no se separó el dominio cerrado
(concepto, forma de pago, estado SAT) del texto de un modelo; a `host` sí se le
aplicó ese razonamiento (`0151:123-126`) y a `emisor` no.

*(REINCIDENTE de la c4.)*

---

### [CRÍTICO] `anomalias_gasto_tenant` sigue con el anti-join por `position()` que `duplicados.ts` documenta haber quitado (REINCIDENTE)

`supabase/migrations/0150_agregados_analytics.sql:96-105,126-134,138,157-165,168-171` ·
`src/lib/likida/duplicados.ts:52-83`

`:138` (`uuids as (select distinct uuid from filas …)`) y `:168-171`
(`where not exists (select 1 from uuids u where position(u.uuid in g.concepto
|| '|' || g.folio) > 0)`) están intactos. `position()` no es una igualdad: no
hay índice ni hash join que lo sirva, es O(G × U) por bucle anidado — la misma
complejidad que `duplicados.ts:53-58` explica por escrito haber eliminado.

Y `filas` (`:96-105`) se referencia cinco veces, así que Postgres 12+ la
materializa sin índices: cada subconsulta correlacionada de `:126-134` y
`:157-165` es un barrido completo de las filas materializadas **por grupo de
anomalía**.

Escenario: 3.6M gastos/año, 200 grupos por CFDI + 200 por folio → 400 × 3.6M =
**1.44 × 10⁹ visitas de fila**, más ~2 × 10⁸ comparaciones de subcadena. Corre
**en cada carga** de cuatro pantallas (`inicio-contenido.tsx:121`,
`inicio-contador.tsx:88`, `combustible-casetas/page.tsx:130`,
`notificaciones/page.tsx:40`), sin ventana de fecha (el RPC solo recibe
`p_tenant`, `0150:89`) y sin caché.

Consecuencia: `acotada` corta a los 8 s y el detector de fraude entre viajes
queda apagado, en las cuatro pantallas, justo para el cliente más grande.

Causa raíz probable: la migración se escribió como traducción *semántica* del
oráculo puro; la prueba de equivalencia comprueba resultados, no planes.

*(REINCIDENTE de la c4.)*

---

### [ALTO] El cron de GPS: 174 s de techo por flota contra `maxDuration = 60`, y el comentario que dimensiona el 60 cuenta una llamada HTTP donde el código hace diez

`src/app/api/cron/gps/route.ts:11-14` ·
`src/lib/likida/conectores/posiciones.ts:77,82` ·
`src/lib/likida/conectores/sincronizar_gps.ts:65,105,145,157,191`

El comentario dice, textualmente: *«Una llamada HTTP por flota con GPS
conectado, cada una acotada a 15 s dentro de `httpReal`. 60 s cubre una decena
de flotas con margen»* (`route.ts:11-13`). El lector de Samsara pagina hasta
**diez** veces (`posiciones.ts:77`), y cada vuelta es un `http()` cuyo techo es
`AbortSignal.timeout(15_000)` (`sincronizar_gps.ts:65`).

La suma por flota, a mano:

| Paso | Techo | Fuente |
|---|---|---|
| lector de posiciones (10 páginas × 15 s) | **150 s** | `posiciones.ts:77,82` + `sincronizar_gps.ts:65` |
| `acotada` de unidades | 8 s | `sincronizar_gps.ts:105` |
| `acotada` del upsert de posiciones | 8 s | `sincronizar_gps.ts:145` |
| `acotada` del sello `gps_visto_en` | 8 s | `sincronizar_gps.ts:157` |
| **por flota** | **174 s** | |

`ANCHO_FANOUT_FLOTAS = 4` (`:34`) las corre de a cuatro, así que **con una sola
flota lenta** la corrida ya son 174 s + los 8 s de la lectura de credenciales
(`:180`) = **182 s contra 60**. Con ocho flotas, 364 s. No hay un solo
`Date.now()` contra `maxDuration` en todo el camino, ni un presupuesto que se
reparta como el de `facturar` (`PRESUPUESTO_LOTE_MS`, `cron/facturar/route.ts:190`).

Escenario: la API de Samsara responde lento (o acepta y calla, que es el caso
que `presupuesto.ts:100-108` documenta haber medido) → Vercel mata la
invocación a los 60 s → **no corre `registrarLatido`** (`route.ts:76,80,88`
están todos después del `await`), **no corre `alertarOperador`** (`:87`), y el
panel de salud sigue mostrando el latido de la corrida anterior. La siguiente
corrida arranca 5 minutos después y hace lo mismo. Coste directo: 8,640
invocaciones/mes × 60 s = **144 GB-h/mes** de función quemada sin escribir una
posición, contra los ~2 s que costaría una corrida sana.

Consecuencia: «el GPS de tu flota» —que la landing lista entre las fuentes de
dato y que este PR existía para hacer verdad— se queda sin entrar, y el único
sitio donde eso se vería (`cron_latido`, `gps_visto_en`) es justo lo que la
muerte por `maxDuration` impide escribir. Es el modo de falla que este rubro
tiene por definición: excede el límite y falla callado.

Causa raíz probable: el `maxDuration` se dimensionó leyendo la firma del lector
(«una llamada») y no su cuerpo (un `for` de diez páginas); nadie sumó el techo
del lector con los tres `acotada` de 8 s que vienen después.

---

### [ALTO] `TOPE_POR_FLOTA = 500` recorta las lecturas de GPS **después** de leerlas, en silencio, y el cuerpo del cron reporta el número recortado como si fuera el total

`src/lib/likida/conectores/sincronizar_gps.ts:31,99-100` ·
`src/app/api/cron/gps/route.ts:57-70`

`const posiciones = r.posiciones.filter(posicionValida).slice(0, TOPE_POR_FLOTA)`
(`:99`) corta a 500 **después** de haber traído hasta diez páginas del
proveedor, y acto seguido `base.leidas = posiciones.length` (`:100`) asigna el
número **ya recortado**. No hay ningún campo que diga «se descartaron N».

Escenario, con los números del propio repo: `docs/escala-50k/MAPA.md` fija el
objetivo en 50,000 viajes/mes por flota; a ~20 viajes por unidad al mes son
~2,500 unidades. El poller trae la última posición de las 2,500, se queda con
las **500 primeras del arreglo** —el orden lo decide Samsara, no nosotros— y
descarta 2,000. Esas 2,000 unidades nunca reciben `gps_visto_en`
(`:152-158` solo sella `unidadesVistas`), así que el panel las muestra como
«GPS configurado, nunca visto» de forma permanente, y el cuerpo del cron
contesta `{ guardadas: 500, huerfanas: 0, conError: 0 }` — verde.

Consecuencia: en la flota del tamaño objetivo, el 80 % de los camiones aparece
sin posición para siempre, y las tres cifras que el cron publica para
detectarlo (`guardadas`, `huerfanas`, `conError`) dicen que todo está bien. Es
un rótulo que no es verdad: `leidas` no son las leídas.

Causa raíz probable: el tope se puso para acotar la escritura (que es correcto)
y se aplicó sobre la misma variable que alimenta el reporte, en vez de contar
el descarte aparte.

---

### [ALTO] El cron del outbox: 25 salidas con pool de 4 y 10 s por envío son 70 s contra `maxDuration = 60`; y una caída de WhatsApp de 64 minutos marca 'dead' todo lo encolado sin que nadie lo lea

`src/app/api/cron/wa-outbox/route.ts:10,43,46,57` ·
`src/lib/likida/wa_outbox.ts:25` ·
`supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:104-113`

Tres números que no cuadran entre sí:

1. **La vuelta no cabe en su límite.** `reclamarSalidasWhatsApp()` toma 25 por
   default (`wa_outbox.ts:25`), `conPool(salidas, 4, …)` (`route.ts:46`) da
   `ceil(25/4) = 7` envíos secuenciales por obrero, y cada envío tiene
   `AbortSignal.timeout(10_000)` (`:57`) más el `acotada` de
   `finalizarSalidaWhatsApp` (8 s de techo). Con Meta lento: 7 × 10 s = **70 s**
   solo de `fetch`, más los 8 s del `reclamar` inicial = **78 s contra
   `maxDuration = 60`**. Con los `finalizar` también lentos, 7 × 18 + 8 = 134 s.
2. **Morir a mitad no es gratis.** El lease es de 120 s (`wa_outbox.ts:27`) y
   `reclamar_wa_outbox` ya incrementó `intentos` al reclamar (`0180:97`). Las
   filas que la invocación muerta no alcanzó a finalizar quedan `'sending'` con
   el intento consumido y no vuelven a leerse hasta que el lease vence.
3. **El backoff se agota en poco más de una hora.** `finalizar_wa_outbox` marca
   `'dead'` en cuanto `intentos >= 8` (`0180:110`) y el backoff es
   `least(3600, 15 * 2^intentos)`: la suma de los ocho primeros es
   15+30+60+120+240+480+960+1920 = **3,825 s = 63.7 minutos**. Una caída del
   Cloud API de Meta más larga que eso deja en `'dead'` **todo** lo que se
   encoló durante la caída.

Y a `'dead'` no lo mira nadie: `grep -rn "wa_outbox" src/` devuelve exactamente
tres archivos —el cron, `wa_outbox.ts` y `meta/client.ts`— y ninguno consulta
`estado='dead'`. No hay pantalla, ni alerta, ni purga; el análogo de
`cartasMuertas()` (`drenado.ts:134-138`), que sí existe para la bandeja de
entrada, no existe para la de salida.

Escenario: WhatsApp se cae 70 minutos (ha pasado). Cada `sendText`/`sendDocument`
del cierre encola su payload (`meta/client.ts:180,194,334,385,474`). A los 64
minutos el outbox marca todo `'dead'`. Cuando Meta vuelve, no se reenvía nada y
nadie se entera: el operador nunca recibe su PDF de liquidación, que es el
entregable del producto, y el «CFDI que se perdía» —el P0 que este outbox vino
a cerrar (#44)— vuelve por la puerta de atrás.

Causa raíz probable: el `maxDuration = 60` se copió del cron hermano sin
multiplicar `limite / ancho × timeout`, y la escalera de backoff se dimensionó
para un rechazo puntual de Meta, no para una caída de proveedor.

---

### [ALTO] El export de póliza arma un mes entero en un solo `jsonb`, sin paginar ni stream — el hermano de la misma carpeta documenta por qué eso no se hace

`src/app/api/export/poliza/route.ts:51,148,157,167,226,246` ·
`supabase/migrations/0175_poliza_datos.sql:34-36,64-67` ·
`src/app/api/export/liquidaciones/route.ts:66-82,107-135`

`poliza_datos_tenant` **devuelve un solo valor** (`returns jsonb`,
`jsonb_agg(...)` sobre toda la consulta, `0175:34-36`): sin `limit`, sin
cursor, sin paginación. La ruta lo consume con un `acotada` de 8 s
(`route.ts:148`), lo materializa entero (`:157`), recorre las filas en JS
(`:167`) y arma el archivo completo en una cadena en memoria (`:226` / `:246`).
El único guardarraíl es `DIAS_MAXIMO = 92` (`:51`) — un tope de **días**, no de
volumen.

Cincuenta metros más allá, en la misma carpeta,
`export/liquidaciones/route.ts:66-82` explica exactamente esto: *«Antes: TODA
la tabla de liquidaciones de la flota, sin periodo, armada entera en memoria
(`traerTodo` + `toCsv`)… Ahora: el archivo sale página por página
(`ReadableStream`); en memoria nunca hay más de 1,000 filas»* (`PAGINA = 1_000`,
`pg.ts:45`). La ruta nueva no aplicó nada de eso.

Escenario, con los números del repo: 50,000 viajes/mes (`docs/escala-50k/MAPA.md`),
un mes = ~50,000 liquidaciones. Cada objeto trae 10 campos más el arreglo
`porConcepto` — a ~600 bytes son **~30 MB de jsonb**, que Postgres tiene que
construir **completos** con `jsonb_agg` antes de mandar el primer byte, más
el lateral por liquidación (`0175:53-64`) que son 50,000 sondas a `idx_gasto_viaje`.
Contra los 8 s de `acotada`, esa consulta no vuelve; la ruta contesta **503 «No
se pudieron leer las liquidaciones»** (`:151-154`). Y si volviera: 50,000
pólizas × ~6 movimientos = 300,000 renglones que `archivoContpaqi` (`:226`)
concatena en una sola cadena, más el jsonb original, más los objetos JS
intermedios, en una función de Vercel.

Consecuencia: la promesa que el módulo entero existe para cumplir —«el formato
que SAP Business One o CONTPAQi ya sabe importar»— no se puede cumplir en la
flota del tamaño objetivo, y el mensaje del 413 (`:92`, *«divide el periodo»*)
manda al contralor a partirlo en tres trozos que fallan igual, cada uno con un
503 que no dice por qué. El fallo es cerrado, que es lo correcto; lo que no hay
es un camino que funcione.

Causa raíz probable: la decisión de agregar en SQL (correcta, y la cabecera de
la 0175 la argumenta bien) se tomó como si eso resolviera también el transporte;
`jsonb_agg` sin `limit` mueve el problema de JS a Postgres en vez de quitarlo.

---

### [ALTO] La entrevista de onboarding da de alta operadores y unidades en un bucle serial sin cota, sin techo por consulta, dentro de una ruta que streamea

`src/lib/likida/perfil/entrevista-aplicar.ts:173-188` ·
`src/lib/likida/administracion.ts:282,301,319` ·
`src/lib/likida/operacion.ts:888` ·
`src/lib/likida/perfil/entrevista.ts:620-640` ·
`src/app/api/dashboard/onboarding-chat/route.ts:10,22`

`nutrirDesdeHechos` recorre `hechos.operadoresAlta` y `hechos.unidadesAlta` con
un `await` por elemento (`:173-188`). No hay cota: el único límite es el recorte
del mensaje a 2,000 caracteres (`onboarding-chat/route.ts:22`).

- `parseOperadores` (`entrevista.ts:620-628`) es un `while (re.exec(t))` global;
  el patrón mínimo que casa («ab 5512345678») son 13 caracteres, así que un
  mensaje de 2,000 produce hasta **~150 operadores**.
- `crearOperador` son **tres viajes de red serie** —el `select` de duplicado
  (`administracion.ts:282`), el `insert` (`:301`) y el `anotar` de bitácora
  (`:319`)— y **ninguno lleva `acotada`** (`administracion.ts`: 8 consultas, 2
  acotadas). Heredan el default de undici: 300,000 ms.
- `parseUnidades` (`entrevista.ts:630-640`) parte por comas/`;`/« y »: un
  mensaje de 2,000 caracteres da hasta **~500 unidades**, y cada `crearUnidad`
  es un `acotada` de 8 s (`operacion.ts:888`).

Escenario realista (no patológico): el dueño de la flota pega su lista de 40
choferes en una sola respuesta del chat. Son 40 × 3 = **120 viajes de red en
serie**; a 0.3 s el redondo son 36 s, y esos 36 s se suman a los 8 pasos que ya
hizo el turno (`guardarPerfilPatch`, `getPerfilCrudo`, `actualizarFacilidad15`,
`leerConfigCobranza`, `guardarConfigCobranza`, `getConfig`, `guardarPolitica`,
`guardarDatosFiscales`). Con 150 choferes son 450 viajes = ~135 s contra
`maxDuration = 120` (`route.ts:10`). Con una lista de unidades de 500, 500
`insert` serie.

Consecuencia: la invocación muere a mitad del bucle. Como la respuesta es un
`ReadableStream` (`route.ts:52`), el navegador recibe los eventos `paso` y
**nunca** el `{t:'fin'}` ni el `{t:'error'}` (`:70,80`): la pantalla se queda
esperando para siempre. En la base quedan los primeros N operadores creados y
el resto no, sin ninguna marca de dónde se cortó. Y basta con una sola de las
consultas sin `acotada` colgada para que la invocación entera se vaya, porque
su techo (300 s) es 2.5× el de la función.

Causa raíz probable: `nutrirDesdeHechos` se escribió para el caso de una o dos
altas por turno; el parser, en cambio, acepta tantas como quepan en el mensaje,
y nadie ató las dos cotas.

---

### [ALTO] La guardiana de `acotada` no creció con el código nuevo, y los tres archivos por los que pasa todo siguen fuera (REINCIDENTE)

`src/lib/likida/acotada_guardiana.test.ts:14-52` · `src/lib/auth/session.ts` ·
`src/lib/auth/tenant-efectivo.ts` · `src/lib/admin/prospectos-mapa.ts` ·
`src/lib/admin/escalaciones.ts` · `src/lib/likida/administracion.ts`

Contado hoy, archivo por archivo (`.from(`/`.rpc(` contra `acotada(`):

| Archivo | Consultas | `acotada` | ¿En la guardiana? |
|---|---|---|---|
| `src/lib/auth/session.ts` | 1 | **0** | no |
| `src/lib/auth/tenant-efectivo.ts` | 4 | **0** | no |
| `src/lib/admin/prospectos-mapa.ts` | 7 | **0** | no |
| `src/lib/admin/escalaciones.ts` | 3 | **0** | no |
| `src/lib/likida/administracion.ts` | 8 | **2** | no |

La lista de `GUARDADOS` (`:14-52`) sigue con los mismos diecisiete archivos de
la ronda 18. Los módulos **nuevos** de esta ronda sí llevan `acotada` —
`conectores/sincronizar_gps.ts` 4/4, `wa_outbox.ts` 3/3,
`contabilidad/catalogo.ts` 1/1, `contabilidad/perfiles.ts` 1/1 — pero por
disciplina de quien los escribió, no porque una prueba lo exija: **ninguno está
en la lista**, así que la consulta número 5 que se les añada mañana nace sin
techo y nada falla.

Escenario, sin cambio desde la c4: `prospectos-mapa.ts` pide hasta 6 páginas a
la vez sin `AbortSignal`, heredando los 300,000 ms de undici, desde una ruta que
no declara `maxDuration`. Y ahora se le suma `administracion.ts`, que es por
donde el onboarding nuevo escribe operadores y políticas (ver R19-A5).

Causa raíz probable: la guardiana es una lista a mano y se llena con lo que un
hallazgo nombró; el código nuevo nace fuera de ella por construcción.

*(REINCIDENTE de la c4, con dos archivos más.)*

---

### [ALTO] Ni un tope de dinero en el camino del cuadre, y el gasto del piloto de facturación sigue sin registrarse en ningún lado (REINCIDENTE)

`src/app/api/dashboard/chat/route.ts:24,62,68` ·
`src/lib/likida/processor.ts` · `src/lib/agents/run.ts` ·
`src/lib/likida/agentes/runner.ts:84,213` ·
`supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:24-45`

La 0180 hizo bien el trabajo que este hallazgo pedía —`reservar_presupuesto_agente`
toma `pg_advisory_xact_lock` por (agente, día MX), suma lo gastado más lo
reservado y aparta el saldo antes de llamar al modelo (`0180:29-45`)— y
`agentes/runner.ts:213` lo usa. Pero lo aplicó **al organigrama de agentes
internos**, no al camino donde vive el dinero del cliente:
`grep -rn "topeDiaUsd|gastoChatHoyUsd|reservarPresupuesto" src/lib/likida/processor.ts src/lib/agents/run.ts`
→ **cero**. El único freno del webhook sigue siendo `MSGS_POR_MIN = 40`, que
aplaza en vez de descartar.

Y `grep -rn "registrarCosto\|llm_costo" src/lib/likida/facturacion/ src/app/api/cron/facturar/`
sigue devolviendo **cero**: cada paso del piloto de visión es una llamada a
`anthropic/claude-sonnet-5` a $2/$10 por M (`models.ts:143`, `openrouter.ts:196`)
que no aparece en `/admin/consumo` ni entra en el costo por liquidación con el
que se fija el precio del producto.

Consecuencia: la banda de **$0.03–$0.05 por liquidación** que `models.ts:17`
declara como el número que gobierna el precio se calcula sobre un universo
incompleto, y no hay ningún tope que detenga una ráfaga en el camino más caro.

*(REINCIDENTE de la c3 y la c4.)*

---

### [MEDIO] El predicado de fecha de `poliza_datos_tenant` no es sargable: cada export recorre el histórico completo de liquidaciones del tenant

`supabase/migrations/0175_poliza_datos.sql:64-67` ·
`supabase/migrations/0001_init.sql:91` ·
`supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:32-36`

```sql
where l.tenant_id = p_tenant
  and (l.created_at at time zone 'America/Mexico_City')::date >= p_desde
  and (l.created_at at time zone 'America/Mexico_City')::date <= p_hasta
```

La columna va envuelta en dos conversiones, así que la parte `created_at` de
`idx_liq_tenant (tenant_id, created_at desc)` (`0001:91`) **no se puede usar**:
el planificador entra por `tenant_id` y filtra fila por fila.

El repo conoce la forma correcta y la usa cinco días antes en la migración de
al lado: `0180:32-36` calcula `v_inicio := p_dia::timestamp at time zone
'America/Mexico_City'` y luego compara `inicio >= v_inicio` — el rango
convertido, no la columna.

Escenario: flota a 50,000 viajes/mes, tres años de operación = **1.8M filas de
`liquidacion`** recorridas para extraer las ~50,000 de un mes, en cada intento
de export, dentro de los 8 s de `acotada`.

Consecuencia: agrava R19-A4 y hace que acortar el rango —lo que el 413 le pide
al usuario— **no ayude nada**: pedir un día cuesta lo mismo que pedir 92.

---

### [MEDIO] La 0183 quitó dos índices duplicados y dejó el par que de verdad lo es, en la tabla con la escritura más alta del producto

`supabase/migrations/0183_indices_duplicados_gps_wa.sql:5-6` ·
`supabase/migrations/0176_gps_ingesta.sql:50-51,66-68` ·
`supabase/migrations/0050_rastreo_posicion_geocerca.sql:71,74` ·
`supabase/migrations/0155_purgas_y_bucket_comprobantes.sql:47`

La 0183 dice, con razón, *«cada copia cobra en cada INSERT y no mejora ningún
plan»* y borra `posicion_unidad_tiempo_idx` (0050:74) y
`wa_evento_pendiente_lease_idx` (0177:53). Los dos eran duplicados exactos.
Pero en la misma tabla quedan, creados por la **misma** migración 0176:

- `posicion_unidad_medida_idx` — btree `(tenant_id, unidad_id, medida_en desc)` (`0176:50`)
- `uq_posicion_lectura` — **unique** `(tenant_id, unidad_id, medida_en)` (`0176:66`)

Mismas columnas, mismo orden; la única diferencia es la dirección de la última,
y un btree se recorre en las dos direcciones. El no-único es redundante con el
único. `posicion` queda con **cinco** estructuras que mantener por fila (PK +
`posicion_sin_duplicado` de `0050:71` + `posicion_tenant_medida_idx` de
`0155:47` + las dos de arriba).

Escenario, con los topes del poller: `TOPE_POR_FLOTA = 500` cada 5 minutos son
**144,000 intentos de inserción al día por flota** (`sincronizar_gps.ts:31`,
`vercel.json` `*/5 * * * *`). El índice redundante es una escritura de más por
cada una: ~4.3M entradas de índice al mes por flota que ningún plan aprovecha,
en la única tabla del repo con escritura sostenida.

Consecuencia: latencia de escritura y bloat que el poller paga en su presupuesto
—que ya no cabe (R19-A1)— y que el `autovacuum` paga después.

---

### [MEDIO] `posicion` es la décima de catorce purgas que comparten un reloj de 60 s, justo ahora que pasó a ser la tabla que más crece

`supabase/migrations/0165_storage_sin_delete_directo.sql:205,234` ·
`src/app/api/cron/purgar/route.ts:16,60,62,124` ·
`supabase/migrations/0155_purgas_y_bucket_comprobantes.sql:163-183`

`mantenimiento_de_datos` declara **un solo** `vence := clock_timestamp() +
interval '60 seconds'` (`0165:205`) y lo reparte entre catorce purgas
secuenciales; `purgar_posicion` es la décima (`0165:234`). El cron la llama a lo
sumo tres veces (`MAX_VUELTAS = 3`, `route.ts:62`) y el guard
`Date.now() - inicio + PLAZO_VUELTA_MS < (maxDuration - 5) * 1000`
(`:124`, con `PLAZO_VUELTA_MS = 60_000` y `maxDuration = 120`) corta en la
segunda vuelta si la primera pasó de 55 s: en la práctica, **≤120 s de purga
por noche para las catorce tablas**.

Escenario: con el poller encendido, `posicion` recibe hasta 144,000 filas al
día por flota (ver R19-M2) y la purga es a 90 días (`0155:163`), así que el
régimen estacionario obliga a borrar ~144,000 filas por flota **cada noche** —
cada una con cinco índices que mantener. Con diez flotas son 1.44M filas/noche
que compiten, en un reloj de 60 s, contra nueve purgas que corren antes.

Cuando no alcanza, `purgar_en_tandas` devuelve `parcial` y lo único que pasa es
un `logger.warn('cron.purgar.parcial')` (`route.ts:122`): no hay alerta. La
tabla crece por encima de los 90 días, cada inserción del poller se hace más
lenta, y el primer síntoma visible es el `maxDuration` de R19-A1 disparándose
antes.

*(Declaro el supuesto: no pude medir cuánto tarda borrar 144,000 filas de
`posicion` con cinco índices — aquí no hay Postgres. Lo que sí es del código es
el reloj compartido de 60 s, el orden décimo, y el techo de vueltas.)*

---

### [MEDIO] El outbox reenvía mensajes de WhatsApp que nadie contabiliza — y el mismo mensaje puede salir dos veces

`src/app/api/cron/wa-outbox/route.ts:55-71` · `src/lib/likida/costos.ts:47,86-87` ·
`src/lib/meta/client.ts:180,194,323,334,385,474`

`registrarCostoWhatsApp` se llama en dos sitios de `processor.ts` (`:1121,:2979`)
y en ninguno del cron del outbox: el `fetch` a Graph de `route.ts:55` sale y se
finaliza (`:71`) sin registrar los $0.008 que Meta cobra
(`costos.ts:47`, `WHATSAPP_MSG_USD_DEFAULT`). El payload guardado en `wa_outbox`
tampoco trae `tenant_id` ni `viaje_id` (`0180:70-83`), así que **no se puede**
atribuir aunque se quisiera.

Escenario: durante una caída de Meta, *todos* los envíos salientes pasan por el
outbox (`meta/client.ts:180,194,334,385,474` encolan en cada rama). Esa ventana
entera desaparece del costo por liquidación — la cifra que `models.ts:17`
declara como la base del precio del producto, y que `costos.ts:5-9` dice, con
mayúsculas, que no puede quedarse en cero sin verse.

Y el mismo camino puede duplicar el envío: `enviarTexto` **a la vez** encola en
el outbox (`meta/client.ts:180`) y devuelve `{ok:false, status:503}` al llamador,
mientras `wa_outbox.dedupe_key` (`0180:69`) se inserta siempre nulo
(`wa_outbox.ts:16-18`) y el único de esa columna no restringe nada entre nulos.
Si el mensaje se reintenta aguas arriba —la bandeja durable vuelve a correr el
turno— salen dos: uno del retome y otro del cron, ambos cobrados, ninguno
registrado.

---

### [MEDIO] `COSTO-VERCEL-50K.md`: el piso de invocaciones que la nota marca como MEDIDO es 47,010 y hoy son 98,850

`docs/escala-50k/COSTO-VERCEL-50K.md:18-25,31` · `vercel.json`

La tabla del §1 se titula *«Lo MEDIDO — las cadencias y los topes que hoy están
puestos»* y lista cinco crons con un total de **«47,010 fijas»** (`:25`),
descritas como *«el piso: se pagan aunque no haya un solo cliente»* (`:31`).
`vercel.json` tiene hoy **siete**: la nota no incluye `wa-outbox`
(`* * * * *` → 43,200/mes) ni `gps` (`*/5 * * * *` → 8,640/mes).

El piso real es **98,850 invocaciones/mes: 2.1× el número escrito en la sección
MEDIDA**. Con la fórmula de la propia nota (`:55`) y los `maxDuration` nuevos, el
techo de GB-h de las dos rutas que faltan es 43,200 × 60 s + 8,640 × 60 s ÷ 3600
= **864 GB-h/mes** a 1 GB, contra el total de «≈1,440–3,300» que la nota da para
todo el sistema.

Consecuencia: la nota es lo que se consulta para decidir «¿cuánto va a costar?»,
y su renglón más duro —el que no depende del tráfico— está a la mitad. La regla
que la propia nota se puso (`:9-12`: cada número dice si es MEDIDO o SUPUESTO)
se cumple en la forma y no en el fondo: el número está etiquetado MEDIDO y ya no
lo es.

---

### [BAJO] `models.ts` y la tabla de precios de `openrouter.ts` se contradicen sobre Sonnet 5 a partir del 1-sep-2026

`src/lib/llm/openrouter.ts:196` · `src/lib/llm/models.ts:70-74`

`openrouter.ts:196` dice `'anthropic/claude-sonnet-5': [2, 10], // intro
VIGENTE hasta 31-ago-2026; revertir a [3,15] después`. `models.ts:70-74` dice
lo contrario, y con fecha de verificación más reciente: *«El aumento a $3/$15
que estaba anunciado para el 1-sep-2026 FUE CANCELADO (verificado en la
documentación de Anthropic el 23-ago): ese precio es ahora el estándar. No hay
reloj que vigilar aquí»*.

Escenario: el 1-sep alguien sigue la instrucción del comentario de
`openrouter.ts` y sube la tabla a [3,15]. `costoReal` (`:243`) solo cae a
`calcCost` cuando OpenRouter no manda `usage.cost`; en ese camino, el costo del
cuadre —el modelo más caro y el que fija el precio por liquidación— quedaría
sobrestimado un 50 % sin que nada lo contradiga.

Consecuencia: deuda pequeña, pero está en el archivo del que salen las cifras de
dinero y las dos frases no pueden ser ciertas a la vez.

---

## Lo que revisé y está bien

- **El default caro del OCR murió de verdad, y es la palanca de costo más
  grande del producto.** `models.ts:69` — `ocr: 'google/gemini-3.1-flash-lite'`,
  con el precio en la tabla (`openrouter.ts:193`, `[0.25, 1.5]`) para que
  `calcCost` no caiga a la red de seguridad. El comentario de `:60-68` razona el
  modo de falla correcto (una variable de entorno borrada ya no fallaba hacia lo
  caro y silencioso: $759 → $9,513/mes a 506,000 comprobantes). Verificado el
  encargo de `c3b1b74`: **sí, se cumplió**.
- **Los módulos nuevos llevan `acotada` en TODA consulta.**
  `conectores/sincronizar_gps.ts` 4/4 (`:105,145,157,180`), `wa_outbox.ts` 3/3,
  `contabilidad/catalogo.ts` 1/1, `contabilidad/perfiles.ts` 1/1. Esa es la
  lección de la ronda 18 aplicada sin que nadie la exija (la queja es que no la
  exige nadie: R19-A6).
- **El CRÍTICO de la bandeja durable está cerrado con el mecanismo correcto.**
  `0177:48-70` le puso `claim_token`/`lease_expires_at` a `wa_evento_pendiente`,
  y el filtro entró en los dos lados: la lectura (`wa_pendientes.ts:126`) y el
  claim (`0177:69`). El camino vivo también reclama (`webhook/whatsapp/route.ts:344`),
  así que una fila en vuelo deja de salir en el lote del cron.
- **La reserva de presupuesto del runner es un mutex de dinero de verdad.**
  `0180:29-45`: `pg_advisory_xact_lock` por (agente, día MX), suma gastado +
  reservado vigente, y aparta el saldo con lease antes de llamar al modelo. Es
  exactamente el patrón que faltaba; el reproche es dónde **no** se aplicó.
- **El GPS no tiene N+1.** `sincronizar_gps.ts:103-112` resuelve device→unidad
  con **un** `.in(...)` sobre el conjunto de ids y un `Map`, y el sello de
  `gps_visto_en` es **un** `update ... .in('id', [...])` (`:154-158`), no uno por
  unidad. El upsert es un solo lote con `onConflict` (`:145-147`). El diseño de
  acceso a datos del poller está bien; lo que falla es el reloj.
- **`0176:60-68` documenta correctamente por qué `uq_posicion_lectura` va sin
  `where`**: con un único parcial, PostgREST no puede inferir el índice desde
  `on_conflict` y el upsert reventaría. Ese razonamiento es de rendimiento real
  y está bien medido contra el comportamiento del cliente.
- **El export de liquidaciones es el patrón correcto y está escrito.**
  `export/liquidaciones/route.ts:84-135`: periodo obligatorio, páginas de 1,000
  (`pg.ts:45`), `ReadableStream`, `count` exacto para saber cuándo parar y
  `LecturaIncompleta` que **aborta la descarga** en vez de cerrar limpio un CSV
  corto. Es la referencia contra la que se mide R19-A4.
- **`0180:88-99`: `reclamar_wa_outbox` usa `for update skip locked` con
  `least(p_limite, 100)`.** Dos crons solapados no reclaman la misma fila y el
  límite está acotado del lado del servidor, no solo del cliente. La mecánica del
  claim está bien; lo que no cuadra son los números que la rodean (R19-A3).
- **`0175` deja la ley fiscal en TypeScript y baja solo la agregación**
  (`0175:14-17`): el catálogo de cuentas es de la flota, y meterlo en SQL habría
  duplicado la regla. La decisión de diseño es correcta; el problema es el
  transporte y el predicado.
- **`opcionesDeRazonamiento`** (`openrouter.ts:310-316`) deja el razonamiento del
  OCR apagable por entorno con la justificación medida (1,536 tokens de salida
  promedio sobre 57 llamadas reales, ~300 del schema) y **por defecto no lo
  toca**, porque el ahorro del 50 % no se cobra sin un conjunto dorado. Eso es
  costo bien razonado.
- **La suite:** `npx vitest run` no se corrió completa por presupuesto de la
  sesión; los archivos que sí abrí (`sincronizar_gps.test.ts`,
  `posiciones.test.ts`) son 19 pruebas de correctitud —ligado por flota,
  idempotencia, fallos declarados— y **ninguna** sobre tiempo o volumen, que es
  la razón por la que R19-A1 y R19-A2 no los cazó nadie.

---

## Lo que NO alcancé a revisar

- **Ni un `EXPLAIN`, ni una medición.** No hay Postgres aquí y `npm run build`
  está prohibido. Todo lo que digo de planes —la no-sargabilidad de la 0175, la
  redundancia del par de índices de la 0176, la materialización del CTE de la
  0150— sale de leer el SQL y los índices.
- **El `maxDuration` efectivo de las rutas que no lo declaran.** Ninguna de las
  cinco rutas de `src/app/api/export/` lo declara y `vercel.json` sigue sin
  bloque `functions`, así que R19-A4 se mide contra el techo de `acotada` (8 s),
  que es el único límite que puedo demostrar desde el repo.
- **El caudal real de Samsara.** Cuántos vehículos por página devuelve
  `/fleet/vehicles/stats` y cuántas páginas encadena una flota de 2,500 unidades
  no está en el repo; el techo de diez páginas × 15 s sí, y es con lo que sumé.
- **Los dos webhooks de Cal.com** (`api/webhook/calcom` y `api/webhooks/calcom`,
  singular y plural) y las migraciones de CRM 0181/0182/0184: no miré si sus
  consultas tienen índice ni si el trabajo se duplica entre las dos rutas.
- **`0177_entregas_distribuidas.sql` y `correo/entrante`**: la ruta declara
  `maxDuration = 60` y calcula su propio `finPresupuesto` (`:288`), que es el
  patrón correcto, pero no sumé la cadena de eslabones que consume.
- **El costo por turno de la entrevista en tokens.** El `system` de
  `entrevista-agente.ts:13-31` serializa el `CATALOGO` entero (~20 preguntas con
  su cita y su texto de sustento) en cada turno que parezca pregunta; lo estimé
  en ~2,500 tokens de entrada a $0.30/M = $0.00075 por turno, que es
  despreciable, pero no lo conté con un tokenizador.
- **Si `service_role` tiene `statement_timeout`** en este proyecto de Supabase:
  el repo no lo fija en ninguna migración (`grep -rn statement_timeout supabase/ src/`
  → cero), así que el único techo demostrable sigue siendo el del cliente.
