# Frontend — auditoría 3

**Nota: 5/10** (antes 7). Razón del movimiento: **mirada más profunda** — el
código de las pantallas nuevas está mejor que nunca en estados vacíos y
leyendas honestas, pero al abrir los caminos de FALLO (no los felices) aparecen
tres superficies donde el panel afirma en falso, y una donde contesta con un
número que no es el que se preguntó. Nada de eso cambió esta semana: la nota
anterior no las había mirado. Se suma la deuda que cobró factura: FE-A2 sigue
viva y ahora se contradice a sí misma en Despacho.

Riesgo mayor hoy: **el chat tira la respuesta de error del servidor y contesta
él mismo con una cifra histórica**, sin que nada en pantalla distinga esa
respuesta de una del agente.

## Hallazgos

### [CRÍTICO] "Chatea con tus datos" contesta con un heurístico local cuando el agente falla, y no lo dice
`src/app/dashboard/chat.tsx:523-525` (y el mismo camino en `:541`)
Escenario: el contralor escribe «¿cuánto comprobó Juan Pérez en julio?». El
analista truena (loop-guard / timeout de 40 s / `PartialExecutionError`) y el
servidor manda su evento honesto `{t:'error', error:'el analista no pudo
responder en este momento'}` dentro de un stream 200
(`api/dashboard/chat/route.ts:148`). El cliente evalúa `resp.ok && d &&
Array.isArray(d.bloques)`: `resp.ok` es **true** y el evento **no** trae
`bloques`, así que cae a `responder(q, kpis, acred)` — un `if` de palabras
clave (`chat.tsx:92-163`). «comprob» coincide, y la pantalla imprime
«Llevas $2,340,000 comprobados en 143 viajes», con su tablita de 5 renglones,
en la misma burbuja y con la misma tipografía que una respuesta real. Esa cifra
es el histórico de TODA la flota: ni Juan Pérez, ni julio. El texto de error
del servidor no aparece nunca. Lo mismo pasa con 401/403 (sesión vencida a
media demo) y con el `AbortSignal.timeout(75_000)`.
Consecuencia: el contralor se lleva de la sala un monto real pero que responde
otra pregunta, creyendo que se lo dio el agente; y una caída del analista se ve
exactamente igual que un producto que funciona, así que nadie la reporta. La
misma pantalla YA sabe hacerlo bien: el adjuntar archivo sí pinta el error del
servidor (`chat.tsx:286`).
Causa raíz probable: el fallback offline de la primera versión del chat quedó
cableado como rama `else` del camino de éxito, en vez de como respuesta a
"no hay red"; y el evento `error` del stream no tiene rama propia.

### [ALTO] "Reabrir este viaje" es código inalcanzable: la condición compara el estatus equivocado
`src/app/dashboard/[id]/page.tsx:93` (render en `:351`)
Escenario: `puedeReabrir = puedeAdministrar(rol) && d.estatus === 'liquidado'`.
`d.estatus` viene de `liquidacion.estatus` (`analytics.ts:1327`), cuyo dominio
lo fija el CHECK `liquidacion_estatus_dominio`:
`cuadrada | con_diferencias | revisar` (`0025_dominios_check.sql:126-127`).
`'liquidado'` es de `viaje.estatus`, otra tabla. La comparación es SIEMPRE
falsa → la sección "Reabrir este viaje" nunca se pinta para nadie, ni para el
dueño de la flota. `reabrirViaje` (`administracion.ts:380`) y su server action
existen y no tienen otro punto de entrada en todo `src/` (único uso:
`[id]/page.tsx`).
Consecuencia: el dueño de la flota no puede corregir una liquidación cerrada
mal desde el panel — el camino que el propio código documenta como "lo
resuelve `reabrirViaje`" solo existe por SQL a mano. Es exactamente el modo de
falla dominante del rubro: un mapeo del panel que ya no cuadra con
`src/types/likida.ts` (`EstatusLiquidacion`, línea 110).
Causa raíz probable: la página mezcla dos dominios de `estatus` con el mismo
nombre de campo y sin tipo que los separe (`d.estatus: string`).

### [ALTO] La liquidación REAL de un cliente se rotula "datos de demostración"
`src/app/dashboard/[id]/page.tsx:163-166`
Escenario: la insignia del encabezado es un ternario sobre `volverQS`, que solo
se llena cuando hay `?tenant=`, `?vista=` o `?rol=` (`:66-84`). Un
`flota_admin` o un `contador` reales navegan sin sufijo (`sidebar-nav.tsx:70`
devuelve `''` para roles no-superadmin), así que `volverQS === ''` y la rama
que se pinta es la de **"datos de demostración"** — sobre su propio folio, su
propio comprobado y su propio PDF. En el camino contrario (demo con
`?vista=demo`) la insignia dice "viendo como superadmin", proyectada delante
del prospecto.
Consecuencia: la pantalla de dinero que el contralor cruza contra su contador
se declara a sí misma falsa. Rompe "un rótulo tiene que ser verdad" en la
única página donde el rótulo importa.
Causa raíz probable: la insignia se escribió cuando `/dashboard/[id]` solo se
abría desde el tenant demo, y quedó como ternario de dos ramas donde hacían
falta tres estados (demo / previsualización / cliente real).

### [ALTO] Dos tarjetas del Inicio afirman "aún no hay" cuando la consulta se cayó
`src/app/dashboard/panel-periodo.tsx:74-81` y `:97-101`
Escenario: `getSeriesKpiCards` o `getGastoPorSemanaSeries` lanzan (PostgREST
con error → `exigir()` lanza) y `safe()` los convierte en `null`
(`inicio-contenido.tsx:36-38, 97, 102`). En `PanelPeriodo`, `kpiModo` y
`gastoModo` quedan `null` y las tarjetas pintan **"Aún no hay viajes
registrados en este periodo."** y **"Aún no hay gastos capturados."** — dos
afirmaciones sobre el negocio del cliente hechas estando ciego. Sus dos
hermanas de la misma pantalla sí distinguen (`:110-119` "No se pudo cargar
esta gráfica", `:135` "No se pudo cargar esta sección"), y el bloque de KPIs
de arriba también (`inicio-contenido.tsx:321`). Encima, el aviso "Faltan datos
por cargar" no se enciende: `estadoPanel` solo mira acreditables/kpis/
liquidaciones/anomalías (`estado.ts:30`), ninguna de estas dos series.
Consecuencia: una flota con 300 viajes ve "aún no hay viajes en este periodo"
sin un solo indicio de que la base no respondió. Es el fallo que el repo
declara como su regla fundacional ("fallar cerrado y decirlo"), en la primera
pantalla que el comprador abre.
Causa raíz probable: `null` significa dos cosas distintas (no cargó / no hay) y
en estas dos tarjetas se colapsaron en la misma rama.

### [ALTO · REINCIDENTE] FE-A2: la ventana de 100 viajes sigue sin declararse — y ahora se contradice en pantalla
`src/lib/likida/analytics.ts:948` (`getViajes(tenantId, limite = 100)`), consumida sin declarar en:
`src/app/dashboard/mapa/page.tsx:43` → `mapa/vista.tsx:35`;
`src/app/dashboard/agentes/conductores/page.tsx:36` → `conductores/vista.tsx:53`;
`src/app/dashboard/huerfanos/page.tsx:52,57` → `huerfanos/acciones.tsx:47,58`;
`src/app/dashboard/despacho/page.tsx:51` → `despacho/vista.tsx:158-162`.
Escenario: flota con 150 viajes, de los cuales 60 vivos quedan fuera de los 100
más recientes por `created_at`. (a) Mapa y Conductores pintan el KPI **"Viajes
en curso · abiertos o en cuadre"** contando solo la ventana: el rótulo afirma
un total y enseña un subconjunto. (b) Despacho es peor porque ahí sí hay un
conteo real al lado: `tablero.viajesActivos` (`operacion.ts:459`, cuenta con
`traerTodo`) dice **150** en el KPI y tres centímetros abajo la nota dice
"Se muestran 12 — hay **88** más en curso" (150−12 = 138). Dos números
incompatibles en la misma tarjeta. (c) En huérfanos, un comprobante cuyo viaje
abierto es viejo cae en "Sin viajes abiertos a los cuales adjuntar" y el
encargado lo descarta.
Consecuencia: el jefe de tráfico opera con una cola incompleta creyendo que la
ve entera, y el contralor ve dos totales distintos del mismo dato. El patrón
correcto ya existe y está escrito en el repo: `viajes/vista.tsx:167-170` ("La
tabla enseña los N viajes más recientes; los conteos de arriba sí cuentan todo
el histórico"). Cuatro pantallas no lo copiaron.
Causa raíz probable: `getViajes` tiene el tope como argumento con default, así
que el llamador no lo ve y la vista no lo recibe.
(REINCIDENTE — venía como FE-A2 del pase 1; no hay commit que la toque.)

### [MEDIO] El mismo estatus es rojo en una pantalla y ámbar en la siguiente
`src/app/dashboard/estatus.ts:17-21` vs `src/app/dashboard/agentes/liquidacion/vista.tsx:296-300`
Escenario: el contralor está en el Agente de Liquidación y ve la fila `LIQ-812`
con pill **roja** "Con diferencias" (`fg: var(--bad)`); hace clic en "Ver" y en
`/dashboard/[id]` el mismo `LIQ-812` sale con punto **ámbar**
(`con_diferencias: var(--color-warn)`). Y al revés: "Por revisar" es ámbar en
la lista (`var(--warn)`) y **rojo** en el detalle (`var(--color-bad)`). Los dos
mapas están invertidos entre sí, un clic de distancia.
Consecuencia: el color es la señal de gravedad que un contralor lee antes que
el texto; dos lecturas opuestas del mismo renglón de dinero le enseñan a no
confiar en el semáforo. `estatus.ts` se creó justamente para que existiera UNA
copia (su encabezado lo explica) y `estatus.test.ts` la vigila — pero la
pantalla nueva se hizo su propio mapa y el test no la ve.
Causa raíz probable: el rediseño v3 escribió el mapa de nuevo en la vista del
agente en lugar de importar `etiquetaEstatus`.

### [MEDIO] La dona "Dinero observado por tipo" imprime claves crudas de base de datos
`src/app/dashboard/agentes/liquidacion/vista.tsx:13-18` (usada en `:200` y `:204`)
Escenario: `TIPO_DIFERENCIA` mapea **3** valores; `TipoDiferencia`
(`src/types/likida.ts:62-97`) tiene **40**. Además una de las 3 llaves
(`sin_comprobar`) no existe en el tipo — la real es `sin_comprobante`. El
fallback es `t.replaceAll('_',' ')`, así que la leyenda de la tarjeta de dinero
del agente sale: «cfdi efos · 3 — $12,400», «alimentacion transporte sin
tarjeta credito · 2 — $3,180», «rfc receptor no verificable · 1 — $940», sin
acentos ni mayúsculas, junto a pesos. Los tipos vienen crudos de
`liquidacion.diferencias` (`analytics.ts:280`), o sea que cualquier flota con
un CFDI cancelado o un EFOS los verá.
Consecuencia: la pantalla que vende "el agente detecta esto" enseña la señal
más grave (emisor en lista negra 69-B) como un identificador de programador.
El detalle de la liquidación ya lo resuelve bien: imprime `df.nota`, la frase
que escribe el motor (`[id]/page.tsx:279`).
Causa raíz probable: el mapa se escribió a mano para tres casos de demo y no
deriva del tipo ni de una función del motor.

### [MEDIO] El editor de la política del motor no tiene entrada en el menú, y el panel jura que es de solo lectura
`src/app/dashboard/politicas/page.tsx:44` (página completa y funcional, con `guardarPolitica`) vs `src/app/dashboard/rutas.ts:22-71` (no aparece en ninguna categoría) y `src/app/dashboard/agentes/liquidacion/vista.tsx:229-238`
Escenario: el dueño de la flota quiere subir el tope de casetas. En el Agente
de Liquidación, junto a "sus reglas", el único botón dice **"Ver"**, con el
comentario "Configuración hoy es solo lectura — un botón que promete editar y
no edita es un botón que miente", y lleva a `/dashboard/configuracion`, que en
efecto no edita nada (168 líneas sin un `form`). Mientras tanto
`/dashboard/politicas` SÍ edita `tenant.config.politica` —la que usa el
motor— y no está enlazada desde ningún archivo del producto (`grep` de
`dashboard/politicas` fuera de su propia carpeta: solo tests y
`visibilidad.ts`). Lo mismo le pasa a `/dashboard/usuarios` y `/dashboard/arco`.
Consecuencia: la flota no puede cambiar la regla con la que se le juzga cada
gasto, aunque el producto ya sepa hacerlo; y el panel se lo dice como si fuera
una limitación real. El propio `rutas.ts:67-69` fija el estándar contrario:
"nada debe ser alcanzable solo tecleando URL".
Causa raíz probable: el rewrite del sidebar del 13-ago partió de cero y estas
tres páginas quedaron fuera de las listas nuevas.

### [MEDIO] El sidebar no colapsa por breakpoint: abajo de 1024 px cada rótulo sale recortado a un par de píxeles
`src/app/marco.ts:22-23` vs `src/app/globals.css:324-326` y `src/app/dashboard/sidebar-nav.tsx:31`
Escenario: `MARCO_SIDEBAR` es `w-[72px] lg:w-[232px]` y su comentario dice
"Colapsa a solo íconos abajo de `lg`". Pero lo que esconde el texto
(`.sb-texto { display:none }`) está condicionado a
`:root[data-sidebar='min']`, un atributo que pone `BotonSidebar` — y ese botón
está `hidden lg:block` (`chrome.tsx:50`). En un iPad vertical (768 px) o
cualquier teléfono no hay atributo: la barra mide 72 px, `px-2.5` deja 52,
el ícono se lleva 26, y `<span className="sb-texto truncate">Agente de
Liquidación</span>` recibe ~26 px. Se ve una columna de íconos con una astilla
de letra cortada al lado; el selector de tema (`sidebar-nav.tsx:135`, tres
botones ≈ 82 px) desborda su contenedor y lo recorta el `overflow-hidden` del
aside.
Consecuencia: el producto se ve roto en cualquier pantalla menor a laptop —
que es donde el jefe de tráfico lo abriría.
Causa raíz probable: el colapso manual (data-attribute) sustituyó al colapso
responsive y nadie repuso la media query.

### [BAJO] Peajes: cuando el conteo no se pudo leer, la nota dice "aún sin estados de cuenta"
`src/app/dashboard/agentes/peajes/vista.tsx:40-41`
Escenario: `conciliacion === null` (lectura fallida). El valor grande cae a
`—` (bien), pero `pct` también queda `null` y la nota imprime **"aún sin
estados de cuenta"**, que es una afirmación sobre el cliente. La misma tarjeta
dice dos cosas distintas.
Consecuencia: menor que las anteriores porque el `—` de arriba ya avisa, pero
la línea que el ojo lee es la nota.
Causa raíz probable: `pct === null` se usa como proxy de "no hay datos" cuando
también significa "no se pudo leer".

### [BAJO] El guardián de "operación no pinta pesos" no mira las páginas de agentes
`src/app/dashboard/dinero_por_area.test.ts:56-68`
Escenario: `rutasDeOperacion()` recorre solo los subdirectorios DIRECTOS de
`src/app/dashboard`. `/dashboard/agentes/conductores` está declarada
`operacion` (`visibilidad.ts:92`) y su encabezado promete "CERO pesos en
pantalla", pero vive dos niveles abajo y el escaneo nunca la abre. El día que
alguien agregue `mxn(v.anticipo)` a la cola de "Esperan aceptar", la suite
sigue verde y el jefe de tráfico ve anticipos.
Consecuencia: la defensa que ya se ganó cuatro veces (el comentario del test
las lista) tiene un hueco justo donde se está construyendo todo lo nuevo.
Causa raíz probable: el escaneo se escribió cuando no existían rutas anidadas.

### [BAJO] Abajo de 1024 px no hay forma de cerrar sesión
`src/app/dashboard/chrome.tsx:81-95`
Escenario: el nombre, el rol y el `<form action={cerrarSesion}>` del user card
están dentro de contenedores `hidden lg:block`. En tablet o teléfono el único
elemento visible de la tarjeta es el avatar circular, que no es un enlace.
Consecuencia: quien abra el panel en una tableta compartida no puede salir de
su cuenta desde la interfaz.
Causa raíz probable: el user card se diseñó para el sidebar ancho y su versión
angosta no recibió sustituto.

### [BAJO] "Usuarios & Roles" pinta la clave cruda de base de datos y describe un rol que ya no existe
`src/app/dashboard/usuarios/page.tsx:99` y `:12-18`
Escenario: la columna "Rol" imprime `<StatusPill>{u.rol}</StatusPill>`, o sea
literalmente **`flota_admin`** — mientras el sidebar del mismo usuario dice
"ADMIN FLOTA" (`chrome.tsx:27`) y `/admin` dice "Dueño / Admin de flota"
(`admin/equipo/page.tsx:13`): tres nombres del mismo rol en un producto. El
mapa `ROLES` de arriba (que sí tiene texto legible) solo se usa para la
columna de descripción. Además su comentario afirma "los cinco roles que la
base admite" e incluye `operador: 'No entra a este panel: usa WhatsApp y
/mis-viajes'` — pero `0086_retirar_rol_operador.sql:97-98` dejó el dominio en
cuatro, `RolAppUser` (`lib/auth/provisionar.ts:16`) también, y `/mis-viajes`
se borró el 7-ago.
Consecuencia: deuda de etiquetas que ya no cuadran con los tipos; la clave
cruda además se lee como pantalla de administrador, no de producto.
Causa raíz probable: `Record<string, string>` en vez de
`Record<RolAppUser, …>`, que habría fallado en `tsc` al retirar `operador`.

## Refutado: FE-A1 (heredado, ALTO) — no es hallazgo hoy

La bandeja de huérfanos efectivamente no tiene guardia `monto > 0`
(`huerfanos/page.tsx:64-101`, `repo.ts:141`), pero eso es una decisión
documentada, no un descuido: `0070_montos_no_negativos.sql:26-34` explica por
qué `gasto.monto` es `>= 0` y no `> 0` ("un ticket que el OCR lee en 0 y que el
encargado corrige después vale más como fila visible en 0 que como inserción
rechazada"). Y el cero **no** se cuela en silencio: el motor lo saca de la suma
y levanta `monto_invalido` con su nota — "El comprobante de Caseta tiene un
monto inválido ($0.00) — revisar a mano" (`cuadre/engine.ts:276-279`) — que
manda la liquidación a REVISAR (`engine.ts:1155`) y se imprime en el detalle
(`[id]/page.tsx:279`) y en el PDF. Adjuntar un $0.00 produce una fila visible y
marcada, no una cifra mal. Lo dejo cerrado.

## Lo que revisé y está bien

- **Registro de Viajes** — el modelo a copiar en ventanas: declara el tope en
  pantalla, separa conteos reales (`contarViajes`) de la tabla, y el estado
  vacío distingue filtro de flota vacía (`viajes/vista.tsx:92-97, 167-170`;
  `viajes/page.tsx:41-49`).
- **Despacho** — cada lista declara su recorte con el número que falta
  (`despacho/vista.tsx:10, 93-97, 158-162, 200-202`), el tablero degrada a
  leyenda propia (`:45-50`), y "asignado sí, aviso no" se dice tal cual
  (`despacho/page.tsx:120-126`).
- **Operadores** — sin ventana (`getOperadoresDetalle` usa `traerTodo`,
  `analytics.ts:1207`), y las cuatro vigencias de licencia son honestas,
  incluida "Sin registrar" ≠ vencida (`operadores/vista.tsx:124-141`).
- **Cobranza** — bitácora con `null`/vacío separados (`cobranza/vista.tsx:125-130`),
  y la cola dice a quién NO puede escribirle y por qué (`:99-118`).
- **Error boundary del panel** — pinta el `digest` seleccionable, lo registra y
  dice explícitamente "esto NO significa que no haya liquidaciones"
  (`dashboard/error.tsx:39-70`). Ningún stack llega a pantalla.
- **Detalle de liquidación (cifras)** — los renglones son los mismos que el PDF
  (`etiquetaGasto`, `[id]/page.tsx:392-395`, atado por
  `etiquetas_panel.test.ts`), el desglose de deducibilidad se calla entero si
  no cuadra con el total (`:154-156`), y los comprobantes excluidos se
  explican (`:336-341`).
- **Formato de cifras** — no hay un solo `toLocaleString`/`toFixed` de dinero
  fuera de `lib/formato.ts`; los `toFixed` que quedan son coordenadas SVG
  (`admin/charts.tsx:22`, `mapa/mapa-vivo.tsx:34`).
- **Mapa** — nunca dice "posición actual"; lo no geocodificado se lista aparte
  con las palabras del capturista (`mapa/page.tsx:53-58`, `mapa/vista.tsx:45-62`).
- **Etiquetas de herramientas del chat** — `ETIQUETA_TOOL` (`chat.tsx:44-56`)
  cubre las 10 tools de `chat-tools.ts` más `entregar_respuesta`.
- **`MOTIVO_ERROR`** de la mesa de conciliación cubre los cinco motivos del
  tipo (`combustible-casetas/page.tsx:29-35` vs `intake/consolidado.ts:322`).
- **`ESTADO_PILL`** de suscripción está tipado por `Suscripcion['estado']`, o
  sea exhaustivo por construcción (`suscripcion/page.tsx:50-56`).
- **Contraste** — `--color-ok`, `--color-bad` y `--faint` están medidos por
  prueba en claro y oscuro (`contraste.test.ts`); recalculé a mano los pares
  nuevos del v3 (`--warn` #9a5c00 sobre `--warnbg` = 4.86:1; `--ok` #137a38
  sobre `--okbg` = 4.84:1; `--bad` #f87171 sobre `--badbg` oscuro = 6.2:1) y
  los tres pasan AA.
- **Kit compartido** — `EstadoVacio`/`EstadoError`/`EstadoCargando` existen y
  se usan; `StatusPill` nunca es solo color (`admin/ui/kit.tsx:162-179, 228-283`).
- Los `key={i}` que quedan (`[id]/page.tsx:318`, `conductores/vista.tsx:113`)
  son listas de servidor sin estado por fila ni reordenamiento: no producen el
  bug de filas de dinero que baraja. Las tablas de dinero usan `key={l.id}`.

## Lo que NO alcancé a revisar

- `src/app/admin/**` a fondo (~40 páginas). Solo abrí `ui/kit.tsx`,
  `ui/graficas.tsx`, `charts.tsx`, `equipo`, `mi-perfil`; los mapas literales
  de `admin/page.tsx`, `analitica`, `compliance`, `costos-facturacion` y
  `model-ops` (`FASE_LABEL`, `ETIQUETA_TIPO`, `ETIQUETA_ESTADO`) quedan sin
  cruzar contra sus fuentes.
- **No existen** `design-system/` ni `src/app/(portal)/` en el árbol de hoy: el
  único CSS del producto es `src/app/globals.css` (ese sí lo leí completo).
- El render REAL: no levanté preview headless (la ronda prohíbe `npm run
  build`), así que el recorte del sidebar bajo `lg` y el desborde del selector
  de tema están deducidos de las medidas del CSS, no capturados en pantalla.
- `dashboard/chat.tsx` completo (887 líneas): revisé el ciclo de envío,
  streaming y render de respuestas; no audité el panel de conversaciones, la
  búsqueda ni el lector de archivos.
- Accesibilidad de teclado y lector de pantalla más allá de los `aria-label`
  que fui encontrando: no hay auditoría de foco, orden de tabulación ni
  tamaños de toque (varios botones son de 28×28 px, bajo el mínimo de 44).
