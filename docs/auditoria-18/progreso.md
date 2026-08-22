# Diario de la auditoría 18

Una línea por acción, con su sha. Se escribe **mientras** avanza, no al cerrar.

## Ronda 18 — 20-ago-2026

| # | Qué pasó | sha / resultado |
|---|---|---|
| 1-19 | (ver historial; resumen en `RESULTADO.md`) | 83 hallazgos, 3 arreglos |

## Continuación — 21-ago-2026

| # | Qué pasó | sha / resultado |
|---|---|---|
| 20-42 | (ver historial) | 114 hallazgos, 3 arreglos, global 4.8 |

## Continuación 3 — 22-ago-2026

| # | Qué pasó | sha / resultado |
|---|---|---|
| 43 | PR #34 sigue **abierto** → **ronda de continuación**, no ronda nueva. Checkout de `claude/auditoria-18` | — |
| 44 | `master` avanzó `d432e89 → 21630c0`: **116 commits, 252 archivos, +16,055/−1,348**. Casi todo es el **PR #38 (`auditoria-18-fixes`)**, una campaña de arreglo hecha FUERA de esta rama contra los 83 hallazgos de la 18 | — |
| 45 | Merge de `master` en la rama. **3 conflictos**, los tres porque la rama y `master` arreglaron el MISMO hallazgo distinto. Tomé el lado de `master` en los tres (es el más amplio y es lo que está publicado) | `673496f` |
| 46 | **El INFRA de `xlsx` ya no aplica**: `5eca3ab` lo vendorizó en `vendor/`. `npm ci` corrió **limpio**, sin workaround y sin tocar `package.json` | resuelto |
| 47 | Compuerta tras el merge: **2 fallos, los dos secuela de mi resolución**, no de `master` ni de la rama por separado | `1 failed \| 5,513 passed` + TS1117 |
| 48 | Arreglo de merge: `processor_oficina_despacho.test.ts` esperaba los 2 argumentos del `reengancharPendiente` de la rama; `master` resuelve el desempate arriba, en `atenderTextoOficina`. Assertion alineada a la firma de `master` | (en `38eef84`) |
| 49 | Arreglo de merge: `migraciones_verificadas.test.ts` quedó con `'0141'` **dos veces** (TS1117) — la entrada de la rama citaba un «bloque 111» que tras el merge es la RLS de `liquidacion`. Retirada la duplicada | (en `38eef84`) |
| 50 | Compuerta verde tras los dos arreglos de merge: `tsc` limpio, `eslint` 0 errores / 5 avisos (los mismos de la línea base) | verde |
| 51 | 12 auditores relanzados en paralelo, contexto fresco, uno por rubro → `<rubro>-c3.md`. Los 12 tienen código cambiado en el delta | — |
| 52 | Los 12 rubros entregados en `<rubro>-c3.md` | 92 hallazgos: 9 CRÍT · 33 ALTO · 33 MEDIO · 17 BAJO |
| 53 | Verificado FISC-C3-2 abriendo `fiscal.ts:559-571` (cinco comprobaciones, cero menciones de `'99'`) contra `engine.ts:1116` | confirmado |
| 54 | Prueba que lo reproduce → 2 rojas (panel $8,000 / motor $0 sobre el mismo UUID) → arreglo → verde → suite completa 5,518 | `a44efa2` |
| 55 | Verificado FISC-C3-1 abriendo `engine.ts:410` y la lista cerrada `MEDIOS_LISR_27_III` de `:113`, contra la ficha `rfa-2026-2.9.yaml` (fuente primaria) | confirmado |
| 56 | Prueba que lo reproduce → 8 rojas ('06','08','12','17','23' salían deducibles) → arreglo en motor + panel + rótulos → verde → suite 5,537 | `d0e9844` |
| 57 | **Fuera de alcance, dicho en el commit**: el numerador del 15% vive también en SQL (`0112:151`, `0084:19`) y sigue en `forma_pago = '01'`. Pide migración; aquí no hay base | propuesto |
| 58 | Verificado ARQ-C3-1 comparando `vista.tsx:152-157` contra `NO_DEDUCIBLE_ISR`/`POR_CONFIRMAR` (`engine.ts:222-223`): la lista del panel no era ninguna de las dos | confirmado |
| 59 | Prueba que lo reproduce → 5 rojas → arreglo (el panel importa las listas del motor) → verde → suite 5,544 | `35ba042` |
| 60 | Los tres arreglos comprobados revirtiendo con `git stash`: las pruebas vuelven a rojo. Ninguno revertido | verde |
| 61 | **Tope de 3 vueltas de arreglo GASTADO.** Los 6 críticos restantes quedan pendientes con su razón escrita | — |
| 62 | Tablero `tablero-c3.html` renderizado, capturado y **mirado**: 12 rubros contados, notas suman 70 → 5.8, serie en el orden correcto. Recapturado una vez para quitar lienzo en blanco | `tablero-c3.png` |
| 63 | Compuerta final: 435 archivos, 5,544 pruebas, 1 saltada; `tsc` limpio; `eslint` 0 errores / 5 avisos | verde |
| 64 | Síntesis `00-SINTESIS-c3.md` y `RESULTADO.md` escritos. Global 5.8 (+1.0); once notas suben, fiscal se queda en 4 | — |
