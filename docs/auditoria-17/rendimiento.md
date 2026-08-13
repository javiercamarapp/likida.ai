# Rendimiento y costo — auditoría 17 · pase 6 (13-ago-2026)

**Nota: 3/10** (antes 4). Razón del movimiento: **deuda que cobró factura**. El
pase 4 dejó escrito que el modo de falla del rubro era "cada emisor nuevo tiene
que acordarse de registrar su costo — y ninguno de los tres se acordó". Este
pase trajo **dos subsistemas nuevos que gastan dinero por clic del usuario**
(`/api/dashboard/chat` y `/api/dashboard/ingesta`) y uno de los dos **no
registra un solo centavo**; el otro trae un tope diario que **no acota nada**
porque se comprueba antes de gastar y solo se cobra el camino feliz. A eso se
suma un lector de archivos sin cota de trabajo y un panel reescrito que dejó las
consultas por carga exactamente donde estaban. **Cerrados por arreglo: 0 de 12.**

Lo único que se movió a favor lo movió un borrado: el rail del Asistente murió
(`chrome.tsx:108-111`), y con él los **30 viajes de red** que cada carga de
navegador pagaba de más. El total de una carga baja de **244 a 215** — y los 215
son los mismos 214 del SSR de siempre.

**El riesgo mayor hoy:** el chat es la primera superficie del producto donde un
usuario decide, escribiendo, cuánto dinero de modelo se quema — y sus tres
capas de contención (5 rondas, 12 turnos, $1/día) **no cubren el caso que las
motivó**: un turno que falla gasta y cuenta cero, y dos peticiones a la vez ven
las dos el mismo saldo.

---

## Lo que medí yo, este pase

Todo lo que sigue lo corrí sobre este árbol (`npx tsc --noEmit -p .` → 0
errores; `npx vitest run src/lib/agents src/app/api/dashboard` → 26 verdes).
Los benchmarks se corrieron con el `xlsx` y el código REAL del repo, empaquetado
con esbuild contra `src/`, fuera del árbol.

| Medición | Valor | Cómo |
|---|---|---|
| System prompt del analista | **5,831 chars** (~1,700 tokens) | `getSystemPrompt('analista_flota', …)` ejecutado |
| Catálogo de tools que viaja en CADA ronda | **4,771 chars** JSON (~1,300 tokens) | `JSON.stringify(toolSchemas([...11 tools]))` |
| Números distintos que un extracto de hoja de 15,000 chars mete en `respaldo` | **748** (tope de `esDerivada`: 600) | `extraerNumeros` sobre un extracto sintético del formato que produce `archivo.ts` |
| `esDerivada` con respaldo de 600, 40 cifras no respaldadas | **40 ms** | no es un problema — ver "lo que está bien" |
| `leerArchivoUniversal` sobre .xlsx de **8.92 MB** (100k filas × 8 col) | **5,357 ms · +178 MB heap · 373 MB RSS** → extracto de 6,760 chars | banco con el `xlsx` del repo |
| Idem sobre .xlsx de 25 MB (200k × 10) | **12,884 ms · 1,143 MB RSS** | idem (por encima del tope del endpoint; sirve de pendiente) |

---

## El reconteo del panel reescrito: **215**, contra 214 del pase 4

El Resumen se mudó de `dashboard/page.tsx:90-122` a
`dashboard/inicio-contenido.tsx:84-118`, y pasó de **12 a 13 llamadas** en el
`Promise.all` (entró `getLiquidaciones`). **Ninguna se quitó.** El escenario es
el mismo del pase 2/4 para poder comparar: flota de 20 unidades, un año
operando, 66 comprobantes/día — 24,090 filas de `gasto`, 960 de `viaje`, 960 de
`liquidacion`, 14,850 gastos en el ejercicio 2026 al 13-ago.

Cada `traerTodo` paga `ceil(filas/1000)` páginas **+ 1 página vacía** si el
llamador no pidió `conteo()` (`pg.ts:158-163`).

```
 2  getAcreditables               liquidacion del ejercicio
 2  getKpis                       liquidacion completa, sin ventana
26  detectarAnomalias             gasto COMPLETO, sin filtro de fecha   analytics.ts:268
 1  getViajes(100)                consulta suelta
38  getGastoPorSemanaSeries       3 barridos: 35d(4) + 91d(8) + 364d(26)  analytics.ts:436
 6  getLiquidadoPorSemanaSeries   3 barridos de liquidacion
45  getSeriesKpiCards             3 × getSerieComparativa × 3 tablas; el de 3650d
                                  es otro barrido completo de gasto (26)  analytics.ts:177
 1  getConfig
16  getGastosFiscales(ejercicio)  15 páginas con conteo() + 1 `.in()`
31  getGastosFiscalesSeries       7d(2) + 30d(3) + 'todo'(26)             fiscal.ts:865-869
 2  getViajesPorMes               viaje completo
44  getTopRutasPorGastoSeries     3 × (gasto + viaje); el histórico va SIN ventana
 1  getLiquidaciones(50)
───
215 viajes de red · 6 lecturas grandes de `gasto`, 5 de ellas sin cota efectiva
```

**Lo que cambió respecto al pase 4:** el rail murió (−30) y entró
`getLiquidaciones` (+1). El SSR sigue en 214–215. **`acotada` sigue sin
aparecer una sola vez en `analytics.ts`** (el único `grep` que pega es el
comentario de `:918`), así que las 215 heredan los 300,000 ms de undici, y
sigue sin haber un `maxDuration` de página contra el cual medirlas
(`grep -rn maxDuration src/app/` → 8 rutas de API, cero páginas; `vercel.json`
leído hoy, sin bloque `functions`).

---

## Hallazgos

### [CRÍTICO · REINCIDENTE] El cierre del webhook son 13,700 ms nominales contra los 12,000 que él mismo aparta, y ningún paso del cierre consulta el reloj
`src/lib/likida/presupuesto.ts:37-58` (`PASOS_CIERRE`, 14 filas) · `:61` (`COSTO_CIERRE_MS`) · `:79` (`MARGEN_CIERRE_MS = 12_000`)
· `src/lib/likida/processor.ts:2190` (`avisarCierreAlJefe`), `:2217` (`saveConversation`), `:2267` (`releaseViajeLock`)
· `src/lib/likida/avisar_cierre.ts:51-66` (`resumenDeCierre`), `:109` (`sendText`), `:127` (`sendDocument`) · `src/lib/likida/contactos.ts:97,118`

**Verificado hoy, idéntico.** Sumé la tabla a mano contra el archivo de este
árbol: 14 filas, **9,400 ms**. `MARGEN_CIERRE_MS` sigue en 12,000. Y el propio
comentario de `presupuesto.ts:50-55` lo admite por escrito: *"el aviso al jefe
en sí —2 lecturas y un envío— sigue SIN presupuestar: es el CRÍTICO de
rendimiento de esta ronda"*.

```
COSTO_CIERRE_MS (14 pasos, presupuesto.ts:61)          9 400 ms
 − guardiaCifras→cuadrarDesdeDB (snapshot, feliz)       − 300
 + telefonoJefeDe        contactos.ts:97                 300
 + resumenDeCierre       avisar_cierre.ts:51 (2 en ‖)    300
 + sendText al jefe      avisar_cierre.ts:109          1 500
 + sendDocument al jefe  avisar_cierre.ts:127          2 500
                                                    ──────────
                                                      13 700 ms   vs 12 000
```

Como `restante() = 120_000 − 12_000 − transcurrido` (`presupuesto.ts:250`), el
agente puede devolver legítimamente en t = 108,000 ms → cierre nominal en
**t = 121,700 ms** contra `maxDuration = 120` (`webhook/whatsapp/route.ts:77`).
Y verificado hoy con `awk 'NR>1853 && /reloj\./'` sobre `processor.ts`:
**cero coincidencias** — desde el último `reloj.acotar()` nada del cierre
vuelve a mirar el reloj. Los dos pasos que faltan son además los únicos sin
techo de ninguna clase: `telefonoJefeDe` (`contactos.ts:97`) y `resumenDeCierre`
(`avisar_cierre.ts:52`) llaman a `supabaseAdmin()` en crudo, sin `acotada` →
300,000 ms de undici cada uno.

**Consecuencia.** Vercel mata la función con la liquidación ya escrita y el
viaje ya `liquidado`. `saveConversation` (`:2217`) no corre → el turno se pierde
y el agente vuelve sin memoria de haber cerrado. `releaseViajeLock` (`:2267`, en
el `finally`) no corre → el lease queda tomado hasta su TTL. El contralor no
recibe ni el aviso ni el PDF. No hay log: el proceso muere antes del `catch`.
Meta tiene su 200 y no reintenta.

**Causa raíz probable.** La prueba que custodia la reserva es un checksum sobre
la tabla y, por construcción, no puede ver un paso que nadie anotó.

---

### [CRÍTICO · NUEVO] El tope de $1/día no acota el gasto del chat: se lee antes de gastar, y solo se cobra el camino feliz
`src/app/api/dashboard/chat/route.ts:80-96` (la lectura del tope) · `:99` (la corrida) · `:102-107` (la escritura del costo) · `:109-112` (el `catch` que la tira)
· `src/lib/agents/analista.ts:310` (el abort a 40 s), `:311-411` (`try` **sin `catch`**)
· `src/lib/llm/openrouter.ts:775,825` (`LoopGuardError`), `:828` (`PartialExecutionError`, que **lleva el costo dentro**)

El commit `6fe2370` vende el tope como el respaldo del pricing ("tope diario
sube a $1 USD"). Verifiqué el mecanismo y **no acota** por dos caminos
independientes que comparten causa: el medidor se escribe **después** del gasto
y **solo si el turno salió bien**.

**Escenario A — dos consultas a la vez (o cincuenta).** `route.ts:80` lee la
suma del día; `route.ts:103` escribe la fila. Entre las dos hay una corrida
completa del analista: **2 a 9 llamadas al modelo más hasta 130 viajes de red a
Supabase** (ver el ALTO siguiente), o sea entre ~4 s y los 60 s de
`maxDuration`. Toda petición que entre en esa ventana lee el saldo **anterior**.
No hay reserva, no hay `UPDATE … RETURNING`, no hay lock, y estos tres endpoints
nuevos son los únicos del repo que **no usan `src/lib/ratelimit.ts`** (sí lo
usan `webhook/whatsapp`, `export/liquidaciones`, `export/pdf/[id]` y `demo`).
Con el turno caro medido abajo ($0.048), **50 POST en paralelo con el saldo en
$0.00 gastan $2.40 contra un tope de $1**; 500 gastan $24. El tope no cae porque
nunca se vuelve a consultar dentro del turno.

**Escenario B — el turno que falla gasta y cuenta cero.** `ejecutarAnalista`
tiene `try { … } finally { … }` **sin `catch`** (`analista.ts:311`, `:411`).
Cualquier fallo sube: `LoopGuardError` cuando el modelo todavía pide tools en la
5.ª ronda (`openrouter.ts:774-776`), el `AbortError` de los 40 s
(`analista.ts:310`), o el corte de Vercel. `generateWithTools` lo envuelve en
`PartialExecutionError` **cargando `tokIn`, `tokOut` y `costo`**
(`openrouter.ts:828`) — y `route.ts:110` **solo loguea `err.message`** y
devuelve 502. El costo que viene dentro de la excepción se tira.

Con números: un turno que agota sus 5 rondas antes de morir ha pagado hasta
**~71,500 tokens de entrada = $0.021** que quedan en **$0.00** en `llm_costo`,
para siempre. Repetir esa consulta 100 veces cuesta $2.10 y el tope sigue
leyendo cero. Y el mismo agujero apaga el otro medidor: `/admin` (la consola de
costo de IA) agrega `llm_costo`, así que ese gasto no existe en ninguna
pantalla.

**Consecuencia.** Producto pre-revenue: cada peso de modelo sale del bolsillo
del fundador, y la única defensa contra "que no implique que si se quedan ahí
todo el día quemar un exceso de tokens" —el pedido literal citado en
`route.ts:8-9`— no cubre ni la concurrencia ni el fallo. Peor que gastar de más
es que el número con el que se va a fijar el precio se lea **bajo**: el error va
en la dirección que nadie revisa, exactamente lo que `costos.ts:5-9` prohíbe
por escrito.

**Refutación que intenté y falló.** *"El `finally` de `analista.ts:411` limpia y
el llamador cobra"*: el `finally` solo hace `clearTimeout` y borra la captura
(`:412-413`); no toca el costo. *"El cliente aborta a 75 s y ya"*
(`chat.tsx:379`): abortar el navegador no detiene la función ni recupera el
costo — al contrario, garantiza que el turno muera por el camino B.

**Causa raíz probable.** El medidor es contable, no presupuestario: se escribe
al final del camino feliz en vez de reservarse al principio del turno.

---

### [ALTO · NUEVO] `/api/dashboard/ingesta` llama al modelo de visión y NUNCA registra el costo: endpoint de pago sin medidor, sin tope y sin rate limit
`src/app/api/dashboard/ingesta/route.ts:50-54` · `src/lib/likida/intake/ocr.ts:470` (devuelve `costo`) · `src/lib/llm/models.ts:36-48` (los precios medidos)

**Escenario, con números.** `grep -rn "registrarCosto" src/` sin tests devuelve
**cinco sitios de llamada**: `chat/route.ts:103` y cuatro en `processor.ts`.
Ninguno está en `ingesta/route.ts`. El handler recibe `r.costo.costoUsd`
(`ocr.ts:470`), lo **loguea** (`route.ts:53`) y lo tira.

El modelo es el rol `ocr`, y el propio repo midió su precio el 4-ago contra 18
comprobantes reales (`models.ts:36-47`): **$0.0188 por comprobante** con el
default de código (`google/gemini-3.6-flash`), **$0.0015** con el override que
vive en Vercel (`3.1-flash-lite`). Y la imagen va **sin redimensionar**
(`ocr.ts:257` → `openrouter.ts:388`, `image_url` sin `detail`): una foto de
teléfono de 4000×3000 son 24 teselas de Gemini ≈ **6,200 tokens de entrada por
clic**. El tope del endpoint es de tamaño, no de gasto: `MAX_DATAURL = 9_000_000`
(`route.ts:26`), sin tope diario, sin rate limit, sin `viajeId` que lo ate a
nada.

Un contralor probando la sonda con 200 fotos de su carpeta: **$3.76** (default)
o **$0.30** (override), y `llm_costo` queda **vacío** — el panel de costo de IA
reporta $0 y el tope de $1/día del chat, que vive en la misma pantalla, no ve un
centavo. A ~5 s por llamada eso son hasta **$13.5/hora** invisibles.

**Refutación que intenté y falló.** El encabezado del archivo dice a propósito
*"NO ESCRIBE NADA: ni gasto, ni foto, ni costo por liquidación"* (`:6-8`). Pero
"costo **por liquidación**" no es lo mismo que "costo": `registrarCosto` acepta
`viajeId: null` y ya se usa así en `processor.ts:526` para exactamente este caso
(OCR sin viaje todavía). No registrarlo no es la decisión que el comentario
describe; es su efecto colateral.

**Consecuencia.** Es la misma familia que el ALTO reincidente de los mensajes de
WhatsApp, un tamaño más grande: ahí faltaban tres emisores, aquí falta un
endpoint entero. `models.ts:17` promete $0.03–0.05 por liquidación y ese número
se calcula desde `llm_costo`.

---

### [ALTO · NUEVO] Una sola pregunta del chat dispara hasta 130 viajes de red y 5 barridos completos de `gasto`, sin un solo techo
`src/lib/agents/chat-tools.ts:153` (`serie_gasto`), `:183` (`top_rutas`), `:91` (`motor_fiscal`), `:251` (`duplicados_detectados`), `:233` (`proyectar_serie`)
· `src/lib/likida/analytics.ts:436-440`, `:1033-1037` · `src/lib/likida/fiscal.ts:865-869`
· `src/lib/llm/tool-executor.ts:20-33` y `src/lib/agents/analista.ts:277` (el `ctx` **sin** `signal`)

**Escenario, con números.** Las tools reusan las funciones `*Series` del panel,
que calculan **las tres ventanas y tiran dos**: `serie_gasto` con
`modo:'semanal'` ejecuta igual `getGastoPorSemanaSeries`, que barre 35 d, 91 d
**y 364 d** (`analytics.ts:436-440`) y luego indexa una
(`chat-tools.ts:153`). Al volumen del reconteo:

| tool | viajes de red | de los cuales, trabajo tirado |
|---|---|---|
| `serie_gasto` (cualquier modo) | **38** | 34 (las dos ventanas no pedidas) |
| `top_rutas` (cualquier modo) | **44** | ≥34; el histórico va **sin ventana** (`analytics.ts:1036`) |
| `duplicados_detectados` | **26** | — barrido de `gasto` sin filtro de fecha |
| `motor_fiscal` | **16** | — |
| `proyectar_serie('gasto')` | **38** | 38 si `serie_gasto` ya corrió: llave de caché distinta |

El propio prompt ordena pedirlas todas en una ronda (`prompts.ts:47-48`: *"Pide
TODAS las tools que vas a necesitar EN UNA SOLA ronda"*), así que
"¿por qué subió mi gasto?" son **85 viajes de red** (`serie_gasto` +
`top_rutas` + `viajes_flota` + `kpis_flota`) y con duplicados **111** — entre el
**40% y el 60% de la landing entera**, por una pregunta.

**Y no hay ningún reloj.** `analytics.ts` no usa `acotada` (verificado hoy: 1
coincidencia, y es un comentario). El `AbortController` de `analista.ts:310` se
pasa **solo** a `client.chat.completions.create` (`openrouter.ts:712`); el
`ToolContext` que arma `analista.ts:277` **no lleva `signal`**, y
`tool-executor.ts:20-33` deja escrito que ningún handler lo leería aunque lo
llevara. Nominal a 0.3 s/página: 7.8 s de pared (los barridos van en `Promise.all`).
Al p99 de 0.6 s que `presupuesto.ts:97-99` admite que nadie ha medido: 15.6 s. Sin
techo: 26 páginas × 300,000 ms de undici.

**Consecuencia.** El turno muere en los 60 s de `maxDuration`
(`chat/route.ts:28`), el navegador recibe un 500, `chat.tsx:384` cae al
respondedor enlatado local — y el usuario ve una respuesta plausible sin saber
que el analista nunca contestó. Los tokens ya quemados no se registran (CRÍTICO
anterior, escenario B). El mismo patrón bueno existe en el repo:
`getGastoPorSemana(tenantId, semanas)` acepta la ventana; solo la envoltura
`*Series` las pide las tres.

---

### [ALTO · NUEVO] Con un archivo adjunto la guardia de cifras se apaga sola (748 números contra un tope de 600) y garantiza el reintento: el turno cuesta 10× lo que su propio tope supone
`src/lib/agents/analista.ts:153` (`if (arr.length > 600) return false`) · `:338` (las cifras del documento entran a `respaldo`) · `:348-376` (el reintento) · `:382-400` (la red final)
· `src/lib/likida/intake/archivo.ts:19` (`MAX_EXTRACTO = 15_000`) · `src/app/api/dashboard/chat/route.ts:76` · `src/lib/agents/prompts.ts:41`

**Escenario, con números — medido.** Construí un extracto del formato exacto que
produce `leerHoja` (5 hojas × 60 filas × 8 columnas: folio, fecha, RFC, montos)
y lo corté en `MAX_EXTRACTO`. `extraerNumeros` sobre esos 15,000 caracteres
devuelve **748 números distintos**. `esDerivada` (`analista.ts:153`) se rinde
por encima de **600**: a partir de ahí **devuelve `false` para todo**.

Lo que eso apaga es exactamente lo que el prompt **ordena hacer**: *"Puedes
COMPARAR cifras de tools (sumas, restas y porcentajes entre ellas: 'gastaste 500
más', 'eso es el 38%') — el sistema lo verifica"* (`prompts.ts:41`). Con un
Excel adjunto, la primera comparación que el modelo narre se juzga inventada
(`analista.ts:180`), `cifrasRespaldadas` devuelve `false` y **se dispara el
reintento correctivo** (`:348`): una segunda `generateWithTools` completa, hasta
4 rondas más. El reintento **no puede** arreglarlo: `:367` sigue **sumando**
números a `respaldo`, así que el tope de 600 sigue rebasado y la respuesta
termina en la tabla de emergencia de `:391-395`.

El costo del turno tope, con el documento y el historial en sus máximos:

```
por ronda: system 5,831 + audiencia/fecha ~240 + doc 15,000 + wrapper ~380
           + tools 4,771 + historial (12 × 2,000)          ≈ 51,200 chars
                                                           ≈ 14,600 tokens
5 rondas del primer intento         73,000 tokens de entrada
4 rondas del reintento              58,400
                                   ────────
                                   131,400 in + ~3,600 out
  × google/gemini-3.5-flash-lite  ($0.30 / $2.50 por M, openrouter.ts:135)
                                   = $0.0394 + $0.0090 = $0.048 por turno
```

Contra lo que el propio tope supone: *"a ~$0.005 el análisis medido, $1 son ~200
análisis/día"* (`chat/route.ts:32-34`). Los $0.005 **son correctos** para el
turno mediano (lo calculé: 3 rondas, sin documento, historial corto ≈ $0.0045).
El tope se dimensionó con la mediana y **el peor caso es 10× mayor: $1 son 21
turnos, no 200**. Y nada de esto se cachea: `openrouter.ts:671` pone el
`cache_control` solo si el modelo matchea `/anthropic\//`, y el chat corre en
Google, así que los ~14,600 tokens de prefijo se pagan **completos en cada
ronda**.

**Consecuencia.** El contralor sube su libro de gastos —el caso de uso que este
release existe para servir (`archivo.ts:2-3`)— y recibe una respuesta degradada
("No alcancé a redactar el análisis completo…", `analista.ts:393`) por el
**doble** de dinero, con un `chat.guardia_bloqueo` en el log que nadie mira.
Ninguna prueba cubre el tope de 600: `analista_guardia.test.ts` prueba
`esDerivada` con respaldos de 2-3 números (`:61-68`).

---

### [ALTO · NUEVO] El lector de archivos materializa la hoja ENTERA antes de recortar a 60 filas
`src/lib/likida/intake/archivo.ts:83` (`XLSX.read` del libro completo) · `:88` (`sheet_to_json` de todas las filas) · `:90` (`.slice(0, MAX_FILAS_HOJA)`, **después**)
· `src/app/api/dashboard/archivo/route.ts:22` (`MAX_BASE64` ≈ 12 MB), `:18` (`maxDuration = 60`)

**Escenario, con números — medido con el `xlsx` del repo.** `MAX_FILAS_HOJA = 60`
y `MAX_HOJAS = 5` acotan **la salida**, no el trabajo: `XLSX.read` (`:83`) ya
parseó el libro completo, y `sheet_to_json` (`:88`) construye el arreglo de
**todas** las filas antes de que `:90` se quede con 60.

| archivo | dentro del tope de 12 MB | tiempo | heap | RSS | extracto entregado |
|---|---|---|---|---|---|
| 100,000 filas × 8 col (8.92 MB) | sí | **5,357 ms** | +178 MB | **373 MB** | 6,760 chars (60 filas) |
| 200,000 filas × 10 col (25 MB) | no (pendiente) | 12,884 ms | +374 MB | **1,143 MB** | 3,505 chars |

O sea: **1.1 millones de celdas parseadas y 373 MB de memoria para devolver 60
filas**, en una función con `maxDuration = 60` y sin reloj propio. Extrapolando
al tope real del endpoint (12 MB ≈ 135k filas): ~7.3 s y ~250 MB por petición.
Con el rate limiter del repo sin cablear aquí (`src/lib/ratelimit.ts` existe y
lo usan otras cuatro rutas), **cuatro subidas concurrentes de 12 MB ≈ 1.5 GB** y
la función muere por OOM **sin log**: el proceso se va antes del `catch` de
`route.ts:49`.

**Refutación que intenté y falló.** *"Los topes ya están"*: sí, pero después del
gasto. SheetJS expone `sheetRows` como **opción de lectura** —acota el parseo,
no la salida— y no se usa. El PDF sí lo hace bien (`:59`, `getText({ last: 25 })`
acota antes de extraer); la hoja de cálculo no.

**Consecuencia.** El primer archivo que sube un contralor es su exportación del
ERP del año. Cae en la franja medida y cuesta segundos de CPU y cientos de MB
para un extracto de 60 filas; una hoja más grande devuelve un 500 sin línea de
log que diga por qué.

---

### [ALTO · REINCIDENTE, QUINTA RONDA] La migración `0084` sigue sin que nadie la llame
`supabase/migrations/0084_sumar_combustible_ejercicio.sql:11` · `src/lib/likida/repo.ts:803-865` · `src/lib/likida/migraciones_verificadas.test.ts:57`

**Verificado hoy:** `grep -rn "sumar_combustible_ejercicio" --include=*.ts
--include=*.sql .` devuelve el SQL de la migración y **una sola línea de TS, que
es el texto de un test**. Cero `.rpc(...)`. `getAcumuladoCombustible` sigue
siendo el bucle de `repo.ts:819` con `PAGINA = 1_000` / `MAX_PAGINAS = 100`:
9,000 cargas de diésel en el ejercicio = **10 viajes de red seguidos**, 3,000 ms
nominales, 80,000 ms en techos, dentro de un turno acotado a 40,000 ms. Corre en
todo cierre (`cuadrarDesdeDB`) y en la tool `consultar_periodo`. Y
`migraciones_verificadas.test.ts:57` sigue afirmando en verde una frase falsa
("si falta, `getAcumuladoCombustible` lanza ruidoso… el RPC no existe") sobre
una función que no invoca ningún RPC — es la línea que hace que esto se lea como
cerrado cinco rondas seguidas.

---

### [ALTO · REINCIDENTE] `/api/cron/escalar` encadena dos lotes de 100 viajes con envíos: 510 s nominales contra 120
`src/app/api/cron/escalar/route.ts:11` (`maxDuration = 120`), `:66` y `:76` (los dos `await` consecutivos) · `escalar_viaje.ts:92` · `recordatorio_comprobacion.ts:62`

Sin cambios, verificado línea por línea hoy. `escalarViajesSinAceptar()` y
`enviarRecordatoriosComprobacion()` siguen siendo dos `await` secuenciales en la
misma invocación, cada uno con su `.limit(100)` y ningún `for` que consulte un
reloj: `100 × 3.3 s + (0.3 + 100 × 1.8 s) = 510,300 ms` contra 120,000. **Con 37
viajes sin aceptar el recordatorio nunca arranca**, y aislado tampoco cabe
(180,300 ms). `reclamarRecordatorio` sella `recordatorio_comprobacion_en`
**antes** de mandar, así que el viaje en vuelo cuando Vercel corta queda sellado
para siempre y su chofer nunca recibe el recordatorio. Los dos bloques tienen su
propio `try/catch` (`route.ts:65-83`), así que el cron se ve **verde**.

---

### [ALTO · REINCIDENTE] Los mensajes de WhatsApp del cierre y de los crons no pasan por el medidor
`src/lib/likida/costos.ts:86-87` · llamado SOLO desde `processor.ts:625` y `:2143`

Sin cambios: `grep -rn registrarCostoWhatsApp src/` sin tests devuelve **dos
sitios de llamada, los dos en `processor.ts`**. `avisar_cierre.ts:109,127`,
`escalar_viaje.ts` y `recordatorio_comprobacion.ts:180` siguen fuera. Una
liquidación cerrada con aviso al jefe manda **5** mensajes y registra **3**: el
componente WhatsApp sigue subvaluado en **40%**, y una corrida llena de
`escalar` son 400 mensajes = **$3.20/hora** que no aparecen en `llm_costo`. Con
el ALTO de `/ingesta` de arriba, ya son **cuatro** emisores de gasto fuera del
medidor.

---

### [ALTO · REINCIDENTE] N+1 sin tope: un `UPDATE` por línea de CFDI consolidado, dentro del webhook
`src/lib/likida/intake/consolidado.ts:258-270` · `:241-247` (`candidatosDb`)

Sin cambios. El `for (const r of resultados)` con `await ligarLineaAGasto`
dentro, sin tope de líneas y sin reloj. 300 líneas = 90,000 ms; **400 líneas =
120,000 ms = la invocación entera**. `candidatosDb` (`:241-247`) se sigue
leyendo **sin `traerTodo` y sin `.range()`** → PostgREST la recorta a 1,000
filas en silencio.

---

### [ALTO · REINCIDENTE] El Resumen sigue barriendo `gasto` completo 5 veces por carga
`dashboard/inicio-contenido.tsx:84-118` · `analytics.ts:268` (`detectarAnomalias`), `:439` (364 d), `:177` (3650 d), `:1036` (sin ventana) · `fiscal.ts:868` (`'todo'`)

Ver el reconteo de arriba: **215 viajes de red**, 5 barridos de `gasto` sin cota
efectiva y una lectura de 14,850 filas del ejercicio. La mudanza de archivo no
tocó una sola llamada; entró una más. A 240,900 gastos/año (el volumen que el
propio archivo llama de diseño, `analytics.ts:648`) los 5 barridos lanzan
`LecturaIncompleta` a las 100 páginas (`pg.ts:174`) tras quemar 500 viajes de
red, y la primera pantalla del comprador abre con la banda de "pantalla
incompleta".

**Lo que sí mejoró, y hay que decirlo:** el rail del Asistente se borró
(`chrome.tsx:108-111`) junto con `/api/dashboard/asistente`. Eran 30 viajes de
red y un **segundo** barrido completo de `gasto` por cada carga de navegador. El
total baja de 244 a 215.

---

### [MEDIO · REINCIDENTE] `getGastosFiscales` resuelve el contexto de viaje con un `.in()` sin paginar — y ahora también por el chat
`src/lib/likida/fiscal.ts:764-777` · 4× desde `inicio-contenido.tsx:110,113` vía `:865-869` · **+1 por cada `motor_fiscal` del chat** (`chat-tools.ts:91`)

Sin cambios en el código y con un consumidor nuevo. Tras el barrido paginado se
hace **una** consulta `.in('id', viajeIds)` sin `.range()` y sin `traerTodo`
(`:767-771`). Con 960 viajes son ~37 KB de URL contra el límite documentado de
16 KB de Cloudflare (se pasa a partir de ~410 viajes) → `exigir()` lanza →
`safe()` devuelve `null` → **la tarjeta "Tu motor fiscal" desaparece entera**.
Si la URL pasa, PostgREST recorta a 1,000 filas en silencio y la pantalla enseña
comprobantes sin folio sin decir que le faltó leer. La variante `'todo'`
(`:868`) manda siempre la URL del tamaño máximo.

---

### [MEDIO · REINCIDENTE] La tabla que gobierna el presupuesto del cierre apunta a once líneas que no son las suyas
`src/lib/likida/presupuesto.ts:38-57` (columna `donde`)

Reverificado línea por línea contra el `processor.ts` de hoy: las **once**
referencias siguen apuntando a otra cosa (`:591` → `}`, `:595` → `return;`,
`:658` → un comentario del aviso de privacidad, `:715` → `// ¿ESTA FOTO LLEGÓ
SOLA?`, `:734` → el `if` del dedup, `:755`/`:757`/`:758` → el `say()` de foto
duplicada y su `catch`, `:774` y `:814` → comentarios, `:2161` → `try {`). El
único artefacto que documenta el costo del cierre no se puede auditar leyendo el
código al que apunta — es la razón concreta de que el CRÍTICO lleve cinco
rondas.

---

### [MEDIO · REINCIDENTE] La foto va al modelo de visión a resolución nativa — ahora por DOS caminos
`src/lib/likida/intake/ocr.ts:253-260` · `src/lib/llm/openrouter.ts:388` · `src/lib/likida/intake/cfdi.ts:249` · **nuevo consumidor:** `src/app/api/dashboard/ingesta/route.ts:50`

Sin cambios: `generateStructured({ images: [principal] })` y `image_url: { url }`
sin `detail` ni preproceso (verificado: una sola línea con `image_url` en todo
`openrouter.ts`). 4000×3000 px = 24 teselas ≈ **6,200 tokens de entrada**; a
1,024 px de ancho serían 2 teselas ≈ 520 → **~12× menos entrada por
comprobante**. Lo que lo hace descuido y no decisión sigue en pie:
`decodeCodigosFromImage` (`cfdi.ts:249`) YA hace `sharp(...).resize({ width: 1600 })`
sobre la misma imagen, para el lector de códigos, que es gratis. Lo nuevo es que
ese desperdicio ahora lo puede disparar un usuario del panel a voluntad, con el
tope de 9 MB de `ingesta/route.ts:26`.

---

### [MEDIO · REINCIDENTE] QStash: el worker declara 600 s y corta a los 150 s del presupuesto del cron
`src/app/api/cron/facturar/cola/route.ts:11` · `src/app/api/cron/facturar/route.ts:25,129,158`

Sin cambios. `cola/route.ts:11` declara `maxDuration = 600` pero llama a
`procesarLoteEnCola`, que usa `PRESUPUESTO_LOTE_MS = maxDuration * 1000`
(`facturar/route.ts:129`) con el `maxDuration = 300` de `:25`. El corte sigue en
`300,000 − 150,000 = 150,000 ms`. Con el peor caso medido de una sesión de
portal (~147 s): **2 flotas de las 8 del lote, usando 294 s de los 600
declarados**, y el cron se ve verde.

---

### [MEDIO · REINCIDENTE] `cola/route.ts` declara 600 s contra el techo de 300 s que este mismo repo verificó
`src/app/api/cron/facturar/cola/route.ts:11` vs `src/app/api/webhook/whatsapp/route.ts:69-71`

Sin cambios. El webhook documenta *"VERIFICADO … plan pro, donde el tope es
300 s"*; el callback declara 600. `vercel.json` leído hoy: `$schema`,
`ignoreCommand` y `crons`, **sin bloque `functions`**. Hoy no muerde porque el
corte real es a los 150 s; muerde el día que alguien arregle
`PRESUPUESTO_LOTE_MS`.

---

### [MEDIO · NUEVO] Los tres endpoints nuevos son los únicos del repo que no pasan por el rate limiter que el repo ya tiene
`src/lib/ratelimit.ts` · usado por `webhook/whatsapp/route.ts`, `export/liquidaciones/route.ts`, `export/pdf/[id]/route.ts`, `demo/route.ts` · **no** por `dashboard/chat`, `dashboard/archivo`, `dashboard/ingesta`

Es la causa compartida de tres hallazgos de arriba y por eso va aparte: la
ventana de carrera del tope diario (CRÍTICO, escenario A), el gasto sin cota de
`/ingesta`, y el OOM por subidas concurrentes de `/archivo` **dejan de ser
alcanzables a voluntad** en cuanto el limitador que ya existe se cablee. Los
tres endpoints se copiaron la autorización de `/api/dashboard/asistente`
(lo dicen sus encabezados) y esa ruta tampoco lo tenía — se heredó el hueco
junto con la puerta.

---

### [BAJO · REINCIDENTE] 25 de los 29 `traerTodo` de la landing no piden `conteo()` y pagan una página vacía cada uno
`src/lib/likida/pg.ts:68` (`conteo`), `:160-163` · los 4 que sí: `fiscal.ts:753`

Recontado hoy: `analytics.ts` tiene **28 `traerTodo` y solo 2 con `conteo()`**
(`:1422` y `:1477`, los del consolidado — ninguno en el camino de la landing).
En la carga del Resumen se ejecutan 29 `traerTodo`, **25 sin `conteo()`**: 25
viajes de red de los 215 (**12%**) por no pasar un argumento que el helper ya
expone. Sigue siendo el único hallazgo cuyo tamaño no crece con el cliente y el
más barato.

---

### [BAJO · REINCIDENTE] El índice de la mig. `0087` lidera con `tenant_id`, que su único consumidor nunca filtra
`supabase/migrations/0087_recordatorio_comprobacion.sql:19-21` · `src/lib/likida/recordatorio_comprobacion.ts:54-62`

Sin cambios. `idx_viaje_recordatorio_pendiente (tenant_id, estatus, fecha_inicio)`
contra una consulta que filtra por `estatus`, `fecha_inicio` y
`recordatorio_comprobacion_en IS NULL` y **no filtra por `tenant_id`** (es un
cron global). Con la columna líder sin restringir Postgres no puede hacer *seek*
por `fecha_inicio`. La mig. `0058`, misma familia, lo hizo bien.

---

### [BAJO · NUEVO] La consulta del tope diario lee filas y suma en JS, sin `.limit()` ni paginar
`src/app/api/dashboard/chat/route.ts:80-90`

`select('costo_usd')` sobre `llm_costo` filtrado por tenant, fase y día, **sin
`.order()`, sin `.range()` y sin `traerTodo`**: PostgREST recorta a 1,000 filas
en silencio y `:90` suma lo que llegó. Hoy no muerde —el tope salta muy por
debajo de 1,000 filas/día— y por eso es BAJO; muerde el día que
`LIKIDA_CHAT_TOPE_DIA_USD` suba, o cuando la carrera del CRÍTICO deje 1,000+
filas en un día. Un `sum()` en SQL hace el mismo trabajo en una fila; la
agregación en SQL ya es el patrón del repo (`lib/admin/negocio.ts:36-41`).

---

## Lo que revisé y está bien

- **El rail murió de verdad, y con él su barrido duplicado.** `chrome.tsx:108-111`
  lo documenta y `src/app/api/dashboard/` ya solo tiene `archivo`, `chat` e
  `ingesta`. Son 30 viajes de red y un barrido completo de `gasto` menos por
  cada carga de navegador. Es la única mejora medible de mi rubro en cuatro
  pases.
- **La estimación de $0.005 por análisis es correcta para el turno mediano.**
  La calculé con los tamaños reales (system 5,831 chars, tools 4,771,
  historial corto, 3 rondas, resultados de tools de ~2,600 chars): **$0.0045**.
  El comentario de `chat/route.ts:32-34` no está inflado; lo que falta es el
  peor caso.
- **`esDerivada` NO es un problema de CPU.** Sospeché del `n²` y lo medí: con el
  respaldo en su tope de 600, **40 cifras no respaldadas cuestan 40 ms**, y
  `cifrasRespaldadas` corta en la primera que falla (`analista.ts:184`). El
  problema del tope de 600 es semántico, no de tiempo — por eso el hallazgo está
  escrito así y no como "guardia lenta".
- **El loop-guard corta ANTES de pagar la ronda.** `openrouter.ts:774-776` lanza
  en `round === maxRounds - 1` **antes** del `Promise.all` que dispara las
  tools, en vez de ejecutar herramientas cuyo resultado nadie va a leer. Es la
  decisión correcta y está justificada por escrito (`:764-773`).
- **La deduplicación de tools cruza rondas y ahorra de verdad.** `crossRound`
  (`openrouter.ts:689,794-802,818`) sirve el resultado cacheado a una tool de
  lectura repetida, y guarda los args **originales** junto al resultado. Solo
  cachea el éxito (`:818`). Sin esto, el modelo repitiendo `serie_gasto` en dos
  rondas pagaría 38 viajes de red otra vez.
- **El costo se acumula POR RONDA y al precio del modelo que respondió esa
  ronda** (`openrouter.ts:734-736`), y `analista.ts:371-375` fusiona bien el
  `costoPorModelo` del reintento en el del primer intento — sin doble conteo y
  sin perder la atribución. Cuando el turno **sí** termina, la contabilidad por
  modelo es correcta.
- **`costoReal` prefiere el costo del proveedor sobre la tabla**
  (`openrouter.ts:182-193`) y un modelo sin precio se estima con la tarifa más
  cara y avisa (`:201-208`), en vez de reportar $0. Es la dirección correcta del
  error.
- **Los resultados de las tools vienen recortados a propósito**: 25 viajes, 20
  liquidaciones, 10 anomalías, 6 causas, 60 puntos de serie
  (`chat-tools.ts:114,135,169,97,252`). El costo en tokens de lo que el modelo
  lee sí está pensado; lo que no está acotado es el trabajo de base que produce
  ese recorte.
- **El PDF sí acota antes de extraer**: `archivo.ts:59`, `getText({ last: 25 })`
  limita las páginas dentro del parser, y un PDF sin capa de texto lo dice en
  vez de entregar un extracto vacío (`:62-69`). Es el contraejemplo bueno del
  hallazgo de Excel, en el mismo archivo.
- **`traerTodo` sigue fallando cerrado** (`pg.ts:158-174`): avanza por filas
  leídas, no por número de página, y lanza `LecturaIncompleta` en vez de
  devolver una cifra corta. `acotada()` (`presupuesto.ts:155-176`) sigue
  imponiendo `abortSignal` **y** carrera contra temporizador. El problema no es
  el mecanismo; es dónde no se usa.
- **`operacion.ts` sigue siendo el contraejemplo bueno del panel**: la landing
  del encargado (`inicio-operacion.tsx`) pide `conteo()` en todos sus
  `traerTodo` — ~13 viajes de red contra 215.
- **La caché de prompt de Anthropic sigue bien puesta** (`openrouter.ts:671-675`):
  el breakpoint va en el system, que es el bloque invariante. Lo que falta es
  que el rol `chat` no la aprovecha porque corre en Google — está anotado como
  MEDIO dentro del ALTO del documento adjunto, no como defecto del mecanismo.
- **Compuerta corrida hoy sobre este árbol:** `npx tsc --noEmit -p .` → **0
  errores**. `npx vitest run src/lib/agents src/app/api/dashboard` → **26
  verdes**, 0 rojos (los 15 rojos fichados del pase 6 son de frontend y no
  tocan estos archivos).

---

## Lo que NO alcancé a revisar

- **El límite real de cuerpo de una petición en Vercel.** Mis mediciones de
  `/api/dashboard/archivo` usan el tope que declara el propio endpoint
  (`MAX_BASE64` ≈ 12 MB). Vercel documenta 4.5 MB de cuerpo en funciones
  serverless; si ese límite muerde primero, el peor caso medido baja a ~3.4 MB
  (≈38k filas, ~2 s, ~70 MB) — sigue siendo trabajo no acotado, con la mitad de
  la pendiente. El comentario de `ingesta/route.ts:24-25` afirma que "Vercel ya
  corta el cuerpo mucho más arriba", y no pude verificarlo contra la plataforma.
- **La latencia real Vercel ↔ Supabase.** Todas mis sumas de viajes de red usan
  los 0.3 s/consulta que el repo escribe (`presupuesto.ts:35`) y los techos que
  impone. `presupuesto.ts:97-99` admite que nadie ha medido el p99 real. A 0.6 s
  por página, los 7.8 s de una ronda de tools pasan a 15.6 s y la fila del chat
  cambia de MEDIO a "no cabe".
- **La latencia real del chat.** El commit `74a51b9` promete "1.5 s el saludo,
  5.6 s el análisis completo". No lo pude medir (prohibido llamar a OpenRouter).
  Lo que sí verifiqué estructuralmente: **un saludo son 2 llamadas al modelo
  como mínimo**, no una — el modelo llama `entregar_respuesta` en una ronda y
  cierra con "listo" en la siguiente (`analista.ts:243`, `openrouter.ts:741-761`)
  — y las dos reenvían el catálogo de tools completo (1,300 tokens) aunque el
  prompt diga que un saludo no necesita tools (`prompts.ts:67`).
- **El conteo real de tokens.** Todas mis conversiones usan ~3.5 chars/token
  para español. No corrí un tokenizador de Gemini. Los caracteres sí están
  medidos exactos.
- **El plan de ejecución de las consultas en Postgres.** Conté viajes de red y
  filas transferidas; no corrí un `EXPLAIN` contra una base con datos, así que
  no sé cuáles de los 29 barridos usan índice y cuáles hacen seq scan.
- **`/dashboard/viajes/nuevo`, `/arco`, `/usuarios`, `/politicas`, `/soporte`,
  `/suscripcion`, `/configuracion`, `/[id]`** — solo conté la landing. La página
  de alta de viaje es nueva de este pase y no la sumé.
- **`/api/export/liquidaciones` y `/api/export/pdf/[id]`**: siguen sin declarar
  `maxDuration`; no sumé su peor caso.
- **El costo por liquidación medido de punta a punta.** `models.ts:17` promete
  $0.03–0.05 y hay mediciones **por comprobante**. Con cuatro emisores de gasto
  fuera del medidor (los tres de WhatsApp más `/ingesta`), ese número no se
  puede afirmar hoy.
- **Los topes internos de `pagina_playwright.ts` y `capufe.ts`.** Tomé el ~147 s
  del peor caso de una sesión como dado.
