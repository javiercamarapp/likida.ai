# Seguridad — auditoría 22

**Nota: 7/10** (antes: s/d). Razón: línea base nueva, sin ancla previa legible.
El diseño es correcto donde importa —dos capas independientes en `/dashboard` y
`/admin` (`proxy.ts` + `guard.ts`), credenciales hasheadas, comparaciones en
tiempo constante, RLS encendida en las 135 tablas con dueño, lista blanca de
llaves antes de Sentry, y ningún secreto con fallback silencioso (el único que
existía, `LIKIDA_FLOTA_COOKIE_LLAVE → SUPABASE_SERVICE_ROLE_KEY`, ya se
retiró)—, pero **la capa se vuelve una sola en `/api`**: el matcher de
`proxy.ts:164` excluye `/api` a propósito y cada `route.ts` es su única puerta.
Eso es exactamente el ancla de 7 del rubro («el diseño es correcto y las capas
son una sola en algún punto»); la prueba de inventario de las 64 rutas es
contención, no una segunda capa. Lo que resta del punto: la CSP se desfasó de
la app en las últimas 24 h y hoy rompe una función, y dos sitios de resolución
de tenant no leen `error` donde sus hermanos sí.

**El riesgo mayor de hoy:** una política de seguridad (la CSP de `proxy.ts`) que
ya no describe lo que la app carga y por eso *rompe* una pantalla — la presión
del lunes será aflojarla a prisa, y aflojar `connect-src` a `https://*.supabase.co`
es abrirle al navegador el origen donde vive PostgREST con la anon key.

## Hallazgos

### [MEDIO] La CSP bloquea la subida y la reproducción del banco de videos que se cableó ayer
`src/proxy.ts:77` (`connect-src 'self'`, y no hay `media-src` en la lista de
`src/proxy.ts:71-84`) · `src/lib/supabase/browser-storage.ts:39` ·
`src/app/admin/marketing/page.tsx:165`

Escenario: Javier abre `/admin/marketing` (ruta SÍ cubierta por el matcher de
`proxy.ts:164`, que solo excluye `/api`), elige un `.mp4` y aprieta subir.
`subir-hook.tsx:46` llama `subirConUrlFirmada`, que usa el SDK de Supabase en el
navegador contra `https://<ref>.supabase.co/storage/v1/object/upload/sign/...`.
La CSP del documento dice `connect-src 'self'`: el navegador **bloquea la
petición antes de que salga**, y la pantalla pinta «No se pudo subir el video:
Failed to fetch». Segundo síntoma en la misma pantalla: `page.tsx:165` pinta
`<video src={h.videoUrl}>` con la URL firmada de `estudio.ts:121`
(`createSignedUrls` → `https://<ref>.supabase.co/...`); como no hay `media-src`,
cae a `default-src 'self'` y el `<video>` queda mudo aunque la firma sí se haya
generado. `img-src` sí incluye `https://*.supabase.co` (`proxy.ts:75`) — las
fotos de referencia del mismo estudio cargan, los videos no; por eso el fallo se
lee como «a veces sirve».

El comentario que justifica la directiva (`proxy.ts:47-51`) dice, textual, «los
dos `fetch(` que existen en componentes cliente (`dashboard/rail.tsx`,
`demo/page.tsx`) son a rutas propias» — dejó de ser cierto el 29-ago-2026 con
`1e9f8ed` (feat marketing, Fase D), que agregó el tercero y el primero
cross-origin. El mismo comentario afirma «cero `<script>` propio en `src/app`» y
`src/app/layout.tsx:59` es uno (`dangerouslySetInnerHTML` con `SCRIPT_TEMA`):
el inventario en el que se apoya la política ya no describe la app.

Consecuencia: la herramienta interna de Javier no funciona en producción y el
arreglo obvio bajo presión es meterle `https://*.supabase.co` a `connect-src`,
que es el origen desde el que el navegador —con `NEXT_PUBLIC_SUPABASE_ANON_KEY`
ya en el bundle— podría hablarle a PostgREST directo. La app entera está
construida sobre «ninguna tabla se lee desde el navegador»
(`browser-storage.ts:5-9`), y esa afirmación hoy la sostiene la CSP.

Causa raíz probable: la CSP se derivó de un inventario manual de fetches del
lado cliente y no hay nada que falle cuando ese inventario envejece (la única
prueba, `proxy.test.ts`, comprueba presencia de la cabecera, no su cobertura).

### [MEDIO] Dos resolvedores de `?tenant=` no miran `error`, y un bache de red devuelve la flota demo en silencio
`src/lib/auth/tenant-efectivo.ts:179` · `src/app/api/dashboard/chat/tenant.ts:23-26`

Escenario: Javier (superadmin) entra desde `/admin/flotas` → «Ver dashboard» a
`/dashboard/facturacion?tenant=8f3a…` (Transportes del Norte). En ese instante
Supabase da un `fetch failed` de tres segundos. La consulta
`from('tenant').select('id, nombre').eq('id','8f3a…').maybeSingle()` devuelve
`{ data: null, error: {...} }`. El código solo mira `if (t)`: como `t` es null,
`tenantId` se queda en el que trajo `requireSessionTenant`, que para un
superadmin con `sp.tenant` presente es **`tenantDemo()`** (`guard.ts:49`), y
`tenantNombre` se queda en `null`, así que ni siquiera se pinta la cinta «viendo
como superadmin». Resultado: la pantalla enseña las facturas de la flota DEMO
bajo una URL que dice `?tenant=8f3a…`. Lo mismo en el chat: `tenant.ts` deja
`nombreFlota` en «tu flota» y contesta con cifras del tenant demo.

Esto no es un descuido nuevo, es la MISMA clase de bug que el repo ya cerró dos
veces en `lib/auth/tenant-api.ts` — `resolverTenantApi:64-67` devuelve 503 y
`resolverTenantPedido:93-98` lanza, los dos con el comentario «un parpadeo de
red no puede convertirse en escribir en la flota equivocada». La corrección se
aplicó a las dos funciones menos transitadas y no a `resolverTenantEfectivo`,
por el que pasan las ~31 páginas de `/dashboard`.

Consecuencia: Javier lee cifras de la flota equivocada en la pantalla que abrió
para revisar a un cliente concreto —y en un demo es peor: enseña números de la
demo creyendo que enseña los del prospecto—. Las ESCRITURAS sí están cubiertas
(los server actions usan `resolverTenantPedido`, que lanza); el hueco es de
lectura.

Causa raíz probable: `supabase-js` reporta el error por valor y aquí se
desestructura solo `data` (`const { data: t } = ...`), así que «no existe» y «no
pude preguntar» colapsan en el mismo `null`.

### [MEDIO] El correo es el único dato personal del catálogo que `redactarTexto` no cubre, y una llave de rate-limit lo escribe en el log
`src/lib/logger.ts:49-64` (no hay regla de correo) · `src/lib/ratelimit.ts:204` y
`:210` (`{ key, ... }`) · `src/app/api/lead/route.ts:187-188`

Escenario: un contralor llena el formulario de likida.ai con
`contralor@transportesdelnorte.mx`. `lead/route.ts:187` arma
`llaveNatural = correo` y `:188` llama
`rateLimit('lead:llave:contralor@transportesdelnorte.mx', 1, 10_000)`. Upstash
tarda más de `TIMEOUT_REDIS_MS = 1200` o devuelve 5xx →
`ratelimit.ts:204/210` emite
`{"level":"error","msg":"ratelimit.redis_fallo","meta":{"key":"lead:llave:contralor@transportesdelnorte.mx","err":"The operation was aborted due to timeout"}}`.
`redactarTexto` no lo toca: sus cinco reglas son UUID, RFC, teléfono, CLABE y
tarjeta (`logger.ts:49-64`) — un correo no casa con ninguna. Segundo camino con
el mismo hueco: `src/lib/likida/agentes/investigador.ts:238`,
`logger.warn('investigador.correo_descartado_sin_fuente_literal', { correo })`.

Refutado a medias antes de reportarlo, y esto acota la severidad: **a Sentry NO
llega**. `sanitizarEventoSentry` filtra `extra` contra `LLAVES_EXTRA_SEGURAS`
(`observability/sentry.ts:98-109`), y ni `key` ni `correo` ni `err` están en la
lista. El dato se queda en el log de Vercel, no sale hacia el subencargado.

Consecuencia: el correo de un prospecto —y, por la vía de `investigador.ts`, el
de un decisor de una flota que nunca habló con Likida— queda en claro en la
retención de logs de la plataforma, en un archivo cuya cabecera declara que
«se borra lo que sí [se puede adivinar por fuerza bruta]». Un correo de 160
caracteres es exactamente eso.

Causa raíz probable: el redactor se construyó contra el catálogo fiscal
(RFC/teléfono/CLABE) y el correo entró al producto después, por el lado
comercial; y la llave de rate-limit se eligió por su valor de dedup, no
pensando en que va a un log de error.

### [BAJO] Los tres server actions de ARCO no revalidan el rol; sus hermanos de `/dashboard` sí
`src/app/dashboard/arco/page.tsx:46`, `:76`, `:108`

Escenario: `accionEjecutarCancelacion` (`:76`) solo hace
`await requireSessionTenant(RUTA)` y ejecuta `ejecutarCancelacionArco`, que
anonimiza nombre y teléfono del titular y borra sus conversaciones — irreversible.
`/dashboard/arco` es área `operacion` (`visibilidad.ts:116`), así que un
`contador` (áreas: solo `dinero`) NO puede abrir la pantalla, pero un POST a la
acción con su sesión pasa: nada compara el rol contra la ruta. Comparar con
`combustible-casetas/page.tsx:56-60`, `emergencias/page.tsx:78-79` y
`jornada/page.tsx:49-51`, que sí meten `puedeVerRuta(s.rol, RUTA)` dentro del
gate del action, con el comentario que explica por qué («una Server Action es un
endpoint POST alcanzable por su cuenta — el gateo de la página no la protege»).

Explotabilidad, dicha con honestidad: el id del action no es adivinable y el
contador no puede renderizar la página que lo lleva; hay que obtenerlo de un
colega o de un HAR. Y Next 16.3.2 sí verifica `Origin` contra `Host` en cada
Server Action (`node_modules/next/dist/server/app-render/action-handler.js:438-456`),
así que no hay camino cross-site. Es un insider del mismo tenant, no un extraño.

Consecuencia: quien mantenga esto. Es la única de las cinco pantallas con gate
compartido que no lo aplica, y la que ejecuta el acto más irreversible del
panel; el día que ARCO cambie de área o alguien copie este patrón, la excepción
deja de ser inofensiva.

Causa raíz probable: la página nació con `requireSessionTenant` a secas y las
tres acciones se agregaron después copiando esa línea, no el `gate()` que el
resto de las pantallas ya tenía.

### [BAJO] `search` de MCP no neutraliza la coma antes de `.or()`; su hermana en el mismo repo sí
`src/lib/mcp/herramientas/viajes.ts:103` y `:111`

Escenario: un cliente MCP con credencial válida de la flota A llama
`search({ query: "x,estatus.eq.liquidado" })`. El saneado de `:103` escapa `%`,
`_` y `\`, pero no la coma, así que el argumento de `.or()` sale como
`folio.ilike.%x,estatus.eq.liquidado%,origen.ilike.%x,...` y PostgREST lo parte
en condiciones que nadie escribió — con `(` y `)` se pueden anidar `and(...)`.
Lo que NO pasa, y por eso es BAJO y no más: el `.eq('tenant_id', tenantId)` de
`:110` va AND'eado por fuera del `or`, así que no hay forma de salir del tenant,
y el `select` es una lista fija de columnas, así que no hay columna nueva que
extraer. El efecto real es un filtro roto (400 de PostgREST → `exigir` lanza →
el 500 genérico de `/api/mcp`) o un resultado que no corresponde a la búsqueda.

El repo ya sabe hacerlo bien a diez archivos de distancia:
`src/lib/likida/sat_descarga/bandeja.ts:484` hace
`t.replace(/[%,()]/g, ' ')` antes de su `.or()`, con la coma y los paréntesis
adentro.

Consecuencia: quien mantenga esto, y el día que a `search` se le agregue una
columna proyectada o un embed —ahí el `or` inyectado deja de ser inocuo—.

Causa raíz probable: el saneado se escribió pensando en comodines de `ilike`
(`%`, `_`) y no en el separador del mini-lenguaje de `or()` de PostgREST, que es
otro nivel de parseo.

## Lo que revisé y está bien

- **Las dos capas de `/dashboard` y `/admin`.** `src/proxy.ts:128-159` (sesión
  real de Supabase, refresco de token con las cookies reescritas también en el
  redirect a `/login`) + `src/lib/auth/guard.ts:31-66`. `app_user` sin fila
  legible ya no cae a `flota_admin`: `session.ts:31` (`SIN_ROL`), y ese valor no
  existe en ninguna matriz, así que `areasDe` → `[]`.
- **Las 64 rutas de `/api`, una por una.** Todas tienen puerta propia y del tipo
  correcto: cron con `puertaCron` (`admin/salud.ts:80-97`, comparación
  `timingSafeEqual` sobre digests, `auth/cron.ts:40-47`), QStash con `Receiver`
  y 503 si faltan las llaves, Stripe/WhatsApp/Cal.com/Resend con HMAC sobre el
  cuerpo CRUDO, `/v1` y `/api/mcp` con `abrir()`/`resolverCredencialMcp`,
  `/api/admin/*` con `sesionSuperadmin()` (tres `puerta.ts` idénticos: copiloto,
  mapa-prospectos, qa). Las que a primera vista no grepeaban guardia
  (`admin/copiloto/conversaciones/*`, `admin/mapa-prospectos`,
  `webhooks/calcom`, `cron/jornada`) las abrí: todas guardadas.
- **`/v1` no honra `?tenant=`.** `_comun.ts:150-154` borra el parámetro en el
  borde antes de pasarlo a `resolverTenantApi`, con la razón escrita; la llave
  manda sobre la cookie (`:206-229`) para que el área acotada de la llave no se
  pueda esquivar con una sesión abierta.
- **La FK compuesta de la 0271 y el embed de `validarAcceso`.** Entré con la
  hipótesis de que `app_user:user_id(...)` (`mcp/oauth.ts:489`) se volvería
  ambiguo para PostgREST al haber dos FKs hacia `app_user`. Se refuta con
  evidencia del propio repo: `embeds_con_alias.test.ts:9-16` y `:41-51` documenta que el
  ancla por columna es justo lo que arregló los tres 500 reales del 14-ago-2026
  en los otros cinco pares con doble FK, y `app_user` ya está en `TABLAS_DOBLE_FK`.
  Mismo patrón, ya probado contra el esquema vivo.
- **RLS.** Comparé las 146 `create table` de `supabase/migrations/` contra los
  `enable row level security`: no queda ninguna tabla sin RLS. Las once que un
  grep ingenuo deja fuera (`viaje`, `gasto`, `liquidacion`, `operador`,
  `terminal`, `politica_gasto`) las enciende el loop de `0001_init.sql:107-119`
  y (`unidad`, `mantenimiento`, `incidencia`, `pod`) el de
  `0047_operacion_encargado.sql:157-192`. Ni un `using (true)` en todo el
  directorio; los únicos `to authenticated` son las cuatro policies de
  `storage.objects` para avatares (`0046`), ancladas a `auth.uid()` en la
  primera carpeta de la ruta.
- **Buckets.** `liquidaciones`, `comprobantes`, `bus`, `agente-insumos`,
  `marketing_hooks_video` y `marketing_referencias` son privados y sin policies
  (service-role firma); `avatares` es el único público y está topado a 2 MB e
  imágenes (`0147:112-116`). TTLs: 60 s el PDF de liquidación
  (`export/pdf/[id]/route.ts:101`) y las fotos de QA, 300 s el informe por
  WhatsApp, 3600 s los insumos de agente y el banco de hooks — ninguno más
  largo de lo que dura la necesidad.
- **Secretos.** `env.ts` no tiene un solo fallback derivado. El único que hubo
  (`LIKIDA_FLOTA_COOKIE_LLAVE` cayendo a la service-role key) se retiró y está
  documentado en `admin-context.ts:41-56`. `LIKIDA_SAT_PASSWORD ||
  LIKIDA_PAC_PASSWORD` (`sat_descarga/index.ts:100`) no es un fallback
  silencioso: es la misma cuenta de SW, declarado en el motivo que la pantalla
  enseña. Nada de la forma `enClaro` se guarda: llaves de API, llaves de worker
  y los tres secretos MCP van por SHA-256 con CHECK en la base.
- **CSRF.** `vieneDeNuestroSitio` (`auth/csrf.ts:66-76`) cubre las 11 escrituras
  cookie-autenticadas del commit de ayer y va ANTES de resolver la sesión en
  todas las que abrí (`copiloto/route.ts:110`, `archivo:27`, `ingesta:44`,
  `evento:31`, `qa/lanzar:37`, `toque:20`, `textos:35`). Los Server Actions no
  lo necesitan: Next 16.3.2 compara `Origin` contra `Host`/`x-forwarded-host` y
  aborta (`action-handler.js:438-456`), y `next.config.ts` no declara
  `allowedOrigins`.
- **Aislamiento de tenant en las lecturas del panel.** Los cinco llamadores de
  `resolverTenantPedido` gatean con `rol === 'superadmin'` antes de honrar
  `?tenant=`. Las tres rutas dinámicas de `/dashboard` (`[id]`,
  `timbrado/[viajeId]`, `carta-porte/borrador/[viajeId]`) gatean el área a mano
  y resuelven por `(tenantId, id)`. `soporte.ts` ancla el hilo al ticket antes
  de tocar `ticket_mensaje` (`:193`) y niega la nota interna a la flota
  (`:273`). `tools.ts` toma el tenant SIEMPRE de `ctx`, nunca de un argumento
  del modelo. `mi-perfil` escribe contra `s.userId`, no contra un id del
  formulario.
- **Inyección.** Cero `dangerouslySetInnerHTML` con dato variable (el único,
  `layout.tsx:59`, es una constante). Ningún SQL crudo desde entrada de usuario:
  todo pasa por PostgREST o por RPC con parámetros nombrados. Prompt injection:
  `intake/sanitizar.ts` recorta y quita delimitadores de todo lo que sale del
  OCR antes de llegar al contexto del agente, y `correo/entrante` verifica la
  firma antes de leer el cuerpo y saca el tenant del DESTINATARIO, nunca del
  `from`.
- **Sentry.** Lista blanca de llaves (`LLAVES_EXTRA_SEGURAS`) + revalidación del
  valor con `redactarTexto` + borrado de `spans[].data` y `contexts.trace.data`,
  que es donde el SDK mete la URL completa de cada fetch a PostgREST con sus
  filtros. Es el eslabón mejor cerrado del rubro.
- **Descartado por escrito, sin camino de explotación en este código:** no
  levanté ningún CVE de dependencia. `npm audit` es insumo, no veredicto, y no
  encontré un sink alcanzable desde entrada no confiable para ninguna
  dependencia de parseo (el XML de CFDI entra por `fast-xml-parser` detrás de
  HMAC de Resend y con tope de 4 MB; `zxing-wasm`/`sharp` solo tras el HMAC de
  Meta y con la foto ya topada). Tampoco construí nada sobre «el repo es
  público»: verificado en la ronda 18 que NO lo es.

## Lo que NO alcancé a revisar

- **`supabase/verificaciones.sql` completo** (252 migraciones, 112+ bloques): lo
  usé como referencia cruzada de la 0271 pero no lo corrí ni lo leí entero. Los
  GRANTs efectivos sobre el esquema vivo —lo que Supabase concede por default a
  `anon`/`authenticated` y que un `revoke from public` no alcanza— no se pueden
  comprobar desde el repo: hace falta un `\dp` contra la base. Es el hueco más
  grande de este reporte.
- **`lib/auth/mfa.ts` y el flujo de step-up completo.** Vi el punto de llamada
  en `copiloto/route.ts:158-168` (fail-closed también en `no_verificable`) pero
  no audité la política incremental ni qué pasa cuando Supabase Auth devuelve
  AAL2 sobre una sesión vieja.
- **`portal_pago_lectura.ts`**: leí la ruta pública (`/api/pago/registrar`, que
  está bien construida) pero no `resolverLiga` — cómo se genera, se hashea y se
  caduca el token del portal de pago, que es una credencial que viaja en una URL
  hacia un tercero.
- **Los conectores GPS/ERP** (`lib/likida/conectores/`): custodian credenciales
  de terceros en `conector_credencial` y no revisé cómo se cifran ni quién las
  puede leer.
- **`/api/demo` y `/api/marketing/*`** más allá del rate-limit y el tope de
  cuerpo: son escrituras públicas y merecen su propia pasada.
- **Verificación en runtime.** Todo esto es lectura de código: no levanté la app
  ni pegué una sola petición. En particular, la CSP del hallazgo 1 la deduje del
  header que arma `proxy.ts` y del origen de las URLs firmadas; confirmarlo
  toma un `npm run dev` y la consola del navegador en `/admin/marketing`.
