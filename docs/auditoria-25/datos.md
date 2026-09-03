# Modelo de datos y esquema — auditoría 25

**Nota: 5/10** (antes 6). Razón del movimiento: **mirada más profunda — el código
no cambió, la nota anterior estaba inflada**. Las dos migraciones nuevas de esta
ronda (0302/0303) están bien hechas del lado del esquema —el `DROP FUNCTION` va
firmado con los tipos correctos y la reparación del bloque 154 de la batería es
real, no un silenciador—, así que la baja no viene de ellas. Viene de que, al
aplicar el chequeo que distingue el rubro (*para cada invariante que el código
asume, ¿la base la impone?*) sobre superficie que las rondas 23 y 24 no
recorrieron, aparecieron **dos ALTOS preexistentes del mismo tipo**: un dominio
`CHECK` que **rechaza** un valor que el código escribe todos los días (y tira el
costo de cada nota de voz), y un índice único **parcial** usado como blanco de un
`upsert` de PostgREST, que es exactamente el modo de falla que la propia 0176
documentó y arregló para otra tabla. Sumado a que DATOS-C1 sigue abierto una
ronda después, la base sigue aceptando estados que el producto no sabe leer.

**El riesgo mayor hoy:** después de `revisar_liquidacion(… 'ajustar')` la fila de
`liquidacion` afirma un total nuevo, su desglose fiscal afirma el viejo, y
`entregada_operador_en` afirma que el PDF del total viejo **ya se entregó** — tres
verdades incompatibles en la misma fila, y ni una sola restricción que las ate.

---

## Hallazgos

### [CRÍTICO] (REINCIDENTE, DATOS-C1) Ajustar una liquidación deja tres cifras del mismo hecho en desacuerdo, y la base no tiene una sola restricción que lo impida — incluido el sello que dice que el PDF viejo ya se entregó
`supabase/migrations/0299_revision_liquidacion.sql:384-396` · `supabase/migrations/0281_poliza_v2_cubetas_sin_copias.sql:44-61` · `supabase/migrations/0146_gasto_finanzas_y_dominios_liquidacion.sql:61-68` · `supabase/migrations/0279_liquidacion_sellos_de_entrega.sql:27-37` · `src/lib/likida/processor.ts:1063,4266`

**Sigue igual.** Verificado línea por línea contra el archivo de hoy: la RPC hace
**una sola escritura sobre el comprobante** (`0299:384`,
`update gasto set monto = v_nuevo where id = v_gasto.id`) y **dos columnas** sobre
la liquidación (`0299:391-396`, `total_comprobado` y `diferencia`). No hay
migración posterior que la redefina (`grep -n "revisar_liquidacion" supabase/migrations/*.sql`
solo devuelve la 0299).

Mi ángulo, el que pidió el encargo — **¿la base lo impide?** No. Barrí las
restricciones vivas de las dos tablas:

- `gasto_importes_no_negativos` (`0281:44-50`) pone **piso** a `sub_total`,
  `iva_traslado`, `ieps_traslado`, `iva_retenido`, `isr_retenido`. Ninguna las
  **relaciona** con `monto`.
- `gasto_descuento_no_excede` (`0281:57-59`) ata `descuento` a `sub_total`, no a
  `monto`.
- `liquidacion_totales_no_negativos` y `liquidacion_diferencia_cuadra`
  (`0146:61-68`) atan `diferencia = total_anticipo − total_comprobado`, que es
  justo lo único que la delta de la RPC **sí** mantiene.
- No existe ninguna columna persistida de deducibilidad
  (`grep "total_deducible\|total_no_deducible\|total_por_confirmar" supabase/migrations/*.sql`
  → vacío), así que el desacuerdo no se puede ni detectar por fuera.
- Y lo que la ronda anterior no midió: **`entregada_operador_en` /
  `avisada_oficina_en` (`0279:27-28`) no se limpian.** `grep -rn
  "entregada_operador_en" supabase/ src/` fuera de pruebas devuelve la 0279, los
  bloques de la batería y **solo dos escritores** (`processor.ts:1063,4266`, que
  los **ponen**). Nadie los borra nunca, y `revisar_liquidacion` tampoco.

Escenario, con valores: caseta de $8,000 leída por OCR como $800. En la base
`gasto.monto = 800`, `sub_total = 689.66`, `iva_traslado = 110.34`;
`liquidacion.total_comprobado = 800`, `iva_acreditable = 110.34`,
`pdf_url = '…/VJ-0007.pdf'` (con $800 impreso), `entregada_operador_en =
'2026-09-03T10:04Z'`. El contralor pulsa **Ajustar** y captura 8,000. Sale:
`monto = 8000` con `sub_total = 689.66`, `total_comprobado = 8000`,
`iva_acreditable = 110.34`, **el mismo `pdf_url` con $800** y el sello de
entrega intacto. `INSERT`/`UPDATE` aceptados sin una sola queja de la base.

Consecuencia: el contralor tiene en la mano un PDF de $800 que la base declara
**entregado**, un renglón de $8,000 en el panel, y una póliza que asienta
$7,200 de "IVA/IEPS no acreditable" que nunca existió. El reintento del «listo»
(`processor.ts`, rama sin viaje abierto) lee `entregada_operador_en` con fecha y
**no vuelve a mandar nada**: no hay camino, ni automático ni manual, por el que
el chofer reciba el PDF corregido. Es la regla número uno del producto rota
desde dentro.

Causa raíz probable: la 0299 decidió a propósito ajustar por delta y **no
re-cuadrar** (`0299:24-26`), pero el desglose fiscal, los acumulados y el PDF
solo los produce el motor en TypeScript, y el estado "hay que rehacerlos" no
existe como columna ni como restricción.

---

### [ALTO] `llm_costo_fase_dominio` rechaza `'transcripcion'`: el costo de cada nota de voz del chofer se descarta en silencio desde el 29-ago, y la cifra con la que se fija el precio del producto queda corta
`supabase/migrations/0025_dominios_check.sql:146-147` · `src/lib/likida/costos.ts:41,134-150` · `src/lib/likida/voz_transcrita.ts:117-120` · `src/lib/likida/processor.ts:1563` · `src/lib/likida/agentes/finanzas.ts:170-176`

El CHECK vivo enumera **seis** fases:

```
0025:146:      ('llm_costo', 'llm_costo_fase_dominio',
0025:147:       $c$fase in ('ocr','cuadre','escalacion','chat','router','whatsapp')$c$),
```

y **ninguna migración posterior lo recrea** —`grep -rn "llm_costo_fase_dominio"
supabase/migrations/*.sql` devuelve solo esas dos líneas, y `grep -rn
"transcripcion" supabase/` devuelve **cero**—. El tipo de TS, en cambio, tiene
**siete** desde el 29-ago-2026 (`git log -S"transcripcion" -- src/lib/likida/costos.ts`):

```
costos.ts:41: export type FaseCosto = 'ocr' | 'cuadre' | 'escalacion' | 'chat' | 'router' | 'whatsapp' | 'transcripcion';
```

Escenario, con valores: el chofer manda una nota de voz por WhatsApp →
`processor.ts:1563` llama `transcribirNotaDeVoz` → transcribe con
`role: 'transcripcion'` y liquida $0.0021 USD → `voz_transcrita.ts:117-120`
llama `registrarCosto({ …, fase: 'transcripcion', costoUsd: 0.0021 })` →
`costos.ts:134-150` hace `INSERT INTO llm_costo (…, fase) VALUES (…,
'transcripcion')` → Postgres devuelve **23514 `llm_costo_fase_dominio`**.
`registrarCosto` es best-effort: no lanza, escribe una línea
`costo.no_registrado` (`costos.ts:159-166`) y sigue. La liquidación se cierra
normal —`vincularCostosALiquidacion` no grita, porque el viaje sí tiene filas de
`ocr` y `cuadre`—, así que **nada visible falla**.

Consecuencia: Likida cobra por liquidación y su costo unitario es la cifra con
la que se fija el precio (la banda declarada es `BANDA_COSTO_VIAJE_USD = 0.037`,
`finanzas.ts:181`). Cada nota de voz gasta modelo y **ninguna** entra a la
medición: el costo unitario que ve `/admin/consumo` y el parte de control de
costos sale sistemáticamente bajo, exactamente el modo de falla que la cabecera
de `costos.ts:6-14` dice existir para impedir ("un costo no registrado tiene que
verse distinto de un costo bajo"). Peor: `ROL_POR_FASE` (`finanzas.ts:170-176`)
mapea `transcripcion: 'transcripcion'` para el chequeo U1 del agente de costos —
un chequeo **insatisfacible por construcción**, porque no puede existir una fila
con esa fase. No es CRÍTICO porque no mueve una cifra fiscal del cliente; es
ALTO porque falla en silencio y contamina la única cifra con la que se decide el
precio.

Causa raíz probable: la fase entró en TS con la función de voz y nadie tocó el
dominio de la 0025; no hay ninguna prueba que cruce `FaseCosto` contra el CHECK
(`grep -rln "llm_costo_fase_dominio\|FaseCosto" src/` devuelve **un solo
archivo**, `costos.ts`).

---

### [ALTO] `factura_saas_stripe_unica` es un índice único **parcial** y el webhook de Stripe lo usa como blanco de `onConflict`: el `upsert` no puede inferirlo y revienta con 42P10 — la trampa que la 0176 ya documentó para otra tabla
`supabase/migrations/0052_saas_plan_suscripcion.sql:105-106` · `src/lib/saas/suscripcion.ts:865,889-891` · `src/app/api/stripe/webhook/route.ts:232` · (contraste) `supabase/migrations/0176_gps_ingesta.sql:59-67`

El índice:

```
0052:105: create unique index if not exists factura_saas_stripe_unica
0052:106:   on public.factura_saas (stripe_invoice_id) where stripe_invoice_id is not null;
```

El llamador:

```
suscripcion.ts:865: const { error } = await supabaseAdmin().from('factura_saas').upsert(
suscripcion.ts:889:     { onConflict: 'stripe_invoice_id' },
suscripcion.ts:891: if (error) throw new Error(`aplicarFactura: ${error.message}`);
```

PostgREST traduce eso a `INSERT … ON CONFLICT (stripe_invoice_id) DO UPDATE …`
**sin** predicado. Postgres solo infiere un índice único parcial si el
`ON CONFLICT` repite su `WHERE`; sin él aborta con
`42P10: there is no unique or exclusion constraint matching the ON CONFLICT
specification`. **El repo ya conoce esta trampa y la escribió con todas sus
letras** dos años de migraciones antes, al arreglar la misma forma en `posicion`:

```
0176:60: -- cierto pareciera inofensivo: con un único PARCIAL, PostgREST no puede
0176:61: -- inferir el índice a partir de `on_conflict=tenant_id,unidad_id,medida_en` y
0176:62: -- el upsert del poller reventaría con «no unique or exclusion constraint
0176:63: -- matching the ON CONFLICT specification». El predicado decorativo habría
0176:64: -- costado la ingesta entera.
0176:65: drop index if exists uq_posicion_lectura;
0176:66: create unique index uq_posicion_lectura
0176:67:   on public.posicion (tenant_id, unidad_id, medida_en);
```

`factura_saas_stripe_unica` sigue con el predicado, y encima **decorativo**: un
índice único no parcial sobre una columna nullable ya trata cada NULL como
distinto, así que el `where … is not null` no compra nada (la razón de que haya
NULLs está en `0163:114`, `check ((metodo_cobro = 'stripe') = (stripe_invoice_id
is not null))`).

Escenario, con valores: Stripe entrega `invoice.payment_succeeded` con
`invoice.id = 'in_1QabcXYZ'`, $2,900 MXN, periodo 2026-09-01→2026-09-30 →
`route.ts:232` llama `aplicarFactura` → PostgREST emite
`ON CONFLICT (stripe_invoice_id) DO UPDATE` → 42P10 →
`throw new Error('aplicarFactura: …')` → el webhook contesta 500 → Stripe
reintenta y se rinde. La fila de `factura_saas` **nunca entra**.

Consecuencia: la primera flota que pague por Stripe queda cobrada en Stripe y
**sin factura registrada** en Likida. `/admin` la ve como no pagada, el agente de
cobranza le insiste por un mes que ya liquidó, y la contabilidad de la empresa
no tiene el ingreso. Es dinero, y es dinero del propio Likida. Lo dejo en ALTO y
no en CRÍTICO porque revienta ruidoso en el log de Vercel y hoy no hay un solo
cliente cobrando — pero se estrena con el primero. Barrí los **16 `onConflict`
restantes** de `src/` contra los índices reales y **éste es el único** que apunta
a un índice parcial (ver "Lo que revisé y está bien").

Causa raíz probable: la 0052 nació antes de que la 0176 aprendiera la lección, y
la lección se escribió en el comentario de una migración en vez de en una prueba
que barra todos los `onConflict` del repo.

---

### [ALTO] (REINCIDENTE, DATOS-24) Siguen conviviendo dos definiciones de «liquidación emitida»: la del gasto excluye `rechazada`, la del viaje no
`supabase/migrations/0158_integridad_fiscal.sql:355-378` · `supabase/migrations/0283_inmutable_tras_liquidar_y_pisos_rep.sql:135-150` · `supabase/migrations/0300_gasto_no_tras_liquidar_reconciliado.sql:47-49,62-64` · `src/lib/likida/repo.ts:338-343` · `supabase/migrations/0299_revision_liquidacion.sql:407-416`

**Sin cambio.** `grep -rn "viaje_no_tras_liquidar" supabase/migrations/*.sql`
devuelve solo 0158 (que la crea) y 0283 (que solo recrea el **trigger**, no la
función). El cuerpo vigente es todavía el crudo de la 0158:

```
0158:362:  select exists (select 1 from liquidacion where viaje_id = new.id) into ya;
```

— sin filtro de `revision` y sin el escape por el GUC `likida.revision_en_curso`
que la 0299/0300 sí le dieron a la mitad del gasto.

Escenario, con valores: VJ-0007 `liquidado`. El contralor rechaza con motivo
«este viaje era de Pedro, no de Juan» → `0299:407-415` pone
`liquidacion.revision = 'rechazada'` y `viaje.estatus = 'en_cuadre'` (pasa: el
trigger solo mira `anticipo, operador_id, fecha_inicio, fecha_fin, origen,
destino, cliente_id`, `0283:136-150`). El encargado reasigna a Pedro →
`repo.ts:340` hace `update viaje set operador_id = '…Pedro'` → el trigger
encuentra la fila de `liquidacion` (rechazada, pero **existe**) → **CU004 «el
viaje … ya tiene liquidación emitida»**.

Consecuencia: sobre el mismo viaje, el panel dice «volvió a cuadre» y la base
dice «ya tiene liquidación emitida». Solo una puede ser verdad y el encargado no
tiene forma de saber cuál. El viaje queda inmovilizable por esa vía, y desde la
0283 el mismo bloqueo aplica también a fechas, origen, destino y cliente.

Causa raíz probable: el concepto que 0299/0300 cambiaron vive en DOS funciones y
solo se actualizó una.

---

### [MEDIO] La 0303 escribe `prompt_ref = NULL` en nueve agentes `vivo`, y el único lector de esa columna trata NULL como deuda documental: el parte semanal nace con nueve alarmas que ya nadie puede apagar
`supabase/migrations/0303_gradua_agentes_experimentales_auditados.sql:51,64-67` · `src/lib/likida/agentes/backoffice.ts:605-615,650-652,663-675` · `supabase/migrations/0116_agente_definicion.sql:54` · `supabase/migrations/0230_agentes_crecimiento.sql:56-65` · `supabase/migrations/0234_agentes_ingenieria.sql:79-87` · `supabase/migrations/0235_agentes_direccion_y_leads.sql:66-76`

`prompt_ref` es `text` nullable (`0116:54`), así que la base acepta el NULL sin
chistar — la pregunta es quién lo lee. El único lector es el agente de
documentación:

```
backoffice.ts:606:    if (f.estado !== 'vivo') continue;
backoffice.ts:611:    if (!f.promptRef || !f.promptRef.trim()) faltas.push('sin prompt_ref al blueprint');
backoffice.ts:613:      cambios.push({ tipo: 'sin_descripcion', agente: f.id, detalle: `VIVO Y SIN DOCUMENTAR: ${faltas.join(' · ')}.` });
```

y los nueve que la 0303 vacía **son los nueve `vivo`**: `0230:56-65` los pone
`estado='vivo'` (seo_distribucion, guiones, noticias_mercado, promos_diarias,
visuales, video_demo, video_marketing), `0234:79-87` a `pruebas`, `0235:66-76` a
`cazador`.

Escenario, con valores: el lunes siguiente al deploy corre el parte de
documentación. Antes decía `DEUDA DOCUMENTAL: ninguna` (`backoffice.ts:650`).
Después dice `DEUDA DOCUMENTAL (agentes VIVOS, 9):` con nueve renglones
idénticos `· cazador: VIVO Y SIN DOCUMENTAR: sin prompt_ref al blueprint.`, y los
volverá a decir cada lunes para siempre, porque no hay escritor de `prompt_ref`
—`darDeAltaAgente` (`definiciones.ts:156-161`) solo lo escribe en el **alta**, y
`graduarAgente` (`definiciones.ts:183-189`) no lo toca—.

Consecuencia: el parte que existe para cazar drift entre catálogo y código nace
con nueve falsos positivos permanentes. Una alarma que grita todas las semanas y
que nadie puede apagar se deja de leer, y con ella se dejan de leer las
verdaderas. La 0303 argumenta bien por qué NULL es mejor que una referencia
colgante (`0303:34-40`); lo que no hizo fue mirar quién lee la columna.

Causa raíz probable: la migración razonó sobre el significado del dato y no sobre
sus consumidores; nada en el repo cruza `prompt_ref` contra `backoffice.ts`.

---

### [MEDIO] El sub-chequeo (c) del bloque 249 declara probar que la 0303 reescribió las nueve descripciones, y pasaría en verde aunque el `CASE WHEN` entero se borrara
`supabase/verificaciones.sql:15490-15501,15520-15525,15544-15552` · `supabase/migrations/0230_agentes_crecimiento.sql:98-125` · `supabase/migrations/0234_agentes_ingenieria.sql:109-112` · `supabase/migrations/0235_agentes_direccion_y_leads.sql:122-125`

El bloque afirma: *«(c) los NUEVE quedan con una `descripcion` que YA NO contiene
ninguna de las frases originales de la 0125 … — el CASE WHEN de la migración de
verdad reescribió las nueve filas, no solo algunas»* (`verificaciones.sql:15496-15501`),
y busca cinco frases (`:15520-15525`). Comparé el estado **anterior a la 0303**
contra esas cinco, fila por fila:

- `noticias_mercado`, 0125:102 → *«Investiga a diario el mercado…»*; pero la
  descripción vigente al llegar la 0303 es la de `0230:103-105` → *«Carrusel del
  mercado con fuente POR DATO (0230)…»*. La frase ya no estaba.
- `seo_distribucion`, 0125:60 → *«Decide dónde se pone cada pieza.»*; vigente
  `0230:93-95` → *«Audita lo que EXISTE (0230)…»*. Ya no estaba.
- `cazador`, 0125:40 → *«Reactiva el scraper del censo…»*; vigente `0235:122-125`
  → *«El ENCARGO de caza sobre lo que YA está en la base (0235)…»*. Ya no estaba.
- `pruebas`, 0125:77 → *«…ESCRIBE código de prueba…»*; vigente `0234:109-112` →
  *«Vigila los RESULTADOS que sí llegan a la base (0234)… NO corre la suite…»*.
  Ya no estaba.
- `'destila hooks con whisper'` **no existió nunca en ninguna fila**: el texto de
  la 0125:101 dice *«destila HOOKS de los videos de referencia de Javier (whisper
  local)»* —que no contiene la subcadena— y el vigente (`0230:98-100`) dice *«no
  destila hooks nuevos»*. Esa frase salió de la **prosa** de la 0301:15-16, no del
  dato.

Escenario, con valores: si alguien borrara el bloque
`descripcion = case id … end` de `0303:52-63` y dejara solo
`experimental = false, prompt_ref = null`, el bloque 249 imprimiría
`con_frase_vieja=ninguno` y **pasaría en verde**, afirmando que las nueve
descripciones se reescribieron. Cero de sus cinco sondas puede dispararse.

Consecuencia: la batería es el único sitio del repo donde se comprueba lo que
solo la base puede demostrar, y este sub-chequeo mide algo que otras tres
migraciones ya habían garantizado tres meses antes. Es exactamente la falla que
`migraciones_verificadas.test.ts:13-19` cuenta como su razón de existir (la
0030): un chequeo que dice verificar algo y no lo verifica. Los otros cuatro
sub-chequeos del bloque —(a) `experimental=false` uno por uno, (b) `prompt_ref is
null`, (d) `redactor` intacto, (e) el default de columna— **sí tienen dientes**;
el hallazgo es solo (c).

Causa raíz probable: las frases se copiaron de la narración de la 0301 en vez de
leerse de la última definición vigente de cada fila.

---

### [MEDIO] (REINCIDENTE, DATOS-24) La FK compuesta de la 0290 sigue con `on delete set null` sin lista de columnas: borrar un operador también vacía `app_user.tenant_id`
`supabase/migrations/0290_forma_de_telefono_rfc_placas_y_operador_del_tenant.sql:111-113`

**Sin cambio** (`grep -rn "app_user_operador_tenant_fkey" supabase/ src/` → solo
la 0290). Sigue leyéndose:

```
0290:111: alter table public.app_user add constraint app_user_operador_tenant_fkey
0290:112:   foreign key (operador_id, tenant_id) references public.operador (id, tenant_id)
0290:113:   on delete set null not valid;
```

En Postgres, `ON DELETE SET NULL` **sin** lista anula **todas** las columnas de
la FK. El repo documenta la forma correcta en `0145:21-25` y la usa en sus 20 FK
compuestas; la 0298:54 también (`on delete set null (terminal_id)`). La 0290 es
la única que la omite.

Escenario, con valores: soporte borra un operador duplicado desde la consola
(`delete from operador where id = '…9f2'`). La fila de `app_user` del encargado
que lo tenía queda con `operador_id = null` **y `tenant_id = null`** —
`app_user.tenant_id` es nullable desde `0001:17` («null = superadmin»)—.
`get_user_tenant_ids()` devuelve `[]`, ese usuario abre `/dashboard` y ve su
flota vacía sin un solo error, con una fila que tiene la forma reservada al
superadmin.

Causa raíz probable: al convertir la FK simple original en compuesta se copió el
`on delete set null` tal cual.

---

### [BAJO] `agente_definicion_modelo_rol_dominio` y `ModelRole` divergieron en las dos direcciones: la base rechaza tres roles que existen y acepta dos que ya no
`supabase/migrations/0125_catalogo_completo_y_modelo_rol.sql:23-27` · `src/lib/llm/models.ts:39` · `src/lib/likida/agentes/definiciones.ts:115,145`

El CHECK admite 13: `ocr, cuadre, cuadre_fallback, chat, chat_ligero, router,
back_office, analisis, extraccion, marketing, codigo, codigo_escritura, qa`
(`0125:25-27`). `ModelRole` (`models.ts:39`) tiene 14: los mismos **menos**
`chat_ligero` y `router`, **más** `piloto`, `transcripcion` y `contador`.

Escenario, con valores: una migración futura que declare el agente piloto con
`update agente_definicion set modelo_rol = 'piloto' where id = 'piloto_qa'`
rebota con 23514 `agente_definicion_modelo_rol_dominio` y aborta el deploy. Del
otro lado, `update … set modelo_rol = 'chat_ligero'` entra sin problema y
`/admin/agentes` (`contenido.tsx:164-165`) pinta un rol que `models.ts` ya no
sabe resolver — no truena porque el tipo de TS es `string | null`
(`definiciones.ts:115,145`), que aquí es más **laxo** que la columna, no más
estricto.

Consecuencia: deuda. Hoy nadie escribe `modelo_rol` desde la app
(`darDeAltaAgente` no lo incluye), así que el daño es el próximo deploy que
falle a mitad y un rótulo del panel que puede mentir. Causa raíz probable: el
dominio se congeló en la 0125 y `models.ts` siguió creciendo, sin prueba que los
cruce.

---

### [BAJO] (REINCIDENTES verificados de la 24, sin cambio) tres deudas menores siguen exactamente donde estaban
- **Huecos de numeración sin marca.** `ls supabase/migrations/` de hoy sigue sin
  0277, 0293 ni 0295, y las dos migraciones nuevas (0302, 0303) **no los
  rellenaron**: nada distingue "número saltado" de "migración perdida", y una
  rama futura que ocupe el 0293 se aplicaría después de la 0301 en producción y
  antes de la 0294 en una base virgen.
- **`tenant_perfil_merge` sin `revoke`.** `0296:78` sigue siendo solo
  `grant execute … to service_role`; Postgres concede EXECUTE a PUBLIC por
  defecto y la 0284:110-112 explica por qué eso no basta en Supabase. Inerte hoy
  por la RLS de `tenant`, no por su propio grant.
- **KPI «Sin teléfono» insatisfacible.** `0298:152` cuenta
  `btrim(o.telefono) = ''` mientras `operador_telefono_forma` (`0290:67-70`) ya
  prohíbe esa fila: en una base nueva el indicador solo puede valer 0, para
  siempre, y se lee como «este problema no existe en mi flota».

---

## Lo que revisé y está bien

- **La 0302 está bien firmada, y era el riesgo obvio de la ronda.** El
  `drop function if exists public.reservar_presupuesto_llm(uuid, uuid, uuid,
  numeric, numeric, numeric)` (`0302:21-23`) tiene **seis** tipos; la firma que
  crean 0186:45 y 0193:13-19 es exactamente
  `(uuid, uuid, uuid, numeric, numeric, numeric) returns boolean`, y la que crea
  0244:181-190 tiene **ocho** (`+ text, numeric`) y devuelve `text`. Aridad
  distinta ⇒ Postgres no puede confundirlas: el DROP no puede tirar la de 8.
  Ninguna de las dos declara `DEFAULT` en sus parámetros, así que tampoco hay
  ambigüedad por defaults. El único llamador real
  (`budget.ts:395-406`) manda los **ocho** argumentos nombrados y ya interpreta
  el retorno de texto (`'ok'|'tope_tenant'|'tope_proposito'|'tope_run'`,
  `budget.ts:411-419`).
- **La reparación del bloque 154 es real, no un silenciador.** Cambió la llamada
  a la firma de 8 con `proposito='fondo'` y `reserva_interactivo_usd=0`
  (`verificaciones.sql:8877,8884`). Verificado contra el cuerpo de la 0244: con
  la reserva de interactivo en cero, el sub-tope de fondo (`0244:239`,
  `usado_fondo + p_reserva_usd > p_tope_tenant_usd - 0`) coincide con el tope del
  tenant, y además la comprobación del tope de tenant (`0244:228`) corre
  **antes**, así que el caso (d) sigue devolviendo `'tope_tenant'` por la misma
  razón por la que antes devolvía `false`. La garantía que el bloque aseveraba
  —día MX + expiración de reservas— es idéntica.
- **El retiro del bloque 248 no perdió cobertura.** Su sub-chequeo (d), el
  default de columna `experimental = false`, se absorbió literalmente en el 249
  como (e) (`verificaciones.sql:15558-15563`), y 0301 entró a `EXENTAS` con la
  razón escrita (`migraciones_verificadas.test.ts:53`). La exención de 0302
  (`:54`) también está justificada por el criterio del archivo: un `DROP` de
  superficie muerta no crea garantía de unicidad/atomicidad/permisos, y su modo
  de falla es ruidoso — de hecho **se ejerció**: el propio bloque 154 tronó y por
  eso existe el commit `4198985`.
- **La batería no tiene números de bloque repetidos.**
  `grep -o "^-- ── [0-9]\+\." supabase/verificaciones.sql | sort | uniq -d` →
  vacío, sobre 227 títulos. Importa porque `migraciones_verificadas.test.ts:155`
  decide con un `\b<num>\b` sobre esa lista de títulos.
- **Los 17 `onConflict` de `src/` apuntan a llaves reales, salvo el de
  `factura_saas`.** Los verifiqué uno por uno contra la migración que crea la
  llave: `prospecto_dossier.prospecto_id` (PK, `0217:72`),
  `agente_notificacion_config (tenant_id,agente)` (PK, `0097:53`),
  `agente_notificacion_estado (tenant_id,agente,evento)` (PK, `0097:64`),
  `aviso_vigencia` 6 columnas (PK, `0202:27`), `regla_disparo` 5 columnas (PK,
  `0229:177`), `api_idempotencia (tenant_id,ruta,llave)` (PK, `0098:80`),
  `impersonacion_dia (actor_id,tenant_id,dia)` (PK, `0110:103`),
  `qa_corrida_paso (corrida_id,n)` (PK, `0185:117`),
  `conector_credencial (tenant_id,conector_id)` (`0094:74`),
  `portal_estado (tenant_id,comercio)` (`0232:82` / `0063:82`),
  `cfdi_consolidado_linea (cfdi_xml_id,indice)` (`0076:66`),
  `cfdi_xml (tenant_id,cfdi_uuid)` (`0009:12`),
  `unidad (tenant_id,numero_economico)` (`0047:51`),
  `viaje (tenant_id,folio)` (`0092:22`),
  `posicion (tenant_id,unidad_id,medida_en)` (`0176:66`, ya des-parcializado),
  `interruptor_tenant (tenant_id,pipeline)` (PK, `0297`),
  `plan_price.stripe_price_id` (PK, `0163:60` — **no** el índice parcial
  `plan_stripe_price_unico` de `0055:38-39`, que es de otra tabla).
- **Las unicidades del dinero siguen puestas.** `liquidacion_viaje_uidx`
  (`0005:9`), `uq_gasto_cfdi_uuid (tenant_id, cfdi_uuid, cfdi_orden)`
  (`0065:69`), `uq_gasto_img_hash`, `uq_gasto_wa_message_id` (`0164:98`),
  `uq_cfdi_pago_docto` (`0199:74-75`) más la forma en minúsculas de `0283:187-194`.
  El caso de manual —el mismo CFDI liquidándose dos veces— sigue cerrado.
- **Los pisos y coherencias de dinero de la 24 siguen aplicados y validados.**
  `gasto_importes_no_negativos`/`gasto_descuento_no_excede` (`0281:40-61`, ambos
  con `validate constraint` inmediato), `liquidacion_totales_no_negativos` y
  `liquidacion_diferencia_cuadra` (`0146:61-68`), `viaje_anticipo_no_negativo`
  (`0070:44`).
- **`gasto_concepto_dominio` sí empata con `ConceptoGasto`.** Los 9 de
  `0025:87-88` son exactamente los 9 de `types/likida.ts:20-25`. Igual
  `liquidacion_estatus_dominio` (`0025:127`) ↔ `EstatusLiquidacion`
  (`likida.ts:151`) y `gasto_estado_sat_dominio` (`0025:94`) ↔ `EstadoSat`
  (`likida.ts:27`).
- **0303 no puede tocar a nadie de más.** Su `where id in (…)` (`0303:64-67`)
  lista los mismos nueve ids que 0301:55-58, y el `case … else descripcion end`
  (`0303:62`) deja intacto a cualquiera que no esté en la lista. `experimental`
  sigue `not null default false` (`0301:47-48`), así que la graduación no puede
  dejar un tercer estado.
- **`agente_definicion` sigue deny-all**: `enable row level security` sin una
  sola policy (`0116:66`), y ni 0301 ni 0303 agregan grants.

## Lo que NO alcancé a revisar

- **No hay Postgres aquí.** Todo lo anterior es lectura de SQL y de sus
  llamadores; no apliqué una sola migración ni corrí `verificaciones.sql`. Donde
  más pesa: (a) el 42P10 del hallazgo de `factura_saas` lo deduzco de la
  semántica de inferencia de árbitro de Postgres y del comentario de la
  `0176:59-64` que describe **exactamente** ese error para el mismo patrón —
  reproducirlo pide una base; (b) no sé si `0290:120-140` dejó alguna restricción
  en `not valid` sobre los datos reales (el NOTICE solo se ve en el log del
  deploy).
- **La reversibilidad, otra vez, no la evalué de forma sistemática.** Ni 0302 ni
  0303 traen bloque de reversa. La 0302 es reversible reaplicando el cuerpo de la
  0193; la 0303 **destruye** los `prompt_ref` y las `descripcion` anteriores sin
  respaldo en la base (se recuperan solo leyendo 0125/0230/0234/0235). Las dos
  son idempotentes al reaplicarse. No reconstruí el `down` de las 281.
- **`src/types/likida.ts` lo crucé completo contra `gasto`, `liquidacion` y
  `viaje`,** pero no barrí las ~40 tablas restantes buscando más pares
  tipo↔columna desalineados. El de `llm_costo`/`FaseCosto` lo encontré por otro
  camino (leyendo el dominio de la 0025), lo que sugiere que quedan más: no hay
  una sola prueba en el repo que cruce un union de TS contra su CHECK.
- **No revisé RLS de nuevo.** Nada de esta ronda tocó policies ni funciones de
  aislamiento; los hallazgos de RLS de la 24 (0292, 0294) los di por vigentes sin
  re-verificarlos línea por línea.
- **`geocerca`, `terminal`, `portal_credencial`, `invitacion`** siguen sin
  escritor y no las audité: no cambiaron en este tramo.
- **No corrí `npx vitest`.** Ninguna conclusión de arriba depende de una prueba:
  todas salen de leer el SQL, el llamador y el historial de la fila.
