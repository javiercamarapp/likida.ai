# Rendimiento y costo — auditoría 17 · pase 4 (11-ago-2026)

**Nota: 4/10** (antes 4). Razón del movimiento: **se mantiene — se borró
superficie, no se arregló ni un número**. `master` quitó 35 páginas del panel del
cliente, y eso baja la carga total del producto; pero **ninguno de los diez
hallazgos abiertos tocó código**. Verifiqué uno por uno contra el árbol de hoy:
`COSTO_CIERRE_MS` sigue en 9 400 contra `MARGEN_CIERRE_MS` 12 000 con
`avisarCierreAlJefe` fuera de la tabla (13 700 nominales), `cron/escalar` sigue
encadenando dos lotes de 100 (510 300 ms contra 120 000), la mig. `0084` sigue
sin un solo `.rpc()`, el N+1 del consolidado sigue sin tope y sin reloj, y los
mensajes de WhatsApp de los tres emisores nuevos siguen fuera del medidor. Lo
único que se movió en mi rubro lo movió el borrado, y **hacia atrás**: al vaciar
`alertas` en `page.tsx:158`, la consulta más cara de la landing pasó a ser
trabajo puro perdido.

**El riesgo mayor hoy:** el cierre del webhook no cabe en la reserva que él mismo
aparta, y desde `processor.ts:1853` —el último `reloj.acotar()` del archivo— nada
del cierre vuelve a consultar el reloj. Es el camino del demo, y su modo de falla
es morir con la liquidación ya escrita, el lease tomado, sin log y sin reintento
de Meta.

---

## El reconteo de consultas de `/dashboard` tras el borrado

**El número nuevo es 214, exactamente el mismo del pase 2** — y el número que hay
que citar de aquí en adelante es **244**, porque una carga de navegador dispara
además el rail del layout.

**La premisa del relanzamiento era falsa.** El MAPA dice que "el grueso de las 214
consultas por carga vivía en páginas borradas". No: las 214 son de
`src/app/dashboard/page.tsx`, la landing, que **sobrevivió intacta**. El diff
completo `20ecbb1..HEAD` sobre esa página son 41 líneas, y **ninguna toca el
`Promise.all` de las 12 llamadas** (`page.tsx:90-122`): quita el `import` de
`./contador/comun`, quita `sufijoTenant`, vacía `alertas` y cambia un `?? 0`. Lo
que sí murió con las 35 páginas fueron `getStatsPorOperador`, `getGastoPorRuta`,
`getOperadoresDetalle`, `getViajesSinLiquidar`, `contarViajes`,
`getLiquidacionesPorDia`, `getValorAhorro` y `getLiquidaciones` —hoy **cero
llamadores fuera de `analytics.ts` y fuera de tests**—, pero ninguna de esas la
llamaba la landing.

### El desglose de hoy, línea por línea

Escenario: flota de 20 unidades, un año operando, **66 comprobantes/día** — la
décima parte del volumen que el propio archivo llama de diseño (`analytics.ts:648`).
Son 24 090 filas de `gasto`, 960 de `viaje`, 960 de `liquidacion`. Cada
`traerTodo` paga `ceil(filas/1000)` viajes de red **+ 1 página vacía** si el
llamador no pidió `conteo()` (`pg.ts:137-175`); con `conteo()` corta en la última
página real (`pg.ts:158`).

Las 12 llamadas de `page.tsx:94-122` se resuelven en **29 `traerTodo` + 4 `.in()`
+ 2 consultas sueltas**:

```
gasto — 14 barridos → 178 viajes de red, ~158 900 filas
  detectarAnomalias         analytics.ts:268   SIN filtro de fecha   24 090 → 26
  getGastoPorSemana(52)     analytics.ts:387   364 días              24 024 → 26
  getSerieComparativa(3650) analytics.ts:106   ventana de 10 años    24 090 → 26
  getTopRutasPorGasto hist. analytics.ts:979   SIN ventana           24 090 → 26
  getGastosFiscalesSeries.historico  fiscal.ts:868  periodo 'todo'   24 090 → 25 (con conteo)
  getGastosFiscales (ejercicio)      fiscal.ts:751                   14 718 → 15 (con conteo)
  + 8 barridos con ventana (7d…91d)  ────────────────────────────────────── → 34
viaje — 7 barridos →  14 viajes de red
  3 × getSerieComparativa.viaje · getViajesPorMes · 3 × getTopRutasPorGasto.viaje
liquidacion — 8 barridos → 16 viajes de red
  getAcreditables · getKpis · 3 × getLiquidadoPorSemana · 3 × getSerieComparativa.liquidacion
sueltas:  getViajes(100) 1 · getConfig 1 · 4 × getGastosFiscales.viaje `.in()` 4
                                     ─────────────────────────────────────────
                                     214 viajes de red · ~167 900 filas
```

**Y encima el rail del layout.** `layout.tsx:30` monta `DashboardChrome`, que
monta `RailAsistente` (`chrome.tsx:100`), que en un `useEffect` pide
`/api/dashboard/asistente` (`rail.tsx:68`). Ese handler llama otra vez a
`getKpis`, `getAcreditables` **sin ventana** y `detectarAnomalias`
(`asistente/route.ts:76-80`) = **30 viajes de red más**, entre ellos un
**segundo** barrido completo de `gasto`. Total real de una carga de navegador:
**244 viajes de red y 6 barridos de `gasto` sin cota efectiva** (5 en el SSR + 1
en el rail).

**Ningún número escrito contra el cual medir esto.** `grep -rn maxDuration
src/app/` devuelve 6 rutas de API y **cero páginas**; `vercel.json` (leído hoy) no
trae bloque `functions`. `acotada` no aparece **ni una vez** en `analytics.ts`
(el único `grep` que pega es un comentario que dice "acotada a las plazas más
comunes"), ni en `fiscal.ts`, ni en `pg.ts`: las 244 heredan los 300 000 ms de
undici. La cadena secuencial más larga son **26 páginas × 0.3 s = 7 800 ms
nominales**.

### Para contraste, la otra landing del mismo panel

`InicioOperacion` (`inicio-operacion.tsx:44-50`, la pantalla del encargado) hace
5 llamadas que se resuelven en **12 `traerTodo`, todos con `conteo()`**
(`operacion.ts:52,57,62,67,125,252,262,266,325,330,335`) contra tablas hoy
vacías: **~13 viajes de red**. Mismo repo, mismo día, **19× menos**. El patrón
bueno existe y está escrito; la landing del dueño no lo usa.

---

## Hallazgos abiertos: qué pasó con cada uno

| # | Hallazgo | Estado hoy | Evidencia verificada el 11-ago |
|---|---|---|---|
| 1 | **CRÍTICO** — el cierre no cabe en `MARGEN_CIERRE_MS` | **REINCIDENTE, idéntico** | `PASOS_CIERRE` = 14 filas, suma **9 400** (`presupuesto.ts:37-61`); `MARGEN_CIERRE_MS` = **12 000** (`:79`); `avisarCierreAlJefe` sigue sin entrar y el comentario de `:50-52` lo sigue admitiendo por escrito. Suma: **13 700**. |
| 2 | **ALTO** — la mig. `0084` no la llama nadie | **REINCIDENTE, cuarta ronda** | `grep -rn sumar_combustible_ejercicio` → 1 `.ts`, y es el string de `migraciones_verificadas.test.ts:57`. Cero `.rpc(...)`. `repo.ts:808-812` sigue con `PAGINA=1_000`/`MAX_PAGINAS=100` y su `for` de `:819`. |
| 3 | **ALTO** — `cron/escalar`: dos lotes de 100 en serie | **REINCIDENTE, idéntico** | `route.ts:11` = 120; `:66` y `:76` siguen siendo dos `await` consecutivos; `escalar_viaje.ts:92` y `recordatorio_comprobacion.ts:62` siguen con `.limit(100)`; ningún `for` consulta reloj. |
| 4 | **ALTO** — el Resumen barre `gasto` completo N veces | **REINCIDENTE, y con el doble confirmado** | 5 barridos sin cota efectiva en el SSR + 1 en `asistente/route.ts:79`. Ver el reconteo de arriba. |
| 5 | **ALTO** — N+1 sin tope en el CFDI consolidado | **REINCIDENTE, idéntico** | `consolidado.ts:258-270`: el `for (const r of resultados)` con `await ligarLineaAGasto` dentro, sin tope de líneas y sin reloj. |
| 6 | **ALTO** — los mensajes de WhatsApp fuera del medidor | **REINCIDENTE, idéntico** | `grep -rn registrarCostoWhatsApp src/` sin tests → **dos** sitios de llamada, los dos en `processor.ts` (`:625`, `:2143`). |
| 7 | **MEDIO** — QStash corta a 150 s del presupuesto viejo | **REINCIDENTE, idéntico** | `cola/route.ts:11` = 600; `facturar/route.ts:129` = `maxDuration * 1000` con el `maxDuration = 300` de `:25`; `MARGEN_LOTE_MS = 150_000` (`:158`). |
| 8 | **MEDIO** — la foto va a visión sin redimensionar | **REINCIDENTE, idéntico** | `ocr.ts:257` sigue con `images: [principal]` crudo; `openrouter.ts:383` sigue adjuntando `image_url: { url }` sin `detail`. |
| 9 | **MEDIO** — `cola/route.ts` declara 600 s contra el techo de 300 | **REINCIDENTE, idéntico** | `cola/route.ts:11` vs `webhook/whatsapp/route.ts:69-71`; `vercel.json` sin bloque `functions`. |
| 10 | **MEDIO** — `getGastosFiscales` resuelve el viaje con un `.in()` sin paginar | **REINCIDENTE, idéntico** | `fiscal.ts:767-771`; sigue llamándose 4× por carga (`:868` incluye el modo `'todo'`). |
| 11 | **BAJO** — `traerTodo` sin `conteo()` | **REINCIDENTE, idéntico** | De los 29 `traerTodo` de la landing, **25 no piden `conteo()`**: los 4 que sí son los de `fiscal.ts:753`. |
| 12 | **BAJO** — el índice de la `0087` lidera con `tenant_id` | **REINCIDENTE, idéntico** | `0087_...sql:19-21` vs `recordatorio_comprobacion.ts:55-62`, que no filtra por `tenant_id`. |

**Cerrado por arreglo: 0 de 12. Cerrado por supresión: 0 de 12** — ninguno de mis
hallazgos vivía en las 35 páginas borradas.

---

## La suma del peor caso

Costos unitarios: los que el propio repo escribe (`presupuesto.ts:35`) — 0.3 s una
consulta, 1.5 s un `sendText`, 2.5 s un `sendDocument`, 0.5 s una URL firmada.
Techos: `TOPE_CONSULTA_MS = 8_000` (`presupuesto.ts:108`, **solo** donde se usa
`acotada`), `SEND_TIMEOUT_MS = 10_000` (`meta/client.ts:17`), y el default de
undici (**300 000 ms**) donde no hay ninguno de los dos.

| # | Tramo | ms / viajes de red | Límite escrito | archivo:línea del límite | ¿Cabe? |
|---|---|---|---|---|---|
| A | **Cierre feliz del webhook**, nominal: 9 400 − 300 (guardia usa snapshot) + `avisarCierreAlJefe` (300 + 300 + 1 500 + 2 500) | **13 700 ms** | `MARGEN_CIERRE_MS = 12_000` | `presupuesto.ts:79` | **NO** — 1 700 ms de más sin que nada salga lento |
| B | **Cierre en techos**: 9 Supabase con `acotada` (9×8 000) + 3 Meta (3×10 000) + `telefonoJefeDe` sin acotar (300 000) + `resumenDeCierre` sin acotar (300 000) + 2 envíos al jefe (2×10 000) | **722 000 ms** | `maxDuration = 120` | `webhook/whatsapp/route.ts:77` | **NO** — 6× la invocación entera |
| C | **`/api/cron/escalar`** nominal: 100 × 3.3 s + (0.3 + 100 × 1.8 s) | **510 300 ms** | `maxDuration = 120` | `cron/escalar/route.ts:11` | **NO** — 4.25×; muere en el viaje ~36 del PRIMER lote |
| D | **`/api/cron/escalar`**, solo el recordatorio nuevo, aislado | **180 300 ms** | 120 000 | `cron/escalar/route.ts:11` | **NO** — no cabe ni él solo |
| E | **`/dashboard` SSR**, 1 año a 66 comprobantes/día | **214 viajes de red**; cadena secuencial más larga 26 páginas = **7 800 ms** | **ninguno** | no existe la línea | **No se puede decir** — y eso es parte del hallazgo |
| E′ | **`/dashboard`, carga de navegador** (SSR + rail del layout) | **244 viajes de red**, 6 barridos de `gasto` | ninguno | — | idem |
| F | **`/dashboard`** al volumen que el propio archivo llama de diseño (240 900 `gasto`/año) | 6 barridos × 100 páginas = **600 viajes de red desperdiciados**, y los 6 lanzan `LecturaIncompleta` | `MAX_PAGINAS = 100` | `pg.ts:48` | **NO** — 4 secciones se apagan a la vez + banda de "pantalla incompleta" |
| G | **CFDI consolidado en el webhook**: 1 `UPDATE` por línea, sin tope | 400 líneas × 300 = **120 000 ms**; en techos 300 × 8 000 = 2 400 000 | 120 000 | `webhook/whatsapp/route.ts:77` | **NO** a partir de ~400 líneas |
| H | **Worker QStash**: 2 flotas × ~147 s | **294 000 ms** usados | 600 000 declarados, corte real a 150 000 | `cola/route.ts:11` vs `facturar/route.ts:129` | Cabe, pero procesa **2 de 8** |
| I | **`/dashboard/combustible-casetas`** (página del cliente que sobrevivió) | **57 viajes de red** SSR (2 barridos completos de `gasto`) + 30 del rail = **87** | ninguno | — | No se puede decir |

---

## Hallazgos

### [CRÍTICO · REINCIDENTE] El cierre del webhook son 13 700 ms nominales contra los 12 000 que él mismo aparta, y ningún paso del cierre consulta el reloj
`src/lib/likida/presupuesto.ts:37-58` (`PASOS_CIERRE`) · `:61` (`COSTO_CIERRE_MS`) · `:79` (`MARGEN_CIERRE_MS`) · `:250` (`restante`)
· `src/lib/likida/processor.ts:2178-2190,2217,2267` · `src/lib/likida/avisar_cierre.ts:71,88,105,127` · `src/lib/likida/contactos.ts:118`

**Escenario, con números.** Sumé la tabla a mano contra el archivo de hoy: 14
filas, 9 400 ms. `MARGEN_CIERRE_MS` sigue en 12 000. Y `avisarCierreAlJefe`
(`processor.ts:2190`) sigue **fuera** de la tabla — cuatro viajes de red más:

```
COSTO_CIERRE_MS (14 pasos, presupuesto.ts:61)          9 400 ms
 − guardiaCifras→cuadrarDesdeDB (snapshot, camino feliz) −300
 + telefonoJefeDe        contactos.ts:118                 300
 + resumenDeCierre       avisar_cierre.ts:71 (2 en ‖)     300
 + sendText al jefe      avisar_cierre.ts:105           1 500
 + sendDocument al jefe  avisar_cierre.ts:127           2 500
                                                    ──────────
                                                      13 700 ms  vs MARGEN_CIERRE_MS = 12 000
```

Como `restante() = 120 000 − 12 000 − transcurrido` (`presupuesto.ts:250`), el
agente puede devolver legítimamente en t = 108 000 ms. Cierre nominal → **t =
121 700 ms** contra `maxDuration = 120` (`webhook/whatsapp/route.ts:77`). Y desde
`processor.ts:1853` —el último `reloj.acotar()` del archivo— **nada del cierre
vuelve a mirar el reloj**: `grep -n "reloj\." processor.ts` no devuelve una sola
línea después de 1853, verificado hoy.

Los dos pasos que faltan son además los únicos del cierre **sin techo de ninguna
clase**: `telefonosJefe` (`contactos.ts:118`) y `resumenDeCierre`
(`avisar_cierre.ts:71-79`) llaman a `supabaseAdmin()` en crudo, sin `acotada`,
así que heredan los 300 000 ms de undici. Uno solo colgado son 300 s contra una
invocación de 120.

**Consecuencia.** Vercel mata la función con la liquidación ya escrita y el
`viaje` ya `liquidado`. `saveConversation` (`processor.ts:2217`) no corre → el
turno se pierde y el agente vuelve sin memoria de haber cerrado. `releaseViajeLock`
(`:2267`, en el `finally`) no corre → el lease queda tomado hasta su TTL, que es
`PRESUPUESTO_WEBHOOK_MS` completo (`presupuesto.ts:223`). Y el contralor —el
comprador, el que está en la sala— no recibe ni el aviso ni el PDF, que es el
documento que `avisar_cierre.ts` existe para entregarle. No hay log: el proceso
muere antes del `catch`. Meta tiene su 200 y no reintenta.

**Causa raíz probable.** La prueba que custodia la reserva es un checksum sobre
la tabla, y por construcción no puede ver un paso que nadie anotó; el margen
tampoco se ata a `PEOR_CASO_TURNO_MS` ni a nada que crezca solo.

---

### [ALTO · NUEVO EN ESTE PASE] El borrado dejó el barrido más caro de la landing sin consumidor: 26 viajes de red y 24 090 filas para producir un solo bit
`src/app/dashboard/page.tsx:97` (la llamada) · `:150` (el único uso) · `:158` (`alertas` vaciado)
· `src/app/dashboard/estado.ts:30-31` · `src/lib/likida/analytics.ts:264-286`

**Escenario, con números.** Antes de `003c88a`, `anomalias` alimentaba una tarjeta
real: `if (anomalias && anomalias.length > 0) alertas.push({... href: '/dashboard/cuadre#anomalias' })`.
Ese bloque se borró y `alertas` quedó como `const alertas: Array<...> = []`
(`page.tsx:158`), literal vacío. Hoy `anomalias` aparece **tres veces** en el
archivo: la desestructuración (`:91`), la llamada (`:97`) y `estadoPanel(...)`
(`:150`). Y `estadoPanel` **solo mira si es `null`** (`estado.ts:30-31`): su
`.length` nunca se lee — la rama `'vacio'` de `:37` usa `kpis` y `liquidaciones`,
no `anomalias`.

O sea: `detectarAnomalias` es un `SELECT` de `gasto` **sin un solo filtro de
fecha** (`analytics.ts:268-275`), **sin `conteo()`** y **sin `acotada`**. A 66
comprobantes/día son 24 090 filas en **26 viajes de red secuenciales** — el 12%
de los 214 y el barrido individual más caro de la página — y todo lo que aporta
al render es un booleano `null`/no-`null` que cualquier `count` de una fila
habría dado. `contarFilas` (`analytics.ts:628-639`), en este mismo archivo, ya
hace exactamente eso con `head: true`.

Refutación que intenté y falló: *"lo usará el rail"*. No — el rail pide su propia
copia a `/api/dashboard/asistente`, que vuelve a llamar a `detectarAnomalias`
(`asistente/route.ts:79`) con su propio tenant resuelto. Son dos barridos
completos e independientes, y el que renderiza algo es el del rail.

**Consecuencia.** Al volumen de diseño esta consulta lanza `LecturaIncompleta` a
las 100 páginas (`pg.ts:174`) tras quemar 100 viajes de red; `safe()`
(`page.tsx:35`) la convierte en `null`, `estadoPanel` devuelve `'parcial'`
(`estado.ts:36`) y la primera pantalla del comprador abre con la banda **"Faltan
datos por cargar — esta pantalla está incompleta · No tomes estas cifras como el
corte del periodo"** (`page.tsx:228-231`) — por una sección que **la página ya no
pinta**. Una advertencia verdadera sobre un dato que nadie iba a ver, encima de
cifras que sí cargaron bien.

**Causa raíz probable.** El borrado quitó al consumidor de la cifra y dejó al
productor: nada en el repo ata "esta consulta se paga" con "esta consulta se
renderiza", y `estadoPanel` acepta cualquier `unknown | null` como sección, así
que la llamada siguió compilando y siguió costando.

---

### [ALTO · REINCIDENTE, CUARTA RONDA] La migración `0084` sigue sin que nadie la llame: el barrido anual del 15% pagina igual que hace cuatro rondas
`supabase/migrations/0084_sumar_combustible_ejercicio.sql:11` · `src/lib/likida/repo.ts:803-865` · `src/lib/likida/migraciones_verificadas.test.ts:57`

**Verificado hoy:** `grep -rn "sumar_combustible_ejercicio" --include=*.ts
--include=*.sql .` devuelve el SQL de la migración y **una sola línea de TS, que
es el texto de un test**. No existe ningún `.rpc('sumar_combustible_ejercicio', …)`.

**Escenario, con números.** `getAcumuladoCombustible` (`repo.ts:803`) sigue siendo
el bucle de `:819`: `PAGINA = 1_000` (`:808`), `MAX_PAGINAS = 100` (`:812`),
páginas **secuenciales**, cada una envuelta en `acotada` (`:820`, 8 000 ms de
techo). Una flota con 9 000 cargas de diésel en el ejercicio = **10 viajes de red
seguidos**, 3 000 ms nominales y **80 000 ms en techos**, dentro de un turno que
`processor.ts:1853` acota a 40 000 ms y de una invocación de 120 000. Corre por
dos caminos calientes: `cuadrarDesdeDB` (todo cierre) y la tool
`consultar_periodo`.

**Consecuencia.** La operación fiscal más cara del cierre cuesta N viajes de red
que crecen con el histórico del cliente. A 100 000 cargas lanza (`repo.ts:861`) y
el contador del 15% (RFA 2026 regla 2.9) se apaga dejando el efectivo marcado "a
revisar" en la liquidación que el contralor está mirando. Y
`migraciones_verificadas.test.ts:57` sigue afirmando en verde *"si falta,
getAcumuladoCombustible lanza ruidoso en el primer cuadre (el RPC no existe)"* —
una frase falsa sobre una función que no invoca ningún RPC, y es la línea que
hace que este hallazgo se lea como cerrado cuatro rondas seguidas.

---

### [ALTO · REINCIDENTE] `/api/cron/escalar` encadena dos lotes de 100 viajes con envíos: 510 s nominales contra 120 — y el recordatorio nuevo nunca llega a correr
`src/app/api/cron/escalar/route.ts:11` (`maxDuration = 120`) · `:66` y `:76` (los dos `await` consecutivos)
· `src/lib/likida/escalar_viaje.ts:92` (`.limit(100)`) · `:192` (el `for`)
· `src/lib/likida/recordatorio_comprobacion.ts:62` (`.limit(100)`) · `:160` (el `for`)

**Escenario, con números.** Verificado hoy sin cambios: `escalarViajesSinAceptar()`
en `route.ts:66` y `enviarRecordatoriosComprobacion()` en `route.ts:76`, dos
`await` secuenciales en la misma invocación. Ninguno de los dos `for` consulta un
reloj.

```
escalarViajesSinAceptar   100 × (0.3 claim + 1.5 sendText chofer + 1.5 sendText jefe) = 330 000 ms
enviarRecordatoriosComprobacion  0.3 lectura + 100 × (0.3 claim + 1.5 sendText)       = 180 300 ms
                                                                                  ─────────────
                                                                                     510 300 ms
                                                            contra maxDuration = 120 000  (route.ts:11)
```

**Con 37 viajes sin aceptar (120 000 / 3 300 = 36.4), el recordatorio nunca
arranca**: la invocación muere dentro del primer `for`. Y aislado tampoco cabe:
180 300 ms es **1.5× su propio `maxDuration`**, a partir de 67 viajes vencidos.

En techos es peor: `viajesSinComprobar` (`recordatorio_comprobacion.ts:54`) y
`reclamarRecordatorio` llaman a `supabaseAdmin()` **sin `acotada`** → 300 000 ms
de undici por consulta. `sendText` sí tiene su `SEND_TIMEOUT_MS = 10_000`.

**Consecuencia.** `reclamarRecordatorio` sella `recordatorio_comprobacion_en`
**antes** de mandar el mensaje (decisión documentada y correcta contra la
carrera, `recordatorio_comprobacion.ts:145-152`). Cuando Vercel corta a mitad del
bucle, el viaje en vuelo queda sellado **para siempre** y su chofer nunca recibe
el recordatorio — el archivo declara explícitamente que el sello es definitivo y
sin ventana de reintento. El feature completo que Javier pidió el 8-ago ("sale
solo, no depende de que el jefe apriete un botón") **está muerto al nacer** en
cualquier tenant con 37+ viajes escalables, y el cron se ve **verde** en el panel
de Vercel porque los dos bloques tienen su propio `try/catch` (`route.ts:65-83`)
y el que no corrió no deja rastro.

**Causa raíz probable.** El chequeo nuevo se metió en la ruta existente por
afinidad temática (`route.ts:16-19` lo dice) sin revisar que el presupuesto ya
estaba desbordado por el primero. `MARGEN_LOTE_MS` —el corte por reloj que
`cron/facturar` sí tiene (`facturar/route.ts:158`)— no se replicó en ninguno.

---

### [ALTO · REINCIDENTE] Los mensajes de WhatsApp del cierre y de los crons no pasan por el medidor: ~40% del costo por liquidación es invisible
`src/lib/likida/costos.ts:86-88` (`registrarCostoWhatsApp`, único registrador)
· llamado SOLO desde `src/lib/likida/processor.ts:625` y `:2143`
· NO llamado desde `avisar_cierre.ts:105,127` · `escalar_viaje.ts` · `recordatorio_comprobacion.ts:180`

**Escenario, con números.** `grep -rn "registrarCostoWhatsApp" src/` sin tests
devuelve **dos sitios de llamada, los dos en `processor.ts`**. A
`WHATSAPP_MSG_USD_DEFAULT = 0.008` (`costos.ts:47`):

| Camino | Mensajes | Registrados | USD invisibles |
|---|---|---|---|
| Cierre de una liquidación (`processor.ts`) | 3 | 3 | — |
| Aviso de cierre al jefe (`avisar_cierre.ts:105,127`) | hasta 2 | **0** | **$0.016** |
| Escalación por viaje (`escalar_viaje.ts`) | hasta 3 | **0** | hasta $0.024 |
| Recordatorio por viaje (`recordatorio_comprobacion.ts:180`) | 1 | **0** | $0.008 |

Una liquidación cerrada con aviso al jefe manda **5** mensajes y registra **3**:
el componente WhatsApp está subvaluado en **40%**. Los $0.016 invisibles son
**32–53% del costo total por liquidación** que `models.ts:17` promete
($0.03–0.05), y son **más de 10 veces** lo que cuesta una extracción OCR con el
modelo que la medición del 4-ago dejó en la variable de entorno
($0.0015/comprobante, `models.ts:38-44`).

En los crons manda el volumen: una corrida llena de `escalar` son hasta
300 + 100 = **400 mensajes = $3.20/hora ≈ $2 300 USD/mes** que no aparecen en
`llm_costo` en absoluto.

**Consecuencia.** `costos.ts:5-9` abre diciendo con todas sus letras que *"un
costo no registrado tiene que verse distinto de un costo bajo"* porque *"es la
cifra con la que se fija el precio del producto"*. Aquí se ve idéntico, y el
error va **a la baja** — la dirección que nadie revisa. Un producto pre-revenue
que va a cobrar por liquidación está fijando su precio contra un número que
ignora sus dos mensajes más caros: el `sendText` y el `sendDocument` que el
contralor archiva.

**Causa raíz probable.** El registro se cableó por llamada de envío y no en el
borde: `sendText`/`sendDocument` de `meta/client.ts` no cobran nada por sí solos,
así que cada emisor nuevo tiene que acordarse — y ninguno de los tres emisores
nuevos se acordó.

---

### [ALTO · REINCIDENTE] N+1 sin tope: un `UPDATE` por línea de CFDI consolidado, dentro del webhook
`src/lib/likida/intake/consolidado.ts:258-270` · `:241-247` (`candidatosDb`)

**Escenario, con números.** Verificado línea por línea, sin cambios.
`esConsolidado` solo pide `lineas.length > 1` — no hay tope de líneas en ningún
lado. Por cada línea conciliada, un `await ligarLineaAGasto` secuencial (`:268`).
Una flota de 20 unidades con ~12 casetas al día y 22 días operados son ~5 000
líneas en un CFDI del TAG. Nominal: 300 líneas = 90 000 ms, **400 líneas =
120 000 ms = la invocación entera** (`webhook/whatsapp/route.ts:77`). En techo
(`acotada`, 8 s): 300 × 8 000 = 2 400 000 ms. `guardarYConciliarConsolidado` no
recibe el reloj.

**Consecuencia.** El `upsert` de `cfdi_xml` va **antes** del bucle y el `insert`
de `cfdi_consolidado_linea` **después** (`:272+`): si Vercel corta a media pasada
queda fila en `cfdi_xml`, K gastos con `cfdi_uuid` escrito, y **cero** líneas de
auditoría. El guardia de idempotencia solo dispara con `existentes.length > 0`,
así que al reenviar el archivo los K gastos ya ligados quedan fuera de
`candidatosDb` (`.is('cfdi_uuid', null)`, `:243`) y **sus líneas se reportan como
huérfanas**. El contralor persigue facturas que ya están conciliadas. Agravante
en la misma función: `candidatosDb` (`:240-247`) se lee **sin `traerTodo` y sin
`.range()`** → PostgREST la recorta a 1 000 filas en silencio.

---

### [MEDIO · REINCIDENTE] `getGastosFiscales` resuelve el contexto de viaje con un `.in()` sin paginar, y corre 4 veces por carga — una de ellas sin cota de fecha
`src/lib/likida/fiscal.ts:764-777` · llamada 4× desde `dashboard/page.tsx:111,116` vía `fiscal.ts:865-869`

**Escenario, con números.** Tras el barrido paginado, `getGastosFiscales` junta
todos los `viaje_id` distintos y hace **una** consulta `.in('id', viajeIds)`
**sin `.range()` y sin `traerTodo`** (`:767-771`). `getGastosFiscalesSeries`
(`fiscal.ts:865`) la llama tres veces más, y la tercera usa
`resolverPeriodo('todo', hoy)` — `desde` y `hasta` ambos `null` (`:868`), o sea
todos los gastos de la vida del tenant, o sea **todos sus `viaje_id`**.

- Con 960 viajes: el `.in()` manda un GET con 960 UUIDs en el query string ≈
  **37 KB de URL**. El límite documentado de Cloudflare (que fronterea a Supabase)
  son 16 KB: se pasa a partir de ~410 viajes. `exigir()` lanza (`:772`) →
  `safe()` devuelve `null` → **la tarjeta "Tu motor fiscal" desaparece entera**.
- Si la URL sí pasa, PostgREST recorta el resultado a 1 000 filas en silencio: a
  partir de 1 000 viajes, `viajeFolio` y `operadorNombre` vuelven `null` para el
  resto, y la pantalla fiscal enseña comprobantes sin folio sin decir que le
  faltó leer.

Y son 4 GETs de decenas de KB **por cada carga**, uno de ellos siempre del tamaño
máximo.

**Consecuencia.** El diferenciador del producto se apaga entero, o miente por
omisión, en función de cuántos viajes lleva la flota — sin log, porque el 414
sube como excepción a `safe()`. El propio comentario de `:761-763` explica que la
segunda consulta existe para no confiar en el join anidado de PostgREST *"que no
pagina el lado embebido"*: se cambió un recorte silencioso por otro.

---

### [MEDIO · NUEVO] La tabla que gobierna el presupuesto del cierre apunta a once líneas que no son las suyas
`src/lib/likida/presupuesto.ts:38-57` (columna `donde`) · `src/lib/likida/processor.ts`

**Escenario, con números.** `PASOS_CIERRE` documenta cada paso con un
`archivo:línea`, y ese es el mecanismo con el que el archivo dice —arriba,
`:23-32`— que la reserva deja de ser una lista en prosa imposible de verificar.
Fui a comprobar la suma paso por paso y **ninguna de las once referencias apunta
al paso que nombra**:

```
donde declarado          línea real de processor.ts hoy
processor.ts:591   →  '}'                       (registrarCosto vive en :625 para WhatsApp)
processor.ts:595   →  'return;'
processor.ts:658   →  un comentario sobre el aviso de privacidad
processor.ts:715   →  '// ¿ESTA FOTO LLEGÓ SOLA?'
processor.ts:734   →  'if (await gastoExistePorHash(...))'
processor.ts:755   →  un `say()` de foto duplicada
processor.ts:757/758 → 'catch (e)' y su comentario
processor.ts:774   →  un comentario sobre la palabra del sistema
processor.ts:814   →  un comentario sobre la SEGUNDA foto
processor.ts:2161  →  'try {'   (el createSignedUrl del contralor está en :2178)
```

**Consecuencia.** El único artefacto del repo que documenta el costo del cierre
—y el que su prueba usa como checksum contra `MARGEN_CIERRE_MS`— **no se puede
auditar leyendo el código al que apunta**. Es la razón concreta de que el CRÍTICO
lleve cuatro rondas: para verificar los 9 400 ms hay que reconstruir a mano qué
paso es cuál, y quien no lo haga da la tabla por buena. Un paso que se mueva de
archivo tampoco produce ningún síntoma: la prueba compara sumas, no rutas.

**Causa raíz probable.** Las líneas se escribieron una vez y `processor.ts` creció
a 2 269 líneas alrededor; nada las revalida.

---

### [MEDIO · REINCIDENTE] QStash movió el hallazgo del lote de 8, no lo cerró: el worker declara 600 s y corta a los 150 s del presupuesto del cron
`src/app/api/cron/facturar/cola/route.ts:11` · `src/app/api/cron/facturar/route.ts:25,129,158`

Sin cambios. `cola/route.ts:11` declara `maxDuration = 600` y su comentario dice
que existe porque *"el techo de 300 s de una invocación directa es justo lo que
esta cola existe para romper"* — pero llama a `procesarLoteEnCola`, que usa la
constante de módulo del cron: `PRESUPUESTO_LOTE_MS = maxDuration * 1000`
(`facturar/route.ts:129`) con el `maxDuration = 300` de `:25`. El corte sigue
siendo `300 000 − 150 000 = 150 000 ms` (`MARGEN_LOTE_MS`, `:158`). Con el peor
caso medido de una sesión de portal (~147 s): flota 1 termina en t = 147 s, flota
2 pasa el corte y termina en t = 294 s, flota 3 se corta. **2 flotas de las 8 del
lote, usando 294 s de los 600 declarados.** Ocho flotas con un ticket cada una
tardan 4 horas en drenar, y el cron se ve verde.

---

### [MEDIO · REINCIDENTE] La foto va al modelo de visión a resolución nativa, mientras el mismo repo ya redimensiona para lo que es gratis
`src/lib/likida/intake/ocr.ts:253-260` · `src/lib/llm/openrouter.ts:383` · `src/lib/likida/intake/cfdi.ts:249`

Sin cambios. `downloadMediaAsDataUrl` devuelve el JPEG tal cual lo mandó el
teléfono; `extraerComprobante` lo pasa a `generateStructured({ images:
[principal] })` (`ocr.ts:257`) y `openrouter.ts:383` lo adjunta como
`image_url: { url }` sin `detail` ni preproceso — verificado con `grep -n
"image_url\|detail"`, una sola línea. Un teléfono de gama media manda
4 000 × 3 000 px; Gemini tesela en cuadros de 768:
`ceil(4000/768) × ceil(3000/768) = 24` teselas ≈ **6 200 tokens de entrada**. A
1 024 px de ancho —de sobra para un ticket térmico— son 2 teselas ≈ **520
tokens**: **~12× menos entrada por comprobante**. Lo que lo hace descuido y no
decisión: `decodeCodigosFromImage` (`cfdi.ts:249`) YA hace
`sharp(...).rotate().resize({ width: 1600 })` sobre la misma imagen. Se
redimensiona para el lector de códigos, que es gratis, y no para la llamada de
visión, que es lo que se paga. La medición del 4-ago (`models.ts:36-47`) comparó
**modelos** con la misma imagen inflada, así que este ahorro no aparece ahí.

---

### [MEDIO · REINCIDENTE] `cola/route.ts` declara 600 s contra el techo de 300 s que este mismo repo verificó
`src/app/api/cron/facturar/cola/route.ts:11` vs `src/app/api/webhook/whatsapp/route.ts:69-71`

Sin cambios. El webhook documenta *"VERIFICADO el 28-jul-2026 contra la API de
Vercel: … plan **pro**, donde el tope es 300 s"*. El callback declara 600.
`vercel.json` (leído hoy) trae solo `$schema`, `ignoreCommand` y `crons`: **sin
bloque `functions`**, sin nada que declare Fluid Compute. Hoy no muerde porque el
corte real es a los 150 s; muerde el día que alguien arregle
`PRESUPUESTO_LOTE_MS`: el worker creería tener 600 s, abriría una sesión de
portal en `emitir` a t = 440 s y moriría a los 300 con el CFDI posiblemente
timbrado en el SAT y `cfdi_uuid` sin escribir. Dos números que dicen cosas
distintas del mismo plan, y ninguna prueba los enfrenta.

---

### [BAJO · REINCIDENTE] 25 de los 29 `traerTodo` de la landing no piden `conteo()` y pagan una página vacía cada uno
`src/lib/likida/pg.ts:68` (`conteo`) · `:160-163` (la página vacía como única prueba alternativa)
· los 4 que sí lo piden: `fiscal.ts:753`

`traerTodo` demuestra que trajo todo por el `count` de PostgREST (**gratis**,
viene en la primera respuesta) o por una página vacía. `grep -rn "conteo("
src/lib/likida/*.ts` sin tests: los 25 usos productivos viven en `operacion.ts`
(la landing del encargado, que lo hace bien), `recordatorio_comprobacion.ts` y
`repo.ts`; en el camino de la landing del dueño **solo `fiscal.ts:753`** lo pide.
Son **25 viajes de red de los 214 (12%)** por no pasar un argumento que el helper
ya expone. Es el único hallazgo de la lista cuyo tamaño no crece con el cliente,
y el más barato.

---

### [BAJO · REINCIDENTE] El índice de la mig. `0087` lidera con `tenant_id`, que su único consumidor nunca filtra
`supabase/migrations/0087_recordatorio_comprobacion.sql:19-21` · `src/lib/likida/recordatorio_comprobacion.ts:54-62`

`idx_viaje_recordatorio_pendiente` es
`(tenant_id, estatus, fecha_inicio) where recordatorio_comprobacion_en is null`.
La única consulta que existe, `viajesSinComprobar` (`:54-62`), filtra por
`estatus IN (...)`, `fecha_inicio <= limite` y `recordatorio_comprobacion_en IS
NULL` — y **no filtra por `tenant_id`**: es un cron global. Con la columna líder
sin restringir, Postgres no puede hacer *seek* por `fecha_inicio`; tiene que
recorrer el índice parcial entero filtrando fila por fila. La mig. `0058`, misma
familia, lo hizo bien: `viaje_sin_aceptar_idx on viaje (avisado_en) where
aceptado_en is null and escalado_en is null and estatus = 'abierto'` — la columna
del rango primero, todo lo constante en el predicado. Hoy el índice parcial es
chico y no duele; duele cuando `recordatorio_comprobacion_en IS NULL` cubra los
viajes de todos los tenants que aún no ha alcanzado el lote de 100/hora.

---

## Lo que revisé y está bien

- **`operacion.ts` es el contraejemplo bueno, y está en el mismo repo.** Los 25
  `traerTodo` de la landing del encargado piden `conteo()` **todos**
  (`operacion.ts:52,57,62,67,125,167,172,252,262,266,325,330,335,438,442,446,450,503,513,523,547`),
  así que ninguno paga la página vacía. 13 viajes de red contra 244. Cuando el
  panel del dueño se rehaga, el patrón ya está escrito.
- **`acotada()`** (`presupuesto.ts:155-176`) sigue haciendo lo que dice: impone
  `abortSignal` **y** una carrera contra temporizador, y devuelve el fallo por el
  mismo canal `{data:null,error}` que Postgres, sin cambiar la semántica de
  ningún llamador. El problema no es el mecanismo, es dónde no se usa.
- **`traerTodo` avanza por filas leídas y no por número de página**
  (`pg.ts:147`) y falla cerrado con `LecturaIncompleta` (`:174`) en vez de
  devolver una cifra corta. Correcto ante un `max_rows` bajo de proyecto.
- **`getSerieComparativa` internamente hace lo correcto**: trae el rango completo
  UNA vez por tabla y bucketea en memoria (`analytics.ts:78-80,105-128`), en vez
  de una consulta por paso. Es el patrón bueno; lo que falla es que
  `getSeriesKpiCards` (`:174-178`) lo llama tres veces.
- **`getViajesPorMes`** (`analytics.ts:509-528`) hace bien en NO reusar el
  `getViajes(limite=100)` que la página ya tiene: un tope de 100 en la vista
  "Histórico" se leería como la serie completa. Paga un barrido, y el barrido
  está justificado por escrito.
- **`contarFilas`** (`analytics.ts:628-639`) usa `head: true` y lanza si el
  `count` no es número, en vez de devolver un 0 inventado. Es exactamente el
  patrón que `detectarAnomalias` debería estar usando para lo único que la
  landing hoy le pide.
- **El reloj compartido de la invocación** (`presupuesto.ts:248-266`) sigue
  siendo correcto hasta que el agente devuelve: `esperarIntake`
  (`processor.ts:1718`), el mutex (`:1751`, `:1390`), el OCR (`:525`, `:798`) y
  `runAgent` (`:1853`) piden todos por `reloj.acotar()`/`reloj.senal()`.
  `senal()` devuelve una señal YA abortada cuando no queda nada (`:262`).
- **`MARGEN_LOTE_MS` en `cron/facturar`** (`facturar/route.ts:158`): el corte por
  reloj antes de cada `conNavegador` y antes de cada portal nuevo es correcto, y
  lo no intentado no se marca. Falla la constante que lo alimenta, no el
  mecanismo.
- **`getAcumuladoCombustible` pide el `count` solo en la primera vuelta**
  (`repo.ts:822-840`) y falla cerrado si `leidas < esperadas` (`:856-861`). Lo
  malo es la N de páginas, no cómo las cuenta.
- **Los timeouts del cliente de Meta** siguen en su sitio: `SEND_TIMEOUT_MS =
  10_000`, `DOWNLOAD_TIMEOUT_MS = 15_000` (`meta/client.ts:10,17`).
- **Caché de prompt en el ciclo de tools** (`openrouter.ts`): el breakpoint va en
  el system, que es el bloque invariante, y solo para `anthropic/`. Sin cambios
  en los 9 commits, y sigue bien puesta.
- **Compuerta corrida hoy sobre este árbol:** `npx tsc --noEmit -p .` → 0 errores.

---

## Lo que NO alcancé a revisar

- **Latencia real Vercel ↔ Supabase.** Todas mis sumas usan los costos nominales
  que el repo escribe (0.3 s/consulta) y los techos que impone.
  `presupuesto.ts:97-99` admite que nadie ha medido el p99 real. Si el p99 de una
  página de 1 000 filas es 0.6 s en vez de 0.3, la fila E pasa de 7.8 a 15.6 s y
  cruza el default de plataforma **hoy**, no en el mes 2.5.
- **Qué `maxDuration` hereda de verdad una página del App Router en este
  proyecto.** Verifiqué que no se declara en ningún lado (ni en la página, ni en
  `vercel.json`, ni en `next.config.ts`); no pude verificar contra la API de
  Vercel si el equipo tiene Fluid Compute activo, que cambiaría el default de
  15 s a 300 s. Ese número decide si la fila E es un ALTO o un MEDIO.
- **El costo por liquidación medido de punta a punta.** `models.ts:17` promete
  $0.03–0.05 y hay mediciones **por comprobante** (18 tickets, 4-ago,
  `models.ts:36-47`). No encontré una medición del ciclo completo con la caché de
  prompt activa. Sin ese número no se puede afirmar "el costo por operación está
  medido" — y el hallazgo de los mensajes sin registrar dice que el número que
  existe está mal a la baja.
- **El plan de ejecución real de las consultas de `analytics.ts` en Postgres.**
  Conté viajes de red y filas transferidas; no corrí un `EXPLAIN` contra una base
  con datos, así que no sé cuáles de los 29 barridos usan índice y cuáles hacen
  seq scan. `idx_gasto_acumulado` (0023) es `(tenant_id, concepto, fecha)` y
  varias de las consultas nuevas ordenan por `id`, no por `fecha`.
- **`/api/export/liquidaciones` y `/api/export/pdf/[id]`**: siguen sin declarar
  `maxDuration` (`grep -rn maxDuration src/app/` no los lista); no sumé su peor
  caso.
- **`/dashboard/combustible-casetas`, `/arco`, `/usuarios`, `/politicas`,
  `/soporte`, `/suscripcion`, `/configuracion`, `/[id]`** — las 8 páginas del
  cliente que sobrevivieron además de la landing. Solo conté
  `combustible-casetas` (57 + 30 = 87 viajes de red, dos barridos completos de
  `gasto` en `getGastoPorConcepto` y `detectarAnomalias`, más un
  `getDocumentos(tenantId, 1000)` cuyo `.limit(1000)` coincide exactamente con el
  `max_rows` de PostgREST). Las otras siete no las sumé.
- **`api/cron/purgar`**: es un solo RPC, el trabajo pesado vive en
  `mantenimiento_de_datos` en SQL. No leí la función de la base.
- **Los topes internos de `pagina_playwright.ts` y `capufe.ts`.** Tomé el ~147 s
  del peor caso de una sesión como dado (viene de la auditoría 10 y está citado
  en `facturar/route.ts:135-141`).
- **`npx vitest run` y `npm run lint`** — tomé la línea base de la compuerta del
  MAPA (3 105 verdes, 0 errores / 17 warnings). Solo corrí `tsc` yo mismo.
