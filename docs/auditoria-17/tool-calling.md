# Tool calling — auditoría 17 (pase 6)

**Nota: 5/10** (antes 7). Razón del movimiento: **deuda que cobró factura**. La
advertencia estaba escrita literal en el MAPA —*"lo que sí se vigila es que
ninguna tool **nueva** rompa esa regla"*— y venció: el 12-ago nació un juego de
**once tools** (`src/lib/agents/chat-tools.ts` + `entregar_respuesta`) que
ninguna ronda ha mirado, mientras la nota más alta del tablero se sostenía sobre
cuatro pases de rotación de un `src/lib/likida/tools.ts` **congelado**. La
superficie del rubro pasó de 3 tools a 14 y la mitad nueva no tiene una sola
prueba: `grep -rl "kpis_flota\|viajes_flota\|entregar_respuesta" src/` da cuatro
archivos y el único `*.test.ts` de ellos (`analista_guardia.test.ts`) prueba
`proyectarPuntos` —una función pura— y la guardia, **cero schemas y cero
handlers**.

**Riesgo mayor hoy:** el enum `modo` le promete al modelo ventanas de 7 y 30
días y le entrega 35 y 91. La guardia de cifras del chat **no puede atraparlo**
—verifica de dónde salió el dígito, nunca qué rótulo le pusieron—, así que el
contralor recibe un monto real de cinco semanas presentado como "los últimos 7
días", con la bendición de todas las defensas del sistema.

## Hallazgos

### [CRÍTICO] El enum `modo` describe una ventana que ninguna de las cuatro tools entrega — y ninguna guardia puede verlo

`src/lib/agents/chat-tools.ts:31` (consumido por `:149`, `:165`, `:179`, `:216`)
→ `src/lib/likida/analytics.ts:421`, `:1027-1036`

El schema declara, textual: `description: 'Ventana: últimos 7 días, últimos 30,
o todo el histórico.'`. Lo que corre debajo es `SEMANAS_POR_MODO = { semanal: 5,
mensual: 13, historico: 52 }` (`analytics.ts:421`), es decir **35 días, 91 días
y 364 días**. No es interpretación: la prueba que ya existe lo fija —
`analytics_periodo_series.test.ts:74-76` exige que `semanal` mande
`gte('fecha','2026-07-05')` / `lte('fecha','2026-08-08')` para un `hoy` de
2026-08-08. Treinta y cinco días.

Escenario (el más limpio de los cuatro, porque el payload **no trae una sola
fecha** que pueda desmentir al schema). Flota con gasto real de $312,400.00 en
la ruta Monterrey→CDMX entre el 5-jul y el 8-ago, de los cuales $61,900.00 caen
en los últimos 7 días:

1. El contralor escribe *"¿en qué ruta se me fue el gasto esta semana?"*. No
   matchea ninguna palabra del paracaídas local (`chat.tsx:73-141`), así que va
   al agente (`chat.tsx:353` manda **toda** pregunta al API).
2. El modelo llama `top_rutas` con `{modo:'semanal'}` — la descripción le dice
   que eso son los últimos 7 días.
3. `chat-tools.ts:183` devuelve
   `{modo:'semanal', moneda:'MXN', rutas:[{origen:'Monterrey', destino:'CDMX',
   total:312400, pct:41.2, region:'Centro'}]}`. **No hay `desde`, ni `hasta`, ni
   etiqueta de semana en ningún lado del resultado.**
4. El system prompt le ordena rematar con la ventana, con esas mismas palabras:
   *"SIEMPRE declara la ventana que usaste ('últimos 7 días'…)"*
   (`prompts.ts:50`). El modelo obedece: **"En los últimos 7 días, Monterrey→CDMX
   se llevó $312,400."**
5. La guardia de cifras (`analista.ts:168-187`) lo deja pasar sin dudar: 312400
   está en `respaldo` porque una tool lo devolvió. La guardia verifica
   **procedencia del número, jamás su rótulo** — es su límite de diseño, no un
   bug suyo.

El contralor cruza contra sus tickets de la semana: $61,900. El chat dice
$312,400. Mismo defecto en `serie_gasto` y `serie_liquidado` (ahí los
`categorias`/`dia` traen etiqueta `2026-S28`… y un modelo cuidadoso *podría*
notarlo; en `top_rutas` no hay a qué agarrarse), y en `proyectar_serie`, cuyo
`sumaObservada` (`chat-tools.ts:203`) es la suma de las 5/13/52 semanas sin una
sola etiqueta. `mensual` miente por 3× (91 días vendidos como 30) y `historico`
por omisión: son 52 semanas, no "todo el histórico" — salvo en `top_rutas`,
donde `getTopRutasPorGastoSeries` sí manda `historico` sin cota
(`analytics.ts:1036`), así que la misma palabra significa **dos cosas distintas
en dos tools del mismo archivo**.

Consecuencia: el contralor —el comprador— ve una cifra de dinero con un "cuándo"
falso en la pantalla que se está usando para vender, y es la clase de error que
él descubre solo, cruzando contra su propio corte. Rompe *un rótulo tiene que
ser verdad* en el único punto del producto donde el rótulo lo escribe un modelo.

Causa raíz probable: la descripción se copió de la semántica de
`getSeriesKpiCards` (`analytics.ts:170-178`), donde `semanal/mensual/historico`
sí son 7/30/3650 **días**; las series de gasto/liquidado/rutas usan la misma
palabra para **semanas ISO**, y quien escribió el schema tomó la primera.

---

### [ALTO] `total` no es el total: es el tamaño del recorte, y en el mismo turno otra tool devuelve el conteo real

`src/lib/agents/chat-tools.ts:114` y `:135` → `src/lib/likida/analytics.ts:802,
808` y `:1550, 1556`

`viajes_flota` devuelve `total: vs.length` sobre `getViajes(ctx.tenantId)`, que
corre `.limit(limite)` con `limite = 100` (`analytics.ts:802,808`).
`liquidaciones_flota` devuelve `total: ls.length` sobre `getLiquidaciones`, que
corre `.limit(50)` (`analytics.ts:1556`). Ninguna de las dos usa `traerTodo`, y
la palabra que el modelo lee es `total`.

Escenario. Flota con 340 viajes y 212 liquidaciones cerradas. El contralor
pregunta *"¿cuántos viajes llevo este año y cuántos ya cerraron?"*:

- `viajes_flota` → `{total: 100, mostrando: 25, …}`
- `liquidaciones_flota` → `{total: 50, mostrando: 20, …}`
- `kpis_flota` → `{viajesLiquidados: 212, …}` (ese sí es real: `getKpis` usa
  `traerTodo`, `analytics.ts:184`)

La guardia deja pasar los tres números: los tres los devolvió una tool. El
modelo entrega "llevas 100 viajes, 50 liquidados" o —peor— narra 100 y 212 en la
misma respuesta y las contradice a sí mismas. `duplicados_detectados`, cinco
líneas abajo en el mismo archivo (`:252`), **sí** reporta el total verdadero
(`as.length` sobre un `traerTodo` sin cota): la inconsistencia es interna al
juego de tools, no una limitación.

Consecuencia: el contralor recibe un conteo de objetos de dinero que es
exactamente el tope de una consulta, presentado como el tamaño de su operación.
Es un número que él conoce de memoria; verlo mal en el chat quema la confianza
en todo lo demás que el chat diga.

Causa raíz probable: `total` se escribió pensando en "total de lo que traje"
mientras el nombre le promete al modelo "total de lo que hay"; el modelo solo ve
el nombre.

---

### [ALTO] Cuando el ciclo muere, se tira la respuesta YA capturada y el gasto YA hecho no se registra — justo en los turnos más caros

`src/lib/agents/analista.ts:311-312` y `:411-414` → `src/app/api/dashboard/chat/route.ts:98-112`
(contra `src/lib/likida/processor.ts:1900-1917`, que sí lo resuelve)

`generateWithTools` lanza `PartialExecutionError` por tres puertas: loop-guard
(`openrouter.ts:775`, dispara en `round === maxRounds - 1`, o sea la 5ª con
`maxToolRounds: 5`), truncamiento (`:749`) y aborto del `AbortController` de 40 s
(`analista.ts:309-310`). `ejecutarAnalista` envuelve todo en `try … finally` —
**sin `catch`** (`:311`, `:411`)—, así que la excepción sube entera al
`catch` de `route.ts:109`, que responde 502.

Escenario. Turno de diagnóstico ("¿por qué subió mi gasto?"):

- Ronda 0: `serie_gasto` + `top_rutas` (in 6,800 / out 240).
- Ronda 1: `viajes_flota` + `duplicados_detectados` (in 9,400 / out 210).
- Ronda 2: `entregar_respuesta` con cuatro bloques **válidos y respaldados** →
  `CAPTURAS.set(runId, bloques)` (`analista.ts:239`).
- Ronda 3: el modelo vuelve a pedir una tool en vez de cerrar — es el
  comportamiento medido que motivó la `instruccion` de `:243` (*"medido con
  gpt-5-nano el 12-ago"*) (in 11,200 / out 180).
- Ronda 4: pide otra → `round === maxRounds - 1` → `LoopGuardError` →
  `PartialExecutionError`.

Sale: (a) el `finally` corre `CAPTURAS.delete(runId)` (`:413`) y **la respuesta
correcta, ya armada y ya pagada, se borra sin leerse**; (b) la última red
determinística de `:382-399` —la que existe justo para esto, "datos reales sin
narración le sirven más al contralor que una disculpa"— vive **dentro** del
`try` y nunca se alcanza; (c) el contralor espera ~40 s viendo "Esto está
tardando más de lo normal…" (`chat.tsx:48`) y recibe el paracaídas de keywords,
que para esa pregunta contesta *"Todavía no sé responder eso"* (`chat.tsx:141`);
(d) los ~27,400 tokens de entrada y 630 de salida **no se escriben en
`llm_costo`**, porque `registrarCosto` solo corre en el camino feliz
(`route.ts:102-107`).

Consecuencia (d) es la que muerde dos veces: el tope diario del endpoint se
calcula leyendo `llm_costo` (`route.ts:80-96`) y el encabezado del archivo
promete *"POR DÍA Y POR TENANT: tope en USD"* (`route.ts:8-14`). Los turnos que
más gastan —los que corrieron las 5 rondas antes de caerse— son **exactamente
los que el tope no ve**: un cliente que repita la misma pregunta pesada consume
sin tope y sin dejar rastro en `/admin` → "Costo por modelo". El camino de
WhatsApp ya resolvió esto y dejó escrito por qué: *"LO QUE SE GASTÓ ANTES DE
CAERSE TAMBIÉN SE PAGÓ… el costo unitario se subestima justo en el caso que más
consume"* (`processor.ts:1904-1917`). El juego de tools nuevo no heredó ni esa
línea ni la recuperación de `partialToolCalls`.

Causa raíz probable: el endpoint del chat se calcó de `/api/dashboard/asistente`
(lo dice `route.ts:3`) y no del orquestador que sí conoce las tres puertas de
muerte del ciclo de tools.

---

### [MEDIO] `proyectar_serie` entrega un "corte" sin unidad y un horizonte que no se mueve con `modo`

`src/lib/agents/chat-tools.ts:192-239` (`:206` el supuesto, `:220` el enum)

`proyectarPuntos` habla de `cortesConDatos`, `promedioPorCorte`,
`proyeccionSiguienteCorte` y `proyeccionSiguientes4`, y su `supuesto` dice
*"promedio simple de los últimos N cortes con datos"*. **En ningún campo dice
qué es un corte**, y siempre es una semana ISO: los tres modos entran por
`getGastoPorSemanaSeries`/`getLiquidadoPorSemanaSeries` (`:230`, `:233`), que
bucketean por semana pase lo que pase. `proyeccionSiguientes4` son siempre 4
semanas, aunque `modo` sea `mensual` o `historico`.

Escenario. El contralor pregunta *"¿cuánto voy a gastar el mes que viene?"*. El
modelo elige la ventana ancha, que es lo razonable para proyectar: llama
`proyectar_serie {serie:'gasto', modo:'mensual'}`. Con 13 semanas de las cuales
9 traen gasto y un promedio semanal de $118,400.00, sale:

```
{serie:'gasto', modo:'mensual', moneda:'MXN', cortesConDatos:9,
 promedioPorCorte:118400, proyeccionSiguienteCorte:118400,
 proyeccionSiguientes4:473600, supuesto:'promedio simple de los últimos 4 cortes…'}
```

El modelo, que pidió `mensual` y no tiene nada que le diga otra cosa, narra
**"para el mes que viene proyecto $118,400"** (es una semana) o **"$473,600 en
los próximos 4 meses"** (son 4 semanas). La guardia lo aprueba: ambos números
son de la tool. El prompt obliga a narrar el supuesto (`prompts.ts:42`), y el
supuesto tampoco dice "semana", así que copiarlo literal no corrige nada.

Consecuencia: la única cifra del producto declarada como estimación sale con el
horizonte equivocado por 4×, y con el supuesto a la vista —que es justo lo que
la debía hacer defendible.

Causa raíz probable: `proyectarPuntos` es genérica sobre `number[]` y se probó
como función pura (`analista_guardia.test.ts`); la unidad del eje se perdió en
el llamador, que es el único que la conoce.

---

### [MEDIO] El schema de `entregar_respuesta` tipa el valor de tabla como `string`, y ahí muere el formato de cifras

`src/lib/agents/analista.ts:216-223` (`:220` el tipo) → `src/lib/agents/prompts.ts:55`
→ `src/app/dashboard/chat.tsx:63`

El schema declara `filas.items = {concepto: {type:'string'}, valor:
{type:'string'}}` y el prompt lo remacha: *"cada fila como {concepto, valor}…
los montos como número en texto plano (ej. "8340.50")"* (`prompts.ts:55`) —
dos líneas después de decir lo contrario (*"los montos en los bloques van como
números crudos (la interfaz los formatea)"*, `:58`). El render aplica
`typeof v === 'number' ? numero(v) : v` (`chat.tsx:63`): un string sale **crudo**
y un número sale por `numero()` (`formato.ts:96`), que es `toLocaleString`
**sin moneda**. Por las dos ramas, una tabla del agente no puede enseñar pesos.

Escenario. El contralor escribe *"desglósame el motor fiscal"*. El modelo llama
`motor_fiscal`, que devuelve `{montoPerdido: 41230.5, montoEnRiesgo: 88900,
montoRecuperable: 132455.75, …}`, y arma la tabla como se le pidió:
`[{concepto:'Perdido', valor:'41230.50'}, …]`. En pantalla sale
`Perdido | 41230.50`. Dos mensajes antes, la misma caja de chat contestó
"cuánto llevo comprobado" por el camino rápido y pintó `Monto comprobado |
$313,820.80` con `mxn()` (`chat.tsx:83`).

Consecuencia: dos formatos de peso en el mismo hilo del mismo widget, y el que
produce el agente es el que no se parece a nada del panel. Rompe *el formato de
cifras vive solo en `lib/formato.ts`* por la puerta que la prueba de ese archivo
no vigila: aquí nadie llamó a `toLocaleString`, simplemente nadie llamó a `mxn`.

Causa raíz probable: `valor: {type:'string'}` se puso para no pelearse con el
validador de schemas (la nota de `analista.ts:83-84` cuenta que las tuplas se
cambiaron por objetos porque *"Gemini rechaza tuplas sin `items`"*), y el tipo
laxo se llevó por delante el único punto donde se decidía la moneda.

---

### [MEDIO] Ninguna tool del chat entra a la caché de lectura, y cada tool de `modo` calcula tres ventanas para tirar dos

`src/lib/llm/openrouter.ts:558-559` y `:794` → `src/lib/likida/analytics.ts:432-441`,
`:1030-1037`

`isReadOnly` se decide por prefijo: `['get_','check_','list_','find_',
'consultar_','validar_','cuadrar_']`. **Ninguno de los once nombres nuevos
empieza por uno de ellos** (`kpis_flota`, `serie_gasto`, `top_rutas`…), así que
`crossRound` (`openrouter.ts:794`, `:818`) nunca guarda ni acierta para el chat:
todas son, a ojos del ciclo, tools de escritura sin dedup entre rondas. Encima,
las cuatro tools de `modo` piden el wrapper `*Series`, que calcula **los tres
modos en paralelo** y descarta dos (`analytics.ts:434-440`).

Escenario, un solo turno de "¿por qué subió mi gasto?" con
`maxToolRounds: 5` (`analista.ts:319`):

- Ronda 0: `serie_gasto{semanal}` → 3 barridos de `gasto` (5, 13 y 52 semanas) +
  `top_rutas{semanal}` → 3 barridos de `gasto` (uno **sin cota**, `:1036`) y
  **3 barridos completos de `viaje`** (`getTopRutasPorGasto` nunca acota `viaje`,
  `:987`).
- Ronda 1: el modelo repite `serie_gasto{semanal}` para citar un número que ya
  tenía → **otros 3 barridos**, porque no hay caché que lo pare.
- Si además cae el reintento correctivo (`analista.ts:351`), todo se repite
  contra un `crossRound` recién nacido en la segunda llamada a
  `generateWithTools`.

Son 15+ consultas paginadas de `gasto`/`viaje` del tenant, cada una tras
`acotada()` de 8 s, dentro de un `AbortController` de 40 s y un `maxDuration`
de 60 (`route.ts:28`). La `llaveDeCache` sí está bien construida para el juego
nuevo (`openrouter.ts:581-592`: llavea por nombre las de `SIN_PARAMS` y por
`nombre:args` las de `modo`) — lo que nunca la consulta es el `isReadOnly` de
arriba.

Consecuencia: el turno más caro del chat es el que más probabilidad tiene de
chocar con el timeout de 40 s, y ese choque cae en el hallazgo ALTO de arriba
(respuesta tirada, costo no registrado). La rejilla existe, está probada
(`openrouter_loopguard.test.ts`) y el juego nuevo pasa de largo por un `if` de
prefijos.

Causa raíz probable: `READ_PREFIXES` es una convención de nombres, no una
propiedad declarada en `RegisteredTool`; las tools nuevas se nombraron en
español-sustantivo (`kpis_flota`) y la convención no las alcanza.

---

### [MEDIO] El ejecutor del chat no tiene lista blanca por corrida: resuelve el nombre que invente el modelo contra el registro GLOBAL

`src/lib/llm/openrouter.ts:811` → `src/lib/llm/tool-executor.ts:98-104`

`generateWithTools` ofrece `opts.tools` (11 schemas, `analista.ts:316`) pero
ejecuta con `opts.toolExecutor(call.function.name, args)` **sin comprobar que
ese nombre estuviera entre los ofrecidos**; `executeTool` lo busca en el
`REGISTRY` global de módulo (`tool-executor.ts:49, 98`). Que el autor esperaba
nombres inventados está a la vista: existe la rama `tool desconocida: ${name}`
(`:100`) — cubre lo que no está en el registro, no lo que está registrado pero
**no se ofreció en esta corrida**.

Escenario. El modelo emite
`{name:'consultar_politica', arguments:'{}'}` (nombre que nunca vio; es la
alucinación típica cuando el system prompt habla de "la política de gastos de la
flota", `prompts.ts:22`). Si el proceso también cargó `processor.ts` —que hace
`import '@/lib/likida/tools'` por efecto secundario (`processor.ts:9`)—, la tool
está registrada: el servidor **la ejecuta**, corre `getConfig(ctx.tenantId)` y
devuelve al modelo del chat la política completa más `fundamentos[]` con
`norma_id` y citas (`tools.ts:64-74`), en un turno que nunca pidió eso.
`guardar_liquidacion` entra por la misma puerta y **hoy solo lo detiene un
accidente**: `ctx` del chat es `{tenantId, conversationId}` (`analista.ts:277`),
así que `if (!ctx.viajeId) throw new Error('sin viaje activo')` (`tools.ts:162`)
corta antes de escribir. La contención es el `viajeId` faltante y el
empaquetado por ruta —no una regla.

No pude medir si Vercel deja `chat/route.ts` y el webhook de WhatsApp en el
mismo proceso; **en `next start` y en dev sí comparten `REGISTRY`**, que es un
`Map` de módulo. Por eso va MEDIO y no ALTO: hoy no escribe una fila.

Consecuencia: el día que el chat gane contexto de viaje —"pregúntame de este
viaje" es la evolución obvia de `/dashboard/[id]`— la mutación irreversible del
WhatsApp queda alcanzable desde el panel por un nombre alucinado, sin que nadie
haya tocado una línea de seguridad. Es deuda con fecha de cobro.

Causa raíz probable: `makeExecutor(ctx)` se diseñó cuando había un solo agente
con un solo juego de tools; con dos agentes en el mismo registro, "qué puede
llamar este run" dejó de estar representado en ningún lado salvo el array que se
manda al proveedor.

---

### [MEDIO] `CAPTURAS` no se limpia entre el intento y el reintento: unos bloques ya rechazados se vuelven a juzgar contra un respaldo que creció

`src/lib/agents/analista.ts:239`, `:340`, `:367-370`, `:382`

El reintento correctivo no borra la captura del primer intento. Si el segundo
intento **no** vuelve a llamar `entregar_respuesta` (o la llama con bloques que
`validarBloques` tira, `:237-238`), `CAPTURAS.get(runId)` de `:369` devuelve los
bloques **del primero** y el `??` con `res2.finalText` nunca se alcanza. Y
`:367` ya metió al `respaldo` los números de las tools del segundo intento.

Escenario, con valores. `serie_gasto{semanal}` devuelve para diésel
`[98450.20, 102300.00, 87900.50, 110120.30, 13500.00]`:

1. Intento 1: el modelo entrega *"llevas 412,271.00 de diésel"* (la suma de los
   cinco). `esDerivada` (`:149-164`) prueba **pares**, y el par más grande
   posible es `110120.30 + 102300.00 = 212420.30` → no alcanza → la guardia
   **bloquea**, correctamente. `CAPTURAS` queda con esos bloques.
2. Reintento: el modelo llama `kpis_flota` (`montoComprobado: 313820.80`) y
   contesta en texto plano, sin la tool terminal.
3. `:369` recupera **los bloques del intento 1** —la respuesta nueva se tira—, y
   `:382` los reevalúa contra el respaldo ya crecido:
   `313820.80 + 98450.20 = 412271.00`, diferencia 0 < 0.011 → `esDerivada` → **true**.
4. Sale a pantalla la misma cifra que la guardia había rechazado hace dos
   segundos, y el `logger.warn('chat.guardia_bloqueo')` de `:383` no se emite:
   en el log el turno se ve limpio.

Consecuencia: el veredicto de la guardia sobre **bloques idénticos** depende de
qué tools corrió un intento posterior. Un rechazo se convierte en aprobación sin
que el modelo haya vuelto a entregar nada, y sin dejar rastro que permita
reconstruirlo.

Causa raíz probable: `CAPTURAS` se pensó como buzón de una sola corrida (`runId`)
y el reintento agregó una segunda corrida lógica dentro del mismo `runId`.

---

### [BAJO] La regla escrita en `makeExecutor` ya es falsa, y es la que sostiene la llave de dedup de mutaciones

`src/lib/llm/tool-executor.ts:150-158`

El comentario dice, y de ahí deriva la decisión: *"LA LLAVE ES EL NOMBRE, no los
args. **Ninguna tool de Likida tiene parámetros a propósito** … Si algún día una
tool sí decide sobre datos, esta llave tiene que volver a incluirlos"*. Ese día
ya pasó: cuatro tools declaran `modo` (`chat-tools.ts:28-35`), una declara
`serie` (`:219`) y `entregar_respuesta` declara `bloques`
(`analista.ts:205-231`). La misma afirmación aparece repetida en
`openrouter.ts:563-566` y en `chat-tools.ts:5-6`.

No hay bug hoy —ninguna tool con parámetros es `isMutation`, y el chat no muta—,
pero la premisa que hace correcta la llave `key = name` (`:158`) dejó de ser
cierta, y el próximo que agregue una mutación va a leer tres comentarios
concordantes que le dicen que no se preocupe por los args.

Consecuencia: el equipo que mantenga esto. Es exactamente el patrón que el rubro
de arquitectura llama "una advertencia que vuelve a ocurrir".

## Lo que revisé y está bien

- **El tenant lo pone el servidor en las once tools nuevas, sin excepción.**
  `ctx` se arma en `analista.ts:277` con `opts.tenantId`, que sale de
  `getSessionTenant()` (`route.ts:42,48`); los once handlers usan `ctx.tenantId`
  y ninguno lee un id de `args`. Verifiqué las ocho funciones de analytics que
  cuelgan de ahí: `getKpis` (`:186`), `detectarAnomalias` (`:271`), `getViajes`
  (`:806`), `getLiquidaciones` (`:1554`), `getAcreditables` (`:542`),
  `getGastoPorSemana` (`:390`), `getLiquidadoPorSemana` (`:472`),
  `getTopRutasPorGasto` (`:982,988`) — **todas** llevan `.eq('tenant_id',
  tenantId)`. El `?tenant=` de `route.ts:56-60` lo honra solo `superadmin` y
  solo si la fila existe. **No hay camino por el que el modelo elija flota.**
- **Ninguna tool nueva muta.** `grep isMutation src/` → un solo `true`, en
  `tools.ts:152`. Las once de `chat-tools.ts` son lecturas; `entregar_respuesta`
  escribe en un `Map` de proceso, no en la base.
- **Los enums no se confían: se saturan en servidor.** `modoDe` (`:38-41`) cae a
  `'semanal'` ante cualquier cosa que no sea `mensual|historico`, y el resultado
  **declara** qué modo se usó (`:154`, `:169`, `:184`), así que un `modo:'diario'`
  alucinado no produce una lectura silenciosamente distinta de la que se reporta.
  Args ausentes: `required` está puesto y el default es determinístico. No hay
  `undefined` que llegue a una consulta.
- **`hoyIso()` no diverge del panel.** Sospeché de `chat-tools.ts:42-44`
  (`toISOString`, UTC) contra el `TZ_MX` que usa el resto de `analytics.ts` — y
  es falso: `inicio-contenido.tsx:75` calcula `hoy` con **exactamente la misma
  línea**, así que chat y Resumen comparten el mismo "hoy" a toda hora. Sin
  hallazgo.
- **El error de la tool no viaja como dato hacia el usuario.** `executeTool`
  filtra el vocabulario de Postgres (`tool-executor.ts:82-89`), el ciclo lo
  entrega como `{error: …}` distinguible (`openrouter.ts:820`), y la última red
  de `analista.ts:384-385` filtra con `t.result && !t.error` antes de armar la
  tabla de rescate: **una tool caída nunca se convierte en un renglón de datos**.
  La regla de *fallar cerrado* también está en el tope diario (`route.ts:85-89`).
- **Prompt injection por el documento adjunto: cerrado por construcción.** El
  extracto se re-recorta en servidor (`route.ts:74-77`), viaja marcado como dato
  (`analista.ts:297`), el prompt lo reitera (`prompts.ts:60`) y —lo que de verdad
  lo cierra— **ninguna tool acepta texto libre**: no hay superficie donde una
  instrucción incrustada se convierta en consulta.
- **La guardia de cifras hace lo que promete, dentro de su alcance.**
  `extraerNumeros` normaliza el formato es-MX antes de comparar
  (`analista.ts:128`), `esDerivada` se topa a 600 elementos (`:151`), y
  `validarBloques` recorta y descarta con log en vez de tumbar la entrega entera
  (`:50-112`). Probado en `analista_guardia.test.ts`. Su límite —verifica
  procedencia, no rótulo— es lo que deja pasar el CRÍTICO de arriba, y eso es un
  hueco del schema, no de la guardia.
- **`llaveDeCache` sí soporta el juego nuevo** (`openrouter.ts:581-592`): reduce
  a `name` solo cuando `properties` está vacío, y las cuatro tools con `modo`
  llavean con sus args. La rejilla `inRound` (`:810-811`) dedupea de verdad
  dentro de una ronda.
- **El loop-guard corta antes de gastar la ronda** (`openrouter.ts:774-776`) y
  el costo se acumula por ronda al precio del modelo que respondió (`:734-736`),
  con `costoPorModelo` consumido correctamente por el chat: `route.ts:102-107`
  escribe **una fila de `llm_costo` por modelo real**, que es el arreglo que el
  pase 5 pidió y que este endpoint sí trae de nacimiento. (Su hueco es el camino
  de excepción, hallazgo ALTO.)
- **El juego viejo no se movió.** `git diff --stat` de `src/lib/likida/tools.ts`,
  `src/lib/llm/` y `src/lib/agents/{run,registry}.ts` contra el pase 5: sin
  cambios. Los cinco MEDIO del pase 5 (atribución en `generateStructured`,
  `modelo:'parcial'`, `finish_reason` con tool calls, el techo que se pierde en
  la escalera, el 15% de `cuadrar_viaje`) **siguen abiertos tal cual**, verificados
  línea por línea: `openrouter.ts:459/469`, `:524-545`, `:736-751`, `:481-502`,
  `tools.ts:109`. Son REINCIDENTES y no los repito aquí para no inflar el conteo;
  cuentan en la nota.
- Compuerta del rubro: `npx vitest run src/lib/llm src/lib/agents
  src/app/api/dashboard/chat src/lib/likida/tools_` → **22 archivos, 112 pruebas
  verdes**, 0 rojas. Ninguno de los 15 rojos fichados del pase 6 es de este rubro.

## Lo que NO alcancé a revisar

- **Si Vercel deja `/api/dashboard/chat` y `/api/webhook/whatsapp` en el mismo
  proceso.** De eso depende que el hallazgo de la lista blanca sea alcanzable en
  producción hoy o solo en `next start`/dev. No lo puedo medir sin desplegar, y
  por eso lo bajé a MEDIO en vez de asumir el caso peor.
- **Qué emite de verdad `google/gemini-3.5-flash-lite` ante el schema de
  `entregar_respuesta`.** Mis escenarios de tabla (`valor` string) y de nombre
  alucinado son coherentes con el schema y con las notas del propio código
  (`analista.ts:83-84`, `:241-243`, ambas fechadas "medido el 12-ago"), pero
  correr el conjunto dorado es `pruebas-manuales/chat-analista.prueba.ts`, que
  llama OpenRouter de pago y está prohibido en esta ronda.
- **El `cache_control` sobreviviendo al fallback** (`openrouter.ts:671`,
  `soportaCache` calculado con `model` y no con `activeModel`) — sigue como lo
  dejé en el pase 5: depende de qué hace el gateway con la extensión en un
  proveedor que no la soporta, y no lo medí. Nota nueva: el rol `chat` no es
  Anthropic, así que el chat no lo toca; el riesgo sigue siendo del cuadre.
- **El comportamiento de `res.model` con sufijo de proveedor** y si
  `llm_costo` acaba con dos renglones para el mismo modelo. Pendiente desde el
  pase 5, sin cambio de código que lo altere.
- No corrí `pruebas-manuales/*.prueba.ts` ni `npm run build`, por instrucción.
