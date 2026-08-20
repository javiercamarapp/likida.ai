# MAPA — auditoría 18 (20-ago-2026)

Corrida **desatendida, en la nube** (routine de Claude Code). Rama `claude/auditoria-18`
sobre `master` en `8d608a4`. Árbol limpio al arrancar → autofix habilitado.

## Tres correcciones de anclaje, y son el hallazgo de proceso de la ronda

Se escriben aquí porque callarlas es lo que infla una nota:

1. **Esta ronda es la 18, no la 6.** Lo primero que escribí fue `docs/auditoria-6/`,
   deducido del último commit que decía "Auditoría 5". Es falso: hay ramas
   `claude/auditoria-{3,4,6,7,8,10,11,17}` en el remoto y 26 referencias a
   "AUDITORÍA 6" dentro del código. El número se corrigió antes de publicar nada.
   La causa raíz es la (2).

2. **`.gitignore:34` ignora `docs/auditoria-*/`.** Por eso ninguna ronda deja rastro
   en `master` y por eso no había forma de contar las rondas desde el árbol. Los
   reportes de esta ronda entran con `git add -f`. **Es una decisión del dueño, no
   la cambié**: la propuesta de quitar esa línea va en el PR, para que la decida él.

3. **No hay línea base válida para este árbol, y por eso esta ronda NO reporta
   delta.** La ronda 17 (13-ago, global 4.2) sí existe y está completa, pero vive
   sobre una historia **sin ancestro común** con `master`: su raíz es
   `a3c9978 "Scaffold inicial de Cuadra"` y la de `master` es `36432e4`. Son dos
   linajes distintos en el mismo repositorio. Comparar 4.2 contra las notas de hoy
   sería comparar dos códigos diferentes y publicar una mejora que nadie hizo.

## Producto en una línea

Likida liquida viajes de autotransporte federal de carga por WhatsApp, para flotas en
México. Pre-revenue, **cero clientes, cero viajes en base**. El comprador es el contralor
de la flota. Un error que él vea en la sala cuesta el trato.

## Los dos paneles

- `/admin` — consola del superadmin (Javier). Cruza TODOS los tenants a propósito:
  `src/lib/admin/negocio.ts` es la única función con ese permiso.
- `/dashboard` — panel del CLIENTE (flota_admin, contador, encargado), ~31 páginas, todas
  filtradas al tenant. Reusa los componentes de `/admin`; no hay segunda librería de UI.

## Inventario

| Cosa | Cuánto |
|---|---|
| Archivos `.ts`/`.tsx` en `src/` | 885 |
| De ellos, `*.test.ts*` | 387 |
| Líneas de código no-test en `src/` | ~105,600 |
| Migraciones en `supabase/migrations/` | 136 (última `0139_prospecto_calidad.sql`) |
| Fichas normativas en `normas/*.yaml` | 24 |
| Rutas `route.ts` bajo `src/app/api/` | 40 |

## Dónde está cada cosa

- **Motor de dinero (puro):** `src/lib/likida/cuadre/` (`engine.ts`, `guardia.ts`,
  `resumen.ts`, `leyendas.ts`), `src/lib/likida/liquidacion/` (`deducibilidad.ts`, `pdf.ts`).
- **Ciclo de WhatsApp:** `src/lib/likida/processor.ts`, `conv.ts` (mutex + barrera de
  ráfaga), `despacho_wa.ts`, `oficina_wa.ts`, `talacha_wa.ts`, `wa_pendientes.ts`,
  ruta `src/app/api/webhook/whatsapp/route.ts`.
- **Agentes / LLM:** `src/lib/agents/` (copiloto, copiloto-tools, copiloto-acciones),
  `src/lib/llm/` (`openrouter.ts`, `models.ts`, `tool-executor.ts`),
  `src/lib/likida/tools.ts`, `src/lib/likida/agentes/`.
- **Acceso a datos:** `src/lib/likida/repo.ts` (frontera única pretendida), `pg.ts`,
  `pg_errores.ts`, `duplicados.ts`, `analytics.ts` (`exigir()`, `traerTodo()`).
- **Auth y tenant:** `src/lib/auth/` (`guard.ts`, `visibilidad.ts`, `tenant-efectivo.ts`),
  `middleware.ts`, `src/lib/env.ts`, `src/lib/ratelimit.ts`.
- **Fiscal:** `normas/*.yaml` es la fuente de verdad; el código a comparar es
  `liquidacion/deducibilidad.ts`, `cuadre/engine.ts`, `cuadre/leyendas.ts`,
  `liquidacion/pdf.ts`, `intake/cfdi.ts`, `intake/sat.ts`, `facturacion/`.
- **Legal / datos personales:** `src/lib/likida/privacidad.ts`, `intake/sanitizar.ts`,
  `export/`, migraciones `*aviso_privacidad*`, todo `src/lib/llm/` (cada salida a un
  modelo externo es una transferencia).
- **Operabilidad:** `src/lib/observability/`, `src/lib/logger.ts`,
  `.github/workflows/ci.yml`, `supabase/verificaciones.sql`, `scripts/seed.sh`.

## Qué cambió desde la ronda anterior

Última ronda con rastro: **auditoría 17** (13-ago), en la rama `claude/auditoria-17` y sobre OTRO linaje (ver correcciones de anclaje arriba). El último commit de `master` que se llama a sí mismo auditoría es `0255b8c` "Auditoría 5" (17-ago).
Desde `0255b8c` hasta `8d608a4` (18-ago) entraron **47 commits que tocan `src/`, `supabase/`
o `normas/`**. Los focos, por número de commits que tocan el archivo:

- **Correo de acceso / magic link** (nuevo subsistema): `src/lib/correo/`
  (`auth.ts`, `enviar.ts`, `plantilla.ts`), `src/app/api/auth/correo/route.ts`,
  `src/app/login/page.tsx`. Es código nuevo, con el rate-limit de 2 correos/hora y el
  reenvío automático del enlace caducado.
- **Copiloto de admin**: `src/lib/agents/copiloto*.ts`,
  `src/app/api/admin/copiloto/route.ts`, `src/app/admin/copiloto.tsx`. Cambió el modelo de
  confirmación (`AdminActionIntent` en vez de un booleano del cliente).
- **Tenant explícito del superadmin**: `src/lib/auth/{guard,visibilidad,tenant-efectivo}.ts`
  — murió el tenant implícito; ahora hay selección explícita de flota (`AdminContext`).
- **Cerebro / prospectos**: `src/lib/admin/prospectos-mapa.ts`, `adquisicion.ts`,
  `src/app/api/admin/mapa-prospectos/*`.
- **Normas**: `normas/rlisr-57.yaml`, `normas/datos/cuota-ieps-diesel.yaml`,
  `src/lib/likida/normas/{indice,corpus}.ts`. El estímulo de diésel se recolocó en
  LIF art. 20 apartado A fr. IV (antes citaba el art. 16).
- **Esquema**: migraciones 0135–0139 (worker, precios live, prospecto), y 6 commits sobre
  `supabase/verificaciones.sql`.
- **Comprobantes / ticket**: `src/lib/likida/processor.ts` (4 commits) — "un fajo es un
  mensaje" y el ticket sin robot ya no se pierde en silencio.

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

## Restricciones de esta corrida (nube)

- **La compuerta es `npm test` + `npx tsc --noEmit` + `npm run lint`.** NO se corre
  `npm run build`: pide Supabase, OpenRouter, Facturapi y Upstash, que aquí no existen, y su
  fallo no dice nada del código.
- **NO se corre `pruebas-manuales/*.prueba.ts`**: hacen llamadas reales de pago.
- **INFRA conocida:** `npm install` limpio **falla** con 403 al bajar
  `xlsx@0.20.3` desde `cdn.sheetjs.com` (host fuera de la política de red del entorno). Para
  esta ronda se instaló `xlsx@0.18.5` desde el registry y se restauró `package.json`/
  `package-lock.json` con `git checkout`, así que el árbol auditado es el de `master`. Los 3
  consumidores de xlsx son `src/app/dashboard/viajes/page.tsx:2`,
  `src/lib/likida/intake/desglose_peaje.ts:35` y `src/lib/likida/intake/archivo.test.ts:2`.
- No hay `.env`, ni base, ni red hacia proveedores. Todo hallazgo se sostiene por lectura de
  código y por la suite offline.
