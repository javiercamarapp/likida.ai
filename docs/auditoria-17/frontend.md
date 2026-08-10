# Frontend — auditoría 17 · pase 3 (10-ago-2026)

**Nota: 5/10** (antes 4). Razón del movimiento: **se atacó y subió**. Los dos
arreglos del pase 2 (`d7b71a8`, `e47b124`) **cierran de verdad** lo que dicen
cerrar —los abrí, seguí el cableado línea por línea y corrí sus pruebas—, y con
ellos el rubro pasa de 1 CRÍTICO abierto a 0 y de **0 pruebas** sobre los cinco
componentes nuevos a dos archivos con 10 casos (4 puros + 6 de render real con
`renderToStaticMarkup`). Lo que impide subir más: **11 de los 13 hallazgos
abiertos siguen textualmente iguales**, uno de ellos en su **5ª ronda**, y el
peor de los ALTO quedó a **una línea** de su propio arreglo — `e47b124` cambió
la firma de `KpiDegradado` a `number | null` y no aplicó el cambio en el
llamador de al lado (`page.tsx:274`, 200 px a la derecha en la misma fila).

Riesgo mayor hoy: "Ahorro generado — Ejercicio 2026 · **$0.00**" con la consulta
fiscal caída, en la fila de KPIs de la pantalla de aterrizaje del dueño, sin
banda de aviso y con la cifra verdadera dos tarjetas abajo — el diferenciador
del producto anunciándose en cero mientras se contradice solo.

---

## Verificación de los dos arreglos de este PR

### `d7b71a8` — el Resumen del dueño en blanco · **SÍ CIERRA**

Cómo lo verifiqué:

- `src/app/dashboard/rail-marca.ts:26-30` — `marcaAsistente(expandido, pathname)`
  devuelve `null` cuando `pathname === RUTA_SIN_RAIL`.
- `src/app/dashboard/rail.tsx:53` calcula `marca` en el cuerpo del render (no
  dentro del efecto), y `:54-59` es el efecto con deps **`[marca]`**, no
  `[expandido]`. La transición `/dashboard/cuadre` → `/dashboard` cambia
  `marca` de `'expandido'` a `null`, así que el efecto **sí** vuelve a correr:
  el cleanup borra `dataset.asistente` y la rama `else` lo vuelve a borrar.
- `src/app/dashboard/rail.tsx:90` usa `RUTA_SIN_RAIL`, la MISMA constante que
  `marcaAsistente` — la desincronización de fondo (el `return null` y la marca
  mirando cosas distintas) queda cerrada por construcción, no por disciplina.
- `npx vitest run src/app/dashboard/rail_marca.test.ts` → 4 verdes.

Lo que la prueba NO ancla (y su propio pie lo dice): que `rail.tsx` llame a la
función con el `pathname` vivo. Eso lo verifiqué a ojo sobre `rail.tsx:53`, no
con una prueba — el repo no tiene jsdom.

Secuela: **sí la hay**, ver el MEDIO 1. El arreglo apaga la *marca* pero no el
*estado* `expandido`, y al quitar la marca también quitó la única señal en
pantalla de que ese estado seguía encendido.

### `e47b124` — "Costo por viaje $0.00" · **SÍ CIERRA, y deja la mitad del trabajo hecha**

Cómo lo verifiqué:

- `src/app/dashboard/resumen-visual.tsx:109` — `valor: number | null`.
- `src/app/dashboard/resumen-visual.tsx:126` —
  `{valor === null ? '—' : fmt(valor)}`. El cero MEDIDO se sigue pintando cero:
  la distinción que importa está bien hecha.
- `src/app/dashboard/kpi-periodo.tsx:70` — `valor={valorActual ?? null}`, y
  `:59-61` ya devolvía `pct = null` cuando `valorActual === null`, así que la
  tarjeta tampoco pinta una tendencia sobre un dato ausente.
- `npx vitest run src/app/dashboard/kpi-periodo.test.tsx` → 6 verdes, 2 de ellas
  de punta a punta sobre `<KpiPeriodo campo="costoPorViaje">`. Son las
  **primeras pruebas de render** que tocan los cinco componentes nuevos del
  rework.

Secuela: **sí**, y es la que más pesa en la nota. El commit habilitó `null` en
`KpiDegradado` y **no tocó el otro llamador de la misma fila**:
`src/app/dashboard/page.tsx:274` sigue siendo
`valor={resumenPerdidas?.montoRecuperable ?? 0}`. Es el ALTO 3 del pase 2, que
antes tenía la excusa de "el `?? 0` es el único camino que compila" — hoy ya no
la tiene. Ver el estado de hallazgos: pasa de REINCIDENTE a **AGRAVADO**.

---

## Estado de los hallazgos que traía

### Del pase 1 (arrastrados)

| # | Hallazgo | Estado | archivo:línea hoy |
|---|---|---|---|
| 1 | "Vencen pronto (≤ 5 días)" cuenta solo lo ya vencido | **REINCIDENTE** | `dashboard/arco/page.tsx:71`, rótulo en `:87`, `hoy` UTC en `:31` |
| 2 | "Comprobación del periodo" no filtra por fecha | **REINCIDENTE** | `dashboard/cuadre/page.tsx:67` (`getKpis(tenantId)` sin ventana), `:87`, `:117` |
| 3 | "PDF por liquidación" pierde el `?tenant=` | **REINCIDENTE** | `dashboard/analitica/page.tsx:121` (`href="/dashboard/cuadre"` pelón; el `extra` sigue calculado sin usar en `:51`) |
| 4 | Asistente expandido bajo 1280 px deja el panel en blanco | **REINCIDENTE (5ª ronda)** | `dashboard/rail.tsx:105` sigue `hidden xl:flex`; el gemelo `admin/asistente-expandible.tsx:61` + `:47` (`opacity: expandido ? 0 : 1`) tampoco cambió |
| 6 | "Litros elegibles: 0.00 L" con la cita legal al lado | **REINCIDENTE** | `dashboard/combustible-casetas/page.tsx:183` (`acred?.litrosDiesel ?? 0` + `nota="LIF 2026, Art. 20-A"`); el vecino de `:186` sigue usando `vacio` bien |
| 8 | El panel manda al chofer a `/mis-viajes` (404) | **REINCIDENTE** | `dashboard/usuarios/page.tsx:16`, con `ROLES: Record<string, string>` en `:12` |

**Sobre el 4, que ya va por su quinta ronda.** `d7b71a8` cerró la vía de
navegación, no la de viewport. `marcaAsistente` (`rail-marca.ts:26`) decide con
`expandido` y `pathname`; **no sabe nada del ancho de la ventana**. El aside
sigue siendo `hidden xl:flex` (`rail.tsx:105`), o sea `display:none` bajo 1280
px, mientras `globals.css:217-223` sigue retirando `.columna-centro`. Expandir
el chat a 1440 px y arrastrar la ventana a 1200 (o conectar un proyector que
baje la resolución) deja el panel invisible y sin ningún control: el botón de
contraer vive dentro del aside que acaba de desaparecer. Es el mismo modo de
falla que el CRÍTICO cerrado, por la otra puerta.

### Del pase 2

| Hallazgo | Estado |
|---|---|
| **CRÍTICO** — expandir el asistente y volver a "Resumen" deja el panel en blanco | **CERRADO** por `d7b71a8` (verificado arriba) |
| **ALTO 1** — un pill gobierna 5 ventanas de tiempo y no rotula ninguna | **REINCIDENTE** |
| **ALTO 2** — "Ahorro generado $0.00" con la consulta caída | **AGRAVADO** |
| **ALTO 3** — "Aún no hay viajes registrados" con `getViajesPorMes` caída | **REINCIDENTE** |
| **ALTO 4** — "Costo por viaje $0.00" | **CERRADO** por `e47b124` |
| **ALTO 5** — "Gasto por categoría" desborda su columna en Mensual/Histórico | **REINCIDENTE** |
| **ALTO 6** — 16 páginas del panel sin un solo link | **REINCIDENTE** |
| **MEDIO 1** — "Aún no hay gastos capturados" con la consulta caída | **REINCIDENTE** |
| **MEDIO 2** — flechas de periodo de 16 × 16 px | **REINCIDENTE** |
| **MEDIO 3** — `/mis-viajes` y el rol `operador` en `usuarios` | **REINCIDENTE** (= el 8 del pase 1) |

Detalle de los que cambiaron de grado o piden línea nueva:

**ALTO 2 · AGRAVADO.** `src/app/dashboard/page.tsx:274` sigue letra por letra:
`valor={resumenPerdidas?.montoRecuperable ?? 0}`. Lo que cambió es el contexto:
`resumen-visual.tsx:109` ya acepta `number | null` y `:126` ya pinta `'—'`. El
arreglo existe, está probado (`kpi-periodo.test.tsx:44-52`) y no se aplicó al
llamador que está **en el mismo `<div className="grid grid-cols-1 sm:grid-cols-3">**
(`page.tsx:267-275`), dos posiciones a la derecha del que sí se arregló. Ni
`resumenPerdidas` ni `gastosFiscales` están en `estadoPanel` (`estado.ts:30`),
así que sigue sin haber banda de "parcial".

**ALTO 1 · REINCIDENTE.** `panel-periodo.tsx:44-51` sigue derivando las cinco
secciones de un solo `modo`; `:70`, `:93`, `:103`, `:125` siguen siendo
`TituloSeccion` sin ventana; el pill de `:55-64` sigue sin `aria-pressed` ni rol
de grupo. Las tres tablas de ventanas (`analytics.ts` `SEMANAS_POR_MODO`,
`getSeriesKpiCards`, `getTopRutasPorGasto`) siguen siendo tres.

**ALTO 3 · REINCIDENTE.** `page.tsx:324` sigue `porMes={viajesPorMes ?? []}` y
`actividad.tsx:54` sigue haciendo `porMes.every((d) => d.valor === 0)` sobre ese
`[]` → `true` → `:59` "Aún no hay viajes registrados." `estado.ts:30` sigue
mirando solo cuatro consultas de las doce.

**ALTO 5 · REINCIDENTE.** `gasto-semanal-chart.tsx:50` sigue siendo
`className="relative flex-1 flex items-end gap-3 …"` sin `min-w-0`, la celda de
`panel-periodo.tsx:91` sigue sin `overflow-x`, y el primer ancestro que recorta
sigue siendo `page.tsx:179` (`glass-panel overflow-hidden`).

**ALTO 6 · REINCIDENTE.** `rutas.ts:78-81` (`TODAS_LAS_RUTAS`, 31 entradas)
contra `:92-101` (`SIDEBAR_PRINCIPAL`, 8) + `FISCAL` (6) + Resumen = 15
pintadas en `sidebar-nav.tsx:120,132`. Las 16 huérfanas son las mismas, ARCO
incluida.

**MEDIO 1 · REINCIDENTE.** `panel-periodo.tsx:95-99` sigue colapsando `null` y
`[]` en "Aún no hay gastos capturados.", mientras sus dos hermanas de `:108-111`
y `:127-131` siguen distinguiéndolos bien. La dona de `:72-79` igual.

**MEDIO 2 · REINCIDENTE.** `kpi-periodo.tsx:10` sigue siendo
`const BOTON = 'w-4 h-4 …'` y `:76` sigue `gap-0.5`;
`motor-fiscal-periodo.tsx:7` idéntico. 16 × 16 px con centros a 18 px: falla el
mínimo de 24 × 24 de WCAG 2.2 SC 2.5.8 **y** su excepción de espaciado.

---

## Hallazgos nuevos

### [MEDIO] Secuela de `d7b71a8`: el chat se queda "expandido" sin nada que lo diga, y secuestra la siguiente página que abras

`src/app/dashboard/rail.tsx:40` (el `useState(false)` que nadie apaga),
`:90` (`if (pathname === RUTA_SIN_RAIL) return null;`),
`src/app/dashboard/rail-marca.ts:26-30`,
`src/app/marco.ts:73` (`MARCO_ASISTENTE_EXPANDIDO`)

`marcaAsistente` apaga la **marca** en `/dashboard`, pero el estado `expandido`
del componente sigue en `true`: `RailAsistente` vive en `chrome.tsx:100`, dentro
del layout, y no se desmonta al navegar.

Escenario, con los mismos clics del demo:

1. `/dashboard/cuadre` → "Expandir chat a pantalla completa" (`rail.tsx:113`).
   `expandido = true`, marca puesta, chat a pantalla completa. Correcto.
2. Clic en "Resumen" del sidebar → `/dashboard`. `marca = null`: el Resumen se
   ve perfecto (esto es lo que arregló `d7b71a8`) y el aside devuelve `null`.
   **En pantalla no queda un solo píxel que diga que el chat sigue expandido.**
3. Clic en "Facturación" (o Cuadre, o Cobranza) → `pathname` vuelve a tener
   rail, `marca` vuelve a `'expandido'`, y el aside se monta con
   `fixed top-4 right-4 bottom-4 left-[264px] z-20` mientras `globals.css:217`
   retira `.columna-centro`.

Sale: el contralor pidió Facturación y le apareció el chat a pantalla completa
tapándola. Se recupera en un clic (el botón de contraer sí está a la vista, a
diferencia del CRÍTICO), pero se repite en **cada** navegación mientras nadie lo
contraiga, y el paso 2 borró la única pista de que iba a pasar.

Consecuencia: en la sala, el presentador navega tres pantallas y el chat se le
mete encima en las tres; se lee como que el producto no sabe dónde está. Antes
de `d7b71a8` el usuario recargaba (F5) al ver el panel en blanco y el estado se
reseteaba solo; ahora no hay motivo para recargar y el estado sobrevive.

Causa raíz probable: la ruta que no pinta el rail apaga la marca pero no el
estado que la produce, así que `/dashboard` se volvió un almacén invisible de
`expandido = true`.

---

### [MEDIO] El mensaje crudo de PostgREST se imprime en la pantalla del contador

`src/app/dashboard/contador/comun.tsx:96` (`{f.que}: {f.detalle}`),
`:45` (`detalle: e instanceof Error ? e.message : String(e)`),
`src/lib/likida/pg.ts:34` (`throw new Error(\`${consulta}: ${res.error.message}\`)`);
montado en `contador/page.tsx:124`, `contador/deducciones/page.tsx:109`,
`contador/combustible/page.tsx:97`

`AvisoDeFallo` tiene dos ramas. La de `incompleta: true` sí imprime prosa
domesticada (`LecturaIncompleta`, `pg.ts:84-87`: *"solo se leyeron 850 de 1,200
filas"*). La de `incompleta: false` —cualquier otra excepción— cae al mismo
`<li>` de `:96` con `f.detalle` **completo y sin truncar**. El docstring de
`:59-61` afirma lo contrario: *"El `detalle` técnico se pinta en pequeño y sin
nombres de columna crudos hacia el usuario final"*.

Escenario con valores: rotan la service-role key en Supabase, o un `grant`
cambia. `getGastosFiscales` llama `exigir(res, 'getGastosFiscales.viaje')`
(`fiscal.ts:751`), PostgREST devuelve
`{ message: "permission denied for table gasto" }`, y `pg.ts:34` lanza
`getGastosFiscales.viaje: permission denied for table gasto`. El contador de la
flota abre `/dashboard/contador` y lee, bajo "No se pudo leer el dato de esta
pantalla":

> Comprobantes del periodo: getGastosFiscales.viaje: permission denied for table gasto

Con un host caído el texto es `TypeError: fetch failed`; con una columna
renombrada, `column gasto.<nombre> does not exist`.

Consecuencia: el usuario que menos puede hacer con eso —el contador de la
flota, no un ingeniero— recibe el nombre de la tabla, el de la función interna y
el mensaje del driver. No es un stack completo, pero se lee como uno, y en la
pantalla fiscal, que es la que el comprador abre para confiar. `arco/page.tsx:97`
comete lo mismo pero al menos corta a 120 caracteres; aquí no hay corte.

Causa raíz probable: `safe()` guarda `e.message` de cualquier excepción, y el
componente asume que todas las excepciones son `LecturaIncompleta`.

---

### [MEDIO] Tercera copia del mapa de conceptos, fuera del test de sincronía, y etiqueta "Diésel" una cubeta que incluye gasolina

`src/app/dashboard/gasto-semanal-chart.tsx:9-13` (`CONCEPTO_LABEL`),
contra `src/lib/likida/cuadre/engine.ts:1191-1202` (`etiquetaConcepto`/`label`) y
`src/lib/likida/etiquetas_sincronizadas.test.ts:36-56`

El test de sincronía vigila **dos** fuentes: el motor (`engine.ts:1201`) y el
panel de detalle (`[id]/page.tsx:27`). El rework del 8-ago introdujo una
**tercera** en el Resumen del dueño y el test no la conoce (`grep CONCEPTO_LABEL
src/**/*.test.*` solo la nombra para prohibirla en `pdf.ts`).

Y difiere en lo que importa. `etiquetaConcepto('diesel', ocrExtra)`
(`engine.ts:1191-1197`) **se salta el mapa a propósito** y respeta el producto
impreso en el ticket: `producto: 'MAGNA'` → `"Combustible Magna"`, sin producto
→ `"Combustible"`, solo `producto` con "diesel" → `"Diésel"`. El comentario de
`[id]/page.tsx:382-388` explica por qué, con la norma: *"el estímulo de IEPS es
SOLO diésel (LIF 20-A fr. IV), así que etiquetar gasolina como diésel invita a
acreditar algo que no aplica"*.

`gasto-semanal-chart.tsx:10` hace exactamente eso: `diesel: 'Diésel'` sobre la
clave del `concepto`, sin mirar `ocr_extra`.

Escenario con valores: una flota carga 8 tickets de la semana bajo
`concepto='diesel'`, de los cuales 2 son Magna por $3,100 (`ocr_extra.producto =
'MAGNA'`) y 6 son diésel por $57,900. En `/dashboard/[id]` y en el PDF esos 2 se
llaman **"Combustible Magna"**. En el Resumen del dueño, la leyenda y el tooltip
de "Gasto por categoría" (`:40`, `:75`) dicen **"Diésel · $61,000"**. La misma
pantalla que vende el motor fiscal mete $3,100 de gasolina dentro de la barra
rotulada Diésel.

Consecuencia: el contralor cruza "Diésel $61,000" del Resumen contra el
acumulado de diésel de su contador y no cuadra por $3,100, sin ninguna pista de
por qué. Y es la cifra que alimenta la conversación del estímulo, que es
diésel-only. De paso, `caseta: 'Casetas'` y `otro: 'Otros'` también difieren del
motor (`'Caseta'`, `'Otro'`) — eso sí es plural de categoría y no cambia el
significado; el de diésel sí.

Causa raíz probable: el componente nació el 8-ago con su propio literal en vez de
importar `etiquetaConcepto`, y el test que existe para cazar justo esto está
anclado por nombre de archivo a las dos copias viejas.

---

### [MEDIO] `/admin/model-ops` rotula 3 de las 6 fases y enseña las otras 3 con su clave cruda — la misma dona que en otras tres pantallas sí las traduce

`src/app/admin/model-ops/page.tsx:29` (`FASE_LABEL` con 3 claves),
`:108` (la dona que la usa), `:31-34` (el comentario que afirma que solo hay
tres); el dominio en `src/lib/likida/costos.ts:41`
(`FaseCosto = 'ocr' | 'cuadre' | 'escalacion' | 'chat' | 'router' | 'whatsapp'`)

Las otras cuatro copias del mismo mapa listan las **seis** (`admin/page.tsx:21`,
`admin/analitica/page.tsx:11`, `admin/costos-facturacion/page.tsx:63`,
`dashboard/valor-ahorro/page.tsx:12`). `model-ops` tiene tres, y su comentario
de `:31-33` dice *"Las TRES fases reales del pipeline… No hay una cuarta fase"*
— lo cual es falso desde que existe `faseDeModelo` (`costos.ts:102-105`):
**cualquier llamada con un modelo `opus` se registra como `escalacion`**, y ese
es el camino que `processor.ts:1879` toma en el cuadre.

Escenario con valores: hay $12.40 USD de gasto en `escalacion`, $3.10 en `chat`
y $0.90 en `router` en `llm_costo`. Javier abre `/admin` y la dona "Costo por
fase" dice **"Agente de Escalación · 74%"**. Abre `/admin/model-ops`, la misma
dona sobre los mismos datos (`r.porFase`, `getResumenNegocio()`) y dice
**"escalacion · 74%"**, en minúscula y sin acento, junto a "chat" y "router".

Consecuencia: la consola de costos de IA nombra la misma rebanada de dos formas
en dos pantallas contiguas, y la que peor lo hace es precisamente la que se
llama "Model Ops". Es el modo de falla dominante del rubro —un mapa literal que
ya no cuadra con el tipo— y el `Record<string, string>` es lo que impide que
`tsc` lo cace: `Record<FaseCosto, string>` habría fallado la compilación el día
que se escribió.

Causa raíz probable: el mapa se recortó a mano a las 3 fases que la página
lista como tarjetas, sin notar que la dona de más abajo consume el conjunto
completo.

---

### [MEDIO] "Actividad" bucketea los días con la zona horaria del proceso: el servidor pinta un día que en México todavía no empezó

`src/app/dashboard/actividad.tsx:20-27` (`hoy.setHours(0,0,0,0)` +
`d.toISOString().slice(0,10)`), `:53` (los dos llamadores),
importado desde `panel-periodo.tsx:8`, que es `'use client'`

El docstring de `:5-13` presume de no parsear `fechaInicio` —y es cierto, ahí no
hay bug—, pero el arreglo de los buckets sí depende de la zona del proceso:
`new Date()` + `setHours` da medianoche **local**, y `toISOString()` la convierte
a **UTC**. `TZ_MX` (`formato.ts:34`) existe y no se usa aquí.

`Actividad` no lleva `'use client'` propio, pero se importa desde un componente
cliente: Next lo renderiza **las dos veces**, en el servidor (Vercel = UTC) y en
el navegador (México = UTC−6).

Escenario con valores: 9 de agosto de 2026, 19:30 hora de Ciudad de México
(= 10 de agosto, 01:30 UTC). El HTML que sale del servidor trae los 7 buckets
`2026-08-04 … 2026-08-10`, con el último —un día que en México no ha
empezado— en 0 viajes. El navegador hidrata y calcula `2026-08-03 … 2026-08-09`.
Los 7 `key={d.dia}` de `BarChartSimple` (`charts.tsx:129`) no coinciden con los
del servidor: React reporta mismatch de hidratación y vuelve a pintar la barra.

Sale: entre las 18:00 y la medianoche de México —seis horas de cada día, que es
justo la franja en la que un contralor de flota revisa el corte del día— la
gráfica "Actividad" se sirve corrida un día, con una barra vacía de "mañana", y
salta al hidratar. Con la red lenta o el JS bloqueado, se queda corrida.

Consecuencia: el eje de días de la única gráfica de operación del Resumen no
dice el mismo día que el resto de la pantalla (`page.tsx:89` sí resuelve `hoy`
en el servidor y se lo pasa a las consultas). Es la clase de desfase que el
propio archivo dice haber pagado ya una vez con `created_at`.

Causa raíz probable: `bucketsPorDia` evitó parsear la columna `date` (correcto)
pero generó los días con la zona del proceso en vez de con `TZ_MX`.

---

### [BAJO] El eje de pesos de "Gasto por categoría" mezcla centavos y enteros en las mismas cinco marcas

`src/app/dashboard/gasto-semanal-chart.tsx:47`
(`{mxn(v).replace('.00', '')}`), `:17-19` (`marcasEje`)

`marcasEje` devuelve `max × {1, .75, .5, .25, 0}` — no un múltiplo redondo,
pese a que su docstring de `:15-16` promete *"un múltiplo legible, no el máximo
exacto de los datos"*. Y `.replace('.00','')` solo quita los centavos cuando la
fracción cae exacta en peso entero.

Escenario con valores: `max = 61,237.50` (el mayor gasto semanal de una
categoría). El eje se pinta, de arriba abajo: `$61,237.50`, `$45,928.13`,
`$30,618.75`, `$15,309.38`, `$0`. Cinco números de anchos distintos en una
columna de 44 px (`:45`), cuatro con centavos y el último sin ellos.

Consecuencia: el eje de la gráfica de dinero de la pantalla de aterrizaje no se
puede leer de un vistazo, que es lo único que un eje hace. Deuda que va a
cobrar factura el día que alguien intente leer una cifra de ahí en la sala.

Causa raíz probable: el `.replace` se agregó para acortar el eje sin cambiar
`marcasEje`, así que solo acorta por accidente.

---

## Lo que revisé y está bien

**Los dos arreglos del PR.** Detallado arriba: los dos cierran, con prueba, y
los verifiqué en el código además de correr sus archivos.

**Los mapas literales contra `src/types/` y los dominios de la base**
(trabajo obligatorio del rubro — los recorrí todos, no una muestra):

- `ETIQUETA_MODO` (`kpi-periodo.tsx:14-18`, `motor-fiscal-periodo.tsx:11-13`) —
  `Record<Modo, string>` con `Modo` cerrado a tres literales. Un cuarto modo
  rompe la compilación. Patrón correcto.
- `ROL_LABEL` de `admin/equipo/page.tsx:13` — `Record<RolAppUser, string>` con
  las cuatro claves exactas de `provisionar.ts:16`. El único mapa de roles del
  producto que `tsc` protege.
- `ROL_BADGE` (`chrome.tsx:26-32`), `NOMBRE` (`aviso-rol.tsx:7-11`) y
  `ROL_LABEL` (`admin/mi-perfil/page.tsx:9`) — traen `operador`, un rol que ya
  no existe en `RolAppUser`, pero son inocuos: son fallbacks de insignia con
  `??`, no nombran una ruta y no cambian ninguna cifra. El que sí daña es
  `usuarios/page.tsx:16`, ya reportado.
- `ESTATUS` (`estatus.ts:17-21`) — cubre los tres de `EstatusLiquidacion`, con
  `etiquetaEstatus` (`:26`) devolviendo la clave cruda en gris para un cuarto, y
  `etiquetas_sincronizadas.test.ts:117` verificando la cobertura contra el tipo.
- `ESTATUS_VIAJE` (`viajes/vista.tsx:23-27`) — los tres del constraint
  `viaje_estatus_dominio`, con `??`.
- `CONCEPTO` (`[id]/page.tsx:27-31`) y `etiquetaGasto` (`:392-395`) — el panel
  del expediente delega en el motor y usa el literal solo como red; el test de
  `etiquetas_sincronizadas.test.ts:46-63` lo ata a `ConceptoGasto`. Bien hecho;
  el problema es la tercera copia que ese test no ve (MEDIO 3).
- `COLOR_REGION` (`top-rutas.tsx:9-16`) — parcial a propósito, `colorDe` (`:14`)
  cae a `--muted` y el texto a "Sin clasificar" (`:50`).
- `FASE_LABEL` en `admin/page.tsx:21`, `admin/analitica/page.tsx:11`,
  `admin/costos-facturacion/page.tsx:63` y `dashboard/valor-ahorro/page.tsx:12`
  — las cuatro copias son idénticas entre sí y cubren las 6 de `FaseCosto`. La
  quinta (`model-ops`) es la que no; ver MEDIO 4.

**Estados de error del panel.** `dashboard/error.tsx` pinta el `digest` en
pantalla, `select-all`, y lo manda al logger (`:41-48`) — con el import perezoso
correcto para no arrastrar el logger de servidor al cliente. `global-error.tsx`
reemplaza el `<html>` con estilos en línea (no depende de `globals.css`, que es
lo que puede no haber cargado) y usa `<a>` en vez de `<Link>` a propósito. Las
dos redes están puestas y son las correctas.

**Fallar cerrado en las secciones que sí lo hacen.** `MotorFiscal`
(`resumen-visual.tsx:167-169`), `MotorFiscalPeriodo`
(`motor-fiscal-periodo.tsx:39-41`), `PanelPeriodo` → Liquidado
(`panel-periodo.tsx:108-111`) y Top rutas (`:127-131`), `cuadre/page.tsx:89`
("No se pudo cargar esta sección"), `arco/page.tsx:95-99` (que además dice *"no
hay forma de saber si hay solicitudes pendientes hasta que la base responda"*) —
todos distinguen `null` de vacío y ninguno pinta un cero.

**Formato de cifras.** Sigue habiendo una sola fuente: `lib/formato.ts`.
`resumen-visual.tsx:126` formatea con `resolverFormato`, no a mano; el nuevo
`valor === null ? '—'` no introduce una segunda representación —usa el mismo
guion que `cifra-grande.tsx:57-60`—. `formato.test.ts` (la prueba que bloquea
`toLocaleString('es-MX')` fuera del archivo) sigue verde.

**Claves de React en listas de dinero.** Recorridas todas:
`HBars` (`admin/ui/graficas.tsx:93`, `key={d.etiqueta}`) tiene un contrato débil
pero sus seis call sites hoy pasan claves únicas —nombre de flota
(`admin/flotas:189`), teléfono (`admin/conversaciones:47`), modelo
(`admin/model-ops:118`), `FASE_LABEL[...]` (`valor-ahorro:121`), y
`etiquetaConcepto(concepto)` en `combustible-casetas:197` y `analitica:95`, que
agrupan por `concepto` distinto—. `Dona` (`charts.tsx:239,251`,
`key={s.etiqueta}`) igual. `TopRutas` (`top-rutas.tsx:42`) usa
`` `${r.origen}→${r.destino}` ``, que es la llave de agrupación real.
`BarChartSimple` (`charts.tsx:129,158`) usa `d.dia`. Ninguna clave inestable
sobre una fila de dinero.

**Crashes por serie degenerada.** `AreaChartSimple` (`charts.tsx:57-58`)
revienta con `datos = []` (`xy[xy.length-1]` es `undefined`), pero los dos
llamadores del panel lo blindan antes: `panel-periodo.tsx:112`
(`liquidadoModo.some(...)` es `false` para `[]`) y `actividad.tsx:54`
(`[].every(...)` es `true`). No es alcanzable hoy — lo dejo escrito porque el
guardarraíl vive en el llamador, no en el componente.

**Zonas horarias del resto del rework.** `getSerieComparativa`
(`analytics.ts:130,142`) bucketea `liquidacion.created_at` por día local MX;
`page.tsx:89` resuelve `hoy` en el servidor con `ahoraMs()` y se lo pasa a las
seis consultas `*Series`. La única pieza que se salió de esa disciplina es
`bucketsPorDia` (MEDIO 5).

**Autorización de la UI.** `sidebar-nav.tsx` sigue filtrando con la misma
`puedeVerRuta` que gatea la página, `rolMenu` replica `rolEfectivo`, y el sufijo
`?tenant=`/`?vista=`/`?rol=` viaja en cada link. `page.tsx:198-200` sigue
poniendo `AvisoSinFlota` **antes** de cualquier cifra.

**Compuerta.** `npx tsc --noEmit -p .` → **0 errores**.
`npx vitest run src/app/dashboard/rail_marca.test.ts src/app/dashboard/kpi-periodo.test.tsx`
→ **10 verdes**.

---

## Lo que NO alcancé a revisar

- **Nada se renderizó, otra vez.** Sin credenciales y con `npm run build`
  prohibido, todo lo visual está leído y calculado: el desbordamiento de
  `GastoSemanalChart` (ALTO 5) sigue saliendo de aritmética de layout; el MEDIO 1
  sale de la lógica de montaje de Next; el MEDIO 5 sale de la semántica de
  `toISOString`, no de un mismatch observado en consola. **No pude confirmar que
  `d7b71a8` se vea bien en un navegador**, solo que la regla y el cableado son
  correctos.
- **La prueba del CRÍTICO no cubre el cableado.** `rail_marca.test.ts` ancla la
  función pura; que `rail.tsx:53` la llame con el `pathname` vivo y escriba en
  `document.documentElement` sigue sin prueba (el repo no tiene jsdom). Si
  alguien vuelve a poner `[expandido]` en las deps del efecto, la suite sigue
  verde.
- **No corrí la suite completa** (`npx vitest run` a secas), solo los dos
  archivos de los arreglos. La cifra global de este pase no la verifiqué.
- **Los tres componentes nuevos que siguen sin prueba de render:**
  `panel-periodo.tsx`, `top-rutas.tsx`, `gasto-semanal-chart.tsx`. `e47b124`
  demostró que `renderToStaticMarkup` alcanza en este repo, así que ya no hay
  excusa técnica. No verifiqué su comportamiento con series degeneradas (un solo
  bucket, todos ceros, valores negativos) más allá de lo que se lee en el código.
- **Las 16 páginas huérfanas por dentro.** Confirmé otra vez que no tienen link
  entrante; no abrí su contenido.
- **`/admin` en profundidad.** Solo entré a `asistente-expandible.tsx`
  (reincidente 4), a las cinco copias de `FASE_LABEL` y a los call sites de
  `HBars`/`Dona`. Las ~20 páginas de la consola interna siguen sin abrirse
  completas, igual que en los pases 1 y 2. Tampoco hay `admin/error.tsx`: un
  fallo ahí sube hasta `global-error.tsx` y recarga el documento entero; no lo
  perseguí porque esa consola solo la usa Javier.
- **`/dashboard` del encargado (`inicio-operacion.tsx`).** Sin releer.
- **Accesibilidad más allá de contraste y tamaño de toque.** El pill de
  `panel-periodo.tsx:57-63` sigue sin `aria-pressed` ni rol de grupo de radio
  (lo dejo anotado, no lo cuento como hallazgo por segunda vez); no verifiqué
  orden de foco, teclado en los formularios de despacho/incidencias/POD, ni
  `aria-live` tras las server actions.
- **Responsive por debajo de `md`.** Los `grid-cols-1 md:grid-cols-2/3` del
  Resumen los leí, no los medí; el ALTO 5 solo está calculado a 1440 px.

---
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
