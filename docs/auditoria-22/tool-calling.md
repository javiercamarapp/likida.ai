# Tool calling — auditoría 22

**Nota: 6/10** (antes: s/d). Razón: línea base nueva, sin ancla previa legible
(`.gitignore` deja la ronda 21 fuera de este clon). El 6 es el "correcto donde
importa, sin red en la periferia" de la escala: la regla estructural que define
el rubro se cumple —ninguna tool de dinero ni la única mutación aceptan un dato
del modelo, `tenantId`/`viajeId` salen del contexto de servidor, la idempotencia
de mutación tiene claim durable + fencing + lease con techo, y el loop-guard
corta ANTES de pagar la ronda—; lo que baja la nota no es el centro sino los
bordes: una tool que el prompt manda llamar en el turno más común del producto y
cuyo resultado la guardia tira siempre, y un veto de emisión de CFDI que se
sostiene en cuatro verbos.

**Riesgo mayor hoy:** el mensaje más frecuente del chofer ("hola") produce una
respuesta construida con `estado_viaje` que `guardiaCifras` descarta y sustituye
por un cuadre completo — al chofer se le contesta "Sobró $2,660 del anticipo (a
favor de la empresa)" con el viaje abierto y sin que nadie se entere del cambio.

## Hallazgos

### [ALTO] `estado_viaje` no existe para la guardia de cifras: su respuesta se descarta SIEMPRE

`src/lib/likida/cuadre/guardia.ts:39` · `src/lib/likida/cuadre/guardia.ts:84`
· `src/lib/likida/cuadre/guardia.ts:116` · `src/lib/agents/prompts.ts:79`
· `src/lib/likida/tools.ts:91`

`guardiaCifras` sólo reconoce tres tools: `cuadrar_viaje` y `guardar_liquidacion`
(`cuadro`, :39) y `consultar_politica` (`consultoPolitica`, :53). `estado_viaje`
—registrada el 17-ago-2026 y presente en el registro del agente
(`agents/registry.ts:16`)— no aparece en ninguna de las tres listas.

Escenario, con valores. Viaje abierto, anticipo $5,000, tres comprobantes por
$2,340. El chofer escribe **"hola"**. `prompts.ts:79` es explícito: *"MENSAJE
ABIERTO = LLAMA `estado_viaje` ANTES DE CONTESTAR … ÁBRELE con los números"*. El
modelo llama `estado_viaje`, recibe `{comprobado: 2340, anticipo: 5000,
por_concepto:[{diesel, 1800, 2}, …]}` y contesta *"Llevas 3 comprobantes por
$2,340.00 de tu anticipo de $5,000.00; en diésel van $1,800.00."*

Entonces, en `guardia.ts`:
- `cuadro` = false (no corrió `cuadrar_viaje` ni `guardar_liquidacion`),
- `tieneCifrasDeDinero(reply)` = true (`DINERO_EXPLICITO` casa `$2,340` en la
  primera línea de `cifras.ts:79`, sin pasar por el troceo en cláusulas),
- el bloque de cotejo de :89 **no corre** (exige `consultoPolitica`),
- se cae directo al `try` de :113: `cuadrarDesdeDB()` y
  `resumenCuadre(liq, false, 'operador')` (:116).

Sale: *"Este es el cuadre de tu viaje 👇 · Comprobado: $2,340.00 · Anticipo:
$5,000.00 · **Sobró $2,660.00 del anticipo (a favor de la empresa)**"* — en
respuesta a "hola", con el viaje `abierto` y el fajo todavía en la mano del
chofer. La pregunta que hizo (o el saludo) nunca se contesta, y el desglose por
concepto y los litros de diésel —lo único que `estado_viaje` sabe dar y el
resumen determinístico no— se pierden en cada turno.

Consecuencia: **el chofer** lee, a mitad del viaje, la frase que más le importa
("a favor de la empresa") como si el viaje ya hubiera cerrado, y deja de mandar
comprobantes. **Quien mantiene esto** tiene una tool completa, documentada y
prompteada que es inalcanzable por construcción: se paga el turno del modelo, se
pagan las 2 consultas de `estado_viaje` y encima las 3 de `cuadrarDesdeDB`, y la
premisa escrita en `tools.ts:89` ("sin correr el cuadre completo") es falsa. Y es
silencioso: `logger.warn('agent.cifras_forzadas')` en `processor.ts:3523` se ve
igual que el caso legítimo.

Causa raíz probable: la tool se agregó el 17-ago y la guardia —escrita antes— no
se amplió; el único camino que preserva el texto del modelo (`:89`) se llavea con
`consultar_politica`, no con "hubo alguna tool de lectura que respalde".

### [ALTO] El veto de emisión del piloto de visión es un regex de cuatro verbos

`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:129` ·
`src/lib/likida/facturacion/adaptadores/piloto_vision.ts:342-346`

La regla 1 del archivo (`:33-40`) promete *"doble guarda: el modelo declara
`esBotonQueEmite` Y el piloto veta por texto del botón; cualquiera de las dos
detiene"*. La segunda guarda es
`HUELE_A_EMITIR = /emitir|generar|timbrar|facturar|crear\s*(mi\s*)?(cfdi|factura)/i`
aplicada a `boton?.texto` y al selector.

Escenario, con valores. Portal con el botón final
`<button id="btnAceptar">Aceptar</button>` (o "Continuar" / "Enviar" /
"Confirmar" / "Obtener factura" — etiquetas que el propio recon del catálogo
registra: `comercios.ts:1855` documenta el flujo de Home Depot como *"Dos campos
únicamente antes de «Continuar»"*, y `comercios.ts:2388` el de Walmart como
*"enlace «Obtener factura»"*). El modelo devuelve
`{tipo:'clic', selector:'#btnAceptar', esBotonQueEmite:false, veo:'falta
confirmar los datos'}`.

- `selectorDelInventario('#btnAceptar', inv)` → true (el id existe).
- `boton.texto` = `"Aceptar"` → `HUELE_A_EMITIR` no casa.
- `HUELE_A_EMITIR.test('#btnAceptar')` → no casa.
- → `pagina.hacerClic('#btnAceptar')` (`:347`).

Queda un CFDI timbrado ante el SAT, irreversible, emitido por un modelo de visión
en un portal que nadie mapeó. Y el retorno es peor que el clic: `volar` sale por
`:284-292` con `ok: llenoAlgo` y **sin `cfdiUuid`**, así que `agente.ts:338`
(`incluido: r.ok && (modo === 'ensayo' || Boolean(r.cfdiUuid))`) lo reporta como
"habría quedado" — nada aguas abajo registra que el CFDI existe, el gasto sigue
en la cola de por-facturar y el contralor lo vuelve a facturar: **CFDI duplicado**.

Consecuencia: **la flota** queda con un CFDI que no pidió y, después, con dos por
el mismo ticket; **el contralor** no tiene manera de enterarse desde Likida. Y el
único candado que quedó en pie es el `esBotonQueEmite` que declara el propio
modelo — exactamente lo que el archivo prohíbe tres párrafos antes.

Segundo defecto en la misma línea, más chico pero del mismo tipo: `:342` empareja
el botón con `a.selector.includes(b.id)`, así que un botón con id **prefijo** de
otro (`#buscar` frente a `#buscarYGenerar`) devuelve el botón equivocado y la
guarda de texto termina revisando la etiqueta de otro control.

Atenuante honesto: el camino está detrás de `FACTURACION_PILOTO=si`
(`registro.ts:331`) y hoy no hay clientes. Es una bomba armada, no una que ya
haya sonado — pero el disparador es una variable de entorno.

### [MEDIO] El reparto de áreas del MCP le niega `search`/`fetch` al contador — la persona que sí ve el dinero

`src/lib/mcp/herramientas/busqueda.ts:62` ·
`src/lib/mcp/herramientas/busqueda.ts:112` ·
`src/lib/mcp/credencial.ts:68` vs `src/lib/mcp/credencial.ts:89` ·
`src/lib/auth/visibilidad.ts:44` · `src/app/api/v1/_comun.ts:181`

Las dos herramientas que ChatGPT **exige** por nombre (`search` y `fetch`) están
declaradas en área `operacion`. Un token OAuth resuelve su alcance con
`puedeVerArea(rol, area)` (`credencial.ts:68`), y `AREAS_POR_ROL.contador =
['dinero']` (`visibilidad.ts:44`): el contador **no** alcanza `operacion`.

Escenario, con valores. El contralor de la flota (rol `contador`) conecta Likida
en ChatGPT por OAuth y escribe "búscame el viaje F-0123". ChatGPT llama
`search({query:"F-0123"})` → `despacharHerramienta` (`herramientas.ts:82`) →
`alcanza('operacion')` = false → `{content:[{text:'Tu acceso no tiene esta parte
de la flota al alcance.'}], isError:true}`. Igual `fetch`. En cambio
`cuadre_viaje({viaje:"F-0123"})` —área `dinero`— sí le contesta con ingreso del
flete, contribución, margen, saldo por cobrar y días de vencido.

O sea: se le niega la herramienta que **no enseña un peso** (folio, ruta,
estatus) y se le concede la que enseña **todos**. Y `fetch` ya trae el degradado
para credenciales sin `dinero` (`busqueda.ts:87-95`) — prueba de que se diseñó
para servir a las dos clases de credencial; la reja exterior de `area:'operacion'`
hace que una credencial de sólo-dinero nunca llegue a ese código.

La asimetría se ve mejor comparándola con el otro camino: una llave de API
`lk_live_` con área `dinero` **sí** alcanza `operacion`
(`_comun.ts:181`: `if (areaLlave === 'dinero') return pedida === 'dinero' ||
pedida === 'operacion'`), así que la llave hace lo que la persona no puede.

Consecuencia: **el contralor** —el comprador— conecta el producto a ChatGPT y la
integración le falla en su primera pregunta. Y cada intento escribe un
`registrarEventoSeguridad({tipo:'acceso_denegado'})` (`api/mcp/route.ts:102`), así
que el uso normal del comprador contamina el feed de seguridad con falsos
positivos.

Causa raíz probable: el área se asignó por "qué dato devuelve la pantalla"
(`visibilidad.ts`, pensado para /dashboard), y `search`/`fetch` no son una
pantalla sino el índice que precede a cualquier pregunta, de la clase que sea.

### [MEDIO] `generateWithTools` cobra la reserva completa ante un error de red; sus dos hermanas hacen lo contrario

`src/lib/llm/openrouter.ts:996-1004` (frente a `:408-417` en `generateResponse` y
`:626-632` en `generateStructured`)

Cuando la llamada al proveedor falla, el ciclo de tools liquida la reserva a
`reservation.amountUsd` —la cota conservadora, no lo gastado— y esa fila queda
liquidada contra el tope diario del tenant. Las otras dos funciones del MISMO
archivo hacen explícitamente lo contrario, con el motivo escrito
(BACKEND-19C2-1, `:408-414`): dejar la fila en `reservado` para que la 0193
(`expira_en`) la excluya sola del tope.

Escenario, con valores. Turno de cuadre, rol `cuadre` → `anthropic/claude-sonnet-5`
($2/$10 por 1M). `cotaEntradaEnTokens(convo) + JSON.stringify(tools).length`
≈ 12,000 y `max_tokens` = 4,000 (`run.ts:35`), así que
`calcCost` = (12,000×2 + 4,000×10)/1e6 = **$0.064** por reserva. OpenRouter
devuelve 503; `completion` liquida $0.064; `complete` cae al fallback
(`gpt-5.6-terra`) y ése también falla → otros ~$0.06. Dos llamadas muertas,
~$0.13 del techo diario de $5.00 (`budget.ts:119`) consumidos con $0 de gasto
real. Veinte minutos de caída del proveedor con 40 mensajes de choferes ≈ $2.60
de cargo fantasma; el tenant puede quedarse en `tope_tenant` —"presupuesto de IA
del día agotado para esta flota"— **después** de que el proveedor se recuperó.

Peor: `isTransientError` (`:154-183`) clasifica como transitorio el
`APIConnectionError` del SDK, que es DNS/TCP/TLS — o sea, una petición que nunca
llegó al proveedor y que con certeza no se cobró. La política de "el proveedor
pudo haber cobrado" es defendible para un 5xx; para un `ENOTFOUND` no lo es, y el
código no distingue.

Consecuencia: **la flota** se queda sin agente el resto del día por una caída
ajena que no le costó nada; **quien opera** ve el techo diario agotado sin una
fila de gasto real que lo explique.

Causa raíz probable: el fix de BACKEND-19C2-1 se aplicó a los dos caminos de
`generateStructured`/`generateResponse` y no al tercero, que es justo el del
camino interactivo de WhatsApp.

### [BAJO] `AdaptadorComputerUse`: la lista de prohibidos mira el selector, no la etiqueta, y `emitir` no es mutación

`src/lib/likida/facturacion/adaptadores/computer_use.ts:221` ·
`computer_use.ts:213-217` · `computer_use.ts:268-281`

`PROHIBIDOS` (`:70`) se prueba contra el **selector**
(`PROHIBIDOS.test(selector)`, :221), pero el texto humano del control vive en
`etiqueta`, que el inventario sí recoge (`:143`) y esta guarda nunca mira. Entra
`<input type="checkbox" id="ctl00_chkAport">` con
`<label>Acepto donar el redondeo a un partido político</label>`; el modelo llama
`clic("#ctl00_chkAport")`; `PROHIBIDOS.test("#ctl00_chkAport")` = false → se marca
la casilla y el CFDI sale como donativo a un partido — el caso concreto que el
comentario de `:66-71` dice estar cerrando.

Además la tool `emitir` (`:214`) pasa por un `toolExecutor` artesanal (`:268`)
que no es `makeExecutor`, así que no hay `isMutation`, ni `runId`, ni claim
durable: dos `tool_calls` de `emitir` en la misma ronda se disparan con
`Promise.all` (`openrouter.ts:1114`) y `emitir` no casa ningún prefijo de
`READ_PREFIXES`, así que se ejecutan las dos → dos clics en el botón que timbra.

Es BAJO y no ALTO por un solo motivo verificado: el archivo no lo importa nadie
salvo su propia prueba (`computer_use.test.ts:40`); el piloto cableado es
`piloto_vision.ts`. Es deuda con fecha de cobro: el día que alguien lo conecte,
estos dos huecos ya están adentro.

## Lo que revisé y está bien

- **La regla estructural del rubro se cumple.** Las cuatro tools del agente de
  WhatsApp declaran `parameters: { properties: {}, additionalProperties: false }`
  (`likida/tools.ts:35, :97, :140, :211`) y sus handlers reciben `_args` sin
  usarlo; `tenantId`/`viajeId`/`operadorId` salen de `ToolContext`
  (`tool-executor.ts:14-57`), que arma `runAgent` desde la sesión
  (`agents/run.ts:66`). Repasé las 27 tools registradas del repo
  (`likida/tools.ts`, `agents/chat-tools.ts`, `agents/copiloto-tools.ts`,
  `agents/analista.ts`, `agents/copiloto.ts`): **ninguna** deja que el modelo
  elija de qué flota lee. Las únicas con parámetros son enums cerrados
  (`chat-tools.ts:32-39`, `:241-249`, `:337-349`), un uuid validado antes de
  tocar la base (`copiloto-tools.ts:212-217`), un filtro saneado a
  `[a-z0-9._:-]` (`admin/bitacora.ts:51`) y una búsqueda por nombre que exige
  desambiguar cuando hay más de un candidato (`copiloto-tools.ts:329-338`).
- **Una sola mutación en todo el repo**, y con red completa: `guardar_liquidacion`
  (`likida/tools.ts:205`) exige `cierrePedidoPorTexto` calculado por el processor
  (`:234`), kill switch fail-closed antes de mutar (`:250`), candado de cierre en
  ceros con el conteo del MISMO cuadre que se persiste (`:307`), reintento ÚNICO
  ante `CU003` con re-fotografía y re-impresión de los dos PDF (`:378-389`), y
  `registrarCorrida` que nunca tapa el error real (`:266`).
- **Idempotencia de mutación:** rechazo fail-closed sin `runId`
  (`tool-executor.ts:143`), claim durable con fencing token y lease renovado con
  techo de 10 renovaciones (`:194-206`), lease sostenido cuando el handler no
  asentó tras el abort para no abrir ventana de doble efecto (`:258-268`), y la
  caché de la ronda guarda la **promesa** y no el resultado, cerrando el
  check-then-act contra el `Promise.all` (`:364-387`). La llave del efecto lleva
  `runId` (`:333`), que es lo que permite reliquidar un viaje reabierto.
- **Loop-guard:** corta en `round === maxRounds - 1` **antes** del `Promise.all`
  (`openrouter.ts:1105-1108`), con la excepción de tools terminales bien acotada
  (sólo ellas corren en la última ronda) y salida inmediata al primer terminal
  exitoso (`:1170`).
- **Truncamiento tratado como truncamiento, no como formato roto:** en el ciclo
  de tools la comprobación va ANTES de mirar `tool_calls` (`:1069`), y en
  `generateStructured` antes de parsear, con reintento que sube el techo en vez
  de regañar al modelo (`:696-706`).
- **Costo por modelo real de cada ronda** (`:882-885`, `:1050-1052`), en vez de
  precificar todo el ciclo con el modelo de la última ronda; y `costoReal`
  prefiere el costo del proveedor sobre la tabla (`:243-254`), que es lo que hace
  visible el ahorro de la caché de prompt.
- **Ningún modelo de `PRICES` queda huérfano de la red de respaldo**: verifiqué a
  mano `modelosAisladosDeFallback()` (`:125-128`) contra las dos tablas — los 14
  slugs de `PRICES` aparecen como llave o como destino en `FALLBACK`.
- **El error crudo de Postgres no cruza al modelo** (`tool-executor.ts:119-126`),
  filtrado por vocabulario y no por origen, así que un error de negocio
  deliberado ("el operador no pidió cerrar…") sí llega íntegro.
- **MCP:** el tenant sale de la credencial y de ningún otro lado
  (`mcp/credencial.ts:13-17`, `route.ts:94`), el área se exige por herramienta
  ANTES de ejecutar y antes de validar argumentos (`herramientas.ts:82-91`),
  todas las herramientas son de lectura y así se declaran
  (`herramientas.ts:52-58`), el patrón `ilike` de la búsqueda escapa `%`, `_` y
  `\` (`mcp/herramientas/viajes.ts:103`), `fetch` exige forma de uuid antes de
  tocar la base (`busqueda.ts:79`), todo `.limit()` lleva su `.order()` completo,
  y `LecturaIncompleta` se distingue para no devolver una cifra parcial
  (`route.ts:199-208`). El despachador nunca ejecuta una herramienta sin área.
- **Copiloto:** `proponer_accion` no ejecuta nada; la acción confirmada se valida
  contra `INTERRUPTORES` en `copiloto-acciones.ts:143` y el `objetivo` que la
  tarjeta enseñó es el que corre (`:165`).
- **Guardias de salida del chat del panel:** `cifrasRespaldadas` +
  `esDerivada` con un solo nivel de derivación (`analista.ts:153-191`) y
  `fundamentarBloques` (`:285-305`); `CAPTURAS` se limpia en el `finally`
  (`analista.ts:504`, `copiloto.ts:305`), así que no hay fuga entre corridas.
- **Compuerta base:** `npx tsc --noEmit -p .` limpio; `npm test` verde (697
  archivos). No corrí `npm run build` ni `pruebas-manuales/*`.

## Lo que NO alcancé a revisar

- `src/lib/mcp/oauth.ts` (536 líneas) y `sesiones.ts` a fondo: sólo leí el
  contrato que consume `credencial.ts` (`validarAcceso`, prefijos). La emisión,
  rotación y revocación del token —y qué pasa si el rol del `app_user` cambia
  después de emitirlo— es del auditor de seguridad y no la abrí.
- La ruta de `entregar_respuesta` / `entregar_respuesta_admin` como tools
  TERMINALES en el ciclo de rondas: leí el mecanismo (`openrouter.ts:1103-1172`,
  `analista.ts:382`) pero no ejercité el reintento correctivo de `analista.ts:407`
  ni el segundo ciclo del copiloto.
- `budget.ts` / la RPC `reservar_presupuesto_llm` y la migración 0244/0193: leí
  el cliente TypeScript, no el SQL. Mi hallazgo de la reserva se apoya en la
  asimetría entre las tres funciones de `openrouter.ts`, no en leer la RPC.
- `generateStructured` con audio (`audios`, `:537`) y el fallback del rol
  `transcripcion` hacia un modelo sin oído: el código lo declara como conocido
  (`models.ts:145-148`) y no lo perseguí hasta el llamador.
- Los ~30 archivos de prueba de `src/lib/llm/*.test.ts`: no los leí para no
  calificar el código por lo que sus pruebas afirman.
