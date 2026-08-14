# Arquitectura y mantenibilidad — auditoría 3

**Nota: 5/10** (antes 4). Razón del movimiento: **se atacó y subió** — ARQ-C1
está vivo y con guardia (`analytics_stats_operador.test.ts`), el motor de dinero
sigue teniendo UNA sola casa (`cuadre/`), `formato.ts` aguanta con prueba
guardián, y no hay una sola dependencia `lib/ → app/`. Pero **la deuda cobró
factura**: el ejemplo canónico del rubro (`CONCEPTO_LABEL` gemelo) **volvió a
pasar por tercera vez, en un archivo nuevo, y ya divergió**; la ventana de 100
viajes que el pase 1 marcó como ALTO sigue abierta y hoy se puede demostrar que
hace que **una pantalla se contradiga a sí misma**; y el motor "puro" ahora
arrastra `sharp` y un lector WASM. No llega a 6 porque las fugas conocidas son
más de tres.

**El riesgo mayor, hoy:** el panel cuenta "viajes vivos" con dos definiciones
distintas —una ventana de 100 filas y un `count: 'exact'`— en la MISMA fila de
KPIs, así que la primera flota con más de 100 viajes verá "Escalados: 12" encima
de "Viajes en curso: 100" y una leyenda que afirma que nadie debe respuesta.

## Hallazgos

### [CRÍTICO] "Viajes en curso" se cuenta sobre 100 filas y se pinta junto a un conteo exacto — REINCIDENTE (FE-A2 del pase 1)

`src/lib/likida/analytics.ts:948` (`getViajes(tenantId, limite = 100)`,
`.order('created_at', {ascending:false}).limit(100)`) ·
`src/app/dashboard/agentes/conductores/page.tsx:34,41,55,60-63` ·
`src/app/dashboard/agentes/conductores/vista.tsx:53` ·
`src/lib/likida/analytics.ts:933` (`contarEscalados`, `count:'exact'`, sin
ventana) · `src/lib/likida/analytics.ts:840` (`contarViajes`, `count:'exact'`).

**Escenario.** Una flota corre el kit del PoC: `importar_viajes.ts:216` inserta
CADA viaje del CSV con `estatus: 'abierto'`. Entran 300 viajes históricos.
- `/dashboard/agentes/conductores` llama `getViajes(tenantId)` → 100 filas →
  `vivos.length = 100` → **"Viajes en curso: 100 · abiertos o en cuadre"**.
- En la misma fila de KPIs, `contarEscalados` consulta la tabla entera y
  devuelve, digamos, **"Escalados: 12"**. Escalado ⊂ vivo por construcción: la
  pantalla enseña un subconjunto que su superconjunto no explica.
- `/dashboard/agentes/liquidacion` (`page.tsx:46`) usa `contarViajes(['abierto'])`
  → **300**. Dos páginas del mismo panel, mismo concepto, 100 contra 300.
- Y `vista.tsx:66-68`: si los viajes que esperan aceptación quedaron fuera de la
  ventana, la sección imprime *"Nadie debe respuesta ahora mismo — cada viaje
  avisado está aceptado o ya se escaló"*, una afirmación positiva sobre datos
  que no se leyeron. `/dashboard/mapa/page.tsx:43-44` hereda exactamente la misma
  ventana para pintar "los viajes en curso".

**Consecuencia.** Es la regla que define al producto ("nunca inventar una
cifra", "un rótulo tiene que ser verdad") rota en la pantalla que el jefe de
tráfico abre a diario, y de una forma que el cliente detecta solo: dos números
incompatibles a 3 cm uno del otro. Para el equipo que mantenga esto: `getViajes`
es una lista paginada disfrazada de fuente de conteos, y ya tiene tres
consumidores (conductores, mapa, huérfanos) que la usan como si fuera el
universo.

**Causa raíz probable.** "Cuántos viajes vivos hay" no tiene dueño: se deriva en
la página filtrando una lista acotada, en vez de existir como una sola función
de conteo al lado de `contarViajes`/`contarEscalados`, que sí están en
`analytics.ts` y sí son exactas.

---

### [ALTO] Tercera copia de `CONCEPTO_LABEL`, ya divergida, fuera del alcance de su propia prueba guardián — REINCIDENTE (el ejemplo canónico del rubro)

`src/app/dashboard/gasto-semanal-chart.tsx:9-13` (`caseta: 'Casetas'`,
`factura: 'Facturas'`, `otro: 'Otros'`) contra
`src/lib/likida/cuadre/engine.ts:1201` (`caseta: 'Caseta'`, `factura: 'Factura'`,
`otro: 'Otro'`) y `src/app/dashboard/[id]/page.tsx:29-32` (idéntico al motor).

**Escenario.** `getGastoPorSemana` (`analytics.ts:500`) devuelve `nombre` como la
CLAVE cruda del concepto (`'caseta'`, `'otro'`), y el chart la traduce con su
mapa propio (`gasto-semanal-chart.tsx:40,75`). Un gasto de caseta de $2,400:
- en `/dashboard` (Resumen → "Gasto por categoría") la leyenda dice **"Casetas"**;
- en `/dashboard/{id}` (detalle de la liquidación) la fila dice **"Caseta"**;
- en el PDF que el contralor manda a su contador, `pdf.ts:241` →
  `etiquetaConcepto` → **"Caseta"**.

**Consecuencia.** Es literalmente el hallazgo que `etiquetas_sincronizadas.test.ts`
existe para impedir —su comentario dice *"ya se desincronizaron dos veces… esto
no es un test de etiquetas: es el mecanismo que evita la tercera"*— y la tercera
ya ocurrió. Peor: la prueba prohíbe por NOMBRE el identificador `CONCEPTO_LABEL`
en `pdf.ts` (línea 43) mientras el mismo identificador renació intacto en un
archivo que la prueba no mira. El mecanismo cree estar protegiendo algo que no
protege.

**Causa raíz probable.** La guardia se escribió contra una lista fija de dos
rutas (`engine.ts` + `[id]/page.tsx`), no contra "cualquier mapa de conceptos en
`src/`", así que cada archivo nuevo nace fuera del alcance.

---

### [ALTO] La bitácora de estados de cuenta suma pesos sobre una ventana truncada y sin orden, junto a un conteo que sí pagina

`src/lib/likida/analytics.ts:1559-1587` (`getDesglosesRecibidos`:
`.limit(2000)`, **sin `.order()`**) contra
`src/lib/likida/analytics.ts:1612-1620` (`getConciliacionConsolidado`, que sí usa
`traerTodo`) · ambas consumidas por la MISMA página,
`src/app/dashboard/agentes/peajes/page.tsx:46,48` ·
render en `src/app/dashboard/agentes/peajes/vista.tsx:107,122,125-134`.

**Escenario.** Un TAG de 20 unidades genera ~600 líneas/mes; a los cuatro meses
hay 2,400 filas en `cfdi_consolidado_linea`. Entra: el contador abre el Agente de
Peajes.
- KPI "Por conciliar" = 180 (exacto, `traerTodo` pagina hasta probar que trajo todo).
- La tarjeta "Estados de cuenta recibidos — *cada consolidado, con el saldo de su
  cruce*" agrupa sobre 2,000 líneas arbitrarias (PostgREST sin `ORDER BY` no
  garantiza cuáles) y sale, por ejemplo, `$412,800.00 · ✓140 · ⚠30` para un CFDI
  cuyo total real es `$530,000.00 · ✓190 · ⚠48`.
- Los ⚠ de la tabla suman 150 contra el KPI de 180, en la misma pantalla.

**Consecuencia.** Un monto en pesos, con rótulo de total, que es una suma parcial
y no se declara — la regla de "nunca inventar una cifra" aplicada a dinero
fiscal. Y para quien mantenga esto: dos funciones sobre la MISMA tabla, una
disciplinada y otra no, a 40 líneas de distancia; la disciplinada no enseña que
la otra existe.

**Causa raíz probable.** `pg.ts` ofrece `traerTodo()` precisamente para el
recorte silencioso de PostgREST, pero no hay nada que impida escribir
`.limit(n)` a mano; el borde se documenta, no se cierra.

---

### [ALTO] Tres páginas vivas quedaron fuera de la navegación porque el mapa de rutas y el mapa de permisos son dos listas independientes

`src/app/dashboard/rutas.ts:20-75` (`AGENTES`/`OPERACION`/`DINERO_FISCAL`/
`SISTEMA`/`ABAJO` → `TODAS_LAS_RUTAS`, 17 entradas) contra
`src/lib/auth/visibilidad.ts:75-128` (`AREA_POR_RUTA`, 20 entradas).

**Escenario.** `AREA_POR_RUTA` clasifica `/dashboard/arco` (93),
`/dashboard/usuarios` (125) y `/dashboard/politicas` (126) — o sea: existen,
compilan y están gateadas. Ninguna de las tres aparece en `rutas.ts`, y un
`grep` sobre todo `src/` no encuentra un solo `href` que apunte a ellas
(`configuracion/page.tsx` no tiene ni un `href=`). Entra: un flota_admin quiere
dar de alta a su contador → no hay camino desde el panel; solo tecleando
`/dashboard/usuarios` en la barra.

**Consecuencia.** `/dashboard/arco` es la pantalla donde la flota responde
solicitudes ARCO en 20 días hábiles (LFPDPPP 32) — su propio encabezado dice que
la creó "AUDITORÍA 16… antes vivía solo en /admin, y la flota no tenía dónde ver
sus solicitudes". El arreglo de una auditoría previa quedó inalcanzable en el
rewrite del sidebar del 13-ago, en silencio. `/dashboard/politicas` es donde se
edita la política de gasto que el motor sí lee (`tenant.config.politica`). El
propio `rutas.ts:68-70` declara la regla que se rompió: *"nada debe ser
alcanzable solo tecleando URL"*.

**Causa raíz probable.** "Qué páginas tiene el panel" está escrito dos veces con
propósitos distintos (pintar vs. autorizar) y nada compara las listas; borrar de
una no borra de la otra, y agregar a una no agrega a la otra.

---

### [ALTO] El motor de cuadre dejó de ser puro: importa `sharp`, `zxing-wasm` y `node:fs` por dos regex de RFC

`src/lib/likida/cuadre/engine.ts:14`
(`import { esRfcValido, rfcChecksumOk } from '../intake/cfdi'`, usados una sola
vez, en `engine.ts:208`) → `src/lib/likida/intake/cfdi.ts:11-15`
(`import sharp from 'sharp'`, `node:fs/promises`, `node:module`, `node:path`,
`zxing-wasm/reader`).

**Escenario.** `engine.ts:6` afirma *"Es una función pura → testeable, auditable,
sin sorpresas"* y `engine.ts:19` insiste *"`formato.ts` no importa NADA: el motor
sigue siendo puro y sin I/O"*. Pero el import es estático y `package.json` no
declara `sideEffects`, así que el grafo de módulos del motor incluye el binario
nativo de `sharp` y el lector WASM. Los consumidores del motor son páginas del
panel que no procesan una sola imagen: `huerfanos/vista.tsx:3`,
`agentes/liquidacion/vista.tsx`, `[id]/page.tsx`, `combustible-casetas/page.tsx`,
`politicas/page.tsx`, `configuracion/page.tsx` — todas solo quieren
`etiquetaConcepto`, una función de 3 líneas.

**Consecuencia.** El propio `next.config.ts:104-106` ya midió el costo:
*"El arranque en frío lo sigue mandando `sharp-libvips` con 15.34 MB (68% de la
función)"* — una medición hecha para el webhook, que sí lo usa, y que ahora
heredan por dependencia estática media docena de páginas del panel. El mismo
`cfdi.ts` es la razón de la lista de `outputFileTracingExcludes` (*"hace que el
tracer dé por alcanzable todo lo que cuelgue de la raíz del proyecto"*, líneas
114-118), incluidos los 348 archivos ajenos que un día se colaron con `.env.local`
entre ellos. Para el equipo: la puerta de pureza está declarada en prosa, no
verificada; el siguiente import "inofensivo" hacia `intake/` o `facturacion/`
entra igual.

**Causa raíz probable.** `intake/cfdi.ts` mezcla dos naturalezas —validación pura
de RFC/UUID y decodificación de códigos de barras con imagen— en un archivo, así
que quien necesita la primera se lleva la segunda.

---

### [MEDIO] La bandera de cobertura tiene dos nombres y el `skipIf` está en el muerto — REINCIDENTE (PR-A2 del pase 1)

`vitest.config.ts:35` exporta `CUADRA_COBERTURA` ·
`src/lib/likida/normas/fundamento.test.ts:148` y
`src/lib/likida/duplicados.test.ts:151` se saltan con `LIKIDA_COBERTURA` ·
`src/lib/likida/pruebas_en_ci.test.ts:9` afirma por escrito que el config exporta
`LIKIDA_COBERTURA` · `.github/workflows/ci.yml:60` dice `CUADRA_COBERTURA`.

**Escenario.** Entra `npm run test:coverage` (lo que CI corre, `ci.yml:68`).
`process.env.LIKIDA_COBERTURA` es `undefined`, `undefined === '1'` es falso, así
que las dos pruebas de tiempo **corren instrumentadas** — exactamente lo que el
`skipIf` existe para impedir (el comentario de `duplicados.test.ts:146-149` mide
que "el cociente pasa de ~4 a ~9 midiendo la instrumentación"). Hoy no truena
porque el umbral se relajó a 20 (`duplicados.test.ts:193`).

**Consecuencia.** El skip es decoración: el día que alguien apriete el umbral de
vuelta —o que la instrumentación cueste más— la suite se pone roja en el paso de
cobertura y el comentario que hay encima dice, literalmente, que esa prueba está
saltada. Y `pruebas_en_ci.test.ts`, la red que se escribió para esto, inventaría
saltos buscando un nombre que nadie escribe: cuenta 2 y pasa, creyendo que
vigila un mecanismo apagado.

**Causa raíz probable.** El rename Cuadra→Likida se hizo por archivo y no por
símbolo; la única definición de la bandera está en `vitest.config.ts` y sus tres
lectores la citan como cadena literal.

---

### [MEDIO] `sufijoTenant` existe y cinco páginas lo reimplementan en línea

`src/app/dashboard/sufijo.ts:21-26` (con `encodeURIComponent`) contra las copias
literales en `src/app/dashboard/page.tsx:36-37`,
`src/app/dashboard/despacho/page.tsx:42-43`,
`src/app/dashboard/agentes/liquidacion/page.tsx:36-37`,
`src/app/dashboard/agentes/facturas/page.tsx:32-33`,
`src/app/dashboard/agentes/cobranza/page.tsx:49-50` — ninguna codifica. Sexta
variante documentada a propósito en `sidebar-nav.tsx:68` (Client Component).

**Escenario.** Ya divergieron: `sufijoTenant` escapa los tres parámetros, las
cinco copias los concatenan crudos. Con los valores de hoy (UUID de tenant,
`vista=demo`, nombres de rol) no cambia el resultado, así que **no hay bug
visible**; lo que hay es seis lugares que tienen que enterarse del próximo
parámetro. El historial del propio archivo cuenta cómo se paga: `sufijo.ts:12-18`
describe que `?rol=` se agregó al sidebar y NO a los links de la página, y la
previsualización "ver como" se apagaba a media navegación.

**Consecuencia.** El costo de agregar un parámetro de contexto al panel es tocar
seis archivos, y el modo de falla es silencioso (un link te devuelve al tenant
demo bajo el mismo encabezado).

**Causa raíz probable.** El helper llegó después que las páginas y nadie migró
las existentes; siete de trece páginas lo importan, seis no.

---

### [MEDIO] "Viajes vigilados · abiertos o en cuadre" cuenta otra cosa, y con tope de 500 sin orden

`src/lib/likida/agentes/cobranza.ts:105-117,137` (`.limit(500)`, sin `.order()`,
más los filtros `fecha_inicio not null` y `avisado_en not null`) ·
`src/app/dashboard/agentes/cobranza/vista.tsx:63`.

**Escenario.** Flota con 40 viajes abiertos/en cuadre, 25 creados desde Despacho
(con `avisado_en`) y 15 importados del TMS (sin aviso — el filtro correcto que
cerró BE-C1). La pantalla dice **"Viajes vigilados: 25 · abiertos o en cuadre"**
mientras `/dashboard/viajes` y `contarViajes` dicen 40. Con más de 500 avisados
vivos, el número se congela en 500 y los viajes que caen fuera del `.limit` sin
orden **nunca entran a ninguna cubeta de cobranza**.

**Consecuencia.** El rótulo describe un universo (`abiertos o en cuadre`) y el
número mide otro (`avisados, con fecha, entre los primeros 500 que devuelva
Postgres`). Cobranza es el agente cuya promesa es "no se me escapa un
comprobante"; un tope sin orden es justamente el modo en que se escapa.

**Causa raíz probable.** El resultado de la consulta de trabajo se recicla como
métrica de pantalla; `vigilados` es `viajes.length` de la cola, no un conteo.

---

### [BAJO] `OperadorStat.viajes` cuenta viajes con gasto de diésel, no viajes

`src/lib/likida/analytics.ts:319-327,339`: `viajesPorOp` se llena únicamente
dentro del bucle de `gastos`, que la consulta ya acotó con
`.eq('concepto','diesel')` (línea 301). Un operador con 8 viajes de los que 3
tuvieron carga de diésel sale con `viajes: 3`.

**Consecuencia.** Hoy es inofensivo: el único consumidor
(`agentes/liquidacion/page.tsx:69-73`) usa solo `nombre` y `diferencias`, y
`viajes`/`dieselTotal` no llegan a ninguna pantalla. Es superficie muerta con un
nombre que promete otra cosa — el primero que la conecte a un KPI reproduce
ARQ-C1 con otra cifra.

## Verdades duplicadas

| El concepto | Dónde vive cada copia | ¿Ya divergieron? |
|---|---|---|
| Etiqueta legible de un concepto de gasto | `cuadre/engine.ts:1201` · `app/dashboard/[id]/page.tsx:29-32` · **`app/dashboard/gasto-semanal-chart.tsx:9-13`** | **SÍ** — 'Caseta'/'Casetas', 'Factura'/'Facturas', 'Otro'/'Otros'. La guardia (`etiquetas_sincronizadas.test.ts:34-35`) solo mira las dos primeras |
| "Cuántos viajes vivos tiene la flota" | `analytics.ts:840` `contarViajes` (exacto) · `analytics.ts:948` `getViajes` (ventana 100) → conductores/mapa/huérfanos · `agentes/cobranza.ts:137` `vigilados` (tope 500 + filtros) | **SÍ** — tres números distintos para el mismo rótulo, dos de ellos en la misma fila de KPIs |
| El sufijo `?tenant/?vista/?rol` de los links internos | `app/dashboard/sufijo.ts:21` (canónico) · 5 copias en línea (`page.tsx:36`, `despacho:42`, `liquidacion:36`, `facturas:32`, `cobranza:49`) · `sidebar-nav.tsx:68` (a propósito, Client) | **SÍ, sin efecto hoy** — solo el canónico usa `encodeURIComponent` |
| Qué páginas existen en /dashboard | `app/dashboard/rutas.ts:20-75` (navegar) · `lib/auth/visibilidad.ts:75-128` (autorizar) | **SÍ** — `/dashboard/arco`, `/dashboard/usuarios`, `/dashboard/politicas` solo en la segunda |
| El nombre de la bandera de cobertura | `vitest.config.ts:35` `CUADRA_COBERTURA` · `fundamento.test.ts:148` y `duplicados.test.ts:151` `LIKIDA_COBERTURA` · `pruebas_en_ci.test.ts:9` y `ci.yml:60` (en prosa, cada uno con un nombre) | **SÍ** — el `skipIf` está en el nombre muerto |
| Resumen de `cfdi_consolidado_linea` | `analytics.ts:1559` (`.limit(2000)`) · `analytics.ts:1612` (`traerTodo`) | **SÍ** — misma tabla, misma página, dos universos |
| Etiqueta de estatus de liquidación | `app/dashboard/estatus.ts` (fuente única, importada) | No — el duplicado se ELIMINÓ y la guardia lo vigila (`etiquetas_sincronizadas.test.ts:113-124`) |
| Mapa de concepto en el PDF | `liquidacion/pdf.ts:241` importa `etiquetaConcepto` del motor | No — mapa propio borrado, con prueba que impide su regreso |
| Formato de cifras y fechas | `lib/formato.ts` (sin imports) · `lib/utils.ts` y `app/dashboard/formato.ts` reexportan · `admin/ui/formato-preset.ts` resuelve presets sobre él | No — y `formato.test.ts:216-223` falla si `toLocaleString('es-MX'` aparece fuera |

## Lo que revisé y está bien

- **ARQ-C1 está vivo y bien consumido.** `analytics.ts:308-341` cuenta de verdad
  las liquidaciones con `|diferencia| ≥ 0.01` por operador;
  `agentes/liquidacion/page.tsx:69-73` filtra `diferencias > 0` y
  `vista.tsx:216-222` distingue los tres estados (null / vacío / datos).
  `analytics_stats_operador.test.ts` se pone roja si el 0 regresa.
- **El motor de dinero tiene una sola casa.** Ningún archivo fuera de `cuadre/`
  recalcula `totalComprobado` ni `diferencia`: `comercial.ts:141`,
  `analytics.ts:143,203`, `export/liquidaciones/route.ts:67` y `[id]/page.tsx`
  leen la columna persistida. `liquidacion/omitidos.ts`, `deducibilidad.ts` y el
  reembolso derivan de la MISMA respuesta (`copias_un_origen.test.ts` lo ancla
  con el caso real del ensayo).
- **`formato.ts` aguanta**, incluido el caso difícil: `admin/ui/formato-preset.ts`
  no reimplementa `mxn`/`litros` para poder cruzar el límite Server→Client, los
  resuelve por preset.
- **No hay dependencia invertida.** Cero imports `lib/ → app/`. `/dashboard`
  reusa `app/admin/ui/kit` (10 archivos), que es la decisión declarada en
  CLAUDE.md, y nadie fuera de `/admin` toca `lib/admin/negocio.ts`.
- **La ingesta del consolidado tiene un solo camino.** WhatsApp
  (`processor.ts:424-431`) y la pantalla (`agentes/peajes/page.tsx:74`) llaman
  ambos a `guardarYConciliarConsolidado`; el parser y `esConsolidado` se
  comparten. Aquí no hay copia.
- **`cobranza_pura.ts` es una separación bien hecha:** el motor sin I/O sale al
  cliente para la vista previa del mensaje, y `cobranza.ts` lo reexporta para que
  ningún llamador del servidor cambie.
- **`desde_db.ts` sigue siendo el único adaptador impuro de `cuadre/`** y lo hace
  contra `repo.ts` + `config.ts`, no contra Supabase crudo.
- **`getPolitica`/`politica_gasto` siguen muertos y documentados en el sitio del
  crimen** (`repo.ts:28-41`) — la trampa de CLAUDE.md no volvió.

## Lo que NO alcancé a revisar

- **El límite real del repositorio.** 58 archivos de producción llaman
  `supabaseAdmin()` directo; `repo.ts` no es la frontera de datos y hace tiempo
  que no lo es. No audité si alguno omite el `.eq('tenant_id', …)` — eso es del
  rubro de seguridad — ni tracé qué consultas están duplicadas entre
  `analytics.ts`, `operacion.ts`, `comercial.ts` y las páginas.
- **`processor.ts` (2,288 líneas) como unidad.** Verifiqué las dos ramas nuevas
  (oficina/consolidado y despacho) y su reuso; no medí cuánta lógica de decisión
  vive ahí que debería estar en un módulo probable.
- **`facturacion/` completo** (`al_vuelo.ts`, `agente.ts`, adaptadores por
  portal): cinco accesos directos a `gasto` y una máquina de estados que no
  recorrí.
- **La ventana de 200 de `getHuerfanosDeFlota`** (`repo.ts:388`) y las de
  `getDocumentos`/`getLiquidaciones` (`analytics.ts:954,988`): mismo patrón que
  el CRÍTICO, no confirmé si algún rótulo las presenta como totales.
- **`/admin` (la consola de Javier)** más allá de comprobar que no la importa
  nadie desde `/dashboard`.
- **El rótulo "Gasto por categoría"** de `panel-periodo.tsx:94` sobre un
  `top3` (`analytics.ts:495`) sin declararlo: lo vi, es del rubro de frontend, lo
  dejo apuntado.
