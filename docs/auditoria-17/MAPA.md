# MAPA — auditoría 17 (8-ago · p2 9-ago · p3 10-ago · p4 11-ago · p5 12-ago-2026)

## PASE 5 — ronda de CONTINUACIÓN (12-ago-2026)

El PR **#9** (`claude/auditoria-17`) sigue **abierto** → continuación sobre esa
rama, sin PR nuevo. Árbol limpio al arrancar → autofix habilitado.
Corrida **en la nube**: la compuerta es `npm test` + `npx tsc --noEmit` +
`npm run lint`, **sin `npm run build`** (pide Supabase/OpenRouter/Facturapi, que
aquí no existen, y su fallo no diría nada del código).

**`master` NO avanzó desde el pase 4.** `origin/master` sigue en `003c88a` y es
ancestro de esta rama (`git merge-base --is-ancestor origin/master HEAD` → 0).
Lo único que cambió de código son **los tres arreglos del propio pase 4**, que
entraron *después* de que sus auditores escribieran el archivo:

```
$ git diff --stat 8f70906..927e78f -- src/
 src/app/dashboard/[id]/id.ts              | 28 +++++
 src/app/dashboard/[id]/page.tsx           |  7 +++
 src/app/dashboard/id_no_uuid.test.ts      | 65 +++++++++
 src/app/dashboard/sidebar-nav.tsx         | 12 ++-
 src/app/dashboard/sidebar_puerta.test.tsx | 80 ++++++++++
 src/lib/saas/fiscal.test.ts               | 57 +++++--
 src/lib/saas/fiscal.ts                    | 18 +-
 src/lib/saas/regimen_no_se_pierde.test.ts | 80 ++++++++++
 8 files changed, 341 insertions(+), 6 deletions(-)
```

Eso hace de este pase, sobre todo, **la verificación independiente de los tres
arreglos del pase 4** — la que la síntesis del pase 4 dejó explícitamente
pendiente cuando escribió: *"Frontend se queda en 3 aunque su CRÍTICO ya esté
arreglado en este PR. El arreglo entró después de que su auditor escribiera el
archivo, y quien lo arregló fui yo. Subirle la nota por mi propio commit es
exactamente la nota inflada que esta serie existe para desinflar: lo verifica el
pase 5, con ojos que no lo escribieron."*

### Qué se relanzó y por qué (6 de 12)

| Rubro | Archivos suyos que cambiaron desde que escribió su archivo |
|---|---|
| **Frontend** | `sidebar-nav.tsx` (+12/−1) — el arreglo de su CRÍTICO |
| **Backend y API** | `dashboard/[id]/id.ts` (nuevo), `[id]/page.tsx` (+7) — el arreglo de su ALTO |
| **Seguridad** | `dashboard/[id]/id.ts`, `[id]/page.tsx` — coautor del mismo ALTO |
| **Fiscal** | `src/lib/saas/fiscal.ts` (+18/−5) — el arreglo de su ALTO del `624` |
| **Arquitectura** | `sidebar-nav.tsx` — coautor del CRÍTICO de navegación |
| **Pruebas** | 3 archivos de prueba nuevos (`sidebar_puerta`, `id_no_uuid`, `regimen_no_se_pierde`) + `saas/fiscal.test.ts` reescrito |

Los otros seis —**agéntico, tool calling, legal, operabilidad, rendimiento,
modelo de datos**— conservan su nota del pase 4, marcados *no auditado este
pase*: cero archivos suyos cambiaron. Rendimiento se queda fuera a propósito
aunque `[id]/page.tsx` ganó una guarda: sus 11 hallazgos abiertos viven en
`dashboard/page.tsx:90-122` y `analytics.ts`, y el `git diff` de ambos contra el
pase 4 está **vacío**.

### Compuerta del pase 5 (línea base, corrida hoy en la nube)

```
npx tsc --noEmit -p .   → 0 errores
npm run lint            → 0 errores, 17 warnings   (p4: 17)
npx vitest run          → ver 00-SINTESIS (p4: 261 archivos / 3,134 verdes / 1 saltada)
```

---

## PASE 4 — ronda de CONTINUACIÓN (11-ago-2026)

El PR **#9** (`claude/auditoria-17`) sigue **abierto** → continuación sobre esa
rama, sin PR nuevo. Árbol limpio al arrancar (HEAD detached en `003c88a`) →
autofix habilitado.

**Lo que cambió en `master` desde el merge del pase 3 (`20ecbb1` → `003c88a`):
9 commits, 54 archivos, +385 / −6,158. El cambio dominante es un BORRADO.**

```
$ git log --oneline 20ecbb1..origin/master
003c88a feat(dashboard)!: borra el panel del Contador para rehacerlo desde cero
2be4b1c feat(dashboard)!: borra las 17 páginas de "dueño de flota" para rehacerlas desde cero
0f709fb feat(despacho): rediseño con el lenguaje visual de Resumen
a47d1d7 refactor(cuadre): mueve getLiquidaciones a analytics.ts
0bc0935 docs+refactor: inventario de datos de las 17 páginas antes de borrarlas
6463e93 fix(dashboard): server actions no pueden cerrar sobre funciones locales
621cc0e chore(normas): latido de vigilancia — undécima corrida bloqueada por egress
086b9f3 chore(salud): latido de la primera corrida — PR #10, issues #11 y #12
53c9d49 chore(normas): latido de vigilancia — décima corrida bloqueada por egress
```

**35 páginas del panel del cliente dejaron de existir** (`contador/` entero,
`viajes`, `unidades`, `operadores`, `mapa`, `pod`, `incidencias`, `documentos`,
`facturacion`, `rentabilidad`, `valor-ahorro`, `cotizador`, `cuadre`, `despacho`,
`clientes`, `cobranza`, `analitica`, `chat`). Entró una sola:
`dashboard/tablero-operacion.tsx` (103 líneas). `rutas.ts` se recortó de 96
líneas a 34. Esto **cierra por supresión** una parte de los hallazgos abiertos de
los pases 1–3, y el trabajo de este pase es decir **cuáles**, con archivo y
línea, en vez de dejarlos flotando como "ya no aplica".

Merge de `origin/master` a la rama: **limpio, sin conflicto**.

### Qué se relanzó y por qué (7 de 12)

| Rubro | Archivos suyos que cambiaron |
|---|---|
| **Frontend** | 35 páginas borradas, `tablero-operacion.tsx` nueva, `dashboard/page.tsx`, `inicio-operacion.tsx`, `suscripcion/page.tsx`, `combustible-casetas/page.tsx`, `admin/page.tsx`, `admin/flotas/page.tsx`, `admin/selector-vista.tsx` |
| **Backend y API** | `analytics.ts` (+32, `getLiquidaciones` movida desde `cuadre/`), `fiscal.ts` (+21), `visibilidad.ts` (61 líneas), `contador/cfdi/export/route.ts` borrada |
| **Seguridad** | `src/lib/auth/visibilidad.ts` reescrita (61 de 61 líneas) — es la capa que decide qué ve cada rol |
| **Fiscal** | `src/lib/likida/fiscal.ts` +21; y 6 de las pantallas con veredicto fiscal citado desaparecieron |
| **Arquitectura** | `rutas.ts` −62, 35 módulos borrados, `getLiquidaciones` cambió de casa |
| **Pruebas** | `contador/page.test.tsx` y `contador/periodo.test.tsx` borradas, `despacho/vista.test.tsx` renombrada, 4 tests más modificados; la suite bajó de 3,194 a 3,105 |
| **Rendimiento** | `analytics.ts` cambió; el grueso de las 214 consultas por carga vivía en páginas borradas |

Los otros cinco —**agéntico, tool calling, legal, operabilidad, modelo de datos**—
conservan su nota del pase 3 marcados *no auditado este pase*: cero archivos
suyos cambiaron (`src/lib/agents/`, `src/lib/llm/`, `src/lib/likida/tools.ts`,
`privacidad.ts`, `supabase/migrations/`, `src/lib/observability/` → sin un solo
diff en los 9 commits).

### Compuerta del pase 4 (línea base, árbol post-merge, corrida hoy)

```
npx tsc --noEmit -p .   → 0 errores
npx vitest run          → 258 archivos, 3,105 verdes, 1 saltada  (p3: 260 / 3,194)
npm run lint            → 0 errores, 17 warnings  (p3: 18)
```

La suite baja 89 pruebas porque se fueron con sus páginas; no es una regresión.

---

## PASE 3 — ronda de CONTINUACIÓN (10-ago-2026)

El PR #9 (`claude/auditoria-17`) sigue **abierto** → continuación sobre esa rama,

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
| Panel cliente | `src/app/dashboard/` — **ojo: tras `2be4b1c` y `003c88a` quedan ~9 páginas, no 31.** Cuéntalas antes de citar un número. |
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
