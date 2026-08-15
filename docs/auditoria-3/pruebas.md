# Pruebas — auditoría 3 (pase 3)

**Nota: 6/10** (antes 5). Razón del movimiento: **se atacó y subió**. La puerta
de cobertura de CI, que el pase 2 encontró en ROJO, hoy sale **verde** (exit 0)
y con un umbral más duro; el workflow corre en todas las ramas y recuperó las
pruebas de tiempo que la instrumentación se saltaba. Pero el hallazgo heredado
PR-C1 se **confirma**, y la medición por archivo destapa zonas de dinero al
**0.0%** que ninguna mutación mía puso en rojo.

**El riesgo mayor del rubro hoy:** el arnés protege el *cálculo* del dinero
(cuadre, libro del viaje, fiscal, `/v1` de escritura: rompí cuatro cosas ahí y
tres se pusieron rojas) y **no protege la puerta ni la salida** del dinero — las
cuatro rutas de export, las tres rutas de datos de `/v1` y el módulo del lado
del ingreso están medidos en 0.0–0.5% de sentencias.

---

## Contexto de la corrida

- **Corrí `npm run test:coverage` UNA vez** (la excepción autorizada). Salida:
  `329 archivos · 4,500 pruebas verdes · 3 saltadas · exit 0`.
- **Cobertura hoy vs. umbral de `vitest.config.ts`:**

  | | medido | umbral | |
  |---|---|---|---|
  | Statements | **79.04%** (21,966/27,790) | 78 | ✅ |
  | Branches | **85.11%** (7,812/9,178) | 84 | ✅ |
  | Functions | **85.81%** (1,125/1,311) | 84 | ✅ |
  | Lines | **79.04%** | 78 | ✅ |

  **Atribución:** el rojo del pase 2 (59.80% contra umbral 67) **está cerrado**,
  y no por bajar la vara: `vitest.config.ts` excluyó la categoría
  `src/app/**/*.tsx` del denominador y **subió** el umbral de 67 a 78. El
  comentario del config documenta la medición que lo justifica (70 vistas .tsx
  = 3.59%, el resto = 79.51%). Es un cambio honesto y declarado, no un aflojón.
  Ver el BAJO-2 para lo que sí cuesta.
- Rompí **8 funciones** a propósito, corrí sus pruebas sueltas, y **revertí
  todas** con `git checkout --`. El árbol quedó como lo encontré: `git status`
  al cierre solo muestra los reportes de los otros once auditores y la
  desviación preexistente de `package*.json` (el `xlsx` del MAPA).

---

## Hallazgos

### [ALTO] REINCIDENTE · PR-C1 confirmado: la prueba de `enLotes` es decoración en la dirección que importa
`src/lib/likida/lotes.test.ts:13`

La única assertion de concurrencia es **de un solo lado**:
`expect(pico).toBeLessThanOrEqual(3)`. Un lote serial tiene `pico = 1`, que
cumple `≤ 3`.

Escenario (corrido, no razonado). Reemplacé el cuerpo de `enLotes`
(`src/lib/likida/lotes.ts:20-32`) por el bucle serial que REND-C1 existe para
eliminar:

```
for (const item of items) {
  try { salida.push({ ok: await fn(item) }); }
  catch (error) { salida.push({ error }); }
}
```

Salida real:

```
 ✓ src/lib/likida/lotes.test.ts (3 tests) 42ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

**Las tres `it` verdes contra el bug original.** Comprobé además la dirección
contraria para ser preciso: con `Promise.all` sobre todo el arreglo (paralelismo
sin techo) la primera `it` **sí** falla (`Tests 1 failed | 2 passed`). O sea que
la prueba vigila "demasiada concurrencia" y es ciega a "ninguna", que es
exactamente la regresión que ancla.

Consecuencia: `enLotes` sostiene tres escrituras de dinero —
`intake/consolidado.ts:337` (el cruce del consolidado) y
`intake/desglose_peaje.ts:564` y `:711` (las líneas de peaje) —. El commit
`54e0648` cita esta prueba como ancla del crítico REND-C1: "1,000 líneas ≈ 300s
contra `maxDuration=120s`, y morir a la mitad corrompía la conciliación". Si
alguien revierte a serial, la suite sigue verde, el cron muere a los 120s con la
conciliación de peajes a medio aplicar, y el contralor cruza contra su ERP un
desglose incompleto que nadie declaró incompleto.

Causa raíz probable: la assertion mide un techo (`≤ N`) donde el invariante es
un piso (`== min(N, pendientes)`); nada obliga a que el paralelismo ocurra.

*(Bajo la etiqueta de severidad: lo dejo en ALTO y no en CRÍTICO como venía
heredado, porque la función **hoy es correcta** — no hay dinero mal ahora mismo.
Lo que existe es una regresión silenciosa habilitada.)*

---

### [ALTO] El lado del ingreso (`comercial.ts`) mueve cuatro pantallas de dinero con 0.5% de sentencias cubiertas
`src/lib/likida/comercial.ts:92`, `:96`, `:157`, `:232`

Medido: **200 sentencias, 0.5% ejecutadas.** El único test que lo nombra
(`facturacion_clientes.test.ts:2`) importa **solo un tipo**
(`import type { FacturaRow }`), no una función. Alimenta
`/dashboard/clientes`, `/dashboard/rentabilidad`, `/dashboard/soporte` y
`facturacion_clientes.ts`.

Escenario (corrido). Rompí **tres** agregaciones de dinero a la vez:

| línea | original | roto |
|---|---|---|
| `:157` | `contribucion: round2(ingreso - costoComprobado)` | `ingreso + costoComprobado` |
| `:232` | `porCobrar: round2(vivas.reduce(...))` | `porCobrar: 0` |
| `:96` | `round2((filas[0].ingreso / ingresoTotal) * 100)` | `* 1000` |

Salidas reales, dos corridas:

```
npx vitest run comercial clientes facturacion rentabilidad cobranza
 Test Files  23 passed (23)
      Tests  418 passed (418)

npx vitest run src/app/dashboard src/lib/likida/analytics
 Test Files  28 passed (28)
      Tests  231 passed (231)
```

**649 pruebas verdes** con la contribución de signo invertido, el "por cobrar"
clavado en cero y la concentración de cartera diez veces más alta.

Consecuencia: un viaje de $30,000 de ingreso con $22,000 comprobado dejaría de
mostrar $8,000 de contribución y mostraría **$52,000**; `/dashboard/rentabilidad`
le enseñaría al contralor un margen de 173%. El "por cobrar" en $0 le dice a la
flota que no tiene cartera vencida. Es la regla que CLAUDE.md pone primero
—"nunca inventar una cifra"— sin una sola prueba que la sostenga en este archivo.

Causa raíz probable: el archivo entero es I/O + agregación en la misma función,
así que no hay nada puro que probar sin un doble de Supabase, y nadie lo escribió.

---

### [ALTO] Las cuatro rutas de export de dinero están al 0.0% — incluida la puerta que cerró un IDOR
`src/app/api/export/liquidaciones/route.ts:47`
(gemelas: `export/pdf/[id]/route.ts:63`, `export/facturas-proveedor/route.ts:42`,
`export/bitacora-peaje/route.ts:30`)

Medido: **0.0% de sentencias en las cuatro** (42, 106, 59 y 37 sentencias).
Ningún test del repo importa ninguna de las cuatro rutas.

Escenario (corrido). Neutralicé la puerta de dinero de `export/liquidaciones`
— la que el propio archivo documenta como el arreglo de la contradicción del
`encargado` ("`/dashboard/analitica` le escondía la gráfica con 'tu rol no ve
cifras de dinero' y tres pulgadas más abajo le pintaba el botón que se las daba
enteras en CSV"):

```diff
- if (!puedeVerArea(t.rol, 'dinero')) {
+ if (false) {
```

Salida real:

```
npx vitest run src/lib/auth src/lib/likida/export.test.ts src/app/api
 Test Files  27 passed (27)
      Tests  473 passed (473)
```

Consecuencia: un `encargado` (jefe de tráfico) baja el CSV con folio, operador,
**anticipo, comprobado y diferencia por viaje** de toda la flota. `puedeExportar`
y `puedeVerArea` tienen sus propias pruebas unitarias
(`lib/auth/permisos.test.ts`, 6 pruebas, verdes) — lo que nadie prueba es que la
ruta **se las pregunte**. Esas mismas cuatro rutas cargan otros dos arreglos
históricos sin ancla: el IDOR del operador bajando el PDF de un compañero, y el
`.limit(5000)` que recortaba el CSV en silencio (auditoría 12) hoy resuelto con
`traerTodo` + `LecturaIncompleta`.

Causa raíz probable: la matriz de permisos se prueba como función pura y su
aplicación en el borde no tiene arnés de ruta en ninguna de las cuatro.

---

### [ALTO] El precio de Stripe se divide entre 100 sin una sola prueba que lo mire
`src/lib/saas/stripe.ts:164`

El propio comentario de dos líneas arriba dice: *"`unit_amount` viene en la
unidad mínima (centavos). Dividir mal es un error…"*. Medido: `stripe.ts` al
**22.3%** (175 sentencias); `leerPrecio` no está entre las cubiertas.

Escenario (corrido). Borré la división:

```diff
- montoMensual: (p.unit_amount ?? 0) / 100,
+ montoMensual: (p.unit_amount ?? 0),
```

Salida real:

```
npx vitest run stripe suscripcion facturacion saas
 Test Files  1 failed | 25 passed (26)
      Tests  1 failed | 420 passed (421)
```

El único rojo fue de **otra** mutación que corrí en el mismo pase
(`facturacion_escritura`, ver abajo). Para el `/100`: **cero pruebas rojas**.

Consecuencia: `guardarPriceDePlan` (`lib/saas/suscripcion.ts:243→262`) escribe
`tenant.precio_mensual` con ese valor y `/admin/costos-facturacion` lo imprime
con `mxn()`. Un plan de $999 MXN se guardaría y se enseñaría como **$99,900.00
al mes**, leído "de Stripe" — que es la frase exacta que la pantalla usa para
darle autoridad. Es la cifra que Javier le va a cotizar al primer cliente.

Causa raíz probable: `leerPrecio` es la única función del módulo que hace
aritmética y es también la única que se probaría contra un `fetch` doble; no se
escribió.

---

### [ALTO] El guardia de sobrepago está probado; su llamada, no
`src/lib/likida/facturacion_escritura.ts:404`

`evaluarAbono` (`:177`) tiene su prueba y es sólida — cuando le rompí la
condición de sobrepago (`if (monto > saldo + 0.005)` → `if (false)`), la suite
se puso roja de inmediato:

```
× evaluarAbono … > el sobrepago se rechaza CON el saldo exacto en el mensaje
```

Pero el **call site** dentro de `registrarPago` no tiene arnés. Escenario
(corrido). Comenté la línea 404:

```diff
- if (abono.rechazo) throw new DatoInvalido(abono.rechazo);
+ // if (abono.rechazo) throw new DatoInvalido(abono.rechazo);
```

Salida real:

```
npx vitest run facturacion clientes rentabilidad
 Test Files  19 passed (19)
      Tests  389 passed (389)
```

Consecuencia: con esa línea fuera, un pago de $50,000 contra una factura de
$12,000 se inserta en `pago_recibido` sin rechazo; la factura queda con saldo
**−$38,000**, `getCobranza` (`comercial.ts:232-233`) resta ese negativo del "por
cobrar" de toda la cartera, y el contralor ve una cartera $38,000 menor que la
real. También aplica a los otros tres estatus (cancelada, borrador, pagada) que
el mismo `if` bloquea. El propio `facturacion_escritura.test.ts:11` lo declara:
*"Las escrituras (`crearFactura`, `registrarPago`) no se prueban contra un mock
de Supabase"*.

Causa raíz probable: la decisión —defendible— de no probar contra un doble de
Supabase deja sin cubrir el cableado, que es donde vive este modo de falla.

---

### [MEDIO] Las tres rutas de datos de `/v1` que no son POST están al 0.0%
`src/app/api/v1/viajes/[id]/contribucion/route.ts:73`,
`src/app/api/v1/clientes/route.ts`, `src/app/api/v1/viajes/[id]/route.ts`

Medido: 108, 45 y 89 sentencias, **0.0% las tres**. El contraste importa y hay
que decirlo: `_escritura.test.ts` (802 líneas, ~50 `it`) y `_comun.test.ts` sí
ejercen los `POST` de viajes y unidades de punta a punta —tenant desde la
credencial, idempotencia en tres capas, el 409 del hallazgo A8—, y
`openapi/route.test.ts:104` exige que *cada método HTTP exportado por una ruta
v1 esté documentado*. Lo que nadie ejerce son estos tres handlers.

Escenario: `abrir(req, 'dinero')` en `contribucion/route.ts:73` es lo único que
separa a un jefe de tráfico del margen por viaje; el propio encabezado del
archivo declara que es *"la única de las rutas de viaje que la lleva"*. Cambiar
ese literal a `'operacion'` no pone roja ninguna prueba —el mismo experimento que
sí corrí sobre `export/liquidaciones`, con 473 verdes—, y una llave de tablero
pegada en el Grafana de la flota empezaría a devolver ingreso, comprobado y
margen de cada viaje.

Consecuencia: el área de una ruta pública es un literal de una sola palabra sin
red; el modo de falla es que se publique y nadie lo note hasta que un
integrador lo vea.

Causa raíz probable: el arnés de `/v1` se construyó alrededor de los helpers
compartidos y no de los handlers que no escriben.

---

### [MEDIO] `correo/enviar.ts` — el único camino de salida de correo, al 4.8%
`src/lib/correo/enviar.ts:63`

Medido: 63 sentencias, **4.8%**. Está mockeado en tres pruebas
(`observability/alerta.test.ts:20`, `agentes/notificaciones_parpadeo.test.ts:125`,
`agentes/notificaciones_corrida.test.ts:50`) y ejercido en ninguna. El resto de
`src/lib/correo/` sí está bien probado (7 fuentes, 5 archivos de prueba, y la
plantilla y el webhook de entrada aguantaron mis mutaciones — ver abajo).

Escenario: `destinatarioValido()` y la rama `sin_configurar` deciden si una
alerta sale o se traga en silencio. El módulo declara explícitamente que *"no
tira excepción, devuelve un resultado"* — o sea que cualquier regresión ahí es
callada por diseño y no hay prueba que la vea. Un cambio en el regex de
`destinatarioValido` (`:59`) que rechazara direcciones con `+` dejaría sin
alertas a cualquier flota que use `contralor+likida@…`, sin un solo log de error.

Consecuencia: el canal por el que se enteran de que un agente se atoró es el
menos probado de la superficie de correo nueva.

Causa raíz probable: mockear el emisor es lo correcto para probar a los
llamadores, pero deja al emisor mismo sin nadie que lo ejerza.

---

### [MEDIO] La cola de timbrado (`cron/facturar/cola`) al 0.0%, junto a un padre que sí está probado
`src/app/api/cron/facturar/cola/route.ts`

Medido: 54 sentencias, **0.0%**. `cron/facturar/route.ts` sí tiene
`route.test.ts`; su hermano de cola no. `verificaciones.sql:1938` documenta que
*"la cola de facturación se bloqueaba a sí misma: el cron elegía los 8 más…"* —
o sea que esta cola ya tiene un modo de falla pagado en producción, verificado
del lado de Postgres y sin ancla del lado de TypeScript.

Consecuencia: la reclamación de trabajos de la cola de timbrado puede volver a
morderse la cola y la suite no lo notaría; el síntoma sería CFDIs que no se
timbran sin que nadie lo declare.

Causa raíz probable: la ruta se añadió después del test de su padre y no heredó
arnés.

---

### [MEDIO] `admin/corridas-cruzadas.ts` y `admin/bitacora.ts` al 0.0% — la observabilidad de Javier
`src/lib/admin/corridas-cruzadas.ts` (71 sentencias, 0.0%),
`src/lib/admin/bitacora.ts` (28 sentencias, 0.0%)

Los consume `/admin/observabilidad/page.tsx:10-11` y
`/admin/corridas/[id]/page.tsx:4`. `src/lib/observability/` sí está bien cubierto
(3 fuentes, 5 archivos de prueba, y `alerta.test.ts` es real). El hueco está en
la capa de `/admin` que **lee** esas corridas.

Escenario: `trazaDeCorrida` cruza tenants a propósito. Un filtro perdido ahí
mezclaría corridas de dos flotas en la misma traza que Javier mira para decidir
si un agente está sano — y la consola de un superadmin es justo donde ese error
es invisible, porque cruzar tenants ahí es lo esperado.

Consecuencia: la pantalla con la que se opera el producto no tiene red; se
degrada y se nota tarde.

Causa raíz probable: `src/app/admin/**` quedó fuera del foco de la ronda de
cobertura, y estos dos son `lib/` que solo consume `admin/`.

---

### [BAJO] Una assertion de tiempo con 4,000 ms de holgura sobre un presupuesto de 1,500 ms
`src/lib/likida/repo_tope.test.ts:75` y `:87` (gemela en `config_tope.test.ts:61`)

El archivo es bueno —levanta un servidor mudo local, sin red ni gasto, y
restaura el env en `afterAll` (arreglo de auditoría 8)—. Lo flojo es la
assertion: con `LIKIDA_TOPE_CONSULTA_MS = '1500'` (`:48`), la comprobación es
`expect(ms).toBeLessThan(TOPE_CONSULTA_MS + 4_000)`, o sea `ms < 5500`.

Escenario: si alguien subiera el tope efectivo de 1,500 ms a 5,000 ms —una
regresión de 3.3× sobre el presupuesto que el archivo entero existe para
defender— la prueba **seguiría verde**. Y el archivo cuesta 6.0 s de reloj real
en cada corrida (medido: `repo_tope.test.ts (4 tests) 6036ms`).

Consecuencia: deuda. El presupuesto de 120 s del cron se erosiona sin que la
puerta lo diga, y la suite paga seis segundos por una medición con margen de
error del 267%.

Causa raíz probable: la holgura se dimensionó para no flakear en un runner
cargado, y quedó más ancha que la señal que mide.

---

### [BAJO] La puerta de cobertura ya no ve la pantalla, y el número global no lo dice
`vitest.config.ts` (exclude `src/app/**/*.tsx`, umbral 78/78/84/84)

El cambio es correcto y está documentado con su medición (el config explica que
el número mezclado *"no medía protección, medía cuánta pantalla se había escrito
esa semana"*, y subió el umbral de 67 a 78 para endurecer lo que sí se puede
probar en nodo). Es la razón por la que la puerta hoy sale verde.

Escenario: el efecto lateral es que **79.04%** ya no habla de ~6,269 líneas de
vista que estaban al 3.59%. Un lector que vea "79%" en el log de CI concluirá
que cuatro de cada cinco líneas del producto están ejercidas, y para
`src/app/**/*.tsx` la cifra real sigue cerca de cero. El propio config dice que
el camino a cubrirlas *"necesita jsdom + testing-library, sesión dedicada
post-demo"* — o sea que la deuda está rastreada, no cerrada.

Consecuencia: deuda de interpretación. El riesgo es que la puerta verde se lea
como "la pantalla está cubierta" en la próxima ronda.

Causa raíz probable: la métrica cambió de denominador y el reporte de CI imprime
un solo número.

---

## Pruebas que resultaron decoración

Rompí **8 funciones** de verdad. Estas son las que la suite **no** atrapó:

| # | Qué rompí | `archivo:línea` | Corrida | Resultado |
|---|---|---|---|---|
| 1 | `enLotes` → bucle serial | `lib/likida/lotes.ts:20-32` | `vitest run src/lib/likida/lotes.test.ts` | **3 passed (3)** — decoración |
| 2 | `contribucion` con signo invertido + `porCobrar: 0` + concentración ×10 | `lib/likida/comercial.ts:157,232,96` | `vitest run comercial clientes facturacion rentabilidad cobranza` | **418 passed (418)** |
| 2b | (las mismas tres) | ídem | `vitest run src/app/dashboard src/lib/likida/analytics` | **231 passed (231)** |
| 3 | puerta de dinero del CSV de liquidaciones anulada | `api/export/liquidaciones/route.ts:47` | `vitest run src/lib/auth src/lib/likida/export.test.ts src/app/api` | **473 passed (473)** |
| 4 | `montoMensual` sin dividir entre 100 | `lib/saas/stripe.ts:164` | `vitest run stripe suscripcion facturacion saas` | **verde para esta mutación** |
| 5 | rechazo de sobrepago no aplicado en `registrarPago` | `lib/likida/facturacion_escritura.ts:404` | `vitest run facturacion clientes rentabilidad` | **389 passed (389)** |

Y estas **sí** se pusieron rojas — el arnés funciona donde existe:

| # | Qué rompí | Quién lo atrapó |
|---|---|---|
| 6 | `proporcionTimbrado` calculada sobre `total` en vez de `totalTimbrado` (reintroduce el CRÍTICO de auditoría 8) | `cuadre/engine.test.ts:1274` — `Expected 700, Received 194.44`. 2 fallos. |
| 7 | `margenPct` devolviendo `0` en vez de `null` (rompe "null no es cero") | `libro_viaje.test.ts` — **5 fallos** |
| 8 | tope de tamaño de adjunto del correo entrante anulado (×2 chequeos) | `api/correo/entrante/route.test.ts` — **2 fallos** |
| 8b | condición de sobrepago de `evaluarAbono` a `false` | `facturacion_escritura.test.ts` — 1 fallo, con el mensaje exacto |
| 8c | `enLotes` → `Promise.all` sin techo | `lotes.test.ts:13` — 1 fallo (la dirección que **sí** vigila) |

---

## Lo que revisé y está bien

- **CI corre en cada push de cada rama.** `.github/workflows/ci.yml:24-26`
  (`branches: ['**']`) con `concurrency` que cancela lo viejo. Cinco pasos:
  typecheck, lint, `test:coverage`, las pruebas de tiempo sin instrumentar, y
  build. La razón del cambio está escrita: las ramas `claude/*` no corrían nada.
- **La red que impide que una prueba se pierda bajo `--coverage`.**
  `src/lib/likida/pruebas_en_ci.test.ts` — cinco `it` que verifican que cada
  archivo con `skipIf(LIKIDA_COBERTURA)` esté cubierto por el paso
  `npx vitest run fundamento duplicados` (`:59`), que `vitest.config.ts` exporte
  **la misma** bandera que los `skipIf` leen (`:78`, el bug PR-A2 del rename del
  12-ago), y que el paso de umbral siga existiendo (`:90`). Se autoprotege con
  `expect(saltadas.length).toBeGreaterThan(0)` (`:53`) para no pasar por vacía.
- **`supabase/verificaciones.sql` está al día**, contra lo que su encabezado
  sugiere. La cabecera dice "última corrida 31-jul-2026", pero el cuerpo tiene
  corridas reales contra el proyecto fechadas **14-ago-2026** en al menos ocho
  bloques (`:3143`, `:3157`, `:3194`, `:3252`, `:3332`, `:3407`, `:3501`,
  `:3566`, `:3635`, `:3676`, `:3701`, `:3740`). 4,319 líneas.
- **`src/lib/likida/migraciones_verificadas.test.ts`** obliga a que cada una de
  las 108 migraciones tome una decisión explícita: bloque en `verificaciones.sql`
  o exención **con razón escrita**. Lee los TÍTULOS de bloque, no el archivo
  entero (`:39`), justamente para no dar falsos verdes cuando un bloque
  *menciona* otra migración en su prosa.
- **El arnés de `/v1` de escritura es de los mejores del repo.**
  `src/app/api/v1/_escritura.test.ts` (802 líneas): el tenant sale de la
  credencial y no del cuerpo (`:204-246`), escribir exige área `administracion`
  y una llave de tablero no puede (`:263`), la idempotencia en tres capas
  incluyendo el caso del timeout cruzando instancias (`:332`) y el recuerdo
  durable purgado (`:357`), el 409 del hallazgo A8 (`:432`), la carrera de dos
  peticiones simultáneas (`:505`), y un bloque entero de "NUNCA inventar una
  cifra" que distingue ausente de cero teclado (`:641-682`).
- **`openapi/route.test.ts:104`** cruza el spec contra las rutas reales: cada
  método HTTP exportado tiene que estar documentado. Es la clase de red que
  impide que el contrato público se quede atrás del código.
- **El motor de dinero aguanta mutación.** `cuadre/` + `fiscal.test.ts`: 430
  pruebas, y el CRÍTICO de auditoría 8 (el ticket sin timbrar diluyendo la
  deducción de una comida amparada) tiene su ancla exacta con el valor del bug
  en el comentario (`cuadre/engine.test.ts:1272-1275`).
- **`libro_viaje.ts`** — la regla "null no es cero" está anclada con cinco
  pruebas; es la única de las cuatro reglas duras de CLAUDE.md que resistió mi
  mutación de forma contundente.
- **Correo y observabilidad llegaron CON arnés.** `src/lib/correo/` 7 fuentes /
  5 pruebas, `src/lib/observability/` 3 fuentes / 5 pruebas, y el tope de
  adjuntos del webhook de entrada se puso rojo al primer intento.
- **Agentes:** `src/lib/likida/agentes/` tiene 9 archivos de prueba para 5
  fuentes. `cobranza_pura.ts` aparece sin arnés en un inventario ingenuo, pero
  `cobranza.ts` lo re-exporta y sus tests lo ejercen — no es hallazgo.
- **Carta Porte** (superficie nueva de master): `carta_porte.ts` y
  `carta_porte_datos.ts` tienen sus dos archivos de prueba. Los `.tsx` de
  `dashboard/carta-porte/` no, pero eso es la categoría excluida a propósito.
- **`erp.ts`/`gps.ts`/`peaje.ts` (1,363 líneas)** parecen sin arnés y no lo
  están: son catálogos de datos que `conectores/registro.ts` concatena, y
  `registro.test.ts` (533 líneas) los ejerce. No es hallazgo.
- **`pruebas-manuales/`** — 20 arneses `*.prueba.ts` fuera del `include` de
  vitest, más su propio `vitest.config.ts`. No los corrí. La separación está bien
  hecha: `ci.yml:1-5` documenta que la suite de CI es offline y sin secretos por
  eso mismo.

---

## Lo que NO alcancé a revisar

- **`processor.ts` (2,476 líneas)** al 50.5% junto con `repo.ts`: hay 19
  archivos `processor_*.test.ts`, pero no medí *cuáles* de sus ramas quedan
  fuera. Es el corazón del producto y merece una pasada de mutación dirigida
  propia.
- **`intake/desglose_peaje.ts` (640 sentencias, 46.2%)** y
  **`clientes.ts` (474, 40.7%)** — dos módulos grandes a medio cubrir que no
  muté por tiempo. `desglose_peaje` es además uno de los tres consumidores de
  `enLotes`.
- **`facturacion/adaptadores/pagina_playwright.test.ts`** — el único archivo con
  assertions de reloj de pared largas (`:433`, `:554-558`, `:764`, `:813`, con
  logs de 7,079 ms). No verifiqué si son intermitentes bajo carga; es el
  candidato número uno a flakear en un runner de GitHub.
- **`src/app/**/*.tsx`** — la categoría excluida de la medición. `.test.tsx`
  existen (`avance-cierre`, `tablero-operacion`) y siguen corriendo, pero no
  auditté cuántas vistas quedan sin ninguna.
- **No corrí `verificaciones.sql`** contra la base (no hay credenciales en este
  entorno). Verifiqué su frescura por fechas de corrida escritas en el archivo,
  no ejecutándolo.
- **No corrí `npm run build`** (el MAPA lo prohíbe en la nube), así que no
  verifiqué el quinto paso del CI.
