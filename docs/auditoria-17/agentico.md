# Sistema agéntico y orquestación — auditoría 17 (pase 6)

**Nota: 3/10** (antes 4). Razón del movimiento: **deuda que cobró factura**. No
es que el código nuevo esté descuidado —la guardia de cifras existe, las tools
no aceptan texto libre, el tope diario falla cerrado ante un error de lectura—,
es que el subsistema que nació el 12–13-ago vuelve a romper **tres lecciones que
este repo ya pagó y dejó escritas**: el techo de tokens que se subió a 4,000
porque 1,200 truncaba de verdad (`openrouter.ts:41-50`), la regla de fallar
cerrado *y decirlo*, y `PartialExecutionError.cost`, que se agregó justo para
que una llamada caída no desapareciera de la contabilidad
(`openrouter.ts:534-545`). El chat del panel las pisa las tres. Además, seis de
los ocho abiertos del pase anterior siguen sin una línea tocada.

**Riesgo mayor hoy:** cuando el analista falla —por cualquiera de sus cinco
caminos: sesión vencida, tope de rondas, truncamiento, 40 s de reloj o el
`maxDuration` de Vercel— `chat.tsx:382-387` **sustituye la respuesta en silencio**
por el respondedor local de palabras clave. El contralor pregunta *"¿por qué
subió mi gasto de diésel esta semana?"* y recibe *"12,450 L elegibles para el
estímulo este periodo"* con su cita de la LIF 2026 Art. 20-A: una cifra real,
fiscalmente enmarcada, contestando una pregunta que nadie hizo, sin una sola
señal de que el agente no respondió.

| Severidad | Nuevos | Reincidentes verificados hoy | Total |
|---|---|---|---|
| CRÍTICO | 1 | 0 | 1 |
| ALTO | 5 | 4 | 9 |
| MEDIO | 5 | 3 | 8 |
| BAJO | 1 | 1 | 2 |

---

## Estado de los abiertos del pase anterior

Re-verificados **abriendo el archivo hoy** (los que no alcancé a reabrir están
listados al final, no aquí):

| # | Pase anterior | Hoy | Evidencia leída hoy |
|---|---|---|---|
| 1 | ALTO — recordatorio por texto libre con la ventana de 24 h cerrada | **REINCIDENTE** | `recordatorio_comprobacion.ts:180` sigue siendo un `sendText` pelón; cero plantillas en el archivo |
| 2 | ALTO — "llevas N días sin mandarme comprobantes" sin mirar comprobantes | **CERRADO** | `recordatorio_comprobacion.ts:108-123`: ahora cruza contra `gasto` con `traerTodo` y filtra `!tienenGasto.has(c.id)` |
| 3 | ALTO — `avisarCierreAlJefe` devuelve `enviado:true` sin haber mandado nada | **REINCIDENTE** | `avisar_cierre.ts:108-136`: con `requiereDecision:false` y `urlPdf` undefined no entra a ninguna de las dos ramas y aun así `logger.info('cierre.avisado_al_jefe')` + `return { enviado: true }` |
| 4 | ALTO — "Listo. 👍" sin mutación | **REINCIDENTE** | `processor.ts:1861`: la condición sigue siendo `res.toolCalls.length > 0`. Ahora lleva un comentario que la defiende ("cuando sí corrieron tools… el efecto ya ocurrió") — falso para `consultar_politica`, que es lectura pura |
| 5 | ALTO — el portón de cifras ciego al signo y al guion | **REINCIDENTE** | corrí el regex de `cuadre/cifras.ts:60` tal como está: `"Diferencia: -1500 a tu favor"` → **false**, `"Tu saldo quedó en -3500"` → **false**, `"Te quedan entre 800-1200 del anticipo"` → **false**, `"Te sobraron 3500 del anticipo"` → true |
| 6 | MEDIO — el claim del recordatorio no re-verifica `estatus` | **REINCIDENTE** | `recordatorio_comprobacion.ts:203-209`: el UPDATE condiciona por `id`, `tenant_id` y `recordatorio_comprobacion_en is null`; el SELECT de `:58` además exige `estatus in ('abierto','en_cuadre')` |
| 7 | MEDIO — le escribe a choferes dados de baja | **REINCIDENTE** | `grep activo` en `recordatorio_comprobacion.ts` y `escalar_viaje.ts` → **cero coincidencias**; `conv.ts:105` sí exige `.eq('activo', true)` |
| 8 | MEDIO — ningún cron anota el costo del WhatsApp que manda | **REINCIDENTE** | `registrarCostoWhatsApp` solo tiene dos llamadores, los dos en `processor.ts` (`:625`, `:2143`); ninguno en los crones |
| 9 | BAJO — el comentario apunta a una pantalla borrada | **REINCIDENTE** | `recordatorio_comprobacion.ts:10` y `:151` siguen citando "Requieren tu atención"; `grep ViajesAtencion src/` no devuelve un solo componente, solo comentarios |

---

## Hallazgos

### [CRÍTICO] Cuando el analista falla, el chat contesta OTRA pregunta con una cifra real y una cita fiscal — y nada dice que falló

`src/app/dashboard/chat.tsx:382-384` (`resp.ok && d && Array.isArray(d.bloques) ? respuestaDeBloques(…) : responder(q, kpis, acred)`, y el mismo `responder(...)` en el `catch` de `:387`), alimentado por `src/app/api/dashboard/chat/route.ts:109-112`; la rama que dispara está en `src/app/dashboard/chat.tsx:106-112`.

**Escenario, con valores.** Flota Transportes Innovativos, `acred.litrosDiesel = 12450`. El contralor escribe: **"¿Por qué subió mi gasto de diésel esta semana?"**. El turno pide `serie_gasto` + `top_rutas` + `serie_liquidado` en una ronda (es lo que el propio prompt le manda hacer, `prompts.ts:47-48`), y el ciclo muere por cualquiera de estos cinco caminos —todos presentes hoy en el código, ninguno hipotético:

1. `LoopGuardError` — `openrouter.ts:774` corta en `round === maxRounds - 1`, así que con `maxToolRounds: 5` (`analista.ts:321`) el modelo tiene **cuatro** rondas útiles, no cinco;
2. `TruncatedError` / argumentos truncados — `maxTokens: 900` (`analista.ts:322`), ver el hallazgo N2;
3. `controller.abort()` a los 40 s (`analista.ts:310`) — `serie_gasto` sola dispara tres `getGastoPorSemana` (5, 13 y **52** semanas, `analytics.ts:436-440`), y `proyectar_serie` los vuelve a disparar;
4. el `maxDuration = 60` de la ruta (`route.ts:28`), que devuelve un 504 de plataforma;
5. sesión vencida a media conversación → 401 en `route.ts:43`.

En los cinco, `resp.ok` es `false`. Entonces `chat.tsx:384` llama `responder("¿Por qué subió mi gasto de diésel esta semana?", kpis, acred)`. Esa función busca palabras clave: la tercera rama (`chat.tsx:106`) matchea `'diésel'` y devuelve **`"12,450 L elegibles para el estímulo este periodo."`** con la tarjeta de cifra y la nota *"LIF 2026, Art. 20-A — el estímulo en pesos lo fija la cuota DOF de cada semana."*. Se pinta exactamente igual que una respuesta buena del agente: mismo bloque, misma tipografía, mismo lugar.

Peor todavía: esa respuesta se guarda en `historial` y en el turno siguiente se manda al servidor como `{ rol: 'asistente', texto: … }` (`chat.tsx:369-372`), así que sus números entran al respaldo de la guardia (`analista.ts:331`) como si el sistema los hubiera producido para esa pregunta.

**Consecuencia.** Es el estado que el ancla del rubro llama "3 o menos": la base dice una cosa y el humano cree otra. El contralor —el comprador— no puede distinguir "el agente no supo" de "el agente contestó mal", porque el producto le enseña lo segundo cuando pasó lo primero. En la sala del demo, una pregunta sobre el gasto contestada con litros del estímulo no se lee como un error de red: se lee como que el producto no entiende de qué le hablan, y se lee **con un artículo de la LIF citado abajo**. Y no queda rastro del lado del cliente: el único log del fallo es el `logger.error('chat.analista.fallo')` del servidor.

**Causa raíz probable.** El respondedor de palabras clave nació como el chat entero y quedó de "paracaídas" (`chat.tsx:348-352`) sin que nadie decidiera qué debe ver el humano cuando el agente muere; un paracaídas que contesta otra pregunta con cifras reales es peor que ninguno.

---

### [ALTO] La respuesta con gráfica no cabe en su propio techo de tokens, y el ciclo no mira el truncamiento cuando cae dentro de una tool

`src/lib/agents/analista.ts:322` (`maxTokens: 900`) y `:363` (lo mismo en el reintento) · `src/lib/llm/openrouter.ts:741-756` (el chequeo de `finish_reason === 'length'` vive SOLO dentro de la rama `if (!calls || calls.length === 0)`) · `src/lib/likida/analytics.ts:421` (`historico: 52`) · `src/lib/agents/chat-tools.ts:169` (`puntos: s.slice(0, 60)`) · `src/lib/agents/analista.ts:101` (`validarBloques` acepta hasta 60 puntos).

**Escenario, con valores.** El contralor pide *"Enséñame la tendencia de lo liquidado, todo el histórico"* — que es la petición para la que se construyó el bloque `serie` y la que el prompt promueve (`prompts.ts:57`). `serie_liquidado` con `modo: 'historico'` devuelve **52 puntos** (52 semanas ISO, `SEMANAS_POR_MODO.historico`), con etiquetas `2026-S32`. Para entregarlos, el modelo tiene que **volver a escribirlos** dentro de los argumentos de `entregar_respuesta`: cada punto es `{"dia":"2026-S32","valor":184320.75}` = 36 caracteres → **1,923 caracteres** solo el arreglo `puntos`, más el bloque `texto` que el contrato exige (`analista.ts:201`) y el andamiaje JSON. Contra eso hay **900 tokens de salida**, compartidos con lo que el modelo piense antes de escribir la primera llave.

Cuando eso corta, hay dos salidas y **las dos terminan igual**:

- si el proveedor devuelve el `tool_call` parcial (lo normal), `calls.length > 0` y el chequeo de `openrouter.ts:748` **no se ejecuta**: el ciclo baja al `Promise.all`, `JSON.parse(call.function.arguments)` truena en `:788`, se le devuelve al modelo `{"error":"argumentos JSON inválidos"}` y se quema una ronda. Con cuatro rondas útiles, dos intentos así son `LoopGuardError`.
- si devuelve `tool_calls` vacío, sale `TruncatedError`.

Los dos se envuelven en `PartialExecutionError` (`openrouter.ts:826-828`), suben sin catch por `ejecutarAnalista`, y aterrizan en el 502 de `route.ts:111` → el CRÍTICO de arriba.

La prueba que cubre el truncamiento (`openrouter_truncado_tools.test.ts:29-32`) construye su respuesta con `tool_calls: []` **siempre**: el caso de truncamiento *dentro* de una tool no está cubierto por nada.

**Consecuencia.** La función bandera del rediseño ("que responda con gráficas, tablas y muy visual", 12-ago) es la que más probablemente cae, y cae hacia el CRÍTICO. Para el equipo que mantenga esto, el síntoma va a ser "a veces el chat contesta cualquier cosa" sin ninguna línea que lo ligue al techo de tokens.

**Causa raíz probable.** `DEFAULT_MAX_TOKENS` se subió a 4,000 **exactamente por esto** y el archivo lo deja escrito (`openrouter.ts:41-50`: "estaba en 1200 y truncaba comprobantes REALES… `max_tokens` es un TECHO, no un cargo: subirlo no cuesta nada si el modelo no lo usa"). El analista lo baja a 900 y lo justifica como anti-quemadura, que es justo lo que ese comentario dice que no es.

---

### [ALTO] El tope diario solo cuenta los turnos que salieron bien — y los que truenan son los caros

`src/app/api/dashboard/chat/route.ts:98-107` (el `registrarCosto` vive **dentro** del `try`, después del `await ejecutarAnalista`) y `:109-112` (el `catch` solo loguea) · `src/lib/agents/analista.ts:312` y `:351` (dos `generateWithTools` sin try/catch propio) · contra `src/lib/likida/processor.ts:1908-1915`, que sí lo hace, y contra `src/lib/llm/openrouter.ts:534-545`, cuyo docstring dice literalmente por qué existe ese campo.

**Escenario, con valores.** El contralor pide la tendencia histórica; el turno muere por LoopGuard en la ronda 4. Antes de morir se pagaron cuatro completions: system (~1,900 tokens) + los 11 esquemas de tools (~1,200) + hasta 12 turnos de historial (2,000 chars c/u, `validacion.ts:20-26`) + los resultados de `serie_gasto` histórico (3 categorías × 52 valores) acumulados ronda a ronda. Entrada sumada del orden de 60,000–90,000 tokens a $0.30/M, más salida a $2.50/M: **~$0.03–0.04 en OpenRouter**. `PartialExecutionError` los trae contados en `.cost`, `.tokensIn` y `.tokensOut`. Nadie los lee. `llm_costo` no recibe **una sola fila**, y la siguiente petición vuelve a leer `gastadoHoy = 0.00` en `route.ts:90`.

Repetir la misma pregunta 100 veces (el usuario solo ve "no supe responder" y reintenta) son **~$3.50 gastados con el contador del tope en cero**. Y es peor que proporcional: el turno que falla cuesta ~8× el turno normal que la ruta usó para calibrar el tope ("a ~$0.005 el análisis medido", `route.ts:32`).

**Consecuencia.** Las tres capas de anti-quemadura que el encabezado de la ruta promete ("pedido explícito: que no implique que si se quedan ahí todo el día quemar un exceso de tokens") no cubren el único caso en que el gasto se dispara. Y para Javier, el "costo por liquidación" —la cifra del modelo de negocio— se subestima justo en las flotas que más rompen el agente.

**Causa raíz probable.** El `registrarCosto` se colocó donde estaba el `return`, no donde está el gasto; `processor.ts` ya resolvió este mismo problema y su comentario lo explica, pero el módulo nuevo no lo heredó.

---

### [ALTO] Los bloques que la guardia YA rechazó resucitan en el segundo intento y se miden contra un respaldo agrandado

`src/lib/agents/analista.ts:194` (`CAPTURAS`, un `Map` por `runId` que **nunca se limpia entre intentos**), `:340`, `:369` (`bloques = CAPTURAS.get(runId) ?? …`) y `:367` (`for (const t of res2.toolCalls) extraerNumeros(t.result, respaldo)` — el respaldo crece **antes** del segundo chequeo de `:382`).

**Escenario, con valores.** Turno 1: el contralor pregunta *"¿cuánto voy a gastar el mes que entra?"*. El modelo llama `kpis_flota`, se salta `proyectar_serie` (justo lo que el prompt le prohíbe, `prompts.ts:42`) y llama `entregar_respuesta` con `[{tipo:'texto', texto:'Vas a gastar unos 45,000 el mes que entra.'}]`. `CAPTURAS` queda con esos bloques. La guardia corre en `:348`: 45000 no está en el respaldo y no es derivable → **bloqueada**, correcto.

Arranca el reintento. El modelo hace lo que el propio comentario de `:344-346` dice que hace a veces: **contesta en texto plano sin llamar la tool terminal**. Pero en el camino sí llama `serie_gasto` con `modo: 'mensual'`, que devuelve entre sus valores `diesel: 28000` y `casetas: 17000`. Esos dos números entran al respaldo en `:367`.

Ahora `:369`: `CAPTURAS.get(runId)` **sigue teniendo los bloques del intento 1** —el rechazado— y gana sobre `res2.finalText`. La revalidación de `:382` corre contra el respaldo ya crecido: `28000 + 17000 = 45000`, `esDerivada` devuelve `true` (`:157`), y **la extrapolación inventada del intento 1 sale a pantalla**, ahora "respaldada" por dos números que el modelo nunca usó para producirla.

**Consecuencia.** Es la regla que define al producto rota por el mecanismo que existe para protegerla, y rota en el caso más caro: una proyección de gasto que el contralor va a llevar a su junta. La única traza es un `chat.reintento_correctivo` en `warn`, que en el log se lee como "el sistema se corrigió solo".

**Causa raíz probable.** `CAPTURAS` se diseñó como canal de salida de un solo uso (un `runId`, una entrega) y el reintento se agregó después reusando el mismo `runId`; falta el borrado antes del segundo intento y falta congelar el respaldo con el que se juzga cada entrega.

---

### [ALTO] Un archivo adjunto de tamaño normal apaga la verificación de derivadas — y condena el turno a la tabla de emergencia

`src/lib/agents/analista.ts:153` (`if (arr.length > 600) return false;`) y `:338` (`if (opts.documento) extraerNumeros(opts.documento.extracto, respaldo)`), con el extracto acotado a 16,000 caracteres en `src/app/api/dashboard/chat/route.ts:76`.

**Escenario, medido, no estimado.** El contralor adjunta el estado de cuenta mensual de su proveedor de diésel en CSV — `fecha,folio,litros,importe`, un renglón por carga. En 16,009 caracteres caben **446 renglones**. Ejecuté `extraerNumeros` sobre ese extracto con el código tal cual: el respaldo queda en **1,369 números**. Como 1,369 > 600, `esDerivada` devuelve `false` **para toda cifra, siempre**, sin evaluar nada.

A partir de ahí, cualquier comparación legítima muere. Con `kpis_flota.montoComprobado = 184320.75` y una carga del archivo de `9013.37`, la frase *"Gastaste 175,307.38 más que en esa carga"* —los dos operandos respaldados, la resta correcta— la guardia la **bloquea** (lo corrí: `{ ok: false, malas: [175307.38] }`). Entonces: reintento completo (segundo ciclo de LLM, costo duplicado), la guardia vuelve a bloquear por la misma razón determinística, y el turno cae a la red de emergencia de `:382-399`, que le enseña al contralor una tabla de campos crudos.

Es decir: **entre más datos trae el usuario, menos puede responder el agente**, y falla igual las 3 veces que lo intente. La función estelar del 13-ago ("lector universal: PDF, Excel, CSV, XML de CFDI") desactiva la capacidad de comparar del analista.

**Consecuencia.** El usuario que sube su Excel —el contralor, el caso de uso completo del commit `d661517`— recibe siempre "No alcancé a redactar el análisis completo" y una tabla de nombres internos, pagando dos ciclos de modelo por cada intento. Y el corte no es visible en ningún lado: no hay log cuando `esDerivada` se apaga por tamaño.

**Causa raíz probable.** El tope de 600 se puso pensando en un respaldo "patológicamente grande" que no llegaría (`:151-153`), antes de que existiera la ruta que mete 16,000 caracteres de números del usuario al mismo Set. Un tope de trabajo que se apaga en silencio se convierte en una regla de negocio distinta.

---

### [ALTO] La guardia de cifras no mira ningún conteo ni porcentaje del 0 al 12 — y los conteos son lo que el contralor cruza contra su pantalla

`src/lib/agents/analista.ts:142` (`const BLANCOS = new Set([...Array.from({length:13},(_,i)=>i), 50, 100])`) y `:178` (`if (BLANCOS.has(n)) continue;`).

**Escenario, con valores.** `kpis_flota` devuelve `{viajesLiquidados: 14, montoComprobado: 184320.75, diferenciaDetectada: 6410.2, conDiferencias: 3, porRevisar: 1, tasaCuadre: 71}`. El contralor pregunta *"¿cuántas liquidaciones tengo por revisar?"*. El modelo contesta **"Tienes 8 liquidaciones por revisar"**. Ejecuté la guardia con ese respaldo exacto: **PASA** (8 ∈ BLANCOS). Lo real es 1, y el 1 está en la misma pantalla, en el KPI del Resumen, tres centímetros arriba.

Lo mismo con *"tus 12 operadores"*, *"7 viajes abiertos"* o *"el diésel es el 42% del gasto"* (este último ni siquiera necesita la lista blanca: pasó por `esDerivada`). Medí la porosidad con un respaldo realista de 25 números (dos tools + la pregunta + la fecha): de los enteros del 1 al 300 —el rango donde viven conteos, porcentajes y tasas—, **el 41.7% pasa la guardia**. Para contraste, en el rango de montos (1,000 a 60,000) solo pasa el 0.6%: la guardia es sólida donde el comentario dice que quiso serlo, y ciega justo donde no lo pensó.

**Intenté refutarlo.** El comentario de `:138-141` declara el trade-off a la vista, y `analista_guardia.test.ts:56-58` lo fija con una prueba ("conteos chicos y 50/100 no bloquean"). Pero lo que ese comentario razona es sobre **montos** ("un monto inventado de $7.00 pasaría; uno de $7,000 no") — el caso del conteo no aparece ni en el comentario ni en la prueba, y un conteo *siempre* es un entero chico. La lista blanca no está calibrada para el riesgo que de verdad tiene: el número que el contralor puede desmentir de un vistazo.

**Consecuencia.** "Nunca inventar una cifra" es la regla que define al producto, y el conteo de liquidaciones por revisar es la cifra más fácil de contradecir en la sala: el chat dice 8, el KPI de arriba dice 1. No hace falta un contador para cacharlo.

**Causa raíz probable.** La lista blanca se calibró por magnitud (los enteros chicos "no delatan invención") cuando el eje que importa es el **rol** de la cifra: un conteo de entidades del negocio no es lo mismo que un "te muestro 3 rutas".

---

### [ALTO] La sonda de OCR del mismo chat gasta modelo de visión sin tope, sin límite de tasa y sin registrar un peso

`src/app/api/dashboard/ingesta/route.ts:50` (`extraerComprobante(imagen, …)`) y `:52-56` (el costo solo se **loguea**: `costoUsd: r.costo.costoUsd`; no hay una sola llamada a `registrarCosto` en el archivo), contra `src/app/api/dashboard/chat/route.ts:80-96` (el tope diario) y `src/app/api/export/liquidaciones/route.ts:18` / `src/app/api/demo/route.ts:31` (las rutas que sí llevan `rateLimit`).

**Escenario, con valores.** El clip del chat ofrece tres vías y dos de ellas ("tomar foto" / "subir imágenes") terminan aquí (`chat.tsx:273`). El contralor arrastra los 40 tickets del viaje para "ver qué lee el motor". Son 40 llamadas de visión al modelo `ocr`, que por defecto es `google/gemini-3.6-flash` — **$0.0188 por comprobante medidos por este mismo repo** (`models.ts:35-38`): **$0.75 en una tarde**. Ni una fila en `llm_costo`, ni un tope diario, ni un `rateLimit`, ni un `maxDuration` que lo estorbe (60 s por imagen). Puede repetirlo indefinidamente; la única capa que existe es el rol.

**Intenté refutarlo.** El encabezado del archivo dice "NO ESCRIBE NADA: ni gasto, ni foto, ni costo por liquidación", así que la omisión parece deliberada. Pero lo deliberado es no **atribuirlo a una liquidación**; el dinero en OpenRouter se gastó igual, y el efecto es que la ruta más cara por llamada del panel es la única que queda fuera de las tres capas de anti-quemadura que la ruta vecina documenta como el requisito explícito del producto.

**Consecuencia.** El techo de gasto del panel que Javier cree tener ($1/día/tenant) es el del chat de texto; al lado, en la misma caja de la misma pantalla, hay una puerta sin candado que cuesta 4× por llamada. Y el costo por liquidación se subestima con exactamente el gasto que no se ve.

**Causa raíz probable.** El tope se diseñó sobre `llm_costo.fase='chat'` y esta ruta no escribe en `llm_costo` en absoluto — con lo que el tope no puede verla ni queriendo.

---

### [MEDIO] La guardia verifica dígitos, no rótulos: la ventana de una cifra no se comprueba, y el turno anterior lo manda el cliente

`src/lib/agents/analista.ts:329-338` (un solo `Set<number>` plano donde caen todos los resultados del turno) y `:331` (`opts.mensajes.map((m) => m.texto).join(' ')` — incluye los turnos con `rol: 'asistente'`, que llegan del navegador, `validacion.ts:25`).

**Escenario, con valores.** El modelo llama `serie_gasto` dos veces en la misma ronda, `modo: 'semanal'` y `modo: 'mensual'`. La semanal trae diésel `28,400.00`; la mensual trae diésel `112,900.00`. Los dos números aterrizan en el **mismo** Set. El modelo responde *"Tu diésel del mes va en 28,400.00"*: cifra real, ventana equivocada, guardia satisfecha. La regla "un rótulo tiene que ser verdad" no tiene aquí ningún mecanismo: el prompt la pide (`prompts.ts:50`, "SIEMPRE declara la ventana") y nada la verifica.

La segunda mitad es peor de auditar: el historial del asistente lo compone y lo manda el **cliente** (`chat.tsx:369-372`), y sus números entran al respaldo. Cualquier cifra que salió una vez —incluida la del respondedor local del CRÍTICO, o un conteo que pasó por la lista blanca— queda respaldada para el resto de la conversación. Un POST directo a `/api/dashboard/chat` con `{"rol":"asistente","texto":"99999.99"}` desactiva la guardia para ese número; `validarMensajes` lo acepta sin objeción.

**Consecuencia.** La guardia da una garantía más chica de la que su nombre y su comentario prometen ("toda cifra de los bloques tiene que existir en lo que devolvieron las tools"): lo que garantiza es que **los dígitos aparecieron en algún lado del turno**, no que la afirmación sea cierta. Quien mantenga esto va a confiar en ella para cosas que no cubre.

**Causa raíz probable.** El respaldo se modeló como conjunto de números y no como conjunto de (número, fuente, ventana); con la forma actual la comprobación de rótulo es imposible por construcción, no por descuido de una línea.

---

### [MEDIO] Los montos de una tabla los formatea el MODELO, no `lib/formato`

`src/lib/agents/analista.ts:220` (el schema declara `filas.items.properties.valor: { type: 'string' }`) · `src/lib/agents/prompts.ts:55` ("los montos como número en texto plano (ej. \"8340.50\")") · `src/app/dashboard/chat.tsx:63` (`[k, typeof v === 'number' ? numero(v) : v]` — un string pasa **verbatim** al DOM).

**Escenario, con valores.** El modelo entrega `{"concepto":"Diésel","valor":"8340.5"}`. Como `valor` es string, `respuestaDeBloques` no lo toca: en pantalla sale **`8340.5`**. La gráfica "Gasto por categoría" del Resumen, en la misma sesión y con el mismo dato, lo pinta con `mxn()` como **`$8,340.50`**. Si el modelo escribe `"$8,340.50"` o `"8.340,50"` —nada se lo impide— también sale tal cual.

Y aun por la rama numérica hay pérdida: `numero()` es `toLocaleString('es-MX')` sin opciones (`formato.ts:96-98`), así que un monto en una tabla nunca lleva `$` y `8340.5` no se rellena a dos decimales.

**Intenté refutarlo.** La prueba que protege la regla ("el formato de cifras vive solo en `lib/formato.ts`") escanea **archivos fuente** buscando `toLocaleString('es-MX')`. El modelo no es un archivo fuente: la regla queda intacta en el repo y rota en la pantalla.

**Consecuencia.** "Una cifra fiscal que se lee distinto en dos pantallas se lee como dos cálculos" — y aquí son dos lecturas del mismo dato en la misma pantalla, a un scroll de distancia. El prompt además se contradice consigo mismo: `:55` pide texto plano y `:58` dice "los montos en los bloques van como números crudos (la interfaz los formatea)".

**Causa raíz probable.** El schema pidió `string` en `valor` para admitir filas mixtas (concepto/valor de texto) y con eso le entregó el formato al modelo.

---

### [MEDIO] La red de emergencia le enseña al contralor nombres internos de campo y cifras sin unidad

`src/lib/agents/analista.ts:386-395` (`Object.entries(primera.result)` → `[k, v]` tal cual como filas) y el texto de `:393`.

**Escenario, con valores.** La guardia bloquea (por cualquiera de los caminos de arriba) y `kpis_flota` sí corrió. Se arma la tabla directo del objeto: el contralor ve, bajo la frase *"esto es exactamente lo que el sistema leyó"*, las filas

```
moneda               MXN
viajesLiquidados     14
montoComprobado      184,320.75
diferenciaDetectada  6,410.2
conDiferencias       3
porRevisar           1
tasaCuadre           71
```

`montoComprobado` sin `$` (pasa por `numero()`, no por `mxn()`), `diferenciaDetectada` con **un** decimal, y `tasaCuadre` en `71` sin `%` — indistinguible de un conteo, pegado a otros conteos.

**Consecuencia.** La frase promete máxima honestidad ("exactamente lo que el sistema leyó") y entrega lo contrario: la cifra que más importa sale sin su unidad y con el nombre de la propiedad de TypeScript. Un `71` que el contralor lea como pesos o como viajes es un error suyo causado por el producto. Y es el camino que más se ejecuta, porque es donde caen todos los bloqueos de la guardia.

**Causa raíz probable.** La red se construyó desde el objeto de la tool en vez de desde un mapa de etiquetas; no existe una traducción de campo a rótulo para este set de tools.

---

### [MEDIO] La caché entre rondas está muerta para las once tools nuevas: el ciclo repite el trabajo pesado

`src/lib/llm/openrouter.ts:558-559` (`READ_PREFIXES = ['get_','check_','list_','find_','consultar_','validar_','cuadrar_']`, `isReadOnly = n => READ_PREFIXES.some(p => n.startsWith(p))`) contra los nombres de `src/lib/agents/chat-tools.ts`: `kpis_flota`, `acreditables_periodo`, `motor_fiscal`, `viajes_flota`, `liquidaciones_flota`, `serie_gasto`, `serie_liquidado`, `top_rutas`, `duplicados_detectados`, `proyectar_serie`, y `entregar_respuesta`. **Ninguno matchea un solo prefijo.**

**Escenario, con valores.** `crossRound` (`openrouter.ts:794` y `:818`) solo se consulta y se llena si `isReadOnly(name)`, así que para este set **nunca**. El modelo llama `kpis_flota` en la ronda 0 y otra vez en la ronda 2 para "confirmar" antes de entregar: `getKpis` corre dos veces enteras, y `getKpis` es un `traerTodo` paginado sobre **todas** las liquidaciones del tenant (`analytics.ts:184-193`). Con 3,000 liquidaciones son 3 páginas × 2 = 6 viajes a la base donde debía haber 3, dentro de un turno acotado a 40 s.

Lo mismo entre tools distintas por diseño: `serie_gasto` y `proyectar_serie` llaman ambas `getGastoPorSemanaSeries`, que dispara `getGastoPorSemana` para 5, 13 **y 52** semanas (`analytics.ts:436-440`). Un turno de "cuánto voy a gastar" hace **seis** barridos del `gasto` del tenant.

**Consecuencia.** El presupuesto de 40 s se consume en lecturas repetidas y el turno se acerca al `abort` que produce el CRÍTICO. La rejilla existe, está probada y documentada (`llaveDeCache`, `openrouter.ts:561-580`, con su medición "3 ejecuciones, 0 aciertos") y quedó inerte por una convención de nombres que el subsistema nuevo no conocía.

**Causa raíz probable.** La pertenencia a "solo lectura" se decide por el **prefijo del nombre** y no por una propiedad declarada en `registerTool` (que ya tiene `isMutation`); un archivo nuevo con otro estilo de nombres apaga la rejilla sin error y sin log — el mismo modo de falla que `FALLBACK` documenta en `openrouter.ts:55-62`.

---

### [MEDIO] El tope diario es leer-y-luego-gastar, sin reserva y sin límite de tasa en la ruta

`src/app/api/dashboard/chat/route.ts:80-96` (se lee `gastadoHoy` y se decide) y `:98-107` (el gasto se escribe **después** de que el turno terminó). No hay `rateLimit` en el archivo; `src/proxy.ts:198` excluye `/api` del matcher, así que esta ruta no tiene ninguna otra capa de tasa.

**Escenario, con valores.** Tope $1.00, `gastadoHoy = $0.00`. Se disparan 30 POST en paralelo (un script, o simplemente 30 pestañas: el `ocupado` que serializa las peticiones vive en el cliente, `chat.tsx:347`). Los 30 leen `$0.00` en `:90`, los 30 pasan el `if` de `:91`, y los 30 corren. A ~$0.04 el turno pesado son **$1.20 en una sola ráfaga**, con el tope "respetado" en cada una de las 30 decisiones.

**Consecuencia.** El tope acota el uso honesto, no el abuso ni el bucle — que es lo que su comentario dice que atrapa ("el candado sigue atrapando bucles y curiosos", `route.ts:35`). Combinado con el hallazgo del costo no registrado, el rebase no es de una ráfaga: es permanente.

**Causa raíz probable.** Comprobar-y-actuar sin reserva; no hay fila que escriba el gasto *antes* del turno para que la siguiente petición la vea.

---

### [BAJO] El orquestador entero no tiene una sola prueba

`src/lib/agents/analista.ts:262-415` (`ejecutarAnalista`) — `grep ejecutarAnalista src/**/*.test.ts` no devuelve nada; `analista_guardia.test.ts` prueba las cuatro funciones **puras** (`extraerNumeros`, `esDerivada`, `cifrasRespaldadas`, `validarBloques`) y `analista_prompt.test.ts` prueba cadenas del prompt.

Sin arnés quedan: el reintento correctivo, la reutilización de `CAPTURAS`, la red de emergencia, la fusión de `costoPorModelo`, el `abort` de 40 s y todo `route.ts` salvo `validacion.ts`. Es la razón de que los tres ALTO de arriba (`CAPTURAS` stale, costo no registrado, `esDerivada` apagada) puedan estar en `master` con la suite en verde: **corrí `npx vitest run src/lib/agents/ src/app/api/dashboard/chat/ src/lib/llm/` → 20 archivos, 99 pruebas, todas verdes**, y ninguna toca un solo camino de los que fallan.

---

## Lo que revisé y está bien

- **La regla estructural de las tools se respeta en las once nuevas.** `chat-tools.ts:25` (`SIN_PARAMS`) y `:28-35` (`PARAM_MODO`, enum cerrado de tres valores): ninguna tool acepta texto libre, ningún parámetro decide de qué flota se lee, y `ctx.tenantId` sale del servidor (`analista.ts:277`). El modelo decide *cuándo*, nunca *con qué datos*. `modoDe` (`:38-41`) cae a `'semanal'` ante cualquier basura en vez de romperse.
- **No hay fuga entre flotas en el prompt.** Lo único del tenant que viaja al modelo es `nombreFlota` (leído por `id` en `route.ts:62-64`), el nombre y rol del usuario **de la sesión** (`route.ts:99`, y el comentario de `analista.ts:266-267` lo exige explícitamente), y los resultados de tools ya filtrados por `ctx.tenantId`. El `?tenant=` solo lo honra un superadmin y solo si la fila existe (`route.ts:56-60`). Revisé además que el registro global de tools no filtre: `toolSchemas` selecciona por nombre y los únicos tres llamadores (`run.ts:38`, `analista.ts:316`, `:360`) pasan listas explícitas — importar `chat-tools` no le da al agente de WhatsApp ni una tool de flota.
- **El bucle termina, siempre.** `openrouter.ts:726` es un `for` acotado por `maxRounds`; `:774` corta **antes** de pagar la última ronda (con su razón escrita) y `:825` lanza `LoopGuardError` si el `for` se agota. Una tool que no existe no cuelga nada: `executeTool` (`tool-executor.ts:99-101`) devuelve `tool desconocida: X` como resultado y el ciclo sigue. Una tool que truena tampoco: `:105-116` la captura y filtra el vocabulario de Postgres antes de que el modelo lo lea. Repetir la misma tool **dentro de una ronda** sí está dedupeado (`inRound`, `openrouter.ts:810-811`); entre rondas no, y eso es el hallazgo N10.
- **El reloj del turno está bien cableado.** Un solo `AbortController` (`analista.ts:309`) cubre el primer ciclo **y** el reintento (`:365`), y el `finally` de `:411-414` siempre limpia el timer. Verifiqué que un abort no dispare el fallback: `APIUserAbortError` no matchea `isTransientError` (`openrouter.ts:106-127`) ni por nombre, ni por status, ni por texto — no hay doble cobro por cancelación.
- **El fallback del rol `chat` existe de verdad.** `chat` → `google/gemini-3.5-flash-lite` (`models.ts:56`) → `openai/gpt-5.6-luna` (`openrouter.ts:65`), cruce de proveedor, y el destino tiene precio en `PRICES` (`:148`). El costo se acumula **por ronda y por modelo real** (`openrouter.ts:734-736`), y `route.ts:102-107` escribe una fila por modelo — el ciclo mixto no se le atribuye entero al último. `openrouter_fallback_cobertura.test.ts` vigila los modelos aislados.
- **La atribución de fase del tope es correcta.** `faseDeModelo(modelo,'chat')` solo se desvía a `'escalacion'` con un slug que contenga `opus`, que no está en esta cadena. Verifiqué además que `'chat'` sea un valor legal del dominio: `llm_costo_fase_dominio` lo incluye (`0025_dominios_check.sql:146-147`), así que las filas entran; y que **ninguna otra ruta escriba `fase:'chat'`** — el tope del panel no se contamina con el gasto de WhatsApp.
- **El tope diario falla cerrado ante un error de lectura** (`route.ts:86-89`): si no puede leer el gasto del día, no gasta, y lo dice en pantalla. Es la regla de `CLAUDE.md` aplicada bien. `inicioDiaMxIso` corta a medianoche de México, no UTC (`validacion.ts:7-11`).
- **Refuté que el `encargado` pudiera hablar con el analista.** `puedeVerArea(rol,'dinero')` (`route.ts:44`) y `visibilidad.ts:36-45`: `encargado: ['operacion']` → 403. Solo `flota_admin`, `contador` y `superadmin` llegan al modelo, que es lo correcto para una tool que lee dinero de toda la flota.
- **`validarMensajes` es una frontera de verdad** (`validacion.ts:18-29`): 12 turnos, 2,000 chars, y exige que el último hable el usuario; cualquier otra forma es 400, no "se intenta". El documento se re-recorta en servidor aunque `/archivo` ya lo haya acotado (`route.ts:74-77`).
- **`validarBloques` no confía en la forma** y su tolerancia está justificada y probada (`analista.ts:50-112`, `analista_guardia.test.ts:98-112`): rescata lo válido, recorta la tabla a 10 filas, y devuelve `null` solo si nada sobrevivió. Un `{tipo:'html'}` no cruza.
- **`proyectarPuntos` es determinística y declara su supuesto** (`chat-tools.ts:192-208`): sin datos devuelve `{sinDatos:true}` en vez de proyectar ceros con cara de pronóstico — la regla del producto aplicada al pie. La proyección la calcula código, no el modelo.
- **`registrarCosto` no puede tumbar una respuesta buena**: es best-effort y nunca lanza (`costos.ts:115-145`), así que un fallo al escribir el costo no convierte un turno exitoso en el 502 del CRÍTICO.
- **El arreglo del recordatorio (ALTO #2 del pase anterior) está bien hecho**, no solo hecho: cruza contra `gasto` con `traerTodo` —que pagina hasta *probar* que trajo todo y lanza si no puede demostrarlo— en vez de con un `.in()` recortable (`recordatorio_comprobacion.ts:104-123`). Es la corrección correcta, con el guardarraíl correcto.

## Lo que NO alcancé a revisar

- **No re-abrí seis de los abiertos del pase anterior**, por la prioridad explícita de este pase sobre el subsistema nuevo: el presupuesto del webhook (`processor.ts:351`), el cron de facturación que responde 200 con el lote sin correr, el reloj de 300 s heredado por el callback de QStash, el flag `LIKIDA_RECUPERAR_CIERRE_PARCIAL` (renombrado desde `CUADRA_…`, sigue default-off en `processor.ts:1899`), la falta de reloj en el cron `escalar`, y el turno del recordatorio que no queda en `wa_conversacion`. **Se cuentan como abiertos, no como verificados**, y no los sumé a la tabla de severidades.
- **No pude ejercitar el agente contra un modelo real** (regla dura del pase: nada que llame a OpenRouter). Todo lo que afirmo sobre la guardia, `esDerivada`, la lista blanca y el tamaño del respaldo lo **ejecuté** con el código copiado verbatim de `analista.ts:118-187`, y los números que cito son salidas medidas. Lo que **no** medí es el conteo exacto de tokens del hallazgo N2: cité caracteres (1,923 para 52 puntos) y el precedente medido del propio repo (`openrouter.ts:41-45`), no un tokenizador. El hallazgo no depende de ese número —las cinco rutas al 502 del CRÍTICO son independientes—, pero el margen exacto contra los 900 sí.
- **No sé si `google/gemini-3.5-flash-lite` emite tokens de razonamiento contra `max_tokens`.** Si los emite, el margen de N2 no es marginal: es negativo siempre. Es la primera medición que yo haría con una llamada real.
- **No recorrí el lector de archivos** (`intake/archivo.ts`) ni `/api/dashboard/archivo` más allá de dónde entra su extracto al respaldo y al prompt. Es otra frontera de confianza nueva y merece su propio recorrido.
- **No recorrí el cron `purgar` ni el ciclo de acuses** (`acuse_ticket.ts`, `rafaga.ts`): siguen siendo estado en memoria del proceso, que en serverless se pierde entre invocaciones. Es la misma deuda que quedó abierta en los pases 1 y 2.
