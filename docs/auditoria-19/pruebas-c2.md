# Pruebas — auditoría 19 c2

**Nota: 5/10** (antes 5). Razón del movimiento: **se atacó y subió** —el IDOR
del `encargado` quedó cerrado *con* prueba propia, el lease del claim de
WhatsApp se mudó de un UPDATE mockeable a una RPC verificada por **pgTAP que
hoy corre de verdad en CI**, y los dos bloques SQL nuevos del delta **muerden**
(lo probé rompiendo el fencing de la 0188 contra Postgres real: EXIT=1)— y
**deuda que cobró factura**: el panel de QA nació con su motor en **6.49 % de
líneas / 0.59 % de ramas**, y lo clavé en «ok» sin que una sola de las 6,525
pruebas se pusiera roja. Neto: cero, otra vez.

**El riesgo mayor del rubro, hoy:** el delta trae un **mecanismo que certifica
al producto** —el panel de QA— y ese mecanismo es el único módulo grande del
delta sin arnés. `qa-motor.ts:544` con `const final = 'ok'` cableado hace que
toda corrida del panel se declare aprobada, y la suite completa, `tsc` y
`eslint` siguen limpios. El commit que lo trajo se llama literalmente
*«los oráculos que no disparaban»*.

---

## La cifra real

Baseline limpio, tras revertir todas mis mutaciones (`HEAD` = `234c364`):

```
$ npm test
 RUN  v4.1.11 /home/user/cuadra

 Test Files  519 passed (519)
      Tests  6525 passed | 1 skipped (6526)
   Start at  11:37:15
   Duration  81.21s (transform 16.09s, setup 0ms, import 74.48s, tests 78.20s, environment 62ms)
```

(Al arrancar mi sesión, sobre `b774cd5`: **517 archivos · 6,519 pruebas · 1
saltada · 95.90 s**. La diferencia son dos archivos que el autofix de otros
rubros commiteó en este mismo árbol mientras yo trabajaba —
`generate_structured_imagen_budget.test.ts` y
`tool_idempotency_sello_no_revierte.test.ts`—, no cambios míos.)

Cobertura (`npx vitest run --coverage`), 519 archivos, 6,517 pasadas, 3 saltadas:

```
Statements   : 79.37% ( 16822/21194 )
Branches     : 69.86% ( 13008/18620 )
Functions    : 83.99% ( 2938/3498 )
Lines        : 82.1%  ( 14518/17683 )
```

El trinquete de `vitest.config.ts:119-124` exige `branches: 69`. Pasa con
**0.86 puntos de margen** — era 1.02 la ronda pasada; el margen se está
comiendo solo.

### La batería SQL, corrida de verdad

Levanté **PostgreSQL 16.13** en la sesión, apliqué el andamio de CI y las
migraciones sobre base virgen, y corrí el runner real:

```
183 migraciones aplicadas limpias.
141 bloque(s) · 120 ok · 0 fallo(s) · 0 no-lanzó · 19 sin-calificar · 2 reporte(s)
19 bloque(s) sin calificar, todos conocidos y con razón. Ninguno nuevo.
La batería pasó.                                                    EXIT=0
```

`verificaciones.sql` creció +153 líneas (dos bloques nuevos: **153** de la 0188
y **152** de la 0185). **El conteo de amnistiados no bajó: sigue en 19.**
`pg_prove` no se pudo correr aquí (la extensión `pgtap` no está en este
servidor); leí `supabase/tests/wa_leases_fencing.sql` — 33 aserciones,
`plan(33)` cuadrado — y verifiqué por API que `ci-postgres` está **`success` en
`master` en los seis commits del delta**, así que el paso de pgTAP sí se
ejecutó.

---

## Pruebas que rompí a propósito

Cada mutación revertida con `git checkout -- <archivo>` inmediatamente después
de correr sus pruebas. **11 mutaciones · 3 ROJAS / 8 VERDES.**

| # | Prueba que debía atraparlo | Qué rompí (diff) | Resultado |
|---|---|---|---|
| 1 | `cuadre/renglones_y_plazo.test.ts` (nuevo) | `engine.ts:634` `if (ajenos.length > 0 && …)` → `if (false && ajenos.length > 0 && …)` — la canasta mixta deja de levantarse | **VERDE** (37 archivos de `cuadre/`, 468; suite 6,519) |
| 2 | `lib/admin/qa-*.test.ts` (Fase B) | `qa-motor.ts:544` `const final = estadoFinalDe(corrida.veredicto);` → `const final = 'ok' as ReturnType<typeof estadoFinalDe>;` | **VERDE** (`src/lib/admin` + `src/app/admin` 342/342; suite 6,519; `tsc` limpio) |
| 3 | `server_actions_sin_closures.test.ts` (regresión de `1d327f7`) | `despacho/page.tsx`: reintroduje el closure como **arrow**, `const guardia = async () => guardiaDespacho(tenantId);` usada dentro de `buscarCatalogoAccion` | **VERDE** (2/2) |
| 4 | idem | el **mismo** closure declarado como `async function guardia() { … }` | **ROJA** (1/2) — el detector solo ve la forma `function` |
| 5 | `wa_pendientes_leases.test.ts` (nuevo) | `wa_pendientes.ts:182` `const ok = data === true \|\| (Array.isArray(data) && data[0] === true);` → `const ok = true;` | **ROJA** — «un worker viejo no puede completar el claim recuperado por otro» |
| 6 | `tool_idempotency_clock.test.ts` (nuevo) | `tool-idempotency.ts:82` y `:93`: borré los dos `if (data !== true) throw new Error('…se perdió el fencing token')` | **VERDE** (`src/lib/llm` 28/28; suite 6,522) |
| 7 | `budget.test.ts` / `generate_response_budget.test.ts` (nuevos) | `budget.ts:89`: quité el `if (process.env.NODE_ENV === 'test')` y su `throw` de producción, dejando siempre la rama permisiva | **VERDE** (suite 6,525) |
| 8 | `tool_idempotency.test.ts` (nuevo) | `tool-executor.ts:136` `if (process.env.NODE_ENV === 'test') {` → `if (true) {` — la idempotencia se apaga también en producción | **VERDE** (suite 6,525) |
| 9 | `privacidad.test.ts` (`src/app/privacidad/`) | `page.tsx:41` `razonSocial: LEGAL_CONFIG.razonSocial,` → `razonSocial: 'Likida Tecnologias, S.A.P.I. de C.V.', // antes: LEGAL_CONFIG.razonSocial` **y** `:149` `aviso={!estado.listo ? (` → `aviso={false && !estado.listo ? (` | **VERDE** (4 archivos de privacidad, 99/99; suite 6,522) |
| 10 | `regex_sin_redos.test.ts` | `processor.ts:455` `/^\s*(listo\|…` → `/^(\s\|\s)*(listo\|…` (mismo lenguaje, retroceso exponencial) | **VERDE** (15 archivos, 130/130) |
| 11 | — (`entrevista-aplicar.ts` no tiene ninguna) | `entrevista-aplicar.ts:158-159` intercambié `tope('diesel', t.diesel)` / `tope('caseta', t.caseta)` | **VERDE** (suite 6,522) |

Mutaciones de control, para no reportar un falso positivo:

| Control | Diff | Resultado |
|---|---|---|
| `agents/run.test.ts` | `run.ts:81` quité `budget,` del `generateWithTools` del cuadre | **ROJA** — el presupuesto del cuadre **sí** está anclado |
| Bloque **153** de `verificaciones.sql` (mig. 0188) | en la base viva, `complete_agente_mutacion`: `and owner_token = p_owner_token` → `and true` | **ROJA**: `viejo=t nuevo=f dato=false`, **EXIT=1** — el bloque nuevo muerde |
| `AGREGADOS_0150` | en la base viva, `anomalias_gasto_tenant`: `where tenant_id = p_tenant` → `where true` | **VERDE** — la batería lo MIDIÓ (`anomalias_ok=f`) y salió **EXIT=0** |
| Tres mutaciones reincidentes a la vez (`comercial.ts:582` `abierto_por: null`; `acuse_ticket.ts:189` `if (false)`; `wa_outbox.ts:39` `if (false)`) | — | **VERDE** (suite 6,525) |

---

## Hallazgos

### [CRÍTICO · REINCIDENTE] Los 19 bloques «sin calificar» siguen siendo no-ops permanentes: volví a meter una fuga entre flotas, la batería la MIDIÓ y salió EXIT=0

`scripts/ci/correr-verificaciones.mjs:390-410` (`SIN_CALIFICAR_CONOCIDOS`) ·
`supabase/verificaciones.sql:6144` (AGREGADOS_0150), `:6648` (RPCS_0159),
`:5903` (REGISTRO_0154), `:6096` (FISCAL_AGREGADO_0151), `:6582` (PURGAS_0155),
`:7283` (STRIPE_0163).

**Escenario (corrido hoy, contra Postgres 16.13 real, 183 migraciones sobre base
virgen).** Apliqué a la base viva un `create or replace` de
`anomalias_gasto_tenant` idéntico al de la migración salvo
`where tenant_id = p_tenant` → `where true` — una fuga entre flotas dentro del
propio SQL — y volví a correr el runner real:

```
AGREGADOS_0150 funcs=11 invoker=t ninguna_anon=t ninguna_auth=t todas_svc=t
  anomalias_ok=f semanal_ok=t rutas_ok=t … (esperado 11/t/t/t/t y doce t)
141 bloque(s) · 120 ok · 0 fallo(s) · 0 no-lanzó · 19 sin-calificar · 2 reporte(s)
19 bloque(s) sin calificar, todos conocidos y con razón. Ninguno nuevo.
La batería pasó.                                                    EXIT=0
```

El bloque **detectó la fuga** (`anomalias_ok=f` con `t` en las otras once) y el
runner salió verde.

**Lo que no cambió con el delta:** `verificaciones.sql` creció +153 líneas y
`SIN_CALIFICAR_CONOCIDOS` sigue con **exactamente las mismas 19 entradas**. El
recuento pedido: **19 antes, 19 hoy**. La lista se anunció como transitoria
(*«esa lista se baja, no se sube»*, `:422`) y no ha bajado en dos rondas.

**Consecuencia.** `RPCS_0159` (el sobrepago que no entra, el saldo que nunca
queda negativo, la factura ajena que rebota) y `AGREGADOS_0150` (las once RPC
que alimentan el tablero del contralor) pueden reprobar **todas** sus
aserciones y CI publica «La batería pasó».

**Causa raíz probable.** La amnistía es nominal y sin tope: marca «no cuenta»,
no «no supe leerlo». (REINCIDENTE de la c4 y de la ronda 19.)

---

### [CRÍTICO] El panel de QA se puede clavar en «ok» y ninguna de las 6,525 pruebas se entera: su motor está en 6.49 % de líneas y 0.59 % de ramas

`src/lib/admin/qa-motor.ts:544` (581 líneas, **sin `qa-motor.test.ts`**) ·
`src/lib/admin/qa-tipos.ts` (`estadoFinalDe`) ·
`src/lib/admin/qa-oraculos.test.ts` (mockea los cuatro oráculos).

**Escenario (corrido).** Cambié la única línea que traduce el veredicto de los
oráculos en el estado de la corrida:

```diff
-      const final = estadoFinalDe(corrida.veredicto);
+      const final = 'ok' as ReturnType<typeof estadoFinalDe>;
```

Con eso, un `cuadre_balancea (#1)` en **fallo** —el invariante CRÍTICO,
«anticipo − gastos = diferencia»— produce igualmente `corrida.estado = 'ok'`,
sin `motivo`, y el paso se cierra en verde. Corrí `src/lib/admin/` +
`src/app/admin/` (**342/342 verdes**), después la suite entera (**6,519
verdes**) y `npx tsc --noEmit -p .` (limpio).

`qa-oraculos.test.ts` prueba **qué oráculos se corren** (y lo hace bien: mockea
los cuatro y verifica el criterio de `dedup`), pero nadie prueba **qué se hace
con el veredicto**. `filaDesdeVeredicto` y `correrOraculos` están al 100 % de
líneas; `ejecutarCorridaRapida` —siembra, turnos, PDFs, oráculos, veredicto,
limpieza— está al 6.49 %.

**Consecuencia.** El panel existe para decir la verdad sobre el producto ante
un demo o un cliente. Un panel que responde «ok» pase lo que pase es peor que
no tenerlo, porque se cita. Es exactamente el modo de falla que el propio
commit `c85dfd3` dice haber venido a matar («los oráculos que no disparaban»),
trasladado un eslabón río abajo.

**Causa raíz probable.** Se probó lo que es puro y fácil de aislar
(`qa-tipos`, `qa-escenarios`, `qa-oraculos`, `qa-storage`) y se dejó sin arnés
el orquestador, que es donde vive la decisión.

---

### [CRÍTICO · REINCIDENTE] Tres de los 19 amnistiados HOY contradicen su propio `(esperado …)`, y siguen sin que nadie lo vea

`supabase/verificaciones.sql:6096` (FISCAL_AGREGADO_0151) · `:1564`
(INDICE_FACTURACION) · `:1681` (INDICES_PAGINACION).

**Escenario (corrido hoy, corrida limpia sin ninguna mutación).**

| Bloque | Medido hoy | `(esperado …)` escrito |
|---|---|---|
| `FISCAL_AGREGADO_0151` | `celdas=10  n=11/11  monto=8280.00/8280.00` | `11 celdas, 11/11, **7680.00**/7680.00` |
| `INDICE_FACTURACION` | `el-planeador-usa-el-indice=**f**` | `true` |
| `INDICES_PAGINACION` | `el-planeador-los-usa=**2/9**` | `9/9` |

Los siete planes que fallan traen `Sort Key: id` y un `Bitmap Index Scan` sobre
otro índice (`gasto_tenant_fecha_idx`, `viaje_tenant_fecha_inicio_idx`,
`idx_liq_tenant`, `idx_costo_tenant`, `pod_tenant_estado_idx`,
`incidencia_tenant_estado_idx`). Cifras idénticas a las de la ronda 19: **no se
movió nada**.

**Consecuencia.** El único bloque del repo que compara la agregación fiscal
contra Postgres lleva dos rondas midiendo $600 y una celda distintos de lo que
declara esperar, y el mecanismo que debía decirlo es el mismo que lo silencia.

**Causa raíz probable.** Un bloque amnistiado deja de leerse, aun cuando el
propio runner imprime sus dos mitades una al lado de la otra.

---

### [ALTO · REINCIDENTE] El arnés del IDOR de `export/` sigue siendo una lista fija de cuatro rutas: el bug se cerró, la clase no

`src/app/api/export/rutas_export.test.ts:90-95` (`const RUTAS = [...]`) ·
`src/app/api/export/poliza/route.ts:85,89` ·
`src/app/api/export/poliza/rol_dinero.test.ts`.

**Verificado contra el código de HOY.** El **bug está arreglado**:
`export/poliza/route.ts` pregunta hoy las dos puertas (`puedeVerArea(t.rol,
'dinero')` en `:85` **y** `puedeExportar(t.rol)` en `:89`), y tiene prueba
propia y honesta —`rol_dinero.test.ts` dobla `catalogoDeclarado` y
`supabaseAdmin` para que **lancen** si el guarda no corta, en vez de devolver
algo plausible—. La cobertura de esa ruta pasó de **0 % a 40.5 %** de líneas.

**Lo que sigue abierto es el arnés.** `rutas_export.test.ts:90` enumera a mano
`pdf/[id]`, `liquidaciones`, `facturas-proveedor` y `bitacora-peaje`. `poliza`
**no está en esa lista** —quedó cubierta por un archivo aparte—, y no existe
ninguna red que exija que todo `src/app/api/export/*/route.ts` aparezca en el
arnés de las cuatro puertas, al contrario de `src/lib/auth/cron.test.ts:63`,
que **escanea el fuente de todas las rutas de cron**. La sexta ruta de
`export/` nacerá igual que nació la quinta.

**Consecuencia.** La clase de bug que produjo el CRÍTICO de la ronda 19 —un
`encargado` bajando la póliza contable completa— sigue sin red estructural. Es
la misma forma de arnés que falló hace un día.

**Causa raíz probable.** Enumerar en vez de escanear. (REINCIDENTE en la clase;
la instancia está cerrada.)

---

### [ALTO] La política de privacidad pública acepta una razón social INVENTADA y el apagado del aviso «PRODUCCIÓN BLOQUEADA» sin que nada se ponga rojo: la prueba hace `grep` al `.tsx`

`src/app/privacidad/privacidad.test.ts:20` (`readFileSync('src/app/privacidad/page.tsx')`)
y `:51-55` · `src/app/privacidad/page.tsx:41,149`.

**Escenario (corrido).** Dos cambios, ninguno detectado:

```diff
-  razonSocial: LEGAL_CONFIG.razonSocial,
+  razonSocial: 'Likida Tecnologias, S.A.P.I. de C.V.', // antes: LEGAL_CONFIG.razonSocial
...
-      aviso={!estado.listo ? (
+      aviso={false && !estado.listo ? (
```

`4 archivos de privacidad, 99/99 verdes`; suite completa **6,522 verdes**. La
prueba dice «no inventa la razón social: si falta, lo dice» y lo comprueba con
`expect(P).toMatch(/LEGAL_CONFIG\.razonSocial/)` y
`expect(P).toMatch(/PRODUCCIÓN BLOQUEADA/)`: **las dos cadenas siguen en el
archivo**, una en un comentario y la otra dentro de una rama muerta.

**Consecuencia.** La página que la LFPDPPP obliga a exhibir puede publicar una
razón social fabricada, y la señal que avisa que faltan datos legales puede
apagarse, con CI en verde. Es la regla que `CLAUDE.md` pone primero —«nunca
inventar una cifra… si no hay dato real, se dice qué falta»— y su prueba mide
el texto fuente, no lo que se sirve.

**Causa raíz probable.** Se probó el archivo, no el render. `CLAUDE.md` ya
documenta esta trampa para los screenshots («una copia verifica la copia»); aquí
es la misma con `readFileSync`.

---

### [ALTO] `renglones_ajenos` —el 15 % de canasta mixta que el contralor va a ver— no tiene una sola prueba, y el archivo que lleva su nombre solo cubre la otra mitad

`src/lib/likida/cuadre/engine.ts:625-641` ·
`src/lib/likida/cuadre/renglones_y_plazo.test.ts` (**nuevo**, 56 líneas, cinco
`it`, **todos de `calcularCaducidad`**) · `src/lib/likida/intake/ocr.ts:62-76`.

**Escenario (corrido).**

```diff
-      if (ajenos.length > 0 && sumaAjena > 0 && g.monto > 0 && sumaAjena / g.monto >= 0.15) {
+      if (false && ajenos.length > 0 && sumaAjena > 0 && g.monto > 0 && sumaAjena / g.monto >= 0.15) {
```

`npx vitest run src/lib/likida/cuadre/` → **37 archivos, 468/468 verdes**;
suite completa **6,519 verdes**. `grep -rn "renglones_ajenos" --include=*.test.ts
src/` → **cero aciertos**, mientras su hermana `moneda_extranjera` (del mismo
bloque, del mismo delta) sí tiene tres aserciones en
`cuadre/monto_y_moneda.test.ts:109,126,138`.

**Y hay algo peor que la falta de arnés:** `intake/ocr.ts:62-76` declara que
`plazo_facturacion_horas` y `renglones` **se retiraron del esquema el 24-ago
porque tumbaron el OCR en producción**. O sea que hoy nada escribe
`ocrExtra.renglones` ni `ocrExtra.plazoFacturacionHoras`, y las dos mitades del
motor que los leen (`engine.ts:625` y `engine.ts:950`) son inalcanzables. Las
cinco pruebas de `renglones_y_plazo.test.ts` verifican `calcularCaducidad` con
`{ horas: 24 }` — una entrada que el sistema ya no produce.

**Consecuencia.** El commit se vende como el arreglo de dos bugs encontrados en
cinco tickets reales; hoy ninguno de los dos está activo y ninguna prueba lo
dice. Un contrato entre el esquema del OCR y lo que el motor lee habría puesto
esto en rojo el mismo día.

---

### [ALTO · REINCIDENTE] `regex_sin_redos.test.ts` sigue probando COPIAS: metí un ReDoS exponencial en la regex real y la prueba escrita para eso siguió verde

`src/lib/likida/regex_sin_redos.test.ts:27` («copiadas de su archivo») y `:41`
vs `src/lib/likida/processor.ts:455`.

**Escenario (corrido hoy).** La copia y la regex viva **siguen divergiendo**:

```
prueba :41   /^\s*(listo|ya est[aá]|ya qued[óo]|(ya\s+)?termin[éeoó]|cierra|cerrar)\s*[!.]*$/i
real   :455  /^\s*(listo|ya est[aá]|ya qued[óo]|ya no tengo m[áa]s|(ya\s+)?termin[éeoó]|(ya\s+)?acab[éeoó]|cierra|cerrar|eso es todo|es todo)(?!\p{L})/iu
```

Cambié en `processor.ts:455` el prefijo `^\s*` por `^(\s|\s)*` —mismo lenguaje,
retroceso exponencial— y corrí `regex_sin_redos` + toda la suite de
`processor`: **15 archivos, 130/130 verdes**. Medido con la regex mutada:
22 espacios → **34 ms**, 26 → **100 ms**, 28 → **399 ms**, 30 → **1,646 ms**;
un mensaje de 4,096 caracteres (el tope de Meta) no vuelve nunca.
`pareceCierre(texto)` corre sobre el texto que manda cualquiera que conozca el
número de WhatsApp.

**Consecuencia.** Idéntica a la de la ronda 19: la prueba sustituye a CodeQL
sobre un texto que ya no existe en el código.

**Causa raíz probable.** Se copiaron los literales en vez de exportarlos.
(REINCIDENTE de la ronda 19.)

---

### [ALTO · REINCIDENTE] El onboarding por chat le sigue escribiendo la política de topes a la flota desde 0 % de cobertura

`src/lib/likida/perfil/entrevista-aplicar.ts:158-159` (**0 % líneas / 0 % ramas**
medido hoy) · `entrevista-agente.ts` (**0 %**) ·
`api/dashboard/onboarding-chat/route.ts` (**0 %**).

**Escenario (corrido).** Intercambié los dos topes —el de diésel que el modelo
extrajo del chat se escribe en el renglón de casetas y viceversa— y corrí la
suite completa: **6,522 verdes**.

```diff
-        tope('diesel', t.diesel),
-        tope('caseta', t.caseta),
+        tope('diesel', t.caseta),
+        tope('caseta', t.diesel),
```

Los tres archivos siguen exactamente en el mismo 0 % que la ronda 19: el delta
no los tocó.

**Consecuencia.** Con la política invertida, una caseta de $900 entra bajo el
tope del diésel y sale «dentro de política». El mismo módulo llama
`guardarDatosFiscales` (RFC, régimen, CP del receptor CFDI 4.0) sin una sola
aserción. (REINCIDENTE de la ronda 19.)

---

### [ALTO] El detector de closures en server actions solo mira la forma `function`: reintroduje el bug de producción como arrow y siguió verde

`src/app/dashboard/server_actions_sin_closures.test.ts:85`
(`const re = /^ {2}(?:async )?function ([A-Za-z_$][\w$]*)\s*[(<]/gm;`).

**Escenario (corrido, las dos formas del MISMO bug).** En
`src/app/dashboard/despacho/page.tsx` reintroduje la ayudante que `1d327f7`
sacó del cuerpo del componente:

```diff
+  const guardia = async () => guardiaDespacho(tenantId);
+
   async function buscarCatalogoAccion(tipo: TipoCatalogo, q: string): Promise<OpcionCatalogo[]> {
     'use server';
-    const rechazo = await guardiaDespacho(tenantId);
+    const rechazo = await guardia();
```

→ **2/2 verdes**. La misma ayudante declarada como `async function guardia() {
return guardiaDespacho(tenantId); }` → **1 de 2 roja**. Next serializa lo
capturado igual en los dos casos: una arrow tampoco es serializable.

Hay **seis páginas** que hoy ya declaran ayudantes `const … = (` a dos espacios
junto a acciones `'use server'` (`admin/flotas`, `admin/observabilidad`,
`login`, `dashboard/politicas`, `dashboard/viajes`, `dashboard/onboarding`);
verifiqué que ninguna la usa **todavía** dentro de una acción — el detector no
lo notaría el día que una lo haga.

**Consecuencia.** El bug que costó 204 errores de Sentry en nueve días y dejó
al despacho sin poder crear viajes vuelve por la puerta de al lado, y su prueba
de regresión lo deja pasar. El propio archivo se declara «una heurística
deliberadamente estrecha»; el problema es que la mitad estrecha es la forma más
común de declarar una ayudante.

---

### [ALTO] Las dos puertas cerradas de producción del runtime nuevo viven detrás de `NODE_ENV === 'test'`: ninguna prueba puede alcanzarlas, y las 6,525 corren con ambas garantías apagadas

`src/lib/llm/budget.ts:89` · `src/lib/llm/tool-executor.ts:136`.

**Escenario (corrido, dos mutaciones independientes).**

(a) En `budget.ts:89`, borré la rama de producción entera dejando siempre la
permisiva —un cliente Supabase sin `rpc` deja de fallar cerrado y **concede** el
presupuesto sin consultar el tope diario del tenant—:

```diff
-    if (process.env.NODE_ENV === 'test') {
-      budget.reservadoRunUsd += amountUsd;
-      return { id, amountUsd, persisted: false };
-    }
-    throw new Error('reservar_presupuesto_llm: cliente Supabase sin RPC de presupuesto');
+    budget.reservadoRunUsd += amountUsd;
+    return { id, amountUsd, persisted: false };
```

→ suite completa **6,525 verdes**.

(b) En `tool-executor.ts:136`, `if (process.env.NODE_ENV === 'test') {` →
`if (true) {`: cuando `claimMutation` falla, la idempotencia durable se apaga
**también en producción** y la tool se ejecuta igual, en vez de devolver «la
operación no se pudo proteger contra reintentos» → suite completa **6,525
verdes**.

**Consecuencia doble.** (1) La rama fail-closed de las dos garantías nuevas del
delta —el tope de dinero por tenant y la deduplicación por efecto de
`guardar_liquidacion`, la única tool `isMutation: true` del repo— es
inalcanzable bajo Vitest, así que **nada la puede anclar**. (2) Al revés: todas
las pruebas de cadena que usan un doble mínimo de Supabase corren con esas dos
garantías **desactivadas en silencio**, de modo que ninguna afirma lo que
parece afirmar sobre presupuesto o idempotencia.

**Causa raíz probable.** El escape se metió para que los dobles viejos siguieran
compilando, en vez de darle a los dobles el `rpc` que el contrato nuevo pide.

---

### [MEDIO] Un fencing token perdido deja de reportarse y nada se pone rojo: el único arnés del módulo lo mockea entero

`src/lib/llm/tool-idempotency.ts:82` y `:93` ·
`src/lib/llm/tool_idempotency.test.ts:7` (`vi.mock('./tool-idempotency', …)`) ·
`src/lib/llm/tool_idempotency_clock.test.ts` (no cubre el caso `data !== true`).

**Escenario (corrido).** Borré los dos guardas:

```diff
-  if (data !== true) throw new Error('completeMutation: se perdió el fencing token');
+  // (nada)
-  if (data !== true) throw new Error('failMutation: se perdió el fencing token');
+  // (nada)
```

→ `src/lib/llm/` **28/28 verdes**, suite completa **6,522 verdes**. Lo repetí
después de que el autofix añadiera `tool_idempotency_sello_no_revierte.test.ts`:
sigue verde, porque ese archivo también mockea `./tool-idempotency`.

`tool-idempotency.ts` mide 65.78 % de ramas: la rama «el sello no era mío» es
de las que faltan.

**Consecuencia.** Es la única señal de que otro worker se llevó el efecto de
`guardar_liquidacion` a media corrida. Sin ella, dos workers cierran la misma
liquidación y la telemetría dice que todo salió bien.

---

### [MEDIO · REINCIDENTE] El gate de auto-merge sigue con `CODE=$?` después de un `if`: la rama de «checks en curso» sigue siendo código muerto

`.github/workflows/auto-merge-rutina.yml:57`.

**Escenario (corrido hoy).**

```
$ bash -c 'f(){ return 8; }; for i in 1 2; do if f >/dev/null 2>&1; then echo verde; break; fi;
           CODE=$?; echo "CODE=$CODE"; if [ "$CODE" = "8" ]; then echo esperaria; continue; fi;
           echo "ROJO (falso)"; break; done'
CODE=0
ROJO (falso)
```

`gh pr checks` devuelve 8 mientras algún check siga corriendo; el script lee
`CODE=0`, nunca entra a la espera y salta directo a comentar el PR con «🔴 Hay
checks en ROJO». `ci-postgres` corre en paralelo a `CI` y suele seguir en curso
en ese instante. Sin cambios desde la ronda 19.

---

### [MEDIO · REINCIDENTE] `acuse_ticket.ts` sigue sin arnés propio: es la regla que evita pedirle firma al chofer sobre una cifra que el OCR no leyó

`src/lib/likida/acuse_ticket.ts:189` · no existe `acuse_ticket.test.ts`
(cobertura 81.25 % líneas / **66.17 % ramas**, arrastrada por otros arneses).

`if (l.confianza === null || l.confianza < CONFIANZA_LEGIBLE)` → `if (false)`;
suite completa **6,525 verdes**. Con la mutación, un ticket leído con confianza
0.30 deja de caer en `refoto` y cae en `confirmar`: se le manda al chofer un
botón con la cifra que el OCR *creyó* leer, y su «sí» queda como acuse. El
propio archivo declara eso como su peor modo de falla. El delta **sí tocó este
archivo** (`silencio` → `acusar`, `6340aac`) y aun así no le puso arnés.
(REINCIDENTE de la c3, la c4 y la ronda 19.)

---

### [MEDIO · REINCIDENTE] `wa_outbox.ts` — el último eslabón antes del teléfono del chofer, 5.26 % de ramas y sin una sola prueba propia

`src/lib/likida/wa_outbox.ts:39` (`finalizarSalidaWhatsApp`), 33.33 % líneas /
**5.26 % ramas**.

`if (err || data !== true) logger.error(…)` → `if (false)`: suite completa
**6,525 verdes**. Esa condición es la única que distingue «cerré el envío» de
«perdí el lease»; con ella apagada, un mensaje ya entregado a Meta se queda
`pending` y el cron lo vuelve a mandar. (REINCIDENTE de la c3, la c4 y la
ronda 19.)

---

### [MEDIO · REINCIDENTE] `FACTURACION_PILOTO=si` sigue sin una sola prueba con la palanca puesta

`src/lib/likida/facturacion/adaptadores/registro.ts:180`.

`grep -rn FACTURACION_PILOTO src/ .github/ vitest.config.ts scripts/` → **3
aciertos**: la lectura de la variable y dos comentarios (`registro.ts:170`,
`llm/models.ts:139`). Ni un workflow, ni un `vi.stubEnv`. Todo lo que corre
detrás de la palanca —el piloto de visión operando un portal del SAT con
credenciales del cliente— se prueba con la palanca en `false`. (REINCIDENTE de
la c2, la c3, la c4 y la ronda 19.)

---

### [MEDIO · REINCIDENTE] `abrirTicket` (la señal de PMF #3) sigue sin poder ponerse roja

`src/lib/likida/comercial.ts:582`. `abierto_por: abiertoPor` → `null`; suite
completa **6,525 verdes**. El ticket se guarda sin quién lo abrió y nada lo
dice. (REINCIDENTE de la c3, la c4 y la ronda 19.)

---

### [MEDIO] El trinquete de cobertura se está comiendo su propio margen, y sigue sin piso por archivo

`vitest.config.ts:119-124` (`branches: 69`) · medición de hoy: **69.86 %**.

Margen **0.86 puntos** (era 1.02 la ronda pasada). No hay umbral por archivo,
así que `qa-motor.ts` con **0.59 % de ramas** sobre 581 líneas no puede poner
roja la puerta mientras las otras 6,500 pruebas carguen el promedio. Los
archivos nuevos de este delta que sí se miden aportan **79 de 113 ramas
cubiertas**; el que más pesa —`qa-motor.ts`, que entró en el delta anterior—
aporta 3 de 508.

---

### [BAJO · REINCIDENTE] La lista blanca del runner sigue casando por PREFIJO, con claves de tres caracteres

`scripts/ci/correr-verificaciones.mjs:413-415`
(`[...SIN_CALIFICAR_CONOCIDOS.keys()].some((k) => m.startsWith(k))`).

Cuatro de las diecinueve claves son `'45 '`, `'48 '`, `'49 '` y `'52 '`. Un
bloque **nuevo** cuyo `raise` empiece por «45 …» —un conteo, una fecha— entra a
la amnistía sin que nadie lo apruebe, y el gate de `:416-426` no lo ve. No lo
pude disparar con un bloque real; el riesgo es de construcción. (REINCIDENTE de
la ronda 19.)

---

## Lo que revisé y está bien

- **pgTAP corre de verdad en CI, y no es informativo.** `ci-postgres.yml:116-173`
  instala `postgresql-16-pgtap` **dentro del servidor**, deja `pg_prove` en el
  runner y corre `supabase/tests/wa_leases_fencing.sql` con `--verbose`, que
  falla ante cualquier `not ok`. Después hace `drop extension pgtap` para que
  sus dos vistas auxiliares no confundan a la auditoría auto-descubriente de la
  Capa 1 — un detalle que revela que alguien pensó el orden. El archivo declara
  `plan(33)` y tiene 33 aserciones. **Verificado por API: `ci-postgres` está
  `success` en `master` en los seis commits del delta.** No lo pude ejecutar
  aquí (sin extensión `pgtap` en este servidor).
- **Los bloques SQL nuevos SÍ califican y SÍ muerden.** Rompí el fencing de
  `complete_agente_mutacion` en la base viva (`and owner_token = p_owner_token`
  → `and true`) y el bloque **153** (`verificaciones.sql:8528`, mig. 0188) puso
  la batería en **EXIT=1** con `viejo=t nuevo=f dato=false`. Los dos bloques
  nuevos del delta (152 y 153) califican: no engordaron la amnistía.
- **El presupuesto del cuadre está anclado.** Quitar `budget,` de
  `agents/run.ts:81` pone roja `run.test.ts` («combina la señal externa y
  entrega una identidad de corrida al runtime»). `analista.ts` y `copiloto.ts`
  también lo pasan.
- **El ALTO REINCIDENTE del lease del claim de WhatsApp está CERRADO.** Ya no
  existe el UPDATE con `.is(...)/.lt(...)` que el doble de Supabase ignoraba:
  `conv.ts:434` llama la RPC `claim_wa_mensaje_procesado` (mig. 0187) y la
  carrera se juzga en Postgres. `conv_claim_lease.test.ts` afirma los
  argumentos exactos y que un error de RPC **no** se convierta en `duplicado`.
- **`wa_pendientes_leases.test.ts` muerde donde importa.** Poner
  `const ok = true` en `marcarPendienteProcesado` pone roja «un worker viejo no
  puede completar el claim recuperado por otro». (Su primer `it` —«dos workers
  concurrentes: exactamente uno obtiene el lease»— sí es el mock probándose a
  sí mismo: la exclusión la impone `rpc.mockImplementation`, no
  `wa_pendientes.ts`. Es lo que la 0187 y pgTAP prueban de verdad.)
- **`export/poliza/rol_dinero.test.ts` es un arnés honesto**: sus dobles de
  `catalogoDeclarado` y `supabaseAdmin` **lanzan** si el guarda no corta, en vez
  de devolver algo plausible — el comentario lo dice y el código lo cumple.
- **`qa-storage.test.ts` (412 líneas) es el mejor arnés nuevo del delta.** Su
  Postgres de juguete **respeta las restricciones que importan** (el `unique` de
  `qa_foto.hash` y la PK `(corrida_id, n)`), y cubre la carrera de dos subidas
  de la misma foto y el paso reescrito. 93.49 % de líneas.
- **`budget.test.ts` no es decoración en su mitad determinista**: afirma el
  `p_tenant_id`/`p_tope_run_usd` exactos, el rechazo local antes de llamar al
  proveedor (`expect(rpc).not.toHaveBeenCalled()`), el aislamiento entre dos
  tenants y la idempotencia de `settle`.
- **`api/health/route.test.ts`** afirma el conjunto **exacto** de llaves del
  cuerpo (`['checks','hora','ok','status','version']`) y que el JSON no case con
  `/tenant_id|@|supabase/i`. Es la forma correcta de probar que algo público no
  filtra.
- **`migraciones_verificadas.test.ts` obligó a la 0186 y la 0187 a decidir**:
  las dos tienen exención con razón escrita apuntando a su arnés real
  (`migration_0186.test.ts` y `wa_leases_fencing.sql`), y la prueba también
  falla si una exención nombra una migración que ya no existe.
- **`arbol_sin_enlaces_ajenos.test.ts`, `consultas_admin_filtran_tenant.test.ts`
  y `cron.test.ts`** siguen siendo los tres arneses que **escanean** en vez de
  enumerar. Son el patrón que le falta a `rutas_export.test.ts`.

---

## Lo que NO alcancé a revisar

- **`supabase/tests/wa_leases_fencing.sql` ejecutado.** Leí las 33 aserciones y
  confirmé que CI las corre y está verde, pero no las ejecuté: este servidor no
  tiene la extensión `pgtap`. No puedo afirmar que las 33 sean fuertes, solo que
  el plan cuadra y que el runner falla ante un `not ok`.
- **Si `INDICES_PAGINACION` (2/9) es un problema real de producción o un
  artefacto del planeador en mi cluster.** Mismo límite que la ronda 19: no
  comparé contra el `explain` de Supabase, que tiene otras estadísticas.
- **Los otros 13 bloques SIN CALIFICAR** (`:147, 1107, 1769, 1920, 2024, 2299,
  2563, 2655, 2845, 3864, 3977` y los dos ya citados). Leí sus mensajes medidos
  y ninguno contradice su esperado a simple vista.
- **`migration_0187.test.ts` / `migration_0188.test.ts` a fondo.** Son
  `expect(sql).toContain(...)` sobre el texto de la migración: cuentan
  ocurrencias de `security definer` y `set search_path = ''` y buscan fragmentos
  literales. Detectan un borrado, no un cambio de semántica dentro de una línea
  que conserve el fragmento. No busqué un contraejemplo concreto.
- **`qa-motor.ts` línea por línea** (581 líneas, 6.49 %). Muté una sola línea; no
  audité la siembra, la limpieza del tenant sintético ni el tope de gasto diario.
- **`entrevista.ts`** (998 líneas, 28.76 % líneas / 19.28 % ramas), el intérprete
  del chat: no muté nada dentro.
- **`src/app/api/cron/gps/route.ts` (0 %)** y **`src/lib/admin/calcom.ts`**: sin
  mutar, igual que la ronda pasada.
- **`pruebas-manuales/*.prueba.ts`** — no se corren por instrucción (llamadas
  reales de pago).

---

## Confirmación de árbol limpio

Las 11 mutaciones y las 4 de control se revirtieron con
`git checkout -- <archivo>` inmediatamente después de correr sus pruebas. No
creé ni un archivo dentro de `src/`. Las dos mutaciones SQL (`where true` en
`anomalias_gasto_tenant`, `and true` en `complete_agente_mutacion`) se
aplicaron **solo a la base viva** de mi cluster efímero, nunca al repositorio;
la primera se restauró reaplicando la migración y el servidor quedó detenido
(`pg_ctl … stop` → *server stopped*). El cluster vive en `/var/tmp/pgaud2`,
fuera del repo.

Salida real al terminar:

```
$ git status --porcelain
(vacío)
$ git log --oneline -1
234c364 fix(agentico AGEN-19c2-2 CRITICO): un fallo de contabilidad deja de tener la misma voz que un fallo del efecto
```

**Nota sobre el árbol compartido.** Durante mi sesión el autofix de otros rubros
commiteó en este mismo árbol y `HEAD` pasó de `b774cd5` a `234c364`. En dos
momentos `git status` mostró `M src/lib/llm/openrouter.ts`,
`M src/lib/llm/tool-executor.ts` y dos `*.test.ts` sin rastrear
(`generate_structured_imagen_budget.test.ts`,
`tool_idempotency_sello_no_revierte.test.ts`): **ninguno es mío** —los verifiqué
con `git diff` y son trabajo de los rubros de rendimiento y agéntico—, y todos
quedaron commiteados por su autor. De los míos —`engine.ts`, `qa-motor.ts`,
`despacho/page.tsx`, `wa_pendientes.ts`, `tool-idempotency.ts`, `budget.ts`,
`tool-executor.ts`, `privacidad/page.tsx`, `processor.ts`,
`entrevista-aplicar.ts`, `comercial.ts`, `acuse_ticket.ts`, `wa_outbox.ts`,
`agents/run.ts`— no queda ninguno modificado. No hice ni un commit. (Este
archivo no figura en `git status` porque `.gitignore:34` ignora
`docs/auditoria-*/`.)
