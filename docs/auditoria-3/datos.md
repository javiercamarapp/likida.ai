# Modelo de datos y esquema — auditoría 3

**Nota: 5/10** (antes 6). Razón del movimiento: **mirada más profunda** sobre la
divergencia esquema↔código (no solo "¿la base acepta basura?" sino también "¿la
base acepta lo que el código escribe?") + **deuda que cobró factura**: las cuatro
tablas nuevas de la semana (0088–0091) traen bloque de verificación con corrida
real —eso subió—, pero volvieron a un estándar de restricciones más laxo que el
de la 0049, y el patrón de FK compuesta de la 0028/0073 se saltó por tercera vez.

**El riesgo mayor, hoy:** `viaje.operador_id` es `NOT NULL` desde la 0001 y
NADIE lo relajó, pero tres caminos escritos esta semana —el importador CSV/Excel
del Kit PoC, `crearViaje` del Despacho y el panel "sin asignar"— están construidos
sobre la suposición contraria. El importador se cae entero en cuanto un renglón no
trae operador, y lo hace con un mensaje que culpa al archivo.

## Hallazgos

### [CRÍTICO] `viaje.operador_id` es NOT NULL y tres caminos del producto escriben NULL

`supabase/migrations/0001_init.sql:49` —
`operador_id uuid not null references operador(id) on delete restrict`. Verificado
contra las 91 migraciones: ninguna hace `alter column operador_id drop not null`
(grep `operador_id` sobre `supabase/migrations/*.sql` solo devuelve la 0001, la
0040 y dos `alter function`).

El INSERT que el código emite y la base **rechaza**:

```sql
-- lo que arma src/lib/likida/importar_viajes.ts:215
insert into viaje (tenant_id, folio, origen, destino, fecha_inicio, anticipo, operador_id, estatus)
values ('<flota A>', 'V-1042', 'Mérida', 'CDMX', '2026-08-05', 8000, NULL, 'abierto');
-- ERROR 23502: null value in column "operador_id" of relation "viaje"
--              violates not-null constraint
```

Los tres escritores:

| dónde | línea | qué escribe |
|---|---|---|
| importador CSV/Excel (Kit PoC) | `src/lib/likida/importar_viajes.ts:215` | `operador_id: f.operadorNombre ? map.get(...) ?? null : null` — `null` **siempre** que el archivo no traiga columna de operador, y `null` cuando el nombre no empata exacto o es ambiguo (`operadoresSinAmarrar`) |
| Despacho → "Crear viaje" | `src/lib/likida/operacion.ts:566` (`operador_id: v.operadorId \|\| null`), llamado desde `src/app/dashboard/despacho/page.tsx:94` con `texto('operadorId', 64)`, que devuelve `null` si el `<select>` viene vacío | `null` |
| Despacho → panel "Sin asignar" | `src/lib/likida/operacion.ts:126` — `.is('operador_id', null)` | consulta que **jamás** puede devolver una fila |

Consecuencia, en orden de daño:

1. El importador va en lotes de 100 (`importar_viajes.ts:205`). Un solo renglón sin
   operador tumba el lote completo con 23502 y devuelve
   *"Se crearon 0 y el lote que empieza en la fila 1 falló — revisa y vuelve a
   subir el archivo"*. El archivo está bien; el esquema es el que no admite lo que
   el código promete.
2. La misma pantalla imprime, al lado, *"Sin amarrar a un operador (quedaron sin
   asignar): Juan Pérez"* (`src/app/dashboard/viajes/importar.tsx:62`). **Ese
   rótulo es falso**: no quedaron sin asignar, no se crearon. Regla del repo
   "un rótulo tiene que ser verdad".
3. `ViajeSinAsignar` / `getViajesSinAsignar` / la sección "Sin asignar" de
   `/dashboard/despacho` son una feature que renderiza vacío para siempre.

Ninguna prueba lo ve: `importar_viajes.test.ts` mockea Supabase, así que prueba el
mock. Causa raíz probable: la 0047/0048 hicieron `unidad_id` y `cliente_id`
nullables "a propósito" y se dio por hecho que `operador_id` también lo era; la
0001 lo puso `not null` cuando el único alta de viajes era la consola.

### [ALTO] `factura_proveedor` (0091) no guarda `tipo_comprobante`: una nota de crédito entra a la cola como factura

`supabase/migrations/0091_factura_proveedor.sql:18-42` — la tabla tiene
`cfdi_uuid, emisor_rfc, receptor_rfc, fecha, sub_total, iva, total, descripcion,
conceptos, estado`, y **no** una columna para `@TipoDeComprobante`. El parser sí lo
lee (`src/lib/likida/intake/cfdi_xml.ts:282`, `tipoComprobante: I|E|P|N|T`) y
`guardarFacturaProveedor` lo tira: `src/lib/likida/proveedores.ts:83-97` no lo
inserta, y `src/app/dashboard/agentes/proveedores/page.tsx:64` solo valida
`xml?.uuid && typeof xml.total === 'number'`.

```sql
-- el XML de una NOTA DE CRÉDITO del taller (TipoDeComprobante="E", Total=4640.00)
insert into factura_proveedor (tenant_id, cfdi_uuid, emisor_rfc, total, estado, xml_crudo)
values ('<flota>', 'a1b2…', 'TAL010101AAA', 4640.00, 'pendiente', '<cfdi:Comprobante TipoDeComprobante="E" …/>');
-- ACEPTADO. La fila es indistinguible de una factura de ingreso de $4,640.
```

Consecuencia: la bandeja se la presenta al humano como una factura por pagar; al
aprobarla, `aFilaExportProveedor` (`proveedores.ts:169-183`) la emite al layout del
ERP con `total: 4640` positivo y sin ninguna columna que diga que es un egreso.
Un abono se importa como cargo. `gasto` sí guarda `tipo_comprobante` desde la 0006;
el ciclo nuevo no heredó la columna. Causa raíz probable: la 0091 se escribió
mirando el ciclo de aprobación, no el catálogo `c_TipoDeComprobante`.

### [ALTO] `chat_conversacion` (0088) y `cobranza_contacto` (0089) apuntan a `tenant` SIN `on delete cascade`: borrar una flota revienta

`supabase/migrations/0088_chat_conversaciones.sql:20-21`:

```sql
  tenant_id uuid not null references public.tenant(id),      -- sin ON DELETE
  user_id   uuid not null references public.app_user(id),    -- sin ON DELETE
```

`supabase/migrations/0089_agente_cobranza.sql:47`:
`tenant_id uuid not null references public.tenant(id),` — también sin acción. Y en
la MISMA migración, `agente_cobranza_config.tenant_id` (línea 25) **sí** lleva
`on delete cascade`, igual que `factura_proveedor.tenant_id` (0091:20). O sea: no
es criterio, es olvido.

```sql
delete from tenant where id = '<flota que ya usó el chat>';
-- ERROR 23503: update or delete on table "tenant" violates foreign key constraint
--              "chat_conversacion_tenant_id_fkey" on table "chat_conversacion"

delete from app_user where id = '<contador que chateó una vez>';
-- ERROR 23503: … "chat_conversacion_user_id_fkey" on table "chat_conversacion"
```

Consecuencia: la 0071 existe *exactamente* para que `delete from tenant` sea
viable (midió 4,696 ms → 900 ms con 34,000 filas hijas) y su encabezado razona
sobre "las ~20 FK contra `tenant` del esquema" dándolas por `cascade`. Desde la
0088 ya no lo son: dar de baja una flota, o ejercer la supresión de un usuario del
lado ARCO (`solicitud_arco`, 0053), falla con un 23503 crudo. En
`cobranza_contacto` el resultado además es **no determinista**: el `cascade` de
`viaje` puede vaciarla antes de que corra el chequeo NO ACTION, o no, según el
orden de disparo de los triggers RI.

### [ALTO] `viaje` no tiene `unique (tenant_id, folio)` y el importador promete que sí

`supabase/migrations/*.sql` — los únicos `unique` sobre folio son
`factura_folio_unico` (0049:69) y `cotizacion_folio_unico` (0051:105). `viaje` no
tiene ninguno.

`src/lib/likida/importar_viajes.ts:174-181` lee TODOS los folios existentes, arma
un `Set` y filtra; `:161` lo declara así: *"Folios que YA existían en la flota —
el mismo archivo dos veces no duplica"*. Es un read-then-write sin candado.

```sql
-- dos subidas del mismo archivo (doble clic, reintento tras timeout, dos personas)
insert into viaje (tenant_id, folio, anticipo, operador_id, estatus)
values ('<A>','V-1042', 15000, '<op>', 'abierto');
insert into viaje (tenant_id, folio, anticipo, operador_id, estatus)
values ('<A>','V-1042', 15000, '<op>', 'abierto');   -- ACEPTADO
```

Consecuencia: dos viajes gemelos. Los comprobantes del chofer se cuelgan de uno
solo (`getOpenViaje` ordena `created_at desc`) — es *literalmente* el escenario que
la 0029 documentó y cerró con un índice parcial: el gemelo queda con $15,000 de
anticipo y cero comprobantes, y al cerrarlo la liquidación acusa al operador de un
dinero que sí comprobó. Además el anticipo se cuenta dos veces en los KPI. Nota:
la 0029 (`uq_viaje_abierto_por_operador`) tapa el caso cuando los dos gemelos
llevan el MISMO operador; no tapa los que se importan sin amarrar ni con operadores
distintos. Causa raíz probable: cuando se escribió la 0029 nadie insertaba viajes
desde `src/`; el importador llegó después y trajo su propia garantía en memoria.

### [MEDIO] La 0070 cerró los negativos de `gasto`/`viaje` y saltó `liquidacion` entera

`supabase/migrations/0070_montos_no_negativos.sql:1-11` enumera lo que "el esquema
YA protegía" (`pago_recibido`, `tarifa`, `factura_emitida`, `cotizacion`,
`viaje.intake_pendientes`) y agrega `gasto.monto >= 0` y `viaje.anticipo >= 0`.
`liquidacion` no aparece en ninguna de las dos listas. Lo único que tiene es el
anti-`NaN` de la 0025 (`liquidacion_montos_no_nan`, 0025:129-130), y ese solo cubre
tres de las siete columnas de dinero.

```sql
select guardar_liquidacion_tx('<tenant>', '<viaje>', -50000, 12000, -62000, 'revisar', …);
-- o directo:
update liquidacion set total_comprobado = -50000, litros_diesel_acreditables = -300,
                       ieps_acreditable = -900 where id = '…';   -- ACEPTADO
```

Consecuencia: `total_comprobado`, `ieps_acreditable`, `iva_acreditable`,
`peaje_acreditable` y `litros_diesel_acreditables` admiten negativos. `diferencia`
sí puede ser negativa legítimamente (a favor del operador); las otras cinco no
tienen lectura válida bajo cero. Salen al PDF y a `analytics.ts` (`:631` suma las
cuatro de acreditamiento para el panel fiscal) sin que nada las frene. Hoy la
aplicación no las produce —los gastos son `>= 0`— pero un script, la consola o la
propia RPC (que recibe los totales como parámetros, 0013:26-31) sí. Causa raíz
probable: la 0070 auditó "las dos columnas que entran a la resta del cuadre" y no
las columnas donde la resta se GUARDA.

### [MEDIO] `factura_proveedor` sin las coherencias que la 0049 sí exigió a `factura_emitida`

`supabase/migrations/0091_factura_proveedor.sql:30-42` vs
`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:47-58`. La 0049 puso
`factura_importes_positivos`, `factura_total_cuadra` (`abs(total-(subtotal+iva)) <= 0.01`)
y `factura_borrador_sin_uuid`. La 0091 no puso ninguna de las tres.

```sql
insert into factura_proveedor
  (tenant_id, cfdi_uuid, sub_total, iva, total, conceptos, estado, decidido_por, decidido_en, xml_crudo)
values
  ('<flota>', 'aaaa…', 100.00, 16.00, -8000.00, 0, 'aprobada', NULL, NULL, '<x/>');
-- ACEPTADO: total negativo, total ≠ sub_total+iva, 0 conceptos,
-- y una factura APROBADA sin quién la aprobó ni cuándo.
```

Consecuencia: el layout al ERP (`aFilaExportProveedor`) emite `aprobada_por: ''` y
`aprobada_en: ''` para una fila marcada `aprobada`. La 0091 se escribió justo bajo
LFPDPPP 26-II ("el agente prepara y marca, la persona decide") y la base no puede
demostrar que hubo persona. El repo ya tiene el patrón exacto en cuatro sitios
(`factura_saas_pagada_coherente` 0052, `comprobante_huerfano_cierre_coherente`
0073:70-72, `incidencia_cierre_coherente` y `ticket_cierre_coherente` 0051). Causa
raíz probable: tabla nueva escrita sin releer las coherencias de su tabla espejo.

### [MEDIO] `agente_cobranza_config.tiers`/`dias_semana` son jsonb sin esquema, y el fallback es FAIL-OPEN

`supabase/migrations/0089_agente_cobranza.sql:29,33`:
`tiers jsonb not null default '[3, 7, 14]'` y
`dias_semana jsonb not null default '[1,2,3,4,5,6]'`. Sin CHECK: ni "es array", ni
"son enteros", ni rango. `hora_inicio`/`hora_fin`/`instrucciones`/`firma` sí lo
tienen — la validación se detuvo justo antes de las dos columnas que no son
escalares. El repo ya resolvió este mismo problema con el trigger
`config_tenant_valida` para `tenant.config` (0026:325-336, redefinido en 0082/0083/0085).

```sql
update agente_cobranza_config
   set activo = false,           -- la flota APAGÓ el agente
       tiers  = '[]'::jsonb      -- y alguien/algo dejó el jsonb ilegible
 where tenant_id = '<flota>';
-- ACEPTADO
```

Consecuencia (leída en `src/lib/likida/agentes/cobranza.ts:41-56`): `validarConfigCobranza`
devuelve `{error}` porque `tiers.length === 0`, y `leerConfigCobranza` **cae a
`CONFIG_COBRANZA_DEFAULT`**, que trae `activo: true`
(`agentes/cobranza_pura.ts:30-38`). El agente que la flota apagó vuelve a
encenderse solo y empieza a mandar WhatsApp a los choferes con los tiers [3,7,14].
Eso es fallar ABIERTO, y el repo se define por lo contrario. (Con
`tiers = '{"a":1}'` el `.map` sobre un objeto lanza `TypeError` y la página del
agente cae con el error boundary — ahí sí falla cerrado, por accidente.)

### [MEDIO] Tercera reincidencia del patrón de FK compuesta: `cobranza_contacto` no ancla su tenant al del viaje

`supabase/migrations/0089_agente_cobranza.sql:46-48` — `tenant_id` y `viaje_id`
son dos FK simples e independientes. La 0028 declaró CRÍTICA esta clase de defecto
y creó `viaje_id_tenant_key` (`unique (id, tenant_id)`) precisamente para poder
apuntarle; la 0073 la aplicó a `comprobante_huerfano` porque *"nació DESPUÉS de la
0028 y se saltó el patrón"*. La 0089 nació después de las dos y volvió a saltárselo.

```sql
insert into cobranza_contacto (tenant_id, viaje_id, tier, enviado)
values ('<flota A>', '<viaje de la flota B>', 3, true);   -- ACEPTADO
```

Consecuencia: la fila es invisible para B (`bitacoraCobranza` filtra por
`tenant_id`, `cobranza.ts:348-352`) y **consume el candado** `unique(viaje_id, tier)`
del viaje de B — el agente de B nunca contactará a ese chofer en ese tier y no
habrá rastro de por qué. El claim anti-doble-envío se puede envenenar desde otra
flota. Causa raíz probable: la migración se escribió copiando la forma de
`comprobante_huerfano` (0040), no la de su corrección (0073).

### [MEDIO] `uq_gasto_cfdi_uuid` es sensible a mayúsculas y hay dos escritores con normalización distinta

`supabase/migrations/0065_cfdi_de_varias_casetas.sql:69` —
`create unique index uq_gasto_cfdi_uuid on public.gasto (tenant_id, cfdi_uuid, cfdi_orden) where cfdi_uuid is not null`,
sobre el texto crudo. No hay ningún `lower(cfdi_uuid)` ni CHECK de forma en las 91
migraciones (grep confirmado).

Los dos escritores no coinciden:
- OCR: `src/lib/likida/intake/ocr.ts:291` — `data.cfdi_uuid.toLowerCase()`.
- XML: `src/lib/likida/intake/cfdi_xml.ts:291` — `uuidRaw.toLowerCase()`.
- **Portal de autofacturación**: `src/lib/likida/facturacion/adaptadores/playwright_base.ts:389`
  devuelve `bruto.trim()` — el texto tal cual lo pinta el portal, y el folio fiscal
  se publica en MAYÚSCULAS por convención del SAT. De ahí va sin tocar a
  `escribirUuid` (`al_vuelo.ts:518`).

```sql
-- el gasto que autofacturó el portal
update gasto set cfdi_uuid = '9A1B2C3D-4E5F-6789-ABCD-EF0123456789', cfdi_orden = 1 where id = 'g1';
-- el mismo CFDI que después llega por XML/foto
insert into gasto (tenant_id, viaje_id, concepto, monto, cfdi_uuid, cfdi_orden)
values ('<A>','<v>','caseta', 187.00, '9a1b2c3d-4e5f-6789-abcd-ef0123456789', 1);
-- ACEPTADO: el índice único no las ve como la misma llave.
```

Consecuencia: el comprobante existe dos veces en la base. El motor lo salva —
`copiasDeComprobante` (`cuadre/engine.ts:155`) y `duplicados.ts:86,101` sí
minusculizan— así que el PDF de hoy no cobra doble; pero la garantía queda
delegada al motor, y `escribirUuid` (`al_vuelo.ts:505-531`) **razona sobre el 23505
de ese índice** para decidir si un CFDI ya se emitió: con la caja distinta el
choque nunca llega y el mensaje de "ya se emitió" no se dispara. Causa raíz
probable: la normalización se puso en los dos caminos de intake y no en el tercero,
que nació dos meses después.

### [BAJO] `llm_costo` acepta lo que su propio consolidado rechaza

`supabase/migrations/0003_costos.sql:14-16` — `tokens_in`, `tokens_out`,
`costo_usd` sin CHECK. `supabase/migrations/0072_purga_y_consolidado_ia.sql:70-72`
— `llm_costo_mensual_no_negativo check (llamadas >= 0 and tokens_in >= 0 and tokens_out >= 0 and costo_usd >= 0 and viajes >= 0)`.

```sql
insert into llm_costo (tenant_id, fase, modelo, tokens_in, costo_usd)
values ('<A>', 'ocr', 'x', -5000, -0.42);   -- ACEPTADO en el origen
```

Consecuencia: `consolidar_llm_costo_mensual` (0072:95-112) inserta `sum(costo_usd)`
en la tabla que sí tiene el CHECK → `check_violation` → `mantenimiento_de_datos`
aborta y la purga de `wa_mensaje_procesado` del mismo cron no corre. El origen
acepta lo que el destino rechaza. Causa raíz probable: la 0072 endureció la tabla
derivada sin volver sobre la fuente.

### [BAJO] `gasto.ocr_confianza numeric(4,3)` sin CHECK 0..1

`supabase/migrations/0001_init.sql:63`. El tipo del dominio dice `0–1`
(`src/types/likida.ts:46`) y `numeric(4,3)` admite de `-9.999` a `9.999`.

```sql
update gasto set ocr_confianza = 9.999 where id = '…';   -- ACEPTADO
```

Consecuencia: el umbral `ocr_baja_confianza` nunca se dispara sobre esa fila, y
`0064_resumen_por_tenant.sql:196,227` usa `ocr_confianza is not null` como *"la
prueba de que algo pasó por el Agente OCR"* — una prueba que la base no acota.

### [BAJO] Los hitos de la 0090 no tienen orden ni coherencia entre sí

`supabase/migrations/0090_hitos_viaje.sql:20-23` — tres `timestamptz` sueltos, sin
CHECK. El propio encabezado (`:16-17`) promete que *"la espera en patio se vuelve
medible: descarga_en - llegada_en"*.

Camino real por WhatsApp (`hitos_viaje.ts:92-111` sella cada columna
independiente, sin mirar las otras): el chofer manda "estoy descargando" a las
11:00 (nunca mandó "llegué") y a las 14:00 manda "ya llegué" →
`descarga_en < llegada_en`, y la espera en patio sale **negativa**. Hoy solo se
pinta como bitácora cronológica (`analytics.ts:900-925`), así que el daño es que
la bitácora se lee al revés; el día que alguien reste las dos columnas, la cifra
saldrá negativa sin que nada la frene.

### [BAJO] `comprobante_huerfano.gasto` es jsonb sin esquema con un cast ciego a `Gasto`

`supabase/migrations/0040_comprobante_huerfano.sql:38` — `gasto jsonb not null`,
sin validación. `src/lib/likida/repo.ts:322` y `:394` — `r.gasto as Gasto`, que es
exactamente el patrón que la 0025 documentó como *"lo lee de vuelta con un cast
ciego"*. `update comprobante_huerfano set gasto = '{"concepto":"peaje","monto":"mil"}'`
pasa; `getHuerfanosDeFlota` devuelve `monto: NaN` a la bandeja de la oficina.
Atenuante real: al adjuntar, `addGasto` sí choca contra `gasto_concepto_dominio`
y `gasto_monto_no_negativo`, así que la basura no entra al camino del dinero — se
queda en la pantalla.

### [BAJO] `/dashboard/usuarios` declara cinco roles "que la base admite"; el CHECK admite cuatro

`src/app/dashboard/usuarios/page.tsx:8-18` — *"Los cinco roles que la base admite
(`app_user.rol`, check constraint)"*, y lista `operador` con el texto *"usa
WhatsApp y /mis-viajes"*. La 0086 (`0086_retirar_rol_operador.sql:96-98`) dejó el
dominio en `('superadmin','flota_admin','contador','encargado')` y borró
`/mis-viajes` el 7-ago. El tipo de TS sí está bien (`RolAppUser`,
`src/lib/auth/provisionar.ts:16`); la pantalla que lo explica, no. Es un rótulo
que no es verdad sobre el esquema.

### [BAJO] Las cuatro migraciones nuevas no declaran su reversión

0088, 0089, 0090 y 0091 no tienen la línea `Reversible: …` que la 0025:70, la
0028:59, la 0029:49 y la 0073 sí traen. Las cuatro *son* triviales de revertir
(`drop table`, `drop column`); lo que se perdió es la convención de decirlo. La
0090 es la que más lo necesitaría: revertirla borra tres columnas con datos de
producción, y ese `drop column` no es reversible.

## Invariantes del código vs. la base

| Invariante que el código asume | Dónde lo asume | ¿La base lo impone? |
|---|---|---|
| Un viaje puede existir **sin operador** | `operacion.ts:126,566`, `importar_viajes.ts:215` | ❌ **al revés**: 0001:49 `not null` — el código no puede escribirlo (CRÍTICO) |
| Un operador tiene un solo viaje abierto | `conv.ts` `getOpenViaje` | ✅ 0029 `uq_viaje_abierto_por_operador` (parcial) |
| Un viaje tiene una sola liquidación | `guardar_liquidacion_tx` | ✅ 0005:13 `liquidacion_viaje_uidx` |
| Un CFDI = un gasto por (uuid, orden) | `al_vuelo.ts:505-531` lee el 23505 | ⚠️ 0065:69 — existe, pero **case-sensitive** y hay dos cajas (MEDIO) |
| El folio de viaje es único en la flota | `importar_viajes.ts:174-181` (read-then-write) | ❌ no existe unique (ALTO) |
| `gasto.concepto` ∈ los 9 de `ConceptoGasto` | `types/likida.ts:20-25` | ✅ 0025 `gasto_concepto_dominio` |
| `viaje.estatus` ∈ 3 valores | `types`, `conv.ts` | ✅ 0025 `viaje_estatus_dominio` |
| `app_user.rol` ∈ 4 valores | `provisionar.ts:16` | ✅ 0086 (la pantalla de usuarios dice 5 — BAJO) |
| `gasto.monto >= 0`, `viaje.anticipo >= 0` | motor de cuadre | ✅ 0070 |
| Los totales de `liquidacion` no son negativos | PDF, `analytics.ts:631` | ❌ solo anti-NaN (MEDIO) |
| Un gasto no entra tras liquidar | `engine`, bandeja | ✅ triggers 0036/0037/0042 |
| Un huérfano cerrado tiene resolución | `resolverHuerfanos` | ✅ 0073 `comprobante_huerfano_cierre_coherente` |
| Una factura de proveedor decidida tiene decisor | `proveedores.ts:143-164` | ❌ sin coherencia (MEDIO) |
| Una factura de proveedor es de INGRESO | cola de aprobación + export ERP | ❌ ni siquiera se guarda el tipo (ALTO) |
| Un tier se contacta una sola vez por viaje | `cobranza.ts` (claim = insert) | ✅ 0089:57 `unique(viaje_id, tier)` — pero envenenable entre flotas (MEDIO) |
| `tiers`/`dias_semana` son arrays de enteros en rango | `cobranza_pura.ts:43-68` | ❌ jsonb libre, y el fallback es fail-open (MEDIO) |
| Toda fila hija cuelga del MISMO tenant que su padre | `getGastos`, KPIs | ⚠️ 4 pares en 0028 + 1 en 0073; falta `cobranza_contacto` (MEDIO) |
| `ocr_confianza` ∈ [0,1] | `types/likida.ts:46`, `0064:227` | ❌ `numeric(4,3)` a secas (BAJO) |
| `llegada_en <= descarga_en <= regreso_en` | 0090:16-17 (promesa del encabezado) | ❌ (BAJO) |
| `llm_costo` no tiene importes negativos | `costos.ts`, panel de IA | ❌ (el consolidado sí — BAJO) |
| Borrar una flota borra todo lo suyo | 0071 (medido) | ❌ roto por 0088; frágil por 0089 (ALTO) |
| Una conversación es de un usuario de ese tenant | `conversaciones.ts:45-59,63-93` | ❌ solo la app (ver nota abajo) |

Nota sobre `chat_conversacion`: la FK compuesta contra `app_user (id, tenant_id)`
**no se puede** poner hoy — `app_user.tenant_id` es NULLABLE (0001:17, `null =
superadmin`), y una FK compuesta MATCH SIMPLE no comprueba nada cuando una columna
es NULL. Es la misma razón que la 0028:51 dio para dejar fuera `wa_conversacion`.
El anclaje doble en `conversaciones.ts` es correcto y está bien argumentado; lo
anoto como límite conocido, no como hallazgo.

## Embeds ambiguos

Pares con **dos** relaciones (FK simple de la 0001/0040 + FK compuesta de la
0028/0073). Son **cinco**, los mismos que rompieron el 14-ago:

| par | constraints | embeds en el código | ¿alias? |
|---|---|---|---|
| `gasto → viaje` | `gasto_viaje_id_fkey` + `gasto_viaje_tenant_fkey` (0028:93) | ninguno | — |
| `liquidacion → viaje` | `liquidacion_viaje_id_fkey` + `liquidacion_viaje_tenant_fkey` (0028:94) | `repo.ts:214`, `analytics.ts:1302,1747`, `fiscal.ts:929`, `api/export/liquidaciones/route.ts:67` | ✅ todos `viaje:viaje_id(...)` |
| `codigo_pendiente → viaje` | `codigo_pendiente_viaje_id_fkey` + `..._viaje_tenant_fkey` (0028:95) | ninguno | — |
| `viaje → operador` | `viaje_operador_id_fkey` + `viaje_operador_tenant_fkey` (0028:96) | `analytics.ts:238,912,951,1302`, `escalar_viaje.ts:90`, `avisar_cierre.ts:59`, `fiscal.ts:769,929`, `agentes/cobranza.ts:107,348`, `api/export/liquidaciones/route.ts:67` | ✅ todos `operador:operador_id(...)` |
| `comprobante_huerfano → operador` | `comprobante_huerfano_operador_id_fkey` (0040:31) + `..._operador_tenant_fkey` (0073:30) | `repo.ts:384`, `repo.ts:1057` (`solicitud_arco`, otro par) | ✅ `operador:operador_id(...)` |

**No queda ningún embed sin desambiguar sobre un par ambiguo.** Barrí las 190
llamadas a `.select(...)` de `src/` (excluyendo tests) extrayendo cada token
`nombre(` del string. Los tres únicos embeds sin alias son:

- `src/lib/saas/suscripcion.ts:117` → `plan(nombre)`
- `src/lib/saas/transferencia.ts:133` → `plan(precio_mensual, moneda, nombre, precio_iva_incluido)`
- `src/lib/saas/transferencia.ts:350` → `tenant(nombre)`

y los tres son seguros: `suscripcion → plan` es una sola FK
(`plan_clave text not null references public.plan(clave)`, 0052:54) y
`factura_saas → tenant` también (0052:87). No hay FK compuesta hacia `plan` ni
hacia `tenant` en ningún lado.

Riesgo que sí queda: **la próxima FK compuesta rompe embeds a distancia y en
silencio.** No hay prueba ni bloque de `verificaciones.sql` que ate "pares con dos
relaciones" ↔ "embeds con alias"; el único guardián hoy es que alguien abra la
página.

## Lo que revisé y está bien

- **Los cuatro bloques nuevos de `verificaciones.sql`** (63–66, líneas 3052–3190):
  los cuatro traen corrida real fechada con los valores esperados al lado, y
  prueban lo que solo la base puede probar (CHECK del rol del chat, deny-all,
  cascade de mensajes, el claim `unique(viaje,tier)`, la ventana `hora_fin > hora_inicio`,
  el dedup `unique(tenant_id, cfdi_uuid)` de proveedores y su dominio de estado).
  `migraciones_verificadas.test.ts` obliga a que ninguna migración quede sin
  decisión, y las 91 la tienen.
- **RLS**: las 48 tablas creadas llevan `enable row level security`. Comparé la
  lista de `create table` contra la de `enable row level security` — no falta
  ninguna. Las cuatro nuevas van deny-all (RLS on, cero policies), que es el
  criterio correcto para tablas que solo toca el service role, y el bloque 63/64/66
  lo demuestra con `set local role authenticated`.
- **0086** reescribió las 22 policies una por una, sin `CASCADE`, contra
  `pg_policies` en vivo; el dominio de rol quedó consistente con `RolAppUser`.
- **0049** sigue siendo el mejor ejemplo del repo: `factura_total_cuadra`,
  `factura_borrador_sin_uuid`, `factura_vence_despues`, `pago_monto_positivo`,
  `factura_cfdi_unico` parcial. Es el estándar contra el que mido la 0091.
- **0075** validó las dos `NOT VALID` permanentes y le puso FK a `viaje_lock`.
- **Unicidades críticas del camino del dinero**: `liquidacion_viaje_uidx` (0005),
  `uq_viaje_abierto_por_operador` (0029), `uq_gasto_img_hash` por tenant (0027),
  `wa_conversacion_tenant_tel_uidx` (0005, que respalda el `onConflict` de
  `despacho_wa.ts:80`), `pod_viaje_unico` (0047), `suscripcion_una_viva` (0052),
  `factura_cfdi_unico`/`factura_folio_unico` (0049). Todas existen y todas tienen
  consumidor.
- **`chat/conversaciones.ts`** ancla `tenant_id` Y `user_id` en las cinco
  consultas, incluido el `update` de `updated_at`; un `conversacionId` ajeno abre
  una conversación nueva en vez de escribir en la del otro. Fallar cerrado, bien
  hecho.
- **0091** guarda `receptor_es_flota` calculado al ingerir en vez de recalcularlo,
  y admite `null` cuando no se pudo comparar. Es exactamente la regla de no
  inventar, aplicada a una bandera booleana.
- **`decidirFacturaProveedor`** usa `.eq('estado','pendiente')` como candado
  anti-carrera y lo dice en el mensaje al segundo clic.
- El rescate de claims huérfanos de `cobranza.ts:199-215` (borrar la fila
  `enviado=false, detalle IS NULL` de hace más de una hora) es un uso correcto del
  `unique` como recurso reclamable.

## Lo que NO alcancé a revisar

- **Las funciones `SECURITY DEFINER`** por dentro: `guardar_liquidacion_tx` (0013,
  0021, 0022), `enriquecer_gasto_atomico` (0017), `intake_delta` (0031),
  `sumar_combustible_ejercicio` (0084), `config_tenant_valida` (0026/0082/0083/0085),
  `try_lock_viaje` (0005). Leí sus encabezados y sus `grant/revoke`, no su cuerpo
  línea por línea. `config_tenant_valida` es 17 KB de esquema jsonb en tres
  versiones y merece un pase entero para ella sola.
- **Los triggers de "no tocar tras liquidar"** (0036, 0037, 0042): confirmé que
  existen y qué prometen; no verifiqué que cubran todas las columnas que hoy se
  escriben sobre un gasto (`cfdi_orden` y `autofactura_bloqueo*` son de la 0065,
  posteriores).
- **`tenant.config`** como dominio: la política viva de gastos vive ahí y la
  valida un trigger. No comprobé que el esquema del trigger empate con lo que
  `getConfig()`/`config.ts` leen hoy.
- **El grafo completo de `on delete`** de las ~48 tablas. Encontré las tres
  desviaciones de 0088/0089 comparando contra la 0071; no recorrí las ~45 FK
  restantes contra `tenant` una por una.
- **Las tablas vacías a propósito** (`cliente`, `unidad`, `tarifa`,
  `factura_emitida`, `posicion`, `geocerca`, `cotizacion`): leí sus CHECK y me
  parecen sólidos, pero no crucé cada uno contra el código que las va a escribir,
  porque ese código todavía no existe.
- **`0026`/`0082`/`0083`/`0085`** (la facilidad del 15% de RFA 2026 en la config
  del tenant): 65 KB entre las cuatro. Es donde vive el dominio de una regla
  fiscal de dinero y no me dio el tiempo.
