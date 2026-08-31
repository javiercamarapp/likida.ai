# Modelo de datos y esquema — auditoría 22

**Nota: 8/10** (antes: s/d). Razón: línea base nueva, sin ancla previa legible.
El 8 no es cortesía y se puede falsificar: barrí el catálogo de las 252
migraciones como texto y **las unicidades críticas están todas**, la regla de
FK compuesta `(col, tenant_id)` está cerrada en las 36 relaciones (0028 + 0073
+ 0145, verificado columna por columna aquí), **las 145 tablas creadas tienen
`enable row level security`** (cero excepciones, incluidas las de los bucles
dinámicos), **toda función `SECURITY DEFINER` lleva `search_path` fijo**, y los
catálogos de dominio que dupliqué contra TypeScript coinciden exactamente
(`interruptor_id_dominio` 60/60 contra `INTERRUPTORES`; `cron_latido_id_dominio`
11/11 contra los `registrarLatido` reales; `ConceptoGasto` 9/9;
`ParcialEstrategia` 2/2). No es 9 por dos cosas: un ALTO abierto —la identidad
de una conversación de WhatsApp es una CADENA, no un número, y la 0024 ya
arregló ese mismo defecto en la tabla hermana y dejó ésta atrás— y porque la
idempotencia de las migraciones es *desigual*: 51 `add constraint` sin guardia y
8 `create table` sin `if not exists`, en un repo cuya propia convención dice
«IDEMPOTENTE: segura de re-correr».

**El riesgo mayor del rubro hoy:** la base sabe qué es un peso pero no sabe qué
es una persona — `operador` identifica al chofer por número normalizado desde la
0024 y `wa_conversacion` lo sigue identificando por la cadena cruda, así que el
mismo chofer puede tener dos hilos y el freno del cierre sin comprobantes se
reinicia entre ellos.

## Hallazgos

### [ALTO] La conversación de WhatsApp se identifica por la CADENA del teléfono; el operador, por el número. La 0024 arregló una y dejó la otra.
`supabase/migrations/0005_concurrencia.sql:13` · `supabase/migrations/0024_telefono_normalizado_unico.sql:131` · `src/lib/likida/conv.ts:64` · `src/lib/likida/conv.ts:326`

`wa_conversacion_tenant_tel_uidx` es `on wa_conversacion (tenant_id, telefono)`
sobre el **texto crudo** (0005:13-14). La 0024 diagnosticó exactamente este
modo de falla para `operador` y lo cerró con
`uq_operador_tenant_telefono_norm on operador (tenant_id, telefono_normalizado(telefono))`
(0024:131-132), cuyo propio comentario dice: *«La original compara texto crudo,
así que "529993700779" y "5219993700779" pasaban como dos operadores distintos
de la misma flota … y con el historial partido entre las dos.»* `wa_conversacion`
nunca recibió ese tratamiento.

Y el código afirma que las dos formas SÍ llegan. `conv.ts:64-71`, textual: *«el
mismo teléfono llega como `529993700779` o como `5219993700779` según por dónde
entre»* — por eso existe `variantesTelefono()` (`conv.ts:87`), que genera hasta
seis formas y con las que `resolveOperador` (`conv.ts:117`) resuelve al chofer
**por cualquiera de ellas**. `loadConversation`, en cambio, busca con
`.eq('telefono', telefono)` — igualdad exacta (`conv.ts:326-330`) — y si no
encuentra, INSERTA (`conv.ts:356-357`).

Escenario: el chofer Ramírez, alta `+5219993700779`. Llega un mensaje con
`from = "5219993700779"` → `resolveOperador` lo resuelve por variante →
`loadConversation` crea la fila A. El siguiente mensaje entra como
`"529993700779"` (la forma sin el «1» que el propio `conv.ts:64` declara) →
`resolveOperador` resuelve **al mismo operador** → `loadConversation` no
encuentra la fila A y crea la fila B. A partir de ahí:
`asignar_wa.ts:194-200` escribe el pendiente de asignación con
`onConflict: 'tenant_id,telefono'` sobre B, `asignar_wa.ts:157-161` lo lee de A
y devuelve `null`; lo mismo con `despacho_wa.ts:139-145`. Y `cierreSinComprobantes`
—la marca que hace que el freno del cierre pregunte UNA vez y no entre en bucle
(`conv.ts:55-61`)— vive en `estado` de una de las dos filas: en la otra vale
`undefined`, o sea «todavía no se le advirtió». El viaje se puede cerrar sin
comprobantes con la advertencia contada como no dada.

Consecuencia: el chofer recibe dos veces la misma pregunta y su «sí» se pierde;
peor, el guardia de una sola advertencia antes de liquidar sin comprobantes se
reinicia solo. En el panel de conversaciones (`src/lib/likida/conversaciones.ts:75`)
el contralor ve dos hilos del mismo chofer y ninguno completo.

Refutación intentada, y lo que NO pude descartar: busqué un segundo escritor de
`wa_conversacion.telefono` con otra forma y **no lo hay** — los cuatro caminos
(`processor.ts:429, 2357, 2958, 3252` y los dos de oficina en `processor.ts:659,675`)
pasan siempre `msg.from` de `messages[].from`. Así que el disparo necesita que
Meta varíe la forma entre mensajes del mismo usuario, que es justo lo que
`conv.ts:64` afirma que pasa, o un `update`/`insert` por consola. No hay CHECK
ni índice normalizado que lo impida, y no hay bloque en `verificaciones.sql`
que lo vigile.

Causa raíz probable: la 0024 normalizó `operador` y no barrió las otras columnas
de teléfono del esquema; `wa_conversacion` (0005) es anterior y quedó fuera.

### [MEDIO] `cfdi_pago` es la única tabla de CFDI sin la forma obligatoria del UUID que la 0158 impuso en las otras cuatro.
`supabase/migrations/0199_rep_metodo_pago.sql:57` · `supabase/migrations/0199_rep_metodo_pago.sql:74` · `supabase/migrations/0158_integridad_fiscal.sql:429`

La 0158 recorre una lista **fija de cuatro tablas** (`gasto`, `cfdi_xml`,
`factura_emitida`, `factura_proveedor`, 0158:392-396) y les pone
`check (cfdi_uuid is null or cfdi_uuid = lower(cfdi_uuid))` (0158:429), con este
comentario: *«El SAT lo imprime en MAYÚSCULAS y el OCR lo lee en minúsculas: sin
esta forma única, `uq_gasto_cfdi_uuid` deja entrar el mismo comprobante dos veces
y su IVA se acredita dos veces.»* `cfdi_pago` nació después (0199) con
`cfdi_uuid text not null` y `docto_relacionado_uuid text not null` sin CHECK de
minúsculas ni de forma UUID — a diferencia de `rep_emitido` (0228:210-213) y
`sat_cfdi_descargado` (0231:241-243), que sí los llevan.

Escenario: un REP se re-registra desde la consola/un script con el UUID tal como
el SAT lo imprime, `docto_relacionado_uuid = 'A1B2C3D4-...'`, cuando ya existe la
fila que escribió `intake/rep.ts:195-205` con `'a1b2c3d4-...'`.
`uq_cfdi_pago_docto (tenant_id, cfdi_uuid, docto_relacionado_uuid)` (0199:74-75)
no colisiona: son dos cadenas distintas. Resultado: el mismo DoctoRelacionado
queda registrado dos veces con su `imp_pagado 4,640.00` y su `iva_pagado 640.00`,
y el rastro que la propia tabla declara como evidencia de LIVA 5-III dice que se
pagó el doble. Y en el otro sentido: el sello a `gasto` (`rep.ts:221-224`) compara
contra `gasto.cfdi_uuid`, que la 0158 SÍ fuerza a minúsculas, así que la fila en
mayúsculas **nunca liga** — el `pagado_en` no se escribe y el IVA de ese CFDI
queda fuera del acreditamiento para siempre, en silencio.

Consecuencia: el contralor pierde el IVA acreditable de un CFDI que sí pagó, y
el rastro fiscal del REP cuenta un pago de más. Hoy `cfdi_pago` tiene un solo
escritor y ningún lector en `src/`, así que el daño es al rastro y al sello, no
todavía a una cifra en pantalla.

Causa raíz probable: la 0158 usa una lista enumerada de tablas en vez de barrer
`information_schema` por columnas llamadas `*cfdi_uuid`/`*_uuid`, y toda tabla
posterior tiene que acordarse sola.

### [MEDIO] `moneda` es texto libre en las cinco tablas de dinero, y `pago_recibido` no la tiene: `factura_saldo` resta pesos de dólares.
`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:43` · `:93` · `:118`

`factura_emitida.moneda text not null default 'MXN'` no tiene CHECK de dominio
(0049:43); lo mismo en `tarifa` (0048:115), `cotizacion` (0051:87),
`suscripcion`/`factura_saas` (0052:34,93) y `politica_detencion` (0207:48).
`pago_recibido` (0049:93-104) **no tiene columna `moneda` en absoluto**, y la
vista `factura_saldo` calcula `f.total - coalesce(sum(p.monto), 0)` (0049:118)
sin mirar ninguna de las dos.

Escenario: `factura_emitida {moneda:'USD', subtotal:8620.69, iva:1379.31,
total:10000.00}` — pasa `factura_total_cuadra` (0049:54) sin problema — y un
`pago_recibido {monto: 10000.00}` en pesos. `factura_saldo.saldo = 0.00`, y la
cobranza pinta la factura como pagada. Son ~$184,000 MXN dados por cobrados con
$10,000 recibidos.

Consecuencia: el contralor deja de perseguir un cobro que sigue vivo. Hoy el
único escritor (`facturacion_escritura.ts:388`) fija `moneda: 'MXN'` a mano, así
que la puerta es la consola o el día que se acepte otra divisa — pero la columna
existe precisamente para eso y nada la acota.

Causa raíz probable: se modeló la moneda como dato de la factura y no del
movimiento; sin `moneda` en `pago_recibido` no hay forma de que un CHECK las ate.

### [BAJO] `invitacion.rol` sigue aceptando `operador`, un rol que `app_user` rechaza desde el 7-ago-2026.
`supabase/migrations/0053_cuentas_bitacora_arco_campanias.sql:45` · `supabase/migrations/0086_retirar_rol_operador.sql:98`

`invitacion_rol_dominio check (rol in ('flota_admin','contador','encargado','operador'))`
(0053:44-45) nunca se actualizó cuando la 0086 retiró `operador` de
`app_user_rol_dominio` (0086:96-98; hoy el dominio vivo es el de 0105:52 —
`superadmin, flota_admin, contador, encargado, vendedor`).
`ROLES_INVITABLES` (`src/lib/auth/invitar.ts:49-64`) tampoco lo ofrece.

Escenario: una fila `invitacion {rol:'operador'}` —por consola, o el día que se
construya la pantalla de invitaciones sin releer los dos CHECK— pasa. Al
aceptarla, `provisionar.ts:57` inserta en `app_user` con ese rol y revienta con
`23514 app_user_rol_dominio`: el invitado recibe un error crudo y no puede
entrar nunca, y la invitación queda viva ocupando `invitacion_viva_unica`.

Consecuencia: BAJO hoy — la tabla no tiene escritor de producto. Es drift de
dominio entre dos tablas que describen el mismo concepto.

Causa raíz probable: la 0086 buscó `app_user.rol` y no las columnas `rol` de las
otras tablas.

### [BAJO] `evento_seguridad_flota` reabre el patrón O(n²) que la 0071 midió y cerró.
`supabase/migrations/0203_eventos_seguridad_flota.sql:23` · `:36` · `:43`

`unidad_id` (0203:23) e `incidencia_id` (0203:36) llevan FK simple **y**
compuesta (0203:58-77) hacia `unidad` e `incidencia`, y ninguna tiene índice que
la encabece: los tres índices de la tabla (0203:43-50) empiezan todos por
`tenant_id`. La 0071 midió este patrón exacto (`delete from tenant` de 4,696.5 ms
→ 900.5 ms con los índices; un sondeo de FK sin índice a 10.35 ms contra 0.036 ms)
y su criterio explícito es *«solo vale la pena el índice cuando el padre puede
tener MUCHAS filas»* — `unidad` lo cumple. `evento_seguridad_flota` nació 132
migraciones después y no repitió el patrón.

Escenario: baja de una flota (ARCO / cierre de cuenta) con 200 unidades y
400,000 eventos de cámara: al cascadear `tenant → unidad`, el trigger de las 4 FK
que apuntan a `unidad`/`incidencia` hace un `Seq Scan` completo de
`evento_seguridad_flota` **por cada fila padre**. Es filas_padre × tamaño_hijo,
literalmente la definición que la 0071 escribió.

Consecuencia: BAJO — no hay borrado de `unidad` en el producto (busqué:
ningún `.delete()` sobre `unidad` en `src/`), así que solo muerde en la baja de
una flota, que es rara y no está en el camino del contralor.

Causa raíz probable: el criterio de la 0071 vive en un comentario, no en un
bloque de `verificaciones.sql` que barra el catálogo y se ponga rojo.

## Chequeo de higiene de migraciones

**Numeración duplicada** — ninguna encontrada. 252 archivos, `0001`…`0271`, cero
repetidos (el incidente de los dos `0267` está cerrado). Hay 19 huecos
(`0067-0069, 0156, 0179, 0200, 0210-0212, 0220-0222, 0224, 0249, 0252-0253,
0255-0257`); revisé `git log --all --name-status` sobre `supabase/migrations/` y
**ninguno corresponde a un archivo borrado** — son números reservados a fases
paralelas, como declara `0213_coordinacion_proveedor.sql:3`. No es hallazgo.

**No idempotentes** — la convención de la casa («IDEMPOTENTE: segura de
re-correr», 0271:88-90) no es uniforme. Tres formas, todas verificadas:

- **51 `alter table … add constraint` sin guardia** (ni `drop constraint if
  exists` previo, ni `if not exists` contra `pg_constraint` en el mismo
  archivo). Los peores por volumen: `0228_portal_pago.sql:92,94,97,100,147,149,152,155,161,210,212,215,217,243`
  (14 en un archivo cuyas tablas sí van con `create table if not exists`),
  `0108_factura_proveedor_flujo.sql:49,51,53,57,62`,
  `0204_carta_porte_mercancia.sql:39,42,45,101,106`,
  `0199_rep_metodo_pago.sql:37,41`, `0226_timbrado_pac.sql:88,91,94`,
  `0070_montos_no_negativos.sql:41,44`, `0073_huerfano_integridad.sql:30,59,63,71`.
  Modo de falla: re-aplicar el archivo aborta con `42710 constraint already
  exists` **a la mitad**, dejando las sentencias siguientes sin aplicar y sin
  aviso — que es exactamente la situación que la 0065:40-56 documenta haber
  vivido («la migración YA ESTABA aplicada … lo único que se perdió fue el
  archivo local»).
- **8 `create table` sin `if not exists`**: `0088_chat_conversaciones.sql:18,35`,
  `0089_agente_cobranza.sql:24,45`, `0091_factura_proveedor.sql:18`,
  `0121_copiloto_historial.sql:20,36`, `0123_runner_y_campanas.sql:45`.
- **9 `create index` sin `if not exists`** (fuera de los que van precedidos de
  `drop index if exists`, que sí son idempotentes):
  `0088:32,50`, `0089:63`, `0091:47`, `0121:33,51`, `0187:12`.

**`SECURITY DEFINER` sin `search_path`** — ninguna encontrada. Extraje las
cabeceras de las 100+ `create function` del árbol: las 20 que no declaran
`search_path` en la cabecera son **definiciones superadas** por una posterior o
las arregla un `alter function … set search_path` explícito (0035, 0074, 0113,
0158:720-723, 0184, 0247). El caso `digest()` fuera del `search_path` está
cerrado en `0264:59` (`set search_path = public, extensions, pg_catalog`), y
barrí el resto del árbol buscando otras funciones de `pgcrypto`
(`digest|gen_random_bytes|crypt|hmac|pgp_sym`): solo la cadena ARCO las usa.

**RLS declarada pero no habilitada** — ninguna encontrada. Las 145 tablas
creadas tienen `enable row level security`, contando las que lo reciben dentro
de bucles `foreach t in array[...]` (0001:112, 0047:162).

## Lo que revisé y está bien

- **FK compuestas `(col, tenant_id)`**: reconstruí la lista del catálogo desde el
  texto y las 36 relaciones entre tablas con `tenant_id NOT NULL` están cubiertas
  por 0028 (4), 0073 (1) y 0145 (33 en su lista de tuplas). El único candidato
  que mi barrido marcó y no está cubierto —`foto_pendiente.viaje_id`— es de una
  tabla que la 0041:18 dropeó. La 0271 extendió el patrón a tres columnas
  (`user_id, tenant_id, rol`) para MCP, y su razonamiento sobre `tenant_id`
  nullable en `app_user` es correcto: las tres columnas del lado que referencia
  son `NOT NULL` (0260:78-81, 0260:126-129), así que MATCH SIMPLE sí evalúa.
- **Tipos**: cero columnas de dinero en `float`/`double precision` —los únicos
  `double precision` del esquema son lat/lng/velocidad/odómetro (0047:133,
  0050:48-52), donde es correcto. Cero `timestamp without time zone`. Cero
  columnas de dinero en `numeric` sin escala. `numeric(12,2)` uniforme,
  `numeric(12,3)` para litros, `numeric(4,3)` para `ocr_confianza` con su rango
  `[0,1]` (0146:72).
- **Unicidades que el código asume**: crucé los 50 `onConflict` de `src/` contra
  los índices y constraints del esquema. Los 50 tienen su unique o su PK
  correspondiente. Incluye los que valen dinero: `uq_gasto_cfdi_uuid`
  (tenant, uuid, orden — 0065:69), `uq_gasto_wa_message_id` (0164),
  `liquidacion_viaje_uidx` (0005), `uq_cfdi_pago_docto` (0199),
  `pago_recibido_propuesta_unica` (0237) y `factura_folio_unico`, que la 0166
  reemplaza correctamente **dropeando los dos viejos antes** — el
  modo de falla de un `create unique index if not exists` sobre un nombre ya
  ocupado no ocurre aquí (0166:179-180).
- **Coherencia esquema ↔ `src/types/likida.ts`**: los 40 campos de `Gasto`, los
  16 de `Liquidacion`, los 9 de `Viaje` y los 6 de `Operador` tienen columna, y
  en ninguno el tipo de TypeScript es MÁS estricto que la columna (la dirección
  peligrosa). `Viaje.operadorId?` es más laxo que `operador_id not null`, que
  falla cerrado.
- **Dominios sincronizados con el catálogo en código** (los dupliqué y diffeé):
  `interruptor_id_dominio` (0250) = `INTERRUPTORES` (`interruptores.ts`), 60 y 60,
  cero de diferencia; `cron_latido_id_dominio` (0248) = los 11 `registrarLatido`
  reales, con `salud.test.ts:112-118` leyendo el ÚLTIMO `add constraint` del
  directorio para que no se separen; `gasto_concepto_dominio` = `ConceptoGasto`;
  `config_agentes_valida` (0159:403) = `ParcialEstrategia`
  (`estrategia.ts:51-54`). `agente_corrida.agente` dejó de ser un CHECK enumerado
  y es FK a `agente_definicion` desde 0116:85 — la forma correcta.
- **`tenant.config`**: el CHECK `config_tenant_valida(config - 'agentes')` +
  `tenant_config_agentes_valida` (0159:493 y siguientes) cubren el jsonb entero;
  no queda ninguna llave sin validador.
- **Lo que NO es hallazgo aunque lo parezca**: `gasto.ocr_raw`, `politica_gasto`,
  `wa_mensaje_procesado` sin `tenant_id`, y las tablas vacías. Y una nota para el
  orquestador, no un hallazgo: la línea de `MAPA.md:108-109` y `CLAUDE.md` sobre
  `app_user.rol` está desfasada — el dominio vivo es el de `0105:52`
  (`superadmin, flota_admin, contador, encargado, vendedor`): `operador` salió en
  la 0086 y `vendedor` entró en la 0105.

## Lo que NO alcancé a revisar

- **No hay base de datos aquí**, así que todo esto es lectura de SQL como texto.
  Los 200+ bloques de `supabase/verificaciones.sql` —que son la red real de este
  rubro, con su falsificación documentada— **no se corrieron**. En particular el
  bloque 112, que barre el catálogo buscando FK sin compuesta, y el 217, que
  demuestra la policy del hilo de soporte contra Postgres real. Mi barrido
  estático los reproduce sobre el texto, no sobre el catálogo aplicado: si alguna
  migración se aplicó a medias en producción, desde aquí no se ve.
- **El orden REAL de aplicación** (`supabase_migrations.schema_migrations`) no es
  legible sin la base. El incidente 0218/0219 que la 0234 documenta —orden de
  aplicación distinto del orden numérico— no se puede verificar desde el repo.
- **`storage.objects` y sus policies** (buckets `liquidaciones`, `comprobantes`,
  `agente-insumos`): solo miré las migraciones que los crean, no la postura de
  cada bucket.
- **Los ~120 CHECK de coherencia** que no son de dominio (`*_coherente`,
  `*_cuadra`, `*_requiere_*`): revisé los del camino del dinero
  (`liquidacion_diferencia_cuadra`, `factura_total_cuadra`, `gasto_bloqueo_coherente`,
  `agente_insumo_contenido_segun_tipo`) y no los 100 restantes uno por uno.
- **`liquidacion.diferencias` (jsonb)**: solo tiene
  `liquidacion_diferencias_arreglo` (0158:580, «es un arreglo»). Las 40 variantes
  de `TipoDiferencia` viven únicamente en TypeScript. No lo reporto como hallazgo
  porque un dominio dentro de jsonb es una decisión de diseño, no un olvido, y
  no encontré consumidor que rompa con un `tipo` desconocido — pero no lo agoté.
