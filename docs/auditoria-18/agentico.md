# Sistema agéntico y orquestación — auditoría 18

**Nota: 5/10** (antes 5). Razón del movimiento: **no se mueve, y es una mirada más
profunda la que lo sostiene.** El ciclo del CHOFER subió de verdad desde la ronda 2
—barrera fail-closed, mutex, snapshot de cierre, tres guardias sobre el texto del
modelo, resumen de ráfaga, `cerroSinEntregar` en el log— y por su cuenta valdría 7.
Lo que compensa hacia abajo es la mitad NUEVA del ciclo (`oficina_wa.ts`,
`avisar_cierre.ts`, el inbox durable de `route.ts`), que se cableó sin las mismas
reglas: ahí hay un acuse que afirma una entrega que no ocurrió, cifras que llegan
al rol que el producto excluye por escrito, y una máquina de reintento que no
reintenta nada de lo que dice reintentar. Sumado a que el arranque suelta el mutex
del camino del dinero de otro proceso, los bordes siguen siendo suposiciones — que
es la definición del 5.

**El riesgo mayor hoy:** el ciclo se cierra con la persona equivocada o no se
cierra, y en los tres casos el sistema afirma que sí se cerró.

---

## Hallazgos

### [ALTO] El informe en PDF de la oficina se acusa como entregado aunque Meta lo rechace
`src/lib/likida/oficina_wa.ts:117-118`

```ts
const enviado = await sendDocument(telefono, firma.data.signedUrl, `informe-operacion.pdf`, 'Tu informe de operación 📊');
if (!enviado) throw new Error('informe.envio: WhatsApp no aceptó el documento');
return 'Ahí te va tu informe en PDF 📊 — cifras del sistema de este momento.';
```

`sendDocument` (`src/lib/meta/client.ts:366-371`) devuelve
`{ ok: true, id } | { ok: false, error, codigo }` — **siempre un objeto**, así que
`!enviado` es siempre `false` y el `throw` es código muerto.

**Escenario:** el dueño escribe «mándame el informe en pdf» desde
`5215512345678`, un número que todavía no está en la lista de destinatarios del
número de prueba de Meta. Meta contesta `131030`; `sendDocument` registra
`wa.sendDocument` y devuelve `{ ok: false, error: 'Recipient phone number not in
allowed list', codigo: 131030 }`. La condición no dispara, el `catch` del
llamador (`processor.ts:605-608`) tampoco, y el dueño recibe **«Ahí te va tu
informe en PDF 📊 — cifras del sistema de este momento.»** y ningún documento.
Se queda esperando un archivo que nunca va a llegar, y `logger.info('oficina.informe_pdf')`
lo registra como éxito.

**Consecuencia:** el comprador pide su informe delante de su equipo y el producto
le dice que ya se lo mandó. Es exactamente el mismo defecto que `processor.ts:2492-2496`
y `avisar_cierre.ts:127-129` ya corrigieron para el PDF de liquidación (auditoría 12,
ALTO); este llamador nació con el contrato viejo tres días después.

**Por qué no lo atrapa la prueba:** `src/lib/likida/oficina_wa.io.test.ts:32` mockea
`sendDocument` devolviendo **el string `'wamid-1'`** — el contrato anterior al cambio.
La prueba pasa con la función rota y pasaría igual si `sendDocument` devolviera
`{ok:false}`.

**Causa raíz probable:** el llamador nuevo se escribió copiando el patrón viejo
(`sendText` → `string | null`) sin releer la firma de `sendDocument`, y el mock de
su prueba se escribió del mismo recuerdo.

---

### [ALTO] Un mensaje que muere o se abandona a media ejecución queda sellado como procesado: el inbox durable no reintenta nada
`src/app/api/webhook/whatsapp/route.ts:249-259` · `src/lib/likida/processor.ts:420-424`

El inbox durable (0119, cableado el 16-ago) declara en `route.ts:170-173`: *«si la
invocación muere después del acuse y antes de terminar el after(), la fila durable
sigue ahí y el cron `wa-pendientes` la recupera por el motor real»*. No la recupera,
por dos motivos independientes:

1. **`claimMessage` se reclama ANTES de cualquier efecto** (`processor.ts:420`). En
   el reintento, el mismo `waMessageId` devuelve `'duplicado'` y `processInbound`
   sale en la línea 423 sin hacer nada — y `route.ts:255` / el cron sellan
   `procesado_en`.
2. **Los caminos de abandono retornan normalmente**, no lanzan. `marcarPendienteProcesado`
   solo se salta cuando `processInbound` **lanza** (`route.ts:256`), y `processInbound`
   atrapa todo en su `catch` general (`processor.ts:2561-2598`).

**Escenario con valores:** el operador manda «listo» a las 14:03. La invocación
toma el mutex, corre `esperarIntake` (20 s) y entra al agente; a los 118 s Vercel
la mata (`maxDuration = 120`). Estado en la base: `wa_mensaje_procesado` tiene
`wamid.HBgM...`; `wa_evento_pendiente` tiene la fila con `intentos = 1`,
`procesado_en = null`. A las 14:08 el cron drena: `reclamarPendiente` gana,
`processInbound(evento)` → `claimMessage` → `23505` → `'duplicado'` →
`logger.info('wa.duplicate')` → `return`. El cron llama `marcarPendienteProcesado`
y cuenta **1 procesado**. El operador nunca recibe cuadre ni PDF; el reporte del
cron dice que todo salió bien.

El caso hermano es el abandono explícito: `processor.ts:2090-2098` (mutex ocupado),
`:947-962` (el `+1` de la barrera falló en una foto), `:1633-1638` (lo mismo con el
XML) y `:707-724` (aviso de privacidad con fallo transitorio) hacen
`releaseMessageClaim(...)` + `return`. Liberar ese claim ya no sirve para nada —el
propio `conv.ts:334-338` documenta que el reintento de Meta *no existe*— y ahora
además el `return` normal hace que la fila durable, que sí podría recuperarlo, se
selle como procesada.

**Consecuencia:** el único mecanismo de recuperación del producto solo cubre el
caso del kill-switch (mensajes que nunca entraron a `processInbound`). Para el modo
de falla que más duele —«se trabó a media liquidación»— la recuperación es inerte y
depende por completo de que el chofer vuelva a escribir.

**Causa raíz probable:** dos capas de idempotencia escritas con meses de diferencia
y ordenadas al revés — la de mensaje (0002) reclama al ENTRAR, la durable (0119)
sella al SALIR, y ninguna sabe de la otra.

---

### [ALTO] El cierre de liquidación —cifras y PDF— sale por WhatsApp al *encargado*, el rol que no ve dinero
`src/lib/likida/avisar_cierre.ts:95` · `src/lib/likida/contactos.ts:94` · `src/lib/auth/visibilidad.ts:41`

`avisarCierreAlJefe` resuelve el destinatario con `telefonoJefeDe(tenantId)`, y ese
lookup tiene un orden de preferencia fijo:

```ts
const ORDEN_AVISO: RolOficina[] = ['encargado', 'flota_admin'];   // contactos.ts:94
```

El **encargado va primero**. Y `visibilidad.ts:41` dice `encargado: ['operacion']` —
sin `dinero`, con un archivo entero de comentarios explicando que enseñarle el
margen «no es un detalle de UI, es exponerle a un puesto medio las finanzas
completas de la empresa», y con `dinero_por_area.test.ts` escaneando las páginas
para que no se cuele.

Lo que recibe por WhatsApp cuando un chofer cierra:

- `armarAvisoJefe` (`cierre_aviso.ts:324`): `Anticipo $8,000.00 · Comprobado
  $6,150.00 · Sobró $1,850.00 del anticipo (a favor de la empresa)`, más las
  líneas de `sobre_politica`, `sin_comprobante`, `cfdi_efos`…
- y el **PDF de la liquidación completa** (`avisar_cierre.ts:127`).

**Escenario:** flota con Lupe (`rol: 'encargado'`, teléfono capturado para poder
recibir escalaciones de despacho) y Javier (`flota_admin`). El chofer Juan cierra
su viaje V-1042. Lupe recibe en su teléfono personal el anticipo, el comprobado, la
diferencia y el PDF de la liquidación de Juan. Abre `/dashboard` y no puede ver ni
una de esas cifras.

**Consecuencia:** el canal de WhatsApp es la puerta trasera de la matriz de
visibilidad, exactamente lo que `oficina_wa.ts:29-30` declara que no puede ser
(«el canal no puede ser la puerta trasera») y lo que `informes_wa.ts:115-116`
implementa bien tres archivos más allá (`if (puedeVerArea(rol, 'dinero'))`). Un
contralor que lo note en la sala pregunta qué más se está mandando solo.

**Causa raíz probable:** `telefonoJefeDe` se escribió para la ESCALACIÓN de
despacho —un aviso de operación, donde el encargado es el destinatario correcto— y
se reusó tal cual para el cierre, que es un aviso de dinero. La lista de preferencia
no tiene por dónde saber de qué tipo de aviso se trata.

---

### [ALTO] El arranque libera el mutex del viaje que otro proceso está cerrando
`src/lib/likida/startup.ts:63-70`

```ts
const { data: viajeReal } = await admin.from('viaje').select('id').limit(1);
if (viajeReal?.[0]?.id) {
  const { error } = await admin.rpc('try_lock_viaje', { p_viaje: viajeReal[0].id, p_ttl_ms: 1 });
  ...
  await admin.rpc('unlock_viaje', { p_viaje: viajeReal[0].id }); // liberar el lock de prueba
}
```

Dos cosas a la vez. El `data` de `try_lock_viaje` (que devuelve `false` cuando otro
proceso tiene el lease vigente) **se ignora**, y `unlock_viaje` no tiene noción de
dueño: `delete from viaje_lock where viaje_id = p_viaje` (`0005_*.sql`). O sea que
el sondeo borra el lease **exista o no, sea suyo o no**. Y `instrumentation.ts`
llama `verificarMigracionesCriticas()` en `register()`, que corre en **cada arranque
en frío de una instancia de Vercel** — no una vez al día.

**Escenario con valores:** la base del demo tiene 3 viajes; `select id from viaje
limit 1` devuelve `V` (el mismo, corrida tras corrida, sin `order by`). 14:03:00 —
el operador escribe «listo»; la invocación A hace `acquireViajeLock(V, ttl 60_000)`
→ `true`, y entra a `esperarIntake` + agente (~35 s). 14:03:04 — el operador manda
un segundo mensaje; Vercel escala y arranca una instancia nueva, que ejecuta
`register()` **antes** de atender su petición: `try_lock_viaje(V, 1)` → `false`
(sin `error`), y acto seguido `unlock_viaje(V)` **borra el lease de A**. La
invocación B llega a `processor.ts:2090`, toma el lock libre, pasa la re-verificación
de `getOpenViaje` (A todavía no ha cerrado) y corre el ciclo del agente completo:
segundo `cuadrar_viaje`, segundo `guardar_liquidacion`, dos subidas más a Storage
sobre las mismas rutas, y el operador recibe el cierre y el PDF **dos veces**.

**Consecuencia:** se paga el LLM dos veces y, si una foto entró entre los dos
cálculos, los dos cierres narran cifras distintas del mismo viaje — el escenario
AG-3 que `guardiaCifras` cerró con el snapshot, reabierto por otra puerta. El
`unique(viaje_id)` de la 0005 salva la FILA, no el mensaje ni el costo: es
exactamente el modo de falla que `processor.ts:2060-2067` describe («ambas
ejecuciones reportan éxito → el operador recibe el cierre y el PDF DOS veces»).

**Causa raíz probable:** el sondeo se escribió pensando en una base de desarrollo
—«liberar el lock de prueba»— y `unlock_viaje` no distingue dueño, así que el
diagnóstico y el camino del dinero comparten un recurso sin token.

---

### [MEDIO] El jefe recibe el ejemplar del OPERADOR, no el del contralor
`src/lib/likida/processor.ts:2458` y `:2523`

La URL firmada se arma sobre `${op.tenantId}/${viajeId}-operador.pdf` —el ejemplar
filtrado, correcto para el chofer— y **esa misma URL** se le pasa a
`avisarCierreAlJefe`. El ejemplar completo existe y está subido en
`${tenantId}/${viajeId}.pdf` (`tools.ts:316`), pero nadie se lo manda.

`pdf.ts:452` filtra por destinatario con la lista `SOLO_CONTRALOR`
(`cuadre/resumen.ts:24-33`).

**Escenario:** el viaje cierra con una diferencia `cfdi_efos` (el proveedor de
diésel apareció en la lista 69-B) y una `rfc_receptor`. El aviso de texto al jefe
SÍ las enumera (`RUTA_DE_DIFERENCIA` las marca `'decision'`). El PDF que le llega
adjunto NO las trae: son `SOLO_CONTRALOR`. El jefe archiva ese PDF y se lo pasa a
su contador —que es literalmente lo que el encabezado de `avisar_cierre.ts:14-19`
dice que va a hacer— y el contador trabaja sobre un documento del que se quitaron
los dos veredictos que le tocan resolver.

**Consecuencia:** dos documentos del mismo cierre con distinto contenido, y el que
se archiva es el incompleto. El del panel (`liquidacion.pdf_path`) sí es el bueno,
así que la contradicción solo aparece cuando alguien cruza los dos — que es
exactamente lo que hace un contador.

**Causa raíz probable:** reuso de la variable `data.signedUrl` que ya estaba en
scope, en un bloque cuyo comentario («El ejemplar del OPERADOR, no el completo»)
se refiere al envío de arriba y se lee como si aplicara a los dos.

---

### [MEDIO] Si el PDF del operador no se generó, el jefe no se entera del cierre en absoluto
`src/lib/likida/processor.ts:2455-2540`

`avisarCierreAlJefe` vive DENTRO del `try` que empieza con
`if (!pdfGenerado) throw new Error('la tool reportó pdf_generado=false')`
(línea 2456). El aviso de TEXTO al jefe no depende del PDF para nada —
`armarAvisoJefe` solo necesita la fila de `liquidacion`— pero está anidado bajo él.

**Escenario:** `subir()` del ejemplar del operador falla (`tools.ts:300`,
`logger.warn('pdf.upload')`, devuelve `undefined`), así que la tool responde
`pdf_generado: false`. El `throw` de la línea 2456 salta al `catch` de 2528: se
registra `pdf.no_entregado`, al chofer se le dice la verdad («pídeselo a tu
contralor»)… y `avisarCierreAlJefe` nunca corre. Una liquidación con
`sin_comprobante` por $8,000 cierra y el único humano que puede decidir sobre ella
no recibe ni el texto ni el PDF: su única vía es entrar al panel, que es
precisamente lo que el encabezado de `avisar_cierre.ts:14-19` existe para evitar
(«si para tener el PDF hubiera que entrar a una pantalla, la mitad de las veces
nadie entra»).

**Consecuencia:** el fallo del papel del chofer se lleva por delante la
notificación de decisión del jefe. Queda el log, no queda el aviso.

**Causa raíz probable:** anidamiento — el bloque del jefe se agregó dentro del
`try` del PDF porque ahí estaba la URL, no porque compartan condición.

---

## Puntos de muerte que recorrí

| Punto del ciclo | Qué ve el humano | Qué queda en la base | ¿Cerrado? |
|---|---|---|---|
| Entre `claimMessage` y el aviso de privacidad (`processor.ts:420-706`) | Nada | `wa_mensaje_procesado` con el wamid; `wa_evento_pendiente` sin sellar | **No** — el reintento del cron muere en `'duplicado'` (hallazgo 2) |
| `intakeDelta(+1)` falla en una foto (`:947`) | «No pude registrar tu foto en el orden correcto… reenvíala» | Sin gasto, sin `+1`, claim liberado, fila durable **sellada** | Con el humano sí; automáticamente no |
| Muere entre el `+1` y el OCR de una foto (`:982-1058`) | Silencio (o el resumen parcial de otra invocación) | `intake_pendientes` clavado, lo olvida el TTL de 10 min (0031) | Sí — el siguiente «listo» espera y avisa |
| `addGasto` choca con `llegoTarde` (0036) (`:1328`) | «Llegó después de que cerré tu liquidación… te lo ofrezco en el siguiente» | Huérfano `tras_liquidar` con su imagen | **Sí** |
| Huérfano con `monto: 0` por fallo de OCR (`:814`, `:1976`) | «Se me trabó a mí… ¿me lo reenvías?» | Fila huérfana que **nunca** se ofrece (`filter monto > 0`) | Parcial — el propio código lo anota como deuda abierta |
| Mutex del viaje ocupado (`:2090`) | «Un momento, todavía estoy procesando tu mensaje anterior» | Claim liberado, fila durable **sellada** | Con el humano sí; el turno se pierde |
| Mutex liberado por el arranque de otra instancia (`startup.ts:70`) | El cierre y el PDF **dos veces** | Una sola `liquidacion` (unique), dos corridas y dos costos | **No** (hallazgo 4) |
| Presupuesto agotado antes del agente (`:2176`) | `resumenCuadre(liq, false, 'operador')` — «Este es el cuadre de tu viaje» | Viaje **abierto**, sin liquidación ni PDF | Parcial: el encabezado es honesto pero no dice que hay que volver a escribir «listo» |
| `LoopGuardError`/timeout tras `guardar_liquidacion` (`:2237-2296`) | Con `LIKIDA_RECUPERAR_CIERRE_PARCIAL=1`: el resumen real + PDF. Sin la bandera: «se me trabó, ¿me reenvías?» | Liquidación **cerrada**, dos PDF en Storage | Depende de una env var; sin ella el operador reenvía y recibe «no tienes viaje abierto» |
| `createSignedUrl` / `pdf_generado=false` (`:2456`) | «Ya quedó cerrada, pero no pude generarte el PDF» | Liquidación cerrada | Con el chofer sí; **con el jefe no** (hallazgo 6) |
| `sendDocument` del PDF rechazado por Meta (`:2493`) | «El PDF no se te entregó por un problema del chat; pídeselo a tu contralor» | Liquidación cerrada, `pdf.no_entregado` con el código de Meta | **Sí** |
| Muere entre `say(reply)` y `saveConversation` (`:2388-2559`) | El cierre y el PDF sí llegaron | El turno del asistente **no** entra al historial | Sí para este turno; el siguiente arranca con menos memoria |
| `sendDocument` del informe de oficina rechazado (`oficina_wa.ts:117`) | «Ahí te va tu informe en PDF 📊» | Nada; el objeto queda en Storage | **No** (hallazgo 1) |
| Cierre normal, flota con encargado (`avisar_cierre.ts:95`) | El **encargado** recibe anticipo, comprobado, diferencia y el PDF | — | **No** — destinatario equivocado (hallazgo 3) |

---

## Lo que revisé y está bien

- **La barrera de ráfaga falla CERRADA de punta a punta.** `intakeDelta` devuelve
  `null` (no `0`) ante error de RPC, `intakePendientes` respeta el mismo contrato,
  `esperarIntake` trata `null` como «sigue esperando» y el `+1` de foto y XML es
  fail-closed (`processor.ts:947`, `:1633`). El TTL de 10 min de la 0031 se aplica
  del lado del cliente para no re-escribir la fila en cada sondeo. Es la pieza
  mejor construida del rubro.
- **Ninguna cifra del modelo llega al humano sin cotejo.** Tres guardias en cadena
  y en el orden correcto: `guardiaCifras` (sustituye por el resumen del motor y,
  desde AG-3, reusa el snapshot que la tool ya imprimió en los PDF en vez de
  releer la base), `guardiaFundamento` (solo si el texto NO es ya determinístico) y
  `guardiaEstado` (cotejo contra `closed`, con `entrego: 'pendiente'` en vez de
  `false` — la regresión de la ronda 6 sigue cerrada).
- **`resumenCuadre` recibe `'operador'` explícito en los tres llamadores**
  (`guardia.ts:116`, `processor.ts:2180`, `:2286`) y `SOLO_CONTRALOR` filtra tanto
  el texto como el PDF. El default `'contralor'` es el seguro correcto.
- **El candado del cierre en ceros vive en la TOOL**, no en la detección de frases
  (`tools.ts:274-282`), que es lo que hace irrelevante que `pareceCierre` no
  reconozca una frase nueva. `cierreEnCerosConfirmado` viaja por `ToolContext`, no
  por argumento del modelo.
- **La deduplicación de mutaciones cachea la PROMESA, no el resultado**
  (`tool-executor.ts:157-180`), y la llave es el NOMBRE de la tool y no sus args:
  cierra la ventana check-then-act del `Promise.all` de una ronda. El loop-guard
  corta ANTES de pagar la última ronda (`openrouter.ts:792`), así que no se ejecuta
  una mutación cuyo resultado nadie va a leer.
- **`AdminActionIntent` cierra bien el agujero del booleano del cliente.** El
  `gateo` sale del catálogo del servidor (`copiloto.ts:72-83`), no del modelo; el
  `argsHash` ata la ejecución a la previsualización; el consumo es un UPDATE con
  las guardas en el `WHERE` (`copiloto-intents.ts:140-149`), así que dos POSTs
  simultáneos no ejecutan dos veces; y el step-up de AAL2 se pide ANTES de gastar
  el intent. Los cuatro rechazos comparten un solo mensaje a propósito.
- **`resolveOperador`, `getOpenViaje`, `loadConversation` y `getTenantContext`
  distinguen «no existe» de «no pude preguntar»** y lanzan `ConsultaFallida`, que
  el catch general traduce a un mensaje que no afirma nada falso. La carrera del
  INSERT de `wa_conversacion` se resuelve chocando y releyendo, no con upsert (que
  pisaría el historial).
- **El texto del cierre al chofer y al jefe son dos textos distintos con dos
  criterios distintos** (`cierre_aviso.ts`), con `RUTA_DE_DIFERENCIA` exhaustivo
  sobre `TipoDiferencia` y fallando hacia «molestar al jefe de más» ante un tipo no
  clasificado. El contenido está bien pensado; el problema es a quién se manda.
- **La escalación de 5 h reclama antes de mandar** (`escalar_viaje.ts:266`), con el
  claim y el cierre en la MISMA escritura, y ordena por `avisado_en` para que el
  lote sea una cola que drena.

## Lo que NO alcancé a revisar

- **`src/lib/likida/agentes/`** completo (cobranza, cola, runner, notificaciones,
  estrategia, redactor): son ~11 módulos con su propio ciclo disparado por cron y
  su propio anti-ruido. Solo entré por `avisar()` desde `escalar_viaje.ts`. La
  pregunta abierta que dejo apuntada: `avisar(tenantId, 'conductores', 'escalado', …)`
  reparte por correo — ¿filtra por rol como `informes_wa`, o repite el patrón del
  hallazgo 3?
- **`atenderAsignacionOficina`** (`asignar_wa.ts`) lo leí solo por encima para
  verificar que no colisiona con `despacho_wa` en `wa_conversacion.estado`. Los dos
  reescriben el jsonb ENTERO con su única llave; el orden del `processor` hace que
  hoy no se pisen, pero es una invariante que vive en el orden de dos `if`, no en
  el código de ninguno de los dos módulos.
- **`consulta_chofer.ts` / `acuse_ticket.ts` / `decidirAcuse`**: los recorrí desde
  el processor pero no revisé sus tres peldaños contra sus pruebas.
- **No pude verificar contra base ni contra render**: sin `.env`, sin Supabase y
  sin `npm run build` (restricción de la corrida). Todo lo de arriba se sostiene por
  lectura del código y por los contratos que las propias pruebas fijan; los cuatro
  ALTOS son deterministas por lectura (una condición muerta, un `delete` sin dueño,
  una lista de precedencia y dos capas de idempotencia mal ordenadas), no
  probabilísticos.
