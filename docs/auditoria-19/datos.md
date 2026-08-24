# Modelo de datos y esquema — auditoría 19

**Nota: 6/10** (antes 7). Razón del movimiento: **se atacó y subió, y la deuda
nueva cobró más de lo que se ganó**. Lo que subió: la compuerta que llevaba 24 h
en rojo hoy está **verde** —`CI Postgres` run #381 sobre `master@8b43121`,
`"conclusion":"success"`, y reproducido aquí: **179 migraciones aplican limpias
sobre Postgres 16 virgen y la batería entera pasa (135 bloques · 114 ok · 0
fallos)**—, la 0182 cerró el ALTO medido del score ICP, la 0170 cerró la única
DEFINER abierta a `anon`, y **trece de las diecisiete migraciones nuevas traen su
bloque de verificación** (bloques 140–151) con exención escrita para las otras
cuatro. Eso vale el +1 que la c4 dejó pendiente.

Lo que lo cancela y se lleva uno más: **el delta abrió tres huecos de esquema
nuevos, y los tres son exactamente el patrón que este rubro persigue** — un
dominio ensanchado en la base sin tocar ninguna de las dos máquinas de estado de
TypeScript que lo leen (`prospecto.estado`), una llave única que ningún escritor
llena (`wa_outbox.dedupe_key`), y una columna de vínculo creada para cerrar una
promesa de la landing que **no tiene escritor en todo el repo**
(`unidad.gps_device_id`). Y los dos ALTO de dinero de la c4 —el `encargado` que
reescribe `viaje.anticipo` y la factura cancelada con abonos vivos— siguen
idénticos, reproducidos hoy con los mismos valores.

**El riesgo mayor del rubro, hoy:** la base ya acepta un estado que el producto
no sabe manejar. Un `BOOKING_CREATED` de Cal.com escribe
`prospecto.estado = 'appointment'`, un valor que el CHECK de la 0181 admite y
que `ESTADOS_PROSPECTO` no conoce: la consola de vendedores deja de tener un
número en «Prospectos en el pipeline» y ese prospecto ya no se puede mover
desde ninguna pantalla.

---

## Cómo se verificó

**Sí levanté Postgres.** Hay binarios de Postgres 16 en la caja
(`/usr/lib/postgresql/16/bin`). Como otro auditor ya tenía un clúster corriendo
en `/var/tmp/pgaudit`, levanté el mío aparte (`/var/tmp/pgdatos`, puerto 5466) y
reproduje `ci-postgres.yml` paso por paso:

```
initdb → PostgreSQL 16.13
psql -f supabase/pruebas-aislamiento/andamio_ci.sql            → OK
179 migraciones, una por una, ON_ERROR_STOP=1                  → 0 fallos
node scripts/ci/correr-verificaciones.mjs capa1…               → 4 bloques · 4 ok · 0 fallos
node scripts/ci/correr-verificaciones.mjs verificaciones.sql   → 135 bloques · 114 ok · 0 fallos · 19 sin-calificar · 2 reportes
```

Todo lo que va marcado **(corrido)** salió de ahí. No es Supabase: PostgREST, el
`storage` real y el `BYPASSRLS` de `service_role` están simulados por el andamio,
y producción corre 17.x.

**El hueco 0179 es real y no es el único.** Faltan `0067`, `0068`, `0069`,
`0156` y `0179`. Ninguna migración, prueba ni script referencia `0179`
(`grep -rn "0179"` sobre `*.ts`/`*.sql`/`*.md` → cero líneas), y
`migraciones_verificadas.test.ts` enumera por `readdirSync`, no por contigüidad.
Supabase aplica por nombre de archivo, así que el hueco no rompe nada: es un
número que se saltó al numerar contra `origin/master` (la propia 0172 lo dice en
su cabecera, `0172:9-10`). **No es hallazgo.**

**Reversibilidad: cero de diecisiete.** No hay convención `down` en este repo —
`supabase/` solo tiene `migrations/`, `pruebas-aislamiento/`, `seed.sql` y
`verificaciones.sql`, y ninguna de las 179 migraciones trae bloque de reversión.
Es una decisión de siempre, no del delta, así que lo cuento como contexto y no
como hallazgo nuevo; pero **la 0182 es la primera que hace un
`drop column … / add column` sobre una columna GENERADA de una tabla con datos
(`prospecto`, 33k filas)**, y ese `drop` se lleva por delante cualquier índice o
vista que dependiera de ella sin dejar cómo volver.

---

## Verificación de los abiertos de la c4

| Hallazgo (c4) | Estado hoy | Evidencia |
|---|---|---|
| **CRÍTICO** — `ci-postgres` en rojo, seis bloques abortan antes de su `RAISE` | **CERRADO** (corrido + API de GitHub). Run #381 sobre `master@8b43121` = `success`; aquí, 135 bloques y **0 fallos**. Los bloques 122/123/125/134/137 pasan | `mcp github actions_list`, salida del runner |
| **ALTO** — 0167 mete una DEFINER ejecutable por `anon` sin `pg_temp` | **CERRADO a medias.** La 0170 revoca (`0170:20-22`) y `capa1` pasa 4/4. Pero `prospecto_toque_marca_prospecto` **sigue con `search_path=public` sin `pg_temp`**, y el delta añadió una DEFINER más igual — ver el BAJO | catálogo: 5 DEFINER sin `pg_temp` |
| **ALTO** — el `encargado` lee y escribe `viaje.anticipo` por PostgREST | **REINCIDENTE, sin cambio.** Las tres policies vivas de `viaje` siguen siendo `tenant_data_select/insert/update` y ninguna nombra `ve_finanzas()` | `pg_policies` (corrido) |
| **ALTO** — una factura cancelada puede conservar abonos | **REINCIDENTE, reproducido hoy con los mismos valores** | ver hallazgo |
| **ALTO** — `similitud_icp_pct` compara SCIAN de 3 y la columna guarda 6 | **CERRADO.** La 0182 recreó la columna con `left(regexp_replace(…),3)`; medido: `scian='484121'` → **100** (antes 60) | `0182:5-12`, catálogo (corrido) |
| **ALTO** — `scripts/demo-5k.sql` no puede correr | **NO REVISADO ESTA RONDA** (ver «lo que no alcancé») |
| **MEDIO** — la exención de 0140/0142/0143 dice que el score «se prueba en TS» | **REINCIDENTE.** Las cuatro entradas siguen literales en `EXENTAS` con la razón intacta, aunque la 0182 acaba de demostrar que una de las tres estaba mal cuatro días | `migraciones_verificadas.test.ts:87-90` |
| **MEDIO** — el runner degrada fallos reales a «SIN CALIFICAR» | **REINCIDENTE Y AGRAVADO:** ahora los dos están en una **lista de exentos con razón escrita** | ver hallazgo |
| **MEDIO** — `necesidad_pct` no pasa de 75 y el filtro ofrece ≥85 | **REINCIDENTE, medido de nuevo.** `necesidad_pct=75` es el techo real; `cerebro.tsx:93` sigue tipando `0\|40\|65\|85` | corrido |
| **MEDIO** — `clock_timestamp()` en el delta del Cerebro | **REINCIDENTE.** `0167:58-64` intacto |
| **MEDIO** — `viaje` con cinco índices redundantes | **REINCIDENTE.** Ninguna de las 17 migraciones toca `viaje`; la 0183 barrió `posicion` y `wa_evento_pendiente`, no `viaje` | `0183:5-6` |
| **BAJO** — `registrar_pago_tx` con `current_date` (UTC) | **REINCIDENTE.** `0159:127` intacto |
| **BAJO** — el barrido previo de la 0164 no cubre su propio índice | **REINCIDENTE.** `0164:142-171` intacto |
| **BAJO** — cuatro reincidentes del embudo | **REINCIDENTES los cuatro.** `CRITERIO_SCORES.necesidad` (`prospectos-mapa.ts:338`) sigue diciendo «auxiliar administrativo +50» a secas; `mensaje_linkedin` sigue sin escritor y fuera de `prospecto_mensajes_coherentes`; `num_unidades` sigue sin techo |

---

## Hallazgos

### [ALTO] La 0181 ensanchó `prospecto.estado` de 6 valores a 14 sin tocar ninguna de las dos máquinas de estado de TypeScript que leen la columna: un `BOOKING_CREATED` de Cal.com deja «Prospectos en el pipeline» en **NaN** y el prospecto atorado para siempre

`supabase/migrations/0181_crm_remediacion.sql:9-12` (el CHECK nuevo, catorce
valores) · `src/lib/likida/vendedores.ts:401-402` (el comentario
*«`prospecto_estado_dominio` (0105) garantiza el dominio»* y el
`f.estado as EstadoProspecto` que se apoya en él) ·
`src/app/admin/vendedores/consola-vendedores.tsx:208` y `:239` ·
`src/app/vendedor/panel-vendedor.tsx:120` ·
`src/lib/likida/vendedores.ts:559` y `:569` ·
`src/app/api/webhook/calcom/route.ts:11-16,75-80`

**Escenario, con valores.** Un prospecto P (`empresa='TRANSPORTES MONTERREY'`,
`estado='contactado'`) agenda por Cal.com. Llega el webhook firmado:

```json
{"triggerEvent":"BOOKING_CREATED","bookingId":99887,
 "payload":{"attendees":[{"email":"contralor@transportesmty.mx"}]}}
```

`route.ts:75` hace `update prospecto set estado='appointment', cerrado_en=null`.
La base lo acepta: `'appointment'` está en el CHECK de la 0181. Y a partir de
ahí:

1. **La consola de vendedores deja de tener un número.**
   `consola-vendedores.tsx:208` hace `totales[p.estado]++` sobre el objeto que
   devuelve `conteosVacios()`, que solo tiene las **seis** llaves viejas
   (`vendedores.ts:272-274`: `{nuevo, contactado, demo, negociacion, cerrado,
   perdido}`). `totales['appointment']` es `undefined`, `undefined++` es `NaN`,
   y `:239` lo suma: `totalProspectos = NaN`. La StatCard «Prospectos en el
   pipeline» (`:271`) lo pinta tal cual —`NaN.toLocaleString('es-MX')` es la
   cadena `"NaN"`, comprobado—. Mismo `totales[p.estado]++` en
   `panel-vendedor.tsx:120`, el panel del vendedor.
2. **El prospecto desaparece del tablero.** Las columnas se arman con
   `ESTADOS_PROSPECTO.map(...)` (`:218`, `:121`): no hay columna `appointment`,
   así que P no sale en ninguna. `/admin/crecimiento:139-141` filtra igual, así
   que el rótulo «— N prospectos del censo» cuenta a P y las barras del embudo
   no.
3. **Y ya no se puede mover.** `cambiarEstadoProspecto` lee el estado actual
   (`:568`) y llama `puedeTransicionar('appointment', 'contactado')`
   (`:569`), que empieza por `esEstadoProspecto('appointment')` → `false` →
   `false`. El vendedor recibe: *«De "appointment" no se puede pasar a
   "Contactado"»*. **Ninguna transición existe desde ahí.** Sacarlo pide un
   `UPDATE` a mano en la consola de Supabase.

**Consecuencia.** El vendedor —Javier hoy— abre su consola y ve `NaN` donde iba
el tamaño de su cartera, con los prospectos que sí agendaron cita fuera de todas
las columnas y sin manera de moverlos. Es el embudo comercial de un producto
pre-revenue: es la pantalla que decide a quién se le llama mañana.

**Causa raíz probable.** La 0181 amplió el dominio en la base para que el CRM
nuevo (`ESTADOS_FUNNEL`, `vendedores.ts:83-94`) cupiera, y dejó vivo el CRM
viejo (`ESTADOS_PROSPECTO`, `:71-78`) leyendo la misma columna: **una columna,
dos dominios disjuntos, y el CHECK acepta la unión**. El comentario de
`:401` documenta exactamente el invariante que la migración rompió.

---

### [ALTO] El outbox de WhatsApp tiene su llave de deduplicación y **ningún escritor la llena**: `dedupe_key` viaja NULL siempre, y en Postgres los NULL son distintos entre sí

`supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:69`
(`dedupe_key text unique`) · `src/lib/likida/wa_outbox.ts:16-18` (el único
`insert`, sin `dedupe_key`) · `src/lib/meta/client.ts:180,194,323,334,385,393,474,482`
(los ocho puntos que encolan)

**Escenario, con valores** (la mitad de base, corrida):

```sql
insert into wa_outbox (payload) values ('{"to":"52155","text":"listo"}');
insert into wa_outbox (payload) values ('{"to":"52155","text":"listo"}');
-- PROBE-OUTBOX dos_null_dedupe_entran=t  total=2
```

Y el camino que lo produce sin que nadie haga nada raro: `enviarTexto`
(`client.ts:167`) postea a Meta con `AbortSignal.timeout(SEND_TIMEOUT_MS)`. Meta
**acepta y entrega** el mensaje, pero la respuesta no llega antes del timeout →
el `catch` de `:177` corre → `encolarSalidaWhatsApp(payload, 'aborted')` inserta
una fila con `dedupe_key = NULL`. El cron `wa-outbox` la reclama
(`reclamar_wa_outbox`) y **manda el mismo payload otra vez**. Si además el
llamador venía de la bandeja durable (`wa_evento_pendiente`) y su lease venció,
el handler entero se reejecuta y encola una **segunda** fila NULL: tres copias
del mismo mensaje.

**Consecuencia.** El operador recibe dos y tres veces el mismo «listo, tu
liquidación está en camino» con su PDF. En el demo del 6-ago eso es el mensaje
que el contralor va a ver en el teléfono del chofer proyectado. La columna
`dedupe_key` existe en el esquema precisamente para impedirlo, y hoy no impide
nada: la única unicidad de la tabla no se ejerce nunca. El bloque 149 de
`verificaciones.sql` (`:8432`) prueba el lease y el reintento —`claim`,
`exclusivo`, `retry`, `sent`— y **no prueba la deduplicación**, así que la
batería verde no dice nada de esto.

**Causa raíz probable.** La llave se declaró NULLABLE para poder encolar sin
identidad, y con eso la restricción dejó de ser una restricción: en Postgres
`unique` no ata a los NULL.

---

### [ALTO] La 0176 creó la columna que liga una unidad con su GPS, y **nada en `src/` la escribe**: el poller cuenta el 100% de las lecturas como huérfanas

`supabase/migrations/0176_gps_ingesta.sql:25-28` (las tres columnas) ·
`src/lib/likida/conectores/sincronizar_gps.ts:109-113` (el único lector) ·
`src/lib/likida/operacion.ts:888-898` (`crearUnidad`) y `:906-921`
(`editarUnidad`) — los dos únicos escritores de `unidad`

**Escenario, con valores.** Una flota conecta su Samsara. El cron `/api/cron/gps`
corre cada 5 minutos, `leerPosicionesSamsara` devuelve 40 lecturas con
`deviceId='281474978288168'`, y `sincronizar_gps.ts:108` pregunta:

```
select id, gps_device_id from unidad
 where tenant_id = <flota> and gps_proveedor = 'samsara'
   and gps_device_id in ('281474978288168', …)
```

Devuelve **cero filas** — porque `crearUnidad` (`operacion.ts:889-897`) inserta
`numero_economico, placas, marca, modelo, anio, poliza_vence,
permiso_sict_vence, verificacion_vence` y nada más, y `editarUnidad`
(`:907-915`) actualiza esas mismas ocho. No hay pantalla, ni ruta `/v1`, ni
server action, ni backfill que escriba `gps_device_id`. El barrido de todo el
repo lo confirma: fuera de la migración, del lector, del comentario y del propio
bloque 147 de `verificaciones.sql`, las únicas apariciones de `gps_device_id`
están en `sincronizar_gps.test.ts`, que **siembra el valor a mano en su doble de
Supabase** (`:21-25`).

Resultado por corrida: `base.huerfanas = 40`, `base.guardadas = 0`, un
`logger.warn('gps.lecturas_huerfanas')` cada cinco minutos, `posicion` vacía y
`unidad.gps_visto_en` NULL para siempre — que es justamente la columna que la
migración creó «para distinguir *conector configurado* de *fuente
sincronizada*» (`0176:34-35`).

**Consecuencia.** La landing lista «el GPS de tu flota» entre las fuentes de
dato y el commit de la #46 declara que «el GPS deja de ser una promesa». Con el
vínculo sin escritor, sigue siéndolo: el mapa no pinta un solo camión y el panel
no tiene cómo decir por qué. Para este rubro es la forma más cara del hueco —
una columna, un índice único y un cron construidos alrededor de un dato que
nadie puede capturar.

**Causa raíz probable.** El PR entregó el lector, el poller, el cron, el índice
y el bloque de verificación, y el bloque siembra la liga con `INSERT` directo:
nada obligaba a que existiera el formulario.

---

### [ALTO] Una factura cancelada puede conservar sus abonos: no hay CHECK, ni trigger, ni índice que lo impida (REINCIDENTE)

`src/lib/likida/facturacion_escritura.ts:589-600` (el `count` y el `UPDATE`, en
peticiones distintas) · catálogo de `factura_emitida` (ocho CHECKs, ninguno
sobre pagos)

**Escenario, con valores** (corrido hoy, mismos números que la c4):

```sql
insert into factura_emitida (…, subtotal 10000, iva 1600, total 11600, estatus 'emitida') → F
insert into pago_recibido   (…, factura_id F, monto 5000);
update factura_emitida set estatus = 'cancelada' where id = F;   -- PASA
-- PROBE-FACT cancelar_con_pago_de_5000_entra=t  saldo=6600.00
```

Los ocho CHECKs vivos de la tabla —`factura_borrador_sin_uuid`,
`factura_estatus_dominio`, `factura_importes_positivos`, `factura_total_cuadra`,
`factura_vence_despues`, los dos de `btrim` y el de minúsculas— no miran
`pago_recibido`. El invariante vive solo en TypeScript, y ahí se comprueba con un
`count` fuera de transacción: entre él y el `UPDATE` cabe un `registrar_pago_tx`
que ve `estatus='emitida'` y abona.

**Consecuencia.** Quedan $5,000 registrados como cobrados contra un CFDI
cancelado. `factura_saldo.vencida` excluye las canceladas (`0161:121`), así que
ese dinero sale de la cartera y de la antigüedad; la conciliación contra el banco
no cuadra. Es el daño que el mensaje de `:594` dice querer evitar, escrito en la
capa que no lo puede garantizar. Diecisiete migraciones nuevas y ninguna lo tocó.

**Causa raíz probable.** El invariante es entre dos tablas; la 0159 movió a la
base la decisión del abono y dejó en TS la de la cancelación.

---

### [ALTO] El `encargado` sigue pudiendo reescribir `viaje.anticipo` por PostgREST: las policies de `viaje` no nombran `ve_finanzas()` (REINCIDENTE)

`supabase/migrations/0158_integridad_fiscal.sql:240-261` · `pg_policies` sobre
`viaje` (corrido) · `src/lib/auth/visibilidad.ts:41`

**Escenario, con valores.** Leído del catálogo hoy, sin cambio respecto de la c4:

```
tenant_data_insert | INSERT | -
tenant_data_select | SELECT | ((tenant_id = ANY (get_user_tenant_ids())) OR is_superadmin())
tenant_data_update | UPDATE | ((tenant_id = ANY (get_user_tenant_ids())) OR is_superadmin())
```

Ninguna nombra `ve_finanzas()`. Un `app_user` con `rol='encargado'` de la flota A
hace `update viaje set anticipo = 2000 where id = <V>` sobre un viaje con
`anticipo = 20000.00` y pasa: no lo frena `viaje_anticipo_no_negativo` (0070) ni
`trg_viaje_no_tras_liquidar` (que solo dispara si ya existe la fila de
`liquidacion`, `0158:373-378`). La c4 lo reprodujo con impersonación real y
obtuvo `update_paso=t`.

**Consecuencia.** El jefe de tráfico —el rol que existe para no ver finanzas— lee
el anticipo y el ingreso de flete de toda la flota y puede moverlos **antes** del
cierre, que es cuando cambiar el anticipo cambia el resultado: el cuadre
siguiente calcula `diferencia = round2(2000 − 18500) = −16500` y la liquidación
sale diciendo «El operador puso $16,500.00 de su bolsa». No hay línea en
`bitacora_auditoria` porque nunca pasó por la app.

**Causa raíz probable.** El dinero y la operación viven en la misma fila; la 0158
partió las policies por verbo cuando hacía falta partirlas por columna.

---

### [MEDIO] `registrarEventoComercial` reclama la llave de idempotencia **antes** del efecto, y `comercial_evento.procesado_en` no lo escribe nadie: un evento que falla al aplicarse queda marcado como recibido y no vuelve

`supabase/migrations/0181_crm_remediacion.sql:18-34` (la tabla, con
`procesado_en timestamptz` y `error text`) · `src/lib/admin/calcom.ts:83-104`
(el insert; ni `procesado_en` ni `error` se escriben nunca) ·
`src/app/api/webhook/calcom/route.ts:69-82` (el ledger antes del `update`)

**Escenario, con valores.** Un prospecto que ya se cerró —`estado='cerrado'`,
`tenant_id='<flota>'`, que es lo que `prospecto_tenant_solo_cerrado`
(`0181:16`) permite— vuelve a agendar con el mismo correo:

1. `registrarEventoComercial` inserta
   `comercial_evento(clave_idempotencia='calcom:BOOKING_CREATED:99887')` y
   **confirma**. Devuelve `'nuevo'`.
2. `route.ts:79` hace `update prospecto set estado='appointment',
   cerrado_en=null`. Choca con
   `prospecto_tenant_solo_cerrado check (tenant_id is null or estado in
   ('cerrado','won'))` → `23514` → `throw` → **500** a Cal.com.
3. Cal.com reintenta. `registrarEventoComercial` recibe `23505`, devuelve
   `'repetido'`, y `route.ts:73` contesta `{ok:true, repetido:true}` **sin
   volver a intentar el update**.

La fila queda con `procesado_en = NULL` y `error = NULL` para siempre: el ledger
que la migración llama *«append-only … la clave única vuelve idempotentes
webhooks y reconciliaciones»* dice que el evento entró, y el efecto nunca
ocurrió. Nadie consulta `procesado_en is null`: `grep -rn "procesado_en"` sobre
el CRM devuelve solo la migración.

**Consecuencia.** Para el vendedor: una cita que existe en Cal.com y no existe en
el embudo, sin nada rojo en ninguna pantalla. Y como el patrón está en la
frontera de todos los webhooks comerciales, cualquier fallo del `update`
—no solo este CHECK— produce el mismo silencio.

**Causa raíz probable.** El ledger y el efecto viven en dos transacciones y la
llave se toma en la primera; las dos columnas que existen para cerrarlo
(`procesado_en`, `error`) se declararon y no se cablearon.

---

### [MEDIO] `prospecto_lead_clave_unica` es GLOBAL y la clave se deriva del **nombre de la empresa** cuando no hay correo: dos flotas homónimas se fusionan en un solo prospecto y el segundo lead se pierde con un 200

`supabase/migrations/0181_crm_remediacion.sql:6` (`create unique index …
on prospecto (lead_clave) where lead_clave is not null`) ·
`src/app/api/lead/route.ts:81-85` (`claveNatural`) · `:190-191` · `:225-238`
(la reconciliación contra el ganador)

**Escenario, con valores.** La landing solo exige la empresa (`route.ts:161`);
el correo es opcional. Dos flotas distintas mandan el formulario sin correo:

```
A (Monterrey):   empresa='Transportes García'   → lead_clave='empresa:transportes garcia'
B (Guadalajara): empresa='TRANSPORTES GARCÍA'   → lead_clave='empresa:transportes garcia'
```

`claveNatural` normaliza NFD, quita acentos, baja a minúsculas y colapsa
espacios: **la misma clave**. B choca con el único, y el `catch` de `:225-238`
no crea un segundo prospecto: lee al ganador A y le aplica
`mezclaQueSoloRellena`, que solo rellena huecos. El teléfono y el contacto de B
caen en `notas` como «no aplicado» o se descartan, la empresa de B no queda en
ninguna parte, y la ruta responde **200**. El único rastro es
`logger.info('lead.duplicado_durable')` — nivel *info*, no *warn*.

**Consecuencia.** Un lead entrante real desaparece dentro de la ficha de otra
empresa. En un producto pre-revenue cuyo embudo entero cabe en dos pantallas, es
la clase de pérdida que no se detecta hasta que alguien pregunta por qué nunca
llamaron a Guadalajara. La 0139 documenta que `prospecto` tiene **1,227 grupos
duplicados vivos** justamente porque el nombre de empresa no es una llave; la
0181 lo convirtió en llave para las entradas públicas.

**Causa raíz probable.** El único cubre `lead_clave` a secas y no `(fuente,
lead_clave)` ni `(lead_clave, ciudad)`; y la clave cae al nombre cuando falta el
correo, que es el caso normal de la landing.

---

### [MEDIO] `tenant.perfil` es JSON libre —lo escribe una entrevista conducida por un modelo y decide un estímulo fiscal— y la base no le pone ni la forma mínima que la misma migración le puso a `erp_export_perfil`

`supabase/migrations/0169_tenant_perfil.sql:33` (`perfil jsonb not null default
'{}'`, sin CHECK) · `supabase/migrations/0178_fiscal_retencion_arco_y_perfiles_erp.sql:183`
(`check (jsonb_typeof(plantilla) = 'object')`, en el mismo delta, nueve
migraciones después) · `src/lib/likida/perfil/preguntas.ts:127`
(`calificaEstimuloPeaje`) · `src/lib/likida/repo.ts:122-145` (`guardarPerfilPatch`)

**Escenario, con valores** (corrido):

```sql
insert into tenant (nombre, perfil) values ('ZZZ', '"soy un string"'::jsonb);
update tenant set perfil = '[1,2,3]' where id = …;
-- PROBE-PERFIL typeof_string=string  versiones=1
```

Un escalar y un arreglo entran sin resistencia, y el trigger de historial sella
los dos en `tenant_perfil_version` como si fueran perfiles. La forma real que el
código espera —`{campo: {valor, procedencia}}` con `procedencia` en un dominio
cerrado de cinco— no está declarada en ningún sitio salvo una interfaz de
TypeScript que **no se exporta** (`preguntas.ts:36`, a propósito).

Lo que salva hoy el caso peor es TS, no la base: `leerPerfil` (`:104`) trata
cualquier cosa que no sea objeto como `{}` y `decidir` (`:86`) exige
`procedencia` `declarado`/`detectado`. Pero la decisión que cuelga de ese jsonb
es `calificaEstimuloPeaje` → `elegible: menoresA300M && !parteRelacionada`, o
sea el 50% de peaje de LIF 2026 art. 20-A, y ahí `decidir()` devuelve el `valor`
**tal cual**: un `{"ingresosMenoresA300M":{"valor":"si","procedencia":"declarado"}}`
—una cadena, no un booleano— es truthy y la función devuelve `elegible: true`.
Ninguna capa comprueba el tipo del `valor`.

**Consecuencia.** El único guardarraíl de una llave que decide un estímulo fiscal
es un `if` en TypeScript sobre un jsonb que la base acepta con cualquier forma.
El escritor es una entrevista conducida por un modelo (`perfil/entrevista.ts` →
`declararHechos` → `guardarPerfilPatch`), y `guardarPerfilPatch` además es
lee-mezcla-escribe sin transacción (`repo.ts:127-144`): dos turnos en vuelo
pierden uno de los dos patches. La comparación es interna al propio delta —
`erp_export_perfil.plantilla`, que solo guarda un layout de exportación, **sí**
lleva `jsonb_typeof = 'object'`.

**Causa raíz probable.** El contrato del perfil se escribió como tipo de
TypeScript no exportado («el candado es un mecanismo»), y un tipo que solo existe
en el compilador no llega a la base ni al `INSERT` de una consola.

---

### [MEDIO] Los dos bloques que miden índices inútiles siguen midiéndolos mal y ahora tienen exención escrita: `INDICE_FACTURACION` = `f` y `INDICES_PAGINACION` = `2/9`, y la batería dice «pasó» (REINCIDENTE, agravado)

`scripts/ci/correr-verificaciones.mjs:390-410` (`SIN_CALIFICAR_CONOCIDOS`,
con `INDICE_FACTURACION` en `:393` e `INDICES_PAGINACION` en `:394`) ·
`supabase/verificaciones.sql:1531` · `:1601`

**Escenario, con valores** (corrido hoy, idénticos a la c4):

```
:1531  INDICE_FACTURACION   el-planeador-usa-el-indice=f    (esperado true)
:1601  INDICES_PAGINACION   el-planeador-los-usa=2/9        (esperado 9/9)
```

Siete de los nueve `*_paginacion_idx` no los elige el planeador: `gasto`,
`viaje`, `liquidacion`, `llm_costo`, `pod` e `incidencia` paginan por `Sort`
sobre un bitmap scan. La c4 lo reportó como MEDIO. La respuesta de este delta no
fue arreglar el bloque ni el índice: fue **añadir los dos a la lista de exentos**
con la razón *«C · imprime el plan del planeador entero»*, y el runner cierra con
«19 bloque(s) sin calificar, todos conocidos y con razón … Ninguno nuevo. La
batería pasó.» La lista trae su propia advertencia escrita dos líneas abajo
(`:422`: *«esa lista se baja, no se sube»*) y este delta la subió de 17 a 19.

Un tercero merece nombre propio: **`FISCAL_AGREGADO_0151` (`:6011`) imprime
`celdas=10` contra un esperado de `11 celdas` y `monto=8280.00` contra
`7680.00`**. Aquí el bloque sí cuadra consigo mismo (`n=11/11`,
`monto=8280.00/8280.00`, `con_cfdi=10/10`: el agregado coincide con la consulta
directa, y **8,280.00 es la suma correcta** de la siembra), o sea que lo que está
mal es la expectativa escrita, no la función. Pero eso solo se sabe sumando a
mano los once `insert` del bloque, porque la puerta no lo compara.

**Consecuencia.** Nueve índices creados para paginar cobran su costo de escritura
en cada INSERT de las tablas más calientes y siete no sirven a nadie; a 50k
viajes/mes es mantenimiento pagado por nada. Y el mecanismo que lo delataba ahora
está anotado como conocido, que es la forma en que una medición deja de ser una
medición.

**Causa raíz probable.** El emparejador clave/valor no sabe leer mensajes con
secciones, y el modo degradado —no fallar— convirtió la exención en la salida
barata.

---

### [BAJO] `uq_unidad_gps` no impide lo que su propio comentario promete: con `gps_proveedor` NULL, dos unidades de la misma flota comparten dispositivo

`supabase/migrations/0176_gps_ingesta.sql:37-43` (el comentario —«Dos unidades de
una flota no pueden apuntar al MISMO dispositivo»— y el índice) ·
`supabase/verificaciones.sql:8343-8355` (el bloque 147, que solo prueba el caso
CON proveedor)

**Escenario, con valores** (corrido):

```sql
insert into unidad (tenant_id, numero_economico, gps_device_id) values (T,'E-1','DEV-1');
insert into unidad (tenant_id, numero_economico, gps_device_id) values (T,'E-2','DEV-1');
-- PROBE-GPS dos_unidades_mismo_device_proveedor_NULL_entran=t
```

`gps_proveedor` es nullable y el único es `(tenant_id, gps_proveedor,
gps_device_id)`: con NULL, Postgres considera las dos filas distintas. No hay
`check ((gps_device_id is null) = (gps_proveedor is null))` que ate las dos
columnas. El bloque 147 hace su prueba poniendo `gps_proveedor='samsara'` en las
dos filas (`:8350`), así que verifica la mitad estrecha y su prosa afirma la
ancha.

**Consecuencia.** Hoy el daño está acotado porque el poller filtra por
`.eq('gps_proveedor', conectorId)` (`sincronizar_gps.ts:112`): una unidad con
device sin proveedor es invisible para la ingesta, no un reparto de posiciones.
Lo que queda es una restricción que dice garantizar algo que no garantiza —y el
día que alguien capture el device sin el proveedor, esa unidad no recibirá una
sola lectura sin que ninguna pantalla lo diga.

**Causa raíz probable.** El proveedor se metió al único para permitir migraciones
entre plataformas y se dejó nullable para no obligar a llenarlo.

---

### [BAJO] La reserva de presupuesto del runner acepta nacer vencida y cerrar con un costo mayor que lo reservado: `agente_presupuesto_reserva` no ata `vence_en` a `creada_en` ni `costo_real_usd` a `monto_usd`

`supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:8-19` (la tabla: dos
CHECKs, `monto_usd > 0` y `costo_real_usd >= 0`) · `:25-46` (`reservar_presupuesto_agente`)

**Escenario, con valores** (corrido):

```sql
insert into agente_presupuesto_reserva (agente, dia, monto_usd, vence_en, costo_real_usd)
values ('runner', current_date, 0.01, now() - interval '10 years', 999999);
-- PROBE-RESERVA lease_vencido_al_nacer_entra=t  costo_999999_sobre_monto_0.01_entra=t
```

Una fila con `vence_en` diez años en el pasado es invisible para el cálculo de
disponible (`:40`, `vence_en > now()`), o sea una reserva que no reserva; y
`costo_real_usd = 999999` contra `monto_usd = 0.01` entra sin decir nada. Falta
también `check (dia = (creada_en at time zone 'America/Mexico_City')::date)` o
equivalente: nada ata la fila a su día.

**Consecuencia.** Hoy es una bomba desarmada: el único llamador
(`runner.ts:85-92`) siempre pasa `p_lease_seconds: 300`, y `costo_real_usd` es
telemetría —el gasto que de verdad cuenta se lee de `agente_corrida`
(`0180:34-37`)—. Lo que la mantiene abierta es que la tabla es la frontera del
presupuesto de IA y un script de conciliación, un reintento manual o un
llamador nuevo pueden escribirla sin pasar por la RPC.

**Causa raíz probable.** Los dos CHECKs que sí se escribieron miran una columna
cada uno; los invariantes que faltan son entre columnas.

---

### [BAJO] El delta añadió una SECURITY DEFINER más sin `pg_temp`, nueve migraciones después de que este repo declarara por escrito que ese patrón es un hueco (REINCIDENTE + una nueva)

`supabase/migrations/0178_fiscal_retencion_arco_y_perfiles_erp.sql:28-32`
(`clasificar_retencion_storage_candidato`, `security definer`,
`set search_path = public, pg_catalog`) ·
`supabase/migrations/0158_integridad_fiscal.sql:715-723` (la regla) ·
`supabase/migrations/0184_search_path_trigger_prospecto.sql:4` (fija
`public, pg_catalog` — también sin `pg_temp`)

**Escenario, con valores** (corrido, catálogo real). Las DEFINER de `public` sin
`pg_temp` en su `search_path` son cinco:

```
analizar_tablas_operacion               search_path=public                 (0157, c4)
clasificar_retencion_storage_candidato  search_path=public, pg_catalog     (0178, NUEVA)
indices_faltantes                       search_path=public, pg_catalog     (0030)
prospecto_toque_marca_prospecto         search_path=public                 (0167, c4)
triggers_faltantes                      search_path=public, pg_catalog
```

Cuando `search_path` no nombra `pg_temp`, Postgres lo busca **primero**: quien
pueda crear un objeto temporal con el nombre de algo que la función resuelve sin
calificar, lo ejecuta con los privilegios del dueño.

**Consecuencia.** No es explotable hoy —las cinco están revocadas de `anon` y
`authenticated` (comprobado: `anon=false` en las cinco), y
`storage_huerfano_candidato` es deny-all (RLS activo, cero policies), así que un
cliente no puede ni disparar el trigger—. Lo que cobra factura es el precedente:
la 0158 §10.d escribió la regla, la 0184 se llamó *«cierra el único search_path
mutable reportado por el advisor»* y dejó cuatro, y el delta sumó una más. La
próxima DEFINER así puede tocar dinero.

**Causa raíz probable.** El `search_path` se copia del vecino y ninguna
verificación lo comprueba: el bloque 49 solo mira las cinco funciones de RLS,
`capa1` solo mira quién puede ejecutarlas.

---

## Lo que revisé y está bien

- **La compuerta está verde y lo comprobé de dos maneras** (corrido + API de
  GitHub). `CI Postgres` run #381 sobre `master@8b43121` = `success`, y aquí
  **179 migraciones aplican limpias sobre base virgen** y la batería da
  `135 bloques · 114 ok · 0 fallos · 0 no-lanzó`. Los cinco bloques que la c4
  documentó abortando —122 (`:6144`), 123 (`:6011`), 125, 134 (`:7038`), 137
  (`:7557`)— pasan hoy. Es el cierre del CRÍTICO de la ronda pasada.
- **Trece de las diecisiete migraciones nuevas traen bloque propio**: 140 (0169),
  141 (0170), 142 (0171), 144 (0173+0178), 145 (0174), 146 (0175+0178),
  147 (0176), 148 (0177), 149 (0180), 150 (0181), 151 (0182), más el 143
  («ningún RPC agregado ve datos de otra flota»). Las cuatro exentas —0168, 0172,
  0183, 0184— tienen razón escrita en `migraciones_verificadas.test.ts:56-58,127`.
  Es el mejor ratio que ha tenido este repo.
- **`gasto.descuento` (0171) está bien puesta y bien tipada.** Columna
  `numeric(12,2)` NULLABLE a propósito (NULL = «el CFDI no lo trae», distinto de
  un 0 declarado), `check (descuento is null or descuento >= 0)` (`0171:26-28`),
  `repo.ts:366,765,936` la escribe y la lee, y `types/likida.ts:76` la declara
  `descuento?: number` — el tipo coincide con la columna. Intenté y **refuté**
  que `descuento > sub_total` produjera un estímulo negativo:
  `engine.ts:1239` acota con `Math.max(0, subTotal − descuento)`.
- **`uq_posicion_lectura` va sin predicado a propósito y el `on conflict` del
  poller funciona** (corrido, bloque 147: `repetida_ignorada=t`, `parcial=f`,
  `n_posiciones=1`). Un único parcial no se puede inferir desde
  `on_conflict=tenant_id,unidad_id,medida_en` y el upsert de
  `sincronizar_gps.ts:146` habría reventado con 42P10. La cabecera de la 0176
  (`:58-64`) documenta la trampa antes de caer en ella.
- **La 0183 barrió los duplicados correctos.** `posicion_unidad_tiempo_idx`
  (0050:74) y `posicion_unidad_medida_idx` (0176:50) tenían definición idéntica;
  la 0183 dropea el de la 0050 y conserva el que `verificaciones.sql:8387`
  comprueba. Igual con `wa_evento_pendiente_lease_idx` (0177:53), que duplicaba
  uno anterior. Intenté y refuté que la 0183 hubiera dropeado el índice
  equivocado.
- **RLS de las siete tablas nuevas: deny-all, sin excepción** (corrido).
  `wa_outbox`, `agente_presupuesto_reserva`, `comercial_evento`,
  `erp_export_perfil`, `tenant_perfil_version`, `correo_procesado` y
  `wa_evento_pendiente`: `relrowsecurity = true` y **cero policies**. `wa_outbox`
  además revocada a nivel tabla (`anon_select=false`, `auth_insert=false`).
  `posicion` conserva su `tenant_data` por flota.
- **Los tres claims durables de la 0177/0180 hacen lo que dicen** (corrido,
  bloques 148 y 149, todas las banderas en `t`): `correo=t busy=t relevo=t
  aplicado=t viejo=f wa=t lease=t segundo=0 permisos=f` y `claim=t exclusivo=t
  retry=t sent=t cerrado=t reserva=t segunda=f reabre=t permisos=f`. El
  `lease_expires_at='-infinity'` de `finalizar_correo` (`0177:42`) está bien
  razonado: `now()` es fijo en la transacción y un reintento inmediato se habría
  quedado `busy` para siempre.
- **La 0178 corrige de verdad los dos errores de la 0173/0175**, y son
  correcciones de esquema, no de rótulo: la evidencia fiscal deja de entrar a la
  cola de borrado de Storage (`clase_retencion` con su CHECK de dominio,
  `0178:13-20`, más el `update` retroactivo de `:24-26`), y
  `poliza_datos_tenant` deja de sustituir una base desconocida por el total
  (`coalesce(sub_total, monto)` → `sum(sub_total) filter (...)` +
  `baseConocida`, `0178:222-232`). Esto último es la regla #1 del producto
  aplicada dentro de una función SQL.
- **La 0182 cierra el ALTO medido de la c4.** `similitud_icp_pct` con
  `scian='484121'` da **100** (era 60). El `drop column / add column` sobre una
  columna generada aplica limpio y recrea `idx_prospecto_similitud`.
- **`cron_latido_id_dominio` se ensanchó en la migración, no en el código** —
  `'gps'` en `0176:77-79` y `'wa-outbox'` en `0180:124-126`—, que es lo que la
  0155 pidió por escrito. Bloque 147: `cron_gps=t`.
- **`erp_export_perfil` (0178:175-184) está bien planteada**: PK compuesta
  `(tenant_id, sistema)`, CHECK de dominio en `sistema`, `confirmado_en not
  null` —o sea que no se puede guardar un layout sin que alguien lo haya
  contrastado— y `check (jsonb_typeof(plantilla) = 'object')`. Es el contraste
  exacto que le falta a `tenant.perfil`.
- **Intenté y refuté que el chofer pudiera leer `posicion`.** El
  `and not is_operador()` de la 0050 ya no está, pero porque la 0086 retiró
  `operador` del dominio de `app_user.rol` — comprobado en el catálogo:
  `app_user_rol_dominio CHECK (rol = ANY (ARRAY['superadmin','flota_admin',
  'contador','encargado','vendedor']))`. La sesión que la policy excluía no
  puede existir. (`CLAUDE.md` sigue listando `operador` entre los roles: la
  documentación está desactualizada, el esquema no.)
- **Intenté y refuté que `posicion` aceptara la misma lectura por dos
  proveedores** (corrido): `misma_unidad_mismo_instante_otro_proveedor_entra=f`.
  `uq_posicion_lectura` es más estricto que el `posicion_sin_duplicado` de la
  0050 y lo cubre.
- **Intenté y refuté que `litros` negativos llegaran al estímulo.** La columna
  (`0168:27`) no tiene CHECK, pero los dos lectores exigen `> 0`
  (`consolidado.ts:534` y `engine.ts:1271`) y el motor además coteja
  precio×litros contra el monto (`engine.ts:1281-1286`). Queda como «la
  aplicación se encarga» sin consecuencia medible.
- **`0172` está sincronizada con TS.** El CHECK admite `601,603,612,621,624,626`
  y `REGIMENES` de `src/lib/saas/fiscal.ts` es la lista que
  `entrevista-aplicar.ts:136-138` valida antes de escribir. La cabecera dice
  explícitamente qué pasa si divergen.
- **El hueco 0179 no es un problema**, ni los de 0067–0069 y 0156. Nada los
  referencia y Supabase aplica por nombre de archivo.

---

## Lo que NO alcancé a revisar

- **`scripts/demo-5k.sql`.** La c4 lo corrió y encontró tres paredes (el `--`
  dentro del jsonb, los 15 comprobantes, la FK de huérfanos). No lo volví a
  ejecutar contra las 179 migraciones de hoy, así que no puedo decir si las
  migraciones nuevas le añadieron una cuarta. Sigue siendo lo único que llena
  este esquema.
- **`supabase/seed.sql` y `scripts/carga-15k.sql`** siguen sin ejecutarse contra
  las restricciones nuevas.
- **Los 19 bloques SIN CALIFICAR, uno por uno.** Leí los diecinueve mensajes y
  clasifiqué tres como fallos o expectativas falsas escondidas
  (`INDICE_FACTURACION`, `INDICES_PAGINACION`, `FISCAL_AGREGADO_0151`); no
  reconstruí la expectativa de los otros dieciséis contra su cuerpo. Puede haber
  más.
- **El catálogo REAL de producción.** Todo lo que medí sale de aplicar las
  migraciones sobre un clúster virgen. Un Supabase real puede traer índices
  puestos a mano o policies creadas desde el panel que ninguna migración
  describe, y eso no se ve desde aquí. Producción corre 17.x; nada de lo que
  encontré depende de la versión.
- **El `delete from tenant` de una flota con datos en las 54 tablas a la vez** —
  el único momento en que las 38 FK compuestas se disparan juntas. No lo
  ejecuté. El delta no agregó FK compuestas nuevas: las tres tablas nuevas con
  `tenant_id` (`tenant_perfil_version`, `erp_export_perfil`) apuntan a `tenant`
  con `on delete cascade`, y `comercial_evento`/`wa_outbox`/
  `agente_presupuesto_reserva` no tienen `tenant_id` que atribuir.
- **La retención de las tablas nuevas.** `wa_outbox`, `comercial_evento`,
  `agente_presupuesto_reserva` y `tenant_perfil_version` no aparecen en
  `/api/cron/purgar` ni en `privacidad.ts`: crecen sin barrido. No lo desarrollo
  como hallazgo porque el volumen hoy es cero y el rubro de operabilidad está
  mejor situado para medirlo — pero `tenant_perfil_version` guarda copias
  completas del perfil (RFC, razón social, teléfonos del jefe) sin política de
  borrado declarada, y eso le toca al rubro legal mirarlo.
