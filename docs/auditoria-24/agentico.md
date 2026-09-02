# Sistema agéntico y orquestación — auditoría 24

**Nota: 5/10** (antes 4). Razón del movimiento: **se atacó y subió**. AGEN-1 —el
crítico reincidente de tres rondas— está REALMENTE cerrado: recorrí el ciclo
punto por punto y cada muerte posterior al commit del cierre tiene hoy un cierre
definido hacia el chofer. Lo que impide subir más no está en el cierre: está en
**quién tiene derecho a hablar** y en **dos frases que afirman un hecho que
nadie comprobó**.

Riesgo mayor hoy: una cuenta de oficina **dada de baja** (`app_user.activo =
false`) sigue siendo reconocida por WhatsApp y conserva el mando de la flota —
despacha viajes, autoriza dinero y recibe el PDF completo del contralor— mientras
el panel y la RLS ya la echaron.

---

## Hallazgos

### [CRÍTICO] La baja de un usuario cierra el panel y deja abierto WhatsApp: `resolverCuentaOficina` no mira `app_user.activo`
`src/lib/likida/contactos.ts:59-63` (y `:127-132` `telefonoParaDineroDe`, `:158-163` `telefonosJefe`)

La migración `0294_app_user_activo_y_sesiones.sql` existe exactamente para esto y
lo dice con todas sus letras: «el contador externo que dejó de trabajar con la
flota conservaba su cookie… seguía descargando CFDI y liquidaciones semanas
después». Cerró **dos** capas: `session.ts:99` devuelve `null` con `activo =
false`, y las cuatro funciones de RLS filtran `and activo`. La tercera capa —el
canal por el que de verdad funciona el producto— no se tocó: las tres consultas
de `contactos.ts` seleccionan `app_user` **sin** filtrar `activo`.

Escenario, con valores:
- Flota Innovativos da de baja a su `flota_admin` Luis (`app_user.activo =
  false`, BAN en Auth). Su teléfono `5219993700779` sigue en `app_user.telefono`.
- Luis escribe a WhatsApp: `nuevo viaje para Juan Pérez, Puebla a Monterrey,
  anticipo 8000`.
- `processor.ts:1355` → `resolveOperador` no lo encuentra (no es chofer) →
  `processor.ts:1366` `resolverCuentaOficina` **lo devuelve como
  `{rol:'flota_admin', tenantId:'innovativos'}`** → `processor.ts:1429`
  `atenderTextoOficina(..., {incluirPreguntaLibre:true, incluirDespacho:true})`
  → `puedeAsignar('flota_admin')` = true → resumen + «sí» → **viaje creado con
  $8,000 de anticipo**, y el chofer real recibe la asignación.
- Con el mismo número Luis también: aprieta `tal_si:<uuid>` y **autoriza una
  talacha de $2,400** (`processor.ts:601` `atenderAutorizacionTalacha`), pregunta
  «¿cómo van?» y recibe el informe financiero de la flota, y —por
  `telefonoParaDineroDe`— **sigue recibiendo en cada cierre el texto con
  anticipo/comprobado/diferencia y el PDF del CONTRALOR** (`avisar_cierre.ts:118`),
  que es el ejemplar con RFC, folios y veredictos fiscales.

Hay ~20 llamadores de `telefonoJefeDe`/`telefonosJefe`/`telefonoParaDineroDe`
(escalación, asistencia 🚨 con ubicación del chofer, carta porte, vigilante,
peaje, relojes legales): todos siguen escribiéndole al ex-empleado.

Consecuencia: la flota cree que dio de baja a alguien y no lo dio de baja; el
ex-empleado conserva mando operativo y financiero, y sigue recibiendo datos
personales del chofer (ubicación, nombre, teléfono) y fiscales de la flota. Los
propios términos le cargan a la empresa «dar de baja a quien deja de trabajar
ahí» — y el producto le entrega media baja.

Causa raíz probable: `activo` se añadió pensando en la sesión web (`session.ts`)
y en RLS; el camino de WhatsApp usa `supabaseAdmin()` (service-role, salta RLS) y
resuelve por teléfono, así que ninguna de las dos capas lo alcanza.

---

### [ALTO] «Tu jefe ya tiene la solicitud» se afirma sin haberlo comprobado — y justo en la rama a la que se llega DESPUÉS de que el aviso falló
`src/lib/likida/talacha_wa.ts:243` y `src/lib/likida/talacha_wa.ts:275`

`avisarAlJefe` (`talacha_wa.ts:157`) devuelve `boolean` y su comentario dice el
contrato: «`true` solo si Meta la aceptó — el llamador le dice al chofer la
VERDAD». El primer reporte lo respeta (`:311`, «NO le pude mandar el aviso a tu
jefe»). Los dos caminos de **reporte repetido** no: devuelven la afirmación fija.
Y no pueden saberlo, porque el resultado del aviso **no se persiste**:
`pendienteDelViaje` (`:114-121`) lee `id, monto_estimado, evidencia_path,
gasto_id` y `crearIncidencia` no guarda ningún «avisado».

Escenario, con valores:
1. 02:10. El chofer escribe `se me ponchó una llanta, la talacha son 800`.
   `atenderTalachaChofer` crea la incidencia y llama `avisarAlJefe` →
   `sendButtons` al teléfono del dueño, que despacha desde el panel y lleva 3
   días sin escribirle al número de Likida → Meta responde **131047**
   (re-engagement) → `sendButtons` devuelve `null` (`meta/client.ts:373`;
   `esReintentableMeta(131047)` es `false`, así que tampoco entra al outbox) →
   `avisado = false`. El chofer recibe la verdad: «NO le pude mandar el aviso».
2. 02:14. El chofer manda la **foto de la nota** con el mismo texto.
   `pendienteDelViaje` encuentra la incidencia, `cambios = {evidencia_path}`,
   `cambios.monto_estimado === undefined` → **no se reintenta el aviso** → línea
   275: «Listo, quedó la foto de evidencia en tu reporte 📸. **Tu jefe ya tiene la
   solicitud** — en cuanto decida te aviso.»
3. El chofer deja de marcarle al jefe y espera. La incidencia queda `pendiente`
   en el panel, el jefe nunca la vio, el tracto sigue parado.

La línea 243 es peor todavía: el chofer repite el reporte tal cual, `cambios`
queda vacío y se le contesta «Ya tengo anotada esa avería y **tu jefe tiene la
solicitud** 👍» sin tocar la base ni Meta.

Consecuencia: es exactamente el estado que este rubro puntúa más bajo —la base
dice `autorizacion='pendiente'` sin aviso entregado y el humano cree que su jefe
ya está decidiendo—, sobre dinero y con una unidad detenida. Y contradice la
lección de AGEN-5/WA-4, que en esta misma rama cerró el 131047 para
`avisarCierreAlJefe` con `avisarOficina` (texto → plantilla) pero no tocó el
🔧 de la talacha, que sale por `sendButtons` sin ningún respaldo de plantilla.

Causa raíz probable: el éxito del envío es una variable local (`avisado`) y no un
hecho persistido, así que el segundo turno no tiene con qué desmentirse.

---

### [ALTO] El resumen consolidado de la ráfaga cuenta las copias y contradice al motor y al PDF
`src/lib/likida/processor.ts:2930-2943`

```
const puestos = await getGastos(viajeId, op.tenantId);
const total = puestos.reduce((s, g) => s + (g.monto > 0 ? g.monto : 0), 0);
…
`📸 Ya revisé tus fotos. En este viaje llevo *${puestos.length} comprobantes* por *${mxn(total)}*.`
```

Ni el conteo ni la suma aplican `copiasDeComprobante` — la regla que el motor
(`cuadre/engine.ts:421`) y el PDF sí aplican. Es **el mismo defecto** que la
propia auditoría 24 cerró en `estado_viaje` como TC-1 (ALTO, 3ª ronda,
`tools.ts:113-123`: «las copias son el flujo normal, no el caso raro… el chofer
leía "llevas 4 comprobantes por $25,443" de un anticipo de $12,000 y al cerrar el
PDF decía $9,681»), y que la rama del «sí» a los huérfanos también respeta
(`processor.ts:3520`). El resumen de la ráfaga se quedó fuera: AGEN-8 (`eba080c`)
quitó el «De tus N fotos» y declaró que lo que queda «sí se midió», pero lo que
queda es la cifra inflada.

Escenario, con valores:
- Protocolo normal de dos fotos: el chofer manda el ticket de diésel de
  **$8,340.50** (folio `05461`) y el **acercamiento al QR** del mismo ticket, más
  el ticket de caseta de **$1,341.00**. Son 4 filas en `gasto` (ticket, copia,
  caseta, voucher), con `folio_norm` y monto idénticos entre original y copia.
- `copiasDeComprobante` marca 2 como copias → el motor y el PDF dicen **2
  comprobantes por $9,681.50**.
- El resumen de la ráfaga dice **«En este viaje llevo *4 comprobantes* por
  *$19,363.00*»**.
- Minutos después el chofer escribe «listo» y recibe `resumenCuadre` con
  **$9,681.50**. Dos cifras del mismo viaje, con $9,681.50 de diferencia, en el
  mismo hilo.

Consecuencia: el chofer cree que ya sobrepasó el anticipo y deja de mandar
tickets; si los reenvía, choca con el trigger 0036. Y si el contralor mira el
teléfono del chofer en la sala, ve una cifra que su PDF desmiente — que es
literalmente el modo de falla que el producto declara como definitorio.

Causa raíz probable: `getGastos` devuelve filas crudas y este es el único
consumidor del camino del chofer que no pasa por `copiasDeComprobante`; el fix de
AGEN-8 se concentró en el numerador de fotos y dio por buena la suma.

---

### [MEDIO] El sondeo de la 0172 INSERTA un `tenant` real en cada arranque en frío, y el arranque no espera a que lo borre
`src/lib/likida/startup.ts:230-252` · `src/instrumentation.ts:33`

El sondeo del CHECK de régimen 624 no es de lectura: hace
`admin.from('tenant').insert({ nombre: '__likida_probe_624__', regimen_fiscal:
'624' })` y confía en un `finally` que lo borra. Pero `register()` lanza
`verificarMigracionesCriticas()` con **`void`** (a propósito, RES-2: para no
retener el primer 200), y en Vercel la instancia se congela en cuanto la
respuesta sale. El webhook contesta 200 en milisegundos; los diez sondeos —cada
uno hasta 9.5 s de red— quedan en vuelo.

Escenario, con valores:
- Instancia fría del webhook. `register()` dispara los sondeos y devuelve.
  `POST /api/webhook/whatsapp` contesta 200 a los ~40 ms.
- El `insert` del sondeo alcanza a commitear; el `delete` del `finally` queda
  pendiente cuando Vercel congela la instancia. Si esa instancia se recicla sin
  volver a invocarse, la fila **nunca** se borra.
- `tenant` es `(id, nombre not null, rfc, ciudad, plan default 'demo')`
  (`0001_init.sql:9-13`): el insert pasa.
- `lib/admin/negocio.ts:384` lista los tenants filtrando solo
  `.not('nombre','ilike','ZZZ %')` — `__likida_probe_624__` **no** empata. Aparece
  en `/admin` como una flota más, con plan `demo`, y suma en `tenants:
  flotas.length` (`:457`).

Consecuencia: la consola de Javier —la que cruza todos los tenants y con la que
se mira el negocio— cuenta flotas que no existen, y el conteo se mueve solo con
los arranques en frío. Con 0 clientes reales, una flota fantasma es la mitad de
la lista.

Causa raíz probable: es el único de los once sondeos que ESCRIBE, y hereda el
fire-and-forget que se diseñó para sondeos de lectura.

---

### [BAJO] El resumen de la ráfaga sale por `sendText` y no por `say`: su costo de WhatsApp no se cuenta
`src/lib/likida/processor.ts:2942` (contra `processor.ts:2923`, que sí usa `say`)

Doce líneas más arriba el propio archivo explica por qué el mensaje de la foto
suelta va por `say`: «para que siga contando su costo de WhatsApp». El resumen
consolidado —el único mensaje de un fajo de 22 fotos— sale por `sendText` crudo,
así que no llama `registrarCostoWhatsApp` y su resultado tampoco se mira. En un
negocio que cobra POR LIQUIDACIÓN, el costo unitario se subestima en el camino
más transitado, y un rebote de Meta en ese mensaje deja al chofer sin la única
respuesta de todo su fajo, sin más rastro que el log interno de `sendText`.

Causa raíz probable: el bloque se escribió como «aviso operativo» y no como turno
de conversación.

---

## Lo que revisé y está bien

- **AGEN-1 está cerrado, y por el camino que la ronda 23 señaló.** El disparador
  real es el techo de `acotada` (`presupuesto.ts:219-240`: a los 9.5 s resuelve
  `{data:null, error:'sin respuesta en 8000 ms'}` mientras `guardar_liquidacion_tx`
  commitea del lado del servidor). Recorrí la cadena entera: `repo.ts:1073`
  lanza → `tools.ts:293` propaga → `tool-executor.ts:252-280` devuelve
  `{success:false}` → `openrouter.ts:1178` empuja el registro con `error` →
  `processor.ts:3814` `closed = false`. **Y ahora `processor.ts:3822-3845` relee
  la base también en el camino feliz**, no solo en el `catch` (`:3924-3935`).
  Los tres desenlaces están cubiertos: `cerrado` → registro sintético con el
  vocabulario de la tool (`pdf_generado`, que es lo que leen `:4203` y
  `guardia.ts`), PDF entregado y `logger.error('agent.cierre_commiteado_tras_fallo_tool')`;
  `no_verificable` → no se afirma ni «cerré» ni «no cerré»; `abierto` → colofón
  explícito. Y si la relectura llega antes que el commit, el siguiente «listo»
  cae en `processor.ts:1979` → `entregarCierrePendiente` y el PDF sale igual.
  Verifiqué además que la señal SÍ llega al handler (`tool-executor.ts:221`
  `runWithToolSignal` + `supabase/admin.ts:33` `currentToolSignal()`), o sea que
  el diagnóstico de la 22 estaba mal y el de la 23 bien.
- **AGEN-4 no quedó inerte.** Los sellos de la 0279 se escriben en los tres
  puntos (`processor.ts:4266`, `:4338`, `conv.ts:222-239` con `.is(sello,null)`
  para ser idempotente) y se LEEN en `entregarCierrePendiente`
  (`processor.ts:1043-1097`), que entrega lo que falte y narra por
  `mensajeCierreConfirmado` (`:1101-1109`) con cuatro estados distintos, sin
  prometer una entrega que Meta no aceptó.
- **BE-11 / el mutex con dueño es real:** `nuevoTokenDeLock()` (`conv.ts:790`),
  el token viaja a `try_lock_viaje` (`conv.ts:836`) y `unlock_viaje` solo borra
  con `token is not distinct from p_token` (0280); el `finally` del turno suelta
  con SU token (`processor.ts:4401`). La ventana de despliegue está cubierta con
  el reintento sin token (`conv.ts:856-871`), que además NO concluye «abre el
  mutex» sin volver a preguntar.
- **AGEN-6 tiene las dos mitades:** el orden de la cola por hora del mensaje
  (`wa_orden_evento` en 0280, usado por `listar_wa_pendientes` y por el `not
  exists` de `reclamar_wa_pendiente`) y el turno ya en vuelo
  (`conv.ts:921-952` `fotoAnteriorSinProcesar`, llamado en
  `processor.ts:3619` DESPUÉS de la barrera, con `->` jsonb para comparar
  números como números).
- **AGEN-7 hace lo que dice:** `route.ts:301` lee `leerInterruptor` y distingue
  `apagado` (avisa) de `ilegible` (calla), el aviso es uno por número
  (`route.ts:589-606`) y corre DESPUÉS de `guardarEventosPendientes`
  (`route.ts:250`), así que un aviso que rebote no se lleva el mensaje del chofer.
- **AGEN-9 es real y está razonado:** `TTL_FIRMA_PDF_SEGUNDOS = 900`
  (`processor.ts:1136`) contra `RETRASO_AMBIGUO_SEGUNDOS = 300` del outbox.
- **WA-2 / WA-7 / BE-12 no quedaron inertes:** el voucher sin viaje entra con
  `monto: 0` y `ocrExtra.documento` (`processor.ts:1775-1802`), el filtro de
  monto va en la base antes del `limit(50)` (`repo.ts:545-556`) y `gasto_pkey`
  cuenta como resuelto (`processor.ts:3506`), con `resolverHuerfanos` devolviendo
  si selló.
- **WA-9:** `type: 'reaction'` se descarta en `extractMessages`
  (`route.ts:686-688`), antes del rate limit y de la bandeja durable.
- **Ninguna ruta manda veredictos de contralor al chofer:** los seis llamadores
  de `resumenCuadre` pasan `'operador'` explícito (`processor.ts:3779, 3831,
  3958, 4007`; `guardia.ts:116`), y el default `'contralor'` está documentado
  como el que enseña de más a quien ya podía verlo.
- **El par +1/-1 de la barrera es simétrico:** el `-1` vive en el `finally`
  (`processor.ts:2839`, `:3193`) y un `+1` que falla aborta el camino sin
  compensar (`processor.ts:2087-2103`, `:2971-2977`), soltando el claim.
- **`esperarIntake` falla cerrado:** `null` («no sé») no abre la barrera
  (`conv.ts:1086-1089`), y `intakePendientes` sondea sin escribir aplicando el
  TTL de la 0031 del lado del cliente (`conv.ts:1012-1036`).
- **`guardiaEstado` cotea, no adivina** (`cuadre/estado_afirmado.ts:166`), y
  `entrego: 'pendiente'` evita el auto-desmentido del camino feliz. El texto
  del degradado `no_verificable` (`processor.ts:3840`) está redactado para no
  disparar `AFIRMA_CIERRE` — lo comprobé contra los cuatro patrones.
- **El prompt no autoriza al modelo a narrar lo determinístico:**
  `prompts.ts:99-100` prohíbe cifras sin tool, y el candado real no depende del
  prompt (`tools.ts:265` exige `cierrePedidoPorTexto`, `tools.ts:339` el freno de
  cierre en ceros, `guardia.ts:84` sustituye SIEMPRE el texto cuando hubo cuadre).
- **El reintento no duplica efecto:** la llave de idempotencia lleva `runId`
  (`tool-executor.ts:332`), la caché guarda la PROMESA y no el resultado
  (`tool-executor.ts:364-387`), y el lease se mantiene cuando el handler no
  asentó (`tool-executor.ts:258-268`).

## Lo que NO alcancé a revisar

- **El escalamiento de asistencia (Fase 5).** `asistencia_wa.ts:570-574` le
  contesta `RESPUESTA_MUDA` («Recibido. Tu jefe ya lo sabe.») a un chofer en
  violencia activa **aunque `avisado === false`**, con la justificación escrita
  de que «el escalamiento (Fase 5) lo reintenta». No verifiqué que
  `asistencia_escalamiento.ts` reintente de verdad sobre
  `aviso_jefe_fallido`. Si no lo hace, es un CRÍTICO del mismo tipo que el de
  la talacha, con una vida de por medio.
- **El ciclo del copiloto del panel** (`agents/copiloto*.ts`, `chat-tools.ts`) y
  su ruta: solo miré `analista.ts` (el reintento correctivo y la red
  determinística de `:459-477` se ven sanos; `CAPTURAS` está llaveado por
  `runId` único).
- **`avisarCierreAlJefe` cuando `urlPdf` es `null` por un fallo de firma**
  (`processor.ts:4329`): devuelve `enviado: true` y **sella
  `avisada_oficina_en`**, así que `entregarCierrePendiente` nunca reintenta el
  PDF del contralor por WhatsApp. Lo tengo identificado pero no medí cuán
  frecuente es un `createSignedUrl` fallido sobre un objeto que sí existe;
  sin ese dato no puedo darle severidad honesta.
- **La interacción cron ↔ webhook sobre el MISMO chofer**: `reclamar_wa_pendiente`
  impone el orden causal en la base, pero no probé el caso de dos invocaciones
  solapadas con leases vencidos a mitad de una ráfaga de 22.
- No corrí ninguna prueba (`npx vitest run`): todas las verificaciones son por
  lectura del fuente y de las migraciones.
