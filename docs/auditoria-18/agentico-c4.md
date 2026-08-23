# Sistema agéntico y orquestación — auditoría 18 · continuación 4

**Nota: 5/10** (antes 6). Razón del movimiento: *deuda que cobró factura*. La c3
subió a 6 porque el ciclo de vida del mensaje se había reconstruido bien
(claim *reclamado* ≠ *completado*, `ResultadoInbound`, mig. 0149). Ese esqueleto
sigue siendo bueno. Lo que cobró factura en este delta es el mismo defecto de
proceso que la c3 ya había diagnosticado dos veces —*el arreglo se hace sobre el
llamador que el hallazgo nombraba, no sobre la función*— aplicado ahora a tres
piezas de las que dependen mensajes de un chofer real:

- ESC-1 devolvió el intento de `sin_tiempo` **solo en `drenado.ts`**; el webhook
  quedó como estaba, y `en_curso` —que por definición es *no se intentó*— sigue
  consumiendo intento en los dos;
- RES-15 (`9ef9690`) llevó el cuadre determinístico a un **segundo** call site
  sin ver que ese sitio puede alcanzarse con la liquidación **ya cerrada**;
- la cadencia del cron pasó de `*/5` a `* * * * *` (`vercel.json:6-8`) sin
  revisar qué invariantes suponían cinco minutos entre corridas —la libreta de
  ráfaga en memoria y el contador de intentos de la bandeja son dos de ellas.

**El riesgo mayor del rubro, hoy:** un fajo de fotos que se reparte entre la
invocación del webhook y la del cron pierde, en silencio y sin rastro para el
chofer, las incidencias que anotó la invocación que no cerró la barrera — y el
resumen que sí sale afirma «Ya revisé tus fotos» con un conteo que no incluye
las que fallaron. El chofer se va creyendo que mandó todo.

> **Nota sobre el árbol.** Todo lo que sigue está verificado contra **`HEAD`
> (`6062a9b`)**. A media auditoría aparecieron en el *working tree* tres cambios
> sin commitear que no son míos y que rompen piezas de este rubro:
> `src/lib/likida/processor.ts:2758` pasó de `if (transitorio)` a `if (false)`
> (apaga RES-15 entero), `src/lib/admin/salud.ts:75` ganó un
> `if (Math.random() < 2) return;` al principio de `registrarLatido` (apaga
> **todos** los latidos de cron), y `puertaCron` perdió su `alertarOperador` de
> `cron_sin_secreto` y su `logger.error` de `cron_401` (`salud.ts:57, 66`). No
> los toqué —no es mi entregable— pero hay que mirarlos antes de commitear nada:
> `git diff src/`.

---

## Verificación de los abiertos de la c3

| # | Hallazgo de la c3 | Estado | Evidencia |
|---|---|---|---|
| verif-3 | **[ALTO]** La foto que se traba en otra invocación ya no dice nada | **REINCIDENTE (agravado)** | `intake/rafaga.ts:99` sigue siendo el `Map` de módulo y `:159-163` (`cerrarRafaga`) sigue siendo el único lector. `processor.ts:1895-1899`: `rafaga = ultima ? cerrarRafaga(viajeId) : null` — la invocación que no ve `quedan === 0` no cierra su libreta y **nadie más la lee**. La premisa de `rafaga.ts:19-27` («la ráfaga repartida entre dos invocaciones… hoy no ocurre») es hoy el caso normal: el cron corre **cada minuto** (`vercel.json:6-8`). Ver AGEN-C4-1. |
| verif-4 | **[ALTO]** El piloto de visión llama al modelo sin `AbortSignal` ni presupuesto | **REINCIDENTE** | `piloto_vision.ts:364` sigue siendo `generateStructured({…})` sin `signal`; `grep -n signal piloto_vision.ts` no devuelve nada. Único tope: `PASOS_MAXIMOS = 14` (`:58`). Detrás de `FACTURACION_PILOTO`, apagada. |
| verif-5 | **[ALTO]** El ticket que el piloto toma no se emite ni llega a nadie | **REINCIDENTE** | `piloto_vision.ts:255-256` sigue devolviendo `detenido_antes_de_emitir` por diseño; el círculo `registro.ts` → `enrutar.ts` → piloto sigue cerrado. |
| verif-6 | **[ALTO]** La contraseña se escribe donde diga el modelo | **REINCIDENTE** | Sin cambios en `piloto_vision.ts:266-288`. |
| verif-11 | **[MEDIO]** El aviso le pide al encargado facturar un portal que el piloto va a intentar | **REINCIDENTE** | `avisar.ts:70` sigue siendo `repartir(tickets, sabeOperarlo)` y `:98` `enrutar(t, …)` — dos argumentos; el 3.º (`cuentaCompartida`) sigue sin llamador de producción. |
| verif-13 | **[MEDIO]** El piloto no registra el costo de ninguna llamada | **REINCIDENTE** | `grep -rn registrarCosto src/lib/likida/facturacion/` → **cero líneas**. |
| verif-12 | **[MEDIO]** El texto libre del dueño-chofer viaja a un modelo antes del gate del aviso | **REINCIDENTE** | `processor.ts:920` (`atenderTextoOficina(...)`) sigue **antes** de `ponerAvisoADisposicion` (`:935`). Con `viajeId === null`, `incluirPreguntaLibre` es `true`. |
| verif-14 | **[BAJO]** Cada texto de cada chofer paga una consulta extra a `app_user` | **REINCIDENTE (atenuado)** | `processor.ts:895` sigue llamando `resolverCuentaOficina` para todo texto; sigue con techo. |
| AGEN-C3-1 | **[ALTO]** El «listo» sin presupuesto recibe un cuadre que parece final | **REINCIDENTE (agravado)** | `processor.ts:2616-2626` idéntico: `logger.error('agente.sin_presupuesto')` → `resumenCuadre(liq, false, 'operador')` → `return` sin `soltarClaim()`. Y `9ef9690` añadió un **segundo** call site con el mismo texto (`:2763`). Ver AGEN-C4-2. |
| AGEN-C3-2 | **[ALTO]** Con viaje abierto se salta el despacho ENTERO | **REINCIDENTE** | `processor.ts:920` sigue pasando `incluirDespacho: !viajeId` y `:558` sigue siendo `if (opciones.incluirDespacho) {` envolviendo **despacho Y asignación**. El corte fino sigue sin llamador. |
| AGEN-C3-3 | **[MEDIO]** El aviso de facturación sale al *encargado* | **REINCIDENTE** | `cron/facturar/route.ts:260` sigue llamando `telefonoJefeDe`, que resuelve con `ORDEN_AVISO = ['encargado','flota_admin']` (`contactos.ts:97`). `telefonoParaDineroDe` (`contactos.ts:122`) sigue teniendo **un solo** consumidor: `avisar_cierre.ts:106`. |
| AGEN-C3-4 | **[MEDIO]** La cobranza le dice «llevas N días sin mandarme comprobantes» a quien sí los mandó | **REINCIDENTE** | `cobranza.ts:112-131` (`colaCobranza`) sigue sin mirar `gasto`; el texto de `cobranza_pura.ts:112` es literalmente el mismo. |
| AGEN-C3-5 | **[MEDIO]** «No había tiempo» consume uno de los cinco intentos | **PARCIAL → ver AGEN-C4-3** | Se cerró **la mitad**: `drenado.ts:97-106` llama `devolverIntentoPendiente` para `sin_tiempo`. El webhook (`webhook/whatsapp/route.ts:301-303`) **no lo hace**, y `en_curso` sigue consumiendo en los dos. |
| AGEN-C3-6 | **[BAJO]** `reengancharPendiente` sin call site | **REINCIDENTE** | `grep -rn reengancharPendiente src/ \| grep -v test` → 5 líneas, todas dentro de `despacho_wa.ts` (:228, :238, :362) y `asignar_wa.ts` (:298, :359). Los llamadores (`processor.ts:563`, `:579`) siguen pasando tres argumentos. |
| AGEN-C3-7 | **[BAJO]** El techo de dinero del runner se lee con `.limit(1000)` | **REINCIDENTE** | `runner.ts:62-73`: `gastoDelDiaUsd` sigue con `.limit(1000)` crudo en vez de `traerTodo()`. |

**Cuenta:** 0 cerrados por completo · 1 parcial (AGEN-C3-5) · 13 reincidentes.
Cinco de los reincidentes viven detrás de `FACTURACION_PILOTO`, hoy apagada.

---

## Hallazgos

### [ALTO · REINCIDENTE] AGEN-C4-1 — La libreta de la ráfaga muere con la invocación que no cierra la barrera: el chofer nunca se entera de las fotos que fallaron, y el resumen que sí sale dice «Ya revisé tus fotos»
`src/lib/likida/intake/rafaga.ts:99, 159-163` · `src/lib/likida/processor.ts:1869, 1895-1899, 1937-1953` · `vercel.json:6-8`

La libreta de incidencias (`fallo_tecnico`, `ilegible`, `fecha_dudosa`) vive en
un `Map` de módulo (`rafaga.ts:99`) y su ÚNICO lector es `cerrarRafaga`
(`:159`), llamado en un solo sitio: `processor.ts:1899`, y sólo cuando
`ultima === true`, o sea cuando el `-1` de ESA foto vio el contador en 0
(`:1869`, `:1895`). La invocación que no lo ve **no dice nada y su libreta se va
con el proceso**.

Escenario, con valores. Javier (chofer) manda 22 fotos en un POST a las 10:14:30.
El webhook las persiste (`route.ts:220`) y arranca `after()` con
`MAX_EN_PARALELO = 5`. A las 10:15:00 —treinta segundos después, porque el cron
es `* * * * *` desde `327a044`— corre `wa-pendientes`: `pendientesPorDrenar(40)`
devuelve las filas todavía **sin sellar** (`wa_pendientes.ts:120-127`: el filtro
es `procesado_en is null` + `intentos < 5`), entre ellas las 5 que el webhook aún
no ha reclamado. El cron las reclama y las procesa **en su propia invocación**.

- Foto 17 (invocación del webhook, OCR ilegible): `anotarIncidencia(v1, {tipo:'ilegible'})` en el `Map` **W**. Su `-1` devuelve `2` (el cron tiene dos en vuelo) → `ultima = false` → `rafaga = null` → **silencio**. El `Map` W queda con 3 incidencias que nadie leerá.
- Foto 22 (invocación del cron): su `-1` devuelve `0` → `ultima = true` → `cerrarRafaga(v1)` lee el `Map` **C**, que sólo tiene lo suyo: `vistas = 5`. `huboRafaga` es `true` porque `incrementado > 1` (`:1905`). Sale el resumen de `:1951`:

  > 📸 Ya revisé tus fotos. En este viaje llevo **19 comprobantes** por **$24,180.00** … Si te falta alguno, mándalo otra vez. Cuando termines, escribe *listo*. 👍

Ni una palabra de las 3 que no se pudieron leer, ni el «Reenvíamelas con buena
luz» que `lineaIncidencias` (`rafaga.ts:192-241`) existe para producir. Y si esas
3 hubieran caído del lado del cron, el encabezado habría dicho «De tus **5**
fotos» (`rafaga.ts:223`, `vistas` es por invocación) sobre un fajo de 22 — un
rótulo que no es verdad.

Consecuencia. El chofer se baja del camión creyendo que sus 22 comprobantes
están dentro. Escribe *listo*; la liquidación cierra con 19 y los $4,200 de
diésel de las tres ilegibles quedan como anticipo en su contra, irreversible por
los triggers 0036/0037. El único rastro es un `logger.info('foto.resumen_rafaga')`
que reporta `vistas: 5`.

Causa raíz probable: la libreta es memoria de proceso y su justificación escrita
(`rafaga.ts:19-27`) descansa en «la ráfaga repartida entre dos invocaciones hoy
no ocurre»; el drenado nuevo y la cadencia de un minuto la volvieron rutina, y el
modo de falla que ese comentario declara benigno («cada invocación resume LO
SUYO, dos mensajes en vez de uno») no es el real: la invocación que no cierra
**no manda nada**.

---

### [ALTO] AGEN-C4-2 — Con el LLM caído a mitad del cierre, el chofer recibe el cuadre neutro de un viaje que YA quedó liquidado
`src/lib/likida/processor.ts:2691, 2710-2711, 2739, 2758-2765` · `src/lib/likida/cuadre/resumen.ts:55` · `src/lib/llm/openrouter.ts:952-954, 152-181`

`9ef9690` (RES-15) hizo que un fallo transitorio del proveedor deje de decir
«¿me reenvías tu último mensaje?» y conteste el cuadre real. El problema es
**dónde** quedó puesto: dentro del `else` que se ejecuta cuando NO se recupera el
cierre parcial, y ese `else` se alcanza con la liquidación ya escrita.

Camino exacto: `generateWithTools` envuelve cualquier fallo posterior en
`PartialExecutionError` conservando `partialToolCalls`
(`openrouter.ts:952-954`). `processor.ts:2691` lee
`LIKIDA_RECUPERAR_CIERRE_PARCIAL`, que **por default está apagada**
(`.env.example:81` la recomienda en `1`; `docs/conocimiento/51-boletin-tecnico.md`
la lista como pendiente #32). Con la bandera apagada, `cierreParcial` es
`undefined` (`:2710-2711`) **aunque `partialToolCalls` traiga un
`guardar_liquidacion` sin error**, y se cae al `else` de `:2738`.

Escenario, con valores. 14:02 el chofer escribe «listo» sobre V-2026-0847 (14
comprobantes, $18,430). El agente llama `cuadrar_viaje`, luego
`guardar_liquidacion`: el viaje pasa a `liquidado`, se escribe la fila de
`liquidacion` y los dos PDF suben a Storage. En la ronda siguiente OpenRouter
tarda y el `timeoutMs: reloj.acotar(40_000)` (`:2645`) aborta. Sube un
`PartialExecutionError` cuyo `message` es «Request timed out» →
`isTransientError` casa por `/timeout|timed out/` (`openrouter.ts:179`) →
`transitorio = true` → `:2763`:

```ts
reply = resumenCuadre(await cuadrarDesdeDB(op.tenantId, viajeId), false, 'operador');
```

`cerrado = false` produce el encabezado **«Este es el cuadre de tu viaje 👇»**
(`resumen.ts:55`). `closed` sigue `false`, así que el bloque `if (closed)` de
`:2905` —el que manda el PDF al operador y llama `avisarCierreAlJefe`— **no
corre**.

Consecuencia. La base dice `viaje.estatus = 'liquidado'` y el chofer lee un
mensaje que le dice, con las tres cifras completas y en tono normal, que ese es
su cuadre y no que cerró. Sigue mandando tickets: el trigger
`trg_gasto_no_tras_liquidar` (0036) los rechaza. El contralor no recibe ni texto
ni PDF. Antes de `9ef9690` este mismo camino contestaba «se me trabó el sistema
tantito» — feo, pero era una señal; ahora es una afirmación limpia y falsa. La
prueba `processor_llm_caido.test.ts:190` fija exactamente lo contrario («y NO lo
da por cerrado»), y ninguna de sus cinco pruebas monta un `PartialExecutionError`
con `guardar_liquidacion` dentro: todas rechazan con un `Error` pelón
(`:180`, `:196`, `:202`, `:211`).

Causa raíz probable: el degradado se colgó del `else` del cierre parcial en vez
de mirar `partialToolCalls` antes de decidir el texto; el `cerrado: false` que el
commit defiende con razón para el caso normal es una mentira cuando el cierre ya
ocurrió.

---

### [ALTO] AGEN-C4-3 — La bandeja durable gasta intentos en mensajes que nunca se intentaron, y con el cron cada minuto eso convierte un mensaje vivo en carta muerta
`src/app/api/cron/wa-pendientes/drenado.ts:37-39, 91-108` · `src/app/api/webhook/whatsapp/route.ts:55-57, 297-306` · `src/lib/likida/wa_pendientes.ts:23-25, 120-127, 144-155, 199-208` · `src/lib/likida/processor.ts:704-706` · `src/lib/likida/conv.ts:389, 441-455`

ESC-1 arregló medio problema. `drenado.ts:97-106` devuelve el intento cuando
`processInbound` contesta `sin_tiempo`, con el argumento correcto: *«el mensaje
ni se miró»*. Ese argumento vale idéntico para `en_curso` —`processor.ts:704-706`
devuelve `'en_curso'` **antes** de `procesarTurno`, sin tocar nada— y sin embargo
`en_curso` cae en el `anotarFalloPendiente` de `:107` con el intento consumido,
bajo un comentario que afirma lo contrario: *«El resto de los pospuestos SÍ
consumen: ahí el motor trabajó»* (`:101`). Y en el webhook (`route.ts:301-303`)
**ni siquiera `sin_tiempo`** devuelve el intento: `route_pospuesto.test.ts:81`
fija esa conducta para los tres estados.

Por qué ahora importa. `pendientesPorDrenar` (`wa_pendientes.ts:120-127`) filtra
`procesado_en is null` + `intentos < 5`: una fila **en vuelo** —reclamada por otra
invocación pero todavía sin sellar— sigue saliendo en la consulta, y
`reclamarPendiente(id, intentosLeidos)` (`:144-155`) la reclama porque su
`.eq('intentos', …)` casa con el valor recién leído.

Escenario, con valores. 10:00:00 — el chofer manda 12 fotos. El webhook reclama
las 5 primeras (intentos 0→1) y las procesa (visión, ~15 s cada una).
10:00:30 — el cron (`* * * * *`) lee las 12; las 5 en vuelo salen con
`intentos = 1`. Las reclama (1→2) → `claimMessage` choca con la 23505 →
`retomarClaimHuerfano` (`conv.ts:441-455`) ve el `created_at` fresco
(`LEASE_CLAIM_MS = 150 s`, `conv.ts:389`) → `'en_curso'` → `anotarFalloPendiente`.
10:01:30, 10:02:30 — dos vueltas más: `intentos = 4`. Entretanto Vercel mata la
invocación del webhook en su `maxDuration` de 120 s con dos fotos a medias: esas
filas se quedan **sin sellar**. 10:03:30 — el cron las reclama otra vez, el claim
de `wa_mensaje_procesado` todavía no cumple los 150 s del lease → `'en_curso'` →
`intentos = 5`. A partir de aquí `pendientesPorDrenar` **ya no las ve** y
`cartasMuertas()` (`:199-208`) las cuenta.

Dos consecuencias, las dos malas:

1. **La foto no se procesa nunca.** El chofer mandó un ticket de diésel, el
   webhook dijo 200, y nada volverá a tomarlo. Lo único que Javier recibe es el
   correo agregado «N mensaje(s) de WhatsApp agotaron sus reintentos»
   (`drenado.ts:136-137`), sin flota ni viaje: `wa_evento_pendiente` no tiene
   `tenant_id`.
2. **Falsa alarma mientras tanto.** `cartasMuertas()` corre al final de CADA
   vuelta y cuenta `procesado_en is null AND intentos >= 5`: una fila que va a
   sellarse bien en cinco segundos dispara `logger.error` + `alertarOperador`
   (con piso de una hora, `observability/alerta.ts:41`). El canal que avisa de pérdidas reales
   se llena de pérdidas que no ocurrieron.

El comentario de `MAX_INTENTOS_PENDIENTE` (`wa_pendientes.ts:23-25`) todavía dice
«5 corridas del cron son ~25 min de reintentos», y el de `LEASE_CLAIM_MS`
(`conv.ts:387-388`) dice «el cron drena cada 5 min»: los dos se escribieron
contra `*/5 * * * *` y nadie los revisó al pasar a un minuto. Hoy los cinco
intentos son cinco minutos, y con el auto-reencolado de QStash
(`drenado.ts:127-129`, hasta 20 vueltas encadenadas por minuto) pueden ser
segundos.

Causa raíz probable: `intentos` mezcla dos hechos —«cuántas veces reventó» y
«cuántas veces alguien lo miró»— y el arreglo de ESC-1 separó sólo uno de los
tres estados y sólo en uno de los dos llamadores.

---

### [ALTO] AGEN-C4-4 — `pidioCerrar` abre la única acción irreversible del sistema sobre frases que dicen exactamente lo contrario
`src/lib/likida/processor.ts:482-486` · `src/lib/likida/tools.ts:234-241` · `src/lib/likida/tools_cierre_pedido.test.ts:114-119`

DAT-22 (`968ba9d`) puso el candado en el sitio correcto —la tool, no el prompt—
y su razonamiento es el bueno: *«lo que hay que acotar es el modelo, así que la
condición no puede depender de que él la respete»*. Pero la condición es un
`RegExp` **sin anclar** cuyo grupo decisivo tiene el calificador opcional:

```
(no|sin)\s+(traigo|tengo|me\s+falta|falta)\s*(m[áa]s|nada|otro|ninguno)?
```

El `?` final convierte «no traigo **más**» (la intención declarada) en «no
traigo» a secas. Ejecutado sobre el árbol de hoy:

| Texto del chofer | `pidioCerrar` |
|---|---|
| `no traigo el de casetas` | **true** |
| `no tengo señal` | **true** |
| `se me acabó la gasolina` | **true** (`acab[éeoó]`) |
| `¿ya está lista mi liquidación?` | **true** |
| `cuádrame lo que llevo` | **true** |
| `no me cuadra el anticipo` | **true** |

Los tres primeros son mensajes que un chofer manda **en medio** del viaje, y los
dos primeros significan literalmente que le faltan comprobantes. El commit
afirma que la función «deja fuera todo lo demás: una consulta, un saludo, el
caption de una foto, un hito»; no es cierto, y la prueba que lo respalda
(`tools_cierre_pedido.test.ts:114-119`) sólo comprueba seis frases limpias
(`'¿cuánto llevo?'`, `'hola'`, `'ya llegué'`, `'se me ponchó una llanta'`,
`'ok'`, `'gracias'`).

Escenario, con valores. V-2026-0912, 9 comprobantes por $11,340, anticipo
$15,000. El chofer escribe **«no traigo el de casetas, ¿lo mando mañana?»**.
`pareceCierre` es `false`, así que el freno del cierre en ceros no aplica (y
tampoco aplicaría: hay comprobantes). `pidioCerrar` es `true`, así que
`guardar_liquidacion` **existe en ese turno** y el único guardarraíl que queda es
el prompt, que dice «si el operador ya confirmó que terminó, CIERRA en ese
turno». Si el modelo se adelanta —que es la premisa entera de DAT-22— el viaje
queda `liquidado` con los $3,660 de casetas en contra del chofer, irreversible
por los triggers 0036/0037.

Consecuencia. Es el mismo accidente que DAT-22 vino a cerrar, alcanzable ahora
por la puerta que DAT-22 abrió. Lo paga el chofer, en su bolsa, y lo ve el
contralor en un PDF con una diferencia que no corresponde al viaje.

Causa raíz probable: para no dejar atrapado a quien pide cerrar «con otras
palabras» se ensanchó el reconocedor hasta hacerlo un `test()` de subcadenas sin
ancla y con el calificador opcional; el `?` de `(m[áa]s|nada|otro|ninguno)?`
invierte el sentido de la única forma negativa de la lista.

---

### [ALTO] AGEN-C4-5 — Al liberar el sello por un rechazo de Meta, la escalación borra la prueba de que el chofer ya recibió el recordatorio, y se lo vuelve a mandar cada hora
`src/lib/likida/escalar_viaje.ts:338-351, 393-399, 546-560` · `src/lib/meta/client.ts:142-152` · `vercel.json:14-15`

RES-1 (`96aaa4b`) es correcto en lo suyo: un 429 de Meta no puede sellar
`escalado_en` para siempre. Pero el orden del loop es **1) recordarle al chofer,
2) avisarle al jefe**, y `liberarEscalacion` sólo se llama en el paso 2:

```ts
// :342  recordado = Boolean(await sendText(v.operadorTelefono, armarRecordatorioChofer(...)))
// :346  if (!recordado) await avisarAlChofer(v.tenantId, v.operadorId, v.id);
// …
// :395  const liberado = await liberarEscalacion(admin, v, ahoraIso);
```

Y `liberarEscalacion` (`:546-560`) no sólo pone `escalado_en = null`: además
escribe `avisos_enviados: v.avisosEnviados`, o sea **deshace** el `+1` que
`reclamarEscalacion` había puesto (`:572`). Después de liberar no queda en la
base ni una columna que diga que ese recordatorio salió.

Escenario, con valores. Flota Transportes del Bajío. V-2026-0733 lleva 5 h
asignado sin aceptar. La plantilla `recordatorio_cierre` está **pausada por
calidad** — código 132015, que `CODIGOS_META_REINTENTABLES`
(`meta/client.ts:142-143`) clasifica como reintentable, y las pausas de Meta duran
horas.

- 09:00 — claim ganado. El chofer Pedro recibe: *«Te recuerdo tu viaje V-2026-0733: lo tienes asignado desde hace 5 horas y todavía no me confirmas si lo arrancas 🚛»*. Al jefe: `enviarTexto` rebota (ventana de 24 h cerrada, 131047) → `sendTemplate` rebota con 132015 → **reintentable** → `liberarEscalacion` → `escalado_en = null`, `avisos_enviados` restaurado.
- 10:00 — el cron (`0 * * * *`) vuelve a ver V-2026-0733 en `viajesSinAceptar` (el filtro es `escalado_en is null`, `:104`). Pedro recibe **el mismo texto, palabra por palabra**, incluido «desde hace 5 horas» cuando ya van seis.
- 11:00, 12:00, … lo mismo, hasta que Meta despause la plantilla.

El corte de `TOPE_RECHAZOS_META = 5` (`:187`) no lo evita: cuenta rechazos
**seguidos dentro de una corrida**, y con uno o dos viajes afectados nunca se
alcanza.

Consecuencia. Es el modo de falla que el encabezado del propio archivo declara
inaceptable —*«cada corrida le mandaría el mismo mensaje… y en dos días habría
aprendido a ignorar el canal»* (`:26-30`)—, sólo que le toca al chofer en vez de
al jefe. Y es el canal por el que después tiene que llegar su liquidación.

Causa raíz probable: `liberarEscalacion` se diseñó como un rollback del claim,
pero entre el claim y el punto donde se libera ya ocurrió un efecto externo no
idempotente; el rollback restaura el contador que era la única evidencia de ese
efecto.

---

### [ALTO] AGEN-C4-6 — Las flotas que el reloj global deja sin turno no se cuentan: la alarma de RES-6 no puede dispararse y el latido sale en verde
`src/lib/likida/agentes/cobranza.ts:451-455` vs `:472-477` · `src/app/api/cron/escalar/route.ts:184-207`

`ejecutarCobranzaGlobal` tiene dos formas de dejar flotas sin correr, y sólo una
se cuenta:

```ts
// :452  if (Date.now() >= venceEn) {
// :453    logger.warn('cobranza.global_corte_por_reloj', { tenantsSinCorrer: … });
// :454    break;                       // ← NADA se suma a total.cortadosPorReloj
// …
// :474    total.cortadosPorReloj += tenants.length - tenants.indexOf(t) - 1;   // rechazo masivo, veinte líneas abajo
```

La asimetría con la rama de `rechazoMasivo` —que sí lo suma, y está en el mismo
`for`— es lo que dice que es un olvido, no una decisión.

Escenario, con valores. 40 flotas con viajes abiertos. El cron arranca a las
11:00; `venceCobranza = inicio + 105 s` (`escalar/route.ts:103`). La escalación
gasta 20 s, así que a la cobranza le quedan 85 s. `venceFlota` es
`min(30 s, max(5 s, 85/40))` = 5 s por flota; cada una despacha su cola completa
en ~3 s, así que **ninguna** reporta `r.cortadosPorReloj > 0`. A los 85 s van 28
flotas; el `break` de `:454` deja **12 sin cobrar** y sólo escribe un
`logger.warn`. `total.cortadosPorReloj = 0` → `escalar/route.ts:184-185` calcula
`cortados = 0` → el bloque de la racha (`:187-201`) ni se entra → `registrarLatido('escalar', 'ok')` (`:207`).

Consecuencia. RES-6 existe para decir una cosa concreta —*«tres corridas seguidas
dejaron trabajo sin hacer: el trabajo ya no cabe en la cadencia»*— y su única
entrada es el contador que esta rama no toca. Doce flotas se quedan sin su
cobranza cada hora, `/api/health` las ve verdes, y el correo
`corte_por_reloj_repetido` no puede salir nunca por esta causa. `rotarPorHora`
(`:407-411`) evita que sean siempre las mismas doce, que es exactamente lo que
hace el síntoma invisible: nadie ve una flota muerta, se ven cuarenta flotas
atendidas a medias.

Causa raíz probable: `cortadosPorReloj` se pensó como «viajes que no alcanzaron
turno» dentro de una flota y se reusó como «trabajo que no cupo en la corrida»,
sin cubrir la unidad que el corte global deja fuera, que es la flota entera.

---

### [MEDIO] AGEN-C4-7 — El auto-reencolado se decide sobre lo que se LEYÓ, no sobre lo que se pudo tomar
`src/app/api/cron/wa-pendientes/drenado.ts:68-69, 127-129` · `src/lib/likida/wa_pendientes.ts:120-127`

`tomados = lote.length` sale de `pendientesPorDrenar`, que lee filas
`procesado_en is null` — incluidas las que **otra cadena ya tiene en vuelo**. La
condición de reencolar es `tomados >= LOTE`, así que una vuelta que no consiguió
reclamar ni una sola fila encola igual la siguiente.

Escenario, con valores. 120 mensajes pendientes. 11:00:00 el cron arranca la
cadena A; su vuelta 1 reclama las 40 más viejas y las procesa (~90 s).
11:01:00 el cron arranca la cadena B: `pendientesPorDrenar(40)` devuelve **las
mismas 40** (siguen sin sellar), B reclama las que puede —las que A todavía no
alcanzó— y devuelve `en_curso` en las demás; `tomados = 40` → encola su vuelta 2,
que vuelve a leer la cabeza de la cola. B recorre sus 20 vueltas
(`MAX_VUELTAS_QSTASH`) sobre el mismo tramo, gastando 20 mensajes de QStash y 20
invocaciones de Vercel por minuto de pico, y quemando de paso los intentos de
AGEN-C4-3.

Consecuencia. El caudal prometido por ESC-1 («40 × 20 = 800 mensajes en el mismo
minuto») supone que las cadenas concurrentes miran tramos distintos de la cola, y
todas ordenan por `recibido_en ascending` sin descontar lo reclamado: dos cadenas
no drenan el doble, se estorban. El costo (QStash + invocaciones) sí se
multiplica. Se degrada y se nota en la factura, no en el resultado.

Causa raíz probable: `pendientesPorDrenar` no tiene noción de «reclamado
recientemente» —el claim vive en `intentos`, que también es el contador de
fallos—, así que la señal de «queda trabajo» y la de «queda trabajo *para mí*»
son la misma.

---

## Lo que revisé y está bien

- **El mutex del cierre, entero.** `intentarLockViaje` (`conv.ts:638-690`)
  distingue los tres estados; el `rpcAusente` es el único fail-open y está
  argumentado (`:664-667`); el persistente devuelve `'indeterminado'` (`:681-683`)
  y `processor.ts:2516-2540` falla **cerrado**: avisa con el texto correcto para
  cada caso, suelta el claim y deja que la bandeja lo reintente.
  `TTL_LOCK_CIERRE_MS = PRESUPUESTO_WEBHOOK_MS` (`conv.ts:599`) es ≥ el trabajo
  que el `reloj` puede autorizar bajo él en cualquier punto de la invocación, así
  que la ventana «el lease vence a media faena» que DAT-21 vino a cerrar está
  cerrada de verdad.
- **DAT-22 está cableado donde dice.** `runAgent` tiene **un solo** call site en
  todo `src/` (`processor.ts:2630`), así que no hay una segunda entrada al agente
  que se salte `cierrePedidoPorTexto`; la tool lanza en vez de hacer no-op
  (`tools.ts:234-241`) y el error viaja al modelo. El defecto está en el
  reconocedor (AGEN-C4-4), no en el cableado.
- **La barrera de ráfaga SÍ avisa cuando vence.** Intenté levantar que
  `intakeOk` sólo se registraba en el log (`processor.ts:2472`) y me refuté:
  `:2893-2903` manda el aviso al operador, bifurcado por `closed`, con el conteo
  real de `getGastos`. El contrato del docstring de `esperarIntake`
  (`conv.ts:789`) se cumple.
- **El claim huérfano y su lease.** `retomarClaimHuerfano` (`conv.ts:425-455`) es
  un UPDATE anclado por `completado_en is null` + `created_at <`, atómico entre
  dos corridas, y la relectura distingue `duplicado` de `en_curso` en vez de
  adivinar. Un error de lectura devuelve `en_curso` (fail-closed), que es lo
  correcto.
- **`cola/route.ts` (la puerta nueva).** Verifica la firma de QStash antes de
  leer el cuerpo (`:34-45`), exige las dos llaves y contesta 503 sin ellas
  (`:29-32`), y repite el kill switch con 200 y no 5xx para no hacer que QStash
  insista sobre lo apagado (`:54-69`). `vuelta` viene del cuerpo **firmado**, así
  que `MAX_VUELTAS_QSTASH` no se puede forzar desde fuera.
- **El reparto del reloj del cron `escalar`.** `venceEscalacion` y
  `venceCobranza` se derivan de un solo `inicioCorrida` (`route.ts:101-103`) y
  los dos motores cortan **antes** del claim (`escalar_viaje.ts:296-303`,
  `cobranza.ts:274-277`): lo que no alcanzó queda intacto porque el sello es lo
  único que saca la fila de la consulta. El presupuesto por flota con piso de 5 s
  y techo de 30 s (`cobranza.ts:465`) más `rotarPorHora` (`:407-411`) cierran la
  inanición determinista que ESC-4 nombraba. Lo que falta es contarla
  (AGEN-C4-6), no evitarla.
- **El rescate de claims huérfanos de cobranza** (`cobranza.ts:236-247`): borra
  sólo `enviado=false ∧ detalle is null ∧ created_at < ahora-1h`, y las filas
  legítimas (sin teléfono, envío rechazado) siempre llevan `detalle`, así que no
  caen ahí.
- **El techo del webhook y la bandeja** (`route.ts:172-191`): `pendientesYaConocidos`
  falla **abierto al revés** (conjunto vacío → el límite se aplica a todos), que
  es la única dirección segura en un limitador, y está declarado así en
  `wa_pendientes.ts:87-90`.
- **La persistencia antes del acuse** (`route.ts:218-233`): el 503 cuando ni
  guardar se pudo sigue en pie, y `guardarEventosPendientes` es un solo upsert
  con `ignoreDuplicates` sobre la PK del wamid, con techo (`wa_pendientes.ts:54-56`).
- **`ResultadoInbound` sigue respetado por los dos llamadores.** Los tres estados
  que no sellan están enumerados en un solo sitio por llamador
  (`drenado.ts:37-39`, `route.ts:55-57`) y ninguno de los dos llama
  `marcarPendienteProcesado` sobre ellos. El defecto de AGEN-C4-3 es el
  **contador**, no el sellado.

## Lo que NO alcancé a revisar

- **`notificaciones.ts` completo (1,300 líneas).** Entré por `avisar`,
  `avisarCorridasPorFlota` y `repartoDe` desde la escalación y la cobranza; el
  anti-ruido (magnitud, incidente cerrado, `guardarMagnitud`) no lo recorrí con
  la pregunta de «si muere aquí».
- **`redactor.ts` y `estrategia.ts`.** Igual que en la c3: verifiqué el
  despachador (`runner.ts`), no el motor. Si `redactarCorreoFrio` muere después
  de gastar el modelo y antes de encolar la pieza, no comprobé qué queda en
  `agente_corrida`.
- **El piloto de visión con un navegador real.** Sin Chromium los cinco
  reincidentes de `piloto_vision.ts` se sostienen por lectura y como cota, no
  como medición. Siguen detrás de `FACTURACION_PILOTO`, apagada.
- **La frecuencia real de AGEN-C4-1 y AGEN-C4-3.** Ambos dependen de cómo Meta
  agrupa mensajes por POST y de cuánto tarda una foto en visión, y ninguna de las
  dos cosas se puede medir aquí (sin `.env`, sin base, sin red a proveedores).
  Los hallazgos se sostienen por el `if`, el `Map` y las consultas, que son
  deterministas por lectura; lo que no puedo dar es cada cuántos fajos ocurre.
- **`analytics.ts` y los RPC 0150–0154.** Fuera de mi rubro salvo por
  `traerTodo`, que sólo miré en `cobranza.ts` y `runner.ts`.
- **No hay base, ni render, ni `npm run build`.** Corrí el subconjunto de
  pruebas del rubro y está verde: 6 archivos, 64 pruebas
  (`cron/wa-pendientes/route`, `cron/wa-pendientes/cola/route`, `intake/rafaga`,
  `tools_cierre_pedido`, `cobranza_reloj`, `cobranza_reparto`).
