# Frontend — auditoría 17 · pase 6 (13-ago-2026)

**Nota: 4/10** (antes 5). Razón del movimiento: **deuda que cobró factura**. La
v3 del 12-ago sí cerró de verdad ocho hallazgos míos (lo verifico abajo, con
sus pruebas verdes), pero entregó las dos pantallas nuevas —el chat y el alta
de viaje, que son las que se van a enseñar— **sin una sola prueba de frontend
propia**, y con ellas entró el defecto que el ancla del rubro castiga por
nombre: *"4 o menos si el comprador puede ver una cifra mal formateada"*. La
tabla del chat imprime **`184320.00`** donde el resto del producto imprime
**`$184,320.00`**, y no es un descuido de un `map`: `prompts.ts:55` le **pide
al modelo** que mande los montos "como número en texto plano", y
`chat.tsx:63` los pasa sin tocar. El formato de una cifra de dinero dejó de
vivir en `lib/formato.ts` y pasó a vivir en un prompt.

Riesgo mayor hoy: esa cifra. Es la pantalla que el pedido del 12-ago puso al
frente ("que responda con gráficas, tablas y muy visual"), el contralor la va a
cruzar contra su PDF, y `formato.test.ts` no puede verla porque prohíbe
`toLocaleString('es-MX')` fuera de un archivo — aquí el problema es que el
formato **no ocurre**.

Los 15 rojos de la tabla del MAPA no se recuentan aquí; sí agrego dos
ampliaciones sobre ellos.

---

## Hallazgos

### [ALTO · NUEVO] La tabla del chat imprime montos sin formato de moneda — y quien decide el formato es el MODELO, no `lib/formato.ts`

`src/app/dashboard/chat.tsx:63` (`filas: (b.filas as Array<[string, string | number]>).map(([k, v]) => [k, typeof v === 'number' ? numero(v) : v])`),
`src/app/dashboard/chat.tsx:52-53` (el comentario que afirma lo contrario:
*"El agente manda números crudos; aquí se formatean con lib/formato — UNA sola
fuente de formato, como siempre"*),
`src/lib/agents/prompts.ts:55` (`'tabla': desgloses — cada fila como {concepto, valor}. Máximo 10 filas; los montos como número en texto plano (ej. "8340.50")`),
`src/lib/agents/analista.ts:216-221` (el schema de la tool declara
`valor: { type: 'string' }`) y `:82-83` (`validarBloques` acepta el string tal cual).

Escenario con valores: el contralor escribe *"desglósame lo comprobado"*. El
analista llama sus tools, obtiene 184320.5 y —obedeciendo el prompt— entrega
`{concepto: "Monto comprobado", valor: "184320.50"}`. En el cliente,
`typeof v === 'number'` es **false** (es string), así que la rama de formato no
corre y la celda sale literal:

| Dónde | Qué imprime |
|---|---|
| Tabla del chat (`chat.tsx:176`) | **`184320.50`** |
| Fallback local del mismo chat (`chat.tsx:83`, `mxn`) | **`$184,320.50`** |
| KPI del Resumen (`StatCard` → `resolverFormato('mxn')`) | **`$184,320.50`** |
| El PDF de la liquidación | **`$184,320.50`** |

Y si el modelo manda el número en vez del string, la rama que sí corre es
`numero()`, no `mxn()`: `numero(184320.5)` = **`184,320.5`** — sin `$` y con un
decimal. Ninguna de las dos ramas produce pesos.

Consecuencia: el contralor lee en la pantalla estrella del rediseño una cifra
fiscal en un formato que ningún contador usa, y la misma cifra escrita de dos
maneras en la misma sesión —que es exactamente lo que `CLAUDE.md` describe como
"se lee como dos cálculos". El bloque `cifra` sí está bien
(`chat.tsx:60-61` resuelve `mxn`/`litros`/`numero` desde `formato`): la
inconsistencia es solo del bloque `tabla`, que es el que el prompt empuja a usar
para desgloses.

Causa raíz probable: el contrato de `tabla` se definió con `valor: string`
(`analista.ts:219`) para que Gemini aceptara el schema, y con eso el formato
salió de la única fuente y se delegó al prompt.

---

### [ALTO · NUEVO] El alta de viaje reabre, en una línea, el fail-open que `repo.ts` prohíbe por escrito

`src/app/dashboard/viajes/nuevo/page.tsx:36` (`const operadores = await listOperadores(tenantId).catch(() => []);`),
contra `src/lib/likida/repo.ts:102-104`:

```
  // Un error leído como lista vacía se pinta "no hay choferes" — falso, y
  // esconde justo la sección que decide si "Reasignar" tiene sentido mostrarse.
  if (error) throw new Error(`listOperadores: ${error.message}`);
```

El `throw` existe precisamente para que nadie aplane el error a `[]`. La página
nueva lo aplana en el call site.

Escenario con valores: la flota tiene 9 operadores activos. La consulta a
`operador` falla (RLS, PostgREST caído, timeout). El `.catch(() => [])`
devuelve `[]`; `forma-viaje.tsx:74-79` pinta el `<select>` con **una sola
opción, "Sin asignar todavía"**, y justo debajo, en `:80-82`, la promesa
*"Con operador asignado, Likida le avisa por WhatsApp en cuanto el viaje
exista."* El jefe de tráfico concluye que no tiene choferes dados de alta,
crea el viaje sin operador, y `crearViaje` (`operacion.ts:585`) nunca llama
`avisarAlChofer`.

Consecuencia: el lazo central del producto —el operador recibe su viaje por
WhatsApp y empieza a mandar comprobantes— se rompe en silencio, y la pantalla
afirma un hecho falso sobre la plantilla de la flota. Ningún aviso, ninguna
diferencia visual respecto al caso "de verdad no hay operadores".

Causa raíz probable: se copió el patrón `safe()` del Resumen a una consulta
cuyo autor lo prohibió explícitamente; `safe()` sirve cuando la pantalla sabe
pintar el `null`, y aquí no lo distingue de `[]`.

---

### [ALTO · NUEVO] El chat se traga el error del servidor y contesta de su tabla de palabras clave sin decir que falló

`src/app/dashboard/chat.tsx:382-387`:

```
      const r: Respuesta = resp.ok && d && Array.isArray(d.bloques)
        ? respuestaDeBloques(d.bloques as Array<Record<string, unknown>>)
        : responder(q, kpis, acred);
      setHistorial((h) => [...h.slice(0, -1), { q, r }]);
    } catch {
      setHistorial((h) => [...h.slice(0, -1), { q, r: responder(q, kpis, acred) }]);
```

El campo `error` del cuerpo se descarta; el `status` no se mira.

Escenario con valores: el contralor adjunta su Excel de gastos y pregunta
*"¿este archivo cuadra con lo que tienes tú?"*. `ejecutarAnalista` revienta
(OpenRouter 5xx, o su `AbortController` de 40 s en `analista.ts:309`), y
`api/dashboard/chat/route.ts:104-107` responde **502**
`{error: 'el analista no pudo responder en este momento'}`. El cliente cae a
`responder(q, kpis, acred)` (`chat.tsx:144`) y pinta:

> **"Todavía no sé responder eso — pregúntame sobre lo comprobado, diferencias,
> diésel, IVA, peaje o tu tasa de cuadre."**

El documento adjunto sigue en la píldora de arriba, intacto, y la respuesta no
lo menciona. Lo mismo con el 504 de Vercel: `maxDuration = 60`
(`route.ts:28`) contra el `AbortSignal.timeout(75_000)` del cliente
(`chat.tsx:379`) — a los 60 s el runtime corta, `resp.ok` es false, y tras
haber recorrido las cinco fases de "Pensando…" hasta *"Esto está tardando más
de lo normal…"* (`chat.tsx:43-49`) sale la misma frase. Y con **401** (cookie
vencida a media demo, `route.ts:42`) igual: el chat sigue "contestando" a un
usuario que ya no tiene sesión.

Consecuencia: una falla de infraestructura se le presenta al comprador como
*límite de capacidad del producto* — "no sabe leer mi Excel". Es la clase de
degradación que el propio endpoint sabe hacer bien: el tope diario
(`route.ts:88-95`) responde **200** con un bloque de texto que explica qué pasó,
y el chat lo pinta correcto. La ruta de error no tiene ese trato.

Causa raíz probable: el fallback se diseñó para el caso "el agente no está
disponible, aquí va lo que sí puedo calcular", pero se aplica a **todo**
`!resp.ok`, y el respondedor local no tiene forma de decir "esto no lo contesté
yo por elección".

---

### [ALTO · NUEVO] "aún sin liquidación" y el "—" de la columna Acción mienten sobre viajes que sí están liquidados

`src/app/dashboard/inicio-contenido.tsx:147`
(`const liqPorFolio = new Map((liquidaciones ?? []).map((l) => [l.folio, l.id]));`),
`:152` y `:161` (`liqId = v.estatus === 'liquidado' ? liqPorFolio.get(v.folio) ?? null : null`),
`src/app/dashboard/barra-acciones.tsx:81` (`{r.detalle}{!r.href && ' · aún sin liquidación'}`),
`src/app/dashboard/resumen-visual.tsx:156-162` (el `Link` "Ver" o el "—"),
contra `src/lib/likida/analytics.ts:1556` (`getLiquidaciones` → `.limit(50)`) y
`:802` (`getViajes(tenantId, limite = 100)`).

**Dos formas de fallar, las dos silenciosas:**

1. **El tope de 50 contra el tope de 100.** Flota con 74 viajes liquidados. El
   Resumen carga los 100 viajes más recientes y solo las **50** liquidaciones
   más recientes. El contralor teclea `TI-0301` en el buscador de la barra; el
   viaje aparece —está en los 100— y la línea de abajo dice
   **"Silao → Monterrey · Ramírez · aún sin liquidación"**. Su liquidación
   existe, está cerrada y su PDF se puede descargar; simplemente es la número
   58 y quedó fuera de la ventana. En la tabla, esa fila sale con la píldora
   verde **"Liquidado"** y, en la columna de al lado, un **"—"** donde sus
   vecinas tienen "Ver". Dos afirmaciones contradictorias en la misma fila.

2. **`getLiquidaciones` caída no se avisa.** `estadoPanel`
   (`inicio-contenido.tsx:135`) recibe `liquidaciones: liquidacionesDeViajes(viajes)`
   —derivado de `getViajes`—, **no** el resultado de `getLiquidaciones`. Si esa
   consulta falla, `safe()` devuelve `null`, `?? []` lo aplana, `liqPorFolio`
   queda vacío, **todos** los viajes liquidados pierden su "Ver" y el buscador
   le dice "aún sin liquidación" a la flota entera — con `estado === 'datos'`
   y sin la cinta de "Faltan datos por cargar" (`:258-268`).

Consecuencia: el rótulo miente sobre dinero, y la única puerta que hoy existe
hacia el expediente y su "Descargar PDF" se cierra sin decir por qué. En el
demo, el presentador busca el folio que quiere enseñar y el panel le contesta
que ese viaje no está liquidado.

Causa raíz probable: el cruce se hace por `folio` en el cliente en vez de traer
`liquidacion.viaje_id`, y las dos consultas tienen ventanas distintas que nadie
concilia. (Aparte: `viaje` no tiene índice único `(tenant_id, folio)` —los
únicos que existen son de `factura_emitida` y `cotizacion`, migs. 0049/0051— y
el `folio` del alta nueva es texto libre sin validar, así que dos viajes con
`F-0148` colapsan a una sola entrada del `Map`: gana la última del arreglo, que
por el `order created_at desc` es la **más vieja**.)

---

### [MEDIO · NUEVO] Adjuntar un comprobante deja la caja del chat muerta, sin un solo píxel que diga que está trabajando — y sin reloj que la libere

`src/app/dashboard/chat.tsx:264-307` (la rama de imagen de `leerArchivo`: pone
`setOcupado(true)` en `:264` y **no** empuja ningún mensaje al historial hasta
`:294`), `:273-276` (el `fetch` a `/api/dashboard/ingesta` **sin**
`AbortSignal`), contra sus dos hermanos del mismo archivo que sí lo llevan:
`:238-242` (`/api/dashboard/archivo`, `signal: AbortSignal.timeout(75_000)`) y
`:374-380` (`/api/dashboard/chat`, con el comentario *"Sin esto, un servidor
colgado dejaba 'pensando…' para siempre (reportado en vivo el 12-ago)"*).

Escenario con valores: en el demo, el presentador aprieta el clip → "Tomar
foto" → fotografía el ticket de diésel. La imagen viaja como data URL (una foto
de teléfono son 3–7 MB de base64) y el OCR corre hasta 45 s
(`api/dashboard/ingesta/route.ts:49`). Durante esos 45 segundos la pantalla no
cambia: no hay burbuja, no hay `skeleton`, no hay "Leyendo el comprobante…" —
solo el botón de enviar y el clip atenuados al 50 % (`chat.tsx:508`, `:515`).
El presentador aprieta otra vez, no pasa nada (`leerArchivo:225`
`if (ocupado) return`), y vuelve a apretar.

Y si la conexión se cae a media subida —Wi-Fi de sala de juntas— el `fetch` sin
`signal` **nunca resuelve**: `ocupado` se queda en `true` para siempre y la caja
no vuelve a aceptar ni una pregunta escrita hasta recargar la página. Ese es
literalmente el modo de falla que el comentario de `:377-378` dice haber
cerrado el 12-ago para el otro endpoint.

Consecuencia: el paso más vistoso del demo —"le tomas foto al ticket y el motor
lo lee"— se ve como una interfaz congelada. La rama de texto, dos bloques
arriba, tiene el mismo hueco de feedback (75 s de silencio para un Excel), pero
al menos no se puede colgar.

---

### [MEDIO · NUEVO] Las píldoras de región de "Top rutas" reprueban AA sobre el fondo que de verdad pintan — y su prueba murió en el merge

`src/app/dashboard/top-rutas.tsx:55-56`
(`className="text-xs …"` con `style={{ color: colorDe(r.region), background: \`color-mix(in srgb, ${colorDe(r.region)} 12%, transparent)\` }}`),
`:16-19` (`COLOR_REGION`), `:22` (`colorDe` → `'var(--muted)'` para "Sin
clasificar"), y `:9-15`, el comentario que afirma lo contrario:

> *"Los siete pasan AA (4.5:1) como TINTA sobre `--surface` … Medido en
> `contraste_tinta_componente.test.ts`."*

El fondo no es `--surface`. Es la propia tinta al 12 % compuesta sobre
`--surface`, o sea un tinte del mismo tono, y eso **baja** el contraste. Misma
fórmula WCAG 2.1 que `contraste.test.ts:25-35`:

| Región | Tinta | Sobre `--surface` (lo medido) | Sobre la píldora real | AA (12 px) |
|---|---|---|---|---|
| Sureste | `#b45309` | 5.02 | **4.25** | ✘ |
| Noreste | `#15803d` | 5.02 | **4.27** | ✘ |
| Centro | `#c2410c` | 5.18 | **4.35** | ✘ |
| Sin clasificar | `--muted` `#6b7280` | 4.83 | **4.16** | ✘ |
| Golfo | `#0e7490` | 5.36 | 4.53 | ✔ (por 0.03) |
| Noroeste | `#7c3aed` | 5.70 | 4.75 | ✔ |
| Occidente | `#0369a1` | 5.93 | 4.98 | ✔ |
| Sur | `#be123c` | 6.29 | 5.12 | ✔ |

Y ya no hay red: **`contraste_tinta_componente.test.ts` no existe en el árbol**
(`git show 65da222:…` lo muestra; `ls src/app/dashboard/*.test.*` ya no). El
MAPA lo clasificó como "colateral del borrado, SIN hallazgo detrás", y para el
degradado naranja es cierto —`DEGRADADO_MARCA` se retiró de
`resumen-visual.tsx`—, pero **`COLOR_REGION` sobrevivió** y se quedó sin nadie
que lo mida.

Escenario: "Centro" es la región del 60 % de las rutas de una flota del Bajío;
es la píldora que más se repite en la tabla, a 12 px, proyectada en una sala
iluminada. `--muted` ("Sin clasificar") es el peor de los ocho y es justo el que
marca la ruta que el catálogo no reconoció, o sea la que hay que mirar.

Causa raíz probable: la medición se hizo contra `--surface` porque así lo hacía
el guardarraíl que existía; el componente pinta sobre otra cosa desde
`top-rutas.tsx:56`.

---

### [MEDIO] Entre 768 y 1023 px el sidebar vuelve a cortar sus etiquetas a ~10 px (REINCIDENTE — reabierto por el merge)

`src/app/marco.ts:22-23` (`MARCO_SIDEBAR = 'glass-panel w-[72px] lg:w-[232px] … overflow-hidden'`),
`src/app/dashboard/chrome.tsx:63-72` (el `<nav>` mete `<SidebarNav rol={rol}/>`
en esa columna **sin** variante colapsada; el propio comentario deja constancia:
*"El modo COLAPSADO que lo acompañaba —`<SidebarNav soloIconos />` entre `md` y
`lg`— NO sobrevive al merge del 13-ago … El corte de etiquetas a ~10px que
tapaba vuelve a estar abierto"*),
`src/app/dashboard/sidebar-nav.tsx:9` (`ITEM = 'flex items-center gap-2.5 px-2.5 py-1.5 … text-[13px] sb-centrable'`),
`:45` y `:113` (`<span className="sb-texto truncate">{nombre}</span>`),
`src/app/globals.css:318-324` (las reglas de colapso solo se activan con
`:root[data-sidebar='min']`, que lo pone `boton-sidebar.tsx` — y ese botón vive
en `chrome.tsx:50` dentro de un `hidden lg:block`, o sea **no existe** en este
rango).

Aritmética con los números del árbol de hoy: `aside` 72 → `nav px-2` 56 →
item `px-2.5` 36 → ícono 16 + `gap-2.5` 10 = 26 → quedan **≈ 10 px** de texto.

Escenario: el contralor abre el panel en un iPad vertical (768 px CSS) o el
presentador sube el zoom a 150 % en un portátil de 1440 (→ 960 px CSS). Salen
dos filas —"Resumen" y "Chatea con tus datos"— reducidas a un ícono y una
elipsis, sin ningún control para ensanchar (el colapsador es `lg`+).

Diferencia honesta con el pase 5: el daño es **menor** que entonces, porque hoy
el sidebar solo pinta 2 items (`rutas.ts:67-71` + el Resumen) en vez de 8 + 2
encabezados, y `:45` sí tiene `truncate`, así que corta con elipsis y no a
mitad de letra. Por eso MEDIO y no más. `/admin` sigue teniendo la solución
escrita al lado (`admin/layout.tsx`, el par
`hidden lg:block`/`lg:hidden` con `SidebarNavIconos`) y comparte `marco.ts` con
esta pantalla.

(REINCIDENTE — del pase 5. **El MAPA lo cuenta como "colateral sin hallazgo
detrás"** por el borrado de `sidebar_colapsado.test.tsx`; el sujeto no
desapareció, solo su prueba.)

---

### [MEDIO · NUEVO] "Crear viaje" con el formulario vacío crea el viaje, y el Resumen imprime 8 dígitos hexadecimales en la columna "Viaje"

`src/app/dashboard/forma-viaje.tsx:49-79` (los seis campos: **ninguno** lleva
`required`, ninguno lleva validación de cliente),
`src/app/dashboard/viajes/nuevo/page.tsx:48-60` (la action solo valida el monto
del anticipo y el formato de la fecha; folio/origen/destino pasan como `null`
por `texto()` en `:48-51`),
`src/lib/likida/operacion.ts:559-569` (`folio: v.folio || null, origen: … || null, destino: … || null, anticipo: v.anticipo ?? 0`),
`src/lib/likida/analytics.ts:812` (`folio: (v.folio as string) || (v.id as string).slice(0, 8)`),
`src/app/dashboard/resumen-visual.tsx:146` (`<div className="text-sm font-medium">{v.folio}</div>`).

Escenario con valores: el jefe de tráfico abre "Nuevo viaje" desde el botón del
Resumen (`inicio-contenido.tsx:215-219`), se distrae, y aprieta **Crear
viaje**. La action pasa las dos validaciones que hay (`anticipo = 0` es finito y
≥ 0; `fecha = null` no entra al regex), `crearViaje` inserta la fila, y
`redirect` devuelve al Resumen. Ahí aparece, como primera fila de "Viajes
recientes":

| Viaje | Operador | Anticipo | Estatus | Inicio | Acción |
|---|---|---|---|---|---|
| **`a3f91c2e`** · — | Sin asignar | $0.00 | Abierto | — | — |

`a3f91c2e` son los primeros 8 caracteres del UUID: `getViajes` los usa como
folio sintético cuando la columna es nula. El viaje entra al conteo de "viajes
activos", a la dona de "Viajes" del periodo y a `AvanceCierre`. No hay cómo
borrarlo desde la interfaz (no existe pantalla de viajes).

Consecuencia: el único camino de escritura que hoy tiene el panel acepta un
registro completamente vacío y lo publica en la pantalla de apertura del demo,
con un fragmento de identificador de base de datos donde va el folio del viaje.
El `maxLength` de los campos indica que alguien pensó en la forma del dato; el
`required` no se puso.

---

### [BAJO · NUEVO] "Ver los N" presenta el tope de 100 como si fuera el total de viajes de la flota

`src/app/dashboard/viajes-recientes.tsx:22` (`filas.length > 6`) y `:27`
(`Ver los {filas.length}`), alimentado por `inicio-contenido.tsx:148`
(`(viajes ?? []).map(...)`) sobre `getViajes(tenantId)` con `limite = 100`
(`analytics.ts:802`).

Escenario: flota con 340 viajes. El botón dice **"Ver los 100"** y al abrirlo
enseña 100. `contarViajes` (`analytics.ts:750`) existe exactamente para esto y
su docstring lo dice con todas sus letras —*"el KPI enseñaba `viajes.length`
como si fuera el total … Es el rótulo que miente, que es la regla que define
este producto"*—; `grep -rn "contarViajes" src/` fuera de `analytics.ts` y su
prueba da **cero** llamadores.

BAJO porque el botón no afirma "todos"; se vuelve MEDIO en cuanto alguien lo
convierta en el "Ver todo" que el comentario de `:11-12` ya anuncia.

---

## Ampliaciones de fichas conocidas (NO son hallazgos nuevos)

### Sobre `kpi-periodo.test.tsx` y `ahorro_sin_dato.test.ts` (los dos `?? 0`)

La ficha señala dos líneas (`kpi-periodo.tsx:67` y el mismo patrón en
`inicio-contenido.tsx:287`). El radio es estructural, no de dos líneas: la v3
cambió `KpiDegradado` —que aceptaba `number | null` y sabía pintar "sin dato"—
por `StatCard` de `admin/ui/kit.tsx:110-115`, cuya firma es **`valor: number`**.
Con ese contrato, *todo* call site está obligado a aplanar, y `tsc` lo exige.
Son **6 usos** en 3 archivos (`inicio-contenido.tsx`, `kpi-periodo.tsx`,
`tablero-operacion.tsx`): mientras `StatCard` no recupere el `null`, cerrar los
dos `?? 0` fichados deja el agujero abierto para el siguiente KPI que se agregue.

### Sobre `expediente_alcanzable.test.tsx`

La prueba falla afirmando que `dashboard/page.tsx` debe contener
`'UltimasLiquidaciones'`. Eso ya no es cierto por mudanza, no por defecto:
`page.tsx` se partió y el contenido vive en `inicio-contenido.tsx`, que **sí**
abre el expediente por dos caminos nuevos (`resumen-visual.tsx:156-159`, el
"Ver" de la tabla; y `barra-acciones.tsx:77`, el buscador). O sea: la puerta
existe, la prueba apunta al archivo equivocado. Lo que **no** está cerrado es la
fiabilidad de esa puerta — ver mi ALTO del `liqPorFolio`: solo funciona para las
50 liquidaciones más recientes, se apaga entera si `getLiquidaciones` se cae, y
nunca funciona para un viaje sin folio (los folios sintéticos salen de
`viaje.id.slice(0,8)` en `analytics.ts:812` y de `liquidacion.id.slice(0,8)` en
`:1563` — dos tablas distintas, nunca cruzan).

---

## Hallazgos del pase 5 que YA NO APLICAN

Verificado uno por uno, con la prueba que lo ancla:

| Pase 5 | Estado hoy |
|---|---|
| **[MEDIO] KPIs blanco sobre el degradado naranja a 2.1–2.6:1** | **CERRADO POR SUPRESIÓN + ARREGLO.** `DEGRADADO_MARCA`/`KpiDegradado` se retiraron de `resumen-visual.tsx` (ver su cabecera, `:14-19`), y `.tema-neutro` (`globals.css:152-162`) pone `--marca: #18181b` en las dos consolas: blanco sobre negro ≈ 16.9:1. El item activo del sidebar hoy es pill suave `--g1` con tinta `--marca` (`sidebar-nav.tsx:20-22`), ~15.4:1 |
| **[MEDIO] "Golfo" `#0891b2` a 3.68:1** | **CERRADO POR ARREGLO** — `top-rutas.tsx:18` es `#0e7490`. (La medición se hizo contra el fondo equivocado: ver mi MEDIO de arriba) |
| **[ALTO] "Litros elegibles … 0.00 L" con la consulta caída** | **CERRADO POR ARREGLO** — `combustible-casetas/litros_sin_dato.test.tsx`, 4 verdes |
| **[MEDIO] "Usuarios & Roles" imprime `flota_admin` crudo** | **CERRADO POR ARREGLO** — `usuarios/roles_legibles.test.ts`, 5 verdes |
| **[MEDIO] Soporte imprime `facturacion` / `en_proceso` crudos** | **CERRADO POR ARREGLO** — `soporte/etiquetas_soporte.test.ts`, 6 verdes |
| **[MEDIO] "Vencen pronto (≤ 5 días)" cuenta solo lo vencido** | **CERRADO POR ARREGLO** — `arco/vencimiento.test.ts`, 11 verdes |
| **[MEDIO] "Actividad" bucketea con la zona del proceso** | **CERRADO POR ARREGLO** — `actividad.test.ts` (9) y `actividad_ciega.test.tsx` (5), verdes |
| **[ALTO] "Aún no hay viajes registrados" con `getViajesPorMes` caída** | **CERRADO POR ARREGLO** — `actividad_ciega.test.tsx` verde |
| **[ALTO] El asistente expandido bajo 1280 px deja el panel invisible** | **CERRADO POR SUPRESIÓN** — el rail se borró el 12-ago (`chrome.tsx:108-111`: *"nunca más debe aparecer en ninguna página"*), con él su endpoint. `rail.tsx` ya no existe |
| **[MEDIO] El chat se queda "expandido" al navegar** | **CERRADO POR SUPRESIÓN** — mismo borrado del rail |
| **[MEDIO] "Diésel" vs "Combustible"** | **CERRADO POR ARREGLO** — `etiquetas_panel.test.ts`, 3 verdes |
| **[BAJO] El eje de pesos mezcla centavos y enteros** | **CERRADO POR ARREGLO** — `gasto_semanal_chart.test.tsx`, 12 verdes |
| **[MEDIO] "El panel manda al chofer a `/mis-viajes`"** | **CERRADO** — el texto ya no está en `usuarios/page.tsx` (`roles_legibles.test.ts` verde) |
| **[MEDIO] `/admin/model-ops` rotula 3 de 6 fases** | **NO VERIFICADO este pase** (ver "lo que no alcancé") |

---

## Lo que revisé y está bien

**La superficie nueva, archivo por archivo** (era la prioridad del pase):

- **`chat/page.tsx:29`** — `puedeVerArea(rol, 'dinero')` corre **antes** de
  `getKpis`/`getAcreditables` (`:31-34`). Un encargado no puede sacar cifras de
  dinero por esta pantalla. El endpoint repite el chequeo
  (`api/dashboard/chat/route.ts:44-46`), o sea dos capas independientes.
- **`api/dashboard/chat/route.ts:83-95`** — el tope diario **falla cerrado y lo
  dice**: si no se puede leer `llm_costo`, responde 200 con un bloque de texto
  que explica que el análisis descansa, y el cliente lo pinta tal cual. Es el
  patrón correcto del repo, y contrasta con la ruta de error (mi ALTO).
- **`sidebar-nav.tsx:104`** — el menú se filtra con la MISMA `puedeVerRuta` que
  gatea la página; `rolMenu` (`:98`) replica `rolEfectivo` sin poder **dar**
  permisos (`visibilidad.ts:154-158`). El sufijo `?tenant=`/`?vista=`/`?rol=`
  viaja en cada `href` (`:83-92`) y en los de `inicio-contenido.tsx:166`, `:215`
  y `viajes/nuevo/page.tsx:33-34`, `:78`, `:88`. `sufijo.test.ts` verde (5).
- **`viajes/nuevo/page.tsx:38-46`** — la server action **re-verifica sesión y
  permiso adentro** (`requireSessionTenant` + `puedeAsignar(sesion.rol)`, con el
  rol REAL, no el previsualizado): el gateo del render no es la única puerta. Y
  `crearViaje` (`operacion.ts:545-557`) revalida en el servidor que el operador
  sea de esta flota — el `<select>` no se cree.
- **`inicio-contenido.tsx:141` y `:173`** — las alertas se dejaron **vacías** a
  propósito, con el motivo escrito, en vez de enlazar a `/dashboard/cuadre`,
  que ya no existe. Los pendientes de la campana salen como texto sin link.
  Esa es la disciplina correcta: cero `href` muertos. Recorrí los 14
  `href="/dashboard…"` / `redirect('/dashboard…')` del repo y **ninguno apunta a
  una página borrada**.
- **`resumen-visual.tsx:141`** — `PILL_ESTATUS` cubre los **3** valores del
  constraint `viaje_estatus_dominio` y cae a la clave cruda en neutro. `:142` y
  `:149`: sin origen/destino no inventa ruta, pone "—".
- **`analista.ts:166-190` (`cifrasRespaldadas`) + `chat.tsx:70`** — el bloque
  `cifra` sí resuelve `mxn`/`litros`/`numero` desde `lib/formato`, y el bloque
  `serie` pasa `mxn` como `etiquetaValor`. La guardia de cifras del servidor es
  determinística y el cliente no la puede saltar. Mi hallazgo es solo del bloque
  `tabla`.
- **`barra-acciones.tsx:44-50`** — el dropdown se cierra al clic fuera, con
  `removeEventListener` en el cleanup. `:53-54` normaliza acentos antes de
  filtrar, así que "Monterrey" encuentra "montérrey". `:75` la `key` compone
  etiqueta+detalle.
- **`boton-sidebar.tsx:32`** — `useSyncExternalStore` con snapshot de servidor
  fijo en `false`: sin mismatch de hidratación y sin `setState` en efecto.
- **`chat.tsx:216-218`** — el ancla al último mensaje depende de
  `historial.length`, no del objeto, así que no re-scrollea en cada render.

**Formato de cifras — el barrido completo.** `src/lib/formato.ts` sigue siendo
la única fuente: `dashboard/formato.ts` es reexport puro, `lib/utils.ts:12`
también, `admin/ui/formato-preset.ts` resuelve presets llamando a esas
funciones. `formato.test.ts` (7 casos, incluida la prohibición de
`toLocaleString('es-MX')` fuera del archivo) **verde**. El agujero que reporto
no lo viola por copiar la función: la evita.

**Modo oscuro: ya no es un riesgo.** `globals.css:124-130` retiró el
`@media (prefers-color-scheme: dark)`; las dos reglas `[data-theme]` quedan
declaradas pero nada las dispara, y no hay switch. Esto cierra el hueco que
dejé anotado en el pase 5 y hace inofensivo el `bg-white` literal de
`ChipFecha` (`resumen-visual.tsx:57`).

**Claves de React en filas de dinero.** `TablaViajes` (`resumen-visual.tsx:144`)
usa `v.id`; `TopRutas` (`top-rutas.tsx:49`) usa `origen→destino`, que es la
llave de agrupación de `getTopRutasPorGasto`; `TablaCarga`, `c.operadorId`;
`arco`, `s.id`; `usuarios`, `u.id`; `soporte`, `t.id`. Los `key={i}` que quedan
(`chat.tsx:396`, `:561`, `:577`; `MotorFiscal` `resumen-visual.tsx:207`) son
listas append-only sin reordenamiento. Ninguna clave inestable mueve una fila de
dinero.

**Estados vacío/error/parcial de las páginas heredadas**, releídos porque el
merge las tocó: `combustible-casetas:66-76` (distingue "nunca llegó consolidado"
de "la consulta falló" — sigue siendo el mejor hecho del panel),
`soporte:55-60`, `arco:95-99`, `politicas:124-127`, `configuracion:47-50`,
`suscripcion:234`/`:445-459`, `inicio-operacion.tsx:96` (`?? '—'`, no `?? 0`),
`:123-129`, `:139-140`, `:169-170`, `dashboard/error.tsx:66-71` (el `digest` en
pantalla, `select-all`). Ninguno pinta un cero por una consulta caída.

**Compuerta.** `npx tsc --noEmit -p .` → **0 errores**.
`npx vitest run src/app/dashboard` → **28 archivos, 186 pruebas: 171 verdes,
15 rojos** — los 15 son exactamente la tabla del MAPA (`ahorro_sin_dato` ×3,
`aria_current` ×2, `expediente_alcanzable` ×1, `kpi-periodo` ×1,
`objetivo_de_toque` ×2, `panel_periodo` ×3, `sidebar_puerta` ×3), ni uno más.
Árbol limpio: no toqué ningún archivo fuera de éste.

---

## Lo que NO alcancé a revisar

- **Nada se renderizó en un navegador, SEXTA ronda seguida.** Los números de
  contraste son aritmética verificable (misma fórmula que
  `contraste.test.ts:25-35`, tokens leídos de `globals.css`) y los anchos del
  sidebar salen de las clases Tailwind del árbol de hoy — pero no vi la píldora
  "Centro" en una pantalla ni el chat después de adjuntar una foto. El hallazgo
  del feedback ausente es lectura de código, no observación.
- **`/dashboard/chat` con el agente vivo.** No lo ejercité contra OpenRouter
  (no hay llaves aquí), así que **no vi una tabla real del modelo**: el formato
  que reporto lo deduzco del contrato (`prompts.ts:55` + `analista.ts:219` +
  `chat.tsx:63`), que es determinístico, pero no de una respuesta capturada.
  Tampoco medí cuántas de las 12 respuestas del catálogo de Consulta
  (`chat.tsx:315-342`) el agente contesta con `tabla` y cuántas con `cifra`.
- **`/api/dashboard/archivo` y el lector universal** (`intake/archivo.ts`). Solo
  leí el contrato desde el cliente: qué trae `d.extracto` y `d.meta`, y que
  `d.meta` se pinta como tabla sin validar su forma (`chat.tsx:253`,
  `Array.isArray` y nada más). Es frontera de confianza nueva y no la abrí.
- **`suscripcion/page.tsx` completa** (≈480 líneas) y su `./vista.tsx` — la
  pantalla de aterrizaje del contador. Leí el gateo, los mapas de estado y las
  ramas de Stripe; no las tres server actions de contratación.
- **`combustible-casetas/vista-consolidado.tsx`** — el único formulario
  interactivo de resolución de líneas. Solo su contrato.
- **Las ~30 páginas de `/admin` por dentro**, incluido si el reincidente de
  `model-ops` (`FASE_LABEL` con 3 de 6 fases) sigue abierto. Sigue sin haber
  `admin/error.tsx`.
- **Accesibilidad más allá de contraste, tamaño de toque y `aria-current`.** No
  verifiqué orden de foco, teclado en el menú de adjuntar de `chat.tsx:484-505`
  (es un `div` flotante sin `role="menu"` ni cierre con Escape ni clic-fuera —
  a diferencia del de `barra-acciones.tsx`), ni `aria-live` en la burbuja de
  "Pensando…" ni tras las server actions. El pill de `panel-periodo.tsx:59-65`
  sigue sin `aria-pressed` — quinta vez que se anota sin contarlo como hallazgo.
- **Responsive por debajo de 768 px.** El buscador de la barra es
  `hidden md:block` (`barra-acciones.tsx:59`), o sea desaparece en teléfono
  junto con la única entrada al expediente que no es la tabla; no medí qué hace
  la tabla de viajes ni la conversación del chat a 390 px.
- **La suite completa** (`npx vitest run` a secas). Corrí los 28 archivos de
  `src/app/dashboard`; la cifra global la tomo del MAPA.
