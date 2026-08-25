# Diario — auditoría 19, continuación 2 (25-ago-2026)

Una línea por acción, escrita **mientras** avanza. Corrida desatendida en la nube.

---

**11:01** · Arranque. `git status` → *nothing to commit, working tree clean* → **autofix habilitado**. HEAD llegó **detached** desde `refs/heads/master` (`69aa71b`); es cómo clona el contenedor de la routine, no un árbol sucio.

**11:02** · `list_pull_requests(javiercamarapp/cuadra, state=open)` → **PR #52 abierto**, rama `claude/auditoria-19`, borrador, del 24-ago 11:11Z: *«Auditoría 19 (24-ago) — global 4.7, −0.6 · ningún rubro sube · 3 arreglados con prueba · producción no tiene el commit de ayer»*. **→ RONDA DE CONTINUACIÓN.** No se abre PR nuevo.

Nota de infra, no de código: el remoto se llama `javiercamarapp/cuadra` y GitHub lo sirve como `javiercamarapp/likida.ai` — el repositorio se renombró y los `html_url` salen con el nombre viejo. Es el mismo repositorio; los enlaces del PR no están rotos.

**11:03** · `git checkout -B claude/auditoria-19 origin/claude/auditoria-19`. Los **doce** archivos de rubro de la ronda 19 existen. Lo que cambió es el código debajo.

**11:04** · `git merge origin/master --no-edit` → **limpio, sin conflictos**. Delta `8b43121` → `69aa71b`: **115 archivos, +4,974 / −1,026** en `src/`, `supabase/`, `normas/`, en 6 commits. Los doce rubros tienen superficie nueva → se relanzan los doce.

**11:05** · `npm test` → `sh: 1: vitest: not found`. **INFRA, no hallazgo**: el contenedor clona el repo sin `node_modules`. `npm ci` → exit 0. Lo mismo con el primer `npx tsc`: sus dos errores (`Cannot find module 'vitest/config'`, `Cannot find name 'node:url'`) eran de dependencias ausentes, no del código. Se descartan y se vuelve a correr.

**11:06** · `MAPA-c2.md` escrito con el delta de los 6 commits y el ancla de las doce notas de la ronda 19 (global 4.7).

**11:07** · **Compuerta base, con dependencias instaladas:**

```
npm test  →  Test Files  517 passed (517)
                  Tests  6519 passed | 1 skipped (6520)
               Duration  85.08s          [exit 0]
```

```
npx tsc --noEmit -p .  →  (sin salida)                        [exit 0]
npm run lint           →  ✖ 156 problems (0 errors, 156 warnings)  [exit 0]
```

Los tres verdes. (Un `npx tsc -p .` intermedio devolvió `TS5057: Cannot find a tsconfig.json` — era el directorio de trabajo de un comando en segundo plano, no el proyecto. **INFRA, no hallazgo.**)

`npm run build` **no se corre** a propósito: pide Supabase, OpenRouter, Facturapi y Upstash, que en la nube no existen, y su fallo no dice nada del código. `pruebas-manuales/*.prueba.ts` tampoco: hacen llamadas reales de pago.

**11:08** · Doce auditores lanzados en un solo mensaje, contexto fresco, uno por rubro, cada uno escribiendo **un solo archivo** `docs/auditoria-19/<rubro>-c2.md`. Ninguno toca código (excepción acotada y explícita para el de pruebas: puede romper una función a propósito para ver si su prueba se pone roja, y debe revertir con `git checkout --` y confirmar árbol limpio).

---

**11:20** · Llegan fiscal y legal. Fiscal 3/10 (22 hallazgos, 4 críticos, **cerrados: cero**); legal 3/10 (28, 4 críticos, **1 de 22 cerrado y por colateral**). Verifico el hallazgo fiscal más fuerte abriendo `intake/ocr.ts:60-76`: **confirmado** — los dos campos del delta se retiraron del esquema el 24-ago porque tumbaron el OCR en producción, y `engine.ts:625` y `:950` siguen leyéndolos. Los dos arreglos fiscales de `6340aac` están inertes.

**11:21** · **ARREGLO 1.** Backend entrega 5/10 con un CRÍTICO en `openrouter.ts:515`. Verificado línea por línea: `calcCost(model, tokIn, tokOut)` cobra su 2º argumento como tokens y se le pasaba la longitud en caracteres. Prueba escrita ANTES del arreglo → **roja**: `LlmBudgetExceededError: se requieren $0.756109 y el límite es $0.500000`. Arreglo: `cotaEntradaEnTokens` sustituye el payload de cada data-URL por una tarifa fija de 4,000 tokens; el texto se sigue contando 1:1. Prueba **verde**. Suite completa **518 archivos / 6,522 pruebas**. Commit `b4a2cc4`.

Una prueba ajena salió roja en la primera corrida de la suite (`expect(opts.budget.runId).toMatch(...)`) y **verde en las dos siguientes** sobre el mismo árbol. **Intermitente sospechosa**, anotada, no perseguida.

**11:29** · **ARREGLO 2.** Agéntico entrega 4/10 con AGEN-19C2-2. Verificado en `tool-executor.ts:178-215`: el sello del fencing vive dentro del `try` que decide el éxito de la tool, y el camino de error ya protegía `failMutation` con su propio `try/catch` (`:208`) — esa asimetría **es** el bug. Prueba antes del arreglo → **2 de 3 rojas**, con la tercera (el fallo del handler) verde como control. Arreglo: `try/catch` alrededor de `completeMutation` que registra `tool.idempotencia_sello_fallido`. Suite **519 archivos / 6,525 pruebas**. Commit `234c364`.

**11:35** · Verificaciones adversariales propias: `npm audit --omit=dev` → **0 vulnerabilidades** (confirma a seguridad). `git log origin/master` → **`69aa71b` SÍ lleva `[deploy]`**: el crítico de despliegue de la ronda 19 cerró **como instancia**; la clase que operabilidad reporta (el `schedule` que nunca compara versión) sigue abierta. Su reporte es exacto.

**11:41** · Se descarta el arreglo 3. Los tres candidatos restantes son diseño o infraestructura: la idempotencia sobre un viaje reabierto necesita base de datos para reproducirse y aquí no hay; el acuse por foto exige rediseñar la ventana de ráfaga; el de monitoreo es de CI y producción. **No se arregla a ciegas.** Tope de 3 vueltas: se usaron 2.

**11:44** · Los doce rubros entregados. `git status --porcelain` **vacío**: el auditor de pruebas revirtió sus 11 mutaciones y sus 4 controles.

**11:45** · Corrección a un reporte: `qa-motor.ts:544` es `estadoFinalDe(corrida.veredicto)`, **no** `const final = 'ok'`. Ese `'ok'` fue la mutación del auditor de pruebas, ya revertida. Su hallazgo es de **cobertura**, no un bug de código; se anota así en la síntesis.

**11:46** · Tablero renderizado con Chromium headless y **mirado**: 12 rubros contados, notas cuadradas contra la síntesis, serie 6.1 · 4.8 · 5.8 · 5.3 · 4.7 · 4.5.

**11:48** · **Compuerta final sobre el árbol de cierre:**

```
npm test              →  519 archivos · 6,525 pruebas · 1 saltada   [exit 0]
npx tsc --noEmit -p . →  (sin salida)                               [exit 0]
npm run lint          →  0 errores · 156 avisos                     [exit 0]
```

---

## Arreglos

| # | sha | Hallazgo | Severidad |
|---|---|---|---|
| 1 | `b4a2cc4` | BACK-19c2-1 — la foto de un ticket no se cobra por byte antes de llamar al modelo | CRÍTICO |
| 2 | `234c364` | AGEN-19c2-2 — un fallo de contabilidad deja de tener la misma voz que un fallo del efecto | CRÍTICO |

Ninguno revertido. Los dos comprobados corriendo la prueba **antes** del arreglo.
