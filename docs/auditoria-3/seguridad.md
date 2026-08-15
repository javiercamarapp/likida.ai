# Seguridad — auditoría 3 (pase 3)

**Nota: 7/10** (antes 7). Razón del movimiento: **se atacó y no se movió — cambió
la composición, no el nivel.** La mitad del 7 anterior eran dos CVE con camino
real (`sharp` 0.34.5 y `xlsx` 0.18.5): **las dos murieron de verdad**
(`package.json:36,42-44` sube sharp a `^0.35.3` *y* pone un `overrides` para la
copia anidada de Next —la parte que casi todo el mundo olvida—; `package.json:38`
mueve `xlsx` al tarball 0.20.3 de SheetJS, donde CVE-2023-30533 y CVE-2024-22363
ya están corregidos). La otra mitad —"hay puntos con una sola capa"— sigue
**idéntica después de 81 commits**: el server action de ARCO sigue sin gate de
rol, `/cuenta` sigue fuera del matcher, y `/api/dashboard/ingesta` sigue sin
límite de tasa ni contador de presupuesto. Y encontré un ALTO nuevo en el
resolvedor de tenant que usan las 34 páginas del panel. La superficie nueva de
esta semana (llaves de API, D6, cofre, buzón, purgas) está, en cambio, entre lo
mejor construido del repo.

**El riesgo mayor del rubro, hoy:** `resolverTenantEfectivo` —el único punto por
el que pasan las 34 páginas de `/dashboard`— resuelve el `?tenant=` del
superadmin **sin mirar el `error` de la consulta**, así que un parpadeo de
PostgREST convierte "emitir la llave de API de Transportes Innovativos" en
"emitir la llave de API de la flota demo", en silencio y con acuse de éxito.

## Hallazgos

### [ALTO] `resolverTenantEfectivo` ignora el `error` del lookup de `?tenant=` — y de ahí sale el tenant al que ESCRIBEN las server actions
`src/lib/auth/tenant-efectivo.ts:189-200` (comparar con
`src/lib/auth/tenant-api.ts:63-67` y `resolverTenantPedido`, `tenant-api.ts:92-98`,
que sí lo miran) · consumidores de escritura:
`src/app/dashboard/llaves-api/page.tsx:59,65` ·
`src/app/dashboard/usuarios/page.tsx:72,92` ·
`src/app/dashboard/agentes/proveedores/page.tsx:71` (buzón).

**Escenario, con valores.** Javier (superadmin) abre
`/dashboard/llaves-api?tenant=7c0f1e5a-…` (Transportes Innovativos). La línea 190
hace `.from('tenant').select('id, nombre').eq('id', sp.tenant).maybeSingle()` y
**destructura solo `data`** — `const { data: t } = await …`. supabase-js reporta
por VALOR: un `fetch failed` de tres segundos devuelve `{ data: null, error }`,
igual que un uuid inexistente. El `if (t)` de la línea 191 no entra, `tenantId`
se queda en `sesion.tenantId` = `tenantDemo()` =
`11111111-1111-1111-1111-111111111111`, y `tenantNombre` se queda en `null`, así
que **tampoco se pinta el badge "viendo como superadmin"**: la pantalla se ve
como la demo. Javier aprieta "Emitir llave" → `crearLlaveApi('1111-…')` → la
pantalla le devuelve `lk_live_…` con "Llave emitida." Esa llave la pega el
cliente en su TMS y `GET /v1/viajes` le contesta **200 con los viajes de la flota
demo**. El mismo camino, en `/dashboard/usuarios`, provisiona al contralor del
cliente dentro de la flota demo; en Proveedores, rota el buzón de la flota
equivocada e invalida la dirección que los proveedores ya tienen.

**Consecuencia.** El integrador recibe datos de otra flota bajo un 200 y sin
manera de notarlo (su TMS no mira quién le contestó — es el argumento textual de
`api/v1/_comun.ts:13-25`). El contralor recién dado de alta no ve su propia
operación. Y `firmarImpersonacion` tampoco corre, así que la bitácora no registra
que hubo un intento de mirar esa flota: el fallo no deja rastro en ningún lado.

**Causa raíz probable.** La corrección ya existe y está escrita dos veces
(`resolverTenantApi` 503-fail-loud y `resolverTenantPedido` throw-fail-loud); la
función que de verdad usan las 34 páginas nunca la adoptó.

(REINCIDENTE parcial: el pase 2 reportó el mismo defecto como BAJO en
`chat/tenant.ts`, que es solo LECTURA de superadmin. Este es el camino de
ESCRITURA y llega hasta una credencial que se le entrega a un tercero.)

---

### [ALTO] El buzón de correo topa el TAMAÑO de cada adjunto y no la CANTIDAD — y ya consumió el correo antes de empezar a bajarlos
`src/app/api/correo/entrante/route.ts:140` (`const adjuntos = (d.attachments ?? []).filter(…)`,
sin `.slice()`) · `:165-179` (el insert de `correo_procesado` va ANTES del loop) ·
`:201-259` (loop SERIAL: 2 `fetch` + `estadoSatDeCfdi` por adjunto) · `:248`
(consulta al SAT, hasta 4 s cada una) · el archivo **no declara `maxDuration`**.

**Escenario, con valores.** Una refaccionaria manda su corte mensual: **un solo
correo con 200 CFDIs de ~12 KB** a `f-<token>@mail.likida.ai`. Ninguno pasa el
tope de 4 MB (`MAX_ADJUNTO_BYTES`), así que los 200 entran al loop. Antes del
loop ya se insertó la fila en `correo_procesado` (línea 166). El loop hace, en
serie y por adjunto: `GET api.resend.com/emails/{id}/attachments/{aid}`, `GET` de
la `download_url`, `estadoSatDeCfdi` (hasta 4 s), y el insert. Con los 200 al SAT
en el peor caso son ~800 s de espera sola. La invocación muere por presupuesto.
Resend no recibe respuesta y **reintenta**; el reintento choca con la llave
primaria de `correo_procesado`, sale por `errDedup.code === '23505'` (línea 171)
y devuelve **200 `ya_procesado`**. Resend deja de reintentar. Los 200 CFDIs no
entraron y no van a entrar nunca.

**Consecuencia.** El contralor pierde 200 comprobantes deducibles sin un solo
error en pantalla: la bandeja de Proveedores dice cero facturas nuevas y el log
solo tiene un `correo_entrante.procesado` que nunca se emitió. Es exactamente la
pérdida que la rama de `caidas` (líneas 261-290) fue escrita para impedir — solo
que ese rescate presupone que el loop **termina**, y nada garantiza que termine.

**Causa raíz probable.** El tope se pensó contra "un adjunto gigante" (así lo
dice el comentario de `MAX_ADJUNTO_BYTES`) y no contra "muchos adjuntos chicos",
que es la forma normal de un corte mensual en México.

---

### [ALTO] `/api/dashboard/ingesta` sigue gastando modelo de visión sin límite de tasa y sin escribir `llm_costo`
`src/app/api/dashboard/ingesta/route.ts:28-54` (ni un `rateLimit`, ni un tope de
presupuesto; el `logger.info` de la línea 51-54 es lo único que toca `costoUsd`) ·
comparar con `src/app/api/dashboard/chat/route.ts:39-42,72-88` (que sí tiene tope
diario) y con `api/export/pdf/[id]/route.ts:30`, `api/export/liquidaciones/route.ts:18`
(que sí tienen `rateLimit`) · `grep -rn "rateLimit(" src/` da 8 llamadas y
ninguna es ésta.

**Escenario, con valores.** Un `contador` de cualquier flota (rol legítimo, área
`dinero`) abre la consola del navegador con su sesión viva y corre
`for (let i=0;i<3000;i++) fetch('/api/dashboard/ingesta',{method:'POST',body:JSON.stringify({imagen:dataUrl})})`.
Cada petición ejecuta `extraerComprobante` → una llamada real de visión con 45 s
de presupuesto. No hay 429, no hay tope en USD, y la fila de `llm_costo` **no se
escribe** (`registrarCosto` no aparece en el archivo ni en `intake/ocr.ts`).

**Consecuencia.** Doble, y las dos silenciosas. (1) El único candado
anti-quemadura del producto —el tope diario por tenant del chat, que lee
`llm_costo … .eq('fase','chat')`— es **ciego** a este gasto. (2) La consola de
costo de IA de `/admin` (`resumen_costo_ia`, migs. 0062/0064) suma `llm_costo`
crudo, así que **subreporta el costo real** — un rótulo que deja de ser verdad
justo en la cifra con la que Javier fija el precio del producto.

**Causa raíz probable.** La ruta se escribió como "sonda que no escribe nada"
(su propio encabezado), y esa decisión —correcta para `gasto`— se extendió sin
querer a `llm_costo`, que no es dato del cliente sino la contabilidad propia.

(REINCIDENTE del pase 2, donde estaba como MEDIO. Lo subo a ALTO sin evidencia
nueva y lo digo: por la definición de severidad de esta ronda, "el contador de
presupuesto no ve el gasto" y "la consola de /admin subreporta" son las dos una
falla silenciosa, no una degradación que se note.)

---

### [MEDIO] El server action de ARCO sigue con una sola capa: comprueba sesión, no rol
`src/app/dashboard/arco/page.tsx:33-58` (dentro del `'use server'` solo hay
`requireSessionTenant(RUTA)`, línea 37; nunca `puedeVerRuta`) ·
`src/lib/auth/visibilidad.ts:103` (`'/dashboard/arco': 'operacion'`) · `:44`
(`contador: ['dinero']`) · comparar con
`src/app/dashboard/combustible-casetas/page.tsx:54-64`, que sí revalida
`puedeVerRuta` dentro del action.

**Escenario, con valores.** Rol `contador` de la flota A. La página le está
negada: `resolverTenantEfectivo` corre
`puedeVerRuta('contador','/dashboard/arco')` → `false` → redirect
(`tenant-efectivo.ts:174-176`). Pero una server action es un endpoint POST por su
cuenta —lo dice el propio repo en `combustible-casetas/page.tsx:48-52`—, así que
el contador hace `POST /dashboard/arco` con el `Next-Action` correspondiente y
`solicitudId=<uuid>&resolucion=Improcedente por no acreditar identidad`.
Adentro solo hay `requireSessionTenant`: pasa. `resolverSolicitudArco` sí ancla
`tenant_id`, así que la flota aguanta — pero la solicitud queda **resuelta** y se
dispara un WhatsApp al titular con ese texto.

**Consecuencia.** Un rol al que el producto le negó la pantalla cierra una
solicitud de derechos ARCO (LFPDPPP art. 32, 20 días hábiles) y le manda la
respuesta al titular. No se filtra dato: lo que se rompe es la autorización de
escritura sobre una obligación legal con constancia.

**Causa raíz probable.** El patrón "el action re-gatea adentro" se aplicó en las
demás páginas; ARCO se escribió antes de que el patrón se enunciara.

(REINCIDENTE del pase 2, sin cambios en 81 commits.)

---

### [MEDIO] El techo de 60/min por IP también corta a quien YA se identificó con llave: el 240/min por flota del OpenAPI es inalcanzable, y el mensaje del 429 miente
`src/app/api/v1/_comun.ts:189-192` (el `rateLimit('v1:ip:…', TASA_ANONIMA)` corre
**antes e independientemente** del camino de la llave) · `:132-135`
(`TASA_ANONIMA = 60`, `TASA_POR_FLOTA = 240`) · `:218-220` (el techo por flota) ·
`src/app/api/v1/openapi/route.ts:191`
(`"${TASA_ANONIMA}/min por IP antes de identificar, ${TASA_POR_FLOTA}/min por flota después"`).

**Escenario, con valores.** El TMS de una flota sincroniza desde una sola IP de
salida (`203.0.113.10`) con su llave `lk_live_…` de área `operacion` y hace 100
peticiones en un minuto — por debajo del 240/min que el OpenAPI le promete. La
petición **61** entra por la línea 190, la cubeta `v1:ip:203.0.113.10` ya tiene 60
sellos vivos, y recibe `429` con el texto *"Máximo 60 peticiones por minuto sin
identificar"* — una petición que venía perfectamente identificada. El techo real
de una flota es 60/min, no 240; y dos clientes detrás del mismo NAT corporativo
comparten esos 60.

**Consecuencia.** El integrador dimensiona su bucle contra la cifra documentada,
se topa con un límite 4× más bajo, y el cuerpo del error le dice que el problema
es que no se identificó. Se va a gastar la tarde buscando el bug en su
autenticación. Además `TASA_POR_FLOTA` es, hoy, código muerto: nunca se puede
alcanzar desde un solo origen.

**Causa raíz probable.** El límite anónimo se puso "antes de gastar el viaje a
Supabase" (comentario de la línea 130-131) y nadie lo descontó ni lo rebasó una
vez que la credencial sí resolvió.

---

### [MEDIO] El cofre deriva la llave AES-256 con UN solo SHA-256 sobre una frase que teclea una persona
`src/lib/likida/conectores/cofre.ts:48-57` (`createHash('sha256').update(secreto)`,
mínimo 32 caracteres) · su propia promesa en `:11-16` ("un volcado de la base es
ruido") · `supabase/migrations/0094_conector_credencial.sql:19-25` (la misma
promesa en la base) · el payload: `:14-17` ("la contraseña de un usuario de SAP
Business One … con la segunda, alguien entra al ERP del cliente").

**Escenario, con valores.** `LIKIDA_COFRE_LLAVE` se pone como
`likida-cofre-produccion-2026` (28 chars → rechazada) y alguien la alarga a
`likida-cofre-llave-produccion-2026` (34 chars, pasa el mínimo, ~50 bits de
entropía real porque la escribió un humano — el comentario de la línea 40-43 dice
textualmente que "la teclea una persona"). Un volcado de `conector_credencial`
(respaldo, service role, incidente de Supabase) le da al atacante el
`v1.<iv>.<tag>.<cifrado>`. Como el KDF es **un** SHA-256, cada candidato cuesta
un hash: una GPU de gama media prueba ~10^10/s. 2^50 candidatos son horas, no
años. Con un KDF real (scrypt / PBKDF2 con 600k iteraciones) la misma lista
cuesta 10^5–10^6 veces más.

**Consecuencia.** La afirmación escrita dos veces —"un volcado de la base es
ruido"— es más fuerte que lo que el código entrega. Lo que sale del volcado es
usuario y contraseña del SAP Business One del cliente, o sea acceso al ERP de la
flota, no a Likida.

**Causa raíz probable.** Se eligió SHA-256 para *normalizar el largo* a 32 bytes
(eso está bien razonado en el comentario) y se asumió de paso que también servía
como derivación desde una frase de baja entropía, que es otro problema.

---

### [MEDIO] `env.ts` no inventaria ni uno de los seis secretos que llegaron desde el pase 2 — el aviso de arranque calla mientras el buzón de facturas rechaza todo
`src/lib/env.ts:29-38` (los tres grupos: `llm`, `whatsapp`, `supabase`) ·
faltan `RESEND_WEBHOOK_SECRET` (`api/correo/entrante/route.ts:83`), `RESEND_API_KEY`
(`:152`), `LIKIDA_COFRE_LLAVE` (`conectores/cofre.ts:49`), `CRON_SECRET`
(`cron/{escalar,facturar,purgar}/route.ts`), `STRIPE_WEBHOOK_SECRET`,
`QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY`
(`cron/facturar/cola/route.ts:23-29`).

**Escenario, con valores.** Se despliega con `RESEND_WEBHOOK_SECRET` sin poner
(el caso normal: la variable se agregó el 14-ago). Cada `email.received` de
Resend entra por `verificarFirma`, cae en `motivo: 'sin_secreto'`
(`firma_entrante.ts:86`) y se contesta **401**. Resend reintenta, agota su
backoff y se rinde. `avisarConfiguracionSilenciosa` —que existe precisamente para
gritar la configuración ausente al arrancar— reporta **`{}`**, porque
`faltantes()` solo recorre `GROUPS`. El único rastro es un `logger.warn
correo_entrante.firma` por correo perdido, en un log que nadie mira si no sabe
que hay algo que buscar.

**Consecuencia.** El canal que el cliente pidió con todas sus letras (facturas de
taller y diésel por correo) puede estar muerto desde el despliegue y el sistema
no lo dice en ningún lado. Lo mismo aplica al cofre (`cifrar` lanza y el dueño ve
"falla del sistema" al guardar su SAP) y a QStash (503 en cada lote).

**Causa raíz probable.** El inventario se escribió cuando el repo tenía tres
integraciones y no se declaró como el sitio donde se registra toda variable
nueva; los seis secretos de esta semana entraron por su llamador y no por aquí.

---

### [MEDIO] `/api/dashboard/archivo` parsea el cuerpo entero antes de mirar el tope, y no tiene límite de tasa
`src/app/api/dashboard/archivo/route.ts:32` (`await req.json()` sin `bodyExcede`
previo) · `:41-43` (el tope de 16 MB se aplica DESPUÉS del parseo) · el archivo
no llama `rateLimit` · comparar con `api/v1/_escritura.ts:90-104`, que mide
`content-length` **y** el largo real, y con `webhook/whatsapp/route.ts:91-94`,
que hace lo mismo antes del HMAC.

**Escenario, con valores.** Sesión con área `dinero`. `POST /api/dashboard/archivo`
con `{"nombre":"a.xlsx","contenido":"<120 MB de base64>"}`. La línea 32 materializa
los 120 MB como string en la invocación; recién en la línea 42 se contesta 413.
Repetido sin techo, porque no hay `rateLimit`. Detrás, `leerArchivoUniversal`
entrega el buffer a `XLSX.read` (`intake/archivo.ts:83`) y a los parsers de PDF.

**Consecuencia.** Memoria y tiempo de invocación consumidos por un cuerpo que ya
se sabía que iba a rechazarse, y un despachador de parsers alcanzable en bucle
por cualquier sesión con área `dinero`. Hoy el daño está acotado (los CVE de
`xlsx` murieron con el 0.20.3); el que queda es de recursos, y el patrón de doble
medición que el resto del repo aplica aquí no está.

**Causa raíz probable.** El tope se escribió pensando en el tamaño del archivo
(base64 ya decodificado) y no en el costo de leer el cuerpo para poder medirlo.

(REINCIDENTE del pase 2 en su parte de límites; su parte de CVE está cerrada.)

---

### [MEDIO] `abrir()` tira el `llaveId`: nadie puede auditar qué llave leyó qué, que es la razón escrita para no borrar el renglón al revocar
`src/app/api/v1/_comun.ts:228` (`return { ok: true, tenantId: l.tenantId, rol: … }`
— `l.llaveId` se descarta) · `src/lib/auth/llave-api.ts:120,173` (lo produce) ·
`supabase/migrations/0093_tenant_api_key.sql:63` ("Revocar NO borra: el renglón
queda para la auditoría de qué llave leyó qué") · `grep -rn "llaveId" src/` sin
tests: seis apariciones, ninguna en un `logger`.

**Escenario, con valores.** La flota tiene tres llaves vivas (`lk_live_a1b2c3`
TMS, `lk_live_d4e5f6` tablero, `lk_live_g7h8i9` staging). Un integrador pega una
de las tres en un repositorio público. El dueño las revoca todas y pregunta lo
único que importa: *¿cuál se filtró y qué se llevó?* Toda la evidencia disponible
es `ultimo_uso_en`, **una sola marca de tiempo que se sobrescribe en cada
petición** (`llave-api.ts:168-171`). Los logs de las rutas de /v1 registran
`{ tenant }` y nunca la llave (`_comun.ts:225`, `viajes/route.ts:119`,
`clientes/route.ts:121`).

**Consecuencia.** La razón escrita para conservar el renglón revocado no se puede
ejercer: no hay forense posible tras una fuga de llave. Y en un incidente el
dueño no puede saber si el que leyó fue el TMS legítimo o el tercero.

**Causa raíz probable.** El dato existe y viaja hasta el borde; el tipo `Acceso`
—que es el contrato entre la puerta y las rutas— simplemente no lo lleva.

## Bajos

- **[BAJO] `/cuenta` corre con una sola capa.** `src/proxy.ts:109`
  (`RUTAS_CON_SESION = ['/dashboard','/admin','/vendedor']` — entró `/vendedor`
  esta semana, `/cuenta` sigue fuera) × `src/app/cuenta/page.tsx:9`. `GET /cuenta`
  sin cookie: el matcher la alcanza pero `startsWith` da false, no se pregunta
  sesión ni se pone `Cache-Control: no-store`, y la única puerta es el
  `requireSessionTenant` de la página — que hoy cierra bien, así que **no hay
  fuga**; lo que no hay es la segunda capa que `guard.ts:1-7` promete por escrito.
  A dos líneas de esa puerta hay un `supabaseAdmin()` que salta RLS.
  Que `/vendedor` sí se agregara y `/cuenta` no confirma que la lista se mantiene
  a mano. (REINCIDENTE.)
- **[BAJO] `tenantEfectivoChat` ignora el `error` del lookup.**
  `src/app/api/dashboard/chat/tenant.ts:23-27`. Es el mismo defecto del ALTO #1
  pero en el camino de LECTURA del superadmin: durante un parpadeo, el chat
  analiza la demo mientras el rótulo dice la flota X. (REINCIDENTE, sin cambios.)
- **[BAJO] El tope diario del chat es check-then-act y no hay `rateLimit` que lo
  sostenga.** `src/app/api/dashboard/chat/route.ts:72-88`. 200 POST concurrentes
  con la misma cookie leen `gastadoHoy = 0 < 1.00` las 200 y arrancan las 200; el
  registro del costo ocurre después. El "~$30 USD/mes por tenant" de la línea
  32-37 es un techo *secuencial*. (REINCIDENTE.)
- **[BAJO] `makeExecutor` ejecuta cualquier tool del `REGISTRY`; el allowlist solo
  limita lo que el modelo *ve*.** `src/lib/llm/tool-executor.ts:98,172`. Hoy lo
  refuta la frontera del bundle (el chat y el webhook son funciones distintas en
  Vercel), no un candado — y esa frontera desaparece en `next start`.
  (REINCIDENTE, sin cambios.)
- **[BAJO] La verificación 22 contradice a la 0046 desde que se escribió.**
  `supabase/verificaciones.sql:870-884` espera `buckets_publicos = 0`;
  `supabase/migrations/0046_perfil_avatar.sql:18` inserta `('avatares','avatares',
  true)`. El guardián que debía cazar "el siguiente bucket con el default
  equivocado" está rojo por diseño. (REINCIDENTE.)
- **[BAJO] D6 abrió el alta de usuarios sin abrir la baja.**
  `src/app/dashboard/usuarios/page.tsx:70-112` (solo `invitarUsuario`) ·
  `vista.tsx:156` y `forma.tsx:52` lo declaran honestamente. Escenario: el
  contralor de la flota renuncia el viernes; su cuenta sigue entrando por enlace
  mágico el lunes y el dueño **no tiene ningún botón** — la única vía es pedírselo
  a Likida. El repo dice la verdad en pantalla (no es una mentira de rótulo), pero
  el ciclo de vida de un permiso quedó abierto por un lado.
- **[BAJO] Las llaves de API no caducan.**
  `supabase/migrations/0093_tenant_api_key.sql:36-70` no tiene `expira_en`;
  `llave-api.ts:140-145` solo filtra `revocada_en is null`. Una llave que el
  integrador puso en un `.env` en 2026 sigue viva en 2029 salvo que alguien entre
  a revocarla. Con el hallazgo del `llaveId` de arriba, tampoco hay forma de saber
  si se sigue usando desde donde debería.

## Lo que revisé y está bien

**Los dos CVE del pase 2 están cerrados de verdad, y bien.** `package.json:36,42-44`
sube `sharp` a `^0.35.3` **y** agrega un bloque `overrides` con la razón escrita
("Next trae su propia copia anidada, así que subir la dependencia directa no
basta") — `package-lock.json:9383-9387` confirma `sharp 0.35.3` en el árbol.
`package.json:38` mueve `xlsx` al tarball `xlsx-0.20.3` de SheetJS, donde
GHSA-4r6h-8v6p-xvw6 (contaminación de prototipo, corregida en 0.19.3) y
GHSA-5pgg-2g8v-p4x9 (ReDoS, corregida en 0.20.2) ya no aplican. **El ALTO del
pase 2 y su MEDIO gemelo mueren aquí.**

**El patrón de la purga llamable por `anon` NO se repite en ningún lado.** Barrí
las 14 migraciones con `SECURITY DEFINER` y las 30 líneas de `grant`/`revoke` del
esquema. Cada función `SECURITY DEFINER` creada del 0092 al 0111 trae su
`revoke … from public` + `from anon` + `from authenticated` y su `grant … to
service_role`: `purgar_api_idempotencia` (0098:170-173, el arreglo de `73bbbb8`),
`purgar_correo_procesado` (0101:39-42), `purgar_agente_corrida` (0102:95-98),
`purgar_wa_conversacion` (0104:80-83), `purgar_codigo_pendiente` (0104:105-108) y
las tres redefiniciones de `mantenimiento_de_datos` (0101:77-80, 0102:134-137,
0104:151-154). El único `create or replace` sin `revoke` en su propio archivo es
`mantenimiento_de_datos` en 0098:178 — y ahí **no hace falta**: la firma
`(integer, timestamptz)` es idéntica a la de 0072:167, `CREATE OR REPLACE`
conserva la ACL, y la 0101 se la vuelve a revocar de todos modos. **Ninguna otra
función alcanzable por `anon`.** Las cuatro que resuelven todas las políticas RLS
llevan `search_path = public, pg_temp` desde la 0074, y las siete nuevas lo traen
de nacimiento (`set search_path to 'public','pg_temp'` en 0098/0101/0102/0104).
Los `grant` implícitos están tratados donde importa: la 0054 revoca **de
`public`**, no de `anon` — la lección exacta que el rubro pide buscar.

**RLS de las tablas nuevas.** Barrí las 48 `create table` de las 111 migraciones:
**todas** tienen `enable row level security`, sea explícito o por el bucle
`execute format` de la 0001 (7 tablas) y la 0047 (4). Las nuevas de esta semana:
`tenant_api_key` (0093:82-87) y `conector_credencial` (0094:85-89) con
`administra_flota()` —CONTROL, no dato: ni contador ni encargado—;
`api_idempotencia` (0098:122), `correo_procesado` (0096:29),
`agente_notificacion_config`/`_estado` (0097:69-70), `prospecto` (0105:122),
`desglose_peaje`/`_linea` (0106:107-108), `interruptor` e `impersonacion_dia`
(0110) **con RLS encendida y CERO políticas** = deny-all, con el razonamiento
escrito de por qué una política "por flota" sería peor. `agente_corrida`
(0102:72-73) solo `for select` por tenant: la escribe el servidor. La única vista
del esquema sigue con `security_invoker = true` (0054).

**El barrido multi-tenant.** Enumeré programáticamente todas las llamadas
`.from('<tabla con tenant_id>')` de `src/**` (sin tests) y revisé a mano las 26
que no traen `tenant_id` en las siguientes 700 columnas. **Ninguna es una fuga.**
Se reparten así: 6 son `lib/admin/negocio.ts` y `lib/admin/corridas-cruzadas.ts`,
que cruzan tenants A PROPÓSITO (la excepción declarada); 8 son `app_user` filtrado
por `.eq('id', <userId de sesión>)` (`mi-perfil` × 2, `suscripcion`,
`seccion-notificaciones:165`, `interruptores`) o por `.eq('rol','vendedor')`
(`vendedores.ts:357,395`, rol de Likida sin tenant); 4 son inserts donde
`tenant_id` va en el objeto de la fila (`clientes.ts:915` vía `filaTarifa`,
`desglose_peaje.ts:565` vía `filasLinea`); las demás son `startup.ts` (arranque),
`conv.ts` y la re-validación por `id` del callback firmado de QStash. Los tres
puntos donde el id llega del cliente están anclados por los dos lados:
`getLibroViaje(tenantId, id)` en `/v1/viajes/{id}`, `.eq('id',id).eq('tenant_id',
tenantId)` en `export/pdf/[id]:78-83`, y `soloDeVendedor` en
`vendedores.ts:485-517`.

**Llaves de API (superficie nueva, la revisé entera).** La llave en claro no se
guarda: `generarLlave` usa `randomBytes(32)` en base64url (256 bits), se guarda
`sha256` hex y el CHECK `tenant_api_key_hash_forma` (`^[0-9a-f]{64}$`) haría
fallar el insert si alguien intentara escribir la llave. La comparación es
`timingSafeEqual` con chequeo de largo previo (`llave-api.ts:110-117`), y el loop
recorre **todas** las candidatas del prefijo aunque la primera cuadre, para no
volver medible cuántas comparten prefijo. Falla cerrado en los dos sentidos que
importan: llave inválida/revocada/inexistente → **el mismo 401 con el mismo
texto**; error de lectura → **503, nunca 401** (para que el TMS no borre una
llave buena por un bache). `Basic` y cualquier esquema desconocido → `null`, no
se adivina. La llave **manda sobre la cookie** (`_comun.ts:206-229`) para que el
área acotada de la llave no la desborde el rol de la persona, y `_comun.ts:150-154`
**borra el `?tenant=`** antes de que llegue a `resolverTenantApi` —con prueba que
lo fija usando una sesión de superadmin—, que es la superficie de IDOR obvia de
una API pública. Emisión y revocación (`llave-api-escritura.ts`) van con
`tenantId` por closure desde la sesión, el UPDATE de revocar ancla `tenant_id` **y**
mira las filas devueltas (`:157-169`), y revocar dos veces se rechaza para no
pisar el sello original. Las dos puertas (`puedeVerRuta` + `puedeAdministrar`) se
comprueban **dentro** de cada server action, no solo en el render
(`llaves-api/page.tsx:60,86`).

**D6 — el dueño invita a su contralor.** No hay escalada. `ROLES_INVITABLES`
(`invitar.ts:49-65`) no contiene `superadmin`, `operador` ni `vendedor`, y
`validarInvitacion:114-117` **falla cerrado contra el catálogo**: un POST directo
con `rol=superadmin` rebota con mensaje, no con un default. El `tenantId` va por
**closure desde la sesión re-resuelta** dentro del action
(`usuarios/page.tsx:72,92`), jamás del formulario, y el action re-comprueba
`puedeVerRuta` **y** `puedeAdministrar`. Un `flota_admin` de la flota A no tiene
ningún parámetro con el que nombrar la flota B (el `?tenant=` solo lo honra
`resolverTenantEfectivo` si el rol REAL es superadmin). El mensaje de éxito no
miente: dice que no le llega correo todavía, en vez de prometer una invitación
que `avisoInvitacion` no emite.

**Buzón de intake y webhook de correo.** El token es `randomBytes` sobre base32
de Crockford sin caracteres ambiguos, 24 chars ≈ 118 bits, **con rechazo por
módulo** para no sesgar los primeros 16 símbolos (`buzon.ts:47-58`), único global
en la base (`0095`, índice parcial) y con CHECK de forma. La flota se resuelve
del **destinatario, nunca del remitente** (`entrante/route.ts:116`), y
`tokenDeDestinatarios` devuelve `null` si hay dos buzones distintos en el mismo
correo en vez de adivinar. La firma se verifica **antes de leer una sola cosa del
cuerpo**, sobre el texto CRUDO, con ventana de ±5 min anti-replay y
`timingSafeEqual`, recorriendo todas las firmas de la cabecera (rotación de
Svix); **sin secreto no se acepta** (`firma_entrante.ts:86`), y el motivo real
solo va al log para no enseñarle a quien prueba cómo ajustar el siguiente intento.
El token no viaja ni a la bitácora ni al logger (`buzon_escritura.ts:61-64,113`).

**El cofre, salvo el KDF.** AES-256-**GCM** (autenticado: una alteración del
ciphertext lanza en `final()`, no devuelve basura que acabe autenticándose contra
el SAP del cliente), IV nuevo de 96 bits por guardado, formato versionado
`v1.<iv>.<tag>.<cifrado>`. Sin la variable **lanza**, no guarda en claro. El
CHECK `conector_credencial_no_en_claro` (`valores_cifrados !~ '^\s*\{'`) impide
por esquema guardar un JSON plano. `listarCredenciales` **jamás selecciona**
`valores_cifrados` (`credenciales.ts:145`); solo devuelve `pistas`, y `pistasDe`
tapa entero cualquier secreto de menos de 8 caracteres en vez de enseñar 4 de 6.

**Firmas y cron.** WhatsApp: cap de cuerpo **antes** del HMAC y otra vez sobre
`raw.length`, `timingSafeEqual`, y el exceso de tasa responde **429 y no 200**
para que Meta reentregue. Stripe: mismo doble cap, tolerancia de 300 s, 503 sin
`STRIPE_WEBHOOK_SECRET`. QStash: 503 sin las tres variables, `Receiver.verify`
con las *signing keys* (no el token) antes de leer nada, 401 en firma inválida o
excepción. Los tres crons: sin `CRON_SECRET` responden **500, no 200** — con la
razón escrita de que un 200 dejaría el cron verde para siempre.

**URLs firmadas.** Solo dos firmadores vivos y los dos a **60 segundos**:
`export/pdf/[id]:95` y `processor.ts:2358`, ambos sobre buckets privados. La ruta
de export contesta el **mismo 404** para "no existe" y "existe sin PDF", para no
ser un oráculo. `intake/almacen.ts:97` (`ligaComprobante`, default 3600 s) sigue
**sin ningún llamador** — código muerto, no una URL viva.

**Server actions.** Barrí programáticamente los 26 `'use server'` de `src/app` que
no re-resuelven sesión en las 900 líneas siguientes: 20 son de `/admin` (gateado
por `requireSuperadmin` en `layout.tsx:15` y repetido dentro de cada action — el
script confirma **cero** actions de `/admin` sin re-gateo), 2 son `signOut`, y los
demás delegan en helpers de módulo que sí gatean (`guardia()` en despacho:74-80,
`exigirPermiso`/`exigirControlBuzon` en proveedores:33-55,
`tenantYUsuarioDelAction` en combustible-casetas:54-64,
`ejecutarComoVendedor` en panel-vendedor:35-49, `puedeConfigurarAvisos` en
notificaciones.ts:252-263). **La única excepción sigue siendo ARCO**, arriba.

**`?tenant=` y `?rol=`.** Los siete sitios que aceptan `?tenant=` lo validan
contra la tabla y **solo para superadmin**; para cualquier otro rol se ignora en
silencio. `rolEfectivo` (`visibilidad.ts`) solo honra `?rol=` si el rol REAL es
superadmin y solo hacia un subconjunto: **nunca puede dar visibilidad, solo
quitarla**. `PANEL_PROPIO` mantiene `vendedor` fuera de `AREAS_POR_ROL` a
propósito, así que un vendedor no abre ninguna pantalla de `/dashboard`
(`areasDe` → `[]` por el `?? []`). `SIN_ROL` sigue siendo un marcador que ninguna
puerta reconoce. La impersonación ahora **se firma** en `bitacora_auditoria`, una
vez por (actor, flota, día MX), con el dedup resuelto por el PK de
`impersonacion_dia` (0110) y no por un `select` con carrera.

**Login.** `shouldCreateUser: false`, oráculo de enumeración cerrado a mano
(`esCorreoSinCuenta`, con el motivo solo en el log y **sin el correo**), el
mensaje de exceso de tasa es el **genérico** para no delatar cuándo dejó de
contar, y el `next` se valida con `startsWith('/dashboard')` en los tres puntos.

### CVEs — los 7 de `npm audit`, descartados uno por uno

`npm audit` reporta 7 (2 críticas, 2 altas, 3 moderadas). **Ninguno tiene camino
real de explotación en esta app**, y uno de los dos "altos" ni siquiera existe en
el repo:

| Paquete | Aviso | Veredicto individual |
|---|---|---|
| `xlsx` (reportado como *high*, prototype pollution + ReDoS) | GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9 | **Descartado — es un artefacto del entorno, no del repo.** `git show HEAD:package.json:38` pide `https://cdn.sheetjs.com/xlsx-0.20.3/…`; el `git diff` del árbol de trabajo muestra que este contenedor lo sustituyó por `0.18.5` del registry porque la red deniega `cdn.sheetjs.com` (documentado en `MAPA.md:69-76`). **0.20.3 tiene los dos avisos corregidos** (prototype pollution en 0.19.3, ReDoS en 0.20.2). Lo que se despliega no es lo que auditó `npm audit`. |
| `vitest` (*critical*) | GHSA-5xrq-8626-4rwp, "Vitest UI server … arbitrary file read and execute" | **Descartado.** `devDependencies`; el vector exige el servidor de UI escuchando y `package.json` corre `vitest run` (una pasada, sin `--ui`, sin `--api`). No entra al bundle. Riesgo real: la laptop de quien corra `vitest --ui` a mano. |
| `@vitest/coverage-v8` (*critical*) | vía `vitest` | **Descartado.** No tiene aviso propio: hereda el de arriba. Solo se carga con `--coverage`, en dev. |
| `@vitest/mocker` (*moderate*) | vía `vite` | **Descartado.** Mismo árbol de dev; el vector es el dev-server de Vite, que producción no ejecuta (`next build --webpack`). |
| `vite` (*high*) | GHSA-4w7w-66w2-5vf9 (path traversal en `.map`), GHSA-fx2h-pf6j-xcff (`server.fs.deny` en rutas alternas de Windows), GHSA-v6wh-96g9-6wx3 (NTLMv2 por UNC en Windows) | **Descartado, tres veces.** Los tres son del **servidor de desarrollo**; dos de ellos son además **exclusivos de Windows** y este repo corre en Linux y despliega en Linux. No hay `vite` en runtime de producción. |
| `vite-node` (*moderate*) | vía `vite` | **Descartado.** Idem: solo lo usa el runner de pruebas. |
| `esbuild` (*moderate*) | GHSA-67mh-4wv8-2f99 ("cualquier sitio web puede mandarle peticiones al dev-server y leer la respuesta") | **Descartado.** El aviso dice literalmente *development server*. Producción no levanta esbuild como servidor. |

**Evaluado aparte, sin que `npm audit` lo levantara:** `fast-xml-parser` 5.10.1 y
la expansión de entidades (billion laughs) sobre el camino NUEVO de esta semana
—`api/correo/entrante` → `parseCfdiXml`, o sea XML de un remitente arbitrario—.
Sigue sin ser hallazgo por la misma razón que en el pase 2: la versión instalada
normaliza `processEntities: true` a límites duros (`maxExpandedLength: 100000`,
`maxEntityCount: 1000`, `maxEntitySize: 10000`), y encima el adjunto está topado
a 4 MB antes de llegar al parser. **No es hallazgo.**

## Lo que NO alcancé a revisar

- **No ejecuté nada contra la base ni contra la app.** Todo lo de RLS, `grant` y
  `SECURITY DEFINER` sale de leer las 111 migraciones; no corrí
  `verificaciones.sql` (no hay credenciales aquí). El BAJO de la verificación 22
  demuestra por qué eso importa: su valor anotado ya no corresponde al esquema.
- **`clientIp` y la falsificación de `x-forwarded-for`.** `ratelimit.ts:96` toma
  el extremo **izquierdo** de la cabecera, que es la posición que el cliente
  controla en el caso general. Si Vercel sobrescribe la cabecera en el borde, no
  hay nada; si la antepone, el límite de 10 magic-links/5 min de `login:email` se
  multiplica por cada valor falso que el atacante rote. **No pude verificar cuál
  de las dos hace Vercel desde este entorno**, así que no lo reporto como
  hallazgo. Es el experimento más barato que queda: un `curl` con
  `X-Forwarded-For: 9.9.9.9` contra `/api/health` y mirar qué llega.
- **No reproduje el POST del server action de ARCO.** El hallazgo está razonado
  sobre el modelo de amenaza que el propio repo enuncia
  (`combustible-casetas/page.tsx:48-52`); no confirmé que el id del `Next-Action`
  sea recuperable de un chunk estático en este build concreto.
- **`processor.ts` completo (2,300+ líneas).** Miré la firma del PDF (~2320-2360)
  y el borde de la ruta de oficina; la máquina de estados del cuadre solo por
  `grep`. Si hay una decisión de autorización enterrada ahí, no la vi.
- **`cron/facturar` (610 líneas) y `pagina_playwright.ts`.** Verifiqué el gate de
  `CRON_SECRET` y la firma de QStash; no audité el manejo de credenciales de
  portal ni la sesión de navegador. Nota sin severidad, heredada y todavía cierta:
  `facturar/route.ts:341` deriva la URL de callback de `req.headers.get('host')`
  cuando falta `NEXT_PUBLIC_APP_URL` — Host-header clásico, hoy inalcanzable
  porque solo llega quien trae el bearer.
- **Supabase Auth como servicio.** Expiración del magic link, reuso de refresh
  token, MFA y la configuración de Site URL / Redirect URLs viven en el panel de
  Supabase, no en el repo. `CLAUDE.md` ya advierte del desalineamiento con
  `NEXT_PUBLIC_APP_URL`; no pude comprobarlo.
- **El árbol de trabajo estaba sucio** cuando audité (`package.json`,
  `package-lock.json` y `src/lib/likida/cuadre/tope_alimentacion.ts` modificados
  por otra corrida). Auditicé el contenido de `HEAD` para todo lo de dependencias;
  el resto lo leí del árbol.
