# MAPA — auditoría 24 (ronda de continuación, 2-sep-2026)

## Qué es esta ronda

**Continuación**, no ronda nueva. Ya existe un PR de auditoría 24 abierto:
**#303 `aud24/integracion`** — 188 commits, 484 archivos, +34,919/−3,799, abierto
hoy 2-sep 10:12 UTC desde otra sesión, con 15 "constructores" fusionados.

Lo que ese PR NO trae: **ningún archivo de rubro**. `docs/auditoria-24/` no
existe en el árbol (`.gitignore:34` ignora `docs/auditoria-*/`; las rondas 22 y
23 se metieron con `git add -f`). Los hallazgos de la 24 viven solo en los
asuntos de los 188 commits. Por eso esta ronda **relanza los 12 rubros** sobre el
árbol ya integrado: la regla de continuación dice relanzar los rubros cuyo
archivo falte, y faltan los doce.

Y hay una razón más fuerte: **la CI del #303 está en rojo**. El cuerpo del PR
afirma «`tsc --noEmit`: limpio», y en la máquina donde se escribió lo estaba —
pero el job `verificar` de GitHub Actions muere en el paso Typecheck con
`FATAL ERROR: Ineffective mark-compacts near heap limit — JavaScript heap out of
memory`, exit 134, en las dos corridas. Auditar el árbol que ese PR propone
mergear es exactamente el trabajo de hoy.

## Base y punto de partida

- Rama base: `master` = `615496d`.
- Árbol auditado: `aud24/integracion` = `49ecf93`.
- Ronda anterior: auditoría 23 (reporte archivado fuera del repo), global **5.4**.
- Árbol limpio al arrancar (`git status --porcelain` vacío) → **autofix habilitado**.

## Qué cambió desde la auditoría 23

`master` avanzó 9 commits desde `c7c3d1c` (la base de la 23): el merge de la
propia auditoría 23 (#296), 6 bumps de dependencias, `feat(lead)` con la
migración 0275→0276 renumerada por colisión (#292, #300), y el arreglo del QR
`zxing-wasm` (#290).

Encima de eso, `aud24/integracion` trae 188 commits. Por volumen, los frentes
que más movieron:

| Frente | Qué entró |
|---|---|
| Migraciones | **0278 → 0301** (24 nuevas). Incluye `0300_gasto_no_tras_liquidar_reconciliado` — la 0283 (fiscal) y la 0299 (revision) redefinieron la MISMA función SQL en ramas paralelas y `create or replace` se comió media 0283 |
| Fiscal | póliza por comprobante en proporción (0281), REP con piso y forma (0283), IEPS de diésel contra lista cerrada LISR 27-III, timbrado PUE por defecto |
| Legal | retiro de geolocalización a 90 días (0289), `docs/legal/RETENCION.md`, aviso que nombra a Stripe, ARCO por teléfono normalizado (0286) |
| Seguridad / auth | MFA obligatorio de superadmin, caducidad de llaves de API, `app_user.activo`, policies de solo lectura (0292), HSTS + CSP, límite de tasa que falla cerrado |
| Revisión | `liquidacion.revision` + `revisar_liquidacion` (0299), cola por llave, `GET /v1/liquidaciones` |
| Datos | 0286–0292, 0296–0301: formas de teléfono/RFC/placas, purgas, índices de `posicion`, coherencia viaje↔liquidación |
| Agéntico / WA | mutex con dueño y orden por hora del mensaje (0280), sellos de entrega (0279), plantilla ante 131047, ráfaga que no inventa el total |
| Ops | compuerta de despliegue `scripts/ci/compuerta-deploy.mjs`, `maxDuration` en 7 rutas de export, límite de tasa del chat |

## Dónde está todo

- **`/admin`** — consola de Javier (superadmin). Cruza todos los tenants a
  propósito; `lib/admin/negocio.ts` es la única función con ese permiso.
- **`/dashboard`** — panel del cliente (flota_admin, contador, encargado), ~31
  páginas, todas filtradas al tenant. Reusa los componentes de `/admin`.
- `src/` — 359,942 líneas TS/TSX, **810 archivos de prueba**.
- `supabase/migrations/` — 279 archivos, hasta la 0301.
- `normas/` — 37 fichas YAML. Es la **fuente de verdad fiscal y legal**; las
  marcadas `verificado_fuente_primaria` traen el texto literal y ganan cualquier
  discusión.
- `supabase/verificaciones.sql` — batería SQL contra Postgres real.

## Reglas del producto que no se rompen

**Nunca inventar una cifra.** El contralor va a cruzar lo que ve contra su PDF y
su contador. Si no hay dato real: se dice qué falta y por qué
(`dashboard/pendiente.tsx`, `EstadoVacio`). Nunca datos de ejemplo ni ceros que
parezcan medición. Una estimación se muestra declarada y con su supuesto a la
vista (`MINUTOS_CAPTURA_MANUAL` en `lib/likida/analytics.ts`).

**Un rótulo tiene que ser verdad.** Si dice "del periodo", la consulta filtra por
fecha. Si un filtro está en pantalla, mueve TODO lo que hay debajo.

**El formato de cifras vive solo en `lib/formato.ts`.** Hay una prueba que falla
si aparece `toLocaleString('es-MX')` en cualquier otro archivo.

**Fallar cerrado y decirlo.** supabase-js reporta errores POR VALOR: sin
comprobar `error` explícitamente, una base caída se lee como "no hay nada" y el
panel afirma "aún no hay liquidaciones" estando ciego. Ver `exigir()` y
`traerTodo()` en `analytics.ts` — PostgREST recorta a 1,000 filas en silencio.

## Trampas ya pisadas (no volver a caer)

- `gasto.ocr_raw` está MUERTA — `repo.ts` escribe `ocr_confianza`/`ocr_extra`.
- `politica_gasto` (la tabla) está muerta. La política viva es
  `tenant.config.politica`, vía `getConfig()`.
- `wa_mensaje_procesado` NO tiene `tenant_id`: no se puede atribuir a una flota.
- `viaje.estatus` solo admite `abierto | en_cuadre | liquidado`. `app_user.rol`:
  superadmin, flota_admin, contador, operador, encargado.
- `cliente`, `unidad`, `tarifa`, `factura_emitida`, `pago_recibido`, `posicion`,
  `cotizacion`, `mantenimiento` y `ticket_mensaje` **YA TIENEN escritor**. Si vas
  a "construir el escritor", ya existe.
- Siguen SIN escritor: `geocerca`, `terminal` (le entró escritor en la 0298 —
  verificar), `portal_credencial`, `invitacion`, y las muertas de facto
  `campania`/`envio_mensaje`.
- **La base entera está en cero (0 viajes) porque no hay clientes todavía**, no
  porque falte código. Antes de usar cualquier tabla, mira si tiene filas.
- `requireSessionTenant(destino)` arma su redirect a /login con un string fijo y
  **pierde el query string** — por eso existe `dashboard/sufijo.ts`.

## Cómo se verifica AQUÍ (nube, sin credenciales)

La compuerta es **`npm test` + `npx tsc --noEmit` + `npm run lint`**.

**NO se corre `npm run build`**: pide Supabase, OpenRouter, Facturapi y Upstash,
que aquí no existen, y su fallo no dice nada del código.

**NO se corren `pruebas-manuales/*.prueba.ts`**: hacen llamadas reales de pago.

No hay `.env`, ni base, ni red a los proveedores.
