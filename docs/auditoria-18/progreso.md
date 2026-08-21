# Diario de la auditoría 18

Una línea por acción, con su sha cuando la hay. Se escribe MIENTRAS avanza.

| # | Acción | Resultado |
|---|---|---|
| 1 | Decidir tamaño de ronda: `list_pull_requests` (state=open) → 3 PRs abiertos (#30 dof-diario, #32 comprobantes-fotos, #33 aviso-facturación), **ninguno de auditoría**. `git log 0255b8c..8d608a4 -- src/ supabase/ normas/` → 47 commits. | **RONDA COMPLETA**, rama nueva `claude/auditoria-18` |
| 2 | `git status` al arrancar | limpio → **autofix habilitado** |
| 3 | `npm install` | **INFRA**: 403 en `cdn.sheetjs.com` (xlsx pinneado a tarball fuera del registry). Se instaló `xlsx@0.18.5` del registry y se restauró `package.json`/`package-lock.json` con `git checkout` — árbol auditado = `master` |
| 4 | Compuerta base: `npx vitest run` | VERDE — 388 archivos, 5,045 pruebas, 1 saltada, exit 0 |
| 5 | Compuerta base: `npx tsc --noEmit -p .` | VERDE — salida vacía |
| 6 | Compuerta base: `npx eslint src/` | VERDE — 0 errores, 5 avisos |
| 7 | `docs/auditoria-18/MAPA.md` + `compuerta.md` escritos | — |
| 8 | 12 auditores lanzados en paralelo, contexto fresco, uno por rubro | — |
| 9 | Los 12 rubros entregados | 83 hallazgos: 5 CRÍT · 30 ALTO · 30 MEDIO · 18 BAJO |
| 10 | **Corrección de anclaje**: la ronda es la 18, no la 6 (ramas `claude/auditoria-{3,4,6,7,8,10,11,17}` en el remoto). Rama y docs renombrados antes de publicar | — |
| 11 | **Corrección de anclaje**: la ronda 17 (global 4.2) no tiene ancestro común con `master` → esta ronda NO reporta delta | — |
| 12 | Rescate: 4 commits vivían solo en el HEAD desacoplado del contenedor, en ninguna rama remota | pusheados a `claude/rescate-trabajo-sin-rama` |
| 13 | Verificado AGEN-1 (informe PDF acusado sin entregar) → prueba roja sin arreglo → arreglo → verde → suite completa | `4f25078` |
| 14 | Verificado ARQ-1 CRÍTICO (CFDI que ampara N casetas) → prueba da $250 de $2,000 sin arreglo → arreglo → verde | `ebefdfa` |
| 15 | Verificado AGEN-4/OPER-1 (el sondeo libera el lease ajeno) → 2 pruebas rojas sin arreglo → arreglo → verde. Se comprobó revirtiendo que siguen rojas | `e1b9474` |
| 16 | Verificado FISC-1 contra `normas/rmf-2026-9.1.8.yaml` (fuente primaria): confirmado, **no arreglado** — gatear el estímulo exige decidir qué hacer con `formaPago '99'` | propuesto |
| 17 | Verificado LEGAL-1 CRÍTICO contra la ruta y la migración 0138: confirmado, **no arreglado** — el arreglo es un aviso, no código | propuesto |
| 18 | Compuerta final, dos corridas limpias: 5,050 pruebas, tsc limpio, eslint 0 errores | verde |
| 19 | Tablero renderizado, capturado y **mirado**; se corrigió un defecto de CSS en el aviso y un recorte del alto | `tablero.png` |

## Continuación — 21-ago-2026

| # | Qué pasó | sha / resultado |
|---|---|---|
| 20 | PR #34 sigue abierto → **ronda de continuación**, no ronda nueva. Checkout de `claude/auditoria-18` | — |
| 21 | `master` avanzó `553bee7 → d432e89`: 9 commits, 53 archivos, +3,691/−297 en `src/`+`supabase/`. Mergeado a la rama | `6c18684` |
| 22 | **INFRA**: `npm ci` limpio falla 403 contra `cdn.sheetjs.com` (fuera de la política de red). Se instaló todo desde el lock sin `xlsx` y luego `xlsx@0.18.5` del registry; `package.json`/`package-lock.json` restaurados con `git checkout` → árbol limpio | mismo workaround que la ronda 18 |
| 23 | **La compuerta arranca ROJA, y el rojo es de `master`**: `migraciones_verificadas.test.ts` falla — las migraciones 0140–0143 no tienen bloque en `verificaciones.sql` ni razón en `EXENTAS` | `1 failed \| 5,126 passed` |
| 24 | Confirmado en worktree limpio sobre `d432e89` puro: no lo causó la auditoría. Rompió en `0bfb51c` (20-ago 11:18 CST) y le entraron **4 commits `[deploy]` encima** | CONT-1 |
| 25 | `npx tsc --noEmit` limpio · `npx eslint src/` 0 errores, 5 avisos (los mismos de la línea base) | verde |
| 26 | 12 auditores relanzados en paralelo sobre el delta (todos los rubros tienen código cambiado), cada uno escribe `<rubro>-c2.md` | — |
| 27 | Los 12 rubros entregados en `<rubro>-c2.md` | 114 hallazgos: 16 CRÍT · 41 ALTO · 39 MEDIO · 18 BAJO |
| 28 | Verificado CONT-1 abriendo la prueba, el worktree limpio sobre `d432e89` y el historial de CI por API | 5 corridas rojas seguidas |
| 29 | Arreglo CONT-1: bloque 111 para las columnas GENERADAS (0140/0142/0143), 0141 exenta con razón. La prueba ya estaba roja → verde | `dcc77d3` |
| 30 | Verificado AGEN-C2-1/BACK-C2-2 leyendo el orden real de `atenderTextoOficina` (`processor.ts:443-501`) | confirmado |
| 31 | Prueba que lo reproduce → roja sin arreglo («Tengo este viaje esperando…» en vez de null) → arreglo → verde → suite completa 5,132 | `b0b8a87` |
| 32 | Verificado FISC-C2-1 contra `administracion.ts:158`, la ficha `rfa-2026-2.9.yaml` (fuente primaria) y el catálogo `c_RegimenFiscal` | confirmado |
| 33 | Prueba que lo reproduce → roja (`regimenElegible: true`) → arreglo 601→624 + leyenda del panel → verde → suite 5,134 | `17c6343` |
| 34 | Tope de 3 vueltas de arreglo GASTADO. Los 13 críticos restantes quedan propuestos con su razón | — |
| 35 | Tablero `tablero-c2.html` renderizado y **mirado**: se corrigieron dos defectos (chips de severidad partidos en dos líneas, pie cortado) y se recapturó | `tablero-c2.png` |
| 36 | Compuerta final: 393 archivos, 5,134 pruebas, 1 saltada; `tsc` limpio; `eslint` 0 errores / 5 avisos | verde |
| 37 | Síntesis `00-SINTESIS-c2.md` y `RESULTADO.md` escritos. Global 4.8 (−1.3), ninguna nota subió | — |
