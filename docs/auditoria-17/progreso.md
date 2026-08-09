# Progreso — auditoría 17 (8-ago-2026)

Una línea por acción, con su sha. Se escribe MIENTRAS avanza, no al cerrar.

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

## Rubro NO auditado en el pase 2

**Tool calling**, y por una razón verificable: `git diff --name-only
94c0733..origin/master | grep -iE "agent|tool|llm"` devuelve **vacío**. Conserva
su 7/10 marcado *no auditado este pase*. La cobertura por rotación es
deliberada; repetir un auditor sobre código idéntico no produce señal.
