# Tool calling — auditoría 3 (pase 3)

**Nota: 7/10** (antes 7). Razón del movimiento: mirada más profunda · el alto
reincidente murió, dos nuevos nacieron al lado. La regla estructural
(`properties: {}` / enums cerrados, tenant y viaje resueltos en servidor)
**aguantó las once tools nuevas de esta semana**: las catorce están barridas
abajo, una por una, y ninguna deja que el modelo elija de qué flota ni sobre
qué fila. Lo que no creció con la superficie fueron las pruebas del
orquestador: `ejecutarAnalista` **no se ejecuta en una sola prueba** — solo se
mockea (`src/app/api/dashboard/chat/costo_parcial.test.ts:24`) — y ahí están
los dos altos.

**El riesgo mayor del rubro hoy:** el chat del panel pierde dinero de vista y
tira respuestas ya pagadas por el camino de excepción — el turno que revienta
(reintento correctivo o loop-guard) es exactamente el que más gasta, y es el
único que no se contabiliza entero ni llega a la red determinística.

## Hallazgos

### [ALTO] El reintento correctivo del analista tira el costo del PRIMER ciclo cuando truena
`src/lib/agents/analista.ts:353-382` (la llamada en `:356`) × `src/lib/llm/openrouter.ts:839-842`

Escenario: el contralor pregunta "¿cuánto voy a gastar el mes que entra?".
Ciclo 1 (`analista.ts:316`) corre 3 rondas — `kpis_flota`, `serie_gasto`,
`entregar_respuesta` — con ~9,000 tokens de entrada acumulados y ~800 de
salida: **$0.0041**. La guardia de cifras tumba un monto y entra el reintento
(`:356`). El reintento vuelve a llamar tools y revienta su `maxToolRounds: 4`
→ `generateWithTools` tira `LoopGuardError`, que `openrouter.ts:841` envuelve
en `PartialExecutionError` **con los tokens de ESA invocación y nada más**
(`tokIn`, `tokOut`, `costo` son locales de la segunda llamada): **$0.0018**.
`ejecutarAnalista` no tiene `catch` — su `try` solo lleva `finally`
(`:417-420`) — así que la excepción sube tal cual y `res.cost` de $0.0041
**nunca existió para nadie**. La ruta (`src/app/api/dashboard/chat/route.ts:151-159`)
hace lo correcto con lo que le llega y registra $0.0018.

Sale mal: `llm_costo` anota $0.0018 de un turno que costó $0.0059 — 69% menos.

Consecuencia: el tope diario de $1 USD por flota (`route.ts:39-42, 96-102`),
que existe por un pedido explícito de negocio ("que no implique que si se
quedan ahí todo el día quemar un exceso de tokens"), **se subestima justo en
el modo de falla que más gasta**: los turnos que necesitan reintento son los
que corren dos ciclos completos. Un contralor picando el chat toda la tarde
llega al freno habiendo gastado el doble. Es la misma fuga que el pase 2 cerró
en la ruta (TC-A1), reaparecida un nivel arriba.

Causa raíz probable: `ejecutarAnalista` acumula el costo de los dos ciclos solo
en el camino feliz (`:377-381`); no hay un acumulador vivo fuera del `try` que
el camino de excepción pueda vaciar.

### [ALTO] El loop-guard tira una respuesta ya producida y pagada, y saltándose la red determinística
`src/lib/llm/openrouter.ts:779-781` × `src/lib/agents/analista.ts:316, 388-406`

Escenario: `maxToolRounds: 5` (`analista.ts:325`) da rondas 0-4, y el guard
corta en `round === maxRounds - 1`, o sea **antes de ejecutar nada de la ronda
4**. Pregunta compuesta ("¿cómo voy, cuánto llevo de acreditables y qué me
proyectas?"): ronda 0 `kpis_flota`, ronda 1 `acreditables_periodo`, ronda 2
`motor_fiscal`, ronda 3 `serie_gasto`, ronda 4 el modelo por fin llama
`entregar_respuesta` **con la respuesta completa y correcta** → `LoopGuardError`
antes del `Promise.all` → `PartialExecutionError` → sube por `ejecutarAnalista`
sin `catch`.

Sale mal: `CAPTURAS` queda vacío, los bloques nunca se arman, y la "ÚLTIMA RED,
determinística" de `:388-406` —escrita exactamente para "si el modelo enmudeció
pero las tools SÍ leyeron datos, se arma una tabla con lo leído"— **nunca
corre**, aunque `res.toolCalls` traía cuatro resultados reales. La ruta manda
`{t:'error'}` y el usuario lee (`src/app/dashboard/chat.tsx:112-117`): *"No pude
responder eso — el análisis se detuvo: el analista no pudo responder en este
momento."*

Que esto ocurre está medido en el propio repo: `analista.ts:240-243` documenta
que el modelo "volvía a llamar tools y reventaba el tope de rondas (medido con
gpt-5-nano el 12-ago)"; la instrucción en el resultado de `entregar_respuesta`
es el parche, no una garantía.

Consecuencia: en el demo, "Pregunta a tus datos" muestra en vivo los pasos
(`kpis_flota`… `motor_fiscal`… palomeados) y luego se disculpa. El contralor ve
que el sistema leyó sus datos y aun así no le contestó, con la flota pagando
cinco completions. La red que lo cubriría existe y está a cinco líneas de
distancia, del lado equivocado del `throw`.

Causa raíz probable: `generateWithTools` señaliza el corte con una excepción y
`ejecutarAnalista` solo tiene camino de degradación en el `return`, no en el
`catch` que no existe.

### [MEDIO] `generateStructured` le cuelga al modelo que ganó los tokens de todos los que fallaron
`src/lib/llm/openrouter.ts:399-404, 435, 464` → `src/lib/likida/intake/ocr.ts:470` → `src/app/admin/agente-ocr/page.tsx:61-72`

Escenario: OCR de un ticket con `LIKIDA_MODEL_OCR=google/gemini-3.1-flash-lite`.
Intento 1 devuelve prosa → `StructuredError`, 1,200 in / 900 out. Intento 2 con
nota → 503 del proveedor. Fallback a `anthropic/claude-haiku-4.5`
(`openrouter.ts:504-509`) → éxito, 1,300 in / 400 out. `cobrar()` sí precifica cada
intento con SU modelo (el total en USD queda bien), pero el retorno de `:464`
es `{ model: usage.model, ...gastado }`: **el slug del último intento con los
tokens de los tres**. `ocr.ts:470` lo pasa entero y `processor.ts:694/967`
escribe UNA fila.

Sale mal: `llm_costo` recibe `modelo='anthropic/claude-haiku-4.5',
tokens_in=2500, tokens_out=1300`. La realidad fue gemini 1,200/900 y haiku
1,300/400. En el camino de error es al revés: `conGastado` (`:474`) sella
`{ model, ...gastado }` con el **primario**, cargándole los tokens del fallback.

Consecuencia: `/admin/agente-ocr` pinta un panel rotulado "Costo por modelo —
OCR" leyendo esa columna. Es la pantalla con la que Javier compara modelos de
OCR — y `models.ts:33-47` documenta que la decisión de mover el OCR (12.5× de
diferencia de costo) se tomó con estos números. El fallback aparece consumiendo
tokens que no gastó y el primario aparece sin haber fallado nunca.

Causa raíz probable: el `costoPorModelo` que se construyó para
`generateWithTools` (`openrouter.ts:648-652`, auditoría 10) no se replicó en
`generateStructured`, que es la función de MÁS volumen del producto (una
llamada por foto).

### [MEDIO] Ninguna de las diez tools del analista cae en `READ_PREFIXES`: la caché entre rondas está muerta para todo el chat
`src/lib/llm/openrouter.ts:558-559, 799, 831` × `src/lib/agents/chat-tools.ts:46,58,78,102,123,143,158,173,210,241`

Escenario: `READ_PREFIXES = ['get_','check_','list_','find_','consultar_','validar_','cuadrar_']`.
Los diez nombres registrados son `kpis_flota`, `acreditables_periodo`,
`motor_fiscal`, `viajes_flota`, `liquidaciones_flota`, `serie_gasto`,
`serie_liquidado`, `top_rutas`, `proyectar_serie`, `duplicados_detectados`:
**ninguno empieza por un prefijo de la lista**, así que `isReadOnly` es `false`
para todos y `crossRound` (`:799`, `:831`) jamás se consulta ni se llena. El
`inRound` sí dedupea, pero solo dentro de la MISMA ronda y con llave que incluye
los args.

Sale mal, con la pregunta real "¿cómo voy y qué proyectas?": ronda 0 llama
`serie_gasto{modo:'mensual'}` y ronda 2 llama `proyectar_serie{serie:'gasto',
modo:'mensual'}` — **los dos ejecutan `getGastoPorSemanaSeries(tenantId, hoy)`
completo** (`chat-tools.ts:153` y `:233`), y llaves distintas garantizan que ni
siquiera coincidiendo de ronda se compartirían. Igual con `kpis_flota` llamada
en la ronda 0 y otra vez en la 2 para "confirmar": dos `getKpis` con sus
`traerTodo` paginados sobre `viaje` y `liquidacion`.

Consecuencia: dentro de un presupuesto de 40s (`analista.ts:314`) sobre el
objetivo de escala de la mig. 0111 (15k filas), duplicar los barridos es lo que
hace que el turno se pase de tiempo — y pasarse de tiempo entra por el mismo
`PartialExecutionError` del hallazgo anterior: pantalla de disculpa. La rejilla
que lo evitaría existe, pero está indexada por una convención de nombres que la
superficie nueva no siguió.

Causa raíz probable: `isReadOnly` decide por prefijo del nombre en vez de por
la declaración del registro (`RegisteredTool.isMutation` ya existe en
`tool-executor.ts:46` y sabe lo contrario).

### [MEDIO] `guardar_liquidacion` le devuelve al modelo la liquidación entera: RFCs, UUIDs, rutas de foto y el crudo del OCR
`src/lib/likida/tools.ts:235` → `src/lib/llm/openrouter.ts:833`

Escenario: el snapshot `liq` se agrega al resultado para que `guardiaCifras` lo
reuse (motivo legítimo, AG-3), pero el mismo objeto se serializa en
`openrouter.ts:833` como `content` del mensaje `role:'tool'` que el modelo LEE y
que la ronda siguiente reenvía como entrada. `liq.gastos` es `Gasto[]` completo
(`src/lib/likida/repo.ts:670-697`): `rfcEmisor`, `rfcReceptor`, `cfdiUuid`,
`imagenUrl` (la ruta de Storage de la foto del ticket), `imgHash` y `ocrExtra`
—que trae `producto`, `estacion`, `emisor`, `fechaImpresa`, todo texto leído de
la foto (`src/lib/likida/intake/ocr.ts:394-420`).

Sale mal: una liquidación de 21 comprobantes manda ~7 KB de JSON (≈2,000 tokens)
al modelo del rol `cuadre` (Sonnet 5, `reasoning:'high'`), de los cuales el
modelo usa cuatro campos: `liquidacion_id`, `estatus`, `diferencia`,
`pdf_generado`. Hasta ese momento, el cuadre **nunca había visto un RFC**: el
history son turnos de WhatsApp (`processor.ts:2054-2055`) y `cuadrar_viaje`
devuelve solo `{tipo, monto, nota}` (`tools.ts:136`). Esta tool es el único sitio
por el que los datos fiscales del ticket cruzan a OpenRouter.

Consecuencia: para el equipo que mantiene esto, ~$0.004 por liquidación (10% del
objetivo de $0.03–0.05 de `models.ts:17`) en tokens que nadie lee; para legal, la
minimización que `models.ts:19-23` promete ("RFC y CFDI son datos personales")
se cumple con el proveedor correcto pero no con el volumen correcto.

**Lo que me refutó una versión más grave:** intenté escalarlo a inyección
—texto impreso en un ticket vuelve al modelo vía `ocrExtra.emisor`, que
`sanitizarTexto` recorta a 80 chars pero explícitamente "no mira el contenido"
(`intake/sanitizar.ts:31-32`)— y **no se sostiene**: cuando corrió
`guardar_liquidacion`, `guardiaCifras` pone `cuadro = true`
(`cuadre/guardia.ts:38-40`) y sustituye el texto del modelo por el resumen
determinístico SIEMPRE. La inyección no alcanza al chofer. Queda el payload.

Causa raíz probable: no hay separación entre "lo que el executor registra en
`ToolCallRecord` (para nuestro código)" y "lo que vuelve al modelo": un solo
`result` sirve a los dos consumidores.

### [MEDIO] La prueba que hace cumplir la regla estructural recorre una lista fija, no el registro — la tool nueva ya se le escapó
`src/lib/agents/chat-tools.test.ts:105-133` × `src/lib/llm/tool-executor.ts:49-54`

Escenario: las tres pruebas guardián ("NINGUNA admite texto libre", "ninguna
acepta propiedades extra", "ninguna toma un tenant por parámetro") iteran
`funciones()`, que sale de `toolSchemas(TOOLS)` con `TOOLS` **codificado a mano
con los diez nombres del analista**. `REGISTRY` (`tool-executor.ts:49`) tiene
hoy catorce. La tool más nueva del repo, `entregar_respuesta`
(`analista.ts:196`), está registrada en OTRO archivo y **ninguna de las tres la
mira**: declara cuatro propiedades `type:'string'` sin `enum` (`texto`, `nota`,
`concepto`, `valor`) y sus objetos anidados de `items` no llevan
`additionalProperties:false` (`analista.ts:216-226`).

Sale mal hoy: nada — `entregar_respuesta` es captura de salida, no toca consulta
ni fila, y `validarBloques` (`analista.ts:50-112`) revalida todo. Sale mal
mañana: la siguiente tool que alguien registre fuera de `chat-tools.ts` entra
con `properties` libres y **la compuerta pasa verde**. La regla que CLAUDE.md
y el encabezado de `chat-tools.ts:1-14` llaman estructural está sostenida por
una lista que hay que acordarse de editar.

Consecuencia: para el equipo que mantiene esto, la defensa contra inyección de
prompt del producto es hoy una convención documentada, no un invariante
verificado. `registerTool` tampoco falla ante un nombre repetido: solo
`logger.warn('tool.reregister')` (`tool-executor.ts:52`) y sobrescribe el
handler.

Causa raíz probable: el guardián se escribió del lado del consumidor (la lista
de tools del analista) en vez del lado del productor (el `REGISTRY`).

### [BAJO] La escalera de truncamiento se traga `eT` y reintenta con el tope original (REINCIDENTE, degradado desde ALTO)
`src/lib/llm/openrouter.ts:486-497`

Escenario: OCR de una factura larga. Intento 1 → `TruncatedError` (tope 4,000,
`usó 4000`). Intento 2 con `tope*2 = 8,000` → el modelo devuelve prosa →
`StructuredError`, que **no** es `TruncatedError`, así que el `if` de `:495` no
entra, el `catch` termina vacío y el error se pierde. Se cae al `attempt(model,
note)` de `:500` — **sin el tope doblado**: vuelve a correr con 4,000 y vuelve a
truncar. Si además el error se clasifica como transitorio, el fallback de `:506`
también corre a 4,000.

Sale mal: cuatro llamadas pagadas de las cuales tres corren con el techo que ya
se demostró insuficiente (el fallback está en `:504-509`), y el log final
(`ocr.ts:270-274`) reporta `tope: 4000`
cuando el código ya había probado 8,000 — el diagnóstico apunta al techo
equivocado.

Consecuencia: para el chofer, un comprobante largo tarda cuatro llamadas en
terminar en "no pude leer tu foto"; para quien depura, el log miente sobre qué
se intentó.

**Por qué ya no es ALTO:** el `cobrar(usage)` de `:438` corre ANTES de cualquier
`throw` en `attempt`, así que el consumo de los intentos tragados sí queda en
`gastado` y viaja al llamador. La parte cara del hallazgo del pase 2 —perder
dinero— está cerrada; queda la parte de diagnóstico y una llamada de más.

### [BAJO] `CAPTURAS` no se limpia entre los dos ciclos que comparten `runId`
`src/lib/agents/analista.ts:194, 239, 345, 375, 419`

Escenario: ciclo 1 llama `entregar_respuesta` con bloques que la guardia tumba
(`:353`) → `CAPTURAS[runId]` queda con ellos. El reintento corre con el MISMO
`ctx` y el mismo `runId` (`:281`, `:366`). Si en el reintento el modelo contesta
en texto plano sin llamar la tool terminal —el caso que el comentario de `:348-350`
dice que ocurre—, `:375` lee `CAPTURAS.get(runId)` y **recupera los bloques que
la guardia ya había condenado**, descartando el `res2.finalText` nuevo; si el
segundo `entregar_respuesta` falla `validarBloques`, el handler retorna en `:238`
sin sobrescribir y pasa lo mismo.

Sale mal: la guardia de `:388` sí vuelve a correr sobre esos bloques viejos,
pero con un `respaldo` engordado por las tools del reintento — así que la
narrativa del turno 1 puede pasar apoyada en números que trajo el turno 2.

Consecuencia: para el contralor, una respuesta que el sistema ya había juzgado
insostenible puede llegar a pantalla por coincidencia numérica; el rechazo no
es sticky.

Causa raíz probable: `CAPTURAS` es "lo último entregado por este run" y se usa
como "lo entregado por ESTE ciclo".

### [BAJO] `generateResponse` no tiene un solo llamador y no acepta `signal`
`src/lib/llm/openrouter.ts:260-295`

Escenario: es la única de las tres puertas del gateway sin `signal`, así que cae
al default del SDK de OpenAI (10 minutos) — el bug que `generateStructured:349-356`
y `ocr.ts:227-234` documentan con detalle. Además su `max_tokens` por defecto es
500, no `DEFAULT_MAX_TOKENS`. Un grep sobre `src/` no encuentra ningún llamador
fuera de su propia definición.

Consecuencia: para el equipo, es una trampa con forma de atajo: el próximo
agente de texto que la use hereda el cuelgue de 10 minutos dentro de un webhook
de 60s, y el truncamiento a 500 tokens sin la comprobación de `finish_reason`
que las otras dos sí tienen.

## Lo que revisé y está bien

**El barrido completo de las CATORCE definiciones de tools contra la regla
`properties: {}` — ninguna deja que el modelo decida sobre datos:**

| Tool | Dónde | `parameters` | Veredicto |
|---|---|---|---|
| `consultar_politica` | `likida/tools.ts:32` | `properties: {}` | tenant de `ctx.tenantId` (`:36`) |
| `cuadrar_viaje` | `likida/tools.ts:88` | `properties: {}` | `ctx.viajeId`, y falla cerrado sin viaje (`:92`) |
| `guardar_liquidacion` | `likida/tools.ts:159` | `properties: {}` | MUTACIÓN; `ctx.viajeId`, `handler(_args, ctx)` |
| `kpis_flota` | `chat-tools.ts:53` | `SIN_PARAMS` (`:25`) | `ctx.tenantId` |
| `acreditables_periodo` | `chat-tools.ts:65` | `SIN_PARAMS` | `ctx.tenantId` |
| `motor_fiscal` | `chat-tools.ts:85` | `SIN_PARAMS` | `ctx.tenantId` |
| `viajes_flota` | `chat-tools.ts:109` | `SIN_PARAMS` | `ctx.tenantId`, recorte a 25 |
| `liquidaciones_flota` | `chat-tools.ts:130` | `SIN_PARAMS` | `ctx.tenantId`, recorte a 20 |
| `duplicados_detectados` | `chat-tools.ts:248` | `SIN_PARAMS` | `ctx.tenantId`, recorte a 10 |
| `serie_gasto` | `chat-tools.ts:149` | `PARAM_MODO` enum ×3 | ventana, no propiedad de dato |
| `serie_liquidado` | `chat-tools.ts:163` | `PARAM_MODO` | ventana |
| `top_rutas` | `chat-tools.ts:178` | `PARAM_MODO` | ventana |
| `proyectar_serie` | `chat-tools.ts:216-224` | 2 enums cerrados | qué serie + ventana |
| `entregar_respuesta` | `analista.ts:202-234` | strings libres | **salida**, no consulta; revalidada en `:50-112` |

Ninguna acepta un `tenant_id`, `viaje_id`, `folio`, `rfc` ni fragmento de
consulta. Los cuatro enums degradan a un valor seguro y **lo declaran de vuelta
en el resultado** (`chat-tools.ts:154`, `:169`, `:184`, `:231`), así que el
modelo nunca cree haber pedido algo distinto de lo que recibió.

- **Idempotencia de mutaciones, con la ventana de check-then-act cerrada.**
  `tool-executor.ts:147-170` cachea la PROMESA, no el resultado, y la llave es
  el NOMBRE (`:158`) — un `{"confirmar":true}` no esquiva la rejilla. El fallo
  no se cachea (`:169`) y se compara la promesa antes de borrar. Cubierto de
  verdad por `tool_executor_concurrente.test.ts:32-135`, incluido el
  `Promise.all` de la misma ronda.
- **Loop-guard: corta antes de pagar la ronda inútil.** `openrouter.ts:779-781`
  con prueba que verifica que la tool de la última ronda NO se ejecuta
  (`openrouter_loopguard.test.ts:40`) y que cerrar justo en la última ronda
  permitida no dispara el guard (`:68`). El conteo es correcto: `maxRounds - 1`
  es la última ronda que puede pedir tools.
- **Fallback cross-provider con prueba, y la red de respaldo con prueba de
  cobertura.** `modelosAisladosDeFallback()` (`openrouter.ts:94-97`) enumera los
  modelos de `PRICES` fuera de la red y `openrouter_fallback_cobertura.test.ts:29`
  falla si alguno queda huérfano — verifiqué las doce entradas de `PRICES`
  contra `FALLBACK` a mano y ninguna está aislada. El fallback SOLO reintenta la
  completion, nunca re-ejecuta una tool (`openrouter.ts:697-728`).
- **Costo por ronda con el modelo de esa ronda, en `generateWithTools`.**
  `openrouter.ts:739-741` + `costoPorModelo` (`:648-652`), consumido en
  `processor.ts:2110-2118` y `route.ts:122-127` para escribir UNA FILA POR
  MODELO. Con pruebas de las dos formas (`openrouter_fallback_costo.test.ts:55, 97`).
- **`PartialExecutionError` lleva lo pagado, y los dos llamadores lo registran.**
  `processor.ts:2143-2152` y `route.ts:151-159`, este último con prueba
  (`costo_parcial.test.ts:70`). El cierre del pase 2 sigue en pie.
- **Una respuesta cortada no pasa por completa.** `openrouter.ts:753-761` tira
  `TruncatedError` en vez de mandar `finalText: ''` que `processor.ts:2095` habría
  convertido en "Listo. 👍". Con prueba del caso `content` vacío
  (`openrouter_truncado_tools.test.ts:65`).
- **`costoReal` prefiere el costo del proveedor y `calcCost` nunca devuelve $0
  para un modelo desconocido** (`openrouter.ts:182-209`): estima con la tarifa
  más cara y deja `llm.modelo_sin_precio`. `registrarCosto` descarta NaN en vez
  de escribir un 0 que se leería como barato (`costos.ts:120-127`).
- **El error crudo de Postgres no cruza al modelo.** `tool-executor.ts:82-89`
  filtra por vocabulario y deja pasar el mensaje de negocio; el detalle completo
  se queda en `logger.error` (`:109`).
- **La caché de lectura se llavea por EFECTO, no por llamada.**
  `llaveDeCache` (`openrouter.ts:581-593`) usa solo el nombre para las tools sin
  parámetros, y el `ToolCallRecord` guarda los args de la llamada que de verdad
  produjo el resultado (`:806`, `:832`) — auditable.
- **`entregar_respuesta` no se confía de la forma que entregó el modelo.**
  `validarBloques` (`analista.ts:50-112`) recorta a 6 bloques / 10 filas / 60
  puntos / 900 chars, rescata lo válido y devuelve `{ok:false}` con instrucción
  en vez de lanzar.
- **Los seis agentes de `src/lib/likida/agentes/` NO son superficie de tool
  calling**: `cobranza.ts`, `corridas.ts`, `estrategia.ts`, `notificaciones.ts`
  son deterministas y no importan nada de `src/lib/llm/`. Verificado por grep.
  El único agente LLM nuevo de la semana es el analista.

## Lo que NO alcancé a revisar

- **El comportamiento real de `finish_reason: 'length'` cuando SÍ vienen
  `tool_calls`.** La comprobación de `openrouter.ts:753` está dentro del `if
  (!calls || calls.length === 0)`. Razoné que un `arguments` cortado no parsea y
  cae en el camino de `args_parse` (`:794-796`), pero no pude confirmar contra el
  proveedor si OpenRouter puede devolver un `tool_calls` con args cortados que
  **sí** parseen (p. ej. `bloques` truncado a un array cerrado). Con
  `maxTokens: 900` en el analista y `entregar_respuesta` emitiendo tablas, el
  caso no es hipotético.
- **`costoPorModelo` se llavea con `activeModel` (el slug que pedimos) y el
  camino de un solo modelo registra con `res.model` (el que devolvió
  OpenRouter).** Si OpenRouter devuelve el slug con sufijo (`:nitro`, `:floor` —
  `calcCost:197` lo contempla), `llm_costo` guarda dos etiquetas distintas para
  el mismo modelo según haya habido fallback o no. No pude verificar con qué
  frecuencia difieren de verdad.
- **`faseDeModelo(modelo, 'chat')` clasifica a `'escalacion'` si el slug
  contiene "opus"** (`costos.ts:102-104`), y el tope diario del chat filtra
  `.eq('fase','chat')` (`route.ts:85`). Hoy no muerde porque ningún modelo del
  rol `chat` es Opus; apuntar `LIKIDA_MODEL_CHAT` a Opus dejaría el tope de $1
  ciego al 100%. No lo cuento como hallazgo porque depende de una variable de
  entorno que hoy no está puesta.
- **El presupuesto de `ctx.signal` dentro de los handlers** sigue documentado
  como BAJO consciente en `tool-executor.ts:19-40` y verifiqué que el diagnóstico
  sigue siendo exacto (ningún handler lo lee), pero no medí cuánto trabajo
  desperdiciado produce de verdad con el tope de 8s de `repo.ts`.
- **No corrí `npx vitest run`** (prohibido por el MAPA); todas las afirmaciones
  sobre pruebas salen de leer los archivos `.test.ts`, no de una corrida.
