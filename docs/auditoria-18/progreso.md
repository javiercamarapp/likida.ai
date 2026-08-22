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
| 48 | Arreglo de merge: `processor_oficina_despacho.test.ts` esperaba los 2 argumentos del `reengancharPendiente` de la rama; `master` resuelve el desempate arriba, en `atenderTextoOficina`. Assertion alineada a la firma de `master` | (en `de5e7bc`) |
| 49 | Arreglo de merge: `migraciones_verificadas.test.ts` quedó con `'0141'` **dos veces** (TS1117) — la entrada de la rama citaba un «bloque 111» que tras el merge es la RLS de `liquidacion`. Retirada la duplicada | (en `de5e7bc`) |
| 50 | Compuerta verde tras los dos arreglos de merge: `tsc` limpio, `eslint` 0 errores / 5 avisos (los mismos de la línea base) | verde |
| 51 | 12 auditores relanzados en paralelo, contexto fresco, uno por rubro → `<rubro>-c3.md`. Los 12 tienen código cambiado en el delta | — |
