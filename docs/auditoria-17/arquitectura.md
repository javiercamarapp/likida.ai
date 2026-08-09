# Arquitectura y mantenibilidad — auditoría 17 (pase 2)

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura**.
Los **ocho** hallazgos del pase 1 siguen abiertos, palabra por palabra —
verificados uno por uno contra HEAD— y las 454 líneas nuevas de `analytics.ts`
más los 6 componentes del rework del dashboard **reprodujeron dos de los
patrones que el pase 1 ya había señalado**: el componente compartido que recibe
`valor: number` y obliga a coalescer a mano (ahora en `KpiDegradado`, nuevo), y
el mismo mapa de conceptos escrito en N archivos (ahora "periodo", en cuatro).
Por la regla del rubro eso no es una advertencia, es un hallazgo.

Compuerta corrida hoy sobre el árbol post-merge: `npx tsc --noEmit -p .` → 0
errores. `npx vitest run` → 255 archivos, 3,168 verdes, 1 saltada.

**El riesgo mayor del rubro hoy:** el pase 2 metió un **selector único** que
promete mover todo lo que hay debajo, y debajo hay **cinco secciones con tres
ventanas de tiempo distintas** porque el concepto "periodo" se definió cuatro
veces por separado (días en `analytics.ts`, semanas ISO en el mismo archivo,
días otra vez en `fiscal.ts`, días otra vez en `actividad.tsx`). Encima, la
página calcula su `hoy` en UTC mientras los módulos que lo reciben lo declaran
en hora de México. Es la regla "un rótulo tiene que ser verdad" rota por una
frontera, no por un descuido de copy.

---

## Estado de los hallazgos del pase 1

| # | Hallazgo | Estado en HEAD |
|---|---|---|
| 1 | ALTO · el bloque "Acreditable" reimplementa `filasAcreditables` | **ABIERTO — REINCIDENTE (3ª ronda)**. `[id]/page.tsx:257-270` sigue pintando los cuatro `<Tot>` a mano; `filasAcreditables` solo tiene un consumidor de producción, `pdf.ts:334`. La nota sigue siendo la misma cadena de seis palabras («Sujeto a elegibilidad», línea 267) y el comentario de auditoría 12 sigue en `[id]/page.tsx:403-405`. |
| 2 | ALTO · "IVA acreditable" con dos motores y dos ventanas | **ABIERTO**. `engine.ts:1025` sigue aplicando `proporcion`; `fiscal.ts:506-517` (`ivaSostenible`) sigue sin aplicar ninguna. `contador/page.tsx:141` («IVA acreditable documentado») y `chat.tsx:38` (`mxn(acred.iva)`, sin ventana) siguen conviviendo. Agravado: `page.tsx:100` ahora pide `getAcreditables(tenantId, diasEjercicio)` mientras el rail sigue pidiéndolo sin ventana, así que en la MISMA pantalla "Diésel elegible" es el ejercicio y la respuesta del rail es toda la historia. |
| 3 | ALTO · "Vencen pronto" ARCO con dos predicados | **ABIERTO — sin un carácter de cambio**. `arco/page.tsx:71` sigue con `venceEn(s.venceEn) <= hoy` bajo el rótulo «Vencen pronto (≤ 5 días)» (línea 87); `admin/compliance/page.tsx:180` sigue con `+ 5 * 864e5`. |
| 4 | MEDIO · el guardarraíl de `round2` mide la declaración | **ABIERTO**. `formato.test.ts:186-205` sigue haciendo grep de `function round2\|const round2\s*=`; `crear_viaje_wa.ts:302` sigue con `Math.round(base * factor * 100) / 100` y la suite sigue verde. Nota buena: el código NUEVO de `analytics.ts` (454 líneas) importa `round2` de `formato.ts` en los seis sitios donde redondea — no añadió una quinta copia. |
| 5 | MEDIO · `crear_viaje_wa.ts` sin consumidor de producción | **ABIERTO**. `interpretarPeticionViaje` y `resolverOperadorPorNombre` siguen sin un solo importador fuera de su test. |
| 6 | MEDIO · `KpiTile` recibe `valor: number` | **ABIERTO — REINCIDENTE Y AMPLIADO**. `kit.tsx:31` sigue igual, y el pase 2 creó `KpiDegradado` (`resumen-visual.tsx:95-101`) con la MISMA firma y **sin siquiera el escape `vacio`** que `KpiTile` sí tiene. Ver hallazgo nuevo [ALTO] de abajo: sus tres call sites coalescen a `0`. |
| 7 | BAJO · `/api/dashboard/asistente` no honra `rolEfectivo` | **ABIERTO**. `route.ts:43` sigue gateando con `sesion.rol`; `rail.tsx:59` sigue mandando solo `?tenant=`. |
| 8 | BAJO · `CLAUDE.md`/`MAPA.md` citan `dashboard/pendiente.tsx` | **ABIERTO**. `ls src/app/dashboard/pendiente.tsx` → no existe. `CLAUDE.md:21` y `MAPA.md:100` lo siguen citando. |

**Cerrado de verdad, con evidencia:** nada de los ocho. Lo que sí mejoró y hay
que decirlo: `pctCambio` se movió de `analytics.ts` a `formato.ts` (`formato.ts:57-70`)
precisamente para no arrastrar `supabaseAdmin` al bundle del cliente — es la
frontera servidor/cliente resuelta bien, y el comentario explica el porqué. Y
el retiro del rol `operador` (`31babfd`, mig. `0086`) se hizo **limpio**: no
queda ni una rama de código de producción que compare contra `'operador'`
(barrido completo de `src/`), `AREAS_POR_ROL` (`visibilidad.ts:37-45`) lo
documenta como ausente a propósito, `PANEL_PROPIO` quedó vacío pero declarado
como punto de extensión, y `RolAppUser` (`provisionar.ts:16`) es la única unión
de roles del repo, con `admin/equipo/page.tsx:13` tipado contra ella.

---

## Hallazgos

### [ALTO] El selector único Semanal/Mensual/Histórico mueve cinco secciones con TRES ventanas distintas — el concepto "periodo" está definido cuatro veces

Los cuatro sitios que definen el mismo concepto de tres valores:

* `src/lib/likida/analytics.ts:175-177` — **días**: `semanal`=7, `mensual`=30, `historico`=3650.
* `src/lib/likida/analytics.ts:421` — **semanas ISO**: `SEMANAS_POR_MODO = { semanal: 5, mensual: 13, historico: 52 }`, consumido en `437-439`, `494-496` y `1034-1036`.
* `src/lib/likida/fiscal.ts:845-847` — **días otra vez**: 7 / 30 / `'todo'`.
* `src/app/dashboard/actividad.tsx:53` — **días otra vez**: `bucketsPorDia(viajes, 7)` / `(…, 30)`.

Y el consumidor que los junta bajo **un solo control**:
`src/app/dashboard/panel-periodo.tsx:44-51` — un `useState` alimenta a la vez
`seriesKpis[modo][0]` (la dona "Viajes"), `gastoSemanalSeries[modo]`,
`liquidadoSemanalSeries[modo]`, `topRutasSeries[modo]` y `Actividad`. Su propio
encabezado (líneas 21-26) declara la intención: «UN SOLO selector … que mueve
Viajes, Actividad, Gasto por categoría, Liquidado por semana y Top rutas por
gasto **juntos**».

**Escenario con valores.** Flota con 4 viajes iniciados en los últimos 7 días
(3 liquidados, 1 pendiente) y 26 viajes en las últimas 5 semanas. Gasto de los
últimos 7 días: $84,000. Gasto de las últimas 5 semanas: $412,000. Liquidado de
las últimas 5 semanas: $980,000. El contralor aprieta **"Semanal"**. Sale, en
la misma pantalla, bajo ese mismo botón:

* dona **"Viajes"** → 4 (`panel-periodo.tsx:72-76`, de `getSerieComparativa(…, 7, 2)`) — **7 días**;
* **"Actividad"** → 7 barras diarias (`actividad.tsx:53`) — **7 días**;
* **"Gasto por categoría"** → 5 barras apiladas `2026-S28…2026-S32` sumando $412,000 — **35 días**;
* **"Liquidado"** → **`$980,000.00`** en 24 px, sin ningún rótulo de tiempo (`panel-periodo.tsx:104-106`, `totalLiquidado` = suma de los 5 puntos semanales) — **35 días**;
* **"Top rutas por gasto"** → top-5 con `%` sobre $412,000 (`analytics.ts:1030-1034`, `ventanaDe(5)`) — **35 días**.

En **"Histórico"** la contradicción se invierte: la dona cuenta 3,650 días y
Top rutas no manda ventana (todo), pero "Gasto por categoría" y "Liquidado"
solo llegan a 52 semanas. Una flota con 2 años de captura ve la dona con 380
viajes y, debajo, un "histórico" de gasto que empieza hace un año.

**Consecuencia.** El contralor lee "esta semana liquidé $980,000" y lo cruza
contra su corte semanal: se equivoca por 5×. Es exactamente la regla del
producto que dice que si un filtro está en pantalla mueve TODO lo que hay
debajo, rota por el sitio que la anuncia. Y para el equipo: cambiar "qué es
semanal" hoy obliga a tocar cuatro archivos que no se conocen entre sí, sin
ninguna prueba que los ate.

**Causa raíz probable.** El concepto se modeló dos veces con unidades
distintas (días para los KPI, semanas ISO para las gráficas) porque cada
gráfica nació con su propia granularidad; cuando el 8-ago se unificó el
control, se unificó el `useState` y no el dominio. Síntoma delator: hay dos
tipos `ModoPeriodo` — `analytics.ts:422` (derivado de `SEMANAS_POR_MODO`,
**exportado y sin un solo importador**) y `actividad.tsx:3` (el que de verdad
usa `panel-periodo.tsx:8`), y el mapa de etiquetas está transcrito verbatim en
`kpi-periodo.tsx:14-18` y `motor-fiscal-periodo.tsx:11-13`.

---

### [ALTO] `dashboard/page.tsx` calcula `hoy` en UTC y se lo pasa a funciones que lo declaran en hora de México — todo el panel se corre un día a partir de las 18:00

`src/app/dashboard/page.tsx:89` (`const hoy = new Date(ahoraMs()).toISOString().slice(0, 10);`)
contra `src/lib/likida/analytics.ts:92`, `172`, `299`, `381`, `434`, `457`,
`491`, `1025` — los ocho declaran su default como
`new Date().toLocaleDateString('en-CA', { timeZone: TZ_MX })`, y el encabezado
de `getSerieComparativa` (`analytics.ts:70-88`) dice explícitamente que el
bucketeo va por **día LOCAL** «para no repetir el bug ya pagado» de
`getLiquidacionesPorDia`. Ese `hoy` viaja a `getGastoPorSemanaSeries`,
`getLiquidadoPorSemanaSeries`, `getSeriesKpiCards`, `getTopRutasPorGastoSeries`
y `getGastosFiscalesSeries` (`page.tsx:108, 109, 114, 121, 126`). De remate,
`fiscal.ts:831` declara el MISMO parámetro con el default contrario
(`toISOString().slice(0, 10)`, UTC): dos módulos que alimentan la misma página
no se ponen de acuerdo en qué es "hoy".

**Escenario con valores.** México no tiene horario de verano desde 2022: CST =
UTC−6. El servidor (Vercel) corre en UTC.

* Martes 8-ago-2026, **18:29 hora de México**. `hoy` = `'2026-08-08'`. Ventana
  "últimos 7 días" = `[08-02 … 08-08]`. "Gasto total — últimos 7 días" =
  **$150,400**, flecha **+4%** contra la semana previa.
* Dos minutos después, **18:31**. `Date.now()` ya es el 9-ago en UTC → `hoy` =
  `'2026-08-09'`. La ventana pasa a `[08-03 … 08-09]`: se cae el 2 de agosto
  (una carga de diésel de **$32,400**) y entra un día que en México todavía no
  empieza. El mismo KPI, sin que haya pasado nada, marca **$118,000** y la
  flecha se voltea a **−21%**.

El cierre de ejercicio es peor: `page.tsx:90` hace
`resolverPeriodo(undefined, hoy)`, cuyo default es `'ejercicio'`
(`fiscal.ts:104`) y toma el año de `hoy` (`fiscal.ts:135-148`). El 31-dic-2026 a
las 18:30 de México, `hoy` = `'2027-01-01'` → el bloque entero se retitula **"Tu
motor fiscal — Ejercicio 2027"**, y `diasEjercicio` (`page.tsx:91-93`) vale
**1**, así que `getAcreditables(tenantId, 1)` devuelve los litros de un solo
día: **"Diésel elegible para el estímulo: 0.00 L"** la noche exacta en que el
contralor está cerrando el año.

**Consecuencia.** El panel se contradice consigo mismo cada tarde a las 18:00 —
el momento del día en que un jefe de flota lo abre— y el contralor no tiene
forma de saber por qué. Ninguna prueba lo ve: los cuatro archivos de test
nuevos (`analytics_serie_comparativa.test.ts:44`, `analytics_semanal.test.ts`,
`analytics_rutas.test.ts`, `fiscal_series.test.ts:36`) pasan `hoy` explícito
(`'2026-08-08'`), así que el único camino sin probar es justo el de producción.

**Causa raíz probable.** El contrato de zona horaria vive en un valor por
defecto de parámetro, que es el sitio donde un llamador lo pisa sin que
TypeScript diga nada; y el llamador reusó el `hoy` que ya tenía a mano de
`ahoraMs()`, que es UTC.

---

### [ALTO] `costoPorViaje` se modela como `number | null` a propósito y el único consumidor lo aplana a `0` — la cifra que el tipo prohíbe inventar se imprime igual

`src/lib/likida/analytics.ts:58-61` contra `src/app/dashboard/kpi-periodo.tsx:67`.

El productor es explícito, en el mismo commit:

```
/** `null` sin viajes en el periodo — dividir entre cero daría Infinity, y
 *  "$0/viaje" se leería como que salió gratis, no como que no hay con qué
 *  medir. */
costoPorViaje: number | null;
```

El consumidor, 500 líneas más allá y del otro lado de la frontera
servidor/cliente: `valor={valorActual ?? 0}`. Y no tiene salida: `KpiDegradado`
(`resumen-visual.tsx:95-101`) declara `valor: number` y —a diferencia de
`KpiTile`— **no tiene la prop `vacio`**, así que no existe forma de decir "no
sé" sin cambiar el componente.

**Escenario con valores.** Semana del 3 al 9 de agosto: la flota no inició
ningún viaje nuevo (los tres que trae vienen de julio), pero se capturaron
$18,400 en comprobantes con `gasto.fecha` de esa semana. `getSerieComparativa`
devuelve `{ gastoTotal: 18400, totalViajes: 0, costoPorViaje: null }`. En
pantalla, uno al lado del otro:

> **$18,400.00** — Gasto total — últimos 7 días · **$0.00** — Costo por viaje — últimos 7 días

$0.00 con animación de count-up, tipografía tabular y la misma jerarquía visual
que la cifra medida de al lado.

**Consecuencia.** Es la regla número uno del producto rota por el tipo del
componente, no por descuido de una página: el contralor lee "$0 por viaje" como
una medición ("no me costó nada mover carga esta semana") y no como "no hubo
viajes que medir". Y es la reincidencia del MEDIO #6 del pase 1: el pase 2 tuvo
la oportunidad de arreglar la firma al crear un componente de KPI **nuevo**, y
copió la firma vieja quitándole además el único escape que tenía.

**Causa raíz probable.** La honestidad se modeló en el tipo del dato
(`number | null`) y no en el tipo del componente (`valor: number`); en esa
frontera el `??` es el camino de menor resistencia y TypeScript lo bendice.

---

### [MEDIO] La dona "Viajes" y la gráfica "Actividad" cuentan la misma cosa por dos caminos, uno agregado y otro topado a 100 filas — y están pegadas

`src/app/dashboard/panel-periodo.tsx:72-76` (dona, de `seriesKpis`) contra
`src/app/dashboard/panel-periodo.tsx:85` → `src/app/dashboard/actividad.tsx:53`
(barras, de `viajes`), con `src/lib/likida/analytics.ts:802` (`getViajes(tenantId, limite = 100)`,
`.order('created_at', { ascending: false }).limit(100)`).

La dona sale de `getSerieComparativa`, que usa `traerTodo` (pagina, sin el tope
de 1,000 de PostgREST) y cuenta **todos** los viajes con `fecha_inicio` en la
ventana. Las barras salen del arreglo `viajes` de `page.tsx:104`, capado a los
**100 más recientes por `created_at`**. El comentario de `actividad.tsx:33-36`
declara la suposición: «capado a 100 filas recientes — de sobra para 7/30 días».

**Escenario con valores.** Flota de 25 tractocamiones, 140 viajes iniciados en
los últimos 30 días. El contralor pone el selector en **"Mensual"**:

* dona "Viajes": **140** (96 liquidados / 44 pendientes) — agregado real;
* "Actividad", en la celda de al lado, misma fila: 30 barras que suman **100**
  como máximo, y no son ni siquiera las 100 con `fecha_inicio` más reciente
  sino las 100 creadas más tarde (un viaje capturado hoy con fecha del mes
  pasado desplaza a uno iniciado ayer).

**Consecuencia.** Dos conteos de "cuántos viajes hice este mes" a 200 píxeles
uno del otro, sin nada que explique la diferencia; el contralor suma las barras
y no le cuadran con la dona. Es exactamente el modo de falla que el producto no
se puede permitir en la sala. Además el tope silencioso es el mismo mecanismo
que `traerTodo` existe para evitar: aquí se reintrodujo por la puerta del
componente.

**Causa raíz probable.** Se reusó un arreglo que ya se cargaba para otra cosa
(`AvanceCierre`, `estadoPanel`) como fuente de una serie temporal, sin que el
tipo `ViajeRow[]` diga en ninguna parte que está truncado.

---

### [BAJO] `getGastoPorRuta` quedó huérfana y es una segunda implementación viva de "gasto por ruta"

`src/lib/likida/analytics.ts:888-912` contra `src/lib/likida/analytics.ts:974-998`
(`getTopRutasPorGasto`).

El rework de `page.tsx` la sustituyó por `getTopRutasPorGasto`
(`git grep getGastoPorRuta 94c0733 -- src/` la encontraba en
`dashboard/page.tsx:5` y `:109`; en HEAD no la importa nadie). Sigue exportada,
sin prueba propia, con el mismo join en memoria `gasto`×`viaje` y **sin el
parámetro `ventana`** que la nueva sí tiene.

**Escenario con valores.** Flota con $2.4M de gasto histórico y $180,000 en las
últimas 5 semanas. Quien conecte la sección "rutas" de `/dashboard/rentabilidad`
tiene dos funciones con nombres casi iguales en el mismo archivo:
`getGastoPorRuta('t1')` devuelve el top-5 de **toda la historia** (ruta como
string ya concatenado, sin `%` ni región), `getTopRutasPorGasto('t1', 5,
{desde,hasta})` devuelve otro top-5 —otro orden, otras rutas— para la ventana
pedida. Dos pantallas del mismo producto acaban con dos "Top rutas por gasto"
que no coinciden, y ninguna prueba lo detecta.

**Consecuencia.** No hay bug hoy: nadie la llama. El costo es de
mantenibilidad, y es el patrón exacto que este rubro persigue — la copia que
todavía no divergió porque todavía no tiene dos usuarios.

**Causa raíz probable.** La función nueva se escribió al lado de la vieja en
vez de encima de ella, y nada en el repo mide "símbolo exportado sin
consumidor" (es el mismo hueco que el MEDIO #5 del pase 1, `crear_viaje_wa.ts`).

---

## Lo que revisé y está bien

* **El motor de dinero sigue siendo puro y no se tocó.** `cuadre/engine.ts`,
  `cuadre/resumen.ts`, `liquidacion/deducibilidad.ts`, `liquidacion/acreditable.ts`
  no cambiaron un carácter en los 12 commits (`git diff 94c0733..HEAD --stat`
  no los lista). Las 454 líneas nuevas de `analytics.ts` **no reimplementan
  ningún cálculo del motor**: suman, agrupan y bucketean columnas ya
  persistidas (`gasto.monto`, `viaje.estatus`, `liquidacion.total_comprobado`).
  Verificado uno por uno: no hay proporción de deducibilidad, ni IVA, ni
  estímulo de peaje, ni tope diario en el código nuevo. **No apareció un tercer
  sitio que calcule dinero** — que era la pregunta dura del pase 2, y la
  respuesta es no.
* **`fiscal.ts +44` no duplica `deducibilidad.ts` ni `engine.ts`.**
  `getGastosFiscalesSeries` (`fiscal.ts:829-851`) es puro pegamento: llama tres
  veces a `getGastosFiscales`, que ya existía, con tres rangos. `resumirPerdidas`
  se aplica una sola vez por modo y **en el servidor** (`page.tsx:138-145`), con
  el comentario que explica por qué no puede vivir en el cliente. Cero lógica
  fiscal nueva.
* **La frontera servidor/cliente del rework está bien resuelta.** Los cuatro
  componentes cliente nuevos (`panel-periodo`, `kpi-periodo`,
  `motor-fiscal-periodo`, `gasto-semanal-chart`) reciben **datos planos ya
  calculados**; ninguno importa `analytics.ts` ni `fiscal.ts` en tiempo de
  ejecución (solo `import type`), y `pctCambio` se movió a `formato.ts` a
  propósito para no arrastrar `supabaseAdmin` al bundle. `KpiPeriodo` incluso
  documenta por qué `subeEsBueno` es un booleano y no una función
  (`kpi-periodo.tsx:41-47`). Es el tipo de frontera que el pase 1 pedía.
* **El retiro del rol `operador` no dejó huérfanos de código.** Cero
  comparaciones contra `'operador'` en producción; `RolAppUser`
  (`provisionar.ts:16`) es la única unión de roles y `admin/equipo/page.tsx:13`
  está tipado contra ella (un rol nuevo rompe la compilación); la mig. `0086`
  reescribe las 22 policies explícitamente en vez de `cascade` y deja el
  constraint del dominio con los 4 roles. Sobran dos restos inertes, sin
  consecuencia: `admin/mi-perfil/page.tsx:9-11` conserva `operador: 'Operador /
  Chofer'` en un `Record<string, string>` que ya no puede recibir esa llave, y
  `SessionTenant.operadorId` (`session.ts:46-47`) no tiene un solo lector de
  producción — la columna sigue viva para el bot, el campo de la sesión no.
* **`formato.ts` sigue siendo la única fuente de formato** y `fechaCorta`
  (`formato.ts:155-168`) entró ahí, no en el componente que la pedía. El
  guardarraíl de `toLocaleString('es-MX')` sigue midiéndose sobre el código sin
  comentarios y sigue verde.
* **`traerTodo`/`exigir` se usaron en todas las consultas nuevas** (siete
  funciones), incluida la razón por la que `getViajesPorMes` existe en vez de
  reusar `viajes` — el comentario de `analytics.ts:500-508` razona
  correctamente sobre el tope de 100. La ironía es que la sección de al lado
  (`Actividad`) sí lo reusa; ver el MEDIO de arriba.
* **`REGION_POR_CIUDAD`** (`analytics.ts:923-939`) es un mapa nuevo, pero vive
  en **un** sitio y su consumidor (`top-rutas.tsx`) solo colorea; una ciudad
  fuera del catálogo sale "Sin clasificar" en vez de adivinada. No es una
  verdad duplicada.
* **`recordatorio_comprobacion.ts`** (171 líneas nuevas) no duplica la máquina
  de escalamiento: reclama la fila con un UPDATE condicional antes de mandar,
  igual que `escalar_viaje.ts`, y su umbral (`DIAS_PARA_RECORDAR = 3`) es una
  constante exportada en un solo lugar. Único resto: su comentario dice «mismo
  umbral que "detenido" en `ViajesAtencion` (resumen-visual.tsx)» y
  `ViajesAtencion` se borró en `0657279` — comentario colgado, no verdad
  duplicada.

## Lo que NO alcancé a revisar

* **`src/lib/likida/facturacion/`** (~4,000 líneas, `al_vuelo.ts`,
  `comercios.ts`, `capufe.ts`). Sigue siendo la subcarpeta grande que no abrí a
  fondo; `capufe.ts:896` compara dinero con tolerancia y merece una pasada de
  fronteras propia. Segundo pase consecutivo que se queda fuera.
* **`processor.ts` (1,400+ líneas) y `src/lib/agents/`.** El MAPA dice que tool
  calling no se reaudita este pase, pero el reparto de responsabilidad
  `processor.ts` ↔ `conv.ts` ↔ `tools.ts` es de arquitectura y sigue sin
  auditarse como tal. `processor.ts` cambió +30/−… en `c5a7c19`.
* **Los cuatro subconjuntos de `TipoDiferencia` escritos a mano**
  (`NO_DEDUCIBLE_ISR`/`POR_CONFIRMAR` en `engine.ts:100-101`,
  `SIN_ACREDITAMIENTO` en `engine.ts:985`, `SOLO_CONTRALOR` en `resumen.ts:24`):
  sigue sin prueba de exhaustividad. Lo dejé otra vez porque decidir qué
  subconjunto le toca a un tipo nuevo es veredicto fiscal, no mío — pero el
  hueco estructural (un tipo nuevo cae por omisión en "acredita") sigue ahí y
  vale la pena que alguien del rubro fiscal lo cierre.
* **`supabase/migrations/` (85 archivos) contra `src/types/likida.ts`.** No
  comparé esquema contra tipos. Es el otro lugar clásico donde una verdad se
  duplica y no lo cubrí en ninguno de los dos pases.
* **El resto de `/dashboard` fuera del Resumen.** Concentré el pase 2 en las
  seis pantallas nuevas y en verificar los ocho hallazgos del pase 1; las ~25
  páginas restantes solo las barrí buscando accesos a datos fuera de patrón, no
  duplicación interna.
