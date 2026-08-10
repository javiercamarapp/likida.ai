# Pruebas — auditoría 17 · pase 3 (10-ago-2026)

**Nota: 5/10** (antes 5). Razón del movimiento: **se atacó y subió** en los tres
arreglos del PR —los tres mueren al revertirlos, y de paso verifiqué que la
**escritura** del dinero (`saveLiquidacion`) sí tiene arnés y caza un cambiazo de
parámetros—, y **deuda que cobró factura** por el otro lado: el CRÍTICO **C6**
lleva tres pases idéntico, y aparecieron **dos rutas más** (0% de cobertura)
cuyas puertas se quitan enteras con la suite verde. Se compensan; la nota no se
mueve.

> **El riesgo mayor del rubro, hoy:** el patrón que el pase 2 bautizó *«arnés que
> aparenta»* **se reprodujo dentro de un arreglo de este mismo PR**. El CRÍTICO
> de `d7b71a8` se movió a un archivo puro nuevo (`rail-marca.ts`, 6 statements,
> **100% de cobertura**) y se le puso una prueba que sí mata a su mutante — pero
> el archivo que tenía el bug (`rail.tsx`, 93 statements) sigue al **0%**, y le
> devolví el bug entero con la suite en **3,182 verdes, tsc limpio y lint
> limpio**. La cobertura subió, el número se ve mejor, y el panel del dueño se
> puede volver a quedar en blanco delante del contralor sin que nada avise.

---

## Compuerta, verificada por mí hoy

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 258 archivos · 3,187 verdes · 1 saltada
npx eslint src/         → 0 errores · 18 warnings
npx vitest run --coverage
   Statements 68.8% (12909/18763) · Branches 84.57% · Functions 81.28% · Lines 68.8%
   umbrales: 67 / 84 / 79 → PASA (el margen más chico sigue siendo RAMAS: 0.57 pt;
   FUNCIONES bajó de 81.5 a 81.28, margen 2.28 pt)
```

**Nota sobre el árbol durante mi corrida.** Empecé en `a2c7dda` (257 archivos ·
3,182 pruebas) y terminé en `3404616`: otros auditores del pase 3 commitearon
mientras yo corría, y por momentos vi en el árbol trabajo suyo **sin commitear**
(`conv.ts`, `presupuesto.ts`, `page.tsx` modificados y
`conv_lock_expira.test.ts` / `ahorro_sin_dato.test.ts` sin trackear). No toqué
nada de eso. Donde importa lo digo: la corrida del mutante de `agente.ts:325`
salió con 2 fallos en `conv_lock_expira.test.ts`, que **no son míos ni de mi
mutante** — por eso lo re-corrí acotado a los 17 archivos de facturación.

Cobertura por archivo de lo que audité (v8, statements):

```
   0.0%   33  src/app/api/cron/purgar/route.ts          ← NUEVO en mi radar (BORRA filas)
   0.0%   35  src/app/api/demo/route.ts
   0.0%   37  src/app/api/cron/escalar/route.ts
   0.0%   39  src/app/api/dashboard/asistente/route.ts  ← NUEVO en mi radar (IDOR documentado)
   0.0%   41  src/app/dashboard/top-rutas.tsx
   0.0%   42  src/app/api/export/liquidaciones/route.ts
   0.0%   43  src/app/dashboard/motor-fiscal-periodo.tsx
   0.0%   47  src/app/api/cron/facturar/cola/route.ts   ← C6, TERCER pase sin mover
   0.0%   63  src/app/dashboard/gasto-semanal-chart.tsx
   0.0%   64  src/app/dashboard/contador/cfdi/export/route.ts
   0.0%   84  src/app/dashboard/panel-periodo.tsx
   0.0%   93  src/app/dashboard/rail.tsx                ← el archivo que tenía el CRÍTICO
   0.0%  106  src/app/api/export/pdf/[id]/route.ts
   0.0%  200  src/lib/likida/comercial.ts
  22.3%  175  src/lib/saas/stripe.ts
  28.8%  146  src/lib/likida/facturacion/agente.ts
  40.9%   66  src/app/dashboard/resumen-visual.tsx      ← subió de 0% (e47b124)
  56.7%  557  src/lib/likida/repo.ts
  62.1%  116  src/app/api/stripe/webhook/route.ts
  77.0%  460  src/lib/likida/fiscal.ts
  90.1%  800  src/lib/likida/analytics.ts
  97.6%   42  src/app/dashboard/kpi-periodo.tsx         ← subió de 0% (e47b124)
  98.9%   94  src/lib/likida/recordatorio_comprobacion.ts
 100.0%    6  src/app/dashboard/rail-marca.ts           ← el archivo nuevo del arreglo
 100.0%  461  src/lib/likida/cuadre/engine.ts
```

Las dos últimas líneas, juntas, son el hallazgo de la portada: **100% sobre 6
statements, 0% sobre los 93 de al lado.**

---

## Estado de los hallazgos que traía

### C6 primero — **REINCIDENTE, tercer pase, VERIFICADO HOY EN VIVO**

`src/app/api/cron/facturar/cola/route.ts:40` y `:66` — 0.0%, 47 statements.

`git diff 94c0733..HEAD -- src/app/api/cron/facturar/cola` sigue **vacío**. El
directorio sigue teniendo **un solo archivo**, sin `*.test.ts`.

**Mutante exacto que puse hoy** (las dos cosas a la vez, tal como el pase 2):

```ts
// :40 — la firma de QStash se calcula y se tira
-    if (!valido) {
+    if (false && !valido) {
       logger.warn('qstash.cola.firma_invalida', {});
       return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
     }

// :62-66 — se deja de re-validar que el gasto siga sin CFDI
   const { data: vigentes, error } = await supabaseAdmin()
     .from('gasto')
     .select('id')
-    .in('id', ids)
-    .is('cfdi_uuid', null);
+    .in('id', ids);
```

**Resultado real, con los dos mutantes puestos:**

```
 Test Files  257 passed (257)
      Tests  3182 passed | 1 skipped (3183)

npx tsc --noEmit -p .  → 0 errores
```

Cero fallos y cero quejas del typechecker. Este endpoint es **público por
diseño** (no lleva `CRON_SECRET`: su única puerta es la firma) y del otro lado
llama `procesarLoteEnCola(...)`, que con `FACTURACION_MODO=emitir` **emite CFDI**
en el portal del proveedor. Con la firma bypasseada, un `POST` con
`{"lote":[{"id":"<uuid de gasto>", …}]}` dispara la emisión; y sin la
re-validación de `cfdi_uuid`, un reintento de QStash (`retries: 2`) vuelve a
facturar un ticket **que ya tiene CFDI**.

**Consecuencia:** un CFDI no se deshace. El duplicado le queda al cliente en su
contabilidad y cancelarlo fuera de plazo es su problema, no el nuestro. Sigue
siendo el único CRÍTICO abierto del rubro.

**Causa raíz probable:** tres pases sobre un CRÍTICO documentado sin que nadie lo
tome ya no es descuido; es una decisión implícita de no atenderlo.

### El resto, uno por uno

| Hallazgo | Estado hoy | Evidencia |
|---|---|---|
| **[CRÍTICO] C6 — cola de CFDI sin una sola prueba** | **REINCIDENTE (3.er pase)** | Arriba: mutante doble, 257 archivos / 3,182 verdes, tsc limpio |
| **[ALTO] la prueba "DOS CORRIDAS SOLAPADAS" no prueba el claim** | **REINCIDENTE** | `recordatorio_comprobacion.ts:191`. Borré `.is('recordatorio_comprobacion_en', null)` del UPDATE del claim → `Test Files 2 passed · Tests 39 passed`. La exención de la 0087 sigue textual en `migraciones_verificadas.test.ts:53`. `709e410` sumó 4 pruebas al archivo y **ninguna toca el claim** |
| **[ALTO] el cron `escalar` a 0%** | **REINCIDENTE** | Sigue 0.0% / 37 stmts, sin `*.test.ts` en el directorio. No re-corrí el mutante 7 (el archivo no cambió); en su lugar corrí el mismo experimento sobre `purgar`, que **también** BORRA datos — ver hallazgo nuevo 4 |
| **[ALTO] las consultas del Resumen pierden el filtro de tenant** | **REINCIDENTE, re-corrido hoy** | `analytics.ts:108`, quité `.eq('tenant_id', tenantId)` de la consulta de `gasto` en `getSerieComparativa` → `Test Files 257 passed · Tests 3182 passed \| 1 skipped`. `analytics.ts` sigue al 90.1% |
| **[ALTO] las tres descargas de dinero a 0%** | **REINCIDENTE** | Coverage de hoy: `export/liquidaciones` 0.0%/42, `export/pdf/[id]` 0.0%/106, `contador/cfdi/export` 0.0%/64. Los tres directorios siguen con un solo `route.ts`. `dinero_por_area.test.ts:55-72` sigue barriendo solo `src/app/dashboard/*/page.tsx` + `vista.tsx` — nunca `src/app/api/` — y su regla es que la puerta se **mencione** (`const PUERTA = /puedeVerArea\(/`, `:48`), no que gatee. No gasté una corrida en re-demostrar el mutante 8 |
| **[ALTO] el rollback del candado de Stripe sin aseverar** | **REINCIDENTE, byte-idéntico** | `route.test.ts:95-96` sigue diciendo `expect(r.status).toBe(500);` y debajo `// desmarcar se verifica indirectamente: el evento no queda clavado.` Nada más. `route.ts` al 62.1% |
| **[MEDIO] `actividad.test.ts` intermitente por reloj y zona** | **REINCIDENTE, confirmado con 15 corridas** | Ver sección propia abajo |
| **[MEDIO] las 5 pantallas del Resumen a 0% + `?? 0` en `kpi-periodo`** | **MITAD CERRADO** | `e47b124` cerró la mitad que importaba: `kpi-periodo.tsx` pasó de 0.0% a **97.6%** y `resumen-visual.tsx` de 0% a **40.9%**, con prueba de render real que muere al revertir. Siguen a 0%: `panel-periodo.tsx` (84), `gasto-semanal-chart.tsx` (63), `motor-fiscal-periodo.tsx` (43), `top-rutas.tsx` (41) |
| **[MEDIO] el ancla estructural del PGRST201 se fue con `mis-viajes`** | **REINCIDENTE** | `grep -rln "PGRST201\|liquidacion_viaje_id_fkey" src/` sigue **vacío**. No hay violación viva; sigue sin despertador |
| **[MEDIO] `verificaciones.sql` sin corredor** | **REINCIDENTE** | `.github/workflows/ci.yml` byte-idéntico: `npm ci`, typecheck, lint, `test:coverage`, `npx vitest run fundamento duplicados`, `build`. Ninguno ejecuta SQL. **Atenuante nuevo:** la 0088 **sí** trajo su bloque 63 (`verificaciones.sql:3052`, régimen 624) en vez de eximirse — el mecanismo no se volvió a usar para saltarse nada |
| **[MEDIO] `comercial.ts` 0% y `agente.ts` 28.8%** | **REINCIDENTE Y AGRAVADO** | Byte-idénticos y con la misma cobertura. Agravado porque esta vez sí fui a mutar `agente.ts` — ver hallazgo nuevo 2 |
| **[BAJO] `fiscal_series.test.ts` afirma por índice de llamada** | **REINCIDENTE** | `git diff` vacío para el archivo. No re-verificado con mutante: la fragilidad es de forma, no de resultado |
| **[BAJO] la prueba saltada / los 18 warnings** | **SIN CAMBIO, y sigue siendo correcto** | 1 saltada de 3,188 (falta `TICKET_PATH`, no un `it.skip`); 18 warnings de `no-unused-vars` |

---

## Verificación de los tres arreglos de este PR

Para cada uno reverti **solo el cambio de producción** dejando la prueba nueva
intacta, corrí, y revertí con `git checkout --` antes de pasar al siguiente.

| sha | prueba nueva | ¿muere al revertir? | evidencia (salida real) |
|---|---|---|---|
| `d7b71a8` | `rail_marca.test.ts` (4 casos) | ✅ **SÍ** al revertir la **regla**… ❌ **NO** al revertir el **cableado** | Ver abajo: dos mutantes distintos, dos resultados opuestos |
| `709e410` | +4 casos en `recordatorio_comprobacion.test.ts` | ✅ **SÍ** | `Tests 3 failed \| 16 passed (19)` |
| `e47b124` | `kpi-periodo.test.tsx` (6 casos) | ✅ **SÍ** | `Tests 2 failed \| 4 passed (6)` |

### `d7b71a8` — el único con dos caras

**Mutante A — revierto la REGLA** (`rail-marca.ts:26-30`, vuelve a mirar solo
`expandido`):

```ts
 export function marcaAsistente(expandido: boolean, pathname: string): 'expandido' | null {
   if (!expandido) return null;
-  if (pathname === RUTA_SIN_RAIL) return null;
+  void pathname;
   return 'expandido';
 }
```

```
 × EL BUG: expandido y en /dashboard NO debe marcar…
 × la secuencia completa del demo: expandir en /cuadre, luego ir a Resumen
   AssertionError: expected 'expandido' to be null   (rail_marca.test.ts:49)
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
```

**MURIÓ**, con el mensaje exacto y en la línea que narra el bug. Eso está bien
hecho.

**Mutante B — revierto el CABLEADO** (`rail.tsx:53-59`, el archivo donde vivía el
bug; dejo `rail-marca.ts` intacto):

```tsx
-  const marca = marcaAsistente(expandido, pathname);
+  void marcaAsistente;
   useEffect(() => {
     const raiz = document.documentElement;
-    if (marca) raiz.dataset.asistente = marca;
+    if (expandido) raiz.dataset.asistente = 'expandido';
     else delete raiz.dataset.asistente;
     return () => { delete raiz.dataset.asistente; };
-  }, [marca]);
+  }, [expandido]);
```

```
 Test Files  257 passed (257)
      Tests  3182 passed | 1 skipped (3183)
 npx tsc --noEmit -p .          → 0 errores
 npx eslint src/app/dashboard/rail.tsx → limpio
```

**SOBREVIVIÓ.** El bug CRÍTICO está de vuelta, completo, en el componente real, y
las tres puertas del CI (tsc, lint, pruebas) lo dejan pasar. Se detalla como
hallazgo nuevo 1.

### `709e410` — muere bien

Mutante: `viajesSinComprobar` vuelve a devolver los candidatos sin consultar
`gasto` (un `return candidatos;` antes del bloque nuevo de
`recordatorio_comprobacion.ts:80-106`).

```
 × EL BUG: el viaje del demo tiene 2 gastos y aun así recibía la reclamación
 × en un lote mixto solo se le escribe al callado, y el otro conserva su sello
 × FALLA CERRADO: si no se puede leer `gasto`, no se manda nada
 Test Files  1 failed (1)
      Tests  3 failed | 16 passed (19)
```

Tres de los cuatro casos nuevos mueren, incluido el de fallar cerrado. El cuarto
es el CONTROL y pasa a propósito. Es la forma correcta.

### `e47b124` — muere bien, y de punta a punta

Mutante (los dos archivos de producción, dejando el tipo `number | null` para que
compile):

```tsx
// kpi-periodo.tsx:67
-      valor={valorActual ?? null}
+      valor={valorActual ?? 0}
// resumen-visual.tsx:126
-      {valor === null ? '—' : fmt(valor)}
+      {fmt(valor ?? 0)}
```

```
 × KpiDegradado — sin dato no es cero > EL BUG: `valor` sin medición pintaba $0.00…
 × KpiPeriodo — la tarjeta del Resumen del dueño > EL BUG, de punta a punta…
 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
```

Y los 4 controles siguen verdes, incluido *«un cero REAL medido se sigue pintando
como cero»* — que es la distinción que de verdad importa. Además usa
`renderToStaticMarkup` sobre el componente REAL, no una copia: es la primera
prueba de render del repo y abre un camino que no existía.

---

## La prueba intermitente: sigue intermitente

`src/app/dashboard/actividad.test.ts:13-18` (los helpers) ·
`src/app/dashboard/actividad.tsx:20-25` (el código)

`git log -1` de los dos archivos devuelve `75715b5`, o sea **no se han tocado**
desde antes de la auditoría.

**15 corridas**, tres por zona horaria, sobre el árbol limpio (solo cambia la
variable `TZ` del proceso; hora de la máquina `Mon Aug 10 11:11 UTC 2026`):

```
TZ=UTC                  ×3  →  Tests  6 passed (6)
TZ=America/Mexico_City  ×3  →  Tests  6 passed (6)
TZ=Asia/Tokyo           ×3  →  Tests  4 failed | 2 passed (6)
TZ=Etc/GMT+12           ×3  →  Tests  4 failed | 2 passed (6)
TZ=Pacific/Kiritimati   ×3  →  Tests  6 passed (6)
```

```
AssertionError: expected '2026-08-09' to be '2026-08-10' // Object.is equality
AssertionError: expected +0 to be 1 // Object.is equality
```

Determinista por zona, intermitente por reloj: las dos mitades miden "hoy" con
relojes distintos —el helper con `new Date().toISOString().slice(0,10)` (día
**UTC**), `bucketsPorDia` con `hoy.setHours(0,0,0,0)` y de ahí `.toISOString()`
(medianoche **local**)—, así que falla exactamente cuando el día local y el día
UTC no coinciden. Para México (UTC−6) eso empieza **todas las tardes a las 18:00
local**. En CI (UTC) no se ve nunca.

---

## Hallazgos nuevos

### [ALTO] El arreglo del CRÍTICO del panel en blanco se ancló en un archivo de 6 líneas al 100%, y el de 93 que tenía el bug sigue al 0%: le devolví el bug y la suite ni parpadeó

`src/app/dashboard/rail.tsx:53-59` (0.0%, 93 statements) contra
`src/app/dashboard/rail-marca.ts:26-30` (100%, 6 statements) y
`src/app/dashboard/rail_marca.test.ts:39-63`

**Escenario (mutante B, corrido hoy):** dejé `rail-marca.ts` y su prueba
intactos, y en `rail.tsx` volví a poner el efecto exactamente como estaba antes
de `d7b71a8` — `if (expandido) raiz.dataset.asistente = 'expandido'` con
`}, [expandido])`. El resultado:

```
 Test Files  257 passed (257)
      Tests  3182 passed | 1 skipped (3183)
 npx tsc --noEmit -p .                  → 0 errores
 npx eslint src/app/dashboard/rail.tsx  → limpio
```

Las cuatro pruebas de `rail_marca.test.ts` pasan felices: siguen preguntándole a
la función pura, que no toqué. Nadie le pregunta al componente.

Con ese mutante, el flujo de dos clics que el propio encabezado de la prueba
narra vuelve a funcionar: en `/dashboard/cuadre` se aprieta "Expandir chat a
pantalla completa" → la raíz queda con `data-asistente="expandido"`; se aprieta
"Resumen" en el sidebar → `pathname` pasa a `/dashboard`, `rail.tsx:90` devuelve
`null`, el botón de contraer desaparece de la pantalla, y como renderizar `null`
**no desmonta**, el `return` del efecto no corre y la marca se queda puesta. El
Resumen del dueño se pinta con `opacity: 0` y `pointer-events: none`.

**Consecuencia:** el contralor de la flota ve una pantalla en blanco, sin un solo
control visible para revertirlo, en medio del demo. Es el mismo CRÍTICO que este
PR dio por cerrado, y hoy nada en el CI impide que vuelva.

**Lo que hace esto más que un hueco de cobertura:** el arreglo **subió** la
cobertura (`rail-marca.ts` entra al 100%) sin subir la protección de la línea que
falla. Es exactamente el mecanismo que el pase 2 documentó en
`recordatorio_comprobacion.ts` —98.8% y el claim sin probar— repitiéndose dentro
de un arreglo escrito *durante esta auditoría*. La nota al pie de
`rail_marca.test.ts:66-73` es honesta y dice que el cableado no queda anclado; el
problema no es que mienta, es que nadie leyó esa nota como una deuda.

**Causa raíz probable:** el repo no tiene jsdom ni testing-library
(`vitest.config.ts` no declara `environment`, y `node_modules` no los trae), así
que el efecto de un componente cliente hoy no es testeable — pero `e47b124`
acaba de demostrar con `renderToStaticMarkup` que parte de la UI **sí** lo es.

---

### [ALTO] El `ok` que el propio código llama "la clase de verde que este repo paga caro" se puede clavar en `true` y 303 pruebas de facturación siguen verdes

`src/lib/likida/facturacion/agente.ts:325` (28.8%, 146 statements) ·
la declaración de la garantía en `:168-175`

El campo está documentado así, textual, en la interfaz:

```ts
  /**
   * Entró algo. Se DERIVA de `porGasto` y no lo declara el adaptador: un
   * `ok: true` con cero gastos incluidos es la clase de verde que este repo
   * paga caro.
   */
  ok: boolean;
```

**Mutante exacto:**

```ts
- return { ...bruto, modo, porGasto, ok: porGasto.some((p) => p.incluido) };
+ return { ...bruto, modo, porGasto, ok: true };
```

**Resultado real** (acotado a los 17 archivos de facturación para aislarlo del
trabajo sin commitear de otro auditor que había en el árbol):

```
$ npx vitest run al_vuelo agente facturar facturacion
 Test Files  17 passed (17)
      Tests  303 passed (303)
```

La derivación que el comentario declara *como el arreglo* no tiene una sola
aserción. Con `ok: true` clavado, un lote donde **ningún** ticket entró
(`porGasto` con todos los `incluido: false`) deja de caer en
`al_vuelo.ts:260-262` —el `logger.warn('autofactura.fallo', …)`— y se va por la
rama de abajo, que lo registra como `autofactura.ensayo` con el texto *«ensayo:
se llenó el portal y no se emitió»*.

**Consecuencia:** el equipo que mañana vaya a averiguar "por qué esta flota no
tiene ni un CFDI" encuentra un log que dice **ensayo**, no fallo, para tickets
que sí se intentaron y sí fallaron. Es el modo de falla exacto que el comentario
de `al_vuelo.ts:264-269` dice haber cerrado en la dirección contraria — y esa
dirección sí quedó explicada, pero ninguna de las dos quedó probada. El daño es
tiempo del equipo y facturas que vencen su plazo mientras nadie sabe que están
atoradas.

**Causa raíz probable:** `al_vuelo.test.ts` mockea `facturarLoteConAgente`, así
que la derivación de `ok` queda del lado del mock; y `agente.test.ts` son 2
pruebas, ambas sobre `pideCaptcha`.

---

### [ALTO] `/api/dashboard/asistente` tiene el arreglo de un IDOR escrito en sus comentarios, 0% de cobertura, y las dos puertas se quitan sin que nada falle

`src/app/api/dashboard/asistente/route.ts:43` y `:56` (0.0%, 39 statements)

El archivo documenta su propia puerta en `:31-42`: *«Faltaba, y era el mismo IDOR
que ya se cerró en los dos endpoints de export… Este handler devuelve IVA e IEPS
acreditables, litros de diésel, el comprobado total y las diferencias de TODAS
las liquidaciones de la flota, leídos con `supabaseAdmin()` — que salta RLS… El
proxy no ayuda: su matcher excluye `/api`, así que esta línea es la única
puerta.»*

**Mutante exacto (las dos puertas):**

```ts
// :43 — la puerta de rol
-  if (!puedeVerArea(sesion.rol, 'dinero')) {
+  if (false) {
     return NextResponse.json({ error: 'sin acceso' }, { status: 403 });
   }

// :56 — el `?tenant=` deja de ser privilegio de superadmin
-  if (pedido && sesion.rol === 'superadmin') {
+  if (pedido) {
```

**Resultado real:**

```
 Test Files  258 passed (258)
      Tests  3187 passed | 1 skipped (3188)
```

**Escenario con valores:** un `encargado` de Transportes Innovativos, con sesión
válida y sin ningún permiso de dinero (la matriz de la 0044 le da solo el área
`operacion` y la base lo excluye de `ve_finanzas()`), hace
`GET /api/dashboard/asistente?tenant=<uuid de otra flota>` desde el navegador.
Con las dos puertas caídas la respuesta trae `kpis` y `acred` de **otra flota**:
IVA e IEPS acreditables, litros de diésel y el comprobado total.

**Consecuencia:** dos cosas a la vez, cruce de tenants y exposición de cifras
fiscales a un rol que la matriz de roles excluye a propósito. El aislamiento
entre flotas es lo único que un contralor no puede verificar por sí mismo, y es
justo lo que compra.

**Causa raíz probable:** el archivo se escribió con el arreglo bien razonado en
prosa y sin `route.test.ts` al lado — el mismo patrón que las tres descargas de
dinero, en la ruta que alimenta el rail de **las 20 páginas** del panel.

---

### [ALTO] El cron que BORRA filas también está a 0%: se le quitan las dos puertas y se le pone la ventana de retención en cero, y la suite sigue verde

`src/app/api/cron/purgar/route.ts:51` (`DIAS_WA`), `:55` y `:62` (las puertas) —
0.0%, 33 statements

El encabezado del archivo (`:40-47`) dice por qué esas líneas existen: *«esta
ruta BORRA FILAS. Sin `CRON_SECRET` devuelve 500 y no 200… Y sin el secreto,
cualquiera que conociera la URL podría disparar borrados a voluntad.»*

**Mutante exacto (las tres cosas a la vez):**

```ts
-const DIAS_WA = 30;
+const DIAS_WA = 0;

-  if (!secreto) {
+  if (false) {
     logger.error('cron.purgar.sin_secreto', {});
     return NextResponse.json({ error: 'CRON_SECRET no está configurado…' }, { status: 500 });
   }
-  if (req.headers.get('authorization') !== `Bearer ${secreto}`) {
+  if (false) {
     return new NextResponse(null, { status: 401 });
   }
```

**Resultado real:**

```
 Test Files  257 passed (257)
      Tests  3182 passed | 1 skipped (3183)
```

**Escenario con valores:** `GET https://app.likida.ai/api/cron/purgar` desde
cualquier navegador, sin encabezado `Authorization`, llama
`mantenimiento_de_datos(p_dias_wa => 0)` — que borra `wa_mensaje_procesado`
**entera**, incluidas las filas de hoy. Esa tabla es la de idempotencia de
WhatsApp: vaciada, el siguiente reintento de Meta (que reintenta durante horas)
vuelve a procesar mensajes ya procesados. Un ticket que ya se cargó se vuelve a
cargar, y el cuadre del viaje sale con el gasto duplicado.

**Consecuencia:** el chofer recibe respuestas repetidas, la flota ve gastos
duplicados en su liquidación, y el `DIAS_WA` de 30 días —el número que el archivo
justifica como *«más de un orden de magnitud por encima de la ventana de
reintentos de Meta»*— se puede cambiar a cualquier valor sin que ninguna prueba
lo note. Nótese que el hash de imagen (`uq_gasto_img_hash`) ataja el duplicado
por foto idéntica, pero no el reprocesamiento de un mensaje de texto ni un
segundo envío de la misma foto recomprimida.

**Causa raíz probable:** de los 11 `route.ts` bajo `src/app/api` y
`src/app/dashboard`, **ocho no tienen ningún `*.test.ts` en su directorio**, y los
tres que sí (`facturar`, `stripe/webhook`, `webhook/whatsapp`) demuestran que el
repo sabe probar una ruta. No es que no se sepa: es que no se hizo.

---

## Lo que revisé y está bien

- **La ESCRITURA del dinero sí tiene arnés, y es bueno.**
  `src/lib/likida/repo_escritura.test.ts:124` (*«manda los DOCE parámetros a su
  lugar, no solo los totales»*). Mutante que puse: en `repo.ts:608-614` intercambié
  `p_total_comprobado: liq.totalComprobado` ↔ `p_total_anticipo: liq.totalAnticipo`
  **y** cambié `p_ieps: liq.iepsAcreditable` por `liq.ivaAcreditable`.
  **MURIÓ:** `Test Files 1 failed | 256 passed (257) · Tests 1 failed | 3181 passed`.
  Era la pregunta central de mi rubro —"¿el dinero se escribe sin arnés?"— y para
  `saveLiquidacion` la respuesta es **no**. Sus 12 casos cubren además el `0` que
  no se guarda como `NULL`, el `false` que no se guarda como `NULL`, y que un
  error de la RPC **sí** se lanza.
- **Los tres arreglos de este PR mueren al revertirlos.** Es la primera ronda de
  la auditoría 17 en la que eso se cumple para todos. `709e410` incluso trae el
  caso de fallar cerrado, y `e47b124` prueba sobre el componente REAL con
  `renderToStaticMarkup` — no un `grep` de proxy, no una copia.
- **`kpi-periodo.test.tsx` abre un camino que el repo no tenía.** El
  `vitest.config.ts` dice que la UI *«necesita jsdom + testing-library, sesión
  dedicada post-demo»*; este archivo demuestra que para todo lo que no depende de
  efectos alcanza con `renderToStaticMarkup`, sin dependencias nuevas. Cuatro de
  sus seis casos son controles explícitos.
- **La 0088 trajo su bloque en vez de eximirse.** `verificaciones.sql:3052`,
  bloque 63: intenta `insert into tenant … regimen_fiscal '624'` y espera que
  pase, y `'699'` y espera el rechazo. El mecanismo de exención de
  `migraciones_verificadas.test.ts` **no** se volvió a usar para saltarse un
  bloque, que era el agravante del pase 2.
- **El CI sigue corriendo en cada push de cada rama** (`ci.yml:20-23`,
  `branches: ['**']` + `pull_request`), con `concurrency` y `cancel-in-progress`,
  y sus seis puertas intactas — incluido `npx vitest run fundamento duplicados`,
  que recupera las dos pruebas de tiempo que `--coverage` salta.
- **El trinquete de cobertura subió por trabajo real:** 68.41 → **68.8** en
  líneas. Los dos componentes que subieron (`kpi-periodo.tsx` 0→97.6,
  `resumen-visual.tsx` 0→40.9) lo hicieron por pruebas nuevas, no por poda.
  **Aviso:** ramas sigue con **0.57 pt** de margen y funciones bajó de 81.5 a
  81.28.
- **Ninguna prueba toca la red.** Los 20 archivos que mencionan `fetch(` o `http`
  lo hacen contra mocks o como cadenas de URL; la suite corrió 6 veces completa
  en este entorno sin salida a internet y sin un solo fallo atribuible a ello.
- **La suite es reproducible con `TZ=UTC` y `TZ=America/Mexico_City`.** Barrí las
  258 corridas bajo `Asia/Tokyo` y `Etc/GMT+12` en el pase 2 y hoy re-verifiqué
  acotado: **solo** `actividad.test.ts` falla; las dos pruebas de tiempo
  (`fundamento`, `duplicados`) no parpadearon en ninguna zona.
- **El motor de cuadre sigue al 100%** (`engine.ts`, 461 statements). No repetí el
  mutante del 15% de la RFA 2.9 porque `cuadre/` no se ha tocado; el resultado del
  pase 1 (murió en `engine.test.ts:1470` con el número exacto) sigue vigente.
- **La firma de Stripe sí está probada.** `verificarFirmaStripe`
  (`src/lib/saas/stripe.ts:326-355`, con `TOLERANCIA_S = 300` y
  `crypto.timingSafeEqual`) aparece en `stripe.test.ts` y en
  `webhook/route.test.ts`. Es el contraste exacto con C6: la misma clase de
  verificación de firma, una probada y la otra no.

---

## Lo que NO alcancé a revisar

- **`engine.test.ts` (86 KB, ~600 casos).** Tercer pase sin barrerlo buscando
  aserciones flojas. El 100% de cobertura de `engine.ts` dice que se ejecuta
  entero, no que se afirme sobre el valor. Es la mitad del rubro que sigue
  faltando.
- **`al_vuelo.test.ts` (46 KB).** Confirmé que mockea `facturarLoteConAgente` y
  que por eso el mutante de `agente.ts:325` sobrevive, pero no audité caso por
  caso si sus aserciones son sobre valor o sobre "se llamó".
- **`repo.ts` al 56.7% de 557 líneas.** Verifiqué `saveLiquidacion` y `addGasto`
  (los dos bien anclados). Quedan ~26 funciones exportadas sin revisar, entre
  ellas `getAcumuladoCombustible`, `reclamarEnvioAviso` y `resolverSolicitudArco`.
- **`src/lib/saas/stripe.ts` al 22.3% de 175.** Probé que la firma está anclada;
  `crearCheckout`, `crearSuscripcionPorTransferencia` y `leerPrecio` no los toqué.
  Es el dinero que Likida cobra, no el que la flota liquida — por eso quedó al
  final de la fila.
- **`processor.ts` al 81.8% de 962.** No mapeé qué 18% falta ni si es zona de
  dinero.
- **Cobertura de RAMAS por archivo.** Tercer pase sin saber qué archivo sostiene
  el 84.57% global, que sigue siendo el umbral con menos margen (0.57 pt).
- **`fiscal.ts` al 77% de 460.** Intenté derivar las líneas sin ejecutar del
  reporte HTML de v8 y me dio un mapeo falso (el reporte lista 460 entradas para
  un archivo de 1,010 líneas — son índices de statement, no números de línea).
  Lo digo para que nadie repita el atajo. `causasDe` y `resumirPerdidas` **sí**
  tienen ~30 aserciones en `fiscal.test.ts:112-280`; el 23% que falta está en
  otro lado y no lo localicé.
- **`pruebas-manuales/` (16 arneses).** Por instrucción, no se corren. Tampoco
  revisé si alguno quedó desalineado con el retiro del rol operador.
- **`comercial.ts` (0%, 200 stmts).** No gasté una corrida en re-mutar
  `margenPct`: el archivo es byte-idéntico al pase 1 y sigue sin
  `comercial.test.ts`. El atenuante sigue vivo (`cliente`, `factura_emitida`,
  `pago_recibido` e `ingreso_flete` vacías).

---

## Estado del árbol

`git status --short` **después** de escribir este archivo:

```
 M docs/auditoria-17/pruebas.md
```

Al terminar mis experimentos, **antes** de escribirlo, se veía así:

```
 M src/app/dashboard/page.tsx
?? src/app/dashboard/ahorro_sin_dato.test.ts
```

**Ninguno de esos dos era mío** (ya se commitearon mientras yo redactaba). Son
trabajo sin commitear de otro auditor del
pase 3 corriendo en paralelo (durante mi corrida también vi y dejé en paz
`src/lib/likida/conv.ts`, `src/lib/likida/presupuesto.ts` y
`src/lib/likida/conv_lock_expira.test.ts`, que después se commitearon en
`3404616`). No toqué ninguno.

**De los míos: cero.** Las **once** mutaciones de este pase se revirtieron con
`git checkout -- <archivo>` inmediatamente después de cada corrida, una a la vez,
y verifiqué el árbol entre una y otra:

| # | Archivo | Mutante | ¿Murió? |
|---|---|---|---|
| 1 | `api/cron/facturar/cola/route.ts:40,66` | firma a `false &&` + sin `.is('cfdi_uuid', null)` | ❌ **SOBREVIVIÓ** (C6) |
| 2 | `dashboard/rail-marca.ts:28` | quitar el chequeo de `pathname` | ✅ CAZADA *(control de `d7b71a8`)* |
| 3 | `dashboard/rail.tsx:53-59` | devolver el efecto a `[expandido]` | ❌ **SOBREVIVIÓ** |
| 4 | `likida/recordatorio_comprobacion.ts:80` | `return candidatos;` (revierte `709e410`) | ✅ CAZADA, 3 de 4 |
| 5 | `likida/recordatorio_comprobacion.ts:191` | borrar `.is('recordatorio_comprobacion_en', null)` | ❌ **SOBREVIVIÓ** (reincidente) |
| 6 | `dashboard/kpi-periodo.tsx:67` + `resumen-visual.tsx:126` | revertir `e47b124` | ✅ CAZADA, 2 de 6 |
| 7 | `api/cron/purgar/route.ts:51,55,62` | `DIAS_WA = 0` + ambas puertas a `false` | ❌ **SOBREVIVIÓ** |
| 8 | `likida/analytics.ts:108` | quitar `.eq('tenant_id', tenantId)` | ❌ **SOBREVIVIÓ** (reincidente) |
| 9 | `likida/repo.ts:608-614` | intercambiar comprobado↔anticipo y `p_ieps`←IVA | ✅ **CAZADA** |
| 10 | `likida/facturacion/agente.ts:325` | `ok: true` | ❌ **SOBREVIVIÓ** |
| 11 | `api/dashboard/asistente/route.ts:43,56` | ambas puertas abiertas | ❌ **SOBREVIVIÓ** |

**7 de 11 sobrevivieron.** Los tres controles de los arreglos del PR murieron en
la primera corrida y con el mensaje exacto, y el de `saveLiquidacion` también:
el método distingue. Lo que no distingue es la suite, en las rutas.

El experimento de zona horaria no tocó ningún archivo (solo la variable `TZ` del
proceso). No hice ningún commit.

---

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
