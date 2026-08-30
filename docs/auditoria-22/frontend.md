# Frontend — auditoría 22

**Nota: 7/10** (antes: s/d). Razón: línea base nueva, sin ancla previa legible.
Siete y no seis porque los cuatro estados (vacío / cargando / error / parcial)
están pintados **a propósito** y probados (`dashboard/estado.ts`,
`estado.test.ts`, `AvisoEstado`), los rótulos de ventana se derivan del código
que consulta (`ventana-periodo.ts` + su test lee `analytics.ts`), y los dos
mapas que más han costado ya no pueden desincronizarse en silencio
(`ROTULO_DIFERENCIA` es `Record<TipoDiferencia, …>` — no compila sin el rótulo —
y `etiquetas_sincronizadas.test.ts` **barre `src/` entero** buscando copias del
mapa de conceptos). Siete y no ocho porque tres pantallas de dinero todavía
afirman cosas que no midieron, y porque el mapa de tools del chat del cliente ya
se desincronizó — el modo de falla que este rubro tiene que cazar y no cazó.

**Riesgo mayor de hoy:** la pantalla de Facturación le dice al contralor «no
tienes clientes dados de alta» cuando lo que falló fue la consulta — la única
lectura del panel que se traga el `error` de supabase-js sin distinguirlo de
«no hay nada», y está justo en la puerta de la escritura que le cobra a alguien.

## Hallazgos

### [ALTO] La consulta de clientes de Facturación se traga el error y la pantalla acusa al cliente de no tener clientes
`src/app/dashboard/facturacion/page.tsx:85` (efecto en
`src/app/dashboard/facturacion/forma.tsx:101-105`)

Escenario: el `select` de `cliente` falla — PostgREST 500, timeout de `acotada`,
una policy nueva. supabase-js NO lanza: devuelve `{ data: null, error }`. La
línea 85 es `if (!error && data) { … }`, así que el `error` se descarta y
`clientes` se queda en `[]` (línea 80). El formulario entra por la rama
`clientes.length === 0` y pinta, en color `--warn`: *«No tienes clientes dados
de alta. Una factura siempre es A ALGUIEN: dalos de alta primero en la pantalla
de Clientes.»* Una flota con 40 clientes activos ve esa frase, va a
`/dashboard/clientes` —que sí los lista— y no puede registrar la factura, sin
un solo mensaje de error en pantalla.

Es el contraste lo que lo delata: en el MISMO archivo, `datos` (líneas 55-61) y
`auditoria` (líneas 65-72) sí se dejan en `null` con el comentario «El catch NO
finge que no hay facturas». El comentario de las líneas 76-77 afirma que aquí
`catch → []` «es honesto» — y no lo es: mezcla «no leí» con «no hay».

Consecuencia: el contralor no puede facturar y el producto le echa la culpa a
su propio catálogo. Es exactamente la regla «fallar cerrado y decirlo» de
CLAUDE.md rota en la pantalla que escribe dinero hacia el cliente final.

Causa raíz probable: la lectura es inline en la página (no pasa por `repo.ts`
ni por un `exigir()`), y el `if (!error && data)` colapsa las dos condiciones
en un solo camino sin rama de error.

---

### [MEDIO] Dos tools reales del analista salen como jerga cruda en la secuencia de pensamiento del chat del cliente
`src/app/dashboard/chat.tsx:44-57` contra `src/lib/agents/analista.ts:42-47`

Escenario: `TOOLS_LECTURA` declara 12 tools de lectura; `ETIQUETA_TOOL` del
panel rotula 10 de ellas más `entregar_respuesta`. Faltan
**`consultar_carta_porte`** y **`consultar_normas`** (ambas registradas y vivas:
`src/lib/agents/chat-tools.ts:281` y `:331`). El servidor transmite cada paso
(`api/dashboard/chat/route.ts:98` → `onPaso` → `analista.ts:378`) y
`chat.tsx:57` cae al fallback `t.replaceAll('_',' ')`. El contralor pregunta
«¿qué pide la norma para el complemento de hidrocarburos?» y en vivo lee:

```
Leyendo los KPIs de la flota
consultar normas…
Armando la respuesta
```

minúscula, sin verbo, junto a tres renglones en español correcto.

Consecuencia: el momento más visible del demo —el agente narrando lo que hace—
enseña el nombre interno de una función. Y el mapa gemelo de `/admin`
(`src/app/admin/copiloto.tsx:81-98`) sí cubre sus 16 tools completas: la
pantalla del CLIENTE es la que quedó corta.

Causa raíz probable: `Record<string, string>` con fallback en vez de
`Record<ToolLectura, string>`; una tool nueva compila sin rótulo y no hay prueba
que compare los dos lados (no existe ningún test que mencione `ETIQUETA_TOOL`).

---

### [MEDIO] La cartera de Rentabilidad afirma «aún no hay facturas emitidas» en cualquier página vacía, y el renglón que iba a decir la verdad es código muerto
`src/app/dashboard/rentabilidad/vista.tsx:114-119` (contra el comentario de
`:41-45` y la página `rentabilidad/page.tsx:34`)

Escenario: `COBRANZA_POR_PAGINA = 100` (`lib/likida/comercial.ts:282`) y la
página acepta `?p=` hasta 1000 (`page.tsx:34`). Con 250 facturas y `?p=4`
—URL tecleada, marcador viejo, o una cartera que encogió porque se cobraron
facturas—, `cobranza.facturas.length === 0` pero `cobranza.total === 250`. La
vista entra por la rama de la línea 114 y pinta `EstadoVacio`: *«Aún no hay
facturas emitidas registradas — al registrar la primera, aquí aparece la
cartera»*. Con esa rama desaparecen también las dos tarjetas «Por cobrar» y
«Vencido» (líneas 122-131) y los botones de paginación (línea 182), que viven
dentro del `else`: el usuario queda varado en una pantalla que le afirma que no
le debe nadie.

El propio archivo prueba que no era la intención: el comentario de las líneas
41-45 dice *«`desde` es 0 cuando la página quedó vacía (alguien tecleó `?p=99`):
entonces el renglón dice "0–0 de N", que es la verdad, en vez de un rango
inventado»* — y ese renglón (línea 179) es **inalcanzable**, porque la rama de
la línea 114 lo intercepta antes.

Consecuencia: la pantalla afirma sobre el negocio del cliente («no hay
facturas») lo contrario de lo que su propia consulta devolvió (`total = 250`).
Regla #1 y regla #2 de CLAUDE.md rotas a la vez.

Causa raíz probable: la condición de vacío mira `facturas.length` (la página) en
lugar de `total` (la cartera), que es lo que el rótulo promete.

---

### [MEDIO] El script anti-parpadeo del tema solo corre en `/dashboard`, y el selector también está montado en `/admin`
`src/app/layout.tsx:52` (`SelectorTema` montado en
`src/app/admin/sidebar-nav.tsx:149` y `src/app/dashboard/sidebar-nav.tsx:202`)

Escenario: Javier abre `/admin`, pulsa el icono de luna. `SelectorTema` escribe
`localStorage['likida-tema'] = 'oscuro'` y pone `data-theme="dark"` en la raíz
(`selector-tema.tsx:26-30, 58-62`). Recarga, o abre `/admin/flotas` en pestaña
nueva. El script del layout raíz arranca con
`if (location.pathname.indexOf('/dashboard')!==0) return;` → sale sin hacer
nada. El HTML del servidor pinta sin `data-theme`, es decir con la paleta clara
(`--bg #fbfbfd`, `--surface #ffffff`). Cuando hidrata, el `useEffect` de
`selector-tema.tsx:50-51` reaplica `dark` y la consola entera pasa de blanco a
`#09090b` de golpe.

Consecuencia: destello blanco a pantalla completa en **cada navegación dura de
`/admin`**, que es la consola desde la que se demuestra el producto — el defecto
exacto que el comentario del propio script (`layout.tsx:46-50`) dice existir para
evitar («sin esto, quien eligió oscuro ve un flash blanco en cada navegación
dura. Corre SOLO en el panel»). Ese comentario enumera lo que se queda claro a
propósito —landing, login, PDF— y `/admin` no está en la lista: la omisión no
fue una decisión.

Causa raíz probable: el guard del script se escribió cuando el selector vivía
solo en el sidebar del cliente y no se amplió al montarlo también en `/admin`.

---

### [MEDIO] En el Registro de Viajes la dirección de la diferencia de dinero la lleva SOLO el color
`src/app/dashboard/viajes/vista.tsx:222-225` (leyenda en `:252-255`)

Escenario: dos filas contiguas.
· Viaje `F-1041`: anticipo $20,000.00, comprobado $18,500.00 → `diferencia = +1500`.
· Viaje `F-1042`: anticipo $20,000.00, comprobado $21,500.00 → `diferencia = -1500`.
La celda imprime `mxn(Math.abs(v.diferencia))` en los dos casos: **`$1,500.00`**,
texto idéntico. Lo único que las separa es `color: var(--warn)` (`#9a5c00`)
contra `var(--bad)` (`#b91c1c`) — un par ámbar/rojo, el par que la deuteranopia
y la protanopia colapsan (~8% de los hombres). La aclaración vive en un `tfoot`
de 11px en `--faint`, al final de una tabla de hasta 100 filas.

Consecuencia: «sobrante a favor de la empresa» y «faltante a favor del operador»
se leen igual. El contralor no puede saber, en la tabla, si le debe al chofer o
el chofer le debe a él. Que sí se puede es lo que lo vuelve un hallazgo y no una
opinión: la pantalla de detalle de la MISMA cifra ya lo dice con palabras
(`src/app/dashboard/[id]/detalle.tsx:205-211`: nota `'sobrante · a favor de la
empresa'` / `'faltante · a favor del operador'`). El producto ya sabe cómo
hacerlo bien; la tabla no lo hace.

Causa raíz probable: `Math.abs()` se puso para alinear la columna en `tabular` y
el signo se delegó al color sin dejar un portador redundante (signo, flecha o
palabra).

---

### [MEDIO] «Tasa de cuadre 0%» se pinta como medición en una flota que no ha liquidado nada
`src/app/dashboard/agentes/liquidacion/vista.tsx:173`

Escenario: flota nueva, 3 viajes `abierto`, 0 liquidaciones.
`kpis_liquidacion_tenant` devuelve `tasaCuadre = 0` por su propio
`case when count(*) = 0 then 0`
(`supabase/migrations/0112_agregados_rpc.sql:337`). `BloqueKpis` no gatea por
`viajesLiquidados` y pinta la tarjeta «Tasa de cuadre» con **`0%`** en cifra de
18px; la salvedad («0 liquidaciones») va abajo en `--faint`, del mismo tamaño
que las notas de las otras tres tarjetas.

Consecuencia: la métrica que define la promesa del producto se enseña en su peor
valor posible cuando la verdad es «todavía no hay nada que medir». Es el mismo
0/0 que la auditoría 10 ya corrigió en el Resumen con `estadoPanel` —donde
`liquidacionesDeViajes` existe precisamente para que la rama `'vacio'` sea
alcanzable (`dashboard/estado.ts:79-84`)—; esta pantalla nació después y no
heredó el gate. El vecino de al lado sí lo hace bien: `KpiPeriodo` preserva el
`null` del backend y escribe «sin viajes en el periodo»
(`dashboard/kpi-periodo.tsx:67-71`).

Causa raíz probable: la RPC colapsa el cociente indefinido a `0` y el
componente no distingue ese `0` calculado del `0` medido.

---

### [BAJO] Categoría y prioridad del ticket siguen imprimiéndose crudas, dos columnas al lado de la que se arregló
`src/app/dashboard/soporte/page.tsx:246-247` (y el `<select>` de `:359-366`)

Escenario: se abre un ticket con categoría `facturacion`. La tabla imprime
`{t.categoria}` y `{t.prioridad}` sin mapa: bajo los encabezados «Categoría» y
«Prioridad» se lee `facturacion`, `tecnico`, `operacion` — minúscula y sin
acento (`CATEGORIAS_TICKET` en `lib/likida/comercial.ts:633-634`). La columna
«Estado», entre ambas, sí traduce con `pillTicket` — el arreglo de la ronda 21.

Consecuencia: la misma fila mezcla un rótulo en español («En proceso») con dos
slugs de base de datos. Cosmético hoy; el día que el dominio gane un valor con
guion bajo (`sin_asignar`, `alta_prioridad`) reproduce literalmente el bug que
se acaba de cerrar.

Causa raíz probable: el arreglo de la 21 atacó el campo reportado
(`estado`) y no barrió los otros dos enums de la misma fila.

---

### [BAJO] Dos formateadores de hora propios del panel reintroducen el `hour12: false` que `formato.ts` documenta como trampa
`src/app/dashboard/jornada/vista.tsx:55-59` y
`src/app/dashboard/jornada/formas.tsx:68-73`

Escenario: `formato.ts:352-362` escribe `hourCycle: 'h23'` **explícito** y deja
la razón por escrito: *«`h23` es explícito porque `hour12: false` puede imprimir
"24:00" para la medianoche según la versión de ICU, y "24:00" no es una hora que
exista»*. Los dos helpers `hora()` de la pantalla de jornada arman su propio
`Intl.DateTimeFormat('es-MX', { …, hour12: false })` sin `hourCycle`. Lo medí en
este entorno (Node v22.22.2): `resolvedOptions().hourCycle` sale `'h23'` y
`2026-08-05T06:00:00Z` imprime `00:00` — **hoy no falla**. Falla el día que el
runtime traiga otro ICU, y entonces un `fin_jornada` a medianoche se registra
como `24:00`.

Consecuencia: la pantalla es el registro de jornada que el patrón firma (LFT
132 fr. XXXIV) y una hora inexistente en un expediente laboral no se corrige con
un refresh. Además el guardia de `formato.test.ts:233-255` no lo ve: prohíbe
`toLocaleString('es-MX')` y `'America/Mexico_City'` literal, pero estos archivos
importan `TZ_MX` correctamente y usan la otra ortografía —
`new Intl.DateTimeFormat` — que el barrido no mira.

Causa raíz probable: `formato.ts` no exporta un `horaMx()`, así que cada
pantalla que necesita solo HH:MM se lo arma.

---

### [BAJO] Un motivo nuevo de evidencia GPS renderiza una celda vacía, sin fallback
`src/app/dashboard/agentes/peajes/vista.tsx:368`

Escenario: el renglón imprime `{EVIDENCIA_LEGIBLE[evidencia.motivo]}` sin
`??`. Hoy el mapa (`:349-354`) cubre los cuatro valores de
`MotivoSinEvidencia` (`lib/likida/peajes/evidencia_gps.ts:41-49`), así que no
falla. Pero el mapa es `Record<string, string>`, no `Record<MotivoSinEvidencia,
string>`: añadir un quinto motivo (`unidad_sin_gps`, digamos) compila, y la
línea de peaje sale con el `<span>` en blanco — sin GPS, sin motivo, sin nada.
El mapa hermano de tres líneas arriba (`MOTIVO_LEGIBLE`, `:366`) sí lleva
`?? linea.motivo`.

Consecuencia: en la pantalla que sustenta con GPS lo que se le cobra a la flota
por casetas, el hueco se vería como «no hay nada que decir» en vez de «falta un
dato». Deuda que cobra factura al siguiente motivo.

Causa raíz probable: el mapa no está tipado contra la unión y el llamador es el
único de los dos sin fallback.

## Lo que revisé y está bien

**El trabajo obligatorio — cada mapa literal del panel contra
`src/types/likida.ts`:**

- `TipoDiferencia` (44 miembros) → `src/app/dashboard/agentes/liquidacion/rotulo-diferencia.ts:18`.
  Es `Record<TipoDiferencia, string>` (no `Partial`): los 44 están, y un tipo
  nuevo **no compila** sin rótulo. `rotuloDiferencia()` (`:69`) además cubre lo
  que llega del jsonb como `string` suelto. Cerrado de verdad.
- `ConceptoGasto` (9) → `src/app/dashboard/[id]/page.tsx:25` (9/9),
  `src/app/dashboard/gasto-semanal-chart.tsx:13` (9/9),
  `src/app/dashboard/politicas/page.tsx:20` (9/9). Los tres coinciden con
  `label()` del motor; `etiquetas_sincronizadas.test.ts:42-88` ya no ancla por
  rutas literales sino que **barre `src/` con un patrón** y compara clave por
  clave contra `engine.ts`, y `:116-125` verifica que el motor cubra el tipo.
  El renglón que se pinta llama a `etiquetaConcepto` del motor
  (`etiquetas_panel.test.ts` lo vigila con `ocrExtra` incluido).
- `EstatusLiquidacion` (3) → `src/app/dashboard/estatus.ts:17`, fuente única
  importada por lista y detalle; `etiquetas_sincronizadas.test.ts:163-186`
  prueba contra el tipo y que nadie vuelva a pegar una copia local.
- `EstadoSat` / estado de renglón → `src/app/dashboard/[id]/vista.tsx:205-224`.
  `TIPOS_MALOS` y `TIPOS_POR_CONFIRMAR` **importan** `NO_DEDUCIBLE_ISR` y
  `POR_CONFIRMAR` del motor en vez de reconstruirlos (`:170-190`).
- `c_FormaPago` → `[id]/vista.tsx:149-157`: 9 claves, `etiqueta_forma_pago.test.ts`
  exige que toda clave que el motor admite tenga rótulo. `05`/`06` presentes.
- `app_user.rol` (5) → `usuarios/vista.tsx:11`, `mi-perfil/page.tsx:18`,
  `chrome.tsx:26`, `admin/mi-perfil/page.tsx:10` — los cuatro completos, los
  cuatro con `?? rol`. `sesiones-mcp/vista.tsx:19`, `aviso-rol.tsx:7` y
  `agentes/notificaciones-forma.tsx:45` listan solo los 3 roles que aplican, con
  fallback: correcto, no es un hueco.
- `viaje.estatus` (3) → `viajes/vista.tsx:31` y `resumen-visual.tsx:103`,
  completos, ambos con fallback a la clave cruda.
- `unidad.estado` (4) → `unidades/vista.tsx:27` == `ESTADOS_UNIDAD`
  (`operacion.ts:843`) == el CHECK de `0047_operacion_encargado.sql:46`.
- `ticket_soporte.estado` (5) → `soporte/estatus.ts:21`, tipado
  `Record<EstadoTicket, …>` — no compila sin el rótulo.
- Motivos de conciliación (5/5) → `combustible-casetas/page.tsx:30` contra
  `intake/consolidado.ts:545`.
- Motivos de desglose de peaje (6/6) → `agentes/peajes/vista.tsx:338`, con
  fallback.
- Tools del copiloto de admin (16/16) → `admin/copiloto.tsx:81`.

**Estados y honestidad de las cifras:**
- `dashboard/estado.ts:44-57`: `error` / `parcial` / `vacio` / `datos` con las
  siete consultas secundarias contadas, y `liquidacionesDeViajes` (`:79`) que
  hace alcanzable la rama `vacio` — el arreglo de la auditoría 10 sigue en pie.
- `panel-periodo.tsx:110-135` y `:145-153`: `null` (consulta caída) y `[]`
  (nada que enseñar) tienen textos distintos en las cuatro tarjetas.
- `ventana-periodo.ts:33-40` + `panel-periodo.tsx:58-60`: cada tarjeta imprime
  SU ventana real; verifiqué que `rutas`+`historico` de verdad va sin cota
  (`analytics.ts:1224-1227`) y que las otras son 5/13/52 semanas
  (`SEMANAS_POR_MODO`, `analytics.ts:533`). El rótulo dice la verdad.
- `kpi-periodo.tsx:57-73`: preserva el `null` del backend; `serie[0]` no puede
  ser `undefined` porque `getSerieComparativa` (`analytics.ts:160-164`) lanza si
  la forma no trae exactamente `pasos` periodos.
- `viajes/vista.tsx:94` (`kpi()` → `'—'` con `null`) y `page.tsx:133`
  (los conteos degradan solos, los primarios fallan cerrado).
- `rentabilidad/vista.tsx:91-107`: el margen se declara medido «solo sobre los N
  viajes con ingreso capturado» y advierte que contribución ≠ utilidad.
- `[id]/detalle.tsx:71-76`: si el desglose de deducibilidad no cuadra con el
  total persistido, `filasDeducibilidad` devuelve `null` y no se pinta nada.
- `[id]/detalle.tsx:86-88`: el KPI «Sin CFDI» se deja en `—` cuando las
  diferencias no se pueden cruzar por `gastoId`, en vez de sumar de menos.
- `jornada/vista.tsx:86-101`: los contadores son `null` cuando `filas === null`,
  con el razonamiento escrito.

**Errores que llegan a pantalla:** `dashboard/error.tsx`, `admin/error.tsx` y
`global-error.tsx` pintan el `digest` seleccionable y lo registran; el
global-error va con hex literales y `<img>` estático porque el layout que acaba
de morir pudo no haber cargado `globals.css`. Ningún stack llega al usuario y
ningún `dangerouslySetInnerHTML` recibe dato de usuario (el único, `layout.tsx:59`,
es una constante).

**Formato de cifras:** cero `toLocaleString('es-MX')` fuera de `lib/formato.ts`
en todo `src/app` (el guardia de `formato.test.ts:212-228` está vivo);
`lib/utils.ts:12` es un re-export, no una segunda implementación;
`mxnCompacto` solo abrevia a partir de $1,000,000 y se usa en un sitio
declarado (`agentes/liquidacion/vista.tsx:172`).

**Contraste:** medí los tokens que `contraste.test.ts` no mide. `--ok` 5.43:1,
`--warn` 5.38:1, `--bad` 6.47:1 sobre `--surface`; sobre los dos `--g1` reales
(`#fdebd9` y el `#f4f4f5` de `.tema-neutro`) el peor caso es 4.63:1. Todos
pasan AA. `--warn` sobre `--warnbg` da 4.87:1 y `--bad` sobre `--badbg` 5.56:1.

**Lint:** al contrario de lo que dice la nota del rubro, el panel **sí** tiene
lint — `eslint.config.mjs` carga `eslint-config-next/core-web-vitals` (que trae
`react-hooks` y el subconjunto de `jsx-a11y` de Next) sobre todo `src/`.
`npx eslint src/app` sale con 0 errores y 47 avisos, ninguno de frontend salvo
un `no-img-element` deliberado en `global-error.tsx:306`. Lo que no cubre es
`jsx-a11y/label-has-associated-control`.

**Rutas:** las 42 entradas de `dashboard/rutas.ts` resuelven a un `page.tsx`
real; las 41 de `admin/rutas.ts` también. Las dos páginas sin entrada de sidebar
son deliberadas: `/dashboard/contador` (declarada como `EXTRAS` en
`pantalla-evento.ts:29`) y `/dashboard/integraciones` (redirect a `/conexiones`,
conservado a propósito para links viejos).

**`key` de React en tablas de dinero:** ninguna usa índice —
`viajes/vista.tsx:202` va por `v.id`, `rentabilidad/vista.tsx:154` por `f.id`,
`gasto-semanal-chart.tsx:60,63` por `cat`/`s.nombre`. Los `key={i}` que sí hay
están en listas estáticas de servidor sin reordenamiento.

## Lo que NO alcancé a revisar

- **No miré ningún render.** CLAUDE.md §«Cómo se verifica» exige preview
  temporal + Chrome headless con `--force-prefers-reduced-motion`; esta ronda me
  prohíbe `npm run build` y escribir fuera del reporte, así que todo lo de
  arriba es lectura de fuente. Lo que un screenshot habría cazado y yo no —
  desbordes reales, tamaños de toque en móvil, el orden de foco — sigue sin
  auditar. En particular el hallazgo del color en la tabla de viajes merece
  verse con un simulador de deuteranopia antes de decidir su prioridad.
- **Responsive/móvil:** el `viewport` está y las tablas anchas van en
  `overflow-x-auto`, pero no verifiqué a 390px ninguna de las ~31 páginas.
- **Área de toque:** vi botones de 16×16 (`kpi-periodo.tsx:10`, `w-4 h-4`) y de
  24×24 (`selector-tema.tsx:73`, `w-6 h-6`), por debajo de los 44px de WCAG
  2.5.5 / 24px de 2.5.8, pero sin medir el espaciado real no puedo afirmar que
  reprueben — por eso no van como hallazgo.
- **`/admin` a fondo:** ~60 pantallas revisadas solo por muestreo (el rubro
  nombra `(dashboard)` primero y el comprador solo ve ese). Los mapas
  `Record<string,string>` de `admin/` que no cruzan con `types/likida.ts`
  (FASE_LABEL, ETIQUETA_TIPO, ORIGEN_LABEL, CONFIANZA_*, NOMBRE_ORDEN…) no los
  comparé contra sus dominios.
- **`/portal` y `/demo`:** no los abrí.
- **Estados de carga:** leí `loading.tsx` y los esqueletos de
  `agentes/liquidacion/vista.tsx`, pero no rastreé qué páginas tienen `Suspense`
  con esqueleto del alto correcto y cuáles saltan.
- **Hidratación:** no busqué desajustes servidor/cliente más allá de los dos
  componentes que ya usan `useSyncExternalStore` con snapshot fijo
  (`selector-tema.tsx`, `boton-sidebar.tsx`).
