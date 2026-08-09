# Seguridad — auditoría 17 (pase 2)

**Nota: 6/10** (antes 7). Razón del movimiento: **mirada más profunda**. La
migración 0086 se leyó línea por línea y **no ensanchó nada** —quitar
`and not is_operador()` es un no-op algebraico para los cuatro roles que
quedan— y de paso **cerró** el hallazgo reincidente de la ronda 13
(`operador_sube_su_pod` fue borrada, no parchada). Pero al comprobar policy por
policy salió lo que el pase 1 anotó como "está bien": **`/dashboard` NO tiene
dos capas de rol.** Las dos que reporté (proxy + `puedeVerRuta`) corren en el
MISMO proceso de Next; en la base, `tenant_data` sobre `viaje`, `gasto` y
`liquidacion` no mira el rol. El repo mismo escribió el modelo de amenaza que
eso rompe (`0048:42-46`) y aplicó el remedio (`ve_finanzas()`) a las tablas
vacías, no a las que tienen el dinero. Súmale que `sharp` sigue en 0.34.5 sin
tocar un segundo pase, y la nota baja uno.

**El riesgo mayor del rubro, hoy:** el jefe de tráfico (`encargado`) y el
contador tienen, por RLS, lectura **y escritura** completas sobre las 19 tablas
de negocio de su flota —incluidas `gasto`, `liquidacion` y `operador`—, y la
separación que el producto vende ("el encargado despacha, no factura"; "el
contador es de solo lectura") vive únicamente en TypeScript.

---

## Estado de los hallazgos del pase 1

| # | Hallazgo del pase 1 | Estado hoy | Evidencia |
|---|---|---|---|
| 1 | **[ALTO]** `sharp` 0.34.5 decodifica bytes que elige el chofer | **REINCIDENTE, sin cambio** | `package.json` sigue en `"sharp": "^0.34.0"`; `node -e require('sharp/package.json').version` → **0.34.5**; `npm audit` sigue reportando GHSA-f88m-g3jw-g9cj. `cfdi.ts:249` intacto (`sharp(image).rotate().resize(...)`). |
| 2 | **[MEDIO]** `operador_sube_su_pod` — el chofer certifica su propio POD | **CERRADO** | `0086:30` → `drop policy if exists operador_sube_su_pod on public.pod;` y `0086:29` también borra `operador_ve_su_pod`. `pod` queda solo con `tenant_data` (`0086:38-52`). Ninguna migración posterior (0087, 0088) la recrea. Ya no existe rol que la pudiera usar: `0086:96-98` retira `operador` del dominio. |
| 3 | **[MEDIO]** `/admin` es una sola capa (20 páginas sin puerta propia) | **REINCIDENTE, sin cambio** | `requireSuperadmin()` sigue solo en `src/app/admin/layout.tsx:36`. Barrido de hoy: las mismas **20** `page.tsx` bajo `/admin` no mencionan ninguna guardia. `proxy.ts:117-132` sigue preguntando solo "¿hay sesión?". |
| 4 | **[MEDIO]** QStash: el productor arranca con menos config que el consumidor | **REINCIDENTE, sin cambio** | `facturar/route.ts:308` sigue disparando con `UPSTASH_QSTASH_TOKEN` solo; `cola/route.ts:22-28` sigue exigiendo tres. `env.ts:29-38` (`GROUPS`) sigue sin ninguna `QSTASH_*`. |
| 5 | **[BAJO]** `search_path` borrado de `config_tenant_valida` por 0082/0083/0085 | **REINCIDENTE** | 0086, 0087 y 0088 no tocan la función. `pg_proc.proconfig` sigue sin restaurar desde el repo. |
| 6 | **[BAJO]** `/cuenta` fuera del matcher del proxy | **REINCIDENTE, y la lista encogió** | `proxy.ts:108` ahora es `['/dashboard', '/admin']` (se fueron `/mis-viajes` y `/chofer`). `/cuenta` sigue sin estar y `src/app/cuenta/page.tsx` sigue con su único `requireSessionTenant`. |
| 7 | **[BAJO]** El callback de QStash no comprueba el destino de la firma | **REINCIDENTE, sin cambio** | `cola/route.ts:36-39`: `receiver.verify({ signature, body })`, sin campo `url`. |

**Además, retiro un renglón del "está bien" del pase 1:** «*`/dashboard` sí
tiene dos capas de rol*». Es falso — ver el primer hallazgo de abajo.

---

## Hallazgos

### [ALTO] Las tablas del dinero no tienen capa de rol en la base: un `encargado` las lee enteras por PostgREST
`supabase/migrations/0086_retirar_rol_operador.sql:38-52` · contra
`supabase/migrations/0048_comercial_cliente_tarifa_ingreso.sql:42-46` ·
`src/lib/auth/visibilidad.ts:41` · `src/lib/auth/permisos.ts:4-8`

La 0086 reescribió `tenant_data` en 19 tablas y la dejó así:

```sql
create policy tenant_data on %I for all
  using (tenant_id = any(get_user_tenant_ids()) or is_superadmin())
  with check (tenant_id = any(get_user_tenant_ids()) or is_superadmin())
```

En esa lista están `gasto`, `liquidacion`, `viaje`, `wa_conversacion`,
`operador`, `pod`, `cfdi_xml`, `llm_costo`. **Ni una menciona el rol.**
Mientras tanto `visibilidad.ts:41` declara `encargado: ['operacion']` y el
comentario de `visibilidad.ts:8-13` explica por qué: "enseñarle el margen de la
flota no es un detalle de UI, es exponerle a un puesto medio las finanzas
completas de la empresa".

La función que resuelve exactamente esto **ya existe**: `ve_finanzas()`
(`0048:47-60`, `rol in ('superadmin','flota_admin','contador')`). Se aplicó a
`cliente`, `tarifa`, `factura_emitida`, `pago_recibido`, `factura_viaje` y
`cotizacion` — las seis tablas que el MAPA declara **vacías, nadie las escribe
todavía**. No se aplicó a ninguna de las tres que sí traen dinero.

**Escenario, con valores.** Celinda es `app_user.rol = 'encargado'` del tenant
`11111111-1111-1111-1111-111111111111` (jefa de tráfico de Transportes
Innovativos, cuenta legítima con su magic link). En el panel,
`/dashboard/cuadre` y `/dashboard/rentabilidad` la rebotan a `/dashboard`
(`tenant-efectivo.ts:105`). Abre una terminal:

```
GET https://<ref>.supabase.co/rest/v1/liquidacion
    ?select=viaje_id,total_anticipo,total_comprobado,diferencia,estatus
apikey: <anon>
Authorization: Bearer <su access_token, el de su propia sesión>
```

`get_user_tenant_ids()` devuelve su tenant, la policy pasa, y sale **la
liquidación de cada viaje de la flota con anticipo, comprobado y diferencia** —
literalmente el CSV que `api/export/liquidaciones/route.ts:45-48` le niega con
un 403 y el mensaje "Tu rol no ve las cifras de dinero de la flota". Lo mismo
con `wa_conversacion`: el historial completo de WhatsApp de todos los choferes
(dato personal de terceros, LFPDPPP), que es exactamente el daño que la 0078
enumera en su encabezado —lo cerró para el chofer y nunca para el encargado.

**Refutación intentada, y por qué no me la creo.** Lo único que hace falta y
Celinda no tiene automáticamente es la anon key: hoy `NEXT_PUBLIC_SUPABASE_ANON_KEY`
solo se lee en `proxy.ts:119-120` y `supabase/server.ts:10-11`, ninguno de los
dos en un bundle de cliente, así que no está inlineada en el navegador (lo
verifiqué: el único `use client` que toca supabase es
`dashboard/motor-fiscal-periodo.tsx`, y no la usa). Pero (a) el project-ref va
en claro en el nombre de su propia cookie `sb-<ref>-auth-token`, así que la URL
no es secreto; (b) Supabase documenta la anon key como pública por diseño y el
repo **lo asume literalmente** en `0048:43-44` — "cualquier usuario autenticado
tiene la anon key y puede pegarle a PostgREST directo: ahí la única frontera es
RLS"; y (c) basta que un solo componente cliente futuro llame a
`createBrowserClient` para que Next la inline. Una frontera de autorización que
se sostiene porque una llave *documentada como pública* todavía no se publicó no
es una segunda capa.

**Consecuencia.** El puesto medio de la flota tiene, con su cuenta legítima, el
margen y el gasto completo de la empresa y los chats de todos los choferes. Y en
la sala: el contralor pregunta "¿mi jefe de tráfico puede ver esto?", la
pantalla dice que no y la base dice que sí.

**Causa raíz probable.** `permisos.ts:4-8` fija la doctrina ("RLS es por TENANT,
no por rol… eso es correcto para flota_admin/encargado/contador — los tres viven
del mismo panel, mismos datos") y la 0044 la contradijo al partir el panel por
áreas, sin que nadie volviera a las policies. La 0086 fue la ocasión en que se
reescribieron esas 20 policies una por una, y se copió el predicado viejo.

---

### [ALTO] El contador "de solo lectura" puede ESCRIBIR las 19 tablas, incluida la bitácora que lo delataría
`supabase/migrations/0086_retirar_rol_operador.sql:47-49` (`for all` … `with check`) ·
`0086:76-77` (`bitacora_insercion`) · `src/lib/auth/visibilidad.ts:84-86` ·
`src/lib/auth/permisos.ts:17-19` · `src/lib/likida/conv.ts:100-114`

`visibilidad.ts:84-86` afirma: "Lo que hace al panel del contador de SOLO
LECTURA no es el área: es que ninguna de sus páginas expone una acción (ver
`permisos.ts` — `puedeAsignar`/`puedeAdministrar` ya le dicen que no)". Eso es
cierto de los botones. La policy `tenant_data` es `for all` **con `with check`
idéntico al `using`**: INSERT, UPDATE y DELETE incluidos, para cualquier
`app_user` del tenant.

**Escenario 1 — cambiar dinero.** Mario, `rol='contador'` de la flota
`1111…1111`, con su sesión válida:

```
PATCH https://<ref>.supabase.co/rest/v1/gasto?id=eq.<g-77>
apikey: <anon>   Authorization: Bearer <su access_token>
{"monto": 3900}
```

El gasto de diésel de $4,200 —el que en el seed dispara la diferencia de $200
por tope de política— pasa a $3,900. `cuadrarDesdeDB` vuelve a cuadrar sobre ese
número y el PDF sale sin la diferencia. Ninguna server action se ejecutó,
ninguna comprobación de `puedeAdministrar` corrió, y `anotar()`
(`administracion.ts:245`) no se llamó: **la bitácora no tiene una línea.**

**Escenario 2 — robarse la identidad de WhatsApp de un chofer.** Misma sesión:

```
PATCH .../rest/v1/operador?id=eq.33333333-0000-0000-0000-000000000001
{"telefono": "5215512345678"}
```

`resolveOperador` (`conv.ts:100-114`) resuelve al chofer **por teléfono**,
`.eq('activo', true)`, y devuelve `tenant_id` y `operador_id`. A partir de ese
PATCH, los mensajes que manda Mario desde su celular entran al motor como si
fueran de Juan Pérez Ramírez (OP-101): puede subir comprobantes, cerrar el
viaje y disparar la liquidación con el nombre de Juan en el PDF. Es palabra por
palabra el daño que la 0078 documentó para el chofer ("cambiarse el suyo para
robar la identidad de WhatsApp de un compañero") y que cerró **solo** para el
rol que acaba de desaparecer.

**Escenario 3 — ensuciar la evidencia.** La 0086:76-77 dejó `bitacora_insercion`
con `with check (tenant_id = any(get_user_tenant_ids()) or is_superadmin())` y
nada más. `bitacora_auditoria` no valida `actor_email` ni `accion`
(`0053:66-81`), así que un `POST /rest/v1/bitacora_auditoria` con
`{"tenant_id":"1111…","actor_email":"javier@…","accion":"politica.cambiada"}`
inserta un asiento atribuido al dueño. La tabla es append-only por RLS (no hay
policy de UPDATE/DELETE) — correcto —, pero append-only con INSERT abierto
significa que el registro **se puede diluir**, no borrar, que para efectos de
evidencia es igual de malo. `bitacora_lectura` sí exige `administra_flota()`:
el dueño lee un log en el que no puede confiar.

**Consecuencia.** Un contralor que audite una liquidación disputada no tiene
forma de distinguir un número que puso el motor de uno que puso un usuario con
`curl`. Para un producto cuya promesa es "nunca inventar una cifra", el que
puede inventarla es la persona que se sienta al lado del comprador.

**Causa raíz probable.** `for all` con el mismo predicado en `using` y en
`with check` se copió 19 veces por un `execute format` en bucle; nadie preguntó
qué roles del dominio **escriben** de verdad (la respuesta, según el código, es
ninguno: todo el panel escribe por `supabaseAdmin()`).

---

### [MEDIO] El recordatorio automático no distingue "viaje que acaba de vencer" de "viaje viejo": el primer cron manda el backlog entero
`src/lib/likida/recordatorio_comprobacion.ts:52-62` ·
`supabase/migrations/0087_recordatorio_comprobacion.sql:13-14` · contra
`src/lib/likida/escalar_viaje.ts:86-92`

La consulta que decide a quién se le manda WhatsApp es:

```js
.in('estatus', ['abierto', 'en_cuadre'])
.is('recordatorio_comprobacion_en', null)
.not('fecha_inicio', 'is', null)
.lte('fecha_inicio', limite)     // hoy − 3 días
.limit(100)
```

La 0087 agrega `recordatorio_comprobacion_en` como `timestamptz` nulo y **no
hace backfill**. La hermana mayor, `escalar_viaje.ts:90`, tiene la protección
que aquí falta: `.not('avisado_en', 'is', null)` — un viaje que nunca pasó por
el flujo nuevo es invisible para la escalación. Esta consulta no tiene
equivalente: cualquier viaje `abierto` con `fecha_inicio` vieja califica, sin
importar si lleva ahí desde julio.

**Escenario, con valores.** Se despliega 0087 y a la hora en punto corre
`GET /api/cron/escalar`. En la base viven los viajes `abierto` que dejaron los
ensayos de demo de las últimas semanas —los del tenant demo apuntan a
`operador` OP-101, `telefono = 529993700779`, que el propio `seed.sql:71-75`
documenta como **el número real de Javier**. Si hay 14 de esos con
`fecha_inicio ≤ hoy−3`, el bucle de `enviarRecordatoriosComprobacion` reclama
los 14 y manda **14 WhatsApps seguidos al mismo teléfono**, cada uno diciendo
"Llevas N días con tu viaje *VJ-2026-xxxx* sin mandarme comprobantes". Los que
apuntan a los placeholders `+521111111102…105` fallan en Meta, se sellan igual
(`recordatorio_comprobacion.ts:116-117` sella antes de mandar, a propósito) y
quedan como líneas en `fallos`.

**Consecuencia.** Dos: (a) la ráfaga de envíos a números inválidos es
exactamente lo que Meta puntúa como calidad del número —el WABA es UNO y es el
del demo; si baja de tier o se marca, el demo no tiene canal—; (b) si el
teléfono del contralor o de un chofer real está capturado, la primera impresión
del recordatorio automático es una ráfaga, y el propio archivo declara la regla
que se rompe: "un canal que insiste todos los días se aprende a ignorar"
(`recordatorio_comprobacion.ts:25-27`).

**Lo que NO pude verificar:** cuántas filas `abierto` con `fecha_inicio ≤ hoy−3`
hay hoy en producción. Sin conexión a Supabase no puedo contarlas. Lo que sí es
verificable en el repo es la ausencia del gate y del backfill, y el contraste
explícito con `escalar_viaje.ts:90`, que sí lo tiene.

**Causa raíz probable.** Se copió el mecanismo de idempotencia de la 0058
(sello + claim condicional) sin copiar la condición que hace que el sello nulo
signifique "todavía no le toca" en vez de "nunca se le ha mandado".

---

### [BAJO] `resolverTenantEfectivo` ignora el `error` al resolver `?tenant=` y cae en silencio a otra flota
`src/lib/auth/tenant-efectivo.ts:120-126` · contra
`src/lib/auth/tenant-api.ts:86-100`

```js
const { data: t } = await supabaseAdmin().from('tenant').select('id, nombre').eq('id', sp.tenant).maybeSingle();
if (t) { tenantId = t.id; tenantNombre = t.nombre; }
```

Se destructura `data` y **no `error`** — el patrón que el CLAUDE.md nombra por
su nombre ("supabase-js reporta errores POR VALOR"). El repo ya resolvió esto
en la ruta hermana: `tenant-api.ts:86-100` distingue "no existe" (400) de "no
pude preguntar" (503) precisamente "para no escribir en la flota equivocada".

**Escenario.** Javier (superadmin) abre
`/dashboard/cuadre?tenant=aaaa…aaaa` para enseñar la flota de Innovativos.
Supabase devuelve un `error` transitorio (`fetch failed`). `t` es `null`, el
`if` no entra, `tenantId` se queda en `tenantDemo()` y `tenantNombre` en `null`.
La pantalla se pinta completa, con las cifras del **tenant demo**, sin un solo
aviso: la única señal es que el nombre de la flota no aparece.

**Consecuencia.** No hay fuga de privilegio —un superadmin ya podía ver las dos
flotas— pero sí una pantalla que enseña las cifras de una flota mientras el
usuario cree estar viendo otra, en la única sesión donde se comparan clientes.
BAJO porque solo alcanza a superadmin y el árbol degrada a datos que esa sesión
ya podía ver.

**Causa raíz probable.** El bloque de abajo (`tenant-efectivo.ts:137-140`) sí comprueba `error`;
este se escribió antes y no se alineó cuando se agregó el de abajo.

---

## CVEs revisados y descartados (con la razón)

`npm audit` (corrido hoy): **13 — 2 críticas, 8 altas, 3 moderadas.** Idéntico
al pase 1: ni un paquete cambió de versión en los 12 commits. Repito el veredicto
por escrito, no por referencia:

| Paquete | Sev. | Camino real en ESTA app | Veredicto |
|---|---|---|---|
| **`sharp` <0.35.0** (GHSA-f88m-g3jw-g9cj: CVE-2026-33327/-33328/-35590/-35591, corrupción de memoria en los cargadores TIFF/WebP/HEIF de libvips) | HIGH | **Sí.** Producción, instalada **0.34.5**. `cfdi.ts:249` hace `sharp(image).rotate().resize().jpeg().toBuffer()` sobre los bytes que un chofer manda por WhatsApp, bajados sin tope de tamaño ni validación de formato (`meta/client.ts:426`), dentro del proceso que tiene `SUPABASE_SERVICE_ROLE_KEY`. `sharp` enruta por *magic bytes*, no por el mime declarado. | **ABIERTO — hallazgo ALTO del pase 1, reincidente** |
| `vitest` <3.2.6 (GHSA-5xrq-8626-4rwp, CVSS 9.8) | CRITICAL | No. Exige el **servidor de Vitest UI** escuchando. La suite corre `npx vitest run`; no hay `--ui` ni `@vitest/ui` en `package.json`. `devDependency`: no viaja al bundle de Vercel. | DESCARTADO |
| `@vitest/coverage-v8` ≤3.2.5 | CRITICAL | No. Su `via` es literalmente `["vitest"]`, sin advisory propio. Mismo alcance dev-only. | DESCARTADO |
| `vite` ≤6.4.2 (path traversal en `.map` de optimized deps; `server.fs.deny` bypass en Windows; launch-editor NTLMv2 por UNC) | HIGH | No. Los tres son del **dev server** de Vite, que este repo nunca levanta (Next trae el suyo), y dos son específicos de Windows; el entorno es Linux. Entra solo como dependencia de `vitest`. | DESCARTADO |
| `vite-node`, `@vitest/mocker`, `esbuild` ≤0.24.2 | MOD | No. Cuelgan de `vite`/`vitest`. El de `esbuild` exige su dev server escuchando y que la víctima visite una web hostil con él encendido. Dev-only. | DESCARTADO |
| `brace-expansion` (GHSA-mh99-v99m-4gvg y dos bypasses de la mitigación de CVE-2026-14257 — DoS por expansión sin cota) | HIGH | No. `npm ls` lo pone bajo `eslint`, `@eslint/config-array`, `@eslint/eslintrc`, los plugins de import/jsx-a11y/react y `test-exclude`. Todas dev. Lo que expande son los globs de configuración que escribimos nosotros. Un DoS del linter no es un DoS del producto. | DESCARTADO |
| `js-yaml` 4.0.0–4.3.0 (CPU cuadrática en `!!omap`) | HIGH | No. Camino único: `@eslint/eslintrc` → `js-yaml`. **Ojo con la trampa**: las 24 fichas de `normas/` son YAML, pero no pasan por `js-yaml` (no aparece en el árbol de producción) y son archivos del repo, no entrada de un tercero. | DESCARTADO |
| `fast-uri` 3.0.0–3.1.4 (confusión de host por `\`) | HIGH | No. Camino único `@sentry/nextjs → @sentry/webpack-plugin → webpack → schema-utils → ajv → fast-uri`. Ese `ajv` valida esquemas de configuración de webpack en build. Ninguna URL de petición pasa por ahí; la app valida con `zod`. | DESCARTADO |
| `nanoid` <3.3.17 (bucle infinito con `size = 0` y generador propio) | HIGH | No. Camino único `postcss → nanoid`, con tamaño fijo para ids de source-map. Nada llama a `nanoid` con generador propio ni con `size` de un tercero. Build-time. | DESCARTADO |
| `postcss` ≤8.5.22 (lectura de `.map` arbitrarios por `sourceMappingURL`; XSS por `</style>` sin escapar) | HIGH | No. El CSS que procesa es el nuestro (`@tailwindcss/postcss` sobre `src/**/*.css`), en build. No hay ruta que meta CSS de un usuario en postcss en runtime; el repo pinta con `style={{}}`, no genera CSS a partir de datos. | DESCARTADO |
| `next` (agregado, HIGH) | HIGH | Su `via` son exactamente `postcss` y `sharp`, sin advisory propio de Next. | Cubierto por `sharp` |

**Resumen honesto:** de las 10 críticas/altas, **una sola** tiene camino real de
explotación en esta app (`sharp`), y sigue exactamente igual que hace un pase.
Las otras nueve son dev-only o build-time y quedan descartadas por escrito
arriba. Subir `vitest` a 4.x es semver-major y no compra seguridad de producción.

---

## Lo que revisé y está bien

- **La 0086 NO ensanchó el aislamiento — comprobado policy por policy.**
  `is_operador()` era `select exists (… where id = auth.uid() and rol =
  'operador')` (`0045:26-29`). Para `flota_admin`, `contador` y `encargado`
  devolvía SIEMPRE false, así que `(tenant_id = any(…) and not is_operador())`
  ≡ `tenant_id = any(…)`. Quitar el predicado es un no-op algebraico para los
  cuatro roles que quedan, en las 19 tablas del bucle (`0086:38-52`), en
  `ticket_mensaje` (`0086:56-67`), en `app_user_self` (`0086:70-72`) y en
  `bitacora_insercion` (`0086:75-77`). Lo que la 0086 sí cambia es que borra el
  acceso del chofer, no que abra el de nadie.
- **Las policies de la 0078/0079/0081, una por una:** `tenant_self` sobre
  `tenant` (solo `select` desde `0078:56`) **no la toca la 0086** y ninguna
  migración posterior la recrea — la flota sigue sin poder reescribir su RFC ni
  su política por PostgREST. Los siete `tenant_data` de la 0078 y los dos
  cierres de la 0079 pasaron al patrón nuevo sin perder el brazo de tenant.
  `operador_sube_su_pod` (0081) fue **borrada**, no reescrita.
- **La 0086 no dejó ninguna tabla sin policy.** Crucé `pg_policies`-por-texto:
  las 20 policies que nombraban `is_operador`/`get_user_operador_id` están todas
  recreadas ANTES del `drop function` (`0086:80-81`), sin `CASCADE` — si
  quedara un dependiente, la migración falla en voz alta en vez de tirar RLS.
  Y el `drop function` sin `cascade` es la red: no puede borrar en silencio.
- **El dominio de rol se estrecha fallando cerrado.** `0086:96-98` reemplaza
  el CHECK por `('superadmin','flota_admin','contador','encargado')` dentro de
  un `do $$` que se niega si queda una fila con `rol='operador'` (el CHECK la
  rechaza y la migración entera revierte). El tipo `RolAppUser`
  (`provisionar.ts:16`) ya no lo admite, y una sesión sin fila legible cae a
  `SIN_ROL` → `areasDe` → `[]` → `/sin-acceso` (`session.ts:34`,
  `visibilidad.ts:47-48`).
- **Ninguna ruta se quedó sin guardia al borrarse `/chofer` y `mis-viajes`.**
  Barrí las 40 `page.tsx` y las 8 `route.ts` del árbol. Las que aparecen sin
  guardia son públicas por diseño y verificadas una a una: `/`, `/login`,
  `/sin-acceso`, `/terminos`, `/privacidad`, `/demo`, `/aviso/[tenant]`
  (público por el art. 16 fr. II, valida forma de UUID antes de consultar y
  `notFound()` indistinguible), `/auth/callback` (acota `next` con
  `startsWith('/dashboard')`), `/api/demo` (motor puro, sin DB, con tope de
  cuerpo de 64 KB y rate limit), `/api/webhook/whatsapp` (HMAC), y
  `/api/cron/facturar/cola` (firma de QStash). `requireOperador` desapareció y
  no quedó ningún `import` colgando (`tsc --noEmit` limpio).
- **`PANEL_PROPIO` vacío no abre nada.** `visibilidad.ts:138` es `{}`, así que
  `inicioDe` cae a la rama por ÁREA. El comentario declara la trampa que
  quedaría si alguien le diera un área a un rol de esa tabla; hoy no hay
  ninguno. `rolEfectivo` (`visibilidad.ts:166-170`) sigue siendo solo-quita y solo para una
  sesión REAL de superadmin.
- **`/api/cron/escalar` se autentica con `CRON_SECRET` y falla cerrado.** Sin
  la variable devuelve **500** —no 200— con `logger.error`
  (`escalar/route.ts:50-56`); con cabecera equivocada, **401 sin cuerpo**
  (`:57-60`). Los dos chequeos corren en `try/catch` independientes, así que un
  fallo de uno no cancela el otro, y los errores viajan en la RESPUESTA además
  del log. La comparación es `!==` (no `timingSafeEqual`): lo miré y lo
  descarto — un oráculo de temporización de nanosegundos sobre TLS y el ruteo
  de Vercel no es explotable, y el secreto no es adivinable por longitud.
- **El envío nuevo es idempotente de verdad.** `reclamarRecordatorio`
  (`recordatorio_comprobacion.ts:153-170`) hace `update … .is(campo, null)
  .select('id')` y solo manda si ganó filas — el sello se pone ANTES del
  WhatsApp, no después, así que dos corridas solapadas de un cron
  *at-least-once* no pueden mandar dos veces. Además filtra por `tenant_id` en
  el UPDATE aunque ya filtre por `id`.
- **Firma del webhook de WhatsApp.** HMAC-SHA256 con `crypto.timingSafeEqual` y
  guardia de longitud previa (`meta/client.ts:40-46`); tope de cuerpo ANTES de
  leer y otra vez con `raw.length` (`webhook/whatsapp/route.ts:91-94`), que
  cierra el hueco de `Transfer-Encoding: chunked` que `ratelimit.ts:21-23`
  documenta. El challenge del GET también es timing-safe.
- **Firma de Stripe.** Tolerancia de tiempo antes del HMAC, firma sobre el
  cuerpo crudo, `timingSafeEqual`, y **503 —no 200—** si falta
  `STRIPE_WEBHOOK_SECRET`; idempotencia por `evento_stripe` antes de aplicar.
- **Ningún secreto con fallback derivado de otro secreto.** Rebarrí todos los
  `process.env.X ?? …` / `|| …` del árbol tras los 12 commits: los únicos
  fallbacks siguen siendo URL pública, tenant de demo y entorno de
  observabilidad. `supabaseAdmin()` **lanza** si falta la service-role key.
- **Nada de secretos en el repo.** `.gitignore` cubre `.env*`; el único
  rastreado es `.env.example`, con todos los valores en blanco. Barrido de
  `eyJ…`/`sk-…`/`sk_live`/`whsec_…`/`EAA…`/`qstash_…` sobre los archivos nuevos
  de los 12 commits: cero.
- **URLs firmadas: el inventario encogió y quedó más corto que antes.** Quedan
  cuatro y todas de **60 s**: PDF del contralor (`api/export/pdf/[id]:95`), PDF
  por WhatsApp (`processor.ts:2123`) y PDF al contralor (`:2178`). Las de 600 s
  de `chofer.ts` desaparecieron con el archivo. `ligaComprobante`
  (`intake/almacen.ts:94`, 3600 s por default) **quedó sin un solo llamador**
  tras borrar `chofer.ts` — código muerto, no superficie viva. Buckets
  `liquidaciones` y `comprobantes` siguen privados y sin políticas de storage.
- **La ruta del PDF conserva sus puertas:** rate limit por IP, tenant de la
  sesión (no de la URL), área `dinero` **y** `puedeExportar`, `.eq('tenant_id')`
  explícito porque el service-role salta RLS, y 404 indistinguible entre "no
  existe" y "existe sin PDF".
- **`?tenant=` en las rutas de API sigue sin creerse.** `tenant-api.ts:56-73` y
  `:86-100` solo lo honran para superadmin y distinguen "no existe" (400) de
  "no pude preguntar" (503).
- **La vista `factura_saldo` sigue con `security_invoker = true`** (0054:42) —
  la única vista del esquema; ninguna migración posterior la recrea (un `create
  or replace view` sí habría reseteado la opción, como pasó con el
  `search_path` de `config_tenant_valida`).
- **`search_path` de las funciones de las que cuelga la RLS.**
  `is_superadmin`, `get_user_tenant_ids`, `ve_finanzas` y `administra_flota`
  siguen con su `set search_path` y sus `revoke … from public` +
  `grant … to authenticated` (0054:49-52) — el grant implícito que `revoke from
  anon` no alcanzaba. Las dos que la 0086 borró ya no son superficie.
- **CSP: la excepción nueva está acotada.** `proxy.ts:59-68` mete
  `'unsafe-eval'` SOLO bajo `NODE_ENV === 'development'`; el `script-src` de
  producción sigue siendo `'self' 'unsafe-inline'`. Verificado que el ternario
  se evalúa en módulo, no por petición.
- **Compuerta verde a mi paso:** `npx vitest run` → **255 archivos, 3,168
  pruebas verdes, 1 saltada**, exactamente la línea base del MAPA del pase 2.

---

## Lo que NO alcancé a revisar

- **El estado REAL del catálogo de Postgres.** Todo lo de RLS, grants y
  `search_path` sale de leer las 85 migraciones y componerlas mentalmente. Sin
  conexión a Supabase no pude correr `supabase/verificaciones.sql` ni consultar
  `pg_policies`/`pg_proc.proconfig`. En particular **no pude confirmar que la
  0086 se haya aplicado a producción**, ni si quedaba alguna fila
  `app_user.rol='operador'` que la hubiera hecho revertir entera — y si
  revirtió, el estado vigente es el de antes, con las policies del chofer
  todavía puestas.
- **Contar el backlog del recordatorio.** El MEDIO de `0087` depende de cuántos
  viajes `abierto` con `fecha_inicio ≤ hoy−3` hay hoy. Verifiqué la ausencia
  del gate, no el tamaño del disparo.
- **Confirmar en ejecución el hallazgo del layout de `/admin`.** Haría falta
  levantar la app (prohibido `npm run build`, sin entorno) y mandar la petición
  RSC con `Next-Router-State-Tree` forjado. Lo verificado es estático: 20
  páginas sin puerta propia y un proxy que no mira el rol.
- **Si la anon key está expuesta por otra vía** (una variable en un Preview de
  Vercel, un screenshot, la consola de Supabase compartida). Verifiqué que no
  está en el bundle de cliente de HOY; no puedo verificar los canales de fuera
  del repo.
- **Políticas de `storage.objects` creadas a mano** en la consola de Supabase:
  solo la 0046 crea políticas de storage desde el repo.
- **`src/lib/agents/` y `src/lib/llm/`** desde el ángulo de inyección de prompt
  con efectos. El MAPA declara que no tuvieron un solo cambio en los 12 commits
  y que la superficie está cerrada por diseño (`properties: {}`); confirmé que
  ninguna tool nueva la rompe, pero no audité prompts ni `registry`.
- **Superficie de `pruebas-manuales/*.prueba.ts`** (prohibido correrlas) y del
  adaptador de Playwright contra portales reales: solo lectura de código.
