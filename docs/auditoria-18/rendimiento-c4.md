# Rendimiento y costo — auditoría 18 · continuación 4

**Nota: 5/10** (antes 4). Razón del movimiento: *se atacó y subió*.

El PR #39 hizo el trabajo estructural que este rubro llevaba tres rondas
pidiendo, y se puede contar abriendo los archivos: **`analytics.ts` pasó de 21
`traerTodo` a CERO** (`grep -n "traerTodo[<(]" src/lib/likida/analytics.ts` →
sin resultados), el `OFFSET` de hasta 100,000 filas de `/dashboard/viajes` es
ahora un keyset con **el `EXPLAIN` pegado en la migración** (`0154:17-54`, 108
buffers contra 100,924), el N+1 de `/admin/flotas` murió de verdad
(`senales_pmf`, `0162:70`), y la guardiana de `acotada` pasó de **6 a 17
archivos** (`acotada_guardiana.test.ts:14-52`). Eso es un punto ganado y está
verificado uno por uno abajo.

Lo que impide más de 5 es la respuesta a la pregunta de esta ronda —**¿bajó o
se duplicó?**—: bajó en quince de los dieciocho RPC y **se duplicó en tres**.
Dos de ellos cambiaron un barrido ACOTADO en JS por uno **sin cota** en SQL, y
el tercero deshizo, línea por línea, una optimización que el propio repo
documenta por escrito. El ancla del rubro sigue aplicando: *4 o menos si el
peor caso excede el límite y falla callado*; aquí el peor caso ya no falla
callado en el camino de WhatsApp (el presupuesto por invocación funciona), pero
sí en el panel fiscal y en la bandeja durable.

**El riesgo mayor hoy:** `gastos_fiscales_agregados_tenant` (0151) agrupa por
**el nombre del emisor tal como lo leyó el modelo de visión**
(`0151:128,142`). Esa columna es texto libre sin canonizar, así que el número
de celdas que devuelve no crece con las *dimensiones* —como declara su
JSDoc— sino con el **volumen de comprobantes**: el RPC que vino a dejar de
mandar millones de filas a JS puede mandar cientos de miles de celdas, cuatro
veces por carga, a la pantalla que el contralor cruza contra su contador.

---

## Verificación de los abiertos de la c3

Uno por uno, abriendo el archivo.

| Hallazgo de la c3 | Estado | Evidencia |
|---|---|---|
| CRÍTICO — 625 s de techos del piloto contra `maxDuration` 300 | **REINCIDENTE, y ahora peor de contar** | `piloto_vision.ts:58` `PASOS_MAXIMOS = 14`; `pagina_playwright.ts:118` `TOPE_LECTURA_MS = 3_000`; `cron/facturar/route.ts:219` `MARGEN_LOTE_MS = 150_000`, sin una línea de cambio. Lo que sí cambió: el modelo ya tiene techo (ver renglón siguiente), así que su aporte **entra en la suma** en vez de quedar fuera de ella. |
| CRÍTICO — la llamada de visión del piloto sin `signal` | **CERRADO en el techo por llamada, REINCIDENTE en la suma** | `openrouter.ts:24,46,47`: `TIMEOUT_LLM_MS = 30_000` y `maxRetries: 0` en `getClient()`. `piloto_vision.ts:363` **sigue sin `signal`** —no se ata al reloj de la invocación— pero ya no hereda los 600 s del SDK. Contra: `generateStructured` encadena hasta tres `attempt` (`openrouter.ts:545,553,564,571`), o sea **90 s por paso**. Ver hallazgo R-C4-8. |
| CRÍTICO — el ticket del piloto no sale nunca de la cola | **REINCIDENTE** | `agente.ts:274` y `al_vuelo.ts:492,664-665` sin cambio. |
| ALTO — el gasto del piloto no se registra en ningún lado | **REINCIDENTE** | `grep -rn "registrarCosto\|llm_costo" src/lib/likida/facturacion/ src/app/api/cron/facturar/` → **cero resultados**, igual que en la c3. |
| ALTO — la puerta de auth es el único eslabón sin techo | **REINCIDENTE, sin una línea** | Contado a mano hoy: `src/lib/auth/session.ts` 1 consulta / **0 `acotada`**; `tenant-efectivo.ts` 4 / **0**. Los tres archivos de `src/lib/auth/` siguen **fuera** de `acotada_guardiana.test.ts:14-52`, que ahora lista diecisiete. |
| ALTO — `traerTodo` al 96.1 % de su techo (Combustible & Casetas) | **CERRADO** | Las cuatro funciones que leían `gasto` entero son RPC: `getGastoPorConcepto` (`analytics.ts:1164`), `detectarAnomalias` (`:387`), `getStatsPorOperador` (`:354`), `getTopRutasPorGasto` (`:1243`). `traerTodo` en `analytics.ts`: **0**. El techo de 100,000 filas ya no lo toca ninguna pantalla del Resumen. *(Cambió de forma, no desapareció: ver R-C4-1 y R-C4-2.)* |
| ALTO — el cron de la bandeja quema un intento por mensaje que no procesó | **CERRADO en `sin_tiempo`, ABIERTO Y PEOR en `en_curso`** | `drenado.ts:97-105` llama `devolverIntentoPendiente` cuando el resultado es `'sin_tiempo'` — el hallazgo de la c3, cerrado con su comentario. Pero `'en_curso'` y `'reintentable'` caen en `anotarFalloPendiente` (`drenado.ts:107`) y **sí** consumen intento, y ahora hay veinte vueltas encadenadas por minuto para quemarlos. Ver R-C4-3. |
| ALTO — el único camino de LLM sin tope diario es el más caro (el cuadre) | **REINCIDENTE** | `grep -rn "gastoChatHoyUsd\|topeDiaUsd\|topeSondaDiaUsd"` → solo `api/dashboard/chat/route.ts:24` y `api/dashboard/ingesta/route.ts:31`. `processor.ts` y `agents/run.ts` no leen un solo tope de dinero. `MSGS_POR_MIN = 40` (`webhook/whatsapp/route.ts:16`) sigue siendo el único freno, y aplaza en vez de descartar. |
| ALTO — el cierre son 173.5 s de techos contra 17 s de reserva | **REINCIDENTE, idéntico** | `presupuesto.ts:39-62` sigue teniendo **18 pasos**; `COSTO_CIERRE_MS` = 14.0 s típicos; `MARGEN_CIERRE_MS = 17_000` (`:84`). Ningún paso del cierre consulta `alcanza()`. El propio JSDoc de `:78-83` sigue diciendo que `meta/client.ts` usa «`fetch` pelado» cuando ya no es cierto (`SEND_TIMEOUT_MS`), o sea que el texto contra el que alguien dimensionaría la reserva sigue desactualizado. |
| MEDIO — `oficina_wa.ts:159,166` sin `acotada` / timeout literal | **REINCIDENTE** | `oficina_wa.ts`: 5 consultas, **2** `acotada`. `talacha_wa.ts`: 9 / **5**. `processor.ts`: 5 / **2**. `costos.ts`: 5 / **4**. Ninguno entró a la guardiana. |
| MEDIO — loop-guard del piloto de un paso de memoria | **REINCIDENTE** | `piloto_vision.ts:169-171` sin cambio. |
| MEDIO — 15 capturas `fullPage` sin tope de dimensión | **REINCIDENTE** | `pagina_playwright.ts:512` `MAX_CAPTURA_B64 = 950_000`, `:747` sin cambio. |
| MEDIO — la caché de B17 ahorra viajes a la base, no tokens | **REINCIDENTE** | `openrouter.ts` sigue con `soportaCache = /anthropic\//`; los tres modelos del chat no lo son. |
| BAJO / nuevos del delta que sí bajaron costo | **CERRADOS y verificados** | `processor.ts:1244-1245`: el hash de la foto se calcula **siempre** (la bandera `LIKIDA_DEDUP_FOTOS` se retiró) y `gastoExistePorHash` corre **antes** de la llamada de visión — una foto reenviada ya no cuesta $0.015. `openrouter.ts:46` `maxRetries: 0` mata la escalera de nueve peticiones del SDK. `negocio.ts:228` caché de 60 s (`SEGUNDOS_CACHE_CONSOLA`) sobre `resumen_negocio` y `resumen_costo_ia`. |

---

## Hallazgos

### [CRÍTICO] El agregado fiscal agrupa por el nombre del emisor **tal como lo leyó el OCR**: el número de celdas no crece con las dimensiones, crece con los comprobantes

`supabase/migrations/0151_fiscal_agregado.sql:128,142,155` ·
`src/lib/likida/intake/ocr.ts:87,146,524` ·
`src/lib/likida/fiscal.ts:1116-1129,1146-1149,1190-1193`

El `group by` de la 0151 tiene **diecisiete llaves** (`:155`). Dos de ellas no
son dimensiones, son texto libre por comprobante:

- `:128` — `case when not b.tiene_cfdi then nullif(b.ocr_extra->>'emisor','') end`.
  Ese campo lo escribe `ocr.ts:524` (`emisor: sanitizarTexto(data.emisor)`) con
  lo que el modelo de visión leyó, y el prompt pide la razón social **«tal
  cual»** (`ocr.ts:146`). No hay `lower()`, ni `trim` más allá del `nullif`, ni
  catálogo. El propio `ocr.ts` deja escrito que estos campos «son justo los que
  el OCR leyó distinto en cada corrida sobre el mismo ticket».
- `:121` — `rfc_sin_cfdi`, un RFC por gasolinera/caseta de la ruta.

La cabecera de la migración afirma «**Cientos de celdas** en vez de millones de
filas» (`0151:21`) y el JSDoc de `getGastosFiscalesSeries` lo repite: «celdas
(acotadas por dimensiones, no por volumen)» (`fiscal.ts:1148`). **Nada en el
código acota nada.** No hay `limit`, no hay `having`, no hay normalización.

**Escenario, con los números del propio repo.** `docs/escala-50k/MAPA.md`
declara el objetivo: 3.6M gastos/año por flota. La pantalla «Recuperable
pidiendo factura» existe porque el ticket sin CFDI es la norma; a un 30 %
conservador son **1.08M comprobantes sin CFDI al año**. Si las cadenas de OCR
colapsan generosamente 20 a 1, eso es **54,000 celdas**; si el OCR varía por
ticket —que es lo que `ocr.ts` dice que pasa—, se acerca a **1.08M celdas**.
Cada celda sale como un objeto jsonb de **24 campos** (`0151:158-185`),
≈ 350–450 bytes: **19–43 MB** en el caso bueno, **380 MB+** en el malo, en UNA
respuesta de PostgREST. Y no es una llamada: `getGastosFiscalesSeries`
(`fiscal.ts:1190-1193`) dispara **tres** (7 d, 30 d y `'todo'` **sin cota**) más
la de `getGastosFiscales`, o sea **cuatro concurrentes**, en `/dashboard`
(`inicio-contenido.tsx:129,137`) y otra vez en `/dashboard/contador`.

`acotada` corta a los 8 s (`presupuesto.ts:113`), así que en la práctica no
llega la respuesta: `getGastosFiscalesSeries` falla **en bloque a propósito**
(`fiscal.ts:1196-1201` — «las tres o ninguna»), `safe()` lo atrapa, y el Motor
Fiscal entero queda en su estado vacío.

**Consecuencia:** la cifra que el contralor cruza contra su contador —«en
riesgo/perdido», «recuperable pidiendo factura»— desaparece de las dos
pantallas donde vive, en la flota grande, y el único rastro es un
`logger.error`. Antes de desaparecer, la función de Vercel intenta sostener
decenas de MB de JSON en memoria. La regla de la casa —«una estimación se puede
mostrar, declarada y con su supuesto»— se cumplió al revés: el supuesto
(«cientos de celdas») quedó escrito como un hecho en dos sitios.

**Causa raíz probable:** al elegir las dimensiones se copió la lista de lo que
`identificarComercio` *mira* por fila, sin separar lo que es un dominio cerrado
(concepto, forma de pago, estado SAT) de lo que es texto de un modelo
(`emisor`); `host` sí se pensó —se toma el host y no la liga entera,
«agrupar por ella no agruparía», `0151:123-126`— y a `emisor` no se le aplicó
el mismo razonamiento.

---

### [CRÍTICO] `anomalias_gasto_tenant` deshizo, en SQL, la optimización que `duplicados.ts` documenta por escrito haber quitado — y le sumó un re-barrido por grupo

`supabase/migrations/0150_agregados_analytics.sql:96-105,126-134,138,157-165,168-171` ·
`src/lib/likida/duplicados.ts:52-83`

`duplicados.ts:53-58` explica, con esas palabras, que la versión anterior
«materializaba el arreglo de TODOS los UUID del tenant —~20 000 en un año— en
cada vuelta y corría una búsqueda de subcadena por cada uno. **O(G × U)**», y
que se reescribió para «dejar de depender de cuántos comprobantes timbrados
tenga el tenant, que es lo único que crecía sin techo».

La 0150 la reintrodujo tal cual:

```sql
uuids as (select distinct uuid from filas where uuid is not null),   -- :138
...
where not exists (                                                    -- :168
  select 1 from uuids u
  where position(u.uuid in g.concepto || '|' || g.folio) > 0          -- :170
)
```

`position()` no es una igualdad, así que **no existe índice ni hash join que la
sirva**: es un anti-join por bucle anidado, exactamente O(G × U). (Leído del
SQL — aquí no hay Postgres para correr `EXPLAIN`.)

Y hay un segundo costo que el JS no tenía. `filas` (`:96-105`) se referencia
**cinco veces** (`cfdi_grupos`, la subconsulta de `:126-134`, `uuids`,
`folio_grupos`, la subconsulta de `:157-165`). Postgres 12+ **materializa** un
CTE con más de una referencia, y un CTE materializado no tiene índices: cada
subconsulta correlacionada de `:126-134` y `:157-165` es **un barrido completo
de los 3.6M de filas materializadas, por grupo de anomalía**.

**Escenario, con números.** Flota de 50k viajes/mes → 3.6M gastos/año
(`MAPA.md`). El detector encuentra, digamos, 200 grupos duplicados por CFDI y
200 por folio: 400 × 3.6M = **1.44 × 10⁹ visitas de fila**, más
|folio_grupos| × |uuids| llamadas a `position()` (con 200 grupos y ~1M UUID
distintos, **2 × 10⁸** comparaciones de subcadena). El JS que reemplazó hacía
**una sola pasada** con `Map`/`Set` sobre las mismas filas.

Esto corre **en cada carga** de cuatro pantallas —`/dashboard`
(`inicio-contenido.tsx:121`), `/dashboard/contador` (`inicio-contador.tsx:88`),
`/dashboard/combustible-casetas` (`page.tsx:130`) y
`/dashboard/notificaciones` (`page.tsx:40`)— **sin ventana de fecha** (el RPC
solo recibe `p_tenant`) y **sin caché**: `unstable_cache` existe en un único
archivo del repo, `src/lib/admin/negocio.ts`, y `/dashboard` no lo usa.

**Consecuencia:** `acotada` corta a los 8 s y las cuatro pantallas pintan su
estado vacío — o sea que **el detector de fraude entre viajes queda apagado
para el cliente más grande**, que es justo el hallazgo que la c3 levantó y que
esta migración vino a cerrar. Peor: el aborto es del `fetch`, no de Postgres
(no hay un `statement_timeout` en ninguna migración del repo —
`grep -rn "statement_timeout" supabase/ src/` → cero), así que la consulta
sigue quemando CPU de la base después de que nadie la escucha, y la carga
siguiente arranca otra.

**Causa raíz probable:** la migración se escribió como una traducción
*semántica* del oráculo puro (y la prueba de equivalencia comprueba justo eso:
que los resultados coincidan), no como una traducción de su **plan**. La
prueba de equivalencia no puede ver la complejidad.

---

### [CRÍTICO] La bandeja durable declara carta muerta un mensaje que otra invocación está procesando bien: `'en_curso'` quema intento y hay veinte vueltas por minuto para quemarlos

`src/app/api/cron/wa-pendientes/drenado.ts:26-32,68-69,85,91-108,127` ·
`src/lib/likida/wa_pendientes.ts:25,120-136,144-155` ·
`src/lib/likida/processor.ts:704-707` · `src/lib/likida/conv.ts:347,425-455` ·
`vercel.json` (`* * * * *`)

`pendientesPorDrenar` (`wa_pendientes.ts:120-127`) filtra por
`procesado_en is null` y `intentos < 5`, y **nada más**. No hay columna de
lease ni de «reclamado a las», al revés de `wa_mensaje_procesado`, que sí la
tiene (`completado_en`, mig. 0149). O sea: **una fila que otra invocación está
procesando ahora mismo vuelve a salir en la siguiente lectura**.

Lo que pasa entonces, paso a paso y todo verificado en el archivo:

1. `reclamarPendiente(p.id, p.intentos)` (`drenado.ts:85`) va anclado al valor
   que **esta** corrida leyó, así que si la anterior ya lo subió, el ancla casa
   con el nuevo valor y **el claim se gana igual**: `intentos` sube otra vez.
2. `processInbound` llama a `claimMessage`, que ve el wamid tomado y dentro del
   lease de `LEASE_CLAIM_MS = 150_000` (`conv.ts:347,432`) y devuelve
   **`'en_curso'`** (`processor.ts:704-706`).
3. `'en_curso'` cae en `anotarFalloPendiente` (`drenado.ts:107`), **no** en
   `devolverIntentoPendiente` —que solo cubre `'sin_tiempo'` (`:97-105`)—. El
   intento queda consumido por un mensaje que **se está procesando bien**.
4. Y el drenado se auto-reencola por QStash mientras `tomados >= LOTE`
   (`:127`), hasta `MAX_VUELTAS_QSTASH = 20` (`:32`), **vueltas que llegan
   segundos después de la anterior** porque una vuelta llena de `'en_curso'` no
   hace trabajo real.

**La aritmética.** `MAX_INTENTOS_PENDIENTE = 5` (`wa_pendientes.ts:25`). Una
foto que el webhook está procesando legítimamente —techo declarado del turno:
`esperarIntake` 20 s + `acquireViajeLock` 12 s + `runAgent` 40 s = **72 s**—
sube de `intentos` 1 → 2 (cron del minuto), → 3 (vuelta 2 de QStash), → 4
(vuelta 3), → **5 (vuelta 4)**. En la vuelta 5 `pendientesPorDrenar` ya la
excluye por `.lt('intentos', 5)`. **Cuatro vueltas, todas dentro de los 72 s en
que el mensaje sigue en vuelo.** La condición que lo dispara —que el lote salga
lleno— **es exactamente la condición para la que se diseñó ESC-1**.

Dos desenlaces:

- Si la invocación buena termina, sella `procesado_en` y no se pierde nada,
  pero `cartasMuertas()` (`drenado.ts:134-138`) ya gritó y ya mandó correo:
  *«N mensaje(s) de WhatsApp agotaron sus reintentos»* — una alerta falsa en
  cada ráfaga, sobre la única alerta que existe para este camino.
- Si la invocación buena muere (Vercel la mata a los 120 s con el PDF ya
  subido — ver el ALTO reincidente del cierre), la fila queda con `intentos = 5`
  y `procesado_en` nulo: **nunca vuelve a leerse**. La purga la borra a los 180
  días (`0155`). El comprobante se pierde en silencio, que es literalmente el
  fallo que la bandeja durable existe para impedir.

**Y cuesta dinero.** Cada retome que sí alcanza a arrancar vuelve a correr
`runAgent` completo con `anthropic/claude-sonnet-5` — el techo declarado del
turno son ~$0.34 (`run.ts:32,38` × `openrouter.ts:175`) contra la banda de
**$0.03–$0.05 por liquidación completa** de `models.ts:17`. Cinco intentos del
mismo mensaje son **$1.70**, y no hay un solo tope de dinero en ese camino
(reincidente arriba).

**Consecuencia:** el operador manda su fajo, el sistema lo procesa bien, y el
panel de escalaciones dice que cinco comprobantes murieron. El día que además
la invocación se pase de los 120 s, el comprobante desaparece de verdad.

**Causa raíz probable:** ESC-1 arregló el contador para el caso que el hallazgo
nombró (`'sin_tiempo'`) y multiplicó por veinte la frecuencia con que se lee la
bandeja, sin darle a la lectura una noción de «esto ya está en vuelo». Los tres
estados de `quedoPendiente` (`drenado.ts:37-39`) no significan lo mismo y se
tratan en dos montones, no en tres.

---

### [ALTO] El auto-reencolado cuenta filas **leídas**, no filas **reclamadas**: hasta 864,000 invocaciones/mes que la nota de costo no presupuesta

`src/app/api/cron/wa-pendientes/drenado.ts:69,86,127` ·
`docs/escala-50k/COSTO-VERCEL-50K.md:18-25,38-39,66-71`

`tomados = lote.length` (`:69`) es lo que devolvió `pendientesPorDrenar`, y la
condición de reencolar es `tomados >= LOTE` (`:127`). Entre las dos líneas está
`if (!claim) continue` (`:86`): una vuelta que **no logró reclamar ni una sola
fila** —porque otra cadena las tiene— igual ve `tomados = 40` y **igual encola
la vuelta siguiente**.

**La aritmética.** Con un rezago persistente de ≥ 40 filas sin sellar, cada
disparo del cron (`vercel.json`: `* * * * *`) puede encadenar hasta
`MAX_VUELTAS_QSTASH = 20` invocaciones: **60 × 20 = 1,200 invocaciones/hora**,
**864,000/mes**. `COSTO-VERCEL-50K.md:24` presupuesta **43,200** para esta ruta
y llama al total «**47,010 fijas**»; el reencolado aparece en el texto
(`:33-38`) pero **no tiene renglón de invocaciones en la tabla de §3**, solo un
rango de segundos («~30 k – 150 k») sin decir de cuántas invocaciones sale.
El techo real es **20× el presupuestado**, y la nota no lo declara ni como
MEDIDO ni como SUPUESTO — que es la única regla que esa nota se puso a sí
misma (`:9-12`).

**Consecuencia:** la línea de la cuenta que dice «se pagan aunque no haya un
solo cliente» puede multiplicarse por veinte en cuanto haya uno, y el primer
aviso sería la factura de Vercel. Y cada vuelta vacía son ~42 idas a Supabase
(1 select + hasta 40 `update` de claim + 1 `count`), o sea que el desperdicio no
es solo de invocaciones sino de conexiones del pooler.

**Causa raíz probable:** el patrón se copió de `facturar/cola`, donde el lote se
consume entero por definición; aquí el lote puede venir lleno de filas ajenas.

---

### [ALTO] La capa de auth sigue siendo el único eslabón sin techo, y ahora se le suman el Cerebro y dos módulos de /admin (REINCIDENTE + nuevo)

`src/lib/auth/session.ts:64-70,86-89` · `src/lib/auth/tenant-efectivo.ts:117,179,201,219` ·
`src/lib/admin/prospectos-mapa.ts:494-521,609-620,585-596` ·
`src/lib/admin/escalaciones.ts:51,88,119` · `src/lib/admin/soporte.ts` ·
`src/lib/likida/acotada_guardiana.test.ts:14-52`

Contado hoy, archivo por archivo (`.from(`/`.rpc(` contra `acotada(`):

| Archivo | Consultas | `acotada` | ¿En la guardiana? |
|---|---|---|---|
| `src/lib/auth/session.ts` | 1 | **0** | no |
| `src/lib/auth/tenant-efectivo.ts` | 4 | **0** | no |
| `src/lib/admin/prospectos-mapa.ts` | 6 | **0** | no |
| `src/lib/admin/escalaciones.ts` | 3 | **0** | no |
| `src/lib/admin/soporte.ts` | 2 | **0** | no |
| `src/lib/likida/processor.ts` | 5 | 2 | no |
| `src/lib/likida/oficina_wa.ts` | 5 | 2 | no |
| `src/lib/likida/talacha_wa.ts` | 9 | 5 | no |

La guardiana creció de 6 a 17 archivos y **cubrió bien el dashboard entero**
(`analytics`, `fiscal`, `comercial`, `clientes`, `facturacion_clientes`,
`operacion`, `viajes_registro`, `negocio`, `capacidad`,
`corridas-cruzadas`). Lo que quedó fuera es lo que corre **antes** que todo
eso.

**Escenario nuevo, con números:** `traerTodoEnParalelo`
(`prospectos-mapa.ts:494-521`) pide **hasta 6 páginas a la vez**
(`PAGINAS_EN_PARALELO = 6`, `:472`) sobre 33,065 prospectos = 34 páginas, y
**ninguna** de las seis lleva `AbortSignal`: heredan el default de undici,
**300,000 ms**. La ruta que las llama (`api/admin/mapa-prospectos/route.ts`) no
declara `maxDuration`. Una sola página colgada cuelga la petición hasta que
Vercel la mate, y el latido —cada 5 min por pestaña— vuelve a intentarlo.

**Consecuencia:** un blip de Supabase deja el Cerebro de ventas y las dos
consolas en una pantalla que nunca carga, sin log (el proceso muere antes del
`catch`). Es el mismo modo de falla que `acotada` existe para matar, en los
tres archivos por los que pasa todo.

**Causa raíz probable:** la guardiana es una lista a mano, y la lista se llenó
con los archivos que los hallazgos nombraron; los archivos nuevos de la ronda
(`prospectos-mapa.ts` creció 351 líneas en `4197bca`) nacen fuera de ella.

---

### [ALTO] Tres RPC del panel corren **sin ventana de fecha** y la 0150 lo dice sin sacar la conclusión: no hay índice que las sirva

`supabase/migrations/0150_agregados_analytics.sql:42-61,231-258,273-288,89` ·
`supabase/migrations/0153_resumen_negocio_rpc.sql:100-122`

La cabecera de la 0150 hace la lista honesta de qué índice sirve a qué
(`:42-61`) y admite que el grupo por folio de las anomalías «es, por
definición, un barrido de TODO el gasto del tenant». Lo que no dice es que hay
**tres** caminos así, no uno:

| RPC | Ventana | Índice utilizable | Filas a 50k viajes/mes |
|---|---|---|---|
| `anomalias_gasto_tenant` (`:89`) | **ninguna** | ninguno para el `group by (concepto, folio, monto)` | 3.6M/año |
| `gasto_por_concepto_tenant` (`:273`) | **ninguna** | `idx_gasto_acumulado` por prefijo (sirve el orden, no evita el barrido) | 3.6M/año |
| `top_rutas_gasto_tenant` (`:231`) en modo `historico` | **ninguna** (`analytics.ts:1281-1284` pasa `p_desde`/`p_hasta` nulos a propósito) | irrelevante: `gasto_tenant_fecha_idx` necesita la fecha que no se da | join 3.6M × 600k |

El tercero es el que la cabecera clasifica como «usa `gasto_tenant_fecha_idx`»
(`:56`) — y en la vista «histórico», que es una de las tres que
`getTopRutasPorGastoSeries` dispara **siempre**, no hay fecha que dar.

Cross-tenant, `resumen_negocio` (`0153:112,117`) hace dos `count(*)` **sin
filtro** sobre `viaje` y `gasto` más un `group by tenant_id` sobre `viaje`: tres
recorridos completos de las dos tablas más grandes por llamada. Aquí sí hay
mitigación real y verificada —`negocio.ts:228`, caché de 60 s— pero el trabajo
por *miss* es el mismo.

**Escenario:** la carga del Resumen dispara **al menos 25 peticiones
simultáneas** a PostgREST (`inicio-contenido.tsx:118-152`: 16 promesas, de las
que `getGastoPorSemanaSeries`, `getLiquidadoPorSemanaSeries`,
`getSeriesKpiCards`, `getGastosFiscalesSeries` y `getTopRutasPorGastoSeries`
abren **tres cada una** vía `porModo`, `analytics.ts:554-569`). De esas, seis
son barridos completos del año de `gasto` y dos de `viaje`. Todas con el mismo
tope de 8 s y contra el mismo pooler.

**Consecuencia:** a escala, la pantalla no se cae entera —cada bloque degrada
solo, que está bien hecho— pero varios bloques quedan vacíos de forma
intermitente y sin que nada en pantalla explique cuál. La regla de la casa
(«no se rellena con ceros que parezcan medición») se respeta; la de «el
rótulo es verdad» empieza a costar caro cuando la mitad del Resumen es
`EstadoVacio`.

**Causa raíz probable:** la regla de la campaña fue «solo índice si un EXPLAIN
lo justifica» y la base tiene 0 filas, así que ningún EXPLAIN pudo justificar
nada. La regla es correcta; lo que faltó es marcar los tres caminos sin ventana
como pendientes explícitos en vez de dejarlos dentro de la lista de «ya
servidos».

---

### [MEDIO] La búsqueda de `/dashboard/viajes` repite, en su propio predicado, el anti-patrón que la 0154 documenta para el cursor

`supabase/migrations/0154_viajes_registro_indices.sql:108-116,161,173,192,204,222,81-85`

La cabecera de la 0154 explica por qué la función es `plpgsql` y no
`language sql`: *«En una sola SELECT con `(p_cursor_id is null or …)` el plan
genérico pierde el índice»* (`:114-115`). Es un razonamiento correcto y
medido — y las tres ramas del cursor lo aplican.

El predicado de búsqueda, en cambio, quedó así en **las seis** ramas
(`:161,173,192,204,222`):

```sql
and (v_patron is null or v.folio ilike v_patron
     or v.origen ilike v_patron or v.destino ilike v_patron)
```

`v_patron` es una variable de plpgsql, o sea un parámetro para el planificador.
Bajo **plan personalizado** el `$1 is null` se pliega a `false` y el `BitmapOr`
sobre `viaje_busqueda_trgm_idx` entra; bajo **plan genérico** —al que plpgsql
pasa tras cinco ejecuciones si el costo estimado le conviene— la disyunción con
un `is null` no plegado **no es indexable** y vuelve el barrido que el índice
GIN vino a evitar. Es la misma trampa que la propia migración documenta, en el
mismo archivo, treinta líneas más abajo.

**Escenario:** el `EXPLAIN` de la propia migración midió ese barrido: *«Index
Scan por tenant + Filter, Rows Removed by Filter: 199,944 de 200,000, 1,095
ms»* (`:48-50`) sobre 200,000 viajes. A 600,000 (un año a 50k/mes) eso son
~3.3 s por tecleo del contralor en la caja de búsqueda, contra los 8 s de
`acotada`. La sexta búsqueda del día es la que puede caer del lado malo.

**Consecuencia:** la búsqueda de folio del registro de viajes —lo primero que
alguien hace cuando busca «el viaje del martes»— se vuelve intermitente sin
que nada cambie en el código.

**Causa raíz probable:** el trabajo se concentró en el keyset, que era el
hallazgo nombrado; el `ilike` entró como un `and` más.

*(No pude correr `EXPLAIN`: aquí no hay Postgres. Esto sale de leer el SQL y de
la propia cabecera de la migración.)*

---

### [MEDIO] «33 MB → 8.5 MB» mide el navegador; el servidor sigue leyendo y recorriendo lo mismo

`src/lib/admin/prospectos-mapa.ts:465-467,530-560,585-596,624-628` ·
`src/app/admin/mapa-prospectos/latido.ts:35` · commit `7305ee1`

El corte 1 del commit dice que `notas` (7.8 MB) y los mensajes redactados
(7.5 MB) salen del listado. Abierto el archivo: **`notas` sigue en
`COLUMNAS_LISTADO`** (`:466`), con su razón declarada («se sigue LEYENDO en el
servidor —de ella viven giroDe, tamanoDe, scoreUrgencia, completitudDe y el
filtro de duplicados»). O sea que de Supabase a Vercel siguen cruzando
**~25.5 MB** por carga completa (los 33 menos los 7.5 de mensajes), y el
servidor sigue construyendo 33,065 objetos y corriendo sobre cada uno cinco
funciones puras con expresiones regulares (`aProspecto`, `:530-560`). Lo que
bajó de 33 a 8.5 MB es la serialización **al cliente**, que es real y es la
mitad del hallazgo — pero el asunto del commit y el número que mide no son lo
mismo, y este rubro se califica por el número.

Dos cosas más del mismo camino:

- `contarMapa()` (`:585-596`) corre en **cada latido** (`:628`, rama `desde`) y
  hace `count exact` con `.ilike('notas','%DUPLICADO:%')`. `notas` no tiene
  índice de trigramas (`grep "trgm" supabase/migrations/*.sql` → solo `viaje`,
  `operador`, `cliente`, `unidad`), así que es un barrido de las 33,065 filas
  con comparación de subcadena sobre una columna TOASTed, cada 5 minutos por
  pestaña abierta.
- Las seis páginas paralelas van **sin `acotada`** (ver el ALTO de arriba).

**Consecuencia:** la parte cara —lectura, memoria de la función y CPU del
servidor— no bajó; el ahorro es de red y de parseo en el navegador de Javier.
Con `PAGINAS_EN_PARALELO = 6` sobre 34 páginas, la lectura sí bajó en latencia,
que es lo que el hallazgo original (el «se queda pasmado») pedía.

**Causa raíz probable:** el corte se diseñó contra el síntoma medido (el
payload al navegador) y `notas` no se pudo sacar porque cinco derivados
dependen de ella; nadie volvió a medir el otro lado.

---

### [MEDIO] `COSTO-VERCEL-50K.md`: el 90 % de la cuenta cuelga de un supuesto **puntual** dentro de una tabla de rangos, y la «capacidad por minuto» supone que veinte vueltas secuenciales caben en un minuto

`docs/escala-50k/COSTO-VERCEL-50K.md:38-39,48,62-76`

La nota se pone una regla —cada número dice si es MEDIDO o SUPUESTO— y la
cumple casi siempre. Dos cosas no aguantan la lectura como modelo financiero:

1. **S2 (`:48`) es un punto, no un rango**, y es el término dominante. La
   propia nota dice que «el webhook es el 90 % de la cuenta» (`:73`) y le da a
   S1 un rango de 2.3× (350 k – 790 k mensajes) mientras a la duración media le
   da **«~8 s»** a secas, derivada de una «mezcla 60/40» sin desglosar. Con los
   techos declarados del propio repo, una foto puede costar hasta 72 s
   (`presupuesto.ts:190-196`), y el `after()` del webhook **se factura**.
   Si la media real es 20 s en vez de 8, la línea del webhook pasa de
   1,360–3,070 GB-h a **3,400–7,700**, y el total de «≈1,440–3,300» a
   **≈3,500–7,900**. Un rango de 2.3× en el número pequeño y ninguno en el
   grande es un modelo cuyo resultado no acota nada.

2. **`:38-39` — «Capacidad por minuto: 40 × 20 = 800 mensajes, o sea
   48,000/hora».** Las veinte vueltas son **secuenciales**: cada una encola la
   siguiente **después** de que su pool termina (`drenado.ts:83-129`), y cada
   una tiene `maxDuration = 120`. Veinte vueltas encadenadas pueden tardar
   **hasta 40 minutos**, no un minuto. La capacidad real es del orden de
   40 mensajes por vuelta y ~1,200/hora por cadena, no 48,000 — el mismo orden
   de magnitud que el caudal de entrada que ESC-1 midió (490–1,100/hora), o sea
   que el margen es de una vez, no de cuarenta.

**Consecuencia:** dos decisiones que se toman con esta nota —«¿aguanta el
caudal?» y «¿cuánto va a costar?»— se apoyan en un factor 40 de más en la
primera y en un rango que no cubre el caso malo en la segunda. Para el resto,
la nota es honesta y sus §4 y §5 están bien puestos.

**Causa raíz probable:** §1 se escribió leyendo las constantes (`LOTE`,
`MAX_VUELTAS_QSTASH`) y multiplicándolas, sin leer el bucle que las usa.

---

### [MEDIO] `carga_operadores_tenant` calcula un `exists` por viaje que solo se lee para los vivos

`supabase/migrations/0152_agregados_comercial_operacion.sql:509-526`

El CTE `v` calcula `con_pod` (`:511`) y `con_incidencia` (`:512`) para **todas**
las filas que pasan el `where` (`:513-516`): los vivos **más** los liquidados de
`p_desde` en adelante (el llamador manda 90 días). Pero `con_pod` solo se usa
dentro de `count(*) filter (where estatus in ('abierto','en_cuadre') and not
con_pod)` (`:524`) — o sea, **nunca para un liquidado**.

**La aritmética:** a 50k viajes/mes, 90 días son ~150,000 viajes liquidados.
Cada uno paga un `exists` sobre `pod` (`pod_viaje_unico`, 0047:151) que no se
va a leer: **150,000 sondas de índice de más** por carga de
`/dashboard/despacho` (`page.tsx:54`) y de `/dashboard` operación
(`inicio-operacion:80`). No revienta nada —son sondas por índice— pero es
trabajo del que la propia migración presume haberse quitado (`:480-486`).

**Consecuencia:** unas décimas de segundo por carga que no compran nada, en dos
pantallas que el encargado abre todo el día.

---

### [MEDIO] El pre-chequeo del hash de foto es más estrecho que el índice que la va a rechazar: se paga la llamada de visión y se tira

`src/lib/likida/repo.ts:323-333,335-343` · `src/lib/likida/processor.ts:1244-1245,1592-1593`

`gastoExistePorHash` filtra por `.eq('viaje_id', viajeId)` (`repo.ts:328`) y
corre **antes** del OCR (`processor.ts:1245`) — ése es el arreglo bueno de esta
ronda. Pero el índice que de verdad rechaza es `uq_gasto_img_hash`, que es
`unique(tenant_id, img_hash)`, **toda la flota** (`processor.ts:1593` lo dice
con mayúsculas). El propio `repo.ts:336-343` documenta el desfase.

**Escenario:** el chofer reenvía en el viaje B un ticket que ya registró en el
viaje A (pasa cada vez que abre viaje nuevo y «pone al día» sus fotos). El
pre-chequeo por viaje dice «no está», se **paga la llamada de visión
(~$0.015)**, y la inserción rebota con 23505 en `:1592`. A 50k viajes/mes son
300,000 comprobantes; con un 1 % de reenvíos cruzados son 3,000 llamadas
tiradas al mes = **~$45/mes** por flota, invisibles en `/admin/consumo` porque
sí se registran como costo legítimo.

**Consecuencia:** margen que se va sin que ninguna pantalla lo nombre. El
arreglo está a una línea de distancia (`ubicarGastoPorHash` ya busca en toda la
flota, `repo.ts:335`), solo que se llama después del OCR y no antes.

---

### [BAJO] `piloto_vision`: ahora que el modelo tiene techo, la suma del vuelo se puede escribir — y son ~1,890 s contra 300

`src/lib/llm/openrouter.ts:24,46-47,545,553,564,571` ·
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:58,363` ·
`src/app/api/cron/facturar/route.ts:36,219`

La c3 no pudo sumar la cadena A porque «el modelo no tiene techo». Ya lo tiene:
`timeout: 30_000` y `maxRetries: 0` (`openrouter.ts:46-47`). Con eso la suma
por fin existe, y sale peor de lo declarado:

| Componente | Techo | Fuente |
|---|---|---|
| lectura + captura + acción por paso | 41.5 s | c3, sin cambio (`pagina_playwright.ts:118`, `piloto_vision.ts:672-686`) |
| llamada de visión por paso | **90 s** (3 `attempt` × 30 s) | `openrouter.ts:545,553,564,571` |
| **por paso** | **131.5 s** | |
| × `PASOS_MAXIMOS = 14` | **1,841 s** | `piloto_vision.ts:58` |
| + abrir y captura final | **+44.5 s** | |
| **Un vuelo, UN ticket** | **≈ 1,886 s** | contra `maxDuration = 300` (`cron/facturar/route.ts:36`) → **6.3×** |

`MARGEN_LOTE_MS` sigue en 150,000 (`:219`), dimensionado sobre «~147 s el peor
caso de UNA sesión» del adaptador escrito, no del piloto.

**Se marca BAJO y no CRÍTICO** porque la palanca `FACTURACION_PILOTO` sigue
apagada por default y el cron respeta `estaApagado('agente:facturas')`: hoy
nada de esta cadena corre. El día que se encienda vuelve a CRÍTICO tal cual.

---

## Lo que revisé y está bien

- **`analytics.ts` de verdad se vació.** `grep -n "traerTodo[<(]"` sobre el
  archivo: **cero**. Los once agregados salen por `leerRpc0150`
  (`analytics.ts:40-46`), que envuelve **cada** `.rpc` en `acotada` y valida la
  FORMA fila por fila antes de devolver. Es el patrón correcto y está aplicado
  once veces sin excepción.
- **El keyset de la 0154 es trabajo medido, no supuesto.** La cabecera trae
  tres `EXPLAIN` con buffers y milisegundos (`:20-46`), explica por qué el
  `.or()` de PostgREST **no** sirve y por qué el `nulls last` explícito es
  obligatorio en cada rama. `viajes_registro.ts:136-146` lo consume con cursor
  opaco validado (`:55`) y `viajes/page.tsx:49-53` degrada `?p=N` a la primera
  página en vez de resucitar el OFFSET. Este es el mejor cambio de la ronda.
- **ESC-9 murió de verdad.** `pmf.ts:137-140` es **una** llamada a
  `senales_pmf` con `acotada`; `0162:70-123` agrupa los siete conteos en un
  `group by tenant_id`. Los 7 × N `count exact` sin pool ya no existen.
- **La caché de la consola está bien puesta y bien acotada.**
  `negocio.ts:82-127`: 60 s, con el guard de `NEXT_RUNTIME` para que las
  pruebas no memoricen entre casos, y con la razón escrita como decisión de
  producto y no de rendimiento.
- **El dedup de foto ahorra dinero de verdad, y en el orden correcto.**
  `processor.ts:1227-1245`: el SHA-256 se calcula **siempre** (la bandera de
  entorno se retiró entera, con su explicación) y la consulta de existencia
  corre **antes** de la llamada de visión.
- **`0151` es la decisión correcta mal parametrizada.** Dejar la ley fiscal en
  TS y bajar solo la reducción es exactamente lo que había que hacer, y los
  tres juicios no categóricos (tope de efectivo por fila, proporción de
  alimentación por día, plazo del portal por bandas) están resueltos sin
  duplicar una sola regla en SQL (`0151:36-52`). El problema es una llave del
  `group by`, no el diseño.
- **`porModo` ya no tumba las tres vistas por una** (`analytics.ts:554-569`,
  `allSettled` + log por modo) y `getGastosFiscalesSeries` **falla en bloque a
  propósito** en vez de rellenar con `[]` (`fiscal.ts:1196-1201`) — que es la
  regla de la casa aplicada donde duele.
- **`conteos_viajes_tenant`** (`0154:247-263`) baja cinco `count exact` a un
  barrido; la migración admite que sigue siendo O(n) en vez de presumir lo
  contrario.
- **Los dieciocho RPC llevan `revoke all ... from public, anon, authenticated`
  y `SECURITY INVOKER`** salvo la de Storage, que lo justifica. Busqué un
  `SECURITY DEFINER` que agregue sobre `viaje` sin necesitarlo y no lo hay.
- **La suite:** `npx vitest run` → **485 archivos, 6,248 pruebas, 1 saltada**,
  125 s. **Un fallo intermitente**:
  `src/lib/likida/cuadre/guardia.test.ts > guardiaCifras > FAIL-CLOSED` falla
  bajo la concurrencia de la corrida completa y pasa **3 de 3** veces aislado.
  No es de este rubro, pero queda anotado.

---

## Lo que NO alcancé a revisar

- **Ni un `EXPLAIN`, ni una medición.** No hay Postgres aquí y `npm run build`
  está prohibido. Todo lo que digo de planes de consulta —la materialización
  del CTE de la 0150, el anti-join por `position()`, el plan genérico del
  `ilike` de la 0154— **sale de leer el SQL y los índices**, no de correrlo.
  Las únicas mediciones que existen en el repo son las tres del `EXPLAIN` de la
  0154 (tabla temporal de 400,000 viajes) y las de `docs/demo-5k.md`.
- **La cardinalidad real de `emisor`.** El hallazgo CRÍTICO 1 se apoya en que
  el texto del OCR no colapsa; el factor de colapso real solo se mide contando
  `count(distinct ocr_extra->>'emisor')` contra `count(*)` en producción. Con
  la base en cero, no se puede. Lo declaro como lo que es: el rango que doy
  (54,000 a 1.08M celdas) es una estimación con su supuesto a la vista.
- **El `maxDuration` efectivo de las páginas y de las rutas sin declararlo.**
  Sigue sin estar escrito en ningún archivo del repo, `vercel.json` no trae
  bloque `functions`, y ninguna de las ~31 páginas del `/dashboard` lo declara.
  Varias cadenas de arriba se quedan sin límite contra el cual compararse.
- **Si `service_role` tiene `statement_timeout` en este proyecto de Supabase.**
  El repo **no** lo fija en ninguna migración (verificado con grep), así que el
  único techo que puedo demostrar es el del cliente (`acotada`), que aborta el
  `fetch` pero no la consulta. Si la plataforma lo pone por su cuenta, el
  agravante que describo en el CRÍTICO 2 (consultas que siguen quemando CPU tras
  el aborto) se cae; el resto del hallazgo no.
- **El bundle con Chromium** del cron de facturación y su arranque en frío.
- **`0158` (integridad fiscal, 723 líneas) y `0159` (RPC atómicas, 507)** los
  leí solo por encima buscando barridos; los revisó datos/fiscal.
- **El costo de las corridas del organigrama de agentes** (`agente_corrida`):
  `0162:268` les puso índice por `inicio`, pero no sumé sus techos.
