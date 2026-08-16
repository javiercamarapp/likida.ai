# Modelo de datos y esquema — auditoría 4

**Nota: 6/10** (antes 6.5). Razón del movimiento: **deuda que cobró factura**.
Las nueve migraciones nuevas son, otra vez, de lo mejor del repo —la 0116 cambia
un CHECK enumerado por una FK contra catálogo, la 0117 pone el candado de
"enviar solo aprobado" en la BASE y no en la UI, la 0120 exige actor en los dos
sentidos, y las seis funciones nuevas van INVOKER con `revoke` y con bloque de
verificación propio (89-94)—. Baja medio punto porque **el merge de esta ronda
dejó dos migraciones peleándose el número 0112**, y esa colisión (a) impide
aplicar 0113→0120 por el camino documentado y (b) revierte en silencio el
arreglo de la 0113; y porque **los nueve hallazgos del pase 3 siguen abiertos
uno por uno**, incluidos los dos del camino del dinero.

El riesgo mayor del rubro hoy: **el número de una migración es su identidad, y
hay dos que se llaman 0112** — el árbol de hoy no se puede aplicar de corrido, y
el orden en que CI las aplica (nombre de archivo, base virgen) no es el orden en
que producción las va a recibir.

## Hallazgos

### [CRÍTICO] Dos migraciones reclaman el número 0112: el árbol no se puede aplicar por el camino documentado, y la que llega tarde revierte a la 0113

`supabase/migrations/0112_agregados_rpc.sql:1` ·
`supabase/migrations/0112_config_llave_agentes.sql:31-34` ·
`supabase/migrations/0113_search_path_regresado.sql:27` ·
`.github/workflows/ci-postgres.yml:129-131` · `scripts/seed.sh:25`

`0112_config_llave_agentes.sql` nació en `285d5e3` (esta rama, el arreglo de
DAT-C1) y `0112_agregados_rpc.sql` en `296224d` (master, el mismo día). El merge
`f72d7ab` los juntó sin conflicto —son archivos distintos— y quedaron los dos.
`ls supabase/migrations/*.sql | cut -d_ -f1 | uniq -d` devuelve exactamente un
número: `0112`.

**Escenario 1 — el `push` aborta.** El camino documentado para el esquema es
Supabase MCP / `supabase db push` (`scripts/seed.sh:20-22`), y ahí la identidad
de una migración es el prefijo numérico: es lo que se guarda en
`supabase_migrations.schema_migrations.version`, que tiene PK sobre esa columna.
Un `npx supabase db push` sobre una base que aún no trae la 0112 aplica
`0112_agregados_rpc.sql`, inserta `version='0112'`, aplica
`0112_config_llave_agentes.sql` y **rebota con 23505 al insertar `'0112'` otra
vez**. Todo lo que sigue —0113, 0114, 0115, 0116, 0117, 0118, 0119, 0120— no
llega nunca. Mientras tanto `src/` ya llama a `cola_aprobacion`
(`agentes/cola.ts:51`), `agente_definicion` (`agentes/definiciones.ts:120`),
`wa_evento_pendiente` (`wa_pendientes.ts:41`) y
`liquidacion.primera_descarga_en` (`pmf.ts:113`): `/admin/aprobaciones` lanza,
la ficha de PMF de cada flota lanza, y el apagado durable —el P1 que la 0119
vino a cerrar— vuelve a perder la foto del chofer, ahora gritando en un log que
nadie mira.

**Escenario 2 — la 0113 se deshace sola, y es el más probable.** El orden real
no es el mismo en los dos lados. En CI (`ci-postgres.yml:129`) el bucle es
`for f in supabase/migrations/*.sql`, orden **de nombre de archivo**:
`0112_agregados_rpc` → `0112_config_llave_agentes` → `0113`, y como la 0113 es
un `alter function … set search_path` que va al final, el resultado queda bien y
**el job sale verde**. En producción el orden fue **cronológico**: 0113 se
aplicó el 15-ago (`11329e3`, venía de master) y `0112_config_llave_agentes` no
se ha aplicado todavía (vive solo en esta rama). El día que se aplique, su
`CREATE OR REPLACE FUNCTION public.config_tenant_valida` (líneas 31-34) entra
**sin repetir `SET search_path`** — que es, literalmente, el olvido que la 0113
documenta en su encabezado como "la lección para la próxima vez que alguien
toque `config_tenant_valida` con `CREATE OR REPLACE`" (0113:21-24). El WARN
`function_search_path_mutable` que la 0113 cerró vuelve a abrirse, y ninguna
compuerta lo puede ver: CI aplica en un orden en el que el error no ocurre.

Consecuencia: el arreglo del único CRÍTICO que el rubro cerró el pase pasado
(`agentes` en la lista blanca de `tenant.config`) no tiene forma de llegar a
producción sin romper algo, y el repo perdió la propiedad de que "el número dice
en qué orden va". `src/lib/likida/config_llaves_db.test.ts:36-45` sigue en verde
porque elige la última migración con `llaves_ok` **ordenando por nombre de
archivo** — el mismo criterio que CI, no el de producción.

Causa raíz probable: dos ramas numeraron la siguiente migración a la vez y nada
—ni una prueba, ni el CI de Postgres, ni el merge— comprueba que el prefijo sea
único.

### [ALTO] La cadencia que la 0118 existe para imponer vive entera en la aplicación, y su fuente de verdad se escribe best-effort DESPUÉS del envío

`supabase/migrations/0118_prospecto_contacto.sql:16-45` ·
`src/lib/likida/agentes/cola.ts:322-340` (la guardia) ·
`cola.ts:302-309` (la compensación) · `cola.ts:367-373` (el insert que la
guardia lee) · `supabase/migrations/0120_cola_envio_y_actor.sql:21-24`

`prospecto_contacto` no tiene **ni un solo índice único** — solo
`prospecto_contacto_historial_idx (prospecto_id, ocurrio_en)`, no único
(0118:44-45) — y `cola_aprobacion` no tiene nada que impida dos piezas enviadas
al mismo prospecto el mismo día. La regla que el encabezado de la 0118 declara
("un lead marcado contactado no se vuelve a tocar sin pasar primero por el
historial de contactos"; "el censo son 828 leads FINITOS y un duplicado quema un
lead que no se repone") es un `select … gte('ocurrio_en', hace48h) … limit(1)`
en `cola.ts:325-331`, seguido de un envío y de un insert que, si falla, **solo
se loguea** (`cola.ts:372`).

Escenario, con valores: pieza `P1` — correo frío a Transportes GAL, prospecto
`gal`. Javier aprieta "Enviar". El claim estampa
`enviado_en = '2026-08-16T17:00:00Z'` (cola.ts:290-293), la guardia lee cero
contactos en 48 h, sale el correo por Resend. Resend lo **acepta** (202) pero la
respuesta se pierde en un timeout de red, así que `enviarCorreo` reporta
`{ok:false}` y la compensación (`cola.ts:302-309`) hace
`update cola_aprobacion set enviado_en = null, envio_error = 'Resend no aceptó
el envío (red: …)' where id = 'P1'`. El insert en `prospecto_contacto` **nunca
corrió** (va después, línea 367). La pieza reaparece en `aprobadasSinEnviar()`
(cola.ts:136-145) con su error a la vista; Javier reintenta; la guardia vuelve a
leer cero contactos y **sale el segundo correo al mismo lead**. La base no
rebota nada: no hay unique sobre `(prospecto_id, direccion, día)`, no hay
constraint de exclusión, y no hay CHECK que ate `provider_message_id` (que en
ese momento sigue en NULL) o `envio_error` a `enviado_en` — la 0120:26-27
declara la incoherencia inversa ("NULL con `enviado_en` puesto") y deja ésta sin
nombrar.

Consecuencia: uno de los 828 leads finitos recibe dos correos fríos idénticos en
minutos. Es exactamente el daño que la migración dice venir a evitar, y el único
guardián es una lectura de la aplicación sobre una tabla que solo se escribe
cuando el envío salió bien.

(Honestidad sobre el alcance: hoy **nada llama a `encolarPieza`** —grepeado,
solo la prueba— así que la cola no tiene productor y el daño es latente. Se
reporta como ALTO porque el productor es la pieza siguiente del plan y la
restricción se agrega hoy o no se agrega.)

### [MEDIO] `wa_evento_pendiente` guarda el teléfono y el texto del chofer para siempre, sin flota y fuera de toda purga

`supabase/migrations/0119_wa_evento_pendiente.sql:22-37` ·
`supabase/migrations/0104_retencion_operativa.sql:129-135` ·
`src/lib/likida/wa_pendientes.ts:39,41`

La tabla guarda `evento jsonb not null` = el `InboundMessage` completo
(`processor.ts:76-84`: `from` en E.164, `text`/caption, `mediaId`), **no tiene
`tenant_id`** y **no aparece en `mantenimiento_de_datos`**, que sí purga
`wa_mensaje_procesado`, `api_idempotencia` (7 d), `correo_procesado` (90 d),
`agente_corrida` (180 d), `wa_conversacion` (180 d) y `codigo_pendiente`
(180 d). El encabezado de la 0119 lo declara: "jamás se borra sola: borrar la
evidencia de un mensaje que no se pudo procesar es el mismo error que esta tabla
vino a matar" — pero ese argumento cubre **las filas fallidas**, y la regla se
aplicó también a las que ya tienen `procesado_en`.

Escenario, con valores: el interruptor `global` queda apagado 4 horas por un
incidente. Entran 900 mensajes; cada uno deja una fila con
`{"from":"+5218112345678","type":"image","text":"caseta tepotzotlán"}`. El cron
las drena y las sella `procesado_en = now()`. Las 900 filas quedan indefinidas:
el drenado solo mira `procesado_en is null` (0119:45-47) y ninguna purga las
alcanza. Si el chofer de la flota A ejerce cancelación por
`solicitud_arco`, no hay columna por la que filtrar sus filas — es la misma
trampa que CLAUDE.md ya tiene anotada para `wa_mensaje_procesado`, repetida en
una tabla que además conserva el cuerpo del mensaje, no solo su id.

Causa raíz probable: la retención se decidió por el caso de la carta muerta y no
se separó del caso del mensaje ya procesado.

### [MEDIO] Tres de las nueve migraciones nuevas no se pueden volver a aplicar — REINCIDENTE (era MEDIO en el pase 3)

`supabase/migrations/0115_disparo_whatsapp.sql:17-21` ·
`supabase/migrations/0116_agente_definicion.sql:82-86` ·
`supabase/migrations/0120_cola_envio_y_actor.sql:33-35`

- 0115: `alter table … drop constraint agente_corrida_disparo_dominio` sin
  `if exists`, y el `add constraint` que sigue sin su `drop … if exists`.
- 0116: idéntico con `agente_corrida_agente_dominio`, y
  `add constraint agente_corrida_agente_fk` sin drop previo.
- 0120: `add constraint cola_resolucion_con_actor` sin drop previo.

Escenario: alguien reaplica `supabase/migrations/*` sobre una base que ya trae
parte —un entorno de pruebas, o un `push` que se cortó a la mitad, que es
exactamente lo que el CRÍTICO de arriba provoca—. Aborta en 0115 con
`42704: constraint "agente_corrida_disparo_dominio" of relation
"agente_corrida" does not exist`; saltándola, en 0116 con el mismo 42704 sobre
`agente_corrida_agente_dominio`; y si se salvan las dos, en 0120 con
`42710: constraint "cola_resolucion_con_actor" for relation "cola_aprobacion"
already exists`.

Las otras siete (0112 ×2, 0113, 0114, 0117, 0118, 0119) SÍ son idempotentes
—`create table if not exists`, `add column if not exists`,
`create index if not exists`, `create or replace function`, `on conflict do
nothing`—: el patrón está en la casa y se omitió en tres. El pase 3 reportó lo
mismo sobre otras ocho migraciones y sigue sin compuerta que corra la carpeta
dos veces.

### [MEDIO] `liquidacion.primera_descarga_rol` no tiene dominio ni coherencia con la fecha, y la señal de PMF se calcula restándole

`supabase/migrations/0114_descarga_de_liquidacion.sql:31-34` ·
`0114:80-85` (el RPC) · `src/lib/likida/pmf.ts:114-117,140-142`

Las tres columnas entran sin una sola restricción: `primera_descarga_rol text`
sin CHECK contra el dominio de `app_user.rol`, `descargas integer not null
default 0` sin `>= 0`, y ninguna equivalencia
`(primera_descarga_en is null) = (primera_descarga_rol is null)`. `pmf.ts`
cuenta `porCliente` con `.neq('primera_descarga_rol','superadmin')` (línea 117)
y deriva `soloDemo = descargadas − porCliente` (línea 142) apoyado en un
comentario que dice: *"el RPC de la 0114 escribe fecha y rol juntos (coalesce),
así que descargada sin rol no existe"* — un invariante que la base no impone y
que el propio RPC no garantiza, porque `p_rol text` admite NULL.

Escenario, con valores: cualquier camino que no sea la ruta del panel —un
backfill de las descargas del piloto, la consola de Supabase, o el segundo
llamador que se escriba— hace
`select registrar_descarga_liquidacion('<liq>','<tenant>', null);`. La fila
queda con `primera_descarga_en = now()` y `primera_descarga_rol = null`. En
`/admin/flotas`: `descargadas = 1`, `porCliente = 0` (`NULL <> 'superadmin'` es
NULL, no true) y `soloDemo = 1`. La descarga real de un contador se reporta como
un demo de Javier — y al revés, cualquier rol futuro que no sea exactamente
`'superadmin'` (`'api'`, `''`) se reporta como señal de PMF.

Consecuencia: la única cifra con la que Javier va a decidir si el producto tiene
PMF es una resta sobre una columna de texto libre. Hoy la ruta está sana
(`api/export/pdf/[id]/route.ts:69-77` bloquea `operador` y `encargado`, y
`resolverTenantApi` solo resuelve por sesión: verificado y refutado como camino
vivo) — el hallazgo es que nada de eso está en la base.

### [MEDIO] `agente_definicion.disparador` admite `webhook` y `agente_corrida.disparo` no: un agente dado de alta hoy no puede registrar corridas, y nadie se entera

`supabase/migrations/0116_agente_definicion.sql:37-39` ·
`supabase/migrations/0115_disparo_whatsapp.sql:19-21` ·
`src/lib/likida/agentes/definiciones.ts:35` ·
`src/lib/likida/agentes/corridas.ts:30,68`

La 0116 declara que su dominio "espeja `agente_corrida.disparo` (0115) más
`'webhook'`" — y ahí está el problema: los dos dominios deberían ser el mismo
vocabulario y difieren en un valor. `agente_definicion_disparador_dominio`
acepta `('cron','manual','correo','whatsapp','webhook')`;
`agente_corrida_disparo_dominio` acepta los cuatro primeros.

Escenario, con valores: el superadmin abre `/admin/agentes` (que existe y llama
a `darDeAltaAgente`, `admin/agentes/page.tsx:23`), da de alta
`{id:'wa_router', nombre:'Router de WhatsApp', departamento:'ingenieria',
disparador:'webhook'}` — la lista `DISPARADORES` de `definiciones.ts:35` ofrece
`webhook` en el formulario y `validarDefinicion` lo acepta. El alta entra. El
día que ese agente registre su primera corrida,
`insert into agente_corrida (…, disparo) values (…,'webhook')` rebota con
`23514 agente_corrida_disparo_dominio` — y `registrarCorrida` **nunca lanza**:
lee el error y hace `logger.error` (corridas.ts:68). La ficha de ese agente
queda vacía para siempre, con el mismo aspecto que "todavía no ha corrido".

Causa raíz probable: la 0116 amplió un vocabulario en un lado del par sin tocar
el otro, sin nada que cruce los dos CHECKs.

### [BAJO] La cola impone la FORMA de cada estado pero no las TRANSICIONES

`supabase/migrations/0117_cola_aprobacion.sql:66-72` ·
`supabase/migrations/0120_cola_envio_y_actor.sql:33-35` ·
`src/lib/likida/agentes/cola.ts:9-14,187,214,232`

Los cinco CHECKs de la 0117/0120 son correctos y cubren cada fila por separado
(enviado ⇒ aprobado, rechazo ⇒ motivo, resuelto ⟺ fecha, resuelto ⟺ actor,
edición ⇒ aprobada). Lo que no puede expresar un CHECK, y aquí no hay trigger,
son las transiciones: la aplicación las ancla a mano (`\.eq('estado',
'pendiente')` en `aprobarPieza`/`rechazarPieza`, `.is('enviado_en', null)` en
`marcarEnviada`/`enviarPiezaPorCorreo`) y ahí termina la garantía.

Escenario, con valores:
`update cola_aprobacion set estado='pendiente', resuelto_en=null,
resuelto_por_email=null, cuerpo_final=null where id='<P1>' and enviado_en is
null;` — pasa los cinco CHECKs y devuelve a la bandeja de pendientes una pieza
que ya se aprobó, con su `provider_message_id` intacto. La bandeja la vuelve a
ofrecer para aprobar y enviar.

Consecuencia hoy: baja (deny-all, solo `service_role`, y la aplicación no lo
hace). Se anota porque el encabezado de la 0117 vende el candado como "de BASE,
no de UI", y eso es cierto para el envío y falso para el resto del recorrido.

### [BAJO] `agente_definicion.actualizado_en` nace muerta

`supabase/migrations/0116_agente_definicion.sql:56` ·
`src/lib/likida/agentes/definiciones.ts:121,145-149`

`actualizado_en timestamptz not null default now()` sin trigger que la mueva
(la 0116 no engancha ninguno) y sin escritor que la toque: `darDeAltaAgente`
solo inserta y no hay función de update en el módulo. `listarAgentes` ni la
selecciona. Va a quedar idéntica a `creado_en` para siempre; el día que una
pantalla la pinte como "actualizado", será un rótulo que no es verdad.

## Los nueve hallazgos del pase 3, verificados uno por uno hoy

Ninguna migración de esta ronda tocó ninguno. Todos **siguen abiertos**, con la
ruta reverificada en el árbol de hoy:

| Pase 3 | Estado | Verificado en |
|---|---|---|
| DAT-C1 `tenant.config.agentes` | **Arreglado en la rama, sin camino a producción** — ver el CRÍTICO | `0112_config_llave_agentes.sql:31-34` |
| ALTO — tope de política en `0` prohibido por la base | ABIERTO | `0112_config_llave_agentes.sql:131` (el `> 0` viajó intacto de la 0026 → 0082 → 0083 → 0085 → 0112) |
| ALTO — `pago_recibido` sin FK compuesta con `tenant_id` | ABIERTO | `0049_cobranza_factura_emitida_pago.sql:96` |
| ALTO — `pago_recibido` sin llave natural (doble abono) | ABIERTO | `0049:93-109`, sigue sin índice único |
| ALTO — `viaje.operador_id` NOT NULL vs "Por asignar" | ABIERTO | `0001_init.sql:49` (`not null`, ningún `alter` posterior) × `operacion.ts:127` (`.is('operador_id', null)`, intacto) |
| MEDIO — `factura_proveedor` acepta negativos | ABIERTO | `0091_factura_proveedor.sql:30-34`, sin CHECK de signo |
| MEDIO — `desglose_peaje_linea.monto` acepta negativos | ABIERTO | `0106_desglose_peaje.sql:68` |
| MEDIO — 8 migraciones no re-aplicables | ABIERTO **y creció a 11** — ver el MEDIO de arriba | 0089/0090/0091/0092/0099/0100/0107/0108/0109 + 0115/0116/0120 |
| BAJO — `incidencia.monto_estimado` sin precisión ni signo | ABIERTO | `0107_talacha_autorizada.sql:39` |
| BAJO — dos FKs a `tenant` sin `on delete` | ABIERTO | `0089:46`, `0105:80` |

## Lo que revisé y está bien

- **Colisión de número: SÍ la hay, y es una sola.**
  `ls supabase/migrations/*.sql | cut -d_ -f1 | sort | uniq -d` → `0112`.
  **118 archivos**, numeración 0001→**0120** (faltan 0067-0069, que el bloque 81
  de `verificaciones.sql` documenta como nunca existidas). **El número más alto
  es 0120** (`0120_cola_envio_y_actor.sql`).
- **La pregunta del brief sobre la 0112: el RPC SÍ filtra por tenant y NO es
  `SECURITY DEFINER`.** Las cuatro funciones llevan `p_tenant uuid` **sin
  default** (`0112_agregados_rpc.sql:142,208-213,308-311,361-364`) — olvidarlo es
  un 404 de PostgREST por firma no encontrada, no la base de todas las flotas —,
  las cuatro son INVOKER (el default, deliberado y argumentado en 0112:67-77:
  con `service_role` un DEFINER no daría un permiso más y sí quitaría la red de
  RLS), las cuatro llevan `set search_path = public, pg_catalog` y las cuatro
  cierran con `revoke all … from public, anon, authenticated` + `grant execute …
  to service_role` (0112:166-167, 272-273, 346-347, 385-386). El bloque 89 de
  `verificaciones.sql` lo vigila con Postgres real.
- **La 0116 es la mejor decisión de esquema de la ronda.** Cambiar
  `agente_corrida_agente_dominio` (CHECK enumerado que ya se había ampliado dos
  veces) por una FK contra `agente_definicion(id)` mueve la garantía sin
  perderla, y el orden está bien pensado: la siembra va ANTES del `alter`
  (0116:79-81) porque con la tabla vacía toda corrida existente violaría la
  referencia. `agente_definicion_id_forma` (`^[a-z0-9_]{2,40}$`), los tres
  dominios enumerados y `presupuesto_dia_usd > 0 or null` están completos.
- **La 0117 y la 0120, en conjunto, cubren cada fila.** `cola_enviado_solo_
  aprobado`, `cola_rechazo_con_motivo` (con `length(trim(…)) > 0`, no solo `is
  not null`), `cola_resolucion_coherente` y `cola_resolucion_con_actor` escritas
  como equivalencias `(estado='pendiente') = (… is null)` — los dos sentidos,
  que es la lección que la 0109 dejó escrita y aquí se aplicó sin que nadie lo
  pidiera. `cola_tipo_forma` como regex en vez de CHECK enumerado, con el
  argumento de la 0116 aplicado desde el día uno (0117:32-37).
- **Dominios de TypeScript vs la base, en todo lo nuevo: ninguno más estricto
  que su columna.** `PrioridadPieza` (2) = `cola_prioridad_dominio`;
  `PiezaEnCola.estado` (3) = `cola_estado_dominio`; el union de `canal` en
  `marcarEnviada` (cola.ts:229, 6 valores) = `prospecto_contacto_canal_dominio`
  (0118:20-21); `Departamento` (7) = `agente_definicion_departamento_dominio`;
  `EstadoAgente` (4) = `agente_definicion_estado_dominio`; `DISPARADORES` (5) =
  `agente_definicion_disparador_dominio`. La única divergencia es la de
  `disparador` vs `disparo`, reportada arriba, y va en la dirección contraria
  (la base es más permisiva de un lado y más estricta del otro).
- **`verificaciones.sql`, bloques 79 y 83 (modificados esta ronda):** los dos
  aprendieron la mudanza de la 0116 correctamente —
  `exception when check_violation or foreign_key_violation` (líneas 3781-3785 y
  3935-3937), aceptando el error nuevo **junto** al viejo en vez de
  reemplazarlo: el bloque sigue siendo verdad antes y después de aplicar la
  0116. Y remiten al bloque 91, que prueba la mudanza completa
  (`vivos_sembrados=7 fk_rebota=t nuevo_entra=t`).
- **Cobertura de verificación de lo nuevo:** hay bloque propio para 0112 (89),
  0114 (90), 0116 (91), 0117 (92), 0119 (93) y 0120 (94), todos con salida real
  citada contra producción del 16-ago. **No hay bloque para 0113, 0115 ni
  0118** — y la 0118 es justamente la tabla del hallazgo ALTO.
- **La 0119 acierta en el dedup del camino normal.** `id text primary key` = el
  wamid, y `guardarEventosPendientes` trata el `23505` como "ya guardado"
  (`wa_pendientes.ts:45`), que es correcto para una reentrega de Meta.
  `reclamarPendiente` (líneas 87-98) es un UPDATE anclado a
  `(id, intentos, procesado_en is null)`: dos corridas del cron solapadas no
  procesan el mismo evento. **Refutado como hallazgo** el caso sin wamid
  (`sin-wamid:${from}:${Date.now()}`, línea 39): aunque ahí ni la PK ni
  `claimMessage` deduplican (`processor.ts:369` salta el claim sin wamid), el
  efecto con dinero sí tiene candado de base — `uq_gasto_img_hash` es un índice
  ÚNICO real (`0015`/`0027`) y la liquidación va con `on conflict (viaje_id)`.
- **RLS de las cuatro tablas nuevas:** `agente_definicion` (0116:66),
  `cola_aprobacion` (0117:79), `prospecto_contacto` (0118:41) y
  `wa_evento_pendiente` (0119:42) tienen `enable row level security` con CERO
  policies — deny-all deliberado y con el criterio citado. Ninguna tabla nueva
  quedó sin RLS.
- **La 0114 resuelve bien la carrera que sí importa:** `coalesce` dentro del
  propio UPDATE (0114:80-85), sin lectura previa — dos descargas simultáneas no
  se pisan la primera fecha —, y el filtro `tenant_id = p_tenant` viaja DENTRO
  de la función, no confiado al llamador.
- **La 0115 y la 0116 no dejaron corridas huérfanas:** los 7 valores que
  `AgenteConCorridas` (corridas.ts:23) permite están los 7 sembrados y `vivo`
  en 0116:69-77, y los 16 llamadores de `registrarCorrida` que grepeé usan solo
  esos 7 literales.

## Lo que NO alcancé a revisar

- **`guardar_liquidacion_tx`** (0013/0021/0022) — tercera ronda seguida sin
  abrir su cuerpo. Sigue siendo la única escritura transaccional del esquema y
  la que más invariantes concentra.
- **Los triggers** (0036, `intake_delta`): no leí sus definiciones; la
  afirmación de que `agente_definicion.actualizado_en` no tiene trigger sale de
  que la 0116 no crea ninguno, no de haber enumerado los triggers vivos.
- **`bitacora_auditoria` (0053)** y su promesa de append-only — sigue sin
  verificar que no exista grant de `update`/`delete`. Ahora la escriben dos
  módulos nuevos (`cola.ts:254`, `definiciones.ts:156`).
- **`supabase/pruebas-aislamiento/capa1_auditoria_estatica.sql`** — no comprobé
  si el escaneo schema-driven ya cubre las cuatro tablas nuevas.
- **Las tablas del SaaS** (`plan`, `suscripcion`, `factura_saas`,
  `envio_mensaje`, `campania`, `solicitud_arco`, `invitacion`) y las policies de
  `storage`: igual que el pase 3, sin revisar.
- **La base viva.** No hay instancia accesible: todo sale de leer el SQL contra
  el código. En particular, **no pude confirmar qué migraciones están de verdad
  aplicadas en producción** — que es precisamente lo que el CRÍTICO vuelve
  imposible de deducir del árbol.
