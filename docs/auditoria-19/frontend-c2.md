# Frontend — auditoría 19 c2

**Nota: 5/10** (antes 5). Sin movimiento, y la razón es una compensación exacta
entre dos de las tres formas:

- **Se atacó y subió** — el CRÍTICO FE-19-1 se cerró de verdad y como se debía.
  `dashboard/page.tsx:56-63` ahora deja el `try` envolviendo SOLO la lectura del
  perfil y saca la decisión afuera (`let faltaOnboarding = false;` … `if
  (faltaOnboarding) redirect(...)`), con la razón escrita en `:44-55`. Eso es lo
  que impide que esta nota baje a 4.
- **Deuda que cobró factura** — eso es lo que impide que suba. **8/8 de los
  reincidentes de la c4 siguen abiertos** (verificados uno por uno abriendo el
  archivo) y **9 de los 10 hallazgos de la ronda 19 siguen abiertos**: el único
  que cerró es el crítico. Y la superficie NUEVA del delta —la compuerta legal
  en `app/layout.tsx` y las dos páginas públicas— llegó repitiendo **los dos
  patrones exactos que la ronda anterior nombró**: un rótulo que no es verdad en
  pantalla, y una prueba que certifica el fuente en vez del render.

**El riesgo mayor del rubro, hoy:** las dos páginas legales públicas —a las que
`/login:353` y `:361` mandan con el texto «Al continuar, aceptas los Términos de
Servicio y el Aviso de Privacidad»— le enseñan al visitante un recuadro que dice
**«PRODUCCIÓN BLOQUEADA»**, que es una nota interna de despliegue, no la voz del
producto; y la identidad legal que la LFPDPPP obliga a exhibir se cableó pero no
se pinta en ninguna parte.

**Conteo: 13 hallazgos — 0 CRÍTICO · 6 ALTO · 4 MEDIO · 3 BAJO.**
(3 ALTO, 1 MEDIO y 1 BAJO son nuevos de este delta; el resto son REINCIDENTES.)

---

## Hallazgos

### [ALTO] Las páginas legales públicas le dicen al visitante «PRODUCCIÓN BLOQUEADA» — un mensaje de despliegue en la pantalla donde se acepta el contrato

`src/app/privacidad/page.tsx:149-153` y `src/app/terminos/page.tsx:216-220`,
con `src/lib/legal/config.ts:78-89` y `src/app/login/page.tsx:352-367`

El delta cambió el aviso de las dos páginas. Antes decía, en voz de producto:
*«Falta capturar la razón social y el domicilio fiscal de la empresa que opera
Likida. Aparece señalado en vez de quedar en blanco.»* Ahora dice, literal:

```tsx
// privacidad/page.tsx:150-152
<FaltaDato>
  <strong>PRODUCCIÓN BLOQUEADA:</strong> faltan datos legales o anexos contractuales.
  No debe presentarse como paquete enterprise hasta completar identidad, contacto y versiones contractuales.
</FaltaDato>
```

**Escenario con valores.** Un contralor de flota entra a `app.likida.ai/login`.
La pantalla le dice, en `login/page.tsx:351`: «Al continuar, aceptas los
**Términos de Servicio** y el **Aviso de Privacidad** de Likida», con las dos
ligas (`:353`, `:361`). Da clic en cualquiera de las dos. Lo que ve, en un
recuadro con borde `var(--color-warn)` (`legal/marco.tsx:49-58`), arriba del
documento que le acaban de pedir aceptar, es «**PRODUCCIÓN BLOQUEADA:** … No
debe usarse como contrato enterprise».

Y **la condición dispara de más**. `!estado.listo` es
`estadoLegalProduccion().faltantes.length !== 0` (`config.ts:82`), y `faltantes`
suma los cuatro datos de identidad **más** las cuatro versiones de anexo
contractual (`REQUISITOS_DOCUMENTOS`, `config.ts:71-76`). El propio archivo
separa esos cuatro a propósito, porque *«no bloquean el build»* (`:57-69`) — pero
la página no usa esa separación: usa `listo`, no `bloqueado` (`:85`). Con
`LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `LEGAL_JURISDICTION` y
`LEGAL_CONTACT_EMAIL` **los cuatro puestos**, el aviso de privacidad —cuyos datos
ya están completos— seguirá gritando «PRODUCCIÓN BLOQUEADA» solo porque
`LEGAL_DPA_VERSION` está vacía. Un DPA sin firmar no tiene nada que ver con lo
que un aviso de privacidad tiene que decir.

Consecuencia: en el momento exacto de la conversión —y en el demo, donde el pie
del documento legal es de lo primero que un contralor abre— el producto se
autodescalifica con jerga de despliegue. Es la regla «un rótulo tiene que ser
verdad» rota en las dos únicas páginas del sitio cuyo trabajo es ser creíbles.

Causa raíz probable: se cableó `estadoLegalProduccion()` —que es un gate de
despliegue— directo al copy de una página pública, en vez de traducirlo a lo que
al lector le sirve saber.

---

### [ALTO] `exigirLegalEnProduccion()` corre en el layout raíz: con el `.env.example` que el repo publica, TODA la aplicación truena en cada render

`src/app/layout.tsx:55`, con `src/lib/legal/config.ts:92-101` y `.env.example:43-51`

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  exigirLegalEnProduccion();          // layout.tsx:55 — dentro del render
```
```ts
export function exigirLegalEnProduccion(): void {                       // config.ts:92
  if (process.env.VERCEL_ENV !== 'production' && process.env.LEGAL_ENFORCE_PRODUCTION !== 'true') return;
  …
  if (bloqueantes.length > 0) throw new Error(`LEGAL_PRODUCTION_BLOCKED: faltan ${bloqueantes.join(', ')}`);
}
```

`.env.example` publica exactamente esto:

```
LEGAL_ENTITY_NAME=              # :43   vacía
LEGAL_ENTITY_ADDRESS=           # :44   vacía
LEGAL_JURISDICTION=             # :45   vacía
LEGAL_CONTACT_EMAIL=            # :46   vacía
LEGAL_ENFORCE_PRODUCTION=true   # :51   ← encendido
```

**Escenario con valores.** Alguien clona el repo y hace `cp .env.example
.env.local`, que es el arranque documentado. `VERCEL_ENV` no existe, pero
`LEGAL_ENFORCE_PRODUCTION === 'true'`, así que el `return` temprano de `:93` no
se toma. `faltantesEntidad` son los cuatro. `RootLayout` **lanza en cada
render**, para toda ruta del árbol — `/`, `/login`, `/dashboard`, `/admin`, las
propias `/privacidad` y `/terminos`. Lo único que aterriza es
`global-error.tsx`, con el titular «**La aplicación no pudo continuar.**» y un
`digest` que no dice qué falta. El mensaje real
(`LEGAL_PRODUCTION_BLOCKED: faltan LEGAL_ENTITY_NAME, …`) no llega a pantalla:
Next redacta el mensaje del error de servidor y solo entrega el digest.

El corolario que no pude verificar pero que sale de la misma línea: si
`LEGAL_ENFORCE_PRODUCTION` está puesta en Vercel **sin acotar el entorno**
(el default de Vercel es aplicar a los tres), todo deployment de *preview* con
las `LEGAL_*` vacías queda igual de muerto. Producción sí está cubierta por el
build: `/privacidad` y `/terminos` no declaran `dynamic`, se prerenderizan, y el
`next build` truena antes de publicar.

Consecuencia: la puerta pensada para impedir que se publique un producto sin
identidad legal también le cierra la puerta a cualquiera que levante el proyecto
siguiendo el archivo de ejemplo del propio repo — con la pantalla más opaca que
la app tiene. Es el mismo error que `config.ts:57-69` documenta haber corregido
del lado del build («un guardarraíl que también bloquea las REPARACIONES no
protege: amplifica»), resucitado del lado del render.

Causa raíz probable: la comprobación se puso en el layout raíz para atrapar el
build, y ahí también corre en cada request.

---

### [ALTO] La razón social, el domicilio y la jurisdicción se cablearon a `LEGAL_CONFIG` y no se pintan en ninguna parte — y la prueba que lo «cubre» lee el fuente

`src/app/privacidad/page.tsx:41-42`, `src/app/terminos/page.tsx:38-41`, contra
`src/app/privacidad/privacidad.test.ts:49-55`

El delta cambió cinco campos de `null` a `LEGAL_CONFIG.*`:

```ts
// privacidad/page.tsx:41-43        // terminos/page.tsx:38-42
razonSocial: LEGAL_CONFIG.razonSocial,   razonSocial: LEGAL_CONFIG.razonSocial,
domicilio:   LEGAL_CONFIG.domicilio,     domicilio:   LEGAL_CONFIG.domicilio,
contacto:    LEGAL_CONFIG.contacto,      jurisdiccion: LEGAL_CONFIG.jurisdiccion,
```

`grep -n "RESPONSABLE\."` sobre `privacidad/page.tsx` devuelve **dos** líneas,
`:117` y `:126`, y las dos leen `RESPONSABLE.contacto`. `grep -n "PRESTADOR\."`
sobre `terminos/page.tsx` devuelve **una**, `:203`, y también es `.contacto`.
`razonSocial`, `domicilio` y `jurisdiccion` **no se leen desde ningún renglón de
`SECCIONES` ni desde el `pie`** (`privacidad:155-161`, `terminos:222-231`), y
`LEGAL_PLACEHOLDERS` —que `config.ts:60-66` dice que existe justo para esto—
sigue sin tener un solo consumidor fuera de su propia prueba.

**Escenario con valores.** Javier consigue el acta, pone
`LEGAL_ENTITY_NAME=Likida Tecnologías S.A.P.I. de C.V.`,
`LEGAL_ENTITY_ADDRESS=Av. Vasconcelos 150, San Pedro Garza García, N.L.`,
`LEGAL_JURISDICTION=Monterrey, Nuevo León` y redespliega. En
`app.likida.ai/privacidad` **no aparece ninguno de los tres**: el aviso sigue sin
decir quién es el responsable, que es el dato que el art. 16 fr. I de la
LFPDPPP obliga a exhibir. En `/terminos`, la §19 (`terminos/page.tsx:190`) sigue
imprimiendo, hardcodeado, *«🔴 **Plaza y tribunales competentes: pendientes de
definir.**»* aunque `LEGAL_JURISDICTION` ya diga Monterrey. Lo único que cambió
en pantalla es que el recuadro de arriba deja de decir «PRODUCCIÓN BLOQUEADA» —
si además se llenaron las cuatro versiones de anexo.

**Y la prueba nueva certifica el cableado, no el render:**

```ts
// privacidad.test.ts:49-55
it('no inventa la razón social: si falta, lo dice', () => {
  expect(P).toMatch(/LEGAL_CONFIG\.razonSocial/);
  expect(P).toMatch(/PRODUCCIÓN BLOQUEADA/);
});
```

`P` es el **texto fuente** del `page.tsx`. La aserción pasa porque en el archivo
existe la cadena `LEGAL_CONFIG.razonSocial` — seguiría verde si esa propiedad se
asignara a una constante muerta, que es exactamente lo que pasa hoy. Es el mismo
patrón que la ronda 19 marcó en `panel_dueno_href.test.ts` y la 18 en los 64
«Reintentar».

Consecuencia: el trabajo de esta ronda cierra el gate de despliegue pero **no
cierra el hueco de pantalla que el gate existe para forzar**, y el arnés que
debía avisarlo está mirando al lado equivocado. Quien lea el PR verá una prueba
verde llamada «no inventa la razón social».

Causa raíz probable: se sustituyó la fuente del dato (`null` → env) sin agregar
el renglón que lo imprime, y la prueba se escribió sobre el fuente porque el
componente no tiene render en pruebas.

---

### [ALTO] `/admin/vendedores` sigue pintando **NaN** en «Prospectos en el pipeline» — REINCIDENTE

`src/app/admin/vendedores/consola-vendedores.tsx:207`, `:210`, `:241`, `:273`,
con `src/lib/likida/vendedores.ts:272-273` y `:404`

Verificado hoy, línea por línea: `conteosVacios()` sigue devolviendo **seis**
llaves (`vendedores.ts:273`), `listarProspectos` sigue haciendo
`estado: f.estado as EstadoProspecto` con el comentario *«`prospecto_estado_dominio`
(0105) garantiza el dominio»* (`:403-404`) que la 0181 dejó de garantizar, y el
panel sigue haciendo `for (const p of prospectos) totales[p.estado]++;`
(`consola-vendedores.tsx:210`). El escritor sigue vivo:
`api/webhook/calcom/route.ts:11-16` mapea `BOOKING_CREATED → 'appointment'`,
`BOOKING_RESCHEDULED → 'rescheduled'`, `BOOKING_CANCELLED → 'cancelled'`,
`BOOKING_NO_SHOW → 'no-show'`, y `ESTADOS_FUNNEL` (`vendedores.ts:84-95`) declara
once valores contra los seis de `ESTADOS_PROSPECTO` (`:71-78`).

**Escenario con valores.** 30,412 prospectos vivos; uno agenda demo por Cal.com y
queda en `estado='appointment'`. `totales['appointment']` es `undefined`,
`undefined++` escribe `NaN`, y `(Object.values(totales)).reduce((s,n)=>s+n,0)`
(`:241`) devuelve `NaN`. `formato="entero"` resuelve a `numero(Math.round(v))`
y `numero(NaN)` es `"NaN"` (`formato.ts`); `StatCard` solo defiende `valor ===
null`. La tarjeta «Prospectos en el pipeline» (`:273`) dice **NaN** junto a
«Vivos (Nuevo a Negociación)» que dice 30,411, y el kanban —seis columnas desde
`ESTADOS_PROSPECTO.map` (`:220`)— no muestra ese prospecto en ninguna parte.

Consecuencia: la consola con la que Javier corre su pipeline enseña `NaN` donde
va un conteo, y pierde prospectos sin avisar.

(REINCIDENTE de la ronda 19.)

---

### [ALTO] La tarjeta del estímulo de peaje sigue confundiendo «no pude leer» con «no declarado» — REINCIDENTE

`src/app/dashboard/contador/estimulo-peaje.tsx:34-39` y `:89-94`

Idéntico a la ronda anterior:

```ts
let perfil: unknown = {};
try { perfil = await getPerfilCrudo(tenantId); } catch { perfil = {}; }   // :34-39
```

`getPerfilCrudo` lanza a propósito ante error de base. Con `{}`,
`preguntaPendienteEstimuloPeaje({})` devuelve la pregunta y la tarjeta imprime,
en `:90-91`: «**Sin esta declaración el estímulo queda en $0.** Contéstalo antes
del primer cierre…», con los dos selectores en «Elige una» (`:104`, `:116`) y el
botón rotulado «**Declarar**» en vez de «Corregir declaración» (`:97`).

**Escenario con valores.** Flota que YA declaró (ingresos <$300M, no parte
relacionada, `elegible=true`) y viene acreditando el 50% sobre $18,400 de
casetas = **$9,200**. Un `statement timeout` durante un render de
`/dashboard/contador`. El contralor cruza su PDF (que trae $9,200) contra un
panel que le dice que no hay declaración. Si vuelve a contestar y marca «$300
millones o más», escribe `elegible=false` y el próximo cuadre le tira el crédito.

Es la regla «fallar cerrado y decirlo» del `CLAUDE.md` rota en la pantalla que
existe para una cifra fiscal — mientras la mitad de la pantalla que la rodea sí
la respeta (`inicio-contador.tsx:91-107`, ocho consultas por `safe()`).

(REINCIDENTE de la ronda 19.)

---

### [ALTO] El chat de onboarding sigue imprimiendo el código de error del servidor como si fuera la respuesta del configurador — REINCIDENTE

`src/app/dashboard/onboarding/chat.tsx:310-312`, con
`src/app/api/dashboard/onboarding-chat/route.ts:20`, `:29`, `:31`, `:40`

Sin cambio:

```tsx
const respuesta = resp.ok && d && typeof d.texto === 'string'
  ? d.texto
  : (typeof d?.error === 'string' ? d.error : 'No pude guardar eso y prefiero no suponerlo. …');
```

`d.error` sigue siendo el string interno de la ruta: `'sin sesion'` (401,
`route.ts:29`), `'sin acceso'` (403, `:31`, `:35`), `'mensajes inválidos'` (400,
`:40`), `'cuerpo inválido'` (`:38`). Se pinta en la misma burbuja que la
respuesta del configurador, sin distintivo, sin acción y sin enlace a login.

**Escenario con valores.** El dueño lleva ocho turnos de entrevista; la cookie de
Supabase expira; escribe «Menores a 300 millones» → 401
`{"error":"sin sesion"}` → la burbuja bajo el logo de Likida dice literalmente
**«sin sesion»**, y todo lo que teclee después dice lo mismo. El segundo camino
sigue abierto igual: un turno con `texto: ''` se guarda en `historial`, y en el
turno siguiente `validarMensajes` lo rechaza (`route.ts:20`, `!texto.trim()`) →
**400 «mensajes inválidos»** para siempre, hasta un recargado duro. El hermano
`dashboard/chat.tsx` nunca imprime `d.error`.

(REINCIDENTE de la ronda 19.)

---

### [MEDIO] `renglones_ajenos` aterriza en «Dinero observado» como **$0.00 · 0%** — el ticket con $557 de manguera y tapetes se anota como una observación que no vale nada

`src/app/dashboard/agentes/liquidacion/vista.tsx:326`, `:338-346`, con
`src/app/admin/charts.tsx:302` y `:335`, `src/lib/likida/cuadre/engine.ts:635-640`,
`supabase/migrations/0150_agregados_analytics.sql:487-495`

El motor nuevo emite la diferencia con **`monto: 0` a propósito**
(`engine.ts:638`, con la razón escrita en `:607-622`: un juicio del modelo señala,
no descuenta) y mete la cifra real en el texto de `nota`. En la **pantalla de
detalle** eso funciona: `Diferencia` (`[id]/vista.tsx:118-124`) pinta la nota
completa y oculta el monto cuando es 0 (`:123`, `monto > 0 &&`). El problema es
la pantalla **agregada**.

`dinero_observado_por_tipo_tenant` agrupa por tipo **sin filtrar montos en cero**
(`0150:487-495`: `select tipo, coalesce(sum(monto),0), count(*) … group by tipo`),
y `BloqueDineroObservado` pinta un renglón por cada tipo que vuelva:

```tsx
<h2>Dinero observado</h2>
<p>Lo que el agente atrapó fuera de regla o duplicado</p>          // :329-330
<div className="cifra-mono text-[22px]">{mxn(totalObservado)}</div> // :338
<Dona segmentos={porTipo.map((t) => ({ etiqueta: rotuloTipo(t.tipo), valor: t.monto }))} />
{porTipo.map((t) => <div…>{rotuloTipo(t.tipo)} · {numero(t.n)} … {mxn(t.monto)}</div>)}
```

**Escenario con valores** (el mismo que el motor documenta): tres tickets de
autoservicio, uno de $640.49 con $557 de manguera y tapetes. El motor levanta
tres `renglones_ajenos`. `/dashboard/agentes/liquidacion` imprime, bajo «Lo que
el agente atrapó fuera de regla o duplicado»:

```
Incluye partidas que no son del viaje · 3        $0.00
```

…y en la leyenda de la dona, «Incluye partidas que no son del viaje **0%**»
(`charts.tsx:335`, `{Math.round((s.valor / total) * 100)}%`). El contralor lee que el
agente atrapó tres casos que valen cero. Los $557×3 no aparecen en esta pantalla
en ningún lado.

**El caso peor, y es alcanzable.** Si las únicas diferencias de una flota son de
las que el motor emite con `monto: 0` —`renglones_ajenos`, `moneda_extranjera`,
`texto_sospechoso`— entonces `porTipo.length > 0` pero `totalObservado === 0`, así
que **no** entra al estado vacío de `:333-335` («Sin diferencias detectadas
todavía») y en su lugar sale la cifra grande **$0.00** con una dona en gris
(`charts.tsx:302`, `const total = … || 1`, todas las rebanadas de ancho cero) y
cada renglón en «0%». Es un cero con cara de medición sobre una pantalla que
existe para el dinero, que es justo lo que el `CLAUDE.md` prohíbe.

Consecuencia: el hallazgo de producto que este delta vino a instalar —el único
que pone en números lo que un ticket de canasta mixta le cuesta a la flota— se
ve en la pantalla de resumen como ruido de valor cero.

Causa raíz probable: la pantalla asume que toda diferencia trae monto, y el motor
usa `monto: 0` como marca de «observación, no descuento» sin que la vista tenga
un carril para esa clase.

---

### [MEDIO] `--faint` (4.27:1) y `--muted` (4.40:1) sobre `--g1` siguen reprobando AA, y `contraste.test.ts` sigue sin medir ese fondo — REINCIDENTE

`src/app/globals.css:80` (`--faint: #73737c`), `:177` (`--g1: #f4f4f5` bajo
`.tema-neutro`), contra `src/app/dashboard/contraste.test.ts:58`, `:91-95`

Nada cambió: los tres hex son los mismos y el guardia sigue midiendo solo contra
`--surface` (#ffffff) y `--bg` (#fbfbfd). Recalculé los ratios con la fórmula de
luminancia WCAG sobre los hex de hoy:

| par | ratio | AA texto |
|---|---|---|
| `--faint` #73737c sobre `--g1` #f4f4f5 | **4.27:1** | ✗ |
| `--muted` #6b7280 sobre `--g1` #f4f4f5 | **4.40:1** | ✗ |

`--g1` es el lienzo de las dos consolas (`admin/chrome.tsx`,
`dashboard/chrome.tsx` ponen `.tema-neutro` en la raíz) y de la pantalla de
onboarding. Sobre él siguen yendo, sin cambio: la única advertencia legal de la
pantalla nueva a 11 px en `--faint` (`onboarding/chat.tsx:559-563`, «*El estímulo
de peaje (LIF 2026 art. 20-A) no se enciende hasta que lo declares*», el texto en
`:562`), el subtítulo de `:545` en `--muted`, y «Prefiero el formulario», la
única salida al formulario, a 12.5 px en `--faint` (`onboarding/page.tsx:97`).

(REINCIDENTE de la ronda 19.)

---

### [MEDIO] «Perdido» sigue apareciendo dos veces en el embudo del Cerebro — y ahora comparte color exacto con «Sin contactar» — REINCIDENTE, agravado

`src/app/admin/mapa-prospectos/cerebro.tsx:45-48`, `:823-826`, `:988-989`,
`:1106-1107`, `:1174`, contra `src/lib/admin/prospectos-mapa-client.ts:5`, `:10`, `:18`

El mapa se mudó de archivo en este delta (`prospectos-mapa.ts` → `-client.ts`,
re-exportado en `prospectos-mapa.ts:26`) pero el contenido es el mismo:

```ts
nuevo:   { color: '#64748b', nombre: 'Sin contactar' },   // :5
perdido: { color: '#94a3b8', nombre: 'Perdido' },         // :10
lost:    { color: '#64748b', nombre: 'Perdido' },         // :18
```

Dos etapas distintas se llaman «Perdido», con dos filtros distintos en la barra de
chips (`:823-826`) y dos renglones consecutivos en el desglose (`:984-989`). Y
**`lost` y `nuevo` comparten el hex exacto `#64748b`**: en la leyenda de abajo
(`:1106`) y en las barras del embudo (`:1174-1176`) el punto de color de «Sin
contactar» y el de «Perdido (lost)» son el mismo pixel, así que el color no
distingue ni siquiera las dos puntas opuestas del embudo.

**Escenario con valores.** Censo de 30,412: 1,840 en `perdido` (dominio viejo) y
7 en `lost` (escrito por el funnel Cal.com). El desglose imprime
`● Perdido 1,840` y `● Perdido 7`, en grises casi idénticos; quien filtre por el
primer chip «Perdido» ve 1,840 y no sabe que existen otros 7. Lo mismo con
`cerrado` = «Cliente» y `won` = «Ganado», el mismo estado terminal con dos
nombres.

(REINCIDENTE de la ronda 19.)

---

### [MEDIO] «Se cortó la conexión. No guardé nada» sigue imprimiéndose después de que el chat enseñó «Guardando la declaración ✓» — REINCIDENTE

`src/app/dashboard/onboarding/chat.tsx:270` y `:319-323`, contra
`src/app/api/dashboard/onboarding-chat/route.ts:10`

Sin cambio: el cliente aborta a los **75 s** (`AbortSignal.timeout(75_000)`,
`:270`), el servidor tiene **120 s** (`route.ts:10`, `maxDuration = 120`) y no
mira `req.signal` en ningún punto, y el `catch` de `:319-323` afirma un hecho del
servidor que el cliente no puede saber:

```tsx
r: { texto: 'Se cortó la conexión. No guardé nada. Repite la respuesta o usa el formulario.' }
```

`guardar_perfil` ya escribió y ya mandó su evento antes de que `nutrir_operacion`
—el paso lento, que da de alta operadores y unidades uno por uno— cruce los 75 s.
`setPasosVivos([])` (`:326`) borra la palomita que el usuario acabó de ver.

(REINCIDENTE de la ronda 19.)

---

### [BAJO] Los seis límites de error nuevos registran en la consola del navegador del visitante, no en ningún log que alguien pueda leer

`src/app/admin/error.tsx:7-11` (y sus cinco re-exportadores:
`admin/flotas/error.tsx:3`, `admin/mapa-prospectos/error.tsx:3`,
`admin/observabilidad/error.tsx:3`, `admin/qa/error.tsx:3`), con
`src/app/global-error.tsx:31-38` y `src/lib/logger.ts:145-160`

```tsx
useEffect(() => {
  void import('@/lib/logger').then(({ logger }) => logger.error('admin.boundary', {
    digest: error.digest ?? 'sin-digest', err: error.message,
  }));
}, [error]);
```

`emit()` hace `console.error(JSON.stringify(line))` (`logger.ts:152-153`) y solo
después consulta `process.env.SENTRY_DSN` (`:157`). `SENTRY_DSN` no lleva prefijo
`NEXT_PUBLIC_`, así que en el bundle de cliente vale `undefined` y la rama de
Sentry nunca corre. **Escenario:** una excepción de cliente en
`/admin/mapa-prospectos` a las 3 a.m.; `error.digest` es `undefined` (los digest
solo existen para errores de servidor) → se escribe `{"level":"error",
"msg":"admin.boundary","meta":{"digest":"sin-digest",…}}` en la consola del
navegador de Javier y en ningún otro lado. El comentario de
`global-error.tsx:21-22` promete lo contrario: *«Lo que sí conserva es lo único
que importa a las 3 a.m.: el `digest` en pantalla y **una línea en el log** con
ese mismo digest.»*

Consecuencia: quien mantenga esto va a creer que las pantallas de error dejan
rastro, y en el único caso que el boundary existe para atrapar —el fallo de
cliente— no deja ninguno.

---

### [BAJO] `tocar()` sigue sin `.catch` y sigue mandando un campo que la ruta ignora — REINCIDENTE

`src/app/admin/mapa-prospectos/cerebro.tsx:497-505` contra
`src/app/api/admin/mapa-prospectos/toque/route.ts:18-20`

Sin cambio. El comentario de `:497-498` sigue prometiendo «fuego y olvido, el
link abre igual aunque la red falle», que es lo que garantizaba el `.catch(() =>
undefined)` que se quitó: sin red, el clic en WhatsApp produce un
`unhandledrejection`. Y el cuerpo sigue llevando `estado: 'iniciado'`, campo que
la ruta ni desestructura (`route.ts:18` lee `id`, `canal`, `resumen`).

(REINCIDENTE de la ronda 19.)

---

### [BAJO] El `<details>` del formulario sigue dentro del pie `sticky bottom-0`, y dos comentarios siguen afirmando que el motor «fail-open» — REINCIDENTES

`src/app/dashboard/onboarding/chat.tsx:519-526` y `src/app/dashboard/page.tsx:41-42`

Los dos siguen idénticos. En `chat.tsx:519` el pie es `sticky bottom-0` y adentro
va la caja de texto **y** `{formulario}` (`:524`), que abierto mide ~700 px; en la
vista vacía el mismo formulario va en flujo normal (`:565-567`). No lo medí en un
navegador. Y `dashboard/page.tsx:41-42` sigue diciendo «*Sin el umbral de peaje
el motor fail-open y el Resumen pintaría un 50% que quizá no le toca*» cuando
`engine.ts:1237` es `input.elegiblePeaje === true` — fail-closed. El comentario
correcto sigue estando en `contador/estimulo-peaje.tsx:17-19`, tres archivos más
allá.

(REINCIDENTES de la ronda 19.)

---

## Verificación de los abiertos anteriores

### El CRÍTICO de la ronda 19 — **CERRADO, y bien**

`dashboard/page.tsx:56-63`. El `try` envuelve solo `getPerfilCrudo` y la
asignación de `faltaOnboarding`; el `redirect()` sale afuera. El comentario
`:44-55` deja escrita la razón y cita los docs empaquetados. Con `tsc` limpio y
los 292 tests de `src/app/{dashboard,admin,privacidad}` + `src/lib/legal` en
verde, la compuerta ahora sí dispara: `perfil = {}` →
`onboardingFiscalListo({})` falso → `faltaOnboarding = true` → `redirect`. Los
cinco `href` con `&rol=flota_admin` que el delta anterior añadió por fin sirven
para algo.

### Los ocho de la c4 — **8/8 REINCIDENTES**, verificados abriendo el archivo

| Hallazgo (c4) | Evidencia de hoy |
|---|---|
| [ALTO] El «Reintentar» de los 64 boundaries no puede reintentar | `dashboard/limite-error.tsx:25-38`: `state = { rompio: false }`, solo `getDerivedStateFromError`, sin `componentDidUpdate` ni `getDerivedStateFromProps`, y ningún call site le pasa `key`. |
| [ALTO] «Dinero observado» significa dos cosas | `agentes/liquidacion/vista.tsx:326` sigue siendo `porTipo?.reduce((s,t)=>s+t.monto,0)` bajo el subtítulo de `:330`; `dashboard/chat.tsx:106` sigue imprimiendo `kpis.diferenciaDetectada`. |
| [MEDIO] Vigencias de unidades en día UTC | `lib/likida/operacion.ts:170` sigue con `Date.UTC(...)` y `:187` con `Math.round((t - base)/DIA_MS)`. |
| [MEDIO] «Actividad — Histórico» aplasta `null` a vacío | `inicio-contenido.tsx:711` sigue con `porMes={viajesPorMes ?? []}`. |
| [MEDIO] `ComboCatalogo` no re-resuelve el id al llegar las opciones | `combo-catalogo.tsx:93-101`: el emparejamiento sigue solo en `alEscribir`; nada lo deriva de `[texto, opciones]`. |
| [MEDIO] El Cerebro deja la tarjeta con dos momentos | `cerebro.tsx:365-368`: `pedirTextos` sigue filtrando por `pedidos.current` y nada lo invalida. |
| [BAJO] Los dos registros de `/dashboard/clientes` se borran el filtro | `src/app/dashboard/clientes/` sin cambios en el delta. |
| [BAJO] El esqueleto del bloque más alto mide un tercio | `inicio-contenido.tsx:382` sigue siendo `<EsqGrafica alto={260} />` para todo `PanelPeriodo`. |

### Los nueve de la c2 — **siguen abiertos**

Muestreo directo: `mapa-prospectos/[id]/detalle.tsx` intacto (`:26` hex a mano,
`:80` `if (!r.ok) return;`, `:169` `href={per.linkedin}`, `:195` y `:258` con
`#16a34a` literal). El único que había cerrado (la clave 624 en
`lib/saas/fiscal.ts`) sigue cerrado.

---

## Lo que revisé y está bien

- **La compuerta, corrida por mí.** `npx tsc --noEmit -p .` sin salida, exit 0.
  `npx vitest run src/app/dashboard src/app/admin src/app/privacidad src/lib/legal`:
  **39 archivos, 292 pruebas, todas verdes** en 20.5 s.
- **La regresión del despacho está arreglada como corresponde, y con la prueba
  correcta.** `guardiaDespacho` se movió a nivel de módulo (`despacho/page.tsx:52-57`)
  y recibe `tenantId` por parámetro, así que las seis acciones inline
  (`:121`, `:136`, `:196`, `:223`, `:245`, `:270`) solo cierran sobre strings.
  Igual en `mi-perfil/page.tsx:56-58` con `volverAMiPerfil(sufijo, estado)`. La
  nota de `:21-50` documenta el bundle compilado real y los 204 eventos de
  Sentry — es la clase de comentario que evita repetir el bug.
- **Y busqué la variante que la prueba nueva NO cubre, y no hay instancia viva.**
  `server_actions_sin_closures.test.ts:85` solo detecta `^ {2}(async )?function
  nombre` — exactamente dos espacios, y solo declaraciones `function`. Un
  `const guardia = async () => {}` en el cuerpo del componente se le escapa
  entero. Recorrí a mano los 12 `page.tsx`/`layout.tsx` con `'use server'` que
  declaran ayudantes locales: `admin/flotas/page.tsx:171` (`onboardingDe`, usada
  solo en el JSX de `:304`), `dashboard/politicas/page.tsx:74` (`deConcepto`,
  usada solo en `:151`) y `despacho/page.tsx:139` (`texto`, declarada **dentro**
  de la acción). Ninguna se captura desde un `'use server'`. La heurística tiene
  el hueco; hoy no hay nada dentro de él.
- **Trabajo obligatorio del rubro — cada mapa literal del panel contra
  `src/types/likida.ts`.** El delta agregó exactamente un valor,
  `renglones_ajenos` (`types/likida.ts:108`). `ROTULO_DIFERENCIA`
  (`rotulo-diferencia.ts:18-63`) es `Record<TipoDiferencia, string>`: el
  compilador exigió el rótulo y `tsc` está limpio, así que los 38 están.
  Verifiqué además que los 38 rótulos son **únicos** entre sí — importa porque
  `Dona` usa `key={s.etiqueta}` dos veces (`charts.tsx:325` y `:332`) y dos tipos
  con el mismo rótulo darían llaves duplicadas de React sobre una lista de dinero.
  `NO_DEDUCIBLE_ISR`/`POR_CONFIRMAR`/`ETIQUETA_CAPTURA` (`[id]/vista.tsx:169-181`)
  siguen importando del motor y `renglones_ajenos` cae correctamente a «Por
  revisar» (`[id]/vista.tsx:201`, la rama `tipos.length > 0`), que es lo que el
  motor quiere: no afirma ninguna cubeta. `PILL_COLUMNA`
  (`vendedores/tablero.tsx:59-66`) va con `?? 'neutral'` (`:224`). `EstatusLiquidacion`,
  `EstadoSat` y `ConceptoGasto` no tienen mapa divergente en el panel.
  Los dos que SÍ divergen —`conteosVacios` y `COLOR_EMBUDO`— están arriba como
  hallazgos, y son los mismos dos de la ronda anterior.
- **`renglones_ajenos` en la pantalla de detalle está bien resuelto.**
  `Diferencia` (`[id]/vista.tsx:118-134`) imprime la nota completa —que trae
  «incluye $557.00 en partidas que no parecen gasto de viaje: manguera de
  jardinería $299.00, tapete $258.00»— y oculta el monto cuando es 0 (`:123`),
  así que no aparece un «$0.00» sin sentido al lado. El botón
  «Aprobar / Descontar» sigue deshabilitado con su razón en el `title` (`:126-132`).
  El umbral del 15% no se pinta en ningún lado y **está bien que no**: lo que el
  contralor necesita es la cifra y los nombres de las partidas, y los dos están.
- **`COLOR_EMBUDO` no se duplicó al mudarse.** `prospectos-mapa.ts:26` re-exporta
  desde `prospectos-mapa-client.ts` en vez de copiar — cuatro consumidores
  (`cerebro.tsx:30`, `calles.tsx:19`, `[id]/detalle.tsx:17`, `mensajes.ts:8`)
  apuntan al mismo módulo. Una fuente, no dos.
- **Los cinco límites de error nuevos apuntan bien.** `admin/flotas/error.tsx`,
  `admin/mapa-prospectos/error.tsx`, `admin/observabilidad/error.tsx` y
  `admin/qa/error.tsx` hacen `export { default } from '../error'`, y desde cada
  una de esas carpetas `../error` resuelve a `admin/error.tsx`. El boundary de
  Next re-lanza `NEXT_REDIRECT`/`NEXT_NOT_FOUND`, así que no se traga los
  `redirect()` de las páginas de abajo. `reset` es el de Next (rerenderiza el
  segmento), no el `LimiteError` roto.
- **El widget de costo de IA salió del layout, y eso es una mejora real.**
  `admin/layout.tsx` ya no hace `await costoIaMesActual()` antes de pintar la
  cáscara: la agregación de costo del mes bloqueaba el primer flush de **todas**
  las páginas de `/admin`. En su lugar `SidebarAbajoAdmin` pinta una liga a
  `/admin/costos-facturacion` (`sidebar-nav.tsx:133-139`). El único pero es que
  la docstring de `:116-119` sigue diciendo que `undefined` significa «no se
  pidió (render de prueba): el widget no se pinta», y hoy `undefined` es el
  camino de producción y sí se pinta algo.
- **Accesibilidad nueva en los dos sidebars, y correcta.** `aria-expanded={!plegada}`
  y `aria-controls` en el botón de sección, con el `<div id=…-items>` **siempre
  presente** aunque esté vacío al plegar (`admin/sidebar-nav.tsx:62-75`,
  `dashboard/sidebar-nav.tsx:54-67`) — un `aria-controls` que apunta a un id
  inexistente es peor que no ponerlo. Los `aria-label` en `Fila` cubren el modo
  colapsado, donde `.sb-texto` desaparece y el enlace se queda solo con el icono.
- **El anillo de foco del sidebar pasa el umbral.** `globals.css:334-339`
  (`outline: 3px solid var(--accent, var(--marca))`, `outline-offset: 2px`,
  `z-index: 1`). Calculé `--accent` #c2410c contra `--g1` #f4f4f5: **4.71:1**,
  por encima del 3:1 que WCAG 2.2 pide para un indicador de foco. El
  `position: relative` + `z-index: 1` es lo que impide que el `outline` quede
  bajo el elemento siguiente.
- **`layout.tsx:59` le puso `id="likida-theme-init"` al script de tema**, que es
  lo que le permite a React reconciliarlo sin volver a ejecutarlo. El script
  sigue saliendo antes de `{children}` y sigue acotado a `/dashboard`.
- **El panel de QA falla por valor en las tres fuentes.** `admin/qa/page.tsx:24`,
  `:34`, `:35` capturan cada lectura por separado y pasan `bancoError`,
  `historialError` y `gastoError` a la pantalla en vez de un arreglo vacío. El
  botón «Lanzar corrida» corre la MISMA `validarLanzar` que el servidor
  (`lanzar-form.tsx:130`) y siempre dice su motivo a la vista (`:315-317`),
  incluido «no se pudo leer el gasto del día — no se lanza a ciegas» (`:132`).
  Y `:190-193` declara con número cuántos escenarios del catálogo faltan en vez
  de callarlo.

---

## Lo que NO alcancé a revisar

- **No miré un solo render. Sexta ronda seguida.** Corrida en la nube, sin
  `npm run build`, sin base y sin credenciales. Todo lo de arriba es lectura de
  código, aritmética verificada a mano (los ratios de contraste y el `NaN` los
  ejecuté), y `grep` sobre el fuente. Las dos páginas legales —donde está mi
  hallazgo de mayor riesgo— **nunca se vieron pintadas**: no sé qué tan
  agresivo se lee el recuadro de `FaltaDato` en la página, ni si cae arriba o
  abajo del pliegue.
- **`app/layout.tsx:55` no lo ejecuté.** El escenario del `.env.example` está
  razonado desde `config.ts:92-101` y las líneas 43-51 del archivo, no
  reproducido levantando `next dev`. No pude comprobar si Vercel tiene
  `LEGAL_ENFORCE_PRODUCTION` acotada a producción o aplicada a los tres entornos
  —de eso depende si los deployments de preview están vivos o muertos hoy.
- **Responsive: cero medido, tercera ronda.** El `<details>` dentro del `sticky`
  sigue razonado desde el CSS. Tampoco medí la tabla de 10 columnas del registro
  de viajes a 390 px, ni el `min-[1100px]:grid-cols-5` de `[id]/detalle.tsx:200`,
  ni la rejilla `md:grid-cols-8` del banco de fotos de `/admin/qa` (`:226`).
- **Lector de pantalla: no probado.** `onboarding/chat.tsx:481-518` sigue sin
  `aria-live`, y ahora `admin/error.tsx` tampoco anuncia nada al montarse. No lo
  levanto como hallazgo porque no pude confirmar qué aporta el chrome.
- **Contraste: solo los pares que nombré.** No medí el tema oscuro completo, ni
  los hex a mano de `mapa-prospectos/[id]/detalle.tsx:26-28`, `:195`, `:258`, ni
  los catorce colores de `COLOR_EMBUDO` contra el fondo del mapa — donde ya sé
  que dos son idénticos.
- **`/admin/qa/[id]` y `PantallaQa` no los abrí.** Vi `page.tsx` y
  `lanzar-form.tsx`; la pantalla de detalle de una corrida y `pantalla.tsx`
  quedaron fuera, y ahí es donde los oráculos escriben su veredicto.
- **Las ~24 páginas de `/dashboard` que la ronda 18 dejó fuera siguen fuera**
  (`rentabilidad/`, `combustible-casetas/`, `conocimiento/`, `politicas/`,
  `integraciones/`, `llaves-api/`, `notificaciones/`, `mapa/`, `soporte/`,
  `carta-porte/`, `conexiones/`, `agentes/{peajes,notificaciones}`), y de
  `/admin` unas 33 fuera del Cerebro, Vendedores, Flotas, Crecimiento, QA y
  `ui/kit`.
- **`/(portal)` y `/(demo)` no los abrí en ninguna ronda.** Son de mi rubro por
  asignación y no tengo una sola línea leída de ellos.
