# MAPA — auditoría 25 (ronda COMPLETA, 3-sep-2026)

## Qué es esta ronda

**Ronda COMPLETA, 12 rubros.** La decisión se tomó con la regla de tamaño, antes
de gastar un token en auditores:

- `list_pull_requests(state=open)` sobre `javiercamarapp/cuadra` devolvió `[]`.
  **No hay PR de auditoría abierto** → no aplica la regla de continuación.
- `git log b8a1a3a..HEAD -- src/ supabase/ normas/` devolvió **7 commits**,
  13 archivos, +358/−111 → **sí hubo cambios** → no aplica la ronda ligera.

Rama nueva: **`claude/auditoria-25`** (prefijo `claude/` obligatorio: las
routines solo pueden pushear a ramas con ese prefijo). Base: `master` =
`4f94490`. Árbol limpio al arrancar (`git status --porcelain` vacío) →
**autofix habilitado**.

## Base y punto de partida

- Rama base: `master` = `4f94490` (merge del PR #318).
- Ronda anterior: **auditoría 24**, global **6.2**, en `docs/auditoria-24/`.
- El clon de la nube **no traía `node_modules`**: se corrió `npm ci` antes de la
  compuerta. Es parte del costo de la ronda, no un fallo.

## Qué cambió desde la auditoría 24

Los 7 commits sobre `src/`, `supabase/`, `normas/` desde `b8a1a3a` (el merge del
PR #303 que cerró la 24):

| Sha | Qué entró |
|---|---|
| `592d26f` | `normas/.latido-vigilancia` — latido del 2-sep, 244 títulos, sin cambios del dominio. Solo datos, no código. |
| `66339d5` | `fix(chat)`: `tenantEfectivoChat` falla cerrado si el tenant de sesión/demo no existe (`src/app/api/dashboard/chat/tenant.ts`, +18 líneas de prueba). |
| `4198985` | `fix(verificaciones)`: repara 2 bloques que 0302/0303 rompieron (`supabase/verificaciones.sql`, +135/−…). |
| `5180c72` | `fix(agentes)`: audita y gradúa los 9 «agentes teatro»; `graduarAgente()` en `definiciones.ts`; expone `experimental` en `/admin/agentes`; **migraciones 0302 y 0303**. |
| `3cc8ead` | `[deploy] docs`: confirma migraciones 0272→0301 aplicadas, cierra DAT-3/DAT-4. Toca `supabase/APLICAR-EN-PRODUCCION.md`. |
| `aa5304d` | `chore(pulido)`: quita `cn()`/`clsx`/`tailwind-merge` (código muerto) de `src/lib/utils.ts`; archiva auditorías 22/23. |
| `18fa771` | `chore(normas)`: latido del 2-sep, egress bloqueado (#304). |

**Superficie nueva a mirar con prioridad**, por ser lo único que cambió:
`src/lib/likida/agentes/definiciones.ts` (`graduarAgente`, campo `experimental`),
`src/app/admin/agentes/contenido.tsx`, `src/app/api/dashboard/chat/tenant.ts`,
`supabase/migrations/0302_*.sql` y `0303_*.sql`, `supabase/verificaciones.sql`,
`src/lib/utils.ts`.

**Todo lo demás del repo sigue sin auditarse desde la 24**, y la 24 midió un
cambio de 188 commits — o sea que la mayoría de sus hallazgos abiertos siguen
vivos por construcción, no por descuido.

## Dónde está todo

- **`/admin`** — consola de Javier (superadmin). Cruza todos los tenants a
  propósito; `lib/admin/negocio.ts` es la única función con ese permiso.
- **`/dashboard`** — panel del cliente (flota_admin, contador, encargado), ~31
  páginas, todas filtradas al tenant. Reusa los componentes de `/admin`
  (`ui/kit`, `ui/graficas`, `charts`) — no hay una segunda librería de UI.
- `src/` — **360,158 líneas** TS/TSX, **810 archivos de prueba**.
- `supabase/migrations/` — **281 archivos**, hasta la **0303**.
- `normas/` — **37 fichas YAML**. Es la **fuente de verdad fiscal y legal**; las
  marcadas `verificado_fuente_primaria` traen el texto literal y ganan cualquier
  discusión.
- `supabase/verificaciones.sql` — batería SQL contra Postgres real (249 bloques).

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
  La prueba de que algo pasó por OCR es `ocr_confianza`.
- `politica_gasto` (la tabla) está muerta. La política viva es
  `tenant.config.politica`, vía `getConfig()`.
- `wa_mensaje_procesado` NO tiene `tenant_id`: no se puede atribuir a una flota.
- `viaje.estatus` solo admite `abierto | en_cuadre | liquidado` (constraint
  `viaje_estatus_dominio`). `app_user.rol`: **superadmin, flota_admin, contador,
  encargado, vendedor** (`operador` se retiró en la 0086; `vendedor` entró en la
  0105). El MAPA de la 24 decía «operador» y estaba desactualizado.
- `cliente`, `unidad`, `tarifa`, `factura_emitida`, `pago_recibido`, `posicion`,
  `cotizacion`, `mantenimiento` y `ticket_mensaje` **YA TIENEN escritor**. Si vas
  a "construir el escritor", ya existe.
- Siguen SIN escritor: `geocerca`, `terminal`, `portal_credencial`,
  `invitacion`, y las muertas de facto `campania`/`envio_mensaje` (las sustituyó
  `campana`, 0123).
- **La base entera está en cero (0 viajes) porque no hay clientes todavía**, no
  porque falte código. Antes de usar cualquier tabla, mira si tiene filas; si no,
  la pantalla dice qué falta.
- `requireSessionTenant(destino)` arma su redirect a /login con un string fijo y
  **pierde el query string** — por eso existe `dashboard/sufijo.ts`.

## Cómo se verifica AQUÍ (nube, sin credenciales)

La compuerta es **`npm test` + `npx tsc --noEmit` + `npm run lint`**.

**NO se corre `npm run build`**: pide Supabase, OpenRouter, Facturapi y Upstash,
que aquí no existen, y su fallo no dice nada del código.

**NO se corren `pruebas-manuales/*.prueba.ts`**: hacen llamadas reales de pago.

No hay `.env`, ni base, ni red a los proveedores.
