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
| 9 | Commit de arranque (MAPA + compuerta + backend). `git add -f` porque `.gitignore:34` ignora `docs/auditoria-*/`. Pusheado a `origin/claude/auditoria-25`. | `a9aec4d` |
| 10 | **Anotado como riesgo de método:** el auditor de Pruebas tiene mutaciones VIVAS en el árbol (6 archivos: `compuerta-deploy.mjs`, `chat/tenant.ts`, `definiciones.ts`, `poliza.ts`, `fiscal.ts`, `revision.ts`). Ninguna entró al commit (solo se agregaron los 3 `.md`). Mientras duren, toda verificación se hace contra `git show HEAD:<archivo>`, no contra el disco. **Al cerrar hay que comprobar que el árbol quedó limpio.** | — |
| 11 | BE-C1 (nuevo, póliza) **verificado contra el código**: `grep` de desglose sobre la 0299 → 0 ocurrencias; `poliza.ts:205` `comprobado = anticipo − diferencia` (se mueve) contra `:203` `subtotalDeclarado` y `liq.ivaAcreditable` (no se mueven); `:230` los resta. CONFIRMADO. | — |
| 12 | AGEN-C1 **verificado y CONFIRMADO**: `contactos.ts:75,82` sí filtra `activo` (arreglo `70dd5c6` de la 24), pero `telefonoParaDineroDe` (`:141-154`), `telefonosJefe` (`:168-195`) y `telefonoDeRol` (`asistencia_escalamiento.ts:107-115`) no lo mencionan — `grep activo asistencia_escalamiento.ts` → sin resultados. | — |
| 13 | **Corrección al escenario de AGEN-C1** (revisar-sin-ceder): `usuarios_escritura.ts:186` impide dar de baja al ÚNICO `flota_admin` activo, así que el escenario «único dueño» del auditor no ocurre. El guardarraíl solo cubre `flota_admin`: con un **contador** no hay guarda, y con dos dueños el `.find()` de `:150` puede quedarse con la fila de baja. **El hallazgo aguanta; se anota el escenario corregido.** | — |
| 14 | OP-C1/OP-C2 **verificados por mi cuenta**: `git log -1 --pretty=%s 4f94490` → `Merge pull request #318 from javiercamarapp/deploy/trigger-chat-fix` (SIN `[deploy]` en el asunto; la bandera viaja en el cuerpo, heredada de `5a14012`). Último `[deploy]` real en asunto por first-parent: `3cc8ead`. `git log --oneline --first-parent 3cc8ead..HEAD` → 10, menos mi propio commit de auditoría = **9 sobre master**. `git diff --name-only 3cc8ead..HEAD -- supabase/migrations/` → **0302 y 0303**. CONFIRMADO: el Redeploy del panel ya NO basta. | — |
