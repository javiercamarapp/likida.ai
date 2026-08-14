# Sistema agéntico y orquestación — auditoría 3

**Nota: 5/10** (antes 6). Razón del movimiento: deuda que cobró factura · mirada
más profunda. Los cuatro ALTOS heredados (AG-A1…AG-A4) siguen **vivos, línea por
línea, sin un solo commit encima**; y recorrer el ciclo punto por punto —en vez
de leerlo— destapó cuatro más que nadie había mirado, uno de ellos en el camino
del dinero.

El riesgo mayor hoy: **el cierre puede quedar asentado en la base sin que nadie
se lo diga al humano**, y no hay ningún mecanismo —ni reintento, ni cron, ni
alerta de panel— que reconcilie ese estado; la única defensa es una variable de
entorno apagada por default.

## Hallazgos

### [CRÍTICO] Cierre parcial: la liquidación queda cerrada, el operador recibe «se me trabó», y su reenvío cae en «no tienes viaje abierto»
`src/lib/likida/processor.ts:1946` · `src/lib/likida/processor.ts:1991-1996` ·
`src/lib/llm/openrouter.ts:779-781` · `src/lib/llm/openrouter.ts:839-842`

**Escenario.** Viaje `44444444-…-0001`, anticipo $6,000, 9 comprobantes. El
chofer escribe `listo`. El agente corre: ronda 1 `consultar_politica`, ronda 2
`cuadrar_viaje`, ronda 3 `guardar_liquidacion` → **la tool escribe de verdad**
(`tools.ts:193` `saveLiquidacion`, `viaje.estatus = 'liquidado'`, los dos PDF ya
subidos a `liquidaciones/`). En la ronda 4 el modelo pide una tool más en vez de
cerrar con texto; `openrouter.ts:779` corta con `LoopGuardError`, que
`openrouter.ts:841` envuelve en `PartialExecutionError` con
`guardar_liquidacion` dentro de `partialToolCalls`. (Mismo desenlace con el
`AbortSignal` de `runAgent`, con un truncamiento, o con un 500 del proveedor en
la ronda 4.)

En `processor.ts:1946`, `recuperar` sale de
`process.env.LIKIDA_RECUPERAR_CIERRE_PARCIAL === '1'` — **default apagado**. Con
el flag apagado se salta la rama de recuperación entera y se cae a la línea
1995: `reply = 'Perdón, se me trabó el sistema tantito. ¿Me reenvías tu último
mensaje?'`, con `closed = false`, así que **no se manda el PDF, no se firma la
URL, no se avisa al jefe y no se corre `vincularCostosALiquidacion`**. El chofer
obedece y reenvía `listo`: `getOpenViaje` (`conv.ts:164`) ya no encuentra nada
—el viaje está `liquidado`— y `processor.ts:663` le contesta **«No tienes un
viaje abierto para liquidar ahorita»**.

**Consecuencia.** La base dice: liquidación cerrada, dos PDF en storage, viaje
`liquidado`, irreversible (triggers 0036/0037). El chofer cree: no pasó nada, y
el sistema se lo confirma dos veces. El contralor sí la ve en el panel, pero
nadie le dice que el chofer no la recibió. Ningún cron reconcilia esto:
`vercel.json` solo corre `escalar`, `facturar` y `purgar`, y ninguno mira
liquidaciones cerradas sin entrega. El único rastro es
`processInbound.fail { cerroSinEntregar: true }` (`processor.ts:2271`) — y ni
ése se escribe si quien mató la invocación fue el `maxDuration` de Vercel, que
es el disparador más probable de todos (`presupuesto.ts:87` lo documenta).

**Causa raíz probable.** La recuperación se construyó completa y se dejó detrás
de un flag por HARD RULE 3; `.env.example:73` la pone en `1` y
`docs/conocimiento/51-boletin-tecnico.md:101` la lista como pendiente de
prender. El código, que es lo único que este repo puede afirmar, cierra en el
modo huérfano.

---

### [ALTO] «ya casi» cierra la liquidación de forma irreversible — el freno solo existe con CERO comprobantes (REINCIDENTE, AG-A1)
`src/lib/likida/processor.ts:324-326` · `src/lib/likida/processor.ts:1835-1845`
· `src/lib/agents/prompts.ts:79` · `src/lib/agents/prompts.ts:85`

**Escenario.** Viaje abierto, anticipo $6,000, 3 comprobantes registrados
($1,240 de casetas); al chofer le faltan por mandar $4,760 de diésel. Escribe
literalmente **`ya casi`** (o `ya mero`, `ya voy llegando`).

Recorrido real del mensaje: `interpretarHito` (`hitos_viaje.ts:44-59`, lista
cerrada) → `null`; `responderConsulta` → `null`; `atenderConfirmacion`
(`confirmar_viaje.ts:174`) → `null` porque el viaje ya está aceptado; sin
huérfanos. Llega a `processor.ts:1835`: `pareceCierre('ya casi')` es **`true`**
—el regex es `^\s*(listo|ya|…)(?!\p{L})` y `ya ` cumple— pero el freno solo
dispara `if (cuantos === 0)` (línea 1845), y aquí `cuantos === 3`. El mensaje
pasa entero al agente, cuyo prompt lista `"ya"` como ejemplo de cierre
(`prompts.ts:79`) y ordena en `prompts.ts:85`: «si el operador ya confirmó que
terminó, CIERRA en ese turno con "guardar_liquidacion". NO le pidas que vuelva a
confirmar». Con `temperature 0` y `reasoning: high`, cierra.

**Consecuencia.** Liquidación emitida con $1,240 comprobados contra $6,000 de
anticipo: **$4,760 en contra del chofer**, y el cierre es irreversible (0036 /
0037). Sus tickets siguientes rebotan con «llegó después de que cerré tu
liquidación» (`processor.ts:1099`). El contralor firma un PDF que acusa a una
persona de un dinero que sí gastó.

**Causa raíz probable.** El propio comentario del freno (`processor.ts:1825`)
nombra este escenario —«basta un "ya voy" mal leído — `pareceCierre` empata "ya"
seguido de cualquier cosa»— y luego solo protege el caso de cero comprobantes,
que es el menos frecuente de los dos. La ambigüedad se resuelve en el prompt,
que es justo donde no se puede garantizar.

---

### [ALTO] El agente de cobranza le habla a la población que, por definición, está fuera de la ventana de 24 h — y quema el tier igual (REINCIDENTE, AG-A2)
`src/lib/likida/agentes/cobranza.ts:261` ·
`src/lib/likida/agentes/cobranza_pura.ts:87-97` ·
`src/lib/likida/escalar_viaje.ts:62` · `src/lib/meta/client.ts:286`

**Escenario.** Viaje `abierto` con `fecha_inicio` = hace 3 días y `avisado_en`
no nulo. El chofer contestó «va» el día 0 y no ha vuelto a escribir. El cron de
las 10:00 llama `ejecutarCobranza`; `tierPendiente(3, [3,7,14], [], false)`
devuelve `3`; la línea 261 manda el texto con **`sendText`** —free-form, sin
plantilla—. La ventana de servicio de 24 h de WhatsApp lleva ~48 h cerrada, así
que Meta responde `131047`/`131026`: `sendText` devuelve `null`, `enviado =
false`, `detalle = 'WhatsApp rechazó el envío'`.

La fila de `cobranza_contacto (viaje, tier=3)` **se conserva** con ese detalle
(línea 272), así que:
1. el rescate de claims huérfanos (líneas 207-215) no la borra —solo borra las
   que tienen `detalle is null`—;
2. `tierPendiente` la ve en `tiersContactados` y **nunca reintenta el tier 3**;
3. lo mismo pasará el día 7 y el día 14.

`escalar_viaje.ts:62` **sí** tiene su plan B (`PLANTILLA_JEFE =
'recordatorio_cierre'`, con la caída explícita a plantilla cuando `sendText`
rebota, líneas 222-263). Cobranza no tiene ninguna: `sendTemplate` no se importa
en el módulo.

**Consecuencia.** El agente que la página del panel presenta como «la cola
honesta — a quién va a contactar» contacta a nadie: el 100 % de la población
objetivo (choferes que llevan días sin escribir) es inalcanzable por el único
canal que usa. El contralor ve una bitácora de fallos y el chofer nunca recibe
nada. Es el producto vendido como «cobra solo» sin poder abrir la conversación.

---

### [ALTO] El despacho por WhatsApp choca con la 0029 y contesta «Vuelve a responder SÍ» en bucle infinito (REINCIDENTE, AG-A3)
`src/lib/likida/despacho_wa.ts:150-154` ·
`src/lib/likida/operacion.ts:559-570` ·
`supabase/migrations/0029_un_viaje_abierto_por_operador.sql:71`

**Escenario.** Juan Pérez (`operador_id` X) ya trae un viaje `abierto`. El jefe
escribe por WhatsApp: **«nuevo viaje para Juan Pérez, Puebla a Monterrey,
anticipo 8000»**. `atenderDespachoOficina` resuelve el nombre, guarda el
pendiente y devuelve el resumen. El jefe contesta **«sí»** → línea 133
`crearViaje` → el INSERT de `operacion.ts:559` viola el índice único parcial
`uq_viaje_abierto_por_operador (tenant_id, operador_id) where estatus in
('abierto','en_cuadre')`. `operacion.ts:570` lo relanza como
`Error('crearViaje: duplicate key value violates unique constraint …')`. El
catch de `despacho_wa.ts:150` **no distingue el 23505 de un fallo transitorio**,
conserva el pendiente a propósito (línea 151) y responde: **«No se pudo crear el
viaje ahorita. Vuelve a responder SÍ en un momento, o créalo desde Despacho.»**

El jefe responde «sí». Mismo error. Mismo mensaje. Indefinidamente hasta que
expiren los 30 min de `VIGENCIA_PENDIENTE_MS`, y ahí el «sí» ya no encuentra
nada y cae al saludo genérico — sin que nadie le haya dicho jamás cuál era el
problema.

**Consecuencia.** El jefe de tráfico —el usuario que el producto quiere
enganchar en el canal— recibe una instrucción falsa («vuelve a responder SÍ»)
sobre una condición que reintentar **no puede** resolver, y no se entera de que
lo que le falta es cerrar el viaje anterior de ese chofer. En el panel el mismo
choque sale como «Revisa los datos e inténtalo de nuevo»
(`src/app/dashboard/despacho/page.tsx:97`), que tampoco lo nombra.

**Causa raíz probable.** La 0029 se escribió cuando «ninguna línea de `src/`
inserta en `viaje`» (lo dice su propio encabezado); `crearViaje` nació después y
nadie volvió a leer la migración. Ningún llamador traduce ese `23505`.

---

### [ALTO] «El aviso a su WhatsApp va en camino» se afirma con `avisarAlChofer` ya fallado, y el viaje queda invisible para la escalación Y para cobranza (REINCIDENTE, AG-A4)
`src/lib/likida/despacho_wa.ts:143-149` · `src/lib/likida/operacion.ts:585` ·
`src/lib/likida/operacion.ts:658-666` · `src/lib/likida/escalar_viaje.ts:94` ·
`src/lib/likida/agentes/cobranza.ts:116`

**Escenario.** El jefe despacha por WhatsApp y confirma con «sí». `crearViaje`
inserta el viaje y en la línea 585 hace
`await avisarAlChofer(...).catch(() => {})`. La plantilla de asignación está en
revisión en Meta (`132001`), así que `notificarAsignacion` devuelve
`{enviado:false}`; `operacion.ts:664` deja `logger.error('viaje.aviso_no_salio',
{escalaSolo:false})` y **retorna sin lanzar**, de modo que el UPDATE de
`avisado_en` (línea 670) nunca corre: la columna queda **NULL**.

`despacho_wa.ts:145` ya tiene su texto escrito y responde: **«Viaje creado ✅
Juan Pérez · Puebla → Monterrey. / El aviso a su WhatsApp va en camino — en
Despacho ves si ya aceptó.»** El aviso no va en camino; ya no salió.

Y con `avisado_en` NULL el viaje desaparece de los dos agentes automáticos:
`viajesSinAceptar` filtra `.not('avisado_en','is',null)`
(`escalar_viaje.ts:94`) y `colaCobranza` filtra igual
(`cobranza.ts:116`). Nadie va a escalar a las 5 h y nadie va a cobrarle a los 3
días.

**Consecuencia.** El jefe cree que su chofer fue avisado y que el sistema le
avisará si no acepta. El chofer no sabe que tiene viaje. Los dos automatismos
que existirían para atrapar esto están cegados por la misma columna. El único
rastro es un `logger.error` que nadie mira desde WhatsApp.

**Causa raíz probable.** `crearViaje` traga el fallo del aviso a propósito (el
viaje ya existe), pero no devuelve nada que diga si salió; `despacho_wa` redacta
su confirmación sin poder preguntarlo.

---

### [ALTO] El PDF que el jefe recibe por WhatsApp es el ejemplar CENSURADO del operador — sin EFOS, sin CFDI cancelado, sin RFC receptor
`src/lib/likida/processor.ts:2157-2158` · `src/lib/likida/processor.ts:2170` ·
`src/lib/likida/processor.ts:2209` · `src/lib/likida/avisar_cierre.ts:113-133` ·
`src/lib/likida/liquidacion/pdf.ts:404-406` ·
`src/lib/likida/cuadre/resumen.ts:24-33`

**Escenario.** Cierra un viaje con dos veredictos fiscales: un CFDI de diésel de
$9,400 cuyo emisor está en la lista negra 69-B (`cfdi_efos`) y una caseta de
$780 con el CFDI cancelado (`cfdi_cancelado`). `guardar_liquidacion` genera los
**dos** ejemplares (`tools.ts:188-189`): `{tenant}/{viaje}.pdf` (contralor,
completo) y `{tenant}/{viaje}-operador.pdf` (filtrado por `SOLO_CONTRALOR`,
`pdf.ts:406`).

`processor.ts:2158` firma **`-operador.pdf`** —correcto, es el que va al
chofer— y en la línea 2209 pasa **esa misma `data.signedUrl`** a
`avisarCierreAlJefe`, que la manda al teléfono de la oficina como
`liquidacion-{folio}.pdf` con el caption «Liquidación de {operador} — {folio}»
(`avisar_cierre.ts:127-128`). El encabezado de ese archivo dice, con todas sus
letras, que ese PDF «es el documento que va a archivar y que le va a dar a su
contador» (`avisar_cierre.ts:14-19`).

**Consecuencia.** El contralor archiva —y le entrega a su contador— una
liquidación de la que se borraron exactamente los veredictos que deciden la
deducibilidad: proveedor en 69-B, CFDI cancelado, RFC receptor equivocado,
IEPS no desglosado, complemento de hidrocarburos. El ejemplar bueno existe y
está en `liquidacion.pdf_path`, pero solo entrando al panel. El texto de
`armarAvisoJefe` mitiga a medias (los dos tipos del ejemplo van a `'decision'`)
y a medias no: corta a 6 líneas y los veredictos ruteados a `'panel'`
(`cfdi_pendiente`, `cfdi_efos_indeterminado`, `permiso_cre_no_verificable`) no
aparecen ni en el texto ni en ese PDF.

**Causa raíz probable.** La URL firmada se reusó por economía (un solo
`createSignedUrl`, un solo TTL) sin notar que cambia de destinatario a mitad del
bloque; el comentario de la línea 2157 declara el ejemplar correcto para el
chofer y nadie volvió a leerlo 50 líneas más abajo.

---

### [ALTO] «Llevas N días con tu viaje sin mandarme comprobantes» — la consulta nunca cuenta un comprobante
`src/lib/likida/agentes/cobranza.ts:105-117` ·
`src/lib/likida/agentes/cobranza_pura.ts:109`

**Escenario.** Viaje `abierto`, `fecha_inicio` = hace 3 días, `avisado_en` no
nulo. El chofer mandó **18 comprobantes por $14,300** el mismo día 1 y el viaje
sigue abierto porque todavía no escribe `listo` (o porque el cierre se cayó, ver
el CRÍTICO de arriba). `colaCobranza` selecciona por `estatus in
('abierto','en_cuadre')`, `fecha_inicio not null` y `avisado_en not null` —
**no hay una sola referencia a `gasto` en toda la consulta ni en
`tierPendiente`**—, así que ese viaje entra a `paraContactar`, y
`armarMensajeCobranza` le manda literalmente:

> «Llevas 3 días con tu viaje *VJ-1042* sin mandarme comprobantes. 📋 /
> Mándame las fotos de tus recibos…»

Y se lo repite el día 7 y el día 14. La palabra «comprobantes» aparece **una
sola vez** en los dos archivos del motor: en ese texto.

**Consecuencia.** El chofer que sí hizo su trabajo es acusado por escrito, tres
veces, de no haberlo hecho — por el canal que es todo el producto. Es una
violación directa de «un rótulo tiene que ser verdad»: la frase afirma un hecho
que la consulta que la disparó no comprobó. Además entrena a ignorar el canal,
que es justo lo que el diseño de tiers dice estar evitando
(`cobranza.ts:28-30`).

**Causa raíz probable.** Heredado tal cual de `recordatorio_comprobacion.ts`
(0087, hoy borrado), cuyo `select` tampoco tocaba `gasto`; la
productización 0089 movió el texto a `cobranza_pura.ts` y copió el rótulo sin
revisar contra qué se estaba afirmando.

---

### [ALTO] Un comprobante huérfano que ya fue ofrecido y no recibe un «sí» exacto sale de la conversación para siempre
`src/lib/likida/processor.ts:1684-1760` (esp. `1687`, `1693`, `1753`) ·
`src/lib/likida/repo.ts:334-340` · `src/lib/likida/repo.ts:342-358` ·
`src/lib/likida/intake/huerfanos.ts:118-124`

**Escenario.** El chofer mandó 4 fotos sin viaje abierto ($3,200 de diésel), que
quedaron en `comprobante_huerfano`. La flota le abre el viaje. Turno 1: escribe
«hola» → línea 1753 se le ofrece («¿Los agrego a este viaje? Contéstame *sí* o
*no*») y `marcarHuerfanosOfrecidos` escribe `ofrecido_en`. Turno 2: en vez de
contestar, escribe **`listo`** (o «claro que sí, agrégalos todos», 5 palabras →
`esAfirmacion` devuelve `false` por el tope de 4 de `huerfanos.ts:120`).

`esAfirmacion('listo')` es `false` **a propósito** (`huerfanos.ts:113-115`), y
`esNegacion` también. Y la rama de re-ofrecer exige `!ofrecidos.length`
(línea 1753), que ya no se cumple. El bloque entero se salta sin decir nada, el
agente cierra la liquidación, y los 4 huérfanos quedan con `resuelto_en = null`
y `ofrecido_en` puesto.

**`ofrecido_en` no se limpia en ningún lado del repo.** En el viaje siguiente
`getHuerfanos` los devuelve, `ofrecidos.length` vuelve a ser 4 y la rama de
ofrecer se vuelve a saltar: **nunca se le vuelven a ofrecer, en este viaje ni en
ningún otro.** Solo se pueden rescatar desde `/dashboard/huerfanos`
(`resolverHuerfanoDesdeOficina`), si el contralor entra y los ve.

**Consecuencia.** $3,200 que el chofer sí gastó quedan fuera de su liquidación,
que se cierra irreversible, y el canal por el que él los mandó nunca vuelve a
mencionarlos. El comentario de `repo.ts:345-347` afirma exactamente lo
contrario —«lo que queda es una fila todavía pendiente *que se vuelve a
ofrecer*»—; esa invariante no se cumple una vez que `ofrecido_en` está escrito.
El mismo callejón atrapa a los huérfanos cuyo `addGasto` falló a media lista
(línea 1706): se quedan pendientes, ya ofrecidos, y el mensaje que sale
(`mensajeAdjuntados` con solo los que sí entraron) no menciona a los que no.

---

### [MEDIO] El adjuntar-huérfanos escribe `gasto` sin mutex y sin tocar la barrera de intake — es el tercer insertor y el único no cubierto
`src/lib/likida/processor.ts:1700` · vs. `src/lib/likida/processor.ts:719`
(foto) y `src/lib/likida/processor.ts:1376` (XML) ·
`src/lib/likida/conv.ts:567`

**Escenario.** El chofer tiene 4 huérfanos ofrecidos ($3,200). Escribe **«sí»**
y, 3 segundos después, **«listo»**. Meta los entrega como dos webhooks; las dos
invocaciones de `processInbound` corren en paralelo.

- El turno del «sí» entra al bloque de huérfanos, que vive **antes** de
  `esperarIntake` (línea 1765) y **antes** de `acquireViajeLock` (línea 1798), y
  hace 4 `addGasto` seriales. **No hace `intakeDelta(+1)`** — a diferencia de la
  foto (línea 719) y del XML (línea 1376, agregado en la auditoría 8 por esta
  misma razón).
- El turno del «listo» consulta `intakePendientes` → `0` (nadie incrementó) →
  la gracia de 2 s pasa → toma el mutex, corre el agente y cierra.

Si el cierre gana la carrera, los `addGasto` restantes chocan con el trigger
0036 (`CU001`), caen en el `catch` de la línea 1702 como
`logger.error('huerfano.adjuntar_error')` y **no** entran a `puestos`.

**Consecuencia.** Parte de los $3,200 queda fuera de una liquidación ya emitida;
al chofer se le contesta «Listo, agregué los N comprobantes» con un N menor al
que él ofreció y sin una palabra sobre los que faltaron; y los que faltaron caen
en el callejón del hallazgo anterior. La barrera existe justamente para que
ningún camino que inserte `gasto` sea invisible al «listo» — este lo es.

---

### [MEDIO] `agente.sin_presupuesto` entrega un cuadre completo, deja el viaje abierto, y no se lo dice a nadie
`src/lib/likida/processor.ts:1881-1892`

**Escenario.** La ráfaga se comió el reloj: la barrera esperó 20 s y el mutex
otros 12. `reloj.alcanza(15_000)` es `false`. Se calcula el cuadre real y se
manda `resumenCuadre(liq, false, 'operador')`, que empieza con **«Este es el
cuadre de tu viaje 👇»** seguido de comprobado, anticipo y diferencia. Después,
`return` — sin `saveConversation` (el `listo` del chofer no queda ni en el
historial), sin cerrar, sin PDF y **sin una línea que diga qué falta**.

**Consecuencia.** El chofer escribió «listo», recibió lo que parece el resultado
final con sus cifras y deja de mandar comprobantes. El viaje sigue `abierto`; el
contralor no tiene liquidación; nadie le pide al chofer que vuelva a escribir
`listo`. Lo único que le llegará después es el agente de cobranza al tercer día
diciéndole que no ha mandado comprobantes (ver el ALTO de arriba), que es la
peor forma posible de cerrar este ciclo.

**Causa raíz probable.** La rama se construyó para «una respuesta correcta en
vez de silencio» y logra eso; lo que no hace es declarar el estado del viaje ni
la acción pendiente, que es lo único que reabre el ciclo.

## Lo que revisé y está bien

Puntos de muerte que recorrí con la pregunta «si el proceso muere aquí, ¿qué ve
el humano y qué quedó en la base?» y que **sí** cierran:

- **Muere entre el `+1` de la foto y el OCR** — `processor.ts:719-735`: sin
  incremento confirmado no se procesa la foto, se avisa al operador con
  instrucción concreta, y se libera el claim (`releaseMessageClaim`). El
  `finally` de la línea 1294 devuelve el `-1` pase lo que pase, y el TTL de 10
  min de `conv.ts:543-547` limpia el `+1` de una invocación que no volvió.
- **Muere el sondeo de la barrera** — `conv.ts:488-548`: `intakeDelta` e
  `intakePendientes` devuelven `null` (no `0`) ante error, y `esperarIntake`
  (`conv.ts:598-601`) trata `null` como «no sé» → fail-closed → `intakeOk =
  false` → aviso explícito al operador en `processor.ts:2119-2129`, bifurcado por
  `closed` para no afirmar un cuadre que no ocurrió.
- **Dos «listo» a la vez** — `processor.ts:1798-1814`: mutex + re-verificación
  de `getOpenViaje` después de tomarlo; el turno que pierde el lock **avisa y
  libera el claim** en vez de desaparecer.
- **Mutación repetida dentro del mismo ciclo** —
  `tool-executor.ts:147-170`: se cachea la **promesa**, no el resultado, así que
  dos `guardar_liquidacion` en el mismo `Promise.all` se enganchan a la misma
  ejecución; y `openrouter.ts:799` solo cachea entre rondas las tools
  `isReadOnly`. El fallback cross-provider (`openrouter.ts:718-728`) reintenta
  **solo el completado**, nunca una tool ya ejecutada.
- **El modelo narra una cifra o un hecho falso** — `guardia.ts:38-114` sustituye
  el texto por el resumen del motor siempre que corrió `cuadrar_viaje` o
  `guardar_liquidacion`, usando el **snapshot** que la tool devolvió (no una
  segunda lectura de la base), y con `destinatario: 'operador'` para no mandarle
  veredictos al chofer; `guardiaEstado` (`processor.ts:2074-2086`) cotea
  «ya cerré» contra `closed`, que sale de las tool calls y no de una heurística.
- **El PDF no sale** — `processor.ts:2151-2226`: se revisa `pdf_generado`,
  `pdf_contralor_generado` y el resultado de `sendDocument`, y en los tres casos
  se le dice al operador la verdad («ya quedó cerrada, pídeselo a tu contralor»).
- **Meta rechaza un envío** — `say` (`processor.ts:683-688`) devuelve si salió, y
  el turno del asistente **no** entra al historial si rebotó
  (`processor.ts:2236-2245`, y el gemelo de la confirmación en 1644-1657); las
  marcas (`intentosConfirmacion`, `cierreSinComprobantes`) se arrastran en vez de
  recalcularse.
- **Carrera del INSERT de la conversación** — `conv.ts:261-286`: choca contra
  `wa_conversacion_tenant_tel_uidx`, relee la fila ganadora y lanza
  `ConsultaFallida` si no aparece, en vez de devolver `id: ''`.
- **El historial cruza de viaje** — `conv.ts:294-314`: `desdeFila` descarta
  turnos y marcas cuando el `viaje_id` no coincide.
- **El chat del panel** — `analista.ts:168-183` y `353-389`: guardia
  determinística de cifras con reintento acotado y bloqueo final
  (`AVISO_SIN_RESPALDO`), no solo la promesa del prompt.
- **El hito** (`hitos_viaje.ts:73-111`) sella con `WHERE <col> IS NULL`, de modo
  que el mensaje repetido no mueve la hora, distingue `ya_estaba` de `fallo`, y
  la lista de frases es cerrada y anclada para no comerse mensajes del agente.
- **El cron** (`api/cron/escalar/route.ts`) falla cerrado sin `CRON_SECRET` y
  responde 500 —no 200— cuando cualquiera de los dos motores truena.

## Lo que NO alcancé a revisar

- **El agente `analista` del panel de punta a punta** (`analista.ts`,
  `chat-tools.ts`, streaming NDJSON, historial 0088): revisé su guardia de cifras
  y su prompt, no el ciclo completo de tools ni el comportamiento del stream
  cuando la conexión muere a media secuencia.
- **`crear_viaje_wa.ts` como parser** (~660 líneas): solo lo seguí desde
  `despacho_wa`; no audité `interpretarPeticionViaje` frase por frase (falsos
  positivos del parser, anticipos mal leídos, `resolverOperadorPorNombre` con
  homónimos parciales).
- **Los otros cinco agentes del panel** (`liquidacion`, `facturas`, `peajes`,
  `proveedores`, `conductores`): solo miré cobranza, que es el único con motor
  que manda mensajes solo.
- **`escalar_viaje.ts` completo** (reaviso, doble corrida del cron, plantilla vs.
  texto): lo leí para confirmar AG-A2 y AG-A4, no como ciclo propio.
- **El acuse de ráfaga bajo concurrencia real** (`intake/rafaga.ts`, libreta en
  memoria): la libreta vive en el proceso, así que dos instancias de Lambda
  atendiendo la misma ráfaga tendrían dos libretas — no lo verifiqué.
- **`consulta_chofer.responderConsulta` corre antes de la barrera**
  (`processor.ts:1558`), así que un «¿cuánto llevo?» durante una ráfaga puede
  contestar de menos; no medí si el texto lo declara.
