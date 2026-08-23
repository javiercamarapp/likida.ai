# Frontend — auditoría 18

**Nota: 6/10** (antes 7). Razón del movimiento: **mirada más profunda** — el código
no empeoró, la nota anterior estaba inflada. La 2 midió el camino feliz y los
estados que *sí* están pintados a propósito (que son muchos y son buenos). Esta
ronda midió lo que la pantalla **afirma** contra lo que la consulta **midió**, y
ahí el Resumen —la primera pantalla del contralor— hace cuatro afirmaciones que
no se sostienen.

**El riesgo mayor hoy:** el Resumen dice cosas que no midió. Un selector rotulado
"Histórico" que en realidad enseña 52 semanas de dinero, un pie de tarjeta que
escribe "sin movimiento" cuando no tuvo con qué comparar, y una lectura caída que
se pinta como "aún no hay gastos capturados". Ninguna de las tres se nota mirando
la pantalla: se notan cuando el contralor cruza la cifra contra su contador.

---

## Hallazgos

### [ALTO] Un solo selector rotula cinco ventanas de tiempo distintas; "Histórico" enseña 52 semanas de dinero

`src/app/dashboard/panel-periodo.tsx:44-51`
(y `src/lib/likida/analytics.ts:513`, `:158-160`, `src/app/dashboard/actividad.tsx:53`)

El pill único Semanal / Mensual / Histórico (`panel-periodo.tsx:57-67`) gobierna
cinco bloques. Las ventanas reales, leídas en el origen de cada serie:

| bloque | fuente | semanal | mensual | histórico |
|---|---|---|---|---|
| Viajes (dona) | `getSeriesKpiCards` (`analytics.ts:158`) | **7 días** | **30 días** | 3 650 días |
| Actividad | `bucketsPorDia` (`actividad.tsx:53`) | **7 días** | **30 días** | todo (`getViajesPorMes`) |
| Gasto por categoría | `SEMANAS_POR_MODO` (`analytics.ts:513`) | **5 semanas = 35 días** | **13 semanas = 91 días** | **52 semanas = 364 días** |
| Liquidado ($) | idem | **35 días** | **91 días** | **364 días** |
| Top rutas | `getTopRutasPorGastoSeries:1200` | 35 días | 91 días | sin cota (todo) |

Escenario: una flota que arrancó en marzo-2025 y lleva $6,900,000 liquidados. El
contralor aprieta **Histórico**. La dona "Viajes" cuenta los 412 viajes de toda
la vida de la cuenta; "Top rutas" también sale sin cota; pero la tarjeta
"Liquidado" imprime en grande `mxn(totalLiquidado)` (`panel-periodo.tsx:107`)
sumando **solo las últimas 52 semanas** → **$4,180,000**. No hay ningún rótulo por
tarjeta que lo acote: el único rótulo en pantalla es el pill que dice "Histórico".
Los ~$2.7M de ago-2025 hacia atrás desaparecen sin una línea que lo diga.

En **Semanal** el desajuste es peor por cercanía: la dona dice "12 viajes" (7 días)
y la tarjeta de al lado dice "$310,000 liquidado" (35 días). Dividir una entre otra
—que es exactamente lo que hace un contralor con dos tarjetas contiguas bajo un
mismo filtro— da $25,833 por viaje contra un costo real de ~$5,000.

Consecuencia: el contralor cruza el "histórico" del panel contra su balanza y no
cuadra; o peor, se lo cree. Rompe la regla escrita del repo: "si un filtro está
en pantalla, mueve TODO lo que hay debajo" y "un rótulo tiene que ser verdad".

Causa raíz probable: `SEMANAS_POR_MODO` (semanas ISO, 5/13/52) y
`getSeriesKpiCards` (días, 7/30/3650) son dos escalas distintas que el selector
único del 8-ago-2026 juntó bajo tres etiquetas sin reconciliarlas.

---

### [ALTO] `StatCard` escribe "0% · sin movimiento" justo cuando NO pudo comparar

`src/app/admin/ui/kit.tsx:152-157`
(llamadores: `src/app/dashboard/kpi-periodo.tsx:69`, `src/app/dashboard/inicio-contenido.tsx:386`)

El propio contrato del componente lo prohíbe, textual en `kit.tsx:93-98`: *"Sin
dato comparable el llamador OMITE el delta: un '0.0%' inventado afirmaría 'sin
cambio', que no es lo mismo que 'no se pudo comparar'."* Pero la rama
`delta === null` (que es exactamente la señal de "se intentó comparar y no hay
contra qué") pinta el literal **`0% · sin movimiento`**.

Escenario con valores: la flota no liquidó nada la semana pasada y esta semana
gastó $84,300. `pctCambio(84300, 0)` devuelve `null` (`formato.ts:70`, base 0),
`kpi-periodo.tsx:69` manda `delta={null}`, y la tarjeta "Gasto total — últimos 7
días" imprime **$84,300** con el pie **"0% · sin movimiento"**. Segundo escenario,
permanente: en modo **Histórico** `series.historico` trae un solo bucket
(`analytics.ts:140-142`), `anterior` es `null`, y *toda* tarjeta de KPI en vista
histórica lleva ese pie. Tercero: `inicio-contenido.tsx:386` pasa `delta={null}`
a "Diésel elegible para el estímulo" — la métrica que el mismo comentario de
`kit.tsx:154-156` nombra como el caso que debía ir **limpio** (con `delta`
omitido) — así que los litros de diésel del ejercicio salen rotulados
"0% · sin movimiento".

Consecuencia: el contralor lee una afirmación falsa sobre la tendencia de su
propio gasto, en la tarjeta más grande de la pantalla de entrada. Y es la clase de
error que se descubre en la sala, porque él sí sabe que la semana pasada no gastó.

Causa raíz probable: `null` se usa como "no comparable" en el llamador y como
"pinta el pie neutro" en el componente; los dos significados colisionan en la
misma rama.

---

### [ALTO] Una consulta caída del Resumen se pinta como "aún no hay gastos capturados", y el aviso de "pantalla incompleta" no la vigila

`src/app/dashboard/panel-periodo.tsx:97-101` (gemelo en `:74-81`)
(causa raíz en `src/app/dashboard/estado.ts:30` y `src/app/dashboard/inicio-contenido.tsx:39-41`)

`safe()` (`inicio-contenido.tsx:39`) traga cualquier excepción y devuelve `null`,
sin log. `getGastoPorSemanaSeries` sí lanza: pasa por `traerTodo` → `exigir`
(`src/lib/likida/pg.ts:34`), que hace `throw` ante error de PostgREST. Entonces:

Entra: PostgREST devuelve error en el `select` de `gasto` (RLS, statement timeout,
`max_rows`, la base caída un instante) mientras el resto del Resumen carga bien.
Sale: `gastoSemanalSeries === null` → `gastoModo === null` → la tarjeta imprime
**"Aún no hay gastos capturados."** Igual en la dona de al lado: `seriesKpis === null`
→ **"Aún no hay viajes registrados en este periodo."**

Y el guardarraíl no alcanza: `estadoPanel` (`estado.ts:30`) solo vigila cuatro
secciones — `acreditables`, `kpis`, `liquidaciones`, `anomalias`. `seriesKpis`,
`gastoSemanalSeries`, `liquidadoSemanalSeries`, `topRutasSeries`, `viajesPorMes`,
`cfgFiscal` y `gastosFiscales` **no están en esa lista**, así que el banner
"Faltan datos por cargar — esta pantalla está incompleta"
(`inicio-contenido.tsx:329-338`) no se pinta. La pantalla afirma la ausencia con
cara de certeza.

Prueba de que es incoherencia y no criterio: en la misma fila, la tarjeta
"Liquidado" **sí** distingue (`panel-periodo.tsx:110-113`, "No se pudo cargar esta
gráfica") y "Top rutas" también (`:135`). Dos de cuatro tarjetas contiguas dicen la
verdad y dos mienten. Mismo patrón en `inicio-contenido.tsx:358`: si
`getGastosFiscales` falla, `resumenPerdidas` es `null` y "Ahorro generado —
ejercicio 2026" imprime **$0.00** sin ninguna advertencia.

Consecuencia: es exactamente el fallo que la auditoría 5 marcó CRÍTICO y que
`estado.ts` existe para cerrar — el panel ciego afirmando "no hay nada". Hoy está
cerrado para cuatro consultas y abierto para siete.

Causa raíz probable: `estadoPanel` se escribió cuando el Resumen tenía 4 secciones;
las series del selector se agregaron el 8-ago y nadie las dio de alta en la lista.

---

### [ALTO] "Vencen pronto (≤ 5 días)" cuenta las que YA vencieron — y el mismo KPI se calcula distinto en /admin

`src/app/dashboard/arco/page.tsx:71` (rótulo en `:87`)

```ts
const vencenPronto = solicitudes.filter((s) => (…) && venceEn(s.venceEn) <= hoy);
```

`<= hoy` es "la fecha límite ya pasó o es hoy", no "faltan 5 días o menos". La
consola del superadmin calcula el MISMO indicador bien:
`src/app/admin/compliance/page.tsx:189` usa
`p.venceEn <= new Date(Date.now() + 5*864e5)…`.

Escenario, hoy 2026-08-20: la flota tiene dos solicitudes ARCO abiertas, una que
vence el **2026-08-22** y otra el **2026-08-24** (LFPDPPP art. 32, 20 días
hábiles). En `/dashboard/arco` la tarjeta **"Vencen pronto (≤ 5 días)" marca 0**.
Javier, mirando `/admin/compliance` esa misma mañana, ve **2**. Si una tercera
venció el 2026-08-18 y sigue abierta, el panel de la flota la cuenta como
"vence pronto" cuando ya está fuera de plazo.

Consecuencia: la responsable del tratamiento (la flota) es quien tiene el deber
legal de contestar, y su tablero le dice que no hay nada urgente el día antes del
vencimiento. Un incumplimiento del art. 32 no lo paga Likida, lo paga el cliente —
y el cliente va a preguntar por qué su panel decía cero.

Causa raíz probable: el KPI se copió del panel de superadmin sin la aritmética;
`venceEn()` (`:70`) recorta a `YYYY-MM-DD` pero nunca se le suma la ventana.

---

### [MEDIO] `costoPorViaje === null` se imprime como "$0.00" — el cero que el propio tipo prohíbe

`src/app/dashboard/kpi-periodo.tsx:67`

`valor={valorActual ?? 0}`. El tipo dice literalmente por qué eso está mal
(`src/lib/likida/analytics.ts:58-61`): *"`null` sin viajes en el periodo — dividir
entre cero daría Infinity, y '$0/viaje' se leería como que salió gratis, no como
que no hay con qué medir."*

Escenario: semana de puente, la flota no despachó ningún viaje pero sí capturó
$41,200 de gastos de taller y casetas atrasadas. `getSerieComparativa` devuelve
`totalViajes: 0`, `costoPorViaje: null`. La tarjeta imprime **"Costo por viaje —
últimos 7 días · $0.00"** al lado de **"Gasto total — últimos 7 días · $41,200"**.
Dos cifras contiguas que se contradicen.

Consecuencia: el contralor lee "$0 por viaje" como una medición favorable. Es la
misma clase de cero de encuadre que `libro.tsx:309-311` documenta y evita ("el
hueco se escribe, no se rellena con $0.00") — la disciplina existe en el repo y
esta tarjeta no la sigue.

Causa raíz probable: `StatCard.valor` está tipado `number` sin admitir el hueco,
así que el llamador coalesce a 0 para compilar.

---

### [MEDIO] El mapa de tipos de diferencia del panel cubre 2 de los ~30 valores reales; uno de sus 3 renglones no existe

`src/app/dashboard/agentes/liquidacion/vista.tsx:13-18`

```ts
const TIPO_DIFERENCIA: Record<string, string> = {
  sobre_politica: 'Sobre política',
  duplicado: 'Duplicado',
  sin_comprobar: 'Sin comprobar',   // ← esta clave NO existe
};
```

`sin_comprobar` no aparece en ningún otro archivo de `src/` (el valor real de
`TipoDiferencia` es `sin_comprobante`, `src/types/likida.ts:64`), así que es un
renglón muerto. `getDineroObservadoPorTipo` (`analytics.ts:268-278`) no filtra
nada: **todos** los tipos que el motor escribe en `liquidacion.diferencias` llegan
a la dona.

Escenario: una flota con las diferencias que el motor emite de verdad. La tarjeta
"Dinero observado" de `/dashboard/agentes/liquidacion` pinta la leyenda con
`rotuloTipo` (`:18`, `t.replaceAll('_',' ')`) y el contralor lee, junto a montos
en pesos:

- `alimentacion transporte sin tarjeta credito · 4 — $9,180`
- `viatico excede fiscal · 12 — $14,400`
- `cfdi efos · 1 — $22,000`
- `Sobre política · 7 — $3,900`

Sin acentos, sin mayúscula, mezclado con dos renglones que sí están escritos en
español de oficina. Y `cfdi efos` es el veredicto más severo del motor (emisor en
la lista negra 69-B) apareciendo como jerga cruda.

Consecuencia: la pantalla que vende el diferenciador —"mira lo que el agente
atrapó"— se ve a medio construir en la proyección, y el término más grave no se
entiende. El repo ya tiene el patrón correcto para esto:
`src/lib/likida/normas/por_diferencia.ts:27,77` obliga a declarar **cada**
`TipoDiferencia` (con `Partial<Record<TipoDiferencia, …>>` y una lista `SIN_NORMA`
explícita "para que se vea que es una decisión y no un olvido"). Este mapa está
tipado `Record<string, string>`, así que TypeScript nunca lo va a avisar.

Causa raíz probable: el mapa se escribió con tres ejemplos cuando el motor emitía
tres tipos y quedó tipado contra `string` en vez de contra `TipoDiferencia`.

---

### [BAJO] `/login?enviado=1` es un estado terminal: sin formulario y sin salida en la página

`src/app/login/page.tsx:231-317`

Con `enviado=1` el ternario reemplaza **todo** el bloque de acciones (Google,
separador, campo de correo, botón, y la nota "¿Tu correo no tiene acceso?") por la
tarjeta de confirmación. Lo que queda clicable en la pantalla son `/terminos` y
`/privacidad`; el `Logo` (`src/app/logo.tsx:29`) es un `<span role="img">`, no un
enlace.

Escenario: el contralor teclea `contralroria@flota.com` (dedazo). Como
`esCorreoSinCuenta` (`:89-95`) suprime a propósito la diferencia entre "existe" y
"no existe" —decisión correcta, cierra el oráculo de enumeración—, ve **"Te
mandamos un enlace a tu correo. Ábrelo desde este mismo dispositivo."** Espera. No
llega nada. En la pantalla no hay ningún control para reintentar con otro correo:
tiene que usar el botón Atrás del navegador o editar la URL a mano.

Consecuencia: el correo con dedazo es el modo de falla más común de un magic
link, y la única puerta al producto no ofrece camino de vuelta. Con un comprador
delante, "déjame volver a intentar" es teclear una URL.

Causa raíz probable: el estado `enviado` se modeló como reemplazo del formulario
en vez de como aviso encima de él.

---

## Lo que revisé y está bien

Esto vale tanto como lo de arriba; varias de estas defensas son mejores que el
promedio de la industria y son las que sostienen la nota en 6 y no más abajo.

- **El formato de cifras no está divergido.** `src/lib/utils.ts:12` reexporta de
  `src/lib/formato.ts` y `src/app/dashboard/formato.ts:27` también; no hay una
  segunda implementación de `mxn`/`litros`/`fechaMx` en `src/app/`. La prueba que
  falla ante `toLocaleString('es-MX')` fuera de `formato.ts` sigue siendo la
  defensa correcta. Verificado además que `formato.ts:146-152` y `:163-168`
  tratan una columna `date` en UTC y un `timestamptz` en `TZ_MX` — el bug del día
  corrido está cerrado en las tres funciones.
- **La etiqueta del renglón del panel = la del PDF.** `dashboard/[id]/page.tsx:392-395`
  delega en `etiquetaConcepto` con `ocrExtra`, y `etiquetas_panel.test.ts:37-45`
  mira la SALIDA (un ticket MAGNA no puede salir "Diésel"), no la forma del mapa.
  El mapa local `CONCEPTO` (`:28`) solo entra cuando el motor devuelve la clave
  cruda; cubre los 9 valores de `ConceptoGasto`.
- **`etiquetaEstatus`** (`dashboard/estatus.ts:25-27`) cubre los 3
  `EstatusLiquidacion` y cae a la clave cruda en gris, nunca a `undefined`. Igual
  `libro.tsx:84-85` y `agentes/liquidacion/vista.tsx:324` para los 3 de
  `viaje.estatus`.
- **Mapas tipados contra el enum** (TypeScript los hace exhaustivos y verifiqué
  que compilan): `libro.tsx:63` (`EstadoDocumental`), `huerfanos/vista.tsx:11`
  (`MotivoHuerfano`), `conexiones/vista.tsx:5`, `clientes/vista.tsx:295`,
  `unidades/vista.tsx:12`, `suscripcion/page.tsx:50`, `admin/equipo/page.tsx:14`
  (`RolAppUser`), `admin/qa/[id]/corrida-viva.tsx:32,40`, `admin/consumo/page.tsx:22`.
  `carta-porte/vista.tsx:73` es `Record<string,…>` sin fallback (`:80`,
  `PILL[v.decision.necesita]` sin `??`), pero los 3 valores del tipo están todos
  presentes hoy — latente, no hallazgo.
- **`viajes/libro.tsx` completo** es el estándar de oro del rubro: cada hueco se
  escribe en palabras (`:281-307`, `:309-333`), `puedeVerDinero` es prop
  **requerida** (`:76`), "contribución ≠ utilidad" va en pantalla y no en tooltip
  (`:174-180`), y "no hay liquidación" se distingue de "salió limpia" (`:247-257`).
- **El escaneo `dinero_por_area.test.ts` ya cerró su agujero**: desde `:74-76`
  lee *todos* los `.tsx` del directorio, así que `viajes/libro.tsx` sí está
  cubierto (el comentario de `libro.tsx:47-50` que dice lo contrario quedó viejo,
  pero la prueba está bien).
- **`admin/copiloto.tsx` — intenté romperlo y aguanta.** La destructuración de
  tuplas en `:141` (`.map(([k, v]) => …)`) parecía que iba a lanzar con la forma
  que declara el schema de la tool (`copiloto.ts:118-121`, objetos
  `{concepto, valor}`), pero `validarBloques` (`analista.ts:80-85`) normaliza
  objeto→tupla antes de emitir. `PANTALLA_UI` (`:104-119`) y `ETIQUETA_TOOL`
  (`:81-98`) cubren las 14 tools de `copiloto-tools.ts` sin hueco, con fallback en
  las dos. `TarjetaAccion` llama sus hooks antes de los `return` tempranos y no
  pinta botón sin `intentId` (`:218-225`). Los tres estados de la lista de
  conversaciones (`null` cargando / `'error'` / vacío real) están pintados y
  diferenciados (`:610-625`).
- **`not-found.tsx`**: el SVG lleva `role="img"` + `aria-label` descriptivo
  (`:84-86`), todo el diagrama es `currentColor` así que pivota con el tema
  (importante porque un 404 bajo `/dashboard/*` hereda `data-theme="dark"`), y los
  rótulos del SVG se retiran bajo 640px (`:119-122`) porque el texto de un SVG
  escala con el viewBox. No encontré nada que reportar.
- **`login/page.tsx`** fuera del hallazgo BAJO: rate-limit por IP en las dos vías
  (`:74-78`), respuesta idéntica para correo sin cuenta (`:143-153`),
  `shouldCreateUser:false`, `next` validado contra `/dashboard` en los tres sitios
  (`:103`, `:108`, `:124`), `<label class="sr-only">` en el campo (`:284`),
  `:focus-visible` con anillo real para campo, botones y ligas
  (`login.css:171-183`), y `opacity:0` de la animación de entrada vive DENTRO de
  `@media (prefers-reduced-motion: no-preference)` — si el CSS no llega el
  contenido está visible, no invisible esperando una animación.
- **Contraste**: `contraste.test.ts` mide `--color-ok`, `--color-bad` y `--faint`
  contra `--surface` y `--bg` en claro y oscuro, leyendo los hex de `globals.css`
  (no de una copia). `--ok`/`--warn`/`--bad` de la librería de /admin traen sus
  ratios documentados (`globals.css:97-107`).
- **`usuarios/vista.tsx`** distingue `usuarios === null` (lectura caída) de
  `length === 0` (`:55-68`), y `ROLES` (`:11-17`) cubre los 5 valores de
  `app_user.rol` incluidos `operador` y `superadmin`, que no se invitan.
- **`/demo`** (`demo/page.tsx:69-74`): el `catch` del cierre avisa en la burbuja en
  vez de colgar el demo. No se cae.
- `npx tsc --noEmit -p .` limpio; `npx eslint src/` sin errores (5 warnings de
  variables no usadas, todas en archivos `.test.ts`).

## Lo que NO alcancé a revisar

Sin esto la nota es una mentira por omisión.

- **No miré ningún render.** La regla del repo es "medir no sustituye a mirar", y
  esta corrida es en la nube sin `npm run build`, sin base y sin credenciales: no
  levanté preview headless ni tomé un solo screenshot. Todo lo de arriba se
  sostiene por lectura de código. Los hallazgos de aritmética y de rótulo (1, 2, 4,
  5) no dependen del render; los de composición, responsive real y jerarquía
  visual **no se auditaron en absoluto** esta ronda.
- **Responsive y toque**: no medí un solo `tap target` real ni probé un ancho de
  390px. `login.css` y `not-found.tsx` traen decisiones de breakpoint razonadas y
  las leí, pero no las verifiqué.
- **~24 de las ~31 páginas de `/dashboard`** las abrí solo para el barrido de
  mapas literales, no a fondo: `facturacion/`, `rentabilidad/`, `combustible-casetas/`,
  `conocimiento/`, `politicas/`, `integraciones/`, `conexiones/`, `llaves-api/`,
  `notificaciones/`, `mapa/`, `soporte/`, `contador/`, `despacho/`, `carta-porte/`,
  `agentes/{peajes,facturas,conductores,notificaciones}`. Cualquiera puede tener
  el mismo patrón de "afirmar lo que no midió" que encontré cuatro veces en el
  Resumen; no lo busqué ahí.
- **`/admin` casi entero**: solo abrí `compliance`, `copiloto`, `ui/kit`,
  `costos-facturacion`, `salud-sistema` y `consumo`. Las otras ~35 pantallas de la
  consola de Javier no se auditaron. Menor prioridad (el comprador no las ve), pero
  no es cero: `admin/compliance/page.tsx:79` rotula "≤ 5 días **hábiles**" y calcula
  5 días **naturales** — lo dejo anotado aquí y no como hallazgo porque solo lo ve
  Javier.
- **Accesibilidad con lector de pantalla**: no la probé. Una duda concreta que
  quedó abierta: el `role="alert"` de `login/page.tsx:323` existe en el HTML desde
  el primer parseo (llega por redirect, no por inserción en un live region ya
  montado), y en esa situación la mayoría de los lectores **no** anuncian. No lo
  reporto porque no lo verifiqué con un lector real.
- **`globals.css` completo** (tokens, `.card`, `.hairline`, `.glass-panel`,
  `rejilla-punteada`, animaciones) — solo leí los bloques de color que toca
  `contraste.test.ts`.
- **No corrí `vitest`.** Leí las pruebas relevantes del rubro
  (`etiquetas_panel`, `dinero_por_area`, `contraste`, `estado`) pero no ejecuté la
  suite; la compuerta de esta ronda la corre otro.
