# Progreso — auditoría 25 (se escribe MIENTRAS avanza)

| # | Acción | Sha / evidencia |
|---|---|---|
| 1 | Decidido el tamaño de ronda ANTES de gastar tokens: `list_pull_requests(open)` → `[]` (sin PR de auditoría); `git log b8a1a3a..HEAD -- src/ supabase/ normas/` → 7 commits. → **RONDA COMPLETA**. | — |
| 2 | Rama `claude/auditoria-25` creada sobre `master` = `4f94490`. Árbol limpio → **autofix habilitado**. | `4f94490` |
| 3 | `node_modules` no venía en el clon → `npm ci`, exit 0. | INFRA resuelta |
| 4 | Compuerta base: `npx vitest run` → **819 archivos, 10,950 pasadas, 1 saltada, exit 0**. | verde |
| 5 | Compuerta base: `npx tsc --noEmit -p .` → **exit 0**. | verde |
| 6 | Compuerta base: `npm run lint` → **0 errores, 173 avisos**. | verde |
| 7 | `docs/auditoria-25/MAPA.md` escrito con el delta de los 7 commits. | — |
| 8 | 12 auditores lanzados en un solo mensaje, contexto fresco, uno por rubro. | — |
