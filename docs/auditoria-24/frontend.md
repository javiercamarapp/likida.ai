# Frontend — auditoría 24

**Nota: 6/10** (antes 7). Razón del movimiento: **deuda que cobró factura**. Lo
que se atacó, se cerró bien —verifiqué el ALTO de la 23 (`acred?.litrosDiesel ??
0` → `acred ? acred.litrosDiesel : null` con `vacio=`, `combustible-casetas/
page.tsx:220-226`) y una muestra de los cierres FE de esta rama, y aguantan—.
Pero por **segunda ronda consecutiva cero** de los MEDIO/BAJO abiertos se tocó, y
esta vez la rama no solo no los cerró: **empeoró dos de ellos con su propio
trabajo**. El commit `5906783` (FE-13b) metió DOS clases `dark:` nuevas en la
única página que la 23 reportó por tener `dark:` desacoplado; el commit `0464d3d`
(la cola de revisión, pantalla nueva del dinero) pinta tres pills con tokens CSS
que no existen; y `9b17447`, que dice en su asunto haber unificado «cuatro copias
del nombre de cada rol», creó el módulo y **no tocó ninguna de las cuatro** —
`mi-perfil`, que el propio mensaje nombra, sigue con su copia. Un arreglo inerte
con prueba verde cuesta más que un arreglo ausente.

**Riesgo mayor de hoy:** en la configuración **por omisión** —tema «claro», que
es el default de `selector-tema.tsx:20`— un contralor con macOS o Windows en
oscuro abre el Cotizador y el chip de estado de cada cotización mide **1.24:1**:
la palabra `BORRADOR`/`ENVIADA`/`GANADA` no se ve, y los botones que deciden el
flete se vuelven ilegibles al pasarles el mouse. Es la pantalla del precio.

## Hallazgos

### [ALTO] En el tema por omisión, el chip de estado del Cotizador mide 1.24:1 y los botones de decisión se apagan al hover — y la rama metió dos clases `dark:` MÁS
`src/app/dashboard/cotizaciones/page.tsx:274` y
`src/app/dashboard/cotizaciones/acciones.tsx:27-28`
(contra `src/app/globals.css:1, 118-124, 164-165` y
`src/app/selector-tema.tsx:20, 26-29`)

Escenario, con valores y sin tocar ningún ajuste de Likida:

1. `src/app/globals.css:1` es `@import "tailwindcss"` pelón; no hay
   `@custom-variant dark` en ningún `.css` del repo (lo verifiqué con grep) y no
   existe `tailwind.config.*` (tampoco). En Tailwind v4, en esa configuración la
   variante `dark:` **es** `@media (prefers-color-scheme: dark)`.
2. `globals.css:118-124` **borró a propósito** ese media query y dejó el tema en
   `:root[data-theme]`, que escribe `selector-tema.tsx:26-29`.
3. `selector-tema.tsx:20` deja **`claro`** como valor por omisión, y
   `layout.tsx:52` lo estampa antes del primer paint en `/dashboard`. O sea:
   `data-theme="light"` (`--ink #17100d`, `--surface #ffffff`) **y a la vez**
   `dark:` disparando, porque el sistema operativo está en oscuro.

Entra: contralor con MacBook en modo oscuro (el default de macOS desde que lo
enciende de noche), que nunca tocó el 🌙 del sidebar, abre
`/dashboard/cotizaciones`. Sale:

- `page.tsx:274` — `<span className="rounded bg-neutral-100 … dark:bg-neutral-800">
  {q.estado}</span>`: fondo **#262626**, texto heredando `--ink` **#17100d**
  (`html,body{color:var(--ink)}`, `globals.css:194`). Contraste medido con la
  fórmula de luminancia WCAG (la misma de `contraste.test.ts:24-34`):
  **1.24:1**. La palabra desaparece — el único indicador de si la cotización está
  en borrador, ya enviada al cliente o ganada.
- `acciones.tsx:27` — `hover:bg-neutral-50 dark:hover:bg-neutral-800` en
  «Marcar enviada», «Perdida» y «Vencida»: al pasar el mouse, **#262626** bajo
  texto **#17100d** → **1.24:1**. El botón se apaga justo cuando lo apuntas.
- `acciones.tsx:28` — `text-emerald-700 hover:bg-emerald-50
  dark:hover:bg-emerald-950` en **«Crear viaje»**: al hover, **#022c22** bajo
  **#047857** → **2.76:1** (en claro sería 5.21:1). Es el botón que convierte una
  cotización en un viaje real.

Lo que lo hace un hallazgo de ESTA ronda y no la repetición de la 23: la 23
reportó el desacople y midió el caso «usuario que ELIGE oscuro». Aquí está medido
el caso **por omisión**, que es más común, y sobre todo: `acciones.tsx` **es
archivo nuevo de esta rama** (`5906783`, FE-13b, 1-sep 23:24) y trajo `dark:`
nuevos a la única página del panel que ya estaba señalada por eso. El barrido de
`(text|bg|border)-(neutral|gray|zinc|slate|red|green|amber|blue|emerald|yellow)-\d+`
sobre todo `src/app/dashboard` sigue devolviendo **exactamente dos archivos**, y
los dos son el Cotizador.

Consecuencia: el contralor abre la pantalla que decide si acepta un flete y no
puede leer el estado de sus cotizaciones ni ver qué botón está tocando. Y el
guardia no puede verlo: `contraste.test.ts:19-22` lee `globals.css` y mide
tokens; un `#262626` que vive en un `className` no está en ese archivo — la única
página fuera del sistema de tokens es la única fuera de la prueba que lo vigila.

Causa raíz probable: la página nació con la paleta cruda de Tailwind (mig. 0225)
y nunca se migró a tokens; el arreglo de FE-13b copió el estilo del vecino en vez
de migrarlo. (REINCIDENTE de la 23, agravado.)

---

### [MEDIO] Los tres pills de estado de la cola de revisión piden `--ok-bg` / `--bad-bg` / `--warn-bg`, que no existen — el fondo se cae a transparente
`src/app/dashboard/agentes/liquidacion/cola.tsx:50-52` (pintados en `:258-259`;
tokens reales en `src/app/globals.css:111, 113, 115` y `:147-149`)

Escenario: los tokens del repo se llaman **`--okbg`, `--warnbg`, `--badbg`** (sin
guion). Este archivo escribe `var(--ok-bg)`, `var(--bad-bg)`, `var(--warn-bg)`.
Corrí un barrido de todos los `var(--x)` de `src/app` contra las definiciones de
`globals.css`: **estos tres son los únicos usos sin definición en todo el panel**
(los otros nombres que salen —`--font-sans-ui`, `--card`— o los define
`next/font` en `<html>` o llevan fallback: `var(--card, transparent)`).

Un `background: var(--bad-bg)` sin definición es *invalid at computed-value time*:
`background-color` no se hereda, así que toma su valor inicial, **transparente**.
Entra: la cola con una liquidación `con_diferencias` → sale un pill sin píldora,
texto rojo suelto sobre el fondo de la tabla; lo mismo el verde de «Cuadrada» y
el ámbar de «Revisar». El fallback de `:244` —para un estatus DESCONOCIDO— sí usa
un token real (`var(--canvas)`): los tres estados válidos pierden el fondo y el
inválido lo conserva.

Consecuencia: en la pantalla nueva donde el contralor decide qué firmar, el
semáforo se degrada a texto de color; a 100 renglones la lectura de un vistazo
—que es para lo que existe un pill— se pierde. No es un error de compilación ni
de tipos: `bg` está tipado `string`, así que ni `tsc` ni `eslint` lo ven, y no
hay prueba de render.

Causa raíz probable: `cola.tsx` nació en `0464d3d` (BLOQ-6, esta rama) y su autor
copió la convención de nombres de otro sistema; el repo usa `--okbg` desde
`globals.css`. Es deuda NUEVA de esta rama.

---

### [MEDIO] El commit que dice haber unificado los rótulos de rol dejó vivas las cuatro copias que su propio mensaje nombra
`src/app/dashboard/mi-perfil/page.tsx:18-24`,
`src/app/dashboard/sesiones-mcp/vista.tsx:19-23`,
`src/app/dashboard/agentes/notificaciones-forma.tsx:45-49`,
`src/app/admin/equipo/page.tsx:16-22`, `src/app/dashboard/chrome.tsx:26-32`
(contra `src/lib/auth/roles.ts:26-50`)

Escenario: `9b17447` («H18/ADM-7 un solo catálogo de rótulos de rol») dice en su
cuerpo que había cuatro copias divergentes y nombra tres archivos, entre ellos
**`mi-perfil`** con «Dueño / Admin de flota». Su `--stat` toca **tres** archivos:
`invitar.ts`, `invitar.test.ts` y el módulo nuevo `roles.ts`. Ninguna de las
cuatro copias.

Después, otros commits sí cablearon `usuarios/page.tsx`, `usuarios/vista.tsx` y
`aviso-rol.tsx`. Quedaron cinco sin cablear, y **divergen**:

| Dónde | Qué dice de `flota_admin` |
|---|---|
| `lib/auth/roles.ts:28` (la fuente única) | **Dueño de la flota** |
| `dashboard/usuarios/vista.tsx:179` (usa la fuente) | **Dueño de la flota** |
| `dashboard/mi-perfil/page.tsx:20` | **Dueño / Admin de flota** |
| `dashboard/sesiones-mcp/vista.tsx:20` | **Dueño / Admin de flota** |
| `admin/equipo/page.tsx:18` | **Dueño / Admin de flota** |
| `dashboard/chrome.tsx:27` | **ADMIN FLOTA** |

Y para `encargado`: `roles.ts:36` dice «Encargado (jefe de tráfico)»;
`agentes/notificaciones-forma.tsx:47` dice «Jefe de tráfico» a secas — que es
literalmente el ejemplo con el que `aviso-rol.tsx:8-12` justifica la unificación
(«esta cinta decía *Jefe de tráfico* y la lista del equipo *Encargado* para el
mismo rol, y dos nombres se leen como dos roles»).

Entra: el dueño de la flota abre `/dashboard/mi-perfil` («Dueño / Admin de
flota»), mira el sidebar («ADMIN FLOTA») y luego `/dashboard/usuarios`, donde
aparece él mismo como «Dueño de la flota» → tres nombres para su propio rol en
tres clics. En `/dashboard/agentes/…/notificaciones` configura a quién avisar y
uno de los destinatarios se llama «Jefe de tráfico», que en la lista del equipo
no existe.

Consecuencia: es el hallazgo del formato de cifras trasladado a los rótulos —«un
rótulo que cambia según la pantalla se lee como dos roles», dicho por el propio
repo—, en la pantalla donde se reparten permisos. Y para quien mantenga esto: la
prueba que acompaña al arreglo (`admin/usuarios/nuevo/resultado_visible.test.ts`)
solo verifica el archivo que SÍ se cableó, así que la consolidación se lee como
terminada.

Causa raíz probable: el arreglo se detuvo en crear el módulo; no hay prueba que
prohíba un `Record` de rótulos de rol fuera de `lib/auth/roles.ts` (como sí la
hay para `toLocaleString`).

---

### [MEDIO] El mensaje crudo del servidor llega a la pantalla del contralor en tres páginas, existiendo el sanitizador
`src/app/dashboard/conversaciones/page.tsx:51, 90`,
`src/app/dashboard/arco/page.tsx:158, 202`,
`src/app/dashboard/mapa/vista.tsx:121` (contra
`src/lib/likida/errores.ts:64-70`, `mensajeParaPantalla`)

Escenario: `getHilosDeFlota` lanza `new Error(\`getHilosDeFlota: ${error.message}\`)`
(`src/lib/likida/conversaciones.ts:86`), donde `error.message` es el de
PostgREST. La página lo captura tal cual (`:51`) y lo imprime dentro del aviso
(`:90`): `{errorCarga.slice(0, 120)}`.

Entra: la policy de solo lectura de la migración 0292 se aplica sin cubrir
`wa_conversacion` → PostgREST devuelve `permission denied for table
wa_conversacion`. Sale, en la pantalla del contralor:

> No se pudieron leer las conversaciones ahora mismo (**getHilosDeFlota:
> permission denied for table wa_conversacion**). Recarga en un momento…

Lo mismo en `arco/page.tsx:202` —la pantalla de solicitudes ARCO, que el
contralor abre por obligación legal— y en `mapa/vista.tsx:121`
(`rastreo.error.slice(0, 140)`, alimentado desde `mapa/page.tsx:128-130`). Los
tres exponen nombre de función interna, nombre de tabla y, según la falla,
mensajes de JWT o de SQL.

Que no es opinión: el repo tiene el sanitizador y lo usa en todas partes. Barrí
`e instanceof Error ? e.message : String(e)` en `src/app/dashboard` y
`src/app/admin`: **19 apariciones, 16 van a `logger`** y las acciones de
`emergencias/page.tsx:109, 151, 170` y `cotizaciones/page.tsx:145` llaman
`mensajeParaPantalla(e, …)`, que devuelve «No se pudo …, y no es por lo que
capturaste: es una falla del sistema y quedó registrada». Las tres del hallazgo
son las únicas que pintan el crudo.

Consecuencia: en una sala, el comprador ve el nombre de una tabla y una frase en
inglés donde debía ver una explicación; y para cualquiera con rol `contador` o
`encargado` es información de esquema que su rol no tiene por qué conocer.

Causa raíz probable: las tres páginas nacieron con la regla correcta de «fallar
cerrado y decirlo» (los comentarios lo dicen) y resolvieron el «decirlo» con la
excepción a mano, antes de que `mensajeParaPantalla` fuera la costumbre.

---

### [MEDIO] La cartera de Rentabilidad afirma «Aún no hay facturas emitidas registradas» en una página vacía — y su propio guardarraíl quedó del lado que nunca se pinta
`src/app/dashboard/rentabilidad/vista.tsx:114` (guardarraíl muerto en `:41-45`;
paginación en `page.tsx:34, 39-41`)

Escenario: `page.tsx:34` acepta `?p=` de 1 a 1000. `getCobranza` devuelve
`{facturas: ≤100, total, pagina, porPagina}`. Un contralor deja en favoritos
`/dashboard/rentabilidad?p=3` cuando tenía 250 facturas; meses después su cartera
bajó a 50. Vuelve al favorito: `total = 50`, `facturas = []`. `sinNada` (`:37`)
es falso porque `total !== 0`, así que se entra al bloque de cobranza, y `:114`
gatea por **`cobranza.facturas.length === 0`** → se pinta:

> **Aún no hay facturas emitidas registradas** — al registrar la primera, aquí
> aparece la cartera…

Entra: flota con 50 facturas emitidas y $1.4M por cobrar → sale una afirmación
categórica de que nunca ha emitido una.

Lo que lo confirma como descuido y no como decisión: **el arreglo está escrito
tres renglones arriba, en la rama muerta.** `:41-45` calcula `desde` con un
comentario que dice literalmente «`desde` es 0 cuando la página quedó vacía
(alguien tecleó `?p=99`): entonces el renglón dice "0–0 de N", que es la verdad».
Ese renglón vive en `:178-181`, dentro del `else` al que este `return` nunca
llega. El dato que separa «vacío real» de «página vacía» —`cobranza.total`— está
en el mismo objeto y se usa dos líneas antes.

Consecuencia: es la regla «un rótulo tiene que ser verdad» rota sobre la cartera
—la cifra con la que el contralor negocia cobranza— y con un link compartible que
la reproduce.

Causa raíz probable: la paginación (mig. 0152) se añadió al renglón de rango y
al `sinNada` global, y el `EstadoVacio` intermedio se quedó con el gate
pre-paginación. (REINCIDENTE de la 22, verificado abierto por tercera ronda.)

---

### [MEDIO] Las ‹ › que cambian el periodo de las cifras del Resumen miden 16×16 px, y el par de la tarjeta FISCAL va con separación CERO
`src/app/dashboard/kpi-periodo.tsx:10` (`BOTON = 'w-4 h-4 …'`, botones en
`:78-85`, contenedor `gap-0.5` en `:77`) y
`src/app/dashboard/motor-fiscal-periodo.tsx:7` (mismo `w-4 h-4`), con contenedor
**`flex items-center gap-0`** en `:45`, botones `:46-53`

Escenario: barrí `w-4 h-4` / `w-5 h-5` en todos los `.tsx` de
`src/app/dashboard`. Los objetivos táctiles reales son seis, en dos componentes,
y los seis están en el Resumen sobre cifras de dinero:

- `kpi-periodo.tsx` — «Gasto total» y «Costo por viaje»: 4 botones de **16×16 px**
  con `gap-0.5` = 2 px → centros a 18 px.
- `motor-fiscal-periodo.tsx` — «En riesgo/perdido» y «Recuperable pidiendo
  factura»: 2 botones de **16×16 px** con **`gap-0`** → centros a **16 px**, los
  bordes literalmente tocándose.

WCAG 2.2 SC 2.5.8 (AA) pide 24×24, o que un círculo de 24 px centrado en cada
objetivo no toque el del vecino. Los seis fallan por tamaño; los de
`motor-fiscal-periodo` fallan además por espaciado con el margen máximo posible.
Ninguna excepción aplica: no son controles en línea dentro de una oración, no los
dibuja el user agent, y no son esenciales (el mismo cambio de periodo se hace con
el pill de 24 px de `panel-periodo.tsx:69-73`). El vecino `selector-tema.tsx:73`
usa `w-6 h-6` = 24 px y sí cumple: la talla correcta ya está en el repo.

Entra: el dueño en la tablet de la oficina quiere ver «Recuperable pidiendo
factura — histórico» → sale: toca entre las dos flechas y no pasa nada, o toca ‹
creyendo tocar › y la tarjeta se va al periodo contrario. La única señal del
cambio es el sufijo del rótulo (`kpi-periodo.tsx:66`, `motor-fiscal-periodo.tsx:11`).

Consecuencia: la cifra que el comprador ve puede no ser la del periodo que pidió,
en la primera pantalla del producto y sobre el número fiscal. Para teclado el
problema no existe (`<button>` con `aria-label` correcto), lo que confirma que es
de tamaño, no de semántica.

Causa raíz probable: `motor-fiscal-periodo.tsx` copió el `BOTON` de
`kpi-periodo.tsx` y perdió el `gap-0.5` por el camino. (REINCIDENTE de la 23; el
segundo componente y el `gap-0` no estaban medidos.)

---

### [MEDIO] Los tres botones que firman una liquidación son radios `sr-only`: el foco de teclado no se ve en ninguno
`src/app/dashboard/[id]/revision-panel.tsx:126-137`

Escenario: «Aprobar» / «Ajustar montos» / «Rechazar» se pintan como `<label>`
estilizados con `style` inline (`:129-133`) y el control real es
`<input type="radio" … className="sr-only" />` (`:134`). `sr-only` en Tailwind es
`position:absolute; width:1px; height:1px; clip-path:inset(50%)` — el anillo de
foco del navegador se dibuja alrededor de esa caja de 1 px, fuera de la pantalla.
El `<label>` no tiene ninguna regla de foco: no hay `has-[:focus-visible]`, ni
`peer-focus-visible`, y `globals.css` solo define `:focus-visible` para
`.sb-aside a/button` (`:356`) y `.pildora` (`:414`).

Entra: el contralor llega al panel de Revisión con Tab (o usa lector de
pantalla + teclado, o simplemente no toca el mouse), presiona Tab hasta el
radiogroup y luego ← / → para elegir → sale: **nada cambia visualmente salvo el
pill activo**, y no hay forma de saber que el foco está ahí ni cuál opción se va
a activar antes de moverse. Es WCAG 2.4.7 (Focus Visible, AA).

Consecuencia: el único control del producto que mueve `gasto.monto` y firma un
cierre —«el agente cuadra, tú firmas lo que no»— es el que peor se navega sin
mouse. Es la pantalla que la propia cabecera del archivo (`:9-26`) describe como
la segunda mitad que faltaba del producto.

Causa raíz probable: el patrón «radio invisible + label pintado» se escribió para
tener el pill de marca; nadie volvió a poner el anillo de foco que el `sr-only`
se llevó.

---

### [MEDIO] En «Histórico», la tarjeta Actividad afirma «Aún no hay viajes registrados» cuando lo que falló fue la consulta
`src/app/dashboard/inicio-contenido.tsx:711` (efecto en
`src/app/dashboard/actividad.tsx:53, 59`; el gemelo honesto es `actividad.tsx:39-47`)

Escenario: `getViajesPorMes(tenantId)` falla; el `safe()` la resuelve a `null` —
correcto. El llamador la colapsa: `porMes={viajesPorMes ?? []}` (`:711`), y
`PanelPeriodo`/`Actividad` la reciben tipadas `Array<…>` sin `| null`
(`panel-periodo.tsx:41`, `actividad.tsx:36`). El contralor pulsa «Histórico» y
`actividad.tsx:53` evalúa `[].every(d => d.valor === 0)` → `true` → `:59` pinta,
centrado en la tarjeta:

> **Aún no hay viajes registrados.**

Entra: flota con 1,800 viajes en 14 meses y la RPC caída → sale una afirmación
categórica sobre su negocio, sin siquiera «en este periodo».

El guardarraíl que existe y por qué no alcanza: `viajesPorMes` está en
`secundarias` de `estadoPanel`, así que arriba de la página aparece la banda
ámbar «esta pantalla está incompleta». La banda vive arriba del todo y la frase
está abajo, dentro de una pestaña que hay que pulsar. Lo delata su vecino: en el
MISMO componente `porDia` se recibe `DiaViajes[] | null` y `:39-47` dice «No se
pudo cargar esta gráfica», con el razonamiento escrito en `:32-34`. La rama de
Histórico es la única de las tres del selector sin esa distinción.

Causa raíz probable: `porDia` se endureció en FE-5 y `porMes` —la serie vieja— no
se llevó al mismo contrato; el `?? []` del call site oculta que el tipo del prop
nunca se abrió a `null`. (REINCIDENTE de la 23, sin tocar.)

---

## Reincidentes verificados abiertos, sin re-argumentar

Los abrí uno a uno en esta rama; siguen palabra por palabra:

- **[MEDIO] El script anti-parpadeo del tema solo corre en `/dashboard`.**
  `layout.tsx:52` sigue con `location.pathname.indexOf('/dashboard')!==0`, y
  `SelectorTema` sigue montado en `admin/sidebar-nav.tsx:149`. Un superadmin que
  eligió «oscuro» ve `/admin` en blanco hasta que React hidrata y corre el
  `useEffect` de `selector-tema.tsx:50-52`.
- **[MEDIO] En el Registro de Viajes la dirección de la diferencia la lleva solo
  el color.** `viajes/vista.tsx:224` sigue imprimiendo `mxn(Math.abs(v.diferencia))`
  con la distinción en `--warn`/`--bad` y la leyenda en el `tfoot` (`:250-254`).
- **[MEDIO] El chat del cliente rotula 11 tools y el analista declara 13.**
  `chat.tsx:44-56` contra `analista.ts:42-47, 368`: faltan
  `consultar_carta_porte` y `consultar_normas`, que `chat.tsx:57` degrada a
  `t.replaceAll('_',' ')` → «consultar carta porte» en minúscula cruda dentro de
  la secuencia de pensamiento.
- **[BAJO] Categoría y prioridad del ticket, crudas.** `soporte/page.tsx:252-253`
  imprime `t.categoria` y `t.prioridad` sin mapa; el dominio real es
  `('facturacion','operacion','tecnico','cuenta','otro')` y
  `('baja','media','alta','urgente')` (`0051_soporte_y_cotizacion.sql:42-43`). El
  commit `4209b14` cerró el hermano (`estado`, vía `pillTicket`) y dejó estos dos.
- **[BAJO] `cotizaciones/page.tsx:274` imprime `q.estado` crudo en mayúsculas**
  (`lector.ts:292`, `estado: String(c.estado)`), sin mapa contra el dominio.

**Y uno que RETIRO:** la 23 arrastraba «`hour12: false` sin `hourCycle` en las
dos pantallas de jornada» (`jornada/formas.tsx:70`, `jornada/vista.tsx:58`). Lo
ejecuté: en Node 22 / ICU actual,
`Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',hour12:false}).resolvedOptions().hourCycle`
devuelve **`h23`**, y las 00:30 imprimen `00:30`, idéntico a `hourCycle:'h23'`.
El «24:00» que `lib/formato.ts:344` documenta no se reproduce con este locale. Es
inconsistencia de estilo, no un defecto: no debería seguir contándose como
hallazgo abierto.

## Lo que revisé y está bien

**El ALTO de la 23, cerrado de verdad.**
`combustible-casetas/page.tsx:220-226`: `valor={acred ? acred.litrosDiesel : null}`
con `vacio={acred === null ? 'No se pudo leer lo acreditable' : undefined}` y el
comentario que explica el cambio. El `KpiTile` pinta `—` en `--faint`
(`admin/ui/kit.tsx:53, 69`) en vez de un 0 con cita del LIF 20-A debajo. Los dos
`?? 0` que quedan (`:214, 217`) viven DENTRO de la rama donde `porConcepto` ya se
leyó — correcto.

**Muestra de cierres FE de la rama, verificados contra el código, no contra el
asunto del commit:**
- FE-26 (`6960bf8`): `viajes/page.tsx:81` es `liqId: verDinero && liq ? liq.id : null`.
  Real. (`liqEstatus` sigue sin gatear, pero solo se declara en el tipo
  `vista.tsx:28` y no se pinta: no filtra nada.)
- FE-13/FE-13b (`5906783`): `despacho/page.tsx` traduce el 23505 de
  `uq_viaje_abierto_por_operador`; `cotizaciones/acciones.tsx` sí convirtió las
  tres acciones a `useActionState` con `useFormStatus` por botón y el error llega
  a la fila (`:70-74`). Real — salvo las dos clases `dark:` que trajo, arriba.
- FE-34 (`3a0bc70`, `25b1b04`): barrí las `<table>` de todo `src/app/dashboard`
  buscando ancestro sin `overflow-x-auto` en 6 líneas: **la única superviviente**
  es `carta-porte/borrador/[viajeId]/page.tsx:226`, tabla de dos columnas
  etiqueta/valor que envuelve — la excepción que la 23 ya documentó.
- SEG-8 en `/api/demo` (`route.ts:8-12`): el GET dejó de devolver `envHealth()`.
  El contrato del POST no cambió y sigue coincidiendo con lo que
  `demo/page.tsx:58-68` consume (`totalComprobado`, `totalAnticipo`,
  `diferencia`, `diferencias[].{tipo,nota}`); el `catch` de `:71-73` deja el demo
  con mensaje en vez de colgado. **El demo no se cae por el fail-closed nuevo del
  rate limit**: `ratelimit.ts` solo niega cuando Redis está CONFIGURADO y falla;
  sin credenciales cae al Map local (caso 1 de la cabecera), y una negación se
  vería como el mensaje amable, no como una pantalla rota.

**El trabajo obligatorio — mapas literales contra el tipo.** Los que sí derivan y
no compilan si el tipo crece: `ROTULO_DIFERENCIA` (`rotulo-diferencia.ts:18`,
`Record<TipoDiferencia, string>` — conté los 43 miembros de
`types/likida.ts:94-141` contra 43 claves, igualdad exacta, `medio_pago_no_admitido`
incluido y sin decir «efectivo»), `ROTULO_REVISION`/`ROTULO_VACIO`
(`cola.tsx:33, 42`, `Record<RevisionLiquidacion,…>` == `types/likida.ts:166`),
`ROTULO_FASE`/`ROTULO_SIN_MONTO` (`facturacion/estadias.tsx:40, 47`),
`ROTULO_FILTRO` (`viajes/vista.tsx:37`), `ETIQUETA_MODO` (dos sitios),
`ROL_LABEL` de `admin/equipo/page.tsx:16` (`Record<RolAppUser,…>`, 5/5 contra
`provisionar.ts:21`), `RUTA`/`OFICIO` de `admin/crons/vista.tsx:33, 48`
(`Record<CronId,…>`). Los `Record<string,string>` que verifiqué a mano contra su
dominio SQL y salieron completos: `ESTADO_UNIDAD` (`unidades/vista.tsx:27`) 4/4
contra `0047:47`; `CONCEPTO` (`[id]/page.tsx:30`) y `CONCEPTO_LABEL`
(`gasto-semanal-chart.tsx:13`) 9/9 contra `0025:88` — y los dos están vigilados
por `etiquetas_sincronizadas.test.ts`; `FORMA_PAGO` (`[id]/vista.tsx:149`) con
`05`/`06` presentes y `etiqueta_forma_pago.test.ts` vigilando que toda clave que
el motor admita tenga rótulo; `ROTULO` de `revision-panel.tsx:66` 4/4. Los que
salieron incompletos son los dos BAJO de arriba (`soporte`, `q.estado`) y los de
rol (hallazgo propio).

**`estadoRenglon` (`[id]/vista.tsx:199-214`)** — el veredicto por renglón importa
`NO_DEDUCIBLE_ISR` y `POR_CONFIRMAR` del motor en vez de reconstruirlos
(`:181-186`), el orden de gravedad está declarado y el fallback de `:209` es «Por
revisar», no un veredicto inventado. Es el patrón correcto.

**Formato de cifras:** cero `toLocaleString` / `Intl.NumberFormat` en todo
`src/app` fuera de comentarios. Las únicas tres `Intl.DateTimeFormat` fuera de
`lib/formato.ts` (`jornada/formas.tsx:68`, `jornada/vista.tsx:57`,
`admin/dev/mapa-actividad.tsx:17`) llevan las tres `timeZone: TZ_MX`, así que no
hay desajuste servidor/cliente ni día corrido.

**Tokens CSS:** barrido programático de todos los `var(--x)` de `src/app` contra
las definiciones de `globals.css`. Descontando los que define `next/font` en
`<html>` (`--font-sans-ui`, `--font-mono`, `--font-display`), los de `login.css`
que se definen ahí mismo y los que llevan fallback, **los únicos rotos son los
tres de `cola.tsx`** (hallazgo propio).

**Fail-cerrado en las páginas nuevas de la rama:** `asistencia/page.tsx:96,
112-118` (sin botones de intervención cuando no se leyó, dicho así),
`conversaciones/page.tsx:74` (`vacio=` cuando el conteo es `null`),
`emergencias/page.tsx:79-85`, `timbrado/page.tsx:46`, `cotizaciones/page.tsx:169-173`
(«No es que no haya cotizaciones: la lectura falló»),
`rentabilidad/page.tsx:37-41` (cada bloque a su propio error). El único de esta
familia que colapsa sigue siendo el de Histórico.

**`key` de React sobre filas de dinero:** los `key={i}` que quedan en
`src/app/dashboard` están todos en listas de Server Component que se renderizan
una vez (diferencias, ejes de gráfica, notas del desglose, esqueletos) o en
burbujas append-only del chat. Las filas con `<input>` y las tablas de la cartera,
la cola y el registro van con `key` de id (`rentabilidad/vista.tsx:154`,
`cola.tsx:246`, `revision-panel.tsx:154`, `descarga-sat` por id).

## Lo que NO alcancé a revisar

- **Sigo sin mirar un render.** `npm run build` está prohibido esta ronda y no
  puedo levantar un preview, así que TODO lo anterior es lectura de fuente y
  aritmética. Los contrastes (1.24:1, 2.76:1) están calculados con la fórmula de
  luminancia WCAG, no vistos; el «fondo transparente» de `cola.tsx` está deducido
  de la regla CSS de *invalid at computed-value time*, no capturado. **Los dos
  merecen una captura antes de arreglarse**, y el del chip del Cotizador es el
  que más.
- **Responsive de verdad:** no abrí ninguna de las ~31 páginas a 390 px. El
  `viewport` está (`layout.tsx:44`) y las tablas van envueltas, pero eso no es
  haberlo visto. En particular no medí el Cotizador ni la cola de revisión en
  celular, que son las dos pantallas nuevas con más columnas.
- **Estados de CARGA.** No rastreé qué páginas tienen `Suspense` con esqueleto del
  alto correcto y cuáles brincan; solo vi los de `inicio-contenido.tsx` y
  `agentes/liquidacion/vista.tsx:160-168` (`EsqSeccion`, con `role="status"`).
- **`/admin` a fondo.** Revisé por muestreo (`equipo`, `crons`, `corridas`,
  `tu-turno`, `dev/mapa-actividad`, `salud-sistema`). Los `Record<string,string>`
  de `mapa-prospectos`, `qa`, `evals`, `marketing`, `vendedores`,
  `costos-facturacion` y `analitica` no los comparé contra sus dominios — son ~60
  pantallas y el comprador no ve ninguna.
- **El orden de foco** de ninguna pantalla, ni el resto de las áreas de toque de
  `/admin` (`mapa-actividad.tsx:32` va en 11×11 px, pero es una página de Javier).
- **`/vendedor`, `/cuenta`, `/mcp/autorizar`, `/aviso/[tenant]`, `/pago/[token]`**
  — el portal de pago lo verificó la 23 y no lo re-abrí; los otros cuatro solo lo
  suficiente para saber que existen.
- **No corrí ninguna prueba.** Toda la verificación de cierres es lectura del
  diff y del árbol actual.
