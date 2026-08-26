# Sistema agéntico — auditoría 19 c2

**Nota: 4/10** (antes 4). Razón del movimiento: *se atacó y subió* **compensado por**
*deuda que cobró factura*. El lease con fencing (0187) es el mejor trabajo estructural
que ha visto este rubro: cierra de verdad el envenenamiento del claim que convergieron
tres auditores en la ronda 18, y lo cierra en las DOS capas (`wa_evento_pendiente` y
`wa_mensaje_procesado`), con el reloj en Postgres y orden causal por chofer impuesto en
la base. Eso solo valía +1. Pero la misma tanda entregó tres estados nuevos donde la
base dice una cosa y el chofer cree otra —el acuse por foto, el cierre committeado que
se reporta como fallido, y el tope de dinero calibrado con caracteres—, y los **cuatro**
hallazgos abiertos de la ronda 19 siguen ahí letra por letra. Neto: cero.

**El riesgo mayor del rubro, hoy:** el peldaño `acusar` se cableó contra un modelo de
concurrencia que producción ya no tiene. Desde el 23-ago los mensajes de UN chofer se
procesan **en serie**, así que la barrera de ráfaga nunca ve más de una foto en vuelo:
un fajo de 22 comprobantes ya no produce un resumen, produce **23 mensajes seguidos**.
Es exactamente el antipatrón que el propio módulo declara «un producto roto»
(`processor.ts:1893`), en la pantalla del demo.

---

## Los cuatro hallazgos abiertos de la ronda 19, verificados contra el árbol de hoy

| # | Estado | Evidencia |
|---|---|---|
| **AGEN-19-1** (CRÍTICO) | **REINCIDENTE, sin una línea de cambio** | `git diff 8b43121 origin/master -- src/app/dashboard/onboarding/ src/lib/likida/perfil/ src/lib/saas/fiscal.ts` devuelve **solo** `entrevista-agente.ts | 3 +++` (una línea de `budget`). `chat.tsx:130` sigue siendo el único `useState`, `:168` el único `setDocumento(...)`, `:376` el único que lo limpia, `:268` sigue mandando `documento` en cada turno; `route.ts:46-49` sigue concatenando 16,000 caracteres al `ultimo`; `entrevista.ts:694-699` sigue con `if (s.length < 3 …) …; return { razonSocial: s.slice(0,254) }`; `fiscal.ts:150-153` sigue validando solo `length < 3`. |
| **AGEN-19-2** (ALTO) | **REINCIDENTE** | `grep -rn dedupe_key src/` sigue devolviendo **cero líneas** (la columna existe en `0180:69`). `wa_outbox.ts:14-23` sigue insertando `{ payload, ultimo_error }` y nada más. Los ocho `encolarSalidaWhatsApp` de `meta/client.ts` (`:180, 194, 323, 334, 385, 393, 474, 482`) siguen devolviéndole fallo a su llamador. |
| **AGEN-19-3** (ALTO) | **REINCIDENTE** | Ídem: `sendText → null` sigue significando «no llegó» para `saveConversation` e `intentosConfirmacion`, y el outbox sigue entregándolo un minuto después. |
| **AGEN-19-5** (ALTO) | **REINCIDENTE** | `chat.tsx:321` sigue diciendo, textual: *«Se cortó la conexión. No guardé nada. Repite la respuesta o usa el formulario.»*, y `route.ts:79` sigue emitiendo `{t:'error'}` después de que `guardarPerfilPatch` ya escribió. |

Y de los diez reincidentes de la c4 que quedaban vivos, ninguno se movió (spot-check
línea por línea): `processor.ts:486` (el `?` de `pidioCerrar`), `:2659-2668` (el `return`
sin `soltarClaim`), `:2733` (`LIKIDA_RECUPERAR_CIERRE_PARCIAL`),
`escalar_viaje.ts:553` (`avisos_enviados: v.avisosEnviados`),
`cobranza.ts:464-466` (el `break` que no suma a `cortadosPorReloj`),
`cobranza_pura.ts:112` (*«Llevas N días … sin mandarme comprobantes»*),
`runner.ts:73` (`.limit(1000)` crudo en `gastoDelDiaUsd`).

---

## Hallazgos

### [CRÍTICO] AGEN-19C2-1 — El acuse por foto llegó a un mundo donde el chofer ya se procesa en serie: 22 comprobantes son 23 mensajes, y el resumen consolidado no puede dispararse nunca
`src/lib/likida/processor.ts:1824, 1935, 1941, 1971, 1893-1897` · `src/app/api/webhook/whatsapp/route.ts:347-349` · `src/app/api/cron/wa-pendientes/drenado.ts:85-86` · `src/lib/likida/intake/rafaga.ts:131-134` · `src/lib/likida/rafaga_consolidada.test.ts:118-122`

El delta convierte el peldaño `silencio` en `acusar` (`acuse_ticket.ts:166, 199`) y anota
el texto en la libreta (`processor.ts:1824`). La libreta lo manda solo si **no hubo
ráfaga**:

```ts
// :1941  const huboRafaga = !!rafaga && (rafaga.vistas > 1 || incrementado > 1);
// :1971  const solo = unicaEntera ?? rafaga.acuses[0];  if (solo) await say(solo);
```

Las dos mitades de `huboRafaga` murieron el 23-ago-2026, cuando el webhook pasó a
agrupar **por chofer** y a recorrer cada cadena en serie:

```ts
// webhook/route.ts:347   await conPool([...porChofer.values()], MAX_EN_PARALELO, async (cadena) => {
// webhook/route.ts:348     for (const f of cadena) {        ← en SERIE dentro del chofer
// drenado.ts:85-86        idéntico en el cron
```

Un chofer = una cadena = una foto en vuelo a la vez. Entonces, foto tras foto:
`intakeDelta(viajeId, +1)` devuelve **1** → `incrementado === 1` → `anotarFoto(viajeId,
true)` **borra la libreta** (`rafaga.ts:132`) → `intakeDelta(-1)` devuelve **0** →
`ultima` → `cerrarRafaga` con `vistas === 1` → `huboRafaga === false` → **se manda el
acuse individual**.

Escenario, con valores. V-2026-0912. El chofer fotografía sus 22 tickets en la
gasolinera y los manda. Recibe, uno tras otro:

```
📸 Voy recibiendo tus comprobantes. Mándalos todos y cuando termines escribe *listo*…
Anotado ✅ Diésel · $2,480.00 · 24/08/2026
Llevas $2,480.00 de $20,000.00 de anticipo.
Anotado ✅ Caseta · $186.00 · 24/08/2026
Llevas $2,666.00 de $20,000.00 de anticipo.
… (20 más)
```

**23 mensajes.** El resumen `📸 Ya revisé tus fotos. En este viaje llevo *22
comprobantes* por *$24,180.00*` (`:1981-1984`) queda inalcanzable, y con él se pierde
`lineaIncidencias`: las tres fotos ilegibles del fajo ya no se enuncian en ningún lado
—la única rama que las dice es la del resumen— y sus $4,200 quedan como anticipo en
contra del chofer.

La prueba que parecería cubrirlo **modela la producción de antes de ayer**:
`rafaga_consolidada.test.ts:119` es `Promise.all(...)`, o sea las 22 fotos entrando a
`processInbound` a la vez, que es justo lo que la serialización por chofer eliminó. Doce
casos verdes describiendo un camino que ya no existe.

Consecuencia. El comentario que este mismo bloque tiene encima lo dice mejor que yo:
*«Perder un acuse es molesto; mandar diecisiete es un producto roto»* (`:1893`). Un
contralor que vea 23 notificaciones por un solo viaje en el teléfono del chofer no
compra; y el chofer aprende a silenciar el hilo por el que después tiene que llegar su
liquidación.

Causa raíz probable: `huboRafaga` se dedujo del paralelismo por mensaje, y el arreglo de
orden por chofer (23-ago) lo quitó sin que nadie volviera a mirar la barrera.

---

### [CRÍTICO] AGEN-19C2-2 — Una RPC de contabilidad convierte un cierre YA committeado en un fallo reportado: el viaje queda liquidado y el chofer lee que no se pudo
`src/lib/llm/tool-executor.ts:184-189, 206-215` · `src/lib/llm/tool-idempotency.ts:81-83` · `src/lib/likida/processor.ts:2698` · `src/lib/likida/repo.ts:979-1000`

El camino feliz del executor ahora es:

```ts
// :182  const result = await raceAbort(handlerPromise, toolSignal);
// :185  if (durable?.kind === 'execute') {
// :186    stopLease();
// :189    await completeMutation(ctx.tenantId, mutationEffectKey(name, ctx), durable.token, result);
// :191  return { success: true, result, … };
```

`completeMutation` **lanza** en dos casos (`tool-idempotency.ts:81-83`): si la RPC
devuelve error —y `acotada()` convierte un tope de 8 s en un `error` por valor
(`presupuesto.ts:160-172`)— o si `data !== true`, o sea si otro worker se llevó el
fencing token. Los dos throws ocurren **después** de que `guardar_liquidacion` ya
devolvió su resultado, y caen en el `catch` de `:194`, que responde:

```ts
return { success: false, result: null, error: mensajeParaElModelo(crudo), … };
```

Escenario, con valores. 14:07, V-2026-0847, el chofer escribe **«listo»**.
`guardar_liquidacion` corre entero: `guardar_liquidacion_tx` (0013) commitea en UNA
transacción la fila de `liquidacion` **y** `viaje.estatus = 'liquidado'`
(`repo.ts:979-993`); los dos PDF suben; `registrarCorrida` anota `ok`. Vuelve el
resultado. En ese instante la RPC `complete_agente_mutacion` tarda más que
`TOPE_CONSULTA_MS` (8 s) porque la base trae carga → `acotada` devuelve
`{data:null, error:'sin respuesta en 8000 ms'}` → `completeMutation` lanza.

Lo que queda:

- en la base: `viaje.estatus = 'liquidado'`, **irreversible** por los triggers 0036/0037,
  con su `liquidacion` y sus dos PDF en Storage;
- en `processor.ts:2698`: `closed = res.toolCalls.some(t => t.toolName === 'guardar_liquidacion' && !t.error)` → **`false`**, porque `t.error` viene lleno;
- por lo tanto **no** se manda el PDF al operador, **no** corre `avisarCierreAlJefe`
  (`:3079`), **no** se vinculan los costos (`:2701`);
- y al modelo le llega un error de tool, así que le explica al chofer que la liquidación
  no se pudo cerrar.

El chofer se baja del camión creyendo que su viaje sigue abierto, sobre un viaje que ya
no admite un solo comprobante más. El contralor no recibe nada: para él ese cierre no
existió. Si el chofer vuelve a escribir «listo», el claim durable devuelve `busy`
durante los 120 s del lease (`tool-executor.ts:150-152`) y el modelo se lo vuelve a
negar; pasados los 120 s se re-ejecuta y ahí sí recupera —pero eso son dos minutos de
un producto que acaba de decirle que falló.

Consecuencia. Es literalmente el ancla de «3 o menos» del rubro: existe un estado donde
la base dice una cosa y el usuario cree otra, sobre la única acción irreversible del
sistema, y el disparador es una escritura de contabilidad que no toca el dinero.

Causa raíz probable: el sello del fencing se puso **dentro** del mismo `try` que decide
el éxito de la tool, así que un fallo de bookkeeping tiene la misma voz que un fallo del
efecto.

---

### [ALTO] AGEN-19C2-3 — El deadline nuevo de 15 s por tool le queda corto justo a la única tool irreversible
`src/lib/llm/tool-executor.ts:59-62, 112, 174-183, 199-215` · `.env.example:122` · `src/lib/likida/tools.ts:316-390` · `src/lib/supabase/admin.ts:32-38`

`executeTool` ahora arma `combineAbortSignals(ctx.signal, signal, timeoutSignal(timeoutToolMs()))`
(`:112`) con `timeoutToolMs()` = **15,000 ms** por default y por `.env.example:122`, y
corre `raceAbort` contra la promesa del handler (`:182`). Antes de este delta `ctx.signal`
existía pero **ningún handler lo leía** —el comentario borrado lo decía con todas sus
letras— así que el techo real de una tool era el del agente: `reloj.acotar(40_000)`
(`processor.ts:2687`).

`guardar_liquidacion` hace, en serie: `computeCuadre` + `getViaje` + `getOperador`,
**dos** generaciones de PDF, **dos** subidas a Storage, `guardar_liquidacion_tx` y
`registrarCorrida` (`tools.ts:316-408`). Para un viaje de 22 comprobantes eso no es un
tope holgado: es el mismo orden de magnitud que el deadline. Y a diferencia del resto,
esta tool no se puede reintentar sin consecuencias.

Dos formas de terminar mal, las dos hoy alcanzables:

1. **El aborto cae después del commit.** `admin.ts:35-37` sí hereda la señal ambiental,
   así que el `fetch` de PostgREST se cancela — pero cancelar el HTTP no revierte lo que
   Postgres ya escribió. `guardar_liquidacion_tx` commiteado + respuesta cancelada =
   viaje liquidado y tool en error, o sea el mismo estado del hallazgo anterior.
2. **`generarPdfs` se traga el aborto.** Su `catch` (`tools.ts:359-361`) solo escribe
   `logger.error('pdf.gen')` y sigue, así que una señal que vence durante la subida deja
   `pdfPath`/`pdfOperadorPath` en `undefined` y el flujo continúa hacia
   `saveLiquidacion(…, undefined, …)`.

Y el rescate que el código sí escribió —`keepLeaseUntilSettled` (`:200-213`), que espera
a que la promesa tardía asiente para sellar o fallar el efecto— **no corre en Vercel**:
en cuanto `processInbound` y el `after()` resuelven, la invocación se congela y ese
`.then()` nunca se ejecuta. La fila durable se queda en `running` con su lease de 120 s y
el chofer recibe `busy` mientras tanto.

Consecuencia. Se le recortó de 40 s a 15 s el presupuesto a la única operación que no
se puede deshacer, y el modo de falla que eso abre es el que el rubro llama «se trabó».

Causa raíz probable: el deadline se declaró uniforme por tool sin distinguir lectura de
mutación irreversible; el único `isMutation` del repo es también el más lento.

---

### [ALTO] AGEN-19C2-4 — El tope de dinero nuevo se calibra con CARACTERES donde van tokens: una foto reserva 20–40× su costo, un fallo se cobra la reserva entera, y una invocación muerta la deja pegada al día
`src/lib/llm/openrouter.ts:342, 515, 838-841, 528, 538` · `src/lib/llm/budget.ts:66-69, 77-78, 104` · `supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:60-71` · `src/lib/likida/processor.ts:1046, 1333`

La reserva se estima así, en los tres puntos:

```ts
// :515  reserveLlmBudget(opts.budget, calcCost(m, Math.max(1, JSON.stringify(body.messages).length + …), maxTokens))
// :840  const inputUpperBound = … JSON.stringify(body.messages ?? '').length + JSON.stringify(body.tools ?? '').length;
```

`calcCost(model, tokIn, tokOut)` es `(tokIn * $/M + tokOut * $/M) / 1e6`
(`openrouter.ts:255-259`): su primer argumento son **tokens**. Se le pasan **caracteres**
de un JSON que, en el camino del OCR, **contiene la foto entera en base64**:
`generateStructured` mete `images` dentro de `body.messages` (`:463-476`) antes de
estimar.

Escenario, con valores. Foto de ticket de WhatsApp, 150 KB → data URL de ~205,000
caracteres. `role: 'ocr'` → `google/gemini-3.1-flash-lite`, $0.25/M de entrada
(`PRICES:194`). Reserva = 205,000 × 0.25/1e6 ≈ **$0.051**. El costo REAL de ese OCR es
~$0.0016 (el propio repo lo tiene medido, `openrouter.ts:189-193`): la reserva es **32×**.

En el camino feliz da igual —`settleLlmBudget` ajusta a lo real—, pero:

- **Un fallo cobra la reserva completa a propósito**: `attempt` hace
  `settle(reservation?.amountUsd ?? 0)` en el `catch` de la llamada (`:528`) y
  `settle(reservation.amountUsd)` cuando el proveedor omite `usage` (`:538`). Un ticket
  que rebota tres veces (intento, nota, fallback) le carga a la flota ~$0.15 por un
  trabajo que costó $0.005.
- **Una invocación muerta deja la reserva pegada para siempre.**
  `llm_presupuesto_reserva` no tiene lease ni expiración, y
  `reservar_presupuesto_llm` suma `estado in ('reservado','liquidado')` (`0186:60-71`).
  Una lambda que muere después de reservar deja $0.05 inflados contra el día del tenant
  y nadie los libera nunca.
- **El día es UTC, no de México**: `created_at >= date_trunc('day', now())` (`0186:66`),
  mientras todo el resto del repo cuenta con `hoyMx()` (`runner.ts:65`). El tope se
  reinicia a las 18:00 hora de la flota.

Cuando el tope de `$5.00/día/tenant` (`budget.ts:69`, `.env.example:125`) se agota,
`reserveLlmBudget` lanza `LlmBudgetExceededError` — y **nadie en el camino del chofer lo
distingue**: `grep -rn LlmBudgetExceededError src/` fuera de `budget.ts` devuelve un solo
llamador, `runner.ts:110`. En el OCR cae en el `catch` de `ocr.ts:355` → motivo
`fallo_tecnico` → el chofer lee *«se me trabó de mi lado ⚙️ (no es tu foto; la guardé y
no se pierde) … Reenvíamela en un rato y la dejo bien 📸»*. Reenvía, y vuelve a pasar,
todo lo que queda del día UTC. En el cuadre, el throw sube por `runAgent` y sale el «se
trabó» genérico. Ni un correo, ni una alerta, ni una línea en `/admin` que diga «esta
flota se quedó sin presupuesto de IA».

Consecuencia. El único tope duro de dinero del producto se dispara por VOLUMEN DE BYTES
y no por gasto, y cuando se dispara le miente al chofer diciéndole que es transitorio.
Además el ledger que `/admin` va a leer sobreestima el costo por liquidación justo en el
caso que más importa medir: el que falla.

Causa raíz probable: la cota se documentó como «conservadora» (`:837-839`) sin notar que
en el camino de visión el «carácter» que se cuenta es base64 de una imagen, no texto.

---

### [ALTO] AGEN-19C2-5 — El Redactor quedó sin un solo llamador que pueda arrancarlo, y el cron reporta verde
`src/lib/likida/agentes/runner.ts:126-136, 176-180` · `src/app/api/cron/runner/route.ts:30, 35` · `src/lib/agents/copiloto-acciones.ts:153`

`correrRunner` ganó un cuarto parámetro y una compuerta fail-closed:

```ts
// runner.ts:135   budgetTenantId?: string | null,
// runner.ts:178   if (!budgetTenantId) {
// runner.ts:179     agentes.push({ agente: a.id, resultado: 'saltado', motivo: 'sin tenant explícito para presupuesto central — fail closed' });
```

Los **dos** llamadores de producción lo omiten: `cron/runner/route.ts:30` es
`await correrRunner()` y `copiloto-acciones.ts:153` es `await correrRunner(soloAgente)`.
No hay ningún tercero (`grep -rn correrRunner src/`). O sea que desde este delta el
agente Redactor —el nivel 2 completo— **no puede correr por ninguna vía**.

Y no se nota: `route.ts:35` hace `registrarLatido('runner', 'ok', …)` porque la vuelta
terminó sin excepción, así que `/api/health` y el panel de crons de Vercel pintan verde
sobre un agente apagado. El motivo queda en `logger.info('cron.runner')` recortado a 120
caracteres.

De paso, `reservar_presupuesto_agente` / `cerrar_reserva_presupuesto_agente` (0180)
quedaron sin llamador y `gastoDelDiaUsd` (`runner.ts:64-76`, con su `.limit(1000)` crudo
de AGEN-C3-7) sobrevive solo para pintar una cifra en `copiloto-tools.ts:372`, ya
desconectada del techo que ahora decide.

Consecuencia. Un agente entero se apagó en un commit y el sistema de salud dice que
corrió bien. `runner.test.ts:112` incluso prueba el salto — se probó la compuerta y no
que alguien la pueda abrir.

---

### [ALTO] AGEN-19C2-6 — El prompt que habla con choferes reales y cierra liquidaciones cambió otra vez, y sigue sin compuerta de examen
`src/lib/admin/evals.ts:17-24, 49` · `src/lib/agents/prompts.ts:74-81` · `src/lib/agents/registry.ts:17`

`promptHashActual(agente: 'analista')` está tipada para **un solo** agente y
`getEstadoEvals(agente: 'analista' = 'analista')` también: el `driftDePrompt` que el
panel enseña solo mide `analista_flota`. El prompt `liquidacion` —el que
`runAgent` monta en el turno donde vive `guardar_liquidacion`— no tiene hash, no tiene
corrida y no tiene compuerta.

Este delta le metió un bloque nuevo de cuatro renglones (`prompts.ts:78-81`) que cambia
el comportamiento por default de **todo mensaje abierto o ambiguo** —«hola», «¿qué
pasó?», un emoji— obligando a una llamada de tool antes de contestar. Salió a producción
(`6340aac` lleva `[deploy]`) sin un solo caso de evaluación que lo cubra.

Consecuencia. La regla del repo es «cada vez que cambie el prompt hay que volver a
correr el examen» (`evals.ts:8-12`), y el único prompt del que depende dinero es el que
está exento de ella. Además el cambio agrega una llamada obligatoria de `estado_viaje` a
cada saludo: sobre el tope de rondas y sobre el tope de dinero de AGEN-19C2-4, eso es
gasto nuevo por mensaje que nadie midió.

---

### [MEDIO] AGEN-19C2-7 — El prompt le explica al modelo un comportamiento del producto que el MISMO commit derogó
`src/lib/agents/prompts.ts:79` · `src/lib/likida/acuse_ticket.ts:10-13, 25-38, 166, 199`

`6340aac` cambia `silencio → acusar` y, en el mismo commit, escribe en el system prompt
del chofer:

> POR QUÉ ESTO ES UNA REGLA Y NO UN GUSTO: sus fotos **se procesan EN SILENCIO cuando se
> leen bien** (es a propósito: acusar los ~22 comprobantes de un viaje hace que deje de
> leerlos…)

Es falso desde el mismo commit: `decidirAcuse` ya no devuelve `silencio` en ningún
camino (`acuse_ticket.ts:131` — el tipo `Peldano` ya ni lo admite), y el bloque de
`acuse_ticket.ts:25-38` documenta por qué se retiró.

Escenario. El chofer manda cuatro tickets, recibe cuatro «Anotado ✅», y luego escribe
«¿qué pasó?». El modelo lleva en su system prompt que sus fotos «se procesan en
silencio», así que puede explicarle un silencio que no hubo — o justificar por qué no le
avisó de algo que sí le avisó. Un prompt que describe mal el producto es un prompt que
autoriza al modelo a narrar lo que no ocurrió, que es justo lo que este rubro cuenta.

---

### [MEDIO] AGEN-19C2-8 — La causa raíz del cierre parcial se agravó: el efecto de una tool ya no se puede reintentar durante 120 s y el chofer solo recibe negativas
`src/lib/llm/tool-executor.ts:150-152` · `src/lib/llm/tool-idempotency.ts:4, 41-55` · `supabase/migrations/0188_runtime_idempotencia_clock.sql:71-74`

`claim_agente_mutacion` devuelve `busy` mientras el lease siga vivo, y el executor lo
traduce a `{success:false, error:'la mutación ya está siendo procesada; no se vuelve a
ejecutar'}`. El lease son **120 s** (`tool-idempotency.ts:4`) y la llave del efecto
—`[nombre, tenantId, viajeId, operadorId]` (`tool-executor.ts:244-246`)— **no incluye el
runId a propósito**, así que un turno posterior del mismo chofer sobre el mismo viaje
choca con el claim del turno anterior.

Escenario. La invocación que estaba cerrando V-2026-0847 muere (deploy, OOM, corte de
Vercel) sin renovar nada. El chofer, que no recibió respuesta, escribe «listo» otra vez
a los 30 s: `busy`. A los 60 s: `busy`. Recién a los 120 s el lease vence y el claim
re-ejecuta. Durante dos minutos el modelo solo tiene un error de tool con el que
contestarle, sobre una tool que él no sabe que existe.

El diseño es correcto (`busy` es mejor que un doble efecto) y la recuperación existe: los
tres leases están escalonados bien —mutación 120 s < claim de mensaje 150 s
(`conv.ts:411`) < pendiente 180 s (`wa_pendientes.ts:27`)—, así que el cron termina
reprocesando el «listo» y `guardar_liquidacion_tx` es idempotente por `unique(viaje_id)`.
Lo que falta es el texto: nadie convierte «está en curso» en algo que un chofer entienda
(«ya lo estoy cerrando, dame un minuto»), y el turno se gasta.

---

### [MEDIO] AGEN-19C2-9 — La carta muerta no le cierra el ciclo a nadie, y el orden causal nuevo la hace bloquear a los 21 mensajes que vienen detrás
`supabase/migrations/0187_wa_evento_pendiente_leases_fencing.sql:96-107` · `src/lib/likida/wa_pendientes.ts:24-26, 263-274` · `src/app/api/cron/wa-pendientes/drenado.ts:120-122, 163` · `src/lib/admin/slo.ts:74-83`

`reclamar_wa_pendiente` impone el orden por chofer en la base con un `not exists` que
—a diferencia del de `listar_wa_pendientes` (`:41-49`)— **no condiciona a que el
anterior esté arrendado**: basta con que exista una fila anterior del mismo `from` sin
procesar y con `intentos < 5`.

Escenario. El chofer manda 22 fotos. La primera falla por algo determinista (el media id
de Meta caducó, el OCR devuelve `fallo_tecnico` que sube como excepción). Cada vuelta del
cron la reintenta y anota el fallo (`anotarFalloPendiente`, que libera el lease de
inmediato), así que a los cinco minutos llega a `intentos = 5`. Durante esos cinco
minutos **ninguna de las otras 21 se puede reclamar**: el `not exists` las bloquea a
todas. Después la primera desaparece del universo: ya no se reclama, ya no se cuenta en
`pendientesPorDrenar`, y su único rastro es el número global de `cartasMuertas()`
(`drenado.ts:163`) que sale en el JSON de un cron.

Lo que sí existe, y hay que reconocerlo: `slo.ts:74-83` pinta «Mensajes de WhatsApp
atorados > 1 h» en el panel de Javier. Lo que no existe es cualquier cierre del ciclo
hacia las dos personas que importan: al chofer nadie le dice que ese comprobante no
entró, y el contralor no tiene forma de saber que a esa liquidación le falta un ticket.
Con el acuse nuevo (AGEN-19C2-1) es peor todavía: recibe 21 «Anotado ✅» y ni una palabra
del que se perdió.

---

### [BAJO] AGEN-19C2-10 — El presupuesto del chat de análisis y el del OCR del chofer comparten la misma bolsa diaria
`src/lib/llm/budget.ts:67-69` · `src/lib/agents/analista.ts:283-285` · `src/lib/likida/processor.ts:1046, 1333` · `src/lib/likida/perfil/entrevista-agente.ts:57`

`createLlmBudget` cae al mismo `LIKIDA_LLM_TENANT_DAILY_BUDGET_USD` ($5.00) para los
cuatro llamadores nuevos: el analista de flota, el chat de onboarding, cada foto del OCR
y cada turno del cuadre. Son cuatro consumidores con perfiles de gasto distintos contra
un solo contador —y el analista ya tenía su propio tope declarado por separado. El
contralor explorando su tablero por la tarde le puede cerrar el OCR al chofer que va en
la carretera, sin que ninguno de los dos vea por qué.

---

## Lo que revisé y está bien

- **El lease con fencing de 0187 cierra el envenenamiento del claim, de verdad y en las
  dos capas.** `claim_wa_mensaje_procesado` (`0187:190-260`) reemplaza el insert crudo:
  una fila sin `completado_en` y con `lease_until` vencido se **re-reclama** como
  `'nuevo'` con token nuevo, así que un worker matado a media corrida ya no sella nada; y
  `complete_wa_mensaje_procesado` / `fail_wa_mensaje_procesado` anclan por
  `lease_token AND lease_owner`, así que el worker viejo no puede completar la fila del
  nuevo. Lo mismo en `reclamar_wa_pendiente` / `completar_wa_pendiente` /
  `fallar_wa_pendiente`. **Esto contesta la pregunta 2 de la ronda: cierra, no mueve la
  ventana.** Y el cableado está completo: `processor.ts:701-711` pide el handle detallado,
  `:736-737` y `:752-753` pasan token y owner, `:741-742` renueva. Los tres TTL están
  escalonados en el orden correcto (120 < 150 < 180).
- **El reloj autoritativo se movió a Postgres.** `clock_timestamp()` en las cinco RPC de
  0187 y en las cuatro de 0188: dos instancias con relojes distintos ya no ven ventanas
  distintas. Es el arreglo correcto al patrón anterior, que calculaba `lease_until` en la
  app.
- **El orden causal por chofer se impone en la base, no solo en el pool.**
  `listar_wa_pendientes:41-49` y `reclamar_wa_pendiente:97-106`: un A2 no se puede
  reclamar mientras A1 siga en pie, aunque el llamador lo pida directo. Es lo que hacía
  falta para que ESC-1 valga entre invocaciones y no solo dentro de una.
- **`raceAbort` no deja rejections sin manejar** (`tool-executor.ts:174-181, 228-246`):
  la promesa del handler queda observada con `.then(ok, err)` antes de la carrera, y el
  listener del `abort` se quita en las dos salidas.
- **La barrera del acuse con BOTÓN se conservó.** El acuse nuevo NO consume
  `MAX_CONFIRMACIONES_SEGUIDAS` (`processor.ts:1820-1822`), y eso está bien argumentado:
  el tope existe para lo que le pide algo al chofer. El problema de AGEN-19C2-1 es la
  barrera de ráfaga, no ésta.
- **El dueño-operador ya no recibe su propia liquidación dos veces.**
  `avisar_cierre.ts:118-136` compara con `variantesTelefono` (52/521) y no con cadenas
  crudas, y `processor.ts:3079` le pasa `telefonoOperador: msg.from`. Arreglo real y
  correcto de un caso medido en producción.
- **`getSystemPrompt` ya no cae al prompt del chofer por default**
  (`prompts.ts:12`): un `systemPromptKey` mal escrito truena en vez de mandarle a un
  contralor el prompt de un chofer.
- **La entrevista sigue sin dejar que el modelo escriba.** `entrevista-agente.ts:41-76`
  no cambió su reparto de responsabilidades; lo único que entró fue el `budget`.
- **`runAgent` sigue teniendo un solo call site** (`processor.ts:2672`), así que no hay
  una segunda puerta al agente que se salte `cierrePedidoPorTexto`.
- Corrí `npx vitest run` sobre `runtime_guards.test.ts`, `tool_idempotency.test.ts`,
  `wa_pendientes_leases.test.ts`, `conv_claim_lease.test.ts`, `rafaga.test.ts` y
  `run.test.ts`: **6 archivos, 50 pruebas, verde**. Ninguna contradice lo de arriba;
  `rafaga_consolidada.test.ts:119` es justamente la que documento como caducada.

## Lo que NO alcancé a revisar

- **`agentes/notificaciones.ts` (1,050 líneas) y `agentes/cola.ts` (444).** Tercera ronda
  seguida que quedan fuera. `cola.ts` es la única puerta de salida de las piezas
  aprobadas y ahora está aguas abajo de un Redactor que no corre (AGEN-19C2-5): habría
  que verificar si el tope diario de envío quedó midiendo algo.
- **`copiloto.ts` / `analista.ts` a fondo.** Verifiqué su cableado de `runId` y `budget`
  (`copiloto.ts:183-193`, `analista.ts:283-285`) y que `copiloto/route.ts:220` sí pasa
  `budgetTenantId`, pero no recorrí sus ciclos con la pregunta de «si muere aquí».
- **El comportamiento REAL del aborto contra PostgREST.** Sostengo que cancelar el
  `fetch` no revierte un `COMMIT` ya ejecutado (es lo que hace peligroso AGEN-19C2-3), y
  eso se comprueba con una base, no leyendo. Sin `.env` ni red aquí, lo que puedo afirmar
  con el código en la mano es que el executor devuelve `success:false` mientras el handler
  ya recibió su resultado.
- **Frecuencia.** AGEN-19C2-2 y -3 dependen de con qué probabilidad la RPC de sello
  excede su tope y de cuánto tarda de verdad `guardar_liquidacion` con 22 comprobantes.
  Los hallazgos se sostienen por el `if`, el `throw` y el `race`; el «cada cuántos
  cierres» no se puede medir desde aquí.
- **Sin render y sin `npm run build`** (prohibidos en esta ronda), así que los 23 mensajes
  de AGEN-19C2-1 los conté en el código y no en una captura de WhatsApp.
