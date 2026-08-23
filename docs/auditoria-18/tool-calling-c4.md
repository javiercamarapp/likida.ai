# Tool calling — auditoría 18 · continuación 4

**Nota: 5/10** (antes 6). Razón del movimiento: **mirada más profunda** — el código
no empeoró, la nota anterior estaba inflada. Las tres pasadas anteriores auditaron
la *definición* de las tools (`properties: {}`, invariantes de schema) y el *ciclo*
(loop-guard, fallback, costo), y las dos mitades siguen sanas: los siete arreglos de
la ronda 18 aguantan, el delta **no agregó ni una tool** (31 registradas antes, 31
ahora) y ninguna nueva rompió la regla. Lo que nadie había auditado es la otra mitad
de la frontera —**lo que la tool le devuelve al modelo**— y ahí hay tres resultados
que le entregan al contralor un número que no es el que dicen ser. El rubro define
eso como suyo con esas palabras: *«un resultado de tool que vuelve al modelo con más
de lo que necesita… una respuesta truncada que se trata como completa»*.

**El riesgo mayor hoy:** `viajes_flota` y `liquidaciones_flota` rotulan `total` a lo
que en realidad es el tope de su propia consulta (100 y 50). Sobre el tenant del
demo —27,500 viajes y ~24,000 liquidaciones sembradas por `scripts/demo-5k.sql`— el
chat del panel le contesta al contralor **«total: 100»**, y la guardia de cifras no
puede tumbarlo porque el número lo devolvió una tool.

---

## Verificación de los abiertos de la c3

### A · Los 7 de la ronda 18 (c3 los dio por CERRADOS) — siguen cerrados

| # | Hallazgo | Estado | Evidencia (leída hoy) |
|---|---|---|---|
| 1 | el loop-guard mata la tool terminal | **CERRADO** | `openrouter.ts:880-885` filtra a terminales en `round === maxRounds-1` y solo tira `LoopGuardError` si no queda ninguna; `:937` marca `entregada`; `:947-949` corta el ciclo. |
| 2 | el costo de la 1ª vuelta se pierde si el reintento truena | **CERRADO** | `analista.ts:385-393`: el `.catch` suma `res.tokensIn/Out/cost` al `PartialExecutionError` y `unshift`ea sus toolCalls antes de relanzar. |
| 3 | el copiloto no contabiliza nada al tronar | **CERRADO** | `api/admin/copiloto/route.ts:266-270`: `copiloto.costo` con `modelo:'parcial'`, `fallo: true`. |
| 4 | `correr_runner` ejecuta un objetivo distinto al previsualizado | **CERRADO** | `copiloto-acciones.ts:152` (`objetivoDelRunner(params.id)`) y `:156-160`. Además el `argsHash` de `copiloto-intents.ts:60` ata `(accion, objetivo)` y `route.ts:156` lo recalcula: el objetivo confirmado es el ejecutado. |
| 5 | `finish_reason:'length'` con tool_calls se reporta como JSON inválido | **CERRADO** | `openrouter.ts:846-854` va **antes** del `if (!calls…)` de `:856`. |
| 6 | la caché de lectura no cubre las tools de los dos chats | **CERRADO** | `openrouter.ts:782-783` (`readOnlyTools`→`esLectura`), consumido en `analista.ts:334` y `copiloto.ts:213`. |
| 7 | `faseDeModelo` saca el gasto del chat de su propio tope | **CERRADO** | `costos.ts:113-116`: `if (base === 'cuadre' && …opus)`. |

### B · Los 11 de la c2 — `piloto_vision.ts` no cambió un byte

`git diff bf067d3..HEAD -- src/lib/likida/facturacion/adaptadores/` devuelve **cero
líneas**. Los ocho que viven en ese archivo son REINCIDENTES verificados por
relectura, no por ausencia de commit.

| Hallazgo (c2) | Estado | Evidencia |
|---|---|---|
| CRÍT — el piloto SÍ puede apretar un botón que emite en `ensayo` | **REINCIDENTE** | `piloto_vision.ts:254`: `if (a.esBotonQueEmite \|\| HUELE_A_EMITIR.test(boton?.texto ?? '') \|\| HUELE_A_EMITIR.test(a.selector))` — `modo` sigue sin aparecer; un botón que no case el regex se aprieta igual en ensayo (`:258`). |
| CRÍT — el piloto nunca levanta `emisionSinConfirmar` | **REINCIDENTE** | `piloto_vision.ts:195-203`: el `return` de éxito solo trae `modo/ok/capturado/captura`. Ver hallazgo 6, abajo: RES-10 acaba de apoyarse en esa bandera. |
| ALTO — catorce llamadas de visión por ticket y cero filas de costo | **REINCIDENTE** | sin cambios; `registrarCosto` sigue sin llamador en `facturacion/`. |
| ALTO — ninguna llamada de visión trae `signal` | **REINCIDENTE** | sin cambios. |
| ALTO — la regla 3 no comprueba en qué campo cae la contraseña | **REINCIDENTE** | `piloto_vision.ts:266-277`: `resolverValor` sustituye el marcador sin mirar el `tipo` del campo destino. |
| MEDIO — el loop-guard del piloto recuerda UNA acción | **REINCIDENTE** | `piloto_vision.ts:169-173` (`firma === anterior`). |
| MEDIO — `ok` significa «escribió al menos un campo» | **REINCIDENTE** | `piloto_vision.ts:194-202` (`ok: llenoAlgo`). |
| MEDIO — el respaldo del rol `piloto` puede no ver imágenes | **REINCIDENTE** | `openrouter.ts:91`: `'anthropic/claude-sonnet-5': 'openai/gpt-5.6-terra'`. |
| MEDIO — el redactor de prospectos: «solo las canónicas» sin control de salida | **REINCIDENTE** | `api/admin/mapa-prospectos/mensaje/route.ts:31-35` (`Salida` mide longitud) y `:41` (la regla, solo en el prompt). Archivo sin cambios en el delta. |
| BAJO — el costo del redactor solo se registra en el camino feliz | **REINCIDENTE** | mismo archivo `:114` (`throw` si falla la escritura) antes del `logger.info` de `:115`; el `catch` de `:126-129` no lee `usage`. |
| BAJO — `selectorDelInventario` valida por subcadena | **REINCIDENTE** | `piloto_vision.ts:282-288` (`selector.includes(s)`). |

### C · Los 8 de la c3 — `computer_use.ts` tampoco cambió

| Hallazgo (c3) | Estado | Evidencia |
|---|---|---|
| ALTO — tres caminos donde el `emitir` apretado vuelve sin bandera y el ticket regresa a la cola | **REINCIDENTE y AGRAVADO** | ver hallazgo 6: `al_vuelo.ts:701-709` sigue mirando solo captcha/`emisionSinConfirmar`, y `vercel.json:19` bajó el cron de `0 * * * *` a `*/15 * * * *`. |
| ALTO — el UUID cosechado del texto también sale en `ensayo` | **REINCIDENTE** | `computer_use.ts:286`, `:307` sin cambios. |
| ALTO — la regla `properties: {}` rota: cinco tools con `selector` libre | **REINCIDENTE, ampliado** | ver hallazgo 4. |
| ALTO — `emitir` fuera de la rejilla de idempotencia | **REINCIDENTE** | `computer_use.ts:265` sigue pasando su propio executor; `tool-executor.ts:174` solo mira `REGISTRY`. |
| MEDIO — `PROHIBIDOS` mira el selector y no la etiqueta | **REINCIDENTE** | `computer_use.ts:71`, `:218`. |
| MEDIO — las acciones de una ronda corren en `Promise.all` sobre la misma pestaña | **REINCIDENTE** | `openrouter.ts:891` sigue siendo `await Promise.all(llamadas.map(…))`. |
| MEDIO — el tope de la sonda cuenta como suyo el OCR de WhatsApp sin viaje | **REINCIDENTE** | `ingesta/tope.ts:40` (`.eq('fase','ocr').is('viaje_id', null)`) y su comentario de `:8-9` («el OCR real de WhatsApp, que siempre lleva viaje») contra `processor.ts:1022`: `registrarCosto({ tenantId, viajeId: null, fase: 'ocr', … })`. La afirmación del comentario sigue siendo falsa. |
| MEDIO — `seleccionar` deja que el modelo elija el valor | **REINCIDENTE** | `computer_use.ts:204-206`. |
| BAJO — `computer_use` no deja una fila de costo | **REINCIDENTE** | `computer_use.ts:289-292`. |

**Mitigantes que hay que decir en voz alta y que verifiqué hoy:**
`AdaptadorComputerUse` **sigue sin call site** (`rg` sobre `src/` da tres resultados,
los tres dentro del propio archivo). `crearPilotoVision` sí está cableado
(`registro.ts:253`) pero detrás de `FACTURACION_PILOTO === 'si'` (`registro.ts:180`),
apagada, y `modoEfectivo` (`modo.ts:70-82`) degrada `emitir`→`ensayo` sin
`FACTURACION_MANDATO_ACEPTADO`.

---

## Hallazgos

### [ALTO] `viajes_flota` y `liquidaciones_flota` llaman `total` al tope de su propia consulta — y 100 y 50 son justo los dos números que la guardia de cifras no puede juzgar

`src/lib/agents/chat-tools.ts:136` · `:157` ·
`src/lib/likida/analytics.ts:994` (`limite = 100`) · `:1980` (`.limit(50)`) ·
`src/lib/agents/analista.ts:142` (`BLANCOS`) · `:413-423` (la red final)

**Escenario, con valores.** Tenant del demo, «Transportes Peninsulares»
(`scripts/demo-5k.sql:4`: ~27,500 viajes, ~90,000 gastos, ~24,000 liquidaciones en
30 días). El contralor abre «Pregunta a tus datos» y escribe *«¿cuántos viajes llevo
este mes?»*. El modelo llama `viajes_flota`. El handler hace:

```ts
const vs = await getViajes(ctx.tenantId);                        // .limit(100)
return { total: vs.length, mostrando: Math.min(vs.length, 25), … } // total = 100
```

`getViajes` es `.order('created_at', desc).limit(100)` (`analytics.ts:1000-1001`), o
sea que `vs.length` **satura en 100** y jamás vuelve a moverse. La descripción de la
tool (`chat-tools.ts:129`) le avisa al modelo del recorte de *25* —el de la lista— y
no del de 100, que es el que contamina el campo llamado `total`. Lo mismo en
`liquidaciones_flota`: `getLiquidaciones` trae `.limit(50)` (`analytics.ts:1980`) y
la tool devuelve `total: 50` sobre 24,000.

La guardia de cifras del analista no lo puede atrapar por dos razones independientes:
(a) 100 y 50 **vienen de una tool**, así que están en `respaldo` por construcción; y
(b) aunque no vinieran, `BLANCOS` (`analista.ts:142`) contiene explícitamente `50` y
`100`. Y la red determinística de último recurso (`analista.ts:413-423`) toma
`Object.entries(primera.result)` filtrado a `number|string` y lo pinta como tabla
bajo el texto **«esto es exactamente lo que el sistema leyó»** — para `viajes_flota`
eso son literalmente las filas `total | 100`, `mostrando | 25`, `moneda | MXN`.

**Consecuencia.** El comprador ve una cifra de su propia operación que es falsa por
un factor de 275, con el rótulo «total», en la pantalla que se vende como «pregúntale
a tus datos». Es la regla que define al producto —*nunca inventar una cifra*— rota
por un nombre de campo. Y no es una limitación inherente: el conteo real existe y
está a una tool de distancia (`getKpis` → `kpis_liquidacion_tenant`, un agregado en
SQL, `analytics.ts:216-242`).

**Causa raíz probable.** El handler reusa la función que alimenta una **tabla
paginada** del panel (donde 100 filas es el diseño) y bautiza `total` a
`array.length`; nadie distinguió «cuántas traje» de «cuántas hay».

---

### [ALTO] Tras el rebote CU003, la segunda impresión puede fallar en silencio y el cierre archiva —y manda por WhatsApp— el PDF de la fotografía vieja

`src/lib/likida/tools.ts:322-323` (`pdfPath`/`pdfOperadorPath` declarados una vez) ·
`:329-362` (`generarPdfs`, con su `catch` que solo loguea) · `:363` ·
`:380-389` (el reintento) · `:399` · `:415` · `:424` ·
`src/lib/likida/processor.ts:2914` · `:2930-2932` · `:2958`

**Escenario, con valores.** Viaje `v-1042`, anticipo $12,000.

1. `computeCuadre` #1 ve **5** comprobantes: `totalComprobado 9,340.00`,
   `diferencia 2,660.00`. `generarPdfs(liq#1)` sube los dos ejemplares →
   `pdfPath = "t/v-1042.pdf"`, `pdfOperadorPath = "t/v-1042-operador.pdf"`.
2. El chofer manda su sexta foto; las fotos no toman el mutex del viaje.
   `saveLiquidacion(…, 5)` rebota con **CU003** (`0158_integridad_fiscal.sql:186-192`).
   El candado funciona: hasta aquí todo correcto.
3. `tools.ts:386-387` vuelve a fotografiar (`liq#2`: 6 comprobantes,
   `totalComprobado 10,190.00`, `diferencia 1,810.00`) y llama `generarPdfs(liq#2)`.
   **Si esa segunda impresión sale por su `catch` de `:359`** —`generarLiquidacionPDF`
   revienta con el gasto nuevo, la instancia se queda sin memoria, la librería tropieza
   con un carácter del folio recién capturado— `pdfPath` y `pdfOperadorPath`
   **conservan el valor de la corrida #1**: son `let` del alcance exterior (`:322-323`)
   y solo se reasignan *dentro* del `try`, después del `await` que lanzó.
4. `saveLiquidacion(ctx.tenantId, liq#2, pdfPath, 6)` (`:388`) archiva la fila con
   `pdf_url = "t/v-1042.pdf"`, que es el PDF de **5 comprobantes y $9,340**.
   `registrarCorrida` sale con `estado: 'ok'` (`:399`, porque las dos rutas son
   truthy) y la tool devuelve `pdf_generado: true` (`:415`) y
   `pdf_contralor_generado: true` (`:424`).
5. `processor.ts:2914` lee ese `pdf_generado`, `:2932` arma la ruta
   `${tenantId}/${viajeId}-operador.pdf` **por derivación, sin volver a preguntar**, y
   `:2958` firma esa URL. El chofer recibe el PDF viejo.

**Consecuencia.** El papel dice $9,340 comprobados y $2,660 en contra del operador; la
fila liquidada dice $10,190 y $1,810. Es exactamente lo que la 0158 y el bloque de
comentario de `tools.ts:365-376` existen para impedir —*«el papel y la base nunca
vuelven a contar distinto»*— y el único camino donde vuelve a pasar es el que se
escribió para arreglarlo. Nadie se entera: el log solo tiene un `pdf.gen` suelto, y
`registrarCorrida` dice `ok`.

**Causa raíz probable.** `generarPdfs` comunica su resultado por **efecto lateral
sobre dos variables del alcance exterior** y traga su propio fallo; ejecutarla dos
veces convierte «no se pudo imprimir» en «se imprimió la vez pasada» sin que ninguna
de las dos ramas lo pueda distinguir.

---

### [ALTO] `motor_fiscal` entrega un desglose que no suma su propio total: `efectivo_no_elegible` es una causa viva que no está en `ORDEN`

`src/lib/likida/fiscal.ts:475-478` (`ORDEN`, siete causas) ·
`:319` y `:386-391` (la octava, `efectivo_no_elegible`, `gravedad: 'perdida'`) ·
`:450` (se emite) · `:483-487` (`causaDominante`) · `:541-545` · `:554-565`
(`porCausa = ORDEN.filter(…)`) · `src/lib/agents/chat-tools.ts:109-121` (la tool)

**Escenario, con valores.** Flota que declaró `dedicacionExclusivaCarga: false`
—transporta carga y también pasaje—, así que `opcionesDe` le pone
`elegible15: false` (`fiscal.ts:296-298`). Sus cargas de diésel pagadas en efectivo
caen en `push('efectivo_no_elegible')` (`fiscal.ts:450`), causa cuya gravedad es
`'perdida'` (`:387`). Supongamos $45,000 del ejercicio así.

- `resumirPerdidas` los cuenta: `causaDominante` recorre `ORDEN`, **no encuentra
  `efectivo_no_elegible` en la lista**, y cae al `return cs[0]` de `:487`; el mapa
  queda con esa clave y `montoPerdido += 45,000` (`:543`).
- Pero `porCausa` se arma como `ORDEN.filter((c) => porCausaMapa.has(c))` (`:554-555`),
  y `ORDEN` tiene siete entradas: `efos, cfdi_cancelado, efectivo_sobre_tope,
  efos_indeterminado, plazo_vencido, combustible_efectivo, sin_cfdi`. La octava **se
  cae del desglose**.
- La tool devuelve entonces `{ montoPerdido: 45000, montoEnRiesgo: 0,
  montoRecuperable: 0, porCausa: [] }`. Un total sin una sola causa que lo explique.

Hay un segundo efecto de la misma omisión, y es peor para el dinero: un comprobante
que traiga a la vez `sin_cfdi` **y** `efectivo_no_elegible` (`causasDe` empuja los dos,
`:434` y `:450`) recibe como dominante `sin_cfdi` —que sí está en `ORDEN`, al final—
cuya gravedad es `'recuperable'` (`:393`). Ese dinero se le reporta al contralor como
«deducción pendiente, la recuperas pidiendo la factura» cuando la ley dice que no es
deducible ni con CFDI (LISR 27-III, el texto del propio `:390`).

Ninguna prueba lo alcanza: las 40+ pruebas de `fiscal.test.ts` corren con
`elegible15: true` fijado en `OPTS` (`fiscal.test.ts:26-34`), y el comentario de
`:31-32` dice literalmente por qué («*sin esto, el efectivo en combustible cae a
efectivo_no_elegible*»).

**Consecuencia.** El chat del panel le afirma al contralor una pérdida fiscal de
$45,000 y no puede decir de qué; o —peor— le promete recuperable lo que ya se perdió.
La segunda mitad (la clasificación) es del rubro fiscal y ahí la dejo; lo que reporto
aquí es la primera: el resultado de tool es internamente contradictorio y el modelo
no tiene cómo saberlo.

**Causa raíz probable.** `ORDEN` es una lista literal paralela al tipo
`CausaPerdida`; se agregó una causa al tipo, a `TITULOS` y a `causasDe`, y la lista no
se movió — el compilador no puede avisar porque `CausaPerdida[]` acepta una lista
incompleta.

---

### [ALTO · REINCIDENTE, ampliado] La invariante de schemas es una prueba de UN módulo: cubre 10 de las 31 tools registradas

`src/lib/agents/chat-tools.test.ts:89-94` (`funciones()` recorre `TOOLS`, las 10 del
analista) · `:105-114` y `:116-123` (las dos invariantes) ·
`src/lib/agents/copiloto-tools.ts:207`, `:302`, `:328` ·
`src/lib/agents/copiloto.ts:62-63` ·
`src/lib/likida/facturacion/adaptadores/computer_use.ts:319-329`

**Lo que conté (el encargo explícito de la ronda).** `registerTool` aparece **31**
veces en `src/` fuera de pruebas: `tools.ts` 4, `chat-tools.ts` 10, `analista.ts` 1,
`copiloto-tools.ts` 14, `copiloto.ts` 2. Los mismos 31 que en `bf067d3`: **el delta no
agregó ni una tool, y ninguna existente cambió su schema.** Eso es lo bueno y hay que
decirlo.

Lo que no cambió es el alcance del candado. Las cuatro invariantes viven en
`chat-tools.test.ts` y solo recorren `funciones()`, o sea `TOOLS` = las diez del
analista. Fuera de su alcance quedan 21 tools vivas, de las cuales **tres declaran un
`string` sin `enum`** — exactamente lo que la prueba de `:110` hace fallar:

| tool | parámetro | dónde termina |
|---|---|---|
| `traza_corrida` | `id: {type:'string'}` (`copiloto-tools.ts:207`) | validado con regex de uuid antes de tocar la base (`:217`) — **cerrado** |
| `bitacora` | `filtro: {type:'string'}` (`:302`) | saneado a `[a-z0-9._:-]` en `admin/bitacora.ts:51`, con la razón escrita — **cerrado** |
| `ficha_cliente` | `nombre: {type:'string'}` (`:328`) | `.ilike('nombre', '%${q}%')` **sin sanear** (`:341`); `%` y `_` del modelo son comodines |
| `proponer_accion` | `objetivo: {type:'string'}` (`copiloto.ts:62`) | atado por `argsHash` + confirmación humana + allowlist `INTERRUPTORES` (`copiloto-acciones.ts:130`) — **cerrado** |

`copiloto-tools.test.ts` (el archivo que se llama «el contrato de las 14 tools del
copiloto») **no tiene una sola prueba de schema**: verifica rutas de pantalla,
ejecución y `pantalla`, nada más.

**Consecuencia.** Hoy el daño real es acotado —las cuatro superficies libres están
tapadas río abajo, y `computer_use` sigue sin call site—, y por eso lo que reporto es
el hueco estructural, que es el mismo que la c3 nombró: **la invariante es una prueba
de un módulo y no de la frontera**. La frontera es «todo schema que se le pase a
`generateWithTools`», y hay tres llamadores (`analista.ts:320`, `copiloto.ts:203`,
`run.ts:50`) de los cuales uno solo está cubierto. El siguiente adaptador nacerá igual
de fuera, como nació `computer_use` 24 horas después de que se levantara la regla.

---

### [MEDIO] `motor_fiscal` recorta `porCausa` a 6 de 8 sin decir que recortó — y sus dos tools hermanas sí lo dicen

`src/lib/agents/chat-tools.ts:119` · comparar con `:136` y `:157`
(`total` + `mostrando`) · `src/lib/agents/chat-tools.test.ts:199-200`

**Escenario, con valores.** Flota con las ocho causas presentes: `sin_cfdi` $120,000 ·
`plazo_vencido` $60,000 · `efectivo_sobre_tope` $30,000 · `cfdi_cancelado` $18,000 ·
`combustible_efectivo` $9,000 · `efos` $4,000 · `efos_indeterminado` $1,200 ·
`efectivo_no_elegible` $800. `porCausa` sale ordenado por monto descendente
(`fiscal.ts:565`) y la tool devuelve `r.porCausa.slice(0, 6)`: se van las dos últimas.
El resultado que lee el modelo trae `montoPerdido/EnRiesgo/Recuperable` calculados
sobre **las ocho** y un desglose de **seis** que no los suma, sin un `total`, sin un
`mostrando` y sin una nota. Sus dos hermanas en el mismo archivo sí declaran ambos
campos (`:136`, `:157`), así que no es un criterio del archivo: es un olvido de éste.

Lo que se pierde son siempre las causas de menor monto, y ahí es donde vive
`efos_indeterminado` — la señal 69-B que el contador tiene que ir a revisar a mano.

La prueba que existe fija el recorte y no la honestidad: `chat-tools.test.ts:199-200`
inyecta 12 causas y afirma `toHaveLength(6)`. Verde, y no comprueba que el modelo
pueda saber que se le escondieron seis.

**Consecuencia.** El modelo narra «tu desglose de pérdidas» sobre un desglose parcial
que él cree completo; la suma de la dona no cuadra con la cifra grande de arriba y el
contralor lo va a notar en la sala, que es el peor lugar para notarlo.

**Causa raíz probable.** El recorte se puso por costo de tokens (el encabezado del
archivo lo dice, `:11-13`) y en las dos tools de lista se acompañó del marcador; en
ésta no.

---

### [MEDIO · REINCIDENTE, agravado] RES-10 evita el CFDI duplicado solo si el adaptador levanta `emisionSinConfirmar` — y ninguno de los dos que existen lo levanta; el cron pasó de 60 a 15 minutos

`src/lib/likida/facturacion/al_vuelo.ts:279-286` (el `!r.ok` que **levanta** la marca) ·
`:701-709` (`motivoDeBloqueo`) · `:581-608` (el bloque RES-10 y su promesa) ·
`piloto_vision.ts:195-203` y `computer_use.ts:294-311` (los dos returns sin bandera) ·
`vercel.json:17-19`

**Qué cambió en el delta.** RES-10 marca `autofactura_bloqueada_en` **antes** de abrir
el portal en modo `emitir`, para que un proceso que muera a media sesión deje el
ticket fuera de la cola. Es el arreglo correcto para el modo de falla que ataca (la
función muere). Pero el camino de vuelta lo desarma: en `:279-286`,

```ts
if (!r.ok) {
  // "Un fallo LIMPIO (el portal no cargó, sin apretar emitir): la marca se
  //  levanta y el ticket vuelve a la cola. Si fue ambiguo, `motivoDeBloqueo`
  //  ya lo atrapó arriba y aquí no se llega."
  if (modo === 'emitir') await levantarEmisionEnCurso(admin, args.gastoId, args.tenantId);
```

Ese comentario **es la premisa del hallazgo ALTO de la c3, dada por cierta**.
`motivoDeBloqueo` (`:701-709`) sigue mirando exactamente dos cosas: `pideCaptcha(r)`
y `r.emisionSinConfirmar`. Los tres caminos ambiguos que la c3 documentó en
`computer_use` —el modelo se rinde tras apretar emitir, el loop-guard corta, el
`inventario()` posterior al clic revienta— llegan aquí con `ok:false` y **sin**
`emisionSinConfirmar`, porque ningún adaptador la pone nunca. O sea: `motivoDeBloqueo`
no los atrapó arriba, sí se llega, y la marca que RES-10 acababa de poner se levanta.

**Escenario, con valores.** `FACTURACION_PILOTO=si`, `FACTURACION_MODO=emitir` con
mandato aceptado, gasto `g-77` de $850 en un portal del catálogo. El agente aprieta un
botón que emite; el CFDI se timbra; el turno vuelve `ok:false` por cualquiera de los
tres caminos. `motivoDeBloqueo` → `null`; `levantarEmisionEnCurso` borra la marca;
`cfdi_uuid` sigue `null`. El ticket vuelve a la cola. **`vercel.json:19` ahora dice
`*/15 * * * *`**, no `0 * * * *`: son **4 intentos por hora, 96 al día**, contra los
24 que la c3 calculó. El propio comentario de `CLAIM_MINUTOS` (`al_vuelo.ts:722-730`)
reconoce que el claim de 10 min ya no es «mucho menor» que el periodo y se apoya en
la marca; y la marca, en este camino, no sobrevive.

**Consecuencia.** Hasta 96 CFDI del mismo consumo de $850 con el RFC de la flota en un
día. El contralor los cancela uno por uno, y los que caigan fuera de plazo se le
quedan en la contabilidad. Sigue como MEDIO/ALTO acotado y no CRÍTICO por dos
candados que verifiqué hoy y que hay que decir: `FACTURACION_PILOTO` está en `no`
(`registro.ts:180`) y `modoEfectivo` degrada `emitir`→`ensayo` sin
`FACTURACION_MANDATO_ACEPTADO` (`modo.ts:70-82`). El día que el doc del demo mande
encender la palanca, esto es CRÍTICO sin que nada más cambie.

**Causa raíz probable.** Un arreglo escrito contra el adaptador ideal: se apoya en una
bandera del contrato (`emisionSinConfirmar`) que ninguna de las dos implementaciones
existentes emite, y el comentario la da por puesta en vez de comprobarla.

---

## Lo que revisé y está bien

- **El `randomUUID` muerto de `tools.ts:9` no es el rastro de una ruta a medias.** Es
  residuo de **DAT-41**: `cerrarLiquidacion` dejó de inventar el id del papel y ahora
  usa `idLiquidacionDeViaje(ctx.viajeId!)` (`tools.ts:333`), gemelo exacto de
  `md5(viaje_id || ':liquidacion')::uuid` de la 0159 (`liquidacion/id.ts:29-32`,
  con el `toLowerCase()` explicado). El import quedó colgando y nada más. Lo confirmé
  con la compuerta: `npx eslint src/` da **0 errores y 24 warnings**, y `npm run lint`
  es `eslint src/` sin `--max-warnings`, así que esta clase de residuo no la frena
  nadie — pero no esconde código huérfano.
- **El delta no agregó ni una tool y no movió ni un schema.** 31 registradas hoy, 31 en
  `bf067d3`, mismo reparto por archivo. La regla `properties: {}` sigue intacta en las
  cuatro de WhatsApp (`tools.ts:35, 97, 140, 211`) y en `SIN_PARAMS`
  (`chat-tools.ts:26`).
- **La compuerta de tool-calling está verde y es real.** `npx vitest run src/lib/llm/
  src/lib/agents/` → 29 archivos, **192 pruebas**, todas pasando, incluidas las 11 del
  loop-guard y las de truncamiento.
- **El loop-guard corta ANTES de pagar la ronda.** `openrouter.ts:882-885` filtra sin
  haber tocado el `Promise.all` de `:891`: en la última vuelta ni las lecturas ni una
  eventual mutación llegan a correr. Y en la vuelta N+1 el usuario **sí recibe algo**:
  `LoopGuardError` sale envuelto en `PartialExecutionError`, `processor.ts:2740-2741`
  contesta *«se me trabó el sistema tantito»* y, si el fallo fue transitorio,
  `:2761-2764` degrada al cuadre determinístico con las cifras reales. Nunca silencio.
- **El truncamiento del modelo sí se declara.** `finish_reason:'length'` lanza
  `TruncatedError` con el tope, lo usado y el contenido parcial
  (`openrouter.ts:846-854`), y va antes de mirar `tool_calls`. Ningún resultado de
  tool se corta en `generateWithTools`: `:939` serializa `exec.result` entero. Los
  recortes que existen viven en los handlers, y ahí es donde encontré los dos de
  arriba; los demás **sí declaran el corte**: `viajes_flota`/`liquidaciones_flota` con
  `mostrando`, `duplicados_detectados` con `total: as.length` sobre una lectura no
  topada (`analytics.ts:376-392`), `bandeja` con `enCola: b.cola.length`
  (`copiloto-tools.ts:119-122`), `cobranza_saas` con `facturasPorCobrar`
  (`:271-272`). Y `serie_liquidado`'s `slice(0, 60)` **no puede recortar nunca**:
  `SEMANAS_POR_MODO.historico` es 52 (`analytics.ts:531`).
- **La rejilla de mutaciones sigue siendo correcta bajo el candado nuevo.** El `throw`
  de DAT-22 (`tools.ts:234-241`) devuelve `success:false`, y `makeExecutor` borra la
  llave (`tool-executor.ts:194`) comparando la promesa antes de borrar: un fallo no
  se queda cacheado y el reintento de otro llamador no se tira.
- **El candado DAT-22 no depende del modelo y no encierra al chofer.** La marca la
  calcula el servidor sobre el texto del turno (`processor.ts:2642`, `pidioCerrar`), el
  regex es deliberadamente más ancho que `pareceCierre` (`processor.ts:482-486`:
  cubre «mándame mi liquidación», «no traigo más», «es todo»), y la tool **lanza** en
  vez de devolver un no-op para que el modelo se lo explique al operador.
- **El `code` de Postgres sí sobrevive al reintento CU003.** `repo.ts:926-933` re-adjunta
  `e.code` al envolver, que es de lo que depende `conteoDeGastosCambio` (`:888-889`);
  sin eso el reintento entero sería código muerto. Está hecho a propósito y comentado.
- **La confirmación de acciones del copiloto no la decide el modelo.** `argsHash` de
  `(accion, objetivo)` (`copiloto-intents.ts:60`), un solo uso, TTL de 2 min, mismo
  actor, consumo atómico por `UPDATE … WHERE` (`:131-150`), y `ejecutarAccionCopiloto`
  revalida contra `INTERRUPTORES` (`copiloto-acciones.ts:130`). El bloque `accion` se
  arma del **catálogo**, no del modelo (`copiloto.ts:74-83`).
- **`exigirModo` es la decisión correcta y es nueva.** `chat-tools.ts:63-66`: un modo
  que `Promise.allSettled` dejó en `null` LANZA en el chat en vez de convertirse en
  «0 categorías». `null ≠ 0` sostenido en la frontera de la tool, con la razón escrita.
- **`maxRetries: 0` + `timeout` están donde dicen.** `openrouter.ts:32-47`, con el
  cálculo de las nueve peticiones anidadas escrito. `TIMEOUT_LLM_MS` es 30 s por env.

## Lo que NO alcancé a revisar

- **Si el segundo `generarPdfs` de verdad puede fallar en producción.** El hallazgo 2
  se sostiene por la lectura del alcance de las variables —que es firme— pero no medí
  con qué frecuencia `generarLiquidacionPDF` lanza sobre una fotografía con un gasto
  más. Sin base ni Storage aquí, el disparador es plausible, no medido.
- **Cuántas filas devuelve `getCostoPorFaseModelo` en una instalación real.**
  `copiloto-tools.ts:290` recorta a 20 sin declararlo, igual que `motor_fiscal`; con
  ~8 fases × N modelos podría pasarse. No lo levanté como hallazgo porque no pude
  acotar N y `metrica_negocio.costoIaUsd` da el total por otro lado.
- **El `.ilike` sin sanear de `ficha_cliente` (`copiloto-tools.ts:341`).** Construí el
  escenario y no me alcanzó para un daño concreto: es superadmin, cruzar tenants es el
  permiso de esa consola, y `%`/`_` amplían la búsqueda hacia el `desambiguar` en vez
  de hacia una flota equivocada. Queda anotado como la asimetría contra
  `admin/bitacora.ts:51`, que sí sanea y explica por qué.
- **Si `openai/gpt-5.6-terra` lee imágenes.** Tercera pasada consecutiva sin red; sigue
  decidiendo si el MEDIO reincidente del respaldo del rol `piloto` es «decide a
  ciegas» o «se cae limpio».
- **El tamaño real del prompt de `computer_use`** y **`valorActual` de un
  `input[type=password]`** en su `inventario()`. Igual que en la c3: sin call site no
  pude construir el escenario con valores.
- **La equivalencia JS-vs-RPC de las 0150/0152** para las funciones que alimentan estas
  tools. Verifiqué que `getViajes` y `getLiquidaciones` siguen siendo consultas
  directas topadas (no RPC), que es de donde sale el hallazgo 1; no audité las de
  espejo.
