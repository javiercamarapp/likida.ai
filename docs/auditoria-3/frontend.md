# Frontend — auditoría 3 (pase 3)

**Nota: 6/10** (antes 5). Razón del movimiento: **se atacó y subió**. La
superficie que llegó de master —Facturación a clientes, Clientes y tarifas,
Unidades, Carta Porte, Llaves de API— es el mejor frontend del repo hasta hoy:
cada bloque declara sus tres estados (dato / vacío que dice qué lo enciende /
error dicho), y ninguno rellena con ceros. `FE-C1` sigue cerrado y el sitio
exacto donde vivía `ARQ-C1` está arreglado. No llega a 8 porque el trabajo
obligatorio del rubro —que los mapas del panel deriven del tipo— sigue sin
hacerse: encontré **tres** mapas literales desincronizados, uno de ellos con
una clave que no existe en `src/types/likida.ts` y otro que pinta el MISMO
estatus de rojo en una pantalla y de ámbar en otra. Y hay una medición
inventada visible hoy, con la base en cero, en la primera pantalla del demo.

**El riesgo mayor hoy:** el panel afirma comparaciones y conteos que nadie
calculó — "0% · sin movimiento" bajo una cifra de dinero que jamás tuvo periodo
anterior, y una gráfica de actividad que suma sobre una ventana de 100 filas
pegada a un conteo exacto de la misma semana.

---

## Hallazgos

### [ALTO] `StatCard` inventa una comparación: `delta={null}` imprime "0% · sin movimiento"
`src/app/admin/ui/kit.tsx:147-152` · llamadores: `src/app/dashboard/inicio-contenido.tsx:318` y `:341`

Escenario: `/dashboard` (Resumen, la primera pantalla del demo) monta dos
tarjetas con `delta={null}`:

- `<StatCard etiqueta="Ahorro generado — ejercicio 2026" valor={resumenPerdidas?.montoRecuperable ?? 0} formato="mxn" delta={null} />`
- `<StatCard etiqueta="Diésel elegible para el estímulo" valor={acred.litrosDiesel} formato="litros" delta={null} />`

La rama `delta === null` de `StatCard` renderiza, literal:
`<p …>0% · sin movimiento</p>`. Con la base en cero (14-ago) sale **"$0.00"** y
debajo **"0% · sin movimiento"**. Con datos sale, por ejemplo, **"4,218.5 L"** y
debajo **"0% · sin movimiento"** — cuando el periodo anterior no se consultó
nunca: `getAcreditables` y `resumirPerdidas` no calculan comparativo, por eso el
llamador pasa `null`.

El propio comentario del componente (`kit.tsx:148-152`) dice que `null` significa
"se intentó comparar y no hay contra qué … sin inventar dirección", y que las
métricas sin comparativo "van limpias" con `delta` **omitido**. Los dos únicos
llamadores del producto pasan `null`, no lo omiten: la intención documentada y
el render no coinciden.

Consecuencia: el contralor lee "0%" y "sin movimiento" como una medición —
"mi ahorro fiscal no se movió respecto al periodo anterior"— sobre una
comparación que no existe. Viola la regla que define el producto ("no se rellena
con ceros que parezcan medición", CLAUDE.md), en la tarjeta que el guion de
venta usa como diferenciador, y es visible hoy sin un solo cliente.

Causa raíz probable: la rama de fallback de `StatCard` se escribió para el pedido
del 12-ago ("que el pie no se quede vacío") y quedó imprimiendo una cifra en vez
de una frase; `kit.test.tsx` no tiene una sola aserción sobre `delta`.

---

### [ALTO] "Actividad" suma sobre 100 filas y se pinta pegada al conteo exacto de la misma semana — REINCIDENTE de ARQ-C1
`src/app/dashboard/actividad.tsx:53` × `src/app/dashboard/panel-periodo.tsx:70-89` × `src/app/dashboard/inicio-contenido.tsx:359` × `src/lib/likida/analytics.ts:965`

Escenario, con valores: flota de 20 tractocamiones, 1 viaje por unidad al día →
**140 viajes en 7 días**, **600 en 30 días**. En `/dashboard`:

- `getViajes(tenantId)` (`analytics.ts:965`, `limite = 100`, `order created_at
  desc`) devuelve **100** filas y es el arreglo que `inicio-contenido.tsx:359`
  le pasa a `PanelPeriodo`.
- `PanelPeriodo` monta, en la **misma fila de grid** (`panel-periodo.tsx:70`,
  `md:grid-cols-3`): a la izquierda la dona **"Viajes"**, cuyo `totalViajes`
  sale de `getSeriesKpiCards` → `getSerieComparativa` (`analytics.ts:112-116`),
  que usa `traerTodo` **sin tope** y filtra por fecha → **140 exacto**; a la
  derecha **"Actividad"** (`actividad.tsx:53`), que hace
  `bucketsPorDia(viajes, 7)` sobre las 100 filas → suma **100**.
- En "Mensual" el hueco es 600 contra 100, y **20 de las 30 barras salen en
  cero** para días en los que sí hubo viajes.

No hay un solo rótulo en pantalla que declare el recorte: la advertencia vive
únicamente en un comentario de `actividad.tsx:33-39` ("capado a 100 filas
recientes — de sobra para 7/30 días"), un supuesto que se rompe arriba de 3.3
viajes por día. Compárese con `/dashboard/viajes/vista.tsx:151-154`, que sí
imprime "La tabla enseña los N viajes más recientes; los conteos de arriba sí
cuentan todo el histórico".

Consecuencia: dos cifras de la MISMA semana, una al lado de la otra, que no
cuadran; y una gráfica que le dice al contralor que su flota no movió camiones
en 20 de los últimos 30 días. Es exactamente el patrón de `ARQ-C1` (conteo
capado junto a conteo exacto), en un sitio nuevo.

Causa raíz probable: `getViajes` se reusa como fuente de tabla (donde el tope
está bien y se dice) y como fuente de serie temporal (donde no puede estarlo);
la serie histórica ya se separó a `getViajesPorMes`, la semanal/mensual no.

(**REINCIDENTE** de FE-A2 / ARQ-C1. El sitio que el pase 2 nombró — el funnel
"Viajes en curso" de `/dashboard/agentes/liquidacion` — **sí quedó arreglado**:
`agentes/liquidacion/page.tsx:53-55` usa `contarViajes` con `count: 'exact'`.)

---

### [ALTO] El mismo estatus de liquidación se pinta ROJO en una pantalla y ÁMBAR en otra — y la severidad queda invertida
`src/app/dashboard/estatus.ts:19-20` × `src/app/dashboard/agentes/liquidacion/vista.tsx:304-305`

Escenario: la liquidación `LIQ-2026-0184` cierra con `estatus =
'con_diferencias'` y $12,400 de diferencia.

- En `/dashboard/agentes/liquidacion` (tablas "Esperan tu revisión" y "Últimos
  cierres", `vista.tsx:324-336`) su pastilla sale **roja**:
  `con_diferencias: { fg: 'var(--bad)' /* #b91c1c */, bg: 'var(--badbg)' }`.
- En `/dashboard/<id>` (el detalle de esa MISMA liquidación,
  `[id]/page.tsx:88` → `etiquetaEstatus`) sale **ámbar**:
  `con_diferencias: { color: 'var(--color-warn)' /* #a16207 */ }`.

Y al revés para `revisar`: `estatus.ts:20` lo pinta con `--color-bad` (rojo) y
`agentes/liquidacion/vista.tsx:305` con `--warn` (ámbar). No es un tono
distinto del mismo semáforo: es el semáforo **invertido** entre dos pantallas
del mismo panel — lo que en una es "lo más grave", en la otra es "lo segundo".

`estatus.ts:1-15` existe precisamente porque este mapa ya vivió copiado dos
veces, y su encabezado dice que "un módulo compartido lo cierra de verdad".
`estatus.test.ts` verifica que la copia única cubra `EstatusLiquidacion`, pero
no puede ver la segunda copia que nació después en la pantalla del agente.

Consecuencia: el contralor abre la cola del agente, ve tres renglones rojos,
hace clic y en el detalle el mismo caso es ámbar. Un semáforo que cambia de
significado entre dos clics tira la confianza en los dos.

Causa raíz probable: `agentes/liquidacion/vista.tsx` necesitaba pares `fg/bg`
para pastillas y `estatus.ts` solo exporta `color`; se escribió una segunda copia
en vez de ampliar la fuente única.

---

### [MEDIO] La dona "Dinero observado" etiqueta 31 de 33 diferencias con la clave cruda del motor, y su mapa tiene una clave que no existe
`src/app/dashboard/agentes/liquidacion/vista.tsx:13-18`

```
const TIPO_DIFERENCIA: Record<string, string> = {
  sobre_politica: 'Sobre política',
  duplicado: 'Duplicado',
  sin_comprobar: 'Sin comprobar',      // ← no existe en TipoDiferencia
};
const rotuloTipo = (t: string) => TIPO_DIFERENCIA[t] ?? t.replaceAll('_', ' ');
```

`src/types/likida.ts:62-98` declara **33** valores de `TipoDiferencia`, y
`getDineroObservadoPorTipo` (`analytics.ts:277-289`) **no filtra ninguno**:
acumula tal cual lo que traiga `liquidacion.diferencias[].tipo`. `sin_comprobar`
no aparece en ningún otro archivo del repo (el valor real es `sin_comprobante`),
así que esa entrada nunca puede casar.

Escenario, con valores: una liquidación levanta `cfdi_efos` por $18,400 y
`alimentacion_transporte_sin_tarjeta_credito` por $1,050. La leyenda de la dona
y el desglose (`vista.tsx:204-211`) imprimen:

```
cfdi efos · 1                                        $18,400.00
alimentacion transporte sin tarjeta credito · 1       $1,050.00
```

sin acentos, en minúscula, dentro de una fila flex de 12px. El PDF de esa misma
liquidación imprime `d.nota` (`pdf.ts:449` y alrededores), o sea la frase humana
con su fundamento. Dos vocabularios para el mismo renglón de dinero, en las dos
superficies que el contralor cruza.

Consecuencia: la pantalla que existe para demostrar que el agente trabaja le
enseña al comprador los identificadores internos del motor; y "cfdi efos" no le
dice que esos $18,400 son **no deducibles** por lista negra 69-B, que es la
única lectura que importa.

Causa raíz probable: el mapa se escribió a mano contra un vocabulario de tres
tipos y nunca se ató al tipo. El inventario humano de los 33 ya existe y es
importable desde un Server Component (`lib/likida/normas/por_diferencia.ts`,
`NORMA_POR_DIFERENCIA` + `SIN_NORMA`).

---

### [MEDIO] `/admin/model-ops` afirma "3 fases fijas" y su propia dona pinta 6, tres de ellas en crudo — y la más cara es la que falta
`src/app/admin/model-ops/page.tsx:11`, `:46`, `:94`

`FaseCosto` (`src/lib/likida/costos.ts:41`) tiene **seis** valores: `ocr |
cuadre | escalacion | chat | router | whatsapp`. La página:

- declara `FASE_LABEL` con **tres** (`:11`);
- imprime "Registro de las 3 fases fijas del pipeline y su costo real" (`:46`) y
  lista tres fichas desde su constante `FASES` (`:18-22`);
- pero la dona "Costo por fase" (`:94`) mapea `r.porFase`, que viene de
  `getResumenNegocio` **sin filtrar la fase**.

Escenario: el cuadre cae a su modelo de respaldo, `anthropic/claude-opus-5`
(`src/lib/llm/models.ts:54`), y `faseDeModelo` (`costos.ts:103`) escribe esas
llamadas con `fase='escalacion'`. En `/admin/model-ops` esa fase **no tiene
ficha** en "Registro de agentes" —la lista es una constante de tres— y en la
dona de al lado aparece rotulada `escalacion`, en minúscula y sin acento, junto
a "Agente OCR" y "Agente de Cuadre". Lo mismo con `chat` y `router`. Sumar las
tres fichas da menos que el total que la tarjeta hermana ("Costo por modelo —
todas las fases") reporta para la misma ventana.

Los otros tres sitios que pintan esta dona (`admin/consola.tsx:30`,
`admin/analitica/page.tsx:12`, `admin/costos-facturacion/page.tsx:64`) sí traen
las seis etiquetas: cuatro copias del mismo diccionario, una desincronizada.

Consecuencia: Javier revisa el costo de IA en la consola de Model Ops y no ve
el gasto de Opus —el modelo más caro del stack— en ninguna ficha; en la dona lo
ve con un nombre que no es un nombre.

Causa raíz probable: `FASES` (la narrativa de producto: tres pasos fijos) y
`FaseCosto` (la realidad de `llm_costo`: seis) se escribieron por separado y
la página mezcla las dos fuentes en la misma pantalla.

---

### [MEDIO] `--faint` y `--muted` reprueban AA sobre el lienzo real de las consolas — y la prueba guardián mide un fondo que ya no se usa
`src/app/globals.css:80` (`--faint: #73737c`) × `:177` (`--g1: #f4f4f5` en `.tema-neutro`) · `src/app/dashboard/contraste.test.ts:60-61`

Desde el rediseño del 12-ago, **todas** las páginas de los dos paneles envuelven
su contenido en `style={{ background: 'var(--g1)' }}`, y dentro de las consolas
`.tema-neutro` fija `--g1: #f4f4f5`. Medido con la misma fórmula WCAG que usa la
prueba del repo:

| tinta | sobre `#ffffff` | sobre `--bg` `#fbfbfd` | sobre `--g1` `#f4f4f5` | sobre `--canvas` `#f9f9fa` |
|---|---|---|---|---|
| `--faint` `#73737c` | 4.70 ✅ | 4.54 ✅ | **4.27 ❌** | **4.46 ❌** |
| `--muted` `#6b7280` | 4.83 ✅ | 4.68 ✅ | **4.40 ❌** | 4.59 ✅ |

`contraste.test.ts:60-61` solo declara `SUPERFICIE = '#ffffff'` y `FONDO =
'#fbfbfd'`. Nunca mide `#f4f4f5` ni `#f9f9fa`, así que pasa en verde.

Escenario concreto: `src/app/dashboard/inicio-contenido.tsx:370` pinta
`LEYENDA_CORTA` —el descargo legal, "No es un dictamen ni la opinión de un
contador público… Valídalo con tu contador antes de usarlo en una
declaración"— en `text-[11px]` con `--faint`, **directo sobre `--g1`**: 4.27:1,
por debajo del 4.5:1 que AA pide para texto normal (11px no tiene la excepción
de "texto grande"). Lo mismo en `facturacion/vista.tsx:96` ("Todo lo de esta
pantalla se fechó contra un solo día…"), `:185`, `:514`, y el párrafo
introductorio de `carta-porte/vista.tsx:39` con `--muted` sobre `--g1`.

Consecuencia: el texto legalmente más importante de la pantalla es el menos
legible de la pantalla, y en un proyector de sala (contraste efectivo aún menor)
desaparece. Es la misma clase de fallo que la auditoría 10 ya cerró para `--faint`
sobre blanco: se auditó la tinta contra el fondo equivocado.

Causa raíz probable: el token se midió en agosto contra `--surface`/`--bg`, y en
el rediseño posterior el fondo de casi todo el texto suelto pasó a `--g1`/
`--canvas` sin volver a medir.

---

### [MEDIO] Abajo de 1024px no hay forma de cerrar sesión ni de llegar a la cuenta, en ninguno de los dos paneles
`src/app/dashboard/chrome.tsx:86-97` · `src/app/admin/chrome.tsx:66`, `:73`

El sidebar nunca se oculta (`MARCO_SIDEBAR` en `src/app/marco.ts:22` es
`w-[72px] lg:w-[232px]`, sin `hidden`), pero la tarjeta de usuario que contiene
el link a `/cuenta` y el `<form action={cerrarSesion}>` están envueltos en
`hidden lg:block`.

Escenario: el contralor abre `app.likida.ai/dashboard` en una iPad en vertical
(768px) o en el teléfono. Ve el panel completo con el sidebar de íconos, navega
bien, y **no existe ningún control de "Cerrar sesión"** en toda la aplicación:
`/dashboard/mi-perfil` no lo tiene (grep de `cerrarSesion|signOut` en
`dashboard/mi-perfil/page.tsx` no devuelve nada) y `/cuenta`, que sí lo tiene
(`src/app/cuenta/page.tsx:34-38`), no está enlazada desde ningún sitio visible a
ese ancho. La sesión solo se cierra tecleando la URL a mano.

Consecuencia: en una demo hecha desde la tableta del prospecto, o en un
dispositivo compartido de la flota, la sesión queda abierta y el usuario no
tiene manera de sacarla. Aplica igual a `/admin`, o sea a la consola que cruza
todos los tenants.

Causa raíz probable: `hidden lg:block` se puso para que el nombre no reventara
el sidebar de 72px, y arrastró consigo el botón de salir, que sí cabe (es un
ícono de 28px).

---

### [BAJO] `bucketsPorDia` arma los días con el reloj del entorno, no con la hora de México
`src/app/dashboard/actividad.tsx:20-26`

```
const hoy = new Date();
hoy.setHours(0, 0, 0, 0);   // medianoche LOCAL del entorno que renderiza
…
const iso = d.toISOString().slice(0, 10);   // …convertida a UTC
```

`Actividad` se renderiza dentro de `PanelPeriodo`, que es `'use client'`: corre
en el servidor (SSR, `TZ=UTC` en Vercel) y otra vez en el navegador (hora local).

Escenario: 15-ago-2026, 19:00 en CDMX. En el servidor `hoy` es el 16-ago (ya es
01:00 UTC) y la ventana de 7 días va del 10 al **16** — la última barra es un día
que no ha ocurrido y siempre vale 0. En el navegador `hoy` es el 15-ago y la
ventana va del 9 al 15. El HTML servido y el hidratado no coinciden.

Consecuencia: entre las 18:00 y la medianoche —el horario en que se cierran las
liquidaciones, según el propio comentario de `formato.ts:172-179`— la gráfica
enseña una barra vacía de mañana y pierde el día más viejo. Es el mismo bug de
zona que el repo ya pagó dos veces (`fechaMx`, `getLiquidacionesPorDia`), en el
único sitio donde el día se calcula sin `TZ_MX`.

Causa raíz probable: el resto del panel resuelve "hoy" con
`Intl.DateTimeFormat('en-CA', { timeZone: TZ_MX })` (ver
`inicio-contenido.tsx:241`); este componente quedó con `new Date()` crudo.

---

### [BAJO] Una credencial probada con éxito se pinta en color de advertencia
`src/app/dashboard/conexiones/seccion-credenciales.tsx:126-132`

`style={{ color: c.activo ? 'var(--warn)' : 'var(--faint)' }}` decide el color
por `activo`, y el texto de al lado por `probadaEn`. Escenario: la credencial
del ERP se probó el 12-ago y está activa → el renglón dice **"probada el 12
ago"** en ámbar `#9a5c00`, el mismo tono que "guardada — sin probar contra el
sistema real" y que los avisos de vigencia vencida de `/dashboard/unidades`.

Consecuencia: el estado bueno y el estado pendiente son indistinguibles por
color en la única pantalla donde el dueño revisa qué tiene conectado; se lee
como si nada estuviera listo.

Causa raíz probable: el color se ató a `activo` (que es casi siempre `true`) en
vez de al mismo criterio de tres ramas que decide el texto.

---

### [BAJO] "18" y "19" van a mano en Carta Porte, contra una lista que sí se puede contar
`src/app/dashboard/carta-porte/vista.tsx:82`, `:119`, `:123`

`const listos = 18 - c.faltanTransportista` y `{numero(19 - c.faltanCliente)} de
19`. Hoy cuadra —`CAMPOS_CCP` (`src/lib/likida/carta_porte.ts:193-237`) tiene
exactamente 19 de cliente y 18 de transportista, verificado— pero
`faltanCliente`/`faltanTransportista` sí se derivan de la lista
(`carta_porte.ts:311-314`). Escenario: alguien agrega el campo 20 del cliente
(el Apéndice 3 se actualiza cuando cambia la versión del complemento) → el
denominador sigue diciendo 19 y el numerador puede salir **negativo**:
`19 - 20 = -1`, renderizado como "-1 de 19".

Consecuencia: el semáforo que decide si una unidad puede salir a carretera
enseña una fracción imposible; nadie sabe si es un bug de pantalla o un dato
faltante.

Causa raíz probable: los totales se escribieron como literales cuando la lista
ya existía y es contable en tiempo de render.

---

### [BAJO] La cartera agrupa por NOMBRE de cliente, y todos los desconocidos caen en una sola fila "—"
`src/lib/likida/comercial.ts:217` × `src/app/dashboard/facturacion/vista.tsx:266`

`getCobranza` resuelve `cliente: nombrePorId.get(f.cliente_id) ?? '—'`, y
`armarCartera` (`facturacion_clientes.ts:341`) usa esa **cadena** como llave del
`Map` por cliente; la tabla la usa además como `key` de React.

Escenario: dos facturas de $180,000 y $95,000 cuyo `cliente_id` no resuelve
(cliente borrado, fila de otra flota, id nulo) → la tabla "Por cliente — a quién
hay que hablarle" muestra **un solo renglón llamado "—" con $275,000 por
cobrar**, sumando dos empresas distintas. Y dos clientes dados de alta con el
mismo nombre comercial ("Transportes del Norte") se funden en una fila.

Consecuencia: la tabla existe para contestar "a quién le hablo hoy" y en ese
renglón no contesta a quién; el saldo agregado se lee como el de una sola
cuenta.

Causa raíz probable: el agregado se hace por etiqueta en vez de por `cliente_id`,
que sí viaja en la consulta.

---

## Lo que revisé y está bien

- **`FE-C1` sigue CERRADO.** `src/app/dashboard/chat.tsx:104-119`
  (`respuestaDelTurno`) es la única función que arma la respuesta del turno y
  no tiene rama heurística: sin `bloques` devuelve el aviso ("No pude responder
  eso — el análisis no terminó"). El lector NDJSON (`:437-472`) guarda tanto
  `{t:'fin'}` como `{t:'error'}` en `d`, y el `catch` (`:490`) llama
  `respuestaDelTurno(false, null)`. No reabrió.
- **`ARQ-C1` está arreglado en el sitio que el pase 2 nombró.** El funnel
  "Viajes en curso" de `/dashboard/agentes/liquidacion` sale de `contarViajes`
  con `count:'exact'` (`agentes/liquidacion/page.tsx:53-55`), y la vista se
  niega a graficar si algún conteo llegó `null`
  (`agentes/liquidacion/vista.tsx:66`, `:111-112`). `/dashboard/viajes` hace lo
  mismo y además **declara** su ventana (`viajes/vista.tsx:151-154`).
- **El hueco que `viajes/libro.tsx:48-51` denunciaba de sí mismo está tapado.**
  `dinero_por_area.test.ts:74-76` ya escanea **todos** los `.tsx` del directorio
  en vez de una lista de nombres, así que `libro.tsx` (que imprime `mxn(`) entra
  a la superficie del despertador.
- **Ningún link del panel apunta a un 404.** Verifiqué los 30 `href` de
  `admin/rutas.ts` y los 28 de `dashboard/rutas.ts` contra la existencia de
  `page.tsx`, y además barrí todos los `href="/dashboard…"`/`"/admin…"` de
  `src/app`: cero rutas muertas (el único candidato, `/admin/corridas/<id>`
  desde `observabilidad/page.tsx:173`, resuelve a `admin/corridas/[id]`).
- **Las etiquetas de concepto de gasto están atadas al motor, no copiadas.**
  `[id]/page.tsx:392-395` delega en `etiquetaConcepto` y solo cae al mapa local
  cuando el motor devuelve la clave cruda; `etiquetas_panel.test.ts:26-45` lo
  vigila comparando la SALIDA contra el PDF (incluido el caso MAGNA→"Combustible
  Magna", que es dinero: el estímulo de IEPS es solo diésel).
- **`ROTULO_AREA` de Llaves de API es el patrón correcto** y el contraejemplo de
  los tres mapas que reporto arriba: `llaves-api/vista.tsx:14-16` lo construye
  con `Object.fromEntries(AREAS_DE_LLAVE.map(…))` — imposible de desincronizar.
- **`ESTADO_UNIDAD`** (`unidades/vista.tsx:20-25`) cubre exactamente el dominio
  del constraint `unidad_estado_dominio` (`0047_operacion_encargado.sql:47`):
  `disponible | en_ruta | taller | baja`, los cuatro, con fallback a la clave
  cruda.
- **El decisor de Carta Porte no puede dejar la pastilla en blanco:**
  `PILL` (`carta-porte/vista.tsx:73-77`) cubre las tres ramas cerradas de
  `DecisionCcp.necesita` (`carta_porte.ts:78`), y no hay una cuarta. Lo verifiqué
  antes de reportarlo como riesgo — **no lo es**.
- **Facturación a clientes es el mejor bloque del panel.** Cada estado está
  pintado a propósito y ninguno miente: error dicho (`vista.tsx:67`), vacío que
  explica qué lo enciende (`:74-82`), un cero de cubeta como "—" y no "$0.00"
  con la razón escrita (`:291-301`), un renglón de "Total por cobrar" que existe
  para que el contralor pueda cuadrar las cinco columnas (`:196-198`), el color
  rojo condicionado a las **tres** cosas (viva + con saldo + vencida) porque con
  una sola una factura pagada salía en rojo junto a la palabra "saldada"
  (`:376-378`), y "El más viejo, sin facturar" que se convierte en texto cuando
  no hay fecha en vez de pintar un 0 grande (`:463-468`).
- **`Clientes y tarifas` y `Unidades`** siguen el mismo criterio: `saldoPorCobrar
  === null` significa "sin facturas", no "$0" (`clientes.ts:545-551`), el bloque
  de KPIs se **calla entero** si no hay clientes en vez de enseñar tres ceros
  (`clientes/vista.tsx:81`), y "sin papeles" tiene su propia pastilla gris y su
  propio contador en vez de contarse como vigente (`unidades/vista.tsx:16`,
  `:135`).
- **Fronteras de error.** `dashboard/error.tsx` y `global-error.tsx` pintan un
  mensaje sobrio, registran el `digest` y lo enseñan seleccionable en pantalla;
  ningún stack llega al usuario. El texto además desmiente la lectura peligrosa
  ("esto NO significa que no haya liquidaciones").
- **El formato de cifras está centralizado de verdad.** Ninguna pantalla que abrí
  llama `toLocaleString('es-MX')` por su cuenta; todas pasan por `mxn`/`numero`/
  `litros`/`fechaMx` de `lib/formato.ts`, y `usd()` se distingue con "US$"
  precisamente porque convivía con pesos en la misma pantalla de /admin.
- **`key` de React en filas de dinero:** revisé los `key={i}` que quedan
  (`[id]/page.tsx:278`, `:318`, `combustible-casetas/page.tsx:233`) y todos están
  en Server Components sin reordenamiento en cliente — **no** son un hallazgo.
  Las tablas que sí se reordenan o se filtran usan id (`facturacion/vista.tsx:329`,
  `viajes/vista.tsx:117`, `vendedores/tablero.tsx:205`).
- **El tablero de vendedores** dice su recorte en vez de esconderlo (`tablero.tsx:210-214`),
  distingue "vacía bajo este filtro" de "vacía en el negocio" (`:199-201`), y
  scrollea dentro de su contenedor en vez de ensanchar la página (`:187`).
- **Tablas responsive:** todas las que abrí (facturación ×3, clientes, viajes,
  llaves, liquidaciones del agente) están envueltas en `overflow-x-auto`; ninguna
  desborda el `body`.

---

## Lo que NO alcancé a revisar

- **No miré un solo píxel.** No corrí `npm run build` ni levanté un preview
  headless (prohibido en este pase), así que todo lo visual —incluidos los
  contrastes— está **medido sobre el código y la fórmula WCAG**, no mirado. La
  regla del repo dice que medir no sustituye a mirar; esta nota está a medio
  camino por construcción.
- **~31 páginas de `/dashboard` y ~30 de `/admin`.** Abrí y leí completas unas
  25. Quedaron sin abrir: `rentabilidad`, `despacho`, `operadores`,
  `documentos`/`huerfanos`, `mapa`, `politicas`, `conocimiento`, `arco`,
  `suscripcion`, `notificaciones`, `contador`, `integraciones`, `soporte`, y del
  lado de /admin: `flotas`, `compliance`, `trust-safety`, `escalaciones`,
  `crecimiento`, `capacidad-forecast`, `calidad-evals`, `conocimiento-rag`,
  `salud-sistema`, `whatsapp-infra`, `playground`, `dev`.
- **Los cinco agentes restantes de `/dashboard/agentes/`** (cobranza, peajes,
  conductores, talacha, OCR). Solo audité el de liquidación a fondo; los mapas
  literales de los otros no los comparé contra sus tipos, y ahí es exactamente
  donde el modo de falla dominante de este rubro vive.
- **Las formas de captura.** Leí `llaves-api/forma.tsx` entera y hojeé
  `clientes/forma.tsx`, `unidades/forma.tsx`, `facturacion/forma.tsx`,
  `carta-porte/forma.tsx`, `conexiones/credenciales-controles.tsx`. **No** verifiqué
  su validación en cliente, sus `aria-invalid`/`aria-describedby`, ni qué pasa
  con un `useActionState` que devuelve error mientras el usuario ya editó el
  campo.
- **Accesibilidad más allá del contraste.** No revisé orden de foco, trampas de
  foco en los `<details>` y menús flotantes, `aria-live` en los estados de
  "Pensando…" del chat, ni tamaños de toque (vi botones de 28×28 y de `h-7` que
  quedan por debajo de los 44px recomendados, pero no los inventarié).
- **Modo oscuro.** Existe un `[data-theme="dark"]` completo con `SelectorTema` en
  los dos sidebars; medí los tokens principales (todos pasan AA sobre `--surface`
  oscuro) pero no revisé una sola pantalla en ese modo.
- **`design-system/`** no existe en este árbol; el kit vive en `src/app/admin/ui/`
  y `src/app/admin/charts.tsx`. De ahí leí `kit.tsx` parcialmente (StatCard,
  EstadoVacio, StatusPill) y **no** abrí `graficas.tsx`, `charts.tsx`,
  `global-filter.tsx` ni `forma.tsx`: los componentes que dibujan las cifras del
  contralor están sin auditar por dentro (ejes, redondeos, tooltips, el
  `useCountUp` que anima dinero).
