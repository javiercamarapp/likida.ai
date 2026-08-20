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
