# MAPA — auditoría 19, continuación 2 (25-ago-2026)

Corrida **desatendida, en la nube** (routine de Claude Code). Rama `claude/auditoria-19`,
**PR #52** (abierto, borrador). Árbol limpio al arrancar → **autofix habilitado**.

**RONDA DE CONTINUACIÓN, no ronda nueva.** `list_pull_requests(state=open)` devolvió el
PR #52 (`claude/auditoria-19`, abierto desde el 24-ago 11:11Z). Por la regla de la
routine —«un PR vivo vale más que catorce ignorados»— se continúa sobre esa rama: no se
abre PR nuevo, se hace `push --force` a la misma rama y se actualiza el cuerpo.

Los doce archivos de rubro de la ronda 19 **ya existen**. Lo que cambió es el código
debajo de ellos.

## El delta: `8b43121` → `69aa71b`

**115 archivos, +4,974 / −1,026** en `src/`, `supabase/` y `normas/`, en **6 commits**.
Se relanzan los rubros cuyo código cambió — y con este delta son los doce, cada uno
con superficie nueva propia.

Los seis commits, en orden:

| sha | Asunto | Qué trae |
|---|---|---|
| `c85dfd3` | Panel de QA Fase B: el ledger a tablas, y los oráculos que no disparaban | `lib/admin/qa-*` completo, `0185_qa_panel_tablas.sql` |
| `99e3544` | [deploy] Panel de QA Fase B (0185) + al aire el endurecimiento enterprise | publica lo anterior + el `8b43121` que la ronda 19 auditó sin desplegar |
| `6340aac` | [deploy] El ayudante de ruta contesta con números, y los cuatro bugs de la auditoría de tickets | `acuse_ticket.ts`, `intake/ocr.ts`, `cuadre/engine.ts`, `agents/prompts.ts` |
| `0156cf3` | Enterprise: runtime, WhatsApp, budgets and resilience | **el commit que manda**: 16 sub-commits, `lib/llm/` casi entero + 3 migraciones |
| `1d327f7` | [deploy] El despacho vuelve a poder crear viajes: una server action no puede cerrar sobre una función local | `dashboard/despacho/page.tsx`, prueba de closures |
| `69aa71b` | [deploy] Compuerta legal, esquema del OCR y el despacho | `api/lead`, `legal/config.ts`, `privacidad/page.tsx`, `terminos/page.tsx` |

### 1 · Runtime del modelo: presupuesto duro, idempotencia y cancelación (`0156cf3`)

**Superficie nueva, toda en `src/lib/llm/`:**

- `budget.ts` (**nuevo**, 130 líneas) + `budget.test.ts`, `generate_response_budget.test.ts`
- `tool-idempotency.ts` (**nuevo**, 94 líneas) + `tool_idempotency.test.ts`,
  `tool_idempotency_clock.test.ts`
- `runtime-signal.ts` / `runtime-signal-shared.ts` (**nuevos**) + `runtime_guards.test.ts`,
  `runtime_guards_imports.ts`
- `openrouter.ts` +126 líneas, `tool-executor.ts` +156 / −? (reescritura parcial)
- Migraciones `0186_runtime_idempotencia_y_presupuesto.sql`,
  `0188_runtime_idempotencia_clock.sql`, con `migration_0186/0187/0188.test.ts`

**Esto le pega directo a cuatro rubros a la vez:** tool calling (el ejecutor y la
deduplicación por efecto), rendimiento y costo (el presupuesto que la ronda 19 marcó
ausente en dos rutas), agéntico (cancelación a media corrida) y datos (tres migraciones).

Contexto que el auditor necesita: la ronda 19 dejó abiertos **exactamente** estos
hallazgos en esa zona — `/api/dashboard/onboarding-chat` sin tope diario ni registro de
costo (backend ALTO, tool-calling ALTO), «ni un tope de dinero en el camino del cuadre»
(rendimiento ALTO, REINCIDENTE), y «una tool que se ejecuta dos veces porque la
deduplicación mira la llamada y no el efecto». **La pregunta no es si el código nuevo
existe, sino si cierra esos hallazgos o si nació al lado de ellos.**

### 2 · WhatsApp: leases durables y fencing (`0156cf3`)

`wa_pendientes.ts` +150 / −? con `wa_pendientes_leases.test.ts` (**nuevo**, 77 líneas),
`conv_claim_lease.test.ts`, migración `0187_wa_evento_pendiente_leases_fencing.sql`
(**381 líneas**) y `supabase/tests/wa_leases_fencing.sql` (**259 líneas**, pgTAP).

Es el arreglo del pendiente más citado de la ronda 18: *«un mensaje matado a media
corrida queda envenenado por su propio claim»*, la convergencia de tres auditores. La
ronda 18 lo dejó pendiente porque *«el arreglo correcto es un lease con TTL sobre el
claim, que es diseño, no parche»*. **Ese diseño ya está escrito.** Hay que verificar si
el lease cierra el envenenamiento o solo mueve la ventana — y si el fencing token se
respeta en el camino de escritura, no solo en el de reclamo.

Toca también `processor.ts` (+65) y `intake/rafaga.ts`.

### 3 · OCR por renglones y el plazo impreso en el ticket (`6340aac`)

Tres cambios de producto que salen de una auditoría foto-por-foto de cinco tickets
reales del 24-ago:

- `intake/ocr.ts` extrae `plazo_facturacion_horas`, y `cuadre/engine.ts` **prefiere el
  plazo impreso en el papel sobre el catálogo**, truncando con `floor`.
- El OCR desglosa `renglones` con `ajeno_al_viaje` por partida; el motor levanta
  `renglones_ajenos` cuando pasan del **15%** del ticket, y **no descuenta nada** a
  propósito.
- `acuse_ticket.ts`: el peldaño `silencio` pasa a `acusar`.
- `agents/prompts.ts`: cualquier mensaje abierto obliga a llamar `estado_viaje`.

**Fiscal y frontend tienen aquí trabajo obligatorio.** Un plazo de facturación que se
trunca mal le dice al chofer que puede facturar un día que ya venció; un umbral del 15%
sobre renglones juzgados por un modelo es una cifra que el contralor va a ver. Y el
commit mismo anota, sin arreglarlo: *«el gate de drift de /admin/evals solo hashea el
prompt del ANALISTA. El del chofer —el que habla con choferes reales y cierra
liquidaciones— no tiene gate.»*

### 4 · Compuerta legal del lead y avisos (`69aa71b`)

`src/lib/legal/config.ts` (**nuevo**) + `config.test.ts`, `api/lead/route.ts` con su
prueba, `privacidad/page.tsx`, `terminos/page.tsx`, `privacidad.test.ts`.

**Legal es el rubro con más pendientes verificados de la ronda 19 (22 hallazgos, nota
3/10)**, y cuatro de sus críticos eran del GPS y del aviso que dice en negritas que no
hay GPS. Hay que verificar **uno por uno** cuáles de esos 22 cerró este commit y cuáles
siguen: un aviso reescrito no es lo mismo que un aviso que ahora cubre la transferencia.

### 5 · Panel de QA Fase B (`c85dfd3`, `99e3544`)

`lib/admin/qa-{escenarios,motor,oraculos,panel,storage,tipos}.ts` con sus pruebas,
`app/admin/qa/{page,lanzar-form,error}.tsx`, `0185_qa_panel_tablas.sql` (131 líneas).
El asunto dice *«los oráculos que no disparaban»* — un oráculo de QA que no dispara es
exactamente el modo de falla que el rubro de **pruebas** calificó con 5/10 por
`verificaciones.sql` (19 bloques no-op, 3 contradiciendo su propio `esperado`).

### 6 · Observabilidad, salud y despacho

`observability/sentry.ts` (+47), `api/health/route.ts` con prueba nueva,
`supabase/admin.ts` (+11), `supabase/verificaciones.sql` (+153),
`dashboard/despacho/page.tsx` y `server_actions_sin_closures.test.ts` (la regresión de
`1d327f7`: una server action no puede cerrar sobre una función local).

**Operabilidad tiene aquí su pregunta central de la ronda anterior:** sus dos CRÍTICOS
eran *«el estado `dead` del outbox que nadie consulta»* y *«producción corre `df6b1be` y
`master` va en `8b43121`»*. El segundo lo cierra `99e3544`, que sí lleva la bandera
`[deploy]` en el asunto. El primero hay que verificarlo contra el código de hoy.

## Notas previas — el ancla de esta continuación

| Rubro | Nota ronda 19 | Hallazgos con ficha |
|---|---|---|
| Frontend | 5 | 12 (1 crítico, arreglado) |
| Backend y API | 6 | 18 (1 crítico, arreglado) |
| Sistema agéntico | 4 | 15 (1 crítico abierto) |
| Tool calling | 4 | 7 (1 crítico abierto) |
| Seguridad | 5 | 16 (0 críticos; 1 alto arreglado) |
| Cumplimiento fiscal | 3 | 16 (2 críticos abiertos) |
| Cumplimiento legal | 3 | 22 (4 críticos abiertos) |
| Arquitectura | 4 | 11 |
| Pruebas | 5 | 13 (2 críticos abiertos) |
| Operabilidad y DX | 6 | 12 (2 críticos abiertos) |
| Rendimiento y costo | 5 | 15 (2 críticos abiertos, reincidentes) |
| Modelo de datos | 6 | 12 |

**Global 4.7.** Serie: 6.1 · 4.8 · 5.8 · 5.3 · 4.7.

## Reglas de la corrida (no negociables)

- **No se corre `npm run build`**: pide Supabase, OpenRouter, Facturapi y Upstash, que
  aquí no existen. La compuerta es `npm test` + `npx tsc --noEmit` + `npm run lint`.
- **No se corren `pruebas-manuales/*.prueba.ts`**: hacen llamadas reales de pago.
- **Ningún auditor toca código.** Doce encuentran y califican; el orquestador arregla.
- **`.gitignore:34` ignora `docs/auditoria-*/`** — los archivos de la ronda se agregan
  con `git add -f` o no llegan al PR. Es por lo que rondas anteriores no dejaron rastro.
- El repositorio es `javiercamarapp/cuadra`, que redirige a `javiercamarapp/likida.ai`
  en GitHub. Los enlaces del PR salen con el nombre viejo; es el mismo repositorio.
