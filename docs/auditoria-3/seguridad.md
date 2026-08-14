# Seguridad — auditoría 3

**Nota: 8/10** (antes 7). Sube un punto porque revisé a fondo lo nuevo de hoy
—los seis agentes, sus server actions, el export de proveedores, la rama de
oficina del processor y las tablas 0089-0091— y **toda ruta privilegiada tiene
dos capas independientes, ningún secreto tiene fallback silencioso, y no
encontré un solo camino sin autenticar a datos de un tenant.** Lo que impide el
9 no es un defecto de diseño de auth: es que `xlsx@0.18.5` (sin arreglo en npm)
y `sharp<0.35.0` tienen CVEs con camino de explotación real y alcanzable, uno de
ellos sin autenticación.

**Riesgo mayor hoy:** la superficie de dependencias, no la autorización. El
parseo de archivos subidos (`xlsx` en el import de Viajes) y el de imágenes de
WhatsApp (`sharp` en el intake de CFDI) corren sobre librerías con CVEs vivos.
Ninguno es lectura/escritura cross-tenant por sí mismo, así que ninguno es
CRÍTICO por la definición de este rubro — pero son los dos únicos puntos donde
entrada hostil toca código vulnerable conocido.

## Hallazgos

### MEDIO 1 — `xlsx@0.18.5`: prototype pollution + ReDoS, con camino real
`package.json:23` fija `"xlsx": "^0.18.5"` (verificado instalado: `xlsx 0.18.5`).
`npm audit` lo marca con **GHSA-4r6h-8v6p-xvw6** (prototype pollution en sheetJS)
y **GHSA-5pgg-2g8v-p4x9** (ReDoS), ambos **sin fix disponible en npm** (SheetJS
migró a su propio CDN).

Camino de explotación (leído, no supuesto): `src/app/dashboard/viajes/page.tsx:2`
importa `read` y `sheet_to_json` de `xlsx`; el server action `importar`
(`viajes/page.tsx:73-108`) hace `leerLibro(await archivo.arrayBuffer())` +
`sheet_to_json(hoja, { header: 1, raw: true })` sobre el archivo que sube el
usuario. Escenario: un `flota_admin` o `encargado` (los que pasan `puedeAsignar`,
`permisos.ts:18`) sube un `.xlsx` fabricado con una clave `__proto__` en el árbol
del workbook. El cap de tamaño (`MAX_IMPORT_BYTES = 8 MB`, línea 15) no lo frena
—el payload de pollution pesa bytes— y el `try/catch` de las líneas 86-92 solo
envuelve el `read`, no neutraliza la contaminación de `Object.prototype`, que es
**global al proceso**. En una instancia serverless multi-tenant, eso ensucia el
prototipo que ven peticiones concurrentes de OTRAS flotas.

Consecuencia real: DoS de la instancia (ReDoS con un archivo diseñado) y
contaminación de prototipo con alcance de proceso. No demostré un gadget que
convierta la pollution en lectura de datos de otro tenant, así que lo dejo en
MEDIO y no en CRÍTICO — pero el vector está abierto y el arranque requiere solo
una cuenta de oficina con permiso de asignar.

Refutación intentada: ¿el import está detrás de doble capa? Sí —`puedeVerRuta`
al cargar + `puedeAsignar`+tenant adentro— pero eso acota QUIÉN sube, no NEUTRALIZA
el parser vulnerable. La capa de auth está bien; la librería no.

### MEDIO 2 — `sharp<0.35.0` (libvips): alcanzable SIN autenticación
`package.json:16` fija `"sharp": "^0.34.0"`; `npm audit` reporta
**GHSA-f88m-g3jw-g9cj** (libvips: CVE-2026-33327/33328/35590/35591) para
`sharp<0.35.0`, con fix vía `npm audit fix --force` → `sharp@0.35.3` (breaking).

Camino: `src/lib/likida/intake/cfdi.ts:11` importa `sharp`; `decodeCodigosFromImage`
(línea 237) hace `await sharp(image).rotate().resize(...).jpeg().toBuffer()` sobre
el `Buffer` de la imagen. Ese buffer viene de media de WhatsApp descargada en el
processor — es decir, de **cualquier número que le escriba al WhatsApp de una
flota**, sin login ni cuenta. Un remitente manda una imagen fabricada que
dispara la corrupción de memoria en libvips.

Consecuencia real: lo demostrable es DoS/crash del worker; RCE por estos CVEs es
difícil y no lo probé. Lo grave del vector es que es **pre-autenticación** (el
webhook verifica firma de Meta, no identidad del remitente humano) y toca una
librería nativa. Severidad MEDIO: no es dato de otro tenant, pero es el único
punto donde entrada de un desconocido llega a código nativo con CVE vivo.

## Lo que revisé y está bien

**Las server actions de los seis agentes — doble capa, sin excepción.** Cada
`'use server'` es un POST público y cada uno re-verifica sesión+rol+tenant
ADENTRO, además del `puedeVerRuta` al cargar la página:
- `agentes/cobranza/page.tsx:24-29` (`exigirPermiso`): `requireSessionTenant` +
  `puedeVerArea('dinero')` + `rol!=='superadmin' && tenantId!==sesión → negado`.
  Lo usan las tres actions (`guardarEstrategia`, `alternarPausa`, `ejecutarAhora`).
- `agentes/proveedores/page.tsx:20-25`: mismo patrón; `subirFactura` y `decidir`
  lo llaman antes de tocar nada.
- `agentes/peajes/page.tsx:57-60`: re-chequea sesión+área+tenant dentro de
  `subirDesglose`.
- `viajes/page.tsx:77-79`: `importar` re-gatea con `puedeAsignar` (no solo
  `puedeVer`: importar CREA viajes) + tenant.
- `huerfanos/page.tsx:17-22`: `exigirPermiso` en `adjuntar` y `descartar`.
- `agentes/conductores/page.tsx`: es de solo lectura (sin `'use server'`), gateada
  por `puedeVerRuta` (área `operacion`). No hay action que doble-gatear.
- `cobranza/{controles,estrategia}.tsx` y `proveedores/controles.tsx` aparecían
  en el grep de "use server", pero son `'use client'`; la cadena está en
  comentarios, no son server actions. Falso positivo descartado.

**IDOR cerrado — todo id de FormData está anclado a tenant en el WHERE.** Me
refuté con el modo de falla #1 del repo:
- `decidirFacturaProveedor` (`proveedores.ts:149-155`): `.eq('id', facturaId)
  .eq('tenant_id', tenantId).eq('estado','pendiente')` — un `facturaId` de otra
  flota no matchea. Además candado anti-carrera con `estado='pendiente'`.
- `huerfanos.adjuntar`: `traerHuerfanoPendiente(tenantId, huerfanoId)` +
  re-verifica que el `viajeId` destino sea del tenant y esté vivo
  (`page.tsx:79-82`), no confía en el `<select>`.
- `sellarHito` (`hitos_viaje.ts:99-105`): `.eq('id', viajeId).eq('tenant_id',
  tenantId).is(col, null)`; `col` sale de un mapa whitelisted `COLUMNA`
  (`hitos_viaje.ts:80-84`), no de entrada de usuario — sin inyección de columna.

**RLS 0089-0091: deny-all + service role, y cada consulta filtra por tenant.**
Las tres tablas nuevas (`agente_cobranza_config`, `cobranza_contacto`,
`factura_proveedor`) hacen `enable row level security` **sin política** → deny
total para `anon`/`authenticated` aunque el GRANT default de Supabase les dé
privilegios de tabla (RLS activa gana). El acceso es solo vía `supabaseAdmin()`
(service role, bypassa RLS), y **las 11 consultas** contra esas tablas
(`proveedores.ts:82,112,150`; `cobranza.ts:35,62,119,197,208,230,290`) llevan
`.eq('tenant_id', tenantId)` o setean `tenant_id` en el insert/upsert. El tenant
siempre viene de la sesión (`exigirPermiso`/`resolverTenantEfectivo`), nunca de
FormData. No hay lectura sin ancla de tenant. No hay `FORCE ROW LEVEL SECURITY`
faltante que importe: el owner no es el rol de la app.

**Export `facturas-proveedor` — dos puertas, igual que liquidaciones.**
`api/export/facturas-proveedor/route.ts:26-33`: puerta del DATO
(`puedeVerArea(rol,'dinero')`) Y del VERBO (`puedeExportar(rol)`), tras
`resolverTenantApi` (401 sin sesión; `?tenant=` de superadmin validado contra la
tabla con manejo de `error`, `tenant-api.ts:63-72`). Rate limit 10/60s. Tope de
5000 con fallo-ruidoso si se rebasa (no CSV corto callado). Es el patrón correcto
del IDOR documentado.

**Rama de oficina del processor — no escala privilegios ni cruza tenant.**
`processor.ts:~402-470`: solo teléfonos que `resolverCuentaOficina` resuelve
(cuenta tenant-scoped por número) llegan aquí; un chofer lo atrapa antes
`resolveOperador`, y un desconocido cae al mensaje genérico. El despacho
(`despacho_wa.ts:128,172`) re-verifica `puedeAsignar(rol)` DOS veces (al
confirmar y al interpretar): **un contador no puede crear viajes**. Todas las
escrituras usan `cuenta.tenantId` (la flota del remitente), nunca un tenant
ajeno.

**Secretos: sin fallback silencioso derivado de otro.**
- `CRON_SECRET` requerido en `cron/{escalar,purgar,facturar}`; sin él → 500 (no
  200 verde), y mismatch → 401. El cron que corre `ejecutarCobranzaGlobal` está
  detrás de `Authorization: Bearer` (`escalar/route.ts:52-60`).
- Webhook WhatsApp: `verifySignature` (`meta/client.ts:40-46`) usa
  `WHATSAPP_APP_SECRET`, **falla cerrado si falta** (`return false`), HMAC-SHA256
  con `timingSafeEqual` tras chequeo de longitud. `verifyWebhookChallenge` igual.
- QStash usa current+next signing keys — rotación estándar, no un secreto
  derivado de otro.
- No hay ningún `process.env.X || process.env.Y` sobre secretos. Los `??` que
  existen son detección de entorno (`VERCEL_ENV ?? NODE_ENV`), no llaves.

**URLs firmadas: TTL corto.** `createSignedUrl` a 60s en export PDF
(`export/pdf/[id]/route.ts:95`) y en el processor (`processor.ts:2168`); 3600s
(1h) para `ligaComprobante`/`ligaPDF` de buckets privados, con justificación
escrita y generadas solo tras autorización de panel. Ningún TTL largo que fugue.

**Subidas de archivo: topes presentes y parsers seguros contra XXE/bombas.**
Topes: XML proveedor 2 MB, XML peajes 4 MB, import viajes 8 MB. `fast-xml-parser
5.10.1` — **lo probé en vivo**: entidad externa (`file:///etc/hostname`) lanza
"External entities are not supported"; billion-laughs (entidades DTD anidadas)
NO se expande (resultado de 68 bytes). XXE y expansión de entidades descartados
por prueba, no por versión.

## Lo que NO alcancé a revisar / descartes por escrito

**CVEs de `npm audit` sin camino real — descartados uno por uno:**
- **postcss** (XSS `</style>`, lectura de `.map` por `sourceMappingURL`): es de
  tiempo de BUILD (Next/Tailwind), no del request path en runtime, y no hay CSS
  controlado por atacante que se procese al construir. **Descartado.**
- **brace-expansion, fast-uri, nanoid** (DoS): transitivos (fast-uri bajo ajv;
  brace-expansion bajo tooling de glob). No están en un camino de request con
  entrada del atacante; `grep nanoid src/` no encontró un solo uso propio (el
  loop-con-size-0 necesita `nanoid(0)`, que no existe en el código). **Descartado.**
- **fast-xml-parser**: probado, sin XXE ni bomba de entidades (arriba).
  **Descartado.**

**Observación (no hallazgo) — asimetría de rol en el ingest consolidado por WA:**
la rama `processor.ts:~420-428` ingiere un CFDI consolidado a
`guardarYConciliarConsolidado(cuenta.tenantId, ...)` **sin chequeo de rol**,
mientras que el mismo ingest por panel (peajes) exige `puedeVerArea('dinero')`.
Un `encargado` (área solo `operacion`) podría dispararlo por WhatsApp. Lo dejo
como observación y no como hallazgo porque: (a) escribe en la flota del PROPIO
remitente, sin cross-tenant; (b) `mensajeConsolidadoRecibido`
(`consolidado.ts:415-424`) devuelve solo conteos de movimientos, **cero montos**
— no fuga cifras de dinero; (c) el actor es un miembro de oficina ya registrado.
Es una decisión de producto defendible (WA es el canal de oficina), pero la
asimetría queda anotada por si el mensaje algún día empieza a incluir pesos.

**No cubierto a fondo:** el lector universal de archivos del chat
(`agents/analista.ts` + `intake/archivo.ts`) — confirmé que NO importa `xlsx` en
runtime (solo Viajes lo hace), pero no tracé su superficie completa de parseo de
adjuntos; queda para una ronda con foco en el rail del chat.
