# Pruebas — auditoría 17 · pase 4 (11-ago-2026)

**Nota: 5/10** (antes 5). Razón del movimiento: **se atacó y subió** por un lado
—el borrado de 35 páginas se manejó bien desde las pruebas: medí que **ninguna**
de las 89 pruebas perdidas era ancla de cálculo de dinero, el control de
`visibilidad.ts` muere con 6 fallos, el barrido estructural de etiquetas sigue
cazando su bug exacto, y **la única prueba intermitente del repo quedó
arreglada** (verificada en 4 zonas horarias)— y **deuda que cobró factura** por
el otro: **C6 llega a su CUARTO pase** sin moverse, entró **una derivación fiscal
nueva a la capa de dinero sin una sola prueba** (`opcionesDe`), y el trinquete de
cobertura **subió 2.46 puntos mientras la cobertura real BAJÓ 160 statements**.
Se compensan exactamente; la nota no se mueve.

> **El riesgo mayor del rubro, hoy:** el borrado le regaló al trinquete de
> cobertura **873 statements de holgura**. Statements cubiertos: 12,909 → **12,749
> (−160)**. Statements totales: 18,763 → **17,890 (−873)**. El porcentaje pasó de
> 68.8% a **71.26%** y los tres umbrales (67/84/79) quedaron con más aire del que
> tenían. O sea: se probó **menos** código que ayer y la puerta que vigila eso
> dice que mejoramos. El repo puede meter 873 statements nuevos sin una sola
> prueba antes de que el CI vuelva a quejarse, y el primero ya entró en el mismo
> commit del borrado (`opcionesDe`, hallazgo 1).

---

## Compuerta, verificada por mí hoy

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 258 archivos · 3,105 verdes · 1 saltada  (64.6 s)
npx vitest run --coverage
   Statements 71.26% (12749/17890) · Branches 84.66% (4914/5804)
   Functions  83.05% (701/844)     · Lines      71.26%
   umbrales: 67 / 84 / 79 → PASA (el margen más chico sigue siendo RAMAS: 0.66 pt)
   bajo --coverage: 3,103 verdes | 3 saltadas — las 2 de tiempo que el paso
   extra de `ci.yml` recupera. Coincide con lo documentado.
```

Delta contra el pase 3 (3,187 verdes · 68.8% · 12,909/18,763):

| | pase 3 | pase 4 | delta |
|---|---|---|---|
| pruebas verdes | 3,187 | 3,105 | **−82** |
| statements **cubiertos** | 12,909 | 12,749 | **−160** |
| statements **totales** | 18,763 | 17,890 | −873 |
| % statements | 68.8 | **71.26** | +2.46 |
| % ramas | 84.57 | 84.66 | +0.09 |
| % funciones | 81.28 | 83.05 | +1.77 |

Cobertura por archivo de lo que audito (v8, statements, corrida de hoy):

```
   0.0%   33  src/app/api/cron/purgar/route.ts
   0.0%   37  src/app/api/cron/escalar/route.ts
   0.0%   39  src/app/api/dashboard/asistente/route.ts
   0.0%   41  src/app/dashboard/top-rutas.tsx
   0.0%   42  src/app/api/export/liquidaciones/route.ts
   0.0%   43  src/app/dashboard/motor-fiscal-periodo.tsx
   0.0%   47  src/app/api/cron/facturar/cola/route.ts   ← C6, CUARTO pase sin mover
   0.0%   63  src/app/dashboard/gasto-semanal-chart.tsx
   0.0%   84  src/app/dashboard/panel-periodo.tsx
   0.0%   93  src/app/dashboard/rail.tsx
   0.0%  106  src/app/api/export/pdf/[id]/route.ts
   0.0%  106  src/app/dashboard/inicio-operacion.tsx    ← la pantalla del encargado, superficie NUEVA
   0.0%  200  src/lib/likida/comercial.ts
  22.3%  175  src/lib/saas/stripe.ts
  28.8%  146  src/lib/likida/facturacion/agente.ts
  39.4%   71  src/app/dashboard/tablero-operacion.tsx
  48.5%   66  src/app/dashboard/resumen-visual.tsx      ← subió de 40.9
  56.7%  557  src/lib/likida/repo.ts
  62.1%  116  src/app/api/stripe/webhook/route.ts
  75.4%  471  src/lib/likida/fiscal.ts                  ← 460→471 stmts; los 11 nuevos son `opcionesDe`
  88.2%  817  src/lib/likida/analytics.ts               ← bajó de 90.1 (entró `getLiquidaciones`, 0 pruebas)
  97.6%   42  src/app/dashboard/kpi-periodo.tsx
  99.0%   98  src/lib/likida/recordatorio_comprobacion.ts
 100.0%    6  src/app/dashboard/rail-marca.ts
 100.0%   43  src/lib/auth/visibilidad.ts
 100.0%  461  src/lib/likida/cuadre/engine.ts
```

Las dos líneas que cuentan la historia del pase: **`fiscal.ts` ganó 11 statements
y perdió 1.6 puntos**, **`analytics.ts` ganó 17 y perdió 1.9**. Las dos ganaron
lógica de dinero rescatada de páginas borradas, y ninguna de las dos piezas
rescatadas trae prueba.

---

## Las 89 pruebas que se fueron con el borrado: cuáles y si dolieron

**Respuesta corta: no, ninguna era ancla de dinero.** Lo medí, no lo deduje.

Solo **DOS archivos de prueba** se borraron, con **5 pruebas entre los dos**. Las
otras ~84 son **filas de `it.each` sobre listas de rutas** — el mismo aserto
parametrizado, una vez por pantalla, en dos archivos de permisos.

**Medición dura.** Saqué del árbol viejo los cuatro archivos que hacen falta
(`visibilidad.test.ts`, `visibilidad.ts`, `rutas.ts`, `tenant-efectivo.test.ts`),
corrí solo esos dos test files y revertí:

```
$ git checkout 20ecbb1 -- src/lib/auth/visibilidad.test.ts src/lib/auth/visibilidad.ts \
                          src/app/dashboard/rutas.ts src/lib/auth/tenant-efectivo.test.ts
$ npx vitest run src/lib/auth/visibilidad.test.ts src/lib/auth/tenant-efectivo.test.ts
 ✓ src/lib/auth/tenant-efectivo.test.ts (45 tests)
 ✓ src/lib/auth/visibilidad.test.ts     (90 tests)
      Tests  135 passed (135)
$ git checkout HEAD -- <los cuatro>     # árbol limpio, verificado
```

Hoy los mismos dos archivos dan **22** y **35**. Es decir:

| archivo | antes | hoy | delta | qué eran |
|---|---|---|---|---|
| `src/lib/auth/visibilidad.test.ts` | **90** | **35** | **−55** | `it.each` sobre listas de rutas: `PROHIBIDAS` 14→4, `SUYAS` 9→1, `FISCAL.map` 6→0, `OPERACION_PROHIBIDA` 7→1, y `TODAS_LAS_RUTAS` (que sale de `rutas.ts`, cuyos `href:` bajaron de **40 a 9**) |
| `src/lib/auth/tenant-efectivo.test.ts` | **45** | **22** | **−23** | `it.each` sobre `RUTAS`, que bajó de 27 entradas a 8 |
| `src/app/dashboard/contador/page.test.tsx` | 2 | **borrada** | −2 | auditoría 10 **BAJO** de frontend: el grid `items-start` |
| `src/app/dashboard/contador/periodo.test.tsx` | 3 | **borrada** | −3 | auditoría 10 **BAJO**: el rango de fechas con `fechaMx()` y no ISO crudo |
| `src/app/dashboard/dinero_por_area.test.ts` | ~6 | **2** | ~−4 | el barrido de dinero-en-pantalla-de-operación (ver hallazgo 3) |
| `src/app/admin/ui/filtro_rango.test.ts` | 18–19 | 17 | −1/−2 | `PAGINAS` 3→2 |
| `despacho/vista.test.tsx` → `tablero-operacion.test.tsx` | 3 | 3 | 0 | renombre puro |
| `etiquetas_sincronizadas.test.ts`, `actividad.test.ts` | 6, 6 | 6, 6 | 0 | mismo número |

**−55 −23 −5 −4 −2 ≈ −89.** Cuadra con la caída de 3,194 a 3,105 que reporta el
MAPA (mi línea base de hoy da 3,105 exacto).

### ¿Alguna de las cinco pruebas de archivo borrado anclaba una regla que sigue viva?

Fui a mirar las dos, una por una, buscando una **violación viva** en el código
que queda. Una sí, la otra no:

- **`contador/periodo.test.tsx` — cerrada de verdad.** Anclaba *«el rango de
  fechas usa `fechaMx()`, no el ISO crudo»* sobre `EncabezadoFiscal`. Barrí lo
  que queda: `resolverPeriodo` tiene un solo consumidor
  (`dashboard/page.tsx:85`) y **ninguna pantalla superviviente imprime
  `periodo.desde`/`periodo.hasta` en pantalla** — `page.tsx:86` solo los resta
  para contar días. Sin instancia viva, no hay hallazgo. La regla hermana —el
  formato de cifras concentrado en `lib/formato.ts`— sigue con su prueba propia.
- **`contador/page.test.tsx` — dejó una violación viva.** Ver hallazgo 5.

### Lo que sí me preocupa del borrado, y no es una prueba perdida

Son **dos piezas de lógica de dinero que el borrado RESCATÓ de las páginas
—decisión correcta— y metió a la capa de datos sin traerles arnés**:

1. `fiscal.ts:212` `opcionesDe()` — venía de `dashboard/contador/comun.tsx` y
   carga un **ALTO de la auditoría 14**. Cero pruebas. Hallazgo 1.
2. `analytics.ts:1550` `getLiquidaciones()` — venía de `dashboard/cuadre/page.tsx`
   y carga el **CRÍTICO de la auditoría 5** (`if (error) throw`). Cero pruebas y
   cero llamadores. Hallazgo 4.

El commit `a47d1d7` dice, textual, que mueve la función *«para que borrar la
página no la pierda»*. Se salvó el código; no se salvó la garantía.

---

## Las pruebas que se modificaron: ¿se aflojaron?

### `visibilidad.test.ts` (61 líneas, mismo commit que `visibilidad.ts`) — **NO bendice el cambio**

Era la sospecha principal del pase, y la refuté con un mutante. El cambio de
producción es que `inicioDe('contador')` deja de mandar al panel borrado y
aterriza en Suscripción (`visibilidad.ts:169`). Le devolví el destino viejo:

```ts
-  if (puedeVerArea(rol, 'dinero')) return '/dashboard/suscripcion';
+  if (puedeVerArea(rol, 'dinero')) return '/dashboard/contador';
```

```
 AssertionError: expected "/dashboard/contador" to be "/dashboard/suscripcion"
  ❯ src/lib/auth/visibilidad.test.ts:172:34
 Test Files  2 failed | 5 passed (7)
      Tests  6 failed | 91 passed (97)
```

**Murió, y con 6 fallos en dos archivos** (`visibilidad` y `tenant-efectivo`, que
comparte la garantía). Y no muere solo por el valor literal: la propiedad
anti-bucle —`expect(puedeVerRuta('contador', inicioDe('contador'))).toBe(true)`,
`:74` y `:173`— **también** revienta, que es la que de verdad importa (mandar al
contador a una ruta sin área declarada lo rebota otra vez, para siempre). El
comentario del archivo lo dice y esta vez el `expect` lo respalda. Esto está
bien hecho.

**Lo que sí se aflojó, y es real:** las listas concretas se vaciaron. `PROHIBIDAS`
del encargado pasó de 14 rutas a 4, `SUYAS` de 9 a 1, y el bloque del contador de
7 pruebas a 2. Es consecuencia inevitable de que las rutas ya no existen —no es
poda para maquillar—, pero deja al rubro con una superficie de permisos mucho
más chica que vigilar: hoy hay **8 rutas** en `AREA_POR_RUTA` (`/dashboard`,
`arco`, `soporte`, `combustible-casetas`, `suscripcion`, `usuarios`, `politicas`,
`configuracion`) contra las 40 de `rutas.ts` de ayer.

Y dejó **tres aserciones tautológicas** — hallazgo 6.

### `etiquetas_sincronizadas.test.ts` — **NO se debilitó**

Su cambio es de **4 líneas**: el bucle de "el mapa de estatus no está duplicado
en las páginas" pasó de 2 rutas a 1, porque `/dashboard/cuadre/page.tsx` ya no
existe. La copia superviviente (`[id]/page.tsx`) se sigue mirando con los dos
mismos `expect`.

Lo que hace fuerte a este archivo **no se tocó**: el barrido de CONCEPTO sigue
comparando `cuadre/engine.ts` contra `[id]/page.tsx` **clave por clave y etiqueta
por etiqueta**, y sigue exigiendo que el tipo `ConceptoGasto` esté cubierto
entero. Lo verifiqué con el mutante de su propio bug histórico:

```
$ sed -i "s/otro: 'Otro'/otro: 'Gasto'/" "src/app/dashboard/[id]/page.tsx"
 × etiquetas de concepto — las tres fuentes dicen lo mismo > y les ponen la MISMA etiqueta
   "otro" difiere entre el motor y el panel   (etiquetas_sincronizadas.test.ts:53)
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
```

Sigue cazando exactamente lo que existe para cazar. Revertido.

### `actividad.test.ts` — **ARREGLADA, y bien** (cierra mi MEDIO de dos pases)

`master` metió `d.setHours(0, 0, 0, 0)` en los dos helpers, que es la causa raíz
que reporté: las dos mitades ya miden "hoy" con el mismo reloj. Re-corrí el
experimento del pase 2/3, hoy a las 11:20 UTC:

```
== TZ=UTC ==                 Tests  6 passed (6)
== TZ=America/Mexico_City == Tests  6 passed (6)
== TZ=Asia/Tokyo ==          Tests  6 passed (6)   ← fallaba 4 de 6
== TZ=Etc/GMT+12 ==          Tests  6 passed (6)   ← fallaba 4 de 6
```

Es el único hallazgo mío cerrado **por arreglo** en cuatro pases. (Nota menor,
sin severidad: en zonas al este de Greenwich el string sigue siendo el día
anterior, pero prueba y código lo calculan igual, así que es estable a toda hora;
para México, UTC−6, además es el día correcto.)

### `tenant-efectivo.test.ts` — encogió, no se aflojó

Cambió `RUTAS` (27→8) y sustituyó los destinos borrados por `/dashboard/suscripcion`
en 6 casos puntuales. Las garantías siguen enteras y **más específicas**: el
rebote con sufijo (`?vista=demo&rol=contador`), que `?rol=` no escala, y que al
chofer se le niega toda pantalla. Murió junto con `visibilidad` en mi mutante de
control (dos de sus 22 pruebas están entre los 6 fallos).

### `dinero_por_area.test.ts` — **sí se aflojó, y de forma peligrosa.** Hallazgo 3.

### `filtro_rango.test.ts` y `tablero-operacion.test.tsx` — sin pérdida

`filtro_rango` sacó `analitica/page.tsx` de una lista de 3; los otros dos siguen
barridos. `tablero-operacion.test.tsx` es un renombre con **cero** cambios de
aserción; solo se corrigió el título (*«los seis rótulos»* → *«los rótulos
accionables e informativos»*), que **ya mentía antes**: siempre afirmó sobre
dos, no seis. El renombre honró el título; la cobertura del rótulo sigue en 2 de 6.

---

## Hallazgos abiertos de pases anteriores: qué pasó con cada uno

| Hallazgo | Estado hoy | Evidencia |
|---|---|---|
| **[CRÍTICO] C6 — la cola de CFDI sin una sola prueba** | **REINCIDENTE, 4.º pase** | Ver abajo |
| **[ALTO] la prueba "DOS CORRIDAS SOLAPADAS" no prueba el claim** | **REINCIDENTE, re-mutado hoy** | `recordatorio_comprobacion.ts:208`. Borré `.is('recordatorio_comprobacion_en', null)` del UPDATE del claim → `Test Files 6 passed · Tests 64 passed`. El archivo de prueba **creció +98 líneas** en esta rama y entró `recordatorio_lote_truncado.test.ts` (+137): `grep "\.is("` sobre los dos → **cero**. Más pruebas, mismo hueco |
| **[ALTO] el cron `escalar` a 0%** | **REINCIDENTE** | 0.0% / 37 stmts; `ls src/app/api/cron/escalar` → solo `route.ts` |
| **[ALTO] las TRES descargas de dinero a 0%** | **UNA CERRADA POR SUPRESIÓN, DOS VIVAS** | `src/app/dashboard/contador/cfdi/export/route.ts` **se borró** con el panel (64 stmts que salen del denominador). Siguen `export/liquidaciones` (0.0%/42) y `export/pdf/[id]` (0.0%/106), los dos con un solo `route.ts` en su directorio |
| **[ALTO] `analytics.ts` pierde el filtro de tenant sin que nada falle** | **REINCIDENTE Y AGRAVADO** | `analytics.ts:108` intacto; no gasté corrida en re-mutar lo idéntico. Agravado: el archivo ganó `getLiquidaciones` con **otro** `.eq('tenant_id')` sin ancla (hallazgo 4) y su cobertura bajó de 90.1% a 88.2% |
| **[ALTO] `rail.tsx` a 0%: el CRÍTICO del panel en blanco vuelve sin que nada falle** | **REINCIDENTE** | `rail.tsx` sigue en **0.0% / 93 stmts** y `rail-marca.ts` en 100% / 6. No re-corrí el mutante B: el arreglo del pase 3 es lo único que cambió el archivo y `rail_marca.test.ts` sigue sin mirar el componente |
| **[ALTO] `/api/dashboard/asistente` — IDOR documentado, 0%** | **REINCIDENTE** | 0.0% / 39 stmts; `git diff 20ecbb1..HEAD` del archivo **vacío**; sin `*.test.ts` en el directorio |
| **[ALTO] el cron `purgar` BORRA filas a 0%** | **REINCIDENTE** | 0.0% / 33 stmts; `git diff` vacío; sin `*.test.ts` |
| **[ALTO] `agente.ts:325` — el `ok` se clava en `true` y 303 pruebas siguen verdes** | **REINCIDENTE** | 28.8% / 146 stmts, byte-idéntico; `agente.test.ts` sigue en 2 pruebas |
| **[ALTO] el rollback del candado de Stripe sin aseverar** | **REINCIDENTE, byte-idéntico** | `route.test.ts:95-96` sigue con `expect(r.status).toBe(500);` y el comentario *«desmarcar se verifica indirectamente»* como único respaldo. `route.ts` al 62.1% |
| **[MEDIO] `actividad.test.ts` intermitente por reloj y zona** | ✅ **CERRADO POR ARREGLO** | 4 zonas verdes, arriba |
| **[MEDIO] las 5 pantallas del Resumen a 0%** | **PARCIAL, sin cambio desde el pase 3** | Siguen a 0%: `panel-periodo` (84), `gasto-semanal-chart` (63), `motor-fiscal-periodo` (43), `top-rutas` (41). `resumen-visual` subió 40.9→48.5. **Superficie nueva a 0%:** `inicio-operacion.tsx` (106 stmts), que es la pantalla entera del encargado |
| **[MEDIO] `comercial.ts` 0%** | **REINCIDENTE** | 0.0% / 200, sin `comercial.test.ts`. Atenuante vivo: `cliente`/`factura_emitida`/`pago_recibido` siguen vacías |
| **[MEDIO] el ancla del PGRST201 se fue con `mis-viajes`** | **REINCIDENTE** | `grep -rln "PGRST201\|liquidacion_viaje_id_fkey" src/` sigue vacío. Sin violación viva, sin despertador |
| **[MEDIO] `verificaciones.sql` sin corredor** | **REINCIDENTE** | `git diff 94c0733..HEAD -- .github/workflows/ci.yml` **vacío**: sus 6 pasos intactos y ninguno ejecuta SQL. El archivo creció +29 líneas en esta rama (bloque 63) y nadie lo corre |
| **[BAJO] `fiscal_series.test.ts` afirma por índice de llamada** | **REINCIDENTE** | Sin cambios |
| **[BAJO] la prueba saltada / los warnings** | **SIN CAMBIO, sigue correcto** | 1 saltada de 3,106 (falta `TICKET_PATH`), 3 bajo `--coverage` (las 2 de tiempo, recuperadas por el paso extra del CI) |

### C6 — CUARTO pase. No re-corrí el mutante, y digo por qué

`src/app/api/cron/facturar/cola/route.ts:40` y `:66` — 0.0%, 47 statements.

```
$ ls -la src/app/api/cron/facturar/cola/
-rw-r--r-- 1 root root 3820 Aug 11 11:02 route.ts     ← un solo archivo, cero *.test.ts
$ git diff --stat 94c0733..HEAD -- src/app/api/cron/facturar/cola
(vacío)
```

**Byte-idéntico desde antes de que empezara la auditoría 17.** Ya corrí el
mutante doble (firma a `false &&` + quitar `.is('cfdi_uuid', null)`) en el pase 2
y en el pase 3, con la suite entera verde las dos veces. Correrlo una tercera vez
sobre un archivo que no cambió no produce señal nueva; gasté esa corrida en
`opcionesDe`, que sí es código nuevo. El escenario, la consecuencia (un CFDI no
se deshace; el duplicado le queda al cliente en su contabilidad) y la causa raíz
siguen tal cual en el pase 3, sección *«C6 primero»*.

Lo que sí es nuevo y vale registrar: **este pase el equipo tocó `fiscal.ts`,
`analytics.ts`, `visibilidad.ts` y 35 páginas, y no tocó este archivo.** Cuatro
pases es el patrón, no el accidente.

---

## Hallazgos

### [ALTO] La derivación fiscal que decide si una flota califica al 15% entró a la capa de dinero con el borrado, sin una sola prueba: la clavé en `true` y las 3,105 siguen verdes

`src/lib/likida/fiscal.ts:212-224` (`opcionesDe`), la línea del bug en `:220-222`

El commit `003c88a` la rescató de `dashboard/contador/comun.tsx` con esta razón,
textual en el encabezado (`:206-211`): *«ese panel se borró (rediseño desde cero),
pero `dashboard/page.tsx` (Resumen) también la necesita para su Motor fiscal —
vivía en un archivo de página en vez de en la capa de datos, así que borrar el
panel se la hubiera llevado entre pies.»* La decisión es correcta. Lo que no vino
con ella es el arnés — y la función lleva un ALTO histórico escrito encima:

```ts
    // AUDITORÍA 14, ALTO: el panel ofrecía el 15% a flotas no elegibles. La
    // declaración de la flota (al registrarse) llega hasta aquí.
    elegible15: (f15 && f15.dedicacionExclusivaCarga !== undefined && f15.regimenElegible !== undefined)
      ? (f15.dedicacionExclusivaCarga === true && f15.regimenElegible === true)
      : undefined,
```

**Mutante exacto** (le devuelvo el bug de la auditoría 14, entero):

```ts
-    elegible15: (f15 && f15.dedicacionExclusivaCarga !== undefined && f15.regimenElegible !== undefined)
-      ? (f15.dedicacionExclusivaCarga === true && f15.regimenElegible === true)
-      : undefined,
+    elegible15: true,
```

**Salida real, suite completa:**

```
 Test Files  258 passed (258)
      Tests  3105 passed | 1 skipped (3106)

npx tsc --noEmit -p .  → 0 errores
```

**Refutación que intenté y falló.** ¿Lo cubre otro archivo?
`grep -rln "opcionesDe" --include=*.test.ts --include=*.test.tsx src/` devuelve
**dos falsos positivos** y nada más: `razonamiento_ocr.test.ts` (que mira
`opcionesDeRazonamiento`, del cliente de OpenRouter) y `capufe.test.ts` (que tiene
un método privado homónimo en su doble de navegador). Cero pruebas reales.
`regimen_facilidad_15.test.ts` (+95 en esta rama) sí ancla la **escritura** —que
`crearFlota` guarde `regimenElegible` correcto según el régimen 624/612— pero no
la **lectura**: nadie comprueba que `opcionesDe` la propague. Y `fiscal.test.ts:31`
pasa `elegible15: true` como **fixture**, o sea que `resumirPerdidas` está probada
*río abajo* de la derivación que nadie prueba.

**Escenario con valores.** `elegible15` decide una sola rama, `fiscal.ts:359`:

```ts
if (o.elegible15 === false) push('efectivo_no_elegible');   // deducción PERDIDA
else                        push('combustible_efectivo');   // en riesgo / por confirmar
```

Con el mutante puesto, una flota que al darse de alta declaró **que NO** tiene
dedicación exclusiva a la carga federal —o que tributa en un régimen que la RFA
2026 regla 2.9 no nombra— ve su diésel pagado en efectivo contado como
**recuperable**. Eso sube dos cifras que el contralor lee en el Resumen: *«Ahorro
generado»* (`page.tsx:265`, `resumenPerdidas.montoRecuperable`) y el bloque
*«Recuperable pidiendo factura»* del Motor fiscal. Y en el sentido contrario, un
`elegible15: false` clavado le borra a un coordinado de verdad una deducción a la
que sí tiene derecho.

**Consecuencia:** es el modo de falla que CLAUDE.md llama por su nombre — el
contralor cruza esa cifra contra su contador. Ofrecerle una deducción del 15% que
su régimen no admite no es un número feo en pantalla: es una postura fiscal que
alguien puede tomar. Es exactamente el ALTO que la auditoría 14 cerró, hoy sin
nada que impida que vuelva.

**Causa raíz probable:** el borrado movió la función de un archivo de página (que
nunca tuvo prueba, porque era una página) a la capa de datos (donde el estándar
del repo sí es tener prueba), y nadie aplicó el estándar del destino.

---

### [ALTO] El trinquete de cobertura subió 2.46 puntos mientras la cobertura real bajaba 160 statements: el borrado le regaló 873 statements de holgura al único umbral automático del repo

`vitest.config.ts` (umbrales 67/84/79) · `.github/workflows/ci.yml` (paso *Tests
(con umbral de cobertura)*, `npm run test:coverage`)

**Escenario — no hace falta romper nada, basta leer las dos corridas.** La del
pase 3 (10-ago) y la de hoy, ambas con `npx vitest run --coverage`, ambas pegadas
arriba:

```
pase 3:  Statements 68.80% (12909/18763)   Functions 81.28%
pase 4:  Statements 71.26% (12749/17890)   Functions 83.05% (701/844)
```

**Cubiertos: −160. Totales: −873. Porcentaje: +2.46 puntos.** Los tres umbrales
pasan con más aire que ayer y ninguna prueba nueva lo explica: la suite tiene
**82 pruebas menos**. Lo que subió el número fue sacar del denominador 35 páginas,
la mayoría de las cuales estaban a 0%.

**Consecuencia para alguien real.** El umbral de `vitest.config.ts` es el único
mecanismo del repo que convierte "cobertura" en una **puerta** en vez de en un
número que nadie mira — el propio `ci.yml` lo dice así en el paso *Tests (con
umbral de cobertura)*. Esa puerta acaba de aflojarse sin que nadie la aflojara: a
partir de hoy caben **873 statements de código nuevo sin una sola prueba** antes
de que el CI vuelva a ponerse rojo. Con el panel del cliente por reescribirse
entero, 873 statements es más o menos *el panel entero otra vez*. Y el primero ya
entró: los 11 statements de `opcionesDe`, en el mismo commit del borrado.

**Refutación que intenté:** ¿alguien está subiendo el trinquete a mano cuando
conviene? Miré `vitest.config.ts`: 67/84/79 llevan sin moverse desde antes de la
ronda 17, y el margen de RAMAS —el más apretado— apenas pasó de 0.57 a 0.66 pt.
No hay evidencia de que nadie ajuste el número al resultado. El problema no es
mala fe: es que un umbral de **porcentaje** no distingue "probé más" de "borré lo
no probado", y este pase hizo lo segundo.

**Causa raíz probable:** la puerta mide un cociente y no un piso de statements
cubiertos, así que una poda grande la premia. Por dónde va el arreglo: el
trinquete tendría que mirar también el numerador.

---

### [MEDIO] El despertador de "una pantalla de operación no enseña pesos sin gatearlos" bajó a UNA sola aserción, y esa se apaga sola y en silencio al mover el dinero a un archivo hermano

`src/app/dashboard/dinero_por_area.test.ts:70` (la superficie del `/dashboard`),
`:82` (el guardarraíl, bajado de `>5` a `>1`) y `:85-95` (el bucle)

Hoy el barrido encuentra **3 rutas de operación** (`arco`, `soporte` y la raíz) y
solo la raíz enseña dinero, así que el archivo entero produce **2 pruebas**: el
guardarraíl y **una** aserción real.

```
$ npx vitest run src/app/dashboard/dinero_por_area.test.ts
 ✓ src/app/dashboard/dinero_por_area.test.ts (2 tests)
```

**Escenario (mutante corrido hoy).** El archivo declara, en su propio encabezado
(`:34-40`), que el 4-ago-2026 tapó exactamente este hueco: miraba solo `page.tsx`,
y como media docena de pantallas parten su render en un `vista.tsx` hermano,
*«mover una columna de pesos de un archivo al otro apagaba el despertador sin
cambiar una sola cifra en pantalla»*. La superficie del `/dashboard` de hoy es
`page.tsx` **+ `inicio-operacion.tsx`** (`:70`) — pero el Resumen ya reparte su
dinero en **cinco hermanos más** que el barrido nunca abre: `panel-periodo.tsx:105`
(`mxn(totalLiquidado)`), `motor-fiscal-periodo.tsx:61,68`, `top-rutas.tsx:45`,
`gasto-semanal-chart.tsx:47,76` y `rail.tsx:147`. Simulé ese movimiento
—expresé el formateador de los tres KPI a través de una constante, como quedaría
si el marcado se fuera a `panel-periodo.tsx`— y de paso desarmé la puerta:

```tsx
+const FMT = 'mxn' as const;
-  ... formato="mxn" ...            (×3)
+  ... formato={FMT} ...
-  if (!puedeVerArea(rol, 'dinero')) {
+  void puedeVerArea; void InicioOperacion;
+  if (false) {
       return <InicioOperacion … />;
     }
```

```
 Test Files  258 passed (258)
      Tests  3104 passed | 1 skipped (3105)
 npx tsc --noEmit -p .  → 0 errores
```

Cero fallos — y fíjese en el número: **3104, no 3105**. La única aserción real del
archivo no falló: **desapareció**, porque las pruebas se generan en un bucle sobre
lo que el barrido encuentra. El guardarraíl de `:82` sigue verde porque cuenta
**rutas** (3 > 1), no aserciones. Con `grep -c 'puedeVerArea(' page.tsx` en **0**,
el Resumen del dueño —con su gasto total, su costo por viaje y su ahorro— se le
pinta completo al encargado, y las tres puertas del CI lo dejan pasar.

**Consecuencia:** el jefe de tráfico ve las finanzas de la flota. Es el escenario
que este archivo existe para evitar, y que ya se dio cuatro veces según su propio
encabezado.

**Por qué lo pongo MEDIO y no ALTO:** el archivo declara honestamente que es *«un
despertador, no una demostración»*, y la puerta real vive en `visibilidad.ts`, que
sí está al 100% y sí mata a su mutante. Lo que reporto es que el despertador
quedó con una sola pila y **no avisa cuando se le acaba**: una prueba que se
autoelimina en silencio es peor que no tenerla, porque el conteo de la suite baja
1 y nadie lo mira.

**Causa raíz probable:** la premisa "página + su `vista.tsx` hermano" (`:50-53`)
la rompió el propio rediseño: `/dashboard` ya no tiene un hermano, tiene nueve.

---

### [MEDIO] `getLiquidaciones` se rescató del borrado "para no perderla", con cero llamadores y cero pruebas — y es la que carga el `throw` del CRÍTICO de la auditoría 5

`src/lib/likida/analytics.ts:1550-1568`, la línea en cuestión `:1560`

`a47d1d7` la sacó de `dashboard/cuadre/page.tsx`, donde vivía como función local
no exportada, *«para que borrar la página no la pierda… es la única de las 17
páginas del inventario cuya lógica no vivía ya en `lib/likida`»*. Hoy:

```
$ grep -rn "getLiquidaciones(" src/ | grep -v PorDia
src/lib/likida/analytics.ts:1550:export async function getLiquidaciones(…)
```

**Un solo resultado: su propia definición.** Cero llamadores, cero pruebas — las
12 coincidencias de `getLiquidaciones` en archivos `*.test.ts` son todas
`getLiquidacionesPorDia`, que es otra función y esa sí está anclada
(`analytics_por_dia.test.ts`).

**Mutante exacto** (le quito las dos garantías a la vez):

```ts
-    .eq('tenant_id', tenantId)
     .order('created_at', { ascending: false })
-  if (error) throw new Error(`getLiquidaciones: ${error.message}`);
+  void error;
```

```
 Test Files  258 passed (258)
      Tests  3105 passed | 1 skipped (3106)
 npx tsc --noEmit -p .  → 0 errores
```

**Consecuencia.** Hoy no rompe nada porque nadie la llama; el daño es futuro y
está agendado. El comentario que quité es literalmente el ancla en prosa del
CRÍTICO de frontend de la auditoría 5: *«sin este throw, una lectura caída
devolvía `[]` y la tabla salía con encabezados y cero filas bajo unos KPIs que
decían "12 viajes liquidados"»* — la regla *«fallar cerrado y decirlo»* de
CLAUDE.md, en la consulta que llena la tabla de liquidaciones. Esa función se
guardó **precisamente** para que el panel nuevo la reconecte, y va a llegar al
panel nuevo con su `.eq('tenant_id')` y su `throw` sin un solo `expect` detrás.
Un rescate sin arnés es una regresión con fecha diferida.

**Causa raíz probable:** el commit trató el problema como "no perder el código" y
no como "no perder la garantía". La misma forma que `opcionesDe`, en el mismo
borrado, en el otro archivo.

---

### [MEDIO] La regresión de layout que `contador/page.test.tsx` anclaba tiene una instancia VIVA en una de las páginas que sobrevivieron, y ya no queda nada que la cace

`src/app/dashboard/combustible-casetas/page.tsx:200` · la prueba borrada era
`src/app/dashboard/contador/page.test.tsx:35-38`

La prueba borrada anclaba un BAJO de frontend de la auditoría 10: dos `ChartCard`
en un `grid grid-cols-1 lg:grid-cols-2` sin `items-start` se estiran a la altura
de la más alta —`align-items: stretch` es el default de CSS grid— y la de
contenido corto queda con cientos de píxeles de blanco bajo su mensaje. Su único
`expect` era literal:

```ts
expect(html).toContain('grid grid-cols-1 lg:grid-cols-2 items-start gap-3');
```

Barrí las páginas que quedan buscando la misma forma:

```
$ grep -rn "lg:grid-cols-2\|items-start" src/app/dashboard/*.tsx src/app/dashboard/*/page.tsx
src/app/dashboard/combustible-casetas/page.tsx:200:  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
```

Es el único `lg:grid-cols-2` del panel y **no lleva `items-start`**. Adentro
(`:201-207`) hay dos `ChartCard tamano="M"` hermanas: *«Gasto por concepto»* con
`HBars` (una barra por concepto — pueden ser dos) y *«Reparto del gasto»* con
`Dona` (altura fija). Es el patrón exacto de la regresión.

**Escenario:** una flota con dos conceptos de gasto registrados —la condición del
`porConcepto.length > 1` que abre ese `div`— entra a Combustible y casetas y ve la
tarjeta izquierda estirada a la altura de la dona, con el hueco blanco debajo.
Es la clase de pantalla que se lee como rota justo en el demo.

**Consecuencia:** BAJO de producto (nadie pierde dinero), pero relevante para mi
rubro por otra razón: es el **único caso del pase** en que borrar una prueba junto
con su página dejó una regla sin ancla teniendo la regla una instancia viva. Las
otras cuatro pruebas borradas no dejaron nada. Lo pongo MEDIO porque lo que falta
no es un pixel: es que **ninguna** de las 3,105 pruebas mira hoy esta clase de
defecto, y el repo acaba de demostrar (`kpi-periodo.test.tsx`,
`tablero-operacion.test.tsx`) que sabe probarla con `renderToStaticMarkup` sin
dependencias nuevas.

**Causa raíz probable:** el ancla se escribió pegada a **una** página
(`toContain` de su string de clases) en vez de como barrido de la clase de
defecto — así que se murió con su página aunque el defecto no sea de esa página.

---

### [BAJO] Tres aserciones de permisos quedaron tautológicas: la ruta que usan de ejemplo ya no está clasificada, así que hoy dan `false` para cualquier rol

`src/lib/auth/visibilidad.test.ts:29` · `src/lib/auth/visibilidad.test.ts:133` ·
`src/lib/auth/session.test.ts:67`

`puedeVerRuta` niega por default cuando `areaDeRuta` devuelve `undefined`. Tras el
borrado, `AREA_POR_RUTA` solo tiene **ocho** entradas:

```
'/dashboard'  '/dashboard/arco'  '/dashboard/soporte'  '/dashboard/combustible-casetas'
'/dashboard/suscripcion'  '/dashboard/usuarios'  '/dashboard/politicas'  '/dashboard/configuracion'
```

Las tres aserciones usan rutas que ya **no** están en esa lista:

```ts
// visibilidad.test.ts:29 — dentro de «un rol desconocido no ve nada — fail closed»
expect(puedeVerRuta('gerente_regional', '/dashboard/despacho')).toBe(false);

// visibilidad.test.ts:133 — dentro de «un superadmin puede mirarse el panel como encargado»
expect(puedeVerRuta(rolEfectivo('superadmin', 'encargado'), '/dashboard/cobranza')).toBe(false);

// session.test.ts:67 — dentro de «ese no-rol NO abre nada: las cuatro matrices lo niegan»
expect(puedeVerRuta(SIN_ROL, '/dashboard/cuadre')).toBe(false);
```

Las tres pasarían igual con `'flota_admin'` o `'superadmin'` en el primer
argumento: ya no discriminan por rol, discriminan por "esa ruta no existe". La de
`:133` es la que más pierde, porque era la que demostraba que *«Ver como» quita
visibilidad de dinero* — y hoy no lo demuestra.

**Por qué es BAJO y no más:** en los tres casos es la segunda aserción de un `it`
cuya **primera** sí discrimina (`areasDe(SIN_ROL) === []`,
`rolEfectivo('superadmin','encargado') === 'encargado'`), y la garantía de fondo
sigue anclada en otro sitio: `/dashboard/suscripcion` y
`/dashboard/combustible-casetas` sí son rutas de `dinero` vivas y sí se afirman
por rol (`visibilidad.test.ts:114-121`). No hay hueco de seguridad; hay tres
líneas que se leen como prueba y ya no lo son. Lo reporto porque es la forma en
que las suites envejecen sin que nadie lo note: la aserción no falla, solo deja
de significar.

**Causa raíz probable:** las tres nombran una pantalla concreta en vez de derivar
el ejemplo del mapa (`Object.entries(AREA_POR_RUTA).find(([, a]) => a === 'dinero')`).

---

## Lo que revisé y está bien

- **El borrado no se llevó ni una prueba de dinero.** Es la pregunta que traía y
  la respuesta es limpia: **78 de las 89** son filas de `it.each` sobre listas de
  rutas en dos archivos de permisos (medido: 90→35 y 45→22, corriendo los
  archivos viejos), **5** son las dos pruebas de UI del panel del contador (dos
  BAJOs de la auditoría 10), y el resto son listas menores. Cero pruebas de
  motor, de `repo.ts`, de `fiscal.ts` o de `analytics.ts` se borraron.
- **`visibilidad.test.ts` no bendice su cambio.** El control murió con
  **6 fallos en 2 archivos**, incluida la propiedad anti-bucle. Un test editado
  en el mismo commit que su código, y aun así con dientes.
- **`etiquetas_sincronizadas.test.ts` sigue siendo el ancla estructural que era.**
  Su barrido de CONCEPTO no se tocó y caza `otro: 'Gasto'` en la primera corrida.
  El único cambio es sacar de una lista un archivo que ya no existe.
- **La prueba intermitente quedó ARREGLADA**, con la causa raíz correcta y
  verificada en 4 zonas horarias. Es mi primer hallazgo cerrado por arreglo en
  cuatro pases.
- **El CI no se tocó** (`git diff 94c0733..HEAD -- .github/workflows/ci.yml`
  vacío): 6 puertas, `branches: ['**']` + `pull_request`, `concurrency` con
  `cancel-in-progress`, y el paso extra `npx vitest run fundamento duplicados`
  que recupera las dos pruebas de tiempo que `--coverage` salta. Lo confirmé
  contra la corrida: 3,105 verdes / 1 saltada sin cobertura, 3,103 / 3 con ella.
- **`tenant-efectivo.test.ts` cambió 6 destinos y no perdió ninguna garantía.**
  El rebote con sufijo, la no-escalada por `?rol=` y el cierre al chofer siguen
  afirmándose sobre rutas vivas.
- **El motor de cuadre sigue al 100%** (`engine.ts`, 461 stmts) y `visibilidad.ts`
  entró al **100%** (43 stmts). Las dos capas que deciden dinero y permisos son
  las mejor cubiertas del repo, y eso es lo correcto.
- **La escritura del dinero sigue con arnés.** No repetí el mutante de
  `saveLiquidacion` del pase 3 (`repo.ts:608-614`, murió con el intercambio
  comprobado↔anticipo): `repo.ts` es byte-idéntico y `repo_escritura.test.ts`
  también.
- **Ninguna prueba toca la red ni depende del reloj.** Con `actividad.test.ts`
  arreglada, la suite corrió 5 veces completa hoy en un entorno sin salida a
  internet, en cuatro zonas horarias, sin un solo fallo no atribuible a un
  mutante mío.
- **`pruebas-manuales/` no quedó desalineada por el borrado.** Barrí los 16
  arneses buscando referencias a las 35 páginas muertas: **cero**. (No se corren,
  por instrucción.)

---

## Lo que NO alcancé a revisar

- **`engine.test.ts` (86 KB, ~600 casos).** Cuarto pase sin barrerlo buscando
  aserciones flojas. El 100% de `engine.ts` dice que se ejecuta entero, no que se
  afirme sobre el valor. Sigue siendo la mitad que le falta al rubro, y ahora que
  el panel se va a reconstruir sobre ese motor, es la que más urge.
- **`inicio-operacion.tsx` (0.0%, 106 stmts).** Superficie **nueva** en mi radar:
  es la pantalla entera del encargado y no la miré más allá de constatar que está
  a cero y que no imprime pesos (`grep` de `mxn(`/`formato="mxn"` → vacío).
- **`al_vuelo.test.ts` (46 KB)** y **`fiscal.test.ts`**: no audité caso por caso
  si sus aserciones son sobre valor o sobre "se llamó".
- **`repo.ts` al 56.7% de 557.** Siguen ~26 funciones exportadas sin revisar
  (`getAcumuladoCombustible`, `reclamarEnvioAviso`, `resolverSolicitudArco`).
- **`src/lib/saas/stripe.ts` al 22.3%** y **`processor.ts`**: sin cambios desde el
  pase 3 y sin auditar.
- **Cobertura de RAMAS por archivo.** Cuarto pase sin saber qué archivo sostiene
  el 84.66% global, que sigue siendo el umbral con menos margen (0.66 pt).
- **El 24.6% sin ejecutar de `fiscal.ts`.** Sé que `opcionesDe` está adentro
  (el mutante sobrevive) pero no mapeé el resto. Repito el aviso del pase 3: el
  reporte de v8 lista índices de statement, **no** números de línea; derivar
  líneas de ahí da un mapeo falso.
- **`supabase/verificaciones.sql` (63 bloques).** Confirmé que nadie lo corre; no
  lo leí bloque por bloque buscando aserciones flojas.

---

## Árbol limpio

`git status --short` al terminar mis experimentos, **antes** de escribir este
archivo:

```
 M docs/auditoria-17/arquitectura.md
```

**Ese archivo no es mío** — es trabajo sin commitear de otro auditor del pase 4
corriendo en paralelo (durante mi corrida también vi y dejé en paz
`docs/auditoria-17/MAPA.md`, `frontend.md` y `seguridad.md`, que después se
commitearon en `ee8a822` y anteriores). No toqué ninguno. De `src/` y de todo lo
demás: **cero modificaciones**, verificado con `git diff --stat -- src/` → vacío.

Las **seis** mutaciones de este pase se revirtieron con `git checkout -- <archivo>`
inmediatamente después de cada corrida, una a la vez, con `git status` verificado
entre una y otra:

| # | Archivo | Mutante | ¿Murió? |
|---|---|---|---|
| 1 | `lib/likida/fiscal.ts:220` | `elegible15: true` (revierte el ALTO de la auditoría 14) | ❌ **SOBREVIVIÓ** — 3,105 verdes |
| 2 | `lib/likida/analytics.ts:1554,1560` | quitar `.eq('tenant_id')` **y** el `if (error) throw` de `getLiquidaciones` | ❌ **SOBREVIVIÓ** — 3,105 verdes |
| 3 | `app/dashboard/page.tsx:255-265,355` | mover el formateador a una constante + puerta a `if (false)` | ❌ **SOBREVIVIÓ** — 3,104 verdes (una prueba MENOS, cero fallos) |
| 4 | `lib/auth/visibilidad.ts:169` | `inicioDe` de vuelta a `/dashboard/contador` | ✅ **CAZADA** *(control)* — 6 fallos en 2 archivos |
| 5 | `app/dashboard/[id]/page.tsx:31` | `otro: 'Otro'` → `otro: 'Gasto'` | ✅ **CAZADA** *(control)* — 1 fallo, mensaje exacto |
| 6 | `lib/likida/recordatorio_comprobacion.ts:208` | borrar `.is('recordatorio_comprobacion_en', null)` | ❌ **SOBREVIVIÓ** *(reincidente)* — 64 verdes |

Además saqué temporalmente cuatro archivos de `20ecbb1` para **medir** el conteo
viejo de pruebas (`visibilidad.test.ts`, `visibilidad.ts`, `rutas.ts`,
`tenant-efectivo.test.ts`) y los devolví con `git checkout HEAD --`. No hice
ningún commit. El experimento de zonas horarias no tocó ningún archivo (solo la
variable `TZ` del proceso).

**4 de 6 sobrevivieron.** Los dos controles murieron en la primera corrida y con
el mensaje exacto, así que el método distingue. Lo que no distingue es la suite,
en la lógica de dinero que el borrado acaba de mudar de casa.
