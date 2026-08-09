# Rendimiento y costo — auditoría 17 (pase 2)

**Nota: 4/10** (antes 5). Razón del movimiento: **deuda que cobró factura, y encima
regresión nueva en el camino del demo**. Ninguno de los nueve hallazgos del pase 1
se cerró. Dos empeoraron por código escrito en este mismo pase: el CRÍTICO del
cierre creció 500 ms sin que el margen se moviera (se anotó el paso, se subió el
costo, se dejó la reserva igual), y el cron `escalar` —que ya no cabía en su
`maxDuration`— recibió un SEGUNDO lote de 100 viajes encadenado detrás del
primero. Y el rework del dashboard del dueño, que es el foco de este pase,
multiplicó por ~3 las consultas de la pantalla que el contralor abre en la sala:
de ~65 viajes de red a **214**, con **cinco barridos completos de `gasto`** donde
antes había tres, en un archivo donde **`acotada` no aparece ni una vez** y en una
página que **no declara ningún límite de tiempo**.

**El riesgo mayor hoy:** `/dashboard` es la única superficie caliente del producto
sin un solo número escrito contra el cual medirla — ni `maxDuration`, ni
`TOPE_CONSULTA_MS`, ni caché. Sus 214 consultas heredan los 300 s de undici. Un
socket que acepte y calle en cualquiera de ellas cuelga la primera pantalla del
comprador, y no hay un límite en el repo que alguien pueda citar para decir que
eso está mal.

---

## Estado de los hallazgos del pase 1

| # | Hallazgo del pase 1 | Estado hoy | Evidencia |
|---|---|---|---|
| 1 | **CRÍTICO** — el cierre no cabe en `MARGEN_CIERRE_MS` | **ABIERTO Y PEOR** | `a30f7b0` anotó `createSignedUrl del PDF del contralor` (`presupuesto.ts:53`) → `COSTO_CIERRE_MS` pasó de 8 900 a **9 400** ms. `MARGEN_CIERRE_MS` sigue en **12 000** (`presupuesto.ts:79`). `avisarCierreAlJefe` sigue fuera de la tabla — el propio comentario de `:50-52` lo admite por escrito. Suma nominal: **13 700 ms** (antes 13 200). |
| 2 | **ALTO REINCIDENTE** — la mig. `0084` no la llama nadie | **ABIERTO, IDÉNTICO** | `grep -rn "sumar_combustible_ejercicio" --include=*.ts` → **una sola línea, y es el string de un test** (`migraciones_verificadas.test.ts:57`). Cero `.rpc(...)`. `getAcumuladoCombustible` (`repo.ts:803-864`) sigue con `PAGINA = 1_000` / `MAX_PAGINAS = 100` y su `for` secuencial en `:819`. **La 0084 sigue sin llamarse: cuarta ronda.** |
| 3 | **ALTO** — `/api/cron/escalar`: 100 viajes en serie contra 120 s | **ABIERTO Y PEOR** | `c5a7c19` añadió un SEGUNDO bloque secuencial (`escalar/route.ts:78`) con su propio `.limit(100)` y su propio `for` sin reloj. Ver hallazgo R3. |
| 4 | **ALTO** — el Resumen barre `gasto` entero 3 veces | **CAMBIÓ DE FORMA, PEOR** | `getGastoPorConcepto`/`getGastoPorRuta`/`getOperadoresDetalle` salieron de la landing (bien). En su lugar entraron 12 llamadas nuevas que hacen **14 barridos de `gasto`**, 5 de ellos completos. El barrido doble por carga sigue: `page.tsx:102` y `api/dashboard/asistente/route.ts:77` llaman los dos a `detectarAnomalias`. Ver R1. |
| 5 | **ALTO** — N+1 sin tope en el CFDI consolidado | **ABIERTO, IDÉNTICO** | `consolidado.ts:259-270`: el `for (const r of resultados)` con `await ligarLineaAGasto` dentro sigue intacto, sin tope de líneas y sin reloj. |
| 6 | **MEDIO** — QStash corta a 150 s del presupuesto viejo | **ABIERTO, IDÉNTICO** | `cola/route.ts:11` = `600`; `facturar/route.ts:129` sigue siendo `PRESUPUESTO_LOTE_MS = maxDuration * 1000` con el `maxDuration = 300` del cron (`:25`). |
| 7 | **MEDIO** — la foto va a visión sin redimensionar | **ABIERTO, IDÉNTICO** | `ocr.ts:253-260` sigue pasando `images: [principal]` crudo; `openrouter.ts:381-384` sigue adjuntando `image_url: { url }` sin `detail` ni preproceso. |
| 8 | **MEDIO** — `cola/route.ts` declara 600 s contra el techo verificado de 300 | **ABIERTO, IDÉNTICO** | `cola/route.ts:11` vs `webhook/whatsapp/route.ts:69-71`. `vercel.json` sigue sin bloque `functions`. |
| 9 | **BAJO** — 12 de 14 `traerTodo` no piden `conteo()` | **ABIERTO Y PEOR** | De los **29** `traerTodo` que dispara la landing hoy, **25 no piden `conteo()`** (los 4 que sí son los de `fiscal.ts:731`). Son 25 páginas vacías pagadas por carga. |

**Cerrado: 0 de 9.**

---

## La suma del peor caso

Costos unitarios: los que el propio repo escribe (`presupuesto.ts:35`) — 0.3 s una
consulta, 1.5 s un `sendText`, 2.5 s un `sendDocument`, 0.5 s una URL firmada.
Techos: `TOPE_CONSULTA_MS = 8_000` (`presupuesto.ts:108`, solo donde se usa
`acotada`), `SEND_TIMEOUT_MS = 10_000` (`meta/client.ts:17`), y el default de
undici (**300 000 ms**) donde no hay ninguno de los dos.

| # | Tramo | ms nominales | Límite escrito | archivo:línea del límite | ¿Cabe? |
|---|---|---|---|---|---|
| A | **Cierre feliz del webhook**, nominal: `COSTO_CIERRE_MS` 9 400 − 300 (guardia usa snapshot) + `avisarCierreAlJefe` (0.3 `telefonoJefeDe` ‖ 0.3 `resumenDeCierre` + 1.5 sendText jefe + 2.5 sendDocument jefe = 4 600) | **13 700** | `MARGEN_CIERRE_MS = 12_000` | `presupuesto.ts:79` | **NO** — 1 700 ms de más, sin que nada salga lento |
| B | **Cierre en techos**: 9 pasos Supabase con `acotada` (9×8 000) + 3 Meta (3×10 000) + `telefonoJefeDe` **sin acotada** (300 000) + `resumenDeCierre` **sin acotada** (300 000) + 2 envíos al jefe (2×10 000) | **722 000** | `maxDuration = 120` | `webhook/whatsapp/route.ts:77` | **NO** — 6× la invocación entera |
| C | **`/api/cron/escalar`**, nominal: `escalarViajesSinAceptar` 100 × 3.3 s = 330 000 **+** `enviarRecordatoriosComprobacion` 300 + 100 × 1.8 s = 180 300 (secuenciales) | **510 300** | `maxDuration = 120` | `cron/escalar/route.ts:11` | **NO** — 4.25×; muere en el viaje ~36 del PRIMER lote |
| D | **`/api/cron/escalar`**, solo el recordatorio nuevo, aislado | **180 300** | 120 000 | `cron/escalar/route.ts:11` | **NO** — no cabe ni él solo |
| E | **`/dashboard` (Resumen del dueño)**, 1 año a 66 comprobantes/día (24 090 `gasto`, 960 `viaje`, 960 `liquidacion`) | **214 viajes de red**, ~167 900 filas; cadena secuencial más larga **26 páginas** = 7 800 ms nominales | **ninguno** — la página no declara `maxDuration` y ninguna consulta pasa por `acotada` | `src/app/dashboard/page.tsx` (no hay línea: no existe) | **No se puede decir** — y eso es el hallazgo |
| F | **`/dashboard`** al volumen que el propio archivo llama de diseño (660/día → 240 900 `gasto`/año) | 5 barridos completos × 100 páginas = **500 viajes de red desperdiciados**, y los 5 lanzan `LecturaIncompleta` | `MAX_PAGINAS = 100` | `pg.ts:47` | **NO** — 5 de las 12 secciones se apagan a la vez |
| G | **CFDI consolidado en el webhook**: 1 `UPDATE` por línea, sin tope | 400 líneas × 300 = **120 000**; en techo 400 × 8 000 = 3 200 000 | 120 000 | `webhook/whatsapp/route.ts:77` | **NO** a partir de ~400 líneas |
| H | **Worker QStash**: 2 flotas × ~147 s | **294 000** usados | 600 000 declarados, corte real a 150 000 | `cola/route.ts:11` vs `facturar/route.ts:129` | Cabe, pero procesa **2 de 8** |

---

## Hallazgos

### [CRÍTICO · REINCIDENTE, AGRAVADO] El cierre del webhook creció 500 ms y su reserva no se movió: 13 700 ms nominales contra 12 000
`src/lib/likida/presupuesto.ts:53` (paso nuevo) · `:61` (`COSTO_CIERRE_MS`) · `:79` (`MARGEN_CIERRE_MS`)
· `src/lib/likida/processor.ts:2178,2190` · `src/lib/likida/avisar_cierre.ts:52-57,95,103,109,127`
· `src/lib/likida/contactos.ts:118`

**Escenario, con números.** El commit `a30f7b0` hizo lo que el archivo pide —anotar
el paso nuevo (`createSignedUrl del PDF del contralor`, `processor.ts:2178`)— y
`COSTO_CIERRE_MS` subió de 8 900 a **9 400 ms**. `MARGEN_CIERRE_MS` sigue en
**12 000**. El paso que faltaba en el pase 1 sigue faltando: `avisarCierreAlJefe`
(`processor.ts:2190`) no está en `PASOS_CIERRE`, y son cuatro viajes de red más:

```
COSTO_CIERRE_MS (14 pasos, presupuesto.ts:61)          9 400 ms
 − guardiaCifras→cuadrarDesdeDB (snapshot, camino feliz) −300
 + telefonoJefeDe        contactos.ts:118                 300
 + resumenDeCierre       avisar_cierre.ts:52-57 (2 en ‖)  300
 + sendText al jefe      avisar_cierre.ts:109           1 500
 + sendDocument al jefe  avisar_cierre.ts:127           2 500
                                                    ──────────
                                                      13 700 ms  vs MARGEN_CIERRE_MS = 12 000
```

Como `restante() = 120 000 − 12 000 − transcurrido` (`presupuesto.ts:222`), el
agente puede devolver legítimamente en t = 108 000 ms. Cierre nominal → **t =
121 700 ms** contra `maxDuration = 120` (`webhook/whatsapp/route.ts:77`). Y desde
`processor.ts:1853` —el último `reloj.acotar()` del archivo— **nada del cierre
vuelve a consultar el reloj**: `grep -n "reloj\." processor.ts` no devuelve una
sola línea después de 1853.

Los dos pasos nuevos que faltan son además los únicos del cierre **sin techo de
ninguna clase**: `telefonoJefeDe` (`contactos.ts:118`) y `resumenDeCierre`
(`avisar_cierre.ts:52`) llaman a `supabaseAdmin()` en crudo, sin `acotada`, así
que heredan los 300 000 ms de undici. Uno solo de ellos colgado son 300 s contra
una invocación de 120.

**Consecuencia.** Vercel mata la función con la liquidación ya escrita y el
`viaje` ya `liquidado`. `saveConversation` (`processor.ts:2217`) no corre → el
turno se pierde y el agente vuelve sin memoria de haber cerrado. `releaseViajeLock`
(`:2267`, en el `finally`) no corre → el lease queda tomado. Y el contralor —el
comprador— no recibe ni el aviso de cierre ni el PDF, que es justo el documento
que `avisar_cierre.ts:14-19` dice existir para entregarle. No hay log: el proceso
muere antes del `catch`. Meta tiene su 200 desde `route.ts` y no reintenta.

**Causa raíz probable.** La prueba que custodia la reserva es un checksum
(`presupuesto.test.ts:106-119`: `toHaveLength(14)` + `MARGEN ≥ COSTO`), y por
construcción no puede ver un paso que nadie anotó. Al subir el costo sin subir el
margen, la holgura pasó de 3 100 a 2 600 ms — la prueba siguió verde porque solo
exige `MARGEN ≥ COSTO + masCaro × 0.5` (= 10 650).

---

### [ALTO] Una carga de `/dashboard` dispara 214 consultas y barre `gasto` completo cinco veces — y el 60% de ese trabajo es para vistas que el usuario no está mirando
`src/app/dashboard/page.tsx:95-127` (12 llamadas en `Promise.all`)
· `analytics.ts:170-180` (`getSeriesKpiCards` → 3 × `getSerieComparativa` = **9** `traerTodo`)
· `analytics.ts:432-442` (`getGastoPorSemanaSeries` = 3) · `:489-499` (`getLiquidadoPorSemanaSeries` = 3)
· `analytics.ts:1023-1039` (`getTopRutasPorGastoSeries` = 3 × 2 = 6) · `:509-519` (`getViajesPorMes`)
· `fiscal.ts:826-848` (`getGastosFiscalesSeries` = 3 × `getGastosFiscales`)

**Escenario, con números.** Escenario: flota de 20 unidades, un año operando,
**66 comprobantes/día** — la décima parte del volumen que el propio archivo llama
de diseño (`analytics.ts:648`: *"~660 comprobantes al día, ~240 mil al año"*). Eso
son 24 090 filas de `gasto`, 960 de `viaje`, 960 de `liquidacion`. Las 12 llamadas
del `Promise.all` se resuelven en **29 `traerTodo` + 4 `.in()` + 2 sueltas**, y
cada `traerTodo` pagina **secuencialmente** de 1 000 en 1 000 (`pg.ts:46,152`):

```
gasto        14 barridos → 178 viajes de red, 158 928 filas
  detectarAnomalias        SIN filtro de fecha     24 090 → 26 páginas
  getGastoPorSemana(52)                            24 024 → 26
  getSerieComparativa(3650)                        24 090 → 26
  getGastosFiscalesSeries.historico  ('todo')      24 090 → 25
  getTopRutasPorGasto.historico   SIN ventana      24 090 → 26
  + 9 barridos con ventana (7d…221d)                      → 49
viaje         7 barridos →  14 viajes de red,   4 995 filas
liquidacion   8 barridos →  16 viajes de red,   3 984 filas
+ getViajes(100) 1 + getConfig 1 + 4 × viaje.in() 4
                                    ─────────────────────────
                                    214 viajes de red · ~167 900 filas
```

Los cinco barridos completos de `gasto` traen **la misma tabla cinco veces en la
misma request**, y cuatro de ellos piden un subconjunto estricto de columnas del
quinto: `COLUMNAS` de `fiscal.ts:698` ya incluye `viaje_id, concepto, monto,
fecha, folio, cfdi_uuid` — exactamente lo que necesitan `detectarAnomalias`
(`analytics.ts:271`), `getSerieComparativa.gasto` (`:107`), `getGastoPorSemana`
(`:388`) y `getTopRutasPorGasto.gasto` (`:981`). Es trabajo repetido, no trabajo
distinto.

Y el reparto importa: **`PanelPeriodo`, `KpiPeriodo` y `MotorFiscalPeriodo` son
Client Components** (`'use client'` en `panel-periodo.tsx:1`, `kpi-periodo.tsx:1`,
`motor-fiscal-periodo.tsx:1`) que reciben las TRES vistas ya resueltas y cambian
en el navegador. O sea: el modo "Histórico" —el más caro, el que dispara los cinco
barridos completos— **se paga en cada carga aunque nadie toque el selector**. De
los 214 viajes de red, 128 (60%) son de vistas que el usuario probablemente no
verá.

`getTopRutasPorGasto` (`analytics.ts:987-990`) es el caso más claro: su consulta
de `viaje` **nunca recibe la ventana**, ni siquiera en el modo semanal, así que
`getTopRutasPorGastoSeries` barre la tabla `viaje` completa **tres veces** para
pintar 5 barras.

**El límite contra el que medirlo no existe.** `src/app/dashboard/page.tsx` no
exporta `maxDuration` — y ninguna página del repo lo hace (`grep -rn maxDuration
src/app/` devuelve 6 rutas de API y cero páginas). `vercel.json` no trae bloque
`functions`. La cadena secuencial más larga son 26 páginas × 0.3 s = **7.8 s
nominales**, dentro del default de plataforma (10 s Hobby / 15 s Pro; el repo
verificó plan Pro en `webhook/whatsapp/route.ts:69-71`) — pero solo a este
volumen: a 50 páginas por barrido (50 000 filas de `gasto`, o sea **el mes 2.5 al
volumen de diseño**) la cadena son 15 s y la página se corta a media carga. Y
`acotada` **no se usa ni una vez** en `analytics.ts`, `fiscal.ts` ni `pg.ts`
(`grep -n acotada` sobre los tres devuelve un comentario que dice *"acotada a las
plazas más comunes"*): las 214 consultas heredan los 300 000 ms de undici.

**Consecuencia.** Al volumen de diseño (240 900 `gasto`/año), `traerTodo` lanza
`LecturaIncompleta` a las 100 páginas (`pg.ts:47,181`) y ahora **lanza en cinco
sitios a la vez**, no en uno: `safe()` (`page.tsx:37`) se los traga y devuelve
`null`, así que KPIs, Motor fiscal, Gasto por categoría, Top rutas y Actividad se
apagan simultáneamente en la primera pantalla del comprador, sin decir por qué —
después de haber quemado 500 viajes de red inútiles. Es la caducidad que la mig.
`0064` se escribió para eliminar de esta misma página, reintroducida por
quintuplicado.

**Causa raíz probable.** El selector Semanal/Mensual/Histórico se implementó
resolviendo las tres vistas en el servidor y mandándolas juntas al cliente (para
que el switch sea instantáneo), y cada vista se construyó como una llamada
independiente a la función que ya existía, en vez de una lectura del rango más
ancho bucketeada en memoria — que es exactamente el patrón que
`getSerieComparativa` documenta y aplica bien en `analytics.ts:78-80` ("UNA SOLA
CONSULTA POR TABLA, no `pasos` consultas") y que `getSeriesKpiCards` deshace tres
líneas más abajo llamándola tres veces.

---

### [ALTO · REINCIDENTE, CUARTA RONDA] La migración `0084` sigue sin que nadie la llame: el barrido anual del 15% pagina igual que hace cuatro rondas
`supabase/migrations/0084_sumar_combustible_ejercicio.sql:11`
· `src/lib/likida/repo.ts:803-864` · `src/lib/likida/cuadre/desde_db.ts` · `src/lib/likida/migraciones_verificadas.test.ts:57`

**Verificado en el árbol de hoy:** `grep -rn "sumar_combustible_ejercicio"
--include=*.ts .` devuelve **una sola coincidencia, y es el texto de un test**.
No existe ningún `.rpc('sumar_combustible_ejercicio', …)`. **La 0084 sigue sin
llamarse.**

**Escenario, con números.** `getAcumuladoCombustible` (`repo.ts:803`) sigue siendo
el bucle de `:819`: `PAGINA = 1_000`, `MAX_PAGINAS = 100`, páginas **secuenciales**,
cada una envuelta en `acotada` (`:820`, 8 000 ms de techo). Una flota con 9 000
cargas de diésel en el ejercicio = **10 viajes de red seguidos**, 3 000 ms
nominales y **80 000 ms en techos**, dentro de un turno que `processor.ts:1853`
acota a 40 000 ms y de una invocación de 120 000. Corre por dos caminos calientes:
`cuadrarDesdeDB` (todo cierre) y la tool `consultar_periodo`.

**Consecuencia.** La operación fiscal más cara del cierre sigue costando N viajes
de red que crecen con el histórico del cliente. A 100 000 cargas lanza, y el
contador del 15% (RFA 2026 regla 2.9) se apaga con un `warn` dejando el efectivo
marcado "a revisar" en la liquidación que el contralor está mirando. Y
`migraciones_verificadas.test.ts:57` sigue afirmando en verde *"si falta,
getAcumuladoCombustible lanza ruidoso en el primer cuadre (el RPC no existe)"* —
una frase falsa sobre una función que no invoca ningún RPC, y es la línea que hace
que este hallazgo se lea como cerrado cuatro rondas seguidas.

---

### [ALTO · REINCIDENTE, AGRAVADO] `/api/cron/escalar` ahora encadena DOS lotes de 100 viajes con envíos: 510 s nominales contra 120 — y el recordatorio nuevo nunca llega a correr
`src/app/api/cron/escalar/route.ts:11` (`maxDuration = 120`) · `:67-84` (los dos bloques, secuenciales)
· `src/lib/likida/escalar_viaje.ts:92` (`.limit(100)`) · `:192-278` (el `for`)
· `src/lib/likida/recordatorio_comprobacion.ts:61` (`.limit(100)`) · `:112-141` (el `for`)

**Escenario, con números.** `c5a7c19` añadió `enviarRecordatoriosComprobacion()`
**detrás** de `escalarViajesSinAceptar()` en la misma invocación, en dos `await`
consecutivos (`route.ts:68` y `route.ts:78`). Ninguno de los dos `for` consulta un
reloj — `grep -n "Date.now\|presupuesto\|reloj" escalar_viaje.ts
recordatorio_comprobacion.ts` no devuelve nada dentro de los bucles.

```
escalarViajesSinAceptar   100 × (0.3 claim + 1.5 sendText chofer + 1.5 sendText jefe) = 330 000 ms
enviarRecordatoriosComprobacion  0.3 lectura + 100 × (0.3 claim + 1.5 sendText)       = 180 300 ms
                                                                                  ─────────────
                                                                                     510 300 ms
                                                            contra maxDuration = 120 000  (route.ts:11)
```

**Con 37 viajes sin aceptar (120 000 / 3 300 = 36.4), el recordatorio nuevo nunca
arranca**: la invocación muere dentro del primer `for`. Y aislado tampoco cabe:
100 × 1 800 = 180 300 ms, o sea **1.5× su propio `maxDuration` sin ayuda de
nadie**, a partir de 67 viajes vencidos.

En techos es peor: `reclamarRecordatorio` (`recordatorio_comprobacion.ts:154-165`)
llama a `admin.from('viaje').update(...)` **sin `acotada`** → 300 000 ms de undici
por fila; `viajesSinComprobar` (`:56`) igual. `sendText` sí tiene su
`SEND_TIMEOUT_MS = 10_000`.

**El primer arranque es el peor.** La mig. `0087` añade
`recordatorio_comprobacion_en timestamptz` **sin backfill**
(`0087_recordatorio_comprobacion.sql:13-14`), así que en la primera corrida tras
el despliegue **todo** viaje `abierto`/`en_cuadre` con `fecha_inicio` de más de 3
días califica de golpe: 100 mensajes a choferes reales en la primera hora, 100 en
la segunda, hasta drenar.

**Consecuencia.** `reclamarRecordatorio` sella `recordatorio_comprobacion_en`
**antes** de mandar el mensaje (`:154`, decisión documentada y correcta contra la
carrera), igual que `reclamarEscalacion` (`escalar_viaje.ts:307`). Cuando Vercel
corta a mitad del bucle, el viaje en vuelo queda sellado **para siempre** y su
chofer nunca recibe el recordatorio — y el archivo declara explícitamente que el
sello es definitivo y sin ventana de reintento. Peor: el feature completo que
Javier pidió el 8-ago-2026 ("sale solo, no depende de que el jefe apriete un
botón") **está muerto al nacer** en cualquier tenant con 37+ viajes escalables, y
el cron se ve verde en el panel de Vercel porque los dos bloques tienen su propio
`try/catch` y el que no corrió no deja rastro.

**Causa raíz probable.** El chequeo nuevo se metió en la ruta existente por
afinidad temática ("los dos son viaje abierto que se está pasando de tiempo",
`route.ts:19-30`), sin revisar que el presupuesto de la ruta ya estaba desbordado
por el primero. `MARGEN_LOTE_MS` —el corte por reloj que `cron/facturar` sí tiene
(`facturar/route.ts:158`)— no se replicó en ninguno de los dos.

---

### [ALTO] Los mensajes de WhatsApp del cierre y de los crons no pasan por el medidor: ~40% del costo por liquidación es invisible
`src/lib/likida/costos.ts:86-88` (`registrarCostoWhatsApp`, único registrador)
· llamado SOLO desde `src/lib/likida/processor.ts:625` y `:2143`
· NO llamado desde `src/lib/likida/avisar_cierre.ts:109,127` · `escalar_viaje.ts:222,258,262` · `recordatorio_comprobacion.ts:135`

**Escenario, con números.** `grep -rn "registrarCostoWhatsApp" src/ | grep -v test`
devuelve **dos sitios de llamada, los dos en `processor.ts`**. Los demás emisores
de WhatsApp del producto no registran nada. A `WHATSAPP_MSG_USD_DEFAULT = 0.008`
(`costos.ts:47`):

| Camino | Mensajes | Registrados | USD invisibles |
|---|---|---|---|
| Cierre de una liquidación (`processor.ts`) | 3 | 3 | — |
| Aviso de cierre al jefe (`avisar_cierre.ts:109,127`) | hasta 2 | **0** | **$0.016** |
| Escalación por viaje (`escalar_viaje.ts`) | hasta 3 | **0** | hasta $0.024 |
| Recordatorio por viaje (`recordatorio_comprobacion.ts:135`) | 1 | **0** | $0.008 |

Una liquidación cerrada con aviso al jefe manda **5** mensajes y registra **3**:
el componente WhatsApp del costo está subvaluado en **40%**. En dinero, los
$0.016 invisibles son **32–53% del costo total por liquidación** que `models.ts:17`
promete ($0.03–0.05), y son **más de 10 veces** lo que cuesta una extracción OCR
con el modelo que la medición del 4-ago dejó configurado
($0.0015/comprobante, `models.ts:38`).

En los crons el volumen es el que manda: una corrida llena de `escalar` son hasta
300 + 100 = **400 mensajes = $3.20/hora = ~$2 300 USD/mes** que no aparecen en
`llm_costo` en absoluto, y `wa_mensaje_procesado` tampoco los puede atribuir
porque no tiene `tenant_id` (trampa ya documentada).

**Consecuencia.** `costos.ts:5-9` abre diciendo, con todas sus letras, que *"un
costo no registrado tiene que verse distinto de un costo bajo"* porque *"es la
cifra con la que se fija el precio del producto"*. Aquí se ve idéntico: el panel
de costo por flota reporta el 60% de los mensajes que de verdad se pagaron, y el
error va **a la baja** — la dirección que nadie revisa. Un producto que va a
cobrar por liquidación está fijando su precio contra un número que ignora sus dos
mensajes más caros (el sendText + el sendDocument que el contralor archiva).

**Causa raíz probable.** El registro se cableó por llamada de envío y no en el
borde: `sendText`/`sendDocument` de `meta/client.ts` no cobran nada por sí solos,
así que cada emisor nuevo tiene que acordarse — y ninguno de los tres emisores
nuevos de las últimas rondas se acordó.

---

### [ALTO · REINCIDENTE] N+1 sin tope: un `UPDATE` por línea de CFDI consolidado, dentro del webhook
`src/lib/likida/intake/consolidado.ts:259-270` · `:168-181` (`ligarLineaAGasto`) · `:241-247` (`candidatosDb`)

**Escenario, con números.** Sin cambios desde el pase 1, verificado línea por
línea. `esConsolidado` solo pide `lineas.length > 1` — no hay tope de líneas en
ningún lado. Por cada línea conciliada, un `UPDATE` secuencial (`:268`). Una flota
de 20 unidades con ~12 casetas al día y 22 días operados son ~5 000 líneas en un
CFDI del TAG. Nominal: 300 líneas = 90 000 ms, **400 líneas = 120 000 ms = la
invocación entera** (`webhook/whatsapp/route.ts:77`). En techo (`acotada`, 8 s):
300 × 8 000 = 2 400 000 ms. `guardarYConciliarConsolidado` no recibe el reloj.

**Consecuencia.** El `upsert` de `cfdi_xml` va **antes** del bucle y el `insert`
de `cfdi_consolidado_linea` **después**: si Vercel corta a media pasada queda fila
en `cfdi_xml`, K gastos con `cfdi_uuid` escrito, y **cero** líneas de auditoría.
El guardia de idempotencia solo dispara con `existentes.length > 0`, así que al
reenviar el archivo los K gastos ya ligados quedan fuera de `candidatosDb`
(`.is('cfdi_uuid', null)`) y **sus líneas se reportan como huérfanas**. El
contralor persigue facturas que ya están conciliadas. Agravante en la misma
función: `candidatosDb` (`:241-247`) se lee **sin `traerTodo` y sin `.range()`** →
PostgREST la recorta a 1 000 filas en silencio.

---

### [MEDIO] `getGastosFiscales` resuelve el contexto de viaje con un `.in()` sin paginar, y ahora corre 4 veces por carga — una de ellas sin cota de fecha
`src/lib/likida/fiscal.ts:743-751` · llamada 4× desde `dashboard/page.tsx:116,121` vía `fiscal.ts:840-844`

**Escenario, con números.** Tras el barrido paginado, `getGastosFiscales` junta
todos los `viaje_id` distintos y hace **una** consulta `.in('id', viajeIds)`
**sin `.range()` y sin `traerTodo`** (`:746-750`). `getGastosFiscalesSeries`
(nuevo, `fiscal.ts:840`) la llama tres veces más, y la tercera usa
`resolverPeriodo('todo')` — **`desde` y `hasta` ambos `null`**, o sea todos los
gastos que ha tenido el tenant en su vida, o sea **todos sus `viaje_id`**.

- Con 960 viajes: el `.in()` manda un GET con 960 UUIDs en el query string ≈ **37 KB
  de URL**. El límite documentado de Cloudflare (que fronterea a Supabase) son
  16 KB: se pasa a partir de ~410 viajes. `exigir()` lanza (`:751`) → `safe()`
  devuelve `null` → **la tarjeta "Tu motor fiscal" completa desaparece**.
- Si la URL sí pasa, PostgREST recorta el resultado a 1 000 filas en silencio
  (`pg.ts:39-43` documenta exactamente esta trampa): a partir de 1 000 viajes,
  `viajeFolio` y `operadorNombre` vuelven `null` para el resto, y la pantalla
  fiscal enseña comprobantes sin folio de viaje sin decir que le faltó leer.

Y son 4 GETs de decenas de KB **por cada carga del panel**, uno de ellos siempre
del tamaño máximo.

**Consecuencia.** La sección del producto que es su diferenciador (el motor
fiscal) se apaga entera, o miente por omisión, en función de cuántos viajes lleva
la flota — sin log, porque el 414 sube como excepción a `safe()`. El propio
comentario de `:741-742` explica que la segunda consulta existe para no confiar en
el join anidado de PostgREST *"que no pagina el lado embebido"*: se cambió un
recorte silencioso por otro.

**Causa raíz probable.** `getGastosFiscalesSeries` reusó `getGastosFiscales` tal
cual para el modo `'todo'`, y ese modo nunca había existido en este llamador —
antes la ventana más ancha era el ejercicio en curso.

---

### [MEDIO · REINCIDENTE] QStash movió el hallazgo del lote de 8, no lo cerró: el worker declara 600 s y corta a los 150 s del presupuesto del cron
`src/app/api/cron/facturar/cola/route.ts:11` · `src/app/api/cron/facturar/route.ts:25,129`

Sin cambios. `cola/route.ts:11` declara `maxDuration = 600` y su comentario dice
que existe porque *"el techo de 300 s de una invocación directa es justo lo que
esta cola existe para romper"* — pero llama a `procesarLoteEnCola`, que usa la
constante de módulo del cron: `PRESUPUESTO_LOTE_MS = maxDuration * 1000` con el
`maxDuration = 300` de `route.ts:25`. El corte sigue siendo
`300 000 − 150 000 = 150 000 ms`. Con el peor caso medido de una sesión de portal
(~147 s): flota 1 termina en t = 147 s, flota 2 pasa el corte y termina en
t = 294 s, flota 3 se corta. **2 flotas de las 8 del lote, usando 294 s de los
600 declarados.** Ocho flotas con un ticket cada una tardan 4 horas en drenar, y
el cron se ve verde.

---

### [MEDIO · REINCIDENTE] La foto va al modelo de visión a resolución nativa, mientras el mismo repo ya redimensiona para lo que es gratis
`src/lib/likida/intake/ocr.ts:253-260` · `src/lib/llm/openrouter.ts:379-384` · `src/lib/likida/intake/cfdi.ts:249`

Sin cambios. `downloadMediaAsDataUrl` devuelve el JPEG tal cual lo mandó el
teléfono; `extraerComprobante` lo pasa a `generateStructured({ images:
[principal] })` (`ocr.ts:257`) y `openrouter.ts:383` lo adjunta como `image_url:
{ url }` sin `detail` ni preproceso. Un teléfono de gama media manda 4 000 × 3 000
px; Gemini tesela en cuadros de 768: `ceil(4000/768) × ceil(3000/768) = 24`
teselas ≈ **6 200 tokens de entrada**. A 1 024 px de ancho —de sobra para un
ticket térmico— son 2 teselas ≈ **520 tokens**: **~12× menos entrada por
comprobante**. Lo que lo hace descuido y no decisión: `decodeCodigosFromImage`
(`cfdi.ts:249`) YA hace `sharp(...).rotate().resize({ width: 1600 })` sobre la
misma imagen. Se redimensiona para el lector de códigos, que es gratis, y no para
la llamada de visión, que es lo que se paga. La medición del 4-ago
(`models.ts:36-47`) comparó **modelos** con la misma imagen inflada, así que este
ahorro no aparece en esa tabla.

---

### [MEDIO · REINCIDENTE] `cola/route.ts` declara 600 s contra el techo de 300 s que este mismo repo verificó
`src/app/api/cron/facturar/cola/route.ts:11` vs `src/app/api/webhook/whatsapp/route.ts:69-71`

Sin cambios. El webhook documenta *"VERIFICADO el 28-jul-2026 contra la API de
Vercel: … plan **pro**, donde el tope es 300 s"*. El callback declara 600.
`vercel.json` (leído hoy) no trae bloque `functions` ni nada que declare Fluid
Compute — solo `ignoreCommand` y `crons`. Hoy no muerde porque el corte real es a
los 150 s; muerde el día que alguien arregle `PRESUPUESTO_LOTE_MS`: el worker
creería tener 600 s, abriría una sesión de portal en `emitir` a t = 440 s y
moriría a los 300 con el CFDI posiblemente timbrado en el SAT y `cfdi_uuid` sin
escribir. Dos números que dicen cosas distintas del mismo plan, y ninguna prueba
los enfrenta.

---

### [BAJO · REINCIDENTE, PEOR] 25 de los 29 `traerTodo` de la landing no piden `conteo()` y pagan una página vacía cada uno
`src/lib/likida/pg.ts:66` (`conteo`) · `:186-190` (la página vacía como prueba)
· los 4 que sí lo piden: `fiscal.ts:731`

`traerTodo` demuestra que trajo todo por el `count` de PostgREST (**gratis**, viene
en la primera respuesta) o por una página vacía. En el pase 1 eran 12 de 14
llamadores sin `conteo`; hoy, con el rework, son **25 de 29** en la landing —
`grep -c "conteo(" analytics.ts` devuelve 2 sitios, ambos en funciones que la
landing no llama. Son **25 viajes de red de los 214 (12%)** por no pasar un
argumento que el helper ya expone. Es el único hallazgo de la lista cuyo tamaño no
crece con el cliente, y el más barato.

---

### [BAJO] El índice de la mig. `0087` lidera con `tenant_id`, que su único consumidor nunca filtra
`supabase/migrations/0087_recordatorio_comprobacion.sql:19-21` · `src/lib/likida/recordatorio_comprobacion.ts:55-62`

`idx_viaje_recordatorio_pendiente` es
`(tenant_id, estatus, fecha_inicio) where recordatorio_comprobacion_en is null`.
La única consulta que existe, `viajesSinComprobar` (`:56-62`), filtra por
`estatus IN (...)`, `fecha_inicio <= limite` y `recordatorio_comprobacion_en IS
NULL` — y **no filtra por `tenant_id`**: es un cron global. Con la columna líder
sin restringir, Postgres no puede hacer *seek* por `fecha_inicio`; tiene que
recorrer el índice parcial entero filtrando fila por fila. La mig. `0058`, misma
familia y mismo patrón, lo hizo bien: `viaje_sin_aceptar_idx on viaje (avisado_en)
where aceptado_en is null and escalado_en is null and estatus = 'abierto'` — la
columna del rango primero, todo lo constante en el predicado. Hoy el índice
parcial es chico y no duele; duele cuando `recordatorio_comprobacion_en IS NULL`
cubra los viajes de todos los tenants que aún no ha alcanzado el lote de 100/hora.

---

## Lo que revisé y está bien

- **`acotada()`** (`presupuesto.ts:155-176`) sigue haciendo lo que dice: impone
  `abortSignal` **y** una carrera contra temporizador, y devuelve el fallo por el
  mismo canal `{data:null,error}` que Postgres, sin cambiar la semántica de
  ningún llamador. El problema no es el mecanismo, es dónde no se usa.
- **`traerTodo` avanza por filas leídas y no por número de página**
  (`pg.ts:171-175`) y falla cerrado con `LecturaIncompleta` en vez de devolver una
  cifra corta. Correcto ante un `max_rows` bajo de proyecto.
- **`getSerieComparativa` internamente hace lo correcto**: trae el rango completo
  UNA vez por tabla y bucketea en memoria (`analytics.ts:78-80,133-149`), en vez
  de una consulta por paso. Es el patrón bueno; lo que falla es que
  `getSeriesKpiCards` lo llama tres veces.
- **`getViajesPorMes`** (`analytics.ts:501-528`) hace bien en NO reusar el
  `getViajes(limite=100)` que la página ya tiene: un tope de 100 en la vista
  "Histórico" se leería como la serie completa. Paga un barrido, y el barrido está
  justificado por escrito.
- **`contarFilas`** (`analytics.ts:628-639`) usa `head: true` y lanza si el
  `count` no es número, en vez de devolver un 0 inventado. Es el patrón correcto
  para un conteo, y es exactamente el que los 5 barridos completos de la landing
  deberían estar usando.
- **El reloj compartido de la invocación** (`presupuesto.ts:220-238`) sigue siendo
  correcto hasta que el agente devuelve: `esperarIntake` (`processor.ts:1718`), el
  mutex (`:1751`, `:1390`), el OCR (`:525`, `:798`) y `runAgent` (`:1853`) piden
  todos por `reloj.acotar()`/`reloj.senal()`. `senal()` devuelve una señal YA
  abortada cuando no queda nada (`:234`).
- **`MARGEN_LOTE_MS` en `cron/facturar`**: el corte por reloj antes de cada
  `conNavegador` y antes de cada portal nuevo es correcto, y lo no intentado no se
  marca. El mecanismo está bien; falla la constante que lo alimenta.
- **Los timeouts del cliente de Meta** siguen en su sitio: `SEND_TIMEOUT_MS =
  10_000`, `DOWNLOAD_TIMEOUT_MS = 15_000` (`meta/client.ts:10,17`).
- **Caché de prompt en el ciclo de tools** (`openrouter.ts`): el breakpoint va en
  el system, que es el bloque invariante, y solo para `anthropic/`. Medido contra
  liquidaciones reales. Sin cambios en los 12 commits, y sigue bien puesta.
- **`reclamarRecordatorio`** (`recordatorio_comprobacion.ts:154-165`): el claim
  condicional antes del envío es el patrón correcto contra el *at-least-once* de
  Vercel Cron, copiado bien de `escalar_viaje.ts`. Lo que falta alrededor es el
  presupuesto, no el candado.

---

## Lo que NO alcancé a revisar

- **Latencia real Vercel ↔ Supabase.** Todas mis sumas usan los costos nominales
  que el repo escribe (0.3 s/consulta) y los techos que impone. Nadie ha medido el
  p99 real y `presupuesto.ts:97-99` lo admite. Si el p99 real de una página de
  1 000 filas es 0.6 s en vez de 0.3, la fila E de la tabla pasa de 7.8 a 15.6 s y
  cruza el default de plataforma **hoy**, no en el mes 2.5.
- **Qué `maxDuration` hereda de verdad una página del App Router en este
  proyecto.** Verifiqué que no se declara en ningún lado (ni en la página, ni en
  `vercel.json`, ni en `next.config.ts`); no pude verificar contra la API de
  Vercel si el equipo tiene Fluid Compute activo, que cambiaría el default de 15 s
  a 300 s. Ese número decide si la fila E es un ALTO o un MEDIO.
- **El costo por liquidación medido de punta a punta.** `models.ts:17` promete
  $0.03–0.05 y hay mediciones por comprobante (18 tickets, 4-ago). No encontré una
  medición del ciclo completo con la caché de prompt activa. Sin ese número no se
  puede afirmar "el costo por operación está medido" — y el hallazgo de los
  mensajes sin registrar dice que el número que existe está mal a la baja.
- **El plan de ejecución real de las consultas de `analytics.ts` en Postgres.**
  Conté viajes de red y filas transferidas; no corrí un `EXPLAIN` contra una base
  con datos, así que no sé cuáles de los 29 barridos usan índice y cuáles hacen
  seq scan. `idx_gasto_acumulado` (0023) es `(tenant_id, concepto, fecha)` y varias
  de las consultas nuevas ordenan por `id`, no por `fecha`.
- **`/api/export/liquidaciones` y `/api/export/pdf/[id]`**: ninguno declara
  `maxDuration`; no sumé su peor caso.
- **`api/cron/purgar`**: es un solo RPC, el trabajo pesado vive en
  `mantenimiento_de_datos` en SQL. No leí la función de la base.
- **Los topes internos de `pagina_playwright.ts` y `capufe.ts`.** Tomé el ~147 s
  del peor caso de una sesión como dado (viene de la auditoría 10 y está citado en
  `facturar/route.ts:135-141`).
