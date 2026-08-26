# Frontend — auditoría 19

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura**, con
una parte de **mirada más profunda**.

- Hubo cierres reales y del tipo bueno: `estadoRenglon` ya no reconstruye la
  cubeta del motor sino que la **importa** (`[id]/vista.tsx:6`, `:169`, `:173`),
  y su prueba nueva **lee las listas del motor** en vez de repetirlas
  (`estado_renglon.test.ts:33-45`). ARQ-C3-1 quedó cerrado como se debía.
- Pero la superficie NUEVA de esta ronda —`/dashboard/onboarding` (838 líneas) y
  `contador/estimulo-peaje.tsx`— llegó **sin la disciplina que el resto del panel
  ya tiene**: no usa `Bloque`, no distingue `null` de vacío (dos `catch { perfil
  = {} }`), imprime el código de error del servidor como si fuera la voz del
  producto, y su **compuerta no dispara nunca**. Se le añadió además una prueba
  que certifica los cinco `href` que alimentan esa compuerta muerta
  (`panel_dueno_href.test.ts`) — el mismo patrón de prueba decorativa que la
  ronda 18 nombró para los 64 «Reintentar».
- Y los abiertos: **8/8 de la c4 siguen abiertos, 9/9 de la c2 siguen abiertos**.
  Verificados uno por uno abriendo el archivo.

**El riesgo mayor del rubro, hoy:** el módulo estrella del delta —el
configurador de flota— tiene su puerta de entrada estructuralmente muerta
(`redirect()` dentro de un `try/catch`), y nadie lo va a notar porque el modo de
falla es que la pantalla nueva simplemente no aparece.

**Conteo: 10 hallazgos — 1 CRÍTICO · 3 ALTO · 3 MEDIO · 3 BAJO.**

---

## Hallazgos

### [CRÍTICO] El gate de onboarding no dispara nunca: `redirect()` está dentro de un `try/catch` que se lo traga

`src/app/dashboard/page.tsx:46-51`

```ts
if (rol === 'flota_admin' && tenantExiste) {
  try {
    const perfil = await getPerfilCrudo(tenantId);
    if (!onboardingFiscalListo(perfil)) redirect(`/dashboard/onboarding${sufijo}`);
  } catch { /* sigue al resumen */ }
}
```

`redirect()` de `next/navigation` **funciona lanzando** un error `NEXT_REDIRECT`.
Los docs empaquetados de esta misma versión (Next 16.3.1) lo dicen dos veces:
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:51`
y `:53` — *«`redirect` throws an error so it should be called **outside** the
`try` block when using `try/catch` statements»*—, y
`unstable_rethrow.md:46-64` lista `redirect()` entre las APIs cuyo error hay que
re-lanzar. El `catch { }` de arriba es desnudo: atrapa el `NEXT_REDIRECT` igual
que atraparía un timeout de Postgres, la ejecución continúa en la línea 53 y la
página pinta el Resumen.

**Escenario con valores.** Flota nueva, `tenant.perfil = {}`. El dueño
(`rol = 'flota_admin'`) entra a `app.likida.ai/dashboard`.
`onboardingFiscalListo({})` → `calificaEstimuloPeaje({}).elegible` es `null`
(`preguntas.ts:131`) → `false` → se llama `redirect('/dashboard/onboarding')` →
lanza → el `catch` lo come → **aterriza en el Resumen del dueño**, con todo en
ceros y sin una sola invitación a declarar su perfil. Lo mismo Javier al apretar
«Panel de dueño» desde `/admin/flotas`.

**El delta cambió CINCO call sites para alimentar esta compuerta**, y todos
quedaron sin efecto: `admin/consola.tsx:560`, `admin/flotas/page.tsx:260`,
`admin/flotas/[id]/ficha.tsx:36`, `admin/command-palette.tsx:213`,
`admin/corridas/[id]/page.tsx:227` — a los cinco se les añadió
`&rol=flota_admin`, y `admin/consola.tsx:553-558` escribe la razón: *«sin él el
superadmin no entra al chat de perfil (dashboard/page.tsx solo redirige a
onboarding si el rol efectivo es flota_admin)»*.

**Intenté refutarlo por tres lados y no aguantó ninguno.** (a) No hay otra
compuerta: `/dashboard/onboarding` no se fuerza desde ningún middleware ni
layout; solo existe como ítem de sidebar (`rutas.ts:94`). (b) La prueba nueva
`admin/panel_dueno_href.test.ts:22-27` lee el fuente y asegura que los cinco
`href` lleven `rol=flota_admin` — certifica **el href**, no que el gate corra;
seguiría verde con `page.tsx:46-51` borrado entero. (c) El autor **sí conoce la
regla**: en `dashboard/onboarding/page.tsx:62-78` el `redirect` final está
deliberadamente **fuera** del `try`. Es un olvido en un archivo, no una
filosofía.

Consecuencia: el módulo con el que se abre esta ronda —entrevista conducida por
modelo que escribe la configuración fiscal del tenant— no se le presenta jamás a
su usuario objetivo. El umbral del art. 20-A LIF 2026 queda sin declarar, y el
motor lo trata como fail-closed (`engine.ts:1237`, `input.elegiblePeaje ===
true`): el 50 % de peaje que esa flota SÍ puede acreditar se queda en $0 para
siempre, sin que nada en la pantalla del dueño diga por qué. Y en el demo, la
pantalla que se iba a enseñar no sale.

Causa raíz probable: el `catch` se puso para «un bache leyendo el perfil no
cierra la puerta» y quedó abarcando también la línea del `redirect`.

---

### [ALTO] `/admin/vendedores` pinta **NaN** en «Prospectos en el pipeline» en cuanto un prospecto entra a un estado del embudo Cal.com — y ese prospecto desaparece del tablero

`src/app/admin/vendedores/consola-vendedores.tsx:208`, `:239`, `:271`, con
`src/lib/likida/vendedores.ts:404` y `:272`

El delta abrió el dominio de `prospecto.estado` de 6 a 14 valores
(`supabase/migrations/0181_crm_remediacion.sql:10-12`) y le puso escritor vivo:
`src/app/api/webhook/calcom/route.ts:12-15` mapea `BOOKING_CREATED →
'appointment'`, `BOOKING_RESCHEDULED → 'rescheduled'`, `BOOKING_NO_SHOW →
'no-show'`. El panel no se enteró:

```ts
// vendedores.ts:403-404 — el cast, con el comentario que ya no es cierto
// `prospecto_estado_dominio` (0105) garantiza el dominio.
estado: f.estado as EstadoProspecto,      // EstadoProspecto son SEIS valores
```
```ts
// consola-vendedores.tsx:205-208
const totales = conteosVacios();          // { nuevo:0, contactado:0, demo:0,
for (const p of prospectos) totales[p.estado]++;  //   negociacion:0, cerrado:0, perdido:0 }
// :239
const totalProspectos = (Object.values(totales) as number[]).reduce((s, n) => s + n, 0);
// :271
<StatCard etiqueta="Prospectos en el pipeline" valor={totalProspectos} formato="entero" />
```

`totales['appointment']` es `undefined`; `undefined++` escribe `NaN` en la llave
y `Object.values(...).reduce(...)` devuelve `NaN`. `formato="entero"` resuelve a
`(v) => numero(Math.round(v))` (`admin/ui/formato-preset.ts:39`) y `numero(NaN)`
es `NaN.toLocaleString('es-MX')` = **`"NaN"`** (`formato.ts:205-207`). `StatCard`
solo defiende `valor === null` (`kit.tsx:136`, `:157`), no `NaN`.

**Escenario con valores, ejecutado a mano.** Censo con 30,412 prospectos vivos.
Uno agenda demo por Cal.com → el webhook pone `estado='appointment'`. Javier
abre `/admin/vendedores`:
- la tarjeta «Prospectos en el pipeline» dice **NaN** (verificado corriendo la
  aritmética: `{nuevo:1, contactado:1, …, appointment:NaN}` → total `NaN` →
  `"NaN"`);
- el kanban se arma con `ESTADOS_PROSPECTO.map(...)` (`:218`), seis columnas: ese
  prospecto **no está en ninguna** y nada lo dice;
- «Vivos (Nuevo a Negociación)» sí da 30,411, así que las dos tarjetas vecinas se
  contradicen.

Y el corolario en la mesa de comisiones: `agruparConteos`
(`vendedores.ts:283-284`) hace `if (!esEstadoProspecto(f.estado)) continue;` con
el comentario *«se deja al CHECK de la base impedir que exista»* — el CHECK de la
0181 ya no lo impide. `asignados` se calcula sumando esos conteos (`:452`) y
`tasaConversion = conteos.cerrado / asignados` (`:462`): un vendedor cuyos tratos
pasaron a `won` (no `cerrado`) los ve desaparecer de su fila. En
`/admin/crecimiento:138-141` el mismo hueco es más callado: el título dice
«Embudo de adquisición — 30,412 prospectos del censo» mientras las barras suman
30,411.

Consecuencia: la consola con la que Javier corre su pipeline enseña `NaN` donde
va un conteo, y pierde prospectos sin avisar. Es la falla que el rubro nombra —
un mapa literal desincronizado del tipo — con el agravante de que el tipo mismo
está mintiendo por un `as`.

Causa raíz probable: el dominio se amplió en SQL y se le puso escritor, pero
`EstadoProspecto` siguió siendo la unión de seis y el cast de
`listarProspectos:404` la impone sin comprobar.

---

### [ALTO] La tarjeta del estímulo de peaje afirma «Sin esta declaración el estímulo queda en $0» cuando lo que pasó es que no pudo leer el perfil

`src/app/dashboard/contador/estimulo-peaje.tsx:35-45` y `:90-94`, con el mismo
patrón en `src/app/dashboard/onboarding/page.tsx:48`

```ts
let perfil: unknown = {};
try { perfil = await getPerfilCrudo(tenantId); } catch { perfil = {}; }   // :36-40
const { elegible } = calificaEstimuloPeaje(perfil);
const pendiente = preguntaPendienteEstimuloPeaje(perfil);
const declarado = umbralPeajeDeclarado(perfil);
```

`getPerfilCrudo` **lanza a propósito** ante error de la base
(`repo.ts:107`, `if (error) throw new Error(...)`). El `catch` lo convierte en
`{}`, y `{}` no significa «no se pudo leer»: significa «no declarado». Verificado
en las tres funciones: `calificaEstimuloPeaje({})` → `{elegible:null}`
(`preguntas.ts:131`), `preguntaPendienteEstimuloPeaje({})` → devuelve la pregunta
(truthy, `:141-151`), `umbralPeajeDeclarado({})` → `{null, null}` (`:181-184`).

**Escenario con valores.** Flota que YA declaró: ingresos menores a $300 M, no
parte relacionada → `elegible = true`, y el motor viene acreditando el 50 % sobre
$18,400 de casetas del ejercicio = **$9,200**. Un `statement timeout` en el
`select perfil from tenant` durante un render de `/dashboard/contador`. La
tarjeta pinta:

- el texto de `:91`: «**Sin esta declaración el estímulo queda en $0.**
  Contéstalo antes del primer cierre; una flota grande o una parte relacionada no
  puede acreditarlo.»
- los dos selectores de vuelta en «Elige una» (`:44-45`, `:103`, `:115`),
- el botón rotulado «**Declarar**» en vez de «Corregir declaración» (`:98`).

El contralor está cruzando su PDF —que trae los $9,200 de estímulo— contra el
panel, que le dice que no hay declaración y que el estímulo es $0. Si vuelve a
contestar y no recuerda con exactitud lo que puso, un clic en «$300 millones o
más» escribe `elegible=false` (`:72`, `guardarDeclaracionEstimuloPeaje`) y **el
próximo cuadre le tira el crédito de peaje**.

Es exactamente la regla que el `CLAUDE.md` pone como definitoria — *«fallar
cerrado y decirlo»*— rota en la pantalla que existe para una cifra fiscal. La
mitad de la pantalla que la rodea sí la respeta: las ocho consultas de
`inicio-contador.tsx:91-107` pasan por `safe()` y cada tarjeta distingue `null`
de cero.

Un segundo defecto en el mismo componente, menor pero del mismo origen:
`EstimuloPeaje` es un Server Component `async` colocado **fuera de todo
`<Bloque>`** (`inicio-contador.tsx:219`), así que sus dos `await`
(`resolverTenantEfectivo` + `getPerfilCrudo`) bloquean el primer flush del
stream, contra el contrato que el propio archivo escribe en `:86-88` («*la
cáscara … no depende de ninguna lectura y sale con el primer flush*»).

Causa raíz probable: `catch { perfil = {} }` colapsa «no pude leer» y «no
declarado» en el mismo valor, y toda la lógica de la tarjeta se deriva de ahí.

---

### [ALTO] El chat de onboarding imprime el código de error del servidor como si fuera la respuesta del configurador — y una respuesta vacía lo deja muerto hasta recargar

`src/app/dashboard/onboarding/chat.tsx:310-316`, con
`src/app/api/dashboard/onboarding-chat/route.ts:20`, `:29`, `:31`, `:40`

```tsx
const respuesta = resp.ok && d && typeof d.texto === 'string'
  ? d.texto
  : (typeof d?.error === 'string' ? d.error : 'No pude guardar eso y prefiero no suponerlo. …');
setHistorial((h) => [...h.slice(0, -1), { q: mostrado, r: { texto: respuesta, … } }]);
```

`d.error` es el string interno de la ruta, sin traducir: `'sin sesion'` (401,
`:29`), `'sin acceso'` (403, `:31`, `:35`), `'mensajes inválidos'` (400, `:40`),
`'cuerpo inválido'` (`:38`). Se pinta en el mismo `<div>` que la respuesta del
configurador (`:511`), sin distintivo, sin acción y sin enlace a login.

**Escenario 1, con valores — la sesión que caduca.** El dueño lleva ocho turnos
de la entrevista. La cookie de Supabase expira. Escribe «Menores a 300
millones» → `POST /api/dashboard/onboarding-chat` → `getSessionTenant()` devuelve
`null` → 401 `{"error":"sin sesion"}` → `resp.ok` es `false` → la burbuja de
respuesta, debajo del logo de Likida, dice literalmente **«sin sesion»**. Todo lo
que teclee después dice lo mismo. No hay nada que le diga que tiene que volver a
entrar.

**Escenario 2 — el turno vacío que mata la conversación.**
`generateResponse` devuelve `text: (choices[0]?.message?.content ?? '').trim()`
(`openrouter.ts:337`): puede ser `''`. La ruta lo manda como `{t:'fin', texto:
''}`; el cliente pasa el `typeof d.texto === 'string'` y guarda `{texto: ''}` —
una burbuja vacía. En el turno **siguiente**, `previos` (`:259-262`) incluye
`{rol:'asistente', texto:''}`, y `validarMensajes` rechaza cualquier texto vacío
(`route.ts:20`, `!texto.trim()` → `return null`) → **400 «mensajes inválidos»**.
El mensaje vacío vive en `historial` para siempre y solo se recorta a los últimos
12 (`route.ts:17`), pero no se puede llegar a doce turnos más porque todos dan
400: la conversación queda **muerta hasta un recargado duro**, con «mensajes
inválidos» como único texto en pantalla.

**Intenté refutarlo comparando con el hermano y el hermano lo hace bien.**
`chat.tsx` (el asistente del panel, del que este archivo se declara clon en
`:12-17`) nunca imprime `d.error`: ante `!resp.ok` cae a `responder(q, kpis,
acred)` (`chat.tsx:525-527`, `:543`), una respuesta local del producto. La
regresión es del clon.

Consecuencia: el primer contacto del dueño con Likida es una pantalla que le
contesta en jerga de servidor y que se puede quedar tiesa sin decirle por qué.

Causa raíz probable: el fallback `d?.error` se copió del manejo de
`/api/dashboard/archivo` (`:165`, `:200`), donde el `error` sí está redactado
para pantalla; aquí los errores de la ruta son códigos.

---

### [MEDIO] `--faint` y `--muted` sobre `--g1` reprueban AA (4.27:1 y 4.40:1) — y `contraste.test.ts` nunca mide ese fondo

`src/app/globals.css:80` (`--faint: #73737c`), `:177` (`--g1: #f4f4f5` bajo
`.tema-neutro`), contra `src/app/dashboard/contraste.test.ts:57`, `:90-93`

El guardia mide `--faint` y `--muted` contra **`--surface` (#ffffff)** y **`--bg`
(#fbfbfd)** y exige 4.5:1 (`AA_TEXTO`). Los dos pasan ahí (4.70:1 y 4.83:1). Lo
que nunca mide es `--g1`, que es **el lienzo de las dos consolas**: ambos chromes
ponen `.tema-neutro` en su raíz (`admin/chrome.tsx:44`, `dashboard/chrome.tsx:48`)
y cada página pinta su marco con `background: 'var(--g1)'`.

Calculado por mí con la fórmula de luminancia WCAG (los mismos hex del archivo):

| par | ratio | AA texto |
|---|---|---|
| `--faint` #73737c sobre `--g1` #f4f4f5 | **4.27:1** | ✗ |
| `--muted` #6b7280 sobre `--g1` #f4f4f5 | **4.40:1** | ✗ |
| `--faint` sobre `--canvas` #f9f9fa | **4.46:1** | ✗ (por poco) |

**Escenario con valores, en el código nuevo.** `/dashboard/onboarding` monta todo
sobre `--g1` (`onboarding/page.tsx:122`) y ahí van:
- `chat.tsx:560-563` — la única advertencia legal de la pantalla («*El estímulo
  de peaje (LIF 2026 art. 20-A) no se enciende hasta que lo declares*»), a
  **11 px** en `--faint`: 4.27:1;
- `chat.tsx:545` — el subtítulo que explica de qué va la entrevista, en
  `--muted`: 4.40:1;
- `onboarding/page.tsx:96` — «Prefiero el formulario», la ÚNICA salida al
  formulario, a 12.5 px en `--faint`: 4.27:1;
- `chat.tsx:494` — el «Pensando…» que le dice al usuario que el sistema está
  vivo, en `--muted`.

Y sobre ese mismo fondo corre `<CampoPixeles />` (`chat.tsx:537`), que solo puede
bajar el contraste efectivo, nunca subirlo.

Consecuencia: el texto más pequeño y más legal de la pantalla nueva reprueba el
umbral que este repo se autoimpone, y el aviso que dice «no reprueba» lo mide
contra un fondo que el panel casi no usa para ese texto.

Causa raíz probable: el guardia se escribió cuando el texto secundario vivía
sobre tarjetas blancas; `--g1` y `--canvas` entraron después con el diseño v2 y
nadie extendió las aserciones.

---

### [MEDIO] «Perdido» aparece dos veces en el embudo del Cerebro, con dos conteos y dos colores

`src/app/admin/mapa-prospectos/cerebro.tsx:45-48` (`ORDEN_EMBUDO`, ampliado en
este delta de 6 a 14 valores) contra `src/lib/admin/prospectos-mapa.ts:31` y
`:39`

```ts
perdido: { color: '#94a3b8', nombre: 'Perdido' },   // prospectos-mapa.ts:31
lost:    { color: '#64748b', nombre: 'Perdido' },   // prospectos-mapa.ts:39
```

`ORDEN_EMBUDO` ahora incluye los dos, y los tres sitios que lo recorren pintan la
etiqueta cruda del mapa: el filtro de etapas (`cerebro.tsx:822-825`), el desglose
del panel lateral (`:984-989`) y la leyenda de abajo (`:1104-1107`, `:1169-1174`).

**Escenario con valores.** Censo con 30,412 prospectos: 1,840 marcados `perdido`
(el dominio viejo, escrito por `/admin/vendedores` y el deduplicador) y 7 en
`lost` (el dominio nuevo, escrito por el funnel Cal.com). El desglose de
`/admin/mapa-prospectos` imprime dos renglones seguidos:

```
● Perdido    1,840
● Perdido        7
```

…con dos grises casi idénticos (#94a3b8 y #64748b) y dos filtros distintos en la
barra de chips. Lo mismo pasa con `cerrado` = «Cliente» y `won` = «Ganado», que
son el mismo estado terminal con dos nombres.

Refuté la variante peor: los catorce valores SÍ están en `COLOR_EMBUDO`
(`prospectos-mapa.ts:25-40`), así que `COLOR_EMBUDO[e].color` en
`cerebro.tsx:823` —que va **sin** el `??` que sí tienen `:241` y `:1057`— no
revienta hoy. Un quince estado en `ORDEN_EMBUDO` sin fila en `COLOR_EMBUDO` sí
tumbaría el Cerebro entero con un TypeError.

Consecuencia: en la consola con la que se prospecta, dos etapas distintas del
embudo son indistinguibles, y quien filtre por «Perdido» solo verá una de las
dos poblaciones sin saber que existe otra.

Causa raíz probable: se fusionaron dos dominios (el español legado y el inglés de
Cal.com) en un mismo mapa de rótulos sin decidir cuál gana ni marcar el legado.

---

### [MEDIO] «Se cortó la conexión. No guardé nada» se imprime después de que el propio chat enseñó «Guardando la declaración ✓»

`src/app/dashboard/onboarding/chat.tsx:270` y `:318-322`, contra
`src/lib/likida/perfil/entrevista-aplicar.ts:33-37`, `:77-92`

El cliente aborta a los **75 s** (`AbortSignal.timeout(75_000)`, `:270`); el
servidor tiene **120 s** (`route.ts:10`, `maxDuration = 120`) y no mira
`req.signal` en ningún punto: el `ReadableStream.start()` sigue corriendo entero
aunque el navegador cierre. Cuando el `fetch` revienta, el `catch` escribe:

```tsx
r: { texto: 'Se cortó la conexión. No guardé nada. Repite la respuesta o usa el formulario.' }
```

Pero `aplicarTurnoEntrevista` ya **escribió** antes de eso. El orden de pasos que
el propio chat va pintando en vivo (`:288-301`, con `ETIQUETA_PASO` en `:27-34`)
es: `interpretar_respuesta` → `guardar_perfil` → `nutrir_operacion` →
`armar_respuesta`. `guardar_perfil` (`entrevista-aplicar.ts:77-89`) hace el
`guardarPerfilPatch` + `actualizarFacilidad15` y **manda su evento `fin`**;
`nutrir_operacion` (`:91-92`) es el que puede tardar: escribe datos fiscales del
receptor CFDI, da de alta operadores uno por uno y unidades una por una
(`:138-189`).

**Escenario con valores.** El dueño contesta con una tanda: «Somos 601, RFC
TRA930215AB1, CP 64000, y me das de alta a Martínez 8181112233, Pérez
8181114455, Solís 8181116677, y las unidades ECO-11 a ECO-18». El chat pinta
«Guardando la declaración ✓» y pasa a «Escribiendo en operadores, unidades y
políticas…». Entre `guardarDatosFiscales`, tres `crearOperador` (cada uno con su
consulta de choque de teléfono) y ocho `crearUnidad`, el turno cruza los 75 s.
El cliente aborta, `setPasosVivos([])` borra la palomita que el usuario acabó de
ver (`:325`) y en su lugar aparece «**No guardé nada.**» — cuando el perfil
fiscal, los cinco datos del receptor y varios operadores YA quedaron escritos. El
mismo mensaje sale ante cualquier corte de red a media respuesta.

Si repite la respuesta como se le pide, el segundo turno le contesta con notas de
error sobre lo que sí funcionó: «Ese teléfono ya está registrado en esta flota, a
nombre de Martínez» (`administracion.ts:294-298`).

Consecuencia: un rótulo que afirma en falso sobre escrituras a la configuración
fiscal del tenant, y que invita a repetir la operación.

Causa raíz probable: el presupuesto del cliente (75 s) es menor que el del
servidor (120 s) y el mensaje del `catch` afirma un hecho del servidor que el
cliente no puede saber; la ruta ya manda `guardado` en el evento `fin`
(`route.ts:75`) y el cliente nunca lo lee.

---

### [BAJO] Dos comentarios nuevos afirman que el motor «fail-open» en el estímulo de peaje; el motor es fail-closed

`src/app/dashboard/page.tsx:42-43` y
`src/app/dashboard/contador/inicio-contador.tsx:216-218`, contra
`src/lib/likida/cuadre/engine.ts:1237`

Los dos comentarios nuevos dicen que sin declaración «el motor fail-open y
pinta un estímulo que quizá no toca». `engine.ts:1237` es
`const elegiblePeaje = input.elegiblePeaje === true;` y `desde_db.ts:50-51`
convierte el `null` en `undefined`: sin declaración el crédito es $0. El
comentario correcto está en `contador/estimulo-peaje.tsx:17-19`, que dice
fail-closed. Consecuencia: quien mantenga esto va a razonar sobre la premisa
opuesta a la del motor — y ya sirvió para justificar la prioridad de un bloque
que rompe el streaming (`inicio-contador.tsx:219`).

---

### [BAJO] `tocar()` perdió su `.catch` y manda un campo que la ruta ignora

`src/app/admin/mapa-prospectos/cerebro.tsx:499-505` contra
`src/app/api/admin/mapa-prospectos/toque/route.ts:18-27`

El delta cambió `void fetch(...).catch(() => undefined)` por `void fetch(...)`
sin manejador. El comentario de arriba (`:497-498`) sigue prometiendo «fuego y
olvido, el link abre igual aunque la red falle», que es justo lo que garantizaba
el `.catch` que se quitó: con la laptop sin red, el clic en WhatsApp produce un
`unhandledrejection` en el navegador. Y el cuerpo ahora lleva `estado:
'iniciado'`, campo que la ruta ni desestructura (`route.ts:18` solo lee `id`,
`canal`, `resumen`): payload muerto que se lee como una funcionalidad que existe.

Refuté la parte que parecía peor: al quitarse también la actualización
optimista de `ultimoToque`, parecía que la tarjeta se quedaría sin marcar hasta
un recargado — pero `0167_prospectos_listado.sql:97-98` instala
`trg_toque_marca_prospecto`, que bumpea `prospecto.updated_at`, así que el
latido por delta sí la trae. Solo queda la ventana de un latido.

---

### [BAJO] El `<details>` del formulario vive dentro del pie `sticky bottom-0` de la conversación

`src/app/dashboard/onboarding/chat.tsx:519-525`

Con la conversación empezada, el pie es `sticky bottom-0` y adentro va la caja de
texto **y** el `<details>` «Prefiero el formulario», que al abrirse mide ~700 px
(seis selectores fiscales + cuatro de stack + dos de operación + el input de
archivo, `forma.tsx:52-127`). Un elemento `sticky` con `bottom: 0` más alto que
el viewport ancla su borde inferior y deja la cabecera del formulario por encima
del área visible. En la vista vacía el mismo formulario va en flujo normal
(`:564-566`) y no tiene el problema, así que el formulario se comporta distinto
según si ya hablaste con el chat. **No lo medí en un navegador** — va en BAJO por
eso, y por eso no afirmo el resultado exacto.

---

## Verificación de los abiertos de la ronda 18

### Los ocho de la c4 — **8/8 REINCIDENTES**, verificados abriendo el archivo

| Hallazgo (c4) | Estado | Evidencia de hoy |
|---|---|---|
| [ALTO] El «Reintentar» de los 64 boundaries no puede reintentar | **REINCIDENTE** | `dashboard/limite-error.tsx:25-44` sigue sin `componentDidUpdate`, sin `getDerivedStateFromProps` y sin `key` en ningún call site; `render()` devuelve `EstadoError` en cuanto `state.rompio` es `true`. |
| [ALTO] «Dinero observado» significa dos cosas | **REINCIDENTE** | `agentes/liquidacion/vista.tsx:326` sigue siendo `porTipo?.reduce((s,t)=>s+t.monto,0)` bajo el subtítulo de `:330`; `chat.tsx:106` sigue imprimiendo `kpis.diferenciaDetectada` (filtrado a `sobre_politica`/`duplicado` en la 0112). |
| [MEDIO] Vigencias de unidades en día UTC | **REINCIDENTE** | `lib/likida/operacion.ts:170` sigue siendo `Date.UTC(hoy.getUTCFullYear(), …)` y `:187` el `Math.round((t - base)/DIA_MS)`. |
| [MEDIO] «Actividad — Histórico» aplasta `null` a vacío | **REINCIDENTE** | `inicio-contenido.tsx:711` sigue con `porMes={viajesPorMes ?? []}`; `actividad.tsx:39` solo defiende `modo !== 'historico'` y `:53` usa `porMes.every(...)`, true por vacuidad. |
| [MEDIO] `ComboCatalogo` no re-resuelve el id al llegar las opciones | **REINCIDENTE** | `combo-catalogo.tsx:93-101`: el emparejamiento sigue solo en `alEscribir`, nada lo deriva de `[texto, opciones]`. |
| [MEDIO] El Cerebro deja la tarjeta con dos momentos | **REINCIDENTE** | `cerebro.tsx:364-366`: `pedirTextos` sigue filtrando por `pedidos.current` y `aplicar` no lo invalida. |
| [BAJO] Los dos registros de `/dashboard/clientes` se borran el filtro | **REINCIDENTE** | Sin cambios en `registro-filtro.tsx` ni en `paginar-registro.ts`. |
| [BAJO] El esqueleto del bloque más alto mide un tercio | **REINCIDENTE** | `inicio-contenido.tsx:382` sigue siendo `<EsqGrafica alto={260} />` para todo `PanelPeriodo`. |

### Los nueve de la c2 — **9/9 siguen abiertos**

Verificados por muestreo directo: `agentes/facturas/page.tsx` y `vista.tsx`
intactos; `prospectos-mapa.ts:290` (rótulo de «Necesidad») y `:527`/`:585` (las
dos ortografías de DUPLICADO) intactos; `mapa-prospectos/[id]/detalle.tsx`
intacto (hex a mano, `if (!r.ok) return;`, `href={per.linkedin}`). Uno **sí se
cerró**: `admin/flotas/page.tsx:450` ya no dice «La 624 todavía no está en esta
lista: pídesela a Javier» **porque de verdad se agregó** —
`lib/saas/fiscal.ts:29` trae `{ clave: '624', nombre: 'Coordinados' }`. El
rótulo volvió a ser verdad.

---

## Lo que revisé y está bien

- **La compuerta, corrida por mí.** `npx tsc --noEmit -p .` sin salida (exit 0).
  `npm run lint`: **0 errores**, 157 warnings (todos `security/detect-non-literal-fs-*`
  en pruebas, preexistentes). Los seis archivos de prueba que tocan mi rubro:
  48/48 verdes en 1.27 s.
- **ARQ-C3-1 cerrado como se debía, y con la prueba correcta.**
  `[id]/vista.tsx:169` es `new Set<string>(NO_DEDUCIBLE_ISR)` y `:171`
  `new Set<string>(POR_CONFIRMAR)`, los dos importados de `cuadre/engine.ts:235-236`.
  `ETIQUETA_CAPTURA` (`:177-181`) saca `duplicado`/`monto_invalido`/
  `comprobante_no_fiscal` a un mapa aparte que los nombra por lo que son —
  verificado contra `cubetaDe` (`engine.ts:253-263`): esos tres no están en
  ninguna de las dos cubetas del motor, así que la tabla ya no afirma una
  deducibilidad que el motor no dio. Y `estado_renglon.test.ts:33-45`
  **itera sobre las constantes del motor**, no sobre una copia: mover un tipo de
  cubeta sin tocar el panel pone la prueba roja. Es la contraprueba de lo que la
  ronda 18 llamó decoración.
- **Trabajo obligatorio del rubro — todo mapa literal del panel contra
  `src/types/likida.ts`.** `ROTULO_DIFERENCIA`
  (`agentes/liquidacion/rotulo-diferencia.ts:20-60`) es
  `Record<TipoDiferencia, string>`: el compilador exige los 37 y `tsc` está
  limpio, así que `ticket_monedero` (`types/likida.ts:120`) entró completo.
  `NO_DEDUCIBLE_ISR`/`POR_CONFIRMAR`/`TIPOS_TOPE` verificados uno por uno contra
  `engine.ts:235-236` y `:550`. `EstadoVigencia` (`unidades/vista.tsx:15-20`) y
  `c_FormaPago` (`[id]/vista.tsx:142-150`, con el `?? clave` de `:150`) siguen
  sin divergir.
  `ETIQUETA_PASO` del chat nuevo (`onboarding/chat.tsx:27-34`) cubre exactamente
  los seis `tool` que emiten `entrevista-aplicar.ts:39/77/91/95` y
  `entrevista-agente.ts:42`, con un fallback `t.replaceAll('_',' ')` para el
  séptimo que llegue. Los dos mapas que SÍ divergieron están arriba, como
  hallazgos (`conteosVacios` y `COLOR_EMBUDO`).
- **El rótulo que dejó de mentir.** `combustible_efectivo` pasó de «Combustible
  en efectivo» a «Combustible sin medio de pago admitido»
  (`rotulo-diferencia.ts:36-40`), con la razón escrita: la regla ya no es «es
  efectivo» sino «no es de los medios que la LISR 27-III admite», así que con
  forma de pago `'06'` el rótulo viejo era falso en pantalla. La clave no cambió
  —la escriben liquidaciones ya guardadas—, solo el texto. Es el arreglo correcto.
- **Accesibilidad del command palette, real y nueva.** `command-palette.tsx:271`
  (`role="presentation"` en el velo), `:274` (`role="dialog" aria-modal
  aria-label`), `:283-284` (`aria-label` que cambia con el modo, `aria-controls`),
  `:309` (`role="listbox"` con `id` que casa con el `aria-controls`), `:325`
  (`role="option" aria-selected={i === activo}`). Y `Chip` (`cerebro.tsx:154`)
  ganó `type="button"` y `aria-pressed={activo}` — un chip de filtro dentro de un
  formulario ya no envía nada por accidente.
- **`calles.tsx` arregló un efecto que se rearmaba de más.** `:37-40` guarda
  `obtenerTextos`/`pedirTextos` en refs y `:119` deja el efecto con `[prospectos]`:
  antes cualquier render del padre que cambiara la identidad de esas dos funciones
  destruía y reconstruía el mapa Leaflet entero. `cerebro.tsx:361` colabora
  memoizando `obtenerTextos` con `useCallback`.
- **La declaración del estímulo re-gatea en la acción, no solo en el render.**
  `estimulo-peaje.tsx:49-52` vuelve a resolver el tenant y a llamar `puedeVerRuta`
  dentro del `'use server'`, y `contador/page.tsx:15-18` explica por qué («el rol
  del render no es el de la acción»). Igual en `onboarding/page.tsx:54-57`. Es el
  patrón correcto y está razonado.
- **El `redirect` del formulario de onboarding SÍ está fuera del `try`**
  (`onboarding/page.tsx:62-78`): el `try` envuelve solo la subida y los
  guardados, y el `redirect` va después. Es lo que hace que
  `dashboard/page.tsx:49` se lea como olvido y no como criterio.
- **El toque del Cerebro no se queda mudo por quitar la actualización
  optimista** — refutado con la migración: `0167_prospectos_listado.sql:97-98`
  instala `trg_toque_marca_prospecto`, que sube `prospecto.updated_at`, y el
  latido por delta (`prospectos-mapa.ts:689-690`, `updated_at > desde`) trae la
  fila de vuelta.
- **El Cerebro no revienta con los ocho estados nuevos**: `ORDEN_EMBUDO`
  (`cerebro.tsx:45-48`) y `COLOR_EMBUDO` (`prospectos-mapa.ts:25-40`) tienen los
  catorce. Lo verifiqué justamente porque `:823`, `:988`, `:1106` y `:1174` leen
  `COLOR_EMBUDO[e].color` **sin** el `??` que sí tienen `:241` y `:1057`.
- **`leadsAds` dejó de perder dos fuentes.** `crecimiento/page.tsx:238-240` ya
  suma `ads` + `ads-meta` + `ads-google` en vez de tomar solo la primera
  coincidencia de `'ads'`, que es justo lo que las cuatro fuentes nuevas de
  `cerebro.tsx:58-61` iban a romper.
- **El panel del contador no palomea de cortesía.** Las ocho consultas van por
  `safe()` (`inicio-contador.tsx:91-107`), lanzadas sin `await` en el padre, y el
  `hoy` es uno solo y es el de México (`:77`, `hoyMx(new Date(ahoraMs()))`), con
  la razón del bug del 31 de diciembre escrita en `:73-76`.
- **`configuracion/forma.tsx:171-180`** ahora nombra las cuatro cuentas de
  balance con la ortografía EXACTA que el export de póliza exige, en vez de
  mandar al usuario a una pantalla que no existía. Rótulo verdadero.

---

## Lo que NO alcancé a revisar

Sin esto la nota es una mentira por omisión.

- **No miré un solo render. Quinta ronda seguida.** Corrida en la nube, sin
  `npm run build`, sin base y sin credenciales. Todo lo de arriba es lectura de
  código, aritmética verificada a mano (el `NaN` y los ratios de contraste los
  ejecuté en Node) y los docs empaquetados de Next. **La pantalla de onboarding
  —838 líneas nuevas, la más importante del delta— nunca se vio.** No sé cómo
  cae el `CampoPixeles` detrás del texto, ni cómo se ve el pie `sticky` con el
  formulario abierto, ni si los chips desbordan en 390 px.
- **Responsive: cero medido, y ahora hay superficie nueva.** El `<details>` del
  formulario dentro del `sticky` (hallazgo BAJO) está razonado desde el CSS, no
  medido. Tampoco miré la tabla de 10 columnas del registro de viajes a 390 px ni
  el `min-[1100px]:grid-cols-5` de `[id]/detalle.tsx:200`, los dos pendientes
  desde la c4.
- **Lector de pantalla: no probado, y el chat nuevo no tiene `aria-live`.**
  `onboarding/chat.tsx:481-516` pinta el historial en `<div>`s sin región viva:
  un lector no anuncia la respuesta del configurador cuando llega. No lo levanto
  como hallazgo porque el hermano `chat.tsx` tampoco la tiene y no pude confirmar
  si algo más arriba la aporta.
- **Contraste: medí `--faint`/`--muted` sobre `--g1` y `--canvas`, y nada más.**
  No medí el tema oscuro completo (los tres pares que sí calculé pasan holgados:
  5.67:1, 6.72:1, 14.77:1), ni los hex a mano de
  `admin/mapa-prospectos/[id]/detalle.tsx:158-159`, `:235-236`, `:256`
  (reincidente c2 #5), ni los colores de `COLOR_EMBUDO` contra el fondo del mapa.
- **`/dashboard/onboarding` con perfil PARCIAL no lo pude simular.** Todo lo que
  digo de `estadoEntrevista`/`chipsDe` sale de leer `entrevista.ts` (998 líneas,
  que solo hojeé) y de las 48 pruebas verdes; no construí un `perfil` a medias
  para ver qué pregunta y qué chips salen.
- **El caso «el stream se corta a la mitad» sigue sin verificar**, igual que en
  la c4: ninguna página de `/dashboard` declara `maxDuration`. Con streaming, una
  invocación que la plataforma mate después del primer flush no puede devolver un
  504 y el usuario se queda con esqueletos que no aterrizan. Necesita entorno real.
- **Las ~24 páginas de `/dashboard` que la ronda 18 dejó fuera siguen fuera**:
  `rentabilidad/`, `combustible-casetas/`, `conocimiento/`, `politicas/`,
  `integraciones/`, `llaves-api/`, `notificaciones/`, `mapa/`, `soporte/`,
  `carta-porte/`, `conexiones/` y `agentes/{peajes,notificaciones}`. De `/admin`,
  ~33 pantallas fuera del Cerebro, Vendedores, Flotas, Crecimiento y `ui/kit`.
- **`/(portal)` y `/(demo)` no los abrí en ninguna ronda.** Son parte de mi
  rubro por asignación y no tengo una sola línea leída de ellos.
