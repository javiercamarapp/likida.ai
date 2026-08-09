# Pruebas — auditoría 17 (pase 2)

**Nota: 5/10** (antes 6). Razón del movimiento: **mirada más profunda** ·
**deuda que cobró factura**. La suite creció bien (3,148 → 3,168; cobertura
67.64 → 68.41 en líneas, 79.86 → 81.5 en funciones) y dos CRÍTICOS de otros
rubros entraron con ancla real que sí mata a su mutante. Pero el archivo de
prueba estrella del código nuevo —el que el propio repo cita por escrito para
**eximir** una verificación de base— no prueba lo que dice probar; el CRÍTICO
C6 del pase 1 sigue exactamente igual; el cron nuevo que manda WhatsApp entró a
0%; y apareció la primera prueba intermitente del repo.

> **El riesgo mayor del rubro, hoy:** el repo ya no solo tiene zonas de dinero
> sin arnés — ahora tiene **arnés que aparenta**. `recordatorio_comprobacion.ts`
> mide **98.8% de cobertura** y su prueba se titula "DOS CORRIDAS SOLAPADAS",
> pero se le puede borrar la cláusula que hace atómico el claim y las 15 pruebas
> siguen verdes. Con esa prueba como argumento, `migraciones_verificadas.test.ts`
> declaró exenta a la migración 0087 de tener bloque en `verificaciones.sql`. Una
> cobertura alta y un título convincente compraron una exención real.

---

## Compuerta, verificada por mí hoy

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 255 archivos · 3,168 verdes · 1 saltada  (57 s)
npm run lint            → 0 errores · 18 warnings
npx vitest run --coverage
   Statements 68.41% (12827/18748) · Branches 84.57% · Functions 81.5% · Lines 68.41%
   umbrales: 67 / 84 / 79 → PASA (el margen más chico ya es RAMAS: 0.57 pt)
```

Cobertura por archivo de las superficies que audité (v8, `s` = statements):

```
  0.0%   37  src/app/api/cron/escalar/route.ts          ← NUEVA (+40 líneas)
  0.0%   41  src/app/dashboard/top-rutas.tsx            ← NUEVA
  0.0%   42  src/app/api/export/liquidaciones/route.ts
  0.0%   42  src/app/dashboard/kpi-periodo.tsx          ← NUEVA
  0.0%   43  src/app/dashboard/motor-fiscal-periodo.tsx ← NUEVA
  0.0%   47  src/app/api/cron/facturar/cola/route.ts    ← C6, sin mover
  0.0%   63  src/app/dashboard/gasto-semanal-chart.tsx  ← NUEVA
  0.0%   64  src/app/dashboard/contador/cfdi/export/route.ts
  0.0%   84  src/app/dashboard/panel-periodo.tsx        ← NUEVA
  0.0%  106  src/app/api/export/pdf/[id]/route.ts
  0.0%  200  src/lib/likida/comercial.ts
 28.8%  146  src/lib/likida/facturacion/agente.ts
 53.1%   32  src/app/dashboard/actividad.tsx
 62.1%  116  src/app/api/stripe/webhook/route.ts
 77.0%  460  src/lib/likida/fiscal.ts
 90.1%  800  src/lib/likida/analytics.ts
 98.8%   86  src/lib/likida/recordatorio_comprobacion.ts
```

---

## Estado de los hallazgos del pase 1

| Hallazgo del pase 1 | Estado hoy | Evidencia |
|---|---|---|
| **CRÍTICO** — callback de QStash emite CFDI sin una sola prueba | **REINCIDENTE** | `git diff 94c0733..HEAD -- src/app/api/cron/facturar/cola` está **vacío**. Mutante 5 (abajo) re-corrido hoy: 3,168 verdes con la firma desactivada |
| **ALTO** — la ronda 16 subió el trinquete borrando anclas de dinero (`chofer.test.ts`, `agente.test.ts`) | **MITAD CERRADO / MITAD REINCIDENTE** | `src/lib/likida/chofer.ts` **ya no existe** (`31babfd` retira el rol operador): esa parte queda sin objeto, no arreglada — el código se fue con la prueba. `facturacion/agente.test.ts` sigue en 2 pruebas y `agente.ts` en **28.8%**, byte-idéntico al pase 1 |
| **ALTO** — las tres descargas de dinero a 0% (IDOR reabrible) | **REINCIDENTE** | `ls` de los tres directorios: solo `route.ts`, cero `*.test.ts`. `git diff` vacío. Mutante 8 re-corrido hoy: verde |
| **ALTO** — rollback del candado de Stripe sin aseverar | **REINCIDENTE** | `route.test.ts:96` sigue diciendo `// desmarcar se verifica indirectamente: el evento no queda clavado.` y el único `expect` de esa prueba sigue siendo `expect(r.status).toBe(500)`. `git diff` de `src/app/api/stripe` vacío |
| **MEDIO** — `comercial.ts` 0% y `getGastoPorRuta` sin prueba | **REINCIDENTE** | `comercial.ts` 0.0% / 200 stmts, sin `comercial.test.ts`. `git diff` vacío |
| **MEDIO** — `verificaciones.sql` no lo corre nadie | **REINCIDENTE Y AGRAVADO** | `ci.yml` no cambió: sigue con `npm ci`, typecheck, lint, `test:coverage`, `vitest run fundamento duplicados`, `build`. Ningún `.sh`/`.yml` menciona el archivo. Y en este pase el mecanismo de exención se usó para **saltarse** un bloque nuevo (ver ALTO-1) |
| **BAJO** — la prueba saltada (`arnes_ticket_real.test.ts:365`) | **SIN CAMBIO, y sigue siendo correcto** | Sigue siendo `1 skipped` de 3,169; el salto es por ausencia de `TICKET_PATH`, no un `it.skip` a mano |
| **BAJO** — warnings de `no-unused-vars` | **SIN CAMBIO** | 18 warnings, los mismos seis en pruebas |

### Lo que sí mejoró y lo verifiqué

- **`src/lib/likida/startup_mutex_ajeno.test.ts` (NUEVO, +89)** ancla de verdad
  el CRÍTICO de operabilidad. Mutante de control: `startup.ts:83`
  `if (tomado === true)` → `if (tomado !== 'imposible')`. **MURIÓ** —
  `1 failed | 2 passed`, `expect(desbloqueos()).toHaveLength(0)` en `:62`.
- **`cierre_pdf_del_jefe.test.ts` (NUEVO, +146)** fija QUÉ ejemplar de PDF
  recibe cada quién y explica en el encabezado por qué el `expect` fallaría sin
  el arreglo. Es la forma correcta.
- **`proxy.test.ts` (−121/+…)**: borró las 6 pruebas de `/chofer` (código
  muerto) y **agregó dos nuevas** de CSP (`unsafe-eval` solo en desarrollo).
  Saldo positivo, no una poda para subir el número.
- **`visibilidad.test.ts` NO perdió su garantía.** Reescribió el caso del
  chofer en vez de borrarlo: `inicioDe('operador')` ahora se afirma `/sin-acceso`
  y sigue exigiendo `areasDe('operador') === []`, `puedeVerArea('operador',
  'dinero') === false`. `guard.test.ts −87` es la eliminación legítima de
  `requireOperador`, que ya no existe.
- **El bloque 62 de `verificaciones.sql` reemplaza bien a 54/55/56.** Leí el
  bloque: intenta el `INSERT` de un `app_user` con rol `operador` y espera el
  `check_violation`, y de paso re-verifica el aislamiento por tenant de
  `flota_admin` en los dos patrones de policy (`viaje` simple y `ticket_mensaje`
  por join). Es una garantía **más fuerte** que las tres que borró. Las
  exenciones de 0078/0079/0081 en `migraciones_verificadas.test.ts:80-82` están
  bien razonadas.

---

## Experimentos de mutación

Nueve mutaciones + un experimento de entorno. Cada una revertida con
`git checkout -- <archivo>` inmediatamente después; `git status` verificado
entre una y otra. Dos son **controles** (esperaba que murieran).

| # | Archivo:línea | Mutante exacto | ¿Murió? | Salida real |
|---|---|---|---|---|
| 1 | `src/lib/likida/recordatorio_comprobacion.ts:163` | borrar `.is('recordatorio_comprobacion_en', null)` del UPDATE del claim | ❌ **SOBREVIVIÓ** | `✓ recordatorio_comprobacion.test.ts (15 tests) 15ms` · `Tests 15 passed (15)`; con `api/cron` incluido: `Tests 35 passed (35)` |
| 2 | `src/lib/likida/recordatorio_comprobacion.ts:122` | `if (!claim.ganado)` → `if (false)` | ✅ CAZADA *(control)* | `FAIL … > DOS CORRIDAS SOLAPADAS` · `AssertionError: expected 1 to be +0` en `:183` |
| 3 | `src/lib/likida/analytics.ts:988` | quitar `.eq('tenant_id', tenantId)` a la consulta de `viaje` en `getTopRutasPorGasto` | ❌ SOBREVIVIÓ | `255 passed · 3168 passed \| 1 skipped` — **pero lo descarto como mutante equivalente**: los gastos siguen filtrados y el `if (!v) continue` del join anula el efecto. Lo dejo escrito para que nadie lo repita |
| 4 | `src/lib/likida/analytics.ts:108` | quitar `.eq('tenant_id', tenantId)` a la consulta de `gasto` en `getSerieComparativa` | ❌ **SOBREVIVIÓ** | `Test Files 255 passed (255)` · `Tests 3168 passed \| 1 skipped (3169)` |
| 5 | `src/app/api/cron/facturar/cola/route.ts:40` | `if (!valido) {` → `if (false && !valido) {` | ❌ **SOBREVIVIÓ** | `Test Files 255 passed (255)` · `Tests 3168 passed \| 1 skipped (3169)` |
| 6 | `src/app/dashboard/kpi-periodo.tsx:67` | `valor={valorActual ?? 0}` → `valor={valorActual ?? 999999}` | ❌ **SOBREVIVIÓ** | `Test Files 255 passed (255)` · `Tests 3168 passed \| 1 skipped (3169)` |
| 7 | `src/app/api/cron/escalar/route.ts:51,58` | `if (!secreto) {` → `if (false) {` **y** `if (req.headers.get('authorization') !== \`Bearer ${secreto}\`) {` → `if (false) {` | ❌ **SOBREVIVIÓ** | `Test Files 255 passed (255)` · `Tests 3168 passed \| 1 skipped (3169)` |
| 8 | `src/app/api/export/liquidaciones/route.ts:47,52` | ambas puertas de rol → `if (false) {` | ❌ **SOBREVIVIÓ** | `Test Files 255 passed (255)` · `Tests 3168 passed \| 1 skipped (3169)` |
| 9 | `src/lib/likida/startup.ts:83` | `if (tomado === true)` → `if (tomado !== 'imposible')` | ✅ CAZADA *(control)* | `Test Files 1 failed (1)` · `Tests 1 failed \| 2 passed (3)` en `:62` |
| E | *(entorno, no mutación)* `TZ=Asia/Tokyo` y `TZ=Etc/GMT+12` sobre el árbol **limpio** | — | 🔴 **ROJO SIN TOCAR CÓDIGO** | `FAIL src/app/dashboard/actividad.test.ts` ×4 · `Test Files 1 failed \| 254 passed (255)` · `Tests 4 failed \| 3164 passed` |

**Lectura:** 6 de 8 mutaciones no equivalentes sobrevivieron, y **cinco de las
seis son código de este pase o zona que el pase 1 ya había marcado**. Los dos
controles murieron en la primera corrida y con el mensaje exacto, así que el
método distingue. Lo que no distingue es la suite.

---

## Hallazgos

### [CRÍTICO] REINCIDENTE — el callback de QStash sigue emitiendo CFDI sin una sola prueba; la firma se puede apagar y la suite ni se entera

`src/app/api/cron/facturar/cola/route.ts:40` (0.0%, 47 statements)

**Escenario (mutante 5, corrido hoy):** cambié `if (!valido) {` por
`if (false && !valido) {` — la firma de QStash se calcula y se tira. Suite
completa:

```
 Test Files  255 passed (255)
      Tests  3168 passed | 1 skipped (3169)
```

Cero fallos, con veinte pruebas más en el repo que en el pase 1. Este endpoint
es **público por diseño** (no lleva `CRON_SECRET`: su única puerta es la firma)
y del otro lado llama `procesarLoteEnCola(...)`, que con `FACTURACION_MODO=emitir`
teclea datos fiscales en el portal del proveedor y **emite CFDI**. Con la firma
bypasseada, cualquiera que sepa la URL hace `POST` con
`{"lote":[{"id":"<uuid de gasto>", …}]}` y dispara la emisión.

Verifiqué que el archivo no se tocó en los 12 commits del pase 2:
`git diff 94c0733..HEAD --stat -- src/app/api/cron` reporta **solo**
`escalar/route.ts`. El directorio `cola/` sigue teniendo un único archivo.

**Consecuencia:** un CFDI no se deshace. Cancelarlo fuera de plazo se le queda al
cliente en su contabilidad. Y la ruta que lo encola
(`facturar/route.ts`, la rama `if (process.env.UPSTASH_QSTASH_TOKEN && …)`)
tampoco tiene prueba: los 20 casos de `route.test.ts` cubren el camino síncrono
y **ninguno pone `UPSTASH_QSTASH_TOKEN`**.

**Causa raíz probable:** un pase entero pasó sobre un hallazgo CRÍTICO
documentado sin que nadie lo tomara. Esto ya no es un descuido de escritura: es
una decisión implícita de no atenderlo.

---

### [ALTO] La prueba estrella del código nuevo no prueba la carrera que dice probar — y con ese argumento se EXIMIÓ la verificación SQL de la 0087

`src/lib/likida/recordatorio_comprobacion.ts:163` (98.8% de cobertura)
`src/lib/likida/recordatorio_comprobacion.test.ts:41-56` (el mock) y `:171-186` (la prueba)
`src/lib/likida/migraciones_verificadas.test.ts:53` (la exención)

Este es el patrón exacto que mi rubro existe para cazar, y esta vez tuvo
consecuencia administrativa.

**Escenario (mutante 1, corrido):** borré una línea de `reclamarRecordatorio`:

```ts
  const { data, error } = await admin
    .from('viaje')
    .update({ recordatorio_comprobacion_en: ahora })
    .eq('id', v.id)
    .eq('tenant_id', v.tenantId)
-   .is('recordatorio_comprobacion_en', null)
    .select('id');
```

Esa línea **es** la atomicidad del claim: sin ella el UPDATE deja de ser
condicional y dos corridas solapadas ganan las dos. Corrí el archivo que dice
protegerlo:

```
 ✓ src/lib/likida/recordatorio_comprobacion.test.ts (15 tests) 15ms
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

Y con las pruebas de cron incluidas: `Tests 35 passed (35)`.

**Por qué no lo ve.** El mock del UPDATE (`:44-55`) construye un nodo donde
`nodo.is = () => nodo;` — **descarta el filtro sin registrarlo**. Lo que
decide si la corrida "gana" no es la consulta: es el arreglo `resultadosUpdate`,
que **cada prueba fija a mano**. La de "DOS CORRIDAS SOLAPADAS" (`:171-186`)
literalmente escribe `resultadosUpdate = [{ data: [], error: null }]` con el
comentario `// la corrida 1 ya puso el sello`. El mock devuelve exactamente lo
que la prueba quiere oír. (El lado de la LECTURA sí está bien anclado: ahí el
mock **sí** registra `is` en `filtros` y la prueba de `:93` lo afirma. El hueco
es solo el claim.)

**Refutación que intenté y falló:** ¿lo cubre otro archivo? `grep -rln
"recordatorio_comprobacion\|enviarRecordatorios"` sobre `src/` devuelve el
módulo, su prueba, `api/cron/escalar/route.ts` (0% de cobertura) y
`migraciones_verificadas.test.ts`. No hay otro.

**Contra-mutante de control (mutante 2):** `if (!claim.ganado)` → `if (false)`
**sí** revienta la prueba de las corridas solapadas. O sea: la prueba fija el
*manejo* del resultado del claim, no la *condición* que produce el resultado.
Distinguirlas es todo el punto.

**Lo que agrava esto** está en `migraciones_verificadas.test.ts:53`. La 0087 se
declaró **exenta** de tener bloque en `verificaciones.sql` con esta razón,
citada textual:

> *«La carrera entre corridas solapadas SÍ se prueba, exhaustivamente, en TS
> (recordatorio_comprobacion.test.ts: "DOS CORRIDAS SOLAPADAS", "si el claim no
> se pudo escribir", 15 pruebas) contra un mock que modela la fila
> ganada/perdida — lo único que un bloque SQL probaría de más es que Postgres
> cumple su propio contrato de atomicidad.»*

El argumento se cae en su propio término: Postgres cumple su contrato **si le
mandas el `WHERE`**. Lo que ningún bloque SQL ni ninguna prueba TS comprueba hoy
es que el `WHERE` esté ahí. Se cambió una verificación de base por una prueba
que no prueba eso.

**Consecuencia para alguien real:** con el `.is` fuera, dos corridas de Vercel
Cron solapadas (el módulo entero existe porque el cron entrega *at-least-once* —
lo dice su encabezado, `:15-21`) mandan **dos WhatsApps idénticos** al mismo
chofer, cada uno con costo de plantilla iniciada por negocio y contra la
calificación de calidad del número de Meta. Y es justo lo que el archivo declara
querer evitar: *«un canal que insiste todos los días se aprende a ignorar»*
(`:23-29`).

**Causa raíz probable:** el mock se escribió para reproducir el *escenario*
(gané / perdí) en vez de la *causa* (la consulta condicional). Es más fácil de
escribir y se lee igual de bien en el reporte de cobertura — 98.8%.

---

### [ALTO] El cron nuevo que manda WhatsApp entró a 0%: se le pueden quitar las DOS puertas y la suite sigue verde

`src/app/api/cron/escalar/route.ts:51` y `:58` (0.0%, 37 statements; **+40 líneas en este pase**)

**Escenario (mutante 7, corrido):**

```ts
-  if (!secreto) {                                              // línea 51
+  if (false) {
     logger.error('cron.escalar.sin_secreto', {});
     return NextResponse.json({ error: 'CRON_SECRET no está configurado…' }, { status: 500 });
   }
-  if (req.headers.get('authorization') !== `Bearer ${secreto}`) {   // línea 58
+  if (false) {
     return new NextResponse(null, { status: 401 });
   }
```

```
 Test Files  255 passed (255)
      Tests  3168 passed | 1 skipped (3169)
```

El propio archivo escribe, en `:33-41`, por qué esas dos líneas existen:
*«Esta ruta MANDA MENSAJES DE WHATSAPP, que cuestan dinero y llegan a personas
reales»* y *«el secreto es lo único entre eso y un teléfono sonando de
madrugada»*. Las dos afirmaciones son ciertas y ninguna está probada.

**Consecuencia:** con el gate caído, un `GET https://app.likida.ai/api/cron/escalar`
desde cualquier navegador dispara, para **TODAS las flotas a la vez**: (a) la
escalación al jefe de flota de cada viaje sin aceptar, y (b) el recordatorio de
comprobación a cada chofer con viaje vencido. Peor que el spam: el recordatorio
**quema el sello de una sola vez por viaje** (`recordatorio_comprobacion_en`), así
que el chofer que sí debía recibirlo en su momento ya no lo recibe nunca. Es un
daño que no se revierte reiniciando nada.

**Causa raíz probable:** `c5a7c19` agregó el segundo chequeo dentro de la misma
ruta (decisión razonable) y le puso prueba al **módulo** nuevo, no a la **ruta**.
El repo tiene el mismo patrón en `facturar/route.test.ts` (la ruta sí probada) —
así que no es que no se sepa hacer.

---

### [ALTO] Las consultas nuevas del Resumen pierden su filtro de tenant sin que nada falle, con `analytics.ts` al 90.1%

`src/lib/likida/analytics.ts:108` (`getSerieComparativa`)
`src/lib/likida/analytics_serie_comparativa.test.ts:20-32` · `analytics_rutas.test.ts:14-24` ·
`analytics_semanal.test.ts:20-32` · `analytics_periodo_series.test.ts:17-31` ·
`fiscal_series.test.ts:15-27`

**Escenario (mutante 4, corrido):**

```ts
     traerTodo<{ fecha: unknown; monto: unknown }>(
       (desde, hasta) => admin.from('gasto').select('fecha, monto')
-        .eq('tenant_id', tenantId).gte('fecha', desdeGlobal).lte('fecha', hoy)
+        .gte('fecha', desdeGlobal).lte('fecha', hoy)
         .order('id').range(desde, hasta),
```

```
 Test Files  255 passed (255)
      Tests  3168 passed | 1 skipped (3169)
```

`getSerieComparativa` alimenta `getSeriesKpiCards` → las tarjetas "Gasto total"
y "Costo por viaje" del Resumen del dueño. Con esa línea fuera, el diésel y las
casetas de **todas las flotas del sistema** se suman en la tarjeta que el
contralor de Transportes Innovativos ve en su pantalla. No hay join que lo
salve: `gastoTotal` es un `reduce` directo sobre las filas.

**Por qué ninguna prueba lo ve:** los **cinco** archivos de prueba de este pase
usan el mismo mock, y en los cinco la línea es `eq: () => b` — el filtro se
traga sin registrarse. Los archivos viejos sí lo hacían bien:
`analytics_datos.test.ts:116-121` y `:144-151` registran los filtros y afirman
`expect(c.filtros).toContainEqual(['tenant_id', 't-1'])` para `getKpis` y para
las tres tablas de `getStatsPorOperador`. Esa disciplina **no se copió** al
mock nuevo, aunque el mock nuevo sí aprendió a registrar `gte`/`lte` (que es lo
que sus autores fueron a probar).

**Refutación que intenté:** ¿hay una prueba estructural que barra `analytics.ts`
exigiendo el filtro? `grep -rln "eq('tenant_id'" --include=*.test.ts` devuelve
solo `analytics_datos.test.ts` y `costos.test.ts`, ambas por función y ninguna
sobre las nuevas.

**Consecuencia:** el aislamiento entre flotas es lo único que un contralor no
puede verificar por sí mismo, y es lo que compra. Con 90.1% de cobertura en el
archivo, el número no avisa.

---

### [ALTO] REINCIDENTE — las tres descargas de dinero siguen a 0%: el IDOR que el comentario da por cerrado se reabre sin que nada falle

`src/app/api/export/liquidaciones/route.ts:47,52` — 0.0%, 42 stmts
`src/app/api/export/pdf/[id]/route.ts` — 0.0%, 106 stmts
`src/app/dashboard/contador/cfdi/export/route.ts` — 0.0%, 64 stmts

**Escenario (mutante 8, re-corrido hoy):** las dos puertas de rol del CSV a
`if (false)`:

```ts
-  if (!puedeVerArea(t.rol, 'dinero')) {
+  if (false) {
     return new NextResponse('Tu rol no ve las cifras de dinero de la flota.', { status: 403 });
   }
-  if (!puedeExportar(t.rol)) {
+  if (false) {
     return new NextResponse('Tu rol no puede descargar este documento.', { status: 403 });
   }
```

```
 Test Files  255 passed (255)
      Tests  3168 passed | 1 skipped (3169)
```

`git diff 94c0733..HEAD -- src/app/api/export` está vacío y los tres
directorios siguen sin `*.test.ts`. Con la 0086 el rol `operador` ya no existe,
así que el atacante de este escenario es el **encargado**: la matriz de la 0044
le da solo el área `operacion` y la base lo excluye de `ve_finanzas()`; con el
`if` caído baja el CSV con folio, operador, anticipo, comprobado y diferencia de
cada viaje de la flota.

`dinero_por_area.test.ts` sigue sin cubrirlo: su barrido es `readdirSync` sobre
`src/app/dashboard/*/page.tsx` + `vista.tsx`, y **no mira `src/app/api/`**.

---

### [ALTO] REINCIDENTE — el rollback del candado de idempotencia de Stripe sigue sin aseverar, y el comentario que lo tapa sigue ahí

`src/app/api/stripe/webhook/route.ts:74` · `route.test.ts:17` y `:96`

`git diff 94c0733..HEAD -- src/app/api/stripe` está vacío. La línea 96 sigue
diciendo, palabra por palabra:

```ts
    expect(r.status).toBe(500);
    // desmarcar se verifica indirectamente: el evento no queda clavado.
```

No se verifica de ninguna manera: el `500` lo devuelve el `catch` tenga o no
tenga rollback, y el espía de `:17` sigue declarado sin conectarse a ningún
mock (es uno de los 18 warnings de lint). Mantengo el escenario del pase 1 —
`aplicar(evt)` truena, 500, Stripe reintenta, `marcarEvento` ve el 23505 y
responde `repetido: true` con 200, y el plan **nunca se activa**. Cobertura del
archivo: 62.1%.

---

### [MEDIO] `actividad.test.ts` depende del reloj de pared Y de la zona horaria — la primera prueba intermitente que encuentro en este repo

`src/app/dashboard/actividad.test.ts:13-18` (los helpers) · `src/app/dashboard/actividad.tsx:20-25` (el código)

**Escenario (experimento E, corrido sobre el árbol LIMPIO — sin mutación):**

```
$ date -u
Sun Aug  9 11:20:59 UTC 2026

$ TZ=Asia/Tokyo npx vitest run          # y también TZ=Etc/GMT+12
 FAIL  src/app/dashboard/actividad.test.ts > bucketsPorDia > devuelve exactamente `dias` buckets, terminando en hoy
 FAIL  src/app/dashboard/actividad.test.ts > bucketsPorDia > cuenta un viaje de hoy en el último bucket
 FAIL  src/app/dashboard/actividad.test.ts > bucketsPorDia > fechaInicio null se ignora, no revienta
 FAIL  src/app/dashboard/actividad.test.ts > bucketsPorDia > ventana de 30 días también cierra en hoy
 Test Files  1 failed | 254 passed (255)
      Tests  4 failed | 3164 passed | 1 skipped (3169)
AssertionError: expected '2026-08-08' to be '2026-08-09'
```

Con `TZ=UTC` y `TZ=America/Mexico_City` a esta hora pasa. Barrí el resto de la
suite bajo las dos zonas rotas: **solo este archivo** falla; los otros tres
archivos que usan `new Date()` (`arnes_ticket_real`, `processor_cadena`,
`utils_fecha`) aguantan.

La causa es que las dos mitades miden el "hoy" con relojes distintos: el helper
de la prueba usa `new Date().toISOString().slice(0,10)` (día **UTC**) y
`bucketsPorDia` usa `hoy.setHours(0,0,0,0)` (medianoche **local**) y de ahí
`.toISOString()`. Coinciden solo cuando el día local y el día UTC son el mismo.

**Consecuencia concreta y cotidiana:** para un desarrollador en México
(UTC−6) los dos días dejan de coincidir **todas las tardes a partir de las
18:00 hora local** — a las 19:00 del 9-ago, `hoyIso()` da `2026-08-10` y
`bucketsPorDia` da `2026-08-09`. `Etc/GMT+12` reproduce exactamente ese
desfase y es lo que corrí. Javier trabaja en México: la suite se le pone en
rojo cada noche por una razón que no tiene nada que ver con lo que acaba de
tocar, y esa es la manera más rápida de que la gente deje de creerle a la
suite. En CI (UTC) nunca se va a ver.

De paso: el encabezado del archivo (`:4-11`) declara que lo que se comprueba
es *«cuenta por STRING, no por `Date`»*. El código sí convierte a `Date` y de
vuelta — es justo de dónde sale la fragilidad. El rótulo de la prueba tampoco
es verdad.

**Causa raíz probable:** el archivo se escribió sin inyectar `hoy`, cuando el
resto del repo ya tiene la disciplina hecha —`getSerieComparativa(…, hoy)`,
`getGastoPorSemana(…, hoy)`, `viajesSinComprobar(ahora)` reciben la fecha por
parámetro justo para esto—.

---

### [MEDIO] Las cinco pantallas nuevas del Resumen están a 0%, y `kpi-periodo.tsx` convierte en `0` el `null` que analytics protege con prueba

`src/app/dashboard/kpi-periodo.tsx:67` (0.0%) · `panel-periodo.tsx` (0.0%) ·
`top-rutas.tsx` (0.0%) · `motor-fiscal-periodo.tsx` (0.0%) · `gasto-semanal-chart.tsx` (0.0%)
Contra `src/lib/likida/analytics_serie_comparativa.test.ts:73-81`

**Escenario (mutante 6, corrido):** `valor={valorActual ?? 0}` →
`valor={valorActual ?? 999999}`.

```
 Test Files  255 passed (255)
      Tests  3168 passed | 1 skipped (3169)
```

La tarjeta de KPI del Resumen puede imprimir **$999,999.00** y la suite no se
mueve. Los cinco componentes nuevos no aparecen en ningún `*.test.ts` salvo
como **texto fuente** que `estado.test.ts:143-186` lee con expresiones
regulares para verificar los rótulos (eso sí es real y sí cazaría un rótulo
mentiroso; lo que no ve es ningún valor).

Y hay una costura concreta ya abierta: `analytics.ts:146` devuelve
`costoPorViaje: n === 0 ? null : …` y su prueba se titula, textual, *«costoPorViaje
es null sin viajes en el periodo, no Infinity ni 0»*. Dos archivos después,
`kpi-periodo.tsx:67` hace `valorActual ?? 0`, y `page.tsx:266-271` renderiza esa
tarjeta también en el estado `vacio` (los estados `vacio` y `datos` comparten
layout, `page.tsx:228`). Una flota con gasto capturado y cero viajes iniciados
en los últimos 7 días lee **"Costo por viaje — últimos 7 días: $0.00"**, que es
exactamente la cifra inventada que la prueba de abajo se tomó el trabajo de
prohibir. La prueba ancla media garantía y nadie ancla la otra media.

---

### [MEDIO] Un ancla estructural que barría TODO `src/` se fue al bote junto con la página donde vivía

`src/app/mis-viajes/page.test.ts` (borrado, −116) — vivía en `94c0733`

`mis-viajes/page.test.ts` no era solo la prueba de esa página. Su primer
`describe` (`:47-67`) hacía un `find` sobre **todos** los `.ts`/`.tsx` del
repo, extraía cada `.select(...)` y fallaba si alguno embebía `liquidacion(`
sin nombrar el FK — la regresión del **PGRST201** que la 0028 introdujo al
poner una segunda llave foránea entre `liquidacion` y `viaje`, y que ya se
había pagado **dos veces** (`/mis-viajes` y `lib/likida/chofer.ts`). El
comentario lo dice: *«Se busca en todo `src/` y no solo en esta página porque
el error no es de esta página»*.

Al retirar el rol operador se borró el archivo completo. Verifiqué el estado
actual: `grep -rln "PGRST201\|liquidacion_viaje_id_fkey" src/` devuelve
**vacío** y hoy ningún `select` embebe `liquidacion(`, así que **no hay
violación viva** — por eso es MEDIO y no ALTO. Lo que se perdió es el
despertador: `liquidacion` y `viaje` siguen teniendo dos FK, y el próximo
agente que escriba `.select('*, liquidacion(total_comprobado)')` en cualquier
pantalla del panel se va a llevar una pantalla de error contra la base real,
con tsc, lint, 3,168 verdes y build limpio.

**Causa raíz probable:** la garantía era del repo pero el archivo se llamaba
como una página. Cuando la página murió, nadie preguntó qué más vivía adentro.

---

### [MEDIO] REINCIDENTE — `verificaciones.sql` sigue sin corredor, y ahora el mecanismo de exención sirve para saltarse bloques

`supabase/verificaciones.sql` · `.github/workflows/ci.yml` · `src/lib/likida/migraciones_verificadas.test.ts:53`

`ci.yml` no cambió: seis pasos (`npm ci`, typecheck, lint, `test:coverage`,
`npx vitest run fundamento duplicados`, `build`) y ninguno ejecuta SQL.
`grep -rn "verificaciones.sql"` sobre `*.yml`, `*.sh`, `*.json` y `*.ts` fuera
de `node_modules` devuelve **solo** prosa y el propio test. `scripts/` sigue con
`seed.sh`, `respaldo.sh`, `deploy-vercel.sh` y `cosecha`.

Lo nuevo es el agravante: la 0087 se declaró exenta con un argumento que este
reporte demuestra falso (ver ALTO-1), y la única penalización por eximir es
escribir una razón de más de 20 caracteres —lo que `migraciones_verificadas.test.ts:121-124`
verifica—. La red comprueba que la razón **exista**, no que sea **cierta**. Con
`verificaciones.sql` sin corredor, un bloque escrito y un bloque eximido cuestan
lo mismo: cero.

---

### [MEDIO] REINCIDENTE — `comercial.ts` (200 líneas de aritmética de dinero) sigue a 0% y `agente.ts` a 28.8%

`src/lib/likida/comercial.ts` (0.0%, 200 stmts) · `src/lib/likida/facturacion/agente.ts` (28.8%, 146 stmts)

Ambos byte-idénticos al pase 1 (`git diff 94c0733..HEAD` vacío para los dos).
`comercial.ts` sigue sin `comercial.test.ts` y sigue alimentando
`/dashboard/clientes`, `/rentabilidad`, `/cobranza`, `/cotizador`, `/mapa` y
`/soporte` con `margenPct`, `porCobrar`, `vencido` y la concentración del
cliente más grande. Atenuante intacto: `cliente`, `factura_emitida`,
`pago_recibido` e `ingreso_flete` siguen vacías, así que hoy esas pantallas caen
al estado vacío. `agente.test.ts` sigue en 2 pruebas sobre `pideCaptcha`, para
el módulo que teclea el RFC en el portal del proveedor.

Mantengo la severidad MEDIO del pase 1, no la subo: nada empeoró, simplemente
nada mejoró.

---

### [BAJO] `fiscal_series.test.ts` afirma por índice de llamada, no por contenido

`src/lib/likida/fiscal_series.test.ts:37-39`, `:45-47`, `:53-55`

Las tres pruebas de ventana identifican cuál consulta es cuál por su **posición**
en el arreglo de llamadas (`gasto[0]` = semanal, `gasto[1]` = mensual,
`gasto[2]` = histórico), lo cual sólo es cierto mientras `getGastosFiscales`
consulte exactamente una vez la tabla `gasto` y el `Promise.all` conserve el
orden de construcción. El día que `getGastosFiscales` añada una segunda lectura
de `gasto` —o que alguien reordene el `Promise.all`— las tres pruebas van a
seguir pasando **afirmando sobre la ventana equivocada**, o a fallar por una
razón que no tiene que ver con lo que prueban. El mock también devuelve
`data: []` siempre y `eq: () => b`, así que ni el contenido ni el tenant se
verifican. Es un BAJO porque el archivo declara honestamente su alcance
(`:5-8`), pero la forma de identificar la consulta es frágil.

---

## Lo que revisé y está bien

- **El CI sigue corriendo en cada push de cada rama** (`ci.yml:22-24`,
  `branches: ['**']` + `pull_request`), con `concurrency` y
  `cancel-in-progress`, y sus seis puertas siguen siendo las correctas —
  incluido `npx vitest run fundamento duplicados`, que recupera las dos pruebas
  de tiempo que `--coverage` salta. Ese cierre de la ronda 7 sigue vivo.
- **El trinquete de cobertura sigue midiendo, y subió por trabajo real.**
  68.41 / 84.57 / 81.5 contra 67 / 84 / 79. A diferencia de la ronda 16, esta
  vez el delta viene de +1,305 líneas de prueba nuevas contra −490 (y las 490
  borradas son código que dejó de existir). **Aviso:** el margen más chico ya no
  es líneas (1.41 pt) sino **ramas: 0.57 pt**. Los cinco componentes nuevos del
  Resumen a 0% son ~273 statements que ya están contados en contra.
- **Las dos pruebas de tiempo siguen endurecidas, no relajadas**
  (`fundamento.test.ts:148-168`, `duplicados.test.ts:151-185`): mejor-de-nueve y
  mejor-de-cinco con calentamiento. Bajo las dos zonas horarias rotas ninguna
  parpadeó.
- **`pruebas_en_ci.test.ts` sigue siendo la mejor red estructural del repo** —
  escanea `src/` sobre el código sin comentarios y falla si un `skipIf` cae
  fuera del filtro del paso de tiempo, y exige que exista al menos un salto.
- **El motor de cuadre sigue anclado.** No repetí el mutante del 15% de la RFA
  2.9 (`engine.ts:337`) porque `cuadre/` no se tocó en los 12 commits; el
  resultado del pase 1 (murió en `engine.test.ts:1470` diciendo el número
  exacto) sigue vigente.
- **`analytics_datos.test.ts` es el modelo que los archivos nuevos debieron
  copiar**: registra los filtros de cada consulta y afirma el `tenant_id` por
  tabla con mensaje propio (`:149`).
- **`analytics_serie_comparativa.test.ts:97-112` y `analytics_semanal.test.ts:85-96`
  sí prueban lo difícil**: que `liquidacion.created_at` (timestamptz) bucketea
  por día LOCAL MX y no por el UTC crudo, con el caso exacto
  (`2026-08-01T02:00:00Z` = 31-jul 20:00 CDMX). Es el bug ya pagado en
  `getLiquidacionesPorDia` y está bien atado.
- **`analytics_rutas.test.ts:42-47`** ancla la regla del producto que más importa
  en esa pantalla: una ciudad fuera del catálogo sale con `region: null`, nunca
  una adivinada.
- **`startup_mutex_ajeno.test.ts` y `cierre_pdf_del_jefe.test.ts`** son ejemplos
  de cómo se ancla un arreglo: encabezado que narra el bug con su rubro y
  severidad, y un `expect` que falla exactamente si se revierte. Verifiqué el
  primero con mutante de control.
- **`visibilidad.test.ts` y `proxy.test.ts` sobrevivieron bien al retiro del
  rol operador**: reescribieron la garantía en vez de borrarla, y `proxy` sumó
  dos pruebas nuevas de CSP.
- **El bloque 62 de `verificaciones.sql`** reemplaza a los tres bloques de RLS
  del chofer con una garantía más fuerte (el `INSERT` del rol rebota en el
  CHECK) y de paso re-verifica el aislamiento por tenant de `flota_admin` en los
  dos patrones de policy. Está bien hecho; el problema es que nadie lo corre.

---

## Lo que NO alcancé a revisar

- **`engine.test.ts` (86 KB, ~600 casos).** Sigue sin barrer buscando
  aserciones flojas. Es la mitad del rubro que falta, igual que en el pase 1.
- **`al_vuelo.test.ts` (46 KB).** Sigue pendiente auditar si sus aserciones son
  sobre valor o sobre "se llamó"; sigue mockeando `facturarLoteConAgente`, que
  es donde vive el `completar()` cuyo mutante sobrevivió en el pase 1
  (`agente.ts:325`, `ok: porGasto.some(…)` → `ok: true`). No lo re-corrí este
  pase: el archivo no cambió, así que doy por vigente el resultado anterior.
- **`repo.ts` al 56.7% de 557 líneas.** Sigo sin revisar una por una las ~26
  funciones exportadas fuera de `addGasto`/`saveLiquidacion`.
- **`processor.ts`.** No mapeé qué porcentaje falta ni dónde.
- **Cobertura de RAMAS por archivo.** Miré statements y funciones. El 84.57%
  global de ramas es ahora el umbral con menos margen (0.57 pt) y no sé qué
  archivo de dinero lo está sosteniendo.
- **`pruebas-manuales/` (16 arneses).** Por instrucción, no se corren. No
  verifiqué si alguno quedó desalineado con el retiro del rol operador (varios
  podrían referirse a `/chofer`).
- **Los otros dos mutantes que el pase 1 dejó vivos** (`analytics.ts:582`
  `getGastoPorRuta` y `comercial.ts:147` `margenPct`). Confirmé por `git diff`
  que ese código no cambió y que sigue sin prueba; no gasté una corrida completa
  en re-demostrarlo.

---

## Estado del árbol

`git status --short` al terminar, antes de escribir este archivo:

```
(vacío)
```

Y después de escribirlo:

```
 M docs/auditoria-17/pruebas.md
```

**Cero archivos del producto modificados.** Las nueve mutaciones se revirtieron
con `git checkout -- <archivo>` inmediatamente después de cada corrida, una a la
vez, y verifiqué el árbol entre una y otra. El experimento de zona horaria no
tocó ningún archivo (solo la variable `TZ` del proceso). No hice ningún commit.

*(Nota para quien coordine: durante mi corrida vi aparecer y desaparecer un
` M docs/auditoria-17/backend.md` que no es mío — otro auditor escribiendo en
paralelo. No lo toqué.)*
