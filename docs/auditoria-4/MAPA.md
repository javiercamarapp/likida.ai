# MAPA — auditoría 4 (16-ago-2026)

## Esta ronda es CONTINUACIÓN, no PR nuevo

Corre sobre `claude/auditoria-3` (**PR #13**), que seguía abierto. Es el **pase
4** de ese PR. Ya hay cinco PRs de auditoría viejos encimados (#6, #7, #8, #9,
#10) colgando de una historia que `master` abandonó; abrir un séptimo es
exactamente el modo de falla que la regla de continuación existe para evitar.

**Por qué se relanzan los doce y no tres:** los reportes del pase 3 se
escribieron contra `87a6b44`. Desde ahí `master` avanzó **37 commits · 110
archivos de `src/`+`supabase/`+`normas/` · +9,355 / −650 líneas**, con **9
migraciones nuevas (0112→0120)** y dos subsistemas que nunca han pasado por una
ronda. El objeto auditado cambió: relanzar no es repetición.

Este pase empezó mergeando `master` a la rama (merge sin conflictos).

## Lo que llegó de master desde el pase 3 (el foco de esta ronda)

Ordenado por superficie nueva que abre:

- **El Copiloto del fundador** (`6988f9f`, `830d841`, `2988949`) — NUEVO y sin
  auditar nunca: `src/lib/agents/copiloto.ts`, `copiloto-acciones.ts`,
  `copiloto-tools.ts`, `src/app/api/admin/copiloto/route.ts`,
  `src/app/admin/copiloto/page.tsx` + `copiloto.tsx`. Un agente que **lee la
  compañía entera y propone acciones gateadas**, con un "guardia A0
  determinista" (`src/lib/admin/guardia.ts`). Superficie NUEVA de agéntico, tool
  calling y seguridad a la vez: es el único agente cuyo alcance cruza tenants.
- **Cimientos de plataforma fase 2** (`884c8c0`) — NUEVO: `agente_definicion`
  (mig. 0116), **cola de aprobación** (mig. 0117, `src/lib/likida/agentes/cola.ts`,
  `src/app/admin/aprobaciones/`), `definiciones.ts`, embudo real
  (`prospecto_contacto`, mig. 0118). Un camino donde una acción de agente espera
  aprobación humana: pregunta directa para agéntico ("si el proceso muere aquí,
  ¿qué ve el humano?") y para datos (¿la base impone el estado de la cola?).
- **Apagado durable y envío real** (`d682d7a`, `4169069`, `b1e5671`) —
  `wa_evento_pendiente` (mig. 0119), `cola_envio_y_actor` (mig. 0120),
  `src/lib/likida/wa_pendientes.ts`, `src/app/api/cron/wa-pendientes/`,
  `tools_apagado.test.ts`, `apagado.test.ts`. **Toca AG-C3 directamente**: el
  kill switch que la ronda 3 dejó PENDIENTE porque cinco de siete agentes no lo
  leían. Verificar si de verdad cerró o si cerró por un solo extremo.
- **Señales de PMF** (`7d232a7`, `768fe03`, `d3df284`, `eb011b0`, `3da6f6a`) —
  mig. 0114 (`descarga_de_liquidacion`: si el contador ABRIÓ el PDF),
  `src/lib/likida/pmf.ts`, `senales-pmf.tsx`, `BannerInsight`. Cifras nuevas en
  pantalla ⇒ frontend y la regla dura de CLAUDE.md ("nunca inventar una cifra",
  "un rótulo tiene que ser verdad").
- **Agregados en SQL** (`296224d`, `11329e3`, `e729a64`) — mig. 0112
  (`agregados_rpc`), `getSerieComparativa` vía RPC, `analytics.ts` reescrito en
  parte. Rendimiento y datos: el N+1 se movió a la base, hay que ver si el RPC
  filtra por tenant y si `exigir()`/`traerTodo()` siguen cubriendo el fallo.
- **Aislamiento multi-tenant en 3 capas** (`11329e3`) — NUEVO:
  `supabase/pruebas-aislamiento/` (`capa1_auditoria_estatica.sql`,
  `andamio_ci.sql`, `consultas_admin_filtran_tenant.test.ts`) y CI contra
  **Postgres real** (`.github/workflows/ci-postgres.yml`). Material nuevo y
  fuerte para seguridad, pruebas y operabilidad.
- **Auditoría externa P1/P2** (`d682d7a`) — cadencia, actor, SLA, deps, ruido;
  `logger.ts`, `ratelimit.ts` (+ `ratelimit_redis.test.ts`), `privacidad.ts`.
  Legal: `privacidad.ts` volvió a moverse — reabrirlo, no heredar.
- **`search_path` regresado** (mig. 0113) — seguridad: el patrón que la ronda 3
  barrió en 14 funciones `SECURITY DEFINER` volvió a aparecer. ¿Por qué?
- **Cadena de suministro** — `.github/dependabot.yml`, `codeql.yml`,
  `dependency-review.yml` NUEVOS. Tres PRs de dependabot abiertos (#14, #15,
  #16) sin merge.
- **`normas/`** — `lif-2026-20-A.yaml` modificada + ficha nueva de "transporte
  privado" (`e099f15`). Fiscal la abre **primero**.
- **Migraciones**: 0112 → **0120**. Ninguna ha pasado por una ronda.

## De dónde viene cada rubro (pase 3, `docs/auditoria-3/00-SINTESIS.md`)

| Rubro | Nota de la que parte | Críticos que le quedaron abiertos |
|---|---|---|
| Frontend | 6 | ninguno (FE-C1 cerrado y sin recaída) |
| Backend y API | 6 | BE-C1 — histórico importado nace `abierto` (`importar_viajes.ts:425` × `conv.ts:164-181`) |
| Agéntico | 3 | AG-C1 cierre parcial · AG-C2 mutex del sondeo de arranque · AG-C3 kill switch que nadie lee |
| Tool calling | 7 | ninguno |
| Seguridad | 7 | ninguno |
| Fiscal | 4 | ninguno (FI-C1 cerrado en `86fb450`) |
| Legal | 6 | ninguno (LEG-C1 cerrado y sin recaída) |
| Arquitectura | 4 | ARQ-C1 — contribución mezcla ingreso de N viajes con costo de TODOS |
| Pruebas | 6 | PR-C1 bajado a ALTO por su propio auditor |
| Operabilidad | 7 | OP-C1 — 100% de fallos → HTTP 200 · OP-C2 — Cobranza cierra con éxito falso |
| Rendimiento | 4 | REND-C1 (3ª ronda) · REND-C2 · REND-C3 · REND-C4 |
| Modelo de datos | 6.5 | ninguno (DAT-C1 cerrado en `285d5e3`) |

Global de partida: **5.5**.

## Qué no tocar

- **Ningún auditor edita código.** Los doce encuentran y califican; el
  orquestador arregla.
- **`pruebas-manuales/*.prueba.ts` NO se corren**: hacen llamadas reales de pago.
- **`npm run build` NO se corre**: en la nube no hay Supabase, OpenRouter,
  Facturapi ni Upstash, y su fallo no dice nada del código.
- La compuerta de esta ronda es `npx vitest run` + `npx tsc --noEmit -p .` +
  `npm run lint`.

## INFRA de este contenedor (no son hallazgos del código)

- **`npm ci` no corre aquí.** `package.json:40` pide `xlsx` desde
  `https://cdn.sheetjs.com/...` y la política de red deniega ese host (403 en el
  CONNECT; verificado con `curl` esta corrida). Se instaló `xlsx@0.18.5` desde
  el registry solo para poder correr la compuerta, y `package.json` /
  `package-lock.json` quedaron **restaurados y sin commitear**. Es el mismo
  hallazgo de DX que reportó el pase 3, en su tercera ronda.
- Cualquier CVE de `npm audit` sobre `xlsx` en este árbol es artefacto de esa
  desviación de lockfile, no del repo.
