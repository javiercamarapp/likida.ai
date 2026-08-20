# Tool calling — auditoría 18

**Nota: 7/10** (antes 6). Razón del movimiento: **se atacó y subió**. La razón del 6
("la regla se respeta pero el cliente que la implementa no tiene pruebas unitarias")
ya no es cierta: `src/lib/llm/` + `src/lib/agents/` corren 167 pruebas verdes
(25 archivos) que cubren el fallback cross-provider y su costo, el loop-guard, el
truncamiento, la rejilla de mutaciones bajo concurrencia y el contrato de las 14
tools nuevas del copiloto. No llega a 8 porque el ancla del 8 ("ninguna tool acepta
datos del modelo") dejó de cumplirse en el copiloto de admin —de forma defendible,
pero sin la prueba de invariante que sí tiene el chat del cliente— y porque el
loop-guard tira turnos ya pagados en la superficie que ve el contralor.

**El riesgo mayor hoy:** el ciclo de tools puede destruir una respuesta COMPLETA y
ya cobrada —la tool terminal ejecutada en la última ronda permitida nunca corre— y
cuando eso pasa el turno entero se cae sin pasar por ninguna de las tres redes de
seguridad que el diseño promete.

---

## Hallazgos

### [ALTO] El loop-guard mata la tool terminal, y con ella la respuesta ya pagada

`src/lib/llm/openrouter.ts:792-794` · `src/lib/agents/analista.ts:316-330, 345-346, 356-372, 388-406, 417` · `src/lib/agents/copiloto.ts:199-220, 251-269`

**Escenario (con valores).** El analista corre con `maxToolRounds: 5`
(`analista.ts:325`). El `for` de `generateWithTools` permite 5 completions, pero
`if (round === maxRounds - 1) throw new LoopGuardError(maxRounds)` corta **antes**
del `Promise.all`, así que solo las rondas 0-3 ejecutan tools (lo fija
`openrouter_loopguard.test.ts:58`: con `maxToolRounds: 3` hay 3 completions y **2**
ejecuciones).

Un contralor pregunta *"compárame el gasto y lo liquidado del mes y dime mis top
rutas"*. `gemini-3.5-flash-lite` (rol `chat`) resuelve en serie:

| ronda | tool |
|---|---|
| 0 | `kpis_flota` |
| 1 | `serie_gasto` |
| 2 | `serie_liquidado` |
| 3 | `top_rutas` |
| 4 | `entregar_respuesta` ← `round === 4 === maxRounds-1` → **LoopGuardError** |

La entrega nunca se ejecuta, `CAPTURAS` (`analista.ts:345`) queda vacío, y como
`generateWithTools` **lanza**, la excepción sale del `try` de `ejecutarAnalista`
—que tiene `finally` pero **no `catch`** (`analista.ts:417`)—. El route pinta
`{t:'error', error:'el analista no pudo responder en este momento'}`. Se pagaron
5 completions (~40,000 tokens de entrada acumulados por el crecimiento de la
conversación) por una respuesta que el modelo ya había redactado.

La justificación escrita del corte ("no hay una ronda siguiente que vaya a leer el
resultado de esas tools", `openrouter.ts:782-791`) es falsa justo para la tool
terminal: su resultado **no lo lee el modelo**, lo lee el orquestador por el mapa
`CAPTURAS`. Peor: el camino de reintento correctivo aprieta el cerco a
`maxToolRounds: 4` (`analista.ts:367`, `copiloto.ts:236`) —solo 2 rondas de
lectura antes de la entrega— y su prompt le pide explícitamente al modelo *"vuelve
a llamarlas si te hace falta"* (`analista.ts:363`).

**Consecuencia.** Para el contralor: una pregunta legítima de cierre de mes
contesta "no pude responder" con la respuesta ya escrita del otro lado. Y las tres
capas de red que el diseño promete —reintento correctivo, guardia de cifras, "red
final determinística" que arma la tabla con lo que las tools sí leyeron
(`analista.ts:388-406`, `copiloto.ts:251-269`)— **son inalcanzables por este
camino**: todas viven después del `await` que lanzó.

**Causa raíz probable.** El loop-guard trata todas las tool_calls como si su valor
para el turno viniera de que el modelo lea su resultado en la ronda siguiente; la
arquitectura de entrega por tool terminal (canal lateral `CAPTURAS`) rompe ese
supuesto y nadie exceptuó a la tool terminal del corte.

---

### [MEDIO] El costo de la primera vuelta desaparece si el reintento correctivo truena

`src/lib/agents/analista.ts:356-381` · `src/lib/agents/copiloto.ts:225-246` · `src/app/api/dashboard/chat/route.ts:120-133` · `src/app/api/dashboard/chat/tope.ts:31-40`

**Escenario (con valores).** Turno del chat del panel: la primera llamada a
`generateWithTools` **resuelve** con `res.cost = 0.014` USD (5 completions de
flash-lite, ~40,000 in / 900 out a $0.30/$2.50 por M). La guardia de cifras la
tumba (`cifrasRespaldadas` falso), se dispara el reintento correctivo
(`analista.ts:353-356`) y ese segundo ciclo pega el loop-guard del hallazgo
anterior → `PartialExecutionError` con `tokensIn/tokensOut/cost` **solo de la
segunda llamada** ($0.011).

El `catch` del route (`chat/route.ts:126-131`) registra una fila `modelo:'parcial'`
con esos $0.011. Los $0.014 de la primera vuelta —que ya salieron de la cuenta de
OpenRouter— no se escriben en `llm_costo` **nunca**: `res.costoPorModelo` solo se
lee en el `return` feliz (`analista.ts:412`), que esa ejecución no alcanza.

**Consecuencia.** `gastoChatHoyUsd` (`tope.ts:31-40`) es el único freno de gasto
del chat del cliente ($1/día por tenant). Subcuenta **más de la mitad** justo en el
modo de falla que más consume, que es exactamente el agujero que la auditoría 3
(TC-A1) cerró para *un* ciclo y que el segundo ciclo reabrió. Un tenant en bucle
gasta el doble de su tope antes de que el freno lo vea.

**Causa raíz probable.** El acumulador de costo del reintento (`res.cost += res2.cost`,
`analista.ts:381`) vive en el camino feliz; la vía de excepción del segundo ciclo
solo transporta lo de ese ciclo.

---

### [MEDIO] El copiloto de admin no contabiliza NADA cuando el turno truena

`src/app/api/admin/copiloto/route.ts:192-195` (registro) vs. `:215-217` (catch) · comparar con `src/app/api/dashboard/chat/route.ts:120-133`

**Escenario (con valores).** El copiloto **no escribe en `llm_costo` a propósito**
(la tabla exige `tenant_id` y este gasto es de Likida, no de una flota — decisión
anotada en `route.ts:24-28`). Su único medidor es
`logger.info('copiloto.costo', {costoUsd, tokensIn, tokensOut, modelo, tools})`, y
esa línea está **dentro del `try`, después** de `ejecutarCopiloto`. El `catch`
(`:215-217`) solo emite `copiloto.fallo` con el mensaje del error.

Javier pregunta tres veces seguidas *"¿cómo va el negocio, qué espera decisión y
qué han hecho mis agentes?"*; el modelo encadena lecturas en serie y los tres
turnos pegan el loop-guard (o el `AbortController` de 40 s de `copiloto.ts:197`).
Resultado: 3 × (5 + 4) = hasta 27 completions de `gpt-5.6-luna` ($0.10/$0.60 por M)
≈ $0.05, y **cero** líneas `copiloto.costo`. El freno diario tampoco lo ve: cuenta
TURNOS (300/día, `route.ts:72-75`), no dólares, y el rate-limit se consume al
entrar.

**Consecuencia.** El gasto propio de Likida en IA de dirección queda medido solo en
los turnos baratos y ciego en los caros; el promedio que se lea del log está
sesgado hacia abajo por construcción. El patrón correcto ya existe doce archivos
más allá (`chat/route.ts`) y no se copió.

**Causa raíz probable.** La contabilidad se colgó del valor de retorno en lugar de
colgarse del error, que es donde el `PartialExecutionError` la lleva desde la
auditoría 3.

---

### [MEDIO] `correr_runner`: la previsualización enseña un objetivo que el ejecutor tira

`src/lib/agents/copiloto-acciones.ts:129-149` (rama), `:135` (`await correrRunner()`) · `src/lib/agents/copiloto.ts:52-93` (`proponer_accion`) · `src/app/admin/copiloto.tsx:270`

**Escenario (con valores).** El modelo aprende que la acción existe leyendo el
resultado de `estado_runner` (`copiloto-tools.ts:393`: *"se puede adelantar con la
accion correr_runner (confirmada)"*). Javier escribe *"corre el redactor ahora"*.
El modelo llama `proponer_accion` con `{accion:'correr_runner', objetivo:'redactor',
motivo:'…'}` — `objetivo` es un `type:'string'` libre que **llena el modelo**
(`copiloto.ts:62`). La tarjeta pinta literalmente:

> Voy a **ejecutar** `redactor`

(`copiloto.tsx:270`). Javier escribe el motivo y confirma. El servidor gasta el
intent y llama `ejecutarAccionCopiloto('correr_runner', {id:'redactor', motivo}, userId)`
→ la rama de `copiloto-acciones.ts:129-149` **jamás mira `params.id`**: llama
`correrRunner()`, que no recibe argumentos y despacha **todos** los agentes con
`estado='vivo' AND runner_habilitado AND disparador='cron'`
(`runner.ts:117-130`), cada uno hasta su `presupuesto_dia_usd`.

**Consecuencia.** Javier autorizó una corrida y obtuvo N. Gasta modelo por cada
agente habilitado y llena Aprobaciones con piezas que no pidió; la corrida que
corrió, corrió (lo dice el propio catálogo: `revertir`). Y rompe la regla número
dos del repo —*un rótulo tiene que ser verdad*— en la única pantalla donde una
acción real se confirma. El texto de `efecto` sí describe el barrido completo, así
que el titular y el cuerpo de la misma tarjeta se contradicen.

**Causa raíz probable.** El catálogo declara un `objetivo` obligatorio para todas
las acciones (contrato uniforme de `proponer_accion`) y `correr_runner` es la
primera acción implementada que no tiene objetivo; nadie cerró el hueco ni en el
schema ni en el ejecutor.

---

### [BAJO] `finish_reason: 'length'` con tool_calls se le reporta al modelo como "argumentos JSON inválidos"

`src/lib/llm/openrouter.ts:759-774` (guardia de truncamiento) vs. `:804-810` (parseo de args) · comparar con `:456-464`

**Escenario (con valores).** La comprobación de truncamiento vive **dentro** de
`if (!calls || calls.length === 0)`. Cuando el modelo sí emitió tool_calls y se
quedó sin techo a media escritura de `arguments`, no se detecta.

El analista corre con `maxTokens: 900` (`analista.ts:326`). El usuario pide *"dame
la tabla de los 20 viajes del mes"*; el modelo llama `entregar_respuesta` con un
bloque `tabla` de 20 filas ≈ 1,100 tokens de salida → corte en 900 →
`finish_reason: 'length'`, `tool_calls` presente, `arguments` truncado →
`JSON.parse` falla → `executed.push({error:'args_parse'})` y al modelo le vuelve
`{"error":"argumentos JSON inválidos"}`.

**Consecuencia.** El modelo recibe un diagnóstico falso (le dicen que formateó mal
cuando lo que faltó fue presupuesto), reintenta, y quema rondas hacia el
loop-guard. En el log queda `args_parse`, así que nadie puede atribuirlo al techo
de 900 tokens. Es exactamente el bug que `generateStructured` ya arregló y
documentó ("el parseo también falla y confunde el diagnóstico… truncamiento
disfrazado de ilegible", `openrouter.ts:454-464`), vivo en el camino hermano.

**Causa raíz probable.** La guardia se colocó dentro de la rama "el modelo cerró
con texto" en vez de justo después de leer `choice`.

---

### [BAJO] La rejilla de caché de lectura no cubre ninguna tool de los dos chats

`src/lib/llm/openrouter.ts:565-572` (`READ_PREFIXES` / `isReadOnly`) · `src/lib/likida/tools.ts:90` (`estado_viaje`) · `src/lib/agents/copiloto-tools.ts:36-40` · `src/lib/agents/analista.ts:39-43`

**Escenario (con valores).** `READ_PREFIXES = ['get_','check_','list_','find_','consultar_','validar_','cuadrar_']`.
De las 26 tools registradas, solo dos matchean: `consultar_politica` y
`cuadrar_viaje`. No matchean **ninguna** de las 10 del chat del cliente
(`kpis_flota`, `serie_gasto`, `top_rutas`, …), **ninguna** de las 14 del copiloto
(`metrica_negocio`, `bandeja`, `guardia`, …), ni `estado_viaje` — que es lectura
pura y cae en el mismo hueco que el comentario de `:565-571` dice haberle cerrado
a `cuadrar_viaje`.

Concreto: el reintento correctivo del copiloto le ordena al modelo *"vuelve a
llamarlas si te hace falta"* (`copiloto.ts:232`). El modelo vuelve a pedir
`metrica_negocio` → `isReadOnly('metrica_negocio') === false` → `crossRound` ni
consulta ni guarda → `getResumenNegocio()` se ejecuta otra vez completa
(agregación cruzando todos los tenants) dentro de un turno acotado a 40 s.

**Consecuencia.** Latencia y trabajo de base duplicados en el turno que ya iba
apretado de presupuesto — el mismo turno que después pega el loop-guard. No hay
riesgo de dato incorrecto: `inRound` sigue dedupeando dentro de una ronda y las
mutaciones tienen su propia rejilla.

**Causa raíz probable.** La rejilla se llavea por convención de nombre y las tools
nuevas (12-ago en adelante) se nombraron por sustantivo (`bandeja`, `guardia`,
`kpis_flota`), no por verbo.

---

### [BAJO] `faseDeModelo` puede sacar el gasto del chat del universo que mira su propio tope

`src/lib/likida/costos.ts:102-105` · `src/app/api/dashboard/chat/route.ts:95-100` · `src/app/api/dashboard/chat/tope.ts:35`

**Escenario (con valores).** El route registra
`fase: faseDeModelo(modelo, 'chat')`, y `faseDeModelo` devuelve `'escalacion'`
—no `'chat'`— para cualquier slug que contenga `opus`. El freno diario lee
`.eq('fase','chat')` (`tope.ts:35`).

`models.ts:44-47` establece que cambiar de modelo debe costar **una variable de
entorno, no un despliegue**. Con `LIKIDA_MODEL_CHAT=anthropic/claude-opus-5`
($5/$25 por M, ya en `PRICES`), cada turno cuesta ~$0.25 y se archiva como
`fase:'escalacion'`. `gastoChatHoyUsd` suma $0.00 para siempre: el tope de $1/día
por tenant **deja de existir en silencio**, y el widget de uso del sidebar —que
lee el mismo número a propósito— le enseña al cliente $0 gastados.

**Consecuencia.** El único candado contra el bucle y el curioso desaparece
exactamente cuando el modelo elegido es el más caro del catálogo. Modo de falla
silencioso, de la misma familia que la tabla `FALLBACK` indexada por slug que
`openrouter.ts:55-62` ya documenta como trampa pisada.

**Causa raíz probable.** Dos clasificaciones distintas del mismo hecho: quien
escribe la fila deriva la fase del slug del modelo, quien la lee la busca por el
nombre del subsistema.

---

## Inventario de tools

| Tool | Dónde se define | ¿Acepta datos del modelo? | ¿Tiene test? |
|---|---|---|---|
| `consultar_politica` | `likida/tools.ts:28` | No (`properties: {}`) | Sí — `tools_camino_real.test.ts`, `normas/permiso_politica.test.ts`, `config_tope.test.ts` |
| `estado_viaje` | `likida/tools.ts:90` | No (`properties: {}`) | **NO — cero apariciones en `*.test.ts` de todo `src/`** |
| `cuadrar_viaje` | `likida/tools.ts:133` | No (`properties: {}`) | Sí — `tools_camino_real.test.ts`, `processor_cadena.test.ts`, `cuadre/guardia.test.ts` |
| `guardar_liquidacion` (MUTACIÓN) | `likida/tools.ts:203` | No (`properties: {}`) | Sí — `tools_cierre_en_ceros.test.ts`, `tools_apagado.test.ts`, `tools_cableado.test.ts:112`, `tool_executor_concurrente.test.ts` |
| `kpis_flota`, `acreditables_periodo`, `motor_fiscal`, `viajes_flota`, `liquidaciones_flota`, `serie_gasto`, `serie_liquidado`, `top_rutas`, `duplicados_detectados` | `agents/chat-tools.ts` | No (`properties: {}`) | Sí — `chat-tools.test.ts` (invariante: sin string libre, sin `tenant/flota/empresa/cliente`) |
| `proyectar_serie` | `agents/chat-tools.ts:210` | Sí, pero **acotado**: `serie` y `modo` son `enum` cerrados | Sí — `chat-tools.test.ts` |
| `entregar_respuesta` (terminal) | `agents/analista.ts:196` | Sí — los bloques de la respuesta; filtrados por `validarBloques` + `cifrasRespaldadas` | Indirecto — `analista_prompt.test.ts` (que la nombra) y `analista_guardia.test.ts` (la guardia); el handler no se ejecuta en ninguna prueba |
| `metrica_negocio`, `conteos_plataforma`, `bandeja`, `guardia`, `metrica_norte`, `estado_agentes`, `pipeline_ventas`, `cobranza_saas`, `costo_por_fase_modelo`, `estado_runner`, `adquisicion` | `agents/copiloto-tools.ts` | No (`SIN_PARAMS`) | Sí — `copiloto-tools.test.ts` (las 14 corren y devuelven `pantalla`) |
| `traza_corrida` | `copiloto-tools.ts:199` | **Sí** — `id` libre, pero validado como uuid **antes** de tocar la base (`:217`) | Sí — `copiloto-tools.test.ts` (incluye `'; drop table viaje;--`) |
| `ficha_cliente` | `copiloto-tools.ts:320` | **Sí** — `nombre` string **libre**, decide de qué flota se lee la ficha 360 | Sí — `copiloto-tools.test.ts` (0 y >1 coincidencias) |
| `bitacora` | `copiloto-tools.ts:294` | **Sí** — `filtro` string libre hacia `filtroAccion` | Parcial — se ejecuta con `{}`, el filtro no se ejercita |
| `proponer_accion` | `agents/copiloto.ts:52` | **Sí** — `accion` (enum del catálogo), `objetivo` (libre, 80 chars), `motivo` (libre, 300) | Sí — `copiloto.test.ts`, `copiloto-acciones.test.ts`, `copiloto-intents*.test.ts` |
| `entregar_respuesta_admin` (terminal) | `agents/copiloto.ts:95` | Sí — bloques, filtrados por `validarBloques` | Sí — `copiloto.test.ts` |

**Lectura del inventario.** La regla `properties: {}` sigue intacta donde importa:
**ninguna** tool del ciclo de WhatsApp ni del chat del cliente acepta un dato del
modelo, `tenantId`/`viajeId` salen del `ToolContext` resuelto en servidor, y la
prueba de invariante de `chat-tools.test.ts:105-133` lo fija (string sin `enum` →
falla; nombre de parámetro que huela a `tenant|flota|empresa|cliente` → falla).

Las tools nuevas del copiloto **sí** aceptan datos del modelo, y eso es
defendible (ver abajo). Dos huecos de prueba que sí quedan a la vista en la tabla:
`estado_viaje` —tool de lectura del agente que le habla al chofer, viva desde el
17-ago— **no aparece en un solo `*.test.ts` del repo**, y el handler de la tool
terminal del analista no se ejecuta en ninguna prueba (solo se prueban su prompt y
la guardia que la sigue).

Por qué el parámetro libre del copiloto es defendible: esas tools
viven detrás de `sesionSuperadmin()`, son cross-tenant **a propósito**
(`lib/admin/negocio.ts` es la función con ese permiso), y el `tenantId` del
contexto va vacío a propósito para que nadie lo lea por accidente
(`copiloto.ts:179-183`). Ningún parámetro del modelo cruza una frontera de tenant
que el usuario no tuviera ya. Lo que falta es la **prueba de invariante** del lado
admin: hoy nada impide que la tool 15 llegue con un `tenant: {type:'string'}` y
pase la revisión.

---

## Lo que revisé y está bien

- **La regla estructural, verificada tool por tool**, no asumida: leí los 26
  schemas. La superficie que toca un operador de flota o un contralor no tiene un
  solo parámetro que el modelo pueda llenar.
- **El intent de acciones (`AdminActionIntent`).** El cambio de esta ronda es
  bueno y está bien hecho: el `confirmado: true` del cliente dejó de ser autoridad;
  el intent se ata al `actorId` de la sesión, al `sha256(accion, objetivo)`, a un
  TTL de 2 min y a un consumo **atómico** (el `WHERE` del `UPDATE`, `copiloto-intents.ts:140-149`),
  con `gateo: 'doble'` exigiendo dos POSTs y step-up AAL2 antes de tocar el intent
  (`route.ts:116-123`). El `objetivo` que eligió el modelo se le **enseña a Javier**
  antes de confirmar (`copiloto.tsx:270`) y se re-valida contra `INTERRUPTORES` en
  el ejecutor (`copiloto-acciones.ts:119`). Ejecución sin modelo, como está escrito.
- **La rejilla de mutaciones bajo concurrencia.** `makeExecutor` cachea la
  **promesa** antes del `await` (`tool-executor.ts:157-180`), así que las tool_calls
  paralelas de una misma ronda se enganchan a la misma ejecución; la llave es el
  **nombre** (el efecto), no los args (la llamada), y el fallo no se cachea. Es
  justo la trampa del rubro y está cerrada, con prueba (`tool_executor_concurrente.test.ts`).
- **El fallback nunca re-ejecuta una mutación.** Solo se reintenta la llamada de
  completado (`openrouter.ts:713-741`); las tools corren después, en código propio.
- **La atribución de costo por ronda en `generateWithTools`.** `activeModel` se
  mueve antes de devolver y `acumularCosto` factura cada ronda al precio del modelo
  que la respondió; `costoPorModelo` llega hasta `registrarCosto` y produce una fila
  por modelo real (`processor.ts:2222-2230`, `chat/route.ts:95-100`), con prueba
  (`openrouter_fallback_costo.test.ts`, `processor_cadena.test.ts:372-402`).
- **`costoReal`** prefiere el `cost` del proveedor sobre la tabla, y `calcCost`
  estima un modelo desconocido con la tarifa **más cara** y grita en el log. Un
  modelo sin precio no cuesta $0.
- **El error crudo de Postgres no cruza hacia el modelo** (`tool-executor.ts:92-99`):
  se filtra por vocabulario, el detalle se queda en `logger.error`, y el mensaje de
  negocio deliberado pasa intacto.
- **`modelosAisladosDeFallback()`** con su prueba de cobertura: la trampa de
  "cambiar `LIKIDA_MODEL_*` apaga el plan B en silencio" tiene ahora un centinela.
- **La suite del rubro corre verde**: `npx vitest run src/lib/llm/ src/lib/agents/`
  → 25 archivos, 167 pruebas, 0 fallos.

## Lo que NO alcancé a revisar

- **El tamaño real de lo que vuelve al modelo.** `guardar_liquidacion` devuelve el
  snapshot `liq` completo (`tools.ts:370`) y `bandeja`/`guardia` devuelven títulos
  de escalaciones escritos por terceros. No medí tokens ni audité qué campos
  personales viajan ahí; es frontera con los rubros legal y de privacidad.
- **Inyección indirecta vía resultado de tool.** Los títulos de la bandeja y los
  motivos de los interruptores son texto de humanos que entra al contexto del
  copiloto. La confirmación humana con objetivo a la vista lo contiene, pero no
  construí el caso de prueba.
- **El comportamiento real de `cache_control` cuando el ciclo cruza de Anthropic a
  OpenAI a media conversación** (`openrouter.ts:689-693`: `soportaCache` se decide
  con el modelo primario y el mensaje de sistema ya está armado). El comentario
  afirma que un modelo que no la entienda la ignora; no lo verifiqué contra el
  gateway, y sin red no se puede.
- **`isTransientError` contra mensajes de `SyntaxError` de `JSON.parse`.** El
  filtro de "número suelto" está declarado a propósito en
  `openrouter_transitorio.test.ts:87-91`; no descarté que un fragmento de JSON de
  un ticket con un entero de 500-599 dispare un fallback cross-provider falso.
- **`getFichaCliente` / `ultimasEntradasBitacora` aguas abajo** del parámetro libre
  del modelo (patrón `ilike` con `%` y `_` sin escapar en `copiloto-tools.ts:341`);
  lo miré por encima y no encontré un camino de escritura, pero no seguí la
  consulta hasta el final.
