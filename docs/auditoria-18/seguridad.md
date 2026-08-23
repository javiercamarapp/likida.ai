# Seguridad — auditoría 18

**Nota: 7/10** (antes 7). Razón del movimiento: **ninguna — se queda**. Hubo
*se atacó y subió* de verdad (murió el tenant implícito del superadmin, el
`confirmado:true` del cliente murió con `AdminActionIntent` y su consumo
atómico en la base, entraron llaves de worker por capacidad y el hardening
0126), y hubo *mirada más profunda* que encontró lo que sigue abierto. Las dos
razones se cancelan y el 7 se sostiene por su propia ancla: el diseño es
correcto y **las capas son una sola en algún punto** — toda ruta bajo `/api`
tiene exactamente una, porque `src/proxy.ts:155` excluye `/api` del matcher a
propósito. Para llegar a 8 hacen falta las dos condiciones del rubro, y las dos
fallan hoy: hay un secreto con fallback (`admin-context.ts:49`) y hay rutas
privilegiadas con una sola capa.

**El riesgo mayor del rubro, hoy:** un camino de gasto de modelo sin freno y
sin registro (`/api/dashboard/ingesta`) que quema la llave de OpenRouter detrás
de una sesión de panel corriente, y que la consola de costos de `/admin` no ve
— si revienta, revienta el WhatsApp del demo y el tablero de costos dice que no
pasó nada.

---

## Hallazgos

### [ALTO] `/api/dashboard/ingesta` gasta modelo sin techo y sin dejar fila de costo

`src/app/api/dashboard/ingesta/route.ts:28-33` (la puerta entera de la ruta) ·
`src/app/api/dashboard/ingesta/route.ts:48` (`extraerComprobante`) ·
`src/lib/likida/intake/ocr.ts:225` · contraste en
`src/app/api/dashboard/chat/tope.ts:31-41` y `src/app/api/dashboard/chat/route.ts:62-68`.

**Escenario.** Un `contador` de una flota (o quien tenga su cookie) manda en
bucle:

```
POST /api/dashboard/ingesta
Cookie: sb-<proj>-auth-token=<sesión válida de un rol con área 'dinero'>
Content-Type: application/json

{"imagen":"data:image/png;base64,<~6,000,000 caracteres>"}
```

La ruta comprueba sesión (`:29`) y área (`:31`) y **nada más**: no hay una sola
llamada a `rateLimit` en el archivo — comprobado con `grep -c rateLimit` sobre
la ruta, que da 0 — y no hay lectura de presupuesto. `extraerComprobante` llama
al modelo de visión con `AbortSignal.timeout(45_000)` y ninguna consulta de
gasto. Con `maxDuration = 60` y el tope de cuerpo de ~6 MB como única cortapisa,
100 peticiones por minuto son 6,000 llamadas de visión por hora contra
`OPENROUTER_API_KEY`. La ruta hermana con el MISMO nivel de confianza,
`/api/dashboard/chat`, sí frena: lee `gastoChatHoyUsd(tenantId)` y corta en
`topeDiaUsd()` = $1 USD/día por flota, fallando cerrado si no puede leer.

**Y el gasto es invisible.** `grep registrarCosto` sobre `ingesta/route.ts` y
sobre `intake/ocr.ts` no devuelve nada: esta ruta **nunca escribe en
`llm_costo`**. Solo emite `logger.info('ingesta.sonda', {costoUsd})`
(`:50-53`). Como `src/lib/admin/negocio.ts` agrega `llm_costo` para la consola
de costo de IA, y `gastoChatHoyUsd` filtra `.eq('fase','chat')`, el gasto de
esta ruta no aparece ni en el freno ni en el tablero. El camino equivalente por
WhatsApp sí lo registra (`processor.ts:785` y `:1060`, `fase: 'ocr'`).

**Consecuencia.** Un bucle de UI o una sesión robada agota el saldo de
OpenRouter. Cuando se agota, se cae **todo** el LLM del producto —el OCR de los
comprobantes que llegan por WhatsApp incluido—, o sea el minuto 2 del demo. Y
el tablero de `/admin` que Javier mira para saber cuánto gasta Likida en IA
seguirá enseñando la cifra de siempre, porque esa cifra sale de una tabla en la
que esta ruta no escribe. Es además la contradicción de un rótulo del propio
repo: `src/app/api/admin/copiloto/route.ts:63-64` afirma que el copiloto "era el
ÚNICO camino de LLM sin freno de gasto".

**Nota secundaria del mismo archivo hermano:** `/api/dashboard/archivo/route.ts:25-29`
tampoco llama a `rateLimit`, y ahí se parsean hasta ~12 MB de base64 con `xlsx`
y `pdf-parse` (`MAX_BASE64 = 16_000_000`, `:22`) con `maxDuration = 60`. No
gasta modelo, pero es CPU y memoria sin cuota detrás de la misma sesión.

**Causa raíz probable.** El freno de gasto se pensó por *pantalla* (el chat) y
no por *frontera* (toda ruta de `/api` que llame a un modelo); la ruta de
ingesta nació como "sonda" de OCR y nunca entró al inventario de caminos de LLM.

---

### [MEDIO] `/login` sigue siendo un oráculo de enumeración: la respuesta idéntica solo cubre una rama de error

`src/app/login/page.tsx:89-95` (`esCorreoSinCuenta`) y `:148-153` (la rama que
decide qué se pinta) · la prueba que cree cerrarlo:
`src/app/login/no_autoregistro.test.ts:35-40`.

**Escenario.** Dos peticiones al mismo `/login`, con el mismo correo, dentro de
60 segundos:

```
POST /login          (server action `entrarConEmail`)
Content-Type: multipart/form-data
email=contralor@transportesx.com&next=/dashboard
```

- **Correo CON cuenta.** La primera llamada a `signInWithOtp` devuelve 200 y se
  redirige a `?enviado=1` → pantalla "Te mandamos un enlace a tu correo". La
  segunda cae en el mínimo de frecuencia por dirección de GoTrue y vuelve con
  `over_email_send_rate_limit` (429, "you can only request this after N
  seconds"). Ese código **no** cumple `esCorreoSinCuenta` —que solo acepta
  `otp_disabled`, `signup_disabled` o `/signups not allowed/i`— así que
  `:149` ejecuta `redirect('/login?...&error=1')` → pantalla **"Algo falló.
  Intenta otra vez."**
- **Correo SIN cuenta.** Con `shouldCreateUser:false` (`:140`), GoTrue corta
  antes de siquiera intentar el envío y devuelve 422 `otp_disabled` las dos
  veces → `?enviado=1` las dos veces.

Dos peticiones distinguen las dos poblaciones sin ambigüedad. El límite propio
(`dentroDelLimite`, `:74-78`) es de 10 intentos / 5 min **por IP y nada más** —
no por correo—, así que una IP prueba 5 direcciones cada 5 minutos, y cambiar de
IP reinicia el contador porque la llave es `login:email:${ip}`.

**Consecuencia.** Cualquiera con una lista de correos de directivos de flotas
mexicanas averigua cuáles son cuentas de Likida. Eso es la lista de objetivos
para un phishing que imita exactamente la plantilla de `correo/plantilla.ts` —
y el propio `auth.ts:188` declara que la línea "si no fuiste tú" es "la única
defensa real contra el phishing que imita esta misma plantilla". Cuando haya
clientes, además revela quién es cliente de quién.

**Refutación que intenté y no aguantó.** Busqué una segunda capa: no la hay.
El `error=1` es el mismo texto para todo, sí, pero **la existencia misma del
error** es la señal; y `no_autoregistro.test.ts` solo comprueba que las cadenas
`esCorreoSinCuenta` y `otp_disabled` aparezcan en el fuente — pasaría verde con
este hueco intacto.

**Causa raíz probable.** El anti-oráculo se escribió enumerando el caso "no
existe" en vez de invertir la regla: solo un conjunto cerrado de fallos
*nuestros* debería salir como error, y todo lo demás debería verse como
"enviado".

---

### [MEDIO] El bucket público `avatares` acepta cualquier archivo, de cualquier `authenticated`, saltándose los candados de tipo y peso

`supabase/migrations/0046_perfil_avatar.sql:17-19` (bucket `public = true`, sin
`file_size_limit` ni `allowed_mime_types`) y `:27-30` (la política de insert) ·
los candados que se saltan: `src/app/dashboard/mi-perfil/page.tsx:25-26,103-104`
y `src/app/admin/mi-perfil/page.tsx:23-24,65-67`.

**Escenario.** Un usuario del panel toma su propio access token (la cookie de
`@supabase/ssr` no es httpOnly: el cliente del navegador la necesita) y la
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, que viaja en el bundle, y sube directo al
Storage sin pasar por el server action:

```
POST https://<proyecto>.supabase.co/storage/v1/object/avatares/<su-auth-uid>/x.html
apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
Authorization: Bearer <su access token>
Content-Type: text/html

<html>… la página que quiera, del tamaño que quiera hasta el default global …</html>
```

La política `avatares_propio_insert` solo exige `bucket_id = 'avatares'` y que
la primera carpeta sea su `auth.uid()`. No mira mime ni tamaño — esos dos
controles viven **solo** en los server actions (`TIPOS`, `TOPE_BYTES`), que esta
petición no toca. El objeto queda legible sin sesión por
`avatares_lectura_publica` (`:42-44`) más `public = true`, servido con el
`Content-Type` que el atacante declaró.

**El amplificador de quién es `authenticated`.** `/login` bloquea el
autorregistro por correo (`shouldCreateUser:false`, `page.tsx:140`) pero el
botón de Google (`entrarConGoogle`, `:105-119`) no tiene equivalente:
`signInWithOAuth` no acepta ese parámetro y no hay lista de dominios permitidos
en el código. Quien complete ese consentimiento obtiene un `auth.users` y un JWT
con rol `authenticated` sin fila en `app_user` — no entra al panel (`session.ts`
lo deja en `SIN_ROL` y `guard.ts:63` lo manda a `/sin-acceso`), pero **sí**
satisface esta política. Cuánto de esto es alcanzable hoy depende de que el
proveedor Google esté encendido en el proyecto de Supabase, y eso no se puede
verificar desde el repo; lo que sí se verifica desde el repo es que del lado de
Likida no hay ninguna puerta en ese camino.

**Consecuencia.** Contenido arbitrario alojado públicamente en el dominio de
Supabase de Likida (una página de phishing cuya URL contiene el proyecto de la
empresa, mandada por WhatsApp a un operador), más almacenamiento sin cuota. El
comentario de `admin/mi-perfil/page.tsx:14-22` documenta que el `.svg` se
prohíbe *porque el bucket es público* — la prohibición se salta en una petición.

**Refutación que intenté.** Miré si la CSP salva algo: `proxy.ts:70-82` deja
`img-src https://*.supabase.co` pero `script-src 'self'`, así que esto **no** es
XSS dentro de `app.likida.ai`. Por eso es MEDIO y no ALTO.

**Causa raíz probable.** La validación de subida se escribió en la capa de
aplicación asumiendo que la aplicación es el único escritor; la política RLS,
que es el único control del camino directo, se pensó solo para el aislamiento
por carpeta.

---

### [BAJO] La llave que firma la cookie de flota cae a la service role key cuando falta

`src/lib/auth/admin-context.ts:49`:

```ts
return process.env.LIKIDA_FLOTA_COOKIE_LLAVE ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
```

**Escenario.** Producción hoy corre sin `LIKIDA_FLOTA_COOKIE_LLAVE` (no aparece
en `.env.example` ni en `lib/env.ts:29-38`), así que el HMAC de
`likida_flota_activa` se firma con la service role key. Se filtra la service
role key por cualquier vía (un log, un dump, un colaborador que sale) y hay que
rotarla: al rotarla, `validarSeleccion` (`:79-91`) deja de reconocer toda cookie
viva y el superadmin rebota al selector — y, al revés, mientras no se rote, un
mismo material de llave está sirviendo para dos propósitos distintos (acceso
total a la base y firma de una cookie de sesión) sin que nada obligue a
separarlos.

**Consecuencia.** Hoy no hay explotación: HMAC-SHA256 no filtra su llave por la
salida, y la cookie es `httpOnly`, `sameSite: 'lax'`. Es el ítem que el rubro
nombra por su nombre —"un secreto que tiene fallback derivado de otro secreto
cuando falta"— y es una de las dos razones por las que este rubro no puede
llegar a 8.

**Causa raíz probable.** Se prefirió que la firma "nunca se quede sin llave" a
que la ausencia de la llave sea un estado declarado; el propio comentario de
`:41-47` razona el fallback como una virtud.

---

### [BAJO] El step-up de MFA falla ABIERTO, con un comentario que dice lo contrario

`src/lib/auth/mfa.ts:36-45` y `:57-62`.

**Escenario.** El comentario de `:36-37` dice "Fallar cerrado hacia 'sin
inscribir'". El código hace lo contrario: `const totp = factores.data?.totp ?? []`
convierte un `listFactors()` que devolvió error en "no tiene factores", y
`exigirAal2SiHayFactor` (`:59`) devuelve `{ok:true}`. O sea: superadmin CON TOTP
inscrito, `/auth/v1/factors` de Supabase devuelve 500 durante dos segundos, y en
esa ventana un `POST /api/admin/copiloto` con `{"intentId":"…","accion":{"id":"<acción doble>","objetivo":"…"}}`
pasa el `if (defAccion?.gateo === 'doble')` de `route.ts:117-123` sin AAL2.

**Consecuencia HOY: ninguna, y hay que decirlo.** Recorrí `CATALOGO_ACCIONES`
(`src/lib/agents/copiloto-acciones.ts:39-90`): las cinco acciones con
`gateo:'doble'` —`encender_agente`, `aprobar_pendiente`, `rechazar_pendiente`,
`marcar_pago_conciliado`, `reabrir_liquidacion`— están todas con
`implementada: false`, y el route solo crea intent para las implementadas
(`route.ts:187-191`). El hueco es latente: se abre el día que se implemente la
primera, que según su propio catálogo es la que "MUEVE DINERO".

**Causa raíz probable.** `estadoMfa` mezcla dos preguntas —"¿tiene factor?" y
"¿pude preguntarlo?"— en un solo booleano sin estado para "no sé".

---

### [BAJO] `reservar_envio_prospecto` es la única función posterior a la 0054 sin su `revoke ... from public`

`supabase/migrations/0124_cadencia_atomica_y_entrega.sql:26-58` (se define en
`:26`, se le fija `search_path` en `:57`, y no hay `revoke` ni `grant` en todo
el archivo — verificado con `grep -n "reservar_envio_prospecto" *.sql | grep -i
"revoke\|grant"`, que no devuelve nada).

**Escenario.** Postgres otorga `EXECUTE` a `PUBLIC` en cada función nueva, que
es exactamente la lección que la `0054_fuga_vista_saldo_y_grants.sql:28-40`
dejó escrita ("`revoke ... from anon` no revocaba nada"). Con la anon key —que
es pública, va en el bundle del navegador— cualquiera puede llamar:

```
POST https://<proyecto>.supabase.co/rest/v1/rpc/reservar_envio_prospecto
apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
Content-Type: application/json

{"p_prospecto":"<uuid>","p_pieza":"<uuid>","p_actor":null,"p_resumen":"x","p_horas":48}
```

**Consecuencia: contenida, y por eso es BAJO.** La función es `SECURITY INVOKER`
(no lleva `security definer`), y `prospecto_contacto` tiene RLS deny-all
(`0118_prospecto_contacto.sql:41`, sin una sola policy), así que el `select`
interno no ve filas y el `insert` revienta con 42501 antes de escribir nada.
No hay fuga ni escritura, ni siquiera oráculo: el resultado es idéntico para
todo prospecto. Lo que hay es la excepción a un patrón que este repo ya pagó
una vez —las 12 funciones de las 0098/0101/0102/0104/0112/0114 sí traen su
`revoke all ... from public, anon, authenticated`— y una superficie RPC pública
que nadie pidió.

**Causa raíz probable.** La 0124 salió del hilo de "cadencia atómica" y no del
hilo de "funciones nuevas"; el `revoke` no está en ninguna comprobación
automática, solo en la costumbre.

---

## Rutas privilegiadas y sus capas

`src/proxy.ts:155` excluye `/api` del matcher **a propósito**, así que la
columna "capa 1" está literalmente vacía para las 40 rutas de API: cada una es
su propia y única puerta.

| Ruta | Capa 1 | Capa 2 | ¿Independientes? |
|---|---|---|---|
| `/dashboard/**` (33 páginas) | `proxy.ts:118-147` — matcher + `getUser()` | `requireSessionTenant` / `resolverTenantEfectivo` + `puedeVerRuta` en cada página (verifiqué las 33: todas gatean) | **Parcial.** Mecanismos distintos, pero las dos leen la MISMA sesión de Supabase: si `getUser()` mintiera, caen juntas |
| `/admin/**` | `proxy.ts` — solo "¿hay sesión?", no mira rol | `requireSuperadmin()` en el layout + re-chequeo en cada server action | **No para el ROL.** La capa 1 no distingue superadmin de contador: el rol lo decide una sola línea |
| `/vendedor/**` | `proxy.ts` (sesión) | `requireVendedor()` en el layout | Igual que `/admin`: el rol es una sola capa |
| Server actions de `/dashboard` y `/admin` | — (una action es un POST propio, no hereda la puerta de la página) | Re-chequeo dentro de la action (revisé las 43 apariciones de `'use server'`: todas re-gatean) | **Una sola**, por diseño de Next. La contiene `SameSite=Lax` del lado del navegador |
| `/api/dashboard/*` | — (excluida del matcher) | `getSessionTenant()` + `puedeVerArea` + `tenantEfectivoChat` | **Una sola** |
| `/api/admin/*` (copiloto, mapa-prospectos, qa, palette) | — | `sesionSuperadmin()` de su `puerta.ts` (401/403 mudos) | **Una sola**, replicada en 4 copias idénticas del mismo helper |
| `/api/export/*` | Rate limit por IP | `resolverTenantApi` + `puedeVerArea('dinero')` + `puedeExportar` + filtro `.eq('tenant_id')` explícito | **Sí, tres comprobaciones ortogonales** — es la mejor de la casa |
| `/api/v1/*` (7 handlers) | Rate limit anónimo por IP (`_comun.ts:189`) | `abrir()` — llave `lk_live_` o cookie, tasa por flota, área, con `?tenant=` borrado en el borde (`urlSinTenant`) | **Sí**, y el área no tiene default a propósito |
| `/api/webhook/whatsapp` | Cap de cuerpo × 2 (`:94` y `:97`, por si falta `content-length`) | HMAC `x-hub-signature-256` timing-safe (`meta/client.ts:40-46`) + rate limit por teléfono | **Sí** |
| `/api/stripe/webhook` | `webhookConfigurado()` → 503, nunca "acepta sin verificar" | HMAC + tolerancia 300 s + idempotencia por `evt.id` en la base | **Sí** |
| `/api/auth/correo` (hook de Supabase) | Cap de 32 KB antes del HMAC | `verificarFirma` Standard Webhooks (`firma_entrante.ts`) | **Una sola** de autorización (la firma). Correcto para un webhook |
| `/api/correo/entrante` | Firma svix | Tenant desde el DESTINATARIO (`buzon.ts`, token de 118 bits), jamás del remitente | **Sí** |
| `/api/correo/eventos` | Firma svix propia (`RESEND_EVENTOS_WEBHOOK_SECRET`, distinta de la de entrante) | Ancla por `provider_message_id` | **Sí** |
| `/api/cron/*` (6) | — | `Authorization: Bearer ${CRON_SECRET}`, y sin la variable → 500, no 200 | **Una sola** |
| `/api/worker/bus/[accion]` | — | `resolverLlaveWorker(x-worker-key, capacidad)` — hash SHA-256, revocación, capacidad por acción | **Una sola**, con dos comprobaciones dentro |
| `/api/health`, `/api/demo`, `/api/lead` | Rate limit por IP | — (públicas a propósito) | N/A |

---

## CVEs considerados y descartados

`npm audit` reporta 6 (2 críticos, 1 alto, 3 moderados). **Los 6 son de la
cadena de `vitest` y ninguno viaja a producción.** Uno por uno:

| Aviso | Por qué se descarta |
|---|---|
| GHSA-5xrq-8626-4rwp — `vitest` <3.2.6, lectura y ejecución de archivo arbitrario (CVSS 9.8) | Solo con **el servidor de Vitest UI escuchando**. Este repo nunca lo levanta: los scripts de `package.json` son `vitest run` (y `--config` para audit/qa), sin `--ui` en ninguno, y el CI corre `npm test`. `vitest` es `devDependency`: no entra al bundle de Next |
| `@vitest/coverage-v8` <=3.2.5 (crítico por herencia de `vitest`) | Mismo caso, y solo se ejecuta con `test:coverage` a mano |
| GHSA-fx2h-pf6j-xcff — `vite` `server.fs.deny` bypass en rutas alternas de Windows (CVSS 7.5) | Requiere el **dev server de Vite** expuesto, y en Windows. Aquí Vite solo existe como runner de pruebas; el dev server del producto es `next dev --webpack` |
| GHSA-4w7w-66w2-5vf9 — `vite`, path traversal en `.map` de deps optimizadas | Mismo dev server de Vite que no se levanta |
| GHSA-v6wh-96g9-6wx3 — `launch-editor`, fuga de hash NTLMv2 por UNC en Windows | Depende de `launch-editor` dentro del overlay de errores de Vite, en Windows. No hay Windows en el despliegue (Vercel/Linux) ni se usa ese overlay |
| GHSA-67mh-4wv8-2f99 — `esbuild` <=0.24.2, cualquier web puede pegarle al dev server | Otra vez el dev server de Vite. En producción no hay esbuild sirviendo nada |

**Conclusión escrita, como pide el rubro: hoy NO hay un CVE con camino real de
explotación en esta app.** Las 222 dependencias de producción salen limpias.

Dos cosas que `npm audit` **no** puede ver y sí vale anotar:

- **`xlsx` no está cubierto por `npm audit`**, porque `package.json:36` la
  instala desde `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` y una
  dependencia por URL no cruza contra la base de avisos. La versión fijada
  (0.20.3) está por encima de las dos vulnerables conocidas —CVE-2023-30533,
  contaminación de prototipo, <0.19.3; CVE-2024-22363, ReDoS, <0.20.2— así que
  el árbol de `master` está bien. **Ojo con el entorno de esta corrida:** el
  MAPA dice que aquí se instaló `0.18.5` del registry para saltar el 403 de
  red, y esa sí es vulnerable a las dos; la comprobación de arriba es sobre
  `package.json`, no sobre el `node_modules` de esta máquina. Consumidores de
  `xlsx` alcanzables por entrada de usuario: `intake/desglose_peaje.ts:35`
  (Excel que sube el contralor) y `dashboard/viajes/page.tsx:2`.
- **El `override` de `sharp` sigue siendo necesario y sigue puesto**
  (`package.json:47-50`): `sharp ^0.35.3` cierra CVE-2026-33327/33328/35590/35591
  de libvips en la copia anidada que trae Next. `sharp` procesa las fotos que
  llegan por WhatsApp, o sea entrada **no autenticada por un humano** (solo por
  el HMAC de Meta): es la dependencia con el camino de explotación más corto del
  repo y hay que revisarla en cada ronda.
- **CVE-2025-29927 (bypass del middleware de Next por `x-middleware-subrequest`)
  queda descartado por escrito, otra vez:** afecta a <14.2.25 y <15.2.3; aquí
  `next` es `^16.2.4`. Además el gate de sesión no vive solo en el proxy —
  `requireSessionTenant` viaja con cada página.

---

## Lo que revisé y está bien

- **La muerte del tenant implícito, comprobada de punta a punta.** Un
  `flota_admin` **no** puede fijar el `AdminContext` de otro tenant, y lo
  verifiqué por los tres caminos: (1) `guard.ts:46-56` solo consulta
  `leerSeleccionFlota()` cuando `s.tenantId` es nulo Y `s.rol === 'superadmin'`,
  y un `flota_admin` siempre tiene tenant por FK; (2) la cookie va firmada con
  HMAC y comparada en tiempo constante (`admin-context.ts:79-91`), con formato
  `v1.<tenant>.<expira>.<hmac>` y TTL de 12 h; (3) el único escritor es la
  server action de `/admin/elegir-flota/page.tsx:41-59`, que **re-llama**
  `requireSuperadmin()` dentro de la action y solo firma un tenant comprobado
  contra la tabla. Los 6 llamadores de `resolverTenantPedido` —que por sí sola
  **no** mira el rol— lo envuelven todos en `if (rol === 'superadmin' && sp.tenant)`:
  los revisé uno por uno (`[id]/page.tsx:64,108,133`, `politicas:83`,
  `combustible-casetas:59`, `suscripcion:43`, `arco:40`).
- **El modelo de intents del copiloto cierra el `confirmado:true`.** El
  `accionId` que manda el cliente queda amarrado por `argsHash`
  (`copiloto-intents.ts:59-61` + `route.ts:127`): si no coincide con la
  propuesta, 409. El consumo es atómico en la base (`UPDATE ... eq(id)
  .is('usado_en',null).gt('expira_en',...)` — la guarda vive en el WHERE, no en
  un `select` previo), TTL de 2 min, y el actor tiene que ser el mismo.
- **RLS: cobertura completa.** Crucé las 79 `create table` de las 139
  migraciones contra los `enable row level security` (incluidos los dos bucles
  `do $$` de la 0001 y la 0047). **Ninguna tabla de `public` quedó sin RLS.**
  Las migraciones 0128/0129/0132/0136/0137/0139 no crean tablas, solo columnas.
- **La lección de la 0054 se aplicó en todas partes menos en una.** Las 12
  funciones `security definer` posteriores traen su `revoke all ... from public,
  anon, authenticated` + `grant ... to service_role` y su `set search_path`. La
  única vista del esquema (`factura_saldo`) tiene `security_invoker = true`.
  La excepción está arriba como hallazgo.
- **Firmas de webhook, las cuatro.** WhatsApp (HMAC sobre el cuerpo crudo,
  `timingSafeEqual`, comparación de largo antes), Stripe (tolerancia de 300 s,
  varias `v1=` recorridas), Resend entrante y Resend eventos (secretos
  **distintos** por webhook — la 17-ago separó `RESEND_WEBHOOK_SECRET` de
  `RESEND_EVENTOS_WEBHOOK_SECRET`, que compartirlos hacía imposible verificar
  los dos). Todas firman el `req.text()` crudo, ninguna reparsea.
- **URLs firmadas: ningún TTL más largo que su necesidad.** Recorrí los 6
  `createSignedUrl`: PDF de liquidación por WhatsApp 60 s
  (`processor.ts:2484`), export de PDF del panel 60 s con `download:`
  (`export/pdf/[id]/route.ts:101`), fotos de QA 60 s, informe por WhatsApp
  300 s. El único de 3600 s es `admin/bus.ts:165` (previews del bus de mando de
  Javier, contenido interno, no dato de cliente). `intake/almacen.ts:94`
  (`ligaComprobante`, 3600 s) tiene un comentario desfasado —dice "una hora,
  igual que los PDF" cuando los PDF son 60— pero **no tiene un solo llamador**
  en todo `src/`: es código muerto, no una URL viva.
- **Los buckets sensibles son privados y sin policies**: `liquidaciones`
  (0008), `comprobantes` (0039), `bus` (0127) — solo el service role escribe y
  firma.
- **La API v1 no tiene IDOR por `?tenant=`.** `_comun.ts:149-153` **borra** el
  parámetro en el borde antes de dárselo a `resolverTenantApi`, que sí lo
  honraría para un superadmin, y hay prueba que lo fija.
- **Llaves de API**: SHA-256 (justificado contra bcrypt por entropía),
  `randomBytes(32)`, la llave en claro nunca se guarda, comparación en tiempo
  constante, se recorren todas las candidatas del prefijo para no volver
  medible cuántas hay, y un error de lectura devuelve 503 y **nunca** 401.
- **CSRF**: los endpoints POST con cookie no llevan token, pero las cookies de
  `@supabase/ssr` y `likida_flota_activa` son `SameSite=Lax`, lo que corta el
  POST cross-site (incluido el truco de `enctype="text/plain"` que evita el
  preflight). Es una sola capa, y es la del navegador.
- **Redacción en logs**: `logger.ts` borra RFC, teléfono, CLABE y PAN, y
  huella los UUID en vez de borrarlos. La ruta del hook de correo
  (`auth/correo/route.ts:193-195`) no escribe la dirección de nadie a propósito.
- **Cabeceras y CSP** (`proxy.ts:70-94`): CSP completa con `frame-ancestors
  'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, HSTS
  solo en producción, y `unsafe-eval` acotado a `NODE_ENV === 'development'`.
  Los dos `unsafe-inline` están documentados como deuda con la medición que los
  justifica, no como descuido.
- **`SIN_ROL`**: la sesión sin fila legible en `app_user` ya no nace como
  `flota_admin`. Todas las matrices lo niegan por default.
- **432 pruebas verdes** en `src/lib/auth`, `src/lib/correo` y `src/proxy.test.ts`.

---

## Lo que NO alcancé a revisar

- **Nada contra la base ni contra Supabase real.** No hay `.env`, ni red hacia
  proveedores. Todo lo de arriba se sostiene por lectura de código, de SQL y de
  la suite offline. En concreto: no pude comprobar los `GRANT` efectivos vivos
  (`has_function_privilege`), ni si el proveedor Google está encendido, ni si
  "Disable new user signups" está puesto en el proyecto, ni el valor real de
  `mailer_otp_exp` que `minutosDeCaducidad()` declara de memoria.
- **El hallazgo del oráculo de `/login` no se pudo ejecutar**, solo derivar: la
  rama de código es un hecho verificable en `page.tsx:148-153`; que
  `over_email_send_rate_limit` llegue únicamente para direcciones con cuenta
  sale del orden de comprobaciones de GoTrue, no de una corrida.
- **`src/lib/agents/copiloto-tools.ts` y `copiloto-acciones.ts` a fondo.** Miré
  el catálogo y el amarre por `argsHash`; no recorrí cada implementación de
  acción buscando escrituras cross-tenant.
- **`src/lib/likida/agentes/` y el runner autónomo** (0123/0124): solo entré por
  `cola.ts` a raíz de la 0124. Los "cuatro candados" que declara
  `correr_runner` no los verifiqué uno por uno.
- **Las policies RLS por tabla, en detalle.** Comprobé que **todas** las tablas
  tienen RLS habilitada; no leí las ~50 policies buscando una condición
  demasiado ancha (por ejemplo `plan_lectura`, que es `auth.uid() is not null`
  — la vi y es solo el catálogo de precios, pero no revisé las otras con esa
  lupa).
- **`instrumentation.ts` / configuración de Sentry** y qué se manda fuera: es
  frontera con el rubro legal y lo dejé ahí.
- **Los ~40 handlers de API restantes en profundidad.** Verifiqué la puerta de
  los 40; leí entero solo el cuerpo de unos 18.
