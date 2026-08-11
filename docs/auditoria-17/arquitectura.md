# Arquitectura y mantenibilidad — auditoría 17 · pase 4 (11-ago-2026)

**Nota: 4/10** (antes 5). Razón del movimiento: **se ignoró y bajó**. De mis
cinco hallazgos abiertos del pase 2, **cuatro siguen vivos palabra por palabra**
y ninguno se cerró por supresión — los cinco viven en el **Resumen**, que es
justo la página que sobrevivió al borrado. Encima, el borrado de 6,000 líneas
dejó **29 funciones exportadas sin un solo llamador**, dos módulos completos sin
importador, dos rutas sin puerta de entrada, y —lo que baja la nota de verdad—
un panel de cliente en el que **7 de sus 9 páginas sobrevivientes no tienen
forma de llegar desde la interfaz**.

Compuerta corrida hoy sobre el árbol post-merge (`0f6ebce`):
`npx tsc --noEmit -p .` → 0 errores · `npx eslint src/` → 0 errores, 18 warnings
· `npx vitest run` → 258 archivos, 3,105 verdes, 1 saltada. Ninguna de las tres
ve nada de lo de abajo, y ese es el punto.

**El riesgo mayor del rubro hoy:** el mapa de navegación de `/dashboard` está
escrito **dos veces** —`NEGOCIO`/`GESTION` (declaradas) contra
`SIDEBAR_PRINCIPAL`/`FISCAL` (pintadas)— y la única prueba que las ata
(`visibilidad.test.ts:85-101`) itera la mitad que **no se pinta**. Con las dos
listas pintadas ya vacías, el sidebar del dueño renderiza **un solo link** y el
del contador **ninguno**, y la prueba llamada «el mapa de rutas no se queda
atrás del sidebar» sigue verde.

---

## El borrado de 6,000 líneas: qué quedó huérfano y qué quedó colgando

Comando base usado en todo este bloque (por símbolo `S`):

```
grep -rln "\bS\b" src/ --include=*.ts --include=*.tsx \
  | grep -v "<su propio archivo>" | grep -v "\.test\."
```

Un resultado vacío = ningún archivo de producción lo nombra. Lo corrí sobre
todos los `export` de `src/lib` y `src/app` con un script; lo que sigue es lo
que sobrevivió a la verificación a mano (descartando los que sí tienen llamador
*interno* dentro de su propio archivo, como `getSerieComparativa`,
`getGastoPorSemana`, `causasDe` o `PERIODO_POR_DEFECTO`).

### 1. Funciones exportadas sin un solo llamador — 29 símbolos, 759 líneas

| Archivo:línea | Símbolo | Su único consumidor, borrado en |
|---|---|---|
| `analytics.ts:220` | `getStatsPorOperador` (34 L) | `operadores/page.tsx` · `2be4b1c` |
| `analytics.ts:750` | `contarViajes` (23 L) | `viajes/page.tsx:50` · `2be4b1c` |
| `analytics.ts:788` | `getViajesSinLiquidar` (13 L) | `viajes/page.tsx:51` · `2be4b1c` |
| `analytics.ts:888` | `getGastoPorRuta` (26 L) | ya era huérfana (pase 2, BAJO) |
| `analytics.ts:1061` | `getOperadoresDetalle` (59 L) | `operadores/page.tsx:99` · `2be4b1c` |
| `analytics.ts:1550` | `getLiquidaciones` (20 L) | `cuadre/page.tsx:68` · `2be4b1c` |
| `fiscal.ts:168` | `periodoAnterior` (21 L) | `contador/page.tsx:82` · `003c88a` |
| `fiscal.ts:540` | `resumirFiscal` (47 L) | `contador/page.tsx:96` + `contador/combustible/page.tsx:74` · `003c88a` |
| `fiscal.ts:609` | `resumirCombustibleCasetas` (21 L) | `contador/combustible/page.tsx:73` · `003c88a` |
| `fiscal.ts:632` | `tope15DeGastos` (10 L) | `contador/combustible/page.tsx:75` · `003c88a` |
| `fiscal.ts:686` | `diagnosticoRetencion` (16 L) | `contador/retenciones/page.tsx:63` · `003c88a` |
| `fiscal.ts:882` | `contarGastosDelTenant` (10 L) | `contador/cfdi/page.tsx:106` + `deducciones:91` · `003c88a` |
| `fiscal.ts:921` | `getLiquidacionesFiscales` (40 L) | `contador/liquidaciones/page.tsx:74` · `003c88a` |
| `fiscal.ts:989` | `aFilasExport` (26 L) | `contador/cfdi/export/route.ts:100` · `003c88a` |
| `comercial.ts:47` | `getCartera` (54 L) | `clientes/page.tsx` · `2be4b1c` |
| `comercial.ts:121` | `getRentabilidad` (31 L) | `rentabilidad/page.tsx` · `2be4b1c` |
| `comercial.ts:176` | `getCobranza` (50 L) | `cobranza/page.tsx` · `2be4b1c` |
| `comercial.ts:242` | `getCotizaciones` (30 L) | `cotizador/page.tsx` · `2be4b1c` |
| `comercial.ts:326` | `getEstadoRastreo` (33 L) | `mapa/page.tsx` · `2be4b1c` |
| `operacion.ts:162` | `getUnidades` (62 L) | `despacho`, `incidencias`, `unidades` · `2be4b1c` |
| `operacion.ts:321` | `getPods` (44 L) | `pod/page.tsx` · `2be4b1c` |
| `operacion.ts:382` | `marcarPodPedido` (20 L) | `pod/page.tsx` · `2be4b1c` |
| `operacion.ts:408` | `rechazarPod` (6 L) | `pod/page.tsx` · `2be4b1c` |
| `operacion.ts:686` | `asignarUnidad` (10 L) | `despacho/page.tsx` · `2be4b1c` |
| `operacion.ts:697` | `cambiarEstadoUnidad` (6 L) | `unidades/page.tsx` · `2be4b1c` |
| `operacion.ts:712` | `crearUnidad` (14 L) | `unidades/page.tsx` · `2be4b1c` |
| `operacion.ts:736` | `crearIncidencia` (25 L) | `incidencias/page.tsx` · `2be4b1c` |
| `operacion.ts:771` | `cambiarEstadoIncidencia` (8 L) | `incidencias/page.tsx` · `2be4b1c` |
| `admin/ui/kit.tsx:203` | `EstadoCargando` | ya era huérfana antes de `20ecbb1` |

Verificación de que el consumidor existía y se fue, para una de ellas:

```
$ git grep -n "\bgetOperadoresDetalle\b" 20ecbb1 -- src/app
20ecbb1:src/app/dashboard/operadores/page.tsx:99: const ops = await safe(...)
$ grep -rn "getOperadoresDetalle" src/app/            # HEAD
(vacío)
```

**Las 8 de `operacion.ts` de la mitad de abajo (`marcarPodPedido`,
`rechazarPod`, `asignarUnidad`, `cambiarEstadoUnidad`, `crearUnidad`,
`crearIncidencia`, `cambiarEstadoIncidencia`, y `crearViaje` salvo por
`crear_viaje_wa.ts`) eran TODAS las escrituras a base del panel.** Después del
borrado, `/dashboard` es de solo lectura: no queda una sola pantalla desde la
que un humano escriba en `viaje`, `unidad`, `incidencia` o `pod`. Eso es un
hecho de arquitectura que nadie declaró en ningún lado.

### 2. Módulos enteros sin importador

* `src/app/dashboard/confirmacion.ts` (204 líneas, 7 exports). Único
  importador: `viajes/vista.tsx:5`, borrado. Su prueba
  `confirmacion.test.ts` (220 líneas) sigue corriendo verde contra código que
  nadie llama.
  `git grep -n "confirmacion'" 20ecbb1 -- src/app` → `viajes/vista.tsx:5`;
  `grep -rn "confirmacion'" src/app/` → vacío.
* `src/app/dashboard/cifra-grande.tsx` (75 líneas) + `cifra-grande.test.tsx`
  (37). Único importador: `contador/deducciones/page.tsx:13`, borrado.
* `src/lib/likida/crear_viaje_wa.ts` (823 líneas) — huérfano **desde el pase 1**
  (MEDIO #5), y ahora además es el único llamador vivo de `operacion.ts:531`
  (`crearViaje`, 63 líneas), o sea una cadena muerta de ~890 líneas.

### 3. Rutas que existen y a las que no lleva nada

* **`/api/export/liquidaciones/route.ts` (90 líneas)** — el CSV de
  liquidaciones. Sus dos únicos enlaces eran `analitica/page.tsx:110` y
  `cuadre/page.tsx:159`, los dos borrados. Sigue registrada, autenticada y
  funcional; ningún archivo de `src/` la nombra.
  `git grep -n "api/export/liquidaciones" 20ecbb1 -- src/app | grep -v "^20ecbb1:src/app/api"`
  → las dos páginas borradas.
* **`/dashboard/[id]/page.tsx` (409 líneas)** — el DETALLE de la liquidación:
  el renglón por renglón que el contralor lee, el botón de PDF
  (`[id]/page.tsx:184`), la asignación de operador. Su **único** link entrante
  era `cuadre/page.tsx:196` (`<Link href={\`/dashboard/${l.id}${sufijo}\`}>`).
  Hoy: `grep -rn "href={\`/dashboard/" src/ --include=*.tsx | grep -v '\.test\.'`
  → **cero resultados**. La pantalla más importante del producto solo se
  alcanza pegando un UUID en la barra de direcciones.

### 4. Listas de navegación sin consumidor

`src/app/dashboard/rutas.ts` declara siete listas. `sidebar-nav.tsx:6` importa
**dos**. Las otras cinco (`INICIO:32`, `NEGOCIO:34`, `OPERACION:38`,
`DOCUMENTOS_DINERO:42`, `GESTION:44`, `TODAS_LAS_RUTAS:55`) no las lee ningún
componente de producción:

```
$ grep -rn "\bGESTION\b" src/ --include=*.ts --include=*.tsx | grep -v rutas.ts
src/lib/auth/visibilidad.test.ts:3, :89, :198     ← solo la prueba
```

Ver el CRÍTICO de abajo: eso ya no es cosmético, es la puerta del panel.

### 5. Código muerto dejado en el render

`src/app/dashboard/page.tsx:158` — `const alertas: Array<{texto,href}> = []` y
nunca se le hace `push` (el commit `2be4b1c` quitó los dos `push`). El bloque
`page.tsx:188-200` (13 líneas de JSX con `<Link>`, punto de color y «Ver →»)
está guardado por `alertas.length > 0`, una condición demostrablemente falsa.
`detectarAnomalias(tenantId)` (`page.tsx:97`) se sigue consultando en cada
carga y su resultado ya solo sirve como comprobación de `null` en
`estadoPanel` (`estado.ts:30`): la detección de comprobante repetido entre
viajes —la señal antifraude del producto— se calcula y se tira.

### 6. Lo que NO quedó colgando (lo verifiqué y está limpio)

* **Cero imports rotos, cero rutas muertas en TSX.** Barrí todos los `href=`,
  `redirect(`, `revalidatePath(` de `src/` y no hay uno solo apuntando a las 35
  páginas borradas.
* `AREA_POR_RUTA` (`visibilidad.ts:75-92`) quedó consistente con el árbol de
  archivos: las 8 entradas que declara corresponden 1:1 con páginas que
  existen, y `puedeVerRuta` niega por default.
* `inicioDe('contador')` ya no cicla: `visibilidad.ts:169` manda a
  `/dashboard/suscripcion`, que sí tiene área `dinero` (probado en
  `visibilidad.test.ts:72-75`).
* Los tres links de preview del superadmin (`admin/page.tsx:254,258`,
  `admin/flotas/page.tsx:163,167`, `admin/selector-vista.tsx:43,54,61`) se
  actualizaron; ninguno apunta a `/dashboard/despacho` ni a
  `/dashboard/contador`.
* Ninguna migración quedó referenciada desde código borrado; `supabase/` no
  tiene un solo diff en los 9 commits.

---

## ¿La mudanza de `getLiquidaciones` fue fiel? Sí, byte por byte

`git show a47d1d7 -- src/lib/likida/analytics.ts` contra
`git show 20ecbb1:src/app/dashboard/cuadre/page.tsx` (líneas 19-40): el
`interface LiqRow`, el `select`, el `.eq('tenant_id')`, el `.order`, el
`.limit(50)`, el `throw` por `error` y las seis líneas del `map` son idénticos
carácter por carácter, comentario incluido. **No se duplicó ninguna verdad de
dinero**: no quedó una segunda copia en `cuadre/page.tsx` (el commit la borra en
el mismo diff), y el único otro lector de `liquidacion` con esa forma
(`fiscal.ts:928`, `getLiquidacionesFiscales`) también está huérfano, así que ni
siquiera hay dos consumidores que puedan divergir. Es el trozo mejor hecho de
los 9 commits.

La ironía es completa, y es el hallazgo: la función se mudó de casa **una hora
antes** (`a47d1d7`, 15:52) de que le demolieran la casa (`2be4b1c`, 16:24), con
el motivo explícito escrito en `analytics.ts:1541-1546` («para que borrar la
página no la pierda»). Se salvó del borrado y quedó, hoy, **sin un solo llamador
y sin una sola prueba**:

```
$ grep -rn "getLiquidaciones\b" src/ | grep -v analytics.ts
(vacío)
```

Nada la ejecuta jamás. Si mañana alguien cambia el `.limit(50)` o el nombre de
una columna, tsc, eslint y las 3,105 pruebas siguen verdes.

---

## Hallazgos abiertos de pases anteriores: qué pasó con cada uno

| # (pase 2) | Hallazgo | Estado en HEAD |
|---|---|---|
| 1 | ALTO · selector único con tres ventanas | **ABIERTO, sin un carácter de cambio.** `analytics.ts:175-177` (7/30/3650 días), `analytics.ts:421` (`SEMANAS_POR_MODO` = 5/13/52 semanas ISO), `fiscal.ts:865-867` (7 días / 30 días / `resolverPeriodo('todo')` **sin cota**), `actividad.tsx:53` (`bucketsPorDia(viajes, 7|30)`). Los cuatro vivos, y ahora "histórico" son **tres cosas distintas**: 3,650 días, 52 semanas y sin cota. Ver hallazgo reincidente abajo. |
| 2 | ALTO · `dashboard/page.tsx` calcula `hoy` en UTC | **ABIERTO.** `page.tsx:84` sigue siendo `new Date(ahoraMs()).toISOString().slice(0,10)`; los 8 defaults de `analytics.ts` (`92, 172, 299, 381, 434, 457, 491, 1025`) siguen declarando `toLocaleDateString('en-CA', {timeZone: TZ_MX})` y `fiscal.ts:744, 852` siguen declarando el contrario (UTC). |
| 3 | ALTO · `costoPorViaje` `number\|null` aplanado a `0` | **CERRADO CON ARREGLO** (no por supresión). `e47b124`: `resumen-visual.tsx:108` es ahora `valor: number \| null` y pinta `'—'`; `kpi-periodo.tsx:71` pasa `valorActual ?? null` con el comentario que cita esta auditoría. Único cerrado de los cinco. |
| 4 | MEDIO · dona "Viajes" vs "Actividad" por dos caminos | **ABIERTO.** `panel-periodo.tsx:72-77` (dona, de `seriesKpis`, vía `traerTodo`) contra `panel-periodo.tsx:85` → `actividad.tsx:53` (barras, del arreglo `viajes` de `page.tsx:99`), con `analytics.ts:802` todavía `getViajes(tenantId, limite = 100)`. |
| 5 | BAJO · `getGastoPorRuta` huérfana | **ABIERTO Y AGRAVADO.** Sigue en `analytics.ts:888` sin llamador y sin prueba, y ahora tiene 28 compañeras (tabla de arriba). |

**Cerrados por supresión: cero.** Se borraron 35 páginas y ninguno de mis cinco
hallazgos desapareció, porque los cinco viven en el **Resumen** y en
`analytics.ts` — lo único que el borrado no tocó. Los ocho del pase 1 siguen en
el mismo estado que reporté entonces salvo el #6 (`KpiTile`), cerrado por el
mismo arreglo que el #3.

---

## Hallazgos

### [CRÍTICO] El mapa de navegación está escrito dos veces, la prueba que lo vigila mira la mitad que no se pinta, y hoy 7 de las 9 páginas sobrevivientes no tienen puerta

`src/app/dashboard/rutas.ts:34-51` y `:67` contra
`src/app/dashboard/sidebar-nav.tsx:6, 111, 120, 132`, con
`src/lib/auth/visibilidad.test.ts:85-101` como guardarraíl.

`sidebar-nav.tsx` —el **único** componente de navegación del panel, montado
desde `chrome.tsx:66`, y `layout.tsx` no monta ningún otro— renderiza
exactamente tres cosas:

* `:111` un link a `/dashboard` si `puedeVerRuta(rol, '/dashboard')`;
* `:120` `visibles(SIDEBAR_PRINCIPAL)` — **`SIDEBAR_PRINCIPAL` es `[]`**
  (`rutas.ts:67`);
* `:132` `<Seccion titulo="Fiscal" items={visibles(FISCAL)}>` — **`FISCAL` es
  `[]`** (`rutas.ts:40`), y `Seccion` devuelve `null` con cero items (`:35`).

`NEGOCIO` (`rutas.ts:34`, 1 item) y `GESTION` (`rutas.ts:44`, 6 items) **no las
importa nadie**. Dejaron de pintarse el 8-ago-2026 en `ff8242b` («sidebar plano,
los 9 que importan todos los días»), que las sacó del render sin sacarlas del
archivo; mientras `SIDEBAR_PRINCIPAL` tenía 8 entradas eso se leía como una
decisión de diseño, y el 10-ago se quedó sin nada que la tapara.

**Escenario con valores.**

* **Contador.** Entra por magic link. `resolverTenantEfectivo` ve que
  `/dashboard` es área `operacion` y él solo tiene `dinero`
  (`visibilidad.ts:44`), así que `visibilidad.ts:106` lo rebota a
  `inicioDe('contador')` = `/dashboard/suscripcion` (`:169`). Ahí el sidebar
  evalúa: `puedeVerRuta('contador','/dashboard')` → `false` (no pinta Resumen),
  `SIDEBAR_PRINCIPAL` → `[]`, `FISCAL` → `[]`. **Renderiza cero links.** Se
  queda en la pantalla de facturación de Stripe con el logo, su badge
  «CONTADOR», su nombre y «Cerrar sesión». No hay un solo clic que lo lleve a
  otra parte del producto.
* **Dueño de flota (`flota_admin`).** Aterriza en `/dashboard`. El sidebar pinta
  **un** link: «Resumen» — la página en la que ya está. `/dashboard/politicas`,
  `/dashboard/configuracion`, `/dashboard/usuarios`, `/dashboard/arco`,
  `/dashboard/soporte`, `/dashboard/suscripcion` y
  `/dashboard/combustible-casetas` **existen, compilan, autorizan bien y
  funcionan**, y no hay ningún elemento clicable en toda la aplicación que
  lleve a ellas (verificado: el único `href` a cada una está en `rutas.ts`, que
  nadie renderiza; `/cuenta` y `not-found.tsx` no enlazan a ninguna).

**Consecuencia.** `/dashboard/politicas` es donde se edita
`tenant.config.politica` — según el propio CLAUDE.md, **la política viva** que
el motor de cuadre lee en cada liquidación. Hoy el contralor no puede cambiar el
tope de viáticos de su flota desde el producto. `/dashboard/arco` es el canal de
derechos ARCO (obligación de la LFPDPPP, no una pantalla opcional) y su aviso de
privacidad promete que existe. `/dashboard/suscripcion` es donde paga.
`/dashboard/combustible-casetas` es la única pantalla que queda donde se ve
`detectarAnomalias` y la cola de conciliación del CFDI consolidado. Y para el
equipo: quien reconstruya la primera página del rediseño la va a agregar a
`SIDEBAR_PRINCIPAL` o a `GESTION` con 50 % de probabilidad de acertar, porque
las dos listas dicen ser el mapa.

**Por qué ninguna prueba lo ve.** `visibilidad.test.ts:89` arma
`const todas = [...INICIO, ...NEGOCIO, ...OPERACION, ...FISCAL,
...DOCUMENTOS_DINERO, ...GESTION]` y verifica que toda ruta de `todas` tenga
área y que el dueño la pueda ver. **`SIDEBAR_PRINCIPAL` no aparece en esa
lista.** El bloque se llama «el mapa de rutas no se queda atrás del sidebar» y
su comentario (`:86-88`) dice «una pantalla nueva que alguien agregue al sidebar
y olvide clasificar quedaría SIN área»: prueba que lo **declarado** está
autorizado, nunca que lo **autorizado** esté pintado. Verde con cero links en
pantalla.

**Causa raíz probable.** Dos listas para la misma verdad —"a dónde puede ir el
usuario"— y un guardarraíl escrito sobre la lista equivocada; `visibilidad.ts`
gatea por ruta, `rutas.ts` declara por grupo y `sidebar-nav.tsx` pinta por
lista, y nada ata los tres extremos.

---

### [ALTO] Un TERCER mapa de concepto→etiqueta, ya divergido en 3 de 9, en el único archivo que el guardarraíl no enumera

`src/app/dashboard/gasto-semanal-chart.tsx:9-13` contra
`src/lib/likida/cuadre/engine.ts:1200-1201`, con
`src/lib/likida/etiquetas_sincronizadas.test.ts:36-44` como guardarraíl.

Este es el ejemplo canónico del rubro (`otro: 'Gasto'` vs `otro: 'Otro'`),
reincidiendo en un archivo nuevo. El test existe *por* ese incidente y su
encabezado lo dice (`:5-14`, «ya se desincronizaron dos veces… esto no es un
test de etiquetas: es el mecanismo que evita la tercera»). Lo que compara son
**exactamente dos** fuentes:

```
36:  const motor = etiquetas('./cuadre/engine.ts', 'const m: Record<string, string> = {');
37:  const panel = etiquetas('../../app/dashboard/[id]/page.tsx', 'const CONCEPTO');
43:  expect(src, 'volvió a aparecer un mapa de etiquetas en el PDF').not.toMatch(/const CONCEPTO_LABEL/);
```

La línea 43 prohíbe el identificador `CONCEPTO_LABEL`… **en `pdf.ts`, y solo
ahí**. Mientras tanto:

```
$ grep -rn "CONCEPTO_LABEL" src/ --include=*.tsx | grep -v '\.test\.'
src/app/dashboard/gasto-semanal-chart.tsx:9:const CONCEPTO_LABEL: Record<string, string> = {
```

Tres claves divergen contra el motor:

| clave | `engine.ts:1201` (motor, PDF, WhatsApp, detalle) | `gasto-semanal-chart.tsx:11` (Resumen) |
|---|---|---|
| `caseta` | `'Caseta'` | **`'Casetas'`** |
| `factura` | `'Factura'` | **`'Facturas'`** |
| `otro` | `'Otro'` | **`'Otros'`** |

**Escenario con valores.** Flota con $412,000 de gasto en 5 semanas. El
contralor abre `/dashboard`, ve la leyenda de «Gasto por categoría»
(`gasto-semanal-chart.tsx:40`) con las series **Diésel · Casetas · Otros**, y en
el tooltip (`:75`) «Otros $38,400». Abre la liquidación del viaje que quiere
cruzar (`/dashboard/[id]`) y el mismo dinero está bajo **Otro**; el PDF que
archiva su contador imprime **Otro** (`pdf.ts:241`, vía `etiquetaConcepto`); el
mensaje que le llegó al operador por WhatsApp decía **Caseta**
(`processor.ts:1117`). `config.ts:91` mapea `otro → '600-099'`: es una **cuenta
contable**, no un adorno. Tres nombres para la misma cuenta en la misma sesión.

**Consecuencia.** Es el modo de falla que el producto no se puede permitir en la
sala: el contralor pide la conciliación de «Otros» y su contador le contesta que
esa cuenta no existe, existe «Otro». Y para el equipo: el guardarraíl que se
escribió para impedir esto **da confianza falsa** — cualquiera que lea
`etiquetas_sincronizadas.test.ts` concluye que el problema está resuelto.

**Causa raíz probable.** El guardarraíl enumera archivos a mano en vez de
buscar el patrón en todo `src/`, y el componente nuevo del rework del 8-ago
nació después de que la lista se escribiera. `etiquetaConcepto`
(`engine.ts:1191`) ya está exportada y la usan cinco archivos del panel
(`politicas`, `configuracion`, `[id]/page`, `combustible-casetas`, `pdf`); este
es el único que no la usa.

---

### [ALTO] `RUTA_DE_DIFERENCIA` manda 12 veredictos «al panel», y el panel donde se veían ya no existe

`src/lib/likida/cierre_aviso.ts:131-145`, alcanzado desde
`avisar_cierre.ts` → `processor.ts`.

La tabla decide, por tipo de diferencia, si se interrumpe al jefe por WhatsApp
(`'decision'`) o si «se guarda, se ve en la pantalla, pero no justifica un
mensaje» (`'panel'`). Doce tipos van a `'panel'`, con la justificación escrita
al lado:

* `:139` `ocr_baja_confianza: 'panel'` — «bandeja de revisión». Esa bandeja era
  `/dashboard/documentos` (borrada, `2be4b1c`).
* `:142` `combustible_efectivo_dentro15: 'panel'` — «informativo, **el contador
  vive en el panel**». El panel del contador se borró entero (`003c88a`).
* `:133` `duplicado`, `:140` `viatico_rfc_operador`, `:136` `cfdi_pendiente`,
  `:137` `cfdi_efos_indeterminado`, `:138` `permiso_cre_no_verificable`,
  `:145` `complemento_no_verificable`, `:132` `anticipo`, `:134`
  `factura_por_vencer`, `:135` `folio_verificar`, `:141` `combustible_efectivo`
  — se veían en `/dashboard/cuadre`, `/dashboard/documentos`,
  `/dashboard/incidencias`, `/dashboard/contador/deducciones` y
  `/dashboard/contador/cfdi`. **Las cinco están borradas.**

**Escenario con valores.** Viaje LIQ-2026-0418, anticipo $22,000. El operador
manda un ticket de diésel de $4,180 cuyo OCR sale con confianza 0.62 → el motor
levanta `ocr_baja_confianza` (`engine.ts:444`). `RUTA_DE_DIFERENCIA` la clasifica
`'panel'`, así que **no se manda por WhatsApp a propósito**. El jefe abre
`/dashboard`: no hay bandeja de revisión, y las dos tarjetas que traían este
tipo de aviso están apagadas (`page.tsx:158`, ver abajo). La liquidación se
cierra con un monto leído mal y nadie lo mira nunca. Lo mismo con
`viatico_rfc_operador`: la rama buena de RLISR 57 se pierde en silencio porque
la pantalla donde se confirmaba el RFC del operador era
`/dashboard/contador/cfdi`.

**Consecuencia.** El producto tiene dos canales de salida —WhatsApp y panel— y
una tabla que reparte entre ellos. Uno de los dos se apagó y la tabla no se
enteró: 12 de los 33 veredictos del motor se calculan, se persisten en
`liquidacion.diferencias` y **no llegan a ningún ojo humano**. El diseño del
reparto sigue siendo correcto; lo que ya no es verdad es el supuesto que lo
sostiene, escrito en los comentarios del propio archivo.

**Causa raíz probable.** Una dependencia que apunta al revés: `cierre_aviso.ts`
(lógica de dominio, sin imports de UI) codifica una afirmación sobre qué
pantallas existen, y no hay nada —ni tipo ni prueba— que ate esa afirmación al
árbol de rutas.

---

### [ALTO] El bot de WhatsApp le promete al equipo de oficina tres capacidades del panel que se borraron

`src/lib/likida/processor.ts:441-444`.

```
`Para asignar viajes, reasignar chofer o ver liquidaciones, entra a ${process.env.NEXT_PUBLIC_APP_URL ?? 'tu panel'}.`
```

Las tres se borraron: asignar viajes y reasignar chofer vivían en
`/dashboard/despacho` (`crearViaje`/`asignarUnidad`, hoy huérfanas — tabla de
arriba) y ver liquidaciones en `/dashboard/cuadre` + `/dashboard/[id]`. El
comentario inmediatamente encima (`:436-439`) declara la regla que el mensaje
ahora rompe: «Prometerle por WhatsApp algo que todavía no existe… sería peor que
no contestarle: lo haría esperar una acción que nadie va a ejecutar».

**Escenario con valores.** El contador de Transportes Innovativos escribe al
número de Likida. `processor.ts:441` lo reconoce, le contesta ese texto y le
manda a `https://app.likida.ai`. Entra, `inicioDe('contador')` lo deja en
`/dashboard/suscripcion` (la factura de Likida), con **cero links en el
sidebar** (ver el CRÍTICO). No puede asignar, ni reasignar, ni ver una sola
liquidación. El mensaje que lo mandó ahí lo firmó el producto.

**Consecuencia.** Es la salida del sistema hacia el cliente, no un comentario
interno: el primer contacto del contralor con Likida por WhatsApp le describe un
panel que no existe. Y es un rótulo cruzando una frontera de módulo, que es
justo lo que este rubro persigue: un string de `processor.ts` que depende del
árbol de `src/app/dashboard/` sin ninguna referencia que lo ate.

---

### [ALTO · REINCIDENTE, 3ª ronda] El concepto "periodo" sigue definido en cuatro sitios con tres unidades, y "histórico" ya significa tres cosas distintas

`src/lib/likida/analytics.ts:175-177` · `analytics.ts:421` ·
`src/lib/likida/fiscal.ts:865-867` · `src/app/dashboard/actividad.tsx:53`,
todos bajo el mismo `useState` de `src/app/dashboard/panel-periodo.tsx:44-45`.

Verifiqué los cuatro contra HEAD hoy: **ninguno cambió un carácter** desde que
lo reporté el 9-ago. Lo reporto otra vez porque la regla del rubro lo exige, y
porque encontré la arista que faltaba: los tres "histórico" no coinciden entre
sí.

* `analytics.ts:177` — `getSerieComparativa(tenantId, 3650, 1, hoy)` → **10 años**.
* `analytics.ts:421` — `SEMANAS_POR_MODO.historico = 52` → **1 año** (mueve
  «Gasto por categoría», «Liquidado» y «Top rutas»).
* `fiscal.ts:867` — `getGastosFiscales(tenantId, resolverPeriodo('todo', hoy))`
  → **sin cota** (mueve «En riesgo/perdido» y «Recuperable»).

**Escenario con valores.** Flota con 3 años de captura: 830 viajes históricos,
$6.1M de gasto total, $2.4M en los últimos 12 meses. El contralor pone el único
selector de la pantalla en **«Histórico»** y lee, de arriba abajo, sin ningún
rótulo que los distinga:

* dona «Viajes» → **830** (10 años);
* «Gasto por categoría» → 52 barras que suman **$2.4M** (1 año);
* «Liquidado» → una sola cifra de 24 px sin rótulo de tiempo
  (`panel-periodo.tsx:51,104`) — el total de esas 52 semanas;
* «En riesgo/perdido» (`MotorFiscalPeriodo`) → sobre **$6.1M** (todo).

Tres denominadores distintos bajo un botón que se llama «Histórico».

**Consecuencia.** «Un rótulo tiene que ser verdad» roto por una frontera de
módulo, en la pantalla que se enseña en el demo. Y para el equipo: cambiar qué
significa "histórico" obliga hoy a tocar tres archivos que no se conocen entre
sí, sin una sola prueba que los ate — sigue habiendo dos tipos `ModoPeriodo`
(`analytics.ts:422`, exportado y **sin un solo importador**; `actividad.tsx:3`,
el que de verdad se usa desde `panel-periodo.tsx:8`).

**Causa raíz probable.** La misma del pase 2, sin cambio: se unificó el
`useState`, no el dominio.

---

### [ALTO · REINCIDENTE] `dashboard/page.tsx:84` sigue calculando `hoy` en UTC y se lo pasa a ocho funciones que lo declaran en hora de México

`src/app/dashboard/page.tsx:84` contra `src/lib/likida/analytics.ts:92, 172,
299, 381, 434, 457, 491, 1025` y `src/lib/likida/fiscal.ts:744, 852`.

Verificado hoy, sin cambios desde el pase 2. `page.tsx:84` es
`new Date(ahoraMs()).toISOString().slice(0, 10)`; ese `hoy` viaja a
`getGastoPorSemanaSeries`, `getLiquidadoPorSemanaSeries`, `getSeriesKpiCards`,
`getGastosFiscalesSeries` y `getTopRutasPorGastoSeries` (`page.tsx:103, 104,
109, 116, 121`), cuyos defaults dicen hora de México. `fiscal.ts:744` y `:852`
declaran el mismo parámetro con el default contrario. La reincidencia agrava:
`page.tsx:85-88` ahora deriva **`diasEjercicio`** de ese mismo `hoy` y se lo
pasa a `getAcreditables`.

**Escenario con valores.** 31-dic-2026, 18:30 hora de México (CST = UTC−6, sin
horario de verano desde 2022). `Date.now()` ya es el 1-ene-2027 en UTC → `hoy` =
`'2027-01-01'`. `resolverPeriodo(undefined, hoy)` (`page.tsx:85`, default
`'ejercicio'`) retitula el bloque **«Tu motor fiscal — Ejercicio 2027»**, y
`diasEjercicio` vale **1**, así que `getAcreditables(tenantId, 1)` devuelve los
litros de un solo día: **«Diésel elegible para el estímulo: 0.00 L»** la noche
exacta en que el contralor cierra el año.

**Consecuencia.** El panel se contradice consigo mismo todas las tardes a partir
de las 18:00 —la hora a la que un jefe de flota lo abre— y en el cierre de
ejercicio miente sobre el estímulo. Ninguna prueba lo ve: los cuatro tests de
series (`analytics_serie_comparativa.test.ts`, `analytics_semanal.test.ts`,
`analytics_periodo_series.test.ts`, `analytics_rutas.test.ts`) pasan `hoy`
explícito, así que el único camino sin cubrir es el de producción.

**Causa raíz probable.** El contrato de zona horaria vive en un valor por
defecto de parámetro — el sitio exacto donde un llamador lo pisa sin que
TypeScript diga nada.

---

### [MEDIO] 29 símbolos exportados sin llamador, y nada en el repo mide eso

Ver la tabla completa del bloque «qué quedó huérfano». El escenario de falla no
es de hoy, es del próximo que toque el código:

**Escenario con valores.** Alguien reconstruye «Rentabilidad». Encuentra
`comercial.ts:121` `getRentabilidad` (31 líneas, con prueba) y la conecta.
Mientras tanto otro reconstruye «Analítica» y usa
`analytics.ts:974 getTopRutasPorGasto` (que sí tiene ventana) — pero
`analytics.ts:888 getGastoPorRuta` sigue ahí, con nombre casi idéntico, mismo
join en memoria `gasto`×`viaje` y **sin parámetro de ventana**: `getGastoPorRuta('t1')`
devuelve el top-5 de **toda la historia**, `getTopRutasPorGasto('t1', 5, {desde,hasta})`
otro top-5 —otro orden, otras rutas— para la ventana pedida. Dos pantallas del
mismo producto con dos «Top rutas por gasto» que no coinciden, y cero pruebas
que lo detecten. Lo mismo con `fiscal.ts:540 resumirFiscal` (huérfana, 47
líneas) contra `fiscal.ts:422 resumirPerdidas` (viva): la primera calcula
`ResumenFiscal` completo, la segunda solo pérdidas, y quien reconstruya el panel
fiscal tiene que adivinar cuál era la buena.

**Consecuencia.** El costo es de mantenibilidad y de confianza: 759 líneas que
compilan, tienen pruebas verdes y no se ejecutan nunca en producción. Un cambio
de esquema que las rompa no se nota hasta que alguien las reconecta, meses
después, y para entonces la prueba verde dice que funcionan.

**Causa raíz probable.** No hay ninguna medición de «símbolo exportado sin
consumidor» en la compuerta (ni `eslint`, ni `tsc`, ni una prueba de
`sinComentarios`), y las pruebas unitarias **mantienen vivos** los huérfanos:
`fiscal.test.ts` prueba las 8 funciones muertas de `fiscal.ts`, así que un
`no-unused-export` ingenuo tampoco las vería.

---

### [MEDIO] El bloque de alertas del Resumen es código inalcanzable, y con él se apagó la única salida visible de la detección de fraude

`src/app/dashboard/page.tsx:158` y `:188-200`, con `src/app/dashboard/estado.ts:30`.

`const alertas: Array<{ texto: string; href: string }> = [];` y ni un solo
`push` en el archivo (`grep -n "alertas" page.tsx` → `158, 188, 190` y tres
comentarios). Las 13 líneas de JSX de `:188-200` están guardadas por
`alertas.length > 0`, condición demostrablemente falsa. `detectarAnomalias`
(`page.tsx:97`) sigue consultándose en cada carga; su único uso restante es
`estado.ts:30-31`, donde solo se comprueba `=== null`.

**Escenario con valores.** Flota con 3 comprobantes de diésel de $4,180 que
aparecen en dos viajes distintos (el patrón clásico de ordeña que
`detectarAnomalias` existe para cazar) y 5 liquidaciones en `revisar`. El
contralor abre `/dashboard`: **no ve nada**. La consulta corre, encuentra los
3, y el resultado se descarta. Antes de `2be4b1c` la pantalla decía «3
comprobantes aparecen en más de un viaje · Ver →».

**Consecuencia.** El comentario `page.tsx:152-157` explica bien por qué se apagó
(mejor nada que un link a un 404) y promete repoblarlo, pero el estado en el
árbol es: el producto calcula su señal antifraude y su cola de revisión y no las
enseña en ninguna parte alcanzable — la única pantalla que todavía pinta
`detectarAnomalias` es `/dashboard/combustible-casetas`, que no tiene link
(CRÍTICO de arriba). Para el equipo, el JSX que quedó hace creer que la
funcionalidad sigue ahí.

**Causa raíz probable.** Se desconectó el productor en vez de borrar el
consumidor, y TypeScript bendice un arreglo vacío tipado.

---

### [MEDIO · REINCIDENTE] La dona «Viajes» y la gráfica «Actividad» cuentan lo mismo por dos caminos, uno agregado y otro topado a 100 filas

`src/app/dashboard/panel-periodo.tsx:72-77` contra `panel-periodo.tsx:85` →
`src/app/dashboard/actividad.tsx:53`, con `src/lib/likida/analytics.ts:802`
(`getViajes(tenantId, limite = 100)`, `.order('created_at', {ascending:false}).limit(100)`)
y `src/app/dashboard/page.tsx:99` (`getViajes(tenantId)`, sin argumento).

Sin cambios desde el pase 2. La dona sale de `getSerieComparativa` (usa
`traerTodo`, cuenta todos los viajes de la ventana); las barras salen del
arreglo `viajes`, capado a los 100 **creados** más tarde. Con 140 viajes en 30
días y el selector en «Mensual», la dona dice 140 y las barras de al lado suman
100 como máximo, sin nada que explique la diferencia. Es además el mismo tope
silencioso que `traerTodo` existe para evitar, reintroducido por la puerta del
componente: el tipo `ViajeRow[]` no dice en ninguna parte que está truncado.

---

## Lo que revisé y está bien

* **El motor de dinero sigue siendo puro y no lo tocó el borrado.**
  `git diff --stat 20ecbb1..HEAD -- src/lib/likida/cuadre/ src/lib/likida/liquidacion/`
  → **vacío**. `engine.ts:11-20` sigue sin importar nada con I/O (`formato.ts`,
  `util.ts`, `normas/indice.ts` y tipos), y el comentario de `:19` lo declara.
  Los 9 commits **no movieron un solo cálculo de dinero de archivo**, y la única
  función que sí cambió de casa (`getLiquidaciones`) es una consulta, no un
  cálculo, y se mudó byte por byte.
* **`etiquetaConcepto` ganó terreno.** Cinco archivos del panel la importan
  (`politicas:4`, `configuracion:3`, `[id]/page:7`, `combustible-casetas:11`,
  `pdf:14`) y `[id]/page.tsx:393-394` usa su mapa local **solo como red** cuando
  el motor devuelve la clave cruda. La frontera está bien puesta; el problema es
  el sexto archivo (ver ALTO).
* **La ejecución del borrado, archivo por archivo, fue cuidadosa.** No dejó un
  solo import roto ni un solo `href` a página inexistente; movió
  `TableroCifras`/`TablaCarga` a `tablero-operacion.tsx` **antes** de borrar
  `despacho/vista.tsx`; movió `opcionesDe` a `fiscal.ts` **antes** de borrar
  `contador/comun.tsx`; corrigió `inicioDe('contador')` para evitar el bucle de
  redirect y lo fijó con prueba (`visibilidad.test.ts:72-75`); actualizó los
  tres links de preview del superadmin; y dejó en `rutas.ts:11-28` y
  `visibilidad.ts:62-73` un comentario que explica qué se fue y por qué. Es más
  disciplina de la que suele acompañar a un `-6,158`.
* **`AREA_POR_RUTA` no quedó desincronizado del árbol.** Las 8 entradas de
  `visibilidad.ts:75-92` corresponden 1:1 a páginas que existen; ninguna ruta
  borrada dejó su entrada. `puedeVerRuta` niega por default, así que un bookmark
  viejo rebota limpio en vez de 404.
* **`formato.ts` sigue siendo la única fuente de formato.** El guardarraíl de
  `toLocaleString('es-MX')` sigue verde; `analytics.ts` importa `round2` de ahí
  en los seis sitios donde redondea.
* **La frontera servidor/cliente del Resumen sigue bien resuelta.**
  `panel-periodo`, `kpi-periodo`, `motor-fiscal-periodo`, `gasto-semanal-chart`,
  `top-rutas` reciben datos planos ya calculados y solo usan `import type` de
  `analytics.ts`/`fiscal.ts`; `page.tsx:126-140` explica por qué
  `resumirPerdidas` se corre en el servidor (no arrastrar `supabaseAdmin` al
  bundle).
* **El pase 2 sí arregló uno de mis hallazgos y lo documentó bien.**
  `resumen-visual.tsx:95-108` cambió la firma de `KpiDegradado` a
  `valor: number | null` con el porqué escrito y la cita a esta auditoría; es la
  forma correcta de cerrar un hallazgo de este rubro (se cambió el **tipo**, no
  el call site).
* **Los mapas nuevos que sí viven en un solo sitio:** `REGION_POR_CIUDAD`
  (`analytics.ts:923-939`), `ESTATUS` (`dashboard/estatus.ts`, con su prueba de
  no-duplicación en `etiquetas_sincronizadas.test.ts:104-127`) y `RolAppUser`
  (`provisionar.ts:16`). Ninguno tiene copia.

## Lo que NO alcancé a revisar

* **`repo.ts` NO es una frontera de acceso a datos, y no lo abordé como
  hallazgo.** `grep -rln "supabaseAdmin()" src/ | grep -v '\.test\.'` → **50
  archivos** (eran 59 antes del borrado). El MAPA lo llama «repositorio /
  acceso a datos», pero `repo.ts` es uno de esos 50, no la puerta. No es una
  regresión del borrado y no encontré todavía dos lecturas divergentes de la
  misma tabla que pueda demostrar con valores, así que lo dejo declarado en vez
  de inventarle un escenario. Es el primer sitio que miraría el pase 5.
* **`src/lib/likida/facturacion/`** (~4,000 líneas, `al_vuelo.ts`,
  `comercios.ts`, `capufe.ts`). Tercer pase consecutivo fuera. `capufe.ts:896`
  compara dinero con tolerancia y merece una pasada de fronteras propia.
* **`processor.ts` (1,600+ líneas) ↔ `conv.ts` ↔ `tools.ts`.** El reparto de
  responsabilidad entre los tres es de arquitectura y sigue sin auditarse como
  tal; solo entré a `processor.ts:435-450` por el hallazgo del mensaje.
* **`supabase/migrations/` contra `src/types/likida.ts`.** No comparé esquema
  contra tipos en ninguno de los tres pases. Con 29 funciones huérfanas que leen
  columnas que nadie vuelve a tocar, es el sitio donde una divergencia va a
  aparecer sin que nada la vea.
* **Los cuatro subconjuntos de `TipoDiferencia` escritos a mano**
  (`engine.ts:100-101`, `engine.ts:985`, `resumen.ts:24`, y ahora también
  `cierre_aviso.ts:104` `RUTA_DE_DIFERENCIA`) siguen sin prueba de
  exhaustividad — salvo la última, que sí es `Record<TipoDiferencia, …>` y por
  tanto exhaustiva por tipo. Las otras tres no.
* **El render.** No levanté preview ni screenshot: el CRÍTICO del sidebar lo
  deduje del código (un solo componente de navegación, dos listas vacías, una
  condición de rol), no de una foto. Vale la pena confirmarlo con una captura
  antes de enseñárselo a alguien — pero las cuatro piezas están en las líneas
  citadas y no dependen de datos.
