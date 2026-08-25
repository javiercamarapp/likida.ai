# Backend y API — auditoría 19 c2

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura**, en la
forma exacta que el ancla del rubro anticipaba pero con el signo invertido. La
ronda anterior dijo *«la superficie nueva no hereda los guardas»*. Esta vez el
guarda nuevo —el presupuesto duro de `0156cf3`— **sí** se cableó al camino del
dinero, y lo rompió: se cableó sin medir sus propias unidades. Y de los siete
ALTOS abiertos que traía el rubro, **cero** se tocaron.

Lo que sí subió, y hay que decirlo porque es real: el CRÍTICO del kill switch
está cerrado **con prueba que lo reproduce** (`dae7f64`,
`cron/wa-outbox/route.test.ts`, 4 casos); `/api/dashboard/ingesta` recibió sus
tres capas completas (rate limit, tope diario que falla cerrado, fila de costo);
y el lease con fencing de la 0187 **sí cierra** el envenenamiento de la ronda 18,
con 33 aserciones de pgTAP que CI ejecuta de verdad. No alcanza a compensar un
CRÍTICO nuevo en el minuto 2 del demo.

El riesgo mayor del rubro hoy: **el chofer fotografía su ticket con un celular
moderno, la foto pesa 1.6 MB, y Likida contesta "no pude leer tu comprobante"
sin haber llamado al modelo ni una vez — porque el presupuesto de IA cuenta los
caracteres del base64 como si fueran tokens y calcula que esa foto cuesta $1.00
USD contra un techo de $0.50.**

---

## Hallazgos

### [CRÍTICO] La reserva de presupuesto mide el input en CARACTERES: toda foto de más de ~1.5 MB se rechaza antes de llamar al modelo, y el chofer lee «fallo técnico»

`src/lib/llm/openrouter.ts:515` · `:255-259` (`calcCost`) · `:194` (`PRICES`) ·
`:837-841` (el comentario que declara la intención) ·
`src/lib/llm/budget.ts:64-69,77-79` ·
`src/lib/likida/processor.ts:1046,1333` ·
`src/app/api/dashboard/ingesta/route.ts:80` ·
`src/app/api/dashboard/ingesta/limites.ts:24` ·
`src/lib/likida/intake/ocr.ts:346-356,397-401`

La reserva se calcula así (`openrouter.ts:515`):

```ts
calcCost(m, Math.max(1, JSON.stringify(body.messages).length + JSON.stringify(jsonSchema).length), maxTokens)
```

`calcCost(model, tokIn, tokOut)` (`:255-259`) hace `(tokIn * precioIn + tokOut *
precioOut) / 1_000_000`: su segundo argumento son **tokens**. Lo que se le pasa
es la **longitud en caracteres** del JSON de mensajes. El comentario de `:837-839`
lo declara a propósito —«cada carácter puede representar un token en entradas
JSON/URLs. Se sobre-reserva y luego se liquida al costo real»—, y para texto es
una cota conservadora sana (~4×). **Para una imagen no lo es**: `generateStructured`
mete el data-URL base64 completo dentro de `body.messages`
(`:466-476`, `image_url: { url }`), y un modelo de visión cobra una imagen a
tarifa fija de unos cientos de tokens, no por byte.

Escenario, con valores. El OCR corre con `google/gemini-3.1-flash-lite`
(`models.ts:69`), precio `[0.25, 1.5]` por 1M (`openrouter.ts:194`).
`DEFAULT_MAX_TOKENS = 4000` (`:73`). `maxRunUsd` por defecto es **$0.50**
(`budget.ts:66`), y `reserveLlmBudget` lanza **antes de tocar la base y antes de
tocar al proveedor** cuando `reservadoRunUsd + amountUsd > maxRunUsd`
(`budget.ts:77-79`):

| data-URL | reserva estimada | ¿pasa el techo de $0.50? |
|---|---|---|
| 200,000 car. (≈146 KB) | $0.0530 | sí |
| 1,000,000 car. (≈730 KB) | $0.2530 | sí |
| **1,976,000 car. (≈1.44 MB)** | **$0.5000** | **umbral** |
| 3,000,000 car. (≈2.2 MB) | $0.7530 | **no** |
| 4,000,000 car. (≈2.9 MB) | $1.0030 | **no** |

El costo REAL de esa llamada, medido y anotado en el propio repo
(`openrouter.ts:192`), es **~$0.0016**.

Dos caminos concretos:

**(a) La sonda del panel.** `ingesta/limites.ts:24` fija `MAX_DATAURL =
4_000_000` y su docstring dice, textual, que eso son *«~3 MB de imagen — una foto
de celular normal cabe»*. La ruta valida ese tope (`route.ts:58-62`), pasa el
tope diario, y en `:80` llama `extraerComprobante(imagen, …,
createLlmBudget(tenantId, randomUUID()))`. Con 3 MB de data-URL la reserva pide
$0.75 → `LlmBudgetExceededError('run')` → el `catch` de `:106-109` contesta
**502 «no se pudo leer la imagen en este momento»**. Dos límites del mismo
request se contradicen dentro del mismo archivo: uno admite 4 MB, el otro corta
en 1.98 MB.

**(b) WhatsApp, que es el producto.** `processor.ts:1333` (y `:1046` para la foto
sin viaje) llaman `extraerComprobante(dataUrl, reloj.senal(25_000),
createLlmBudget(op.tenantId, randomUUID()))`. `downloadMediaAsDataUrl`
(`meta/client.ts:539-557`) **no reescala ni acota nada**: convierte el binario de
Meta a base64 tal cual. `generateStructured` intenta el modelo, reintenta con
nota y —si el error fuera transitorio— el fallback: **las tres reservas se
rechazan con el mismo cálculo, y en ninguna se llama al proveedor**. El `catch`
de `ocr.ts:355` devuelve `legible: false, motivo: 'fallo_tecnico'` (`:398-401`)
con `costoUsd: 0`. El chofer recibe el mensaje de foto ilegible, vuelve a
tomarla, y falla igual. Encima `vigilante.fallo()` (`ocr.ts:383`) dispara
`alertarOperador('ocr.caido')`: el tablero dirá que el proveedor de OCR está
caído cuando nunca se le habló.

Consecuencia: el camino que define al producto —«manda la foto del ticket por
WhatsApp»— se rompe para cualquier foto de más de ~1.5 MB, que es la foto que
saca un celular moderno en calidad normal. En el demo, la segunda pantalla que
Javier enseña. Y falla **cerrado y mudo**: no hay fila en `llm_costo`, no hay
error de proveedor, no hay rastro de que el presupuesto fue quien dijo que no.

Refutación intentada y descartada: (1) «lo arregla subir
`LIKIDA_LLM_RUN_BUDGET_USD`» — no lo arregla, solo mueve el problema al tope
diario: a $0.25 de reserva por foto, el default de $5.00/día
(`budget.ts:69`) se agota en **20 fotos por flota**, y ahí falla todo el LLM del
tenant, no solo el OCR. (2) «el fallback cross-provider salva» — no: el fallback
solo se intenta si `isTransientError` (`openrouter.ts:611`), y
`LlmBudgetExceededError` no lo es. (3) «pero en el path de `generateResponse`
(`:342`) no hay imágenes» — correcto, y por eso ahí solo hay sobre-reserva de
~4×; el daño está en `generateStructured`, que es justamente el del OCR.

Causa raíz probable: la cota «un carácter ≤ un token» es correcta para texto y
falsa por seis órdenes de magnitud para un data-URL de imagen; el mismo helper
sirve a los dos casos y nadie separó los tokens de visión.

Sin prueba: `budget.test.ts` (7 casos) y `generate_response_budget.test.ts` (1)
no mencionan `images` ni un data-URL; `ingesta/route.test.ts:21` mockea
`extraerComprobante` entero, así que la ruta nunca ejecuta la reserva.

---

### [ALTO] Una llamada de IA abortada liquida la reserva al monto ESTIMADO, no al real, y `llm_presupuesto_reserva` no tiene un solo lector ni barrendero

`src/lib/llm/openrouter.ts:527-530` · `:538` ·
`src/lib/llm/budget.ts:110-129` ·
`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:63-71` y `:81-97`

```ts
} catch (e) {
  await settle(reservation?.amountUsd ?? 0);   // ← el ESTIMADO, no cero
  throw e;
}
```

`settleLlmBudget` (`budget.ts:116`) toma ese número como `real` y
`liquidar_presupuesto_llm` escribe `reservado_usd = costo_real_usd = real`
(`0186:88-91`). La suma diaria del tenant (`0186:63-68`) cuenta
`estado in ('reservado','liquidado')`, así que ese monto queda cargado al día.

Escenario, con valores. Flota de 300 unidades, hora pico de las 19:00. El OCR
corre con `reloj.senal(25_000)` (`processor.ts:1333`); una foto de 200 KB que el
proveedor tarda en contestar se aborta. Reserva estimada $0.053; costo real de
esa llamada, si se cobró, ~$0.0016. Se liquidan **$0.053** — 33×. Noventa y
cinco abortos así agotan los $5.00/día del tenant (`budget.ts:69`) y a partir de
ahí **`reserveLlmBudget` devuelve `false` para todo**: OCR de todos los choferes,
cuadre, chat del panel. Todo falla cerrado, todo el resto del día.

Peor todavía el caso en que la invocación **muere** (Vercel a los 120 s): `settle`
no corre, la fila queda `estado='reservado'` con el estimado inflado, y **nada la
limpia nunca**. `grep -rn "llm_presupuesto_reserva" src/ supabase/` fuera de la
0186 devuelve **una sola línea, y es un comentario**
(`api/admin/copiloto/route.ts:29`): no hay expiración por lease, no hay purga en
`cron/purgar`, no hay pantalla, no hay conteo. El único freno duro de gasto del
producto es una tabla que ningún código lee.

Consecuencia: el techo de dinero que se puso para proteger a Likida se convierte
en el que apaga a Likida, y no hay forma de verlo ni de soltarlo sin entrar a la
base a mano.

Causa raíz probable: liquidar al estimado es el fail-safe correcto para «no sé
qué cobró el proveedor», pero se eligió sin una segunda mitad —caducidad de la
reserva o barrendero— que devuelva el saldo cuando se sabe que la llamada no
ocurrió.

Sin prueba: `budget.test.ts:51` cubre «liquidar es idempotente en el proceso»;
ninguna cubre abortar, ni una reserva que nunca se liquida.

---

### [ALTO · REINCIDENTE] Outbox y llamador reintentan el MISMO mensaje: el chofer recibe tres avisos y la bitácora anota uno

`src/lib/likida/wa_outbox.ts:14-23` ·
`supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:69` ·
`src/lib/meta/client.ts:180,194,323,334,385,393,474,482` ·
`src/lib/likida/escalar_viaje.ts:375,380,393-395`

Verificado hoy contra el código de HOY: `grep -rn "dedupe_key" src/ supabase/`
devuelve **exactamente una línea**, la de la 0180 que crea la columna.
`encolarSalidaWhatsApp` (`wa_outbox.ts:16-18`) sigue insertando solo `payload` y
`ultimo_error`. La escalación sigue encolando por `enviarTexto` (`:375`), otra
vez por `sendTemplate` (`:380`) y soltando el claim (`:393-395`) para que la
corrida siguiente lo repita entero. El escenario del viaje `V-8891` con Meta en
`130429` está sin cambiar en `auditoria-19/backend.md`.

---

### [ALTO · REINCIDENTE] El drenado del outbox sigue sin distinguir rechazo definitivo de transitorio, y la cola de muertos sigue sin un solo lector

`src/app/api/cron/wa-outbox/route.ts:47-53` y `:60-67` ·
`supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:112-114` ·
`src/lib/meta/client.ts:143-153` (`esReintentableMeta`, que el drenado **sigue
sin importar**)

`dae7f64` puso el kill switch antes de reclamar —y eso está bien y probado— pero
el cuerpo del drenado no se tocó. `:49-53` sigue contestando
`finalizarSalidaWhatsApp(s, undefined, 'canal de WhatsApp no configurado')` sin
haber contactado a Meta: con el cron al minuto, una `WHATSAPP_ACCESS_TOKEN`
ausente lleva la fila a `intentos = 8 → 'dead'` en ~2 h. Y `:60-67` trata igual un
`131030` que un `503`.

Nuevo dato de esta ronda: `grep -rn "'dead'" src/` devuelve **cero resultados**.
No hay lector del estado terminal en ninguna parte del repo. La liquidación cuyo
PDF rebotó se declara irrecuperable y nadie se entera nunca.

---

### [ALTO · REINCIDENTE] Cal.com sella la idempotencia ANTES del efecto: un evento que falló a medias no se aplica nunca

`src/app/api/webhook/calcom/route.ts:73` · `:74-82` ·
`supabase/migrations/0181_crm_remediacion.sql:27`

Sin una coma de cambio. `registrarEventoComercial` inserta el ledger, `:73` hace
`return { ok:true, repetido:true }` antes del `update` del prospecto, y
`grep -rn "procesado_en" src/` sigue sin devolver **un solo escritor** de esa
columna (los seis hits son comentarios y `wa_evento_pendiente`). El repo sabe
hacerlo bien en dos lugares y no lo hace aquí: `suscripcion.ts:885-890` sella
después del upsert con la razón escrita, y `llm/tool-idempotency.ts:41-83`
implementa el `claim → ejecutar → complete/fail` de dos fases entero.

---

### [ALTO · REINCIDENTE] El webhook de Cal.com escribe cualquier estado del embudo sin la guardia de transición

`src/app/api/webhook/calcom/route.ts:74-82` ·
`src/lib/likida/vendedores.ts:112,116-118,553-595`

`.eq('id', prospecto.id)` y nada más: sin anclaje al estado leído, sin
`puedeTransicionarFunnel`, y con `if (estado !== 'won') cambios.cerrado_en = null`
en `:78` —condición siempre verdadera, porque `ESTADO_POR_EVENTO` (`:11-16`)
nunca produce `'won'`—. Un `BOOKING_RESCHEDULED` sobre un trato ganado le borra
la fecha de cierre. Escenarios A y B, con valores, en `auditoria-19/backend.md`.

---

### [ALTO · REINCIDENTE] `borrarStorageMarcado` sella como borrado lo que la API NO confirmó

`src/lib/likida/storage_borrado.ts:93`

```ts
const aSellar = nombres.filter((n) => confirmados.has(n) || confirmados.size === 0);
```

Idéntico. Con `remove()` devolviendo `{ data: [], error: null }` sobre 200
candidatos, los 200 se sellan `borrado_en` y `fallidos` queda en 0, contra la
cabecera del propio archivo que prohíbe con mayúsculas exactamente eso. La
asimetría que lo delata sigue ahí: con **una** confirmación de 200 sella 1 y
cuenta 199 fallidos; con **cero** sella 200.

---

### [ALTO · REINCIDENTE] `updateGastoCfdiXml` sigue descartando el `error` de la lectura que hace justo antes de fusionar

`src/lib/likida/repo.ts:746-748`

```ts
const { data: actual } = await acotada(supabaseAdmin().from('gasto')
  .select('ocr_extra').eq('id', gastoId).eq('tenant_id', tenantId).maybeSingle(),
  'updateGastoCfdiXml.leerOcrExtra');
```

`error` sigue sin desestructurar, tres líneas debajo del comentario (`:740-742`)
que explica por qué aquí no se puede escribir a ciegas. Cuarta ronda. El diésel
de USD 450.00 que pierde `moneda`/`tipoCambio` y se cuadra como $450.00 MXN sigue
siendo posible.

---

### [ALTO · REINCIDENTE] El dueño que maneja sigue perdiendo el despacho entero sin recibir una palabra

`src/lib/likida/processor.ts:945`

`{ incluirPreguntaLibre: !viajeId, incluirDespacho: !viajeId }`, sin cambios.
Cuarta ronda.

---

### [MEDIO] El «día» del presupuesto de IA es UTC: se reinicia a las 6 de la tarde en México, mientras todos los demás topes diarios del repo usan el día de México

`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:65`
(`created_at >= date_trunc('day', now())`) · comparar
`src/app/api/dashboard/chat/tope.ts:38` y
`src/app/api/dashboard/ingesta/tope.ts:39`, que usan `inicioDiaMxIso(ahoraMs())`

Escenario, con valores. La flota gasta sus $5.00 entre las 08:00 y las 16:00 del
día 12. A las 16:30 el OCR empieza a fallar cerrado. A las **18:00** (medianoche
UTC en horario de verano) el saldo se renueva solo, a media jornada, y el
contralor que abrió un ticket a las 17:00 preguntando por qué no entraban las
fotos ve que «se arregló solo». Al día siguiente, el mismo corte a las 16:30.

Consecuencia: el producto tiene dos definiciones de «hoy» en el mismo camino del
dinero. La regla de la casa es que un rótulo tiene que ser verdad; «tope diario»
significa dos cosas distintas según qué tope se mire.

Causa raíz probable: `date_trunc('day', now())` toma el `TimeZone` de la sesión
de Postgres, que en Supabase es UTC; el helper de día México vive en TypeScript y
la RPC no lo puede llamar.

---

### [MEDIO] El lease de la 0187 SÍ cierra el envenenamiento — pero la invariante que lo hace seguro no está escrita en ningún lado ni la afirma ninguna prueba

`src/lib/likida/wa_pendientes.ts:27` (`WA_LEASE_SECONDS = 180`) ·
`src/app/api/cron/wa-pendientes/route.ts:22` y
`src/app/api/cron/wa-pendientes/cola/route.ts:10` (`maxDuration = 120`) ·
`src/app/api/webhook/whatsapp/route.ts:114` (`maxDuration = 120`) ·
comparar `src/lib/likida/conv.ts:390` con `src/lib/likida/conv_claim_lease.test.ts:40-43`

Esta es la respuesta a la pregunta central de la ronda, y es que **sí lo cierra**:
un worker vivo no puede ser vallado porque el lease (180 s) dura más de lo que
Vercel deja correr a cualquiera de las tres rutas que lo toman (120 s). Por eso
el proceso zombi que la ronda 18 temía no existe hoy, aunque el camino de
ESCRITURA —`processInbound` y todos sus efectos— efectivamente **no** valide el
token: no le hace falta, porque el que escribe siempre tiene el lease vigente.

El problema es que esa dependencia es tácita. El hermano de al lado sí la escribió
y sí la afirma: `conv.ts:390` documenta que `LEASE_CLAIM_MS` es mayor que
`maxDuration` «a propósito», y `conv_claim_lease.test.ts:40-43` tiene una prueba
titulada *«el lease supera maxDuration con margen»*. Para `WA_LEASE_SECONDS` no
hay ni comentario ni prueba.

Escenario, con valores. Alguien sube `maxDuration` de `cron/wa-pendientes` a 300
—cosa que `cron/facturar/route.ts:36` ya hace— para que el drenado aguante lotes
más grandes. `npx tsc`, `eslint` y las ~2,880 pruebas siguen verdes. A partir de
ahí, un mensaje que tarda más de 180 s pierde su lease en vuelo: otra corrida lo
lista (`0187:35`), lo reclama (`intentos` ya coincide), `claim_wa_mensaje_procesado`
ve el lease downstream vencido (`0187:260`) y devuelve `'nuevo'`, y **dos workers
corren el OCR de la misma foto y le contestan dos veces al chofer**. El primero
descubre que perdió al sellar (`marcarPendienteProcesado → false`,
`drenado.ts:131-134`) — después de haber gastado y hablado.

Consecuencia: el arreglo más caro de la ronda 18 se puede deshacer con un número
en otro archivo, sin una sola señal roja.

Causa raíz probable: el TTL y el `maxDuration` viven en archivos distintos y solo
uno de los dos pares tiene una prueba que los ate.

De la misma familia: el tope de intentos vale `5` hardcodeado tres veces en la
0187 (`:14`, `:34`, `:92`, más `:102`) y una cuarta en TypeScript
(`wa_pendientes.ts:26`, `MAX_INTENTOS_PENDIENTE`, que es lo que `cartasMuertas()`
consulta). Si alguien cambia el de TS, `cartasMuertas` deja de contar las cartas
muertas que la base sí dejó de reclamar.

---

### [MEDIO] Las 33 aserciones de pgTAP no cubren la única transición para la que se escribió la 0187: la recuperación por lease VENCIDO de `wa_evento_pendiente`

`supabase/tests/wa_leases_fencing.sql:6` (`plan(33)`) · `:98-99` ·
`.github/workflows/ci-postgres.yml:166`

Buena noticia primero: el archivo se corre de verdad en CI (`pg_prove --verbose`),
no es decorativo, y cubre lo que dice cubrir — token ajeno no renueva, token
ajeno no completa, dueño completa y limpia, A2 no se lista mientras A1 sigue
arrendado, A2 no se salta A1 reclamando directo, el worker antiguo no completa
después del fencing.

Lo que no cubre: en todo el archivo, `lease_expires_at` no se manipula ni una vez
para `wa_evento_pendiente` (las únicas fechas fabricadas son `recibido_en`,
`:98-99`). La recuperación tras expiración **sí** está probada para
`agente_mutacion_idempotencia` (*«un worker puede recuperar un lease vencido según
PostgreSQL»*) y **no** para la bandeja de WhatsApp ni para
`wa_mensaje_procesado`. El caso probado más cercano es *«otro worker puede
recuperar después de fail fenced»*, que es la liberación limpia, no la muerte.

Escenario que nadie ejerce: la invocación muere a los 120 s sin llamar a
`fallar_wa_pendiente`; a los 180 s el lease vence; ¿la fila vuelve a
`listar_wa_pendientes` con el `intentos` correcto y `reclamar_wa_pendiente` la
acepta? Por lectura, sí. Por prueba, no consta — y es literalmente el escenario
que motivó los 381 renglones de la migración.

Consecuencia: el arreglo se sostiene por lectura, no por prueba, en el punto
exacto donde la lectura ya se equivocó una vez.

---

### [MEDIO] `/api/dashboard/onboarding-chat` ya tiene tope, pero su gasto sigue sin llegar a la consola de costo de IA

`src/app/api/dashboard/onboarding-chat/route.ts:27-88` ·
`src/lib/likida/perfil/entrevista-agente.ts:46-58` ·
comparar `src/app/api/dashboard/ingesta/route.ts:45,64-76,83-86`

Media cerrada, media abierta, y hay que decir cuál es cuál. **Cerrada:**
`entrevista-agente.ts:57` ahora pasa `budget: createLlmBudget(opts.tenantId,
randomUUID())`, así que la ruta ya tiene un techo duro por tenant y por corrida —
era el corazón del hallazgo de la ronda anterior. **Abierta:** el presupuesto
escribe en `llm_presupuesto_reserva` (`0186:27-36`) y la consola de Javier lee
`llm_costo` / `llm_costo_mensual` (`lib/admin/consumo.ts:11`,
`lib/admin/negocio.ts:105`, `cron/purgar/route.ts:34-36`). Son dos tablas
distintas. `responderEntrevista` sigue usando `r.texto` y descartando `r.cost`, y
no llama `registrarCosto` en ninguna de sus dos ramas.

Y sigue sin `rateLimit`: el hermano de esta ronda,
`/api/dashboard/ingesta`, recibió las tres capas (`:45` rate limit, `:64-76` tope
que falla cerrado, `:83-86` fila de costo). Onboarding-chat recibió una.

Escenario, con valores. Un `flota_admin` hace 40 preguntas con `?` en el chat de
onboarding (`parecePregunta`, `:8-12`). Se gastan ~40 completions de rol `'chat'`.
Al día siguiente Javier abre `/admin` → costo de IA y ve el total **sin un solo
dólar de ese gasto**. Ya no es «sin freno»; sigue siendo una cifra que omite un
sumando sin declararlo.

---

### [MEDIO · REINCIDENTE] El webhook sigue contando como intento fallido el mensaje que nunca miró — y el arreglo hermano está veinte líneas más allá, en el mismo commit

`src/app/api/webhook/whatsapp/route.ts:359-363` ·
`src/app/api/cron/wa-pendientes/drenado.ts:109-118`

Tercera ronda. El delta reescribió este bloque otra vez (leaseOwner, fencing,
`iniciarRenovacionLease`) y volvió a no traer la única línea que falta: el
drenado distingue `sin_tiempo` y llama `devolverIntentoPendiente` (`:114-115`,
con el comentario que explica por qué); el webhook mete `sin_tiempo` en el mismo
`quedoPendiente` (`:83`) y llama `anotarFalloPendiente(f.id, 'pospuesto:
sin_tiempo')` (`:361-362`), que deja consumido el intento que
`reclamar_wa_pendiente` acaba de incrementar (`0187:112`). Una ráfaga de 22 fotos
deja ~13 con un intento gastado de 5 y un `ultimo_error` que describe un fallo
que no ocurrió.

---

### [MEDIO] `/api/health` es público, sin rate limit, y hace dos viajes a la base por petición — uno de ellos un `count: 'exact'`

`src/app/api/health/route.ts:42-53` · `:59` · `:35-39` (el comentario que decide
que no lleve auth)

La decisión de no ponerle secreto está razonada y la comparto: un health detrás
de llave no lo puede usar un monitor gratuito. Lo que no se decidió es el costo
por petición. Cada `GET` hace `from('tenant').select('id', { count: 'exact', head:
true })` —un conteo exacto, no un `limit 1`— más `estadoLatidos()`, y no pasa por
`rateLimit` en ninguna parte del archivo.

Escenario, con valores. La URL es adivinable y aparecerá en la configuración de
UptimeRobot. Un bucle de `curl` a 100 req/s son 200 consultas por segundo contra
el pool de PostgREST, ninguna acotada por IP. Hoy `tenant` tiene una fila y el
conteo es gratis; el día que tenga miles, el health se vuelve el endpoint más caro
del producto y tumba el pool que usan los crons.

No es ALTO porque no expone dato ni escribe nada; es MEDIO porque un endpoint sin
sesión que consulta la base sin techo es exactamente el contrato que este rubro
dice no aceptar.

---

### [MEDIO · REINCIDENTE] El CSV de liquidaciones sigue paginando por OFFSET sobre `created_at desc`

`src/app/api/export/liquidaciones/route.ts:91` (`.range(d, d + PAGINA - 1)`)

Sin cambios. Una liquidación nueva a media descarga duplica una fila y esconde
otra, y `LecturaIncompleta` no lo ve porque ninguna página queda vacía.

---

### [MEDIO · REINCIDENTE] `?conteo=1` + `?despues=` sigue devolviendo «lo que queda» mientras el OpenAPI promete «el total de la flota»

`src/app/api/v1/viajes/route.ts:112-136` · `src/app/api/v1/openapi/route.ts:213`

Sin cambios: el `count: 'exact'` se pide sobre la MISMA consulta que ya lleva el
filtro de cursor (`:120,:125`).

---

### [MEDIO · REINCIDENTE] `pago_recibido` sigue sin llave natural

`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:108-109`

Verificado hoy: `grep -rn "pago_recibido" supabase/migrations/*.sql | grep -i
unique` no devuelve nada en las 188 migraciones. El mismo SPEI capturado dos veces
sigue sumando dos veces en el saldo.

---

### [BAJO] El camino vivo del webhook no puede reclamar un mensaje reentregado, y corta la cadena del chofer sin dejar rastro

`src/app/api/webhook/whatsapp/route.ts:350` ·
`supabase/migrations/0187_wa_evento_pendiente_leases_fencing.sql:93`

`reclamarPendiente(f.id, 0, leaseOwner)` pasa `p_intentos = 0` fijo, y la RPC
exige `w.intentos = p_intentos` (`0187:93`). Cualquier fila que ya llevara un
intento —una reentrega de Meta después de un 503 de `caidas > 0`— no se puede
reclamar por este camino nunca. `if (!claim) break;` (`:353`) corta además la
cadena entera de ese chofer, sin un `logger` que lo diga.

No es más que BAJO porque el cron del minuto siguiente sí lo toma (su `p_intentos`
viene del listado, `wa_pendientes.ts:135-139`): se pierde latencia, no mensajes.
Pero el camino «vivo» que el archivo presenta como el que atiende la ráfaga en el
momento se degrada al camino lento en silencio.

---

### [BAJO · REINCIDENTE] Siguen existiendo dos `getViajesRegistro`, y el roto sigue exportado

`src/lib/likida/analytics.ts:1038` · `src/lib/likida/viajes_registro.ts:129`

Sin cambios.

---

## Lo que revisé y está bien

- **BACK-19-1 cerrado, y cerrado con prueba.** `cron/wa-outbox/route.ts:28-40`
  lee `leerInterruptor('global')` **antes** de `reclamarSalidasWhatsApp` —el
  orden correcto, porque un lease tomado con el sistema apagado secuestra la
  salida hasta que expire— y distingue las dos posiciones como los otros seis:
  `apagado` → 200 con `saltado` (apagar no es fallo), `ilegible` → 500 con
  `codigo` (no poder leer la palanca no es «encendido»). `route.test.ts` tiene
  los cuatro casos, incluido el que verifica que **no se llama a Meta**. Es el
  único CRÍTICO de la ronda anterior y está cerrado de verdad.
- **La 0187 cierra el envenenamiento del claim.** Las cuatro transiciones de la
  bandeja (`renovar`, `completar`, `fallar`, y el `reclamar` con `for update skip
  locked`) anclan a `claim_token` **y** a `claim_owner` **y** a `procesado_en is
  null`; el reloj es siempre `clock_timestamp()` de Postgres, nunca uno de la
  aplicación —el comentario de `0187:16-17` lo justifica con el clock skew entre
  instancias—; las diez funciones son `security definer` con `set search_path =
  ''` y `revoke ... from public, anon, authenticated` (`:362-381`). El orden
  causal por chofer está impuesto **en la base** (`:98-106`), no solo en el
  agrupamiento de TypeScript, con el comentario que explica el caso que cubre
  (un caller que reclama A2 cuando A1 no estaba en su lote). Y el TS interpreta
  el `false` del fencing como pérdida y lo grita
  (`wa_pendientes.ts:183,212,230`), en vez de tratarlo como éxito.
- **El fencing tiene prueba de comportamiento contra Postgres de verdad.**
  `supabase/tests/wa_leases_fencing.sql` son 33 aserciones pgTAP que
  `.github/workflows/ci-postgres.yml:166` ejecuta con `pg_prove` sobre el mismo
  Postgres efímero que recibió las migraciones — no es un archivo informativo.
  Es la primera vez que este rubro puede decir «probado» de un camino de
  concurrencia sin matizarlo.
- **`/api/dashboard/ingesta` es el modelo de cómo se hace.** Rate limit por
  usuario (`:45`), tope diario por tenant leído **antes** de gastar y fallando
  **cerrado** con 503 si la base no responde (`:64-76`), fila de `llm_costo` con
  `fase:'ocr'` y `viaje_id: null` que es exactamente lo que el tope lee después
  (`:83-86`, `tope.ts:34-44`), y la respuesta recorta a lo que la pantalla va a
  enseñar en vez de devolver el `Gasto` entero (`:91-105`). Las tres capas que
  la ronda 18 pidió, cableadas y coherentes entre sí.
- **`tool-idempotency.ts` es el patrón de dos fases que a Cal.com le falta.**
  `claimMutation` → ejecutar → `completeMutation`/`failMutation`
  (`:41-94`), con el token de fencing exigido en las dos salidas y un `throw`
  explícito cuando se pierde (`:82`, `:93`). Que el repo tenga esto escrito y
  Cal.com siga sellando antes del efecto es lo que hace ese hallazgo un
  reincidente y no un descubrimiento.
- **`/api/lead` reconcilia la carrera en vez de taparla.** Rate limit por IP
  (`:152`) y una llave de escritura única por `(correo|empresa)` cada 10 s
  (`:188`) que hace de candado sin base; y cuando ese candado no alcanza, el
  `catch` de `:237-251` detecta la violación única de la 0181, **relee al
  ganador por `lead_clave` y fusiona sobre él** en vez de crear un segundo lead.
  Además `mezclaQueSoloRellena` impide que un formulario público pise el teléfono
  de un prospecto en negociación (`:224-229`), que es desviar la llamada del
  vendedor. El `escribir()` de `:310-351` que sobrevive a una migración que no
  corrió, con las dos redacciones de error (Postgres y PostgREST) y el comentario
  que dice que la primera versión costó un lead real, es de lo mejor escrito del
  repo.
- **`/api/admin/copiloto` cerró su hueco de presupuesto sin fallback implícito.**
  `:190-196` rechaza con 503 antes del rate limit y antes del stream cuando la
  sesión superadmin no trae `tenantId` — no hay tenant de relleno por env — y el
  costo se anota **antes** de los intents y del historial (`:231-234`) porque lo
  que sigue puede agotar su plazo y el turno ya se pagó. Los dos `conPlazo`
  (`:241`, `:268`) suman 53 s contra `maxDuration = 60`, con la cuenta escrita en
  `:84-86`. Y el intent sigue siendo la única autoridad para ejecutar: un
  `confirmado:true` del cliente ya no pinta nada (`:121-129`).
- **`claim_wa_mensaje_procesado` distingue tres estados donde antes había dos.**
  `duplicado` (completado de verdad), `en_curso` (otro worker lo tiene, con lease
  vigente o con la fila bloqueada por `for update skip locked`) y `nuevo` (fila
  nueva o lease vencido), y `claimMessage` (`conv.ts:441-449`) no convierte un
  error de RPC en `'duplicado'` — el bug que hacía desaparecer el «listo» del
  operador. `conv_claim_lease.test.ts:34-38` lo fija.
- **El drenado corta la cadena del chofer en los cuatro caminos.** `break` en
  claim perdido (`drenado.ts:94`), en pospuesto (`:124`), en excepción (`:142`) y
  en sello vallado (`:133`), cada uno con su comentario diciendo por qué avanzar
  al siguiente rompería el orden de la conversación. `return` —no `break`— en
  `sin_tiempo` (`:118`), que es lo correcto: sin presupuesto para éste tampoco lo
  hay para el que sigue.
- **`supabase/admin.ts` hereda la señal de la tool sin pisar la más estrecha.**
  `:32-37`: si ya hay una señal de `acotada` y no hay tool activa, se respeta la
  de `acotada`; si hay tool, se combinan las tres con el backstop. `AsyncLocalStorage`
  hace que la herencia funcione en el cliente memoizado sin volverlo global.

---

## Lo que NO alcancé a revisar

- **`procesarLoteEnCola`** (`cron/facturar/route.ts:400-560`): quinta ronda
  fuera. Sigue sin abrirse el reparto de un mismo UUID sobre N gastos con
  `cfdi_orden`.
- **`src/lib/likida/perfil/entrevista-aplicar.ts`**: segunda ronda pendiente. Es
  el que ESCRIBE la configuración fiscal del tenant desde una conversación; el
  contrato de escritura es mío y no lo abrí.
- **`src/lib/llm/tool-executor.ts`** (+156 en este delta) y `runtime-signal` en
  el camino de mutación: leí `tool-idempotency.ts` y `admin.ts`, no el ejecutor.
  La pregunta que queda abierta y le toca a tool calling: una consulta de
  escritura abortada por la señal de la tool puede haber **commiteado** en
  Postgres antes de que el `fetch` se corte, y el llamador lo lee como fallo.
- **`src/lib/saas/transferencia.ts`**: cuarta ronda sin abrir.
- **`lib/admin/qa-*`** (el panel de QA de `c85dfd3`, seis módulos nuevos): no lo
  miré. Escribe en tablas nuevas de la 0185 y no sé si sus escrituras fallan
  cerrado.
- **No ejecuté nada contra una base real.** El CRÍTICO está verificado por
  aritmética sobre literales que leí (`PRICES` en `openrouter.ts:194`,
  `maxRunUsd` en `budget.ts:66`, `MAX_DATAURL` en `limites.ts:24`) y por la
  cadena de llamadas leída línea a línea desde `processor.ts:1333` hasta
  `budget.ts:79`; no lo reproduje con una foto real porque eso exige OpenRouter.
  El pgTAP no lo corrí (necesita Postgres); lo que verifiqué es que CI sí lo
  corre y qué aserciones contiene.
