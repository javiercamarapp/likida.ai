# Modelo de datos y esquema — auditoría 24

**Nota: 6/10** (antes 5). Razón del movimiento: **se atacó y subió**. El rubro se
trabajó de frente y se nota: DATOS-C2 quedó cerrado de verdad (0286 empata por
`telefono_normalizado()` y no perdió una línea del cuerpo de la 0273), la
colisión 0283↔0299 quedó reconciliada sin pérdida (0300 es la unión, no una
recopia), el patrón NO se repitió en el otro par de riesgo (0288→0289 partió de
la definición correcta), y entraron restricciones reales donde antes había fe:
pisos de dinero en `gasto` y `cfdi_pago`, techo de abonos, formas de teléfono/
RFC/placas, dominio y firma de `liquidacion.revision`, `activo` dentro de las
cuatro funciones de RLS, y las policies de escritura del dinero retiradas. No
sube más porque la función estrella de la ronda —`revisar_liquidacion`— escribe
un estado que la base acepta y que el producto no sabe leer, y porque después de
la 0300 hay **dos definiciones distintas de «liquidación emitida»** conviviendo
en la misma base.

**El riesgo mayor hoy:** el único escritor nuevo que toca dinero
(`revisar_liquidacion(... 'ajustar')`) mueve `gasto.monto` sin mover su desglose
fiscal ni los acumulados de la liquidación, y no hay una sola restricción que
ate esas cifras entre sí — la póliza del mes es la primera que se entera.

---

## Hallazgos

### [CRÍTICO] `revisar_liquidacion(... 'ajustar')` deja el comprobante con un `monto` y un desglose fiscal que ya no se corresponden; la póliza del periodo se descuadra o se bloquea entera
`supabase/migrations/0299_revision_liquidacion.sql:384-396` · `src/lib/likida/contabilidad/poliza.ts:203-259` · `src/app/api/export/poliza/route.ts:170-183,354-369` · `supabase/verificaciones.sql:15781-15786`

La RPC hace **una sola escritura sobre el comprobante**:

```
384:  update gasto set monto = v_nuevo where id = v_gasto.id;
```

No toca `sub_total`, `iva_traslado`, `ieps_traslado`, `iva_retenido` ni
`isr_retenido`; y sobre la liquidación sólo mueve `total_comprobado` y
`diferencia` (`0299:391-396`), dejando intactos `iva_acreditable`,
`peaje_acreditable`, `litros_diesel_acreditables` e `ieps_acreditable`. No existe
ninguna restricción que ate `monto` a `sub_total + impuestos`: `0281:44-50` puso
el **piso** (`>= 0`) de esas cinco columnas y `0281:57-59` el techo del
descuento, pero nada las relaciona con `monto`; y `liquidacion_diferencia_cuadra`
(`0146:67-68`) sólo ata `diferencia = anticipo − comprobado`, que la RPC sí
mantiene. La base acepta el estado sin decir nada.

Escenario, con los valores del propio bloque 246 de la batería (que ejercita
exactamente este caso y no lo detecta porque su fixture inserta el gasto **sin**
`sub_total`):

Entra — CFDI de caseta de $8,000 leído por OCR como $800. En la base:
`gasto.monto = 800`, `sub_total = 689.66`, `iva_traslado = 110.34`;
`liquidacion.total_comprobado = 800`, `anticipo = 5,000`, `diferencia = 4,200`,
`iva_acreditable = 110.34`. El contralor abre `/dashboard/{id}`, pulsa
**Ajustar** y captura 8,000 con motivo «el ticket dice 8,000, el OCR leyó 800»
(`page.tsx:221-232`).

Sale mal — la fila queda: `gasto.monto = 8000` con `sub_total = 689.66` e
`iva_traslado = 110.34`; `total_comprobado = 8,000`, `diferencia = −3,000`,
`iva_acreditable = 110.34`. Al exportar la póliza del mes,
`poliza_datos_tenant` (`0281:84,86,122`) entrega `comprobado = 8,000` y
`subtotal = 689.66` para ese comprobante, y `poliza.ts` calcula
`comprobado (8,000) + retenciones (0) − subtotalDeclarado (689.66) −
ivaAcreditable (110.34) = 7,200.00` y **asienta un cargo de $7,200 a la cuenta
de «IVA/IEPS no acreditable»** (`poliza.ts:230,239-248`) — un impuesto que nunca
existió.

La mitad simétrica es peor: si el ajuste va **a la baja** (el OCR leyó $8,000 y
el ticket dice $800), `impuestoNoAcreditado` sale **negativo**, `poliza.ts:249-258`
lo declara «dato de origen roto» y `route.ts:358-369` devuelve **409
`polizas_incompletas` para el periodo COMPLETO**: un solo comprobante ajustado
tumba la exportación contable de todo el mes.

Consecuencia: el contador de la flota importa una póliza con un cargo fantasma
de $7,200 a una cuenta de impuestos —o no puede importar nada del mes— por haber
usado el botón que el producto le puso justo para eso. Es la regla número uno
del producto rota desde dentro: dos cifras del mismo hecho.
(Distinto del CRÍTICO de `backend.md:18`, que cubre el PDF no regenerado; aquí
lo que falla es la coherencia entre columnas de la base y la póliza.)

Causa raíz probable: la 0299 aplica una **delta aritmética** sobre el total a
propósito («no re-cuadra: un segundo motor en SQL sería dos cálculos»,
`0299:24-26`), pero el desglose fiscal por comprobante y los acumulados de la
liquidación sólo los produce el motor en TypeScript, y nadie lo vuelve a correr.

---

### [ALTO] Después de la 0300 hay dos definiciones de «liquidación emitida»: la del gasto excluye `rechazada`, la del viaje no — reasignar el operador de un viaje recién rechazado rebota con CU004
`supabase/migrations/0300_gasto_no_tras_liquidar_reconciliado.sql:47-49,62-64` vs `supabase/migrations/0158_integridad_fiscal.sql:361-365` · `supabase/migrations/0283_inmutable_tras_liquidar_y_pisos_rep.sql:136-150` · `src/lib/likida/repo.ts:338-343` · `supabase/migrations/0299_revision_liquidacion.sql:407-416`

La 0299/0300 calificaron la pregunta **sólo del lado del gasto**:
`select exists (select 1 from liquidacion where viaje_id = … and revision <> 'rechazada')`.
`viaje_no_tras_liquidar()` sigue con la forma cruda de la 0158:
`select exists (select 1 from liquidacion where viaje_id = new.id)` — sin filtro
de `revision` y sin el escape del GUC `likida.revision_en_curso`. Y la 0283
**amplió** el disparador de esa función a `fecha_inicio`, `fecha_fin`, `origen`,
`destino` y `cliente_id` (`0283:136-150`), así que la superficie del choque creció
en la misma ronda.

Escenario: VJ-0007 está `liquidado` con `liquidacion` emitida. El contralor
rechaza con motivo «este viaje era de Pedro, no de Juan». `revisar_liquidacion`
pone `liquidacion.revision = 'rechazada'` y `viaje.estatus = 'en_cuadre'`
(`0299:407-415`), y la pantalla contesta «VJ-0007 se rechazó y el viaje volvió a
cuadre» (`page.tsx:235-240`). El encargado entra a `/dashboard/despacho` y lo
reasigna a Pedro → `reasignarOperador` hace
`update viaje set operador_id = <Pedro>` (`repo.ts:340`) → dispara
`trg_viaje_no_tras_liquidar`, la fila de `liquidacion` **sigue existiendo** con
`revision='rechazada'`, y el UPDATE rebota con
**CU004 «el viaje … ya tiene liquidación emitida: su anticipo y su operador son
la base de ese papel y no se reeditan»**.

Consecuencia: el encargado lee, sobre un viaje que el panel acaba de declarar
«volvió a cuadre», que ese viaje ya tiene una liquidación emitida. Las dos frases
son de la misma base y sólo una puede ser verdad. El viaje queda inmovilizable
por esa vía; la única salida es `reabrir_viaje_tx`, que la pantalla de revisión no
ofrece. Y el mismo bloqueo aplica a `fecha_fin`, `origen`, `destino` y
`cliente_id` desde la 0283.

Causa raíz probable: la 0300 reconcilió la función que las dos ramas se pisaron,
pero el concepto que ambas cambiaron —qué cuenta como «emitida»— vive en DOS
funciones y sólo se actualizó una.

---

### [MEDIO] La FK compuesta de la 0290 lleva `on delete set null` sin lista de columnas: borrar un operador también vacía `app_user.tenant_id` y saca al usuario de su flota
`supabase/migrations/0290_forma_de_telefono_rfc_placas_y_operador_del_tenant.sql:111-113`

```
111: alter table public.app_user add constraint app_user_operador_tenant_fkey
112:   foreign key (operador_id, tenant_id) references public.operador (id, tenant_id)
113:   on delete set null not valid;
```

En Postgres, `ON DELETE SET NULL` **sin** lista de columnas anula **todas** las
columnas de la FK. El repo ya conoce la trampa y la documentó: `0145:21-25` dice
literalmente «`on delete set null (columna)` — anula SOLO esa columna», y las 20
FK compuestas de ese barrido la usan (`0145:138-166`, p. ej.
`'operador','operador_terminal_tenant_fkey','terminal_id','terminal','set null (terminal_id)'`).
La 0298 también la usa bien (`0298:54`, `on delete set null (terminal_id)`). La
0290 es la única de la ronda que la omite. `app_user.tenant_id` es nullable
(`0001:16`, «null = superadmin»), así que la anulación **sí ocurre**, en silencio.

Escenario: soporte borra un operador duplicado desde la consola de Supabase —
`delete from operador where id = '…9f2'`. La fila de `app_user` del encargado que
tenía ese `operador_id` queda con `operador_id = null` **y `tenant_id = null`**.
`get_user_tenant_ids()` (`0294:62-66`) devuelve `[]`, `ve_finanzas()` y
`administra_flota()` devuelven false: ese usuario abre `/dashboard` y ve la flota
vacía, sin un solo error, y su fila queda con la forma que el esquema reserva
para el superadmin. (Si además tiene tokens MCP vivos, la FK
`(user_id, tenant_id, rol)` de `0271:150,162` —sin `on update cascade`— hace
fallar el DELETE con un 23503 que apunta a una tabla que no tiene nada que ver.)

Causa raíz probable: la FK simple original (`0001`) tenía una sola columna, y al
convertirla en compuesta se copió el `on delete set null` tal cual.

---

### [MEDIO] `interruptor_tenant` admite tres pipelines y sólo uno tiene lector: apagar `ocr` o `cuadre` se guarda, se pinta apagado y no apaga nada
`supabase/migrations/0297_interruptores_por_tenant.sql:47` · `src/lib/likida/interruptor_tenant.ts:24-49` · `src/lib/likida/processor.ts:1499` · `src/lib/admin/negocio.ts:1076-1155` · `src/app/admin/flotas/[id]/ficha.tsx:199-215`

El dominio de la tabla es cerrado y correcto:
`check (pipeline in ('whatsapp','ocr','cuadre'))`. `/admin/flotas/[id]` pinta las
**tres** palancas (`PIPELINES_CHOFER = ['whatsapp','ocr','cuadre']`,
`negocio.ts:1077`, renderizadas en `ficha.tsx:215`) y `apagarPipelineDeTenant`
escribe cualquiera de las tres (`negocio.ts:1136-1155`). Pero el único consumidor
en todo `src/` es `processor.ts:1499`:
`if (await pipelineTenantApagado(op.tenantId, 'whatsapp'))`. `grep -rn
"pipelineTenantApagado" src/` fuera de pruebas devuelve exactamente esa línea. La
propia migración lo dice en su cabecera (`0297:32-38`: «LA APLICACIÓN DE ESTA
PALANCA … vive fuera de este agente»), pero la pantalla no lo dice.

Escenario: el OCR de Innovativos empieza a leer mal y a gastar de más. Javier
entra a `/admin/flotas/innovativos`, apaga **ocr** con motivo «lecturas malas,
revisando el prompt», y la ficha se lo pinta apagado con su nombre y su hora. El
webhook sigue llamando al modelo de OCR en cada foto de esa flota: 1,500 fotos y
~$27 USD ese día, con el interruptor en «apagado».

Consecuencia: el kill switch operativo miente en dos de sus tres posiciones, y
miente en el sentido peligroso («ya lo apagué»). Rompe la regla de la casa: un
rótulo tiene que ser verdad.

Causa raíz probable: la migración y la pantalla entraron por una rama y el
cableado del lector por otra; sólo llegó el brazo `whatsapp`.

---

### [BAJO] Tres huecos de numeración sin marca (0277, 0293, 0295): una rama futura que los rellene se aplica en un orden distinto en producción que en una base virgen
`supabase/migrations/` (existe 0276 y 0278; 0292 y 0294; 0294 y 0296)

`git log --all --name-only | grep -E '0277_|0293_|0295_'` no devuelve nada: esos
archivos nunca existieron en ninguna rama, y ninguna migración, prueba o doc los
menciona. Nada distingue «número saltado» de «migración perdida», y esta misma
ronda ya tuvo una colisión de numeración (0275→0276, #292/#300) con 15 ramas en
paralelo.

Escenario: un constructor ve el hueco y crea `0293_x.sql`. En producción —donde
0294…0301 ya están registradas— la CLI aplica sólo la pendiente, así que 0293
corre **después** de 0301. En CI o en una base nueva, todas están pendientes y se
aplican por orden de nombre, así que 0293 corre **antes** de 0294. Si 0293 toca
algo que la 0299 redefine (`gasto_no_tras_liquidar`, `mantenimiento_de_datos`,
`poliza_datos_tenant`, `ejecutar_arco_cancelacion` —las cuatro se redefinen más
de una vez en este mismo tramo—), producción y CI acaban con **cuerpos de
función distintos** y la batería verifica el que producción no tiene.

Consecuencia: el modo de falla exacto que produjo la 0300, reaparecido por la
puerta del nombre del archivo. Causa raíz probable: no hay ninguna comprobación
de contigüidad ni de colisión de prefijo en la compuerta.

---

### [BAJO] `tenant_perfil_merge` es la única función nueva de la ronda sin `revoke … from public, anon, authenticated`
`supabase/migrations/0296_tenant_perfil_merge.sql:78`

La 0296 hace sólo `grant execute … to service_role`. Postgres concede EXECUTE a
`PUBLIC` por defecto en toda función nueva, y la 0284 lo escribe con todas sus
letras dos migraciones antes: «El `revoke from public` NO basta: Supabase concede
EXECUTE explícito a anon/authenticated por default privileges (lección de la
0013)» (`0284:110-112`). Todas las demás de la ronda lo hacen (0278, 0280:115,
0282:155, 0284:112, 0288:78, 0289:76, 0298:268-272, 0299:448).

Escenario: `POST /rest/v1/rpc/tenant_perfil_merge` con la anon key y el JWT de un
`contador` y `{p_tenant_id:"<otra flota>", p_patch:{"regimenFiscalElegible":false}}`.
Hoy no pasa nada: la función es `security invoker` y `tenant` quedó de sólo
lectura por RLS en `0078:56`, así que el UPDATE toca 0 filas y la función lanza
su propio `not found` (`0296:58-64`). Es inerte **por una segunda capa**, no por
su propio grant.

Consecuencia: el día que alguien reponga una policy de UPDATE sobre `tenant`, ese
RPC pasa a ser un camino de escritura para `authenticated` sin que nadie lo
revise. Causa raíz probable: se copió el molde de la 0188 (que sí tenía el
revoke) sólo a medias.

---

### [BAJO] El KPI «Sin teléfono» del registro de operadores cuenta un estado que la 0290 acaba de prohibir
`supabase/migrations/0298_terminal_escritor_e_importacion.sql:152` · `supabase/migrations/0290_forma_de_telefono_rfc_placas_y_operador_del_tenant.sql:67-70` · `src/app/dashboard/operadores/vista.tsx:102-103`

`operadores_conteos_tenant` cuenta
`count(*) filter (where o.activo and btrim(o.telefono) = '')`. En la misma ronda,
`operador_telefono_forma` exige
`anonimizado_en is not null or telefono_normalizado(telefono) ~ '^[0-9]{10,15}$'`;
con `telefono = ''` la normalización devuelve `''`, el regex falla y el INSERT
rebota con 23514. `operador.telefono` es `not null` (`0001:32`), así que no hay
escape por NULL.

Escenario: en una base nueva (la del piloto), el KPI «Sin teléfono — los agentes
no pueden escribirles» sólo puede valer 0, para siempre. Consecuencia: un
indicador que jamás se enciende se lee como «este problema no existe en mi
flota», cuando en realidad ya no puede existir en ninguna. Causa raíz probable:
la constante y el contador entraron por ramas distintas (0290 vs 0298) y nadie
cruzó una contra la otra.

---

## Lo que revisé y está bien

- **DATOS-C2 está cerrado, y sin pérdida.** `0286:89-93` empata la conversación
  por `telefono_normalizado(c.telefono) = telefono_normalizado(v_telefono)`
  **además** de por `operador_id`, y lee el teléfono real en `0286:81` **antes**
  del UPDATE que lo vuelve `anon:…` (`0286:135-143`) — el orden importa y está
  bien. Comparado línea por línea contra `0273:35-145`: no se perdió el rechazo
  de `oposicion` (`0286:64-72`), ni el «ya estaba cerrada» (`0286:73-75`), ni el
  formato del seudónimo que dos bloques de la batería aseveran (`0286:77`), ni la
  cabecera `security invoker` + `search_path = public, extensions, pg_catalog`
  que la 0275 fijó (`0286:44-46`). Encima cerró DATOS-23-5 acotando el UPDATE de
  `incidencia_evento` a las incidencias de ESTE titular (`0286:111-131`).
- **La reconciliación 0283↔0299 es una unión real, no una recopia.**
  `0300:43-69` trae las DOS mitades de la 0283 (candado y comprobación sobre
  `old.viaje_id` en UPDATE) **y** las dos de la 0299 (escape por el GUC
  `likida.revision_en_curso`, `revision <> 'rechazada'`). Nada después de la 0283
  vuelve a crear `trg_gasto_no_tras_liquidar_update`, así que el `WHEN` ampliado
  de `0283:101-126` —`viaje_id`, `tenant_id`, `descuento`, `iva_retenido`,
  `isr_retenido`, `img_hash`— sobrevive intacto. La comparación `revision <>
  'rechazada'` no tiene el agujero del NULL: la columna es
  `not null default 'pendiente'` (`0299:58`).
- **El patrón NO se repitió en el otro par de riesgo.** `mantenimiento_de_datos`
  se redefine en 0288 y 0289 (ramas distintas), pero `0289:79` parte
  explícitamente de la definición de la 0288 y conserva sus dos purgas nuevas
  (`0289:133-136`) además de la suya. Comparadas línea por línea: sólo se agregan
  `geo_incidencia` y sus dos llaves de salida. Las otras dos funciones con más de
  una definición en el tramo (`poliza_datos_tenant` 0272→0281,
  `ejecutar_arco_cancelacion` 0273→0286) son secuenciales y la nueva es un
  superconjunto estricto de la anterior (verificado clave por clave contra
  `0272:42-58`).
- **Las unicidades críticas siguen puestas y bien elegidas.**
  `liquidacion_viaje_uidx` (`0005:9`) es lo que hace determinista el
  `select … into` de `viaje_revision_coherente` (`0299:203-205`);
  `uq_gasto_cfdi_uuid (tenant_id, cfdi_uuid, cfdi_orden)` (`0065:69`) es el
  candado del «mismo CFDI liquidándose dos veces»; `uq_gasto_img_hash`,
  `uq_gasto_wa_message_id` (`0164:98`) y `uq_cfdi_pago_docto` + la forma en
  minúsculas que la 0283 le añadió (`0283:187-189`) cierran las cuatro puertas de
  reingreso.
- **La 0283 acertó en lo que dejó FUERA del `WHEN`.** `pagado_en`/`pagado_forma`
  quedan fuera a propósito (`0283:129-132`) porque el REP llega semanas después
  del cierre; trabarlos habría cerrado el único camino por el que el IVA de un
  '99' se libera. Y `unidad_id`/`estatus` fuera del trigger del viaje
  (`0283:31-37`) por el mismo tipo de razón. Es la clase de decisión que
  normalmente se toma mal.
- **Los pisos de dinero que faltaban entraron con su razón medida.**
  `gasto_importes_no_negativos` y `gasto_descuento_no_excede` (`0281:44-61`,
  validados de inmediato), `cfdi_pago_importes_no_negativos` con
  `num_parcialidad >= 1` (`0283:200-206`), `codigo_pendiente_monto_no_negativo`
  (`0283:213-215`), `pago_recibido_techo` y `factura_pagada_con_pagos`
  (`0284:116-203`, con `for update` sobre la factura ANTES de sumar, así que se
  serializan contra `cancelar_factura_tx`).
- **`0292` no rompió nada al convertir las policies.** El bucle recrea cada
  `tenant_data`/`tenant_finanzas` con **su propia** `qual` leída del catálogo
  (`0292:63-79`), y en las 279 migraciones no existe una sola policy
  `RESTRICTIVE` ni una sola con cláusula `TO <rol>` (grep), que son los dos
  atributos que ese round-trip perdería. Las de escritura del dinero se retiran
  por nombre (`0292:84-93`) y la app escribe todo por `service_role`.
- **`0294` cierra la baja en la base, no en la app.** Las cuatro funciones de RLS
  filtran `and activo` (`0294:62-89`) y los grants se reafirman (`0294:94-101`);
  `app_user_activo_coherente` (`0294:57-59`) impide la fila que dice
  `activo=false` sin fecha de baja.
- **`0297` es deny-all de verdad:** `enable row level security` sin una sola
  policy (`0297:79`), PK `(tenant_id, pipeline)`, dominio cerrado y
  `apagado ⇒ motivo no vacío` (`0297:62-64`). El problema de esa tabla es el
  lector, no el esquema.
- **`0299` puso más reglas en la tabla de las que la RPC necesitaba**, que es lo
  correcto: dominio (`:75-76`), coherencia firma↔fecha (`:80-85`), motivo
  obligatorio al ajustar/rechazar (`:89-90`), `ajustes` como arreglo (`:93-94`),
  y `viaje.estatus ↔ liquidacion.revision` como constraint trigger **diferido**
  (`:225-234`) para que `reabrir_viaje_tx` siga funcionando. El backfill
  (`:105-109`) corre antes de crear el trigger, así que no se autobloquea. La
  exclusión de `duplicado`/`monto_invalido` en el ajuste (`:375-382`) empata
  exactamente el filtro de `totalComprobado` en `cuadre/engine.ts:595-598`, así
  que `liquidacion_totales_no_negativos` no se puede violar por la delta.
- **`0288` retira `posicion_sin_duplicado` sin romper a nadie:** ningún
  `on conflict` de `src/` lo nombra (`sincronizar_gps.ts:230` usa
  `tenant_id,unidad_id,medida_en`) y `verificaciones.sql:16145-16152` lo asevera.
- **`repo.ts` ya adoptó `tenant_perfil_merge`** (`repo.ts:123-138`), aunque la
  cabecera de la 0296 lo deje anotado como pendiente: el «lost update» de
  `guardarPerfilPatch` está cerrado de verdad.

## Lo que NO alcancé a revisar

- **No hay Postgres aquí.** Todo lo anterior es lectura de SQL; no ejecuté una
  sola migración ni `verificaciones.sql`. Los tres puntos donde eso más pesa: (a)
  si `0292:63-79` re-parsea sin error TODAS las `qual` reales del catálogo de
  producción; (b) si el `validate constraint` envuelto de `0290:120-140` y
  `0291:67-82` deja alguna restricción en `not valid` sobre los datos actuales
  (el NOTICE sólo se ve en el log del deploy); (c) si `0278` sobrevive a un
  `tenant.config` que no sea un objeto (`config - 'agentes'` sobre un arreglo).
- **La reversibilidad no la evalué de forma sistemática.** Ninguna de las 24
  migraciones nuevas trae bloque de reversa (la 0024 y la 0028 sí lo traían); no
  reconstruí el `down` de cada una para decir cuáles son de verdad reversibles.
  Lo que sí verifiqué es que todas son idempotentes al reaplicarse
  (`if not exists` / `create or replace` / `drop … if exists`).
- **`src/types/likida.ts` sólo lo crucé contra `liquidacion` y `gasto`.** No
  barrí las ~40 tablas restantes buscando el patrón «tipo de TS más estricto que
  la columna»; los dominios que sí miré (`ConceptoGasto` ↔
  `gasto_concepto_dominio` `0025:87-88`, `EstatusLiquidacion` ↔
  `liquidacion_estatus_dominio` `0025:126-127`, `RevisionLiquidacion` ↔
  `liquidacion_revision_dominio` `0299:75-76`) empatan exactamente.
- **`geocerca`, `portal_credencial`, `invitacion`, `campania`/`envio_mensaje`**
  siguen sin escritor y no las audité: no cambiaron en este tramo. Nota lateral
  para legal/ARCO: `ejecutar_arco_cancelacion` borra de `envio_mensaje`
  (`0286:96-100`), que es la tabla **muerta de facto**; no toca `campana` ni
  `wa_outbox` —esta última guarda el `payload` con el teléfono y desde `0288:57-75`
  vive 90 días—. No lo reporto como hallazgo porque el radio de la promesa ARCO
  es del rubro legal, pero conviene que alguien lo mire.
- **No corrí `npx vitest`.** Ninguna de las conclusiones de arriba depende de una
  prueba: todas salen de leer el SQL y el llamador.
