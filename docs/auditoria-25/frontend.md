# Frontend — auditoría 25

**Nota: 5/10** (antes 6). Razón del movimiento: **mirada más profunda** — el
código del rubro no cambió (los 7 commits desde la 24 tocaron `/admin/agentes`,
`utils.ts` y backend; lo demás del panel está igual carácter por carácter), pero
la nota anterior no contaba dos defectos **medibles** que estaban ahí desde antes
y que la 24 no midió porque sus dos barridos no los alcanzan: el contraste de la
columna «Región» del Resumen (hex en línea, invisible para `contraste.test.ts`,
que solo lee `globals.css`, y para el barrido de clases Tailwind, que solo mira
`className`) y un tile fiscal que afirma «sin comprobantes» cuando lo que falló
fue la consulta. A eso se suma que **por tercera ronda consecutiva no se cerró
uno solo** de los abiertos: los 13 que traía la 24 —el ALTO del Cotizador
incluido— siguen palabra por palabra.

Lo que sí mejoró y hay que decirlo: la rama de esta ronda **no metió deuda
nueva** en el rubro (a diferencia de la 24, que empeoró dos hallazgos con su
propio trabajo), y el retiro de `cn()`/`clsx`/`tailwind-merge` quedó limpio.

**Riesgo mayor de hoy:** sigue siendo el mismo del 6 de agosto — un contralor con
el SO en oscuro que nunca tocó el 🌙 abre el Cotizador y el chip que dice si la
cotización está en BORRADOR, ENVIADA o GANADA mide **1.24:1**. Nadie lo tocó en
un mes.

## Hallazgos

### [MEDIO] La columna «Región» del Resumen se pinta con hex fijos sobre un tinte del 12 %: reprueba AA en el tema por omisión y se apaga entero en oscuro
`src/app/dashboard/top-rutas.tsx:9-12` (el mapa), `:14-16` (`colorDe`) y
`:47-51` (la píldora), montada en `src/app/dashboard/panel-periodo.tsx:146`
dentro de un `.card` (`src/app/globals.css:209-211`, `background: var(--surface)`)

Escenario, con valores y sin tocar ningún ajuste:

La píldora se pinta `color: <hex>` sobre `background: color-mix(in srgb, <hex>
12%, transparent)` — o sea el MISMO tono al 12 % sobre el fondo de la tarjeta.
El texto es `text-xs font-medium` (12 px): AA pide **4.5:1**, no 3:1. Medido con
la fórmula de luminancia WCAG (la misma de `contraste.test.ts:24-34`), con el
fondo compuesto resuelto:

| Región | sobre `--surface` claro `#ffffff` | sobre `--surface` oscuro `#131316` |
|---|---|---|
| Golfo `#0891b2` | **3.20:1** | **4.43:1** |
| Sureste `#b45309` | **4.25:1** | **3.35:1** |
| Noreste `#15803d` | **4.27:1** | **3.35:1** |
| Centro `#c2410c` | **4.35:1** | **3.27:1** |
| Noroeste `#7c3aed` | 4.75:1 | **2.98:1** |
| Occidente `#0369a1` | 4.98:1 | **2.88:1** |
| Sur `#be123c` | 5.12:1 | **2.79:1** |

Entra: el contralor abre `/dashboard` (la PRIMERA pantalla del producto) y baja a
«Top rutas por gasto» — una flota del Bajío con rutas a Tampico y Veracruz →
sale, en el tema claro por omisión, la píldora **Golfo a 3.20:1**, y otras tres
por debajo de 4.5:1. Si además eligió el tema oscuro con el 🌙 del sidebar (o
«sistema» con el SO en oscuro, que sí resuelve a `data-theme="dark"` —
`selector-tema.tsx:26-29`), **las siete** caen entre 2.79:1 y 4.43:1, y cinco de
ellas por debajo de 3:1, que es el umbral de texto GRANDE.

Por qué no lo vio nadie —y esto es lo que lo hace hallazgo de esta ronda y no de
la 24—: `contraste.test.ts:19-22` lee `globals.css` y mide TOKENS; estos siete
colores son literales dentro de un `Record` en un `.tsx`. Y el barrido de la 24
buscaba clases `(text|bg|border)-(neutral|gray|…)-\d+` en `className`; esto va en
`style={{}}`. Es la única superficie del panel que pinta color con hex propio:
barrí `#[0-9a-f]{6}` en todo `src/app/dashboard` y devuelve **exactamente estas
dos líneas**. El resto del panel usa tokens, y los tokens sí están medidos y
pasan (`--ok/--okbg` 4.83:1 claro, 8.75:1 oscuro; `--bad/--badbg` 5.56 / 6.21;
`--warn/--warnbg` 4.87 / 9.32).

Consecuencia: la columna que dice a qué región se le va el gasto —la que el
contralor usa para decidir dónde tiene el problema— se lee a medias en el tema
por omisión y no se lee en oscuro. Y el guardarraíl que existe no puede verlo:
el token nuevo que alguien agregue mañana sí lo mide la prueba, un hex en línea
no.

Causa raíz probable: el comentario de `:3-8` justifica bien POR QUÉ hay siete
colores (la región es categoría, no magnitud) y se detuvo ahí: se eligieron los
`-600/-700` de Tailwind por su nombre, sin medirlos contra el fondo real ni
declararlos como tokens con pareja clara/oscura.

---

### [MEDIO] El tile «Sin CFDI» afirma «Sin comprobantes de estos conceptos todavía» cuando lo que falló fue su consulta — y se contradice con el tile de al lado
`src/app/dashboard/combustible-casetas/page.tsx:176-178` (el colapso) y
`:232-234` (lo que se pinta), contra el hermano corregido en `:224-231`

Escenario, con valores: la página lanza **seis lecturas independientes**, cada
una con su propio `safe()` (`:147-154`). `porConcepto` (el gasto histórico por
concepto) y `docs` (`getDocumentos(tenantId, 100)`) son dos consultas distintas.
El gate de toda la grilla es `porConcepto === null` (`:204`), así que si
`getDocumentos` truena sola —un `statement timeout` de PostgREST sobre `gasto`
con 300k filas del mes, o la policy de la 0292 sin cubrir la tabla— se entra
igual a la grilla con `docs === null`:

- `:176` — `docs?.filter(...) ?? []` → `combustibleYCasetas = []`
- `:178` — `pctSinCfdi = null` (la rama del `.length > 0`)
- `:233` — `vacio="Sin comprobantes de estos conceptos todavía"`

Entra: flota con 340 cargas de diésel registradas y la lectura de documentos
caída → sale, en la misma fila de cuatro tiles:

> **$1,284,300.00** — Gastado en combustible · *histórico · 340 cargas
> registradas*  … **—** — Sin CFDI (combustible y casetas) · *Sin comprobantes de
> estos conceptos todavía*

Dos tiles pegados que se contradicen: uno cuenta 340 cargas y el de junto afirma
que no hay ni un comprobante de ese concepto.

Que es descuido y no decisión lo prueba la propia página, dos veces:
- El tile VECINO (`:224-231`) es exactamente este defecto ya corregido —el ALTO
  A23— y su comentario lo dice: «era `acred?.litrosDiesel ?? 0`… una lectura
  caída se pintaba como "0 litros elegibles"». El arreglo distinguió
  `acred === null` de «no hay» con `vacio='No se pudo leer lo acreditable'`. El
  tile de al lado quedó con el `?? []` intacto.
- La sección de abajo SÍ distingue: `:262-263` es `anomalias === null ? 'No se pudo
  revisar.' : …`. Es la misma página, el mismo patrón, aplicado a una lectura y
  no a la otra.

Consecuencia: «qué tanto de mi combustible está facturado» es la cifra por la que
esta pantalla existe —el porcentaje de deducible que se pierde—, y una consulta
caída se le presenta al contador como un hecho medido sobre su flota. No es la
cifra la que se inventa (el encabezado sí pinta «—»): es la EXPLICACIÓN, que es
categóricamente falsa y apunta al lado contrario de la conducta correcta.

Causa raíz probable: el `?? []` de `:176` se escribió para poder filtrar sin
comprobar, y el `pctSinCfdi === null` quedó sirviendo a DOS significados
distintos («no hay comprobantes» y «no se pudo leer») con un solo mensaje.

---

### [MEDIO] Si el conteo de escalados o de huérfanos se cae, el Resumen borra la alerta y tampoco enciende la banda de «pantalla incompleta»
`src/app/dashboard/inicio-contenido.tsx:150-151` (las lecturas),
`:497-508` (las alertas) y `:559-563` (lo que `estadoPanel` vigila), contra
`src/app/dashboard/estado.ts:26-33`

Escenario, con valores: `contarEscalados` y `contarHuerfanosPendientes` fallan
**cerrado en la capa de datos** —devuelven `null` y loguean
(`analytics.ts:989-992`, `repo.ts:662-665`)—, que es correcto. Lo que hace la
pantalla con ese `null` no lo es:

1. `:497` y `:503` gatean con `!== null && > 0`, así que el renglón de alerta
   simplemente **no se pinta**; y `:515` (`alertas.length === 0 → return null`)
   borra el bloque entero sin decir nada.
2. `estadoPanel` (`:559-563`) declara sus `secundarias` con siete lecturas —las
   que existían cuando se cerró el hallazgo A13— y **ni `escalados` ni
   `huerfanos` están en la lista**. Tampoco `viajesPorDia`,
   `resumenPerdidasSeries`, `gastosFiscalesSeries` ni `pasos`, agregadas después.

Entra: flota con **12 viajes escalados sin chofer que acepte** y `viaje` con el
índice de `escalado_en` en reconstrucción → la consulta con `count: 'exact'`
devuelve error, `safe()` la vuelve `null` → sale un Resumen **idéntico, píxel por
píxel, al de una flota con cero escalados**: sin el renglón ámbar «12 viajes
escalados sin chofer que acepte — se resuelve en Despacho», y sin la banda de
`:581-584` que diría que la pantalla está incompleta.

Lo que separa esto de las otras lecturas del mismo archivo: las secundarias
registradas tienen ADEMÁS honestidad local (`panel-periodo.tsx:86` y `:114`
dicen «No se pudo cargar esta gráfica»; `motor-fiscal-periodo.tsx:40` dice «No se
pudo leer el motor fiscal»). Estos dos conteos no tienen ninguna de las dos
cosas: ni renglón, ni banda. Son las únicas dos lecturas de la página que
desaparecen en silencio absoluto.

Consecuencia: 12 viajes parados sin chofer son 12 fletes que no salen, y la
pantalla que existe para gritarlo se calla. Para quien mantenga esto, el patrón
es el que el propio archivo ya documentó una vez (A13, `estado.ts:20-25`): la
lista de `secundarias` es manual y nada obliga a que una lectura nueva entre en
ella — la tercera lectura que se agregue va a repetirlo.

---

### [BAJO] El badge de rol del sidebar dice ser «el dominio REAL de `app_user.rol`» y cita una migración que dos migraciones posteriores ya corrigieron
`src/app/dashboard/chrome.tsx:21-31`

Escenario: el comentario afirma «Las cinco claves son el dominio REAL de
`app_user.rol` (`0044_rol_encargado.sql:23`)». El dominio vivo es
**superadmin, flota_admin, contador, encargado, vendedor**: la 0086 retiró
`operador` y la 0105 metió `vendedor`. El mapa carga la clave muerta
(`operador: 'OPERADOR'`, `:29`) y le falta `vendedor`. En pantalla no se rompe
—`ROL_BADGE[rol] ?? rol.toUpperCase()` (`:104`) manda un `vendedor` a
«VENDEDOR»—, así que esto es deuda, no defecto visible.

Consecuencia: es para el que mantiene. El comentario es una afirmación de
completitud verificada que ya no es cierta, y `admin/equipo/page.tsx:12-22`
—que sí está tipado `Record<RolAppUser, …>` y sí enumera los cinco vivos con la
historia correcta de migraciones— demuestra que la forma correcta ya existe en
el repo. Cae del mismo árbol que el MEDIO de rótulos de rol de abajo.

---

## Reincidentes verificados abiertos, sin re-argumentar

Los abrí uno por uno en `4f94490`; ninguno se tocó desde la 24.

- **[ALTO] FE-13b — el chip de estado del Cotizador a 1.24:1 y «Crear viaje» a
  2.76:1 al hover, en el tema POR OMISIÓN con el SO en oscuro.** Las cuatro
  clases `dark:` siguen exactamente donde estaban (`cotizaciones/page.tsx:274`,
  `cotizaciones/acciones.tsx:27-28` — son las **únicas cuatro** `dark:` de todo
  `src/app`, lo verifiqué con grep). Las tres premisas siguen en pie:
  `globals.css:1` es `@import "tailwindcss"` pelón, no hay `@custom-variant dark`
  en ningún `.css` del repo ni `tailwind.config.*` (en Tailwind v4 eso hace que
  `dark:` **sea** `@media (prefers-color-scheme: dark)`), `globals.css:118-124`
  borró ese media query a propósito, y `selector-tema.tsx:20` deja **`claro`**
  por omisión. Es el hallazgo que costó la nota en la 24 y sigue intacto.
- **[MEDIO] Los tres pills de la cola de revisión piden `--ok-bg` / `--bad-bg` /
  `--warn-bg`, que no existen.** `cola.tsx:49-52` sigue con el guion; los tokens
  reales son `--okbg`/`--warnbg`/`--badbg` (`globals.css:111-118` y `:147-149`).
  Se pintan en `cola.tsx:258-259` (`style={{ color: e.fg, background: e.bg }}`) →
  *invalid at computed-value time* → fondo transparente en los tres estados
  válidos, mientras el fallback del estatus DESCONOCIDO (`:244`) sí usa un token
  real y conserva su píldora.
- **[MEDIO] Los rótulos de rol siguen divergiendo, y hay una copia MÁS de la que
  contó la 24.** `lib/auth/roles.ts:26` dice «Dueño de la flota»;
  `dashboard/mi-perfil/page.tsx:18-24`, `dashboard/sesiones-mcp/vista.tsx:19-23`
  y `admin/equipo/page.tsx:16-22` dicen «Dueño / Admin de flota»;
  `dashboard/chrome.tsx:27` dice «ADMIN FLOTA»;
  `agentes/notificaciones-forma.tsx:45-49` llama `encargado` «Jefe de tráfico» a
  secas. La sexta copia que la 24 no nombró: **`admin/mi-perfil/page.tsx:10`**,
  con `operador: 'Operador / Chofer'` y sin `vendedor`.
- **[MEDIO] El mensaje crudo del servidor llega a pantalla en tres páginas.**
  `conversaciones/page.tsx:51` (`errorCarga = e.message`, pintado en `:90`),
  `arco/page.tsx:158` (pintado en `:202`) y `mapa/vista.tsx:121`. Barrí de nuevo
  `e instanceof Error ? e.message` en `src/app/dashboard` y `src/app/admin`:
  todas las demás van a `logger` o pasan por `mensajeParaPantalla`; estas tres
  siguen siendo las únicas que imprimen el crudo de PostgREST.
- **[MEDIO] La cartera de Rentabilidad afirma «Aún no hay facturas emitidas
  registradas» en una página vacía.** `rentabilidad/vista.tsx:114` sigue gateando
  por `cobranza.facturas.length === 0`, con el arreglo escrito y muerto en
  `:41-45`. Cuarta ronda abierto.
- **[MEDIO] Las ‹ › que cambian el periodo miden 16×16 px, y el par de la tarjeta
  FISCAL va con `gap-0`.** `kpi-periodo.tsx:10` (`BOTON = 'w-4 h-4 …'`, botones
  `:77-85`, contenedor `gap-0.5`) y `motor-fiscal-periodo.tsx:7` (mismo `w-4
  h-4`) con contenedor `flex items-center gap-0` en `:45`. WCAG 2.2 SC 2.5.8 pide
  24×24; el vecino `selector-tema.tsx:73` ya usa `w-6 h-6`.
- **[MEDIO] Los tres botones que firman una liquidación son radios `sr-only` sin
  anillo de foco.** `revision-panel.tsx:126-137`: el `<input type="radio"
  className="sr-only">` sigue en `:134` y el `<label>` sigue sin
  `has-[:focus-visible]` ni `peer-focus-visible`; `globals.css:356` solo define
  `:focus-visible` para `.sb-aside a/button`. WCAG 2.4.7.
- **[MEDIO] En «Histórico», la tarjeta Actividad afirma «Aún no hay viajes
  registrados» cuando lo que falló fue la consulta.** `inicio-contenido.tsx:711`
  sigue siendo `porMes={viajesPorMes ?? []}`, y `actividad.tsx:53` sigue
  evaluando `porMes.every(d => d.valor === 0)` sobre ese `[]`. El gemelo honesto
  (`porDia`, `:39-47`) sigue al lado. Tercera ronda.
- **[MEDIO] El script anti-parpadeo del tema solo corre en `/dashboard`.**
  `layout.tsx:52` sigue con `location.pathname.indexOf('/dashboard')!==0` y
  `SelectorTema` sigue montado en `admin/sidebar-nav.tsx:149`.
- **[MEDIO] En el Registro de Viajes la dirección de la diferencia la lleva solo
  el color.** `viajes/vista.tsx:222-225` sigue imprimiendo
  `mxn(Math.abs(v.diferencia))` con ámbar/rojo y la leyenda en el `tfoot`
  (`:249-254`).
- **[MEDIO] El chat rotula 11 tools y el analista declara 13.** `chat.tsx:44-55`
  contra `lib/agents/analista.ts:42-48` (`TOOLS_LECTURA`, 12) más
  `entregar_respuesta` (`:204`): faltan `consultar_carta_porte` y
  `consultar_normas`, que `chat.tsx:57` degrada a `t.replaceAll('_',' ')`.
- **[BAJO] Categoría y prioridad del ticket, crudas.** `soporte/page.tsx:252-253`
  sigue imprimiendo `t.categoria` y `t.prioridad` sin mapa, contra
  `('facturacion','operacion','tecnico','cuenta','otro')` y
  `('baja','media','alta','urgente')` (`0051:42-43`).
- **[BAJO] `cotizaciones/page.tsx:274` imprime `q.estado` crudo en mayúsculas**,
  contra el dominio `('borrador','enviada','ganada','perdida','vencida')`
  (`0051:95`).

## Lo que revisé y está bien

**Lo nuevo de esta ronda, verificado contra el código y no contra el asunto del
commit:**

- **`aa5304d` (retiro de `cn()`/`clsx`/`tailwind-merge`) quedó limpio.**
  `src/lib/utils.ts` es hoy cuatro líneas que reexportan de `formato.ts`; grep de
  `cn(`, `clsx`, `twMerge` y `tailwind-merge` en todo `src/` devuelve **cero
  usos** (solo tres comentarios históricos que los nombran: `lib/formato.ts:5,11`,
  `dashboard/formato.ts:19-20`, `lib/utils_fecha.test.ts:56-58`), y ninguna de las
  paquetería vive ya en `package.json`. Los 15 consumidores de `@/lib/utils`
  importan `usd`/`mxn`/`numero`/`fechaMx`, que siguen exportados. Nada roto.
- **`5180c72` — el badge `experimental` de `/admin/agentes` está bien puesto.**
  `admin/agentes/contenido.tsx:129-137`: la píldora nueva convive con
  `PILL_ESTADO[a.estado] ?? 'neutral'` en vez de sustituirla (un `vivo`
  experimental sigue leyéndose «vivo» + «Experimental», que es la verdad), usa
  `StatusPill` con tokens auditados, y `PILL_ESTADO` (`:81-83`) cubre 4/4 el
  dominio de `EstadoAgente` (`definiciones.ts:39-45`). Toda la tabla degrada por
  celda: `corridas` guarda `'error'` como valor propio (`:107-110`) y cada
  columna pinta «No se pudo leer» en SU celda (`:141`, `:159`, `:172`, `:182`,
  `:194`) — ninguna se cae a 0.

**El trabajo obligatorio — cada mapa literal del panel contra su dominio.**
Los que derivan del tipo y no compilan si el tipo crece: `ROTULO_DIFERENCIA`
(`rotulo-diferencia.ts:18`) — lo conté por script contra `types/likida.ts:94-138`:
**43 = 43, sin faltantes ni sobrantes**; `ROTULO_REVISION`/`ROTULO_VACIO`
(`cola.tsx:33,42`, `Record<RevisionLiquidacion,…>`); `ROTULO_FASE`/
`ROTULO_SIN_MONTO` (`facturacion/estadias.tsx:40,47`); `ROTULO_FILTRO`
(`viajes/vista.tsx:37`); `ETIQUETA_MODO` (`kpi-periodo.tsx:14`,
`motor-fiscal-periodo.tsx:11`); `ROL_LABEL` de `admin/equipo/page.tsx:16`
(`Record<RolAppUser,…>`, 5/5 con el dominio vivo); `RUTA`/`OFICIO`
(`admin/crons/vista.tsx:33,48`); `COLAS` (`descarga-sat/bandeja/vista.tsx:45`,
`Record<EstatusCfdi,…>`); `MOTIVO` (`huerfanos/vista.tsx:12`); `EVENTO`
(`agentes/conductores/vista.tsx:21`); `PILL_TARIFA` (`clientes/vista.tsx:352`).

Los `Record<string, …>` que comparé a mano contra su dominio SQL o su unión, y
salieron **completos**: `ESTATUS` (`dashboard/estatus.ts:17`) 3/3 contra
`EstatusLiquidacion`; `PILL_ESTATUS` de `resumen-visual.tsx:103` y de
`viajes/vista.tsx:31` 3/3 contra el constraint `viaje_estatus_dominio`;
`ESTATUS` de `agentes/liquidacion/vista.tsx:432` y `ROTULO_ESTADO` de
`cola.tsx:49` 3/3 (los rótulos sí; los tokens de fondo del segundo son el
reincidente); `TONO` (`jornada/vista.tsx:49`) 4/4 contra `Veredicto`
(`lib/likida/jornada/riesgo.ts:45-53`); `ROTULO_TIPO` (`jornada/formas.tsx:74`)
4/4 contra el check de `0241:218`; `ETIQUETA_TIPO` (`arco/page.tsx:19` y
`admin/compliance/page.tsx:18`) 4/4 y `PILL_ARCO` 4/4 contra `0053:113-114`;
`PILL_SEVERIDAD` (`admin/trust-safety/page.tsx:41`) 3/3 contra `0133:28`;
`MOTIVO_ERROR` (`combustible-casetas/page.tsx:32`) 5/5 contra
`ResultadoResolverLinea.motivo`; `ROTULO_AREA` de `mcp/autorizar/page.tsx:98`
3/3 contra `Area`, y su gemelo de `llaves-api/vista.tsx:14` deriva de
`AREAS_DE_LLAVE` con `Object.fromEntries` (los dos coinciden). `PILL_ESTATUS` de
`facturacion/vista.tsx:327` cubre solo `borrador`/`cancelada` de las cuatro de
`0049:48` **a propósito** y no es un hueco: `:406` solo pinta la píldora si
existe, y `emitida`/`pagada` son el caso normal que no lleva marca.

**Todas las rutas del panel tienen dueño.** Enumeré los 46 `page.tsx` bajo
`src/app/dashboard` y los crucé contra `AREA_POR_RUTA`
(`lib/auth/visibilidad.ts:76-260`): **las 43 estáticas están declaradas**, y las
tres dinámicas (`[id]`, `carta-porte/borrador/[viajeId]`, `timbrado/[viajeId]`)
gatean a mano contra la llave de su padre, como dice el comentario. El sidebar
filtra con la MISMA función que gatea la página (`sidebar-nav.tsx:116`), así que
no hay link que exista y rebote.

**Los tokens de color, medidos.** Calculé los pares que de verdad se pintan en
los dos temas: `--ok/--okbg` 4.83 claro y 8.75 oscuro; `--warn/--warnbg` 4.87 /
9.32; `--bad/--badbg` 5.56 / 6.21; sobre `--surface`, 5.43/5.38/6.47 claro y
10.64/11.11/6.70 oscuro; `--muted` 5.60 claro y 7.97 sobre `--canvas` oscuro;
`--faint` 6.47 oscuro. Todos por encima de 4.5:1. `StatusPill`
(`admin/ui/kit.tsx:263-268`) —la píldora que usan las dos consolas— sale de esos
tokens, así que hereda la medición. Los únicos colores del panel FUERA del
sistema de tokens siguen siendo tres sitios: el Cotizador (reincidente), los
tres nombres mal escritos de `cola.tsx` (reincidente) y `top-rutas.tsx`
(hallazgo propio).

**Las redes de error.** `dashboard/error.tsx`, `admin/error.tsx` y
`global-error.tsx` pintan el `digest` en pantalla `select-all` y lo escriben al
logger; el global reemplaza el `<html>` con estilos EN LÍNEA y hex literales
—correcto: si se pinta es porque el layout raíz murió y `globals.css` puede no
haber llegado, y un `var(--ink)` ahí saldría negro sobre negro.

**Fallar cerrado, en las pantallas que sí lo hacen.** `soporte/page.tsx:190-197`
(«No se pudo leer la cola. La consulta falló — no es que no haya tickets»);
`operadores/page.tsx:89-99` y `:196` (`ilegible={registro === null}`, y el «N de
M» del pie se niega a afirmar el total cuando `conteos` no respondió);
`jornada/vista.tsx:88-105` (los cuatro contadores son `null`, no ceros, cuando
`filas === null`, con el razonamiento escrito); `inicio-operacion.tsx:520-521`
(«No se pudo leer los viajes»); `combustible-casetas/page.tsx:204`, `:262` y `:294`. Y el portal público `/pago/[token]` es el mejor ejemplo del repo: tres
desenlaces distintos a propósito (`page.tsx:93-133`) y el saldo que dice «sin
dato» y jamás `$0.00`.

**Formato de cifras.** Cero `toLocaleString` / `Intl.NumberFormat` en todo
`src/app` fuera de `lib/formato.ts` y comentarios; los únicos `toFixed` que
quedan son coordenadas de SVG y lat/lng (`mapa/vista.tsx:186`), no dinero. Ningún
`$` armado a mano en template string. `mxnCompacto` (`formato.ts:220`) solo se
usa en un KPI rotulado «histórico» (`agentes/liquidacion/vista.tsx:177`) y por
debajo de un millón devuelve idéntico a `mxn()`.

**Rejillas y anchos.** Ningún `grid-cols-≥3` sin prefijo responsive en
`src/app/dashboard` (los dos que hay son `grid-cols-2`, que cabe a 390 px), y el
`min-w-` más grande del panel es 260 px — el ancho útil a 390 px con el rail de
72 px es ~270 px, así que ninguno desborda.

**Y una premisa del encargo que ya no es cierta, dicha para que no se herede:**
«el panel no tiene lint ni prueba» estaba desactualizado. `eslint.config.mjs` no
excluye `src/app` (solo `.next`, `node_modules`, `supabase`, `.claude`), y hay
**173 archivos de prueba dentro de `src/app`**, incluidos render tests con
fixtures (`panel-periodo.test.tsx`, `cola_render.test.tsx`,
`chrome_movil.test.tsx`, `catalogo-render.test.tsx`, `revision_panel.test.tsx`).
El modo de falla dominante del rubro ya no es «no hay prueba»: es **qué mide la
prueba que sí existe** — `contraste.test.ts` es exactamente eso, un guardarraíl
real cuyo alcance (solo `globals.css`) deja fuera los tres sitios donde el color
se escribe a mano.

## Lo que NO alcancé a revisar

- **Sigo sin mirar un render.** `npm run build` está prohibido y no hay
  credenciales para levantar un preview: TODO lo de arriba es lectura de fuente
  y aritmética. Los contrastes (3.20:1, 2.79:1, 1.24:1) están CALCULADOS con la
  fórmula de luminancia WCAG sobre el fondo compuesto, no vistos; el fondo
  transparente de `cola.tsx` está deducido de la regla CSS, no capturado. Los
  tres merecen una captura antes de arreglarse.
- **Responsive de verdad.** No abrí ninguna de las ~46 páginas a 390 px. Lo que
  medí es aritmética de anchos declarados (rejillas, `min-w-`, el rail de 72 px
  de `marco.ts:22`); eso no es haberlo visto. En particular no vi el Cotizador ni
  la cola de revisión en celular, que son las dos pantallas con más columnas.
- **Estados de CARGA.** Miré `bloque.tsx:51` (el único `Suspense` con `fallback`
  del panel, con esqueletos de alto declarado) y los `EsqSeccion`/`Barra` de
  `agentes/liquidacion/vista.tsx:96-108`, pero no rastreé página por página
  cuáles brincan de alto al aterrizar. `dashboard/loading.tsx` y
  `[id]/loading.tsx` son un reexport de `cargando.tsx` que no abrí.
- **`/admin` a fondo.** Verifiqué los mapas de `agentes`, `compliance`,
  `trust-safety`, `equipo`, `crons` y `mi-perfil`. Los `Record<string,string>` de
  `mapa-prospectos`, `qa`, `evals`, `marketing`, `vendedores`,
  `costos-facturacion`, `observabilidad`, `consola` y `analitica` NO los comparé
  contra sus dominios — son ~60 pantallas y el comprador no ve ninguna. Tampoco
  medí las áreas de toque de `/admin` (`mapa-actividad.tsx:32` va en 11×11 px).
- **El orden de foco** de ninguna pantalla, ni la navegación por teclado del
  acordeón del sidebar (`sidebar-nav.tsx:57-66`).
- **`/vendedor`, `/cuenta`, `/aviso/[tenant]`, `/blog`, `/calculadora`,
  `/legal`** — solo lo suficiente para saber que existen. `/mcp/autorizar` y
  `/pago/[token]` sí los abrí, pero solo el camino de lectura.
- **No corrí ninguna prueba.** Toda la verificación es lectura del árbol en
  `4f94490` y aritmética hecha aquí.
