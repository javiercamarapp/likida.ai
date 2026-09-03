# Seguridad — auditoría 25

**Nota: 6/10** (antes 7). Razón del movimiento: **mirada más profunda** — el
código del rubro casi no se movió (los 7 commits desde la 24 tocan 12 archivos
y ninguno de `src/lib/auth/`, `src/proxy.ts` ni `src/lib/ratelimit.ts`), pero el
7 descansaba en una comprobación que la 24 hizo bien y otra que no hizo: recorrió
las 67 rutas de `/api` buscando un camino SIN AUTENTICAR a datos de un tenant —y
no lo hay, sigue sin haberlo—, y no recorrió las dos fronteras que están DENTRO
de una sesión legítima: el límite de ROL frente a PostgREST, y el ciclo de vida
de una credencial cuando a una persona se le retira el acceso. En las dos hay
una sola capa, y en las dos el repo cree lo contrario por escrito.

Lo que sí sube: la superficie nueva de esta ronda está limpia. La 0302 retira el
overload correcto, la 0303 no toca permisos, `tenantEfectivoChat` falla cerrado
sin abrir otro camino, y **la clase de crítico de la 23 —una migración que
redefine una función SQL desde un cuerpo viejo y le come el `search_path`— no
reincidió**: de las 151 funciones de las 281 migraciones, **cero** `security
definer` sin `set search_path` (escaneo completo, abajo).

**El riesgo mayor hoy:** el jefe de tráfico (`encargado`) —a quien el producto
le promete al contralor que NO ve las finanzas— lee el anticipo y el ingreso de
flete de toda la flota con un `curl` a PostgREST, porque esa promesa vive en una
sola capa (`visibilidad.ts`) y la segunda (RLS) es ciega al rol en `viaje`.

## Hallazgos

### [ALTO] La baja de un usuario cierra el panel, la RLS y Auth — y deja vivo su token MCP, que lee el dinero de la flota por service_role
`src/lib/mcp/oauth.ts:515-517` y `:533-545` (`validarAcceso`) ·
`supabase/migrations/0265_mcp_oauth_revocacion_y_purga.sql:90-107` y su comentario
en `:109-110` · `src/lib/auth/usuarios_escritura.ts:175-217`
(`desactivarUsuario`) · `src/app/dashboard/usuarios/page.tsx:208-209`

Escenario, con valores:

1. Ana es `contador` de Transportes Innovativos. Conectó Claude.ai por
   `/mcp/autorizar`; tiene un acceso `lk_mcp_at_…` (TTL 8 h,
   `ACCESO_TTL_MS`, `oauth.ts:38`) y un refresco `lk_mcp_rt_…` (60 días,
   `:41`) que **rota y se renueva otros 60 días en cada uso**.
2. Ana se va de la empresa. El dueño abre `/dashboard/usuarios` y aprieta
   «Dar de baja». `desactivarUsuario` escribe `activo = false`
   (`usuarios_escritura.ts:191`), banea la cuenta en Auth (`:206`) y la
   pantalla contesta, textual: **«Cuenta dada de baja: ya no entra al panel y
   su sesión quedó revocada.»** (`usuarios/page.tsx:209`).
3. Las tres puertas que SEG-1 construyó se cierran de verdad:
   `getSessionTenant` devuelve `null` (`session.ts:99-102`), las cuatro
   funciones de RLS filtran `and activo` (`0294:62-89`), y el ban mata el
   refresh de la cookie.
4. Al día siguiente Ana le escribe a Claude: *«dame el cuadre del viaje
   INN-0442 y el resumen fiscal de septiembre de Innovativos»*.
   `POST /api/mcp` con `Authorization: Bearer lk_mcp_at_…` →
   `validarAcceso` (`oauth.ts:498`) comprueba `tipo`, `revocado_en`,
   `expira_en` y **revalida la identidad con el embed
   `app_user:user_id(tenant_id, rol)`** (`:517`). La baja NO cambió ni
   `tenant_id` ni `rol` —solo `activo`—, así que la comparación de
   `:534-538` pasa. Devuelve `{tenantId: t-inn, rol: 'contador'}`.
5. `despacharHerramienta` pregunta `puedeVerArea('contador','dinero')` → true,
   y `cuadre_viaje` / `resumen_fiscal` / `por_facturar` leen con
   `supabaseAdmin()` (service_role), que **no pasa por RLS**: el `and activo`
   de la 0294 nunca se evalúa en este camino.
6. Y no caduca solo: a las 8 h el cliente rota el refresco y
   `refrescarTokens` (`oauth.ts:415-427`) pregunta
   `mcp_oauth_usuario_vigente(user, tenant, rol)`, cuyo cuerpo es
   `select exists(... where id=? and tenant_id=? and rol=?)`
   (`0265:100-106`) — **sin `activo`**. Devuelve `true`, emite par nuevo,
   otros 60 días. Se renueva indefinidamente.

El comentario de la propia 0265 dice por qué: *«app_user **no tiene columna de
estatus/activo** — el criterio es identidad + tenant + rol exactos»* (`:110`).
Era cierto el 29-ago. Dejó de serlo el 2-sep con la **0294:45**, que agregó esa
columna exacta — y nadie volvió a esta función. La 0265 dejó además
`revocar_mcp_oauth_usuario` escrita, con grant, y con el escenario nombrado
(*«se fue el empleado»*, `src/lib/mcp/sesiones.ts:44-49`); su único llamador es
el botón manual de `/dashboard/sesiones-mcp` (`sesiones.ts:275`).
`desactivarUsuario` no la llama.

Consecuencia: el contralor aprieta «Dar de baja», lee en pantalla que la sesión
quedó revocada, y una ex-empleada conserva lectura de cuadres, resumen fiscal,
pendiente de facturar y métricas de la flota — el dato más sensible del
producto — durante 8 horas garantizadas y renovables sin límite mientras siga
usándolo. Es exactamente el escenario que SEG-1 (auditoría 24) vino a cerrar, con
la única puerta que SEG-1 no miró. Para la flota es también LFPDPPP: un tercero
sin relación laboral consultando datos de sus operadores y proveedores.

Causa raíz probable: la revalidación de identidad se ancló a `(tenant_id, rol)`
cuando `activo` no existía, y el flujo de baja que la 0265 esperaba se construyó
tres rondas después sin volver a ese punto.

### [ALTO] El límite entre el jefe de tráfico y el dinero de la flota tiene una sola capa: `viaje.anticipo` e `ingreso_flete` salen por PostgREST con la sesión del propio encargado
`supabase/migrations/0086_retirar_rol_operador.sql:38-52` (recrea `tenant_data`
solo por tenant, con `viaje` y `cfdi_consolidado_linea` en el arreglo) ·
`supabase/migrations/0292_policies_de_lectura_y_bitacora_append_only.sql:63-79`
(la convierte a `for select` copiando el MISMO `qual` del catálogo) ·
`supabase/migrations/0076_cfdi_consolidado.sql:73-75` ·
`src/lib/auth/visibilidad.ts:41` · `src/app/dashboard/dinero_por_area.test.ts:9-25`

Escenario, con valores. Ana es `encargado` (jefe de tráfico) de Transportes
Innovativos. En el panel:

- el sidebar no le pinta Rentabilidad ni Cobranza (`areasDe('encargado') =
  ['operacion']`, `visibilidad.ts:41`);
- `/dashboard/viajes` le enseña folio, origen, destino y operador **sin un
  peso** — hay una prueba dedicada que falla si una pantalla de `operacion`
  imprime `mxn(` sin nombrar la puerta (`dinero_por_area.test.ts:44-49`), escrita
  justo porque el 4-ago-2026 cuatro pantallas listaban «anticipo entregado,
  comprobado y % por chofer» a la vista del encargado (`:16-21`).

Ana abre las herramientas del navegador → Application → Cookies → copia el
`access_token` de `sb-<ref>-auth-token` (httpOnly bloquea a JavaScript, no a
ella), y toma la anon key del bundle (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, la usa
`proxy.ts:133`). Entonces:

```
curl 'https://<ref>.supabase.co/rest/v1/viaje?select=folio,operador_id,anticipo,ingreso_flete,fecha_inicio&limit=1000' \
  -H 'apikey: <anon key del bundle>' \
  -H 'Authorization: Bearer <su propio access_token>'
```

200, con **todos** los viajes de la flota y sus dos cifras de dinero:
`viaje.anticipo numeric(12,2)` (`0001_init.sql:52`) e
`viaje.ingreso_flete numeric(12,2)` (`0048:145`) — el anticipo por chofer y el
ingreso del flete, o sea las dos entradas del margen. La policy que decide es
`tenant_data on viaje for select using (tenant_id = any(get_user_tenant_ids())
or is_superadmin())`: **no menciona el rol**. Lo mismo con
`cfdi_consolidado_linea` (`?select=fecha,monto,descripcion,estacion_rfc`), que
guarda cada transacción de monedero de diésel y TAG de casetas con su `monto`
(`0076:52`).

Intenté refutarlo por los cuatro sitios donde podría estar cubierto, y no lo
está:

- **¿Le falta el GRANT de tabla a `authenticated`?** No. Supabase concede por
  default privileges, y este repo lo sabe: `0158:562` hace
  `revoke all on table public.viaje_lock from anon, authenticated` precisamente
  por eso, y `0207:78`, `0209:95`, `0213:122`… repiten el patrón en cada tabla
  nueva. `viaje` y `cfdi_consolidado_linea` **nunca** recibieron ese revoke
  (grep sobre las 281 migraciones: cero coincidencias).
- **¿Hay una segunda policy más estricta que gane?** No — y no ganaría: las
  policies permisivas se combinan con OR. Hoy `viaje` tiene una sola.
- **¿La cubre `ve_finanzas()`?** No. Esa función existe justo para esto
  (`rol in ('superadmin','flota_admin','contador')`, `0294:74-81`) y se aplicó
  tabla por tabla: `cliente`/`tarifa` (0048:167), `factura_emitida`/
  `pago_recibido` (0049:140), `liquidacion` (0144:16), `gasto` (0146:51),
  `cfdi_xml` y `llm_costo` (0158:530-545). `viaje` y `cfdi_consolidado_linea`
  se quedaron con el `tenant_data` genérico que la 0086 recreó, y la 0292 lo
  conservó tal cual al pasarlo a `for select` (copia el `qual` del catálogo,
  `:75`).
- **¿La 0292 lo cerró?** Cerró la ESCRITURA (`viaje` ya no tiene policy de
  INSERT/UPDATE, `0292:84-85`). La lectura sigue abierta a todo rol del tenant.

Y la 0146 dejó escrito, en su encabezado, que *«`gasto` era la **ÚLTIMA** tabla
de dinero fuera de `ve_finanzas()`»* (`0146:6`). Esa frase es lo que hace que
nadie vuelva a mirar.

Consecuencia: la separación de roles que el producto le vende al contralor —«el
jefe de tráfico despacha, no ve tus finanzas», `visibilidad.ts:8-13`— se sostiene
únicamente en la capa de presentación. Un puesto medio con acceso legítimo al
panel obtiene, sin explotar nada y sin dejar una fila en `bitacora_auditoria`
(nunca pasa por la app), el anticipo por chofer y el ingreso por viaje de la
flota entera. En una demo donde el comprador es el contralor, esta es la
pregunta que hunde el trato si la hace su equipo de sistemas.

Causa raíz probable: `ve_finanzas()` se fue aplicando tabla por tabla en cinco
migraciones distintas y `viaje` quedó clasificada como tabla de «operación»
aunque cargue las dos cifras de dinero desde la 0001 y la 0048.

### [ALTO · REINCIDENTE] SEG-3 sigue cerrando `/admin` con segundo factor y dejando abiertas las rutas `/api` que sirven lo mismo
`src/lib/auth/guard.ts:49`, `:74`, `:125` ·
`src/app/api/admin/mapa-prospectos/puerta.ts:8-14` ·
`src/app/api/admin/qa/puerta.ts` · `src/app/api/admin/copiloto/puerta.ts` ·
`src/lib/auth/tenant-api.ts:42-53`

Sin cambio: `git log b8a1a3a..HEAD` sobre esos cinco archivos devuelve el propio
merge de la 24. La verificación es la de aquella ronda y sigue en pie —
`sesionSuperadmin()` (`mapa-prospectos/puerta.ts:11-13`) solo compara
`s.rol !== 'superadmin'`, y `resolverTenantApi` (`tenant-api.ts:57`) honra
`?tenant=` para un superadmin sin preguntarle una sola vez a `veredictoMfaSuperadmin`.
Con `LIKIDA_SUPERADMIN_MFA=obligatorio` encendido, una cookie phishada sigue
entregando la cartera comercial y los siete `/api/export/*`. Detalle completo en
`docs/auditoria-24/seguridad.md`.

### [ALTO · REINCIDENTE] El fail-closed del límite de tasa sigue cerrando el login entero cuando Upstash parpadea, y la válvula sigue sin un solo llamador
`src/lib/ratelimit.ts:271-273`, `:286-296` · `src/app/login/page.tsx:78-82`,
`:115`, `:133`

Sin cambio en el código. Lo único que se movió es la documentación: ahora
`RATELIMIT_REDIS_FALLA_CERRADO` sí aparece en `.env.example:539` (vacío, o sea
el default cerrado). La sustancia del hallazgo aguanta:
`grep -rn "fallaCerrado" src/` fuera de `ratelimit.ts` y su prueba devuelve
**cero** llamadores — solo el test la ejercita (`ratelimit_redis.test.ts:210`).
Un blip de Upstash sigue devolviendo `false` en el primer intento de
`rateLimit('login:email:<ip>', 10, 300000)` y `login/page.tsx:133` sigue
redirigiendo a `/login?...&error=1`.

### [MEDIO · REINCIDENTE] `/api/health`, público a propósito, sigue publicando el mensaje crudo de Postgres/PostgREST
`src/app/api/health/migracion.ts:98`, `:101`, `:105` ·
`src/app/api/health/route.ts:170-171`, `:189-199`

Archivos sin tocar desde `b8a1a3a`. Sigue contradiciendo la regla que
`src/app/api/v1/_comun.ts:74` fija para toda la API pública («NUNCA lleva el
mensaje de Postgres»).

### [MEDIO · REINCIDENTE] La 0296 sigue concediendo `execute` sobre una función que escribe en `public.tenant` sin el `revoke from public, anon, authenticated`
`supabase/migrations/0296_tenant_perfil_merge.sql:30`, `:78` — compárese con
`0284:110-113`

Verificado de nuevo con el escaneo completo de esta ronda (abajo): de las 151
funciones distintas de las 281 migraciones, las únicas `security definer` no-trigger
sin un `revoke` en ninguna migración son `is_operador` y `get_user_operador_id`
(0045), y las dos las **elimina** la `0086:81-82`. La 0296 sigue siendo la única
excepción real y sigue sin cerrarse.

### [BAJO · REINCIDENTE] La contraseña del PAC se sigue heredando a la descarga del SAT sin comprobar a qué host viaja
`src/lib/likida/sat_descarga/index.ts:99-100`

Sin cambio.

## Lo que revisé y está bien

**La superficie nueva de esta ronda — los cuatro puntos del encargo.**

- **`0302` retira el overload correcto.** El `drop function if exists
  public.reservar_presupuesto_llm(uuid, uuid, uuid, numeric, numeric, numeric)`
  (`0302:21-23`) casa exactamente con la firma que crean la `0186:45-52` y la
  `0193:13-20` (6 args, `returns boolean`), y **no** con la de la `0244:181-190`
  (8 args, `+ p_proposito text, p_reserva_interactivo_usd numeric`, `returns
  text`), que es la que sobrevive. Comprobé por grep que no queda caller: el
  único sitio real es `src/lib/llm/budget.ts:395-405`, que manda los **ocho**
  parámetros nombrados y ya interpreta el retorno `text`
  (`'ok'|'tope_tenant'|'tope_proposito'|'tope_run'`, `:409-419`). Los GRANTs no
  se tocan: la `0244:260-261` los reafirma sobre la firma de 8. Y el bloque 154
  de `verificaciones.sql` se migró a la firma de 8 en `4198985` con
  `proposito='fondo'`/`interactivo=0`, que preserva la misma aserción.
- **`0303` no toca un solo permiso.** Es un `update` de tres columnas de
  `agente_definicion` (`experimental`, `prompt_ref`, `descripcion`) con un
  `where id in (...)` de nueve ids literales. Cero DDL, cero grants, cero
  policies.
- **`tenantEfectivoChat` falla cerrado sin abrir otro camino.**
  `src/app/api/dashboard/chat/tenant.ts:36-39` y `:52-59` devuelven `null` ante
  `error` en las DOS ramas, y `:56-58` agrega el caso «el tenant de la sesión no
  existe». Intenté refutarlo por dos lados: (a) el `?tenant=` solo se mira si
  `sesion.rol === 'superadmin'` (`:23`), así que un `flota_admin` que lo mande
  cae al `else` y usa el suyo — no hay IDOR; (b) el `null` no distingue «no
  existe» de «no pude leer» hacia afuera, porque el llamador
  (`chat/route.ts:68-69`) traduce a 503 si venía `?tenant=` y a 403 si no —
  o sea, el oráculo que existiría (¿este uuid es un tenant?) solo es
  observable por un superadmin, que de todas formas ve la lista completa en
  `/admin/elegir-flota`. Sin hallazgo.
- **`graduarAgente(id, actorId)` no tiene superficie expuesta.**
  `definiciones.ts:183-196`. `grep -rn "graduarAgente" src/` fuera de su
  definición y su prueba: **cero** llamadores (`darDeAltaAgente` sí lo tiene, en
  `admin/agentes/page.tsx:24`, detrás de `requireSuperadmin`). Hoy es código
  muerto, no una puerta. Y `admin/agentes/contenido.tsx:128-136` solo pinta una
  etiqueta.

**El foco heredado de la 23: `search_path`. Escaneo COMPLETO, no muestreo.**

- Extraje las 151 definiciones de función de las 281 migraciones y comprobé
  cuerpo por cuerpo: **cero** `security definer` sin `set search_path`. La clase
  de crítico de la 23 no reincidió ni en las 24 migraciones de la 24 ni en las
  dos de la 25.
- Mismo escaneo para grants: todas las `security definer` no-trigger tienen su
  `revoke ... from public, anon, authenticated` en alguna migración, salvo las
  dos de la 0045 que la 0086 elimina y la 0296 (hallazgo arriba).

**Aislamiento de tenant a nivel de base — recorrido completo, no por muestra.**

- **RLS habilitada en las 147 tablas.** El escaneo ingenuo marca 10 como
  faltantes; las 10 son falsos positivos de dos bucles `execute format('alter
  table %I enable row level security')`: `0001_init.sql:106-118` (terminal,
  operador, politica_gasto, viaje, gasto, liquidacion, wa_conversacion) y
  `0047:156-164` (unidad, mantenimiento, incidencia, pod). Verificado leyendo
  los dos bucles.
- **Ninguna policy concede a `anon` o a `public`** salvo
  `avatares_lectura_publica` sobre `storage.objects` (`0046:42-45`), que es el
  bucket público por diseño; su escritura está anclada a
  `(storage.foldername(name))[1] = auth.uid()::text` (`0046:27-40`, reafirmado
  en `0126:64-73`) y el bucket trae tope de 2 MB y allowlist de MIME
  (`0147:113-116`).
- **`factura_saldo` es la única vista** y lleva `security_invoker = true` en las
  dos migraciones que la definen (`0054:42`, `0161:87-100`) — la trampa que
  `create or replace view` reabre en silencio está anotada en el propio archivo.
- **Las policies sin predicado de tenant** son las cinco del rol `operador`
  (`0045:52-59`, `0047:188-191`, `0081:17`), y la `0086:26-30` las **elimina**
  antes de tirar las dos funciones de las que dependen. Nada quedó colgando.
- **`wa_conversacion` es deniega-todo** (RLS activa, cero policies,
  `0158:552-558`) y `viaje_lock` lleva además el `revoke` de tabla (`0158:562`).

**Credenciales y firmas — abiertas y leídas.**

- **Ningún secreto con fallback derivado de otro secreto.** El único que había
  (`admin-context.ts` cayendo a `SUPABASE_SERVICE_ROLE_KEY`) ya no existe y el
  archivo explica por qué (`admin-context.ts:41-56`). El grep de
  `process.env.X || process.env.Y` sobre `src/` devuelve exactamente tres
  resultados: dos son `VERCEL_ENV || NODE_ENV` (no son secretos) y el tercero es
  el BAJO reincidente del PAC. `LIKIDA_COFRE_LLAVE` (`cofre.ts:48-57`),
  `LIKIDA_BAJA_SECRET` (`correo/baja.ts:35-38`), `LIKIDA_FLOTA_COOKIE_LLAVE`,
  `CRON_SECRET`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_AUTH_HOOK_SECRET`,
  `RESEND_WEBHOOK_SECRET` y `QSTASH_*_SIGNING_KEY`: los ocho fallan cerrado y
  ninguno tiene suplente.
- **Las seis firmas de webhook, verificadas una por una.** Meta HMAC sobre el
  cuerpo crudo leído con contador (`meta/client.ts:83-91` +
  `webhook/whatsapp/route.ts:133-140`); Stripe con tolerancia de tiempo y
  `timingSafeEqual` sobre `t.body` (`saas/stripe.ts:533-561`, llamada en
  `stripe/webhook/route.ts:64`, con `webhookConfigurado()` → 503 antes de nada);
  Svix a mano para Resend entrante y para el hook de Auth de Supabase
  (`correo/firma_entrante.ts:78-115`, ±5 min, multi-firma sin salida temprana);
  Cal.com (`admin/calcom.ts:31-37`); y las dos colas de QStash con
  `Receiver.verify` **antes** de tocar nada
  (`cron/facturar/cola/route.ts:50-70`, `cron/wa-pendientes/cola/route.ts:34-46`).
- **Los 12 crons** pasan por `puertaCron` (`admin/salud.ts:80-97` →
  `auth/cron.ts:40-47`, comparación en tiempo constante sobre el header
  completo). Las dos rutas `/cola` que no lo usan son las de QStash, con firma
  propia — no hay un cron sin puerta.
- **`resolverLlave`** (`llave-api.ts:134-189`): busca por prefijo, recorre
  TODAS las candidatas sin salir temprano, compara con `timingSafeEqual`, mira
  la caducidad DESPUÉS de la comparación, y contesta 503 (no 401) ante error de
  lectura. `resolverLiga` del portal de pago (`portal_pago_lectura.ts:141-175`)
  y `resolverLlaveWorker` (`worker/llaves.ts:28-67`) repiten el molde.
- **OAuth del MCP**: PKCE S256 obligatorio con largo acotado
  (`oauth.ts:341-346`), reuso de código y de refresco = revocación de la familia
  entera (`:334-337`, `:399-402`), marcado de uso con condición en la base para
  ganar la carrera (`:351-364`), rotación reversible si el par nuevo no llegó a
  existir (`:468-480`), `redirect_uri` exacta con la excepción de puerto de
  RFC 8252 (`:106-125`), y la consola de consentimiento re-valida TODO contra la
  base en el server action en vez de creerle a los hidden inputs
  (`mcp/autorizar/page.tsx:176-193`). El superadmin no puede consentir ahí
  (`:153`), que es lo correcto: su tenant es ambiguo por diseño.

**Autorización de tenant en el código — los caminos que abrí.**

- **`resolverTenantPedido` no comprueba el rol por sí misma**
  (`tenant-api.ts:86-100`), así que abrí sus **7** call-sites y los 7 lo
  comprueban antes de llamarla: `dashboard/[id]/page.tsx:82` y `:116`, `:150`,
  `:184`, `:213`; `politicas/page.tsx:95`; `combustible-casetas/page.tsx:70`;
  `suscripcion/page.tsx:44`; `arco/page.tsx:67`, `:98`, `:131`. Todos
  `if (s.rol === 'superadmin' && sp.tenant)`. Sin hallazgo.
- **Las 7 rutas de `/api/export/*` gatean DOS cosas**, el dato y el verbo:
  `puedeVerArea(t.rol, …)` + `puedeExportar(t.rol)` — verificado archivo por
  archivo (`liquidaciones`, `pdf/[id]`, `poliza`, `jornada`,
  `facturas-proveedor`, `bitacora-peaje`, `carta-porte-xml`). Es justo la
  lección que el repo tiene documentada («se acota el tenant y se olvida el
  rol») y aquí sí está aplicada.
- **`/v1`**: la llave manda sobre la cookie (`_comun.ts:207-231`), el `?tenant=`
  se borra en el borde antes de resolver (`urlSinTenant`, `:150-154` y `:255`),
  la escritura por cookie exige `vieneDeNuestroSitio` (`:242-252`) y el área de
  la llave se compara con la que pide la ruta (`areaDeLlaveAlcanza`, `:179-186`,
  fail closed ante un área desconocida).
- **`/api/mcp`**: el tenant sale SIEMPRE de la credencial, no hay parámetro que
  lo cambie (`credencial.ts:14-16`), tasa por IP antes de resolver y por flota
  después (`mcp/route.ts:139-161`), tope de cuerpo de 64 KB y bitácora de cada
  consulta **y de cada negación por área** (`:102-127`).
- **La invitación de usuarios no escala rol**: `validarInvitacion`
  (`invitar.ts:107-109`) rechaza `superadmin` y `vendedor` aunque el `select` no
  los ofrezca, el tenant viene por closure de la sesión
  (`usuarios/page.tsx:163`), hay techo por flota (`:140`) y un correo ya
  registrado contesta idéntico a un alta buena (`:169-172`) para no volverse un
  oráculo de quién es cliente de Likida.
- **Redirects**: `destinoSeguro` rechaza `//`, `\` y `..`
  (`admin-context.ts:166-172`); `destinoPermitido` del correo de acceso compara
  ORIGEN completo, no host ni `startsWith` (`correo/auth.ts:119-132`).

**CVE: descartados por escrito.**

- `npm audit --json`: **0 vulnerabilidades** en 752 paquetes (215 de
  producción). No es el veredicto, es el insumo.
- **`xlsx` sigue siendo el punto ciego de ese audit** y hay que repetirlo cada
  ronda: está vendorizado (`"xlsx": "file:vendor/xlsx-0.20.3.tgz"`), y una
  dependencia `file:` no casa contra ningún advisory del registro — `npm audit`
  **no la mira**. Comprobado a mano: `node_modules/xlsx/package.json` dice
  `0.20.3`, por encima de 0.20.2, donde SheetJS cerró CVE-2024-22363 (ReDoS) y
  CVE-2023-30533. Importa porque el camino de explotación existe
  (`intake/archivo.ts:17` parsea libros que sube el cliente por
  `/api/dashboard/archivo`; también `importacion/archivo.ts:11` y
  `intake/desglose_peaje.ts:35`). Con 0.20.3 queda descartado; el día que alguien lo
  baje, ninguna herramienta va a avisar.
- Versiones instaladas y sin advisory abierto: `next@16.3.3`, `react@19.2.8`,
  `@supabase/ssr@0.12.5`, `@supabase/supabase-js@2.112.4`, `sharp@0.35.4`,
  `fast-xml-parser@5.11.1`, `pdf-parse@2.4.5`, `zod@4.5.4`, `pdf-lib@1.17.1`,
  `zxing-wasm@3.1.3`.
- **XXE / billion-laughs en el CFDI: descartado.** Los dos `XMLParser`
  (`intake/cfdi_xml.ts:193-199`, `intake/rep.ts:67-73`) corren sobre
  fast-xml-parser 5.11.1, que no resuelve entidades externas ni re-escanea el
  valor de una entidad interna (no hay expansión recursiva), y no hace red. Los
  adjuntos entran con tope duro (`MAX_ADJUNTO_BYTES = 4 MB`,
  `correo/entrante/route.ts:76`).
- **No encontré ningún CVE con camino real de explotación en esta app.**

**Residuales que miré y decidí NO reportar (con la razón).**

- **`Receiver.verify` de QStash se llama sin `url`**
  (`cron/facturar/cola/route.ts:53-57`), y el paquete solo coteja el claim `sub`
  —la URL de destino— cuando ese argumento viene
  (`node_modules/@upstash/qstash/chunk-JYPXGFWX.mjs:1150-1151`). O sea: una
  entrega firmada para un endpoint verifica también en el otro. No lo reporto
  como hallazgo porque no sé escribir el escenario con valores: el cuerpo tiene
  que venir firmado con las signing keys de Likida, y no hay camino por el que
  un tercero obtenga uno. Queda anotado por si algún día se agrega un tercer
  callback de QStash con un cuerpo que sí importe.
- **`clientIp` toma el primer elemento de `x-forwarded-for`**
  (`ratelimit.ts:309-312`, y copiado en `login/page.tsx:80`,
  `reenvio_enlace.ts:91`, `pago/[token]/page.tsx:84`). Si el borde de Vercel
  APENDA en vez de reemplazar esa cabecera, el techo de `login:email:<ip>` sería
  esquivable rotando el header. No lo reporto porque no pude confirmar el
  comportamiento del borde desde aquí (sin red a Vercel); lo dejo en «no
  alcancé a revisar», que es donde honestamente está.
- **El registro dinámico de clientes MCP (RFC 7591) es abierto**
  (`mcp/oauth/registro/route.ts`): cualquiera registra un cliente con el nombre
  que quiera y una `redirect_uri` HTTPS propia. Es el diseño del RFC, la
  pantalla de consentimiento lo declara textualmente («El nombre "X" lo declaró
  quien se registró, no Likida», `mcp/autorizar/page.tsx:242`) y hay tasa. Sin
  hallazgo.
- **`get_user_operador_id()` / `is_operador()` no filtran por `activo`**: las
  dos las elimina la `0086:81-82`, así que no existen en la base de hoy.

## Lo que NO alcancé a revisar

- **El SQL solo se leyó; no hay Postgres aquí.** En particular no pude ejecutar
  `select tablename, policyname, cmd, qual from pg_policies where policyname
  like 'tenant_%'` contra la base real, que es la única forma de DEMOSTRAR el
  hallazgo 2 en vez de derivarlo del texto de las migraciones. Mi derivación
  reconstruye el estado final aplicando 0001 → 0078 → 0086 → 0144/0146 →
  0158 → 0292 en orden; si en producción alguien tocó una policy a mano, el
  estado real puede diferir. Es la primera comprobación que haría quien tome
  este hallazgo.
- **El comportamiento del borde de Vercel con `x-forwarded-for`** (arriba).
  Se resuelve con un `curl -H 'x-forwarded-for: 1.2.3.4'` contra
  `/api/health` en producción y mirando el log; no tengo red para hacerlo.
- **Las policies de `storage.objects` más allá de `avatares`.** Revisé qué
  buckets son públicos (solo `avatares`, 0046) y las cuatro policies de ese
  bucket; no recorrí si algún bucket privado tiene policies propias que no
  aparezcan en `supabase/migrations` (las creadas desde el panel de Supabase no
  están en el repo y desde aquí no se ven).
- **Las tres migraciones ausentes de la numeración (0277, 0293, 0295)** siguen
  sin existir en el árbol; no averigüé si fueron renumeradas por colisión o
  borradas con contenido dentro. Lo hereda esta ronda de la 24 sin avance.
- **El contenido que alimenta al agente por `/api/correo/entrante` y
  `/api/mcp`** — verifiqué las firmas y los topes, no la inyección de prompt ni
  la calidad del parseo. Eso es del rubro agéntico.
- **No corrí la compuerta** (venía verde: 819 archivos / 10,950 pruebas, tsc 0
  errores). Corrí solo `npm audit` en lectura.
