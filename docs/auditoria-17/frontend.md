# Frontend — auditoría 17 (pase 2)

**Nota: 4/10** (antes 6). Razón del movimiento: **deuda que cobró factura**. El
rework del dashboard del dueño (8 commits, `page.tsx` reescrito, 5 componentes
nuevos, `analytics.ts` +454) borró dos hallazgos del pase 1 al borrar su código,
pero **ninguno de los cinco hallazgos abiertos que no dependían del rework se
tocó** (los cinco siguen textualmente iguales), y la superficie nueva llegó
**sin una sola prueba de render** — `actividad.test.ts` prueba `bucketsPorDia`,
`estado.test.ts` prueba `estadoPanel`, y nada más de los cinco componentes
nuevos tiene prueba. Sobre esa superficie sin red aparecieron: un camino que
deja la pantalla de aterrizaje del dueño **en blanco** con dos clics normales,
un selector único que gobierna **cinco ventanas de tiempo distintas** sin
rotular ninguna, dos ceros que se leen como medición estando la consulta caída,
y 16 páginas del panel que se quedaron sin un solo link.

Riesgo mayor hoy: en el demo, expandir el asistente y volver a "Resumen" pinta
el panel del contralor **vacío y no clickeable**, sin ningún control en pantalla
que lo revierta.

---

## Estado de los hallazgos del pase 1

| # | Hallazgo del pase 1 | Estado |
|---|---|---|
| 1 | "Vencen pronto (≤ 5 días)" cuenta solo lo ya vencido | **REINCIDENTE** |
| 2 | "Comprobación del periodo" en /dashboard/cuadre no filtra por fecha | **REINCIDENTE** |
| 3 | "PDF por liquidación" de Analítica pierde el `?tenant=` | **REINCIDENTE** |
| 4 | Asistente expandido bajo 1280 px deja el panel en blanco | **REINCIDENTE (4ª ronda) y AGRAVADO** |
| 5 | "Viajes activos 0" / "Aún no hay viajes registrados" con la consulta caída | **BORRADO CON SU CÓDIGO — el patrón REAPARECE en 3 sitios nuevos** |
| 6 | "Litros elegibles: 0.00 L" con la cita legal al lado | **REINCIDENTE** |
| 7 | /mis-viajes imprime "$0.00 comprobado" | **BORRADO CON SU ARCHIVO** |
| 8 | El panel manda al chofer a una ruta que ya no es la suya | **REINCIDENTE y AGRAVADO** (la ruta ahora es 404) |
| 9 | `HBars` usa el nombre humano como key en una lista de dinero | **CERRADO por borrado del call site** |

**1 · REINCIDENTE.** `src/app/dashboard/arco/page.tsx:71` sigue siendo
`venceEn(s.venceEn) <= hoy` y `:87` sigue rotulando `"Vencen pronto (≤ 5 días)"`.
`:31` sigue siendo `new Date().toISOString()` (UTC). Sin cambios desde el pase 1.

**2 · REINCIDENTE.** `src/app/dashboard/cuadre/page.tsx:67` sigue llamando
`getKpis(tenantId)` sin `ventanaDias`; `:87` sigue diciendo
`"Comprobación del periodo"` y `:117` `"sobre el total del periodo"`. La página
sigue sin ningún control de fecha.

**3 · REINCIDENTE.** `src/app/dashboard/analitica/page.tsx:121` sigue siendo
`<Link href="/dashboard/cuadre">` pelón, con el `extra` del `GlobalFilter` ya
calculado 70 líneas arriba (`:51`) y sin reusar. Sigue siendo el único
`href="/dashboard…"` del panel sin sufijo.

**4 · REINCIDENTE Y AGRAVADO.** `rail.tsx:97` sigue siendo `hidden xl:flex` y
`:48-50` sigue limpiando el `dataset` solo en el cleanup del efecto
(`[expandido]`). El gemelo de /admin (`admin/asistente-expandible.tsx:61` con
`opacity: expandido ? 0 : 1` en `:47`) tampoco cambió. Y el rework le agregó un
segundo disparador **que no necesita cambiar el ancho de la ventana** — ver el
CRÍTICO abajo.

**5 · BORRADO CON SU CÓDIGO, PATRÓN REAPARECIDO.** El call site que reporté
(`page.tsx:255`, `valor={viajesActivos ?? 0}`) ya no existe: la fila de KPIs se
reescribió entera. Pero `KpiDegradado` sigue tipando `valor: number` sin `vacio`
(`resumen-visual.tsx:96,100`), así que el mismo `?? 0` volvió en tres call sites
nuevos: `page.tsx:274` (Ahorro generado), `kpi-periodo.tsx:67` (Costo por
viaje), y en la forma `porMes ?? []` en `page.tsx:324`. Ver los ALTO 3, 4 y 5.

**6 · REINCIDENTE.** `src/app/dashboard/combustible-casetas/page.tsx:183` sigue
siendo `valor={acred?.litrosDiesel ?? 0}` con `nota="LIF 2026, Art. 20-A"` al
lado, y su vecino de `:187` sigue usando `vacio` correctamente. Sin cambios.

**7 · BORRADO CON SU ARCHIVO.** `src/app/mis-viajes/` y `src/app/chofer/` ya no
existen (`31babfd`). Verificado: `ls src/app | grep -iE "chofer|mis-viajes"` →
vacío.

**8 · REINCIDENTE Y AGRAVADO.** Ver el MEDIO 10: la frase sigue igual, pero la
ruta que nombra ahora es un 404 y el rol que describe ya no existe en el tipo.

**9 · CERRADO.** El call site que rompía el contrato (`page.tsx:345`,
`etiqueta: o.nombre` sobre `getOperadoresDetalle`) desapareció con la reescritura.
`HBars` solo se usa hoy en `/admin` con claves únicas (`admin/flotas:189`
nombre de flota, `admin/conversaciones:47` teléfono, `admin/model-ops:118`
modelo). El contrato de `HBars` sigue débil, pero ya no hay call site que lo
rompa.

---

## Hallazgos

### [CRÍTICO] Expandir el asistente y volver a "Resumen" deja el panel del dueño en blanco, sin control visible que lo revierta

`src/app/dashboard/rail.tsx:47-51` (el efecto), `src/app/dashboard/rail.tsx:82`
(`if (pathname === '/dashboard') return null;`),
`src/app/globals.css:217-223`, `src/app/dashboard/chrome.tsx:92,100`

`RailAsistente` vive en `chrome.tsx` (línea 100), que vive en `layout.tsx`, así
que **no se desmonta al navegar dentro de /dashboard**: `usePathname()` cambia,
el componente re-renderiza, pero el estado `expandido` sobrevive y el efecto de
`:47-51` tiene deps `[expandido]` — no vuelve a correr y su cleanup no se
dispara. El `return null` de `:82` es nuevo del rework (`c8245fb`: el Resumen se
quiere a ancho completo).

Escenario, con clics reales:
1. El presentador está en `/dashboard/cuadre?vista=demo`. Pulsa el botón
   "Expandir chat a pantalla completa" (`rail.tsx:105`). El efecto pone
   `document.documentElement.dataset.asistente = 'expandido'`.
2. El chat expandido es `fixed top-4 right-4 bottom-4 left-[264px]`
   (`marco.ts:MARCO_ASISTENTE_EXPANDIDO`) — **no cubre el sidebar**, que sigue
   visible y clickeable en x = 16…248 px.
3. Hace clic en "Resumen" del sidebar (`sidebar-nav.tsx:113`, un `<Link>`
   cliente a `/dashboard?vista=demo`).
4. `pathname === '/dashboard'` → `rail.tsx:82` devuelve `null`: **el aside
   entero desaparece, y con él el botón de contraer.** El efecto no corrió (
   `expandido` sigue en `true`), así que `data-asistente="expandido"` **sigue
   puesto en `<html>`**.
5. `globals.css:217-223` aplica sobre `.columna-centro` (la clase que
   `chrome.tsx:92` le pone a la columna de contenido): `opacity: 0`,
   `transform: translateX(-24px)`, `pointer-events: none`.

Sale: la pantalla de aterrizaje del dueño —hero, KPIs, motor fiscal, las cinco
gráficas— renderizada e **invisible y no clickeable**. Quedan el fondo y el
sidebar. No hay ningún control en pantalla que lo revierta: el único botón que
limpia la marca es el de contraer, que acaba de desaparecer. La única salida es
recargar (F5) o adivinar que hay que volver a otra página del panel para que el
aside reaparezca, contraerlo ahí, y regresar.

Consecuencia: el contralor pide "enséñame el resumen" después de que le
enseñaron el chat, y ve el panel vacío. No es un dato mal, es el producto
aparentando estar roto en la pantalla que lo vende. A diferencia del hallazgo 4
del pase 1 (que exigía cambiar el ancho de la ventana), **este se dispara con
dos clics del flujo normal de demo, a cualquier resolución ≥ 1280 px.**

Causa raíz probable: el `return null` del rework se agregó sin considerar que el
estado que el componente publica al `<html>` sobrevive a su propio render nulo.

---

### [ALTO] Un solo pill "Semanal / Mensual / Histórico" gobierna cinco ventanas de tiempo distintas, y no rotula ninguna

`src/app/dashboard/panel-periodo.tsx:44-51` (un solo `modo` para las cinco),
`:55-65` (el pill), `:70`, `:93`, `:103`, `:125` (los cuatro `TituloSeccion`, sin
ventana). Las ventanas: `src/lib/likida/analytics.ts:421`
(`SEMANAS_POR_MODO = { semanal: 5, mensual: 13, historico: 52 }`),
`analytics.ts:174-178` (`getSeriesKpiCards` → 7 / 30 / **3650** días),
`src/app/dashboard/actividad.tsx:53` (7 / 30 días / `porMes` sin cota),
`analytics.ts:1033-1037` (Top rutas → 35 días / 91 días / **sin cota**).

Con el pill en **"Semanal"**, que es el estado inicial (`modoIdx = 0`), las
cinco secciones de abajo consultan:

| Sección | Ventana real con "Semanal" | Con "Histórico" |
|---|---|---|
| Viajes (dona) | **7 días** | 3 650 días |
| Actividad | **7 días** | todo, sin cota |
| Gasto por categoría | **35 días** | **364 días** |
| Liquidado | **35 días** | **364 días** |
| Top rutas por gasto | **35 días** | todo, sin cota |

Escenario con valores: flota con $61,000 de gasto en los últimos 7 días y
$305,000 en las últimas 5 semanas. El contralor abre `/dashboard`. Arriba lee
`Gasto total — últimos 7 días · $61,000.00` (`kpi-periodo.tsx:66-67`, que **sí**
rotula su ventana). Baja, ve el pill en **Semanal**, y la gráfica "Gasto por
categoría" cuyas barras suman **$305,000** — sin ninguna etiqueta de periodo
salvo `2026-S28 … 2026-S32` en el eje X. Al lado, "Liquidado" imprime un total
grande en pesos (`panel-periodo.tsx:104-106`) que también es de 5 semanas, con
cero rótulo. Y "Viajes" (dona) le da 9 viajes — de 7 días.

Si divide el gasto que ve ($305,000) entre los viajes que ve (9), obtiene
$33,900 por viaje; la tarjeta de arriba, con el mismo pill en el mismo estado,
dice `Costo por viaje — últimos 7 días $6,780`. **Factor 5 de diferencia, en la
misma pantalla, bajo la misma palabra.**

Con "Histórico" es peor y el propio código lo sabe: `analytics.ts:1019-1022`
documenta, para Top rutas, *«"histórico" no manda ventana en absoluto (sin
cota), no una de 52 semanas disfrazada de "todo"»* — y las dos funciones de al
lado (`getGastoPorSemanaSeries`, `getLiquidadoPorSemanaSeries`) hacen
exactamente las 52 semanas disfrazadas de "todo". Una flota con gasto de hace 14
meses ve "Top rutas (Histórico)" sumando $1,200,000 mientras "Gasto por
categoría (Histórico)" suma $780,000.

Consecuencia: el contralor cruza contra su PDF y ninguna de las dos cifras
cuadra. Es la regla que `CLAUDE.md` llama "un rótulo tiene que ser verdad" y
"un filtro en pantalla mueve TODO lo que hay debajo" — el filtro mueve las cinco,
pero cada una a otro sitio, y ninguna dice a cuál. `KpiPeriodo` y
`MotorFiscalPeriodo` sí rotulan su ventana (`kpi-periodo.tsx:14-18`,
`motor-fiscal-periodo.tsx:11-13,63,70`), lo que hace la omisión de
`PanelPeriodo` más difícil de detectar: el usuario aprende de las tarjetas de
arriba que "Semanal = últimos 7 días" y aplica esa lectura a lo de abajo.

Causa raíz probable: el pill se unificó (`75715b5`) reusando cinco funciones
`*Series` que ya existían con tres mapeos de ventana distintos, sin unificarlos
ni exponer la ventana resuelta en pantalla.

---

### [ALTO] "Ahorro generado — Ejercicio 2026: $0.00" cuando la consulta falló, al lado del mismo número real

`src/app/dashboard/page.tsx:272-274` (el tile), `:128-130` (`resumenPerdidas`),
`:138-145` (`resumenPerdidasSeries`), `:116` y `:121` (dos `safe()` distintos)

`resumenPerdidas` depende de `getGastosFiscales`; `resumenPerdidasSeries`
depende de `getGastosFiscalesSeries` — **dos consultas independientes**, cada
una en su propio `safe()`. Ninguna de las dos está en `estadoPanel`
(`estado.ts:30` solo mira `acreditables/kpis/liquidaciones/anomalias`), así que
su caída **no** pinta la banda "Faltan datos por cargar".

Escenario: `getGastosFiscalesSeries` responde y `getGastosFiscales` no (timeout
de PostgREST en la consulta del ejercicio completo, que es la más grande de las
dos). El contralor ve, en la misma pantalla y a 200 px de distancia:

- `Ahorro generado — Ejercicio 2026` · **$0.00** (tarjeta con degradado de
  marca, `page.tsx:272-274` → `valor={resumenPerdidas?.montoRecuperable ?? 0}`)
- `Recuperable pidiendo factura` · **$340,000.00** · `histórico`
  (`motor-fiscal-periodo.tsx:66-70`)

El propio comentario de `page.tsx:256-260` dice que son **el mismo número**
("mismo número que 'Recuperable pidiendo factura' en Motor fiscal, pero fijo al
ejercicio fiscal completo"). No hay banda de aviso, ni guion, ni nada que
explique el cero.

Consecuencia: el diferenciador del producto —"lo que Likida te recupera"—
anunciado en $0.00 estando ciego, con la cifra verdadera a la vista dos tarjetas
después. En una sala, es la peor lectura posible: o el producto no recupera
nada, o se contradice solo.

Causa raíz probable: `KpiDegradado` sigue tipando `valor: number` sin la prop
`vacio` que `KpiTile` sí tiene (`resumen-visual.tsx:96,100`), así que el call
site no tiene forma de decir "—" y rellena con `?? 0`.

---

### [ALTO] "Aún no hay viajes registrados" con la consulta de histórico caída, y sin banda de aviso

`src/app/dashboard/page.tsx:125` (`safe(() => getViajesPorMes(tenantId))`),
`:324` (`porMes={viajesPorMes ?? []}`), `src/app/dashboard/actividad.tsx:54,59`,
`src/app/dashboard/estado.ts:30`

`getViajesPorMes` es una consulta paginada sobre `viaje` sin cota superior
(`analytics.ts:509-528`), la más cara de la página. Si falla, `safe()` la
convierte en `null`, `page.tsx:324` la convierte en `[]`, y `actividad.tsx:54`
hace `porMes.every((d) => d.valor === 0)` → `[].every(...)` es **`true`** →
`:59` imprime **"Aún no hay viajes registrados."** en el recuadro "Actividad".

Escenario: flota con 640 viajes desde enero. El pill está en "Histórico".
`getViajesPorMes` da timeout; las otras once consultas responden. La pantalla
dice, en el recuadro grande de dos tercios de ancho: **"Aún no hay viajes
registrados."** Y arriba, en la dona "Viajes", 640 viajes de `seriesKpis`. Dos
afirmaciones opuestas sobre el mismo negocio, en la misma pantalla, a 40 px.

Peor: `viajesPorMes` **no está en `estadoPanel`** (`estado.ts:30`), así que la
banda "Faltan datos por cargar — esta pantalla está incompleta"
(`page.tsx:237-249`) **no se pinta**. El único aviso posible no aparece.

Consecuencia: es literalmente el fallo que `estado.ts:10-12` documenta como el
que costó la nota de la auditoría 5 — *«"aún no hay liquidaciones" es una
AFIRMACIÓN sobre el negocio del cliente, y solo se puede hacer cuando TODO cargó
bien»*. El rework agregó seis consultas nuevas (`gastoSemanalSeries`,
`liquidadoSemanalSeries`, `seriesKpis`, `gastosFiscalesSeries`, `viajesPorMes`,
`topRutasSeries`) y **no agregó ninguna a `SeccionesPanel`**.

Causa raíz probable: `estadoPanel` se dejó con las cuatro secciones de la página
vieja mientras la página nueva pasó de 5 a 12 consultas.

---

### [ALTO] "Costo por viaje $0.00" — el cero que `analytics.ts` prohíbe explícitamente, reintroducido en el call site

`src/app/dashboard/kpi-periodo.tsx:57,67`; el contrato en
`src/lib/likida/analytics.ts:58-61` y `:146`

`ComparativoPeriodo.costoPorViaje` es `number | null`, y su docstring dice con
todas las letras:

```
/** `null` sin viajes en el periodo — dividir entre cero daría Infinity, y
 *  "$0/viaje" se leería como que salió gratis, no como que no hay con qué
 *  medir. */
costoPorViaje: number | null;
```

`kpi-periodo.tsx:67` hace `valor={valorActual ?? 0}` y `KpiDegradado`
(`resumen-visual.tsx:117`) lo formatea con el preset `mxn`.

Escenario con valores: semana de puente. La flota no abrió ningún viaje nuevo
entre el 3 y el 9 de agosto (`totalViajes = 0`), pero sí cargó $48,200 de diésel
de viajes abiertos la semana anterior (`gastoTotal = 48200`, porque `gasto.fecha`
sí cae en la ventana). `getSerieComparativa` (`analytics.ts:146`) devuelve
`costoPorViaje: null` correctamente. La tarjeta pinta:

> **Costo por viaje — últimos 7 días** · **$0.00**

al lado de **Gasto total — últimos 7 días · $48,200.00**. Gastaste $48,200 y el
costo por viaje es cero.

Consecuencia: el contralor lee un indicador de eficiencia en su mejor valor
posible ($0 por viaje) justo la semana que no movió nada. Es una cifra inventada
en la tarjeta que mide la métrica que él compra. Y ocurre igual en las tres
vistas: basta con que la ventana elegida no tenga viajes iniciados.

Causa raíz probable: la misma que el ALTO anterior — `KpiDegradado` no admite un
valor ausente, así que el `?? 0` es el único camino que compila.

---

### [ALTO] "Gasto por categoría" desborda su columna y se recorta en "Mensual" y "Histórico"

`src/app/dashboard/gasto-semanal-chart.tsx:44,50,55`,
`src/app/dashboard/panel-periodo.tsx:91-100` (la celda, sin `overflow-x`),
`src/app/dashboard/page.tsx:179` (`glass-panel overflow-hidden`, quien recorta),
`src/lib/likida/analytics.ts:421` (5 / 13 / **52** semanas)

El contenedor de barras es `className="relative flex-1 flex items-end gap-3"`
(`:50`). `flex-1` = `flex: 1 1 0%` pero `min-width` sigue en `auto` para un
flex item, así que **no puede encogerse por debajo de su min-content**. Dentro
van `categorias.length` clusters (`:55`), cada uno con su etiqueta de semana
`2026-S32` (min-content ≈ 27 px, rompe tras el guion) y `gap-3` = 12 px entre
clusters.

Aritmética, a 1440 px de viewport: columna central = 1440 − 32 (padding) − 232
(sidebar) − 16 − 276 (rail) − 16 = **868 px**; menos `px-5` = 828; el grid es
`md:grid-cols-2 gap-4` → cada celda ≈ **406 px**; menos el eje Y de 44 px y el
`gap-2` → **~354 px** disponibles.

| Vista | Clusters | Ancho mínimo requerido | Disponible |
|---|---|---|---|
| Semanal | 5 | 5·27 + 4·12 = **183 px** | 354 px ✔ |
| Mensual | 13 | 13·27 + 12·12 = **495 px** | 354 px ✘ |
| Histórico | 52 | 52·27 + 51·12 = **2 016 px** | 354 px ✘✘ |

La celda del grid usa `grid-cols-2` (Tailwind v4 → `repeat(2, minmax(0,1fr))`),
así que la pista no crece: el contenido **se sale** de ella. Nadie declara
`overflow-x: auto` en el camino (el único de `PanelPeriodo` está en `:126`, y es
para Top rutas). El primer ancestro con recorte es
`page.tsx:179` — `glass-panel overflow-hidden`.

Escenario: el contralor pulsa "Histórico" en el pill. Las 52 semanas se dibujan
a 2 016 px dentro de una celda de 354: las barras invaden y tapan la columna
"Liquidado" de la derecha (los clusters llevan `z-10`, `gasto-semanal-chart.tsx:56`),
y el resto se corta a filo contra el borde del panel. **No hay scroll**: el
recorte es `overflow: hidden`, no `auto`. Con "Mensual" (13 semanas, 495 px) el
desbordamiento es de ~140 px — menos escandaloso, igual de invisible el último
mes y medio.

Consecuencia: dos de las tres posiciones del selector principal del Resumen
rompen la maquetación de la pantalla de aterrizaje, y una de ellas tapa la cifra
de "Liquidado". Es exactamente la clase de cosa que se ve en la sala y no en
`vitest`.

*(Derivado del código y de la aritmética de layout — no reproducido en un
navegador; ver "Lo que NO alcancé a revisar".)*

Causa raíz probable: `GastoSemanalChart` nació el 8-ago para 5 columnas fijas
(`getGastoPorSemana` tenía `semanas = 5` por defecto) y horas después el
selector unificado empezó a pedirle 13 y 52 sin tocar el componente.

---

### [ALTO] 16 páginas del panel se quedaron sin un solo link — entre ellas /dashboard/arco, la del plazo legal de 20 días

`src/app/dashboard/sidebar-nav.tsx:120` (solo pinta `SIDEBAR_PRINCIPAL` y
`FISCAL`), `src/app/dashboard/rutas.ts:80-96` (`SIDEBAR_PRINCIPAL`, 8 items)

Antes del rework el sidebar pintaba seis secciones
(`INICIO/FISCAL/NEGOCIO/OPERACION/DOCUMENTOS_DINERO/GESTION` = 30 items). Hoy
pinta `Resumen` + `SIDEBAR_PRINCIPAL` (8) + `FISCAL` (6) = 15. Verificado con
`grep -rn "dashboard/arco\|dashboard/usuarios\|dashboard/documentos" src/app`:
**el único sitio del código que menciona esas rutas es `rutas.ts`**, que ya no
las pinta. Las 16 huérfanas: `analitica`, `chat`, `rentabilidad`, `clientes`,
`combustible-casetas`, `pod`, `unidades`, `mapa`, `cotizador`, `documentos`,
`arco`, `soporte`, `usuarios`, `politicas`, `suscripcion`, `configuracion`.
(`configuracion` conserva un link, desde `unidades/page.tsx:145` — que a su vez
es huérfana.)

Escenario concreto: un chofer ejerce su derecho ARCO. La solicitud entra y
queda en la tabla. El `flota_admin` abre el panel para contestarla — la flota es
la responsable obligada y tiene **20 días hábiles** (LFPDPPP art. 32, citado en
la propia pantalla, `arco/page.tsx:83`). Recorre el sidebar entero: Resumen,
Despacho, Viajes, Incidencias, Operadores, Cuadre, Facturación, Cobranza, Valor
y ahorro, y la sección Fiscal. **"Privacidad (ARCO)" no está en ninguna parte.**
La página existe y funciona en `/dashboard/arco`, pero solo si alguien teclea la
URL. El plazo corre sin que nadie vea el tile "Por responder".

Consecuencia: un incumplimiento del art. 32 con multa, causado por una lista de
navegación. Lo mismo aplica a "Documentos (OCR)" —la pantalla que prueba que el
producto leyó los tickets— y a "Usuarios & Roles", la única forma de dar de alta
al contador de la flota. El comentario de `rutas.ts:82-88` asume que "accesibles
por URL directa" es una salida aceptable; para un contralor que nunca vio la
app, no existe lo que no está en el menú.

Causa raíz probable: `SIDEBAR_PRINCIPAL` se introdujo como "los 9 que importan
todos los días" sin un segundo nivel (overflow, "Más", buscador) para las otras
16, y nada mecánico vigila que toda ruta de `TODAS_LAS_RUTAS` tenga al menos un
link entrante.

---

### [MEDIO] "Aún no hay gastos capturados" cuando la consulta falló — su gráfica hermana sí distingue el caso

`src/app/dashboard/panel-periodo.tsx:95-99` (Gasto por categoría) contra
`:108-118` (Liquidado, correcto) y `:127-131` (Top rutas, correcto);
`src/app/dashboard/page.tsx:108` (`safe(() => getGastoPorSemanaSeries(...))`)

Las tres secciones reciben `null` cuando su consulta falla. Dos lo tratan bien:
`Liquidado` pinta *"No se pudo cargar esta gráfica."* (`:109-111`) y `Top rutas`
*"No se pudo cargar esta sección."* (`:130`). La tercera colapsa los dos casos:

```tsx
{gastoModo && gastoModo.series.some((s) => s.valores.some((v) => v > 0)) ? (
  <GastoSemanalChart … />
) : (
  <p …>Aún no hay gastos capturados.</p>
)}
```

Escenario: la flota tiene 340 gastos capturados este mes. `getGastoPorSemanaSeries`
—que son tres consultas paginadas sobre `gasto`, la más pesada del bloque— da
timeout. La pantalla dice **"Aún no hay gastos capturados."** y, en la columna
de al lado, "Liquidado $612,400" con su gráfica llena. Y otra vez: `gastoSemanalSeries`
no está en `estadoPanel`, así que tampoco sale la banda de "parcial".

El mismo patrón, más leve, en la dona "Viajes" (`:72-79`): con `seriesKpis` en
`null` imprime *"Aún no hay viajes registrados en este periodo."* Ahí sí hay una
señal indirecta —la fila de KPIs de arriba cambia a "No se pudo cargar el
comparativo de KPIs." (`page.tsx:277`)— pero el texto de la dona sigue siendo una
afirmación falsa sobre el negocio.

Consecuencia: el mismo archivo demuestra que el autor conoce la regla y la
aplicó en dos de cuatro sitios. Para el que mantenga esto, la inconsistencia es
peor que el bug: no hay forma de saber cuál texto es el intencional.

Causa raíz probable: los cuatro bloques se escribieron en la misma sesión y solo
dos recibieron la rama de `null`.

---

### [MEDIO] Las flechas de periodo miden 16 × 16 px y son el único control de esas cinco tarjetas

`src/app/dashboard/kpi-periodo.tsx:10` (`const BOTON = 'w-4 h-4 …'`), `:73-82`
(`gap-0.5`); `src/app/dashboard/motor-fiscal-periodo.tsx:7` (idéntico), `:49`
(`gap-0`)

`w-4 h-4` = **16 × 16 px CSS**. WCAG 2.2 SC 2.5.8 (Target Size, Minimum, nivel
AA) pide 24 × 24, o bien que un círculo de 24 px centrado en cada objetivo no
toque el de otro objetivo. En `kpi-periodo.tsx:73` los dos botones van con
`gap-0.5` = 2 px → centros a 18 px → los círculos de 24 se intersectan:
**falla también la excepción de espaciado**. En `motor-fiscal-periodo.tsx:49` el
gap es **0** — dos objetivos de 16 px pegados.

Escenario: el contralor mira el demo en un iPad o en una laptop táctil. Quiere
ver "En riesgo / perdido" del mes en vez de la semana, y toca la flecha ‹ de esa
tarjeta. Su yema cubre ~34 px; entre ‹ (16 px) y › (16 px) pegados no hay hueco.
Toca ›, la tarjeta se va a "histórico" en vez de a "últimos 30 días", y el
número cambia en la dirección contraria. No hay otra forma de mover esas
tarjetas: no aceptan teclado más allá del tab, ni tienen un pill como
`PanelPeriodo`.

Consecuencia: cinco tarjetas de dinero (Gasto total, Costo por viaje, En riesgo,
Recuperable, y las de arriba) cuyo periodo solo se cambia acertándole a un
objetivo que reprueba AA. Y como el rótulo del periodo va en texto de 11 px
(`resumen-visual.tsx:116` opacidad 0.85 / `motor-fiscal-periodo.tsx:63` a 10 px),
el toque equivocado es difícil de notar.

Causa raíz probable: las flechas se dimensionaron para caber bajo el círculo del
ícono (36 px) sin revisar el mínimo de toque; el repo tenía la constante
(`TOQUE = {normal:48, principal:56}`) solo en `/chofer`, que se borró.

---

### [MEDIO] El panel manda al chofer a `/mis-viajes`, una ruta borrada, y describe un rol que ya no existe en el tipo

`src/app/dashboard/usuarios/page.tsx:16`; el dominio en
`src/lib/auth/provisionar.ts:16`; la ruta borrada en `31babfd`

```ts
operador: 'No entra a este panel: usa WhatsApp y /mis-viajes',
```

`RolAppUser` es hoy `'superadmin' | 'flota_admin' | 'contador' | 'encargado'`
(`provisionar.ts:16`) — `operador` salió del dominio con la migración `0086`, y
`visibilidad.ts:32` lo dice explícito (*"`operador` NO aparece: no tiene login"*).
`src/app/mis-viajes/` ya no existe.

Escenario: el `flota_admin` abre `/dashboard/usuarios` (tecleando la URL — ver
el ALTO anterior), lee esa línea, y le manda a su chofer
`https://app.likida.ai/mis-viajes`. El chofer recibe el **404** de
`src/app/not-found.tsx`. Llama a la oficina; la oficina llama a soporte.

Además, `ROLES` es un `Record<string, string>` (`:12`), no
`Record<RolAppUser, string>` como sí lo es `admin/equipo/page.tsx` — por eso la
clave muerta no rompe la compilación. Es el modo de falla dominante del rubro:
un mapa literal del panel que ya no cuadra con `src/types/`. Los otros dos
supervivientes (`chrome.tsx:30` y `admin/mi-perfil/page.tsx:10`) son inocuos —
son fallbacks de insignia para un rol que nadie puede tener— porque no nombran
una ruta.

Consecuencia: la única pantalla del panel que explica los roles apunta a un 404
y describe un rol que la base ya no acepta.

Causa raíz probable: `31babfd` retiró el rol de la base, del guard y de las
rutas, pero no del texto del panel; el `Record<string, …>` no lo delató.

---

## Lo que revisé y está bien

**Los mapas literales contra `src/types/` y los dominios** (trabajo obligatorio
del rubro — re-revisados los que el rework tocó o creó):

- `ETIQUETA_MODO` en `kpi-periodo.tsx:14-18` y `motor-fiscal-periodo.tsx:11-13` —
  `Record<Modo, string>` con `Modo` cerrado a los tres literales; un cuarto modo
  rompe la compilación. Es el patrón correcto.
- `CONCEPTO_LABEL` en `gasto-semanal-chart.tsx:9-13` — las 9 claves de
  `ConceptoGasto` (`types/likida.ts:20-25`) más `otro`, con `?? s.nombre`
  (`:42`, `:78`). `getGastoPorSemana` (`analytics.ts:398`) ya normaliza el nulo
  a `'otro'`.
- `COLOR_REGION` en `top-rutas.tsx:9-16` — parcial **a propósito**: `colorDe`
  cae a `--muted` y el texto a "Sin clasificar" (`:50`), nunca a una región
  inventada. Cuadra con `regionDe` (`analytics.ts:940-956`).
- `ROL_BADGE` (`chrome.tsx:26-32`), `FASE_LABEL` (4 copias), `ESTATUS`
  (`estatus.ts:17-27`), `ESTATUS_VIAJE` (`viajes/vista.tsx:23-27`),
  `TIPOS/PRIORIDADES/ESTADOS` (`incidencias/vista.tsx:11-23`), `ESTADO_UNIDAD`
  (`unidades/vista.tsx:15-20`), POD (`pod/vista.tsx:13-19`), ARCO
  (`arco/page.tsx:14-16`) — sin cambios desde el pase 1 y todos siguen cuadrando
  con su dominio, todos con fallback.

**Formato de cifras.** Sigue habiendo una sola fuente: `src/lib/formato.ts`. Las
dos funciones nuevas del rework viven ahí y no en el componente —`pctCambio`
(`:57-70`, con el `base === 0 → null` correcto: no hay "+∞%") y `fechaCorta`
(`:155-168`, misma regla de zona que `fechaMx`)—. `formato.test.ts` bloquea
`toLocaleString('es-MX')` fuera del archivo y sigue verde.

**El pill sí mueve las cinco secciones.** Comprobado una por una que ninguna
está clavada: `panel-periodo.tsx:47-51` deriva las cinco de `modo`, y las cinco
funciones de servidor sí filtran por fecha —`getSerieComparativa` (`:94-101`
límites, `:131` `enRango`), `getGastoPorSemana` (`:389` `gte/lte` sobre `fecha`),
`getLiquidadoPorSemana` (`:465`), `getTopRutasPorGasto` (`:982`), `getViajesPorMes`
(agregado real)—. El problema no es que no filtren: es que filtran a ventanas
distintas sin decirlo (ALTO 2).

**Zonas horarias del rework.** `getSerieComparativa` bucketea `liquidacion.created_at`
(timestamptz) por día LOCAL MX (`analytics.ts:130,142`) y no por UTC, y
`bucketsPorDia` (`actividad.tsx:14-28`) compara strings sin parsear `fecha_inicio`
—columna `date`—, con el único `Date` siendo el de hoy. Las dos trampas ya
pagadas están evitadas a propósito y documentadas.

**Contraste del banner nuevo.** El hero pasó de degradado a foto
(`resumen-visual.tsx:70-84`, `public/hero-camion.webp`, 12000×596). Muestreé los
píxeles reales de la franja visible bajo el texto (con `cover` y `right center`,
a 1280–1440 px el texto cae sobre el original x ≈ 7 600–9 300, nunca sobre el
bloque del camión que empieza en x ≈ 9 374): luminancia mínima **0.338**, contra
`#1a1207` da **6.85 : 1** en el peor píxel y 13.5 : 1 en promedio. El tagline al
85 % de opacidad da ≈ 5.0 : 1 en el peor caso. **Pasa AA**, y la geometría de
`cover` garantiza que el texto nunca cae sobre el camión oscuro.

**Estados vacío/error pintados bien en el rework.** `MotorFiscal`
(`resumen-visual.tsx:158-160`) y `MotorFiscalPeriodo` (`motor-fiscal-periodo.tsx:39-41`)
distinguen "no se pudo leer" y no pintan cero. `PanelPeriodo` `Liquidado`
(`:108-111`) y `Top rutas` (`:127-131`) también. La banda `estado === 'error'`
(`page.tsx:216-225`) sigue diciendo *"esto NO significa que no haya
liquidaciones, significa que no se pudieron leer"*. `AvisoSinFlota` va **antes**
que cualquier cifra (`page.tsx:196-200`), a propósito.

**`estadoPanel` no regresó.** `liquidacionesDeViajes` (`estado.ts:61-66`) sigue
alimentándose de los viajes reales, no de `porDia` — la rama `'vacio'` sigue
siendo alcanzable. `estado.test.ts` creció de 68 líneas y sigue verde.

**Autorización de la UI.** `sidebar-nav.tsx:105` sigue filtrando con la MISMA
`puedeVerRuta` que gatea la página, y `:111` la aplica también a `/dashboard`.
`rolMenu` (`:99`) replica `rolEfectivo` del servidor. El sufijo `?tenant=`/
`?vista=`/`?rol=` viaja en cada link del sidebar (`:84-93`), cubierto por
`sufijo.test.ts`.

**Compuerta.** `npx tsc --noEmit -p .` → 0 errores. `npx vitest run` → 255
archivos, **3 168 pruebas verdes**, 1 saltada. Idéntico a la línea base del MAPA
del pase 2.

---

## Lo que NO alcancé a revisar

- **Nada se renderizó.** Sin credenciales y con `npm run build` prohibido por el
  MAPA, todo lo visual está **leído y calculado, no mirado**: el desbordamiento
  de `GastoSemanalChart` (ALTO 6) sale de aritmética de layout, no de un
  navegador; el CRÍTICO sale de la lógica de montaje de Next (layout persistente
  + deps del efecto), no de un clic reproducido. El contraste del hero sí se
  midió sobre los píxeles reales del `.webp`.
- **Las cinco piezas nuevas no tienen prueba de render.** `panel-periodo.tsx`,
  `kpi-periodo.tsx`, `motor-fiscal-periodo.tsx`, `top-rutas.tsx` y
  `gasto-semanal-chart.tsx` no aparecen en ningún `*.test.tsx`. No verifiqué su
  comportamiento con series degeneradas (un solo bucket, todos ceros, valores
  negativos) más allá de lo que se lee en el código.
- **`AvanceCierre` quedó descolgado.** Sigue vivo en `inicio-operacion.tsx:94`
  (el panel del encargado) y su docstring (`avance-cierre.tsx:47-53`) sigue
  hablando del `?rango=` y del `GlobalFilter` que el Resumen del dueño ya no
  tiene. No lo perseguí: el call site que queda no le pasa `rango`, así que se
  queda en 7 días fijos, que es coherente con lo que dice el pie de página.
- **`/dashboard` del encargado (`inicio-operacion.tsx`).** Solo verifiqué que
  sigue existiendo y que `page.tsx:364` lo sigue eligiendo por
  `!puedeVerArea(rol, 'dinero')`. No lo releí completo.
- **Las 16 páginas huérfanas por dentro.** Confirmé que no tienen link entrante;
  no revisé si su contenido se degradó con el borrado del rol `operador`
  (`/dashboard/operadores` y `/dashboard/pod` son las candidatas).
- **`/admin` en profundidad.** Solo volví a `asistente-expandible.tsx` (para el
  reincidente 4) y a los tres call sites de `HBars`. Las ~20 páginas de la
  consola interna siguen sin abrir, igual que en el pase 1.
- **Accesibilidad más allá de contraste y tamaño de toque.** El pill de
  `panel-periodo.tsx:57-63` no declara `aria-pressed` ni rol de grupo de radio,
  y no verifiqué orden de foco, teclado en formularios de despacho/incidencias/
  POD, ni `aria-live` tras server actions.
