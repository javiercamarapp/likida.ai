# Tool calling — auditoría 19 c2

**Nota: 5/10** (antes 4). Razón del movimiento: **se atacó y subió**. El hallazgo
que el propio rubro nombra —*«una tool que se ejecuta dos veces porque la
deduplicación mira la llamada y no el efecto»*— **está cerrado, y bien**:
`tool-idempotency.ts` + `0188` mueven el claim, la renovación y el fencing a
RPCs `security definer` con `clock_timestamp()` como reloj autoritativo, la
llave se deriva del efecto (`name:tenant:viaje:operador`, `tool-executor.ts:245`)
y no de los args, `isMutation` sin `runId` **falla cerrado y no entra al handler**
(`:121-124`), y si la idempotencia no se puede consultar en producción la tool
**no se ejecuta** (`:143-146`). Además, el `/api/dashboard/onboarding-chat` que
la ronda 19 marcó *sin tope alguno* ahora sí tiene uno
(`entrevista-agente.ts:57`). Eso es trabajo real y sube la nota.

No sube más porque el CRÍTICO de la ronda 19 sigue **verbatim** —
`git diff 8b43121 origin/master -- src/lib/likida/perfil/` toca **un solo
archivo y solo agrega 3 líneas**, ninguna de ellas en `entrevista-aplicar.ts`— y
porque la maquinaria nueva llegó con su propio camino silencioso: el tope duro
existe, pero **nadie lo puede ver y nada degrada cuando se dispara**.

**El riesgo mayor hoy:** el día que una flota agote sus $5 USD del tope duro
—default, sin variable puesta— el producto deja de liquidar por WhatsApp y se
presenta como *«se me trabó el sistema tantito, ¿me reenvías tu último
mensaje?»*, con el respaldo determinístico (RES-15) desconectado porque el error
de presupuesto no se clasifica como transitorio.

---

## Verificación de los abiertos de la ronda 19

| Hallazgo (r19) | Estado | Evidencia leída hoy |
|---|---|---|
| **CRÍTICO** — el configurador persiste la política DE DEMO como declarada | **REINCIDENTE, íntegro** | `entrevista-aplicar.ts:150-171` sin un byte de cambio (`git diff 8b43121 origin/master -- src/lib/likida/perfil/` → solo `entrevista-agente.ts`, +3). `:156` sigue siendo `cfg.politica.find(...)`; `:165` `guardarPolitica`. |
| ALTO — el patch de topes borra `requiereCfdi` | **REINCIDENTE** | `entrevista-aplicar.ts:155-156` idéntico; el literal sigue teniendo dos campos de cuatro. |
| ALTO — la fila fiscal completa se reescribe; `uso_cfdi`→`G03`, `email`→NULL | **REINCIDENTE** | `entrevista-aplicar.ts:138-146`: `usoCfdi: 'G03'` literal en `:142`, `email` de `:135` sigue siendo `undefined` hasta la pregunta 30. `saas/fiscal.ts` sin cambios en el delta. |
| ALTO — el configurador gasta y no deja fila de `llm_costo`, ni tope | **CERRADO A MEDIAS** | El tope **sí** existe ahora (`entrevista-agente.ts:57`, `budget: createLlmBudget(...)`). El registro **no**: `:62-68` sigue devolviendo solo `r.text` y tirando `tokensIn/tokensOut/cost`; `rg registrarCosto src/lib/likida/perfil/` → cero. `getResumenCosto` sigue diciendo `medido`. |
| ALTO — la respuesta del configurador vuelve sin control de salida | **REINCIDENTE** | `entrevista-agente.ts:62` sigue siendo `texto: r.text` verbatim; ninguna guardia entre el modelo y la pantalla. |
| MEDIO — `parecePregunta` mira el texto CON el adjunto pegado | **REINCIDENTE** | `entrevista-agente.ts:8` y `:44` sin cambios. |
| BAJO — «Escribiendo en operadores, unidades y políticas» sin escritura | **REINCIDENTE** | `entrevista-aplicar.ts:91-92` sin cambios. |
| c4: `viajes_flota`/`liquidaciones_flota` llaman `total` al tope | **REINCIDENTE** | `chat-tools.ts:156` `total: vs.length` contra `analytics.ts:994` (`limite = 100`). |
| c4: `motor_fiscal` recorta `porCausa` a 6 sin declararlo | **REINCIDENTE** | `chat-tools.ts:135` `porCausa: r.porCausa.slice(0, 6)`, sin `total` ni `mostrando`. |
| c4: `efectivo_no_elegible` fuera de `ORDEN` | **REINCIDENTE** | `fiscal.ts` `ORDEN` sigue con siete causas y sin `efectivo_no_elegible`. |
| c4: `generarPdfs` puede fallar en silencio | **REINCIDENTE Y AGRAVADO** | `tools.ts:359-361` sigue con el `catch` que solo loguea — y ahora el resultado `parcial` se sella `succeeded` de forma permanente (ver ALTO #4 abajo). |

---

## Hallazgos

### [CRÍTICO] El tope duro de $5/día por tenant apaga el producto sin decirlo: la foto se vuelve huérfano de $0, el cuadre pide reenviar un mensaje que ya no puede funcionar, y el respaldo determinístico no corre

`src/lib/llm/budget.ts:69` (`maxTenantDailyUsd` default 5.00) · `:104` (el throw) ·
`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:63-68` (la suma del día) ·
`src/lib/llm/openrouter.ts:1048` (se envuelve en `PartialExecutionError`) ·
`src/lib/llm/openrouter.ts:178-181` (`isTransientError`) ·
`src/lib/likida/processor.ts:2781` · `:2783` · `:2803` · `:2742` ·
`src/lib/likida/intake/ocr.ts:356` · `:397-407` ·
`src/lib/likida/processor.ts:1046` y `:1333` (una `createLlmBudget` por foto)

**Escenario, con valores.** Flota de ~50 unidades, un día de cierre de semana.
Cada liquidación cuesta $0.03–$0.05 medidos (el número que `models.ts:16` declara
como objetivo), así que el pool de **$5.00 USD** —el default, `.env.example:125`,
que en Vercel puede muy bien no estar puesto— se agota alrededor de la
liquidación 110–150. A partir de ese instante, las **dos** superficies del
operador fallan y ninguna lo dice:

1. **La foto.** `extraerComprobante` recibe su `budget`
   (`processor.ts:1046`/`:1333`); `reserveLlmBudget` lanza
   `LlmBudgetExceededError` (`budget.ts:104`); el `catch` de `ocr.ts:356` lo
   trata como fallo del proveedor y devuelve
   `{ monto: 0, legible: false, motivo: 'fallo_tecnico' }` (`:397-407`). Ese
   huérfano de $0 **nunca se ofrece** —lo dice el propio comentario del
   processor, `:1061` («el filtro `monto > 0` de más abajo») y `:1069` («nunca se
   resuelve y se queda en la sala de espera»)— y al chofer se le pide que
   reenvíe. Reenviar produce exactamente lo mismo. Y la alerta que sí se dispara
   (`ocr.ts:386`, `alertarOperador('ocr.caido')`) le dice a Javier que **se cayó
   el proveedor de visión**, que es falso.
2. **El texto.** `runAgent` → la reserva de la primera ronda lanza
   (`openrouter.ts:845`), el ciclo lo envuelve en `PartialExecutionError`
   (`:1048`) con `tokensIn = tokensOut = 0`, así que ni siquiera se escribe la
   fila de costo del catch (`processor.ts:2742` exige `> 0`). Entonces:
   `transitorio = isTransientError(e)` (`:2781`) evalúa el mensaje
   *«presupuesto de IA agotado para tenant: se requieren $0.090000 USD y el
   límite es $5.000000 USD»* contra `/(?<![$\-\w])(5\d\d|429|408)(?!\.\d)\b/` y
   `/timeout|…|capacity/i` (`openrouter.ts:178-181`). **No casa ninguna** —lo
   verifiqué carácter por carácter: `toFixed(6)` garantiza seis decimales, así
   que cualquier `5\d\d` que aparezca queda seguido de otro dígito y el `\b`
   falla. Resultado: `transitorio = false` → **el bloque de RES-15 (`:2803`), que
   existe justo para contestar con el cuadre determinístico cuando el modelo no
   está disponible, NO CORRE** → el chofer recibe *«Perdón, se me trabó el
   sistema tantito. ¿Me reenvías tu último mensaje?»* (`:2783`) hasta que la base
   cruce la medianoche.
3. **Nadie lo puede ver.** `rg llm_presupuesto_reserva src/` devuelve **un
   comentario** (`api/admin/copiloto/route.ts:29`) y nada más: ni `/admin` ni
   `/dashboard` leen esa tabla. El tope de chat, en cambio, tiene widget y lo
   dice por escrito (`api/dashboard/chat/tope.ts`, encabezado: *«para que el
   widget del sidebar lea EXACTAMENTE el mismo número que frena al endpoint»*).
   El freno más duro del producto es el único invisible.

**Consecuencia.** El día que esto pase —y va a pasar primero en el demo, que es
donde se mandan ráfagas— la flota entera deja de poder liquidar por WhatsApp,
los comprobantes se acumulan como huérfanos sin monto, y el producto se explica
a sí mismo como «se trabó». El motor determinístico que resolvería el 90% del
turno está a tres líneas de distancia y no se enciende.

**Causa raíz probable.** El error de presupuesto se clasifica con el mismo
predicado de red que se escribió para «el proveedor está caído», en vez de con
su propio tipo; y el tope se construyó sin superficie de lectura.

---

### [ALTO] El «día» del tope duro no es el día de México: reinicia a las 18:00 CDMX y no reconcilia con ninguna cifra del panel

`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:66`
(`created_at >= date_trunc('day', now())`) ·
`src/app/api/dashboard/chat/tope.ts:37` (`inicioDiaMxIso(ahoraMs())`)

**Escenario, con valores.** Supabase corre con `TimeZone = UTC`, así que
`date_trunc('day', now())` corta a las **00:00 UTC = 18:00 hora de CDMX**. El
resto del producto ya resolvió esto y usa el día de México: el tope del chat
(`tope.ts:37`), y la lectura de costo de `/admin`. Consecuencias medibles:

- Un turno que arranca a las 17:00 y otro a las 19:00 del mismo día laboral caen
  en **dos «días» de presupuesto distintos**.
- El gasto de la tarde-noche (18:00–24:00), que es cuando los choferes mandan el
  fajo al llegar a patio, se le carga al día **siguiente**.
- Si el contralor pregunta «¿por qué se frenó?», el número que Javier ve en
  `/admin` para «hoy» no puede cuadrar nunca con el que disparó el freno,
  porque cuentan ventanas desplazadas seis horas.

**Consecuencia.** Un rótulo que no es verdad en la superficie donde el repo menos
lo tolera: el dinero. Y hace irrastreable el CRÍTICO de arriba cuando ocurra.

**Causa raíz probable.** El tope nuevo se escribió en SQL con `now()` sin
importar la convención de día que el resto del repo ya tenía resuelta en TS.

---

### [ALTO] Una reserva que no se liquida se queda contra el día del tenant PARA SIEMPRE — y se queda por el monto inflado, no por el real

`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:27-43` (la tabla:
sin `lease_until`, sin expiración, sin índice de limpieza) · `:63-68` (la suma
cuenta `estado in ('reservado','liquidado')`) ·
`src/lib/llm/openrouter.ts:834-842` (`reservarCompletion`) · `:871-877` (el catch
liquida al **monto reservado completo**) · `src/lib/llm/budget.ts:118-129`

**Escenario, con valores.** La reserva se calcula con
`JSON.stringify(body.messages).length + JSON.stringify(body.tools).length`
(`openrouter.ts:840`) — es decir, **caracteres cobrados a precio de token** — más
`max_tokens` completo. Para el ciclo de cuadre (`anthropic/claude-sonnet-5`,
`[2, 10]` por M, `maxTokensCuadre() = 4000`) una ronda con ~12,000 caracteres de
contexto reserva `12000×2e-6 + 4000×1e-5 = **$0.064**` contra un costo real de
~$0.008. Es ~7× de sobre-reserva, y eso está bien mientras se liquide.

Pero: Vercel mata la invocación entre `reservar_presupuesto_llm` y
`liquidar_presupuesto_llm` (o `settleLlmBudget` truena y solo se loguea
`llm.presupuesto_no_liquidado`, `openrouter.ts:866-867`). La fila queda
`estado = 'reservado'` con **$0.064** y **nada la limpia jamás**: no hay
`lease_until` —la tabla gemela, en el MISMO archivo y a 14 líneas de distancia
(`0186:14`), sí lo tiene—, no hay cron, no hay `verificaciones.sql` que la mire,
y ninguna ruta la lee. Ochenta cortes así consumen el día entero de una flota que
no gastó ni un dólar real.

**Consecuencia.** El tope se dispara sin gasto, y cuando se dispara ocurre todo
lo del CRÍTICO de arriba. Peor: se dispara **antes** en el peor momento, porque
lo que deja reservas colgadas es exactamente la carga alta.

**Causa raíz probable.** La reserva tiene apertura y no tiene vencimiento; el
mismo archivo resolvió el problema con lease para la tabla de idempotencia y no
para ésta.

---

### [ALTO] El resultado durable se cachea para siempre: un cierre `parcial` sin PDF ya no se puede regenerar nunca

`src/lib/llm/tool-executor.ts:149-151` (`cached` → `success: true`, sin tocar el
handler) · `supabase/migrations/0188_runtime_idempotencia_clock.sql:69-71`
(`status = 'succeeded'` → `cached`, sin TTL) ·
`supabase/migrations/0186_…sql:4-18` (la fila no expira ni se borra) ·
`src/lib/likida/tools.ts:341` (`if (up.error) { logger.warn(...); return undefined; }`) ·
`:359-361` (el `catch` de `generarPdfs` solo loguea) · `:399` (`estado: pdfPath &&
pdfOperadorPath ? 'ok' : 'parcial'`) · `:411` (`pdf_generado: Boolean(pdfOperadorPath)`)

**Escenario, con valores.** El operador escribe «listo». `guardar_liquidacion`
corre; Storage devuelve error en la subida de los dos ejemplares
(`tools.ts:341`); el `catch` de `:359` **solo loguea**, así que el handler
**retorna normalmente** con `pdf_generado: false` y `pdf_contralor_generado:
false`. `saveLiquidacion` cierra el viaje (`repo.ts:973-978`: *«cierre ATÓMICO e
idempotente»*, `pdf_url = null`). El executor, viendo un retorno exitoso, llama
`completeMutation` (`tool-executor.ts:187`) y la fila queda **`succeeded` con ese
resultado, para siempre**.

El chofer dice «no me llegó el PDF». El modelo vuelve a llamar
`guardar_liquidacion`. El claim devuelve **`cached`** (`0188:69-71`) y
`executeTool` retorna en `:150` **sin entrar al handler**. Mismo
`pdf_generado: false`. Y `generarLiquidacionPDF` se llama desde **un solo lugar
en todo el repo** — `tools.ts:357-358` (`rg`, cero call sites más). Antes del
delta ese reintento SÍ regeneraba y re-subía (`upsert: true`) sobre la misma
ruta, porque `guardar_liquidacion_tx` es idempotente; ahora ya no llega.

**Consecuencia.** La liquidación existe en la base, pero **el papel —el
entregable que el contralor archiva y el que el chofer necesita— se perdió de
forma permanente y no hay ninguna vía dentro del producto para recuperarlo**.
Solo borrando a mano la fila de `agente_mutacion_idempotencia`. Y la señal es
una línea de `agente_corrida` con `estado: 'parcial'`.

**Causa raíz probable.** Se sella como `succeeded` el retorno de la LLAMADA, no
el éxito del EFECTO COMPLETO; un cierre que el propio código llama `parcial`
entra a la caché durable como si fuera `ok`.

---

### [ALTO] El nuevo deadline de 15 s cubre TODO el cierre —cuadre, dos PDF, dos subidas, escritura y bitácora— y su vencimiento vuelve al modelo como «falló» mientras el viaje puede quedar cerrado

`src/lib/llm/tool-executor.ts:59-62` (`timeoutToolMs()`, default **15,000 ms**) ·
`:118` (se combina con la señal del turno; gana la más estrecha) · `:179`
(`raceAbort`) · `src/lib/supabase/admin.ts:35-37` (la señal ambiental ahora corta
**toda** consulta, RPC y subida del handler) · `src/lib/likida/tools.ts:362`
(`await generarPdfs(liq)`) · `:378-388` (el reintento CU003: **segundo** cuadre,
**segundo** par de PDF, **segunda** subida, dentro de la MISMA ventana) ·
`src/lib/likida/processor.ts:2698` (`closed = … && !t.error`)

**Escenario, con valores.** Antes del delta `guardar_liquidacion` corría bajo el
techo del turno (`run.ts:46`, 40 s; `.env.example:121` documenta 60 s). Ahora
hereda **15 s** —2.7× menos— y dentro de esos 15 s caben, en serie:
`computeCuadre` + `getViaje` + `getOperador` + `getDatosFiscales` (cada consulta
con su propio tope de 8 s de `acotada`) + dos renders + **dos subidas a Storage**
+ `saveLiquidacion` + `registrarCorrida`. Si además entra una foto en la ventana,
`conteoDeGastosCambio` dispara el reintento de `:378-388` y **todo eso vuelve a
correr sin reiniciar el reloj**.

Cuando vence: `raceAbort` rechaza, la tool devuelve
`{ success: false, error: 'Tool abortada' }`, el modelo lee un fallo,
`closed = false` (`processor.ts:2698`) → **no se manda el PDF, no se llama
`vincularCostosALiquidacion`**, y al chofer se le dice que no se pudo cerrar.
Mientras tanto el handler sigue vivo y **puede haber committeado**: la prueba
nueva lo fija como comportamiento esperado
(`tool_idempotency.test.ts:115-131`: `success:false` **y** `complete` llamada con
`{ committed: true }`).

**Consecuencia.** El cierre —la única acción irreversible del sistema— pasa a
tener el techo más estrecho del repo, y su vencimiento es indistinguible de un
fallo real para el modelo, para el operador y para el log. Si el chofer reacciona
mandando los comprobantes que le faltaban, el viaje ya está cerrado y no hay
dónde ponerlos.

**Causa raíz probable.** Un único `LIKIDA_TOOL_TIMEOUT_MS` se aplica por igual a
leer una política y a cerrar una liquidación con dos PDF y dos subidas.

---

### [MEDIO] Cuando el proveedor omite `usage`, el costo que se reporta es la reserva inflada — y viaja como cifra medida

`src/lib/llm/openrouter.ts:356-358` · `:363` (`cost: costoContabilizado`) ·
`:840` (la reserva mide CARACTERES a precio de token) ·
`src/lib/likida/agentes/redactor.ts:219-220` (`costoUsd = r.cost`, y de ahí a
`registrarCorrida`)

**Escenario, con valores.** `generateResponse` con `usage` ausente devuelve
`cost = reservation.amountUsd` (`:357`, `:363`), que para el Redactor
(`openai/gpt-oss-120b`, `[0.03, 0.17]`, `maxTokens: 900`) sobre un dossier de
~4,000 caracteres es `4000×3e-8 + 900×1.7e-7 = $0.00027` contra un real de
~$0.00006 — **~4×**. El comentario del código explica por qué el *ledger de
reservas* conserva el monto (correcto, es conservador), pero el valor **sale por
la puerta pública** y `redactor.ts:220` lo escribe como costo de la corrida.

**Consecuencia.** Una estimación —legítima como reserva— se guarda con la etiqueta
de medición. Es exactamente el matiz que `CLAUDE.md` obliga a declarar: *«una
estimación se puede mostrar, pero declarada y con su supuesto a la vista»*. Aquí
no lleva marca. El OCR ya sabe hacerlo bien y lo hace (`ocr.ts:406`,
`noMedido: true`).

**Causa raíz probable.** Se reutilizó el monto de la reserva para dos propósitos
distintos —retener presupuesto y reportar costo— sin la bandera que los separa.

---

### [MEDIO] Un handler que nunca se asienta deja el lease renovándose sin fin y el efecto en `busy` permanente

`src/lib/llm/tool-executor.ts:158-165` (el `setInterval` de renovación) ·
`:196-206` (`keepLeaseUntilSettled = true`; `stopLease` solo vive en el
`.finally` de la promesa tardía) · `:220` (`if (!keepLeaseUntilSettled) stopLease()`)

**Escenario.** Un handler cuya promesa nunca se resuelve —el caso que la propia
suite construye (`tool_idempotency.test.ts:106-112`,
`new Promise(() => undefined)`), aunque allí para una tool que **no** es
mutación—. Con `isMutation`: vence el deadline, se entra a la rama de `:196`,
`keepLeaseUntilSettled = true`, el `finally` de `:220` no limpia, y como
`handlerPromise` nunca se asienta el `.finally(stopLease)` de `:206` tampoco
corre. El intervalo sigue renovando cada 40 s indefinidamente y la fila queda
`running` con lease vivo → **todo intento futuro de cerrar ese viaje devuelve
`busy`** («la mutación ya está siendo procesada; no se vuelve a ejecutar»,
`:153`), sin ventana de expiración.

**Consecuencia.** El viaje de ese chofer no se puede cerrar nunca más desde el
producto. El mitigante real —que las consultas de `admin.ts` tienen backstop de
25 s, y que `unref()` impide que el timer sostenga la invocación— hace esto
improbable, no imposible; y el comentario de `:163-165` muestra que se pensó en
mantener vivo el *worker*, no en detener la *renovación*.

**Causa raíz probable.** La única salida del intervalo cuelga de una promesa que,
por definición del caso, puede no asentarse.

---

### [BAJO] `ctx.mutationKey` está declarado y nadie lo pone

`src/lib/llm/tool-executor.ts:22` (*«Override explícito para una mutación cuyo
efecto no se identifica por viaje»*) · `:245` (`ctx.mutationKey ?? …`)

`rg mutationKey src/` fuera de `tool-executor.ts` → **cero resultados**. La
llave por omisión, `[name, tenantId, viajeId ?? '-', operadorId ?? '-']`, es
correcta para la única mutación que existe hoy porque su efecto SÍ se identifica
por viaje. El día que exista una segunda, el default silencioso será una llave
que puede no describir su efecto — y el punto de extensión que se escribió para
evitarlo no tiene un solo llamador que recuerde usarlo.

---

## Lo que revisé y está bien

- **La regla estructural aguanta y el delta no la tocó — y hay que decirlo con
  precisión: el delta no agrega NI UNA tool.** 31 `registerTool` en `src/` fuera
  de pruebas, el mismo reparto que la ronda 19 (`tools.ts` 4, `chat-tools.ts` 10,
  `analista.ts` 1, `copiloto-tools.ts` 14, `copiloto.ts` 2). `properties: {}`
  intacto en las cuatro de WhatsApp (`tools.ts:35, 97, 140, 211`) y en los dos
  `SIN_PARAMS` (`chat-tools.ts:26`, `copiloto-tools.ts:32`). Las tres únicas con
  parámetros siguen siendo las mismas de siempre (`traza_corrida`, `bitacora`,
  `ficha_cliente`) y ninguna decide sobre dinero. `git diff 8b43121
  origin/master` no lista `tools.ts`, `chat-tools.ts`, `copiloto-tools.ts` ni
  `models.ts`.
- **La deduplicación mira el EFECTO, y ahora también fuera del proceso.**
  `tool-executor.ts:245`: la llave es `name:tenant:viaje:operador`; los args no
  entran (y el comentario de `:279-286` explica por qué, con la condición de
  revisarlo si algún día una tool decide sobre datos). La rejilla en memoria
  cachea la **promesa** antes del `await` (`:293`), así que el `Promise.all` de
  `generateWithTools` no abre ventana; encima de eso, `claimMutation` serializa
  entre procesos con `unique (tenant_id, effect_key)` (`0186:17`) y `for update
  skip locked` (`0188:60`). **La pregunta de si dos gastos idénticos se suprimen
  no aplica: hay UNA sola tool `isMutation` en el repo** (`tools.ts:205`,
  `guardar_liquidacion`), su efecto es «cerrar el viaje V» y cerrarlo dos veces
  es precisamente lo que hay que impedir. No hay ninguna tool que dé de alta un
  gasto.
- **El reloj es el de PostgreSQL, no el del proceso.** `0188` calcula
  `lease_until` con `clock_timestamp()` en las cuatro RPCs (`:23`, `:44`, `:81`,
  `:114`, `:140`, `:168`); el cliente solo manda **una duración en segundos**
  acotada a `[1, 900]` (`tool-idempotency.ts:13-17`), y la migración la vuelve a
  validar server-side (`0188:33-35`, `:110-112`). Construí el escenario del reloj
  adelantado: no hay nada que enviar que lo exprese —`tool_idempotency_clock.test.ts:41-46`
  asserta literalmente que los args no llevan `p_lease_until`—, así que un worker
  con el reloj corrido **no puede** liberar una reserva viva. Cerrado.
- **El fencing se respeta en la escritura, no solo en el reclamo.**
  `complete_agente_mutacion` y `fail_agente_mutacion` (`0188:142-145`,
  `:166-169`) exigen `owner_token = p_owner_token AND status = 'running'`, y el
  cliente **lanza** si el update no encontró fila (`tool-idempotency.ts:82`,
  `:93`). `renew` además exige `lease_until > clock_timestamp()` (`0188:120`): un
  lease ya vencido y robado no se puede resucitar.
- **Fallar cerrado, en dos puntos nuevos y correctos.** `isMutation` sin `runId`
  → la tool no se ejecuta (`tool-executor.ts:121-124`, con prueba en
  `tool_idempotency.test.ts:30-42`). Idempotencia no consultable en producción →
  la tool no se ejecuta (`:143-146`). El escape de `NODE_ENV === 'test'`
  (`:136-142`) está acotado al entorno de pruebas y documentado.
- **La atribución de costo sobrevive al fallback.** `completion` reserva con
  `activeModel` (`openrouter.ts:845`) y `activeModel` ya vale el fallback cuando
  se reintenta (`:904-905`), así que la reserva y la liquidación se hacen al
  precio del modelo que de verdad respondió; `costoPorModelo` (`:779-782`) sigue
  partiendo el gasto por modelo y `processor.ts:2710-2716` escribe una fila de
  `llm_costo` por modelo cuando el ciclo cruzó de proveedor.
- **El tenant que paga no sale de una variable de entorno.**
  `requireLlmBudgetTenant` (`budget.ts:43-51`) rechaza vacío y en producción
  exige UUID; `copiloto.ts:177-193` toma el tenant de la sesión
  (`api/admin/copiloto/route.ts:220`) y deja `ctx.tenantId` vacío a propósito
  para que una tool que lo leyera truene en vez de leer la flota equivocada.
  `runner.ts:178` rechaza sin tenant. Es la decisión correcta y está escrita.
- **La cancelación llega hasta el socket.** `runWithToolSignal` instala la señal
  como ambiental y `supabase/admin.ts:35-37` la combina en el `fetch` del cliente
  service-role, con la señal más estrecha (`acotada`, 8 s) ganando. Y las
  escrituras de idempotencia se hacen **fuera** de esa señal
  (`runWithToolSignal(undefined, …)`, `tool-executor.ts:187`, `:203-204`,
  `:209`), que es lo único que impide que un timeout se lleve por delante el
  sello del fencing. Ese detalle está bien pensado.
- **La compuerta corre.** `npx vitest run src/lib/llm/` → **26 archivos, 115
  pruebas, todas pasando**. `npx vitest run src/lib/likida/tools_*.test.ts` → 5
  archivos, 31 pruebas, pasando. `npx tsc --noEmit -p .` → limpio.
- **El error crudo de Postgres sigue sin cruzar hacia el modelo**
  (`tool-executor.ts:97-104`), y los mensajes nuevos (`:153`, `:145`) son de
  negocio, no de base.

## Lo que NO alcancé a revisar

- **El SQL de `0186`/`0188` contra una base real.** Las tres pruebas de migración
  (`migration_0186/0187/0188.test.ts`) son `expect(sql).toContain(...)` sobre el
  texto del archivo — verifican que la cadena esté escrita, no que la función
  haga lo que dice. No hay pgTAP para estas dos (sí lo hay para el lease de
  WhatsApp, `supabase/tests/wa_leases_fencing.sql`). En particular no pude
  ejercitar el camino `insert … on conflict do nothing` + `for update skip
  locked` bajo concurrencia real, que es donde vive la diferencia entre `busy` y
  `execute`.
- **Cuánto tarda de verdad `guardar_liquidacion` en producción.** Razoné el
  presupuesto de 15 s leyendo el código (pdf-lib es rápido; lo caro es la red:
  cuatro consultas + dos subidas + una RPC, más el reintento CU003 que lo
  duplica). No tengo una medición. La conclusión del hallazgo —que el techo bajó
  de 40 s a 15 s y que su vencimiento se le presenta al modelo como fallo— no
  depende de la magnitud.
- **Si algún camino cierra el mismo viaje con un `operadorId` distinto** (cuenta
  de oficina cerrando por el chofer). La llave del efecto incluye `operadorId`
  (`tool-executor.ts:245`), así que ese caso esquivaría la deduplicación durable
  y quedaría solo con el backstop de `unique(viaje_id)`. No pude fijar que ese
  camino exista sin recorrer las ~2,900 líneas del processor, y no reporto lo
  que no verifiqué.
- **`ficha_cliente` y su `.ilike` sin sanear** (`copiloto-tools.ts:341`): cuarta
  pasada sin poder acotar un daño concreto. Sigue anotado como la asimetría
  contra `admin/bitacora.ts:51`.
- **Si `cache_control` sobrevive al fallback cross-provider**
  (`openrouter.ts:761` decide con el modelo primario). Sin red, igual que en la
  ronda anterior.
- **La cobertura de la invariante de schemas sigue en 10 de 31 tools**
  (`chat-tools.test.ts:89-94`; `copiloto-tools.test.ts` sin una sola aserción de
  schema). Lo dejo como reincidente de la c4 y no lo vuelvo a levantar como
  hallazgo nuevo.
