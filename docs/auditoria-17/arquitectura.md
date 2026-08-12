# Arquitectura y mantenibilidad — auditoría 17 · pase 5 (12-ago-2026)

**Nota: 4/10** (antes 4). Razón del movimiento: **mirada más profunda**. El
CRÍTICO del pase 4 se arregló de verdad y con una prueba ejemplar —renderiza el
componente real y afirma sobre el HTML—, y eso solo habría subido la nota. Lo
que la sostiene abajo es lo que salió al mirar con lupa: **la afirmación de que
el motor de dinero es puro y sin I/O es falsa** (`engine.ts:14` arrastra `sharp`,
`node:fs`, `node:path` y un WASM), y esa es la razón estructural por la que el
tercer mapa de etiquetas existe y no se puede cerrar como se cerró el del PDF.
Encima: **seis de mis ocho hallazgos siguen palabra por palabra** y el recuento
de símbolos sin llamador, medido hoy con un criterio que no cuenta comentarios,
no es 29 sino **43**.

Compuerta corrida hoy sobre `927e78f`: `npx tsc --noEmit -p .` → 0 errores ·
`npx eslint src/` → 0 errores, 17 warnings · las cuatro pruebas de guardarraíl
de este rubro (`sidebar_puerta`, `etiquetas_sincronizadas`, `etiquetas_panel`,
`visibilidad`) → **49 verdes**. Ninguna ve nada de lo de abajo.

**El riesgo mayor del rubro hoy:** la pantalla de detalle de liquidación
(`/dashboard/[id]`, 409 líneas: el renglón por renglón que el contralor lee y el
botón de PDF) **no tiene un solo link entrante en toda la aplicación**. El
arreglo del sidebar le devolvió las puertas a siete páginas de configuración y
dejó fuera la única pantalla del producto que el demo tiene que abrir.

---

## Verificación del arreglo del pase 4 (`8d6ac51`) — ¿cerró la clase o la instancia?

**Cerró la instancia y una clase adyacente. La clase general sigue abierta, y
ahora está repartida en tres enumeraciones hechas a mano en vez de dos.**

### Lo que sí cerró, y está bien hecho

`sidebar-nav.tsx:6` pasó de importar 2 de las 6 constantes de sección a importar
**4** (`SIDEBAR_PRINCIPAL`, `FISCAL`, `NEGOCIO`, `GESTION`), y las pinta en
`:132`, `:141` y `:142` con el mismo `visibles()` que gatea la página
(`:105` → `puedeVerRuta`). Verificado por render, no por lectura:

* `flota_admin` → 8 links (Resumen + Combustible & Casetas + los 6 de GESTION).
* `contador` → 2 links (Combustible & Casetas, Plan & Facturación). Ya no cae en
  `/dashboard/suscripcion` con el `<nav>` vacío.
* `encargado` → 3 links (Resumen, ARCO, Soporte).

La prueba nueva (`sidebar_puerta.test.tsx`) es del tipo correcto para este
rubro: no afirma sobre la lista declarada sino sobre los `href` que salen del
`renderToStaticMarkup` del componente **real** (`:42-45`), y cubre las dos
direcciones (`:56`, `:76`). Es exactamente lo que le faltaba a
`visibilidad.test.ts:85-101`, que sigue verde y sigue mirando la mitad
equivocada. Nada que objetar al arreglo como arreglo.

### Lo que NO cerró: el acoplamiento sigue siendo implícito, y ahora en tres sitios

Si mañana alguien agrega una **séptima** constante de sección a `rutas.ts`, hay
que acordarse de editarla en **tres** archivos distintos, ninguno de los cuales
lo exige:

| # | Sitio | Qué hay que acordarse de hacer |
|---|---|---|
| 1 | `rutas.ts:34-51` | declarar la constante |
| 2 | `rutas.ts:57` | agregarla al *spread* de `TODAS_LAS_RUTAS` (escrito a mano: `...INICIO, ...NEGOCIO, ...OPERACION, ...FISCAL, ...DOCUMENTOS_DINERO, ...GESTION`) |
| 3 | `sidebar-nav.tsx:6` + un `<Seccion>` nuevo | importarla y pintarla |

Y hay un cuarto sitio con la **misma lista escrita otra vez a mano**:
`visibilidad.test.ts:89` (`const todas = [...INICIO, ...NEGOCIO, ...OPERACION,
...FISCAL, ...DOCUMENTOS_DINERO, ...GESTION]`).

El punto que decide si la clase quedó cerrada es el **oráculo** de la prueba
nueva: `sidebar_puerta.test.tsx:49` es
`TODAS_LAS_RUTAS.filter((i) => puedeVerRuta(rol, i.href))`. La prueba compara el
render contra `TODAS_LAS_RUTAS`, que es el sitio #2 — **otra lista mantenida a
mano en el mismo archivo que la que se olvidó**. Consecuencias medidas:

* **Caso cerrado.** Alguien agrega un item a `OPERACION`, `INICIO` o
  `DOCUMENTOS_DINERO` (las **3 de 6 que el sidebar sigue sin importar**) y lo
  clasifica en `AREA_POR_RUTA` → el item entra a `TODAS_LAS_RUTAS` por el spread
  ya escrito, `hrefsEsperados` lo incluye, el render no lo pinta, la prueba se
  pone **roja**. Bien.
* **Caso ABIERTO.** Alguien declara `export const REPORTES: Item[] = [...]` en
  `rutas.ts`, lo clasifica en `AREA_POR_RUTA`, y no toca ni el spread de `:57`
  ni `sidebar-nav.tsx`. `TODAS_LAS_RUTAS` no lo contiene → `hrefsEsperados` no
  lo espera → `faltantes` es `[]` → **la prueba pasa verde con la página
  inalcanzable**. Es el defecto del pase 4, reproducido carácter por carácter,
  con el guardarraíl nuevo puesto.
* **Caso ABIERTO y ya ocurriendo.** Una ruta que no está en ninguna constante de
  `rutas.ts` es invisible para las dos pruebas. Es el caso de `/dashboard/[id]`
  —ruta dinámica, no cabe en el mapa— y hoy no tiene ni un link. Ver el CRÍTICO.

**Veredicto:** cerró la instancia; la clase queda abierta en dos direcciones,
porque el oráculo del guardarraíl es el mismo tipo de lista a mano que el
defecto que vigila.

---

## Recuento medido: símbolos sin llamador, módulos sin importador, mapas duplicados

### Símbolos exportados sin un solo llamador — **43** (heredado: 29)

Criterio de esta medición, más estricto que el del pase 4: se descarta el propio
archivo, los `*.test.*`, **y las líneas de comentario** (`grep -vE
":[0-9]+:\s*(//|\*|/\*)"`). Esa última exclusión es la que cambia el número:
`getLiquidacionesPorDia` figuraba como "usada" solo porque tres archivos la
mencionan **en un comentario**.

**Las 29 del pase 4 siguen las 29, en la misma línea.** Verificadas una por una;
para las 29 el resultado no es "solo comentarios", es **cero menciones en todo
`src/` de producción**:

```
$ for s in getStatsPorOperador contarViajes … EstadoCargando; do …; done
getStatsPorOperador   def=analytics.ts:220   cons=[]
contarViajes          def=analytics.ts:750   cons=[]
…
EstadoCargando        def=admin/ui/kit.tsx:203  cons=[]
(29 de 29 con cons=[])
```

**Catorce más que el pase 4 no contó** (verificadas: sin llamador externo Y sin
llamador dentro de su propio archivo — las menciones internas son literales de
etiqueta tipo `'getValorAhorro/…'` en mensajes de error):

| Archivo:línea | Símbolo | Nota |
|---|---|---|
| `analytics.ts:296` | `getLiquidacionesPorDia` (51 L) | sus 3 menciones son comentarios (`page.tsx:144`, `actividad.tsx:11`, `estado.ts:43`) |
| `analytics.ts:665` | `getValorAhorro` (~50 L) | su consumidor era `/dashboard/valor-ahorro` (`2be4b1c`) |
| `administracion.ts:191` | `crearOperador` (~50 L) | era la única alta de operador desde el panel |
| `administracion.ts:298` | `politicaVigente` | **cero menciones en todo el repo, ni siquiera una prueba** |
| `operacion.ts:531` | `crearViaje` (63 L) | vivo solo desde `crear_viaje_wa.ts`, que también es huérfano → cadena muerta |
| `admin/ui/kit.tsx:180` | `EstadoError` | acompaña a `EstadoCargando`, ya reportado |
| `admin/ui/use-in-view.ts:13` | `useInView` | su único consumidor era `cifra-grande.tsx`, huérfano |
| `admin/ui/graficas.tsx:113,169,225,323,361,412,489` | `MultiLine`, `StackedBars`, `Funnel`, `Histogram`, `Heatmap`, `CalendarHeatmap`, `ParetoBars` | 7 componentes de la librería compartida sin un consumidor |

Distinción honesta: los 10 de `admin/ui/*` son **superficie de librería**
(CLAUDE.md dice explícitamente que `/dashboard` reusa `ui/kit`, `ui/graficas`,
`charts`, y `admin/analitica/page.tsx:32-33` documenta que `Heatmap` y
`CalendarHeatmap` están fuera a propósito). No pesan como los otros. **Los que
pesan son los 33 de la capa de datos y dominio**
(`analytics.ts`, `fiscal.ts`, `comercial.ts`, `operacion.ts`,
`administracion.ts`): consultas y escrituras a la base, con pruebas verdes, que
no se ejecutan nunca.

### Módulos sin importador — **4** (heredado: 2, más `crear_viaje_wa` aparte)

| Módulo | Líneas | Único importador, y dónde se fue |
|---|---|---|
| `src/app/dashboard/confirmacion.ts` | 204 | `viajes/vista.tsx:5` (`2be4b1c`). Solo lo importa `confirmacion.test.ts:2` |
| `src/app/dashboard/cifra-grande.tsx` | 75 | `contador/deducciones/page.tsx:13` (`003c88a`). Solo `cifra-grande.test.tsx:3` |
| `src/lib/likida/crear_viaje_wa.ts` | 823 | huérfano desde el pase 1. Solo `crear_viaje_wa.test.ts:45` |
| `src/app/admin/ui/use-in-view.ts` | 34 | **nuevo**: `grep -rn "use-in-view" src/` devuelve **una sola línea, y es un comentario** (`use-count-up.ts:8`) |

### Rutas que existen y a las que no lleva nada — **2**, las mismas

* `/api/export/liquidaciones/route.ts` (90 L): `grep -rn "api/export/liquidaciones" src/` → una sola línea, y es una URL de prueba (`session.test.ts:158`).
* `/dashboard/[id]/page.tsx` (409 L): ver el CRÍTICO.

### Mapas concepto→etiqueta — **3**, con el tercero divergido en 3 de 9

| # | `archivo:línea` | Quién lo consume | `caseta` | `factura` | `otro` |
|---|---|---|---|---|---|
| 1 | `src/lib/likida/cuadre/engine.ts:1201` (`const m` dentro de `label()`) | el motor, `pdf.ts:241`, `processor.ts:1117/1121/1161/1643`, WhatsApp | `'Caseta'` | `'Factura'` | `'Otro'` |
| 2 | `src/app/dashboard/[id]/page.tsx:29-33` (`const CONCEPTO`) | red de respaldo del detalle (`:401`) | `'Caseta'` | `'Factura'` | `'Otro'` |
| 3 | `src/app/dashboard/gasto-semanal-chart.tsx:9-13` (`const CONCEPTO_LABEL`) | leyenda (`:40`) y tooltip (`:75`) de «Gasto por categoría» en **Resumen** | **`'Casetas'`** | **`'Facturas'`** | **`'Otros'`** |

Los tres valores que difieren son los de la tercera fila. Las otras seis claves
(`diesel`, `alimentacion`, `hospedaje`, `transporte`, `flete`, `viaticos`)
coinciden. `etiquetas_sincronizadas.test.ts:36-37` compara **solo** #1 contra #2,
y su línea `:43` prohíbe el identificador `CONCEPTO_LABEL` **únicamente en
`pdf.ts`**. Corrido hoy: 6 verdes.

Y hay una **cuarta etiqueta para la misma clave**, que el pase 4 no vio: ver el
ALTO de `etiquetaConcepto('diesel')` más abajo.

---

## Hallazgos

### [CRÍTICO] La pantalla de detalle de liquidación no tiene un solo link entrante — el arreglo del sidebar le puso puertas a Configuración y no a la única pantalla que el demo tiene que abrir

`src/app/dashboard/[id]/page.tsx` (409 líneas) · el barrido está abajo ·
`src/app/dashboard/sidebar_puerta.test.tsx:49` como guardarraíl que no la ve.

Enumeré **todos** los `href=` de `src/app/dashboard/`:

```
$ grep -rn "href=" src/app/dashboard/ --include=*.tsx | grep -v '\.test\.'
sidebar-nav.tsx:113   /dashboard              (Resumen)
aviso-rol.tsx:83,88   pathname · /admin
error.tsx:64          /
[id]/page.tsx:169     /dashboard              (el "← volver" de la propia página)
[id]/page.tsx:191     /api/export/pdf/${d.id} (el botón de PDF, DENTRO de la página)
sin-flota.tsx:35      /admin/flotas
page.tsx:191          a.href                  (dentro de `alertas`, arreglo vacío — ver MEDIO)
chrome.tsx:74         /cuenta
suscripcion:449       f.urlPago               (Stripe)
$ grep -rn 'href={`/dashboard/' src/ --include=*.tsx | grep -v '\.test\.'
(vacío)
```

Ni `tablero-operacion.tsx` ni `inicio-operacion.tsx` contienen la palabra
`href`. **No existe en toda la aplicación un elemento clicable que lleve a una
liquidación.** El único link entrante era `cuadre/page.tsx:196`, borrado en
`2be4b1c`.

**Escenario con valores.** Javier abre el demo en `/dashboard` con la flota
Transportes Innovativos. El Resumen le pinta la dona «Viajes 830», «Liquidado
$2.4M», la gráfica de gasto por categoría y su motor fiscal. Llega el momento
del guion en que el contralor pide ver **una** liquidación —el renglón por
renglón de LIQ-2026-0418: los $4,180 de diésel, el IVA acreditable, el IEPS, la
línea de deducibilidad, el botón «PDF»— y no hay dónde hacer clic. La única
forma de llegar es pegar en la barra de direcciones un UUID de 36 caracteres que
la pantalla no enseña en ninguna parte. El sidebar recién arreglado ofrece
«Privacidad (ARCO)», «Soporte & Quejas», «Usuarios & Roles», «Políticas», «Plan
& Facturación» y «Configuración» — seis pantallas de administración de la cuenta
— y ninguna del producto.

**Consecuencia.** Es el modo de falla que este rubro existe para atrapar y el
peor de los tres que define la severidad: el demo se cae, en el paso que
justifica el precio. Y para el equipo: el arreglo del pase 4 puede leerse como
«la navegación ya está resuelta», que es justo lo que no es.

**Causa raíz probable.** Las rutas dinámicas no caben en `rutas.ts` (`Item`
exige un `href` literal), así que quedan fuera de las dos listas y, por
construcción, fuera del oráculo `TODAS_LAS_RUTAS` de la prueba nueva: la única
pantalla que no puede declararse en el mapa es también la única que ninguna
prueba puede echar de menos.

---

### [ALTO] El motor de dinero no es puro: `engine.ts` importa `sharp`, `node:fs`, `node:path` y un WASM — y por eso el mapa de etiquetas del Resumen no se puede unificar

`src/lib/likida/cuadre/engine.ts:14` contra
`src/lib/likida/intake/cfdi.ts:11-15`, con `engine.ts:19` y `engine.ts:1-9` como
la afirmación que se rompe.

`engine.ts:19` dice, literalmente, `// `formato.ts` no importa NADA: el motor
sigue siendo puro y sin I/O.` Cinco líneas antes:

```
14: import { esRfcValido, rfcChecksumOk } from '../intake/cfdi';
```

y `intake/cfdi.ts` abre así:

```
11: import sharp from 'sharp';
12: import { readFile } from 'node:fs/promises';
13: import { createRequire } from 'node:module';
14: import { join } from 'node:path';
15: import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader';
```

Los dos símbolos que el motor importa (`esRfcValido:28`, `rfcChecksumOk:53`) son
dos regex puras de nueve líneas, pero viven en el mismo módulo que el
decodificador de QR, que sí hace I/O: lee el `.wasm` de `node_modules` en
runtime y descomprime imágenes con un binario nativo. El grafo de módulos del
motor de dinero incluye hoy `sharp` y `zxing-wasm`.

**Escenario con valores — el próximo que cambie X en un lugar y no en el otro.**
X = «unificar el tercer mapa de etiquetas» (el ALTO reincidente de abajo). El
arreglo obvio, y el que el propio repo ya aplicó con éxito en `pdf.ts:14`
(`// Aquí vivía CONCEPTO_LABEL… Se borró al pasar a etiquetaConcepto`), es
sustituir `CONCEPTO_LABEL` de `gasto-semanal-chart.tsx:9` por un
`import { etiquetaConcepto } from '@/lib/likida/cuadre/engine'`. **No se puede.**
`gasto-semanal-chart.tsx` lo importa `panel-periodo.tsx:5`, que es `'use client'`
(`:1`), así que el componente está en el bundle del navegador; y
`next.config.ts:20` mete `sharp` y `zxing-wasm` en `serverExternalPackages`, que
**solo aplica al bundle de servidor**. El intento rompe el build del cliente. El
Y concreto: quien intente cerrar el ALTO por el camino correcto choca contra un
muro que no está documentado en ninguna parte, y el desenlace probable es dejar
el mapa duplicado un pase más — que es exactamente lo que lleva pasando cuatro
pases.

**Consecuencia.** Para el equipo: la única fuente de verdad de las etiquetas de
concepto **no es alcanzable desde el cliente**, y la frase que dice que el motor
es puro —la que un auditor o un desarrollador nuevo lee y cree— es falsa desde
`87426f8`. Para el producto: es la razón por la que la leyenda del Resumen dice
«Otros» y el PDF del contralor dice «Otro». No hay bug de dinero hoy: `sharp`
está externalizado en servidor y ninguna ruta cliente importa `engine.ts`. El
daño es que la frontera declarada y la frontera real no coinciden, y el
diferenciador del producto está del lado equivocado de esa diferencia.

**Causa raíz probable.** Dos responsabilidades en un módulo: `intake/cfdi.ts`
mezcla validación de formato (pura, la que el motor necesita) con decodificación
de imágenes (I/O pesado), y el import más corto arrastró la segunda.

---

### [ALTO · REINCIDENTE, 2ª ronda] El tercer mapa concepto→etiqueta sigue divergido en 3 de 9, sin un carácter de cambio

`src/app/dashboard/gasto-semanal-chart.tsx:9-13` contra
`src/lib/likida/cuadre/engine.ts:1201`, con
`src/lib/likida/etiquetas_sincronizadas.test.ts:36-43` como guardarraíl que
enumera archivos a mano.

Ver la tabla del recuento de arriba: `caseta` → `'Casetas'`, `factura` →
`'Facturas'`, `otro` → `'Otros'`. Verificado hoy contra HEAD: **byte por byte
igual que el 11-ago**.

**Escenario con valores.** Flota con $412,000 de gasto en 5 semanas. El
contralor abre `/dashboard`, la leyenda de «Gasto por categoría»
(`gasto-semanal-chart.tsx:40`) dice **Diésel · Casetas · Otros** y el tooltip
(`:75`) «Otros $38,400». Pide la conciliación de esa cuenta. `config.ts:91`
mapea `otro → '600-099'`: es una cuenta contable. El PDF que su contador tiene
archivado imprime **Otro** (`pdf.ts:241`), el mensaje que le llegó al operador
por WhatsApp decía **Caseta** (`processor.ts:1117`) y el detalle de la
liquidación dice **Otro**. Tres nombres para la misma cuenta en la misma sesión.

**Consecuencia.** Es el ejemplo canónico del rubro reproducido, y ya es la
cuarta ronda con el mismo texto. El agravante es el guardarraíl:
`etiquetas_sincronizadas.test.ts:5-14` promete por escrito ser «el mecanismo que
evita la tercera» desincronización, y corre verde con la tercera ya en el árbol.
Un guardarraíl que da confianza falsa es peor que ninguno.

**Causa raíz probable.** El guardarraíl enumera dos archivos a mano
(`:36`, `:37`) en vez de buscar el patrón en todo `src/`; y —esto es lo nuevo—
el archivo divergente **no puede** importar la fuente única por el ALTO de
arriba.

---

### [ALTO] `etiquetaConcepto('diesel')` sin `ocrExtra` devuelve «Combustible»: la pantalla donde el contralor fija el tope llama a la cuenta distinto que la pantalla donde ve que se pasó

`src/lib/likida/cuadre/engine.ts:1191-1198` contra sus siete call sites sin
`ocrExtra`: `politicas/page.tsx:155, 177, 210, 240` ·
`configuracion/page.tsx:146` · `combustible-casetas/page.tsx:202, 205`.

```
1191: export function etiquetaConcepto(c: string, ocrExtra?: Record<string, unknown>): string {
1192:   if (c !== 'diesel') return label(c);
1193:   const producto = … ocrExtra?.producto … : '';
1194:   if (!producto) return 'Combustible';
```

La función es un **etiquetador de renglón**: necesita el `ocr_extra` del gasto
para decir qué se compró. Se está usando además como **etiquetador de
catálogo**, donde no hay gasto y por tanto no hay `ocrExtra`. El resultado es
que la clave `diesel` se pinta `'Combustible'` en tres pantallas y `'Diésel'` en
las demás. La prueba que vigila esto lo sabe y lo dice —
`etiquetas_panel.test.ts:31-33`: «Sin `ocrExtra` la llamada compila y devuelve
"Combustible" a secas: el fallo se vería en la sala, no aquí» — pero su assert
(`:34`) es `expect(fuentePanel).toMatch(/etiquetaConcepto\([^)]*ocrExtra/)` sobre
**dos archivos leídos por nombre**: `[id]/page.tsx` y `pdf.ts`. Las siete
llamadas sin `ocrExtra` están en los otros tres.

**Escenario con valores.** El operador manda un ticket de Pemex por $4,180. El
motor levanta `sobre_politica` y `engine.ts:436` compone la nota con
`etiquetaConcepto(g.concepto, g.ocrExtra)` — con `producto: "DIESEL"` leído del
ticket sale: **«Diésel de $4,180.00 excede el tope de política ($3,000.00) por
$1,180.00»**. Eso es lo que el jefe lee por WhatsApp y lo que el PDF imprime. Va
a `/dashboard/politicas` a subir el tope y **no hay renglón «Diésel»**: hay uno
que dice **«Combustible»** (`:155`), con su `aria-label` «Exigir CFDI para
Combustible» (`:177`). En `/dashboard/configuracion` el catálogo de cuentas
muestra **«Combustible → 600-001»** (`:146`). En
`/dashboard/combustible-casetas` la barra dice **«Combustible»** (`:202`)
mientras la gráfica del Resumen, para el mismo dinero, dice **«Diésel»**
(`gasto-semanal-chart.tsx:10`).

**Consecuencia.** Cuatro nombres para una clave (`Diésel`, `Combustible`,
`Casetas`/`Caseta`…) en un producto cuyo argumento de venta es que el contralor
puede cruzar la pantalla contra su PDF. Y para el equipo: la función que se
adoptó **como** la solución al problema de los mapas duplicados introduce una
variante nueva cuando se la llama con un argumento de menos, y TypeScript no
puede avisar porque el parámetro es opcional.

**Causa raíz probable.** Un solo símbolo cubre dos contratos distintos
—«etiqueta este gasto» y «etiqueta esta categoría»— y el segundo se obtiene
omitiendo un argumento opcional, que es el sitio exacto donde el compilador
calla.

---

### [ALTO · REINCIDENTE, 3ª ronda] `RUTA_DE_DIFERENCIA` sigue mandando 12 veredictos «al panel», y el panel donde se veían sigue sin existir

`src/lib/likida/cierre_aviso.ts:131-145`, sin un carácter de cambio desde el
pase 4. Los doce `'panel'` siguen ahí con sus comentarios intactos, incluido
`:142` `combustible_efectivo_dentro15: 'panel', // informativo, el contador vive
en el panel` — y el panel del contador se borró entero en `003c88a`. Escenario y
consecuencia: idénticos a los del pase 4 (viaje LIQ-2026-0418, ticket de $4,180
con OCR de confianza 0.62 → `ocr_baja_confianza` → clasificado `'panel'` → no se
manda por WhatsApp a propósito → ninguna pantalla lo enseña).

Lo agravo con lo que medí hoy: la única pantalla viva que todavía pinta algo de
esa familia es `/dashboard/combustible-casetas`, y aunque el arreglo del sidebar
por fin le puso link, cubre 1 de los 12 tipos.

**Causa raíz probable.** Sin cambio: una dependencia que apunta al revés — un
módulo de dominio codifica una afirmación sobre qué pantallas existen, y nada
—ni tipo ni prueba— ata esa afirmación al árbol de rutas.

---

### [ALTO · REINCIDENTE, 3ª ronda] El bot de WhatsApp sigue prometiendo tres capacidades del panel que se borraron

`src/lib/likida/processor.ts:441-444`, verbatim:

```
441: `Por aquí te aviso cuando un chofer no confirma su viaje y cuando haya comprobantes por facturar. ` +
442: `Para asignar viajes, reasignar chofer o ver liquidaciones, entra a ${process.env.NEXT_PUBLIC_APP_URL ?? 'tu panel'}.`
```

Las tres siguen sin existir. Ahora el escenario es peor de un modo específico y
medible: el arreglo del sidebar hizo que el contador **sí** llegue a algún lado
(2 links: Combustible & Casetas y Plan & Facturación), así que ya no ve un menú
en blanco — ve un menú que no contiene ninguna de las tres cosas que el mensaje
le prometió, y **«ver liquidaciones» sigue siendo imposible incluso a mano**,
porque no hay listado (ver el CRÍTICO). El comentario de `:436-439` sigue
declarando la regla que el mensaje rompe.

---

### [ALTO · REINCIDENTE, 4ª ronda] «Periodo» sigue definido en cuatro sitios con tres unidades, y «histórico» sigue significando tres cosas

`analytics.ts:177` · `analytics.ts:421` · `fiscal.ts:867` · `actividad.tsx:53`,
todos bajo el `useState` de `panel-periodo.tsx:44-45`. Verificados hoy línea por
línea: **ninguno cambió**.

* `analytics.ts:177` — `getSerieComparativa(tenantId, 3650, 1, hoy)` → **10 años** (mueve la dona «Viajes» vía `panel-periodo.tsx:47,73-76`).
* `analytics.ts:421` — `SEMANAS_POR_MODO = { semanal: 5, mensual: 13, historico: 52 }` → **1 año** (mueve «Gasto por categoría», «Liquidado», «Top rutas»).
* `fiscal.ts:867` — `getGastosFiscales(tenantId, resolverPeriodo('todo', hoy), hoy)` → **sin cota** (mueve «En riesgo/perdido» y «Recuperable»).
* `actividad.tsx:53` — `bucketsPorDia(viajes, 7 | 30)`.

Escenario con valores, sin cambios: flota con 3 años de captura (830 viajes,
$6.1M totales, $2.4M en 12 meses). El contralor pone el único selector de la
pantalla en **«Histórico»** y lee, de arriba abajo y sin rótulo que los
distinga: dona **830** (10 años), «Gasto por categoría» **$2.4M** (52 semanas),
«Liquidado» una cifra de 24 px sin rótulo de tiempo (`panel-periodo.tsx:105`),
«En riesgo» sobre **$6.1M** (todo). Sigue habiendo **dos tipos `ModoPeriodo`**:
`analytics.ts:422` (exportado y sin un solo importador) y `actividad.tsx:3` (el
que de verdad se usa, `panel-periodo.tsx:8`).

**Causa raíz probable.** Sin cambio: se unificó el `useState`, no el dominio.

---

### [ALTO · REINCIDENTE, 3ª ronda] `dashboard/page.tsx:84` sigue calculando `hoy` en UTC y se lo pasa a ocho funciones que lo declaran en hora de México

`src/app/dashboard/page.tsx:84` (`const hoy = new Date(ahoraMs()).toISOString().slice(0, 10);`)
contra `analytics.ts:92, 172, 299, 381, 434, 457, 491, 1025` (todos
`toLocaleDateString('en-CA', { timeZone: TZ_MX })`) y `fiscal.ts:744, 852` (el
contrario). Verificado hoy: idéntico. `page.tsx:85-88` sigue derivando
`diasEjercicio` de ese mismo `hoy` y pasándoselo a `getAcreditables`
(`page.tsx:95`).

Escenario con valores, sin cambios: 31-dic-2026, 18:30 hora de México (CST =
UTC−6) → `Date.now()` ya es 1-ene-2027 en UTC → `hoy = '2027-01-01'` →
`resolverPeriodo(undefined, hoy)` retitula «Tu motor fiscal — Ejercicio 2027» y
`diasEjercicio` vale **1**, así que `getAcreditables(tenantId, 1)` devuelve los
litros de un solo día: «Diésel elegible para el estímulo: 0.00 L» la noche
exacta del cierre de ejercicio.

**Causa raíz probable.** Sin cambio: el contrato de zona horaria vive en un valor
por defecto de parámetro, el sitio exacto donde un llamador lo pisa en silencio.

---

### [MEDIO] Un cuarto mapa duplicado, `FASE_LABEL`, copiado en 4 archivos y **ya divergido** en el que decide cómo se lee el costo de IA

`src/app/admin/page.tsx:21-24` · `src/app/admin/analitica/page.tsx:11-14` ·
`src/app/admin/costos-facturacion/page.tsx:63-66` — los tres idénticos, con las
seis fases — contra `src/app/admin/model-ops/page.tsx:29`:

```
29: const FASE_LABEL: Record<string, string> = { ocr: 'Agente OCR', cuadre: 'Agente de Cuadre', whatsapp: 'Agente de WhatsApp' };
```

Tres claves de menos: `escalacion`, `chat`, `router`. Y se usa con fallback a la
clave cruda:

```
108: <Dona segmentos={r.porFase.map((f) => ({ etiqueta: FASE_LABEL[f.fase] ?? f.fase, valor: f.costoUsd }))} />
```

**Escenario con valores.** Un mes con $41.20 USD de gasto de IA repartido en las
seis fases. Javier abre `/admin` y ve la dona con «Agente de Escalación
$6.80 · Agente de Chat $4.10 · Agente Router $1.90». Abre `/admin/model-ops`
—la pantalla hecha justo para decidir qué modelo usa cada agente— y la misma
dona dice **«escalacion $6.80 · chat $4.10 · router $1.90»**, en minúscula y sin
acento. Si mañana alguien renombra una fase en los tres archivos que la tienen
completa, `model-ops` se queda con la vieja y nadie se entera.

**Consecuencia.** Es el ejemplo canónico del rubro en su cuarta encarnación, y
esta ya está divergida sin que nadie la haya reportado. Pega en `/admin`
—la consola de Javier, no la del contralor—, y por eso es MEDIO y no ALTO: el
costo es de mantenibilidad y de confianza en la propia medición del negocio, no
de una cifra que el cliente vea. Ninguna de las cuatro copias tiene prueba de
sincronía; `etiquetas_sincronizadas.test.ts` no las menciona.

**Causa raíz probable.** No hay una prueba que busque *el patrón* «dos
`Record<string, string>` con el mismo nombre en archivos distintos»; los
guardarraíles de este repo enumeran archivos por nombre, así que solo cubren los
duplicados que ya se conocían.

---

### [MEDIO · REINCIDENTE] El bloque de alertas del Resumen sigue siendo código inalcanzable, y la detección de fraude se sigue calculando y tirando

`src/app/dashboard/page.tsx:158` y `:188-200`, con `src/app/dashboard/estado.ts:29-39`.

Verificado hoy: `const alertas: Array<{ texto: string; href: string }> = [];`
(`:158`) y **ningún `push`** en el archivo — `grep -n "alertas" page.tsx` da
`75, 153, 158, 188, 190`, y 75/153 son comentarios. Las 13 líneas de JSX de
`:188-200` están guardadas por `alertas.length > 0`, condición demostrablemente
falsa. `detectarAnomalias(tenantId)` sigue consultándose en cada carga
(`page.tsx:97`) y su único destino es `estadoPanel`, donde `estado.ts:30-31`
solo lo cuenta como `=== null`:

```
30:  const secciones = [s.acreditables, s.kpis, s.liquidaciones, s.anomalias];
31:  const caidas = secciones.filter((x) => x === null).length;
```

**Escenario con valores.** Tres comprobantes de diésel de $4,180 que aparecen en
dos viajes distintos —el patrón de ordeña que `detectarAnomalias` existe para
cazar— y 5 liquidaciones en `revisar`. El contralor abre `/dashboard`: la
consulta corre, encuentra los tres, y el arreglo se descarta. Antes de `2be4b1c`
la pantalla decía «3 comprobantes aparecen en más de un viaje · Ver →».

**Causa raíz probable.** Sin cambio: se desconectó el productor en vez de borrar
el consumidor, y TypeScript bendice un arreglo vacío tipado.

---

### [MEDIO · REINCIDENTE] La dona «Viajes» y la gráfica «Actividad» cuentan lo mismo por dos caminos, uno agregado y otro topado a 100 filas

`src/app/dashboard/panel-periodo.tsx:47,73-76` (dona, de `seriesKpis[modo]`, que
sale de `getSerieComparativa` vía `traerTodo`) contra `panel-periodo.tsx:85` →
`src/app/dashboard/actividad.tsx:53` (barras, del arreglo `viajes`), con
`src/lib/likida/analytics.ts:802` (`getViajes(tenantId, limite = 100)`,
`.order('created_at', {ascending:false}).limit(limite)`) y
`src/app/dashboard/page.tsx:99` (`getViajes(tenantId)`, sin argumento).

Sin cambios. Con 140 viajes en 30 días y el selector en «Mensual», la dona dice
140 y las barras de al lado suman 100 como máximo. Mitigación parcial que sí
existe: el modo «histórico» de `Actividad` usa `porMes` (`getViajesPorMes`, un
agregado real sin tope, `page.tsx:120`), así que el desfase solo se ve en
semanal y mensual. El tipo `ViajeRow[]` sigue sin decir en ninguna parte que
está truncado — es el mismo tope silencioso que `traerTodo` existe para evitar,
reintroducido por la puerta del componente.

---

### [BAJO] `usuarios/page.tsx:16` le describe al dueño de la flota una ruta borrada hace cinco días

`src/app/dashboard/usuarios/page.tsx:12-18`:

```
16:  operador: 'No entra a este panel: usa WhatsApp y /mis-viajes',
```

`/mis-viajes` se borró el 7-ago-2026 junto con el rol `operador` de login
(mig. `0086`). Las otras dos menciones en `src/` son comentarios que documentan
su borrado (`proxy.ts:104`, `admin/selector-vista.tsx:25`); esta es la única que
se **pinta en pantalla** (`:109`, `{ROLES[u.rol] ?? …}`).

**Escenario.** El dueño de una flota que todavía tenga un `app_user` con rol
`operador` en su tabla —el dominio de `app_user.rol` lo sigue admitiendo, la
migración retiró el login, no la fila— abre `/dashboard/usuarios` y lee que su
chofer «usa WhatsApp y /mis-viajes». Le pide al chofer que entre ahí; el proxy
lo rebota.

**Consecuencia.** Menor, y por eso BAJO. Lo anoto porque es la misma clase que
los ALTO de `cierre_aviso.ts` y `processor.ts`: una cadena de texto que afirma
algo sobre el árbol de rutas, sin ninguna referencia que las ate. Van tres
sitios distintos con el mismo patrón; es la clase, no la instancia.

Nota adyacente que **no** cuento como hallazgo (es de frontend, no mío): los
cuatro mapas rol→etiqueta del panel (`chrome.tsx:26` `'ADMIN FLOTA'`,
`aviso-rol.tsx:7` `'Dueño de la flota'` / `'Jefe de tráfico'`,
`admin/mi-perfil/page.tsx:9` `'Dueño / Admin de flota'`, `usuarios/page.tsx:12`
descripciones) usan cuatro vocabularios distintos para los mismos cuatro roles.
No hay divergencia *de significado*, así que lo dejo declarado.

---

## Hallazgos de pases anteriores que YA NO APLICAN

* **CRÍTICO del pase 4 — «el mapa de navegación está escrito dos veces y 7 de 9
  páginas no tienen puerta»: CERRADO CON ARREGLO** (`8d6ac51`), verificado por
  render en las tres roles. Las siete páginas tienen link; el contador ya no ve
  el `<nav>` vacío. La *clase* del defecto sigue abierta y la reporto arriba como
  parte de la verificación, no como hallazgo nuevo: el arreglo hizo lo que
  prometía.
* **Pase 2 #3 — `costoPorViaje` `number|null` aplanado a `0`: sigue cerrado**
  (`resumen-visual.tsx:108` con `valor: number | null`, `kpi-periodo.tsx:71` con
  `valorActual ?? null`). Reverificado hoy.
* **Pase 1 #6 — `KpiTile`:** cerrado por el mismo arreglo; sin regresión.
* Nada más se cerró. **Cerrados por supresión en este pase: cero** (no se borró
  código en el pase 5; `master` no avanzó).

---

## Lo que revisé y está bien

* **La ejecución del arreglo `8d6ac51` es correcta y la prueba es del tipo
  correcto.** Renderiza el componente real (`renderToStaticMarkup`,
  `sidebar_puerta.test.tsx:43`), afirma sobre los `href` del HTML, cubre las dos
  direcciones (falta y sobra) y mockea `next/link` por el motivo escrito y no
  por conveniencia. Es la diferencia entre probar la regla y probar el cableado,
  y este pase el cableado quedó probado. Mi objeción es al **oráculo**, no al
  método.
* **El cálculo de dinero sigue viviendo en un solo archivo.**
  `git diff --stat 8f70906..HEAD -- src/lib/likida/cuadre/ src/lib/likida/liquidacion/`
  → vacío. No hay una segunda copia de `cuadrarViaje`, ni de `filasDeducibilidad`,
  ni del cálculo de IEPS/IVA acreditable. El ancla de «4 o menos» no se dispara:
  lo que está mal es el grafo de imports del motor, no que su lógica esté
  duplicada.
* **`formato.ts` sigue siendo la única fuente de formato**, y `TZ_MX` y
  `TASA_IVA` viven en un solo sitio cada uno (`formato.ts:34`, `saas/iva.ts:42`).
  El literal `0.16` fuera de ahí aparece 3 veces y las 3 son texto de prompt o
  comentario (`intake/ocr.ts:40,134`, `fiscal.ts:18`).
* **`getConfig()` es una frontera de verdad.** Los 8 lectores de la política
  (`politicas`, `configuracion`, `page.tsx`, `tools.ts` ×2, `processor.ts`,
  `desde_db.ts` ×2, `administracion.ts:299`) pasan todos por ella; nadie lee
  `tenant.config.politica` a mano ni toca la tabla muerta `politica_gasto`.
* **`AREA_POR_RUTA` sigue 1:1 con el árbol** (`visibilidad.ts:75-92`, 8 entradas,
  8 páginas). `puedeVerRuta` niega por default; `inicioDe` sigue sin ciclar.
* **La frontera servidor/cliente del Resumen sigue bien puesta**:
  `panel-periodo`, `kpi-periodo`, `motor-fiscal-periodo`, `gasto-semanal-chart`
  y `top-rutas` reciben datos planos y solo usan `import type`;
  `page.tsx:126-140` explica por qué `resumirPerdidas` corre en servidor. Es
  justamente esa frontera bien puesta la que hace imposible importar
  `etiquetaConcepto` desde el chart (ver el ALTO del motor).
* **La compuerta está limpia**: `tsc` 0 errores, `eslint` 0 errores / 17
  warnings (los mismos 17 del pase 4, todos `no-unused-vars` en pruebas).

---

## Lo que NO alcancé a revisar

* **`repo.ts` NO es una frontera de acceso a datos — lo confirmo con número, no
  lo cierro con hallazgo.** `grep -rl "supabaseAdmin()" src/ | grep -v '\.test\.'`
  → **50 archivos**, repartidos así: 20 en `src/lib/likida/`, 6 en `src/app/api/`,
  6 en páginas de `/dashboard` y `/admin`, 4 en `facturacion/`, 3 en `saas/`,
  3 en `auth/`. `repo.ts` es uno de los 50, no la puerta. Y la tabla
  `liquidacion` se lee desde **15 sitios distintos**. Busqué la divergencia que
  lo convertiría en hallazgo —dos lecturas de la misma tabla que devuelvan
  cifras distintas para lo mismo— y no la encontré con valores: las 15 leen
  columnas coherentes y 13 de las 15 pasan por `traerTodo`/`exigir`. La excepción
  (`analytics.ts:1551`, `getLiquidaciones`, `.limit(50)` con `throw` a mano) está
  huérfana. Lo dejo declarado un pase más en vez de inventarle un escenario.
* **`src/lib/likida/facturacion/` (~4,000 líneas).** Cuarto pase consecutivo
  fuera. Solo entré a `identificar.ts` y `caducidad.ts` para verificar la pureza
  del motor. `capufe.ts:896` compara dinero con tolerancia y sigue mereciendo
  una pasada de fronteras propia.
* **`processor.ts` (2,100+ líneas) ↔ `conv.ts` ↔ `tools.ts`.** El reparto de
  responsabilidad entre los tres sigue sin auditarse como arquitectura; entré
  solo a `:435-450` y a los cuatro call sites de `etiquetaConcepto`.
* **`supabase/migrations/` contra `src/types/likida.ts`.** Cuarto pase sin
  comparar esquema contra tipos. Con 33 funciones de datos huérfanas que leen
  columnas que nadie vuelve a tocar, sigue siendo el sitio donde una divergencia
  va a aparecer sin que nada la vea.
* **Los subconjuntos de `TipoDiferencia` escritos a mano** (`engine.ts:100-101`,
  `engine.ts:985`, `resumen.ts:24`) siguen sin prueba de exhaustividad;
  `cierre_aviso.ts:104` sí es `Record<TipoDiferencia, …>` y por tanto exhaustivo
  por tipo.
* **El render.** No levanté preview ni screenshot. El CRÍTICO de este pase no lo
  necesita —es la ausencia de todo `href` a `/dashboard/<id>` en el árbol, y el
  barrido está pegado arriba—, y el estado del sidebar lo verifiqué ejecutando
  su prueba, que sí renderiza. Aun así, una captura de `/dashboard` y de
  `/dashboard/politicas` confirmaría de un vistazo el ALTO de «Combustible» vs
  «Diésel», y vale la pena antes de enseñárselo a nadie.
