# MAPA — auditoría 18 (20-ago · cont. 21-ago · cont. 22-ago · **cont. 4, 23-ago**)

Corrida **desatendida, en la nube** (routine de Claude Code). Rama `claude/auditoria-18`,
PR #34. Árbol limpio al arrancar → autofix habilitado.

## CONTINUACIÓN 4 — 23-ago-2026 (esta ronda)

El PR #34 **sigue abierto**, así que esta corrida NO abre ronda nueva: continúa la 18
sobre la misma rama. Es la **cuarta** pasada.

**Lo que cambió, y otra vez es grande.** `master` avanzó de `21630c0` a **`583fec4`**:
**368 archivos, +32,183 / −5,220** en `src/`, `supabase/`, `normas/`. Los doce rubros
tienen código nuevo, así que se relanzan los doce.

El delta viene casi entero de dos frentes que se fusionaron a `master` en el día:

1. **PR #39 — «escala a 50k viajes/mes + auditoría de producción (117 hallazgos)»**
   (`b3ac12a`). Es la campaña más grande que ha entrado a este repo. Mueve el peso de
   agregación de TypeScript a SQL y reescribe la mitad del panel.
2. **`escala-dashboard` / FE-14 / FE-16** (`583fec4`, `4639717`, `4197bca`): render por
   bloques con streaming, y el «Cerebro» de `/admin` dejando de mandar 33 MB al navegador.

### Lo que el delta trae, por foco

- **Agregación a SQL — 18 migraciones nuevas (0150–0167)**, y es el cambio estructural
  del día. `analytics.ts` deja de traerse filas y sumar en JS:
  - `0150` (once agregados de `analytics.ts` a RPC), `0151` (fiscal agregado por
    dimensiones — **la ley fiscal se queda en TS a propósito**), `0152` (comercial y
    operación), `0153` (`getResumenNegocio` de /admin), `0154` (keyset + `pg_trgm` para
    el registro de viajes), `0157` (cursor + `ANALYZE`), `0160` (índices de búsqueda de
    catálogos), `0162` (limpieza de Storage), `0167` (listado de prospectos).
  - **Hay pruebas de equivalencia JS-vs-RPC** (`975981e`, `espejo_0152.pruebas.ts`,
    `analytics_rpc_0150.fixture.ts`). Verificar que de verdad comparan, no que existan.
- **Integridad fiscal y dinero atómico**: `0158` (integridad fiscal), `0159` (las tres
  escrituras de dinero que no eran atómicas: `registrar_pago_tx`, `reabrir_viaje_tx`),
  `0163` (histórico de precios de Stripe), `0166` (**el consecutivo fiscal pasa a ser
  serie + folio + ejercicio**, no folio a secas — `6383abf`, `5d70149`, `eb72ca7`).
- **Stripe**: doble suscripción, doble CFDI, candado test/live, precios históricos,
  eventos fuera de orden (`dca6b09`, `457e804`, `233f9a4`, `518e5b7`, `4aeb450`).
- **Seguridad**: cookie de sesión `httpOnly` (`273cfa3`), CSRF en escrituras por cookie
  (`c227559`, `src/lib/auth/csrf.ts` **nuevo**), secreto de crons en tiempo constante
  (`58d6461`, `src/lib/auth/cron.ts` **nuevo**), teléfono ARCO fuera del log (`3b69836`),
  hash de la llave en vez del secreto (`bb88dbe`).
- **Día de México**: `0161` (fechas locales) y una campaña entera —`cca9f84`, `496b5a7`,
  `f723099`, `6e694f0`, `8ad15a7`— de cortes de periodo que se corrían un día.
- **Resiliencia**: OCR caído deja de degradarse en silencio (`0d1d7fe`), OpenRouter con
  `maxRetries 0` y timeout (`19a10e5`), Meta clasificado (`d0ad9a8`), latido de crons
  (`883055e`), y con el LLM caído se contesta **el cuadre real** (`9ef9690`).
- **Frontend por bloques (FE-14/FE-16)**: `dashboard/bloque.tsx`, `serie-diaria*.ts`,
  `paginar-*.ts`, `combo-catalogo.tsx`, `limite-error.tsx` — todos **nuevos**. El latido
  del Cerebro no corre con la pestaña oculta (`75f8418`) y refresca por delta (`7305ee1`).
- **`verificaciones.sql` creció +1,957 líneas** (bloques 122–135).

### El merge, y el conflicto único

`36a3912` mergea `origin/master` (`583fec4`). **Un solo conflicto**, en
`src/lib/likida/fiscal.ts` → `causasDe()`, y otra vez porque la rama y `master`
tocaron lo mismo por caminos distintos. Aquí **conservé los dos lados**:

| Lado | Qué aportó | Se quedó |
|---|---|---|
| la rama | reestructura de **FISC-C3-1**: el combustible se juzga con `medioNoAdmitidoCombustible` (lista cerrada LISR 27-III), no con `formaPago === '01'` | **sí** |
| `master` | helper `sobreTopeEfectivo()`, que prefiere la celda ya calculada por el motor sobre recalcular `monto > tope` en el panel | **sí** |

Resultado: el tope de efectivo sigue **sin** aplicar al combustible (que es la corrección
de FISC-C3-1) y para el resto ahora pasa por la celda del motor. Los imports de ambos
lados quedaron unidos (`diasSobreTope`, `CONCEPTOS_CON_TOPE_ALIMENTACION`, `getConfig`,
`FORMA_PAGO_SIN_PAGAR`, `medioNoAdmitidoCombustible`).

### Dos cosas que la compuerta cazó ANTES de los auditores

Las dos son de `master`, no del merge, y están arregladas con prueba y commit atómico:

- **OPER-C4-1** (`8282fa4`): `master` versionaba un **enlace simbólico**
  `node_modules -> /Users/javiercamaraportepetit/likida/node_modules` (`c311997`). Se
  coló porque `.gitignore` decía `node_modules/` **con diagonal**, forma que solo casa
  directorios. Al clonar, la caja de herramientas entera se queda sin piso: `npx vitest`
  muere con `Cannot find module 'vitest/config'` — no fallan unas pruebas, no arranca
  ninguna.
- **FMT-C4-1** (`3af1ea4`): la compuerta arrancó **roja** en `mxnCompacto`.
  `maximumFractionDigits: 1` a secas saca a ICU de su *compact rounding* y conserva el
  cero de cola: `"$9,000.0 M"`, diez caracteres en la tarjeta de ocho — el desbordamiento
  que FE-17 vino a cerrar.

## Producto en una línea

Likida liquida viajes de autotransporte federal de carga por WhatsApp, para flotas en
México. Pre-revenue, **cero clientes, cero viajes en base**. El comprador es el contralor
de la flota. Un error que él vea en la sala cuesta el trato.

## Los dos paneles

- `/admin` — consola del superadmin (Javier). Cruza TODOS los tenants a propósito:
  `src/lib/admin/negocio.ts` es la única función con ese permiso.
- `/dashboard` — panel del CLIENTE (flota_admin, contador, encargado), ~31 páginas, todas
  filtradas al tenant. Reusa los componentes de `/admin`; no hay segunda librería de UI.

## Inventario (23-ago, sobre `3af1ea4`)

| Cosa | Cuánto | Antes (22-ago) |
|---|---|---|
| Archivos `.ts`/`.tsx` en `src/` | **1,027** | 950 |
| De ellos, `*.test.ts*` | **483** | 430 |
| Migraciones en `supabase/migrations/` | **163** (última `0167_prospectos_listado.sql`) | 146 |
| Fichas normativas en `normas/*.yaml` | 24 | 25 |
| Rutas `route.ts` bajo `src/app/api/` | **42** | 40 |

## Dónde está cada cosa

- **Motor de dinero (puro):** `src/lib/likida/cuadre/` (`engine.ts`, `guardia.ts`,
  `resumen.ts`, `leyendas.ts`, `tope_alimentacion.ts`), `src/lib/likida/liquidacion/`
  (`deducibilidad.ts`, `pdf.ts`, `id.ts`).
- **Ciclo de WhatsApp:** `src/lib/likida/processor.ts`, `conv.ts` (mutex + barrera de
  ráfaga), `despacho_wa.ts`, `oficina_wa.ts`, `talacha_wa.ts`, `wa_pendientes.ts`,
  ruta `src/app/api/webhook/whatsapp/route.ts`, y el drenado nuevo
  `src/app/api/cron/wa-pendientes/{cola/route.ts,drenado.ts}`.
- **Agentes / LLM:** `src/lib/agents/` (copiloto, copiloto-tools, copiloto-acciones),
  `src/lib/llm/` (`openrouter.ts`, `models.ts`, `tool-executor.ts`),
  `src/lib/likida/tools.ts`, `src/lib/likida/agentes/`.
- **Acceso a datos:** `src/lib/likida/repo.ts` (frontera única pretendida), `pg.ts`,
  `pg_errores.ts`, `duplicados.ts`, `analytics.ts` (`exigir()`, `traerTodo()`,
  `acotada()`), `viajes_registro.ts`, y **los RPC de 0150–0154** que ahora hacen la suma.
- **Auth y tenant:** `src/lib/auth/` (`guard.ts`, `visibilidad.ts`, `tenant-efectivo.ts`,
  **`csrf.ts`**, **`cron.ts`**), `middleware.ts`, `src/lib/env.ts`,
  `src/lib/ratelimit.ts`, `src/lib/supabase/cookies.ts`.
- **Fiscal:** `normas/*.yaml` es la fuente de verdad; el código a comparar es
  `liquidacion/deducibilidad.ts`, `cuadre/engine.ts`, `cuadre/leyendas.ts`,
  `fiscal.ts`, `liquidacion/pdf.ts`, `intake/cfdi.ts`, `intake/sat.ts`, `facturacion/`,
  **y ahora también `supabase/migrations/0151_fiscal_agregado.sql`**.
- **Legal / datos personales:** `src/lib/likida/privacidad.ts`, `intake/sanitizar.ts`,
  `export/`, migraciones `*aviso_privacidad*`, `src/app/aviso/prospectos/page.tsx`,
  todo `src/lib/llm/` (cada salida a un modelo externo es una transferencia).
- **Operabilidad:** `src/lib/observability/`, `src/lib/logger.ts`, `src/lib/admin/salud.ts`,
  `.github/workflows/{ci.yml,ci-postgres.yml,auto-merge-rutina.yml,salud-produccion.yml}`,
  `supabase/verificaciones.sql`, `scripts/` (incluido `respaldo-storage.sh`).
- **Facturación / piloto de visión:** `src/lib/likida/facturacion/`, en particular
  `adaptadores/piloto_vision.ts` y `conectores/portales_facturacion.ts`.

## Los hallazgos abiertos que traes de la pasada anterior

Están en `docs/auditoria-18/<rubro>-c3.md` (92 hallazgos: 9 CRÍT · 33 ALTO · 33 MEDIO ·
17 BAJO). **Los abiertos se verifican PRIMERO.** Si el delta los cerró, se dice — es lo
único que justifica subir la nota. Si siguen ahí, **REINCIDENTE**.

Un asunto de commit que cita un ID **no es prueba** de que el hallazgo esté cerrado.
**Abre el archivo y cuenta.**

Lo que quedó pidiendo decisión del dueño (no más código) al cerrar la c3, y que sigue
siendo cierto salvo que lo verifiques:

1. **El piloto de visión** — 8 críticos íntegros, todos detrás de `FACTURACION_PILOTO`,
   apagada. El doc del demo manda encenderla.
2. **`master` sin protección de rama**, y `auto-merge-rutina.yml:29-43` (`contents:
   write`) cuyo único control de acceso es cómo se llama una rama, en repo público.
3. **El tenant del demo** (`scripts/demo-5k.sql:45,58`) trae régimen **601** con la
   facilidad del 15% concedida a mano — lo que `99a6b7c` acaba de prohibir.
4. **`/aviso/<tenant>` es 404** para toda flota real: falta la pantalla de captura.
5. **La clave 624 (Coordinados)** no existe en `REGIMENES` ni en el CHECK de la 0056.
6. Fuera del alcance de `d0e9844`: el numerador del 15% vive **también en SQL**
   (`sumar_combustible_ejercicio`, `0112:151`, `0084:19`) y sigue filtrando
   `forma_pago = '01'`. Pide migración; aquí no hay base para verificarla.

## Trampas ya pisadas (no volver a levantarlas como hallazgo)

- `gasto.ocr_raw` está **muerta**: `repo.ts` escribe `ocr_confianza`/`ocr_extra`. La prueba
  de que algo pasó por OCR es `ocr_confianza`.
- `politica_gasto` (la tabla) está muerta. La política viva es `tenant.config.politica`,
  vía `getConfig()`.
- `wa_mensaje_procesado` **no** tiene `tenant_id`: no se puede atribuir a una flota.
- `viaje.estatus` solo admite `abierto | en_cuadre | liquidado` (constraint
  `viaje_estatus_dominio`). `app_user.rol`: superadmin, flota_admin, contador, operador,
  encargado.
- `cliente`, `unidad`, `tarifa`, `factura_emitida` y `pago_recibido` **ya tienen escritor**
  (el panel, `POST /v1/{viajes,unidades}`, `facturacion_escritura.ts`). No proponer
  "construir el escritor". Siguen **sin** escritor: `posicion`, `geocerca`, `terminal`,
  `mantenimiento`, `cotizacion`, `ticket_mensaje`, `portal_credencial`, `invitacion`, y las
  muertas de facto `campania`/`envio_mensaje` (las sustituyó `campana`, 0123).
- La base entera está en cero porque **no hay clientes todavía**, no porque falte código.
- `requireSessionTenant(destino)` arma su redirect a /login con un string fijo y **pierde el
  query string** — por eso existe `dashboard/sufijo.ts`.
- Las tools declaran `properties: {}` **a propósito**: el modelo decide *cuándo*, nunca *con
  qué datos*; `tenantId`/`viajeId` salen del contexto resuelto en servidor. Proponer
  "validar mejor los argumentos" es no haber leído el código. Lo que sí se vigila es que
  ninguna tool **nueva** rompa esa regla.
- El formato de cifras vive **solo** en `src/lib/formato.ts`; hay una prueba que falla si
  aparece `toLocaleString('es-MX')` en otro archivo.
- **La ley fiscal se quedó en TS a propósito** al bajar la agregación a SQL (`0151`): si
  encuentras lógica de deducibilidad *duplicada* en SQL eso sí es hallazgo, pero que el
  agregado viva en SQL y la regla en TS es la decisión, no el error.
- `.gitignore:34` ignora `docs/auditoria-*/`; los reportes entran con `git add -f`.

## Restricciones de esta corrida (nube)

- **La compuerta es `npm test` + `npx tsc --noEmit` + `npm run lint`.** NO se corre
  `npm run build`: pide Supabase, OpenRouter, Facturapi y Upstash, que aquí no existen, y su
  fallo no dice nada del código.
- **NO se corre `pruebas-manuales/*.prueba.ts`**: hacen llamadas reales de pago.
- No hay `.env`, ni base, ni red hacia proveedores. Todo hallazgo se sostiene por lectura de
  código y por la suite offline. **Ninguna migración se puede ejecutar aquí**: lo que digas
  de SQL sale de leer el archivo.
