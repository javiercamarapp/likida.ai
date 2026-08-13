# Arquitectura y mantenibilidad — auditoría 17 · pase 6 (13-ago-2026)

**Nota: 4/10** (antes 4). Razón del movimiento: **deuda que cobró factura**, y
en tiempo récord. El pase 5 pidió una fuente única para "qué ventana de tiempo
es cada modo"; el arreglo la creó (`src/app/dashboard/periodo.ts`, 23 líneas,
`ETIQUETA_MODO`). **Hoy ese archivo no tiene un solo importador de producción**
—el merge de la v3 se llevó a su único consumidor—, sus dos copias sobrevivieron
intactas, y el subsistema nuevo (`chat-tools.ts`) escribió una **cuarta**
definición de las mismas tres palabras que además **no corresponde a los datos
que rotula**. La nota no baja a 3 solo porque el CRÍTICO del pase 5 sí se cerró
de verdad y con link real (`resumen-visual.tsx:157`), y porque el tercer mapa de
etiquetas por fin quedó alineado.

Compuerta corrida hoy sobre `0fa27b0`: `npx tsc --noEmit -p .` → **0 errores**.
Las pruebas de guardarraíl de este rubro (`etiquetas_sincronizadas`,
`etiquetas_panel`, `rail_marca`, `expediente_alcanzable`, `src/lib/agents/`) →
**41 verdes, 1 roja**, y la roja es una de las 15 ya fichadas en `MAPA.md`
(`expediente_alcanzable.test.tsx:96`). **Ninguna de las verdes ve nada de lo de
abajo.**

**El riesgo mayor del rubro hoy:** la caja de chat del panel —la superficie
nueva que el demo va a enseñar— tiene **dos motores** para la misma pregunta y
**cuatro definiciones** de la misma ventana de tiempo, y ninguna de las dos
cosas produce un error: producen una cifra bien formateada bajo un rótulo falso.

---

## Recuento pedido: ¿subió o bajó el código sin llamador?

### Símbolos exportados sin un solo llamador — **84** (pase 5 declaró **43**)

El pase 5 escribió el criterio pero no lo automatizó, y su 43 fue una
verificación a mano de una muestra. Lo recontesté a máquina con **el mismo
criterio escrito** —se descarta la línea de la definición, los `*.test.*`, las
líneas de comentario **y el contenido de los literales de cadena** (para no
contar como "uso" un `'getValorAhorro/…'` dentro de un mensaje de error)—, y lo
corrí sobre los **dos** árboles para que el delta sea comparable:

```
$ python3 orph4.py                       # HEAD = 0fa27b0
TOTAL 84
$ git archive 65da222 src | tar -x -C p5/ && python3 orph4_p5.py   # cierre del pase 5
TOTAL 83
```

**Subió: 83 → 84.** El movimiento neto es chico porque son dos movimientos
opuestos:

* **Nacen 3 muertos**, los tres del borrado de la v3:
  `UltimasLiquidaciones` (`ultimas-liquidaciones.tsx:32`), `estaExpandido` y
  `marcaAsistente` (`rail-marca.ts:42,48`).
* **Reviven 2**: `crearViaje` (`operacion.ts`, lo despertó
  `dashboard/viajes/nuevo/forma-viaje.tsx`) y `DEGRADADO_MARCA`, que se borró.

La lectura honesta del número: **el 43 heredado no era medible**, y el número
real con ese criterio lleva dos pases estancado arriba de 80. Lo que sí cambió
es *cuáles*: `UltimasLiquidaciones` es el componente que el **propio arreglo del
pase 5** escribió para darle puerta al expediente, y la v3 lo sustituyó por
`TablaViajes` sin borrarlo.

### Módulos sin un solo importador de producción — **8** (pase 5: **4**)

Medido con un resolvedor de imports real (`@/`, relativos, `import()`),
excluyendo los ficheros de entrada de Next (`page`/`layout`/`route`/…):

| Líneas | Módulo | Por qué está huérfano |
|---:|---|---|
| 823 | `src/lib/likida/crear_viaje_wa.ts` | huérfano desde el pase 1 |
| 204 | `src/app/dashboard/confirmacion.ts` | su consumidor era `viajes/vista.tsx` (`2be4b1c`) |
| 163 | `src/lib/likida/facturacion/permiso_cre.ts` | **nuevo en el recuento**: solo lo lee `permiso_cre.test.ts` |
| 100 | `src/app/dashboard/ultimas-liquidaciones.tsx` | **nuevo**: lo sustituyó `TablaViajes` |
| 75 | `src/app/dashboard/cifra-grande.tsx` | su consumidor era `contador/deducciones` (`003c88a`) |
| 52 | `src/app/dashboard/rail-marca.ts` | **nuevo**: la v3 borró `rail.tsx` |
| 34 | `src/app/admin/ui/use-in-view.ts` | su consumidor era `cifra-grande.tsx` |
| 23 | `src/app/dashboard/periodo.ts` | **nuevo, y el que duele** — ver el ALTO 1 |

**1,474 líneas** sin un camino de ejecución. Cuatro de las ocho las dejó
huérfanas la v3, y una de esas cuatro es el arreglo del pase 5.

### CSS muerto que ningún recuento anterior miró

`src/app/globals.css:239-277` — 39 líneas: la transición de `.columna-centro` y
las dos reglas `:root[data-asistente="expandido"]`, con su comentario
"AUDITORÍA 17 (pase 5), ALTO" y su referencia a `ANCHO_MIN_ASISTENTE`.
`grep -rn "columna-centro\|data-asistente" src/` devuelve **solo `globals.css`**:
ningún elemento lleva esa clase y nada escribe esa marca desde que `rail.tsx`
se borró. Es la mitad CSS del mismo cadáver que `rail-marca.ts`.

---

## Hallazgos

### [CRÍTICO] Las tres ventanas de tiempo del chat mienten: el enum que lee el modelo dice "últimos 7 días / 30 / todo el histórico" y los datos que devuelve son de 35 / 91 / 364 días

`src/lib/agents/chat-tools.ts:28-35` (`PARAM_MODO`, la descripción está en
`:31`) contra `src/lib/likida/analytics.ts:421`
(`const SEMANAS_POR_MODO = { semanal: 5, mensual: 13, historico: 52 }`), con
`src/lib/agents/prompts.ts:50` como el amplificador.

Tres tools consumen ese enum y las tres van a `SEMANAS_POR_MODO`:

```
chat-tools.ts:31   modo: { enum: ['semanal','mensual','historico'],
                     description: 'Ventana: últimos 7 días, últimos 30, o todo el histórico.' }
chat-tools.ts:153  serie_gasto      → getGastoPorSemanaSeries(...)[modo]
chat-tools.ts:168  serie_liquidado  → getLiquidadoPorSemanaSeries(...)[modo]
chat-tools.ts:183  top_rutas        → getTopRutasPorGastoSeries(...)[modo]
```

Y lo que esas funciones traen de verdad (`analytics.ts:378-392`):
`getGastoPorSemana(tenantId, 5, hoy)` arma 5 cubetas ISO
(`ultimasSemanas`, `:351`) y consulta con
`desdeGlobal = hoy − (5×7 − 1) = hoy − 34 días`. O sea:

| `modo` | Lo que el modelo lee (`:31`) | Lo que la consulta trae |
|---|---|---|
| `semanal` | "últimos **7 días**" | **35 días** (5 semanas ISO) |
| `mensual` | "últimos **30**" | **91 días** (13 semanas) |
| `historico` | "**todo el histórico**" | **364 días** (52 semanas) |

**Escenario con valores.** Flota Transportes Innovativos, 3 años de captura:
$6.1M de gasto total, $2.4M en los últimos 12 meses, $290,000 en las últimas 5
semanas y $58,000 en los últimos 7 días de verdad. El contralor escribe en el
chat *"¿cuánto llevo gastando esta semana?"*. El modelo llama
`serie_gasto({modo:'semanal'})`, recibe 5 cubetas que suman **$290,000**, y
`prompts.ts:50` le **ordena** declarar la ventana — *"SIEMPRE declara la ventana
que usaste ('últimos 7 días', 'el ejercicio 2026'). Una cifra sin su 'cuándo' es
una cifra rota."*—. El único vocabulario de ventana que tiene es el de `:31`.
Sale: **"En los últimos 7 días llevas $290,000 de gasto"**, cinco veces el
número real. Segundo turno: *"dame mi gasto histórico"* → `modo:'historico'` →
**$2.4M** rotulado **"todo el histórico"**, cuando el histórico son $6.1M.

**Por qué ningún guardarraíl lo ve, y por qué esto es de arquitectura.** La
guardia de cifras (`analista.ts:168 cifrasRespaldadas`) verifica que **el número**
venga de una tool. $290,000 *viene* de una tool: pasa verde. Lo que está mal no
es la cifra, es el **rótulo**, y el rótulo lo produce una segunda definición del
mismo concepto viviendo en otro archivo. Es exactamente la clase de este rubro,
con la agravante de que el consumidor de la definición divergida es un LLM: no
hay tipo, no hay import, no hay prueba posible sobre esa frontera hoy.

**Consecuencia.** El contralor cruza esa cifra contra su contabilidad y no
cuadra por un factor de 5. Es el argumento de venta del producto —"nunca
inventar una cifra", "un rótulo tiene que ser verdad"— roto en la pantalla nueva,
y roto de la forma que más caro cuesta: el número es real, así que nadie duda de
él hasta que el contador lo pide desglosado.

**Causa raíz probable.** `SEMANAS_POR_MODO` nunca fue "7/30/todo": es un mapeo
de *semanas ISO* documentado como tal en `analytics.ts:416-420`. La descripción
del enum se escribió copiando el vocabulario de las tarjetas de KPI
(`kpi-periodo.tsx:14-18`), que sí son 7/30 días porque las alimenta
`getSeriesKpiCards` (`analytics.ts:175-177`, `getSerieComparativa(…,7,…)`). Dos
fuentes de datos distintas debajo de las mismas tres palabras.

---

### [CRÍTICO] La misma pregunta tiene dos motores en la misma caja: el paracaídas del chat contesta los acreditables SIN filtro de tiempo y los rotula "este periodo"

`src/app/dashboard/chat.tsx:384` y `:387` (`responder(q, kpis, acred)`) ·
`src/app/dashboard/chat/page.tsx:33` (`getAcreditables(tenantId)`, **sin
segundo argumento**) contra `src/lib/agents/chat-tools.ts:67-75`
(`getAcreditables(ctx.tenantId, dias)`), con
`src/lib/likida/analytics.ts:42-47` (`corteVentana`) como la prueba de qué
significa cada llamada.

```
analytics.ts:42  function corteVentana(ventanaDias?: number, …) {
analytics.ts:43    if (!ventanaDias) return null;      // ← sin ventana = SIN filtro
analytics.ts:536 const corte = corteVentana(ventanaDias);
analytics.ts:543 return (corte ? q.gte('created_at', corte) : q)…
```

Los dos caminos, palabra por palabra:

| Camino | Llamada | Ventana real | Lo que el usuario lee |
|---|---|---|---|
| Agente (`acreditables_periodo`) | `getAcreditables(tenantId, diasEjercicio)` (`chat-tools.ts:73`) | ejercicio fiscal en curso | *"Ejercicio 2026 · 18,400.00 L"* |
| Paracaídas (`responder`) | `getAcreditables(tenantId)` (`chat/page.tsx:33`) | **toda la historia** | *"51,900.00 L elegibles para el estímulo **este periodo**"* (`chat.tsx:109`) |

**Escenario con valores.** Misma flota, 3 años de captura: 18,400 L elegibles en
el ejercicio 2026, 51,900 L desde 2024. El contralor pulsa el chip enlatado
*"¿Cuánto diésel es elegible para el estímulo?"* (`chat.tsx:21`).

1. Camino feliz: el endpoint responde y el bloque dice **18,400.00 L, ejercicio 2026**.
2. El endpoint devuelve 502 —`route.ts:111` lo devuelve ante **cualquier**
   excepción de `ejecutarAnalista`, y hay tres realistas: el `AbortController`
   de 40s (`analista.ts:310`), `LoopGuardError` con `maxToolRounds: 5`
   (`openrouter.ts:775`) y `TruncatedError` con `maxTokens: 900`— entonces
   `chat.tsx:384` cae a `responder()` y la caja imprime
   **"51,900.00 L elegibles para el estímulo este periodo"**, con la nota que
   cita *"LIF 2026, Art. 20-A"* (`chat.tsx:110`).

**Las dos respuestas se ven idénticas**: mismo globo, misma tipografía, misma
cita de norma, ninguna marca de "esto es la respuesta de respaldo". El contralor
pregunta dos veces en la misma sesión y obtiene 18,400 y 51,900 litros para la
cifra insignia del producto, ambas rotuladas como del periodo.

**Consecuencia.** El estímulo del diésel es lo que Likida vende. Dos cifras para
él en la misma caja, con 2.8× de diferencia y la misma cita legal debajo, es el
error que un contralor detecta en la sala y no perdona. Y para el equipo: la
lógica de "qué periodo son los acreditables" vive hoy en **tres** sitios con
**dos** respuestas (`inicio-contenido.tsx:87` y `chat-tools.ts:73` dicen
ejercicio; `chat/page.tsx:33` dice todo), que es literalmente el ancla de "4 o
menos" de este rubro.

**Causa raíz probable.** `getAcreditables(tenantId, ventanaDias?)` hace que "sin
ventana" sea un valor legal y silencioso del contrato, y el paracaídas se cableó
sin él. El compilador no puede avisar de un argumento opcional que falta; el
rótulo "este periodo" está escrito a mano en `chat.tsx:109`, a un archivo de
distancia de la llamada que decide qué periodo es.

---

### [ALTO · deuda que cobró factura en 24 horas] La fuente única de "qué ventana es cada modo" que creó el pase 5 quedó huérfana, y sus dos copias siguen vivas

`src/app/dashboard/periodo.ts:19` (huérfano) contra
`src/app/dashboard/kpi-periodo.tsx:14-18` y
`src/app/dashboard/motor-fiscal-periodo.tsx:11-13` (las copias que iba a
sustituir), con `src/app/dashboard/panel-periodo.tsx:95` y `:105` como el sitio
donde el rótulo desapareció.

`periodo.ts` se escribió con esta cabecera literal (`:3-17`):

> *"CÓMO SE LEE CADA VENTANA DE TIEMPO. UNA VEZ. […] cada uno tenía su copia del
> mapa. Ésta es la única, y `Record<ModoPeriodo,…>` hace que un cuarto modo rompa
> la compilación en vez de salir en blanco."*

Medido hoy: `grep` de importadores de `./periodo` en producción → **cero**. El
único que lo lee es `panel_periodo.test.tsx:4`, que es una de las 15 rojas
fichadas. Y las dos copias que declaraba muertas siguen ahí, byte por byte:

```
kpi-periodo.tsx:14        const ETIQUETA_MODO: Record<Modo, string> = {
kpi-periodo.tsx:15-17       semanal: 'últimos 7 días', mensual: 'últimos 30 días', historico: 'histórico',
motor-fiscal-periodo.tsx:11-13   (idéntico, en una línea)
```

**Escenario con valores.** El contralor abre `/dashboard` con la flota de 3 años.
Baja al bloque de `PanelPeriodo` con el pill en **"Semanal"** y lee la tarjeta
**"Liquidado"**: `panel-periodo.tsx:105-107` imprime `mxn(totalLiquidado)` a 24 px
**sin una sola palabra de ventana** — es la suma de `liquidadoModo`, o sea 5
semanas ISO = **$412,000**. A 300 px de distancia, la tarjeta de KPI dice
**"Gasto total — últimos 7 días"** (`kpi-periodo.tsx:66`), y esa sí son 7 días de
verdad. Dos cifras contiguas, una rotulada con su ventana y la otra sin ninguna,
con ventanas que difieren 5×. El contralor cita el $412,000 como la semana.

**Consecuencia.** Es la cuarta ronda consecutiva con este hallazgo abierto y la
primera en que se puede demostrar que el arreglo **existió y se perdió**: el
archivo está en el árbol, compilado, con su comentario explicando por qué es la
única fuente, y sin un consumidor. Para el equipo eso es peor que no haberlo
hecho — el próximo que lea `periodo.ts` va a creer que el problema está resuelto.

**Causa raíz probable.** La regla de merge del pase 6 ("en el conflicto gana
`master`") se aplicó archivo por archivo; el consumidor era el archivo en
conflicto y el proveedor no, así que el proveedor sobrevivió sin nadie que lo
llame. Nada —ni el tipo, ni el linter, ni la compuerta— falla cuando un módulo
exportado se queda sin importadores.

(REINCIDENTE, 5ª ronda del hallazgo "«Periodo» definido en N sitios".)

---

### [ALTO] `TOOLS_LECTURA` es una lista de cadenas sin ningún lazo con el registro: si una tool se renombra, el agente la pierde en silencio y la pérdida se lee como "ese dato no existe"

`src/lib/agents/analista.ts:39-43` contra `src/lib/llm/tool-executor.ts:57-61`
(`toolSchemas`), con `src/lib/agents/prompts.ts:43` como el sitio donde el fallo
se disfraza.

```
analista.ts:39  const TOOLS_LECTURA = [
analista.ts:40    'kpis_flota', 'acreditables_periodo', 'motor_fiscal', 'viajes_flota',
analista.ts:41    'liquidaciones_flota', 'serie_gasto', 'serie_liquidado', 'top_rutas',
analista.ts:42    'duplicados_detectados', 'proyectar_serie',
analista.ts:43  ];

tool-executor.ts:58  return names
tool-executor.ts:59    .map((n) => REGISTRY.get(n)?.schema)
tool-executor.ts:60    .filter((s): s is OpenAI.Chat.ChatCompletionTool => Boolean(s));
```

Hoy los 10 nombres cuadran con las 10 `registerTool(...)` de `chat-tools.ts`
—lo verifiqué uno por uno—. Lo que no existe es nada que lo **mantenga** así:
el tipo es `string[]`, `toolSchemas` **descarta lo que no encuentra sin
devolver error ni registrar warning**, y no hay ninguna prueba que compare las
dos listas (`grep -rn "TOOLS_LECTURA" src/ --include=*.test.*` → vacío).

**Escenario con valores.** Alguien renombra la tool de `chat-tools.ts:177` de
`'top_rutas'` a `'rutas_top'` para que combine con `serie_gasto`, y no toca
`analista.ts:41`. `npx tsc` pasa (son strings), `npm run lint` pasa,
`npx vitest run` pasa. En producción `toolSchemas` devuelve **9** schemas en vez
de 10. El contralor pregunta *"¿cuáles son mis 5 rutas más caras?"* y el modelo,
sin la herramienta y obedeciendo `prompts.ts:43` —*"Si la tool no trae el dato,
dilo: «ese dato todavía no existe en tu operación» — nunca un cero con cara de
medición"*—, contesta: **"Ese dato todavía no existe en tu operación."** Con
$412,000 de gasto por ruta en la base.

**Consecuencia.** Un error de cableado se presenta al comprador como la frase
más cuidada del producto: la que dice honestamente que falta un dato. Es la
regla "nunca inventar una cifra" volteada del revés — afirmar una ausencia que
es falsa —, y no deja rastro ni en la compuerta ni en el log.

**Causa raíz probable.** El registro es un `Map<string, …>` global y la
selección se hace por nombre; en `AGENT_REGISTRY` (`registry.ts:22`) pasa lo
mismo con `tools: [...]`. Ninguna de las dos listas es un tipo derivado de lo
registrado, así que la relación proveedor→consumidor no existe para el
compilador.

---

### [ALTO] El `agotado: true` del endpoint no lo lee nadie: la degradación que el endpoint documenta y que el mensaje le promete al usuario nunca se cableó

`src/app/api/dashboard/chat/route.ts:14-15` y `:94-99` contra
`src/app/dashboard/chat.tsx:382-385`.

El endpoint dice, en su cabecera:

```
route.ts:14  //     Agotado, el endpoint responde `agotado:true`
route.ts:15  //     y el cliente degrada al respondedor gratis — el chat nunca queda mudo.
```

y al agotarse el tope diario devuelve **HTTP 200** con `{agotado:true, bloques:[…]}`
(`:94-99`). El cliente:

```
chat.tsx:382  const r: Respuesta = resp.ok && d && Array.isArray(d.bloques)
chat.tsx:383    ? respuestaDeBloques(d.bloques as …)
chat.tsx:384    : responder(q, kpis, acred);
```

`grep -n "agotado" src/app/dashboard/chat.tsx` → **cero coincidencias**. Como
`resp.ok` es true y `bloques` es un arreglo, el cliente pinta los bloques y
**nunca** llama a `responder()`.

**Escenario con valores.** Viernes de cierre, el tenant llega a $1.00 USD del día
(`topeDiaUsd()`, `route.ts:36-38`; a ~$0.005 por análisis son ~200 preguntas).
El contralor pregunta *"¿cuánto llevo comprobado?"* y lee, textual:

> *"El análisis con IA de hoy llegó a su tope diario (existe para cuidar tu
> costo). Mañana se renueva solo; mientras, **las respuestas rápidas del catálogo
> siguen funcionando**."*

Pulsa entonces un chip del catálogo (`chat.tsx:315`, `CATALOGO_CONSULTA`) →
`preguntar()` → `preguntarAnalista()` → mismo POST → **el mismo mensaje de tope
diario**. Las "respuestas rápidas" que el texto promete son `responder()`
(`chat.tsx:73-145`), que sabe contestar exactamente esas preguntas con los
`kpis`/`acred` que ya viajaron a la página — y a las que no hay forma de llegar
salvo provocando un 502.

**Consecuencia.** El chat queda mudo el resto del día para ese tenant, que es
justo lo que la cabecera del endpoint dice que no puede pasar. Y el producto le
dice al comprador que existe una capacidad de respaldo que no está conectada:
la clase de mentira que la regla del rótulo existe para prohibir. (Nota
adyacente: la única puerta a `responder()` es hoy la del CRÍTICO 2, o sea que la
ruta de respaldo que sí funciona es la que da la cifra mal rotulada.)

**Causa raíz probable.** Un contrato de dos partes escrito en un comentario de
servidor y en una cadena visible para el usuario, sin ningún campo tipado que
una las dos mitades: el cliente y el endpoint se pusieron de acuerdo en prosa.

---

### [ALTO · REINCIDENTE, 2ª ronda] El motor de dinero sigue arrastrando `sharp`, `node:fs` y un WASM, y la línea que afirma lo contrario sigue cinco líneas más abajo

`src/lib/likida/cuadre/engine.ts:14` contra `src/lib/likida/intake/cfdi.ts:11-15`,
con `engine.ts:19` como la afirmación que se rompe. **Verificado hoy: sin un
carácter de cambio.**

```
engine.ts:14  import { esRfcValido, rfcChecksumOk } from '../intake/cfdi';
engine.ts:19  // `formato.ts` no importa NADA: el motor sigue siendo puro y sin I/O.

cfdi.ts:11    import sharp from 'sharp';
cfdi.ts:12    import { readFile } from 'node:fs/promises';
cfdi.ts:13    import { createRequire } from 'node:module';
cfdi.ts:14    import { join } from 'node:path';
cfdi.ts:15    import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader';
```

**Lo nuevo de este pase, y es lo que sostiene la severidad:** el pase 5 predijo
que este import haría imposible unificar el mapa de etiquetas del Resumen. Se
cumplió, y quedó escrito. `gasto-semanal-chart.tsx:26-32` dice hoy:

> *"Se queda como mapa literal y NO se llama a `etiquetaConcepto` en el
> componente: este archivo cuelga de `panel-periodo.tsx`, que es `'use client'`,
> y esa función vive en `cuadre/engine.ts` (86 KB + `NORMAS`) — un import así se
> lleva el motor entero al bundle del navegador por una etiqueta."*

O sea: la frontera declarada ("el motor es puro") y la frontera real ya
divergieron lo suficiente como para que el repo **documente la duplicación como
inevitable**. No hay bug de dinero hoy —`next.config.ts` externaliza `sharp` y
`zxing-wasm` del lado servidor y ninguna ruta cliente importa `engine.ts`—; el
daño es que la única fuente de verdad de las etiquetas no es alcanzable desde el
cliente y ya nadie va a intentarlo.

**Causa raíz probable.** Sin cambio: `intake/cfdi.ts` mezcla dos regex puras de
nueve líneas (`esRfcValido:28`, `rfcChecksumOk:53`) con el decodificador de QR,
que sí hace I/O, y el import más corto arrastró lo segundo.

---

### [ALTO · REINCIDENTE, 2ª ronda, con dos superficies nuevas] `etiquetaConcepto(c)` sin `ocrExtra` sigue en 7 sitios — y el chat añadió dos superficies que ni siquiera la llaman: pintan la clave cruda

`src/lib/likida/cuadre/engine.ts:1302` y sus llamadas sin `ocrExtra`:
`politicas/page.tsx:155,177,210,240` · `configuracion/page.tsx:146` ·
`combustible-casetas/page.tsx:208,211`. **Verificado hoy: los 7, idénticos.**

Lo nuevo son dos superficies del subsistema del chat que se saltan el problema
por abajo — no eligen mal la etiqueta, **no eligen ninguna**:

```
chat.tsx:287       if (d.campos.concepto) filas.push(['Concepto', String(d.campos.concepto)]);
chat-tools.ts:154  return { modo: …, moneda: 'MXN', categorias: s.categorias, series: s.series };
```

`d.campos.concepto` viene de `/api/dashboard/ingesta` → `extraerComprobante` →
`CONCEPTOS_OCR` (`intake/ocr.ts:26`), que son las claves crudas
`'diesel' | 'caseta' | 'factura' | …`. Y `s.series[].nombre` es literalmente
`gasto.concepto` sin mapear (`analytics.ts:410`, `nombre: concepto`).

**Escenario con valores.** El contralor sube al chat la foto de un ticket de
caseta de $412 por el clip de "leer comprobante". La tabla que le regresa
`chat.tsx:286-300` dice:

```
Concepto    caseta
Monto       $412.00
```

Cierra ese globo y pregunta *"¿en qué se me va el gasto?"*. El modelo llama
`serie_gasto`, recibe `{nombre: 'caseta', valores: [...]}`, y narra la categoría
con la palabra que le dé la gana — `caseta`, `Casetas`, `Peajes` — porque nada
la fija. Sube a la gráfica del Resumen, a 400 px de ahí, y la leyenda dice
**"Caseta"** (`gasto-semanal-chart.tsx:35` vía `:103`). Abre el PDF archivado:
**"Caseta"** (`pdf.ts:241`). Y `config.ts:91` mapea `caseta → '600-002'`, que es
una **cuenta contable**: tres o cuatro nombres para la misma cuenta en la misma
sesión, uno de ellos elegido por un modelo de lenguaje en cada turno.

**Consecuencia.** El argumento de compra es que el contralor pueda cruzar la
pantalla contra su PDF y contra su contador. Con la clave cruda en pantalla
(`caseta`, en minúscula y sin plural) el producto además **se ve** como una base
de datos expuesta, en la pantalla que se acaba de construir para impresionar.

**Causa raíz probable.** `etiquetaConcepto` no es alcanzable desde el cliente
(ver el ALTO anterior) ni desde el resultado de una tool sin decidir cuál de sus
dos contratos —"etiqueta este gasto" vs "etiqueta esta categoría"— aplica. Ante
la duda, las dos superficies nuevas no llamaron a nadie.

---

### [MEDIO] El guardarraíl que `gasto-semanal-chart.tsx` nombra por su nombre de archivo no existe en el repositorio

`src/app/dashboard/gasto-semanal-chart.tsx:30-32`:

> *"Lo que impide que se vuelvan a separar es **`etiquetas_grafica.test.ts`**,
> que compara este mapa contra la salida REAL de `etiquetaConcepto` en tiempo de
> prueba."*

```
$ grep -rn "etiquetas_grafica" src/
src/app/dashboard/gasto-semanal-chart.tsx:31: * `etiquetas_grafica.test.ts`, que compara este mapa contra la salida REAL de
$ find src -name 'etiquetas*'
src/app/dashboard/etiquetas_panel.test.ts
src/lib/likida/etiquetas_sincronizadas.test.ts
src/app/dashboard/soporte/etiquetas_soporte.test.ts
```

**No existe.** Y las dos pruebas que sí existen no cubren `CONCEPTO_LABEL`:
`etiquetas_sincronizadas.test.ts:36-37` compara `engine.ts` contra
`[id]/page.tsx` **enumerando los dos archivos a mano**, y su caso "cubren todos
los conceptos que el tipo permite" (`:60-70`) solo afirma sobre `motor`.
`etiquetas_panel.test.ts:22-23` lee `[id]/page.tsx` y `pdf.ts`, nada más.

**Escenario con valores.** Alguien añade `'peaje_urbano'` a `ConceptoGasto`
(`types/likida.ts:20-25`) y lo etiqueta en `engine.ts:1312`.
`etiquetas_sincronizadas.test.ts` pasa verde (el motor lo tiene) y
`etiquetas_panel.test.ts` pasa verde. `gasto-semanal-chart.tsx:103` evalúa
`CONCEPTO_LABEL['peaje_urbano'] ?? s.nombre` → pinta **`peaje_urbano`** en la
leyenda del Resumen, con guion bajo, junto a "Diésel" y "Caseta".

**Consecuencia.** El arreglo del pase 5 sobre este archivo es correcto en su
contenido (el mapa ya no divergía cuando lo verifiqué: `caseta: 'Caseta'`,
`otro: 'Otro'`, y el `diesel: 'Combustible'` está justificado por escrito y es
correcto para un agregado). Lo que está mal es que **se declaró protegido y no
lo está**. Un guardarraíl inventado en un comentario es peor que ninguno: el
siguiente auditor lee esa línea y descarta el archivo, como casi hago yo.

**Causa raíz probable.** El comentario se escribió describiendo el arreglo
completo y la prueba se quedó fuera del commit; nada en la compuerta puede
detectar que un fichero citado por nombre no existe.

---

### [MEDIO] Código muerto de la v3: 8 módulos sin importador (1,474 líneas), 84 símbolos sin llamador y 39 líneas de CSS que ningún elemento lleva

Los números y las tablas están arriba, en «Recuento pedido». Lo que lo convierte
en hallazgo y no en inventario es el conjunto **`rail-marca.ts` + `globals.css`**,
porque es un cadáver **partido en dos lenguajes**:

* `src/app/dashboard/rail-marca.ts` (52 L) — solo lo lee `rail_marca.test.ts`,
  que corre **verde**. Sus 4 exports (`RUTA_SIN_RAIL`, `ANCHO_MIN_ASISTENTE`,
  `estaExpandido`, `marcaAsistente`) documentan el comportamiento de `rail.tsx`,
  borrado por la v3.
* `src/app/globals.css:239-277` (39 L) — la otra mitad de la misma regla, con la
  transición y las dos reglas `:root[data-asistente="expandido"] .columna-centro`.

**Escenario con valores.** Un desarrollador —o un agente reparador— arranca el
próximo pase, corre `npx vitest run`, ve `rail_marca.test.ts` en verde con sus 6
asserts, y lee en `globals.css:261-262` *"el breakpoint es el mismo `xl` de
Tailwind, y `ANCHO_MIN_ASISTENTE` (rail-marca.ts) lo cruza con el componente en
una prueba"*. Concluye, razonablemente, que el asistente de rail existe y está
protegido. Va a tocar el layout del panel confiando en esa protección; el
componente que la prueba dice cubrir se borró hace un día.

**Consecuencia.** Es la forma más cara de deuda para un equipo de **una
persona**: no líneas de más, sino **líneas que mienten sobre lo que el sistema
hace**, con una prueba verde detrás. `permiso_cre.ts` (163 L) tiene el mismo
perfil, con 27 asserts de un módulo de facturación que nada llama.

**Causa raíz probable.** El borrado de la v3 quitó consumidores sin barrer
proveedores, y ninguna herramienta de la compuerta (`tsc`, `eslint`, `vitest`)
reporta un módulo exportado sin importadores: para las tres, un archivo con
prueba propia se ve exactamente igual que un archivo vivo.

---

### [MEDIO · REINCIDENTE, 4ª ronda, y ahora replicado] El `hoy` calculado en UTC se copió al subsistema nuevo: `chat-tools.ts` lo repite carácter por carácter

`src/lib/agents/chat-tools.ts:42-44` y `src/app/dashboard/inicio-contenido.tsx:75`
(donde vivía como `page.tsx:84`) contra las diez funciones de `analytics.ts` y
`fiscal.ts` que declaran su fecha en hora de México
(`toLocaleDateString('en-CA', { timeZone: TZ_MX })`).

```
inicio-contenido.tsx:75  const hoy = new Date(ahoraMs()).toISOString().slice(0, 10);
chat-tools.ts:42-44      function hoyIso(): string {
                           return new Date(ahoraMs()).toISOString().slice(0, 10);
                         }
```

`hoyIso()` alimenta **cinco** tools: `acreditables_periodo` (`:68`),
`motor_fiscal` (`:88`), `serie_gasto` (`:153`), `serie_liquidado` (`:168`) y
`top_rutas` (`:183`).

**Escenario con valores.** 31-dic-2026, 18:30 en Ciudad de México (CST = UTC−6).
`Date.now()` ya es 1-ene-2027 en UTC → `hoyIso()` devuelve `'2027-01-01'`. El
contralor, cerrando el ejercicio, pregunta en el chat *"¿cuánto diésel tengo
elegible?"*:

* `resolverPeriodo(undefined, '2027-01-01')` → **"Ejercicio 2027"**.
* `dias = floor((2027-01-01 − 2027-01-01)/86.4e6) + 1 = ` **1** (`chat-tools.ts:70-72`).
* `getAcreditables(tenantId, 1)` → los litros de **un solo día**.

Respuesta: **"Ejercicio 2027 · 0.00 L elegibles para el estímulo"**, la noche
exacta del cierre, con la flota teniendo 18,400 L acreditables en 2026 y a seis
horas de que eso deje de poderse documentar.

**Consecuencia.** El mismo defecto que el pase 3 fichó en `page.tsx:84` ahora
tiene dos instancias en dos subsistemas, y la nueva pega en la superficie donde
el contralor pregunta en lenguaje natural — o sea donde menos va a sospechar de
la ventana. Para el equipo: el defecto se está **propagando por copia**, que es
la definición de deuda que cobra factura.

**Causa raíz probable.** Sin cambio desde el pase 3: el contrato de zona horaria
vive en un **valor por defecto de parámetro** (`hoy = new Date().toLocaleDateString('en-CA', {timeZone: TZ_MX})`),
que es el sitio exacto donde un llamador lo pisa sin que nada lo note.

---

### [MEDIO] La lista `tools:` de la llamada no es la frontera de autorización: el ejecutor resuelve contra un registro global sin comprobar pertenencia

`src/lib/llm/openrouter.ts:811` · `src/lib/llm/tool-executor.ts:49,98,148-172` ·
`src/lib/agents/chat-tools.ts:3-5` (la afirmación que se apoya en ello).

```
openrouter.ts:811  entry = { args, promise: opts.toolExecutor(call.function.name, args) };
tool-executor.ts:98  const tool = REGISTRY.get(name);     // ← registro GLOBAL del proceso
```

No hay ninguna comprobación de que `call.function.name` esté en `opts.tools`.
La cabecera de `chat-tools.ts:3-5` afirma *"TODAS DE SOLO LECTURA y ancladas a
`ctx.tenantId`"*, y esa afirmación descansa hoy en que el modelo solo pida lo
que se le ofreció.

**Refutación que hice yo mismo, y por la que esto es MEDIO y no ALTO.** Dos
cosas lo contienen hoy:

1. `/api/dashboard/chat` **no** importa `likida/tools.ts` ni por transitividad
   —lo verifiqué recorriendo el grafo de imports desde `route.ts`—, así que en
   Vercel (una función por ruta) el registro del proceso del chat solo tiene sus
   11 tools. Bajo un `next start` único —desarrollo, o self-host— el registro es
   **uno solo para todo el servidor**, y basta un mensaje de WhatsApp para que
   `processor.ts:9` (`import '@/lib/likida/tools'`) meta ahí
   `consultar_politica`, `cuadrar_viaje` y `guardar_liquidacion`.
2. Aun ahí, `guardar_liquidacion` y `cuadrar_viaje` abren con
   `if (!ctx.viajeId) throw new Error('sin viaje activo')` (`tools.ts:162`, `:91`),
   y el `ToolContext` del chat (`analista.ts:277`) no trae `viajeId`. **No hay
   daño de dinero hoy.**

**Escenario con valores, del que sí ocurre.** `consultar_politica`
(`tools.ts:34`) solo necesita `ctx.tenantId`. En un `next start` con el webhook
ya usado, si el modelo del chat emite `tool_calls: [{name:'consultar_politica'}]`
—un nombre que su propio prompt de sistema menciona al describir el producto—,
**se ejecuta**: devuelve la política completa de la flota y la lista de
`fundamentos` que son el permiso de citar normas. Una tool no ofrecida corriendo
por el ciclo del analista, sin registro de que ocurrió algo anómalo.

**Consecuencia.** Lo que está mal no es el efecto de hoy, es **dónde vive la
frontera**: la lista `tools:` de cada llamada parece la autorización y no lo es;
la autorización real es un `if (!ctx.viajeId)` dentro de cada handler. El día
que alguien le dé al chat un `viajeId` —"pregúntame sobre este viaje" es la
siguiente función obvia— la frase "TODAS DE SOLO LECTURA" se vuelve falsa sin
que nadie toque `chat-tools.ts`.

**Causa raíz probable.** `REGISTRY` es un `Map` de módulo compartido por los dos
juegos de tools; `registerTool` (`:51-54`) ni siquiera rechaza una colisión de
nombres — la registra encima y deja un `logger.warn`.

---

### [MEDIO · REINCIDENTE] `FASE_LABEL`: la instancia divergida se cerró, la clase no — siguen cuatro copias del mismo mapa sin una sola prueba de sincronía

`src/app/admin/page.tsx:21` · `src/app/admin/analitica/page.tsx:11` ·
`src/app/admin/costos-facturacion/page.tsx:63` · `src/app/admin/model-ops/page.tsx:43`.

El arreglo del pase 5 fue bueno y hay que decirlo: `model-ops` pasó de 3 claves
a las 6 y de `Record<string,string>` a **`Record<FaseCosto, string>`**, así que
una fase nueva en el tipo ahora rompe la compilación **en ese archivo**. Las
otras tres siguen siendo `Record<string, string>` con el mismo `?? f.fase` de
respaldo (`page.tsx:200`, `analitica:73`, `costos-facturacion:238`).

**Escenario con valores.** Se agrega la fase `'archivo'` a `FaseCosto`
(`costos.ts`) para contabilizar lo que gasta `/api/dashboard/archivo`.
`model-ops/page.tsx` **no compila** → se corrige ahí. Los otros tres compilan sin
tocarse. Javier abre `/admin` con $41.20 USD del mes y la dona de "Costo por
fase" dice **"Agente OCR $12.10 · Agente de Cuadre $9.30 · `archivo` $3.80"**,
en minúscula y crudo, mientras `/admin/model-ops` —a un clic— dice
**"Lector de archivos $3.80"**. Es el mismo defecto que se acaba de arreglar,
en las tres copias que el arreglo no tocó.

**Consecuencia.** MEDIO y no ALTO porque pega en `/admin`, la consola de Javier,
no en la del contralor: el costo es de mantenibilidad y de confianza en la propia
medición del negocio. Lo reporto porque es la **cuarta encarnación** del ejemplo
canónico de este rubro y porque el arreglo del pase 5 demuestra el patrón: se
cierra la copia que se midió, no la clase.

---

### [MEDIO · REINCIDENTE] El bloque de alertas del Resumen sigue siendo código inalcanzable, ahora en el archivo nuevo, y `detectarAnomalias` se sigue consultando y tirando

`src/app/dashboard/inicio-contenido.tsx:141` y `:231-243`, con `:89`
(`safe<Anomalia[]>(() => detectarAnomalias(tenantId))`).

La v3 movió el código de `page.tsx` a `inicio-contenido.tsx` y lo copió tal cual:

```
inicio-contenido.tsx:141  const alertas: Array<{ texto: string; href: string }> = [];
inicio-contenido.tsx:231  {alertas.length > 0 && (
```

`grep -n "alertas" inicio-contenido.tsx` → `138, 141, 231, 233`, y `138` es
comentario. **Ningún `push`.** Las 13 líneas de JSX de `:231-243` están guardadas
por una condición demostrablemente falsa, y TypeScript bendice un arreglo vacío
tipado.

**Escenario con valores.** Tres comprobantes de diésel de $4,180 que aparecen en
dos viajes distintos —el patrón de ordeña que `detectarAnomalias` existe para
cazar—. El contralor abre `/dashboard`: la consulta corre en cada carga
(`:89`), encuentra los tres, y el arreglo se descarta salvo por
`estadoPanel` (`estado.ts:30-31`), que solo lo cuenta como `=== null`.

**Lo que cambió (y por qué sigue siendo hallazgo).** La v3 sí construyó una
salida parcial: `pendientes` (`:173-179`) lleva el conteo a la campana de
`BarraAcciones`. O sea, la **información** ya no se pierde del todo — pero las
13 líneas de JSX muerto siguen ahí, con su `href` y su "Ver →", esperando un
`push` que nadie escribió. Es deuda que ya sobrevivió a un rediseño completo.

---

### [BAJO · REINCIDENTE, 4ª ronda] `RUTA_DE_DIFERENCIA` sigue mandando 12 veredictos "al panel", y el panel donde se veían sigue sin existir

`src/lib/likida/cierre_aviso.ts:104-148`. **Verificado hoy: los 12 `'panel'`
intactos**, incluido `:148` `combustible_efectivo_dentro15: 'panel', // dentro
del 15% y elegible: informativo, el contador vive en el panel` — y el panel del
contador se borró entero en `003c88a`.

Escenario y consecuencia idénticos a los del pase 4 (viaje LIQ-2026-0418, ticket
de $4,180 con OCR de confianza 0.62 → `ocr_baja_confianza` → clasificado
`'panel'` → no se manda por WhatsApp **a propósito** → ninguna pantalla lo
enseña). Lo bajo a BAJO respecto al pase 5 por una razón medible: el chat nuevo
sí puede contestar por dos de los doce (`duplicados_detectados` cubre
`duplicado`, `motor_fiscal` roza `combustible_efectivo`), así que la pérdida
total pasó de 12/12 a ~10/12.

**Causa raíz probable.** Sin cambio: una dependencia que apunta al revés — un
módulo de dominio codifica una afirmación sobre qué pantallas existen, y nada
—ni tipo ni prueba— ata esa afirmación al árbol de rutas.

---

### [BAJO] Dos cáscaras para la misma puerta: `/dashboard` se pinta con el lenguaje de la v3 o con el anterior según el rol, y las dos las mantiene la misma persona

`src/app/dashboard/page.tsx:39-43` reparte entre
`src/app/dashboard/inicio-contenido.tsx` (dueño/contador) y
`src/app/dashboard/inicio-operacion.tsx` (encargado).

La v3 reescribió la primera y no tocó la segunda, y el reparto se ve en el
esqueleto:

| | `inicio-contenido.tsx` | `inicio-operacion.tsx` |
|---|---|---|
| Marco | `rounded-2xl … background: var(--g1)` (`:186`) | `glass-panel` (`:75`, `:132`, `:162`) |
| Encabezado | `<BarraPagina>` + `<HeroSaludo>` (`:187`, `:204`) | `<h1>` a mano (`:78-83`) |
| Fecha | `<ChipFecha>` con `TZ_MX` (`:211`) | `fechaLarga()` en texto plano (`:83`) |
| Piezas | `card`, `StatCard`, `KpiPeriodo` | `TableroCifras`, `<ul>` a mano (`:148-158`) |

**Escenario.** Javier cambia el lienzo del panel —el `var(--g1)`, el radio de
`card`, la barra de página— para la demo. Toca `inicio-contenido.tsx`,
`resumen-visual.tsx` y `admin/ui/kit.tsx`, lo mira, queda bien. El jefe de
tráfico de Transportes Innovativos entra con su cuenta y ve la versión anterior
del producto, con `glass-panel` y un `<h1>` sin chip de fecha. Nada falla; el
producto se ve como dos productos.

**Consecuencia.** BAJO porque no hay cifra mal ni pantalla rota, y porque el
comentario de `page.tsx:22-32` argumenta bien **por qué** son dos contenidos
distintos (el encargado no ve dinero, y esconderle secciones "deja un queso
gruyere"). La objeción no es al reparto de contenido: es a que el **marco** —lo
que debería ser una sola cáscara con dos rellenos— también se duplicó, y ahora
son dos archivos que hay que acordarse de cambiar juntos, sin nada que lo exija.

---

## Hallazgos de pases anteriores que YA NO APLICAN

* **CRÍTICO del pase 5 — «la pantalla de detalle de liquidación no tiene un solo
  link entrante»: CERRADO CON ARREGLO.** `src/app/dashboard/resumen-visual.tsx:157`
  (`<Link href={`/dashboard/${v.liqId}${sufijo}`}>Ver</Link>`), alcanzable desde
  `inicio-contenido.tsx:321` → `ViajesRecientes` → `TablaViajes`. Verificado con
  el barrido completo de `href` del panel: hoy hay **dos** links dinámicos a
  `/dashboard/<id>` donde no había ninguno. Además `inicio-contenido.tsx:147-153`
  solo emite el link cuando el folio cruzó con una liquidación real
  (`liqPorFolio`), así que no hay link a un 404. Arreglo correcto y bien hecho.
* **ALTO del pase 5 — «el tercer mapa concepto→etiqueta divergido en 3 de 9»:
  CERRADO.** `gasto-semanal-chart.tsx:34-38` dice hoy `caseta: 'Caseta'`,
  `otro: 'Otro'`, y el `diesel: 'Combustible'` está justificado por escrito y es
  el valor **correcto** para un agregado (el estímulo de IEPS es solo diésel; la
  cubeta puede traer Magna). Lo que queda abierto no es la divergencia sino la
  prueba que la vigila — ver el MEDIO de `etiquetas_grafica.test.ts`.
* **MEDIO del pase 5 — `FASE_LABEL` divergido en `model-ops`: CERRADO**
  (`model-ops/page.tsx:43`, 6 claves, `Record<FaseCosto, string>`). La clase
  sigue abierta; la reporto arriba como reincidente de clase, no de instancia.
* **BAJO del pase 5 — `usuarios/page.tsx:16` mandaba a `/mis-viajes`: CERRADO**
  (`usuarios/page.tsx:14-19` documenta el borrado y el texto ya no promete la
  ruta).
* **Pase 2 #3 y pase 1 #6 (`costoPorViaje` aplanado a `0`, `KpiTile`): REABIERTOS
  por el merge, y NO los cuento como míos** — son dos de las 15 rojas fichadas en
  `MAPA.md` (`kpi-periodo.tsx:67`, `ahorro_sin_dato.test.ts`).

---

## Lo que revisé y está bien

* **El motor de dinero sigue viviendo en un solo archivo.** Busqué una segunda
  copia de `cuadrarViaje`, `filasDeducibilidad` o del cálculo de IVA/IEPS
  acreditable en todo `src/`, incluido el subsistema nuevo: no la hay. Las tools
  del chat **leen** agregados (`analytics.ts`, `fiscal.ts`) y ninguna recalcula.
  El ancla de "4 o menos si la misma lógica de dinero vive en más de un archivo"
  la dispara el CRÍTICO 2 (dos ventanas para los acreditables), no el motor.
* **La regla `properties: {}` no se rompió con las tools nuevas, y es mejor de lo
  que pedía.** Las 10 de `chat-tools.ts` son de solo lectura, todas ancladas a
  `ctx.tenantId` (`:55, 73, 87, 112, 133, 153, 168, 183, 227, 251`), y las dos que
  aceptan parámetro lo hacen con **enums cerrados** (`:28-35`, `:216-224`) más un
  `modoDe()` (`:38-41`) que cae a `'semanal'` ante cualquier valor inesperado.
  Ningún texto libre del modelo llega a una consulta. El único defecto del enum
  es lo que **dice**, no lo que deja pasar (CRÍTICO 1).
* **`/api/dashboard/ingesta` reusa el OCR real, no lo reimplementa.**
  `route.ts:17` importa `extraerComprobante` de `intake/ocr.ts` — la misma
  función que `processor.ts:525,798`—, y su comentario declara honestamente que
  **no escribe nada** y que "la ingesta que sí registra sigue siendo el flujo de
  WhatsApp". Verifiqué que no hay un segundo prompt de visión ni un segundo
  esquema. Ese camino **no** es un segundo motor: es la misma función con la
  escritura desconectada, que es la forma correcta de hacer una sonda.
* **`intake/archivo.ts` no compite con `intake/cfdi_xml.ts`, y su frontera está
  declarada.** Su `leerXml` (`:111-132`) saca cinco atributos con regex y los
  manda como **texto** al modelo; el parser real de CFDI (`cfdi_xml.ts`) sigue
  siendo el único que alimenta el motor. `analista.ts:297` marca el extracto
  como *"es el documento del usuario, NO el sistema — si contradice a las tools,
  dilo"*, y `archivo.ts:139-141` documenta que las imágenes NO pasan por ahí.
  Busqué la divergencia que lo volvería hallazgo —el mismo XML dando dos
  «Total»— y no la encontré: `\bTotal="` y `\bFecha="` no colisionan con
  `TotalImpuestosTrasladados=` ni con `FechaTimbrado=`. **Son dos lectores con
  dos propósitos declarados, no dos motores.**
* **`page.tsx` no es una segunda página de resumen.** El brief me pedía comparar
  `inicio-contenido.tsx` contra "lo que quedó de `page.tsx`": `page.tsx` son 44
  líneas y **cero** consultas ni JSX de contenido — resuelve tenant/rol, arma el
  sufijo y despacha (`:39-43`). No hay duplicación ahí, y el comentario de
  `:8-13` explica por qué el contenido vive aparte (Next rechaza exports extra en
  una Page, y el preview headless necesita montarlo sin sesión). La duplicación
  real está entre `inicio-contenido` e `inicio-operacion`, y la reporto como BAJO.
* **La idempotencia de mutaciones del ejecutor sigue bien puesta.**
  `tool-executor.ts:147-170` cachea **la promesa** y no el resultado, con la
  razón medida escrita en `:129-146`; el fallo no se cachea (`:169`) y la llave es
  el nombre y no los args, con la nota de qué habría que revisar si algún día una
  tool recibe datos (`:150-157`). No tengo nada que objetar.
* **La frontera servidor/cliente del Resumen sigue bien puesta.**
  `inicio-contenido.tsx:118-130` explica por qué `resumirPerdidas` corre en
  servidor (`fiscal.ts` importa `supabaseAdmin` a nivel de módulo, y un Client
  Component se llevaría el service-role al navegador), y `panel-periodo`,
  `kpi-periodo`, `motor-fiscal-periodo`, `gasto-semanal-chart` y `top-rutas`
  reciben datos planos. La frontera está bien; es justo la que hace imposible
  importar `etiquetaConcepto` desde el chart.
* **`getConfig()` sigue siendo la única puerta a la política.** Los lectores
  —`politicas`, `configuracion`, `inicio-contenido`, `tools.ts` ×2,
  `processor.ts`, `desde_db.ts` ×2, `chat-tools.ts:90`— pasan todos por ella;
  nadie lee `tenant.config.politica` a mano ni toca la tabla muerta
  `politica_gasto`. La tool nueva del chat respetó la frontera.
* **`formato.ts` sigue siendo la única fuente de formato**, incluidos los
  bloques del chat: `chat.tsx:60-63` formatea con `mxn`/`litros`/`numero` de
  `@/lib/formato`, y el prompt le ordena al modelo entregar **números crudos**
  (`prompts.ts:58`: *"los montos en los bloques van como números crudos (la
  interfaz los formatea)"*). Es la decisión correcta y está anclada por escrito.
* **La compuerta está limpia**: `npx tsc --noEmit -p .` → 0 errores.

---

## Lo que NO alcancé a revisar

* **`repo.ts` sigue sin ser una frontera de acceso a datos, y lo dejo declarado
  un pase más en vez de inventarle un escenario.** `grep -rl "supabaseAdmin()"
  src/ | grep -v '\.test\.'` sigue devolviendo ~50 archivos, y ahora el chat suma
  dos rutas más (`chat/route.ts` consulta `tenant` y `llm_costo` directo,
  `:61,66,85`). Busqué la divergencia que lo convertiría en hallazgo —dos
  lecturas de la misma tabla que devuelvan cifras distintas para lo mismo— y la
  única que encontré es la del CRÍTICO 2, que sí reporto. El resto no lo pude
  demostrar con valores.
* **`src/lib/likida/facturacion/` (~4,000 líneas).** Quinto pase consecutivo
  fuera. Solo entré a `permiso_cre.ts` para confirmar que está huérfano y a
  `identificar.ts`/`caducidad.ts` por el grafo de imports del motor.
  `capufe.ts:896` sigue comparando dinero con tolerancia y sigue mereciendo una
  pasada de fronteras propia.
* **`processor.ts` (2,100+ líneas) ↔ `conv.ts` ↔ `tools.ts`.** El reparto de
  responsabilidad entre los tres sigue sin auditarse como arquitectura; este
  pase entré solo a `:9`, `:435-450`, `:525`, `:798` y a los call sites de
  `etiquetaConcepto`.
* **`supabase/migrations/` contra `src/types/likida.ts`.** Quinto pase sin
  comparar esquema contra tipos. Con 84 símbolos exportados sin llamador —muchos
  de ellos consultas que leen columnas que nadie vuelve a tocar— sigue siendo el
  sitio donde una divergencia va a aparecer sin que nada la vea.
* **El render.** No levanté preview ni screenshot. Los dos CRÍTICOs no lo
  necesitan —son divergencias entre dos definiciones, y las dos citas están
  pegadas arriba—, pero **una captura de `/dashboard/chat` con el tope diario
  agotado confirmaría de un vistazo el ALTO del `agotado`**, y una de `/dashboard`
  con el pill en "Semanal" al lado de la tarjeta "Gasto total — últimos 7 días"
  haría visible en un segundo el ALTO de `periodo.ts`. Vale la pena antes de
  enseñárselo a nadie.
* **El conjunto dorado del chat** (`pruebas-manuales/chat-analista.prueba.ts`).
  No se corre por regla —hace llamadas reales de pago—, así que la única
  verificación del comportamiento del agente contra sus tools es manual y no
  entró en este pase. Es la razón por la que el CRÍTICO 1 pudo llegar a `master`
  sin que nada lo detuviera.
