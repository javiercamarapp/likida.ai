# Frontend — auditoría 17 · pase 5 (12-ago-2026)

**Nota: 5/10** (antes 3). Razón del movimiento: **se atacó y subió**. El CRÍTICO
del pase 4 —el panel del cliente sin navegación— está **cerrado de verdad**:
lo verifiqué con ojos que no escribieron el arreglo, contando los `href` que
salen del `<nav>` para los tres roles y revirtiendo el commit en el árbol para
comprobar que su prueba se pone roja. No sube más de 5 porque el arreglo no
tocó ninguno de los 13 hallazgos abiertos, **le devolvió el alcance a dos de
ellos** (las páginas que volvieron a ser clickeables son justo donde viven), y
al poner siete filas nuevas en una columna que antes estaba vacía destapó un
defecto responsive que nadie había podido ver: entre 768 y 1023 px esa columna
mide 72 px y las etiquetas se cortan a diez píxeles.

Riesgo mayor hoy: el Resumen —las tres tarjetas de KPI que abren la demo—
pinta blanco sobre el degradado naranja de marca a **2.1:1 – 2.6:1**, cuando el
propio repo tiene una prueba que existe porque `--color-ok` medía 2.22:1 y "es
la cifra que se proyecta en una sala iluminada". Esa prueba no mide esto.

---

## Verificación del arreglo del pase 4 (`8d6ac51`)

**Veredicto: el CRÍTICO está cerrado.** No parcialmente, no "en el camino
feliz": cerrado en las dos direcciones y con arnés que lo sostiene.

### 1. Qué `href` salen HOY del `<nav>` de `chrome.tsx:65-67`

El sidebar lee cuatro listas (`sidebar-nav.tsx:6`: `SIDEBAR_PRINCIPAL`,
`FISCAL`, `NEGOCIO`, `GESTION`) y filtra cada una con `puedeVerRuta`
(`:105`), más el "Resumen" gateado en `:111`. `SIDEBAR_PRINCIPAL`
(`rutas.ts:67`) y `FISCAL` (`:40`) siguen vacíos; `NEGOCIO` (`:34-36`) trae 1 y
`GESTION` (`:44-51`) trae 6. Cruzado contra `AREA_POR_RUTA`
(`visibilidad.ts:75-92`):

| Rol | `href` pintados | Cuáles |
|---|---|---|
| **flota_admin** | **8** | `/dashboard`, `/dashboard/combustible-casetas`, `/dashboard/arco`, `/dashboard/soporte`, `/dashboard/usuarios`, `/dashboard/politicas`, `/dashboard/suscripcion`, `/dashboard/configuracion` |
| **contador** | **2** | `/dashboard/combustible-casetas` (sección "Negocio"), `/dashboard/suscripcion` (sección "Cuenta") |
| **encargado** | **3** | `/dashboard`, `/dashboard/arco`, `/dashboard/soporte` |
| **superadmin** sin `?rol=` | **8** | las mismas del dueño, con sufijo `?vista=demo` (`sidebar-nav.tsx:87`) |

El escenario exacto del CRÍTICO —`/admin` → "Contador"
(`admin/selector-vista.tsx:54`) → `?vista=demo&rol=contador`— ya **no** deja el
`<nav>` vacío: `rolMenu = 'contador'` (`sidebar-nav.tsx:99`) y salen 2 links.

### 2. ¿Quedó alguna página viva sin link? ¿Algún link a página borrada?

- Páginas con `page.tsx` bajo `src/app/dashboard/`: **9**
  (`[id]`, `arco`, `combustible-casetas`, `configuracion`, raíz, `politicas`,
  `soporte`, `suscripcion`, `usuarios`).
- `TODAS_LAS_RUTAS` (`rutas.ts:55-58`) enumera **8** y **las 8 existen en
  disco**. Ningún `href` cuelga de una de las 35 borradas — recorrí todos los
  `href="/dashboard…"`, `redirect('/dashboard…')` y `revalidatePath` del repo
  (14 sitios, ninguno muerto).
- **La única página viva sin un solo enlace entrante sigue siendo
  `/dashboard/[id]`** — la del expediente y el botón "Descargar PDF"
  (`[id]/page.tsx:191`). Es ruta dinámica y por construcción no puede estar en
  `rutas.ts`, así que el arreglo del sidebar no la alcanza. Sigue abierta como
  ALTO (ver hallazgos).

### 3. ¿La prueba falla de verdad si se revierte el arreglo?

Sí. Lo comprobé sobre el árbol, no leyéndolo:

```
$ git show 8d6ac51^:src/app/dashboard/sidebar-nav.tsx > src/app/dashboard/sidebar-nav.tsx
$ npx vitest run src/app/dashboard/sidebar_puerta.test.tsx
 Tests  4 failed | 1 passed (5)
  × a flota_admin no le falta ninguna puerta
      /dashboard/combustible-casetas /dashboard/arco /dashboard/soporte
      /dashboard/usuarios /dashboard/politicas /dashboard/suscripcion
      /dashboard/configuracion          (7 faltantes)
  × a contador no le falta ninguna puerta
      /dashboard/combustible-casetas /dashboard/suscripcion   (2 faltantes)
  × a encargado no le falta ninguna puerta
      /dashboard/arco /dashboard/soporte                      (2 faltantes)
  × el contador no se queda con el menú en blanco
      AssertionError: expected 0 to be greater than 0
$ git checkout -- src/app/dashboard/sidebar-nav.tsx
$ git status --short
 M docs/auditoria-17/MAPA.md        ← lo único modificado, y ya lo estaba
```

Con el arreglo puesto: **5/5 verdes** (30 ms). El árbol quedó limpio.

La prueba mide lo correcto: renderiza el componente REAL con
`renderToStaticMarkup` y afirma sobre los `href` del HTML
(`sidebar_puerta.test.tsx:41-44`), no sobre una lista paralela. Y cubre la
dirección contraria (`:73-80`: ningún link que el rol no pueda abrir), que es
la mitad que suele faltar.

### 4. El guardarraíl viejo (`visibilidad.test.ts:85-125`): ¿sigue con el hueco?

**Sí, intacto.** `const todas = [...INICIO, ...NEGOCIO, ...OPERACION,
...FISCAL, ...DOCUMENTOS_DINERO, ...GESTION]` (`visibilidad.test.ts:89`) se
sigue armando de las **seis** constantes de sección, no de lo que el componente
importa; su caso *"está en el sidebar, no solo en el mapa de áreas"* (`:125`)
seguiría verde con el bug. Nadie lo tocó, y está bien que no: hoy no es el
guardarraíl de esa regla, `sidebar_puerta.test.tsx` lo es.

**Hueco residual, honesto:** `hrefsEsperados` (`sidebar_puerta.test.tsx:47-49`)
deriva de `TODAS_LAS_RUTAS`, que a su vez (`rutas.ts:57`) se arma de esas
**mismas seis** constantes. O sea: una séptima constante que alguien agregue a
`rutas.ts`, importe en el sidebar y olvide meter en `TODAS_LAS_RUTAS` no
dispararía el caso de "faltantes". El modo de falla que de verdad ocurrió —una
lista viva en `rutas.ts` que el sidebar no importa— **sí** queda cazado, que es
lo que se pedía. No lo reporto como hallazgo: sería pedir un arnés del arnés.

---

## Hallazgos

### [ALTO] El expediente de la liquidación y su "Descargar PDF" siguen sin un solo enlace entrante

`src/app/dashboard/[id]/page.tsx:191` (`<a href={\`/api/export/pdf/${d.id}\`}>`),
`:169` (su "← Panel", que es solo salida); enlaces entrantes hoy: **cero**
(`grep` de `href.*"/dashboard` → 14 sitios, ninguno apunta a `/dashboard/<uuid>`).

Escenario: el contralor pide "enséñame la liquidación de TI-0412 y el PDF que
le llega a mi contador". El presentador ya tiene sidebar (el arreglo funcionó),
clickea las 8 puertas, y en ninguna hay una tabla de liquidaciones ni un
"Ver →": las dos que enlazaban (`dashboard/cuadre` y `dashboard/analitica`) se
borraron en `2be4b1c`. La única forma es pegar en la barra de direcciones el
UUID de `liquidacion.viaje_id`, que nadie tiene a la vista.

Consecuencia: el entregable del producto —"entrega la liquidación en PDF",
primera línea de `CLAUDE.md`— no se puede enseñar desde la interfaz. Es también
la única pantalla con el desglose de IVA/IEPS y la deducibilidad por renglón
(`:240-261`), que es lo que el contralor cruza contra su contador.

Causa raíz probable: nada mecánico vigila los enlaces *entrantes* de una ruta
dinámica; `sidebar_puerta.test.tsx` solo puede cubrir las estáticas.

(REINCIDENTE — del pase 4, sin cambios.)

---

### [ALTO] El panel del jefe de tráfico le grita "3 viajes sin chofer" y no tiene con qué asignarlos

`src/app/dashboard/inicio-operacion.tsx:55-57` (arma la banda de urgentes),
`:111-120` (la pinta con `StatusPill estado="warn">Atender`), `:148-158` (la
lista "Sin asignar": `<li>` de puro texto, ni un `<select>` ni un `<form>` en
toda la pantalla); `src/app/dashboard/tablero-operacion.tsx:13-15` (el
comentario que deja constancia de que `TablaSinAsignar`/`FormaAlta` **no** se
movieron); `src/app/dashboard/[id]/page.tsx:54` (la otra vía, negada a este rol).

Escenario con valores: 3 viajes `abierto` sin `operador_id`. El encargado entra
a `/dashboard`, `page.tsx:355-357` lo manda a `InicioOperacion`, y lee
**"Atender · 3 viajes sin chofer."** con los folios `TI-0412`, `TI-0413`,
`TI-0414` debajo. Ninguno es clickeable. `/dashboard/despacho` (donde vivía el
`<select>` de operador y la server action `asignar`) se borró; `/dashboard/<id>`
sí tiene "Reasignar" (`[id]/page.tsx:209-219`, y `puedeAsignar` **sí** incluye
a `encargado`) pero la página entera se le niega antes en `:54`
(`puedeVerArea(rol,'dinero')`, y el encargado solo tiene `operacion`).

Consecuencia: el usuario diario recibe una alerta que le exige actuar y el panel
no le da con qué — exactamente lo que el propio archivo dice evitar en `:52-53`
(*"una banda de alertas que siempre dice algo entrena a ignorarla"*). Es la
tercera de las tres vistas de `admin/selector-vista.tsx:61`.

(REINCIDENTE — del pase 4, sin cambios.)

---

### [ALTO] "Litros elegibles para el estímulo: 0.00 L", con la cita de la LIF al lado, cuando la consulta se cayó

`src/app/dashboard/combustible-casetas/page.tsx:188`
(`valor={acred?.litrosDiesel ?? 0}` con `nota="LIF 2026, Art. 20-A"` en `:189`),
contra su vecino de `:191-193`, que sí lo hace bien.

Escenario: `getAcreditables` lanza; `safe()` (`:37-39`) lo convierte en `null`;
`?? 0` lo aplana. La flota comprueba 4,200 L de diésel ese mes y la tarjeta dice
**0.00 L** bajo el rótulo "Litros elegibles para el estímulo · LIF 2026, Art.
20-A". `porConcepto === null` sí tiene su rama de error (`:177-178`), pero
`acred` es otra consulta y no la comparte, así que la sección se pinta "sana"
con un cero inventado adentro.

Consecuencia: el número que sostiene el argumento de venta (el estímulo de IEPS
al diésel) se lee como "esta flota no acredita nada" en vez de "no se pudo
leer" — la regla que `CLAUDE.md` pone primero. El tile de al lado (`:191`) usa
`vacio={pctSinCfdi === null ? … }` y demuestra que el patrón correcto ya existe
en el mismo `KpiTile`, dos líneas abajo.

(REINCIDENTE — del pase 1, **5ª ronda**.)

---

### [ALTO] "Aún no hay viajes registrados" cuando `getViajesPorMes` se cayó

`src/app/dashboard/page.tsx:315` (`porMes={viajesPorMes ?? []}`),
`src/app/dashboard/actividad.tsx:54` (`porMes.every((d) => d.valor === 0)`) y
`:59` (el texto), `src/app/dashboard/estado.ts:30` (mira 4 consultas de las 12).

Escenario: la flota tiene 340 viajes históricos. `getViajesPorMes` falla,
`safe()` devuelve `null`, `?? []` lo aplana a arreglo vacío, `sinDatos` sale
`true` y la sección "Actividad" en modo Histórico afirma **"Aún no hay viajes
registrados."**. Y no hay aviso de degradación: `estadoPanel` solo vigila
`acreditables`, `kpis`, `liquidaciones` y `anomalias` (`estado.ts:30`), así que
la rama `'parcial'` (`page.tsx:223-235`) no se dispara y la pantalla se ve
íntegra.

Consecuencia: la afirmación más fuerte que el panel puede hacer sobre el negocio
del cliente —"no tienes viajes"— se emite estando ciego. Es la misma clase de
fallo que `estado.ts:10-12` documenta querer impedir.

(REINCIDENTE — del pase 2.)

---

### [ALTO] El asistente expandido bajo 1280 px deja el panel invisible, y `8d6ac51` le devolvió el alcance

`src/app/dashboard/rail.tsx:105` (`hidden xl:flex`),
`src/app/dashboard/rail-marca.ts:26-30` (la marca solo mira `expandido` y
`pathname`, nunca el viewport), `src/app/globals.css:213-224`
(`:root[data-asistente="expandido"] .columna-centro { opacity: 0;
pointer-events: none }`).

Escenario con valores: en `/dashboard/combustible-casetas` a 1440 px, el
presentador expande el asistente (`rail.tsx:113`). `marcaAsistente` pone
`data-asistente="expandido"` en `<html>` y el CSS retira la columna central.
Ahora el proyector no se lee y sube el zoom del navegador a 125 %: el viewport
CSS pasa a 1152 px, `hidden xl:flex` deja de pintar el `<aside>` — **pero el
componente no se desmonta, así que la marca sigue puesta**. Queda el sidebar,
un fondo, y ningún control para revertirlo: el botón "Contraer chat"
(`rail.tsx:112-120`) vive dentro del `<aside>` que acaba de desaparecer.

Consecuencia: pantalla en blanco irrecuperable sin recargar, delante del
comprador. Y esto vuelve a importar hoy: en el pase 4 el escenario era
inalcanzable porque `/dashboard` es la única ruta donde el rail devuelve `null`
(`rail.tsx:90`) y era la única página a la que se llegaba. `8d6ac51` reabrió las
otras siete, que son justo donde el rail sí se pinta.

Causa raíz probable: `marcaAsistente` es la regla correcta con un eje de menos
—se protegió de la ruta y no del breakpoint que decide si el `<aside>` existe.

(REINCIDENTE — del pase 1, **6ª ronda**; alcance restaurado por `8d6ac51`.)

---

### [MEDIO · NUEVO] Las tres tarjetas de KPI del Resumen pintan blanco sobre el degradado naranja: 2.1:1 – 2.6:1

`src/app/dashboard/resumen-visual.tsx:121` (`className="… text-white …"`),
`:122` (`background: DEGRADADO_MARCA`), `:125` (etiqueta `text-xs` +
`opacity-85`), `:126` (la cifra, `text-xl font-semibold`);
`:42` (`DEGRADADO_MARCA = linear-gradient(135deg, var(--g3) 0%, var(--marca) 100%)`);
`src/app/globals.css:85` (`--g3: #f2913f`), `:94` (`--marca: #c2410c`);
mismo problema en `src/app/dashboard/sidebar-nav.tsx:22`
(`estiloItem` → `color: var(--marca-fg)` = `#ffffff` sobre el mismo degradado).

Escenario con valores medidos (WCAG 2.1, misma fórmula que
`dashboard/contraste.test.ts:25-35`). El degradado va a 135° sobre una tarjeta
de ~360×90; el texto vive en el borde IZQUIERDO, o sea en el extremo `--g3`
(#f2913f, L = 0.395). A ~10 % del recorrido el color es ≈ `#ed8839`:

| Elemento | Color efectivo | Contraste | AA pide |
|---|---|---|---|
| "Gasto total — últimos 7 días" (12 px, blanco al 85 %) | ≈ `#fdeee2` sobre `#ed8839` | **2.09:1** | 4.5:1 |
| "$184,320.00" (20 px semibold, blanco puro) | `#ffffff` sobre `#ed8839` | **2.57:1** | 3:1 (texto grande) |
| Lo mismo en el punto MEDIO del degradado | `#ffffff` sobre `#da6926` | **3.48:1** | 4.5:1 para la etiqueta |
| Item activo del sidebar (14 px medium) | `#ffffff` sobre `#ed8839` | **2.57:1** | 4.5:1 |

Ni en el extremo más oscuro (`#c2410c`, 5.18:1 en blanco puro) la etiqueta al
85 % de opacidad llega a 4.5:1.

Consecuencia: son "Gasto total", "Costo por viaje" y "Ahorro generado —
Ejercicio 2026", las tres cifras con las que abre el demo, y el sitio donde una
sala iluminada castiga más. Es la misma clase exacta de defecto que ya costó una
ronda: `contraste.test.ts:11-13` existe porque `--color-ok` medía 2.22:1 y era
"la cifra que se proyecta en una sala iluminada". La prueba mide `--color-ok`,
`--color-bad` y `--faint` **contra `--surface` y `--bg`** — nunca una tinta
sobre un color de componente, así que este caso está fuera de su alcance por
construcción.

Prueba de que alguien ya conocía el problema en este mismo archivo: el hero usa
el MISMO `DEGRADADO_MARCA` y escribe con tinta oscura `#1a1207`
(`resumen-visual.tsx:77` y `:80`) — **7.85:1** sobre `#f2913f`. Dos tratamientos
del mismo fondo, a 45 líneas de distancia.

Segunda instancia del mismo agujero, más barata: `top-rutas.tsx:11`, la píldora
de región "Golfo" usa `#0891b2` a `text-xs` — **3.68:1** sobre blanco (las otras
seis regiones pasan: 5.02 – 6.28:1).

Causa raíz probable: el guardarraíl de contraste vigila los *tokens*, y todo
color escrito directamente en un componente (`text-white`, `#0891b2`) queda
fuera de su universo.

---

### [MEDIO · NUEVO] Entre 768 y 1023 px el sidebar recién restaurado corta las etiquetas a diez píxeles

`src/app/marco.ts:22-23` (`MARCO_SIDEBAR = 'glass-panel w-[72px] lg:w-[232px] …
overflow-hidden'`), `src/app/dashboard/chrome.tsx:65-67` (mete `<SidebarNav>` en
esa columna **sin** ninguna variante colapsada), `src/app/dashboard/sidebar-nav.tsx:10`
(`ITEM = 'flex items-center gap-2.5 px-2.5 py-2 … text-sm'`, sin `truncate` ni
`hidden lg:inline`), `:39` (el encabezado de `Seccion`, igual), `:46`
(`<Icono …/> {nombre}` — el nombre es un nodo de texto suelto, ni siquiera hay
un `<span>` al que colgarle una clase).

Aritmética, con los números del árbol: `aside` = 72 px; `nav px-2` → 56; item
`px-2.5` → 36; ícono 16 + `gap-2.5` 10 = 26 → quedan **≈ 10 px** para
"Combustible & Casetas". El encabezado "NEGOCIO" (`text-[11px]` uppercase
`tracking-wide`, ≈ 55 px) tiene 36 y sale como "NEG". Con `overflow-hidden` en
el `aside` no hay elipsis ni scroll: se corta a filo.

Escenario: el contralor abre el panel en un iPad en vertical (768 px CSS), o el
presentador sube el zoom del navegador a 150 % en un portátil de 1440
(→ 960 px CSS). Antes de `8d6ac51` ahí no se veía nada porque el `<nav>` estaba
vacío; hoy se ven **ocho filas y dos encabezados** de texto cortado a mitad de
letra.

Consecuencia: en ese rango el panel del cliente se lee como una interfaz rota, y
el rango incluye la tableta y el zoom de sala, que son dos formas normales de
mirarlo.

`/admin` ya resolvió esto y lo dejó escrito: `admin/layout.tsx:62-67` documenta
el criterio ("colapsa a solo íconos entre `md` y `lg`") y `:81-82` lo implementa
con dos componentes, `<div className="hidden lg:block"><SidebarNav/></div>` y
`<div className="lg:hidden"><SidebarNavIconos/></div>`. `chrome.tsx` comparte
`marco.ts` con él pero no ese par. Mismas medidas, dos comportamientos.

Causa raíz probable: `8d6ac51` llenó una columna cuyo estado colapsado nunca se
había ejercitado, porque hasta ayer estaba vacía.

---

### [MEDIO · NUEVO] "Usuarios & Roles" —la pantalla cuyo trabajo es decir quién es quién— imprime la clave cruda de la base

`src/app/dashboard/usuarios/page.tsx:106`
(`<StatusPill estado={…}>{u.rol}</StatusPill>`), con el encabezado "Rol" en `:92`.

Escenario con valores: el contralor abre Usuarios & Roles (link nuevo del
sidebar, sección "Cuenta") y su propia fila dice, en la columna **Rol**:
`flota_admin`. La de su contador: `contador`. La del jefe de tráfico:
`encargado`. Snake_case, minúsculas, tal como sale del `check constraint` de
`app_user.rol`.

Y no cuadra con lo que el mismo usuario ve tres centímetros a la izquierda: el
badge del sidebar de esa misma sesión dice **"ADMIN FLOTA"**
(`chrome.tsx:26-32`, `ROL_BADGE`). Hay cuatro mapas de rol en el producto y
los cuatro coinciden en la etiqueta legible —`admin/equipo/page.tsx:13-18`
(`Record<RolAppUser,string>`, "Dueño / Admin de flota"),
`admin/mi-perfil/page.tsx:9`, `dashboard/aviso-rol.tsx:7-11` ("Dueño de la
flota"), `chrome.tsx:26`— y esta columna no usa ninguno. El mapa `ROLES` que la
propia página declara en `:12-18` se usa solo para la columna "Qué puede hacer"
(`:109`).

Consecuencia: la pantalla que el contralor abre para entender la matriz de
permisos de su empresa le enseña identificadores de base de datos, y el mismo
rol se lee de dos maneras distintas en dos pantallas de la misma sesión.

---

### [MEDIO · NUEVO] Soporte imprime categoría, prioridad y estado crudos del `check constraint`

`src/app/dashboard/soporte/page.tsx:110` (`{t.categoria}`), `:111`
(`{t.prioridad}`), `:113-115` (`<StatusPill …>{t.estado}</StatusPill>`) — la
página no declara ni un mapa de etiquetas.

Escenario con valores: un ticket abierto por facturación, prioridad alta, que ya
se contestó y espera respuesta del cliente. La fila sale:
`facturacion` · `alta` · `en_proceso`. Los dominios son
`('facturacion','operacion','tecnico','cuenta','otro')`,
`('baja','media','alta','urgente')` y
`('abierto','en_proceso','esperando','resuelto','cerrado')`
(`supabase/migrations/0051_soporte_y_cotizacion.sql:41-44`). O sea: sin acento
en "facturacion", con guion bajo en "en_proceso", y todo en minúscula dentro de
una tabla que a su lado sí formatea la fecha con `fechaMx` (`:117`).

Y el color miente por omisión: `:113` pinta `warn` (naranja) para cualquier
estado que no sea `resuelto`/`cerrado`, así que un ticket recién abierto con 23
horas de SLA por delante sale con la misma insignia de alerta que uno vencido.

Consecuencia: se degrada y se nota, en una pantalla que el sidebar ahora enlaza
para tres roles. Es la única de las ocho páginas vivas sin mapa de etiquetas:
`arco/page.tsx:14-16` mapea sus 4 tipos y despliega el estado con ternarios en
`:130`; `estatus.ts:17-26` cubre los 3 de `EstatusLiquidacion` y hasta tiene
prueba (`etiquetas_sincronizadas.test.ts`);
`combustible-casetas/page.tsx:29-35` cubre los 5 motivos de
`ResultadoResolverLinea` uno por uno.

Causa raíz probable: el pase 4 dejó `soporte/page.tsx` explícitamente sin leer
("solo verifiqué que existe"), y hasta `8d6ac51` no tenía un solo enlace
entrante, así que nadie la miró.

---

### [MEDIO] "Vencen pronto (≤ 5 días)" cuenta solo lo que YA venció

`src/app/dashboard/arco/page.tsx:71` (`venceEn(s.venceEn) <= hoy`), rótulo en
`:87`, `hoy` en `:31` (`new Date().toISOString()`, UTC).

Escenario: una solicitud ARCO recibida con vencimiento el 15-ago y hoy es 12-ago.
Vence en 3 días → tiene que contar. `'2026-08-15' <= '2026-08-12'` es `false` →
el KPI dice **0** bajo el rótulo "Vencen pronto (≤ 5 días)". Solo entra cuando
ya se pasó el plazo, momento en que el rótulo es falso en la otra dirección.

Consecuencia: el plazo de 20 días hábiles del art. 32 LFPDPPP se pasa sin que el
tablero lo haya anunciado ni una vez. La flota es la responsable obligada, y la
única alarma que tiene está apagada.

(REINCIDENTE — del pase 1, **5ª ronda**.)

---

### [MEDIO] El panel manda al chofer a `/mis-viajes`, que devuelve 404

`src/app/dashboard/usuarios/page.tsx:16`
(`operador: 'No entra a este panel: usa WhatsApp y /mis-viajes'`), dentro del
`ROLES` de `:12`.

`/mis-viajes` y `/chofer` se borraron el 7-ago-2026 con el retiro del rol
`operador` (mig. `0086`); `src/app/` no tiene esa carpeta. El texto lo lee el
dueño de la flota mientras decide cómo dar de alta a su gente.

(REINCIDENTE — del pase 1.)

---

### [MEDIO] Un pill gobierna cinco ventanas de tiempo y ninguna sección la rotula

`src/app/dashboard/panel-periodo.tsx:47-51` (las cinco derivadas del mismo
`modo`), pill en `:55-65`, y los `TituloSeccion` de `:70` ("Viajes"), `:83`
("Actividad"), `:93` ("Gasto por categoría"), `:103` ("Liquidado") y `:125`
("Top rutas por gasto") — ninguno dice de qué ventana habla. La cifra grande de
`:105` (`mxn(totalLiquidado)`) tampoco.

Escenario: el contralor deja el pill en "Histórico", baja a "Liquidado", ve
**$2,840,500.00** y lo cita como el mes. El pill quedó cinco secciones arriba,
fuera del scroll.

Que hay una forma correcta a la vista lo prueban las tarjetas de al lado:
`kpi-periodo.tsx:66` rotula `${nombre} — ${ETIQUETA_MODO[modo]}` y
`motor-fiscal-periodo.tsx:63,70` imprime la ventana bajo cada cifra.

(REINCIDENTE — del pase 2.)

---

### [MEDIO] "Aún no hay gastos capturados" con la consulta caída

`src/app/dashboard/panel-periodo.tsx:95-99` — `gastoModo && gastoModo.series.some(…)`
colapsa `null` (la consulta murió) y `[]` (de verdad no hay) en el mismo texto.
Sus dos hermanas del mismo archivo sí los distinguen: `:108-111` ("No se pudo
cargar esta gráfica" vs "Sin cierres en este periodo") y `:127-131`.

(REINCIDENTE — del pase 2.)

---

### [MEDIO] "Diésel" en el Resumen, "Combustible" en el PDF, en Combustible & Casetas y en Políticas

`src/app/dashboard/gasto-semanal-chart.tsx:9-13` (`CONCEPTO_LABEL`, con
`diesel: 'Diésel'`, `caseta: 'Casetas'`, `otro: 'Otros'`), usado en `:40` y
`:75`; contra `src/lib/likida/cuadre/engine.ts:1191-1198`
(`etiquetaConcepto('diesel')` sin `ocrExtra` devuelve **'Combustible'**) y
`:1201` (`label()` dice 'Caseta' y 'Otro', en singular, con el comentario
*"tiene que decir lo MISMO que pdf.ts y el dashboard"*).

Escenario con valores: la leyenda de "Gasto por categoría" en el Resumen dice
**Diésel · $412,800**. El contralor clickea "Combustible & Casetas" en el
sidebar y la misma cubeta aparece como **Combustible · $412,800**
(`combustible-casetas/page.tsx:202,205`). Abre Políticas y el renglón se llama
**Combustible** (`politicas/page.tsx:155`). Descarga el PDF: **Combustible**.
Tres nombres, un número.

Peor en la dirección fiscal: `etiquetaConcepto` se salta el mapa para
combustible precisamente porque el estímulo de IEPS es SOLO diésel (LIF 20-A
fr. IV) y un ticket de Magna capturado como `diesel` debe leerse "Combustible
Magna" (`[id]/page.tsx:386-397` lo explica entero). La gráfica del Resumen
agrupa por `concepto` sin `ocrExtra`, así que rotula "Diésel" una cubeta que
puede traer gasolina.

`etiquetas_sincronizadas.test.ts:37` ancla el mapa de `[id]/page.tsx`, no éste.

(REINCIDENTE — del pase 3; agravado porque las dos pantallas que se contradicen
ya son alcanzables con un clic cada una.)

---

### [MEDIO] "Gasto por categoría" desborda su columna en Mensual y en Histórico

`src/app/dashboard/gasto-semanal-chart.tsx:50` (la fila de clusters, sin
`min-w-0` ni `overflow-x`), la celda de `panel-periodo.tsx:91-101` (tampoco), y
el ancestro que recorta: `page.tsx:165` (`glass-panel overflow-hidden`).

A 1440 px: 1440 − 16 − 232 − 16 − 16 = 1160; `px-5` → 1120; `md:grid-cols-2
gap-4` → celda 552; menos el eje Y de 44 (`:45`) y el `gap-2` → **500 px** de
pista. Con `min-content` ≈ 27 px por cluster (`2026-S32` a `text-[11px]`) y
`gap-3` = 12:

| Vista | Clusters | Mínimo | 1440 | 1366 | 1280 |
|---|---|---|---|---|---|
| Semanal | 5 | 183 px | ✔ | ✔ | ✔ |
| Mensual | 13 | 495 px | ✔ (por 5 px) | ✘ | ✘ |
| Histórico | 52 | **2 016 px** | ✘ | ✘ | ✘ |

El recorte es `hidden`, no `auto`: lo que se sale no se puede recuperar con
scroll, desaparece.

(REINCIDENTE — del pase 2.)

---

### [MEDIO] Las flechas de periodo miden 16 × 16 px y van a 2 px una de otra

`src/app/dashboard/kpi-periodo.tsx:10` (`BOTON = 'w-4 h-4 …'`) + `:76`
(`gap-0.5`); `src/app/dashboard/motor-fiscal-periodo.tsx:7` (idéntico) + `:49`
(`gap-0`, o sea pegadas).

WCAG 2.5.8 pide 24 × 24 CSS px de objetivo. Son seis pares de flechas en el
Resumen (3 KPI + 1 motor fiscal), cada una de 16 px, y en `motor-fiscal-periodo`
sin separación: el "‹" y el "›" comparten borde, así que el dedo que apunta a
"periodo más corto" abre el más largo.

(REINCIDENTE — del pase 2.)

---

### [MEDIO] El chat se queda "expandido" al navegar, y el escenario volvió a ser alcanzable

`src/app/dashboard/rail.tsx:40` (`useState(false)` que nadie reinicia), `:90`
(`if (pathname === RUTA_SIN_RAIL) return null`), `rail-marca.ts:26-30`.

Escenario, con los clics que `8d6ac51` devolvió: sidebar → "Privacidad (ARCO)"
→ expandir el asistente → sidebar → "Resumen" (el rail devuelve `null`, la marca
se limpia, todo se ve bien) → sidebar → "Soporte & Quejas". El asistente
reaparece **a pantalla completa** sobre una página que nunca se pidió así,
porque `expandido` vive en un componente montado en el layout y sobrevive a la
navegación.

En el pase 4 esto quedó anotado como "escenario degradado: hoy solo se alcanza
tecleando URLs". Ya no: son tres clics de sidebar, exactamente como se reportó
la primera vez.

(REINCIDENTE — del pase 3; escenario restaurado por `8d6ac51`.)

---

### [MEDIO] "Actividad" bucketea con la zona horaria del proceso

`src/app/dashboard/actividad.tsx:20-21` (`new Date()` + `setHours(0,0,0,0)`,
hora local del runtime) y `:25` (`d.toISOString().slice(0,10)`, que vuelve a
UTC), contra `fechaInicio`, que es columna `date` de México. `TZ_MX` existe en
`analytics.ts` y aquí no se usa.

En Vercel el proceso corre en UTC: entre las 18:00 y las 24:00 hora de México el
`hoy` local ya es el día siguiente, y la barra de "hoy" del gráfico de 7 días
queda corrida un día respecto de las cifras que tiene arriba.

(REINCIDENTE — del pase 3.)

---

### [MEDIO] `/admin/model-ops` rotula 3 de las 6 fases del pipeline

`src/app/admin/model-ops/page.tsx:29` (`FASE_LABEL` con `ocr`, `cuadre`,
`whatsapp`) usado en `:108`, contra `src/lib/likida/costos.ts:41`
(`FaseCosto = 'ocr' | 'cuadre' | 'escalacion' | 'chat' | 'router' | 'whatsapp'`).

Un gasto de la fase `escalacion` cae al `?? f.fase` y la dona lo etiqueta
`escalacion`, minúscula y cruda, junto a "Agente de Cuadre". Las otras tres
copias del mapa sí cubren las seis (`admin/page.tsx:21`,
`admin/analitica/page.tsx:11`, `admin/costos-facturacion/page.tsx:63`), así que
la misma fase se lee distinto en dos pantallas de la misma consola.

Solo la usa Javier; por eso MEDIO y no más.

(REINCIDENTE — del pase 3.)

---

### [BAJO] El eje de pesos mezcla centavos y enteros

`src/app/dashboard/gasto-semanal-chart.tsx:17-19` (`marcasEje` reparte `max` en
cuartos, sin redondear a un múltiplo legible) + `:47`
(`mxn(v).replace('.00','')`). Con `max = 37,412.55` el eje sale
`$37,412.55 / $28,059.41 / $18,706.28 / $9,353.14 / $0` — cuatro decimales
distintos y solo el cero pierde los centavos, porque el `.replace` únicamente
acierta cuando la cifra ya era redonda.

(REINCIDENTE — del pase 3.)

---

### [BAJO · NUEVO] El sidebar restaurado no le dice a un lector de pantalla en qué página estás

`src/app/dashboard/sidebar-nav.tsx:45` y `:113` (los dos `<Link>`; el estado
activo se comunica **solo** con `style={estiloItem(activo)}`, o sea color),
`src/app/dashboard/chrome.tsx:65` (el `<nav>` sin `aria-label`).
`grep -rn "aria-current" src/app` → **cero** ocurrencias en todo el producto;
`admin/layout.tsx:80` tiene el mismo hueco.

Con `aria-current="page"` ausente, un usuario de lector de pantalla oye ocho
enlaces idénticos en estructura y no sabe cuál corresponde a la pantalla que
tiene abierta; el único indicador es el degradado, que es justamente el que
falla contraste (arriba). Un producto que se vende a un departamento de
administración va a topar con esto en la primera revisión de accesibilidad de un
cliente corporativo.

---

## Hallazgos de pases anteriores que YA NO APLICAN

| # | Estado |
|---|---|
| **P4-CRÍTICO** El panel del cliente se quedó sin navegación | **CERRADO POR ARREGLO** — `8d6ac51`, verificado arriba de forma independiente: 8/2/3 `href` para dueño/contador/encargado, prueba que se pone roja 4/5 al revertir |
| **P2-ALTO 6** 16 páginas del panel sin un solo link | **CERRADO** — subsumido en el anterior; hoy 7 de las 8 estáticas tienen link y la 8ª (`/dashboard`) es la raíz. Queda solo `[id]`, que se reporta aparte por ser ruta dinámica |
| **P1-2** "Comprobación del periodo" no filtra por fecha | CERRADO POR SUPRESIÓN (`dashboard/cuadre/`, `2be4b1c`) |
| **P1-3** "PDF por liquidación" pierde el `?tenant=` | CERRADO POR SUPRESIÓN (`dashboard/analitica/`, `2be4b1c`) |
| **P3-MEDIO 2** El mensaje crudo de PostgREST en la pantalla del contador | CERRADO POR SUPRESIÓN (`dashboard/contador/comun.tsx`, `003c88a`). Sobrevive la variante truncada, `arco/page.tsx:97` (`errorCarga.slice(0,120)`), que no elevo: dice explícitamente que no se pudo leer y no afirma vacío |
| **P2-CRÍTICO** Volver a "Resumen" con el chat expandido deja el panel en blanco | CERRADO POR ARREGLO (`d7b71a8`); `rail-marca.ts:28` sigue puesto y `rail_marca.test.ts` verde |
| **P2-ALTO 2** "Ahorro generado $0.00" con la consulta caída | CERRADO POR ARREGLO (`b9a191c`); hoy `page.tsx:265` es `resumenPerdidas?.montoRecuperable ?? null` |
| **P2-ALTO 4** "Costo por viaje $0.00" | CERRADO POR ARREGLO (`e47b124`); `kpi-periodo.tsx:70` |

---

## Lo que revisé y está bien

**Los mapas literales del panel contra `src/types/likida.ts` y los dominios de
la base — el trabajo obligatorio del rubro, recorrido entero, no una muestra.**
`grep "Record<string," src/app` da 21 sitios fuera de pruebas y los abrí todos.
Sanos:

- `MOTIVO_ERROR` (`combustible-casetas/page.tsx:29-35`) — los **5** valores de
  `ResultadoResolverLinea.motivo`, uno por uno, con `?? 'No se pudo resolver la
  línea.'` en `:167`. Sigue siendo el mejor hecho del panel.
- `CONCEPTO_LABEL` de `gasto-semanal-chart.tsx:9-13` — **cubre las 9 claves** de
  `ConceptoGasto` (`types/likida.ts:20-25`), ninguna falta. Su problema es otro
  (qué palabra usa), no cobertura.
- `CONCEPTO` de `[id]/page.tsx:29-33` — las mismas 9, y solo entra como red
  cuando `etiquetaConcepto` devuelve la clave cruda (`:399-402`).
- `ESTATUS`/`etiquetaEstatus` (`estatus.ts:17-26`) — los 3 de
  `EstatusLiquidacion`, con clave cruda en gris para un cuarto;
  `etiquetas_sincronizadas.test.ts` lo ata al tipo.
- `ETIQUETA_TIPO` (`arco/page.tsx:14-16`) y los de `admin/compliance/page.tsx:14,17`
  — las 4 y 4 claves exactas de `arco_tipo_dominio`/`arco_estado_dominio`, con `?? s.tipo`.
- `ESTADO_PILL` (`suscripcion/page.tsx:50-56`) — `Record<Suscripcion['estado'],…>`,
  cerrado por `tsc`, las 5 de `suscripcion_estado_dominio`
  (`0052:66-67`). El de facturas (`:446`) cubre las 4 de
  `factura_saas_estado_dominio` (`0052:98-99`) con el default en 'Cancelada',
  que es la cuarta real: no hay quinta.
- `COLOR_REGION` (`top-rutas.tsx:9-12`) — las 7 regiones que `regionDe`
  (`analytics.ts:949-956`) puede devolver; `colorDe` cae a `--muted` y el texto
  a "Sin clasificar".
- `ETIQUETA_MODO` (`kpi-periodo.tsx:14-18`, `motor-fiscal-periodo.tsx:11-13`) —
  `Record<Modo,string>`, un cuarto modo rompe la compilación.
- `ROL_LABEL` (`admin/equipo/page.tsx:13-18`) — `Record<RolAppUser,string>`, el
  único mapa de roles que `tsc` protege.
- `FASE_LABEL` de `admin/page.tsx:21`, `admin/analitica/page.tsx:11` y
  `admin/costos-facturacion/page.tsx:63` — las 6 de `FaseCosto`. La cuarta copia
  (`model-ops`) es el reincidente de arriba.

**El arreglo del ALTO vecino (`58c44f9`, `[id]/id.ts`).** No es mi rubro pero
toca mi pantalla: `esIdDeLiquidacion` (`id.ts:26-28`) valida el UUID **antes**
de la consulta (`[id]/page.tsx:62`), así que un marcador viejo a
`/dashboard/viajes` da 404 y no la pantalla de error. Verificado que el orden es
el correcto y que `exigir()` no se aflojó.

**Estados vacío / error / parcial de las ocho páginas vivas**, uno por uno:
`combustible-casetas:66-76` (`safeConciliacion` distingue a propósito "nunca
llegó un consolidado" de "la consulta falló" — el patrón correcto del repo),
`:177-178`, `:221-222`, `:253-254`, `:278-282`;
`soporte:55-60` ("No se pudo leer la cola. La consulta falló — no es que no haya
tickets") y `:41,88` (un ticket sin SLA no está vencido, y lo dice);
`arco:95-99` (fail-cerrado explícito);
`politicas:124-127` y `:187-191` (vacío = sin tope, 0 = tope de cero, dicho en
pantalla; y `armarPolitica` repone las reglas por ruta que el formulario no
edita, `:87-99`);
`configuracion:47-50`, `:98-104`, `:136-141`;
`usuarios:71-72`;
`suscripcion:234`, `:330-331`, `:445-459` ("Sin timbrar" para una factura pagada
sin CFDI es un estado real y se ve);
`inicio-operacion:96` (`tablero?.viajesActivos ?? '—'`, no `?? 0`), `:123-126`,
`:139-140`, `:169-170`;
`dashboard/error.tsx:66-71` (el `digest` en pantalla, `select-all`, más línea de
log). Ninguno de éstos pinta un cero por una consulta caída.

**Formato de cifras.** Una sola fuente: `src/lib/formato.ts`.
`dashboard/formato.ts` es reexport puro, `lib/utils.ts:12` también, y
`admin/ui/formato-preset.ts` resuelve presets llamando a esas funciones.
`formato.test.ts` (7 casos, la prueba que bloquea `toLocaleString('es-MX')`
fuera del archivo) verde.

**Claves de React en filas de dinero.** `TopRutas` (`top-rutas.tsx:41`) usa
`` `${r.origen}→${r.destino}` ``, que es exactamente la llave de agrupación de
`getTopRutasPorGasto` (`analytics.ts:999`) — no puede colisionar.
`TablaCarga` (`tablero-operacion.tsx:83`) usa `c.operadorId`; `suscripcion`,
`f.id`/`p.clave`; `arco`, `s.id`; `usuarios`, `u.id`; `politicas`,
`` `${p.concepto}-${p.ruta ?? ''}` ``; `soporte`, `t.id`. Los dos `key={i}` que
quedan (`[id]/page.tsx:285` diferencias y `:325` comprobantes) son listas de
Server Component sin reordenamiento en cliente: el índice es estable ahí y no
mueve una fila de dinero. Ninguna clave inestable.

**Autorización de la UI.** `sidebar-nav.tsx:105` filtra con la MISMA
`puedeVerRuta` que gatea la página; `rolMenu` (`:99`) replica `rolEfectivo`
(`visibilidad.ts:146-150`); el sufijo `?tenant=`/`?vista=`/`?rol=` viaja en cada
link (`:84-93`, cubierto por `sufijo.test.ts`, 5 casos) y también en los
redirects de servidor (`tenant-efectivo.ts:64-75`). `sufijoTenant`
(`sufijo.ts:20-26`) arrastra los tres. `AvisoSinFlota` va antes que cualquier
cifra (`page.tsx:184-186`) y `AvisoRol` sigue siendo la única salida de vuelta a
`/admin`. `resolverTenantEfectivo:105-107` no puede hacer bucle: rebota a
`inicioDe(rol)`, que por construcción ese rol sí ve —comprobado para contador
(`/dashboard/suscripcion`) y encargado (`/dashboard`).

**Compuerta.** `npx tsc --noEmit -p .` → **0 errores**.
`npx vitest run src/app/dashboard src/app/admin src/lib/auth` → **28 archivos,
251 pruebas verdes**. Árbol limpio al terminar (solo `MAPA.md`, que ya lo estaba).

---

## Lo que NO alcancé a revisar

- **Nada se renderizó en un navegador, quinta ronda seguida.** Los dos hallazgos
  nuevos de layout/contraste son **aritmética verificable** —fórmula WCAG 2.1
  igual a la de `contraste.test.ts:25-35`, y anchos derivados de las clases
  Tailwind del árbol de hoy— pero no vi el degradado en una pantalla ni el
  sidebar a 768 px. Lo mismo para P2-ALTO 5.
- **`suscripcion/page.tsx` completa (≈ 480 líneas).** Leí el gateo, los mapas de
  estado, el bloque de facturas y las ramas de degradación de Stripe; **no** leí
  `./vista.tsx` (`Uso`, `TarjetaPlan`, `InstruccionesTransferencia`) ni las tres
  server actions de contratación. Es la pantalla de aterrizaje del contador en
  el demo, así que el hueco importa.
- **`combustible-casetas/vista-consolidado.tsx`** (`LineasPorConciliar`, el único
  formulario interactivo de resolución de líneas). Solo verifiqué su contrato
  desde la página.
- **Las ~30 páginas de `/admin` por dentro.** Abrí `page.tsx`, `layout.tsx`,
  `selector-vista.tsx`, `flotas`, `model-ops`, `compliance`, `equipo`,
  `mi-perfil` y `sidebar-nav.tsx`. Sigue sin haber `admin/error.tsx`: un fallo
  ahí sube a `global-error.tsx` y recarga el documento entero.
- **Accesibilidad más allá de contraste, tamaño de toque y `aria-current`.** No
  verifiqué orden de foco, trampa de foco del asistente expandido (que es
  `fixed` y cubre la página sin `role="dialog"` ni `aria-modal`), teclado en los
  formularios de ARCO/políticas/consolidado, ni `aria-live` tras las server
  actions. El pill de `panel-periodo.tsx:57-63` sigue sin `aria-pressed` ni rol
  de grupo de radio — cuarta vez que se anota sin contarlo como hallazgo nuevo.
- **Responsive por debajo de `md` (768 px).** El hallazgo nuevo cubre 768–1023.
  Abajo de 768 los `grid-cols-1 md:grid-cols-2/3` los leí, no los medí, y no
  evalué qué hace la tabla de `[id]` ni la de `soporte` en un teléfono.
- **Modo oscuro.** `globals.css:118` redefine la paleta completa; medí `--g3` y
  `--marca`, que no cambian entre modos, pero no re-medí `--muted` (#9aa0aa en
  oscuro) ni el hero.
- **La suite completa** (`npx vitest run` a secas). Corrí 28 archivos de
  `src/app/` y `src/lib/auth/`; la cifra global de este pase la tomo del MAPA.
