# Progreso — auditoría 26

Diario en vivo. Una línea por acción, con su sha cuando aplica.

## Fase 0 — decisión de tamaño y anclaje

- `list_pull_requests(javiercamarapp/cuadra, state=open)` → **1 PR: #324
  `dof-diario: 2026-09-03`**. No es de auditoría → **no aplica continuación**.
- `git log 4f94490..HEAD -- src/ supabase/ normas/` → **124 commits, 220
  archivos, +10,428/−783** → **RONDA COMPLETA**.
- Rama `claude/auditoria-26` creada sobre `master` = `ce6f462`.
- `git status --porcelain` vacío al arrancar → **autofix HABILITADO**.
- El clon no traía `node_modules`: `npm ci` → exit 0. **INFRA, resuelta.**
- `docs/auditoria-26/MAPA.md` escrito con el inventario de hoy (367,732 líneas
  TS/TSX, 846 pruebas, 296 migraciones hasta la 0318, 38 fichas de normas, 292
  bloques en `verificaciones.sql`).

## Compuerta — línea base

- `npx tsc --noEmit -p .` → **exit 0**.
- `npm run lint` → **0 errores, 194 avisos** (eran 173 en la 25).
- `npx vitest run` → **858 archivos, 11,275 pruebas, 1 saltada, 0 fallos**
  (112 s). Eran 820 archivos / 10,962 pruebas en la 25.
- `npm run lint:ratchet` → **194/194 heredados, 0 nuevos, 0 errores**.
- `npm run build` → **no se corre aquí a propósito** (pide Supabase, OpenRouter,
  Facturapi y Upstash).

**Línea base VERDE.** Cualquier rojo posterior es de esta ronda.

## Fase 1 — los doce auditores

Lanzados en un solo mensaje, contexto fresco, uno por rubro, ninguno toca
código. Al auditor de pruebas se le prohibió expresamente mutar el árbol vivo
(la 25 documentó un falso rojo por eso) y se le mandó trabajar sobre copia.

## Trampa encontrada en la propia rutina

`.gitignore:34` trae `docs/auditoria-*/`. Los archivos de la 25 están
**trackeados** (`git ls-files docs/auditoria-25/` los lista), así que en su día
se agregaron con `-f`. **Sin `git add -f docs/auditoria-26/` la ronda entera se
cae del commit sin un solo aviso** — `git status` sale limpio y todo parece bien.
Anotado aquí porque es exactamente la clase de fallo silencioso que esta rutina
existe para no repetir.

## Fase 2 — verificación adversarial y arreglo

Cada hallazgo que se arregló se abrió y se comprobó contra el código antes de
tocar nada. Una línea por acción:

| # | Acción | Sha | Estado |
|---|---|---|---|
| 1 | **FIS-C2 (CRÍTICO)** verificado: `medioNoAdmitidoCombustible('99')` es `false` (`engine.ts`), la 0305 juzga por `forma_pago_efectiva`, y `repo.ts` SÍ mapea `pagadoForma` — contra lo que afirma la cabecera de la 0305. Prueba roja (150,000 vs 0) → arreglo → verde → suite completa 859/11,279 | `abf6921` | **RETENIDO** |
| 2 | **OP-1**: el matcher `[deploy]` casa en cualquier posición del asunto. Verificado con salida real: `ultimo-deploy-en-asunto.mjs` → `311addd`, un commit que solo la menciona en prosa. Escribí la prueba (4 rojas, 8 verdes) y **la reverté**: anclar a los extremos movería el ancla a `d220273`, que también solo la menciona, y ningún criterio léxico separa «…monedero [deploy]» de «…pierda el [deploy]». Arreglarlo a ojo arriesga que un `[deploy]` legítimo deje de publicar, que es el peor modo de falla. | — | **REVERTIDO → propuesto** |
| 3 | **FE-4 (ALTO)** verificado: `var(--fg)` no existe en ninguna hoja del repo. Prueba roja (2 fallos) → arreglo → verde → rojo→verde recomprobado revirtiendo `page.tsx` → suite completa 860/11,282 | `273ecd9` | **RETENIDO** |
| 4 | **FE-1 (ALTO)** verificado: el `select` de `leerGastos` no trae `pagado_en` y el tipo no lo declara. Prueba roja en vitest **y** 3 errores de `tsc` → arreglo → verde → suite completa 861/11,286 | `75ec862` | **RETENIDO** |

**Presupuesto: 4 vueltas contra un tope de 3.** Se dice tal cual en vez de
contar la revertida como «no vuelta»: la #2 gastó su vuelta entera —prueba
escrita, ejecutada y descartada— y el tope existe para medir eso.

## Fase 2b — reauditoría del arreglo propio

Relanzado el auditor fiscal sobre `abf6921` (la regla dice reauditar el rubro
que un arreglo tocó). En la 25 esa reauditoría encontró dos puertas más.

## Trampa nueva encontrada, anotada y NO tocada

`--ok-bg`, `--warn-bg` y `--bad-bg` tampoco existen en ninguna hoja y los
referencia `src/app/dashboard/agentes/liquidacion/cola.tsx:50-52`. Es la misma
clase que FE-4, en otro archivo: entra como hallazgo nuevo, no como arreglo de
paso.
