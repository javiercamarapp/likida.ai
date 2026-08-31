# Frontend — auditoría 23

**Nota: 7/10** (antes 7). Razón del movimiento: **ninguna — las dos razones se
cancelan y lo digo así en vez de mover el número por gesto.** *Se atacó y
subió*: FE-1 quedó cerrado de verdad (`a6493be` dentro de `7b1f109`), con las
tres capas alineadas —`page.tsx:87-104` distingue `null` de `[]`,
`vista.tsx:25` lo tipa `… | null` y `forma.tsx:106-116` pinta dos textos
distintos en `--bad` y `--warn`— y con prueba propia
(`facturacion/clientes_no_leidos.test.tsx`). *Deuda que cobró factura*: la
MISMA familia de bug —`?? 0` sobre una lectura caída, que la auditoría 1 cerró
como CRÍTICO y `KpiTile` documenta en `kit.tsx:30-32`— sigue viva en una cifra
FISCAL de otra pantalla que la 22 no abrió, y **cero** de los 6 MEDIO/BAJO que
la 22 dejó escritos se tocaron. Sube por el arreglo, baja por la reincidencia
estructural: se queda en 7.

**Riesgo mayor de hoy:** «Litros elegibles para el estímulo» imprime `0` con
cita del LIF 2026 Art. 20-A cuando la consulta que lo mide se cayó, y en esa
sección nada dice que se cayó — es la regla #1 del producto rota en la única
cifra fiscal que la pantalla afirma.

## Hallazgos

### [ALTO] «Litros elegibles para el estímulo» imprime un 0 medido cuando la lectura falló, y la pantalla no lo dice
`src/app/dashboard/combustible-casetas/page.tsx:197` (contra `:203-205` en la
misma grilla y `src/app/admin/ui/kit.tsx:30-32, 53, 69`)

Escenario: `getAcreditables(tenantId)` falla —timeout de `acotada`, PostgREST
500, la RPC de acreditables sin aplicar en esa base—. El `safe()` de la línea
38-40 la convierte en `acred = null`. `porConcepto` SÍ cargó, así que el render
entra por el `else` de la línea 188 y pinta las cuatro tarjetas. La tercera es:

```
Litros elegibles para el estímulo
0
LIF 2026, Art. 20-A
```

`valor={acred?.litrosDiesel ?? 0}` colapsa «no leí» a un cero medido. Entra:
una flota con 41,300 litros de diésel con IEPS desglosado en el ejercicio →
sale: `0` en cifra de 20px, con su cita legal debajo, y ni una palabra de error
en la sección (`porConcepto === null` es la ÚNICA rama de fallo del bloque,
línea 186). Esta página no tiene banner de «pantalla incompleta»: a diferencia
del Resumen, no llama a `estadoPanel`.

Lo que lo vuelve hallazgo y no opinión es que la defensa ya existe y está a dos
tarjetas de distancia: `KpiTile` acepta `valor: number | null` y pinta `—` en
`--faint` (`kit.tsx:53, 69`) precisamente «en vez de un 0/0% con cara de
medición»; la tarjeta de al lado (`:203-205`) lo usa bien, preservando el
`null` de `pctSinCfdi` con su `vacio=`. Las dos de la izquierda también son
honestas (`diesel?.total ?? 0` vive DENTRO de la rama donde `porConcepto` ya se
leyó, y su nota dice «Sin cargas registradas todavía»). La única que mezcla las
dos cosas es la fiscal.

Consecuencia: el contralor concluye que su flota no tiene litros elegibles para
el estímulo de diésel —la cifra que decide si pide o no el acreditamiento del
LIF 20-A— sobre una consulta que nunca respondió. Es la regla «nunca inventar
una cifra» y «fallar cerrado y decirlo» rotas a la vez, en la pantalla que
CLAUDE.md nombra como el gasto que más pesa en un viaje.

Causa raíz probable: `acred` es la única de las seis lecturas del
`Promise.all` (`:128-135`) que no tiene rama de `null` propia en el render; su
`?? 0` se escribió al mismo tiempo que los dos `?? 0` legítimos de al lado y
heredó su forma sin heredar su condición.

---

### [MEDIO] El Cotizador es la única página de /dashboard fuera del sistema de tokens, y su `dark:` está cableado a una señal que la app dejó de honrar a propósito
`src/app/dashboard/cotizaciones/page.tsx:151, 154, 162, 172, 188, 210, 243-245,
253, 265, 271, 275, 289, 295, 298, 303, 312, 318, 329, 334` (30 clases de
paleta cruda; contra `src/app/globals.css:118-124` y `:125-153`)

Escenario: un barrido de `(text|bg|border)-(neutral|gray|zinc|slate|red|green|
amber|blue|emerald|yellow)-\d+` sobre todo `src/app/dashboard` devuelve **un
solo archivo**: éste, con 30 aciertos. Las otras ~30 páginas pintan con
`var(--muted)` / `var(--bad)` / `var(--badbg)`.

El detalle que lo hace romper en las dos direcciones: `globals.css:118-124`
BORRÓ el `@media (prefers-color-scheme: dark)` a propósito («ya no se disparan
solas») y dejó el tema en `:root[data-theme]`, que `selector-tema.tsx:26-30`
escribe. Pero esta página usa `dark:bg-neutral-800` (`:265, 312, 329, 334`), y
en Tailwind v4 sin `@custom-variant dark` —no hay ninguno: `globals.css:1` es
`@import "tailwindcss"` pelón y no existe `tailwind.config`— la variante `dark`
ES `@media (prefers-color-scheme: dark)`. Las dos señales quedaron desacopladas:

· **Contralor con el sistema operativo en claro que elige 🌙 «Oscuro» en el
sidebar.** `data-theme="dark"` → `--bg #09090b`, `--ink #f4f4f5`. `dark:` NO
dispara. El chip de estado de cada cotización (`:265`) queda
`background:#f5f5f5` (neutral-100) con el texto heredando `--ink` `#f4f4f5`
(`globals.css:194-196`): **contraste 1.00:1 — la palabra `BORRADOR` /
`ENVIADA` / `GANADA` desaparece.** Medido con la misma fórmula de
`contraste.test.ts:24-34`, sobre `--bg #09090b`: `text-neutral-500` (12 usos,
incluido el nombre del cliente y cada `— supuesto` del desglose) **4.20:1**, el
`<summary>` «Desglose citable (como se armó)» en `text-neutral-600`
(`:271`) **2.55:1**, «Falta: …» en `text-amber-700` (`:295`) **3.96:1** — los
tres reprueban AA 4.5:1, y el de 2.55 es el control que ABRE el desglose. El
banner de error `bg-red-50` (`:162`) es una lámina casi blanca (18.19:1 contra
el fondo) en una página negra.

· **El caso inverso, que es el DEFAULT.** `selector-tema.tsx:20` deja `claro`
como valor por omisión, así que un contralor que nunca tocó el selector pero
tiene macOS/Windows en oscuro —lo común— ve `data-theme="light"` y a la vez
`dark:bg-neutral-800` disparando: chips y botones `#262626` sobre la página
blanca.

Consecuencia: la pantalla que dice de sí misma «costos declarados, casetas
medidas en tus viajes liquidados, y **cada supuesto a la vista**» (`:155-157`)
es donde el supuesto deja de verse. Y es la pantalla del precio: se abre para
decidir si se acepta un flete.

Además, el guardia no puede verlo: `contraste.test.ts:19-22` lee `globals.css`
y mide tokens; un `#737373` hardcodeado en un `className` no está en ese
archivo. La única página que se salió del sistema de tokens es también la única
que se salió de la prueba que lo vigila.

Causa raíz probable: la página se escribió con la paleta por defecto de
Tailwind (0225) y no se migró a los tokens cuando el switch de tema se
construyó el 13-ago; los `dark:` que trae son de un supuesto de tema —media
query— que el producto abandonó por escrito.

---

### [MEDIO] En «Histórico», el Resumen afirma «Aún no hay viajes registrados» cuando lo que falló fue la consulta — y su gemelo de tres líneas arriba sí distingue
`src/app/dashboard/inicio-contenido.tsx:711` (efecto en
`src/app/dashboard/actividad.tsx:53, 59`; el gemelo honesto es
`actividad.tsx:39-47`)

Escenario: `getViajesPorMes(tenantId)` falla. `safe()` (`:44-46`) la resuelve a
`null` — correcto. Pero el llamador la colapsa: `porMes={viajesPorMes ?? []}`,
y `PanelPeriodo` la recibe tipada `Array<…>` sin `| null`
(`panel-periodo.tsx:41`). El contralor pulsa «Histórico» en el selector y
`actividad.tsx:53` evalúa `[].every(d => d.valor === 0)` → `true`, así que la
línea 59 pinta, centrada en la tarjeta «Actividad»:

> **Aún no hay viajes registrados.**

Entra: una flota con 1,800 viajes en 14 meses y una RPC caída → sale una
afirmación categórica sobre su negocio, sin «en este periodo» siquiera.

**El guardarraíl que sí existe, y por qué no alcanza:** `viajesPorMes` está en
`secundarias` de `estadoPanel` (`estado.ts:32`, llamado desde
`inicio-contenido.tsx:562`), así que arriba de la página aparece la banda ámbar
«Faltan datos por cargar — esta pantalla está incompleta» (`:583-590`). Eso
baja la severidad, no la borra: la banda vive arriba del todo y la frase está
abajo, dentro de una pestaña que hay que pulsar, y las dos se leen a la vez
como «está incompleta, pero de viajes no hay ninguno».

Lo delata su propio vecino: en el MISMO componente, `porDia` se recibe
`DiaViajes[] | null`, la línea 39 lo intercepta y dice «No se pudo cargar esta
gráfica», con el razonamiento escrito en `:32-34` («`null` = la lectura falló;
se dice, en vez de dibujar una gráfica en ceros que se lee como una flota
parada»). La rama de Histórico es la única de las tres del selector sin esa
distinción.

Causa raíz probable: `porDia` se endureció en FE-5 (22-ago) y `porMes` —la
serie vieja, que ya existía— no se llevó al mismo contrato; el `?? []` del call
site oculta que el tipo del prop nunca se abrió a `null`.

---

### [MEDIO] Los ‹ › que cambian el periodo de las tarjetas de dinero del Resumen miden 16×16 px con 2 px de separación
`src/app/dashboard/kpi-periodo.tsx:10` (`BOTON = 'w-4 h-4 …'`), botones en
`:78-85`, montados en `src/app/dashboard/inicio-contenido.tsx:606-609`;
contenedor `flex items-center gap-0.5` (`:77`) y `StatCard` los inserta sin
padding propio (`src/app/admin/ui/kit.tsx:149`)

Escenario: en el Resumen del dueño hay dos tarjetas con flechas —«Gasto total»
y «Costo por viaje»—, cuatro objetivos táctiles en total. Cada uno es
`w-4 h-4` = **16×16 CSS px**; `gap-0.5` = **2 px**, de modo que los centros de
‹ y › quedan a **18 px**. WCAG 2.2 SC 2.5.8 (AA) pide 24×24, o bien que un
círculo de 24 px centrado en cada objetivo no toque el del vecino: aquí falla
por los dos lados, y ninguna excepción aplica (no son controles «en línea»
dentro de una oración, no los dibuja el user agent, no son esenciales — el
mismo cambio de periodo se hace con el pill de 24 px de altura de
`panel-periodo.tsx:69-73`).

Entra: el contralor en una laptop táctil, o el dueño en la tablet de la oficina,
quiere ver «Costo por viaje — histórico» → sale: pulsa entre las dos flechas y
no pasa nada, o pulsa ‹ creyendo pulsar › y la tarjeta se va al periodo
contrario sin que él lo note (no hay más señal del cambio que el sufijo del
rótulo, `kpi-periodo.tsx:66`).

Consecuencia: la cifra que ve el comprador puede no ser la del periodo que él
cree haber pedido, en la primera pantalla del producto. Y para quien navega con
teclado el problema no existe —los botones son `<button>` con `aria-label`
correcto (`:78, 82`)—, lo que confirma que es un defecto de tamaño, no de
semántica.

La 22 vio estos 16×16 y no los reportó «sin medir el espaciado real»; el
espaciado es `gap-0.5` y está medido aquí. El vecino `selector-tema.tsx:73` va
en `w-6 h-6` = 24 px y sí cumple: la talla correcta ya se usa en el repo.

## Reincidentes de la 22 — verificados abiertos hoy, sin re-argumentar

La 22 arregló solo su ALTO. Los seis restantes siguen palabra por palabra en el
código (los abrí uno a uno):

- **[MEDIO] `consultar_carta_porte` y `consultar_normas` salen como jerga cruda
  en la secuencia de pensamiento del chat del cliente.** `chat.tsx:44-56` sigue
  rotulando 11 tools; `analista.ts:42-47` sigue declarando 12 de lectura + la
  terminal. Sin prueba que los compare.
- **[MEDIO] La cartera de Rentabilidad afirma «aún no hay facturas emitidas» en
  cualquier página vacía.** `rentabilidad/vista.tsx:113` sigue gateando por
  `cobranza.facturas.length === 0` en vez de `cobranza.total`.
- **[MEDIO] El script anti-parpadeo del tema solo corre en `/dashboard`.**
  `layout.tsx:52` sigue con `location.pathname.indexOf('/dashboard')!==0`, y
  `SelectorTema` sigue montado en `admin/sidebar-nav.tsx`.
- **[MEDIO] En el Registro de Viajes la dirección de la diferencia la lleva solo
  el color.** `viajes/vista.tsx:224` sigue imprimiendo `mxn(Math.abs(...))` con
  la distinción en `--warn`/`--bad` y la leyenda en el `tfoot` (`:250-252`).
- **[MEDIO] «Tasa de cuadre 0%» sin gatear por `viajesLiquidados`.**
  `agentes/liquidacion/vista.tsx:173`, idéntico.
- **[BAJO] Categoría y prioridad del ticket crudas.** `soporte/page.tsx:246-247`,
  idéntico.
- **[BAJO] `hour12: false` sin `hourCycle` en las dos pantallas de jornada.**
  `jornada/formas.tsx:68-72` y `jornada/vista.tsx`, idénticos.

## Lo que revisé y está bien

**FE-1, verificado línea por línea (es lo que justificaba subir):**
`facturacion/page.tsx:87-104` — `let clientes: … | null = null`, `if (error) {
clientes = null }` y el `catch` también a `null`; `vista.tsx:25` lo declara
`| null`; `forma.tsx:106-116` pinta «Tu catálogo de clientes no se pudo leer»
en `--bad` («no registres la factura a ciegas») separado de «No tienes clientes
dados de alta» en `--warn`. Cerrado bien, y el `--bad` en vez de `--warn` es la
decisión correcta: no es tarea del contralor, es el sistema confesando.

**El barrido que la tarea pedía — el mismo patrón en las otras ~31 páginas.**
Busqué `if (!error && data)`, `catch → []` y `?? []` sobre lecturas que pueden
caer, en todo `src/app/dashboard` y `src/app/admin`. Los sospechosos salieron
limpios y varios con el razonamiento escrito:
`facturacion/estadias.tsx:133` (`if (c.error || g.error) throw`),
`mapa/page.tsx:59` («sin catch: un mapa vacío afirma "no hay nada en la
carretera"»), `timbrado/page.tsx:42-72` (tres estados: no leí / nada en la cola
/ N en la cola), `llaves-api/page.tsx:48-55`, `sesiones-mcp/page.tsx:60-68`,
`carta-porte/page.tsx:35-43`, `usuarios/page.tsx:62-69`,
`agentes/facturas/page.tsx:132`, `agentes/conductores/page.tsx:52`,
`huerfanos/page.tsx:34-48` (`viajeSigueVivo` devuelve `boolean | null` y `null`
NO se toma por «no está vivo»), `conexiones/page.tsx:45-47` (primario sin catch
a propósito), `cotizaciones/page.tsx:160-165` («No es que no haya cotizaciones:
la lectura falló»), `combustible-casetas/page.tsx:74-77` (`safeConciliacion`
distingue «nunca mandó un consolidado» de «no se pudo leer» con `{ok:false}` —
la sutileza correcta). Los únicos dos que colapsan son los dos hallazgos de
arriba.

`inicio-operacion.tsx:316-334` merece mención aparte: acumula un arreglo
`ciegas` con las cinco fuentes de alerta que no cargaron y lo dice ANTES de la
banda, «es un fallo de lectura, no un "todo en orden"». Es el patrón que las
dos pantallas del hallazgo debían tener.

**El trabajo obligatorio — cada mapa literal del panel contra los tipos.**
Verifiqué los que la 22 no cerró y re-verifiqué los caros:
- `TipoDiferencia` → `agentes/liquidacion/rotulo-diferencia.ts:18`. Conté 43
  miembros del tipo contra 43 claves del `Record<TipoDiferencia, string>`:
  igualdad exacta. El `medio_pago_no_admitido` que entró con FIS-C3 llegó al
  panel el mismo día, y su rótulo («Medio de pago fuera de la LISR 27-III»)
  respeta la regla que costó `combustible_efectivo`: no dice «efectivo».
- Y llega bien al renglón: `medio_pago_no_admitido` está en `POR_CONFIRMAR`
  (`engine.ts:252`), que `[id]/vista.tsx:179, 208` importa del motor en vez de
  reconstruir — la fila sale «Por confirmar», no el genérico «Por revisar».
- `solicitud_arco.tipo` (4) → `dashboard/arco/page.tsx:17` y
  `admin/compliance/page.tsx:17`: los dos completos contra el CHECK
  `arco_tipo_dominio` (`0053_…sql:113`).
- `marca_jornada.tipo` (4) → `jornada/formas.tsx:74` == el CHECK de
  `0241_registro_jornada_lft.sql:218`.
- `PropuestaRutina['motivo']` (5) → `unidades/taller.tsx:34`, tipado contra la
  unión: no compila sin el rótulo.
- `Veredicto` / `Procedencia` de jornada → `jornada/vista.tsx` **importa**
  `ROTULO_VEREDICTO`, `ROTULO_PROCEDENCIA` y `ALCANCE_PROCEDENCIA` de
  `lib/likida/jornada/{riesgo,modelo}.ts` en vez de copiarlos.
- `FaseEpisodio` / `MotivoSinMonto` → `facturacion/estadias.tsx:39, 46`, los dos
  `Record<Union, string>`.
- Interruptores: comparé programáticamente `lib/likida/interruptores.ts` contra
  `admin/observabilidad/etiquetas.ts` — **60 ids, 60 rótulos, cero de sobra,
  cero faltantes.**
- Tools del copiloto de admin: `copiloto-tools.ts` declara 14 de lectura y
  `copiloto.ts:205` añade `proponer_accion` + `entregar_respuesta_admin` = 16;
  `admin/copiloto.tsx:81-97` rotula las 16. Sigue completo.
- Con fallback y dominio verificado: `reglas/vista.tsx:22` (`CanalAviso`, 2/2),
  `top-rutas.tsx:9` (7 regiones del catálogo de `analytics.ts:1132-1141`, y
  `colorDe` cae a `--muted` para «Sin clasificar»), `onboarding/chat.tsx:27`.

**Rutas y visibilidad.** Comparé programáticamente los 42 `href` de
`dashboard/rutas.ts` contra `AREA_POR_RUTA` de `lib/auth/visibilidad.ts`: cero
sin área (o sea, ningún link que el sidebar pinte y la página rebote). Y los 42
+ los 41 de `admin/rutas.ts` resuelven todos a un `page.tsx` real. Las dos
entradas de área sin item de sidebar (`/dashboard/contador`,
`/dashboard/integraciones`) son las deliberadas que la 22 ya documentó.

**El demo, ejecutado y no leído.** Corrí el motor real con los cuatro presets
de `demo/page.tsx:12-21` y la política de `api/demo/route.ts:19-27`: sale
`estatus: con_diferencias`, `totalComprobado 10,600`, `diferencia 0` y
**exactamente una** diferencia (`sobre_politica`, diésel $4,200 vs tope
$4,000). Los tres arreglos fiscales de la 22 —`medio_pago_no_admitido` incluido—
no metieron una observación nueva en el guion: los presets no traen `formaPago`
y ninguno pasa de $2,000 salvo el diésel, que no es el caso de la regla. El
contrato de `/api/demo` (`totalComprobado`, `totalAnticipo`, `diferencia`,
`diferencias[].{tipo,nota}`) coincide con lo que la página consume
(`demo/page.tsx:58-68`), y el `catch` de `:71-73` deja el demo con mensaje en
vez de colgado.

**El portal público de pago** (`/pago/[token]/page.tsx`, que la 22 no abrió):
los tres desenlaces están separados a propósito (`:95-137`) — token muerto,
«no pudimos consultar» y `no_cobrable` con textos distintos —; el saldo `null`
imprime «sin dato» y NO `$0.00` (`:177-181`), lo explica (`:188-193`) y **apaga
el formulario** (`:232-236`). `robots: noindex` y `referrer: no-referrer`
(`:48-52`). Es el mejor manejo de «no medí» del repo.

**Los otros cuatro estados en las pantallas que la 22 no abrió:**
`descarga-sat/bandeja/vista.tsx:333, 346` — los dos `?? 0` son inalcanzables
porque `truncada` y `historialTruncado` exigen `total !== null`
(`sat_descarga/bandeja.ts:301, 304`); `agentes/peajes/vista.tsx:82-89` deja las
cuatro KPI en `—` cuando `conciliacion` es `null`;
`clientes/vista.tsx:121-135` sustituye la tarjeta «Por cobrar» por un texto que
dice «No es cero: es que aún no se ha registrado una factura emitida»;
`admin/consumo/page.tsx:40-45, 71, 79` corta por secciones y dice cuál cayó.

**Higiene que sigue en pie:** cero `toLocaleString('es-MX')` fuera de
`lib/formato.ts`; `npx tsc --noEmit -p .` limpio; `npx eslint src/app` con **0
errores y 47 avisos** (46 son `detect-non-literal-fs-filename` en archivos de
prueba y 1 es el `no-img-element` deliberado). Ninguna tabla de
`src/app/dashboard` sin `overflow-x-auto` salvo dos casos de columnas cortas
que envuelven (`carta-porte/borrador/[viajeId]/page.tsx:95, 223`). Cero
`new Date()` / `Math.random()` en el cuerpo de render de un Client Component
—solo dentro de handlers y efectos— y `useCountUp` arranca en `valorFinal`
(`use-count-up.ts:32, 37-43`), así que no hay desajuste de hidratación por ahí.

## Lo que NO alcancé a revisar

- **Sigo sin mirar un render.** Igual que la 22: `npm run build` está prohibido
  esta ronda y no puedo escribir un preview temporal, así que todo lo anterior
  es lectura de fuente y aritmética de contraste. Los tres números del hallazgo
  del Cotizador (1.00:1, 4.20:1, 2.55:1) están calculados con la fórmula de
  `contraste.test.ts`, no vistos. **Merecen una captura antes de arreglar**, y
  el del chip invisible es el que más.
- **Responsive de verdad:** no abrí ninguna de las ~31 páginas a 390 px. El
  `viewport` está (`layout.tsx:44`) y las tablas anchas van envueltas, pero eso
  no es haberlo visto.
- **El resto de las áreas de toque.** Medí `kpi-periodo`; no barrí los demás
  `w-4`/`w-5` del panel ni los de `/admin`, ni el orden de foco de ninguna
  pantalla.
- **`/admin` a fondo.** Revisé por muestreo: `consumo`, `copiloto`,
  `observabilidad/etiquetas`, `compliance`, `tu-turno`, `salud-sistema`. Los
  mapas `Record<string,string>` de `mapa-prospectos`, `qa`, `crons`, `evals`,
  `marketing` y `vendedores` no los comparé contra sus dominios — son ~60
  pantallas y el comprador no ve ninguna.
- **Estados de CARGA.** No rastreé qué páginas tienen `Suspense` con esqueleto
  del alto correcto y cuáles brincan; solo vi los de `inicio-contenido.tsx`
  (`EsqMotorFiscal`, `EsqTabla`) y que llevan `role="status" aria-label`.
- **`prefers-reduced-motion`.** `usePrefersReducedMotion` alimenta a
  `useCountUp` en las dos tarjetas de dinero; no verifiqué su snapshot de
  servidor ni si el count-up respeta el ajuste en la primera pintura.
- **`/vendedor`, `/cuenta`, `/mcp/autorizar`, `/aviso/[tenant]`** — abiertos
  solo lo suficiente para saber que existen.
