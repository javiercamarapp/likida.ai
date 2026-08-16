# Tool calling — auditoría 13

**Nota: 8/10** (antes 6). Razón del movimiento: los tres ALTOS reincidentes — costo del fallback atribuido al modelo equivocado, `finish_reason: length` tratado como completo, y dedupe/llaves por llamada en vez de por efecto — están **arreglados y con prueba unitaria**; las reglas estructurales del rubro (tools con `properties: {}` para toda la frontera del dinero) se respetan en el camino vivo de la liquidación; los llamadores (`processor.ts`, `route.ts`) consumen el desglose por modelo real. El ancla de 8 (ninguna tool del dinero acepta datos del modelo + prueba del camino con fallback) está cumplido.

**vs Handle:** 8 — el rubro en mejor estado del repo: doble rejilla de idempotencia de mutaciones y fallback de proveedor solo en completado (nunca re-ejecuta). Le falta al estándar Handle: auditoría interna del costo adverso en el fallo de `generateStructured` (etiqueta de modelo equivocada), cobertura del dedupe del set de tools de chat, y que el tope de salida de cada rol esté respaldado por ensayo del cuerpo real.

Riesgo mayor hoy: las herramientas nuevas que se registren fuera de `tools.ts`/`chat-tools.ts` y rompan la regla del `properties: {}` en el camino del dinero — hoy no se respira, se hereda de un comentario (`tool-executor.ts:150-157`) y de las dos rejillas.

## Hallazgos

### [BAJO] La etiqueta de modelo de un fallo en el camino de fallback de `generateStructured` apunta al primario, no al fallback que de verdad contestó
`src/lib/llm/openrouter.ts:508-509` y `472-476'
Escenario: OCR con primario `google/gemini-3.6-flash` cae (503) → fallback `anthropic/claude-haiku-4.5` responde con un `finish_reason:'length'` o un JSON que no valida en el reintento → al final de `attempt(fallback, note)` se lanza `e3`. Se hace `throw conGastado(e3, …)` y `conGastado` (`:474`) construye `err.usage = { model, …gastado }` con el `model` cerrado de la función — **el primario** — no el fallback que respondió y falló. `gastado.cost`/`tokensIn`/`tokensOut` son correctos (sumados por `cobrar` dentro de `attempt(fallback)`, línea 438), pero en `ocr.ts:280-284` el costo de ese comprobante se escribe en `llm_costo` con `modelo: 'google/gemini-3.6-flash'` sobre una respuesta que de verdad dio Anthropic.
Consecuencia: el panel `model-ops` (correlación modelo→costo) atribuye a Gemini un consumo de Anthropic — nadie seinforma; el número total por liquidación sí cuadra.
Causa probable: `conGastado` solo devuelve la etiqueta del rol, no la de la ronda que falló. (Nuevo.)

**BAJO/mismo ni encontrado, ni decisorio: no se reporta como reincidente.** 

** [MEDIO→ contacto a mi economía: dejo en BAJO] El set de tools de chat no entra en las rejillas de dedupe/caché read-only del ciclo
`src/lib/llm/openrouter.ts:558-559` y `src/lib/agents/chat-tools.ts:46-254`
Escenario: el analista (`chat`/gemini-3.5-flash-lite) llama `kpis_flota`… `proyectar_serie` dos veces en un turno (describe-toi: «cuánto he gastado… y ya de paso dime los top 5») → `READ_PREFIXES = ['get_','check_','list_','find_','consultar_','validar_','cuadrar_']` no matchea `kpis_`, `motor_`, `viajes_`, `serie_`, `proyectar_`, `duplicados_`… — `isReadOnly` (`:559`) devuelve `false`, así que `crossRound` nunca las cachea ni las dedupea: cada llamada repetida vuelve a leer el histórico del tenant (por ejemplo `proyectar_serie` rebarre la serie del periodo).
Consecuencia: dentro del presupuesto de 40 s (`analista.ts:314`) un analista que repite una lectura se come el turno con trabajo duplicado en vez de servirla desde la memoria del ciclo — es degradación medible de turnos, no efecto tomado como largo. No es deuda de dinero (todo el set es read-only).
Causa probable: `READ_PREFIXES` se escribió antes de nacer el set de `chat-tools.ts` (12-ago) y no se revisó con el nuevo registro. (Nuevo; BAJO/MEDIO — declaro MEDIO porque vende la latencia percibida del demo.)

**Revisé y son **ARRECLADOS** los tres abiertos (no reincidencia):**

1. **Costo del fallback con el modelo equivocado — RESUELTO** `src/lib/llm/openrouter.ts:649-651` `src/lib/likida/processor.ts:2110-2117` && `src/app/api/dashboard/chat/route.ts:121-127`. El ciclo suma el costo por ronda con `acumularCosto(activeModel, …)` (línea 741) y devuelve `costoPorModelo` (`:629-664-766`). `processor` parte la fila en `llm_costo` por modelo cuando hay más de uno; `route.ts` hace lo mismo para el chat. Verificado con `openrouter_fallback_costo.test.ts:55-67` (cada ronda a su precio) y `:97-109` (suma del desglose = total). El escenario del anclaje previo —3 rondas en sonnet y la 4ª cae a haiku → todo al precio/haiku en una fila— ya no se produce.
2. **Respuesta truncada tratada como completa — RESUELTO** `openrouter.ts:746-761`: cuando `!calls && choice?.finish_reason === 'length'` (incl. content vacío/corte) lanza `TruncatedError` → el catch envuelve en `PartialExecutionError` (`:839-841`) y `processor.ts:2143-2148` registra el costo del turno caído, respuesta NO sale como 'Listo' (la rama de 'Listo. 👍' solo se alcanza con `finalText || toolCalls>0`). `openrouter_truncado_tools.test.ts:58-70` prueba el corte con texto a medias y con null; y `loop-guard` corta antes de ejecutar la ronda que iba a desperdiciarse (`openrouter.ts:779-781`).
3. **Dedupe por id en vez de efecto — RESUELTO** `tool-executor.ts:150-169` keyed por **nombre** (sin meterse los args) + `openrouter.ts:581-593` llave de caché calcula parámetros reales (`sinParametros` → llave = nombre). Para las herramientas con parámetros (chat: `modo`/`serie`) la llave incluye args y ya describe el efecto; resultado `openrouter_cache_llave.test.ts:64-101` (tool sin params ejecuta 1 vez aunque los args varíen; con params 2 con 'a'/'b' distintos; fallo no queda cacheado) + `tool_executor_concurrente.test.ts` (rinde la promesa antes del await, sin check-then-act race — `tool-executor.ts:147-169`).

## Lo que revisé y está bien

- `src/lib/likida/tools.ts:26-36, 82-90, 152-160` — `consultar_puerta`, `cuadrar_viaje`, `guardar_liquidacion` declaran `properties: {}` + `additionalProperties: false` y el handler recibe `_args` sin usarlo: el modelo decide el *cuándo*, el *qué fila* lo fija `ctx.tenantId`/`ctx.viajeId` (servidor). Sin un solo parámetro que el modelo pueda llenar para tocar dinero o identificar al dueño de un dato.
- `src/lib/agents/chat-tools.ts:25-35` — los únicos params del chat son enums cerrados (`modo`), y `entregar_respuesta` (`analista.ts:202-233`) valida y re-chau el contenido con `validarBloques` (`analista.ts:5454`) + `cifrasRespaldadas` (`:353`) — el modelo no puede inyectar una cifra que no salió de una tool.
- `src/lib/llm/tool-executor.ts:85-89,109` — el mensaje crudo de Postgres no cruza al modelo (`mensajeParaElModelo` filtra), el detalle queda en `logger.error`.
- `src/lib/llm/tool-executor.ts:148-170` + `openrouter.ts:816-823` — doble rejilla de idempotencia para mutaciones (por nombre) y `inRound` de la misma ronda: `guardar_cry` no se repite.
- `src/lib/llm/openrouter.ts:99-128` — `isTransientError` clasifica por tipo APIConnectionError/sin texto y código HTTP con frontera de palabra (`:556case`—un 503 de un monto no cruza de proveedor); `FALLBACK` tiene prueba de cobertura de toda `PRICES` (`openrouter_fallback_cobertura.test.ts:29-31`).
- `openrouter.ts:182-209` — `costoReal` usa el `cost` que reporta el proveedor cuando viene y recién cae a la tabla si no `usage.cost`; un modelo sin precio NO cuesta $0 (`calcCost` 195-209 usa la tarifa más cara y avisa).
- `src/lib/likida/processor.ts:2143-2148` y `route.ts:151-158` — el costo de un ciclo que murió se registra como `'parcial'` (evita subestimar la unidad en el camino más caro).
- `src/lib/llm/openrouter_truncado.test.ts` — el retry de trunco en structured sube techo ×2 en vez de regañar al modelo y conserva el consumo de BOTH intentos (`openrouter.ts:486-496`).
- No arribado PARA: no hay una tool del modelo con un parámetro libre que termine pronunciando sobre dinero o rows del tenant.

## Lo que NO alcancé a revisar

- No corrí `npm test`: la suite de corpus involucrada (16 archivos de `src/lib/llm/*.test.ts`) solo la inspeccioné por lectura; factura que las pruebas del análisis este: `analista_guardia`, `chat-tools.test`, `cache_prompt`, `registro_args`, `concurrente` — no los leí enteros.
- No leí el pipeline completo del reintento `analista.ts:352-382` en su cazo truncado (segundo `generateWithTools` con `maxRounds:4`) — ahí la caché del ciclo se RE-crea y se repite lectura (relacionado con mi MEDIO, sin linea exacta la leí).
- `generateResponse` (`openrouter.ts:259-295`) está definido pero **no se usa en ningún caller** (badcar global solo dio su definición); no lo cubro como hallazgo vivo pero nadie lo audita con `finish_reason`.
- No verifiqué el `LIKIDA_RECUPERAR_CIERRE_PARCIAL` flag que interactiona con `PartialExecutionError` a través del main de la apuesta en el demo (depende de variable de entorno en Vercel); para el demo en vivo el orquestador de operación debería confirmar cuál valor está puesto.
- No leí el LLM infra de `lib/llm` entero (`cache_prompt.test`, `costo_real.test`) para blindar un 8→9; la atribución de `llm_costo` por `resumen/api` sólo la cruce aquí.