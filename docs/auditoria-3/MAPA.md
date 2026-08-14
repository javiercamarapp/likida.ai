# MAPA — auditoría 3 (14-ago-2026)

## PASE 2 — continuación en la nube (14-ago, tarde)

La ronda 3 arrancó en local de madrugada y **murió antes de escribir los 12
reportes**: en `docs/auditoria-3/` solo quedaron `MAPA.md` y
`00-ESTADO-RONDA.md`. Los 6 CRÍTICOS **sí** se arreglaron y **sí** están en
`master` (commits `c8bd2ac`, `444492a`, `b31460c`, `54e0648`, `bb7e228`,
`bc3c6c3`) más el alto TC-A1 (`8066054`, `366b66d`). Los **25 ALTOS siguen
abiertos** — los 8 fixers en paralelo que anuncia `00-ESTADO-RONDA.md` nunca
dejaron commit.

Por eso este pase relanza **los 12 rubros**: sus archivos no existen, y un
rubro sin archivo es un rubro sin auditar. La lista de altos heredados vive en
`00-ESTADO-RONDA.md` líneas 50-64 — **verifícalos primero contra el código de
hoy y márcalos REINCIDENTE si siguen vivos.**

Diferencias de correr en la nube:
- La compuerta es `npm test` + `npx tsc --noEmit` + `npm run lint`. **NO** hay
  `npm run build`: no existen credenciales de Supabase/OpenRouter/Facturapi.
- Los arreglos van a la rama `claude/auditoria-3` y salen como PR, nunca a
  `master`.

## Línea base REAL de esta ronda (corrida hoy, antes de auditar)

- `npx vitest run` → **261 archivos, 3,161 pruebas verdes, 1 skipped**
- `npx tsc --noEmit` → limpio
- `npx eslint src/` → 0 errores, 22 warnings (unused-vars en tests, preexistentes)
- `npm run build` → exit 0
- Migraciones aplicadas hasta la **0091**; `supabase/verificaciones.sql` con 66 bloques (64-66 de esta semana, con corrida real anotada)

**NO corras `npm test` ni `npm run build` tú: la línea base ya corrió y 12 suites en paralelo tumban la máquina. Lee, busca (grep), y cita.**

## Desde la auditoría 2 (28-jul): 583 commits, ~896 archivos

Lo grande, en orden:
- **Rediseño v3 del panel** (12-13 ago): sidebar Handle por categorías (`dashboard/rutas.ts`), tema claro/sistema/oscuro (`[data-theme]` + `.tema-neutro`), patrón page/vista en todas las páginas nuevas.
- **Chat "Chatea con tus datos"**: agente real con tools de solo lectura (`lib/agents/analista.ts`, `chat-tools.ts`), historial persistente (0088), streaming NDJSON con secuencia de tools visible, lector universal de archivos.
- **Despacho** (`dashboard/despacho/`): crear/asignar/avisar/reavisar/alta de operador.
- **HOY (14-ago), el foco de esta ronda — los seis agentes:**
  1. `dashboard/agentes/liquidacion` (v2, 13-ago)
  2. `dashboard/agentes/facturas` (v2 + mesa del jefe, 13-ago)
  3. `dashboard/agentes/cobranza` + motor `lib/likida/agentes/cobranza{,_pura}.ts` (0089)
  4. `dashboard/agentes/conductores` + `lib/likida/hitos_viaje.ts` (0090) + `lib/likida/despacho_wa.ts` (el jefe despacha por WA) + cableado NUEVO en `processor.ts` (rama oficina ~402-470 y hitos ~1545)
  5. `dashboard/agentes/peajes` (ingesta de XML consolidado por pantalla, sobre `intake/consolidado.ts`)
  6. `dashboard/agentes/proveedores` + `lib/likida/proveedores.ts` (0091) + `api/export/facturas-proveedor`
- **Registro** (F2): `dashboard/{viajes,operadores,huerfanos}` + alertas en `inicio-contenido.tsx` + `repo.ts` (huérfanos de flota, ~l.375-470).
- **Mapa** (F3): `dashboard/mapa/` (geometría horneada `mexico-geo.ts`, `lib/likida/geo/ciudades.ts`).
- **Kit PoC**: `lib/likida/importar_viajes.ts` (import CSV/Excel SIN avisos de WhatsApp), `lib/likida/peajes/desglose.ts`.
- **Arreglado hoy mismo (contexto para modelo de datos):** la FK compuesta de la 0075 dejó DOS relaciones en 5 pares de tablas; tres embeds sin alias cayeron con "more than one relationship" (página de cobranza, cron de escalación, aviso de cierre). Commits `2e59040` y `566a962`. Verificar que no haya más.
- Cron unificado `api/cron/escalar` corre escalación + `ejecutarCobranzaGlobal`. Facturación automática (`api/cron/facturar`) sin cambios grandes.
- **Muertos esta semana:** `recordatorio_comprobacion.ts` (supersedido por 0089), `/dashboard/viajes/nuevo` (vive en Despacho).

## Dónde está todo

- Panel del CLIENTE: `src/app/dashboard/**` (todo filtrado a tenant; roles: superadmin, flota_admin, contador, encargado; el chofer NO tiene login — solo WhatsApp).
- Consola de Javier: `src/app/admin/**` (cruza tenants a propósito vía `lib/admin/negocio.ts`).
- Motores: `src/lib/likida/**` (cuadre/ es PURO; formato de cifras SOLO en `lib/formato.ts` — hay prueba guardián).
- WhatsApp: `api/webhook/whatsapp/route.ts` → `processor.ts` (~2,300 líneas, el corazón).
- Visibilidad por rol: `lib/auth/visibilidad.ts` (área por ruta; `dinero_por_area.test.ts` escanea que operación no pinte pesos). Permisos de acción: `lib/auth/permisos.ts`.
- Normas fiscales: `normas/*.yaml` (fuente de verdad; el fiscal las abre y transcribe).

## Qué NO tocar / reglas duras del repo

- **NADIE edita código en fase de auditoría** — encuentras y calificas; el orquestador arregla.
- `pruebas-manuales/*.prueba.ts` NO se corren (pago real).
- Nunca inventar cifras; rótulos verdaderos; fallar cerrado y decirlo — los hallazgos que violen esto pesan doble.
- El candado del timbrado (`facturacion/modo.ts`) está APAGADO a propósito (decisión de negocio: se enciende al primer cliente). No es hallazgo.
- `posicion`, `geocerca`, `cliente`, `unidad`, `tarifa`, `factura_emitida`, `cotizacion` existen y están VACÍAS a propósito (F7 del plan). Pantallas que las declaren honestas ≠ hallazgo; pantallas que finjan datos SÍ.

## Hallazgos abiertos heredados

En este formato: ninguno (primera ronda con la skill). El ancla cualitativa vieja es `docs/conocimiento/40-auditoria-codigo.md` (ola 2, 27-jul) — buena parte ya se atacó; si algo de ahí sigue vivo en tu rubro, repórtalo como REINCIDENTE citando la línea actual.
