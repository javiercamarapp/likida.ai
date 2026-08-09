# Sistema agéntico y orquestación — auditoría 17 (pase 2)

**Nota: 4/10** (antes 5). Razón del movimiento: **el código nuevo empeoró el
rubro**. El CRÍTICO del pase 1 está cerrado y bien cerrado (verificado línea por
línea abajo), pero su arreglo abrió un hueco silencioso nuevo, y el actor que
entró esta semana —`recordatorio_comprobacion.ts`, que le habla al chofer sin que
nadie lo inicie— entra con el mecanismo de entrega equivocado por construcción,
diciendo algo que la propia base desmiente, sin memoria de haber hablado y sin
que su costo se anote en ningún lado. Los siete hallazgos del pase 1 que no eran
el CRÍTICO siguen abiertos sin una línea tocada.

**Riesgo mayor hoy:** el recordatorio automático sale por texto libre (`sendText`)
a un chofer que por definición del disparo lleva ≥3 días sin escribir — o sea,
con la ventana de 24 h de Meta cerrada. Meta lo rechaza con 131047, el sello
`recordatorio_comprobacion_en` ya quedó puesto, y el recordatorio —que es *uno por
viaje, para siempre*— se consume sin haber llegado a nadie.

| Severidad | Nuevos | Reincidentes | Total |
|---|---|---|---|
| CRÍTICO | 0 | 0 | 0 |
| ALTO | 3 | 4 | 7 |
| MEDIO | 5 | 2 | 7 |
| BAJO | 1 | 1 | 2 |

---

## Estado de los hallazgos del pase 1

| # | Pase 1 | Hoy |
|---|---|---|
| 1 | CRÍTICO — el PDF del contralor era el ejemplar del operador | **CERRADO** (con secuela, ver hallazgo N3) |
| 2 | ALTO — "Listo. 👍" sin mutación | **REINCIDENTE**, sin cambios |
| 3 | ALTO — el portón de cifras ciego al signo y al guion | **REINCIDENTE**, sin cambios |
| 4 | ALTO — el presupuesto es del mensaje, no de la invocación | **REINCIDENTE**, sin cambios |
| 5 | ALTO — el cron de facturación responde 200 aunque el lote no corra | **REINCIDENTE**, sin cambios |
| 6 | MEDIO — el callback de QStash hereda el reloj de 300 s del cron | **REINCIDENTE**, sin cambios |
| 7 | MEDIO — la recuperación de cierre parcial detrás de un flag default-off | **REINCIDENTE**, sin cambios |
| 8 | BAJO — el prompt pide la salida que la guardia descarta siempre | **REINCIDENTE**, sin cambios |

**Cerrado, con evidencia.** `processor.ts:2175-2190` ya no reusa `data.signedUrl`
(el ejemplar `…-operador.pdf`): firma aparte
`${op.tenantId}/${viajeId}.pdf` y solo si `pdf_contralor_generado` vino `true`
(`tools.ts:207`). Hay prueba que lo fija: `cierre_pdf_del_jefe.test.ts:130` ("al
jefe se le manda el ejemplar COMPLETO del contralor, no el del operador") y
`:139` (los dos ejemplares se firman con TTL 60 s). Corrí los dos archivos:
18/18 verdes. El paso nuevo además quedó anotado en `presupuesto.ts:47-53`, que
es lo que ese archivo exige de quien agrega un paso al cierre.

**Reincidentes, verificados contra el código de hoy (no inferidos):**

- **#2** `processor.ts:1860-1862` sigue idéntico: `reply = res.finalText ||
  (res.toolCalls.length > 0 ? 'Listo. 👍' : …)`. La condición sigue siendo "¿corrió
  alguna tool?" y no "¿corrió alguna **mutación**?", con `closed` calculado dos
  líneas abajo (`:1864`).
- **#3** ejecuté los regex tal como están hoy (`cifras.ts:60` y `:114`):
  `"Diferencia: -1500 a tu favor"` → `NUMERO_SUELTO` **false**, `MONEY_G` **null**;
  `"Tu saldo quedó en -3500"` → false/null; `"Te quedan entre 800-1200 del
  anticipo"` → false/null; `"Te sobraron 3500 del anticipo"` → true. Sin cambios.
- **#4** `processor.ts:351` sigue con `crearPresupuesto(PRESUPUESTO_WEBHOOK_MS)`
  dentro de `processInbound`.
- **#5/#6** `cron/facturar/route.ts:317-332` sigue devolviendo `{encolado:true}`
  con 200; `PRESUPUESTO_LOTE_MS = maxDuration * 1000` sigue en `:129` con el
  `maxDuration = 300` de esa ruta, consumido en `:469` y `:509` por el callback
  que declara `maxDuration = 600` (`cola/route.ts:11`).
- **#7** `processor.ts:1899`: `process.env.CUADRA_RECUPERAR_CIERRE_PARCIAL === '1'`,
  default off.
- **#8** `prompts.ts:24` sigue pidiendo la narración ("explícale en lenguaje
  simple: cuánto comprobó, cuánto era el anticipo, a favor de quién queda la
  diferencia…") que `guardia.ts` sustituye entera cuando hubo cuadre.

**Encargo del pase 2 que sí salió limpio:** el retiro del rol `operador`
(`31babfd`, mig. `0086`) **no** dejó referencias muertas en el ciclo. `grep` por
`likida/chofer` en todo `src/` → vacío; lo que queda es `consulta_chofer.ts`, que
es otro módulo y sí existe (`processor.ts:62`). La tabla `operador` y
`app_user.operador_id` sobreviven a propósito (encabezado de la 0086), que es lo
que mantiene resoluble al humano por WhatsApp: `resolveOperador` (`conv.ts:100`)
no depende de `app_user.rol` para nada.

---

## Hallazgos

### [ALTO] El recordatorio automático sale por texto libre justo cuando la ventana de 24 h está cerrada — y el sello ya se consumió

`src/lib/likida/recordatorio_comprobacion.ts:135` (único envío, `sendText`), sello
puesto antes en `:117`/`:158-164`; contraste con `src/lib/likida/escalar_viaje.ts:214-228`.

Escenario: viaje `VJ-2026-0847`, `fecha_inicio = 2026-08-04`, chofer Juan Pérez,
teléfono `5219993700779`. El chofer no le ha escrito al número desde el 4-ago. El
8-ago a las 00:00 el cron corre, `viajesSinComprobar` lo devuelve, el claim gana,
y se llama `sendText(...)` con texto libre. Meta responde **400 / 131047**
("Pasaron más de 24 h desde el último mensaje del chofer" —`meta/client.ts:286`—),
`sendText` loguea `wa.sendText` y devuelve `null` (`meta/client.ts:97`). Sale:
`fallos: ['VJ-2026-0847: WhatsApp rechazó el envío']`, `recordados: 0`, y
`recordatorio_comprobacion_en = 2026-08-08T00:00:00Z` grabado para siempre. El
recordatorio es **uno por viaje** (encabezado del archivo, líneas 23-29): no hay
segunda oportunidad.

El disparo y el modo de falla son la misma condición: se le escribe a quien lleva
días sin escribir, y eso es exactamente lo que WhatsApp prohíbe en texto libre. El
propio repo lo tiene escrito tres veces (`meta/client.ts:156-161`, `:436-438`,
`escalar_viaje.ts:214-219`) y sus dos vecinos que hablan sin ser hablados
—`escalar_viaje.ts:228` y la respuesta ARCO de `meta/client.ts:455-473`— caen a
plantilla cuando el texto rebota. Este no.

Consecuencia: la funcionalidad que Javier pidió el 8-ago ("automático, no
dependiente del jefe de flota") no entrega en el caso para el que existe, y cada
corrida quema un viaje sin haberle hablado a nadie. Al mes de operación, la
columna `recordatorio_comprobacion_en` estará llena en toda la flota y ningún
chofer habrá recibido un solo mensaje. Nadie lo va a notar: el log de la corrida
dice `revisados: N` y los fallos van en un array que solo se lee si alguien abre
la respuesta del cron.

Causa raíz probable: se copió el patrón de claim de `escalar_viaje.ts` y no el de
entrega; falta el plan B de plantilla que su modelo sí tiene.

### [ALTO] "Llevas N días sin mandarme comprobantes" se manda sin haber mirado un solo comprobante

`src/lib/likida/recordatorio_comprobacion.ts:54-61` (la consulta) y `:87` (el texto).

Escenario: viaje `VJ-2026-0847`, Monterrey→Cancún, `fecha_inicio = 2026-08-04`,
`estatus = 'abierto'`. El chofer mandó 6 fotos entre el 5 y el 7 de agosto: diésel
$8,000, casetas $2,400, fonda $650 — seis filas en `gasto` con
`ocr_confianza` y todo. El 8-ago el cron lo selecciona (cumple `estatus in
('abierto','en_cuadre')`, `recordatorio_comprobacion_en is null`, `fecha_inicio <=
'2026-08-05'`) y le manda: *"Llevas 4 días con tu viaje **VJ-2026-0847** sin
mandarme comprobantes. 📋 Mándame las fotos de tus recibos…"*. La consulta **no
toca la tabla `gasto` en ningún punto**, ni `fecha_fin`: el único criterio es la
antigüedad de `fecha_inicio`. Un viaje de más de 3 días —que en autotransporte
federal es la norma, no el borde— lo dispara siempre.

Consecuencia: el chofer que sí cumplió recibe una acusación falsa de su patrón
por el canal oficial de la flota, y el que la manda es un sistema que tiene los
seis tickets guardados. Es la regla "un rótulo tiene que ser verdad" rota en el
único texto que este módulo produce, y el log lo cuenta como éxito
(`recordados: 1`). Delante del contralor —que va a preguntar "¿y si el chofer sí
mandó?"— cuesta la credibilidad de todo lo demás.

Causa raíz probable: la migración `0087:5` describe el criterio correcto
("abierto/en_cuadre con `fecha_inicio` vieja **y sin comprobantes recientes**") y
el código implementó solo la primera mitad; nadie cotejó el texto contra el
predicado.

### [ALTO] Cierre limpio + PDF del contralor no generado = al jefe no le llega NADA, y el log afirma que le llegó

`src/lib/likida/avisar_cierre.ts:108-136` (`if (requiereDecision)` … `if
(args.urlPdf)` … `logger.info('cierre.avisado_al_jefe')` … `return { enviado: true }`),
alimentado por `src/lib/likida/processor.ts:2175-2190`.

Escenario: viaje `VJ-2026-0851`, anticipo $12,000, comprobado $12,000, diferencia
$0, sin diferencias pendientes → `armarAvisoJefe` devuelve `requiereDecision:
false` (`cierre_aviso.ts:288`). El upload del ejemplar del contralor a storage
falla (`tools.ts:181-185`: `subir` loguea `pdf.upload` y devuelve `undefined`)
mientras el del operador sube bien. Entonces `pdf_contralor_generado = false`
(`tools.ts:207`) → `processor.ts:2176` no entra al `if` → `urlContralor` queda
`undefined` → `avisarCierreAlJefe({ urlPdf: undefined })`: no manda texto (no hay
decisión que pedir), no manda documento (`:113` no entra), y **devuelve
`{ enviado: true }`** con `logger.info('cierre.avisado_al_jefe', { viaje,
requiereDecision: false })`. `processor.ts:2191` mira `rj.enviado`, lo ve `true`, y
no escribe ni un warn.

Y no hay copia de repuesto: `saveLiquidacion(tenantId, liq, pdfPath)` con
`pdfPath` `undefined` deja `pdf_path` en `null` (documentado en `tools.ts:203-206`),
así que el botón de descarga del panel tampoco tiene qué bajar.

Consecuencia: el contralor —el comprador— no se entera de que ese viaje cerró, no
tiene el PDF por WhatsApp ni por el panel, y la única traza dice que sí se le
avisó. El chofer, mientras tanto, sí recibió su ejemplar y da el viaje por
liquidado. Es un estado donde la base dice una cosa y el humano cree otra, que es
el ancla del "3 o menos" del rubro. Antes del arreglo del pase 1 este caso al
menos mandaba **un** PDF (el equivocado); ahora puede no mandar ninguno y decir
que mandó.

Causa raíz probable: `enviado: true` se devuelve incondicionalmente al final,
sobre un cuerpo cuyas dos ramas de envío son ambas condicionales; el arreglo del
CRÍTICO volvió `urlPdf` opcional de verdad por primera vez y nadie revisó qué
queda cuando las dos condiciones son falsas a la vez.

### [MEDIO] El claim del recordatorio no vuelve a mirar `estatus`: un viaje liquidado hace dos minutos recibe el regaño

`src/lib/likida/recordatorio_comprobacion.ts:158-164` (el UPDATE condiciona por
`id`, `tenant_id` y `recordatorio_comprobacion_en is null` — nunca por `estatus`),
contra el SELECT de `:57`.

Escenario: el cron arranca a las 00:00 y `viajesSinComprobar` devuelve 40 viajes;
`VJ-2026-0847` es el número 31 de la lista. A las 00:00:18 el chofer de ese viaje
manda *listo*, el processor cierra la liquidación, sube los PDF y le manda el suyo
por WhatsApp; `viaje.estatus` pasa a `'liquidado'`. A las 00:00:24 el `for` llega
al elemento 31: el claim solo pregunta por el sello, que sigue `NULL`, así que
**gana**, y el chofer recibe *"Llevas 4 días con tu viaje VJ-2026-0847 sin
mandarme comprobantes"* dos minutos después de haber recibido su liquidación en
PDF por el mismo chat.

La ventana no es de milisegundos: es el tiempo que tarda el `for` en llegar a esa
fila, con un `sendText` de hasta 10 s (`meta/client.ts:17`) por iteración previa.

Consecuencia: el chofer ve al bot contradecirse contra un documento que tiene en
la mano; si le reenvía tickets, `getOpenViaje` ya no encuentra viaje abierto y
recibe "No tienes un viaje abierto para liquidar ahorita". El PDF ya es
irreversible (triggers 0036/0037).

Causa raíz probable: el claim se copió de `reclamarEscalacion`, cuyo predicado
(`aceptado_en is null`) sí es el mismo que el del SELECT; aquí el predicado del
SELECT tiene dos partes y el UPDATE solo re-verifica una.

### [MEDIO] Si la invocación muere entre el claim y el envío, el recordatorio se pierde para siempre y no queda una sola línea

`src/lib/likida/recordatorio_comprobacion.ts:117` (claim, sin log al ganarlo) →
`:135` (envío); `src/app/api/cron/escalar/route.ts:11` (`maxDuration = 120`, sin
cambiar) y `:66`/`:76` (dos loops secuenciales en la misma invocación).

Escenario: primera corrida en producción con acumulado. `escalarViajesSinAceptar`
trae 100 viajes (`escalar_viaje.ts:92`) y cada uno hace hasta dos `sendText` de
~0.4 s cada uno → ~80 s. Luego `enviarRecordatoriosComprobacion` trae otros 100
(`:61`) y arranca su `for`: reclama `v[1]`, manda; reclama `v[2]`, manda… en el
elemento 48 Vercel corta a los 120 s. Sale: los viajes 48 a 100 quedan sin
reclamar (bien, vuelven la hora siguiente), pero el **48 quedó reclamado y sin
mensaje**; `logger.info('viaje.recordatorio_comprobacion', …)` de `:143` nunca
corre, la respuesta JSON con `fallos` nunca se serializa, y no hay ningún log
por-viaje en el momento del claim (`ya_en_proceso` en `:123` solo se escribe
cuando se **pierde** la carrera). El sello es definitivo.

Consecuencia: la diferencia entre "se le recordó" y "se le consumió el
recordatorio sin hablarle" es indistinguible en la base y en los logs. El mismo
razonamiento aplica al claim de `escalar_viaje`. El comentario de la ruta
(`route.ts:8-10`, "una corrida toca N viajes y cada uno manda hasta dos mensajes")
sigue describiendo el chequeo de agosto 4: el trabajo por invocación se duplicó
el 8-ago y `maxDuration` no se movió.

Causa raíz probable: se agregó un segundo loop de hasta 100 envíos a una
invocación con presupuesto fijo, y ninguno de los dos consulta un reloj —
`presupuesto.ts` existe para esto y ninguna ruta de cron lo usa.

### [MEDIO] El recordatorio no queda en `wa_conversacion`: el agente no recuerda haber hablado, y lee la respuesta contra la pregunta anterior

`src/lib/likida/recordatorio_comprobacion.ts:135` (manda y no persiste nada),
contra `src/lib/likida/conv.ts:230` (`loadConversation`) y `:374`
(`saveConversation`, único escritor de `estado.turns`).

Escenario: viaje `VJ-2026-0847`. El 5-ago el último turno guardado del asistente
fue *"Te anoté tu ticket de diésel de $1,200. ¿Tienes más comprobantes?"*. El 8-ago
a las 00:00 el cron manda el recordatorio, que termina con *"Si el viaje ya terminó
y falta cerrarlo, dime y seguimos con eso"* — y no lo escribe en `estado.turns`. A
las 07:10 el chofer contesta **"sí"**. `loadConversation` devuelve los turnos del
mismo viaje, así que el modelo lee: `assistant: "¿Tienes más comprobantes?"` →
`user: "sí"`. Contesta "Perfecto, mándamelos" y se queda esperando fotos que no
van a llegar; el chofer creía haber pedido el cierre.

Consecuencia: el ciclo no cierra. El chofer espera su liquidación, el agente
espera comprobantes, y el viaje sigue `abierto` con su recordatorio ya gastado —
no habrá un segundo. La base no tiene registro de que Likida haya dicho nada el
8-ago, así que reconstruir la conversación después es imposible (tampoco hay tabla
de envíos: `envio_mensaje` existe en el esquema y **nadie escribe en ella** —
`grep` en todo `src/` → cero llamadores).

Causa raíz probable: el módulo habla por fuera del único camino que mantiene el
estado conversacional; `sendText` directo no pasa por `saveConversation`.

### [MEDIO] Le escribe a choferes dados de baja, a los que el propio processor le va a contestar "no te tengo registrado"

`src/lib/likida/recordatorio_comprobacion.ts:56` (`operador(nombre, telefono)`, sin
filtro de `activo`), contra `src/lib/likida/conv.ts:105` (`resolveOperador` exige
`.eq('activo', true)`) y `src/lib/likida/processor.ts:448`.

Escenario: Juan Pérez renuncia el 5-ago; el encargado lo marca inactivo en el
panel (`activo = false`, la única forma de dar de baja según
`processor.ts:365`). Su viaje `VJ-2026-0847` (`fecha_inicio 2026-08-04`) se queda
`abierto` porque nadie lo cerró — es decir, cumple el criterio del recordatorio
para siempre. El 8-ago Likida le escribe al celular personal de un ex-empleado:
*"Llevas 4 días con tu viaje VJ-2026-0847 sin mandarme comprobantes"*. Si contesta,
`resolveOperador` devuelve `null` y recibe *"Hola, no te tengo registrado como
operador. Pídele a tu flota que te dé de alta en Likida. 🚛"*.

Consecuencia: el sistema inicia una conversación que estructuralmente no puede
sostener, con alguien que ya no trabaja ahí, sobre operaciones de una flota que ya
no es la suya. Es el patrón que la ronda 12 corrigió en sentido inverso (el
canal ARCO responde a quien ya no es operador); aquí el canal *inicia* con él y
luego lo desconoce. `escalar_viaje.ts:86` comparte el hueco.

Causa raíz probable: el join a `operador` se copió del módulo hermano sin el
filtro que la resolución de identidad sí aplica; no hay un solo lugar que defina
"a quién se le puede escribir".

### [MEDIO] Ninguno de los dos crones anota el costo de los WhatsApp que manda

`src/lib/likida/recordatorio_comprobacion.ts:135` y
`src/lib/likida/escalar_viaje.ts:224`/`:257` (envían sin llamar a nada de
`costos.ts`), contra `src/lib/likida/processor.ts:625` y `:2143`, que sí llaman
`registrarCostoWhatsApp` después de cada envío.

Escenario: flota con 30 viajes activos. En un mes el cron `escalar` manda ~60
mensajes de escalación (chofer + jefe) y ~30 recordatorios de comprobación: 90
mensajes que a `precioMensajeWhatsAppUsd()` no aparecen en ninguna fila de
`llm_costo`. El panel de Javier suma el gasto por tenant desde esa tabla; los 90
no están. El "costo por liquidación" —la cifra del modelo de negocio, que se cobra
POR LIQUIDACIÓN— sale más bajo de lo real, y sale más bajo *justo* en las flotas
que peor se portan, que son las que disparan más recordatorios.

Consecuencia: una cifra del panel que subestima sistemáticamente y no lo declara.
`costos.ts:86` existe precisamente para que un mensaje saliente cueste lo que
cuesta; los dos únicos caminos que mandan mensajes sin humano en el otro extremo
son los dos que se lo saltan. `presupuesto.ts` tampoco los conoce: sus
`PASOS_CIERRE` cubren solo el webhook.

Causa raíz probable: `registrarCostoWhatsApp` pide `viajeId` y `tenantId`, que
aquí sí se tienen (`v.id`, `v.tenantId`); simplemente no se llamó.

### [BAJO] El argumento de seguridad del recordatorio apunta a una pantalla que se borró una hora después

`src/lib/likida/recordatorio_comprobacion.ts:9`, `:33` y `:106` (los tres citan
"Requieren tu atención" / `ViajesAtencion` de `resumen-visual.tsx`).

Escenario: el archivo justifica su decisión más delicada —marcar el sello aunque
el envío falle, sin reintento nunca— con "el viaje sigue visible en 'Requieren tu
atención' del panel, que no depende de WhatsApp para mostrarlo" (`:106-107`), y
fija su umbral de 3 días con "mismo umbral que 'detenido' en `ViajesAtencion`"
(`:33-35`). El commit `0657279`, una hora después de `c5a7c19`, **quitó
`ViajesAtencion` del Resumen del dueño** y borró `getViajesConDiferencia` /
`getViajesConCfdiSinValidar` por dead code. `grep -rn "Requieren tu atención"
src/` hoy devuelve **solo este archivo**; `resumen-visual.tsx` ya no exporta
`ViajesAtencion`.

Consecuencia: el control compensatorio en el que se apoya la decisión de "una sola
vez, aunque falle" ya no existe donde el código dice que existe, y el umbral de 3
días perdió su anclaje. El siguiente que mantenga esto va a buscar la pantalla,
no la va a encontrar, y no va a saber si el umbral se puede mover.

Causa raíz probable: dos commits del mismo día, uno tocando el motor y otro el
panel, sin nadie cruzando el comentario del primero contra el borrado del segundo.

---

## Lo que revisé y está bien

- **El CRÍTICO del pase 1 está cerrado de verdad**, con prueba que lo fija
  (`cierre_pdf_del_jefe.test.ts:130`, `:139`) y el paso nuevo anotado donde
  `presupuesto.ts` exige que se anote (`:47-53`). Corrí ese archivo y el del
  recordatorio: 18/18 verdes.
- **El retiro del rol `operador` no dejó caminos muertos en el ciclo.** No queda
  ningún import de `lib/likida/chofer`; `consulta_chofer.ts` es otro módulo y
  sigue vivo (`processor.ts:62`). La resolución del humano nunca dependió de
  `app_user.rol`: `resolveOperador` (`conv.ts:100-140`) va contra la tabla
  `operador`, que la 0086 conserva a propósito, y sigue negándose ante ambigüedad
  en vez de adivinar tenant.
- **Refuté el mis-routing que parecía obvio en el recordatorio.** El mensaje nombra
  un folio (`VJ-104`) y el intake resuelve el viaje por su cuenta con
  `getOpenViaje` (`conv.ts:164`), que ordena por `created_at desc` y toma uno —
  con dos viajes abiertos, la foto se colgaría del equivocado. No puede pasar: la
  migración `0029` impone `uq_viaje_abierto_por_operador` sobre
  `(tenant_id, operador_id) where estatus in ('abierto','en_cuadre')`. El
  invariante está en la base, no solo en el `.limit(1)`.
- **Refuté también el "sí" peligroso.** El recordatorio invita a contestar ("dime
  y seguimos con eso") y un *ya terminó* dispara `pareceCierre`; con cero
  comprobantes eso podría cerrar con el anticipo entero en contra del chofer. No
  cierra: `processor.ts:1788-1816` cuenta los gastos antes y exige un segundo
  *listo* explícito, con la marca `cierreSinComprobantes` guardada solo si el aviso
  SALIÓ (`:1813`).
- **La carrera entre dos corridas de cron sí está cerrada.** El UPDATE
  condicional de `:158-164` incluye la columna que él mismo pisa, va acotado por
  `tenant_id` además del `id`, y perder la carrera no se cuenta como fallo — con 15
  pruebas que lo cubren, incluida la de "un viaje malo no tumba al resto del lote".
- **El cálculo de días no produce basura.** `fecha_inicio` es `date` en la 0001, así
  que `Date.parse(\`${v.fechaInicio}T00:00:00Z\`)` siempre resuelve; con el corte de
  `:52` el mínimo posible es 3 y no hay camino a `NaN días` ni a `0 días`.
- **Fallar cerrado en la lectura:** `viajesSinComprobar` lanza ante `error`
  (`:63`) en vez de devolver lista vacía, y el cron lo atrapa en su propio
  try/catch (`route.ts:79-83`) sin dejar ciego al otro chequeo.
- **El mutex del cierre no se toca** desde el recordatorio, y eso está bien: no
  intenta liquidar nada. Lo que sí falta es lo del hallazgo N4 (no re-verifica el
  estatus) y N6 (no deja turno).
- **El arreglo del probe de arranque** (`startup.ts:75-85`) es correcto y del
  rubro vecino, pero toca mi ciclo: `unlock_viaje` ya solo se llama si el probe
  ganó el lock, así que el diagnóstico de migraciones dejó de poder abrirle la
  puerta a una doble liquidación en curso.

## Lo que NO alcancé a revisar

- **No corrí la suite completa** (`npx vitest run`) ni `tsc`: me apoyé en la línea
  base del MAPA (3,168 verdes) y corrí solo los dos archivos relevantes al pase 2.
- **No pude verificar el entorno real de Vercel.** `CUADRA_RECUPERAR_CIERRE_PARCIAL`,
  `QSTASH_CURRENT_SIGNING_KEY` y `QSTASH_NEXT_SIGNING_KEY` siguen sin poder
  comprobarse desde el repo; los reincidentes #5 y #7 quedan latentes o vivos según
  eso. Se suma uno nuevo del mismo tipo: **si la plantilla de WhatsApp aprobada
  para este caso existe o no** en la cuenta de Meta — el hallazgo del texto libre
  no depende de eso (hoy no hay ninguna plantilla en el camino), pero el tamaño del
  arreglo sí.
- **No medí tiempos reales de `sendText` contra Meta**, así que el punto de corte
  del hallazgo N5 (elemento ~48 de 100) es una estimación con la latencia típica;
  lo que sí es exacto es que no hay reloj y que `maxDuration` no se movió.
- **No recorrí el cron `purgar`** ni el ciclo de acuses (`acuse_ticket.ts`,
  `rafaga.ts`): siguen siendo estado en memoria del proceso, que en serverless se
  pierde entre invocaciones, y merecen su propio recorrido — es la misma deuda que
  dejé abierta en el pase 1.
