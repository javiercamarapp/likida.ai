# MAPA — auditoría 17 (8-ago · pase 2 el 9-ago · pase 3 el 10-ago-2026)

## PASE 3 — ronda de CONTINUACIÓN (10-ago-2026)

El PR #9 (`claude/auditoria-17`) sigue **abierto** → continuación sobre esa rama,
sin PR nuevo. Árbol limpio al arrancar (HEAD detached en `53c9d49`) → autofix
habilitado.

**Lo que cambió en `master` desde el merge del pase 2 (`20ecbb1` → `53c9d49`):
un commit, un archivo, cero código.**

```
$ git log --oneline 20ecbb1..origin/master
53c9d49 chore(normas): latido de vigilancia — décima corrida bloqueada por egress
$ git diff --name-only 20ecbb1..origin/master
normas/.latido-vigilancia
```

Ese latido es el marcador de estado de otra rutina (`vigilancia-normativa`), que
lleva **diez corridas bloqueadas por egress**. No toca `src/`, `supabase/` ni
ninguna ficha de `normas/`. Auditar código idéntico no produce señal, así que la
regla de continuación manda relanzar **solo** los rubros cuyo archivo falte o
cuyo código haya cambiado desde que se escribió.

### Qué se relanzó y por qué (3 de 12)

| Rubro | Por qué se relanza |
|---|---|
| **Frontend** | Su nota (4) se puso **antes** de que entraran `d7b71a8` y `e47b124`, dos arreglos de frontend de este mismo PR. Se calificó código que ya no existe. |
| **Backend y API** | Igual: su nota (5) se puso antes de `709e410`. |
| **Pruebas** | Los tres arreglos agregaron 14 pruebas después de que su archivo se escribió, y su CRÍTICO abierto (**C6**, el callback de QStash sin arnés) es el único de los 5 pendientes que es trabajo de código y no decisión de producto. |

Los otros nueve conservan su nota del pase 2, marcados *no auditado este pase*.
**Tool calling** llega así a dos pases seguidos por rotación: `src/lib/likida/tools.ts`,
`src/lib/llm/*` y `src/lib/agents/*` no tienen **un solo cambio** desde `94c0733`
(`git diff --name-only 94c0733..HEAD -- src/ | grep -iE "tool|agent|llm"` → vacío).

### Compuerta del pase 3 (línea base, corrida hoy sobre el árbol de la rama)

```
npx tsc --noEmit -p .   → 0 errores
npm run lint            → 0 errores, 18 warnings (mismo número que las dos líneas base anteriores)
npx vitest run          → (ver 00-SINTESIS.md · salida real pegada)
```

---

## PASE 2 — ronda de CONTINUACIÓN (9-ago-2026)

El PR #9 (`claude/auditoria-17`) sigue **abierto**, así que esta corrida continúa
sobre él en vez de abrir uno nuevo. Lo que cambió desde que los auditores del
pase 1 escribieron sus archivos:

- `origin/master` avanzó **12 commits** (`94c0733` → `20ecbb1`), mergeados a esta
  rama en `c7c9a0e`. **65 archivos, +2886 / −3262**.
- Cambios dominantes, y por qué importan a la auditoría:
  1. **`31babfd` retira el rol `operador` del dominio** (mig. `0086`). Se borra
     `/chofer` entero (12 archivos), `mis-viajes`, `admin/vista-chofer`,
     `lib/likida/chofer.ts` (499 líneas) y `guard.ts` pierde 39 líneas. El chofer
     ya solo existe por WhatsApp. **Toca seguridad, arquitectura, datos, legal.**
  2. **`c5a7c19` agrega el recordatorio automático de comprobación por WhatsApp**
     (`recordatorio_comprobacion.ts` +171, mig. `0087`, cron `escalar` +51).
     Camino nuevo que manda mensajes solo. **Toca agéntico, backend, legal, operabilidad.**
  3. **Rework del dashboard del dueño** (8 commits): `analytics.ts` **+454 líneas**
     de consultas nuevas, `panel-periodo.tsx`, `kpi-periodo.tsx`, `top-rutas.tsx`,
     `gasto-semanal-chart.tsx`, `actividad.tsx`, `motor-fiscal-periodo.tsx`,
     y `page.tsx` reescrito (473 líneas movidas). Un selector único
     Semanal/Mensual/Histórico mueve todo lo de abajo. **Toca frontend, rendimiento,
     fiscal, arquitectura.** Es exactamente la superficie donde vive la regla
     "un rótulo tiene que ser verdad".
  4. `formato.ts` +34 y `fiscal.ts` +44 — cifras nuevas en la única fuente de formato.
- **Colisión de migraciones resuelta en el merge:** master trajo `0086_retirar_rol_operador`
  y `0087_recordatorio_comprobacion`; la rama de auditoría tenía su propio `0086`
  (régimen 624 del CRÍTICO fiscal C3). El de la auditoría se renumeró a **`0088`**
  y su bloque de `verificaciones.sql` pasó de **62 a 63**.
- **Rubro NO reauditado en el pase 2: tool calling.** `src/lib/likida/tools.ts`,
  `src/lib/llm/*` y `src/lib/agents/*` no tienen un solo cambio en los 12 commits
  (`git diff --name-only 94c0733..origin/master | grep -iE "agent|tool|llm"` → vacío).
  Conserva su 7/10 marcado *no auditado este pase*.

### Compuerta del pase 2 (árbol post-merge, corrida el 9-ago-2026)

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 255 archivos, 3,168 pruebas verdes, 1 saltada
npm run lint            → 0 errores, 18 warnings
```

---

## Ronda y anclaje (pase 1)

- Rama: `claude/auditoria-17` (desde `origin/master` = `94c0733`).
- Ronda anterior con **tabla completa de notas**: la **13** (global 7.2/10).
  Las rondas 14, 15 y 16 fueron de arreglo/re-auditoría y NO regrabaron los 12
  rubros. Por eso el delta de esta ronda se mide contra la 13.
- `docs/auditoria-*` fue **borrado de master** en `bc39cc1` ("limpieza total").
  Los reportes viejos solo existen en historia de git (`git show bc39cc1^:docs/auditoria-13/00-SINTESIS.md`).
- Desde la ronda 16 (`4e866fc`) hasta HEAD: **368 archivos cambiados,
  +1719 / −1169**. Cambio dominante: el renombre de marca `Cuadra → Likida`
  (`src/lib/cuadra/` → `src/lib/likida/`), la migración `0085`, el nuevo
  "Resumen de flota" del dashboard y los latidos de `normas/`.

## Compuerta (línea base real de esta ronda, corrida hoy)

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 249 archivos, 3148 pruebas verdes, 1 saltada
npm run lint            → 0 errores, 18 warnings (no-unused-vars)
```

**NO se corre `npm run build`**: en la nube no hay Supabase/OpenRouter/Facturapi/Upstash
y su fallo no dice nada del código.
**NO se corre `pruebas-manuales/*.prueba.ts`**: hacen llamadas reales de pago.

## Dónde está todo (rutas REALES — ojo, cambiaron)

Las referencias viejas hablan de `src/lib/cuadra/`. **Esa carpeta ya no existe.**
Hoy es `src/lib/likida/`. Si un path del brief no existe, búscalo bajo `likida/`.

| Área | Ruta real |
|---|---|
| Motor de cuadre / dinero | `src/lib/likida/cuadre/` (`engine.ts`, `guardia.ts`, `resumen.ts`, `desde_db.ts`) |
| Liquidación y PDF | `src/lib/likida/liquidacion/` (`deducibilidad.ts`, `pdf.ts`) |
| Intake (OCR, CFDI, SAT) | `src/lib/likida/intake/` |
| Repositorio / acceso a datos | `src/lib/likida/repo.ts`, `pg.ts`, `pg_errores.ts` |
| Orquestación conversacional | `src/lib/likida/processor.ts`, `conv.ts`, `barrera*.ts`, `presupuesto.ts`, `startup.ts` |
| Tools del modelo | `src/lib/likida/tools.ts` |
| Agentes | `src/lib/agents/` (`run.ts`, `registry.ts`, `prompts.ts`) |
| LLM / proveedor | `src/lib/llm/` |
| Auth y permisos | `src/lib/auth/`, `src/proxy.ts` |
| Panel cliente | `src/app/dashboard/` (~31 páginas, filtradas al tenant) |
| Consola superadmin | `src/app/admin/` (cruza tenants a propósito: `src/lib/admin/negocio.ts`) |
| API | `src/app/api/` |
| Formato de cifras | `src/lib/formato.ts` (**única** fuente; hay prueba que lo exige) |
| Tipos | `src/types/` |
| Esquema | `supabase/migrations/` (82 archivos, hasta `0085`), `supabase/verificaciones.sql` |
| Normas fiscales/legales | `normas/` (24 fichas YAML) — **fuente de verdad** |
| Observabilidad | `src/lib/observability/`, `src/lib/logger.ts`, `src/instrumentation.ts` |
| Analytics del panel | `src/lib/likida/analytics.ts` |

## Reglas del producto que NO se rompen (del CLAUDE.md)

1. **Nunca inventar una cifra.** Si no hay dato real, se dice qué falta y por qué
   (`dashboard/pendiente.tsx`, `EstadoVacio`). Ni datos de ejemplo ni ceros que
   parezcan medición. Una estimación se muestra declarada y con su supuesto a la
   vista (`MINUTOS_CAPTURA_MANUAL` en `analytics.ts`).
2. **Un rótulo tiene que ser verdad.** Si dice "del periodo", la consulta filtra
   por fecha. Un filtro en pantalla mueve TODO lo que hay debajo.
3. **El formato de cifras vive solo en `lib/formato.ts`.** Hay prueba que falla si
   aparece `toLocaleString('es-MX')` en otro archivo.
4. **Fallar cerrado y decirlo.** supabase-js reporta errores POR VALOR: sin
   comprobar `error`, una base caída se lee como "no hay nada". Ver `exigir()` y
   `traerTodo()` en `analytics.ts` (PostgREST recorta a 1,000 filas en silencio).

## Trampas ya pisadas (NO reportar como hallazgo nuevo)

- `gasto.ocr_raw` está **muerta** — `repo.ts` escribe `ocr_confianza`/`ocr_extra`.
  La prueba de que algo pasó por OCR es `ocr_confianza`.
- La tabla `politica_gasto` está **muerta**. La política viva es
  `tenant.config.politica`, vía `getConfig()`.
- `wa_mensaje_procesado` **no tiene** `tenant_id`: no se puede atribuir a una flota.
- `viaje.estatus` solo admite `abierto | en_cuadre | liquidado` (constraint
  `viaje_estatus_dominio`). `app_user.rol`: superadmin, flota_admin, contador,
  operador, encargado.
- `cliente`, `unidad`, `tarifa`, `factura_emitida`, `pago_recibido`, `posicion` y
  `geocerca` **SÍ existen** (migs. 0047–0050) y `viaje` tiene `km_recorridos` e
  `ingreso_flete`. Están **vacías**: nadie las escribe todavía. Antes de usarlas,
  mira si tienen filas; si no, la pantalla dice qué falta.
- `requireSessionTenant(destino)` arma su redirect a /login con string fijo y
  **pierde el query string** — por eso existe `dashboard/sufijo.ts`.
- Las tools declaran `properties: {}` **a propósito**: el modelo decide *cuándo*,
  nunca *con qué datos*; `tenantId`/`viajeId` salen del contexto resuelto en
  servidor. Eso cierra la inyección de prompt de forma estructural. Proponer
  "validar mejor los argumentos" = no leíste el código. Lo que sí se vigila es
  que ninguna tool **nueva** rompa esa regla.

## Contexto de negocio

Likida liquida viajes de autotransporte federal de carga por WhatsApp, para flotas
en México. Pre-revenue, sin clientes. El comprador es el **contralor de la flota**.
Demo el 6-ago-2026 con Transportes Innovativos. Un error que el contralor vea en la
sala cuesta el trato.
