# Sistema agéntico y orquestación — auditoría 22

**Nota: 5/10** (antes: s/d). Razón: línea base nueva, sin ancla previa legible.
El ciclo de WhatsApp tiene más puntos de muerte cerrados a propósito que
cualquier otro rubro del repo (fail-closed del mutex, barrera que no se abre con
`null`, `say()` que no guarda lo que no salió, snapshot del cierre en la guardia
de cifras). Pero la evidencia con la que el arreglo de ayer decide si un cierre
ocurrió —`ToolCallRecord.error`— **no dice si el efecto ocurrió**, y el camino
por el que el ciclo muere más seguido (el timeout del propio agente) es
exactamente el que produce esa discrepancia: la base dice `liquidado` y al
chofer se le manda «Este es el cuadre de tu viaje». Eso es el ancla de 3 del
rubro; sube a 5 porque el segundo mensaje del chofer sí lo corrige (la otra
mitad del arreglo de ayer) y porque el resto del ciclo está genuinamente
cerrado.

**Riesgo mayor de hoy:** el aborto por timeout del agente devuelve
`success:false` sobre una `guardar_liquidacion` que sigue corriendo y que
commitea igual — y todo lo que hay aguas abajo (`closed`, la recuperación C1,
la guardia de estado, el PDF, el aviso al jefe) se decide con esa bandera.

## Hallazgos

### [CRÍTICO] Una `guardar_liquidacion` abortada a media ejecución commitea, pero se registra como fallida: el cierre existe y el chofer recibe lo contrario
`src/lib/llm/tool-executor.ts:223` (`raceAbort(handlerPromise, toolSignal)`) ·
`src/lib/llm/tool-executor.ts:257-266` (`keepLeaseUntilSettled = true`: el handler
sigue vivo y su resultado tardío se sella con `completeMutation`) · `src/lib/likida/tools.ts:214`
(`guardar_liquidacion` NO lee `ctx.signal`: `grep -c signal tools.ts` = 0) ·
`src/lib/likida/processor.ts:3419` (`parcial?.find(t => t.toolName === 'guardar_liquidacion' && !t.error)`) ·
`src/lib/likida/processor.ts:3358` (el mismo `!t.error` en el camino feliz) ·
`src/lib/likida/processor.ts:3481`.

Escenario, con valores:

1. Turno de cierre. `runAgent` recibe `timeoutMs = reloj.acotar(40_000)`
   (`processor.ts:3347`) e instala `controller.abort(new DOMException('Timeout','TimeoutError'))`
   (`agents/run.ts:62`). Ronda 1: `consultar_politica`. Ronda 2: `cuadrar_viaje`.
   Ronda 3: `guardar_liquidacion` — que hace `computeCuadre` + `getViaje` +
   `getOperador` + **dos** generaciones de PDF + **dos** subidas a Storage +
   `saveLiquidacion` (`tools.ts:279-392`).
2. El timer del agente vence a los 40 s con el handler a mitad de las subidas.
   `raceAbort` **rechaza de inmediato** (`tool-executor.ts:223`, impl. en `:286-300`) y
   `executeTool` devuelve `{ success:false, error:'Timeout' }`. El handler
   **no se cancela**: `tools.ts` no mira `ctx.signal` en ninguna línea, y las
   consultas de `repo.ts` llevan su propio `AbortSignal.timeout(8s)`, no éste.
   Segundos después `saveLiquidacion` → `guardar_liquidacion_tx` commitea:
   `viaje.estatus = 'liquidado'`, fila en `liquidacion`, PDFs en el bucket, y
   los triggers 0036/0037 lo vuelven irreversible.
3. `openrouter.ts:1156` empuja `{ toolName:'guardar_liquidacion', error:'Timeout' }`
   a `executed`; la vuelta siguiente del `for` hace `throwIfAborted`
   (`openrouter.ts:1042`) → `PartialExecutionError('Timeout', …, executed)`.
4. En el processor, `recuperar` es `true` (default de ayer) pero
   `parcial.find(… && !t.error)` es `undefined` → **no hay recuperación**.
   `isTransientError` sí clasifica «Timeout» como transitorio
   (`openrouter.ts:181`), así que se responde
   `resumenCuadre(cuadrarDesdeDB(...), false, 'operador')` =
   **«Este es el cuadre de tu viaje 👇»** (`cuadre/resumen.ts:55`), con
   `closed = false`: no se manda el PDF del chofer, no corre
   `avisarCierreAlJefe`, `saveConversation` deja la conversación anclada al
   viaje ya liquidado, y `ctxCerro` queda en `false` — o sea que si algo más
   truena, el log `cerroSinEntregar` afirma lo contrario de lo que pasó
   (`processor.ts:3849`).
5. El mensaje se sella como `'procesado'` en la bandeja durable
   (`processor.ts:984`): ningún reintento automático cierra la brecha.

La misma puerta existe sin que el agente muera: si quien vence es el timeout
**propio de la tool** (`timeoutToolMs(true)` = 40 s, `tool-executor.ts:75-82`)
y no el del agente, `generateWithTools` sigue normal, el modelo lee
«error» y redacta «no pude cerrar tu liquidación» — y `guardiaEstado`
(`processor.ts:3600`) lo *refuerza* con `cerro:false`, porque coteja contra la
misma bandera.

Consecuencia: el chofer cree que su viaje sigue abierto sobre un cierre
irreversible; sigue mandando comprobantes que ya solo pueden caer a huérfanos,
y la diferencia que esos tickets habrían cubierto se le queda en contra. El
contralor no recibe ni el aviso ni el PDF completo por WhatsApp. En el demo es
el paso 3 del guion contradiciéndose a sí mismo.

Causa raíz probable: `ToolCallRecord.error` mide si el *executor* devolvió a
tiempo, no si el *efecto* se persistió — y el arreglo de ayer eligió justamente
esa bandera como «evidencia» de que hubo cierre; el executor ya sabe distinguir
los dos (`keepLeaseUntilSettled` / `completeMutation` tardío) y no lo propaga.

### [ALTO] `cierreConMargen` es falso *por construcción* siempre que el agente agota su tope recortado — y ahí se suprime el único aviso de que la liquidación salió corta
`src/lib/likida/processor.ts:3508-3515` · `:3637-3641` · `:3776-3785` ·
`src/lib/likida/presupuesto.ts:151` y `:285`/`:292`.

`restante() = total − MARGEN_CIERRE_MS − transcurrido` y
`margenDuro() = total − transcurrido`, así que
`margenDuro() = restante() + MARGEN_CIERRE_MS` **por identidad**. El agente pide
`reloj.acotar(40_000) = min(40_000, restante())`. Cuando ese `min` lo gana
`restante()` (o sea, siempre que el turno llegó al agente con menos de 41 s
utilizables) y el agente consume su tope, `restante()` aterriza en 0 y
`margenDuro()` en `MARGEN_CIERRE_MS − ε`: el chequeo nuevo da **falso**
determinísticamente, no por mala suerte.

Verificado numéricamente contra el código (MARGEN_CIERRE_MS = 39 000,
PRESUPUESTO = 120 000): con `transcurrido = 45 000` antes del agente,
`restante() = 36 000` → `topeAgente = 36 000` → tras el agente
`transcurrido = 81 005`, `margenDuro() = 38 995 < 39 000` → `cierreConMargen = false`.

Escenario: ráfaga lenta, la barrera de intake agota sus 20 s
(`intakeOk = false`, `processor.ts:3173`), el mutex y las lecturas previas
suman ~25 s más, el agente arranca con 45 s gastados, se le recortan 36 s y los
consume. Entonces:
- `processor.ts:3637` toma la rama `!intakeOk && !cierreConMargen` y **omite**
  «⚠️ Ojo: cuadré con los N comprobantes que alcancé a procesar» — el único
  mensaje que le dice al chofer que su liquidación se cerró sin todos sus
  tickets. Coste de mandarlo: un `getGastos` + un `sendText` (1.8 s nominales).
- `processor.ts:3776` omite `avisarCierreAlJefe`: el contralor no recibe ni el
  texto ni el PDF completo por WhatsApp.

Y las dos condiciones están **correlacionadas**, no son independientes: lo que
agota la barrera (Supabase/Meta lentos) es lo mismo que hace que el agente
consuma su tope recortado.

Consecuencia: el chofer se queda con una liquidación corta y sin saberlo —
paga de su bolsa la diferencia de los comprobantes que no entraron—, y el
`logger.error('cierre.sin_margen')` es lo único que lo registra, en un producto
sin nadie mirando logs a las 3 a.m.

Causa raíz probable: el umbral del recorte se comparó contra la misma reserva
que `restante()` ya había descontado, así que el guardia dispara exactamente en
el punto que el presupuesto está diseñado para tocar; y se clasificó como
«accesorio» un aviso cuyo contenido es dinero del chofer.

### [ALTO] La libreta de la ráfaga se queda abierta y muda cuando la cadena por chofer se corta antes de su última foto
`src/lib/likida/processor.ts:2498-2502` (`masEnEstaCadena` / `ultima`) ·
`src/app/api/webhook/whatsapp/route.ts:396-397` (el `break` de `sin_tiempo`) ·
`src/app/api/cron/wa-pendientes/drenado.ts:126-131` · `src/lib/likida/intake/rafaga.ts:25-27`.

Desde la auditoría 19, la libreta (`bandejas`, un `Map` de módulo) solo se
cierra en la foto que **no tiene otra foto detrás en su cadena**
(`opts.hayFotoDespuesEnCadena === false`). Pero la cadena se corta con `break`
cuando `processInbound` devuelve `'sin_tiempo'`, y ese corte es el caso normal
del fajo grande: `alcanza(COSTO_MINIMO_TURNO_MS = 15 000)` exige
`transcurrido ≤ 66 000` ms (81 000 − 15 000), y cada foto cuesta descarga +
visión + hash + subida + alta ≈ 8-15 s.

Escenario con valores: el chofer manda **22 fotos** en un POST (el caso que
`rafaga.ts` documenta como el normal). Tres de las seis primeras salen
ilegibles → `anotarIncidencia(viajeId, {tipo:'ilegible', …})`
(`processor.ts:1984`, tipo `ilegible`). En la foto 7 el reloj de la invocación va en ~70 s →
`'sin_tiempo'` → `devolverIntentoPendiente` + `break`. La libreta con
`vistas: 6` y 3 incidencias **nunca se cierra**. El cron levanta las fotos
7-22 en otra invocación (otra instancia de lambda, en general): libreta nueva,
y al terminar manda «📸 Ya revisé tus fotos. En este viaje llevo *19
comprobantes* por *$X*. Si te falta alguno, mándalo otra vez.» — sin una sola
palabra de las 3 ilegibles.

Esto contradice literalmente la garantía escrita en el encabezado del propio
módulo (`rafaga.ts:25-27`): «cada invocación resume LO SUYO… nunca un
silencio». Con `hayFotoDespuesEnCadena` la primera invocación ya no resume lo
suyo: lo retiene. Y el `MARGEN_CIERRE_MS` de ayer movió el punto de corte 22 s
antes (`restante()` bajó de `103 000 − t` a `81 000 − t`), o sea que el corte
ocurre ahora ~2 fotos antes que anteayer.

Consecuencia: el chofer cree que sus 22 tickets entraron; tres no. Al cerrar,
esos tres se le cobran contra el anticipo y el aviso que existía para evitarlo
nunca salió.

Causa raíz probable: el estado que decide QUÉ se le dice al chofer vive en
memoria de proceso, mientras que la unidad de trabajo que lo abre y lo cierra
(la cadena por chofer) puede repartirse entre invocaciones desde que existe el
corte por presupuesto.

### [MEDIO] El mensaje nuevo de «tu viaje ya quedó liquidado» afirma que el contralor tiene el PDF sin haberlo comprobado
`src/lib/likida/processor.ts:1620` · `src/lib/likida/conv.ts:223-243`
(`liquidacionRecienteDe` selecciona `id, viaje_id`, nada más) ·
`src/lib/likida/repo.ts:1025` (`p_pdf_url: pdfUrl ?? null`) ·
`src/lib/likida/tools.ts:336-341` (`subir()` devuelve `undefined` si el upload falla).

Escenario: el upload del ejemplar del contralor falla (`logger.warn('pdf.upload')`,
`tools.ts:341`); el cierre igual commitea con `pdf_url = null` y el processor
grita `pdf.contralor_no_generado` (`processor.ts:3670`). El chofer, al que ese
mismo turno le dijo «se me trabó», reenvía; cae en la rama nueva y recibe:
«Tu último viaje ya quedó liquidado ✅ — … **Si no te llegó tu PDF, pídeselo a
tu contralor: él ya lo tiene en el panel.** 👍». No lo tiene: la columna que
alimenta el botón de descarga está en `null`.

Consecuencia: el chofer va con su contralor por un documento que no existe, y
el contralor descubre en esa llamada que el sistema le afirmó al chofer algo
que el sistema mismo ya había registrado como falso. Es la regla «un rótulo
tiene que ser verdad» rota en el mensaje que se escribió ayer precisamente para
dejar de mentirle a ese chofer.

Causa raíz probable: la consulta se diseñó para responder «¿hubo cierre?» y el
texto afirma además «¿hay papel?», que es un dato distinto y disponible en la
misma fila.

### [MEDIO] Los dos degradados del cierre dejan al chofer sin decirle que su viaje sigue abierto ni qué hacer
`src/lib/likida/processor.ts:3322-3323` (`agente.sin_presupuesto`) ·
`src/lib/likida/processor.ts:3481` (`agent.degradado_a_cuadre`) ·
`src/lib/likida/cuadre/resumen.ts:52-63`.

Escenario: el chofer escribe «listo». No alcanza el presupuesto para el agente
(`restante() < 15 000`) o el proveedor devuelve 503. Se responde
`resumenCuadre(liq, false, 'operador')`, cuyo texto completo para un operador es
«Este es el cuadre de tu viaje 👇 / • Comprobado: $8,340.50 / • Anticipo:
$10,000.00 / • Sobró $1,659.50 del anticipo» y, en su caso, «Ojo con esto:».
**No hay ninguna frase que diga que el viaje NO se cerró ni que tiene que
volver a escribir *listo*.** El mensaje se sella como `'procesado'`, el viaje
queda `abierto` y nadie vuelve a hablar.

Consecuencia: el chofer da por cerrada su liquidación y deja de actuar; el
viaje se queda abierto en el tablero del contralor hasta que alguien lo note a
mano. La rama gemela de arriba (`processor.ts:3327`) sí dice «Dame un momento y
te paso el cuadre», o sea que el camino *peor* comunica mejor que el camino
*bueno*.

Causa raíz probable: `resumenCuadre` con `cerrado:false` se diseñó para la
guardia de cifras (donde el turno no era un cierre) y se reusó en dos ramas
donde el chofer sí pidió cerrar; el encabezado neutral es correcto pero le
falta la instrucción que solo estas dos ramas necesitan.

## Lo que revisé y está bien

- **Mutex de cierre con tercer estado.** `intentarLockViaje` distingue
  `ocupado` de `indeterminado`, falla CERRADO, avisa con el texto correcto para
  cada caso y suelta el claim para que la bandeja durable reintente
  (`processor.ts:3218-3243`). El doble «listo» se re-verifica DESPUÉS de tomar
  el lock (`processor.ts:3245`).
- **Barrera de ráfaga fail-closed.** `intakePendientes` devuelve `null` (no 0)
  ante error y `esperarIntake` nunca abre con `null`; el olvido de los 10 min
  se aplica del lado del cliente para no reintroducir la escritura por sondeo
  (`conv.ts:838-916`).
- **`say()` devuelve si el mensaje salió**, y `saveConversation` solo persiste
  el turno del asistente cuando salió (`processor.ts:1648-1653`, `:3808-3816`).
- **Snapshot del cierre en la guardia de cifras**: si `guardar_liquidacion`
  corrió, se narra el `liq` que la tool devolvió, no un `cuadrarDesdeDB` de
  otro instante (`cuadre/guardia.ts:70-107`). Esto además hace inofensivo el
  `cuadrarDesdeDB` redundante de la rama de recuperación (`processor.ts:3439`).
- **El arreglo de ayer en `avisar_cierre.ts` es correcto**: el fallo del texto
  ya no corta el `sendDocument`, y `sendText` no lanza (devuelve `null`,
  `meta/client.ts:269-272`), así que la separación en dos escrituras cubre de
  verdad el modo de falla que documenta (`avisar_cierre.ts:152-186`).
- **Las marcas de conversación se resetean al cambiar de viaje**:
  `cierreSinComprobantes` e `intentosConfirmacion` no cruzan de un viaje al
  siguiente, así que el freno del cierre en ceros no se hereda ya confirmado
  (`conv.ts:392-412`).
- **Orden por chofer**: el webhook y el cron agrupan por remitente, corren en
  serie dentro de cada cadena y `break`ean en vez de saltarse un mensaje no
  terminado (`webhook/whatsapp/route.ts:336-368`,
  `cron/wa-pendientes/drenado.ts:74-100`). `sin_tiempo` devuelve el intento en
  vez de gastarlo (ambos caminos).
- **El cierre lo pide el humano, no el modelo**: `cierrePedidoPorTexto` se
  calcula sobre el texto del turno (`processor.ts:496`) y el candado vive en la
  tool, que lanza si falta (`tools.ts:234`); el cierre en ceros exige la
  confirmación expresa y se cuenta sobre el mismo cuadre que se va a persistir
  (`tools.ts:305-315`).
- **Copiloto de /admin**: el modelo propone, el servidor gasta el intent de un
  solo uso ATÓMICAMENTE antes de ejecutar y valida actor + `argsHash` + TTL de
  2 min (`copiloto-intents.ts:140-149`, `:218-259`); la ejecución no vuelve a
  pasar por el modelo (`copiloto-acciones.ts:130-189`).
- **Prompts**: ni el de liquidación ni el del analista autorizan narrar cifras
  propias; los dos declaran el texto del usuario como dato y no instrucción
  (`agents/prompts.ts:34-46`, `:105-140`). No encontré ninguna ruta que le
  mande al chofer el `resumenCuadre` del contralor: los cuatro llamadores pasan
  `'operador'` explícito.

## Lo que NO alcancé a revisar

- El ciclo del **runner nivel 2** (`agentes/runner.ts`, ~1 000 líneas) y sus
  siete agentes autónomos: solo miré `correr_runner` desde el copiloto. El
  `enviador` se auto-aprueba y manda correo real; su punto de muerte no lo
  recorrí.
- El ciclo de **soporte** (`likida/soporte.ts`, escritor nuevo de la 0268) y el
  del **cotizador** (`cotizador/lector.ts`).
- El camino de **nota de voz** (`voz_transcrita.ts`) y el de **botones**
  (`acuse_ticket`, `asi_ok:<uuid>`) como máquinas de estado multi-turno.
- No corrí la suite completa (solo `presupuesto.test.ts`, verde), así que no
  verifiqué a mano si alguna prueba existente pasaría con las funciones que
  toqué rotas — ese chequeo es del rubro de pruebas.
- No hay prueba en el repo que cubra el escenario del CRÍTICO:
  `processor_cierre_parcial.test.ts` construye el `PartialExecutionError`
  siempre con `guardar_liquidacion` **exitoso**.
