# Modelo de datos y esquema — auditoría 17 (pase 6)

**Nota: 5/10** (antes 6). Razón del movimiento: **deuda que cobró factura**. El
pase 2 diagnosticó que "el aparato que dice qué garantías están probadas está
roto y sigue en verde". Este pase ese mismo punto ciego cobró dos veces, con
código escrito *en este pase*: (a) la v3 del panel abrió el primer camino de
ESCRITURA a `viaje` desde el navegador y nadie lo cruzó contra la definición de
la columna — su camino por DEFECTO revienta contra un `NOT NULL` de la `0001`;
y (b) el bloque 64, nuevo, aborta en un `23505` antes de llegar a su `raise`,
que es literalmente el defecto que reporté hace cuatro días sobre los bloques
26/28/30.

Dicho lo justo: las migraciones `0088`–`0093` son **buen trabajo de esquema** —
la `0089` cierra un CRÍTICO real, la `0092` cierra mi propio reincidente #2 del
pase 1, y la `0090` es la migración mejor argumentada del repo. Solas valdrían
un 7. No lo son porque el contrato *código ↔ columna* se deterioró más de lo que
mejoró el DDL.

El riesgo mayor del rubro, hoy: **la página `/dashboard/viajes/nuevo` —la que se
pidió en vivo y la que se va a enseñar— no puede completar su camino por
defecto.** El `<select>` de operador nace en "Sin asignar todavía", y
`viaje.operador_id` es `not null` desde la `0001`. La suite lo cubre con un
mock, así que está verde.

---

## Estado de los abiertos que traía (pase 1 + pase 2)

Verificados uno por uno contra HEAD (`0fa27b0`). **Dos se cerraron.**

| # | Hallazgo | Estado | Evidencia |
|---|---|---|---|
| p1-1 | Gasto SIN FECHA restado de un contador del que no formó parte | **CERRADO** | `desde_db.ts:85-93` ahora documenta y aplica el arreglo del pase 5 (M3): solo se resta lo fechado en el ejercicio. |
| p1-2 | `0082/0083/0085` borraron el `search_path` de `config_tenant_valida` | **CERRADO** | `0092:49` `alter function … set search_path = public, pg_temp`, con bloque 67 (`:3303`) que lo comprueba contra el catálogo **y** que el cuerpo sigue validando. Se fijó con `alter function`, no con `create or replace`. Bien hecho. |
| p1-3 | `cfdi_consolidado_linea`: "conciliada ⇒ `gasto_id` no nulo" solo en el comentario | **REINCIDENTE** | `0076:56-57` y `:70` intactas; ninguna migración `0088`-`0093` la toca. |
| p1-4 | El trigger de "nada se reescribe tras liquidar" deja fuera `concepto`/`forma_pago`/`clave_prod_serv`, sin brazo de DELETE | **REINCIDENTE** | `0042:22-30` intacta. |
| p1-5 | `guardar_liquidacion_tx`: el `ON CONFLICT DO UPDATE` no recomprueba el tenant | **REINCIDENTE** | `0021:37-50` intacta. |
| p1-6 | La `0084` es SQL muerto | **REINCIDENTE, con agravante nuevo** | ver [BAJO] abajo. |
| p1-7 | `liquidacion` sin el CHECK de cuadre que sí tienen las dos tablas de factura | **REINCIDENTE** | `0001:67-76` intacta. |
| p1-8 | Dos contadores del 15% con criterios distintos | **REINCIDENTE** | ver [BAJO] abajo. |
| p1-9 | Ninguna tabla nacida después de la `0028` adoptó la FK compuesta con `tenant_id` | **REINCIDENTE** | `pod` sigue con `viaje_id uuid not null references public.viaje(id) on delete cascade` simple (`0047:130`), sin par `(tenant_id, viaje_id)`. La `0090:114-119` le quita la escritura por RLS, lo cual reduce el radio, pero no escribe la relación. |
| p1-10 | `cfdi_consolidado_linea.gasto_id` es FK sin índice | **REINCIDENTE** | `0076:78-85` sigue creando dos índices, ninguno sobre `gasto_id`. |
| p2-A1 | Bloques 26/28/30 abortan en su primer INSERT | **REINCIDENTE, y peor** | ver [ALTO] abajo. |
| p2-A2 | `tenant` y `app_user` sin comprobación de escritura | **REINCIDENTE** | ver [ALTO] abajo. |
| p2-M1 | Índice de la `0087` | **REINCIDENTE** | `0087:19-21` intacta; `recordatorio_comprobacion.ts:54-61` intacta. |
| p2-B1 | Bloque 49 audita funciones que la `0086` borró | **REINCIDENTE** | ver [BAJO] abajo. |

---

## Lo primero: qué borró `master` y qué agregó la rama

El encargo decía que `supabase/verificaciones.sql` cambió fuerte, "−348 líneas
en el diff contra la rama". La dirección importa y la medí:

```
$ git merge-base origin/master HEAD
d6615176beaf54d7551a879c9b8c4ca8232c1699        # == origin/master
$ git diff --stat origin/master..HEAD -- supabase/
 6 migraciones nuevas (0088-0093)   382 +
 supabase/verificaciones.sql        342 +++++
 7 files changed, 724 insertions(+)             # CERO borrados
```

**`origin/master` es ancestro estricto de HEAD.** `master` no borró **una sola
línea** de `verificaciones.sql`: las 342 son adiciones de la rama (bloques 63 a
68, uno por migración nueva). El "−348" es el mismo diff leído al revés. No hay
nada que reconciliar y ninguna migración de la rama choca con `master`: el
máximo de `master` es `0087`, la rama arranca en `0088`. **El orden numérico
sigue siendo válido**, sin huecos nuevos ni colisiones — a diferencia del pase
2, donde sí hubo que renumerar un `0086`.

---

## Hallazgos

### [CRÍTICO] `viaje.operador_id` es `NOT NULL`, y la página "Nuevo viaje" ofrece "Sin asignar todavía" como opción por DEFECTO

`supabase/migrations/0001_init.sql:49` ·
`src/app/dashboard/forma-viaje.tsx:74-75` ·
`src/lib/likida/operacion.ts:566` ·
`src/app/dashboard/viajes/nuevo/page.tsx:66-77`

La columna, desde el primer día del repo y sin una sola migración que la afloje:

```sql
-- 0001_init.sql:49
operador_id uuid not null references operador(id) on delete restrict,
```

Comprobado que nadie la relajó: `grep -rn "drop not null" supabase/migrations/`
**no devuelve nada**, y los únicos `alter table … viaje` posteriores agregan
columnas (`0011`, `0020`, `0031`, `0047`, `0048`, `0058`, `0070`, `0087`).

El formulario nuevo (12-ago) nace con el operador VACÍO y lo declara opcional en
la propia pantalla:

```tsx
// forma-viaje.tsx:74-75
<select id="operadorId" name="operadorId" … defaultValue="">
  <option value="">Sin asignar todavía</option>
```

y la escritura lo traduce a `NULL` sin más:

```ts
// operacion.ts:566
operador_id: v.operadorId || null,
```

**Escenario, con valores.** Javier abre `/dashboard/viajes/nuevo` como
`flota_admin` (`ASIGNA = {superadmin, flota_admin, encargado}`,
`permisos.ts:18`), llena Folio `VJ-2026-0900`, Origen `Silao`, Destino
`Monterrey`, Anticipo `8000`, **no toca el `<select>`** — porque la pantalla
dice que puede no tocarlo — y aprieta *Crear viaje*. El INSERT que sale es
`{tenant_id, folio:'VJ-2026-0900', …, operador_id: null, estatus:'abierto'}` →

```
ERROR 23502: null value in column "operador_id" of relation "viaje"
             violates not-null constraint
```

`crearViaje` lanza (`operacion.ts:571`), el `catch` de la server action
(`viajes/nuevo/page.tsx:74-77`) lo convierte en **"No se pudo crear el viaje.
Revisa los datos e inténtalo de nuevo."** — y no hay nada que revisar: los datos
son válidos. El único campo que lo destraba es el que la pantalla presentó como
opcional, y el mensaje no lo menciona.

**Consecuencia.** Es la pantalla del demo. El contralor ve al vendedor darle a
un botón que su propio producto anuncia ("El viaje nace **abierto**: desde ese
momento el operador puede mandar sus comprobantes", `page.tsx:99-101`) y recibir
un error genérico que se repite tantas veces como lo intente. Además `master`
construyó encima de la suposición contraria: `getTableroOperacion`
(`operacion.ts:460`) calcula `porAsignar: enCurso.filter((v) => !v.operador_id).length`
y `tablero-operacion.tsx:33` lo pinta como el KPI **"Por asignar"** — un
contador que la restricción obliga a ser **siempre 0**. Es un cero que se lee
como medición, contra la primera regla del `CLAUDE.md`.

**Por qué la suite no lo ve.** `operacion.test.ts:311-316` ejecuta exactamente
el camino roto —`crearViaje('t-1', { folio: 'VJ-9', origen: 'GDL', destino:
'MTY', anticipo: 5000 })`, sin `operadorId`— y **pasa** (lo corrí: 33/33 verdes).
El cliente de Supabase está mockeado, así que la prueba prueba el mock. Es el
caso literal del rubro: *"un tipo de TypeScript más permisivo que la columna"*
(`NuevoViaje.operadorId?: string | null`, `operacion.ts:483`;
`types/likida.ts:156 operadorId?: string`).

**Refutación intentada.** ¿Lo salva algún default o trigger? No: la columna no
tiene `default` y PostgREST envía la llave explícita como `null` (omitirla daría
el mismo 23502). ¿Existe en producción algún viaje sin operador que pruebe lo
contrario? No: los 4 viajes de `seed.sql:115-152` traen `operador_id`, y el
otro creador —`crear_viaje_wa.ts:696`— declara `operadorId: string`
**obligatorio**. Por eso el `NOT NULL` sobrevivió 93 migraciones sin molestar a
nadie: hasta el 12-ago **ningún camino podía crear un viaje sin chofer**. El
panel v3 es el primero, y llegó sin mirar la columna.

**Causa raíz probable:** la v3 se diseñó desde el flujo de despacho ("primero
doy de alta el viaje, luego le asigno chofer") sin cruzarlo contra un `NOT NULL`
que codifica la premisa opuesta del producto de WhatsApp.

---

### [ALTO] REINCIDENTE — Tres bloques de `verificaciones.sql` siguen abortando en su primer INSERT, y el bloque 28 además ya verifica policies que la `0090` reemplazó

`supabase/verificaciones.sql:1006` · `:1104` · `:1202` ·
`supabase/migrations/0086_retirar_rol_operador.sql:87-99` ·
`src/lib/likida/migraciones_verificadas.test.ts:99-111`

Sin cambio desde el pase 2, verificado hoy: los tres `insert into app_user (…,
rol, …) values (…, 'operador', …)` siguen en pie —

```
1006:    values (v_u1, v_t, 'zzz-verif-chofer1@likida.test', 'operador', v_o1);      -- bloque 26 (mig. 0045)
1104:    values (v_u1, v_t, 'zzz-verif-chofer-op@likida.test', 'operador', v_o1);    -- bloque 28 (mig. 0047)
1202:    values (v_chofer, v_t, 'zzz-verif-gps-chofer@likida.test', 'operador', v_o); -- bloque 30 (mig. 0050)
```

— contra un dominio que la `0086` redujo a
`rol in ('superadmin','flota_admin','contador','encargado')`. Pegar cualquiera
de los tres en el editor de Supabase da `ERROR 23514 … "app_user_rol_dominio"` y
el `do $$` aborta ahí, sin llegar a la mitad del bloque que **no** habla del
chofer (en el 30, el `select count(*) into n_cred from rastreo_credencial` de
`:1212`, que es la comprobación de que el CONTADOR no ve el token del proveedor
de rastreo — `solo_admin_flota`, `0050:150-152`, policy **viva**).

**Lo nuevo de este pase:** el bloque 28 ya no solo aborta, sino que además
apunta a un mundo que dejó de existir. Verifica el aislamiento de
`unidad`/`mantenimiento`/`incidencia` bajo la policy `tenant_data`, y la
`0090:105-125` **dropeó `tenant_data` en las 13 tablas de operación** para
sustituirla por `tenant_lectura` (solo `select`). Aunque el INSERT pasara, el
bloque comprobaría el nombre de una policy que ya no está.

`migraciones_verificadas.test.ts` sigue en verde (4/4, corrido) porque su regla
es que el número aparezca en un **título** (`:102`,
`new RegExp('\\b0045\\b').test(TITULOS)`), no que el bloque corra.

**Consecuencia:** el repo responde "0045, 0047 y 0050 están comprobadas" y las
tres son incomprobables desde el 7-ago. El próximo agente que construya sobre
`unidad`/`incidencia` —o Javier antes de un demo— cree que el aislamiento está
verificado contra la base real.

---

### [ALTO] `aplicarFactura` nunca escribe `metodo_cobro`: toda factura de Stripe se guarda etiquetada `'transferencia'` y queda bajo un único parcial que no era para ella

`src/lib/saas/suscripcion.ts:413-428` ·
`supabase/migrations/0057_cobro_por_transferencia_directa.sql:27` y `:49-52` ·
`src/app/api/stripe/webhook/route.ts:162-175`

La `0057` agregó la columna que distingue los dos modelos de cobro, **con
default**:

```sql
-- 0057:27
alter table public.factura_saas add column if not exists metodo_cobro text not null default 'transferencia';
```

y colgó de ella un único parcial:

```sql
-- 0057:49-52
create unique index if not exists factura_saas_una_por_periodo
  on public.factura_saas (tenant_id, periodo_inicio, periodo_fin)
  where metodo_cobro = 'transferencia' and estado <> 'cancelada';
```

El escritor del camino de transferencia lo pone explícito
(`transferencia.ts:191`, `metodo_cobro: 'transferencia'`). El escritor del
camino de **Stripe** no lo pone en absoluto: el objeto del upsert
(`suscripcion.ts:414-426`) tiene `tenant_id, periodo_inicio, periodo_fin, monto,
subtotal, iva, moneda, estado, pagada_en, stripe_invoice_id, url_pago` — y nada
más. PostgREST omite la columna, Postgres aplica el default, y **cada factura
cobrada con tarjeta queda escrita como cobrada por transferencia bancaria.**

**Escenario, con valores.** Flota `T`, agosto 2026. Javier emite la mensualidad
por transferencia (`emitirMensualidad`, el modelo de negocio que la `0057`
describe como el default): fila `R1 = (T, '2026-08-01', '2026-08-31',
estado 'pendiente', metodo_cobro 'transferencia', referencia 'LIKIDA-…')`. La
flota decide pagar con tarjeta y Stripe manda `invoice.paid` con
`id = 'in_1AbcXyz'` y periodo 2026-08-01…2026-08-31. El webhook
(`route.ts:162`) llama `aplicarFactura`:

- `onConflict: 'stripe_invoice_id'` no encuentra pareja (`R1` lo tiene en NULL,
  y con `NULLS DISTINCT` nunca empata) → Postgres intenta **INSERT**;
- la fila nueva sale con `metodo_cobro = 'transferencia'` (default) y
  `estado = 'pagada'`, así que **entra al predicado** del índice parcial;
- misma llave `(T, '2026-08-01', '2026-08-31')` que `R1` →

```
ERROR 23505: duplicate key value violates unique constraint "factura_saas_una_por_periodo"
```

`aplicarFactura` lanza (`suscripcion.ts:429`) sin la rama de `23505` que su
hermana sí tiene (`transferencia.ts:197-200`), el webhook devuelve 500, Stripe
reintenta y se rinde. **La flota pagó, no hay fila de factura y no hay CFDI que
timbrarle** — exactamente el modo de falla que la `0089` acaba de cerrar por la
otra puerta, reabierto por un default de columna.

Y aun sin ese cruce, el dato es falso de forma determinista: `/admin` no lee
`metodo_cobro` hoy (`grep` devuelve solo el escritor de `transferencia.ts:191`),
pero la columna existe para decidir cómo se concilia una factura, y hoy miente
en el 100% de las filas de Stripe.

**Refutación intentada.** ¿Puede `aplicarFactura` recibir `stripeInvoiceId`
vacío y multiplicar filas? No: la firma lo declara `stripeInvoiceId: string`
obligatorio (`suscripcion.ts:396`). ¿Hay trigger que corrija `metodo_cobro`? No
aparece ninguno en las 90 migraciones. ¿Salva el reintento del mismo invoice?
Sí, ese caso funciona (mismo `stripe_invoice_id` → `DO UPDATE`); lo que falla es
un invoice **distinto** para un periodo que ya tiene factura.

**Causa raíz probable:** la `0057` eligió `default 'transferencia'` para no
romper las filas existentes, y el camino de Stripe —escrito antes que la
`0057`— nunca se actualizó para declarar el suyo.

---

### [ALTO] REINCIDENTE — `tenant` y `app_user` siguen sin una sola comprobación de que no se escriben por RLS, y `EXENTAS` sigue declarando retiradas dos migraciones que están medio vivas

`supabase/verificaciones.sql` (ausencia) ·
`src/lib/likida/migraciones_verificadas.test.ts:80-82` ·
`supabase/migrations/0078_rls_chofer_sin_escritura.sql:50-57` ·
`supabase/migrations/0079_rls_chofer_sin_lectura_personal.sql:26-34`

La `0090` hizo un trabajo excelente con las 19 tablas de negocio y les escribió
un bloque de regresión de verdad (el 65, `:3125-3252`, que prueba las tres
mitades y la contraprueba del `service_role`). **Y saltó las dos tablas cuyo
bloque se había borrado.** Verificado hoy sobre el archivo completo, ya con los
seis bloques nuevos:

```
$ grep -n "update tenant set\|update app_user set" supabase/verificaciones.sql
278, 281, 284, 288, 292, 1411, 1416, 2993, 3341, 3348   → todos `update tenant set`
                                                          y NINGUNO bajo `set local role authenticated`
$ …                                                     → `update app_user set` : CERO ocurrencias
```

Los diez corren como dueño (validan el CHECK de `config`, no la RLS). El bloque
65 impersona `authenticated` y prueba `update viaje` (`adm_escribe_viaje`), pero
no toca `tenant` ni `app_user`.

**Escenario, con valores.** Las dos garantías siguen siendo ciertas hoy
(`tenant_self` es `for select` desde `0078:50-57`; `app_user_self` es `for
select` desde `0086:70-72`), así que con la llave publicable y el JWT de un
`flota_admin`:

```
PATCH /rest/v1/tenant?id=eq.11111111-1111-1111-1111-111111111111
  {"config":{"politica":[]}}                       → []  (0 filas)
PATCH /rest/v1/app_user?id=eq.<su propio uuid>
  {"rol":"superadmin"}                             → []  (0 filas)
```

El problema es que **nada del repo lo comprueba**, y `EXENTAS` afirma lo
contrario por escrito: `:80` dice de la `0078` *"Retirada por la 0086… el bloque
62 prueba la garantía más fuerte que la reemplaza"* y `:81` lo mismo de la
`0079`. Media migración cada una: la `0078` hace (a) `not is_operador()` en
siete tablas —muerto— y (b) **deja `tenant` de solo lectura**, que aplica igual
a `flota_admin`, `contador` y `encargado`.

**Consecuencia:** el segundo PATCH es escalada a superadmin —`is_superadmin()`
lee `app_user.rol` y `lib/admin/negocio.ts` cruza todos los tenants— y el
primero reescribe los topes de dinero de la flota. El día que una migración
futura recree `tenant_self` con el patrón `for all` de la `0001:114`, la
compuerta sigue verde. Que la `0090` haya escrito un bloque impecable para las
tablas vecinas y dejado estas dos fuera es lo que sube la gravedad: ya no es un
olvido de inventario, es un inventario que se consultó y se leyó incompleto.

---

### [MEDIO] El bloque 64 —escrito ESTE pase para comprobar la `0089`— aborta con `23505` antes de llegar a su `raise`: la verificación del CRÍTICO no se puede leer

`supabase/verificaciones.sql:3115-3117` ·
`supabase/migrations/0057_cobro_por_transferencia_directa.sql:49-52`

El bloque 64 comprueba que el único de `factura_saas.stripe_invoice_id` sea
TOTAL. Sus tres pasos escriben todos sobre el **mismo tenant y el mismo
periodo**, y ninguno declara `metodo_cobro` (default `'transferencia'`):

```sql
-- :3101-3103   paso 1
values (v_t, '2026-08-01', '2026-08-31', 1160, 'pendiente', 'in_ZZZVERIF0089')
-- :3108-3110   paso 2  (mismo invoice → DO UPDATE, misma fila)
-- :3115-3117   paso 3
insert into factura_saas (tenant_id, periodo_inicio, periodo_fin, monto, estado) values
  (v_t, '2026-08-01', '2026-08-31', 10, 'pendiente'),
  (v_t, '2026-08-01', '2026-08-31', 20, 'pendiente');
```

Las cuatro filas caen dentro del predicado de `factura_saas_una_por_periodo`
(`metodo_cobro = 'transferencia' and estado <> 'cancelada'`) y comparten la
llave `(tenant_id, periodo_inicio, periodo_fin)`. El paso 3 choca **dos veces**:
su primera fila contra la del paso 1, y sus dos filas entre sí.

**Escenario:** pegar el bloque 64 en el editor de Supabase, como manda el
encabezado del archivo (`:12-13`). Sale

```
ERROR 23505: duplicate key value violates unique constraint "factura_saas_una_por_periodo"
```

en vez de la línea que el bloque promete,
`UPSERT_STRIPE_0089 primer-insert=1 tras-reintento=1 monto=2320 sin-stripe-id=2`.
Los pasos 1 y 2 —la verificación del CRÍTICO— **sí corrieron**, pero sus valores
solo se imprimen en el `raise exception` de `:3121-3122`, que nunca se alcanza, y
la transacción se revierte entera.

**Consecuencia:** quien corra el bloque para confirmar que el upsert de Stripe
quedó arreglado obtiene un error de llave duplicada. La lectura natural es "el
arreglo no sirvió" o "hay basura de una corrida anterior" — cuando lo que pasa
es que el paso 3, el que ilustra `NULLS DISTINCT`, tropieza con un índice
distinto que la `0089` no consideró. Es el mismo defecto que reporté en el pase
2 sobre los bloques 26/28/30, repetido en código nuevo.

**Causa raíz probable:** el bloque se escribió mirando solo
`factura_saas_stripe_unica`; `factura_saas_una_por_periodo` vive en otra
migración (`0057`) y depende de un default de columna que no está a la vista.

---

### [MEDIO] `viaje.folio` no tiene único, y el PDF de liquidación usa el folio como identificador del documento

`supabase/migrations/0001_init.sql:51` ·
`src/lib/likida/liquidacion/pdf.ts:75` y `:191` ·
`src/app/dashboard/forma-viaje.tsx:48-50`

`viaje` declara `folio text` a secas. Comprobado que ninguna migración le pone
unicidad: los únicos `unique index … folio` del esquema son
`factura_folio_unico` (`0049:69`) y `cotizacion_folio_unico` (`0051:105`) — las
dos sobre tablas que hoy están **vacías**. La tabla que sí tiene filas, y cuyo
folio se imprime, no lo tiene.

Hasta este pase el folio solo entraba por WhatsApp. La v3 abrió un campo de
texto libre donde el jefe lo teclea (`forma-viaje.tsx:48-50`, `maxLength={40}`).

**Escenario, con valores.** El jefe crea `VJ-2026-0900` para el Chofer A
(entra). Media hora después, por error de dedo, crea `VJ-2026-0900` para el
Chofer B — pasa, porque `uq_viaje_abierto_por_operador` (`0029:71`) solo impide
dos viajes abiertos **del mismo operador**, y son operadores distintos. Ambos
viajes se liquidan. Se generan dos PDFs y los dos dicen, en la esquina superior
derecha:

```
// pdf.ts:191
right(`Folio ${viaje.folio ?? liq.id.slice(0, 8).toUpperCase()}`, …)
→  "Folio VJ-2026-0900"
```

con `setTitle('Liquidación VJ-2026-0900')` en los dos archivos (`pdf.ts:75`), y
totales comprobados distintos.

**Consecuencia:** el contralor cruza el PDF contra su contabilidad usando el
folio, que es el único identificador humano que el documento le ofrece, y tiene
dos liquidaciones indistinguibles con cifras distintas. Es el caso de manual del
rubro —"falta de `unique` donde la lógica asume unicidad"— y roza la regla del
producto: el rótulo "Folio VJ-2026-0900" deja de identificar una cosa.

**Refutación intentada.** ¿Lo cubre algo aguas arriba? No: `crearViaje`
(`operacion.ts:559-571`) valida tenant del operador y de la unidad, y nada del
folio; el `catch` de la página es genérico. El chat lo propaga tal cual
(`chat-tools.ts:116`, `folio: v.folio`). El único guardarraíl adyacente es
`detectarAnomalias`, que busca folios duplicados **de gastos**
(`analytics.ts:262-282`), no de viajes.

---

### [MEDIO] REINCIDENTE — El índice de la `0087` encabeza por una columna que la consulta nunca filtra, y su predicado parcial no recorta nada

`supabase/migrations/0087_recordatorio_comprobacion.sql:19-21` ·
`src/lib/likida/recordatorio_comprobacion.ts:54-61`

Sin cambio desde el pase 2 (las dos citas verificadas hoy, intactas). El índice
es `(tenant_id, estatus, fecha_inicio) where recordatorio_comprobacion_en is
null`; el cron que debe servir cruza todos los tenants y **no filtra
`tenant_id`**, así que la columna líder no tiene cualificador y el btree no
puede posicionarse. El predicado parcial es verdadero para todo viaje que nunca
cruzó los 3 días, o sea casi el histórico entero. Detalle completo y el
escenario de las 40,000 filas: `docs/auditoria-17/datos.md` del pase 2, que
sigue siendo exacto palabra por palabra.

---

### [BAJO] REINCIDENTE — El bloque 49 sigue auditando dos funciones que la `0086` borró, mientras el bloque 67, escrito este pase, sí trae la lista correcta

`supabase/verificaciones.sql:2697-2698`, `:2704-2705`, `:2713-2714` (las tres
listas `p.proname in (…)`) · `:3331-3335` (la lista del bloque 67) ·
`supabase/migrations/0086_retirar_rol_operador.sql:80-81`

El bloque 49 sigue incluyendo `is_operador` y `get_user_operador_id` en sus tres
`in (…)`. Como el `where` simplemente no las encuentra, el bloque **no falla**:
degrada en silencio. Su salida registrada como "corrida real" (`:2686-2688`)
lista **siete** nombres; hoy salen **cinco**, y quien compare no puede
distinguir "faltan dos porque la 0086 las borró" de "faltan dos porque alguien
les quitó el `search_path`" — que es la alarma que el bloque existe para dar.

Lo que lo convierte en hallazgo y no en polvo: el bloque **67**, escrito este
mismo pase (`:3331-3335`), enumera la familia entera y **excluye correctamente**
las dos borradas. Es decir, alguien tuvo la lista buena en la mano y no
retropropagó la corrección quince bloques más arriba, en el archivo que estaba
editando.

---

### [BAJO] REINCIDENTE — La `0084` es SQL muerto, y la razón que la exime del test es factualmente falsa

`supabase/migrations/0084_sumar_combustible_ejercicio.sql` ·
`src/lib/likida/migraciones_verificadas.test.ts:57` ·
`src/lib/likida/repo.ts:803-861`

`grep -rn "sumar_combustible" src/` devuelve **una sola línea**, y es la cadena
dentro de su propia exención. La RPC no tiene llamador.

Lo nuevo: la razón escrita de la exención dice

> `'0084'`: *"RPC sumar_combustible_ejercicio: si falta, getAcumuladoCombustible
> lanza ruidoso en el primer cuadre (el RPC no existe)."*

y eso **no es cierto**. `getAcumuladoCombustible` (`repo.ts:803-861`) no llama
ninguna RPC: pagina `from('gasto').select('monto, forma_pago')` en páginas de
1,000 con tope de 100 (`:808-836`). Si la `0084` no se aplicara, no pasaría
absolutamente nada.

**Consecuencia:** una exención con una razón falsa es peor que ninguna. El
siguiente agente que lea `EXENTAS` concluye que la `0084` está en el camino
caliente del 15% y no la toca; en realidad es una función que se puede dropear
sin que se mueva una cifra, y que hoy solo suma superficie que mantener.

---

### [BAJO] REINCIDENTE — Dos contadores del 15% con criterios distintos: `tools.ts` no pasa las claves del SAT

`src/lib/likida/tools.ts:109` · `src/lib/likida/cuadre/desde_db.ts:78` ·
`src/lib/likida/repo.ts:827-831`

El pase 5 arregló el **año** (`tools.ts:108` ahora ancla en la fecha del viaje),
pero no el **criterio**. Sigue en pie:

```ts
// tools.ts:109        (dos argumentos)
const acum = await getAcumuladoCombustible(ctx.tenantId, ejercicio);
// desde_db.ts:78      (tres)
… = await getAcumuladoCombustible(tenantId, Number(anioEjercicio), clavesCombustible);
```

y el propio `repo.ts:827-831` explica qué significa la diferencia: *"el criterio
de 'combustible' era `concepto='diesel'` a secas; el motor usa además las claves
del SAT (15101505/14/15). Tres contadores con tres criterios = el chat dice 8% y
el motor 12%. Ahora se pasa la misma lista de claves que el motor; **sin ella,
diesel a secas**."* La tool pasa `undefined`, así que cae en "diesel a secas".

**Escenario, con valores.** Flota con `hidrocarburos.claves = ['15101505']` y un
ejercicio con $100,000 de diésel, de los cuales $30,000 llegaron con
`concepto='caseta'` pero `clave_prod_serv='15101505'` (el caso que las claves
existen para atrapar). El motor (`desde_db`) cuenta $100,000; la tool del chat
cuenta $70,000. El operador pregunta por WhatsApp "¿cuánto llevo del 15%?" y
recibe un porcentaje que no es el que el motor va a aplicar al cerrar el viaje.

---

## Lo que revisé y está bien

- **Las seis migraciones de la rama no chocan con `master` ni entre sí.**
  `origin/master` es ancestro estricto de HEAD (`git merge-base` = `d661517` =
  `origin/master`), su máximo es `0087`, y `0088`–`0093` son consecutivas sin
  hueco. `migraciones_verificadas.test.ts` reconoce las seis por título (bloques
  63–68) — corrido, 4/4 verde.
- **La `0090` resiste los cuatro ataques que le hice.**
  - *¿Se le escapó alguna tabla de las 19 que la `0086` dejó como `for all`?* No.
    Comparé las dos listas elemento por elemento (`0086:38-43` contra
    `0090:85-88` + `0090:108-112`): 6 + 13 = 19, unión exacta, sin sobrantes ni
    faltantes.
  - *¿Rompe la app de hoy?* No, y su premisa sigue siendo cierta **después** del
    merge de la v3, que es lo que había que reverificar: `supabaseServer()` —el
    único cliente sujeto a RLS— sigue apareciendo 6 veces fuera de pruebas
    (`admin/layout`, `auth/callback`, `cuenta/page`, `login/page`,
    `dashboard/layout`, `auth/session`) y ninguna escribe una tabla de negocio.
    No existe cliente de navegador: `grep -rn "createBrowserClient"` sobre `src/`
    solo pega en un comentario de `proxy.ts:29`. Las superficies nuevas escriben
    todas por `supabaseAdmin()` (`chat/route.ts:59`, `operacion.ts:559`).
  - *¿Amplía permisos al reescribir?* No: cambia `for all` por `for select`, y en
    las 6 del dinero **añade** `ve_finanzas()`. Una policy permisiva menos nunca
    abre camino.
  - *¿Es re-aplicable?* Sí: `drop policy if exists` antes de cada `create`, todo
    dentro de `do $$` con `format(%I)`.
- **La `0089` es correcta y su razonamiento sobre `NULLS DISTINCT` también.** Un
  único sobre columna nullable deja pasar cuantos NULL quieras por default, así
  que el índice total conserva la regla de negocio del parcial y encima Postgres
  sí lo puede inferir para el `ON CONFLICT` que emite PostgREST. Intenté romperla
  por el lado del upsert con `stripe_invoice_id` nulo (que insertaría sin
  límite): **no es alcanzable**, la firma lo exige `string`
  (`suscripcion.ts:396`). El defecto que sí encontré es de `metodo_cobro`, no del
  índice.
- **La `0092` cierra bien mi reincidente del pase 1, y por la vía correcta.**
  `alter function` en vez de `create or replace` (no puede tocar el cuerpo por
  accidente), y `pg_temp` **al final**, que es más estricto que el `public,
  pg_catalog` de la `0035`. Comprobé que ninguna migración posterior a la `0074`
  vuelve a hacer `CREATE OR REPLACE` sobre las funciones de las que cuelga el
  RLS: la última es la `0085` y es precisamente `config_tenant_valida`, la que
  la `0092` repara.
- **El bloque 65 (`0090`) prueba lo que dice, incluidas las contrapruebas.**
  Verifica que el encargado **siga viendo** su operación (`enc_viaje`, esperado
  2) y que el `service_role` **siga escribiendo** (`svc_inserta`,
  `svc_bitacora`) — sin esas dos, un candado de más se leería como éxito. Usa
  dos operadores distintos a propósito para no chocar con
  `uq_viaje_abierto_por_operador`, y prueba el gasto sobre un viaje **sin**
  liquidación para no confundir el trigger `gasto_no_tras_liquidar` con RLS. Es
  el mejor bloque del archivo.
- **El bloque 68 (`0093`) es honesto sobre su propio alcance** (`:3370-3377`):
  dice por escrito que `allowed_mime_types` lo aplica Storage en el PUT y que
  desde SQL solo se puede leer la declaración. Y maneja el caso trampa —
  `v_tipos is null` se trata como "admite SVG", porque un `= any(null)` daría
  `null` y el bloque se leería verde justo en el estado que existe para
  detectar.
- **La superficie nueva de intake NO crea estado persistente, y lo declara.**
  `intake/archivo.ts` (152 líneas) es puro: devuelve un `ArchivoLeido` en
  memoria y no toca la base. `api/dashboard/archivo/route.ts:46-48` y
  `api/dashboard/ingesta/route.ts:5-8` lo dicen explícitamente ("NO ESCRIBE
  NADA"). Consecuencia relevante para mi rubro y la anoto porque es fácil
  confundirla con un hueco: el CFDI que el contralor sube al chat **no pasa** por
  `uq_gasto_cfdi_uuid` ni por `cfdi_xml`, y por diseño no debe — es una sonda de
  lectura, no una ingesta. No hay tabla que falte.
- **El chat no persiste conversación, y su gasto sí tiene tabla.** El historial
  viaja del cliente en cada turno (`chat/route.ts:69`, revalidado en servidor por
  `validacion.ts`); no hay tabla de conversación del panel y no la necesita. El
  costo aterriza en `llm_costo` **una fila por modelo real**
  (`chat/route.ts:102-107`), no una por turno, que es lo correcto cuando hubo
  fallback. Verifiqué que `'chat'` está en el dominio de la columna
  (`0025:146-147`: `fase in ('ocr','cuadre','escalacion','chat','router','whatsapp')`)
  — el tope diario no puede rebotar por un CHECK. Y el tope
  (`.eq('tenant_id').eq('fase','chat').gte('created_at', …)`) está servido por
  `idx_costo_tenant on llm_costo(tenant_id, created_at desc)` (`0003:20`), con
  `fase` como filtro de heap. Nota de vigilancia, no hallazgo: `faseDeModelo`
  (`costos.ts`) desvía a `'escalacion'` cualquier modelo cuyo slug traiga
  `opus`, y el tope solo suma `'chat'` — hoy inalcanzable porque
  `chat: 'google/gemini-3.5-flash-lite'` cae a `'openai/gpt-5.6-luna'`
  (`openrouter.ts:65`) y ninguno es opus; sería real si alguien apunta
  `LIKIDA_MODEL_CHAT` a un opus.
- **Las tools del chat no rompen la regla estructural.** Las once de
  `chat-tools.ts` son de solo lectura, ancladas a `ctx.tenantId`, y sus únicos
  parámetros son enums cerrados (`SIN_PARAMS` o `PARAM_MODO`). Ninguna acepta
  texto libre que llegue a una consulta.
- **Los dominios y unicidades críticas del pase 1 siguen puestos**, recorridos de
  nuevo sin cambios: `0025:87-155`, `0073:60-72`, `0070:44-48`,
  `uq_gasto_cfdi_uuid` (`0065:69-70`), `uq_viaje_abierto_por_operador`
  (`0029:71`). El mismo CFDI sigue sin poder liquidarse dos veces.
- **`app_user` no tiene FK contra `auth.users`** (`0001:15-16`: `id uuid primary
  key`, con el `= auth.users.id` solo en un comentario). Lo verifiqué porque los
  bloques 62 y 65 insertan `gen_random_uuid()` como `app_user.id`; sin FK, corren.
  No lo reporto como hallazgo —cerrar esa brecha es decisión de producto sobre
  provisioning, no un estado imposible— pero queda dicho.

---

## Lo que NO alcancé a revisar

- **Los 62 bloques restantes de `verificaciones.sql` uno por uno.** Hice un
  barrido dirigido —`insert … 'operador'`, `update tenant set`, `update app_user
  set`, `tenant_data`, y los 68 títulos— más una lectura completa de los seis
  bloques nuevos (63–68). Ese barrido es lo que encontró el bloque 64. **No
  descarto que otro de los 62 viejos aborte por una causa que mi barrido no
  buscaba** — el bloque 64 me enseñó que el modo de falla puede ser un índice
  parcial de otra migración que depende de un default de columna, y eso no se
  ve con `grep`.
- **Los bloques 26/28/30 y el 64 contra una base real.** No hay base en este
  entorno. Los cuatro abortos están derivados del texto de las migraciones
  (dominio de `app_user_rol_dominio` tras la `0086`; predicado de
  `factura_saas_una_por_periodo` más el default de `metodo_cobro`), que es
  razonamiento sobre DDL y no medición. Son deterministas y no dependen de
  datos, pero no los corrí.
- **El subsistema SaaS/Stripe completo.** Abrí `factura_saas` (`0052`, `0056`,
  `0057`, `0066`, `0089`) por la puerta de la `0089` y ahí salió el hallazgo de
  `metodo_cobro`. **No** revisé `plan`, `suscripcion`, ni las RPC de `0062`/`0064`
  línea por línea. Dado que un default de columna produjo un ALTO en la primera
  tabla que miré, esta zona merece un pase propio.
- **El bucket de Storage y sus policies** (`0008`, `0039`, `0046`) más allá de lo
  que declara la `0093`.
- **El hueco de numeración `0067`–`0069`** sigue sin poder resolverse sin base, y
  el hueco de bloques 54–60 sigue haciendo el barrido más difícil (cosmético, no
  lo cuento como hallazgo por tercer pase consecutivo).
- **Si existen filas reales que violen algo de lo anterior.** Sin acceso a la
  base no puedo decir cuántos `viaje` hay, ni si alguna flota ya tiene factura de
  Stripe y de transferencia en el mismo periodo.
