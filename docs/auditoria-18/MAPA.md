# MAPA — auditoría 18 (20-ago · continuación 21-ago · **continuación 22-ago**)

Corrida **desatendida, en la nube** (routine de Claude Code). Rama `claude/auditoria-18`,
PR #34. Árbol limpio al arrancar → autofix habilitado.

## CONTINUACIÓN 3 — 22-ago-2026 (esta ronda)

El PR #34 **sigue abierto**, así que esta corrida NO abre ronda nueva: continúa la 18
sobre la misma rama. Es la tercera pasada.

**Lo que cambió, y es grande.** `master` avanzó de `d432e89` a **`21630c0`**:
**116 commits, 252 archivos, +16,055 / −1,348** en `src/`, `supabase/`, `normas/`,
`.github/`, `docs/`. Casi todo viene de un solo PR, el **#38 (`auditoria-18-fixes`)**,
que es una campaña de arreglo hecha **fuera de esta rama** contra los 83 hallazgos de
`docs/auditoria-18/hallazgos.md`.

Eso hace de esta la primera pasada en mucho tiempo donde *«se atacó y subió»* es una
razón de movimiento realmente disponible. **Pero hay que verificarla, no creerla:** un
commit que dice `fix(modelo): ... (C3, B9)` en el asunto no es prueba de que C3 esté
cerrado. **Abre el archivo.**

### Lo que el delta trae, por foco

- **Campaña de arreglos PR #38** (~70 commits `fix(...)` con ID de hallazgo en el
  asunto). Cubre los doce rubros. Los de más superficie:
  - **Esquema / RLS**: `93dac95` (FK compuesta `(col, tenant_id)` en 33 relaciones +
    `wa_conversacion.tenant_id NOT NULL`), `a9d88b7` (`gasto` bajo `ve_finanzas()`,
    dominios de `liquidacion` y `ocr_confianza`), `cd8bc70` (bucket `avatares`,
    `duplicado_de`, `revoke` de `reservar_envio_prospecto`). **Migraciones 0144–0149**
    y **bloques 111–121** nuevos en `supabase/verificaciones.sql`.
  - **WhatsApp / agéntico**: `8563eb5` (presupuesto por invocación; el claim huérfano
    ya no sella el mensaje como procesado — C4, C5, A3, A27), `f7c0b2b` (bandeja
    durable en un viaje con techo), `c26be40` (el aviso al jefe con el PDF completo).
  - **LLM / tool calling**: `a87a69d` (loop-guard deja pasar la tool terminal,
    truncamiento visible, caché de lectura), `b165544` (tipos readonly),
    `52ad486` (la sonda de visión frena por usuario y tenant y deja fila de costo).
  - **Fiscal**: `59c02ec` (IVA acreditable exige pago efectivo, LIVA 5-III),
    `b661d2c` (peaje y diésel exigen pago electrónico, LISR 27-III / LIF 20-A-IV),
    `22bc9ce` (RMF 9.1.8 fr. III), `43ad24a` (pie del peaje, fr. IV),
    `99a6b7c` (la facilidad del 15% deja de concederse al 601 — el **mismo**
    FISC-C2-1 que esta rama arregló en `17c6343`), `cdc4555`, `480ca83`.
  - **Legal**: `361f2dc` (el decisor del prospecto no sale al modelo, aviso público
    `/aviso/prospectos`, purga por inactividad — cierra el C2 reincidente),
    `3d0a232`, `3d49442`, `e8cb7a2`, `8007dc0`, `3e31569`, `6c564e6`, `ed9eeea`.
  - **Frontend / dashboard**: `4eb6243` (cada tarjeta del Resumen rotula su ventana),
    `3a0c8df` (StatCard deja de afirmar «0% · sin movimiento» sin comparación),
    `efd93f7` (consulta caída ≠ «aún no hay gastos»), `c007312` (detalle v2),
    `f6c2fa9`, `cc83926`, `33a7f40`.
  - **Auth / seguridad**: `3232ed7` (la cookie de flota ya no se firma con la service
    role key), `f49da77` (step-up MFA falla CERRADO), `0f24e65` (/login deja de ser
    oráculo de enumeración), `84e8247`, `dae2e8b`.
  - **Operabilidad**: `2fbba34`, `a36f7b4`, `b27c99f`, `cd6f472`, `36f0d13`,
    `146aae0`, `2644c79`, y **dos workflows nuevos**
    (`.github/workflows/auto-merge-rutina.yml`, `salud-produccion.yml`).
  - **Arquitectura**: `efab3b3` (`appUrl()` único), `db88559`+`ffb5b47`
    (`anotarBitacora()` canónico, 16 escritores a mano migrados), `df645b2`
    (`hoyMx()` único), `7e91498`.
  - **Pruebas**: ~10 commits `test(...)` que anclan puertas ya existentes
    (`9b47db7` IDOR de export, `620e854` /vendedor, `c8afcdd`, `77c0b3b`, `0063c82`).
  - **Deps**: `5eca3ab` — **xlsx vendorizado en `vendor/`**. Esto cerró el INFRA de
    las dos pasadas anteriores: `npm ci` ahora corre limpio en la nube.
- **Demo 5k** (`c1c036c`, `e8f9713`): tenant demo de 5,000 camiones para capturas,
  `scripts/demo-5k.sql`, `docs/demo-5k.md`.
- **Los tres arreglos que vivían solo en esta rama** (`34e2d12`, `947fd9e`, `b91484b`)
  **ya están en `master`** por su cuenta.

### El merge, y los tres conflictos que resolví

`673496f` mergea `origin/master` (`21630c0`) en la rama. Tres conflictos, los tres
porque **la rama y `master` arreglaron el MISMO hallazgo de formas distintas**. En los
tres tomé el lado de `master`, y la razón importa para quien audite:

| Archivo | La rama hizo | `master` hizo | Se quedó |
|---|---|---|---|
| `src/lib/likida/processor.ts` | `enRuta` → apaga solo el *reenganche* del pendiente | `incluirDespacho: false` → **salta despacho y asignación enteros** cuando hay viaje abierto | `master` (más amplio; subsume al de la rama) |
| `src/lib/likida/processor_dueno_maneja.test.ts` | prueba del `enRuta` | prueba del `incluirDespacho` | `master` |
| `supabase/verificaciones.sql` | **bloque 111** que verifica las columnas GENERADAS de 0140/0142/0143 | 0140–0143 **EXENTAS con razón escrita**, y el 111 es la RLS de `liquidacion` (0144) | `master` |

**Consecuencia auditable, dicha en voz alta:** el `reengancharPendiente` que la rama
añadió a `despacho_wa.ts:238` y `asignar_wa.ts:298` **sigue en el árbol pero ya no lo
pasa nadie** (`processor.ts:813,916` usan la forma de `master`) — es código defensivo
sin call site. Y la verificación de base de las columnas GENERADAS de la 0140/0142/0143
**se perdió**: hoy están exentas por escrito, no verificadas. Las dos cosas son válidas
como hallazgo si alguien las quiere levantar.

## Producto en una línea

Likida liquida viajes de autotransporte federal de carga por WhatsApp, para flotas en
México. Pre-revenue, **cero clientes, cero viajes en base**. El comprador es el contralor
de la flota. Un error que él vea en la sala cuesta el trato.

## Los dos paneles

- `/admin` — consola del superadmin (Javier). Cruza TODOS los tenants a propósito:
  `src/lib/admin/negocio.ts` es la única función con ese permiso.
- `/dashboard` — panel del CLIENTE (flota_admin, contador, encargado), ~31 páginas, todas
  filtradas al tenant. Reusa los componentes de `/admin`; no hay segunda librería de UI.

## Inventario (22-ago, sobre `673496f`)

| Cosa | Cuánto | Antes (21-ago) |
|---|---|---|
| Archivos `.ts`/`.tsx` en `src/` | **950** | 885 |
| De ellos, `*.test.ts*` | **430** | 387 |
| Migraciones en `supabase/migrations/` | **146** (última `0149_wa_claim_completado.sql`) | 140 |
| Fichas normativas en `normas/*.yaml` | **25** | 24 |
| Rutas `route.ts` bajo `src/app/api/` | 40 | 40 |

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
  `export/`, migraciones `*aviso_privacidad*`, `src/app/aviso/prospectos/page.tsx`,
  todo `src/lib/llm/` (cada salida a un modelo externo es una transferencia).
- **Operabilidad:** `src/lib/observability/`, `src/lib/logger.ts`,
  `.github/workflows/{ci.yml,auto-merge-rutina.yml,salud-produccion.yml}`,
  `supabase/verificaciones.sql`, `scripts/`.
- **Facturación / piloto de visión:** `src/lib/likida/facturacion/`, en particular
  `adaptadores/piloto_vision.ts` y `conectores/portales_facturacion.ts`.

## Los hallazgos abiertos que traes de la pasada anterior

Están en `docs/auditoria-18/<rubro>-c2.md` (114 hallazgos: 16 CRÍT · 41 ALTO ·
39 MEDIO · 18 BAJO) y en `docs/auditoria-18/hallazgos.md` (los 83 de la 18).
**Los abiertos se verifican PRIMERO.** Si el PR #38 los cerró, se dice — es lo único
que justifica subir la nota. Si siguen ahí, **REINCIDENTE**.

Los 13 CRÍTICOS que quedaron abiertos el 21-ago:
- **8 del piloto de visión** (`facturacion/adaptadores/piloto_vision.ts`), todos detrás
  de `FACTURACION_PILOTO`, hoy apagada.
- **2 legales**: el aviso de privacidad sin pantalla de captura
  (`tenant.domicilio_fiscal` / `url_aviso_privacidad` / `contacto_privacidad` solo los
  escribe `qa-motor.ts`); y el decisor del prospecto hacia un modelo externo
  (**este último parece atacado por `361f2dc` — verifícalo**).
- **1 de esquema**: la FK compuesta cubría 5 de 40 relaciones
  (**`93dac95` dice cubrir 33 — verifícalo contando, no leyendo el asunto**).
- **1 de arquitectura**: despacho y chofer se pisan la misma fila de `wa_conversacion`.
- **1 de pruebas**: ninguna prueba corre con la palanca del piloto puesta.

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
- `.gitignore:34` ignora `docs/auditoria-*/`; los reportes entran con `git add -f`.

## Restricciones de esta corrida (nube)

- **La compuerta es `npm test` + `npx tsc --noEmit` + `npm run lint`.** NO se corre
  `npm run build`: pide Supabase, OpenRouter, Facturapi y Upstash, que aquí no existen, y su
  fallo no dice nada del código.
- **NO se corre `pruebas-manuales/*.prueba.ts`**: hacen llamadas reales de pago.
- **El INFRA de xlsx ya NO aplica.** `5eca3ab` vendorizó `xlsx` en `vendor/`; esta ronda
  corrió `npm ci` limpio, sin workaround y sin tocar `package.json`.
- No hay `.env`, ni base, ni red hacia proveedores. Todo hallazgo se sostiene por lectura de
  código y por la suite offline.
