# Progreso — auditoría 19 (24-ago-2026)

Una línea por acción, con su sha cuando aplique. Se escribe **mientras** avanza.

- `11:00` — `git status` limpio, HEAD `8b43121` == `origin/master`. **Autofix habilitado.**
- `11:00` — `list_pull_requests(state=open)` → solo dos de Dependabot (#50, #51). **Ningún PR de auditoría abierto** → ronda **COMPLETA**, no continuación.
- `11:00` — delta `583fec4..8b43121` en `src/ supabase/ normas/`: **162 archivos, +10,807 / −548**. Los doce rubros tienen código nuevo → se relanzan los doce.
- `11:01` — rama nueva `claude/auditoria-19`. `docs/auditoria-19/MAPA.md` escrito.
- `11:02` — `npm ci` exit 0 (el repo se clona sin `node_modules`).
- `11:03` — compuerta: `tsc --noEmit` **verde** (exit 0).
- `11:05` — compuerta: `vitest run` **verde** — 501 archivos, 6,434 pruebas, 1 saltada, exit 0.
- `11:06` — compuerta: `npm run lint` → **0 errores, 157 avisos** (la c4 reportó 24). Anotado en `compuerta.md`.
- `11:06` — **12 auditores lanzados en paralelo**, contexto fresco, uno por rubro.
- `11:08` — **CI de `master` verificado contra la API de GitHub** sobre `8b43121`:
  `CI` #1012 **success**, `CI Postgres (aislamiento entre tenants)` #381 **success**
  (08:03→08:04), `CodeQL` #251 **success**, `Salud de producción` #98–#102 **success**.
  **El `ci-postgres` que la c4 reportó 24 h en rojo (runs #308 y #311) hoy está verde.**
- `11:08` — `git add` normal **rechaza** `docs/auditoria-19/`: `.gitignore:34` trae
  `docs/auditoria-*/` desde `f5bdc3f` (21-ago, colado en un commit de operabilidad).
  `docs/auditoria-18/` sobrevive solo porque ya estaba rastreada. Se usa `git add -f`.
  **Sin esto la ronda entera se pierde en silencio del PR.**
- `11:09` — `83c9a89` commit de arranque (MAPA + compuerta + diario).

## Arreglos

- `11:20` — **BACK-19-1 (CRÍTICO) arreglado**, `dae7f64`. El outbox de WhatsApp era el
  único de los siete crons sin `leerInterruptor`. Prueba nueva
  `src/app/api/cron/wa-outbox/route.test.ts`: **sin el arreglo, 2 de 4 rojas** — el
  `fetch` a `graph.facebook.com` se dispara con el interruptor en `apagado` y en
  `ilegible`. Suite completa después: 502 archivos, 6,438 verdes. `tsc` limpio.
- `11:26` — **FE-19-1 (CRÍTICO) arreglado**, `5669a73`. `redirect()` dentro de un
  `try/catch` en `dashboard/page.tsx`; el `catch` desnudo se tragaba el `NEXT_REDIRECT`.
  Confirmado contra los docs de Next empaquetados en el repo
  (`01-app/03-api-reference/04-functions/redirect.md:53`). Prueba nueva
  `src/app/dashboard/onboarding_gate.test.tsx`: **sin el arreglo, 2 de 5 rojas** y la
  página devolvía `<InicioContenido>` en vez de redirigir. Suite después: 503 archivos,
  6,443 verdes. `tsc` limpio, `lint` 0 errores.
- **Tope de 3 vueltas: se usaron 2.**

## Colisión entre auditores (INFRA, no hallazgo)

- `11:26` — una corrida completa salió con **1 roja**. NO era mía: el auditor de pruebas
  tenía viva en el árbol una mutación suya (`cuentas.ts`, quitándole
  `.eq('tenant_id', tenantId)` a tres consultas). El auditor la revirtió; la corrida
  siguiente salió **503 archivos, 6,443 verdes**. Mis dos commits se armaron con rutas
  explícitas, así que no arrastraron nada ajeno — verificado con `git show --stat`.
- El auditor de datos avisó de otras dos mutaciones que vio pasar
  (`wa_outbox.ts:39` con `if (false)`, y los topes de diésel/caseta intercambiados en
  `entrevista-aplicar.ts:158-159`). **Las dos estaban ya revertidas** cuando las revisé.
