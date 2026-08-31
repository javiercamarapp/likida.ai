# Sistema agéntico y orquestación — auditoría 23

**Nota: 4/10** (antes 5). Razón del movimiento: **mirada más profunda**. El
código mejoró de verdad en dos puntos (`MARGEN_CIERRE_CRITICO_MS` y el cierre de
ráfaga por corte) y AGEN-1 resultó ser distinto de como lo describió la 22 — pero
al recorrer el ciclo punto por punto aparecen **tres** estados donde la base dice
una cosa y el humano cree otra, y **uno de los tres nació ayer**, dentro del
propio arreglo de AGEN-C1. El ancla del rubro («3 o menos si existe un estado
donde la base dice una cosa y el usuario cree otra») pide 3; sube a 4 porque el
resto del ciclo —mutex con tercer estado, barrera fail-closed, `say()` que
devuelve si salió, snapshot del cierre— sigue genuinamente cerrado y verificado.

**Riesgo mayor de hoy:** la autoridad para decidir «¿hubo cierre?» sigue siendo
`ToolCallRecord.error`, y el backstop que la 22 puso —preguntarle a la base—
vive **solo dentro del `catch`**. Todo `guardar_liquidacion` que reporte fallo
sin que el ciclo del agente muera sale por el camino feliz, donde nadie le
pregunta a la base nada.

---

## Hallazgos

### [CRÍTICO] El backstop «la base es la autoridad» solo existe en el `catch`: un `guardar_liquidacion` que falla sin tumbar el ciclo pasa por el camino feliz, donde nadie pregunta (REINCIDENTE, AGEN-1)
`src/lib/likida/processor.ts:3394` (`closed = res.toolCalls.some(t => t.toolName === 'guardar_liquidacion' && !t.error)`) ·
`src/lib/likida/processor.ts:3471-3486` (la consulta a la base, **dentro del `catch`**) ·
`src/lib/likida/presupuesto.ts:221` y `:228-234` (`acotada`: `abortSignal(8 s)` + red de seguridad a 9.5 s que **resuelve con un `{data:null,error}` sintético**) ·
`src/lib/likida/repo.ts:1074-1082` (`saveLiquidacion` LANZA con ese error) ·
`src/lib/likida/tools.ts:261-273` (el `catch` del handler re-lanza tras `registrarCorrida('fallo')`) ·
`src/lib/likida/processor.ts:3674` (`guardiaEstado(reply, { cerro: false, entrego: false })`).

**Primero, la corrección al diagnóstico de la 22 — es la razón por la que no
pudo reproducirlo.** La 22 apoyó AGEN-1 en «`guardar_liquidacion` NO lee
`ctx.signal` (`grep -c signal tools.ts` = 0), así que el handler sigue vivo y
commitea segundos después». El grep sigue dando 0 —lo verifiqué—, pero la
conclusión no se sostiene: `executeTool` corre el handler dentro de
`runWithToolSignal(toolSignal, …)` (`tool-executor.ts:221`) y
`supabaseAdmin()` mete `currentToolSignal()` en el `fetch` de **toda** consulta,
RPC y subida a Storage (`src/lib/supabase/admin.ts:32-38`). O sea que el aborto
del agente SÍ llega al handler, aunque `tools.ts` no lo mencione: al vencer el
reloj, las dos subidas de `generarPdfs` rechazan al instante y el RPC
`guardar_liquidacion_tx` **ni se manda**. En la mayoría de los abortos NO hay
commit, y por eso una prueba construida sobre esa premisa nunca iba a fallar.

**Lo que sí queda abierto, y es peor que lo descrito, porque no necesita que el
agente muera.** El disparador real no es el aborto: es que `saveLiquidacion`
reporte fallo por su **propio** techo de consulta.

Escenario con valores:

1. Turno de cierre. `runAgent` con `timeoutMs = reloj.acotar(40_000)`. Ronda 3:
   `guardar_liquidacion`. `computeCuadre` + `getViaje` + `getOperador` + dos PDF
   + dos subidas van bien (≈9 s). Se llama
   `saveLiquidacion(t1, liq, pdfPath, 6)`.
2. `guardar_liquidacion_tx` (0013 + 0158) toma el candado del viaje, cuenta
   gastos, hace el upsert, actualiza `viaje.estatus` y dispara los triggers
   0036/0037. Con Supabase lento tarda **8.4 s**. `acotada` se rinde a los
   `TOPE_CONSULTA_MS = 8_000` (`presupuesto.ts:221`, y la red de seguridad a
   9 500 ms en `:228-234`) y entrega
   `{ data: null, error: { message: 'sin respuesta en 8000 ms (tope de consulta)' } }`.
   La transacción del lado del servidor **ya estaba adentro** y commitea:
   `viaje.estatus = 'liquidado'`, fila en `liquidacion` con `pdf_url`, PDFs en el
   bucket, irreversible por los triggers.
3. `repo.ts:1074` lanza `Error('saveLiquidacion: sin respuesta en 8000 ms …')`.
   El handler anota `registrarCorrida('fallo')` y re-lanza (`tools.ts:263-272`).
   `executeTool` cae al `catch`: **`toolSignal.aborted` es `false`** (nadie
   abortó nada), así que toma la rama `else` de `tool-executor.ts:269-273` →
   `failMutation` → devuelve `{ success:false, error:'saveLiquidacion: sin
   respuesta…' }`.
4. **`generateWithTools` sigue normal**: empuja el registro con `error` a
   `executed`, la vuelta siguiente pasa `throwIfAborted` sin problema
   (`openrouter.ts:1042`), el modelo lee `{error:…}`, redacta «no pude cerrar tu
   liquidación» y el ciclo **retorna sin excepción**.
5. En el processor no hay `PartialExecutionError`, así que **el bloque de
   `processor.ts:3471-3486` —la consulta a la base que la 22 añadió— nunca
   corre**. `closed = false` (`:3394`). `guardiaEstado` lo *refuerza* con
   `cerro:false` (`:3674`): si el modelo hubiera dicho «ya cerré», la guardia lo
   sustituye por «todavía no he cerrado tu liquidación».
6. No se manda PDF, no corre `avisarCierreAlJefe`, `saveConversation` deja la
   conversación anclada al viaje ya liquidado (`closed ? null : viajeId`,
   `:3888`), y el mensaje se sella como `'procesado'` (`:1017-1020`): ningún
   reintento cierra la brecha.

Consecuencia: el chofer cree que su viaje sigue abierto sobre un cierre
irreversible. Sigue mandando comprobantes que ya solo pueden caer a huérfanos
(la rama `!viajeId`), y la diferencia que esos tickets habrían cubierto se le
queda en contra. El contralor no recibe ni el aviso ni el PDF por WhatsApp; su
único rastro es el PDF en el panel, que nadie le dijo que existía. En el demo es
el paso 3 del guion contradiciéndose.

Causa raíz probable: la evidencia de que hubo cierre sigue siendo «el executor
devolvió a tiempo», no «el efecto se persistió», y el arreglo de ayer puso el
único cotejo contra la base en la rama de excepción — la mitad del árbol.
Preguntarle a la base cuesta una consulta y solo haría falta cuando
`guardar_liquidacion` reportó fallo, que es raro por definición.

(REINCIDENTE de la auditoría 22, AGEN-C1 / AGEN-1.)

---

### [ALTO] La recuperación por base fabrica un `ToolCallRecord` que **nada aguas abajo lee**: la guardia devuelve el mensaje a «no cerrado» y al chofer se le niega un PDF que sí existe
`src/lib/likida/processor.ts:3478-3481` (el registro sintético) ·
`src/lib/likida/processor.ts:3488` (`agentTools = parcial!` — el arreglo NO mete el sintético) ·
`src/lib/likida/cuadre/guardia.ts:52` y `:116` ·
`src/lib/likida/processor.ts:3737` (`agentTools.find(t => … && !t.error)`) ·
`:3749-3751`, `:3754`, `:3863`.

Éste es el modo de falla que **nació ayer**, dentro de `e7fb20e`.

Cuando la recuperación por base sí dispara (el commit alcanzó a quedar antes de
la lectura), el processor construye
`cierreParcial = { toolName:'guardar_liquidacion', result:{ liquidacion_id, pdf_url } }`
y pone `closed = true`. Pero acto seguido hace `agentTools = parcial!` —el array
**original**, donde el único registro de `guardar_liquidacion` sigue llevando
`error:'Timeout'`— y el sintético no entra a ningún lado. Todos los consumidores
de aguas abajo filtran por `!t.error`, así que para ellos la tool **falló**:

Escenario con valores. Viaje `v1`, `liquidacion L1` con
`pdf_url = 't1/v1.pdf'`, ambos PDF en el bucket, `totalComprobado = 8 340.50`:

1. `reply = resumenCuadre(cuadrarDesdeDB(...), true, 'operador')` = «**Listo,
   cuadré tu viaje 👇** • Comprobado: $8,340.50 …» (`:3506`).
2. `guardiaCifras(reply, agentTools, …)`: `cuadro` y `cerro` salen **false**
   (`guardia.ts:39-52`, filtro `!t.error`), pero `tieneCifrasDeDinero("$8,340.50")`
   es true → no hay salida temprana, y `guardia.ts:116` devuelve
   `resumenCuadre(liq, cerro=false, 'operador')` = «**Este es el cuadre de tu
   viaje 👇**». **La guardia le quita al mensaje la única frase que afirmaba el
   cierre**, sobre un viaje que ya es `liquidado`. Además deja
   `logger.warn('agent.cifras_forzadas')` en cada recuperación.
3. `processor.ts:3737`: `guardado` = `undefined` → `pdfGenerado = false` →
   `:3754` lanza `'la tool reportó pdf_generado=false'` → al chofer se le manda
   «Tu liquidación ya quedó cerrada ✅, pero **no pude generarte el PDF**»
   (`:3820`). Es falso: el PDF está en `t1/v1-operador.pdf` y la fila trae su
   `pdf_url`, que el propio `cierreParcial` ya había leído y que nadie consulta.
4. `pdfContralorGenerado = false` → `logger.error('pdf.contralor_no_generado')`
   (falso) y `:3863` deja `urlPdfJefe = null`: **el aviso al contralor sale sin
   el PDF adjunto**, en el único camino donde ese adjunto es lo que repara el
   turno.

Consecuencia: el chofer recibe un encabezado neutro seguido de una negación de
su documento; el contralor recibe texto sin papel; y el log grita un fallo de
PDF que no ocurrió, envenenando la única señal que existe para detectar el fallo
de verdad. Con el arreglo anterior (`cierreParcial` encontrado por `!t.error`)
nada de esto pasaba: el registro real venía sin `error` y los cuatro
consumidores lo leían bien. La rama nueva es la que lo rompe.

Causa raíz probable: se corrigió la variable de decisión (`cierreParcial`) sin
corregir la **evidencia** que el resto del cierre consume (`agentTools`); el
`pdf_url` que la consulta a la base ya trae se guarda en un campo que ningún
llamador lee.

---

### [ALTO] `cerrarRafagasPorCorte()` cierra la libreta de **todos** los choferes del proceso, incluidos los que siguen en vuelo en otra cadena del pool
`src/lib/likida/processor.ts:919-931` · `:961` ·
`src/lib/likida/intake/rafaga.ts:160-162` (`bandejasAbiertas()` devuelve **todo** el Map de módulo) ·
`src/lib/likida/intake/rafaga.ts:207-211` (`cerrarRafaga` BORRA la bandeja) ·
`src/app/api/webhook/whatsapp/route.ts:70` (`MAX_EN_PARALELO = 5`) y `:347` (`conPool([...porChofer.values()], …)`).

El arreglo AGEN-A2 de ayer cierra la libreta cuando una cadena se corta por falta
de presupuesto. El problema es el alcance: `bandejasAbiertas()` no filtra por
viaje ni por chofer — devuelve el `Map` de módulo entero, que es **compartido por
todas las cadenas del pool**, y el `for` llama `cerrarRafaga(viajeId)` (que
borra) **antes** del `continue`, así que destruye incluso las libretas que
decide no anunciar.

Escenario con valores. Un POST de Meta trae a dos choferes; `conPool` los corre
en paralelo (`route.ts:347`):

- Chofer A (viaje `vA`) manda 12 fotos; chofer B (viaje `vB`) manda 6.
- La foto 7 de A entra cuando la invocación lleva 66.2 s:
  `restante() = 120 000 − 39 000 − 66 200 < 15 000` → `alcanza(COSTO_MINIMO_TURNO_MS)`
  falla → `processor.ts:961` corre `cerrarRafagasPorCorte()`.
- La libreta de B en ese instante lleva `vistas: 4`, una incidencia `ilegible`,
  cuatro acuses, y su foto 5 **está en vuelo** en la otra cadena. Se cierra y se
  borra igual, y B recibe: «*De tus 4 fotos*, *1* no la pude leer 🔍 —
  Reenvíamela con buena luz…».
- La cadena de B sigue: las fotos 5 y 6 llaman `anotarFoto(vB, false, …)`, que
  reabre una libreta nueva desde `vistas: 0`. Cuando la foto 6 cierra la ráfaga
  (`hayFotoDespuesEnCadena === false`), B recibe un **segundo** mensaje contando
  «de tus 2 fotos».

Consecuencia: el chofer B, que mandó **6** fotos, recibe dos mensajes que suman
«4» y «2» y ninguno describe su fajo. Es una cifra que nadie midió sobre el dato
que decide si vuelve a fotografiar un ticket — la regla «nunca inventar una
cifra» rota en el mensaje que existe justamente para que no le falten
comprobantes al cerrar. Y el efecto es duplicado: dos avisos donde el módulo
entero existe para mandar uno.

Causa raíz probable: la unidad de trabajo que abre y cierra la libreta es la
cadena **por chofer**, pero el nuevo cierre se colgó de un evento **por
invocación**, sobre un `Map` global cuyo único filtro es «existe».

(No hay una sola prueba que ejercite `cerrarRafagasPorCorte` ni
`bandejasAbiertas`: `grep -rl` sobre `src/` devuelve solo los dos archivos de
producción.)

---

### [MEDIO] El techo diario de `atencion_faq` sigue sin cortar nunca: el arreglo ARQ-2 volvió el costo `null` y nadie conectó el detector de `null`
`src/lib/likida/agentes/faq.ts:434-438` (`costoUsd = null` pegajoso) y `:464` (`registrarCorrida(..., costoUsd)`) ·
`src/lib/likida/agentes/corridas.ts:118` (`costo_usd: c.costoUsd ?? null`) ·
`src/lib/likida/agentes/runner.ts:318-330` (`gastoDelDiaUsd` filtra `.not('costo_usd','is',null)`) ·
`src/lib/likida/agentes/runner.ts:707-718` (la compuerta de `atencion_faq`: **solo** `gastoDelDiaUsd`) ·
comparar con `:748-760` (`contenido_fiscal`, que sí llama `corridasSinCostoMedidoHoy`).

El comentario que la 22 dejó en `faq.ts` dice: «se sumaba `r.cost`, que en modo
plataforma llega en 0 … el techo diario del runner NUNCA cortaba mientras el
agente seguía gastando de verdad». Tras el arreglo sigue sin cortar, por el
camino de al lado.

Escenario con valores: `presupuesto_dia_usd = 1.00` para `atencion_faq`. En la
vuelta de las 08:00 el proveedor omite `usage` en un ticket →
`r.noMedido` → `costoUsd = null` para la corrida entera → la fila de
`agente_corrida` queda con `costo_usd = NULL`. En la vuelta de las 12:00
`gastoDelDiaUsd('atencion_faq')` **excluye esa fila por diseño** (`.not(…, 'is',
null)`) y devuelve `0.00 < 1.00`: el agente vuelve a correr. Y otra vez a las
16:00 y a las 20:00. Antes del arreglo sumaba `0` y comparaba `0.00 < 1.00`:
**exactamente el mismo resultado**.

Consecuencia: el único agente de Éxito que gasta modelo (`faq.ts:418`,
`generateResponse` sin `budget` — modo plataforma, sin ledger por tenant) corre
sin techo verificable el día que el proveedor omita `usage`. El daño hoy está
acotado (pre-revenue, un lote de tickets cada 4 h, y no toca ningún canal de
salida), pero es una compuerta que se declaró reparada y no lo está — y el día
que haya tickets de verdad, la cuenta de OpenRouter es de Likida.

Causa raíz probable: ARQ-2 cambió el **tipo** en los tres productores y conectó
el consumidor (`corridasSinCostoMedidoHoy`) en uno solo; la compuerta de
`atencion_faq` quedó con la mitad de la comprobación que su gemela de
`contenido_fiscal`.

---

### [MEDIO] Los dos degradados del cierre siguen sin decirle al chofer que su viaje sigue abierto (REINCIDENTE)
`src/lib/likida/processor.ts:3359` (`agente.sin_presupuesto`) ·
`src/lib/likida/processor.ts:3548` (`agent.degradado_a_cuadre`) ·
`src/lib/likida/cuadre/resumen.ts:52-63`.

Sin cambios desde la 22. El chofer escribe «listo»; no alcanza el presupuesto
(`restante() < 15 000`) o el proveedor devuelve 503. Recibe exactamente:
«Este es el cuadre de tu viaje 👇 / • Comprobado: $8,340.50 / • Anticipo:
$10,000.00 / • Sobró $1,659.50 del anticipo». **No hay una sola frase que diga
que el viaje NO se cerró ni que tiene que volver a escribir *listo*.** El
mensaje se sella `'procesado'`, el viaje queda `abierto` y nadie vuelve a
hablar.

Consecuencia: el chofer da por cerrada su liquidación y deja de actuar; el viaje
se queda abierto en el tablero del contralor hasta que alguien lo note a mano.
La rama peor (`:3362`, «Dame un momento y te paso el cuadre») comunica mejor que
la buena.

Causa raíz probable: `resumenCuadre(cerrado:false)` se diseñó para la guardia de
cifras —donde el turno no era un cierre— y se reusó en dos ramas donde el chofer
sí pidió cerrar.

---

### [MEDIO] «pídeselo a tu contralor: él ya lo tiene en el panel» se afirma sin comprobar que haya papel (REINCIDENTE)
`src/lib/likida/processor.ts:1656` ·
`src/lib/likida/conv.ts:229` (`liquidacionRecienteDe` selecciona `id, viaje_id`, nunca `pdf_url`) ·
`src/lib/likida/repo.ts:1072` (`p_pdf_url: pdfUrl ?? null`) ·
`src/lib/likida/tools.ts:350-356` (`subir()` devuelve `undefined` si el upload falla).

Sin cambios desde la 22, y el hallazgo ALTO de arriba lo vuelve más probable:
en la rama de recuperación por base, `pdf.contralor_no_generado` se dispara
siempre. Escenario: el upload del ejemplar del contralor falla
(`logger.warn('pdf.upload')`), el cierre commitea con `pdf_url = null`, el chofer
reenvía, cae en `getOpenViaje === null` y recibe «Tu último viaje ya quedó
liquidado ✅ — … Si no te llegó tu PDF, **pídeselo a tu contralor: él ya lo tiene
en el panel**. 👍». No lo tiene: la columna que alimenta el botón de descarga
está en `null`, y la consulta que decidió el mensaje pudo haberla leído en la
misma fila.

Consecuencia: el chofer va con su contralor por un documento que no existe, y el
contralor descubre en esa llamada que el sistema le afirmó algo que el sistema
mismo ya había registrado como falso.

---

### [BAJO] La recuperación de carrera de `loadConversation` no aprendió la 0274: choque contra el índice nuevo ⇒ excepción dura en vez de relectura
`src/lib/likida/conv.ts:379` (`violaIndice(errInsert, 'wa_conversacion_tenant_tel_uidx')` — solo el índice VIEJO) ·
`src/lib/likida/conv.ts:387` (la relectura sigue con `.eq('telefono', telefono)`, igualdad exacta) ·
`supabase/migrations/0274_…sql` (crea `uq_wa_conversacion_tenant_telefono_norm` y **conserva** el viejo).

La lectura de arriba (`:344`) aprendió `variantesTelefono`; su red de seguridad
no. Escenario: dos invocaciones concurrentes del mismo chofer nuevo entran con
formas distintas del número (`5219993700779` y `529993700779`); las dos leen y no
encuentran fila; las dos insertan. El índice **viejo** `(tenant_id, telefono)` no
choca —los textos difieren— pero el **nuevo**
`uq_wa_conversacion_tenant_telefono_norm` sí. `violaIndice(…, 'wa_conversacion_tenant_tel_uidx')`
devuelve `false`, así que `:380` lanza `ConsultaFallida` en vez de tomar el
camino de relectura; y aunque lo tomara, `:387` busca por igualdad exacta y
tampoco encontraría la fila ganadora.

Consecuencia: el turno se abandona en `procesarTurno`'s catch, el chofer recibe
«No pude consultar tus datos en este momento», el claim se libera y el cron
reintenta contra la misma condición. Es de baja probabilidad (el `wa_id` que
Meta manda es estable por contacto), pero es exactamente el caso que el índice
nuevo existe para atrapar, y ahí el sistema falla duro en vez de recuperarse.

Causa raíz probable: al añadir el índice normalizado no se amplió ni el
clasificador de errores ni la relectura que dependen de su nombre y de su
criterio de igualdad.

---

## Lo que revisé y está bien

- **El aborto del agente SÍ llega al handler, aunque `tools.ts` no lo mencione.**
  `runWithToolSignal` + `currentToolSignal()` en el `fetch` del cliente admin
  (`src/lib/supabase/admin.ts:32-38`, `src/lib/llm/runtime-signal.ts:12-14`)
  cancelan consultas, RPC y subidas a Storage de la tool en vuelo. Es la pieza
  que la 22 no vio y la razón por la que su CRÍTICO no era reproducible tal como
  estaba escrito. Verificado también el caso «señal ya abortada»:
  `combineAbortSignals` propaga el estado abortado (`runtime-signal-shared.ts:15`).
- **`MARGEN_CIERRE_CRITICO_MS` corrige de verdad la identidad de AGEN-A1.**
  `margenDuro() = restante() + MARGEN_CIERRE_MS` sigue siendo cierta
  (`presupuesto.ts:309`, `:316`), pero el chequeo ya no se compara contra la
  reserva entera sino contra los tres pasos `critico` (`presupuesto.ts:175`,
  `processor.ts:3583-3584`). Con `transcurrido = 81 005` ms el chequeo ahora da
  **true** (`margenDuro() = 38 995 ≥ MARGEN_CIERRE_CRITICO_MS = 29 500`), así que
  el aviso «cuadré con los N comprobantes que alcancé a procesar» ya no se apaga
  determinísticamente. `presupuesto.test.ts` verde.
- **El timeout de la tool no puede ganarle al del agente**, así que no hay un
  segundo camino de aborto: `timeoutToolMs(true) = max(genérico, 40 000)`
  (`tool-executor.ts:70-84`) arranca cuando arranca la tool, y el del agente es
  `min(40 000, restante())` desde antes (`run.ts:62`, `processor.ts:3383`).
- **El lease tardío del executor está bien construido**: `keepLeaseUntilSettled`
  observa la promesa real y sella con `completeMutation`/`failMutation` cuando
  asienta (`tool-executor.ts:257-273`), con techo de 10 renovaciones
  (`:194-206`) y `.unref()`.
- **El sello de idempotencia ya no puede tumbar un cierre hecho**: el
  `completeMutation` del camino de éxito vive en su propio `try`
  (`tool-executor.ts:245-249`) y su fallo degrada a repetir trabajo, no a
  reportar fracaso.
- **Mutex de cierre con tercer estado y re-verificación**: `intentarLockViaje`
  distingue `ocupado` de `indeterminado`, falla cerrado con el texto correcto
  para cada caso y suelta el claim (`processor.ts:3254-3278`); el doble «listo»
  se re-verifica DESPUÉS del lock (`:3282`).
- **El «listo» viejo no cierra el viaje nuevo**: `viajeAbiertoDesdeMs` es
  fail-open y solo se consulta para texto que parece cierre con hora de Meta
  (`processor.ts:3194-3204`).
- **El cierre lo pide el humano**: `cierrePedidoPorTexto` se calcula sobre el
  texto (`processor.ts:3380`) y la tool LANZA sin la marca (`tools.ts:234-241`);
  el cierre en ceros exige confirmación expresa y cuenta sobre el mismo cuadre
  que se persiste (`tools.ts:305-315`).
- **Snapshot del cierre en la guardia**: cuando `guardar_liquidacion` corrió
  limpio, se narra el `liq` que la tool devolvió, no otra lectura
  (`guardia.ts:70-73`, `:107`). Los cuatro llamadores de `resumenCuadre` hacia
  WhatsApp pasan `'operador'` explícito: ningún veredicto `SOLO_CONTRALOR` llega
  al chofer.
- **Las rutas de PDF se reinician entre las dos impresiones** (BE-2 de la 22),
  así que un CU003 no archiva el papel viejo (`tools.ts:342-343`).
- **Prompts**: ni el de liquidación ni el del analista autorizan narrar cifras
  propias, y los dos declaran el texto del usuario como dato y no instrucción
  (`prompts.ts:36-42`, `:97-101`).
- **Orden por chofer**: webhook y cron agrupan por remitente, corren en serie
  dentro de cada cadena y `break`ean en vez de saltarse un mensaje no terminado
  (`route.ts:336-419`, `drenado.ts:74-140`); `sin_tiempo` devuelve el intento en
  vez de gastarlo en los dos caminos.
- Suite verde en lo que toqué: `processor_cierre_parcial.test.ts`,
  `presupuesto.test.ts`, `intake/rafaga.test.ts` — 55 pruebas.

## Lo que NO alcancé a revisar

- **La rama nueva de AGEN-C1 no tiene prueba y su arnés no la puede tener sin
  tocarse**: `processor_cierre_parcial.test.ts` construye el
  `PartialExecutionError` siempre con `guardar_liquidacion` **exitoso** (`:143`),
  así que el `if` de `processor.ts:3473` nunca corre; y el mock de `repo`
  (`:78-97`) ni siquiera exporta `getLiquidacionDeViaje`. Verificarlo es del
  rubro de pruebas, pero lo dejo anotado porque explica cómo el ALTO de arriba
  entró en verde.
- No pude **medir** cuánto tarda `guardar_liquidacion_tx` en producción, así que
  la probabilidad del CRÍTICO (que el RPC pase de `TOPE_CONSULTA_MS`) queda
  argumentada, no cuantificada. La asimetría que reporto —el `catch` pregunta a
  la base y el camino feliz no— no depende de esa medición.
- El **runner nivel 2** solo lo recorrí por las compuertas de gasto y el
  despacho (`runner.ts:560-800`). Los ciclos internos de los siete motores
  (`leads.ts`, `crecimiento.ts`, `ingenieria.ts`, `backoffice.ts`, `direccion.ts`)
  y el punto de muerte del **`enviador`**, que se auto-aprueba y manda correo
  real, siguen sin recorrer — tercera ronda consecutiva.
- El ciclo de **soporte** (`likida/soporte.ts`) y el del **cotizador**
  (`cotizador/lector.ts`) como máquinas de estado multi-turno.
- El camino de **nota de voz** (`voz_transcrita.ts`) y el de **botones**
  (`acuse_ticket`, `asi_ok:<uuid>`).
- El **copiloto de /admin** solo lo verifiqué de lectura en la ronda anterior; no
  lo volví a recorrer esta vez.
