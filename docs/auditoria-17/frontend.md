# Frontend — auditoría 17 · pase 4 (11-ago-2026)

**Nota: 3/10** (antes 5). Razón del movimiento: **deuda que cobró factura**. El
borrado de `master` (`2be4b1c` + `003c88a`) cerró tres hallazgos abiertos al
llevarse sus archivos, y el autofix del pase 3 (`b9a191c`) cerró un ALTO de
verdad — pero **se vaciaron las dos listas que el sidebar lee y no se cambió el
sidebar**. Hoy el panel del cliente pinta **un solo link para el dueño y cero
para el contador**, y las 8 páginas que sobrevivieron —incluido el expediente
con el botón "Descargar PDF"— no tienen ni un enlace entrante. El rubro pasa de
**0 CRÍTICOS abiertos a 1**, y la prueba que existía precisamente para cazar
esto (`visibilidad.test.ts:123`, *"está en el sidebar, no solo en el mapa de
áreas"*) sigue **verde** porque mira una lista que el sidebar ya no consume.

Riesgo mayor hoy: en la demo, el clic "Contador" de `/admin` aterriza en una
pantalla cuya columna de navegación está **literalmente vacía** —logo arriba,
"Cerrar sesión" abajo, 232 px de nada en medio—, y el dueño solo puede llegar a
una pantalla de las nueve que existen.

---

## Hallazgos abiertos de pases anteriores: qué pasó con cada uno

| # / título | Estado | archivo:línea de hoy |
|---|---|---|
| **P1-1** "Vencen pronto (≤ 5 días)" cuenta solo lo ya vencido | **REINCIDENTE** (4ª ronda) | `dashboard/arco/page.tsx:71` (`venceEn(s.venceEn) <= hoy`), rótulo en `:87`, `hoy` UTC en `:31` |
| **P1-2** "Comprobación del periodo" no filtra por fecha | **CERRADO POR SUPRESIÓN** | el archivo ya no existe (`dashboard/cuadre/`, borrado en `2be4b1c`) |
| **P1-3** "PDF por liquidación" pierde el `?tenant=` | **CERRADO POR SUPRESIÓN** | el archivo ya no existe (`dashboard/analitica/`, borrado en `2be4b1c`) |
| **P1-4** Asistente expandido bajo 1280 px deja el panel en blanco | **REINCIDENTE** (6ª ronda) | `dashboard/rail.tsx:105` sigue `hidden xl:flex`; `globals.css:216-223` sigue retirando `.columna-centro`; el gemelo `admin/asistente-expandible.tsx` tampoco cambió |
| **P1-6** "Litros elegibles: 0.00 L" con la cita legal al lado | **REINCIDENTE** (4ª ronda) | `dashboard/combustible-casetas/page.tsx:188` (`acred?.litrosDiesel ?? 0` + `nota="LIF 2026, Art. 20-A"`); el vecino de `:191` sigue usando `vacio` bien |
| **P1-8 / P2-MEDIO 3** El panel manda al chofer a `/mis-viajes` (404) | **REINCIDENTE** | `dashboard/usuarios/page.tsx:16`, con `ROLES: Record<string, string>` en `:12` |
| **P2-CRÍTICO** Expandir el asistente y volver a "Resumen" deja el panel en blanco | **CERRADO POR ARREGLO** (`d7b71a8`, verificado en el pase 3) | `rail-marca.ts:26-30`, `rail.tsx:53-59` |
| **P2-ALTO 1** Un pill gobierna 5 ventanas de tiempo y no rotula ninguna | **REINCIDENTE** | `dashboard/panel-periodo.tsx:47-51` (las cinco de un solo `modo`), pill en `:55-65`, `TituloSeccion` sin ventana en `:70`, `:83`, `:93`, `:103`, `:125` |
| **P2-ALTO 2** "Ahorro generado $0.00" con la consulta caída | **CERRADO POR ARREGLO** (`b9a191c`, de este PR) | `dashboard/page.tsx:265` es hoy `valor={resumenPerdidas?.montoRecuperable ?? null}`; `resumen-visual.tsx:126` pinta `'—'`; `ahorro_sin_dato.test.ts` (3 verdes) |
| **P2-ALTO 3** "Aún no hay viajes registrados" con `getViajesPorMes` caída | **REINCIDENTE** | `dashboard/page.tsx:315` (`porMes={viajesPorMes ?? []}`), `actividad.tsx:54,59`; `estado.ts:16-21` sigue mirando 4 consultas de las 12 |
| **P2-ALTO 4** "Costo por viaje $0.00" | **CERRADO POR ARREGLO** (`e47b124`) | `kpi-periodo.tsx:70` (`valor={valorActual ?? null}`) |
| **P2-ALTO 5** "Gasto por categoría" desborda su columna en Mensual/Histórico | **REINCIDENTE** (aritmética recalculada abajo) | `gasto-semanal-chart.tsx:50` sigue sin `min-w-0`; la celda de `panel-periodo.tsx:91-101` sigue sin `overflow-x`; el ancestro que recorta sigue siendo `page.tsx:165` (`glass-panel overflow-hidden`) |
| **P2-ALTO 6** 16 páginas del panel sin un solo link | **REINCIDENTE Y AGRAVADO → subsumido en el CRÍTICO nuevo** | ya no son 16 de 31: son **8 de 8** (`rutas.ts:40,67` vacíos; `sidebar-nav.tsx:6`) |
| **P2-MEDIO 1** "Aún no hay gastos capturados" con la consulta caída | **REINCIDENTE** | `panel-periodo.tsx:95-100` sigue colapsando `null` y `[]`; sus hermanas de `:110-119` y `:129-133` siguen distinguiéndolos |
| **P2-MEDIO 2** Flechas de periodo de 16 × 16 px | **REINCIDENTE** | `kpi-periodo.tsx:10` (`const BOTON = 'w-4 h-4 …'`) + `:77` (`gap-0.5`); `motor-fiscal-periodo.tsx:7` + `:49` (`gap-0`) |
| **P3-MEDIO 1** Secuela de `d7b71a8`: el chat se queda "expandido" sin nada que lo diga | **REINCIDENTE, escenario degradado** | `rail.tsx:40` (el `useState(false)` que nadie apaga), `:90`. El estado sigue sobreviviendo a la navegación, pero el escenario que reportaba —tres clics de sidebar— ya no existe: no hay links que clicar (ver el CRÍTICO). Hoy solo se alcanza tecleando URLs. |
| **P3-MEDIO 2** El mensaje crudo de PostgREST se imprime en la pantalla del contador | **CERRADO POR SUPRESIÓN** | el archivo ya no existe (`dashboard/contador/comun.tsx`, borrado en `003c88a`). Sobrevive la variante *truncada* que ya reporté como menos grave: `dashboard/arco/page.tsx:97` (`errorCarga.slice(0, 120)`) |
| **P3-MEDIO 3** Tercera copia del mapa de conceptos, y "Diésel" etiqueta una cubeta con gasolina | **REINCIDENTE** | `dashboard/gasto-semanal-chart.tsx:9-13` (`CONCEPTO_LABEL`, con `diesel: 'Diésel'` sobre la clave del concepto) contra `engine.ts` `etiquetaConcepto`; `etiquetas_sincronizadas.test.ts:37` sigue anclado a `[id]/page.tsx`, no a este archivo |
| **P3-MEDIO 4** `/admin/model-ops` rotula 3 de las 6 fases | **REINCIDENTE** | `admin/model-ops/page.tsx:29` (3 claves) contra `costos.ts:41` (`FaseCosto`, 6). Las copias completas bajaron de 4 a 3 (`dashboard/valor-ahorro` se borró): `admin/page.tsx:21`, `admin/analitica/page.tsx:11`, `admin/costos-facturacion/page.tsx:63` |
| **P3-MEDIO 5** "Actividad" bucketea con la zona horaria del proceso | **REINCIDENTE** | `dashboard/actividad.tsx:20-27` (`hoy.setHours(0,0,0,0)` + `d.toISOString().slice(0,10)`); `TZ_MX` sigue sin usarse aquí |
| **P3-BAJO 1** El eje de pesos mezcla centavos y enteros | **REINCIDENTE** | `gasto-semanal-chart.tsx:17-19` (`marcasEje`) + `:47` (`.replace('.00','')`) |

**Cerrados por supresión en este pase: 3** (P1-2, P1-3, P3-MEDIO 2).
**Cerrados por arreglo desde el pase 3: 1** (P2-ALTO 2, `b9a191c`).
**Siguen vivos: 13.**

### Nota sobre P2-ALTO 5, con la aritmética rehecha

El rail ya no ocupa ancho en `/dashboard` (`rail.tsx:90`, `RUTA_SIN_RAIL`), así
que la celda creció y el número cambió — pero el modo de falla no.
A 1440 px: columna = 1440 − 16 − 232 − 16 − 16 = **1160**; `px-5` → 1120;
`md:grid-cols-2 gap-4` → celda **552**; menos el eje Y de 44 px
(`gasto-semanal-chart.tsx:45`) y el `gap-2` → **500 px** para las barras.
Con `min-content` ≈ 27 px por cluster (`2026-S32`, `text-[11px]`, rompe tras el
guion) y `gap-3` = 12 px:

| Vista | Clusters | Mínimo requerido | Disponible a 1440 | A 1366 | A 1280 |
|---|---|---|---|---|---|
| Semanal | 5 | 183 px | 500 ✔ | 463 ✔ | 420 ✔ |
| Mensual | 13 | 495 px | 500 ✔ (por 5 px) | 463 ✘ | 420 ✘ |
| Histórico | 52 | **2 016 px** | ✘✘ | ✘✘ | ✘✘ |

O sea: "Mensual" dejó de desbordar **solo** en pantallas de 1440 px o más, y
"Histórico" sigue desbordando en todas. Sigue sin haber `overflow-x` en el
camino y el recorte sigue siendo `hidden`, no `auto`.

---

## Hallazgos

### [CRÍTICO] El panel del cliente se quedó sin navegación: el sidebar pinta un item para el dueño y NINGUNO para el contador

`src/app/dashboard/sidebar-nav.tsx:6` (importa solo `SIDEBAR_PRINCIPAL` y
`FISCAL`), `:35` (`if (items.length === 0) return null`), `:111`, `:120`, `:132`;
`src/app/dashboard/rutas.ts:40` (`FISCAL: Item[] = []`) y `:67`
(`SIDEBAR_PRINCIPAL: Item[] = []`), con `NEGOCIO` (`:34-36`) y `GESTION`
(`:44-51`) **vivos pero nunca importados por el sidebar**;
`src/app/dashboard/chrome.tsx:65-67`; `src/lib/auth/visibilidad.ts:76,169`;
`src/app/admin/selector-vista.tsx:54`

Escenario, con los clics del demo:

1. Javier abre `/admin`, baja a "Entrar a los otros paneles" y pulsa **Contador**
   (`admin/selector-vista.tsx:54` → `/dashboard/suscripcion?vista=demo&rol=contador`).
2. `SidebarNav` recibe `rol="superadmin"` (el real, de `layout.tsx:30`) y
   `rolVista="contador"`, así que `rolMenu = 'contador'` (`sidebar-nav.tsx:99`).
3. `visibles(SIDEBAR_PRINCIPAL)` recorre un arreglo vacío → nada.
   `<Seccion items={visibles(FISCAL)}>` recibe 0 items → `:35` devuelve `null`.
   `puedeVerRuta('contador', '/dashboard')` es **false** (`visibilidad.ts:76`:
   `/dashboard` es área `operacion`, y el contador solo ve `dinero`), así que
   `:111` tampoco pinta "Resumen".
4. Sale: el `<nav className="flex-1 overflow-y-auto px-2 space-y-2 pb-3">` de
   `chrome.tsx:65` se renderiza **vacío**. La columna de 232 px queda con el
   logo arriba, un hueco de ~600 px, y "Mi cuenta / Cerrar sesión" abajo.

Y no es solo el contador. Con `?rol=flota_admin` (`selector-vista.tsx:43`) el
sidebar pinta exactamente **un** item, "Resumen". Las ocho páginas que
sobrevivieron al borrado —`combustible-casetas`, `arco`, `soporte`, `usuarios`,
`politicas`, `suscripcion`, `configuracion` y `[id]`— no tienen **ni un solo
enlace** en todo el producto (verificado con el grep de `href="/dashboard…"`:
los únicos que existen son los de `/admin` hacia `/dashboard` a secas,
`not-found.tsx:55`, `global-error.tsx:67` y el "← Panel" de `[id]/page.tsx:162`).
De paso, el rail "Asistente de negocio" tampoco se puede ver ya: devuelve `null`
en `/dashboard` (`rail.tsx:90`) y `/dashboard` es la única página alcanzable.

Consecuencia: el contralor de Transportes Innovativos ve una aplicación con un
menú de un renglón —o de ninguno, en la vista del contador, que es la de su
propio contador— y concluye que el producto está a medio construir. La pantalla
de "Combustible & Casetas", que es donde vive la cita de la LIF 20-A y el cruce
del CFDI consolidado (el argumento de venta), solo se abre tecleando la URL.
`/dashboard/arco` —el plazo de 20 días hábiles del art. 32 LFPDPPP— lleva cuatro
rondas sin link y ahora tampoco lo tiene la pantalla que da de alta al contador
de la flota.

Causa raíz probable: `2be4b1c` vació `SIDEBAR_PRINCIPAL` y `FISCAL` para el
rediseño, pero `sidebar-nav.tsx:6` importa **solo esas dos**; `NEGOCIO` y
`GESTION` —que nunca se vaciaron, y que `rutas.ts:26-28` declara explícitamente
como "no se tocó, pedido de Javier"— jamás llegaron al render. El guardarraíl
que debía cazarlo (`src/lib/auth/visibilidad.test.ts:123`, *"está en el sidebar,
no solo en el mapa de áreas… sin esto la página sería alcanzable solo tecleando
la URL"*) sigue verde porque `todas` (`:89`) se arma de las seis constantes de
sección, no de las dos que el componente lee.

---

### [ALTO] El expediente de la liquidación —y con él el único botón "Descargar PDF" del producto— se quedó sin ningún enlace entrante

`src/app/dashboard/[id]/page.tsx:184` (`<a href={\`/api/export/pdf/${d.id}\`}>`),
`:162` (su propio "← Panel", que es solo salida); enlaces entrantes: **ninguno**

Escenario, con valores: el contralor dice "enséñame la liquidación del viaje
TI-0412 y el PDF que le llega a mi contador". El presentador está en
`/dashboard`. No hay tabla de liquidaciones, no hay lista de viajes, no hay
"Ver →": los dos sitios que enlazaban a `/dashboard/<uuid>` eran la tabla de
`dashboard/cuadre/page.tsx` y la de `dashboard/analitica/page.tsx`, las dos
borradas en `2be4b1c`. La única forma de llegar es pegar en la barra de
direcciones el UUID de `liquidacion.viaje_id`, que nadie tiene a la vista.

Es un caso distinto del CRÍTICO de arriba y no se arregla con él: `/dashboard/[id]`
es ruta **dinámica**, así que no está —ni puede estar— en `rutas.ts` ni en
`AREA_POR_RUTA` (`visibilidad.ts:75-92`); por eso `[id]/page.tsx:53` se gatea a
mano con `puedeVerArea(rol, 'dinero')`. Rellenar el sidebar no la devuelve: hace
falta una lista de liquidaciones que enlace a ella.

Consecuencia: el entregable del producto —"entrega la liquidación en PDF",
primera línea de `CLAUDE.md`— no se puede enseñar desde la interfaz. Y el
expediente es también la única pantalla donde se ve el desglose de IVA/IEPS y la
deducibilidad por renglón, que es lo que el contralor cruza contra su contador.

Causa raíz probable: el borrado de las 17 páginas se hizo por ruta de carpeta;
`[id]` no era una de ellas, pero sí lo eran sus dos únicos call sites, y nada
mecánico vigila los enlaces entrantes de una ruta dinámica.

---

### [ALTO] El panel del jefe de tráfico le grita "3 viajes sin chofer" y ya no tiene ninguna forma de asignarlos

`src/app/dashboard/inicio-operacion.tsx:55-57` (la banda de urgentes),
`:111-120` (el render con `StatusPill estado="warn">Atender`),
`:139-159` (la lista "Sin asignar", solo texto);
`src/app/dashboard/tablero-operacion.tsx:13-15` (el comentario que dice que
`TablaSinAsignar`/`FormaAlta` **no** se movieron y se fueron con la página);
`src/app/dashboard/[id]/page.tsx:53` (la otra forma de reasignar, negada a este rol)

Escenario, con valores: la flota tiene 3 viajes en `abierto` sin `operador_id`.
El encargado entra a `/dashboard` y `page.tsx:355` lo manda a `InicioOperacion`.
Arriba, en degradado, "Por asignar: **3**" (`tablero-operacion.tsx:32-34`); bajo
el saludo, la banda naranja **"Atender · 3 viajes sin chofer."**; a la izquierda,
la tarjeta "Sin asignar" con los folios `TI-0412`, `TI-0413`, `TI-0414` y sus
rutas. **Ninguno de los tres es clickeable y no hay un `<select>` ni un botón en
toda la pantalla.**

Las dos vías que existían ya no le sirven:
- `/dashboard/despacho` (donde vivía `TablaSinAsignar`, el `<select>` de operador
  y la server action `asignar`) se borró en `2be4b1c`; el comentario de
  `tablero-operacion.tsx:13-15` deja constancia de que esa pieza no se movió.
- `/dashboard/<id>` sí tiene "Reasignar" (`[id]/page.tsx:126-140`, gateado con
  `puedeAsignar`, que **sí** incluye a `encargado` — `permisos.ts:18`), pero la
  página entera se le niega antes: `[id]/page.tsx:53` exige área `dinero` y el
  encargado solo tiene `operacion` (`visibilidad.ts:41`), así que lo rebota a
  `/dashboard`.

Consecuencia: el rol para el que existe `inicio-operacion.tsx` —el jefe de
tráfico, el usuario diario— recibe una alerta que le exige actuar y el panel no
le da con qué. Una banda de aviso que nunca se puede apagar es exactamente lo
que el propio archivo dice evitar en `:53-54` (*"una banda de alertas que siempre
dice algo entrena a ignorarla"*). En la demo es la tercera de las tres vistas de
`admin/selector-vista.tsx:61`, y la que peor se lee: el producto anuncia el
problema y no ofrece la solución.

Causa raíz probable: el borrado movió a `tablero-operacion.tsx` solo las piezas
de *lectura* que `inicio-operacion.tsx` ya importaba, y las de *escritura* se
fueron con `despacho` sin que nadie mirara que la pantalla que las sustituye
sigue anunciando la acción.

---

## Lo que revisé y está bien

**Los mapas literales contra `src/types/` y los dominios de la base** (trabajo
obligatorio del rubro; los recorrí todos otra vez sobre el árbol de hoy, no una
muestra — `grep "Record<string," src/app` da 29 sitios y los abrí):

- `ROLES` de `usuarios/page.tsx:12` — el único que sí daña, ya reportado (P1-8).
- `ROL_LABEL` de `admin/equipo/page.tsx:13` — `Record<RolAppUser, string>` con
  las 4 claves exactas; sigue siendo el único mapa de roles que `tsc` protege.
- `ROL_BADGE` (`chrome.tsx:26-32`), `NOMBRE` (`aviso-rol.tsx:7-11`), `ROL_LABEL`
  (`admin/mi-perfil/page.tsx:9`) — `operador` sobrevive en dos de ellos, pero son
  fallbacks de insignia con `??` que no nombran ruta ni cifra. `aviso-rol.tsx`
  cuadra exactamente con `PREVISUALIZABLES` (`visibilidad.ts:128`).
- `ETIQUETA_TIPO`/`ETIQUETA_ESTADO` de `admin/compliance/page.tsx:14,17` y
  `ETIQUETA_TIPO` de `dashboard/arco/page.tsx:14` — las 4 y 4 claves exactas de
  `arco_tipo_dominio` / `arco_estado_dominio`
  (`0053_cuentas_bitacora_arco_campanias.sql:113-114`), con `?? s.tipo`.
- `MOTIVO_ERROR` de `combustible-casetas/page.tsx:29-35` — los **5** valores de
  `ResultadoResolverLinea.motivo` (`intake/consolidado.ts:316`), uno por uno, con
  `?? 'No se pudo resolver la línea.'` en `:167`. Es el mapa mejor hecho del panel.
- `ESTATUS` (`estatus.ts:17-21`) + `etiquetaEstatus` (`:26`) — cubre los 3 de
  `EstatusLiquidacion` y devuelve la clave cruda en gris para un cuarto;
  `etiquetas_sincronizadas.test.ts` lo ata al tipo.
- `COLOR_REGION` (`top-rutas.tsx:9-12`) — las **7** regiones que `regionDe`
  (`analytics.ts:949-956`) puede devolver, verificadas contra los valores de
  `REGION_POR_CIUDAD`; `colorDe` cae a `--muted` y el texto a "Sin clasificar".
- `ETIQUETA_MODO` (`kpi-periodo.tsx:14-18`, `motor-fiscal-periodo.tsx:11-13`) —
  `Record<Modo, string>`, cerrado; un cuarto modo rompe la compilación.
- `FASE_LABEL` de `admin/page.tsx:21`, `admin/analitica/page.tsx:11`,
  `admin/costos-facturacion/page.tsx:63` — las tres copias cubren las 6 de
  `FaseCosto`; `FASE_ICONO` (`admin/page.tsx:25`) también. La cuarta
  (`model-ops`) es la del reincidente P3-MEDIO 4.

**`rutas.ts` contra el disco.** `TODAS_LAS_RUTAS` (`:55-58`) enumera hoy
`/dashboard` + `combustible-casetas` + las 6 de `GESTION` = 8 hrefs, y **las 8
existen** en `src/app/dashboard/`. No apunta a ninguna página borrada. El
problema no es que la lista mienta: es que el sidebar no la lee.

**Ningún `href` cuelga de una ruta borrada.** Recorrí todos los `href="/dashboard…"`,
`redirect('/dashboard…')` y `revalidatePath('/dashboard…')` del repo:
`admin/page.tsx:258` y `admin/flotas/page.tsx:167` ya se corrigieron de
`/dashboard/despacho` a `/dashboard` en el propio `2be4b1c`;
`admin/selector-vista.tsx:54` apunta a `/dashboard/suscripcion`, que existe y
que `inicioDe('contador')` (`visibilidad.ts:169`) confirma. Las 9 menciones a
rutas muertas que quedan son **todas** comentarios de docstring
(`page.tsx:48`, `resumen-visual.tsx:148`, `suscripcion/page.tsx:61`,
`chat.tsx:55`, `tenant-efectivo.ts:55`, `repo.ts:117`, `operacion.ts:499`,
`analytics.ts:447`, `fiscal.ts:207`) — deuda de documentación, no de render.

**Ninguna página que quedó importa nada de una borrada.** `npx tsc --noEmit -p .`
→ **0 errores** sobre el árbol post-merge; `tablero-operacion.tsx` es
precisamente el rescate de las dos piezas que `inicio-operacion.tsx` seguía
importando de `despacho/vista.tsx`, y su prueba nueva
(`tablero-operacion.test.tsx`, 3 casos de render real) lo ancla.

**Estados vacío/error de lo que sobrevive.** Repasados uno por uno y bien
pintados: `combustible-casetas/page.tsx:177-178` (`porConcepto === null` →
"No se pudo cargar esta sección"), `:221-222`, `:253-254`, y sobre todo
`safeConciliacion` (`:66-76`), que distingue a propósito "nunca llegó un
consolidado" de "la consulta falló" —el patrón correcto del repo—;
`suscripcion/page.tsx:236-249` (los datos bancarios incompletos NO se muestran a
medias), `:270-275`, `:377-378`, `:420-427`, `:456-460` ("Sin timbrar" para una
factura pagada sin CFDI, que es un estado real y se ve);
`arco/page.tsx:95-99` (fail-cerrado explícito);
`configuracion/page.tsx:46-49`; `usuarios/page.tsx:71-72`;
`inicio-operacion.tsx:96` (`tablero?.viajesActivos ?? '—'`, no `?? 0`),
`:123-126`, `:139-140`, `:169-170`. Ninguno pinta un cero por una consulta caída.

**Claves de React en listas de dinero.** Recorridas todas las que quedan:
`TopRutas` (`top-rutas.tsx:42`) usa `` `${r.origen}→${r.destino}` ``, que es
exactamente la llave de agrupación de `getTopRutasPorGasto`
(`analytics.ts:999`) — no puede colisionar. `TablaCarga`
(`tablero-operacion.tsx:83`) usa `c.operadorId`. `suscripcion` usa `f.id` y
`p.clave`; `arco`, `s.id`; `usuarios`, `u.id`; `HBars`/`Dona` en
`combustible-casetas:202,205` agrupan por `concepto`, único por construcción.
Ninguna clave inestable sobre una fila de dinero.

**Formato de cifras.** Sigue habiendo una sola fuente: `src/lib/formato.ts`.
`dashboard/formato.ts` es reexport puro (`:28`), `lib/utils.ts:12` también, y
`admin/ui/formato-preset.ts` resuelve presets llamando a esas funciones, sin
reimplementar. `formato.test.ts` (la prueba que bloquea `toLocaleString('es-MX')`
fuera del archivo) sigue verde.

**Autorización de la UI.** `sidebar-nav.tsx:105` sigue filtrando con la MISMA
`puedeVerRuta` que gatea la página, `rolMenu` (`:99`) replica `rolEfectivo`, y el
sufijo `?tenant=`/`?vista=`/`?rol=` viaja en cada link (`:84-93`, cubierto por
`sufijo.test.ts`). `resolverTenantEfectivo:105-107` conserva la previsualización
en el rebote. `AvisoSinFlota` sigue yendo **antes** que cualquier cifra
(`page.tsx:184-186`) y `AvisoRol` (`aviso-rol.tsx:87-93`) es hoy la única salida
en pantalla de vuelta a `/admin` — sigue puesta.

**Compuerta.** `npx tsc --noEmit -p .` → 0 errores.
`npx vitest run src/app/dashboard src/app/admin src/app/sin_previews.test.ts` →
**20 archivos, 129 pruebas verdes**.

---

## Lo que NO alcancé a revisar

- **Nada se renderizó, cuarta ronda seguida.** Sin credenciales y con
  `npm run build` prohibido, el CRÍTICO está derivado de leer qué importa
  `sidebar-nav.tsx` y qué vale cada constante — es determinista y lo verifiqué
  línea por línea, pero **no vi el hueco de 600 px en un navegador**. Lo mismo
  para el desbordamiento de P2-ALTO 5, que sigue siendo aritmética de layout.
- **`admin/asistente-expandible.tsx` y las ~30 páginas de `/admin` por dentro.**
  Solo abrí `page.tsx`, `flotas/page.tsx`, `selector-vista.tsx`, `layout.tsx`,
  `model-ops`, `compliance`, `equipo`, `mi-perfil` y `ui/*`. Sigue sin haber
  `admin/error.tsx`: un fallo ahí sube a `global-error.tsx` y recarga el
  documento entero; no lo perseguí porque esa consola solo la usa Javier.
- **`politicas/page.tsx` (298 líneas) y `soporte/page.tsx` (136).** Solo verifiqué
  que existen, que gatean por `resolverTenantEfectivo` y que no tienen mapas
  literales fuera de sincronía. No leí su contenido ni sus server actions.
- **Accesibilidad más allá de contraste y tamaño de toque.** El pill de
  `panel-periodo.tsx:57-66` sigue sin `aria-pressed` ni rol de grupo de radio (lo
  dejo anotado por tercera vez, no lo cuento como hallazgo nuevo); no verifiqué
  orden de foco, teclado en los formularios de ARCO/suscripción/consolidado, ni
  `aria-live` tras las server actions. Con el sidebar vacío tampoco hay
  "skip to content" que evaluar.
- **Responsive por debajo de `md`.** Los `grid-cols-1 md:grid-cols-2/3` los leí,
  no los medí. El sidebar colapsa a 72 px bajo `lg` (`marco.ts:22`) — con la
  navegación vacía eso deja una columna de 72 px de puro fondo, que no evalué.
- **Modo oscuro.** `globals.css:119-125` redefine `--color-bad`/`--color-ok` con
  sus ratios anotados; no re-medí ninguno, ni el hero (`hero-camion.webp`) que sí
  se midió en el pase 2 y no cambió.
- **La suite completa** (`npx vitest run` a secas) no la corrí: solo los 20
  archivos de `src/app/`. La cifra global de este pase la tomo del MAPA.
