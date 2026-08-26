# Backend y API — auditoría 19

**Nota: 6/10** (antes 7). Razón del movimiento: **deuda que cobró factura**, con
un pedazo de «se atacó y subió» que no alcanza a compensarla.

- *Se atacó y subió, de verdad*: **BACK-C4-1 está CERRADO en las dos
  direcciones**. `aplicarFactura` recibe y aplica `eventoCreadoUnix`
  (`suscripcion.ts:836,841-850,888-890`), `cancelarFacturaDeStripe` entra al
  MISMO ledger (`:923,958-959`) y el ledger dejó de ser «por suscripción» para
  ser por entidad (`llaveOrden`, `:761`). El webhook pasa el `created` en las
  cuatro ramas (`stripe/webhook/route.ts:208,266,281`). Ya no existe el camino
  donde la mensualidad cobrada vuelve a decir «Falló el cobro».
- *Deuda que cobró factura*: el delta añadió **cinco superficies nuevas de
  backend** —outbox, reservas, cron de GPS, export de póliza, dos webhooks de
  Cal.com, el chat de onboarding— y **cuatro de ellas llegaron sin una sola
  prueba de ruta** (`ls` sobre `cron/wa-outbox/`, `cron/gps/`, `export/poliza/`:
  solo `route.ts`). La única que trae prueba, Cal.com, **consagra en un test el
  caso perdedor** y deja la perilla del caso ganador (`db.updateError`) declarada
  y jamás encendida. El ancla del rubro dice «6 si es correcto por lectura y no
  por prueba»; aquí ni siquiera es correcto por lectura en el outbox.

El riesgo mayor del rubro hoy: **el outbox de WhatsApp es el único de los siete
crones que actúa sin mirar el interruptor global. Javier apaga «todo» durante un
incidente —o durante el demo— y `/api/cron/wa-outbox` sigue disparando cada
minuto contra los teléfonos de los choferes hasta vaciar la cola.**

---

## Hallazgos

### [CRÍTICO] El outbox de WhatsApp manda con el kill switch apagado: es el único cron que actúa sin leer el interruptor

`src/app/api/cron/wa-outbox/route.ts:15-22` · comparar con
`src/app/api/cron/gps/route.ts:40-53` · `src/app/api/cron/purgar/route.ts:81-93` ·
`src/app/api/cron/wa-pendientes/route.ts:79` ·
`src/lib/likida/agentes/runner.ts:156` · `vercel.json:9-12`

Verificado por grep sobre las siete rutas de `src/app/api/cron/`: `escalar`,
`facturar`, `gps`, `purgar`, `wa-pendientes` llaman `leerInterruptor`, `runner`
llama `estaApagado('global')` dentro de `correrRunner`. **`wa-outbox` no llama
ninguna de las dos.** Entre `puertaCron` (`:16`) y `reclamarSalidasWhatsApp`
(`:19`) no hay nada.

Escenario, con valores. 14:00 — la cobranza contacta a 300 choferes de
Transportes del Bajío y Meta empieza a devolver `130429` (rate limit de la
cuenta). Cada rechazo entra al outbox (`meta/client.ts:194`): ~280 filas en
`wa_outbox` con `estado='pending'`. 14:02 — Javier ve la avalancha y apaga
`global` desde Observabilidad. `wa-pendientes` se detiene (`route.ts:79`),
`escalar` se detiene, `facturar` se detiene, `runner` se detiene. **14:03, 14:04,
14:05… `/api/cron/wa-outbox` sigue corriendo cada minuto** (`vercel.json:11`) y
drena 25 salidas por vuelta (`wa_outbox.ts:25`), con hasta 8 intentos por fila
(`0180:112`). En once minutos las 280 salieron.

Sale mal: el interruptor que el producto presenta como «apagar todo» no apaga el
único canal que le habla a personas. Y el modo de falla es mudo: el cuerpo dice
`{corrio:true, enviadas:280}`, el latido dice `ok`, y nada menciona que el
sistema estaba apagado.

Consecuencia: en un incidente, la palanca de emergencia no frena la salida. En
el demo del 6-ago, si Javier enseña el kill switch —que es una de las cosas que
el panel de Observabilidad vende— la siguiente vuelta del minuto lo desmiente en
vivo. Y para el rubro de seguridad: es una decisión de negocio («no mandes
nada») que el sistema no obedece.

Causa raíz probable: el cron se escribió a partir del esqueleto de `puertaCron` y
no del de un cron que actúa; el interruptor no está en `puertaCron`, está en cada
ruta, y nada obliga a ponerlo.

Sin prueba: no existe `cron/wa-outbox/route.test.ts`.

---

### [ALTO] Outbox y llamador reintentan el MISMO mensaje: el chofer recibe tres avisos y la bitácora anota uno

`src/lib/meta/client.ts:194` y `:393` (encolan) ·
`src/lib/likida/agentes/cobranza.ts:308,323,336,343-351` ·
`src/lib/likida/escalar_viaje.ts:375,380,393-395` ·
`src/lib/likida/wa_outbox.ts:14-23` (nunca escribe `dedupe_key`) ·
`supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:69`

`0180:69` crea `dedupe_key text unique` y `encolarSalidaWhatsApp` **nunca lo
pone**: la columna que existe justo para esto queda `null` en todas las filas, y
en Postgres los `null` no compiten por un unique. Dos encolados del mismo aviso
son dos filas.

Escenario, con valores. Viaje `V-8891`, escalación al jefe, 10:00, Meta
devolviendo `130429`:

1. `escalar_viaje.ts:375` → `enviarTexto(tel, armarAvisoJefe(...))` → 429 →
   `esReintentableMeta(undefined, 429)` es `true` (`client.ts:151`) →
   **fila #1 en `wa_outbox`** con el texto del aviso.
2. `escalar_viaje.ts:380` → `sendTemplate(tel, PLANTILLA_JEFE, …)` → 429 →
   **fila #2 en `wa_outbox`** con la plantilla.
3. `escalar_viaje.ts:393-395` → `liberarEscalacion`: el claim se suelta a
   propósito para que la corrida de las 11:00 lo tome entero.

10:01 — el cron del outbox manda las dos filas. El jefe recibe el aviso libre
**y** la plantilla del mismo viaje. 11:00 — la escalación vuelve a correr y manda
un **tercero**. `escalacion` registra UN contacto.

Idéntico en cobranza: `enviarTexto` (`:308`) encola, `sendTemplate` (`:323`)
encola, y `:343-351` **borra** el claim de `cobranza_contacto` para que la
corrida siguiente reintente el tier completo.

Sale mal: tres mensajes por un recordatorio, ×3 tiers, ×300 choferes. Y es
exactamente lo que `client.ts:124-142` escribió RES-1 para evitar: el comentario
dice que un bloqueo de diez minutos no debe quemar tiers, y el remedio elegido
—no consumir el claim— ahora convive con un segundo reintentador que nadie le
avisó al primero.

Consecuencia: el chofer recibe el mismo pendiente tres veces; a escala, la
calificación de calidad del **único** número de WhatsApp que atiende a todas las
flotas cae y Meta lo limita —el desenlace que `escalar_viaje.ts:409-414` describe
como «la cuenta bloqueada»—. Y la bitácora que el contralor lee dice un contacto.

Causa raíz probable: el outbox se añadió en la capa de transporte
(`meta/client.ts`) sin retirar la política de reintento que ya vivía en los dos
llamadores; `dedupe_key` se diseñó para arbitrarlo y quedó sin escribir.

Sin prueba: `cobranza_reparto.test.ts:25` mockea el cliente de Meta entero
(`esReintentableMeta: () => false`), así que ninguna prueba llega al encolado;
`reintentables.test.ts` no mockea `wa_outbox` ni afirma nada sobre él.

---

### [ALTO] El drenado del outbox no distingue un rechazo definitivo de uno transitorio, y una variable de entorno ausente mata el mensaje en ocho vueltas

`src/app/api/cron/wa-outbox/route.ts:23-29` y `:36-43` ·
`supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:112-114` ·
`src/lib/meta/client.ts:143-153` (`esReintentableMeta`, que el drenado **no
importa**)

El drenado trata igual todo lo que no sea un wamid: `finalizarSalidaWhatsApp(s,
undefined, …)` con `p_message_id = null` cae en el `else` de `0180:112`, que hace
`intentos >= 8 → 'dead'` con backoff exponencial.

Dos escenarios, con valores:

**(a) Configuración ausente quema los ocho intentos.** `route.ts:25-29`: si
`WHATSAPP_ACCESS_TOKEN` no está en el entorno de esa invocación —el token de Meta
caduca a los 60 días y este repo ya vivió esa mañana (`client.ts:498-503`, el
28-jul a las 12:00)— la rama contesta `finalizarSalidaWhatsApp(s, undefined,
'canal de WhatsApp no configurado')` **sin haber contactado a Meta**. Con el cron
al minuto y el backoff de `0180:113` (15 s, 30 s, 60 s … tope 3600 s), una fila
llega a `intentos = 8` en ~2 h y queda `dead` para siempre. Los mensajes que el
outbox existe para salvar los mata una variable de entorno.

**(b) Un rechazo definitivo se reintenta ocho veces.** Un payload encolado por la
rama de red (`client.ts:180,334,385,474`, que encola SIN consultar
`esReintentableMeta`) dirigido a un número fuera de la lista de pruebas de Meta
devuelve `131030` en cada vuelta. `esReintentableMeta(131030)` es `false`
(`reintentables.test.ts:74` lo fija), pero el drenado nunca lo pregunta: ocho
llamadas a la Graph API por un mensaje que jamás va a entregarse. Igual con
`190` (token vencido) y `132001` (plantilla sin aprobar).

Y la cola de muertos **no la mira nadie**: `grep -rn wa_outbox src/` devuelve
exactamente dos archivos (`wa_outbox.ts` y el cron). No hay equivalente de
`cartasMuertas()` (`wa_pendientes.ts:203-212`), no hay pantalla, no hay
`alertarOperador`. El único rastro de una salida muerta es su `ultimo_error` en
una tabla que ninguna consulta del repo lee. `wa_outbox` tampoco tiene
`tenant_id` (`0180:67-80`), así que ni siquiera se puede atribuir a una flota —
la misma trampa que `CLAUDE.md` ya documenta para `wa_mensaje_procesado`.

Consecuencia: la liquidación cuyo PDF rebotó por un timeout se declara
irrecuperable y **nadie se entera nunca**. Es la falla silenciosa que el módulo
vino a cerrar, movida un piso más abajo.

Causa raíz probable: la taxonomía de errores de Meta vive en `client.ts` y el
drenado se escribió con un `fetch` propio en vez de reusar las funciones de envío
que ya la aplican.

---

### [ALTO] Cal.com sella la idempotencia ANTES del efecto: un evento que falló a medias no se aplica nunca, y `procesado_en` existe sin usarse

`src/app/api/webhook/calcom/route.ts:69-83` (el `return` de `:73`) ·
`src/lib/admin/calcom.ts:92-104` ·
`supabase/migrations/0181_crm_remediacion.sql:27` (`procesado_en timestamptz`) ·
`src/app/api/webhook/calcom/route.test.ts:22,101,127-136`

`registrarEventoComercial` inserta la fila del ledger y devuelve `'nuevo'`; el
`update` del prospecto va **después** (`route.ts:74-82`). No hay segunda fase:
`grep -rn "procesado_en" src/` no encuentra un solo escritor de esa columna, que
la 0181 creó junto con `error` precisamente para esto.

Escenario, con valores. Prospecto «Transportes del Bajío»,
`correo = contacto@bajio.mx`, `estado = 'appointment'`. Cal.com entrega
`BOOKING_CANCELLED` del booking `xyz123`:

1. `registrarEventoComercial({claveIdempotencia:'calcom:BOOKING_CANCELLED:xyz123'})`
   inserta y devuelve `'nuevo'`.
2. `supabaseAdmin().from('prospecto').update({estado:'cancelled'})` devuelve
   `error` (Supabase contestando 503) → `throw` (`:81`) → 500 (`:86`).
3. Cal.com reintenta a los pocos minutos. Ahora el insert choca con
   `comercial_evento_clave_unica` (`0181:34`) → `'repetido'` → **`route.ts:73`
   contesta `{ok:true, repetido:true}` sin llegar al `update`**.

Sale mal: `prospecto.estado` se queda en `'appointment'` para siempre. El embudo
de Javier cuenta una cita viva que se canceló; el mapa de prospectos
(`prospectos-mapa.ts:294`) la puntúa como si estuviera en pie, y el vendedor
trabaja una cita que no existe. Ninguna línea de log lo dice: el 200 es honesto
desde el punto de vista del webhook.

El repo ya sabe hacerlo bien: el webhook de Stripe usa `aplicado_en` y
**re-aplica** cuando está en `null` (documentado en `auditoria-18/backend-c4.md`,
hallazgo #1); el ledger de orden se sella **después** del upsert y el comentario
lo explica (`suscripcion.ts:885-887`: «sellar antes sería prometer que se aplicó
algo que no se aplicó»). Cal.com hace justo lo contrario.

La prueba lo consagra: `route.test.ts:127-136` se titula «repetir el mismo
webhook responde 200 repetido y **no vuelve a actualizar**» y afirma
`db.updates).toHaveLength(1)`. Y `db.updateError` está declarado (`:22`) y
reseteado (`:101`) — **ningún test lo pone en `true`**. El caso perdedor estaba
pensado y quedó sin cubrir.

Causa raíz probable: la idempotencia se implementó como «insert y si choca, ya
está» en vez de como el `marcar/aplicar/sellar` de dos fases que la tabla ya
soporta.

---

### [ALTO] El webhook de Cal.com escribe cualquier estado del embudo sin la guardia de transición: degrada un trato CERRADO, o revienta contra el constraint y pierde el evento

`src/app/api/webhook/calcom/route.ts:74-82` ·
`src/lib/likida/vendedores.ts:112,148,553-595` ·
`supabase/migrations/0181_crm_remediacion.sql:11,14,16`

El update es `.eq('id', prospecto.id)` y nada más: sin anclaje al estado leído,
sin `puedeTransicionarFunnel` (que existe, `vendedores.ts:116-118`), sin filtro
de estado en la búsqueda por correo (`route.ts:90-96` solo excluye duplicados).
`TRANSICIONES_PROSPECTO.cerrado` y `TRANSICIONES_FUNNEL.won` son `[]` a propósito
—`vendedores.ts:134-142` lo explica: «`cerrado` es TERMINAL … de él cuelga la
liga con la flota real y la comisión»— y `cambiarEstadoProspecto` se niega con un
mensaje escrito para el humano (`:569-576`). El webhook no cruza esa puerta.

Escenario A, con valores. «Transportes del Bajío» firmó: `estado = 'won'`,
`cerrado_en = 2026-08-18`, `tenant_id = null` (la flota se dio de alta después).
En septiembre el account manager reagenda la junta mensual en el mismo tipo de
evento de Cal.com. Llega `BOOKING_RESCHEDULED`, `emailDelEvento` encuentra al
mismo prospecto por `contacto@bajio.mx`, y el update escribe
`estado = 'rescheduled'`, `cerrado_en = null` (`:78`). El constraint
`prospecto_cerrado_coherente` (`0181:14`) lo acepta —ya no es «cerrado» y ya no
tiene fecha— y **el trato ganado desaparece del embudo**: la comisión que colgaba
de `cerrado_en` se queda sin fecha de cierre.

Escenario B, mismo evento con `tenant_id` puesto (la flota ya está ligada): el
update viola `prospecto_tenant_solo_cerrado` (`0181:16`, `tenant_id is null or
estado in ('cerrado','won')`) → `23514` → `throw` (`:81`) → 500. Cal.com
reintenta, el ledger contesta `'repetido'`, y el evento queda perdido por el
hallazgo anterior; el endpoint queda marcado como fallando en el panel de
Cal.com.

Consecuencia: el CRM de Javier —la herramienta con la que decide a quién le
vende— pierde un cierre por una reprogramación de calendario, sin log ni aviso.

Refutación intentada y descartada: el `if (estado !== 'won')` de `:78` parece una
guardia, pero `ESTADO_POR_EVENTO` (`:11-16`) nunca produce `'won'` — la condición
es siempre verdadera y lo que hace es justamente borrar `cerrado_en`.

Causa raíz probable: la máquina de estados vive en `vendedores.ts` y el webhook
escribe la columna directo; nada en la base impide el retroceso porque el
constraint solo exige coherencia entre `estado` y `cerrado_en`, no orden.

---

### [ALTO] `/api/dashboard/onboarding-chat` llama al modelo sin tope diario y sin registrar el costo: es el gemelo de `/api/dashboard/chat` con el freno quitado

`src/app/api/dashboard/onboarding-chat/route.ts:27-68` ·
`src/lib/likida/perfil/entrevista-agente.ts:41-63` ·
comparar `src/app/api/dashboard/chat/route.ts:58-73` (el tope) y `:94,:124`
(el registro) · `src/lib/llm/openrouter.ts:319-345` (devuelve `cost`, no lo
escribe) · `src/lib/likida/costos.ts:121`

La ruta nueva es el mismo esqueleto que `/api/dashboard/chat` —sesión, rol,
tenant efectivo, validación de mensajes, NDJSON— **menos las dos cosas que
cuestan dinero**:

- `chat/route.ts:61-73` lee `gastoChatHoyUsd(tenantId)`, falla **cerrado** si no
  puede leerlo, y corta en `topeDiaUsd()`. `onboarding-chat` no menciona ninguna
  de las tres.
- `chat/route.ts:94` y `:124` llaman `registrarCosto(...)` con el costo real de
  cada vuelta. `responderEntrevista` recibe `r` de `generateResponse`
  (`entrevista-agente.ts:44`) y usa `r.text` — **descarta `r.cost`** y no llama a
  `registrarCosto`. `generateResponse` (`openrouter.ts:319-345`) devuelve el
  costo y no escribe `llm_costo`: el registro es del llamador, y aquí no hay.

Y el rol es `'chat'` (`entrevista-agente.ts:45`), el caro, no `back_office`.

Escenario, con valores. Un `flota_admin` deja la pestaña de
`/dashboard/onboarding` abierta con el chat y hace 40 preguntas del tipo «¿por
qué me preguntas eso?» (`parecePregunta`, `:41`, dispara con cualquier `?`).
Cuarenta llamadas al modelo caro, `maxTokens: 400`, sin ningún tope que las
detenga; y no hay `rateLimit` en la ruta, así que un script con la misma sesión
hace 4,000. Al día siguiente Javier abre `/admin` → costo de IA y ve el total
**sin un solo dólar de este gasto**: no hay fila en `llm_costo`.

Consecuencia: (a) no existe forma de frenar esta ruta sin un deploy —el tope
diario del chat no la alcanza y no hay interruptor—; (b) la consola de costo de
Javier reporta un total que se lee como completo y no lo es. La regla del
producto no es solo «no inventar una cifra»: una cifra que omite un sumando y no
lo declara es la misma clase de mentira.

Causa raíz probable: la ruta se copió de `chat/route.ts` recortando lo que no
hacía falta para que el chat de onboarding funcionara; el tope y el registro
estaban entre lo recortado.

Sin prueba: no hay `onboarding-chat/route.test.ts`.

---

### [ALTO] `borrarStorageMarcado` sella como borrado lo que la API NO confirmó, y reporta esa cifra como «los que dejaron de existir»

`src/lib/likida/storage_borrado.ts:93` · `:108` · contra su propia cabecera
`:17-19` y su propio docstring `:36-40`

```ts
const aSellar = nombres.filter((n) => confirmados.has(n) || confirmados.size === 0);
```

La cabecera del archivo dice, con mayúsculas: «FAIL-CLOSED CON LA MARCA:
`borrado_en` **solo** se sella cuando la API confirmó. Un archivo que falló se
queda en la cola y lo reintenta la corrida siguiente — mejor reintentar mil veces
que marcar como borrado algo que sigue ahí.» El `|| confirmados.size === 0`
invierte exactamente eso en el único caso donde la API **no confirmó nada**.

Escenario, con valores. La corrida de las 04:15 saca 200 candidatos del bucket
`comprobantes` (`LOTE = 200`, `:26`). `db.storage.from('comprobantes')
.remove(nombres)` responde `{ data: [], error: null }` —el objeto no se borró
pero la API tampoco falló: un bucket renombrado, un prefijo que ya no coincide,
o cualquier respuesta 200 vacía—. `confirmados.size === 0` → `aSellar` son los
200 → el update de `:95-101` les pone `borrado_en = now()` → `borrados += 200`,
`fallidos += 0`.

Sale mal en dos direcciones a la vez:

1. **Las 200 filas quedan selladas y ya no se reintentan nunca** (`:47` filtra
   `.is('borrado_en', null)`). Los archivos siguen en el bucket. Es el «marcar
   como borrado algo que sigue ahí» que la cabecera prohíbe.
2. **El conteo miente.** El docstring (`:37-40`) dice que devuelve «el conteo
   real — no el intentado — porque el que importa para una constancia ARCO es
   cuántos dejaron de existir». En este camino `borrados === intentados` y no se
   confirmó ninguno. Esa cifra sale en el cuerpo del cron
   (`cron/purgar/route.ts:151`) y en su log (`:149`).

Nótese la asimetría que lo delata: con **una** confirmación de 200, el código
sella 1 y cuenta 199 fallidos (correcto). Con **cero**, sella 200 y cuenta 0
fallidos. El caso peor es el que se trata como el mejor.

Consecuencia: la cola de purga de Storage baja a cero mientras el bucket no se
vacía, y el panel dice que se borraron. (El daño de privacidad está acotado hoy
porque `0178:24-26` clasifica las fotos de ARCO como `fiscal_cff_30` y `:52` las
excluye del borrador — pero eso deja el `.order('motivo')` de `:55` («los de
ARCO primero: tienen un plazo legal detrás») describiendo un orden que ya no
puede ocurrir.)

Causa raíz probable: el caso «el archivo ya no existía» y el caso «la API no
borró nada» producen la misma respuesta vacía, y se eligió el optimista sin una
segunda señal que los separe.

---

### [ALTO · REINCIDENTE] `updateGastoCfdiXml` sigue descartando el `error` de la lectura que hace justo antes de fusionar

`src/lib/likida/repo.ts:746-748`

Idéntico a la c4 con las líneas corridas por el delta:

```ts
const { data: actual } = await acotada(supabaseAdmin().from('gasto')
  .select('ocr_extra').eq('id', gastoId).eq('tenant_id', tenantId).maybeSingle(),
  'updateGastoCfdiXml.leerOcrExtra');
const ocrExtra = { ...((actual?.ocr_extra as Record<string, unknown> | null) ?? {}) };
```

`error` sigue sin desestructurarse, tres líneas debajo del comentario (`:740-742`)
que explica por qué aquí no se puede escribir a ciegas. El escenario con valores
(diésel de USD 450.00 que pierde `moneda`/`tipoCambio` y se cuadra como $450.00
MXN) está en `auditoria-18/backend-c4.md` y no cambió una coma.

---

### [ALTO · REINCIDENTE] El dueño que maneja sigue perdiendo el despacho entero sin recibir una palabra

`src/lib/likida/processor.ts:920`

`{ incluirPreguntaLibre: !viajeId, incluirDespacho: !viajeId }` sigue ahí, con el
comentario `:911-919` explicando muy bien por qué se apaga y sin una línea que
diga qué se contesta. Tercera ronda. Detalle completo en
`auditoria-18/backend-c4.md`.

---

### [MEDIO] El export de póliza no puede producir un archivo para ninguna flota: `erp_export_perfil` no tiene escritor, y una etiqueta del panel dice que ya funciona

`src/app/api/export/poliza/route.ts:140-146` ·
`src/lib/likida/contabilidad/perfiles.ts:44-52` ·
`src/lib/likida/ajustes_operativos.ts:72`

`grep -rn "erp_export_perfil" src/` devuelve **una sola** aparición: el `select`
de `perfiles.ts:46`. No hay `insert`, no hay `upsert`, no hay pantalla, no hay
ruta. `perfilExportacionDeclarado` devuelve `null` siempre, y `route.ts:140-146`
contesta `409 perfil_erp_sin_confirmar` para todo tenant, todo formato, todo
periodo. `grep -rn "api/export/poliza" src/` tampoco encuentra un llamador:
ninguna pantalla del dashboard pide esta ruta.

Escenario, con valores. El contralor de Transportes del Bajío lee en
`/dashboard/configuracion` la etiqueta que `ajustes_operativos.ts:72` acaba de
corregir: «La PÓLIZA contable sí sale ya en formato CONTPAQi desde el export de
póliza — **necesita tu catálogo de cuentas, aquí abajo**». Captura sus 14 cuentas
(eso sí tiene escritor, `ajustes_operativos.ts:201-217`). Pide la póliza de
agosto por URL, porque no hay botón. Recibe: *«No hay una plantilla CONTPAQi
confirmada para esta flota … pide a tu contador que confirme una plantilla de
importación de su instancia»* — un paso que no existe en ninguna parte del
producto.

Consecuencia: la etiqueta que se corrigió el 23-ago por «prometer de menos» ahora
promete de más, y nombra un requisito (el catálogo) que no es el que bloquea. La
landing dice «el formato que SAP Business One o CONTPAQi ya sabe importar»; el
módulo entero, sus 262 líneas de ruta y sus tres correcciones seguidas, no puede
emitir un byte.

No es ALTO porque falla **cerrado**, con 409 y un texto explícito — que es la
dirección correcta de fallar. Es MEDIO porque el rótulo del panel afirma lo
contrario.

Causa raíz probable: `0178` añadió la exigencia de plantilla confirmada como
segunda barrera y la mitad de captura del par quedó pendiente.

---

### [MEDIO] Dos exports de póliza de periodos distintos salen con la MISMA numeración de asiento

`src/app/api/export/poliza/route.ts:226-229` ·
`src/lib/likida/contabilidad/formatos.ts:90` y `:164` ·
`src/lib/likida/contabilidad/perfiles.ts:26`

`numeroInicial: perfil.opciones.numero` es un valor **estático** leído del perfil,
y `archivoContpaqi` numera `numeroInicial + i` (`formatos.ts:90`). Nada persiste
el consecutivo ni lo avanza: `grep -rn "numeroInicial" src/` encuentra la lectura
y el uso, ningún escritor. En SAP es peor: `jdtNum = i + 1` (`:164`) está
cableado y ni siquiera consulta el perfil.

Escenario, con valores. Perfil confirmado con `numeroInicial = 1`. El 1-sep el
contador exporta `?desde=2026-08-01&hasta=2026-08-31` → 120 liquidaciones →
pólizas `Dr 1` … `Dr 120`, importadas. El 1-oct exporta
`?desde=2026-09-01&hasta=2026-09-30` → 95 liquidaciones → pólizas **`Dr 1` …
`Dr 95` otra vez**. Al importar, CONTPAQi encuentra el consecutivo ocupado: o
rechaza la tanda, o pisa los asientos de agosto con los de septiembre.

Consecuencia: el libro del contador deja de cuadrar por un dato que Likida
generó, y el archivo no trae ninguna señal de que la numeración se reinició.
MEDIO y no ALTO porque hoy no puede dispararse —no hay quien escriba el perfil,
ver el hallazgo anterior— pero es la primera cosa que va a fallar el día que se
escriba.

Sin prueba: `poliza.test.ts:127` verifica que un periodo lleve UN encabezado; no
hay ninguna que exporte dos periodos y compare la numeración.

---

### [MEDIO] El cron de GPS reporta `guardadas` sin haber medido nada, y recorta a 500 lecturas por flota en silencio

`src/lib/likida/conectores/sincronizar_gps.ts:150` · `:99` · `:156-162` ·
`src/app/api/cron/gps/route.ts:59,65-73,80`

Tres cosas en el mismo camino:

1. **`base.guardadas = filas.length`** (`:150`) se asigna después de un `upsert`
   con `ignoreDuplicates: true` (`:146`) que **no pide conteo**. Escenario: la
   flota tiene 40 unidades paradas toda la noche; el proveedor devuelve la última
   posición conocida con la misma `medida_en` en cada vuelta; el único
   `uq_posicion_lectura` (`0176:66`) las colapsa todas y Postgres escribe **0**
   filas. El cron reporta `guardadas: 40`, cada 5 minutos, 11,520 «guardadas» por
   noche que nunca entraron. Esa cifra sale en el cuerpo (`route.ts:65-73`) y en
   el latido de salud (`:80`), donde se lee como medición.
2. **`.slice(0, TOPE_POR_FLOTA)`** con `TOPE_POR_FLOTA = 500` (`:31,:99`) y
   `base.leidas` asignado **después** del recorte (`:100`): una flota de 750
   camiones —la escala que `cobranza.ts:281` toma como objetivo— pierde 250
   posiciones por vuelta y **ninguna cifra lo dice**. No entran en `huerfanas`
   (`:127`) ni en `leidas`. Es el recorte silencioso que `traerTodo`/`exigir`
   existen para prohibir, escrito a mano.
3. **`gps.sellar_visto`** (`:156-162`) es un `await acotada(...)` sin
   desestructurar nada: el `error` de esa escritura se descarta por completo.

Consecuencia: el panel de salud afirma que el GPS está entrando con una cifra que
no midió, y un tercio de una flota grande no aparece en el mapa sin que nada lo
declare. La regla del producto es que una cifra sin dato real se dice, no se
rellena.

Causa raíz probable: `filas.length` es lo que se intentó escribir, no lo que se
escribió, y con `ignoreDuplicates` esas dos cifras dejan de ser la misma.

Sin prueba: `sincronizar_gps.test.ts:127,151,244` afirma `r.guardadas` contra
upserts mockeados —verifica cuántas filas se mandaron, que es justo lo que no
está en duda—; ninguna prueba cubre el recorte a 500.

---

### [MEDIO · REINCIDENTE] El webhook sigue contando como intento fallido el mensaje que nunca miró — ahora con el arreglo hermano tres archivos más allá

`src/app/api/webhook/whatsapp/route.ts:361-367` ·
`src/app/api/cron/wa-pendientes/drenado.ts:97-98,109` ·
`src/lib/likida/wa_pendientes.ts:168-189`

El delta reescribió este bloque entero (paralelismo por chofer, `claimToken` de
la 0177, corte de la cadena con `return` en `sin_tiempo`) y **no trajo la única
línea que faltaba**: el drenado llama `devolverIntentoPendiente` (`drenado.ts:97,
109`), el webhook sigue llamando `anotar('pospuesto: sin_tiempo')` (`route.ts:361,
363`), que solo escribe `ultimo_error` y deja consumido el intento que
`reclamar_wa_pendiente` acaba de incrementar (`0177:65`). Mismo escenario de la
c4: una ráfaga de 22 fotos deja ~13 con `intentos = 1` de 5 y un `ultimo_error`
que describe un fallo que no ocurrió.

---

### [MEDIO · REINCIDENTE] El CSV de liquidaciones sigue paginando por OFFSET sobre `created_at desc`

`src/app/api/export/liquidaciones/route.ts:91` (`.range(d, d + PAGINA - 1)`)

Sin cambios respecto de la c4. Una liquidación nueva a media descarga duplica una
fila y esconde otra, y `LecturaIncompleta` no lo ve porque ninguna página queda
vacía.

---

### [MEDIO · REINCIDENTE] `?conteo=1` + `?despues=` sigue devolviendo «lo que queda» mientras el OpenAPI promete «el total de la flota»

`src/app/api/v1/viajes/route.ts:114-135` · `src/app/api/v1/openapi/route.ts:213`

Sin cambios.

---

### [MEDIO · REINCIDENTE] `pago_recibido` sigue sin llave natural

`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:108-109`

Verificado hoy: `grep` sobre las 184 migraciones no encuentra ningún índice único
sobre `pago_recibido`. Los dos únicos índices siguen siendo los no-únicos de la
0049. El mismo SPEI `SPEI-88213` de $50,000 capturado dos veces sigue sumando
dos veces dentro del saldo.

---

### [BAJO · REINCIDENTE] Siguen existiendo dos `getViajesRegistro`, y el roto sigue exportado

`src/lib/likida/analytics.ts:1038` · `src/lib/likida/viajes_registro.ts:129`

Sin cambios: `analytics.ts` sigue exportando la versión con `.range()` y sin un
solo llamador.

---

### [BAJO · REINCIDENTE] `cron/wa-pendientes/route.ts` conserva los imports muertos, incluidas las tres perillas del drenado

`src/app/api/cron/wa-pendientes/route.ts:1-16`

Sin cambios.

---

## Lo que revisé y está bien

- **BACK-C4-1 cerrado, y cerrado entero.** `aplicarFactura` recibe
  `eventoCreadoUnix` (`suscripcion.ts:836`), descarta con log el evento más viejo
  (`:841-850`) y sella **después** del upsert con la razón escrita (`:885-890`).
  `cancelarFacturaDeStripe` entra al mismo ledger (`:958-959`), así que un
  `invoice.paid` reentregado ya no resucita una factura cancelada con su
  `cfdi_cancelado_en` puesto. `llaveOrden` (`:761`) separa las series por prefijo
  de Stripe (`sub_…` / `in_…`) sin que se pisen. Y el webhook pasa el `created`
  en las cuatro ramas que fijan estado (`route.ts:208,266,281`), no solo en la de
  suscripción. `ordenAplicado` devolviendo `null` ante un error de lectura
  (`:772-775`) es fail-open declarado, con su razón: «dejar de aplicar un evento
  real es peor que aplicar uno viejo».
- **El claim durable de `correo/entrante`** (`route.ts:217-252`, `0177:14-46`).
  El `insert`+`delete` que perdía el CFDI se sustituyó por `reclamar_correo` con
  token y lease: `busy` contesta 503 con `Retry-After` (`:237`) para que Resend
  siga viva, `applied` es el único acuse definitivo (`:231-234`), y `finalizar`
  ancla al `claim_token` **y** a `estado='processing'` (`0177:36,43`) para que un
  worker viejo no pueda cerrar el trabajo de otro. El comentario de `0177:38-41`
  —`now()` congelado en la transacción hace que un reintento inmediato se vea
  `busy`, por eso `'-infinity'`— es la clase de detalle que solo se encuentra
  ejecutándolo. Y el orden es correcto: kill switch (`:201`) y llave (`:211`)
  **antes** del claim, para no consumir el correo.
- **El webhook de WhatsApp, en serie por chofer.** `route.ts:329-338` agrupa por
  `evento.from`, `conPool` paraleliza entre choferes y el `for` interno los
  serializa dentro de cada uno; el `continue` de `:347` está comentado con la
  razón exacta (un `return` se saltaría los mensajes SIGUIENTES del mismo
  chofer). Y `leerCuerpoAcotado` (`:18-38`) cierra el hueco del `content-length`
  ausente **antes** del HMAC.
- **Las dos rutas de Cal.com son literalmente la misma.** `webhooks/calcom/route.ts`
  reexporta el `POST` de `webhook/calcom` (`:3`) y **redeclara** `runtime` y
  `dynamic` como literales con el comentario que explica por qué reexportarlos no
  funciona en Next (`:5-8`). No hay dos implementaciones que diverjan: la
  duplicación es de ruta, no de código. `verificarFirmaCalcom` (`calcom.ts:31-37`)
  exige 64 hex antes del `timingSafeEqual`, así que una firma de largo distinto no
  lo hace lanzar.
- **Las reservas de presupuesto del runner.** `reservar_presupuesto_agente`
  (`0180:25-46`) toma `pg_advisory_xact_lock` por `(agente, día MX)` —correcto
  dentro de una RPC de PostgREST, que corre en su propia transacción—, incluye las
  reservas vivas en el cálculo (`:38-40`) y aparta TODO el saldo, de modo que la
  segunda vuelta concurrente recibe `v_disponible <= 0` y se salta con motivo
  (`runner.ts:218-221`). El lease de 300 s no puede vencer a media corrida porque
  `cron/runner` declara `maxDuration = 60`. Si la invocación muere, `cerrarReserva`
  no corre y el saldo queda bloqueado cinco minutos: conservador, y el comentario
  de `runner.ts:99-101` lo dice.
- **`reclamar_wa_outbox`** (`0180:85-101`) usa el patrón correcto: `for update
  skip locked` dentro del CTE, `limit greatest(1, least(p_limite,100))` topado en
  la base, y recupera los `sending` con lease vencido. Dos crones solapados no
  mandan la misma fila. El problema del outbox no es el claim.
- **`poliza_datos_tenant` sí coincide con lo que la ruta espera.** Intenté
  refutar el módulo por ahí y no se sostiene: la 0175 emitía `baseEstimada` y
  conceptos sin `baseConocida` —lo que habría bloqueado el 100% de las
  liquidaciones en `route.ts:168`— pero **0178:196-241 la sustituye** con
  `baseDesconocida` y `baseConocida` por concepto, con `bool_and(sub_total is not
  null)` y `subtotal` explícitamente `null` cuando no se conoce. El contrato
  cuadra. Y la ruta arma **todas** las pólizas antes de escribir una
  (`route.ts:164-202`), con la razón escrita: medio archivo es peor que ninguno.
- **`sincronizarGpsTodas` lanza cuando no puede leer las credenciales**
  (`sincronizar_gps.ts:184-188`) en vez de devolver `[]`, con el comentario que
  dice por qué: «pintaba verde con 0 flotas, ocultando una base caída durante
  días». Y el `.eq('tenant_id', …)` del mapeo device→unidad (`:111`) está
  comentado como no decorativo, que es cierto: `supabaseAdmin` salta RLS.
- **`guardarFacturaProveedor` es idempotente de verdad** (`proveedores.ts:148-152`):
  `23505 → 'duplicada'`, así que el reintento completo que provoca el 503 de
  `caidas > 0` (`correo/entrante/route.ts:357-365`) no puede duplicar una factura
  de proveedor.
- **La puerta de los crones sigue siendo una y las siete la usan.** `puertaCron`
  en `escalar`, `facturar`, `gps`, `purgar`, `runner`, `wa-pendientes` y
  `wa-outbox`; `cron_latido_id_dominio` se ensanchó **en migración**
  (`0176:80-81`, `0180:124-126`) para admitir `gps` y `wa-outbox`, que es
  exactamente lo que el comentario de la 0176 pide («añadir un cron significa
  ensanchar el dominio a propósito, aquí, no en el código»).
- **El export de póliza tiene sus tres puertas**: rate limit por IP y por tenant
  (`route.ts:65,72`), tenant de la sesión vía `resolverTenantApi` (`:68`) y
  `puedeExportar(t.rol)` (`:75`) antes de mirar un parámetro. `fechaValida`
  (`:54-58`) rechaza `2026-02-31` comparando el ISO de vuelta, y el tope de 92
  días contesta 413 con la cifra pedida (`:89-95`).
- **El límite de cuerpo de Cal.com se aplica dos veces**: `bodyExcede` por
  cabecera y `raw.length` después (`route.ts:45-47`), los dos **antes** de
  verificar la firma — el orden correcto para no materializar un cuerpo enorme sin
  firmar.

---

## Lo que NO alcancé a revisar

- **`procesarLoteEnCola`** (`cron/facturar/route.ts:400-560`): cuarta ronda que
  se queda fuera. No abrí el reparto de un mismo UUID sobre N gastos con
  `cfdi_orden` ni `anotarBloqueo`.
- **`src/lib/likida/repo.ts` completo.** Confirmé el reincidente de `:746` por
  patrón; no recorrí las otras ~38 consultas buscando más `error` descartados con
  alias.
- **`src/lib/saas/transferencia.ts`**: `timbrando_en` como candado y el compensado
  del PAC siguen sin abrirse (tercera ronda).
- **`src/lib/likida/perfil/entrevista-aplicar.ts`**: es el que ESCRIBE la
  configuración fiscal del tenant desde una conversación. Leí la ruta y el
  agente; el aplicador —qué valida antes de escribir en `tenant.perfil`— no lo
  abrí. Le toca también al rubro agéntico, pero el contrato de escritura es mío y
  queda pendiente.
- **`conectores/posiciones.ts`** (los cuatro lectores de proveedor): solo verifiqué
  `posicionValida` en el poller, no el parseo de cada JSON ajeno.
- **`adaptadores/pagina_playwright.ts`**: quinta ronda sin revisar.
- **No ejecuté nada contra una base real ni corrí la suite completa.** Los tres
  hallazgos de outbox se sostienen por lectura del par `route.ts`/`0180` y por
  `grep -rn "wa_outbox" src/` (dos archivos, cero lectores de la cola muerta); el
  de Cal.com, por `grep -rn "procesado_en"` (cero escritores) más el propio test
  que afirma el comportamiento; el de onboarding-chat, por comparación línea a
  línea con `chat/route.ts`. Ninguno necesita una base para verificarse, pero
  ninguno está probado por el arnés tampoco — que es justo lo que baja la nota.
