# Tool calling — auditoría 25

**Nota: 6/10** (antes 7). Razón del movimiento: **mirada más profunda** — el
código de este rubro **no cambió ni una línea** desde la 24 (los 7 commits de la
ronda tocan `agentes/definiciones.ts`, `chat/tenant.ts`, `verificaciones.sql`,
`utils.ts` y migraciones; ninguno toca `tools.ts`, `openrouter.ts`, `models.ts`
ni `tool-executor.ts`), así que los **siete hallazgos de la 24 siguen abiertos
tal cual**, y al abrir TC-1 —el cierre sobre el que la 24 subió dos puntos— se
ve que está cerrado a medias: se unificó el PREDICADO de copias y **no el
ORDEN**, y el predicado es order-dependent por construcción («la primera
aparición es el ORIGINAL»). O sea que la propiedad que el comentario de
`tools.ts:113-123` promete —«para que las dos cifras no puedan volver a
separarse»— no está garantizada. Eso es lo que baja el punto, no un código
nuevo que se rompió.

Lo que sí aguanta: la regla estructural. Revisé las **31 tools registradas** del
repo, una por una; ninguna acepta un dato del modelo que decida sobre dinero o
sobre a quién pertenece una fila. Las 4 del agente de dinero declaran
`properties: {}`; las 12 del analista son `SIN_PARAMS` o enums cerrados; de las
14 del copiloto, las 3 con texto libre son de la consola superadmin y las tres
validan antes de tocar la base. Ninguna tool nueva rompió la regla.

**Riesgo mayor hoy:** `estado_viaje` y el motor pueden volver a decir dos
«comprobado» distintos del MISMO viaje — ya no por la regla, sino porque cada
uno lee las filas de `gasto` en un orden distinto, y de ese orden depende cuál
copia se toma como original.

## Hallazgos

### [ALTO] TC-1 quedó cerrado a medias: el predicado es el mismo, el ORDEN no — y de él depende cuál copia se cuenta

`src/lib/likida/tools.ts:106` · `src/lib/likida/repo.ts:955-959` ·
`src/lib/likida/cuadre/engine.ts:421-448`

`copiasDeComprobante` conserva **la primera aparición** como original
(`engine.ts:418-419` lo dice textual; `:426-445` lo implementa con
`vistoUuid`/`vistoFolio`). Es una función de un ARREGLO, así que el resultado
depende del orden en que se le entregan las filas. Y los dos caminos leen
distinto:

- `estado_viaje` pide `.order('id')` (`tools.ts:106`). `gasto.id` es
  `uuid default gen_random_uuid()` (mig. 0001:58), así que ese orden es una
  permutación **aleatoria**, no el de llegada.
- `cuadrarDesdeDB` → `getGastos` (`repo.ts:955-959`) **no ordena nada**:
  PostgREST devuelve el orden físico de la tabla, que sí suele ser el de
  inserción (y cambia cuando un `update` reescribe una fila — p. ej. cuando la
  consulta al SAT escribe `estado_sat`).

La rama por folio no puede divergir: su llave incluye el monto
(`concepto|folioNorm|monto`, `:465`), así que solo agrupa filas con el MISMO
monto. **La rama por UUID sí**: su llave es `uuid#orden` (`:441`) y no mira el
monto.

Escenario, con valores del flujo que el propio repo llama normal. El chofer
manda las dos fotos del protocolo (ticket completo + acercamiento) de un ticket
de diésel con QR. Las dos son `legible`, así que `decidirFoto`
(`intake/decidir.ts:52-67`) devuelve `{accion:'alta'}` para ambas — dos filas.
Las dos decodifican el MISMO QR → mismo `cfdi_uuid`; `addGasto`
(`repo.ts:346-360`) **no escribe `cfdi_orden`** → NULL en las dos → llave
`uuid#1` para ambas. Pero el OCR leyó montos distintos: la foto a distancia,
contra el sol, dio **$1,240.00**; el acercamiento, **$12,400.00** (punto decimal
mal leído, el error clásico de un ticket térmico).

- `estado_viaje` ordena por uuid: si la fila de $12,400.00 cae primero, esa es
  el original → **comprobado $12,400.00**.
- El motor lee en orden de inserción: la de $1,240.00 es el original →
  **totalComprobado $1,240.00**, y ese es el que se imprime en los dos PDF y el
  que `saveLiquidacion` persiste.

El chofer pregunta «¿cuánto llevo?» a media ruta y lee $12,400.00; al cerrar, el
WhatsApp y el PDF dicen $1,240.00. Sobre un anticipo de $12,000 eso cambia el
signo de la diferencia: de «cubriste el anticipo» a «te sobran $10,760 a favor
de la empresa».

Consecuencia: **el chofer** recibe dos cifras irreconciliables del mismo fajo y
la segunda lo deja debiendo; **el contralor** —que cruza el PDF contra lo que su
gente le enseñó del teléfono— ve al producto contradecirse en la única cifra que
vende; **el equipo** cree que TC-1 está cerrado porque la prueba lo confirma, y
la prueba no puede verlo: su dataset (`tools_estado_viaje_aud24.test.ts:53-57`)
tiene las tres copias de Costco con el **mismo monto** ($7,881.05), que es
justamente el caso order-independiente.

Causa raíz probable: TC-1 unificó la regla (el predicado exportado) y dio por
hecho que eso bastaba; la regla es de un arreglo ordenado y solo uno de los dos
llamadores declara su orden.

### [ALTO] El canal lateral de la tool terminal no se limpia entre los dos ciclos: la respuesta del reintento se tira y los bloques que la guardia YA rechazó se re-evalúan con una vara más baja

`src/lib/agents/analista.ts:399` · `:407` · `:444-447` · `:459` ·
`src/lib/agents/copiloto.ts:234` · `:262` (mismo código)

`entregar_respuesta` no devuelve los bloques por el resultado de la tool: los
deja en el mapa `CAPTURAS` llaveado por `runId` (`analista.ts:243`). Ese mapa se
borra **solo en el `finally`** del turno completo (`:504`). El reintento
correctivo corre DENTRO del mismo turno y con el MISMO `runId`, así que cuando
el segundo ciclo no alcanza a escribir en `CAPTURAS`, la línea `:446`
—`bloques = CAPTURAS.get(runId) ?? (res2.finalText…)`— devuelve **los bloques
del PRIMER ciclo, los que la guardia acababa de rechazar**, y el `??` hace que
la respuesta real del segundo ciclo sea inalcanzable.

Y no es un caso raro: el reintento existe justamente porque «flash-lite a veces
contesta en texto plano sin la tool terminal» (`:402-404`) — o sea, el modo de
falla que dispara el reintento es el mismo que garantiza que el reintento no
escriba `CAPTURAS`.

Escenario, con valores. El contralor pregunta «¿cuánto gasté en diésel este
mes?». Ciclo 1: el modelo llama `kpis_flota` (devuelve $48,000.00) y entrega un
bloque de texto *«El gasto en diésel del mes fue $48,500.00»*. `cifrasRespaldadas`
(`:407`) tumba el 48500: ninguna tool lo devolvió. Ciclo 2: se le manda la orden
literal «entrega tu respuesta AHORA llamando la tool entregar_respuesta»
(`:423`), el modelo vuelve a llamar `serie_gasto` y contesta **en texto plano**
con el $48,000.00 correcto. En `:446`, `CAPTURAS.get(runId)` sigue trayendo el
bloque de $48,500.00 → **la respuesta correcta, ya pagada, se descarta**.

Peor: en `:459` esos mismos bloques se vuelven a validar contra un `respaldo`
que creció en `:444` con todos los números de las tools del ciclo 2. Es el mismo
texto juzgado dos veces con una vara **estrictamente más baja** la segunda. Con
`serie_gasto` devolviendo ~30 cortes por 4 categorías, `esDerivada` (`:153-167`)
compara todos los pares buscando `a+b`, `|a−b|` y `(a/b)·100` con tolerancia de
un centavo: basta que dos cortes sumen 48,500.00 (p. ej. 12,300.00 + 36,200.00)
para que el $48,500.00 que ninguna tool midió pase y se le pinte al contralor
como la respuesta.

Consecuencia: en el mejor caso **el contralor** recibe el volcado
determinístico («esto es exactamente lo que el sistema leyó») habiendo pagado
dos ciclos completos y teniendo la respuesta buena en memoria; en el peor,
recibe una cifra que la guardia ya había rechazado una vez. **El equipo** lee en
el log `chat.guardia_bloqueo` y culpa al modelo de un turno que el modelo sí
resolvió.

Sin cobertura: los únicos dos archivos de prueba que nombran
`entregar_respuesta` son `analista_prompt.test.ts` y
`openrouter_loopguard.test.ts`, y las pruebas del analista
(`analista_costo_reintento.test.ts:18-34`) **mockean `generateWithTools`**, así
que el handler terminal nunca corre y `CAPTURAS` nunca se llena. Este camino no
tiene ni una prueba.

Causa raíz probable: el canal lateral se diseñó para UN ciclo por turno (A30) y
el reintento correctivo se añadió después sin invalidar la captura anterior.

### [MEDIO] Para el ciclo, una tool terminal que FALLÓ cuenta como entrega hecha: el mensaje que le pide al modelo reintentar es texto muerto

`src/lib/llm/openrouter.ts:1177` · `src/lib/agents/analista.ts:242` ·
`src/lib/agents/copiloto.ts:139`

`generateWithTools` decide que el turno terminó con
`if (exec.success && terminales.has(call.function.name)) entregada = true`
(`:1177`), y `exec.success` significa «el handler no lanzó», no «la entrega
aterrizó». `entregar_respuesta` **no lanza** cuando los bloques no validan:
devuelve `{ ok: false, error: 'bloques inválidos: revisa tipos y tamaños, y
vuelve a llamar entregar_respuesta' }` (`analista.ts:242`). O sea que el ciclo
se corta en `:1187-1189` con `entregada = true` y **ese mensaje nunca llega a
una ronda que el modelo pueda leer**: la instrucción «vuelve a llamar
entregar_respuesta» es, por construcción, inalcanzable.

Escenario, con valores. `chat` = `google/gemini-3.5-flash-lite`. El modelo
entrega `bloques: [{ tipo:'cifra', valor:'48000' }]` — el valor como string, que
es lo que un modelo chico hace cuando el schema no lleva `strict`.
`validarBloques` descarta el bloque por «valor no numérico» (`analista.ts:67`),
no queda ninguno, devuelve `null`, y el handler responde `ok:false`. El ciclo
retorna con `finalText: ''` (el turno solo traía la tool call), `bloques` queda
`null` y se dispara el **reintento completo**: otro `generateWithTools` de hasta
4 rondas × 900 tokens, con todo el historial de entrada otra vez. Lo que debía
costar una ronda más (el modelo lee su error y corrige) cuesta un ciclo entero,
más los ~3-8 s de latencia que el contralor mira en la secuencia de pasos.

Consecuencia: **la flota** paga el doble por cada entrega malformada; **el
contralor** espera el doble; **el equipo** mantiene un contrato de tool cuyo
texto de error afirma un comportamiento («vuelve a llamar…») que el ciclo hace
imposible.

Causa raíz probable: la excepción A30 se escribió pensando en la tool terminal
que SIEMPRE tiene éxito, y `success` del executor no distingue «el handler
corrió» de «el handler hizo lo que se le pidió».

### [BAJO] `toolSchemas` falla ABIERTO: un nombre que no está en el registro se cae de la lista sin un log

`src/lib/llm/tool-executor.ts:94-98` · `src/lib/agents/run.ts:59` ·
`src/lib/likida/processor.ts:10`

`toolSchemas` hace `.map(REGISTRY.get).filter(Boolean)`: un nombre sin handler
simplemente **desaparece**, sin `logger.warn` y sin que el llamador compare
largos. Las tools del agente de dinero se registran por un **import de puro
efecto colateral** (`processor.ts:10`, `import '@/lib/likida/tools'`), y hoy ese
import es el ÚNICO del repo.

Escenario: alguien añade un segundo punto de entrada a `runAgent` (una ruta de
API para reliquidar desde el panel, un script de ensayo del demo) sin repetir
ese import — o un pase de «quitar imports sin usar», o un bundler con
`sideEffects:false`, lo borra. `toolSchemas(['consultar_politica','cuadrar_viaje',
'guardar_liquidacion','estado_viaje'])` devuelve `[]`, `generateWithTools` manda
`tools: undefined` (`openrouter.ts:1028`) y el agente contesta prosa. El chofer
escribe «listo», recibe algo amable sin cifras, `guardiaCifras` no lo sustituye
(sin cifras el portón deja pasar, `guardia.ts:84`) y **el viaje nunca se cierra**.
Cero errores, cero logs, `agent.run` con `tools: []`.

Consecuencia: **el equipo** perdería la función central del producto con la
suite en verde; es exactamente el modo de falla que `adaptadores/registro.ts:18-23`
documenta como ya vivido («`portalesAutomatizados()` devolvía `[]` siempre… un
cron en verde que no factura nada es peor que uno en rojo»). La prueba que
vigila el registro (`tools_invariantes_aud24.test.ts:11`) hace ella misma
`await import('./tools')`, así que no puede ver la ausencia del import en el
llamador.

Causa raíz probable: `toolSchemas` se escribió tolerante para poder pedir
subconjuntos, y nadie le puso la contrapartida —«pedí 4 y me dieron 3»— en el
sitio donde importa.

### [BAJO] `computer_use.ts`: la única tool del repo que ejecuta un acto fiscal irreversible corre FUERA del executor y sin candado de una-sola-vez

`src/lib/likida/facturacion/adaptadores/computer_use.ts:213-217` · `:264-283`

Lo digo con la reserva por delante: **este adaptador no está cableado**.
`grep AdaptadorComputerUse` solo lo encuentra en su propia definición; el que se
registra es `crearPilotoVision` (`adaptadores/registro.ts:459`), y ese **nunca
emite** (`piloto_vision.ts:222-226` lo declara y se detiene). Así que hoy no hay
escenario en producción. Lo reporto porque es el único sitio del repo donde una
tool del modelo aprieta un botón que timbra ante el SAT, y trae tres cosas que
el resto del rubro ya resolvió:

1. Su `toolExecutor` es una función inline (`:266-283`), no `makeExecutor`: sin
   `claimMutation`/lease/fencing, sin timeout por tool, sin
   `mensajeParaElModelo`. La rejilla de idempotencia que existe justo para que
   «un fallback NUNCA re-ejecute una mutación» no aplica aquí.
2. `emitir` no está marcada `isMutation` ni declarada `terminalTools`, y no casa
   ningún `READ_PREFIXES`, así que ni `crossRound` ni la rejilla de mutaciones
   la tocan. La única dedup que le llega es `inRound`
   (`openrouter.ts:1161-1168`), que solo cubre la MISMA ronda con el MISMO
   `selector`.
3. El handler no lleva bandera de «ya emití»: tras `case 'emitir'` (`:262`) el
   ciclo sigue hasta 14 vueltas con el resultado «EMITIDO. Inventario nuevo: …».
   Si el portal re-renderiza y el botón sigue en el inventario —o el modelo
   elige un selector distinto del mismo botón—, la segunda llamada se ejecuta:
   **dos CFDI timbrados** que solo se cancelan con acuse del receptor.

Consecuencia (el día que se cablee): **la flota** con un CFDI duplicado a su
nombre; **el equipo** creyendo que la idempotencia del repo lo cubre, cuando
este camino no pasa por ella.

Causa raíz probable: el adaptador se escribió como pieza autónoma y reusó
`generateWithTools` sin reusar el executor, que es donde vive todo el contrato.

## Reincidentes de la auditoría 24 — verificados uno por uno, TODOS siguen abiertos

Ninguno cambió: los reviso contra el código y remito al detalle en
`docs/auditoria-24/tool-calling.md` para no repetirlo.

- **[MEDIO · 4ª RONDA] `estado_viaje` sigue invisible para `guardiaCifras`.**
  `guardia.ts:39-41` (`cuadro` solo mira `cuadrar_viaje`/`guardar_liquidacion`),
  `:53` (`consultoPolitica` solo `consultar_politica`), `:89`, `:107`, `:116`:
  el archivo es idéntico. Verificado también el portón: con la respuesta que
  `prompts.ts:79` ORDENA dar («Llevas 3 comprobantes por $2,340.00 de tu
  anticipo de $5,000.00»), `DINERO_EXPLICITO` (`cifras.ts:21`) casa en la
  primera línea de `tieneCifrasDeDinero` → `cuadro=false`,
  `consultoPolitica=false` → se cae al `try` de `:104`, se vuelve a llamar
  `cuadrarDesdeDB` y sale `resumenCuadre(liq, false, 'operador')`. O sea: a un
  «hola» a media ruta el chofer recibe «Sobró $2,660.00 del anticipo (a favor de
  la empresa)», y se pagan las 2 consultas de `estado_viaje` para tirar su
  resultado. **Cuatro rondas abierto es, en sí mismo, el dato.**
- **[ALTO] `generateResponse` trata una respuesta truncada como completa.**
  `openrouter.ts:394-425`: sigue sin mirar `finish_reason`, frente a sus dos
  hermanas (`:656` y `:1086`). Los consumidores del escenario siguen ahí:
  `faq.ts:418-422` (`back_office`, `maxTokens: 600`),
  `perfil/entrevista-agente.ts:46-58` (`chat`, `maxTokens: 400`),
  `sdr.ts:151-160`, `contador.ts:98`. Ni una prueba lo cubre.
- **[ALTO] El `break` por presupuesto del runner es código muerto.**
  `runner.ts:559` sigue con `e instanceof LlmBudgetExceededError`, y
  `redactor.ts:437` sigue lanzando `new DatoInvalido(…)` **sin `cause`**, así
  que ni `esErrorDePresupuesto` (`budget.ts:67-75`) —que existe justo para
  esto— puede rescatarlo. El único consumidor del helper sigue siendo
  `processor.ts:3980`. La alerta AGB-11 sigue culpando al modelo de un tope de
  dinero.
- **[MEDIO] El chat del panel corre en el carril de FONDO.**
  `analista.ts:327`: `createLlmBudget(opts.tenantId, runId, 'fondo')`, contra el
  dominio de `budget.ts:18-21` que pone «los chats del dashboard» en
  `'interactivo'`.
- **[MEDIO] `guardar_liquidacion` devuelve el expediente completo al modelo.**
  `tools.ts:483` (`liq`) → `engine.ts:1760` (`gastos: input.gastos`) →
  `repo.ts:957`, que trae 32 columnas por comprobante, `rfc_emisor`,
  `rfc_receptor`, `cfdi_uuid` e `imagen_url` incluidos. `openrouter.ts:1179` lo
  serializa entero como `content` del mensaje `role:'tool'`. El único lector es
  `guardia.ts:70-73`, en memoria del mismo proceso.
- **[BAJO] `generateStructured` etiqueta todo el turno con un solo modelo.**
  `openrouter.ts:677` (`usage.model` del último intento) y `:692` (el primario
  en el camino de error); `gastado` acumula los tres intentos. Sigue sin el
  `costoPorModelo` que sí tiene su hermana.
- **[BAJO] `copiloto-acciones.ts:165`** sigue diciendo «Se enciende desde
  Observabilidad (doble confirmación)» en el mensaje de éxito, catorce líneas
  debajo del `revertir` que ya se corrigió.

## Lo que revisé y está bien

- **La regla estructural, en las 31 tools del repo.** `tools.ts:36`, `:98`,
  `:171`, `:242` — las cuatro del agente de dinero con `properties: {}` +
  `additionalProperties: false`, y `tenantId`/`viajeId` desde `ctx`.
  `chat-tools.ts`: 10 con `SIN_PARAMS`, `proyectar_serie` (`:274-282`) y
  `consultar_normas` (`:369-377`) con enums cerrados (`TEMAS_NORMATIVOS`), el
  único texto libre que existe es `PARAM_MODO` con tres valores.
  `copiloto-tools.ts`: 11 con `SIN_PARAMS` y las 3 con texto libre validadas
  antes de tocar la base — `traza_corrida` exige forma de uuid con regex
  (`:217`), `bitacora` sanea el filtro a `[a-z0-9._:-]` antes del `ilike`
  (`bitacora.ts:52`, con el comentario que explica los comodines), y
  `ficha_cliente` desambigua en vez de adivinar (`:344-347`). Ninguna decide qué
  fila se escribe.
- **Los dos candados de `guardar_liquidacion`, en la tool y no en el prompt.**
  `tools.ts:265-272` (`cierrePedidoPorTexto`, calculado por el processor sobre
  el texto del turno, `processor.ts:3800`) y `:339-346` (`comprobantesReales === 0`
  + `cierreEnCerosConfirmado`). Los dos LANZAN en vez de devolver un no-op, así
  que el error viaja al modelo como resultado de tool. El kill switch
  (`:281-286`) vive en el mismo sitio y falla cerrado.
- **Idempotencia por EFECTO.** `tool-executor.ts:364-390` cachea la PROMESA
  antes del `await` (cierra la ventana check-then-act del `Promise.all` de
  `openrouter.ts:1131`), llavea por NOMBRE con la nota que explica por qué eso
  solo vale mientras `properties: {}` se sostenga, y borra el fallo para que un
  blip no se vuelva permanente. La llave durable incluye `runId` (`:332-334`) y
  el executor rechaza cerrado una mutación sin él (`:143-146`). El techo de
  renovaciones del lease (`:194-202`, con `.unref()`) y el sello tardío del
  handler colgado (`:258-268`) siguen en pie.
- **Loop-guard.** `openrouter.ts:1122-1125`: corta ANTES del `Promise.all`, con
  la excepción de las terminales, y `openrouter_loopguard.test.ts` cubre las
  ocho variantes.
- **Truncamiento en las dos hermanas que sí lo miran.** `:656-664`
  (`generateStructured`, con reintento al doble de tope en `:704-714`) y
  `:1086-1094` (el ciclo de tools, ANTES de mirar `tool_calls`, que es lo que
  evita el diagnóstico falso «argumentos JSON inválidos»).
- **Atribución de costo en el ciclo de tools.** `acumularCosto` por ronda con
  `activeModel`, que `complete` ya movió al fallback antes de devolver
  (`:1065-1069`); consumido por `processor.ts:3851-3861` y
  `dashboard/chat/route.ts:118-127`, que escriben una fila de `llm_costo` por
  modelo real.
- **La reserva no se cobra ante un error de red** en las tres funciones:
  `:423`, `:638` y `:1014-1019` dejan la fila en `reservado` para que la 0193 la
  expire (TC-6 de la 24, verificado).
- **`llaveDeCache`** (`:803-815`) llavea por NOMBRE solo las tools sin
  parámetros, y guarda los args ORIGINALES junto al resultado cacheado
  (`:935`, `:1151`) para que el `ToolCallRecord` no describa una llamada que
  nunca corrió con esos args.
- **El error crudo de Postgres no cruza al modelo.**
  `tool-executor.ts:119-126`, `VOCABULARIO_POSTGRES`, con el detalle completo en
  el log.
- **El piloto de visión no emite.** `piloto_vision.ts:222-226`: aun con
  `modo === 'emitir'` llena y se detiene, y lo deja dicho en el log. El veto
  `HUELE_A_EMITIR` (`:154-172`) y el loop-guard por firma repetida (`:288-292`)
  siguen como la 24 los verificó.
- **`CAPTURAS` no fuga entre corridas ni entre tenants** (`analista.ts:504`,
  `copiloto.ts:305-306`): se llavea con el `runId` aleatorio del turno y se
  borra en el `finally`. El problema del hallazgo de arriba es DENTRO del turno,
  no entre turnos.
- **Las acciones del copiloto no las decide el modelo.** `proponer_accion` solo
  arma previsualización; la ejecución exige un `intentId` que emitió el servidor
  y `ejecutarAccionCopiloto:157-159` revalida el objetivo contra `INTERRUPTORES`.

## Lo que NO alcancé a revisar

- **Nada contra Postgres real ni contra los proveedores.** No hay `.env`, ni
  base, ni red: la RPC `reservar_presupuesto_llm` bajo concurrencia, el
  comportamiento real de `provider: { data_collection: 'deny' }` y de
  `reasoning: { enabled: false }` siguen siendo contrato declarado, no
  verificado. Es el mismo hueco que la 24 declaró.
- **No corrí la suite de este rubro.** La compuerta ya había salido verde y el
  encargo pedía no repetirla; verifiqué leyendo los archivos de prueba, no
  ejecutándolos. Lo que sí afirmo por lectura: `entregar_respuesta` no tiene
  prueba que lo ejercite a través del ciclo real (los dos únicos archivos que lo
  nombran son `analista_prompt.test.ts` y `openrouter_loopguard.test.ts`, y las
  pruebas del analista mockean `generateWithTools`).
- **`generateStructured` con audio** (`:579`, el cast a `input_audio`): el
  fallback de `transcripcion` hacia un modelo sin oído sigue sin prueba que yo
  haya encontrado, y `models.ts:144-148` reconoce el hueco.
- **`ficha_cliente` con comodines.** `copiloto-tools.ts:341` arma
  `ilike('nombre', '%${q}%')` sin sanear `%`/`_`, al revés que `bitacora.ts:52`.
  No lo reporto como hallazgo porque falla seguro (con >1 coincidencia
  desambigua, `:345-347`) y no pude construir un turno donde el modelo emita un
  `%`; queda anotado por la asimetría entre dos tools del mismo archivo.
- **El gasto del copiloto no llega a `llm_costo`.** `registrarCosto` tiene 9
  llamadores (`costos.ts:121`) y ninguno es `/api/admin/copiloto`: el turno solo
  deja `logger.info('copiloto.costo')` (`route.ts:257`) y su fila en el ledger de
  reservas. O sea que `costo_por_fase_modelo` y `metrica_negocio` —las tools con
  las que Javier pregunta «¿cuánto me cuesta la IA?»— no cuentan al copiloto ni
  a los agentes del runner. No lo cerré como hallazgo porque no verifiqué si
  `resumen_costo_ia()` toma de otra fuente, y la frontera con el rubro de
  operabilidad no es mía.
