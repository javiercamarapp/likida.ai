# Seguridad — auditoría 24

**Nota: 7/10** (antes 6). Razón del movimiento: **se atacó y subió**. La clase de
crítico de la ronda 23 —una migración que redefine una función SQL partiendo de
un cuerpo viejo y le come el `search_path`— era el riesgo declarado de esta
rama, y **no reincidió**: la 0286 conserva `extensions` en
`ejecutar_arco_cancelacion`, la 0300 reconcilia de verdad la 0283 y la 0299 (y
le agrega el `set search_path` que la 0283 nunca tuvo), la 0289 conserva las dos
purgas que la 0288 le había añadido a `mantenimiento_de_datos`, y la 0298
evita `unaccent` a propósito en vez de arriesgar el mismo esquema. Ocho cierres
SEG-1…SEG-8 son reales y verificables. No sube a 8 porque **en dos puntos la
autorización vuelve a ser una sola capa** —el segundo factor de superadmin no
existe en `/api`, y la 0296 se saltó el `revoke` que el propio repo declara
obligatorio— y porque el nuevo default fail-closed del límite de tasa convierte
un parpadeo de Upstash en el cierre total del login.

**El riesgo mayor hoy:** el control nuevo más caro de la rama (MFA obligatorio
de superadmin) vive únicamente en la capa que redirige páginas; la superficie
que de verdad entrega datos —`/api/admin/*` y los siete `/api/export/*`— nunca
le pregunta.

## Hallazgos

### [ALTO] SEG-3 cierra `/admin` con segundo factor y deja abiertas las rutas `/api` que sirven lo mismo
`src/lib/auth/guard.ts:49` (`exigirMfaSuperadmin`), `guard.ts:74`, `guard.ts:125`
· `src/app/api/admin/mapa-prospectos/puerta.ts:11-14` ·
`src/app/api/admin/qa/puerta.ts:13-16` ·
`src/app/api/admin/copiloto/puerta.ts:13-16` · `src/lib/auth/tenant-api.ts:42-44`

Escenario: producción con `LIKIDA_SUPERADMIN_MFA=obligatorio` (la palanca que la
rama agregó). Un phishing consigue la cookie de sesión de Javier por enlace
mágico — sesión válida, `aal1`, sin factor verificado.

- `GET /admin` → `requireSuperadmin()` llama `exigirMfaSuperadmin('/admin')` y
  redirige a `/dashboard/mi-perfil?exige=inscribir`. La puerta funciona.
- `curl -H 'Cookie: sb-<ref>-auth-token=<la misma>' https://app.likida.ai/api/admin/mapa-prospectos`
  → `sesionSuperadmin()` sólo hace `getSessionTenant()` y compara
  `s.rol !== 'superadmin'`. Devuelve **200 con la cartera comercial completa**
  (la cabecera del propio archivo la describe: «829 prospectos con teléfonos y
  decisores»).
- `curl -H 'Cookie: …' 'https://app.likida.ai/api/export/liquidaciones?tenant=<uuid de Innovativos>'`
  → `resolverTenantApi` (línea 42) resuelve por `getSessionTenant()`, honra el
  `?tenant=` porque el rol es superadmin, y devuelve el CSV de liquidaciones de
  esa flota. Ni una línea de MFA en ese camino.
- `POST /api/admin/copiloto` con `{"accion":{"id":"…"},"intentId":"…"}` ejecuta
  acciones administrativas; el step-up de `copiloto/route.ts:161` sólo aplica a
  las acciones `gateo === 'doble'` **y sólo si el usuario ya inscribió factor**
  (`exigirAal2SiHayFactor` → `{ok:true}` cuando `!e.inscrito`). Con la cuenta
  phishada sin factor, pasa.

El `vieneDeNuestroSitio` de esas rutas no lo tapa: `csrf.ts:63` deja pasar
explícitamente a quien no manda `Origin` ni `Sec-Fetch-Site` — o sea, a `curl`.

Consecuencia: el ataque contra el que SEG-3 se escribió (un phishing de enlace
mágico entrega la base de todos los clientes) sigue funcionando por completo
sobre la superficie que carga los datos; encender la palanca compra la
sensación de estar protegido sin la protección. Para Javier, además, es la
diferencia entre «me robaron la consola» y «me robaron la cartera de ventas y
las liquidaciones de todas las flotas».

Causa raíz probable: el veredicto de MFA se implementó en `guard.ts`, que es la
capa de páginas/redirect, y el matcher del proxy excluye `/api` — las tres
`puerta.ts` y `resolverTenantApi` son puertas paralelas que nadie ató al mismo
control.

### [ALTO] El fail-closed nuevo del límite de tasa cierra el login entero cuando Upstash parpadea, y la válvula que el propio módulo documenta no tiene un solo llamador
`src/lib/ratelimit.ts:271-273` y `:286-296` · `src/app/login/page.tsx:78-82`,
`:115`, `:133`

Escenario: `UPSTASH_REDIS_REST_URL/TOKEN` están puestos (es el estado deseado) y
Upstash devuelve 500 —o tarda más de `TIMEOUT_REDIS_MS = 1200`— durante dos
minutos. `intentarRedis` devuelve `null`; `fallaCerradoPorDefault()` es `true`
(`process.env.RATELIMIT_REDIS_FALLA_CERRADO !== 'false'`, y esa variable no está
puesta en ningún sitio del repo: ni `vercel.json`, ni `DEPLOY.md`, ni un
`.env.example`). Entonces `rateLimit('login:email:<ip>', 10, 300000)` devuelve
`false` **en el primer intento**, y `login/page.tsx:133` hace
`redirect('/login?next=%2Fdashboard&error=1')`.

Entra: el contralor de Innovativos escribe su correo y aprieta «Entrar».
Sale: la pantalla genérica de error —el mismo texto que ve quien se equivocó de
correo—, para él y para todos, durante los dos minutos. Lo mismo con Google
(`:115`). Nadie entra al panel.

La propia cabecera del módulo nombra este caso: «es la elección razonable para
un llamador con sesión válida —un contralor no debería quedarse fuera de su
propio login por un blip de un proveedor ajeno— y ese llamador lo decide a la
vista». Pero `grep -rn "fallaCerrado" src/` fuera de `ratelimit.ts` y su prueba
devuelve **cero** resultados: ningún llamador pasa `{ fallaCerrado: false }`, y
la env global no está configurada. La opción existe sólo en el comentario.

Consecuencia: una avería de un proveedor ajeno, de las que pasan varias veces al
año, se convierte en el cierre total de la única puerta de entrada al producto
—incluido el minuto 1 de un demo—, con un mensaje en pantalla que le echa la
culpa a la credencial del usuario. El único rastro es un
`logger.warn('ratelimit.redis_falla_cerrado')`; `/api/health` no lo mira.

Causa raíz probable: SEG-4 invirtió el default global correctamente para los
cuatro endpoints públicos que motivaron el hallazgo, pero no aplicó a los
llamadores la distinción sesión-vs-desconocido que su propia documentación
establece.

### [MEDIO] `/api/health`, que es público a propósito, publica el mensaje crudo de Postgres/PostgREST
`src/app/api/health/migracion.ts:98` (y `:101`, `:105`) ·
`src/app/api/health/route.ts:170-171` y `:189-199`

Escenario: la RPC `migraciones_aplicadas()` (0234) no está aplicada en la base
—o le movieron el grant, o se renombró—. `supabaseAdmin().rpc(...)` devuelve
error por valor y `cotejarMigracion` arma
`` `migraciones_aplicadas() no contestó: ${error.message}` ``. Ese string entra
como `migracion.motivo` al cuerpo de la respuesta (route.ts:197). Entonces
`curl https://app.likida.ai/api/health` —sin sesión, sin secreto, sin llave—
devuelve:

```json
{"ok":false,"status":"degraded","checks":{"db":"ok","crons":"ok"},
 "version":"49ecf93",
 "migracion":{"base":null,"codigo":"0301","atras":null,
   "motivo":"migraciones_aplicadas() no contestó: Could not find the function public.migraciones_aplicadas without parameters in the schema cache"},
 "hora":"2026-09-02T…"}
```

El mismo camino cubre `permission denied for function migraciones_aplicadas` y
cualquier `SQLSTATE` que PostgREST decida devolver.

Consecuencia: se publica el nombre y el esquema de una función interna, la
versión exacta del esquema (`codigo:"0301"`) y el sha del deploy a cualquiera
que pregunte. Contradice la regla que este mismo archivo declara dos veces («El
detalle de qué cron fue vencido queda en el log privado y no se publica en este
endpoint», route.ts:187) y la que `src/app/api/v1/_comun.ts:74` fija para toda
la API pública: «En español y para un humano. NUNCA lleva el mensaje de
Postgres».

Causa raíz probable: `error.message` se interpola en un campo que después viaja
entero al cuerpo público, sin la traducción que el resto del repo sí hace.

### [MEDIO] La 0296 crea una función que escribe en `public.tenant` y se salta el `revoke` que el propio repo declara obligatorio
`supabase/migrations/0296_tenant_perfil_merge.sql:30` y `:78` — compárese con
`supabase/migrations/0284_cancelar_factura_tx.sql:110-113`

`tenant_perfil_merge(uuid, jsonb, uuid)` es la única función nueva de las 24
migraciones que recibe `grant execute … to service_role` **sin** el
`revoke execute … from public, anon, authenticated` que la acompaña en 0282,
0284, 0287, 0288, 0289, 0298 y 0299. La 0284 escribe la razón textual: «El
`revoke from public` NO basta: Supabase concede EXECUTE explícito a
anon/authenticated por default privileges (lección de la 0013)».

Escenario: sin sesión de ninguna clase,

```
curl -X POST 'https://<ref>.supabase.co/rest/v1/rpc/tenant_perfil_merge' \
  -H 'apikey: <la anon key, que viaja en el bundle>' \
  -H 'Content-Type: application/json' \
  -d '{"p_tenant_id":"<uuid de una flota>","p_patch":{"regimenFiscalElegible":"626"},"p_actualizado_por":null}'
```

La llamada **entra** a la función (el grant lo permite). Hoy no cambia nada
porque la función es `security invoker` y `tenant_self` (0078:56) sólo tiene
policy de SELECT: el UPDATE toca cero filas y sale por el `raise exception` de
la línea 63. O sea: hay exactamente **una** capa donde el repo exige dos.

Consecuencia: una RPC de escritura sobre `tenant` —RFC, domicilio fiscal,
política de gastos, perfil de onboarding— es alcanzable sin autenticar y sólo la
detiene una policy. La adopción que la propia migración deja anotada como
pendiente (que `repo.ts:guardarPerfilPatch` la llame) es justo el momento en el
que alguien puede marcarla `security definer` para que funcione bajo RLS; ese
día la única capa desaparece sin que nada se ponga rojo.

Causa raíz probable: la migración copió la línea de `grant` del molde de la 0188
y no la de `revoke` del molde de la 0284.

### [BAJO] La contraseña del PAC se hereda a la descarga del SAT sin comprobar a qué host va a viajar
`src/lib/likida/sat_descarga/index.ts:99-100` (y el mensaje de `:86`)

```ts
const usuario  = (process.env.LIKIDA_SAT_USUARIO?.trim() || process.env.LIKIDA_PAC_USUARIO?.trim()) ?? '';
const password = (process.env.LIKIDA_SAT_PASSWORD || process.env.LIKIDA_PAC_PASSWORD) ?? '';
```

Escenario: alguien pone `LIKIDA_SAT_PROVEEDOR=sw` y
`LIKIDA_SAT_URL=https://services.test.sw.com.mx` para probar la descarga masiva,
y no pone `LIKIDA_SAT_PASSWORD`. `resolverDescargaSat()` toma la contraseña de
**producción** del PAC y `crearProveedorSatSw` la POSTea a ese host. La única
comprobación es `proveedor !== 'sw'`; el host nunca se coteja contra el del PAC
(`LIKIDA_PAC_URL`), y `estadoDescargaSat()` reporta «configurado: true» sin
mencionar que la credencial es prestada.

Consecuencia: la credencial que timbra los CFDI de todas las flotas puede
acabar en un endpoint que nadie volvió a mirar, por una variable de entorno de
menos y sin un solo aviso. Rotarla después obliga a re-timbrar la confianza en
todo lo emitido en el intervalo.

Causa raíz probable: la herencia está anclada al NOMBRE del proveedor, no a la
URL que va a recibir el secreto.

## Lo que revisé y está bien

**El foco obligatorio: `search_path` de las funciones `security definer` en las
24 migraciones nuevas. No reincidió el crítico de la 23.**

- `supabase/migrations/0286_arco_por_telefono_normalizado.sql:46` reescribe
  `ejecutar_arco_cancelacion` **conservando** `set search_path = public,
  extensions, pg_catalog`, con `digest()` sin calificar en `:77` y `:137`. La
  0290 la menciona pero no la redefine.
- `0300_gasto_no_tras_liquidar_reconciliado.sql:27-72`: la unión es correcta y
  completa. Trae el escape del GUC de la 0299 (`:38`), el `revision <>
  'rechazada'` de la 0299 (`:48`, `:63`) y la punta `old.viaje_id` de la 0283
  (`:60-69`), y **agrega** `set search_path = public, pg_temp` (`:30`), que la
  0283 no tenía. `revision` es `not null default 'pendiente'` (0299:57), así que
  el `<> 'rechazada'` no se vuelve NULL sobre filas viejas. La 0299 no toca el
  trigger `trg_gasto_no_tras_liquidar_update`, así que el `WHEN` con
  `viaje_id`/`tenant_id` de la 0283 (`0283:97-127`) sigue vivo — sin eso el
  arreglo de la 0300 habría quedado inerte.
- `0289:80-180` recopia `mantenimiento_de_datos` y **conserva** las dos purgas
  que la 0288 le había agregado (`purgar_wa_outbox`,
  `purgar_evento_seguridad_flota`) además de la suya. El mismo patrón que
  produjo el bug de la 0300, hecho bien esta vez.
- `0280:119-123` y `:168-169` usan `set search_path = ''`. Recorrido el cuerpo:
  todo va calificado (`public.wa_evento_pendiente`, `public.wa_orden_evento`) y
  lo demás (`clock_timestamp`, `make_interval`, `left`, `btrim`,
  `gen_random_uuid`) vive en `pg_catalog`, que Postgres busca siempre. No hay
  dependencia de `extensions`.
- `0298:71-80` — `sin_acentos` resuelve los acentos con `translate` y declara por
  qué **no** usa `unaccent`: «no está garantizada en el Postgres local de CI».
  Es exactamente la lección de la 0275 aplicada por adelantado.
- `0290:67-70` mete `public.telefono_normalizado(telefono)` dentro de un CHECK.
  Intenté refutarlo por ahí (un CHECK exige IMMUTABLE); la función lo es
  (`0024:60-72`, `immutable parallel safe`). No hay hallazgo.

**Los cierres SEG-1…SEG-8 que muestreé, y no están inertes.**

- **SEG-1 (baja de usuarios).** `0294:45-59` agrega `activo`/`desactivado_en`
  con CHECK de coherencia; `0294:62-89` mete `and activo` a las cuatro funciones
  de RLS conservando `security definer`/`stable`/`search_path`;
  `src/lib/auth/session.ts:99-102` devuelve `null` con `activo === false`
  (y `app_user_self` incluye `id = auth.uid()`, 0126:56, así que el desactivado
  SÍ lee su propia fila y la comprobación se ejecuta de verdad);
  `usuarios_escritura.ts:190-215` escribe la fila **y** banea en Auth, diciendo
  en pantalla cuando el ban no entró. El actor se re-gatea dentro de cada
  server action (`dashboard/usuarios/page.tsx:87-94`, llamada en `:134`,
  `:188`, `:202`, `:218`, `:234`), con el `tenantId` por closure. Tres capas
  reales.
- **SEG-2 (0292).** El bucle de `:63-79` convierte a `for select` **toda**
  policy `tenant_data`/`tenant_finanzas` con `cmd='ALL'` leyendo su propio
  `qual` del catálogo, así que cubre las siete tablas de la 0078, las de la
  0047/0050/0051 y `factura_viaje` (0049:150) sin escribir el predicado a mano.
  Verifiqué que ninguna de esas policies tiene cláusula `to`, así que
  recrearlas no las ensancha. Y verifiqué que el cambio no rompe la app: los
  únicos usos de `supabaseServer()` (cliente de sesión) son lecturas de
  `app_user`/auth — ninguna escritura a `viaje`, `gasto`, `liquidacion`,
  `operador` o `tenant` pasa por RLS.
- **SEG-4 (llave al log).** `ratelimit.ts:217` reduce la llave a su categoría
  antes de loguear; la IP y el id de usuario ya no salen. Cerrado.
- **SEG-5 (HSTS/CSP).** `proxy.ts:90` y `next.config.ts:273` publican
  `max-age=31536000; includeSubDomains; preload` en los dos caminos, y
  `proxy.ts:79` agrega `media-src`. `/api/*` lleva `default-src 'none'`.
- **SEG-6 (`base_url` del conector).** `conectores/credenciales.ts:92-107`
  valida en `guardarCredencial` **antes de cifrar** (`:158-161`), que es el
  único escritor: la escritura directa por PostgREST no sirve porque
  `valores_cifrados` tiene que ser un blob válido del cofre. Residual anotado y
  no reportado: un nombre DNS que resuelva a 169.254.169.254 pasa el filtro
  literal, pero la exigencia de `https:` lo neutraliza contra los endpoints de
  metadata, que son HTTP.
- **SEG-8 (caducidad de llaves).** `0294:104-111` + `llave-api.ts:173-176`, y la
  comprobación va **después** del `timingSafeEqual`, con el mismo 401 y el mismo
  texto que una revocada. `resolverLlave` es el único camino caliente:
  `tenant_api_key` no se lee en ningún otro sitio de `src/`.
- **SEG-8 (`/api/demo`).** `demo/route.ts:10-12`: el GET ya sólo devuelve
  `{ok:true}`; `envHealth()` desapareció de ahí. Y `next.config.ts:30` apaga
  `x-powered-by`.

**Fronteras que recorrí completas y sostienen.**

- **Ninguna ruta sirve datos de un tenant sin autenticar.** Recorrí las 67
  `route.ts` de `src/app/api`. Las 14 que no nombran una función de sesión son:
  los tres webhooks firmados (`webhook/whatsapp` con HMAC en
  `meta/client.ts:84-91` y cuerpo acotado por lector antes del HMAC;
  `webhook/calcom` + su alias plural, HMAC en `admin/calcom.ts:31-37`;
  `correo/eventos`, firma svix a mano con tolerancia de ±5 min en
  `correo/eventos/route.ts:37-50`), las cinco de `/v1` (que van por
  `_comun.ts:188` — llave primero, cookie después, y `urlSinTenant` borra el
  `?tenant=` en el borde), `mcp/oauth/registro` (RFC 7591, abierto a propósito y
  con tasa), `pago/registrar` (token opaco en el cuerpo, honeypot, tasa por IP,
  y no puede escribir en `pago_recibido`), `correo/baja`, `lead` y las dos de
  marketing (públicas por diseño, con tope de cuerpo y tasa). No encontré
  ninguna.
- **Los 12 crons** pasan por `puertaCron` (`lib/admin/salud.ts:80-97`) →
  `autorizaCron` (`lib/auth/cron.ts:40-47`), comparación en tiempo constante
  sobre el header completo; sin `CRON_SECRET` contestan 500, no 200.
- **`/api/worker/bus/[accion]`** exige `x-worker-key` resuelta por hash y
  capacidad (`lib/worker/llaves.ts:28-68`), y ya no escribe un pedazo del
  secreto en `evento_seguridad`.
- **El tenant efectivo de un superadmin** es siempre explícito:
  `guard.ts:75-101` mató el fallback a demo; la cookie de selección está firmada
  con HMAC y llave propia (`admin-context.ts:53-56` — el fallback a
  `SUPABASE_SERVICE_ROLE_KEY` que había aquí ya no existe, que era justo un
  secreto derivado de otro), con TTL de 12 h y bitácora; el `?tenant=` se
  valida contra la tabla distinguiendo «no existe» de «no pude preguntar»
  (`tenant-efectivo.ts:184-190`, `tenant-api.ts:63-72`).
- **Redirects abiertos:** `auth/callback/route.ts:21-22` y `login/page.tsx:95-97`
  aceptan sólo `/dashboard*` y `/mcp/autorizar*`; `admin-context.ts:166-172`
  rechaza `//`, `\` y `..`. Probé `//dashboard.evil.com` y `/dashboard\@evil`:
  ninguno pasa.
- **URLs firmadas:** el PDF de liquidación son 900 s
  (`processor.ts:1136`), el de `/api/export/pdf/[id]` 60 s (`:105`), el informe
  por WhatsApp 300 s (`oficina_wa.ts:163`), el comprobante del panel 3600 s
  (`intake/almacen.ts:156`) y los insumos del agente 3600 s. Todos los buckets
  con dato de cliente son privados (0008, 0039, 0127, 0266×2, 0267); el único
  público es `avatares` (0046) y la CSP lo contempla. Ninguno pide un TTL más
  largo de lo que dura el uso.
- **`redirect_uri` de MCP OAuth** (`lib/mcp/oauth.ts:81-122`): HTTPS o loopback,
  sin credenciales en la URL, sin esquemas custom, comparación exacta con la
  excepción de puerto de RFC 8252 y cotejando también `search`.
- **RPCs de las 24 migraciones:** revisé el `revoke`/`grant` de las 35
  definiciones. Todas las que no lo repiten son o triggers (donde no aplica) o
  `create or replace` sobre una función que ya lo tenía y cuyo ACL se conserva —
  lo confirmé buscando el `revoke` original de `mantenimiento_de_datos` (0258),
  `reclamar_wa_pendiente` (0187) y `poliza_datos_tenant` (0178). La única
  excepción real es la 0296, arriba.

**CVE: descartados por escrito.**

- `npm audit --json` sobre `package-lock.json`: **0 vulnerabilidades** en 753
  paquetes (216 de producción). No lo tomo como veredicto por lo que sigue.
- **`xlsx` es el punto ciego de ese `npm audit`** y hay que decirlo: está
  vendorizado (`"xlsx": "file:vendor/xlsx-0.20.3.tgz"`, `package.json:24`,
  `package-lock.json:11078-11084`), y una dependencia `file:` no tiene entrada
  de registro contra la que casar un advisory — `npm audit` **no la mira**. Lo
  verifiqué a mano: `node_modules/xlsx/package.json` dice `0.20.3`, o sea por
  encima de 0.20.2, que es donde SheetJS cerró CVE-2024-22363 (ReDoS) y
  CVE-2023-30533 (prototype pollution de 0.19.3). Importa porque el camino de
  explotación **sí existiría**: `importacion/archivo.ts:11` e
  `intake/desglose_peaje.ts:35` parsean libros que sube el cliente. Con 0.20.3
  queda descartado; el día que alguien lo baje, ninguna herramienta va a
  avisar.
- `next@16.3.3`, `react@19.2.8`, `@supabase/ssr@0.12.5`,
  `@supabase/supabase-js@2.112.4`, `sharp@0.35.3`, `fast-xml-parser@5.11.1`,
  `pdf-lib@1.17.1`, `zxing-wasm@3.1.3`: sin advisory abierto en el árbol
  instalado. `playwright-core` y `@sparticuz/chromium` sólo cargan en
  `/api/cron/facturar`, detrás de `CRON_SECRET`.
- No encontré ningún CVE con camino real de explotación en esta app.

**Refutados (los busqué y el guardarraíl ya estaba).**

- `hilo_escritura` sobre `ticket_mensaje`, que la 0292 lista como `for all`
  fuera de alcance, en realidad es `for insert` con `interna = false` y firma
  propia (`0268:96-108`): un cliente no puede editar ni borrar la respuesta de
  Likida.
- Las policies `administra_flota` que la 0292 deja `for all`
  (`tenant_api_key` 0093:85-87, `conector_credencial` 0094:87-89) llevan
  `with check` anclado a `get_user_tenant_ids()`: no hay escritura cruzada de
  flota, sólo pérdida de bitácora dentro de la propia.
- `bodyExcede` mira sólo `content-length`, pero los dos llamadores que reciben
  cuerpos de terceros vuelven a medir después de leer
  (`webhook/whatsapp/route.ts:26-44` con lector acotado, `correo/eventos` con
  `cuerpoAcotado`). `/api/demo` también re-mide desde la ronda 13.

## Lo que NO alcancé a revisar

- **El SQL sólo se leyó.** No hay base aquí, así que no pude ejecutar el bucle
  `do $$` de la 0292 contra Postgres real. En particular no pude comprobar el
  comportamiento de un `FOR … IN select from pg_policies LOOP` que hace `drop
  policy`/`create policy` **dentro** del propio recorrido del catálogo: si en
  producción una policy se saltara por esa razón, quedaría `for all` en
  silencio. Lo correcto es correr el bloque 239 y después
  `select tablename, policyname, cmd from pg_policies where policyname in
  ('tenant_data','tenant_finanzas')` y verificar que no queda ni un `ALL`.
- **`storage.objects`**: revisé la publicidad de los siete buckets, no las
  policies del bucket público `avatares` (0046) más allá de las dos que la
  0126:66-76 reescribe.
- **Las tres migraciones ausentes de la numeración** (0277, 0293, 0295) — no
  existen en el árbol y no averigüé si fueron renumeradas por colisión (como la
  0275→0276 de master) o si alguien las borró con contenido dentro.
- **`/api/mcp/route.ts`** (el servidor MCP en sí) y el alcance por herramienta:
  sólo verifiqué las dos rutas de OAuth y el registro de clientes.
- **`/api/correo/entrante`**: verifiqué que existe firma, no la calidad del
  parseo del correo ni el contenido no confiable que alimenta al agente — eso
  es del rubro agéntico.
- No corrí la suite ni `tsc`; la CI del #303 sigue en rojo por OOM en el
  typecheck y no toqué eso.
