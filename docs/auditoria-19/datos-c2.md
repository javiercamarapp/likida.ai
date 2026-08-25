# Modelo de datos y esquema — auditoría 19 c2

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura** ·
**mirada más profunda**.

Lo que subió es real y hay que decirlo primero: las cuatro migraciones nuevas
son el mejor SQL que este repo ha escrito. Ocho RPC nuevas, **todas** con
`security definer set search_path = ''` —que cierra por completo el hueco de
`pg_temp` que este rubro lleva tres rondas reportando—, todas revocadas de
`anon`/`authenticated` y concedidas solo a `service_role`, con `FOR UPDATE SKIP
LOCKED`, fencing por token y el reloj autoritativo de Postgres. El orden causal
por chofer dejó de ser un `order by` en TypeScript y pasó a ser un `not exists`
dentro del claim. Y por primera vez hay pgTAP corriendo en CI
(`ci-postgres.yml:166`). Eso es exactamente lo que el rubro pide: la base
imponiendo, no la aplicación encargándose.

Lo que lo cancela y se lleva uno más: **la misma entrega abrió un camino nuevo
en el que la liquidación de un viaje reabierto nunca se vuelve a escribir**, y
la base lo permite porque la unicidad que la 0186 declaró es más ancha que el
invariante que el código dice tener (`tool-executor.ts:250-252` promete «el
MISMO run»; `0186:17` guarda para siempre). Es el patrón que este rubro
persigue desde la ronda 17 —el invariante vive en un comentario, no en el
esquema— aplicado esta vez sobre el camino del dinero. Y **los cinco ALTO
reincidentes siguen los cinco intactos**, verificados uno por uno contra el
código de hoy.

**El riesgo mayor del rubro, hoy:** un viaje reabierto no se puede volver a
liquidar. `claim_agente_mutacion` devuelve el resultado cacheado del cierre
anterior, el executor lo entrega como éxito sin llamar al handler, y el chofer
recibe «listo» con la cifra vieja.

---

## Cómo se verificó

**No hay Postgres en esta caja** (no hay binarios en `/usr/lib/postgresql`, no
hay clúster, no hay Supabase). Todo lo de abajo sale de **leer el SQL y el
código que lo llama**, no de correrlo. Donde una afirmación necesitaba una
corrida, va en «lo que NO alcancé a revisar» — no la doy por buena.

Sí corrí: `npx vitest run migraciones_verificadas.test.ts
migration_0186/0187/0188.test.ts` → **4 archivos, 9 pruebas, verde**.

---

## Las cuatro migraciones nuevas

| Mig. | Qué crea | RLS / grants | ¿Reversible? | Invariante: ¿lo impone la base? |
|---|---|---|---|---|
| **0185** (131 l.) | `qa_foto`, `qa_corrida`, `qa_corrida_paso` + 2 índices | RLS on, **0 policies**. **No revoca grants de tabla** a `anon`/`authenticated` — el propio bloque 152 lo declara: `anon=0` con `nota=RLS lo deja a ciegas`, o sea que el grant existe y RLS es la única capa | **No.** Sin `down`. Todo `if not exists`, así que re-aplicar es inofensivo | **Sí, en tres:** `hash unique` mata el read-modify-write del manifiesto JSON; PK `(corrida_id, n)` mata el paso duplicado; `on delete cascade` mata el paso huérfano. **No** en dos: `escenario` es `text` sin CHECK, y el CHECK de confirmación no nombra a `confirmado_por` |
| **0186** (103 l.) | `agente_mutacion_idempotencia`, `llm_presupuesto_reserva`, `reservar_/liquidar_presupuesto_llm` | RLS on, 0 policies, **`revoke all from public, anon, authenticated`** explícito + `grant select,insert,update to service_role`. Las 2 funciones revocadas y concedidas por firma | **No.** `create table if not exists` / `create or replace`: re-aplicar es inofensivo | **Parcialmente.** `unique(tenant_id, effect_key)` sí, pero con alcance equivocado (ver CRÍTICO). El **tope** de presupuesto **no**: viaja como *parámetro* de la RPC (`p_tope_tenant_usd`), no vive en ninguna columna. `lease_until` sin default ni CHECK. Sin `vence_en` ni barrido para las reservas |
| **0187** (381 l.) | 3 columnas de lease en `wa_mensaje_procesado`, 1 índice, **10 RPC** (5 del inbox, 5 del downstream) | Las 10 con `set search_path = ''`, revocadas de `public/anon/authenticated`, `grant execute` solo a `service_role`. Ninguna tabla nueva | **No, y aquí duele:** `create or replace` **destruye** el cuerpo anterior de `reclamar_wa_pendiente` (0177) y le cambia de `security invoker` a `security definer`. Volver atrás exige re-correr la 0177 a mano. La firma sí se conservó a propósito (`:63-65`), así que código viejo + base nueva funciona | **Sí, y bien:** el orden causal por chofer, el fencing por `(claim_token, claim_owner)` y el reloj están **dentro** de la RPC. **No:** las tres columnas de lease son nullable sin CHECK que las ate entre sí, e `intentos` no es monótono (ver MEDIO) |
| **0188** (181 l.) | 4 RPC: `claim_/renew_/complete_/fail_agente_mutacion` | Idem 0187: `search_path=''`, revoke + grant a `service_role` | **No.** Solo `create or replace`: re-aplicar es inofensivo | **La mueve al lugar correcto** (el reloj deja de ser del proceso) **pero no la cierra**: la tabla sigue aceptando cualquier `lease_until` por INSERT directo, y la 0188 **no toca un solo dato ya escrito** |

**Reversibilidad: cero de cuatro**, igual que las 179 anteriores. No hay
convención `down` en este repo. Lo nuevo es que la 0187 es la primera que
*sobrescribe* una función viva cambiándole el modo de seguridad, así que su
irreversibilidad ya no es solo «no hay script»: es «el cuerpo anterior ya no
existe en la base».

### Pregunta 1 · ¿Qué estaba mal en la 0186, y la 0188 corrige datos o solo esquema?

La 0186 creó la tabla con `lease_until timestamptz not null` **sin default**:
el cliente calculaba la expiración con `Date.now()` del proceso. La cabecera de
la 0188 lo dice sin adornos (`0188:4-6`): *«el cliente calculaba lease_until con
el reloj de la instancia»*. Dos lambdas de Vercel con relojes desfasados
resolvían distinto si un lease estaba vencido.

**La 0188 corrige el esquema por la vía de las RPC, y NO corrige un solo
dato**: no hay `update`, no hay backfill, no hay `alter column ... set default`.
Hoy eso es inocuo porque la 0186 y la 0188 viajan en el **mismo** commit
(`0156cf3`) y nunca hubo una ventana con la 0186 sola en producción. Lo que
queda abierto no son los datos viejos sino la puerta: la columna sigue
aceptando `-infinity` o el año 2999 desde un script o desde la consola de
Supabase, y la 0188 lo dejó igual (ver MEDIO).

### Pregunta 2 · La renumeración

`chore(db): renumber release migrations after remote sequence` movió el lote a
0185–0188. Lo que pude verificar sin base:

- **No se abrió un hueco nuevo ni hay colisión.** Faltan `0067`, `0068`,
  `0069`, `0156` y `0179` — exactamente los mismos cinco de la ronda anterior.
  183 archivos, y 0185→0188 son contiguos sobre la 0184.
- **Re-aplicar cualquiera de las cuatro es inofensivo.** Todo el DDL es
  `create table if not exists` / `create index if not exists` / `add column if
  not exists` / `create or replace function`. La única excepción,
  `0187:12` (`create index` a secas), va precedida de `drop index if exists`
  en `:11`.
- **`migraciones_verificadas.test.ts` no puede detectar una divergencia**:
  enumera con `readdirSync` sobre el directorio local (`:120-123`) y nunca mira
  `supabase_migrations.schema_migrations`. Es una prueba de completitud
  documental, no de sincronía con remoto.
- **El sondeo de arranque tampoco**: `COLUMNAS_RECIENTES`
  (`startup.ts:287-293`) se detiene en la **0171**. Ninguna de las cuatro
  migraciones nuevas tiene sonda, ni por columna ni por RPC.
- `deploy-preview-promote.yml:214-215` sí corre `db push --dry-run` y luego
  `db push` en el job `production_migrations`, así que el dry-run es la
  compuerta real. **No pude ejecutarlo** (sin credenciales ni base).

Conclusión: la renumeración es **benigna por construcción** (idempotencia), no
por verificación. Lo doy por bueno con el caveat de que el ledger remoto no se
puede leer desde aquí.

---

## Hallazgos

### [CRÍTICO] La llave de idempotencia de `guardar_liquidacion` no tiene alcance de corrida ni vencimiento: un viaje **reabierto** nunca se vuelve a liquidar, y el executor lo reporta como éxito

`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:17`
(`unique (tenant_id, effect_key)`) ·
`supabase/migrations/0188_runtime_idempotencia_clock.sql:69-71` (la rama
`cached`) · `src/lib/llm/tool-executor.ts:244-246` (`mutationEffectKey`) ·
`:149-151` (el `return` sin handler) · `:250-252` (el comentario que promete
otra cosa) · `src/lib/likida/tools.ts:203-205` (la única tool `isMutation`) ·
`src/lib/likida/administracion.ts:631` (`reabrirViaje`)

**Escenario, con valores.**

1. Viaje `V` (tenant `A`, operador `O`) se cierra por WhatsApp. El agente llama
   `guardar_liquidacion`. `mutationEffectKey` devuelve
   `guardar_liquidacion:<A>:<V>:<O>` — **sin run id, sin timestamp, sin hash de
   argumentos**. `ctx.mutationKey`, el único escape, **no lo asigna nadie**:
   `grep -rn mutationKey src/` da tres líneas y las tres están en
   `tool-executor.ts` (la declaración del campo y las dos lecturas).
2. `claim_agente_mutacion` inserta la fila y devuelve `execute`. El handler
   corre, `complete_agente_mutacion` deja `status='succeeded'` y `result` con
   la URL del PDF.
3. El contralor abre `/dashboard/<V>` y **reabre el viaje**
   (`reabrirViaje`, `administracion.ts:631`): la liquidación se archiva, el
   viaje vuelve a `en_cuadre`. El chofer manda la caseta que faltaba.
4. El agente llama `guardar_liquidacion` otra vez. Misma tupla
   `(tenant_id, effect_key)`. `claim_agente_mutacion` entra por
   `0188:69-71`:

   ```sql
   if v_row.status = 'succeeded' then
     return query select 'cached'::text, null::uuid, v_row.result;
   ```

   y `tool-executor.ts:149-151` responde:

   ```ts
   if (durable?.kind === 'cached') {
     return { success: true, result: durable.result, durationMs: … };
   }
   ```

   **El handler no corre.** No se escribe `liquidacion`, no se genera PDF, el
   viaje se queda en `en_cuadre`, y el modelo recibe un éxito con la URL del
   PDF **anterior** — el que la reapertura acaba de invalidar.

Y no hay salida: `grep -rn "agente_mutacion_idempotencia" src/ scripts/` no
devuelve **un solo** `delete`, ni cron de purga, ni columna de vencimiento. La
fila `succeeded` vive para siempre. Sacar ese viaje del pozo exige un `DELETE`
a mano en la consola de Supabase.

**Consecuencia.** El viaje reabierto —que es el flujo que existe justamente
porque la primera liquidación estaba mal— no se puede volver a cerrar por el
canal del producto. El chofer recibe «listo, tu liquidación está en camino» con
la cifra que se acaba de anular. Es la regla #1 de `CLAUDE.md` rota desde el
esquema: la pantalla y el WhatsApp afirman un cierre que la base no tiene.

**Causa raíz probable.** La unicidad se declaró sobre `(tenant_id, effect_key)`
como si la clave fuera efímera, y la clave se derivó de identidades permanentes
`(tool, tenant, viaje, operador)`: el alcance de la restricción es «para
siempre» y el que el código documenta es «este run».

---

### [ALTO] La cadena de cobranza entera se quedó fuera de las FK compuestas de la 0028: un `pago_recibido` de la flota A puede colgar de una `factura_emitida` de la flota B, y `factura_saldo` lo suma (REINCIDENTE r18 — **verificado hoy, primera vez**)

`supabase/migrations/0028_fks_con_tenant.sql:93-96` (las **cuatro** relaciones
compuestas, y son las únicas del esquema) ·
`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:96`
(`factura_id uuid not null references public.factura_emitida(id)`) · `:31`
(`cliente_id … references public.cliente(id)`) · `:143-145` (la policy) ·
`:128` (el `left join` de la vista)

`grep -rn "foreign key (tenant_id"` sobre las 183 migraciones devuelve **cero**
líneas; las únicas FK compuestas del repo son las cuatro que la 0028 declaró
en `:93-96`: `gasto→viaje`, `liquidacion→viaje`, `codigo_pendiente→viaje`,
`viaje→operador`. Las tablas creadas después —la cobranza incluida— apuntan
todas a `(id)` a secas.

**Escenario, con valores.** Un `app_user` con `rol='contador'` de la flota A
(`ve_finanzas()` = true), vía PostgREST:

```sql
insert into pago_recibido (tenant_id, factura_id, monto, fecha)
values ('<A>', '<factura F de la flota B>', 250000.00, current_date);
```

- El `with check` de `tenant_finanzas` (`0049:143-145`) mira **solo**
  `pago_recibido.tenant_id` → es el suyo → pasa.
- La FK mira **solo** que `F` exista → pasa.
- No hay CHECK, ni trigger, ni FK compuesta que compare los dos tenants.

Queda una fila con `pago_recibido.tenant_id = A` y
`factura_emitida.tenant_id = B`. Y la vista la suma sin mirar tenant
(`0049:128`): `left join public.pago_recibido p on p.factura_id = f.id`. La
factura de B pasa a `pagado = 250,000`, `saldo` baja y `vencida` se apaga;
la cartera de A cuenta $250,000 de ingreso que nunca entró.

La RPC `registrar_pago_tx` **sí** valida (`0159:96`, `where id = p_factura and
tenant_id = p_tenant`), o sea que el camino de la app está bien — y por eso
mismo esto es hallazgo de este rubro y no de otro: el invariante existe una
sola vez, en TypeScript/PLpgSQL, y no en la relación. Lo mismo aplica a
`factura_emitida.cliente_id → cliente(id)` (`0049:31`) y a `factura_viaje`
(`0049:83-85`), que no tiene `tenant_id` propio y cuya policy solo mira el de
la factura: una factura de A puede amparar un viaje de B.

**Consecuencia.** La conciliación bancaria de dos flotas queda cruzada sin que
ninguna pantalla lo diga, y la antigüedad de saldos de B es falsa. El texto de
la 0028 (`:20-27`) describe este daño con estas palabras exactas para `gasto`;
veinte migraciones después la cobranza —que es dinero de terceros— nació sin la
protección que se escribió para ello.

**Causa raíz probable.** La 0028 cerró las cuatro relaciones que existían en
julio y no dejó una regla que obligara a las siguientes; no hay bloque de
verificación ni prueba que cuente FK compuestas.

---

### [ALTO] Una reserva de presupuesto de IA no vence nunca y nadie la barre: un timeout de lambda deja el tope diario de la flota consumido para siempre

`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:27-36` (la
tabla: **sin `vence_en`, sin lease, sin TTL**) · `:63-68` (la suma que cuenta
`estado in ('reservado','liquidado')`) · `src/lib/llm/budget.ts:73-108`
(`reserveLlmBudget`) · `src/lib/llm/openrouter.ts:838` (*«Se sobre-reserva y
luego se liquida al costo real»*)

**Escenario, con valores.** `LIKIDA_LLM_TENANT_DAILY_BUDGET_USD` = **$5.00**
(default, `budget.ts:66`).

1. Llega una foto de ticket. `openrouter.ts:841` reserva contra un
   `inputUpperBound` deliberadamente inflado: digamos $0.42.
   `reservar_presupuesto_llm` inserta `estado='reservado'`, `reservado_usd=0.42`
   y devuelve `true`.
2. La invocación muere antes de `settleLlmBudget`: `maxDuration` de Vercel, OOM,
   redeploy a media corrida. **`liquidar_presupuesto_llm` nunca se llama.**
3. La fila queda `estado='reservado'` con $0.42. La suma de `:63-68` **la sigue
   contando** — y con razón, porque la RPC no puede distinguir «en vuelo» de
   «huérfana»: no hay columna que lo diga.
4. Doce timeouts en el día y `usado_tenant` = $5.04. A partir de ahí
   `reservar_presupuesto_llm` devuelve `false` para **todo**, y
   `budget.ts:105` lanza `LlmBudgetExceededError`. La flota deja de tener
   WhatsApp hasta que cambie el día **UTC**.

No hay salida por esquema: `grep -rn "llm_presupuesto_reserva" src/ scripts/`
solo encuentra la migración y su prueba de contrato. No hay cron que barra
reservas viejas, ni índice parcial que las encuentre, ni pantalla que las
muestre. Y la comparación es interna al propio repo: **`agente_presupuesto_reserva`
(0180:8-19) SÍ tiene `vence_en`**, y su RPC lo respeta con `vence_en > now()`.
La tabla nueva quitó la columna que la vieja tenía.

**Consecuencia.** El presupuesto duro que este delta vino a poner puede
apagarse solo. Falla cerrado —que es lo correcto— pero sin fecha de reapertura
ni forma de verlo: el panel no lista esta tabla y el mensaje que llega al chofer
es un error genérico.

**Causa raíz probable.** La reserva se diseñó como un par
reservar/liquidar en dos llamadas de red, y el caso «la segunda nunca llega» se
dejó fuera del esquema en vez de resolverlo con la misma columna de expiración
que la tabla hermana ya tenía.

---

### [ALTO] El `encargado` sigue pudiendo reescribir `viaje.anticipo` por PostgREST: las policies de `viaje` no nombran `ve_finanzas()` (REINCIDENTE)

`supabase/migrations/0158_integridad_fiscal.sql:243-246` (la tabla de valores
que arma las tres policies) · `src/lib/auth/visibilidad.ts:41`

Sin cambio. Leído hoy, `0158:243-246`:

```sql
('gasto',       'tenant_finanzas', '(tenant_id = any (get_user_tenant_ids()) and ve_finanzas()) or is_superadmin()'),
('liquidacion', 'tenant_finanzas', '(tenant_id = any (get_user_tenant_ids()) and ve_finanzas()) or is_superadmin()'),
('viaje',       'tenant_data',     'tenant_id = any (get_user_tenant_ids()) or is_superadmin()')
```

`grep -rn "ve_finanzas" supabase/migrations/` sobre las 183 migraciones no
devuelve **ninguna** línea que la ponga sobre `viaje`, ni en las cuatro nuevas.
Un `app_user` con `rol='encargado'` de la flota A hace
`update viaje set anticipo = 2000 where id = <V>` sobre un viaje con
`anticipo = 20000.00` y pasa: no lo frena `viaje_anticipo_no_negativo` (0070)
ni `trg_viaje_no_tras_liquidar` (que solo dispara si ya existe la fila de
`liquidacion`).

**Consecuencia.** El cuadre siguiente calcula
`diferencia = round2(2000 − 18500) = −16500` y la liquidación dice «El operador
puso $16,500.00 de su bolsa». Sin línea en `bitacora_auditoria`: nunca pasó por
la app.

**Causa raíz probable.** La 0158 partió las policies por verbo cuando hacía
falta partirlas por columna.

---

### [ALTO] Una factura cancelada puede conservar sus abonos: no hay CHECK, ni trigger, ni índice que lo impida (REINCIDENTE)

`src/lib/likida/facturacion_escritura.ts:589-600` (el `count` y el `UPDATE`, en
peticiones distintas) · `supabase/migrations/0049_cobranza_factura_emitida_pago.sql:46-56`
(los CHECK de `factura_emitida`, ninguno mira `pago_recibido`) · `:128` (la
vista) · `:112-131`

```sql
insert into factura_emitida (…, total 11600, estatus 'emitida') → F;
insert into pago_recibido   (…, factura_id F, monto 5000);
update factura_emitida set estatus = 'cancelada' where id = F;   -- PASA
```

El invariante vive solo en TypeScript, y ahí se comprueba con un `count` fuera
de transacción: entre él y el `UPDATE` cabe un `registrar_pago_tx` que ve
`estatus='emitida'` y abona. **Las cuatro migraciones nuevas no tocan la
cobranza.**

**Consecuencia.** $5,000 registrados como cobrados contra un CFDI cancelado, y
`factura_saldo.vencida` excluye las canceladas, así que ese dinero sale de la
cartera y de la antigüedad sin dejar rastro.

**Causa raíz probable.** El invariante es entre dos tablas; la 0159 movió a la
base la decisión del abono y dejó en TS la de la cancelación.

---

### [ALTO] `wa_outbox.dedupe_key` sigue siendo la única unicidad de la tabla y ningún escritor la llena (REINCIDENTE)

`supabase/migrations/0180_reservas_agente_y_outbox_wa.sql:69`
(`dedupe_key text unique`) · `src/lib/likida/wa_outbox.ts:16-18`

Verificado hoy: `grep -rn "dedupe_key" src/ supabase/` devuelve **una sola
línea en todo el repo** — la de la migración. Cero escritores, cero lectores,
cero pruebas. La columna viaja NULL siempre y en Postgres los NULL son
distintos entre sí, así que el `unique` no restringe nada.

**Consecuencia.** Un timeout de `enviarTexto` contra Meta —que ya entregó el
mensaje— encola una copia; el cron `wa-outbox` la manda otra vez. El operador
recibe dos veces el mismo «listo, tu liquidación está en camino» con su PDF.

**Causa raíz probable.** La llave se declaró NULLABLE para poder encolar sin
identidad, y con eso la restricción dejó de serlo.

---

### [ALTO] `unidad.gps_device_id` sigue sin escritor: el poller cuenta el 100% de las lecturas como huérfanas (REINCIDENTE)

`supabase/migrations/0176_gps_ingesta.sql:25-28` ·
`src/lib/likida/conectores/sincronizar_gps.ts:109-113` (el único lector) ·
`src/lib/likida/conectores/posiciones.ts:29` (un comentario) ·
`src/lib/likida/operacion.ts:888-921` (`crearUnidad` / `editarUnidad`, los dos
únicos escritores de `unidad`)

`grep -rln "gps_device_id" src/` da **tres** archivos: el lector, su prueba y
un comentario en `posiciones.ts:29` (*«Se liga vía unidad.gps_device_id»*). El
delta no añadió pantalla, ni ruta `/v1`, ni server action, ni backfill.
`crearUnidad` sigue insertando ocho columnas y ninguna es esta.

**Consecuencia.** `base.huerfanas = 40`, `base.guardadas = 0` en cada corrida
del cron, `posicion` vacía y `unidad.gps_visto_en` NULL para siempre. La landing
sigue listando «el GPS de tu flota» entre las fuentes de dato.

**Causa raíz probable.** El PR entregó lector, poller, cron, índice y bloque de
verificación; el bloque siembra la liga con un `INSERT` directo, así que nada
obligaba a que existiera el formulario.

---

### [ALTO] `prospecto.estado` sigue admitiendo catorce valores y `ESTADOS_PROSPECTO` sigue conociendo seis (REINCIDENTE)

`supabase/migrations/0181_crm_remediacion.sql:9-11` (el CHECK, catorce valores)
· `src/lib/likida/vendedores.ts:71-78` (`ESTADOS_PROSPECTO`, seis) · `:83-94`
(`ESTADOS_FUNNEL`, once) · `src/app/admin/vendedores/consola-vendedores.tsx:208,239`
· `src/app/vendedor/panel-vendedor.tsx:120`

Sin cambio. Leído hoy, el CHECK de `:10-11` admite
`nuevo, contactado, appointment, rescheduled, cancelled, no-show, demo,
proposal, pilot, won, lost, negociacion, cerrado, perdido`; `ESTADOS_PROSPECTO`
sigue siendo `{nuevo, contactado, demo, negociacion, cerrado, perdido}` y
`ESTADOS_FUNNEL` once. **Una columna, tres dominios distintos, y el CHECK
acepta la unión.**

**Consecuencia.** Un `BOOKING_CREATED` de Cal.com escribe `estado='appointment'`
y `totales[p.estado]++` sobre el objeto de seis llaves da `NaN`: la StatCard
«Prospectos en el pipeline» pinta la cadena `"NaN"`, el prospecto desaparece de
todas las columnas del tablero y `puedeTransicionar` lo deja sin ninguna
transición posible.

**Causa raíz probable.** La 0181 amplió el dominio para que cupiera el CRM
nuevo y dejó vivo el viejo leyendo la misma columna.

---

### [MEDIO] La 0188 puso el reloj dentro de la RPC pero dejó la columna abierta: `agente_mutacion_idempotencia.lease_until` sigue sin default y sin CHECK, y `service_role` conserva `insert`/`update` sobre la tabla

`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:14`
(`lease_until timestamptz not null`, sin default) · `:25`
(`grant select, insert, update … to service_role`) ·
`supabase/migrations/0188_runtime_idempotencia_clock.sql:1-6` (la cabecera que
declara el arreglo)

**Escenario, con valores.** Un script de conciliación, un backfill o la consola
de Supabase —los tres corren como `service_role`, que tiene el grant de `:25`—:

```sql
insert into agente_mutacion_idempotencia
  (tenant_id, effect_key, tool_name, owner_token, status, lease_until)
values ('<A>', 'guardar_liquidacion:<A>:<V>:<O>', 'guardar_liquidacion',
        gen_random_uuid(), 'running', '2999-01-01'::timestamptz);
```

Entra. Y a partir de ahí `claim_agente_mutacion` cae siempre en `0188:73-76`
(`status='running' and lease_until > clock_timestamp()`) y devuelve `busy`
**para siempre**: ese efecto no se puede volver a ejecutar nunca. Falta
`default now()`, falta un `check (lease_until <= created_at + interval '900
seconds')` o equivalente, y falta el `updated_at` que ate la fila a su
transición.

Lo mismo, más suave, en `attempts integer not null default 1 check (attempts >
0)` (`0186:11`): sin techo. Un efecto que falla siempre reintenta sin límite y
no hay carta muerta — a diferencia de `wa_evento_pendiente`, que sí corta en 5.

Y la cabecera de `0188:38-39` dice algo que no es cierto: *«Si otro worker
inserta al mismo tiempo, el INSERT espera la resolución»*. `on conflict do
nothing` **no espera** a una transacción concurrente sin confirmar; sigue de
largo. El resultado que produce es seguro (`busy`), pero el comentario describe
un mecanismo que no está ahí, y el siguiente que lo lea confiará en él.

**Consecuencia.** El «reloj autoritativo» lo es solo mientras todo el mundo pase
por la RPC. La regla del rubro es literal aquí: un script, la consola o un
llamador nuevo no pasan por la aplicación.

**Causa raíz probable.** La 0188 corrigió el *camino* (nuevas RPC) sin cerrar la
*puerta* (la tabla), que es el arreglo de una línea que faltó.

---

### [MEDIO] El tope diario de IA por flota se corta por día **UTC**, mientras el tope del panel de QA del **mismo delta** se corta por día de México

`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:66`
(`and created_at >= date_trunc('day', now())`) ·
`supabase/migrations/0185_qa_panel_tablas.sql:96-99` (el índice, con su
comentario: *«El tope diario se mide por día calendario de MÉXICO, no UTC»*) ·
`src/lib/llm/budget.ts:66` (`LIKIDA_LLM_TENANT_DAILY_BUDGET_USD`, default $5)

**Escenario, con valores.** Flota A, tope $5.00/día. El 3 de septiembre a las
**17:55 hora de Monterrey** (UTC−6) lleva $4.90 gastados; le quedan $0.10 y el
bot empieza a rebotar mensajes. A las **18:00 hora de Monterrey** son las
00:00 UTC del 4: `date_trunc('day', now())` salta, `usado_tenant` vuelve a $0 y
la flota tiene **otros $5.00** — el mismo día laboral mexicano, seis horas
antes de que termine el turno de la tarde.

Al revés cuenta igual: el gasto de 18:00–23:59 del día anterior ya se cargó al
día siguiente, así que el rótulo «tope diario» no describe ningún día que el
contralor reconozca.

**Consecuencia.** El techo duro de dinero que este delta vino a poner es, en la
práctica, de hasta $10 en el día natural mexicano de mayor operación. Y la
inconsistencia está **dentro del mismo delta**: la 0185, escrita tres días
antes, construyó su índice sobre `(creada_en at time zone 'America/Mexico_City')::date`
precisamente para no hacer esto, y escribió por qué.

**Causa raíz probable.** `date_trunc('day', now())` es el default de quien
escribe SQL sin pensar en zona; el repo ya tiene la forma correcta a nueve
migraciones de distancia.

---

### [MEDIO] `wa_evento_pendiente.intentos` dejó de ser monótono: `fallar_wa_pendiente(p_devolver_intento => true)` lo decrementa sin techo, y la carta muerta nunca llega

`supabase/migrations/0187_wa_evento_pendiente_leases_fencing.sql:187-188` ·
`src/lib/likida/wa_pendientes.ts:201-215` (`devolverIntentoPendiente`) · `:26`
(`MAX_INTENTOS_PENDIENTE = 5`) · `:263-270` (`cartasMuertas`, `gte('intentos',
5)`) · `src/app/api/cron/wa-pendientes/drenado.ts:114-115`

```sql
set intentos = case when p_devolver_intento then greatest(0, intentos - 1) else intentos end,
    ultimo_error = case when p_devolver_intento then null else left(coalesce(p_error, ''), 500) end,
```

**Escenario, con valores.** La foto `M` del chofer entra al fondo de un lote
grande. Cada corrida del cron: `reclamar_wa_pendiente` sube `intentos` 0→1;
`drenado.ts:114` detecta `sin_tiempo` y llama `devolverIntentoPendiente`; la
RPC baja 1→0 **y borra `ultimo_error`**. Al día siguiente, igual. Y al
siguiente.

`M` queda con `intentos = 0`, `ultimo_error = NULL`, `procesado_en = NULL` —
indistinguible de un mensaje que acaba de llegar. `cartasMuertas`
(`gte('intentos', 5)`) devuelve **0**, así que el tablero jura que no hay nada
atorado. No hay `ultimo_intento_en`, ni `intentos_totales`, ni ninguna columna
monótona que distinga «nunca se intentó» de «se intentó 400 veces y nunca hubo
presupuesto». Y con el orden causal nuevo (`0187:98-106`), mientras `M` siga sin
procesar **ningún mensaje posterior del mismo chofer se puede reclamar**.

**Consecuencia.** Un chofer se queda mudo indefinidamente y el único contador
que existiría para detectarlo reporta cero. El comentario de la 0119 promete
*«carta muerta VISIBLE con su ultimo_error»*; en este camino no hay ni carta ni
error.

**Causa raíz probable.** `intentos` hace dos trabajos incompatibles —CAS
optimista del claim y contador de reintentos— y el arreglo de ESC-1 eligió
sacrificar el segundo.

---

### [MEDIO] `qa_foto_confirmacion_completa` exige la fecha de la firma pero **no al firmante**, y el FK del firmante es `on delete set null`: un oráculo humano que nadie respalda

`supabase/migrations/0185_qa_panel_tablas.sql:49-57` · `:62-63` (el comentario
que declara el invariante) · `supabase/verificaciones.sql:8626-8631` (el bloque
152, que solo prueba el caso sin `confirmado_en`)

El CHECK dice:

```sql
constraint qa_foto_confirmacion_completa check (
  (ocr_esperado is null and confirmado_en is null)
  or (ocr_esperado is not null and confirmado_en is not null)
)
```

y el comentario dos líneas arriba dice *«Sin confirmador no hay confirmación: un
`ocr_esperado` sin firma es un dato que nadie respalda, y ese es exactamente el
caso que el oráculo humano existe para impedir»*. **`confirmado_por` no aparece
en el CHECK.**

**Escenario, con valores.**

```sql
update qa_foto set ocr_esperado = '{"monto": 1200.00}'::jsonb,
                   confirmado_en = now()
 where id = <F>;                       -- confirmado_por queda NULL. PASA.
```

Y el segundo camino no necesita ni mala fe: `confirmado_por uuid references
public.app_user(id) **on delete set null**` (`:49`). El día que se dé de baja al
`app_user` que confirmó, la fila conserva `ocr_esperado` y `confirmado_en` y
pierde al firmante. El invariante se rompe **solo**, sin que nadie escriba nada
sobre `qa_foto`.

**Consecuencia.** El veredicto del panel de QA compara el OCR contra un
«esperado» que no tiene quién lo sostenga — que es literalmente el estado que la
tabla se creó para impedir. Hoy el daño está acotado porque `FotoBanco.ocrEsperado`
está tipado `null` (`qa-tipos.ts:47`) y la pantalla del oráculo humano aún no
existe; el hueco es el de la restricción, no el del uso de hoy.

**Causa raíz probable.** El CHECK se escribió sobre la pareja
`(ocr_esperado, confirmado_en)` y el `on delete set null` se copió del patrón
de auditoría, donde perder al actor es aceptable; aquí el actor **es** la
garantía.

---

### [BAJO] La 0185 no revoca los grants de tabla: RLS es la única capa sobre las tres tablas nuevas, y la 0186 del mismo delta sí revoca

`supabase/migrations/0185_qa_panel_tablas.sql:123-131` (RLS on, sin `revoke`) ·
`supabase/migrations/0186_runtime_idempotencia_y_presupuesto.sql:24,42` (el
`revoke all … from public, anon, authenticated` que sí está) ·
`supabase/migrations/0159_rpcs_atomicas.sql:145-146` (la regla escrita en este
repo) · `supabase/verificaciones.sql:8663-8671` (el bloque 152)

La 0185 hace `enable row level security` sobre `qa_foto`, `qa_corrida` y
`qa_corrida_paso` y **no emite un solo `revoke`**. Que el grant de
`anon`/`authenticated` existe de verdad lo declara el propio bloque de
verificación: su rama de éxito es `anon=0` con
`nota='RLS lo deja a ciegas'`, y la rama
`exception when insufficient_privilege` —la que se dispararía si el grant no
existiera— produce `anon=-1`, que el `(esperado …)` marca como fallo. O sea que
el autor **sabe** que el privilegio de tabla está ahí.

La 0159 escribió la regla con estas palabras: *«El `revoke from public` NO
basta: Supabase concede EXECUTE explícito a anon/authenticated por default
privileges (lección de la 0013)»*.

**Consecuencia.** Hoy nada se fuga: RLS sin policies deniega. Lo que falta es la
segunda capa, y estas tablas guardan fotos de tickets reales — la propia
migración dice *«una foto de ticket real trae RFC y domicilio (LFPDPPP art. 2
fr. VI)»* (`:127-128`). El día que alguien añada una policy de lectura para el
panel, el grant ya está puesto.

**Causa raíz probable.** El patrón deny-all se copió de `tenant_perfil_version`
(0169), que tampoco revoca; la 0186, escrita después, sí lo hace. El delta trae
las dos convenciones a la vez.

---

### [BAJO] `qa_corrida.escenario` es `text` sin CHECK y el código lo castea a un union de tres valores; el importador del ledger escribe sin validar

`supabase/migrations/0185_qa_panel_tablas.sql:68` (`escenario text not null`,
sin CHECK — a diferencia de `carril` y `estado`, que sí lo tienen en `:69` y
`:71`) · `src/lib/admin/qa-storage.ts:139-140` (`escenario: c.escenario as
EscenarioId`) · `src/lib/admin/qa-tipos.ts:24,29` (`EscenarioId`,
`ESCENARIOS_VALIDOS`) · `scripts/qa/importar-ledger.ts:100`

La migración le puso CHECK de dominio a `carril` (dos valores) y a `estado`
(seis), y **se saltó `escenario`**, que es el que tiene un catálogo declarado
en TS. `importar-ledger.ts:100` escribe `escenario: c.escenario` directo desde
el JSON de la Fase A sin pasar por `validarLanzar`, y `qa-storage.ts:139` lee
con un `as EscenarioId` a ciegas.

Además, `CorridaQA.carril` está tipado como el literal `'rapido'`
(`qa-tipos.ts:86`) mientras la columna admite `'completo'`: el tipo es **más
estrecho** que la columna, que es la forma que este rubro persigue por nombre.

**Consecuencia.** Contenida hoy (el POST valida y solo hay tres escenarios),
pero es la tercera columna de dominio de la misma tabla y la única sin CHECK,
en la migración que presume de haber movido el ledger a la base justamente para
tener las garantías que el JSON no daba.

**Causa raíz probable.** `carril` y `estado` tienen su dominio en el SQL;
`escenario` lo tiene solo en `ESCENARIOS_VALIDOS`, y no hay nada que sincronice
los dos lados.

---

### [BAJO] El umbral de carta muerta vive duplicado: `intentos < 5` está incrustado en cinco puntos del SQL y `MAX_INTENTOS_PENDIENTE = 5` en TypeScript, sin nada que los ate

`supabase/migrations/0187_wa_evento_pendiente_leases_fencing.sql:14` (el
predicado del índice), `:34`, `:43`, `:92`, `:102` ·
`src/lib/likida/wa_pendientes.ts:26,270`

Hoy coinciden. El día que alguien suba `MAX_INTENTOS_PENDIENTE` a 8, el índice
parcial dejará de cubrir las filas 5–7, `listar_wa_pendientes` y
`reclamar_wa_pendiente` seguirán cortando en 5, y `cartasMuertas` contará
`>= 8` — o sea que habrá filas invisibles para el drenado **y** para el contador
de cartas muertas al mismo tiempo. No hay bloque de verificación que compare los
dos números, y la 0187 está EXENTA (`migraciones_verificadas.test.ts:117`), así
que tampoco lo habrá.

Este repo ya tomó la decisión contraria y la escribió: `cron_latido_id_dominio`
se ensancha *en la migración*, no en el código.

---

### [BAJO] `claim_wa_mensaje_procesado` reescribe `created_at` al retomar un lease vencido — y `created_at` es la columna por la que purga el cron de 30 días

`supabase/migrations/0187_wa_evento_pendiente_leases_fencing.sql:260-267`
(`update … set … created_at = clock_timestamp()`) ·
`supabase/migrations/0002_idempotency.sql:6-11` (la columna y su índice) ·
`supabase/migrations/0149_wa_claim_completado.sql:29` (el comentario que la
declara señal de antigüedad del claim) ·
`src/app/api/cron/purgar/route.ts:29-32,57` (`DIAS_WA = 30`)

Retomar el lease de un mensaje mueve su `created_at` al presente. Dos efectos:
el reloj de retención de 30 días se reinicia (una fila que rebota puede vivir
indefinidamente), y `created_at` deja de significar «cuándo llegó el mensaje» —
que es lo que el comentario de la 0149 y el de la 0002 siguen afirmando.

**Consecuencia.** Chica hoy (volumen cero, y la ventana de reintentos de Meta es
de horas). Queda anotada porque es una columna cuyo significado cambió sin que
ninguno de los dos comentarios que la describen se actualizara.

---

### [BAJO] Cuatro migraciones más sin reversión, y el sondeo de arranque no alcanza a ninguna de las cuatro

`src/lib/likida/startup.ts:287-293` (`COLUMNAS_RECIENTES`, la última entrada es
`'0171'`) · las cuatro migraciones, ninguna con bloque `down`

Ninguna de las cuatro tiene reversión —igual que las 179 anteriores, así que es
contexto y no novedad—, pero la 0187 sube la apuesta: `create or replace
function` sobre `reclamar_wa_pendiente` **destruye** el cuerpo de la 0177 y le
cambia el modo de seguridad de `invoker` a `definer`. No queda dónde leer la
versión anterior.

Y el mecanismo que este repo construyó para gritar cuando la base va atrasada
—`COLUMNAS_RECIENTES`— se quedó en la 0171. Cuatro migraciones nuevas, catorce
RPC nuevas de las que dependen el ejecutor de tools, el presupuesto y la bandeja
de WhatsApp, y **cero sondas de arranque**. El fallo se descubre cuando un
chofer manda una foto, no cuando el proceso levanta.

---

## Lo que revisé y está bien

- **Las ocho RPC nuevas cierran el hueco de `pg_temp` que este rubro reportó
  tres rondas seguidas.** Todas llevan `set search_path = ''` (0187:22, 74,
  129, 154, 183, 214, 284, 308, 334, 353; 0188:20, 107, 133, 158), que es
  **más fuerte** que añadir `pg_temp` al final: con el search_path vacío toda
  referencia tiene que ir calificada, y todas lo están. Las cinco DEFINER
  legacy sin `pg_temp` siguen ahí, pero el delta no añadió una sexta — rompió
  la racha.
- **Los grants de las RPC nuevas están completos y por firma.** Las diez de la
  0187 (`:362-381`) y las cuatro de la 0188 (`:174-181`) se revocan de
  `public, anon, authenticated` y se conceden solo a `service_role`, cada una
  con su lista de tipos. Repasé una por una: no falta ninguna, y
  `fail_wa_mensaje_procesado`/`release_wa_mensaje_procesado` —el alias— están
  las dos.
- **El fencing del inbox de WhatsApp hace lo que dice.** `completar_`,
  `fallar_` y `renovar_wa_pendiente` condicionan el `UPDATE` a
  `claim_token = p_claim_token and claim_owner = p_owner`, así que un worker
  viejo no puede cerrar ni liberar el claim de uno nuevo. Intenté y **refuté**
  que un worker con el token viejo pudiera devolver un intento ajeno: el
  `where` de `0187:192-195` lo excluye.
- **El orden causal por chofer se movió a la base, y con la asimetría
  correcta.** `listar_wa_pendientes` (`:39-48`) solo bloquea si el mensaje
  anterior tiene lease **vigente** —para no vaciar el lote—, mientras que
  `reclamar_wa_pendiente` (`:98-106`) bloquea ante **cualquier** anterior sin
  procesar. El listado es optimista y el claim es la frontera de verdad; el
  comentario de `:36-38` lo dice y el código lo cumple.
- **`FOR UPDATE SKIP LOCKED` en vez de esperar.** Tanto `claim_agente_mutacion`
  (`0188:60`) como `claim_wa_mensaje_procesado` (`0187:247`) tratan la fila
  trabada como «en curso» en vez de encolarse detrás de un OCR lento. Es la
  decisión correcta para lambdas con `maxDuration`.
- **La 0185 impone tres garantías reales que el JSON no podía dar**, y las tres
  están verificadas por el bloque 152: `qa_foto.hash unique` (mata el
  read-modify-write del manifiesto), PK `(corrida_id, n)` (el upsert del motor
  no puede duplicar un paso) y `on delete cascade` (sin pasos huérfanos).
- **`EstadoCorrida` y `EstadoPaso` de TypeScript coinciden EXACTAMENTE con los
  CHECK de la 0185.** Seis valores y cinco valores, en el mismo orden
  (`qa-tipos.ts:21-22` contra `0185:71` y `0185:109`). Es el contraste que
  falta en `prospecto.estado`.
- **El bloque 153 (0188) está totalmente calificado.** Once claves contra once
  esperados, todos sin espacios, así que el parser de
  `correr-verificaciones.mjs` los compara de verdad — ninguno cae en la rama
  comodín de `:250-255`. Y prueba lo que importa: `relevo=execute` tras vencer
  el lease **en la base**, `viejo=f` (el token anterior ya no puede completar),
  `nuevo=t`, `cached=cached`, `permisos=f`.
- **`SIN_CALIFICAR_CONOCIDOS` no creció.** Sigue en 19
  (`correr-verificaciones.mjs:390-410`) y ninguno de los dos bloques nuevos se
  añadió a la lista, que es la regla escrita en `:381` («esa lista se baja, no
  se sube»). El delta la respetó.
- **pgTAP entra a CI por primera vez.** `ci-postgres.yml:166` corre
  `pg_prove --dbname="$DATABASE_URL" --verbose supabase/tests/wa_leases_fencing.sql`.
  Es la primera vez que este repo puede probar una carrera de dos sesiones de
  verdad, y no un doble de Supabase.
- **Toda migración nueva tomó una decisión explícita y la prueba pasa.** 0185 →
  bloque 152, 0188 → bloque 153, 0186 y 0187 exentas con razón escrita
  (`migraciones_verificadas.test.ts:116-117`). Corrido: 9/9 verde.
- **Intenté y refuté que `claim_agente_mutacion` pudiera devolver `execute` a
  dos workers a la vez.** El `insert … on conflict do nothing` no espera a una
  transacción concurrente sin confirmar, pero entonces el `select … for update
  skip locked` de `:56-60` tampoco la ve y el resultado es `busy` — el lado
  seguro. El comentario de `:38-39` describe mal el mecanismo; el resultado es
  correcto.
- **Intenté y refuté que la renumeración pudiera romper `db push`.** Las cuatro
  migraciones son idempotentes línea por línea, y la única sentencia no-`if
  not exists` (`0187:12`) va precedida de su `drop index if exists`. El
  `db push --dry-run` de `deploy-preview-promote.yml:214` es la compuerta.
- **Intenté y refuté que el hueco de numeración fuera nuevo.** Faltan `0067`,
  `0068`, `0069`, `0156` y `0179` — exactamente los mismos cinco que la ronda
  anterior documentó como benignos. La renumeración no abrió ninguno.
- **`reservar_presupuesto_llm` sí serializa a los workers concurrentes.**
  `pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0))` (`0186:62`)
  antes de leer la suma: dos reservas simultáneas del mismo tenant no pueden
  ver ambas el mismo disponible. Eso sí lo impone la base — el problema es lo
  que pasa *después* (ver el ALTO).
- **`registrar_pago_tx` sí compara el tenant de la factura.** `0159:96`,
  `where id = p_factura and tenant_id = p_tenant … for update`, con
  `raise … 'factura % fuera de la flota %'`. El camino de la app está cerrado;
  el que falta es el de la relación.

---

## Lo que NO alcancé a revisar

- **Nada de esto se corrió contra Postgres.** No hay binarios de Postgres ni
  Supabase en esta caja. La ronda anterior levantó un clúster y midió; yo leí.
  Todo lo que digo sale del SQL y del código que lo llama, y donde afirmo un
  comportamiento de la base (el `on conflict do nothing` que no espera, el
  `unique` que no ata NULL, `date_trunc` en UTC) es semántica documentada de
  Postgres, no una medición. **Los escenarios con valores de este informe no
  están reproducidos; están derivados.**
- **`supabase/tests/wa_leases_fencing.sql` (259 líneas de pgTAP).** Lo abrí
  para ver qué tablas toca, pero no lo ejecuté ni reconstruí sus aserciones una
  por una contra el cuerpo de las RPC. Es la pieza que más valor tendría
  auditar corriéndola: si sus `is()` prueban lo que el título promete, la 0187
  merecería subir; si prueban el camino feliz, la exención de
  `migraciones_verificadas.test.ts:117` estaría apoyada en aire.
- **El ledger remoto (`supabase_migrations.schema_migrations`).** La pregunta
  de la renumeración solo se cierra del todo leyendo qué versiones tiene
  aplicadas producción. Concluí «benigna por idempotencia», no «verificada
  contra remoto».
- **La batería completa de `verificaciones.sql` (135+ bloques).** No la corrí.
  Los tres bloques que la ronda anterior clasificó como fallos escondidos
  (`INDICE_FACTURACION`, `INDICES_PAGINACION`, `FISCAL_AGREGADO_0151`) siguen
  literales en `SIN_CALIFICAR_CONOCIDOS`; no los volví a medir.
- **Los otros dieciséis bloques SIN CALIFICAR.** Igual que la ronda anterior:
  siguen sin reconstruirse uno por uno.
- **Retención de las cuatro tablas nuevas.** `qa_foto` (fotos de tickets reales
  con RFC y domicilio, según su propia migración), `qa_corrida`,
  `qa_corrida_paso`, `agente_mutacion_idempotencia` y `llm_presupuesto_reserva`
  **no aparecen** en `/api/cron/purgar` ni en `privacidad.ts`: crecen sin
  barrido y sin política de borrado declarada. Lo dejo anotado en vez de
  desarrollarlo porque el volumen hoy es cero y le toca a legal y a
  operabilidad; pero `qa_foto` guarda datos personales de terceros y merece
  mirada.
- **`scripts/demo-5k.sql`, `supabase/seed.sql` y `scripts/carga-15k.sql`**
  contra las restricciones nuevas. Sin base, imposible.
- **El catálogo REAL de producción.** Índices puestos a mano o policies creadas
  desde el panel de Supabase no se ven desde aquí.
