# Sistema agéntico y orquestación — auditoría 18 · continuación 3

**Nota: 6/10** (antes 4). Razón del movimiento: *se atacó y subió*. El PR #38
cerró de verdad el CRÍTICO de ayer y —lo que pesa más— reconstruyó el ciclo de
vida del mensaje: `processInbound` ya no devuelve `void`, el claim distingue
*reclamado* de *completado* (mig. 0149), y la bandeja durable dejó de sellar
como procesado lo que nunca corrió. Ese era el agujero estructural del rubro y
está tapado, con `archivo:línea` abajo. No sube más porque el mismo defecto de
proceso que la nota anterior diagnosticó volvió a asomar dos veces en este
delta: A28 («el aviso de dinero va a quien ve dinero») se arregló en
`avisar_cierre.ts` y NO en el otro consumidor del mismo patrón
(`cron/facturar/route.ts:207`); y el merge tomó el arreglo ancho de `master`
sin ver que abría el hueco inverso y dejaba código defensivo sin call site.

**El riesgo mayor hoy:** hay un punto de muerte del turno —el «listo» que llega
sin presupuesto para el agente— donde el chofer recibe un cuadre con las cifras
finales, el viaje se queda `abierto` en la base, el mensaje se sella como
procesado y nada lo vuelve a intentar. La base dice una cosa y el usuario cree
otra, que es el ancla de 3 del rubro; el resto del ciclo está muy por encima de
eso.

---

## Verificación de los abiertos de la pasada anterior

| # | Hallazgo de c2 | Estado | Dónde lo verifiqué |
|---|---|---|---|
| 1 | **[CRÍTICO]** Un despacho pendiente le tapa la boca al chofer 30 min | **CERRADO** | `processor.ts:872` pasa `{ incluirPreguntaLibre: !viajeId, incluirDespacho: !viajeId }` y `processor.ts:510` (`if (opciones.incluirDespacho)`) salta despacho **y** asignación con viaje abierto. Con V-1042 abierto, «listo» ya no lo toca `atenderDespachoOficina`. El comentario `:492-509` documenta el desempate. Ver hallazgo nuevo AGEN-C3-2: el arreglo es más ancho de lo necesario y abre el hueco inverso. |
| 2 | **[ALTO]** Chofer y oficina se borran el `estado` de la misma fila | **CERRADO** | Los tres escritores pasaron a leer-fusionar-escribir y ninguno manda ya `viaje_id` en el payload: `despacho_wa.ts:121-145`, `asignar_wa.ts:178-200`, `conv.ts:485-509`. Los dos claims atómicos preservan lo ajeno (`despacho_wa.ts:186-194`, `asignar_wa.ts:226-234`). El escenario B (la foto del chofer borra `viajePendiente`) ya no ocurre: `saveConversation` copia `filaActual.estado` antes de escribir. La carrera SELECT→UPDATE queda declarada en `despacho_wa.ts:60-69`. |
| 3 | **[ALTO]** La foto que se traba en otra invocación ya no dice nada | **REINCIDENTE** | Sin un solo cambio: `rafaga.ts:99` sigue siendo `const bandejas = new Map<…>` de módulo, y `processor.ts:1760-1797` sigue diciendo `mensajeSolo` únicamente si la invocación que cierra encuentra la incidencia en **su propio** Map. La premisa que lo justifica (`rafaga.ts:19-27`, *«la ráfaga repartida entre dos invocaciones… hoy no ocurre»*) **dejó de ser cierta en este delta**: ahora todo mensaje que devuelve `sin_tiempo` en el webhook lo reprocesa el cron `wa-pendientes` en OTRA invocación (`cron/wa-pendientes/route.ts:102-119`), con el Map vacío. |
| 4 | **[ALTO]** El piloto de visión llama al modelo sin `AbortSignal` ni presupuesto | **REINCIDENTE** | `piloto_vision.ts:364-373`: `generateStructured` sigue sin `signal`; `grep -n signal piloto_vision.ts` no devuelve nada. El único tope sigue siendo `PASOS_MAXIMOS = 14` (`:58`), un contador de pasos, no de reloj. |
| 5 | **[ALTO]** El ticket que el piloto toma no se emite, no se bloquea y no llega a nadie | **REINCIDENTE** | `registro.ts:194` sigue metiendo los pilotables en `portalesOperables()`; `enrutar.ts:139-142` sigue devolviendo `automatico` cuando `sabeOperarlo`; `piloto_vision.ts:255-256` sigue devolviendo `detenido_antes_de_emitir` por diseño. El círculo sigue cerrado sobre sí mismo. |
| 6 | **[ALTO]** La contraseña se escribe donde diga el modelo y la captura viaja en claro | **REINCIDENTE** | `piloto_vision.ts:266-277`: `resolverValor` → `pagina.escribir(a.selector, real)` sin mirar el `type` del campo; la única guarda sigue siendo `selectorDelInventario` (`:282-288`), que solo comprueba que el id/name exista. La captura del paso siguiente sigue saliendo al modelo en `:370` (`images:`). |
| 7 | **[ALTO · REINCIDENTE]** Un mensaje abandonado a medias queda sellado como procesado | **CERRADO** | Es el arreglo más grande del delta en este rubro. `processor.ts:614` declara `ResultadoInbound` con cinco estados; `:644-648` devuelve `sin_tiempo` **antes** de tomar el claim; `:672-682` sella `completarMessageClaim` solo si el turno no soltó el claim. `conv.ts:347` (`LEASE_CLAIM_MS`) y `:383-413` (`retomarClaimHuerfano`) distinguen *reclamado* de *completado* (mig. 0149): un claim de una invocación muerta se **retoma** en vez de devolver 'duplicado'. Y los dos llamadores dejan de sellar lo pospuesto: `webhook/whatsapp/route.ts:275-279` y `cron/wa-pendientes/route.ts:112-118`. |
| 8 | **[ALTO · REINCIDENTE]** El cierre —cifras y PDF— sale al *encargado* | **CERRADO** | `contactos.ts:117` (`ORDEN_AVISO_DINERO = ['flota_admin','contador']`) y `:122-135` (`telefonoParaDineroDe`, que devuelve `null` en vez de caer al encargado «por lo menos»); `avisar_cierre.ts:106` ya lo usa. **Pero solo en este consumidor** — ver el hallazgo nuevo AGEN-C3-3. |
| 9 | **[MEDIO · REINCIDENTE]** El jefe recibe el ejemplar del OPERADOR | **CERRADO** | `processor.ts:2766-2772`: se firma `${op.tenantId}/${viajeId}.pdf` (el completo) con TTL 60s, y `:2774` es la URL que se le pasa a `avisarCierreAlJefe`. El contrato quedó escrito en `avisar_cierre.ts:91-96`. |
| 10 | **[MEDIO · REINCIDENTE]** Sin PDF del operador, el jefe no se entera del cierre | **CERRADO** | El `try` del PDF del operador cierra en `processor.ts:2735`; el bloque del aviso al jefe abre en `:2764`, fuera de él. Sin ejemplar del contralor se manda el texto con `urlPdf: null` (`:2765-2774`). |
| 11 | **[MEDIO]** El aviso le pide al encargado facturar a mano un portal que el piloto va a intentar | **REINCIDENTE** | `avisar.ts:70` sigue siendo `repartir(tickets, sabeOperarlo)` (dos argumentos) y `avisar.ts:98` sigue siendo `enrutar(t, …sabeOperarlo…)` (dos argumentos). El tercer parámetro `cuentaCompartida` sigue con su default (`enrutar.ts:78`, `:199`) y ningún llamador de producción lo pasa. |
| 12 | **[MEDIO]** El texto libre del dueño-chofer viaja a un modelo antes del gate del aviso | **REINCIDENTE** | El bloque de oficina sigue en `processor.ts:846-875` y `ponerAvisoADisposicion` sigue en `:887`. Con `viajeId === null`, `incluirPreguntaLibre` es `true` y `atenderPreguntaLibre` (`:580-589`) manda el texto crudo al LLM antes del gate. |
| 13 | **[MEDIO]** El piloto no registra el costo de ninguna de sus llamadas | **REINCIDENTE** | `grep -rn registrarCosto src/lib/likida/facturacion/` devuelve **cero líneas**. `piloto_vision.ts:364` sigue descartando `raw/model/tokensIn/tokensOut/cost`. |
| 14 | **[BAJO]** Cada texto de cada chofer paga una consulta extra a `app_user` | **REINCIDENTE** (atenuado) | `processor.ts:847` sigue llamando `resolverCuentaOficina` para todo texto de todo operador. Atenuante real del delta: ahora va con techo (`contactos.ts:56-62`, `acotada`), así que ya no puede colgar la invocación — solo cuesta. |

**Cuenta:** 6 cerrados (el CRÍTICO, dos reincidentes de larga data y los tres del
cierre), 8 reincidentes — de los cuales 5 viven detrás de `FACTURACION_PILOTO`,
hoy apagada.

**Pendientes de c2 que sí revisé esta vez y salieron limpios:** el reparto por
rol del canal de CORREO (`notificaciones.ts:564-601` + `:231-233`: `repartoDe`
filtra por `rolesQuePueden` → `puedeVerRuta`, o sea contra la MISMA matriz de
`visibilidad.ts`; es el patrón que a WhatsApp le faltaba y que A28 vino a poner)
y `atenderAutorizacionTalacha` con `tenantId === null` (`talacha_wa.ts:450-454`:
corta antes de cualquier lectura y contesta la verdad).

---

## Hallazgos

### [ALTO] El «listo» que llega sin presupuesto recibe un cuadre que parece final: el viaje se queda abierto, el mensaje se sella como procesado y nada lo reintenta
`src/lib/likida/processor.ts:2387-2396` · `src/lib/likida/cuadre/resumen.ts:55`

```ts
const COSTO_AGENTE_MS = 15_000;
if (!reloj.alcanza(COSTO_AGENTE_MS)) {
  logger.error('agente.sin_presupuesto', …);
  const liq = await cuadrarDesdeDB(op.tenantId, viajeId);
  await say(resumenCuadre(liq, false, 'operador'));
  return;                       // ← sin soltarClaim()
}
```

Escenario, con valores. Javier manda 22 fotos y «listo» en el mismo POST de
Meta. La invocación arranca a t=0 con `PRESUPUESTO_WEBHOOK_MS = 120_000`
(`presupuesto.ts:200`); `route.ts:269` corre el pool de 5 y `route.ts:274` le
pasa a cada mensaje el `inicioInvocacionMs` compartido (C4, ya arreglado). El
«listo» entra a t=88 s: `reloj.alcanza(COSTO_MINIMO_TURNO_MS = 15_000)` es
`true` (quedan 32 s), así que se toma el claim. `esperarIntake` espera a las
fotos en vuelo (hasta `LIKIDA_INTAKE_ESPERA_MS`, 20 s) y `acquireViajeLock`
(`:2301`, `reloj.acotar(12_000)`) se lleva el resto. A t=113 s
`reloj.alcanza(15_000)` es `false` → se manda el cuadre determinístico y se
`return`.

Lo que el chofer lee es, literalmente (`resumen.ts:55-62`):

> Este es el cuadre de tu viaje 👇 · Comprobado: $18,430.00 · Anticipo:
> $20,000.00 · Sobró $1,570.00 del anticipo (a favor de la empresa)

Ni una palabra de que no cerró, ni «vuelve a escribir listo». Lo que queda en
la base: `viaje.estatus = 'abierto'`, **cero** filas en `liquidacion`, ningún
PDF, ningún `avisarCierreAlJefe`. Y como `procesarTurno` no lanzó ni soltó el
claim, `processInbound` devuelve `'procesado'` (`:680-682`) →
`completarMessageClaim` + `marcarPendienteProcesado` (`route.ts:279`): el
mensaje queda sellado y **el cron `wa-pendientes` no lo vuelve a tomar nunca**.

Consecuencia. El chofer se baja del camión creyendo que liquidó —el mensaje le
enseñó las tres cifras que cierran—. El contralor no recibe ni texto ni PDF, y
el viaje sigue abierto. La única red que existe es la cobranza, que llega hasta
3 días después (`cobranza_pura.ts:28`, primer tier) y encima con el texto
equivocado (ver el MEDIO de abajo). Ninguna prueba cubre este camino:
`grep -rn sin_presupuesto src/` solo devuelve las dos líneas de `logger.error`.

Causa raíz probable: el fallback se diseñó para «no dejar al operador sin
respuesta» y se le dio la respuesta del camino feliz — un resumen que no dice
que no cerró — mientras el retorno sigue siendo el del turno completo.

---

### [ALTO] Con viaje abierto se salta el despacho ENTERO: el dueño que maneja no puede despachar y el pendiente que ya dictó queda inalcanzable, sin un error
`src/lib/likida/processor.ts:510, 872` · `src/lib/likida/despacho_wa.ts:238, 362` · `src/lib/likida/asignar_wa.ts:298, 359`

El merge `673496f` tomó el lado de `master`: `incluirDespacho: !viajeId`
(`:872`) apaga `atenderDespachoOficina` **y** `atenderAsignacionOficina`
completos (`:510`), no solo la rama que re-enseña el pendiente. La rama de
auditoría tenía el corte fino (`opciones.reengancharPendiente`), y ese
parámetro **sigue en el árbol sin un solo call site**:
`grep -rn reengancharPendiente src/ | grep -v test` da cinco líneas, todas
dentro de `despacho_wa.ts` y `asignar_wa.ts`.

Escenario A, con valores. Javier es `flota_admin` **y** operador (el caso que
`contactos.ts:20-25` documenta como normal en flota chica). 09:00 sin viaje
propio abierto dicta *«nuevo viaje para Pedro López, Puebla a Monterrey,
anticipo 8000»* → `guardarPendiente` (`despacho_wa.ts:420-429`), le llega el
resumen «¿confirmas? SÍ/NO». 09:02 el encargado, desde `/dashboard/despacho`,
le abre a Javier su propio viaje V-1042 → `getOpenViaje` deja de devolver
`null`. 09:03 Javier contesta **«sí»**: `incluirDespacho` es ahora `false`,
`atenderDespachoOficina` ni se llama, `esAfirmacion('sí')` nunca corre, el
texto cae al agente de liquidación de V-1042 y le contesta sobre SU viaje. El
viaje de Pedro **nunca se crea**; `viajePendiente` se queda en el jsonb hasta
que `VIGENCIA_PENDIENTE_MS` (30 min) lo hace ilegible, y nadie avisa de nada.

Escenario B, sin segundo actor. Javier va en ruta con V-1042 y escribe
*«asígnale la unidad 12 al viaje de Pedro»*. `interpretarPeticionViaje` y el
parser de `asignar_wa.ts:136` son deterministas y **no pueden** confundirse con
«listo» ni «ya llegué» —que es lo único que el desempate protege—, pero da
igual: `:510` los apaga a los dos. El texto se lo come el agente, que contesta
sobre comprobantes. Pedro sigue sin unidad.

Consecuencia. Es el mismo modo de falla que c2 levantó —un despacho confirmado
que no existe, cuya única traza es la ausencia de una fila— movido un paso
antes. Y es el guion del demo que `d432e89` vino a habilitar: despachar por
WhatsApp desde el mismo número con el que se cierra. En la sala, el «sí» del
dueño no crea nada y el bot contesta de otra cosa.

Causa raíz probable: el conflicto se resolvió por amplitud («master subsume a la
rama») sin comprobar que los reconocedores apagados de más son justo los
deterministas, y el corte fino quedó en el árbol sin quien lo pase.

---

### [MEDIO] El aviso de facturación sigue saliendo al *encargado*, con liga, campos y montos por ticket de una pantalla que su rol no puede abrir
`src/app/api/cron/facturar/route.ts:207` · `src/lib/likida/facturacion/avisar.ts:157` · `src/lib/likida/facturacion/enrutar.ts:156-186` · `src/lib/auth/visibilidad.ts:147`

A28 puso `ORDEN_AVISO_DINERO`/`telefonoParaDineroDe` en `contactos.ts:117-135`
y lo cableó en `avisar_cierre.ts:106`. El otro consumidor del mismo patrón
quedó igual: `cron/facturar/route.ts:207` sigue llamando `telefonoJefeDe`, que
resuelve con `ORDEN_AVISO = ['encargado', 'flota_admin']` (`contactos.ts:97`).

Escenario, con valores. Flota con `encargado` (con teléfono) y `flota_admin`.
Cinco tickets de diésel de un portal sin adaptador. El cron manda por WhatsApp
al encargado el texto de `mensajeParaEncargado` (`enrutar.ts:156-186`): la liga
del portal, cada campo requerido con su valor (`Total: $2,400.00`,
`Folio: 118342`, la fecha) y el plazo, cinco veces. `visibilidad.ts:147` dice
`'/dashboard/facturacion': 'dinero'` y `visibilidad.ts:41` dice
`encargado: ['operacion']`: si sigue el aviso al panel, `exigirVer()` lo rebota.

Consecuencia. Dos cosas a la vez y las dos malas: el rol al que el panel le
esconde el dinero recibe por WhatsApp los importes ticket por ticket, y se le
encarga un trabajo cuya pantalla no puede abrir. Es la definición exacta del
hallazgo que A28 cerró —*«el canal no puede ser la puerta trasera de la matriz
de visibilidad»*, `contactos.ts:109-116`— aplicada a un solo consumidor.
`contactos.ts:96` («el encargado… puede entrar a un portal a facturar») y
`visibilidad.ts:147` se contradicen por escrito; hay que decidir cuál manda.

Causa raíz probable: el arreglo se hizo sobre el llamador que el hallazgo
nombraba, no sobre la función; la firma vieja quedó viva y con dos usuarios.

---

### [MEDIO] La cobranza le dice «llevas N días sin mandarme comprobantes» a quien sí los mandó
`src/lib/likida/agentes/cobranza.ts:113-131, 156-176` · `src/lib/likida/agentes/cobranza_pura.ts:112`

La cola de cobranza selecciona por `estatus in ('abierto','en_cuadre')` +
`fecha_inicio not null` + `avisado_en not null`, y calcula `dias` contra
`fecha_inicio` (`:160`). **No mira ni una sola vez si el viaje tiene gastos.**
El encabezado del cron lo describe como *«viajes abiertos … y sin
comprobantes»* (`cron/escalar/route.ts:26-27`), y esa condición no existe en el
código.

Escenario, con valores. V-2026-0847 arranca el lunes. El martes el chofer manda
8 fotos: 8 filas en `gasto` por $6,240 en total. No escribe «listo» hasta el
jueves (o cae en el ALTO de arriba). El jueves a las 09:00 el cron le manda:
**«Llevas 3 días con VJ-2026-0847 sin mandarme comprobantes 📋»**
(`cobranza_pura.ts:112`).

Consecuencia. Un mensaje del sistema que afirma un hecho falso sobre lo que el
usuario acaba de hacer — la regla del repo es que un rótulo tiene que ser
verdad. El chofer reenvía las 8 fotos (`LIKIDA_DEDUP_FOTOS` está apagado por
default, `processor.ts:1176`, así que sí se vuelven a OCR-ear y a insertar) o
deja de leer el canal. Lo segundo es peor: es el canal por el que sale la
liquidación. Del dinero no se pierde nada —`engine.ts:359-364` excluye los
duplicados del comprobado— pero se paga el OCR ocho veces y la liquidación sale
con 8 renglones de `tipo: 'duplicado'` que el contralor tiene que resolver.

Causa raíz probable: el filtro que el comentario describe («sin comprobantes»)
nunca se escribió en la consulta, y el texto se redactó dando por hecho el
filtro.

---

### [MEDIO] «No había tiempo» consume uno de los cinco intentos de la bandeja durable: un mensaje que nunca se intentó puede volverse carta muerta
`src/lib/likida/wa_pendientes.ts:25, 83, 96-107` · `src/app/api/webhook/whatsapp/route.ts:271-277` · `src/app/api/cron/wa-pendientes/route.ts:102-118`

`reclamarPendiente` incrementa `intentos` **al reclamar**, antes de saber qué
pasó (`wa_pendientes.ts:99`), y su comentario explica por qué:
*«un evento que revienta el proceso ya quedó contado»* (`:14-15`). Pero desde
este delta el mismo contador cuenta también los `sin_tiempo` y `en_curso`, que
son lo contrario: mensajes que **no se intentaron**. Los dos llamadores anotan
el pospuesto sin descontar el intento (`route.ts:277`,
`cron/wa-pendientes/route.ts:116`), y `pendientesPorDrenar` filtra
`.lt('intentos', MAX_INTENTOS_PENDIENTE)` = 5 (`:83`, `:25`).

Escenario, con valores. Fajo de 22 fotos, un POST. El webhook las persiste
todas y las corre con `MAX_EN_PARALELO = 5`; a partir de t≈105 s las que
quedan devuelven `sin_tiempo` sin tocar nada → `intentos = 1` para cada una.
`LOTE = 10` y el cron corre **en serie** con su propio `maxDuration = 120`: en
cada vuelta drena las ~5 más viejas y las otras 5 del lote vuelven a devolver
`sin_tiempo` → `intentos = 2`, `3`… Basta que dos ráfagas de un mismo día se
solapen para que una foto llegue a 5 sin haber pasado nunca por el OCR: a
partir de ahí `pendientesPorDrenar` deja de verla y `cartasMuertas` la cuenta.

Consecuencia. Un comprobante que nunca se procesó, del que el chofer no se
entera nunca (la fila durable no le contesta) y del que Javier se entera por un
correo agregado —«N mensaje(s) agotaron sus reintentos»
(`cron/wa-pendientes/route.ts:129-133`)— sin saber de qué flota ni de qué
viaje: `wa_evento_pendiente` no tiene `tenant_id`. Que sea visible es lo que lo
deja en MEDIO y no en ALTO.

Causa raíz probable: `intentos` era el contador de «cuántas veces reventó» y
pasó a ser el de «cuántas veces se miró», sin separar los dos hechos cuando se
introdujeron los estados nuevos de `ResultadoInbound`.

---

### [BAJO] `reengancharPendiente` quedó en el árbol sin un solo call site
`src/lib/likida/despacho_wa.ts:238, 362` · `src/lib/likida/asignar_wa.ts:298, 359`

Los dos módulos declaran el 5º parámetro `opciones: { reengancharPendiente?:
boolean }` con doce líneas de jsdoc que citan «auditoría 18-c2, AGEN-C2-1», y
los dos únicos llamadores (`processor.ts:515` y `:531`) pasan tres argumentos.
La rama `if (opciones.reengancharPendiente === false) return null` es
inalcanzable. Deuda que cobra factura del modo habitual: el próximo lector
concluye que el corte fino está puesto y no lo está.

---

### [BAJO] El techo de dinero del runner se lee con `.limit(1000)` en vez de `traerTodo()`
`src/lib/likida/agentes/runner.ts:65-73`

`gastoDelDiaUsd` suma `agente_corrida.costo_usd` del día con un `.limit(1000)`
crudo. Es exactamente el recorte silencioso de PostgREST contra el que
`analytics.ts` escribió `traerTodo()` y que el CLAUDE.md nombra como trampa. Su
comentario dice *«LANZA si la base no responde — el techo no se verifica a
ciegas»*, y el recorte es justo verificarlo a ciegas: por encima de 1,000
corridas del mismo agente en un día, el gasto se subestima y el candado 3 deja
pasar. Hoy no se alcanza (5 piezas × 6 vueltas), por eso es BAJO; el defecto es
que el número que protege dinero es el único de este archivo que puede mentir
callado.

---

## Lo que revisé y está bien

- **El ciclo de vida del mensaje, de punta a punta.** Es lo mejor del delta.
  `processInbound` sale con `sin_tiempo` **antes** de tomar el claim
  (`processor.ts:644-648`), así que un mensaje sin presupuesto no consume nada;
  el claim solo se completa si el turno llegó al final (`:672-682`); el lease
  (`conv.ts:347`) es mayor que el `maxDuration` a propósito y
  `retomarClaimHuerfano` (`:383-413`) usa un UPDATE anclado por `completado_en`
  + `created_at`, que es atómico entre dos corridas. Los tres estados que dejan
  la fila sin sellar están enumerados en un solo sitio (`route.ts:55-57` y
  `cron/wa-pendientes/route.ts:41-43`) y los dos llamadores los respetan.
- **El inbox durable ya no es solo el del kill switch.** `route.ts:192-207`
  persiste TODO mensaje permitido antes del código de salida y contesta **503**
  si ni guardar se pudo — el único caso que antes era pérdida real. El 200
  significa por fin «recibido y guardado».
- **La fusión del jsonb de `wa_conversacion` está hecha en los tres escritores,
  no en dos.** `conv.ts:485-500`, `despacho_wa.ts:121-145`,
  `asignar_wa.ts:178-200`. Y el detalle que de verdad lo cierra: `viaje_id` sale
  del payload del `upsert` (`despacho_wa.ts:133-137`) para que el `ON CONFLICT`
  no lo nulifique. Los claims atómicos conservan su `WHERE` (`:193`, `:233`).
- **El destinatario del dinero, en el cierre.** `telefonoParaDineroDe`
  (`contactos.ts:122-135`) devuelve `null` cuando nadie que ve dinero tiene
  teléfono — no cae al encargado «por lo menos» —, y `avisar_cierre.ts:107-112`
  lo grita como ERROR. `avisar_cierre.test.ts` cruza la lista contra la matriz
  real de `visibilidad.ts`.
- **El aviso al jefe ya no depende del papel del chofer** (`processor.ts:2764`
  fuera del `try` del PDF del operador) y `sendDocument` se revisa por valor
  (`avisar_cierre.ts:138-140`) en vez de esperar una excepción que ya no llega.
- **El reparto por rol del canal de CORREO está bien desde antes.**
  `notificaciones.ts:564-601` cruza cada destinatario contra `rolesQuePueden`
  (`:231-233` → `puedeVerRuta`), o sea contra la misma matriz de
  `visibilidad.ts`; excluye con motivo, dedupe por correo y tope de
  destinatarios. Contesta la pregunta que dejé abierta en c2.
- **`correr_runner` ejecuta lo que la tarjeta enseñó** (M30):
  `copiloto-acciones.ts:152-153` pasa `objetivoDelRunner(params.id)` y
  `runner.ts:137-138` filtra por él; un agente no habilitado se dice
  (`copiloto-acciones.ts:164-166`) en vez de fingir una vuelta. Los cuatro
  candados del runner siguen fail-closed y cada salto trae su motivo en
  palabras (`runner.ts:141-203`).
- **El turno del copiloto que truena ya se contabiliza** (M29):
  `admin/copiloto/route.ts:266-271` anota `copiloto.costo` desde
  `PartialExecutionError`; y el costo se escribe **antes** de intents e
  historial (`:216-221`), los dos con plazo (`:228`, `:255`), así que un cuelgue
  ya no deja el stream sin `'fin'`.
- **El envío de una pieza de la cola es claim → proveedor → prueba, con
  compensación** (`cola.ts:303-423`): el claim anclado a
  `estado='aprobado' ∧ enviado_en is null` hace que el segundo click toque cero
  filas y se diga; el tope diario y la cadencia fallan cerrado y revierten; la
  única ventana (morir entre el envío y el `provider_message_id`) queda
  **visible** en el panel, declarada en `:290-294`. Es el modelo de cómo se
  contesta la pregunta del rubro.
- **`atenderAutorizacionTalacha` con tenant nulo** (`talacha_wa.ts:450-454`)
  corta antes de cualquier lectura; el superadmin no toca filas de otra flota.
- **El mutex y la barrera siguen enteros**: `acquireViajeLock` distingue el
  error permanente del transitorio (`conv.ts:560-570`), el abandono por lock
  ocupado avisa **y** suelta el claim (`processor.ts:2304-2309`), y el
  incremento fallido de la barrera también (`:1129-1143`).

## Lo que NO alcancé a revisar

- **`notificaciones.ts` completo (1,300 líneas).** Entré por `avisar()`,
  `repartoDe` y `usuariosAvisables`. El anti-ruido (magnitud, incidente
  cerrado, `guardarMagnitud`) tiene sus propias pruebas de parpadeo y no lo
  recorrí con la pregunta de «si muere aquí».
- **`redactor.ts` y `estrategia.ts`.** El runner los despacha y yo verifiqué el
  despachador, no el motor: si `redactarCorreoFrio` muere después de gastar el
  modelo y antes de encolar la pieza, no comprobé qué queda en
  `agente_corrida`.
- **El número duro del peor caso del piloto de visión.** Sigue faltando lo
  mismo que en c2: sin Chromium no puedo medir `inventario()` contra una página
  real, así que el ALTO 4 se sostiene como cota y no como medición.
- **La ventana real del ALTO 1.** El reparto exacto de los 120 s (cuánto pesa
  `esperarIntake` contra el OCR de 22 fotos) no lo pude medir sin `.env` ni
  base; el hallazgo se sostiene por el `if` y por su `return`, que son
  deterministas por lectura, no por la frecuencia con que se alcanza.
- **No hay base, ni render, ni `npm run build`.** Corrí el subconjunto de
  pruebas de este rubro y está verde: 10 archivos, 87 pruebas
  (`processor_dueno_maneja`, `avisar_cierre`, `runner`, y los seis de
  `api/webhook/whatsapp` incluido `canal_e2e`).
