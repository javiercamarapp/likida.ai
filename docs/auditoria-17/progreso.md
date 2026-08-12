# Progreso — auditoría 17 (8-ago-2026)

Una línea por acción, con su sha. Se escribe MIENTRAS avanza, no al cerrar.

## PASE 4 — 11-ago-2026

| # | Acción | Resultado | sha |
|---|---|---|---|
| 1 | `git status` al arrancar | **limpio** (HEAD detached en `003c88a`) → autofix HABILITADO | — |
| 2 | Decisión de tamaño de ronda | **CONTINUACIÓN** — PR #9 abierto sobre `claude/auditoria-17` | — |
| 3 | `git merge origin/master` a la rama | limpio, sin conflicto. 9 commits, 54 archivos, +385/−6,158 | `0f6ebce` |
| 4 | `npm ci` | 623 paquetes; `npm audit`: 13 vulns (2 críticas, 8 altas, 3 moderadas) | — |
| 5 | Compuerta base `npx tsc --noEmit -p .` | **0 errores** | — |
| 6 | Compuerta base `npx vitest run` | **258 archivos, 3,105 verdes, 1 saltada** (p3: 260 / 3,194) | — |
| 7 | Compuerta base `npm run lint` | **0 errores, 17 warnings** (p3: 18) | — |
| 8 | `MAPA.md` — sección PASE 4 | ok | — |
| 9 | **7 auditores** lanzados en paralelo (frontend, backend, seguridad, fiscal, arquitectura, pruebas, rendimiento) | 7 archivos entregados | — |
| 10 | Los 7 entregaron | 108 fichas: 5 CRÍTICO · 44 ALTO · 39 MEDIO · 20 BAJO | — |
| 11 | Verificación adversarial del CRÍTICO de navegación, abriendo el código | real; **dos auditores llegaron a él por separado** (frontend y arquitectura) | — |
| 12 | Vuelta 1 — prueba que reproduce el CRÍTICO de navegación | 4 de 5 casos en rojo; `hrefsPintados('contador').length` = **0** | — |
| 13 | Vuelta 1 — arreglo: el sidebar pinta también NEGOCIO y GESTION | verde; suite 3,110 | `8d6ac51` |
| 14 | Verificación adversarial del ALTO fiscal del régimen | **el defecto es real, la consecuencia que declara NO**: la elegibilidad del 15% vive en `config`, no en `regimen_fiscal` | — |
| 15 | Vuelta 2 — prueba que reproduce el ALTO del régimen | 2 de 3 casos en rojo | — |
| 16 | Vuelta 2 — arreglo: `624` en el catálogo de la flota | verde; suite 3,113 | `12cc8c6` |
| 17 | Vuelta 2 — la suite atrapó una prueba congelada contra la mig. 0056 | se hizo derivar del CHECK vigente y afirmar **subconjunto**, no igualdad; verificada con mutante (clave `699` → roja) | `12cc8c6` |
| 18 | Vuelta 3 — prueba que reproduce el ALTO de `/dashboard/[id]` | 19 de 21 casos en rojo, con el `22P02` llegando a `exigir()` | — |
| 19 | Vuelta 3 — primer intento: guarda en `getLiquidacionDetalle` | **RECHAZADO por la suite: 15 fallos.** Dejaba inalcanzable el caso de fail-closed de `analytics.test.ts`. Revertido con `git checkout`. | — |
| 20 | Vuelta 3 — arreglo en la capa correcta: la guarda vive en la página | verde; suite 3,134 | `58c44f9` |
| 21 | Tope de 3 vueltas AGOTADO | 4 CRÍTICOS quedan pendientes con razón escrita | — |
| 22 | Tablero + captura, mirada | 12 rubros contados, notas cuadran con la síntesis | — |

Ningún arreglo se revirtió al final: los tres pasan la suite completa y los tres
mueren sin su cambio (verificado corriendo la prueba con el arreglo fuera).

**El intento fallido de la vuelta 3 vale tanto como los tres arreglos.** Poner la
guarda del uuid en `getLiquidacionDetalle` se veía más limpio —una sola línea, en
el único sitio que consulta— y la suite lo tumbó con 15 fallos por la razón
correcta: con la guarda ahí, el caso *"la base se cayó y esto DEBE lanzar"* se
volvía inalcanzable para cualquier id que no fuera uuid, y quince pruebas de
`analytics.test.ts` —incluida la del fail-closed— dejaban de probar lo que dicen.
Es exactamente el arnés que aparenta, y esta vez lo cazó la suite antes que un
auditor.

**Una prueba existente se ajustó, y aquí está por qué.**
`saas/fiscal.test.ts` afirmaba *"los catálogos que ofrece la pantalla son los que
la base acepta"* contra una lista escrita a mano copiada de la migración `0056`.
La `0088` —arreglo del CRÍTICO fiscal C3, de este mismo PR— agregó `624` al CHECK
hace tres días y la prueba no se enteró: la base aceptaba un régimen que la
pantalla no ofrecía, con el guardarraíl en verde. Ahora lee el CHECK vigente de
`supabase/migrations/` y afirma **subconjunto** en vez de igualdad, porque la
dirección que rompe es ofrecer una opción que el insert rechaza — al revés no:
`uso_cfdi` acepta `S01` y la pantalla no lo ofrece a propósito.


| # | Acción | Resultado | sha |
|---|---|---|---|
| 1 | `git status` al arrancar | **limpio** (HEAD detached en `94c0733`) → autofix HABILITADO | — |
| 2 | Decisión de tamaño de ronda | **COMPLETA** — ver nota abajo | — |
| 3 | Rama `claude/auditoria-17` creada desde `origin/master` (`94c0733`) | ok | — |
| 4 | `npm ci` | 623 paquetes; `npm audit`: 13 vulns (2 críticas, 8 altas, 3 moderadas) | — |
| 5 | Compuerta base `npx tsc --noEmit -p .` | **0 errores** | — |
| 6 | Compuerta base `npx vitest run` | **249 archivos, 3148 pasan, 1 saltada** | — |
| 7 | Compuerta base `npm run lint` | **0 errores, 18 warnings** | — |
| 8 | `MAPA.md` escrito | ok | — |
| 9 | 12 auditores lanzados en paralelo, un archivo cada uno | — | — |

## Por qué esta ronda es COMPLETA y no de continuación

El PASO 1 del encargo manda continuar si hay PR de auditoría abierto. Hay **tres**
abiertos (#6 `claude/auditoria-8`, #7 `claude/auditoria-10`, #8 `claude/auditoria-11`),
pero ninguno es un destino válido de continuación:

- `origin/master` está **50 commits adelante de los tres**, y las ramas divergieron
  83, 441 y 251 commits respectivamente.
- El propio último commit de `claude/auditoria-11` se titula *"la rama 99 commits
  detrás de master"*.
- Master ya absorbió las rondas **12 a 16** por su cuenta y luego borró
  `docs/auditoria-*` completo en `bc39cc1` ("limpieza total").

Continuar sobre `claude/auditoria-11` y hacer `--force` habría producido un PR cuyo
diff **revierte** las rondas 12–16 y la limpieza. Eso no es una continuación, es una
regresión. La última ronda real (la 16) aterrizó directo en master sin PR, así que
para la línea de trabajo viva **no hay PR abierto**, y sí hubo commits en `src/`,
`supabase/` y `normas/` (368 archivos, +1719/−1169 desde `4e866fc`) → **RONDA COMPLETA**.

**Pendiente para el dueño:** los PRs #6, #7 y #8 están muertos y conviene cerrarlos.
Mientras sigan abiertos, la regla de continuación del PASO 1 va a apuntar a ellos en
cada corrida.

## Fase de arreglo (tope: 3 vueltas — agotado)

| # | Acción | Resultado | sha |
|---|---|---|---|
| 10 | Los 12 auditores entregaron | 113 hallazgos, 7 CRÍTICO | — |
| 11 | Verificación adversarial de los 7 CRÍTICOS abriendo el código | los 7 son reales, 0 descartados | — |
| 12 | Vuelta 1 — prueba que reproduce el CRÍTICO agéntico | 2 de 3 casos en rojo | — |
| 13 | Vuelta 1 — arreglo: el jefe recibe el PDF del contralor | verde; suite 3,152 | `0d6bea7` |
| 14 | Vuelta 2 — prueba que reproduce el CRÍTICO de operabilidad | 1 de 3 casos en rojo | — |
| 15 | Vuelta 2 — arreglo: solo se suelta el lock propio | verde; suite 3,155 | `61cf600` |
| 16 | Vuelta 3 — prueba que reproduce el CRÍTICO fiscal | 2 de 4 casos en rojo | — |
| 17 | Vuelta 3 — arreglo: 624 Coordinados + mig. 0088 + bloque 63 | verde; suite 3,159 | `37612f1` |
| 18 | Contabilidad: anotar el paso de red que agregó el arreglo #13 | 8.9s → 9.4s contra 12s | `a30f7b0` |
| 19 | Tablero + captura, mirada | 12 rubros, notas cuadran | — |

Ningún arreglo se revirtió: los tres pasaron la suite completa y los tres fallan
sin su cambio (verificado corriendo la prueba antes del arreglo).

Dos pruebas existentes se ajustaron porque el arreglo cambió lo que afirmaban, y
en ambos casos se dejó escrito por qué:
- `ruta_pdf_sincronizada.test.ts` — su proxy de archivo entero era lo que fijaba
  el bug del PDF.
- `startup_diagnostico.test.ts` — encadenaba mocks por POSICIÓN y daba por hecho
  un `unlock` que ahora, correctamente, no ocurre.
- `presupuesto.test.ts` — el conteo de pasos del cierre pasa de 13 a 14.

---

# PASE 2 — ronda de CONTINUACIÓN (9-ago-2026)

| # | Acción | Resultado | sha |
|---|---|---|---|
| 20 | `git status` al arrancar | limpio (HEAD detached en `20ecbb1`) → autofix HABILITADO | — |
| 21 | Decisión de tamaño: PR **#9 abierto** sobre `claude/auditoria-17` | **CONTINUACIÓN** sobre esa rama, sin PR nuevo | — |
| 22 | `origin/master` del clon venía **stale** (`e4326f9`, historia sin ancestro común) | `git fetch origin master` → `20ecbb1` (forced update); la referencia vieja era basura del clon | — |
| 23 | Merge de `origin/master` (12 commits) en la rama | 1 conflicto en `verificaciones.sql`; colisión de `0086` renumerada a `0088` / bloque 63 | `c7c9a0e` |
| 24 | `npm ci` | ok | — |
| 25 | Compuerta post-merge `npx tsc --noEmit -p .` | **0 errores** | — |
| 26 | Compuerta post-merge `npx vitest run` | **255 archivos, 3,168 pasan, 1 saltada** | — |
| 27 | Compuerta post-merge `npm run lint` | **0 errores, 18 warnings** | — |
| 28 | `MAPA.md` actualizado con el delta del pase 2 | ok | — |
| 29 | 11 auditores lanzados en paralelo (tool calling NO: cero archivos suyos cambiaron) | 11 archivos entregados | — |
| 30 | Verificación adversarial de los 3 CRÍTICOS nuevos, abriendo el código | los 3 reales, 0 descartados | — |
| 31 | Vuelta 1 — prueba que reproduce el CRÍTICO frontend (panel en blanco) | 2 de 4 casos en rojo con la regla vieja | — |
| 32 | Vuelta 1 — arreglo: la marca del asistente mira también la ruta | verde; suite 3,172 | `d7b71a8` |
| 33 | Vuelta 2 — prueba que reproduce el CRÍTICO backend (afirma sin mirar) | 3 de 4 casos en rojo | — |
| 34 | Vuelta 2 — arreglo: una consulta por lote a `gasto`, fallando cerrado | verde; suite 3,176 | `709e410` |
| 35 | Vuelta 3 — prueba que reproduce el ALTO convergente (`?? 0`) | 2 de 6 en rojo, 4 controles verdes | — |
| 36 | Vuelta 3 — arreglo: `KpiDegradado` acepta `number \| null` y pinta '—' | verde; suite 3,182 | `e47b124` |
| 37 | Tope de 3 vueltas AGOTADO | 4 CRÍTICOS quedan pendientes con razón | — |

## Por qué esta ronda es de CONTINUACIÓN

El PR **#9** (`claude/auditoria-17`) estaba abierto, así que el PASO 1 manda
continuar sobre él. Se hizo, y no se abrió PR nuevo.

Dos cosas que costaron tiempo y conviene dejar escritas:

- **El `origin/master` del clon venía stale y de OTRA historia.** Apuntaba a
  `e4326f9` (3-ago), que **no tiene ancestro común** con la línea viva
  (`git merge-base 20ecbb1 origin/master` → vacío). Medir el delta contra esa
  referencia daba "50 commits, 494 archivos, −50,315 líneas", que es basura.
  `git fetch origin master` la corrigió a `20ecbb1` (forced update). Cualquier
  corrida futura que vea un diff absurdo debe sospechar esto ANTES de auditarlo.
- **Colisión de números de migración.** master trajo `0086_retirar_rol_operador`
  y `0087_recordatorio_comprobacion` mientras la rama de auditoría ya tenía su
  propio `0086`. Dos migraciones con el mismo número se aplican en orden
  indefinido. La de la auditoría se renumeró a `0088` y su bloque de
  `verificaciones.sql` de 62 a 63.

## Rubro NO auditado en el pase 2 (ver también el pase 3, al final)

**Tool calling**, y por una razón verificable: `git diff --name-only
94c0733..origin/master | grep -iE "agent|tool|llm"` devuelve **vacío**. Conserva
su 7/10 marcado *no auditado este pase*. La cobertura por rotación es
deliberada; repetir un auditor sobre código idéntico no produce señal.

---

# PASE 3 — ronda de CONTINUACIÓN (10-ago-2026)

| # | Acción | Resultado | sha |
|---|---|---|---|
| 38 | `git status` al arrancar | **limpio** (HEAD detached en `53c9d49`) → autofix HABILITADO | — |
| 39 | Decisión de tamaño: PR **#9 abierto** sobre `claude/auditoria-17` | **CONTINUACIÓN** sobre esa rama, sin PR nuevo | — |
| 40 | Delta de `master` desde el merge del pase 2 | **1 commit, 1 archivo, cero código**: `53c9d49` toca solo `normas/.latido-vigilancia` | — |
| 41 | `npm ci` | 623 paquetes, exit 0 | — |
| 42 | Compuerta base `npx tsc --noEmit -p .` | **0 errores** | — |
| 43 | Compuerta base `npm run lint` | **0 errores, 18 warnings** (mismo número que las dos líneas base previas) | — |
| 44 | Compuerta base `npx vitest run` | **257 archivos, 3,182 pasan, 1 saltada** — idéntico al cierre del pase 2, sin deriva | — |
| 45 | `MAPA.md` actualizado con el delta y con la lista de qué se relanza y por qué | ok | — |
| 46 | **3** auditores lanzados en paralelo (frontend · backend · pruebas) | — | — |
| 47 | Frontend entregó | 5/10 (antes 4) · 0 CRÍTICO · 5 MEDIO, 1 BAJO nuevos · 2 cerrados, 10 reincidentes, 1 AGRAVADO | — |
| 48 | Backend entregó | 4/10 (antes 5) · **1 CRÍTICO nuevo** · 3 ALTO, 1 BAJO · 1 CRÍTICO cerrado | — |
| 49 | Verificación adversarial del CRÍTICO del lease, abriendo los tres archivos | **real**: `conv.ts:419` pide 60s, `presupuesto.ts:188-190` documenta 72s de peor caso, `processor.ts:1751` no pasa `ttlMs`, y `grep ttlMs\|locked_until\|p_ttl_ms` sobre `conv_lock.test.ts` da **cero** | — |
| 50 | Vuelta 1 — prueba que reproduce el CRÍTICO del lease | **2 de 5 en rojo** (`expected 60000 to be greater than or equal to 72000`), 3 controles verdes | — |
| 51 | Vuelta 1 — arreglo: el lease se ata a `PRESUPUESTO_WEBHOOK_MS` | verde; suite **3,187** en worktree aislado | `3404616` |
| 52 | Verificación adversarial del ALTO agravado de frontend | **real**: `page.tsx:274` conserva `?? 0`, y `resumenPerdidas` es null cuando `safe()` se comió la consulta | — |
| 53 | Vuelta 2 — prueba que reproduce el ALTO agravado | **2 de 3 en rojo**, control verde; reverificada en las dos direcciones tras editar la prueba | — |
| 54 | Vuelta 2 — arreglo: `?? null` en el KPI de Ahorro, alcance de una celda | verde; suite **3,190** | `b9a191c` |

## Nota de proceso del pase 3 — el árbol compartido

Los tres auditores corren sobre el MISMO árbol de trabajo, y el de pruebas hace
experimentos de mutación (rompe una función a propósito, corre la suite,
revierte). Durante esa ventana `git status` muestra archivos de producción
modificados que **no son de nadie que esté arreglando nada**, y una corrida de
`npx tsc` de otro agente llegó a reportar un error irreproducible.

Dos consecuencias prácticas, ya aplicadas:

- **No se commitea un archivo de producción que no escribiste tú en esta vuelta.**
  Un mutante commiteado es una verificación de firma desactivada entrando al PR.
- **La suite de la vuelta 1 se corrió en un `git worktree` aparte** (`HEAD` +
  solo los tres archivos del arreglo, con `node_modules` enlazado), porque el
  árbol principal tenía un mutante en vuelo. Una suite verde medida sobre el
  experimento de otro no prueba nada del arreglo propio.
| 55 | Pruebas entregó (el último de los 3) | 5/10 (se queda) · 0 CRÍTICO nuevo · 4 ALTO · C6 REINCIDENTE verificado en vivo | — |
| 56 | Verificación adversarial del ALTO del lote truncado | **real y peor de lo reportado**: el comentario dice "se pide limit amplio" y NO hay `.limit()` — riding del `max_rows` de PostgREST | — |
| 57 | Vuelta 3 — prueba que reproduce el lote truncado | **3 de 4 en rojo**: 16 folios acusados en falso, `expected 1000 to be 1200` | — |
| 58 | Vuelta 3 — arreglo: la lectura de `gasto` pasa por `traerTodo` | verde; suite **3,194** | `ea23059` |
| 59 | Tope de 3 vueltas AGOTADO | 5 CRÍTICOS pendientes con razón; 4 ALTO nuevos propuestos | — |
| 60 | Tablero reescrito para el pase 3 + captura + **mirada** | 12 rubros contados, notas suman 59 → 4.9, color por nota y no por delta | — |
| 61 | `00-SINTESIS.md` y `RESULTADO.md` del pase 3 | ok | — |

---

# PASE 5 — 12-ago-2026 (ronda de CONTINUACIÓN sobre el PR #9, en la nube)

- `git status` limpio al arrancar (HEAD en `927e78f`, punta de `claude/auditoria-17`) → **autofix habilitado**.
- PR #9 abierto y verificado con `list_pull_requests` → continuación, **no** se abre PR nuevo.
- `origin/master` = `003c88a`, **ancestro** de esta rama → master no avanzó desde el pase 4. Nada que mergear.
- `npm install` (el contenedor de la nube clona sin `node_modules`) → exit 0.
- Compuerta línea base: `tsc --noEmit` 0 · `lint` 0 errores / 17 warnings · `vitest` **261 archivos, 3,134 verdes, 1 saltada**. Idéntica al cierre del pase 4.
- `npm run build` NO se corre (sin credenciales en la nube; su fallo no diría nada del código).
- MAPA.md actualizado con la sección del pase 5: 6 rubros a relanzar de 12.
- Auditores: 6 lanzados en paralelo, 6 entregaron. Notas: frontend 3→5 · backend 5→4 · seguridad 6→5 · fiscal 5→4 · arquitectura 4→4 · pruebas 5→6.
- **Vuelta 1** — CRÍTICO [backend] `aplicarFactura` no podía escribir nunca. Verificado por mí contra un Postgres 16.13 efímero: `on conflict (stripe_invoice_id)` contra el índice PARCIAL de la 0052 da `42P10`, también con la tabla vacía. Prueba `onconflict_indice_total.test.ts` (falla 2/6 sin el arreglo) → migración `0089` → bloque 64 de `verificaciones.sql` (probado en los dos sentidos) → suite verde. Commit `0b4cadd`.
  - Tropiezo intermedio, anotado porque el guardarraíl funcionó: la 0089 puso roja `migraciones_verificadas.test.ts` (toda migración necesita bloque o exención escrita). Se escribió el bloque 64, y no cuadró a la primera: el test lee SOLO la línea del título y `(mig. 0089)` había quedado en la segunda.
- **Vuelta 2** — ALTO [fiscal] el `<select>` de `/admin/flotas:218` ofrecía 8 claves que el CHECK de la 0088 rechaza y escondía 3 que acepta (entre ellas 626 RESICO). Prueba `regimen_catalogo.test.ts` (falla 1/3 sin el arreglo, listando las once claves) → la página deriva de `REGIMENES` → suite verde. Commit `93af2fd`.
- **Vuelta 3** — ALTO [backend] `id_no_uuid.test.ts` sobrevivía a invertir la guarda. Dos casos nuevos que EJECUTAN la página con la consulta mockeada. Medido: con la guarda invertida el archivo pasa de 23 verdes a 2 fallos. Árbol restaurado tras la mutación (`git diff` vacío sobre `page.tsx`). Commit `9ea0824`.
- Tope de 3 vueltas agotado. Ningún arreglo revertido.
- Tablero reescrito para el pase 5, capturado (1400×3420) y MIRADO: 12 rubros contados, suma 57 → 4.8, cuadra con la síntesis.
- Compuerta final: tsc 0 · vitest 263 archivos / 3,145 verdes / 1 saltada · eslint 0 errores / 17 warnings.
