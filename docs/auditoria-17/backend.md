# Backend y API — auditoría 17 · pase 5 (12-ago-2026)

**Nota: 4/10** (antes 5). Razón del movimiento: **mirada más profunda**. No es
una regresión: el arreglo del pase 4 (`58c44f9`) está bien hecho y lo verifiqué
línea por línea y con la suite. Baja porque este pase encontró, y **verificó
contra un Postgres 16 real**, un camino donde **el dinero no se escribe nunca y
el producto no se entera**: `aplicarFactura` hace `ON CONFLICT (stripe_invoice_id)`
contra un índice **parcial**, y Postgres rechaza esa sentencia siempre —no solo
en el duplicado, también en el primer insert. Es el ancla textual del rubro
("4 o menos si existe un camino donde el dinero … no se escribe y nadie se
entera"), y llevaba cuatro pases invisible porque las dos pruebas que tocan el
webhook de Stripe **mockean `aplicarFactura` entera**.

Compuerta corrida hoy por mí (HEAD `927e78f`, árbol limpio):
`npx vitest run` sobre `suscripcion_eventos.test.ts`, `stripe/webhook/route.test.ts`,
`id_no_uuid.test.ts`, `conv_lock.test.ts`, `conv_lock_expira.test.ts` →
**46 verdes, 5 archivos**. Además levanté un Postgres 16 efímero
(`/usr/lib/postgresql/16/bin/initdb`, puerto 55432, borrado al terminar) para
**ejecutar** las tres afirmaciones de SQL de este archivo en vez de citarlas de
memoria. Las salidas reales están pegadas abajo.

**El riesgo mayor del rubro hoy:** el día que Likida cobre su primera
mensualidad, el `invoice.paid` de Stripe va a fallar con `42P10` en todos sus
reintentos, la flota va a haber pagado y `factura_saas` va a estar vacía: sin
fila no hay CFDI que timbrar, y el cliente que pagó no puede deducir.

---

## Verificación del arreglo del pase 4 (`58c44f9`)

**Veredicto: el arreglo es correcto y está en la capa correcta. Su prueba
verifica el cableado pero NO la polaridad de la guarda.**

### `src/app/dashboard/[id]/id.ts:25-28` — ¿reconoce todos los huérfanos, y solo esos?

`UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
(`:25`), `esIdDeLiquidacion` (`:27-28`). Es una lista blanca, no una lista negra
de las 18 carpetas: **cualquier** segmento que no tenga forma canónica de uuid
cae. Comprobé que la lista de 18 del test es exactamente la que borró el árbol:

```
$ git diff --name-status 20ecbb1..003c88a -- src/app/dashboard/ | grep '^D' | cut -d/ -f4 | sort -u
analitica chat clientes cobranza contador cotizador cuadre despacho documentos
facturacion incidencias mapa operadores pod rentabilidad unidades valor-ahorro viajes   → 18
```

Coinciden una a una con `BORRADAS` de `id_no_uuid.test.ts:32-37`. Y las 7
carpetas que sobreviven (`arco`, `combustible-casetas`, `configuracion`,
`politicas`, `soporte`, `suscripcion`, `usuarios`) son segmentos estáticos: Next
les da prioridad sobre `[id]`, no pasan por la guarda.

Los cuatro casos que el brief pide, contestados con la salida de Postgres:

| Entrada | Guarda | Postgres (`::uuid`, corrido hoy) | Resultado |
|---|---|---|---|
| `cuadre` | rechaza | `ERROR: invalid input syntax for type uuid: "cuadre"` | **404. Correcto** — antes era la pantalla de error |
| uuid válido de **otro tenant** | pasa | fila no visible: `analytics.ts:1157-1158` filtra `.eq('id',…).eq('tenant_id', tenantId)` | `data = null` → `page.tsx:94` `notFound()`. **Correcto y sin fuga** |
| `A0EEBC99-9C0B-…` (mayúsculas) | pasa (`/i`) | `a0eebc99-9c0b-…` — el tipo normaliza | **Correcto**, y el test lo fija (`:44`) |
| `00000000-0000-0000-0000-000000000000` | pasa | uuid válido | consulta legal, cero filas → `notFound()`. **Correcto** |
| ` a0ee…` / `%20a0ee…` (Next decodifica el segmento) | rechaza | `ERROR: invalid input syntax … " a0eebc99-…"` | **404. Correcto** |

Dos formas que **Postgres sí acepta y la guarda no**: la de llaves
(`'{a0eebc99-…}'::uuid` → válido) y la compacta de 32 hex
(`'a0eebc999c0b4ef8bb6d6bb9bd380a11'::uuid` → válido). La guarda las manda a
404. Es fallar cerrado hacia el lado bueno y **no es hallazgo**: nada en el repo
genera esas dos formas (todos los ids salen de `gen_random_uuid()` y se
renderizan canónicos), así que el 404 solo lo ve quien las teclea a mano.

### `src/app/dashboard/[id]/page.tsx:62` — ¿corre antes de la consulta, en todos los caminos?

Sí. `if (!esIdDeLiquidacion(id)) notFound();` está en `:62`; la única consulta
que recibe el segmento es `getLiquidacionDetalle(id, tenantId)` en `:93`. Entre
las dos no hay ninguna otra lectura con `id`. Recorrí los caminos que la
esquivan y ninguno toca una columna `uuid`:

- `:40-41` — `requireSessionTenant('/dashboard/' + idParaVolver)` corre **antes**
  de la guarda, pero `destino` solo alimenta `redirect('/login?next=' + encodeURIComponent(destino))`
  (`guard.ts:31`). Ruta relativa y codificada: no hay consulta ni redirect abierto.
- `:48` `rolEfectivo(...)` y `:54` `puedeVerArea(...)` — puro cómputo en memoria.
- `:71-72` — `resolverTenantPedido(..., sp.tenant)` corre **después** de la
  guarda del segmento, pero **sobre otra entrada sin guardar**. Ver N7.
- Los dos server actions (`reabrir` `:108`, `reasignar` `:130`) usan `id` desde
  el closure ya validado; Next no permite invocarlos con un `id` arbitrario.

### `src/app/dashboard/id_no_uuid.test.ts` — ¿se pone roja si revierto el arreglo?

**Sí para la reversión obvia, NO para la sutil.** Las dos las corrí y dejé el
árbol como estaba.

1. Borré la línea `page.tsx:62` entera → **1 de 21 roja**:
   `× la página llama la guarda ANTES de consultar la liquidación → la página no
   llama esIdDeLiquidacion: expected -1 to be greater than -1`. El caso de
   cableado (`:56-64`) hace su trabajo: no es un arnés que aparenta.
2. Invertí la condición a `if (esIdDeLiquidacion(id)) notFound();` → **21 de 21
   verdes**. Ver N6: la prueba fija que la guarda *se llama y dónde*, no *en qué
   sentido decide*.

`git checkout -- 'src/app/dashboard/[id]/page.tsx'` después de cada una;
`git status --short` → vacío.

### ¿Vive el mismo modo de falla en otra ruta?

Busqué **todos** los segmentos dinámicos del árbol
(`find src/app -type d -name '[*]'` → exactamente tres) y los abrí:

- `src/app/aviso/[tenant]/page.tsx:60` — **ya tenía la guarda desde antes**, con
  el mismo regex y el mismo argumento escrito arriba ("`maybeSingle` con un uuid
  inválido devuelve error de Postgres, no `null` — se leería como una caída").
  El repo ya sabía esto; `[id]` era el que no lo aplicaba.
- `src/app/api/export/pdf/[id]/route.ts:73-83` — recibe el segmento crudo y lo
  manda a `.eq('id', id)` sobre `liquidacion.id uuid`, **sin guarda**. Pero aquí
  **no es hallazgo**: `:85-88` comprueba `error` por valor, registra
  `export.pdf.lectura` con el id de la fila y devuelve un 500 con texto
  controlado. No hay pantalla de error ni excepción que suba; el código es
  discutible (un 400 sería más honesto que un 500) y la línea de log dice
  "22P02" en vez de "ruta mal formada", pero nadie ve una falla del sistema.

**Lo que sí sobrevive es el mismo 22P02 por otra puerta: el query string.** Es
N7, y es mi hallazgo grande de hoy en esa familia — aunque el grande del pase es
el CRÍTICO de Stripe, que no tiene que ver con el arreglo.

---

## Hallazgos

### [CRÍTICO] `aplicarFactura` no puede escribir NUNCA: `ON CONFLICT` contra un índice parcial es un error de Postgres, no un upsert

`src/lib/saas/suscripcion.ts:413-429` — `.upsert({...}, { onConflict: 'stripe_invoice_id' })`,
contra `supabase/migrations/0052_saas_plan_suscripcion.sql:105-106`:

```sql
create unique index if not exists factura_saas_stripe_unica
  on public.factura_saas (stripe_invoice_id) where stripe_invoice_id is not null;
```

Ese `where` lo hace **parcial**. PostgreSQL solo infiere un índice parcial como
árbitro de `ON CONFLICT` si la sentencia repite el predicado
(`ON CONFLICT (col) WHERE col is not null`), y PostgREST —que es quien traduce
`upsert`— no tiene forma de expresarlo: emite `ON CONFLICT (stripe_invoice_id)
DO UPDATE` pelado. Revisé las 82 migraciones: no hay ningún otro índice único
sobre esa columna (`0056` y `0057` solo agregan columnas).

**Verificado, no leído.** Levanté Postgres 16 y reproduje el esquema:

```
$ create table factura_saas (…, stripe_invoice_id text, …);
$ create unique index factura_saas_stripe_unica
    on factura_saas (stripe_invoice_id) where stripe_invoice_id is not null;
$ insert into factura_saas (…) values ('t1','in_1',100);                       INSERT 0 1
$ insert into factura_saas (…) values ('t1','in_1',200)
    on conflict (stripe_invoice_id) do update set monto = excluded.monto;
ERROR:  there is no unique or exclusion constraint matching the ON CONFLICT specification
```

Y sobre una tabla **vacía**, con la misma forma de índice, el primer insert
falla igual: la inferencia del árbitro ocurre al planear, no al chocar. O sea
que **no es un bug de duplicados: es que la escritura no funciona nunca.**

**Escenario, con valores.** Transportes Innovativos firma el plan Empresa.
Stripe cobra $4,900 MXN y manda `evt_1P…` tipo `invoice.paid` con
`in_1QabcXYZ`, `amount_paid: 490000`, `currency: mxn`.

1. `stripe/webhook/route.ts:62` — `marcarEvento('evt_1P…')` inserta el candado
   de idempotencia. OK.
2. `:162` — `aplicarFactura({ stripeInvoiceId: 'in_1QabcXYZ', monto: 4900, pagada: true, … })`.
3. `suscripcion.ts:413` manda el upsert. PostgREST devuelve `42P10`.
4. `:429` — `throw new Error('aplicarFactura: there is no unique or exclusion
   constraint matching the ON CONFLICT specification')`.
5. `route.ts:69-75` — log `stripe.webhook.fallo`, `desmarcar(evt.id)`, **500**.
6. Stripe reintenta con backoff hasta 3 días. Los ~14 reintentos hacen
   exactamente lo mismo. Al agotarse, el evento se descarta.

Resultado: la flota pagó $4,900 y `factura_saas` **no tiene la fila**.

**Consecuencia.** Para el contralor que ya es cliente: entra a
`/dashboard/suscripcion` a bajar su comprobante y `getFacturasSaas`
(`suscripcion.ts:141-164`) devuelve una lista vacía — pagó y el panel dice que
no hay nada que pagar ni nada pagado. Sin fila en `factura_saas` tampoco hay
nada que timbrar (`timbrarFactura` parte de esa fila), así que **pagó y no puede
deducir**: es un problema fiscal de su lado, causado por nosotros. Para Likida:
el ingreso no queda registrado en la base, solo en Stripe, y el webhook se ve
"caído" con 500 permanentes sin que la causa sea la base ni la red.

**Prueba que lo cubra: NO existe, y esa es la razón de que sobreviviera.**
`stripe/webhook/route.test.ts:16` — `const aplicarFactura = vi.fn(async () => {})`,
y `:20-24` mockea `@/lib/saas/suscripcion` entera: las 8 pruebas de ese archivo
ejercitan la puerta (firma, 503, repetido, 500+desmarcado) y **jamás la
escritura**. `suscripcion_eventos.test.ts` tiene 9 casos
(`grep -n "it(" ` → `:51 :58 :64 :71 :81 :88 :103 :108 :114`) y **ninguno**
nombra `aplicarFactura`; su doble de supabase (`:16-35`) ni siquiera implementa
`upsert`, así que llamarla ahí reventaría con un `TypeError`, no con el `42P10`
real. `grep -rn "aplicarFactura" src/` → 2 usos de producción y 4 líneas de mock.

**Causa raíz probable:** el índice se escribió parcial (correcto: hay facturas
sin `stripe_invoice_id`, las de transferencia de la 0057) y el llamador asumió
que `onConflict` lo infiere igual que uno total. Es una incompatibilidad
esquema↔llamador que solo se ve ejecutando SQL, y en este repo nada ejecuta SQL.

---

### [ALTO] El aviso de asignación sale por WhatsApp, la marca que arranca el reloj falla, y solo se advierte: ese viaje ya no escala ni se puede aceptar

`src/lib/likida/operacion.ts:670-676` — después de `if (!r.enviado) … return`
(`:657-666`), el camino feliz escribe la marca y **traga el error**:

```ts
const { error } = await admin.from('viaje')
  .update({ avisado_en: new Date().toISOString(), avisos_enviados: 1 })
  .eq('id', viajeId).eq('tenant_id', tenantId).is('avisado_en', null);
if (error) logger.warn('viaje.avisado_en_no_se_marcó', { viajeId, err: error.message });
```

**Escenario, con valores.** Viaje `VJ-2026-0117`, chofer Ramírez, teléfono
`+52155…`. El despachador aprieta "Asignar". `notificarAsignacion` **entrega** el
mensaje (`r.enviado === true`): el chofer ya tiene en su teléfono "Se te asignó
VJ-2026-0117, Querétaro → Nuevo Laredo, anticipo $8,000". En ese medio segundo
el pooler devuelve `57014 statement timeout` en el `update`. La función **regresa
sin lanzar** y el despachador ve la asignación hecha.

Consecuencias encadenadas, todas silenciosas:

- `escalar_viaje.ts:88-91` filtra `.not('avisado_en','is',null)`: el viaje
  **nunca entra a la escalación de 5 h**. Nadie le avisa al jefe de tráfico que
  Ramírez no contestó.
- `confirmar_viaje.ts:29-38` (`viajesPorConfirmar`) filtra igual: cuando Ramírez
  contesta "va", la lista sale **vacía** y el bot le dice que no tiene viajes
  asignados. Es literalmente el síntoma que el comentario de `:41-44` dice que
  el fail-closed existe para impedir — solo que aquí la base **no** falló al
  leer, falló al escribir, y ese camino no tiene guardarraíl.
- `avisos_enviados` se queda en 0, así que un reaviso posterior tampoco cuadra.

**Consecuencia.** Para la flota: un viaje asignado y avisado que el sistema trata
como no avisado. El chofer sale a carretera creyendo que aceptó, la oficina no
recibe la escalación, y el primer momento en que alguien lo nota es cuando
llegan comprobantes de un viaje que "nadie aceptó". Para el equipo: la única
huella es un `warn` con `viajeId` — no un `error`, no pagina, y no dice que el
viaje quedó fuera de los dos ciclos.

**Prueba que lo cubra: no existe.**
`grep -rn "avisado_en_no_se_marcó" src --include=*.test.ts` → cero. Ni un caso de
`operacion` cubre "el envío salió y la marca falló"; los que hay cubren el
inverso (`!r.enviado`), que sí está bien resuelto en `:659-665` y hasta explica
por qué es `error` y no `warn`. El mismo archivo tiene el argumento correcto
tres líneas arriba de la línea que lo contradice.

**Causa raíz probable:** el envío y su marca son dos escrituras en sistemas
distintos sin compensación; la segunda se degradó a `warn` porque "el mensaje ya
salió", sin ver que la marca —no el mensaje— es lo que hace visible el viaje.

---

### [ALTO] Dos eventos de Stripe fuera de orden dejan activo un plan cancelado: `aplicarSuscripcion` escribe siempre el último que llegue

`src/lib/saas/suscripcion.ts:322-383` — la función no compara **nada** contra lo
que ya está en la fila: `:344-355` arma `campos` con el estado del evento y
`:365-366` hace `update ... .eq('id', existente.id)` sin condición de versión,
de fecha ni de `periodo_fin`. No hay `created`/`event_timestamp` en juego:
`marcarEvento` (`:282-293`) guarda el `payload` pero nadie lo lee para ordenar.

**Escenario, con valores.** Suscripción `sub_1QaaBB`, flota Transportes
Innovativos, plan `empresa`.

- **09:00:01** — la tarjeta rebota. Stripe emite `evt_A`
  (`customer.subscription.updated`, `status: past_due`). Entrega falla porque en
  ese instante hay un `503` de la base en `aplicarSuscripcion.buscar` → el
  webhook responde 500, `desmarcar(evt_A)`, Stripe lo agenda para reintento.
- **09:04:00** — el cliente actualiza la tarjeta, Stripe cobra y emite `evt_B`
  (`customer.subscription.updated`, `status: active`). Entrega **bien**:
  `suscripcion.estado = 'activa'`, `tenant.plan = 'empresa'`.
- **09:05:00** — llega el **reintento de `evt_A`**. Su id es distinto del de
  `evt_B`, así que `marcarEvento` lo acepta como nuevo (correcto: es un evento
  distinto). `aplicarSuscripcion` escribe `estado: 'morosa'`.

Fin: la flota **pagó a las 09:04 y a las 09:05 quedó marcada como morosa**. El
mismo mecanismo funciona en el sentido caro: un `customer.subscription.deleted`
seguido del reintento de un `updated` con `status: active` deja `estado: 'activa'`
y `cancelada_en: null` en una suscripción que el cliente **canceló** — Likida le
sigue dando servicio de un plan que Stripe ya no cobra.

Stripe documenta que **no garantiza el orden de entrega** y que por eso el
receptor debe reconciliar contra el objeto, no confiar en la secuencia. Aquí no
se reconcilia: se escribe.

**Consecuencia.** Para el contralor: `/dashboard/suscripcion` le dice "morosa" a
quien acaba de pagar, y los avisos de cobranza salen contra un cliente al
corriente. Para Likida: una flota cancelada que sigue viéndose activa es
servicio regalado que nadie va a detectar hasta la conciliación manual del mes.

**Prueba que lo cubra: no existe.** `suscripcion_eventos.test.ts:88` ("aplica una
suscripción con el estado mapeado de Stripe") aplica **un** evento sobre un
estado vacío. No hay ni un caso con dos eventos, ni uno que nombre orden,
reintento o `created`. `grep -rn "orden\|fuera de orden\|out.of.order" src/lib/saas/*.test.ts`
→ cero.

**Causa raíz probable:** la idempotencia se resolvió por `evento_stripe` (que
protege contra la **repetición** del mismo evento) y se dio por resuelto también
el **ordenamiento**, que es otro problema y necesita otra llave (la marca de
tiempo del objeto, o releer la suscripción de la API de Stripe).

---

### [ALTO · REINCIDENTE] El mutex del viaje se suelta por `viaje_id` sin dueño: el turno que entró por el fail-open borra el lease del que sí lo tenía

`src/lib/likida/conv.ts:618-620` (`releaseViajeLock` → `rpc('unlock_viaje', { p_viaje: viajeId })`),
`supabase/migrations/0005_concurrencia.sql:45-50` (`delete from viaje_lock where viaje_id = p_viaje`, sin token),
`src/lib/likida/conv.ts:461` (el fail-open: `logger.error('viaje.lock_error_persistente')` y `return true`),
`src/lib/likida/processor.ts:1751-1752` y `:2267`.

Sin cambios desde el pase 4: el escenario completo (turno B entra por el
fail-open, sale, borra el lease de A, turno C arranca y los dos cierran la misma
liquidación con $5,600 y $7,000) está en el archivo del pase 4 y sigue palabra
por palabra vigente. El arreglo `3404616` cerró la puerta del **vencimiento**
(`TTL_LOCK_VIAJE_MS` = `PRESUPUESTO_WEBHOOK_MS`, `conv.ts:424`) y **no** la del
fail-open.

**Prueba que lo cubra: sigue sin existir.**
`grep -rn "releaseViajeLock" src --include=*.test.ts` → **cero coincidencias**,
igual que el pase 4. `conv_lock.test.ts` (verde hoy, incluido el caso
"transitorio que no cede: acaba abriendo, pero después de intentarlo") cubre la
adquisición y se detiene ahí. `startup_mutex_ajeno.test.ts:53` cubre el unlock
ajeno **solo** para el probe de arranque.

**Causa raíz probable:** `viaje_lock` no guarda quién tomó el lease, y
`acquireViajeLock` devuelve el mismo `true` para "lo tengo" y para "me rendí".

---

### [ALTO · REINCIDENTE] Un evento de Stripe que no se puede atribuir queda marcado como aplicado y contesta 200

`src/app/api/stripe/webhook/route.ts:62` (marca antes de aplicar), y las cuatro
salidas mudas de `aplicar()`: `:101` (`stripe.checkout.sin_atribucion`), `:121`
(`stripe.suscripcion.sin_tenant`), `:129` (`stripe.suscripcion.price_desconocido`),
`:153` (`stripe.factura.sin_tenant`). Las cuatro hacen `return` sin lanzar, así
que `:66` contesta `{ ok: true }`: Stripe lo da por entregado y **no reintenta**,
y `evento_stripe` conserva la marca, así que un reenvío manual desde el panel de
Stripe se descarta como repetido en `:63`.

Escenario intacto desde el pase 3: un `customer.subscription.created` que llega
**antes** de que exista la fila con `stripe_customer_id` (`tenantDeCustomer`
devuelve null porque `aplicarSuscripcion` todavía no corrió) se pierde para
siempre; el plan queda sin activar y el único rastro es una línea de log.

**Prueba que lo cubra: no existe.** Las 8 pruebas de
`stripe/webhook/route.test.ts` mockean `tenantDeCustomer` con
`async () => 't-1'`: la rama del `null` **no se ejercita en ninguna**.

---

### [MEDIO] La prueba de `58c44f9` no distingue la guarda de su negación: invertirla deja las 21 verdes y 404ea todas las liquidaciones

`src/app/dashboard/id_no_uuid.test.ts:56-64` — el caso de cableado localiza dos
subcadenas con `indexOf` y compara posiciones:

```ts
const guarda = src.indexOf('esIdDeLiquidacion(id)');
const consulta = src.indexOf('getLiquidacionDetalle(id');
expect(guarda).toBeLessThan(consulta);
expect(src.slice(guarda, consulta)).toContain('notFound()');
```

`'esIdDeLiquidacion(id)'` empata igual con `if (!esIdDeLiquidacion(id))` que con
`if (esIdDeLiquidacion(id))`: el `!` queda **antes** del inicio del match.

**Escenario, con valores.** Alguien —una refactorización, un agente, un
`revert` a medias— deja `page.tsx:62` como
`if (esIdDeLiquidacion(id)) notFound();`. Lo corrí:

```
$ npx vitest run src/app/dashboard/id_no_uuid.test.ts
✓ src/app/dashboard/id_no_uuid.test.ts (21 tests) 6ms
Test Files  1 passed (1)   Tests  21 passed (21)
```

Verde entero. Con eso en producción, `/dashboard/3f8a1c2e-0b4d-4e7a-9c11-2d5e6f7a8b90`
—una liquidación **real**— contesta 404, y `/dashboard/cuadre` también: la
pantalla de detalle deja de existir para todo el mundo.

**Consecuencia.** El detalle de liquidación es la pantalla del demo: es donde el
contralor ve comprobado contra anticipo y la deducibilidad. Un 404 ahí es el
producto apagado, y la suite —la que este PR usa como compuerta— seguiría verde.
Ese es el "arnés que aparenta" que esta serie lleva tres pases señalando, en el
arreglo que se hizo justamente para no aparentar.

**Causa raíz probable:** el caso prueba *dónde está* la llamada (que era el bug
original: nadie la llamaba) y no *qué decide*; y no hay ninguna prueba que
renderice la página con un uuid bueno y otro malo, que es lo que distinguiría
las dos polaridades sin leer el código fuente como texto.

---

### [MEDIO] El mismo `22P02` que se cerró en el segmento sigue abierto en `?tenant=`, y las tres puertas que lo reciben contestan tres cosas distintas

Un uuid mal formado en el **query string** llega crudo a `tenant.id uuid` por
tres caminos, ninguno con guarda de forma:

- `src/app/dashboard/[id]/page.tsx:71-72` → `resolverTenantPedido(...)` →
  `tenant-api.ts:92-98`: `error` ⇒ **`throw`** ⇒ error boundary. Es exactamente
  el síntoma que `58c44f9` quitó del segmento, a doce líneas de distancia de la
  guarda nueva. Mismo patrón en `politicas/page.tsx:84`, `arco/page.tsx:42`,
  `suscripcion/page.tsx:44`, `combustible-casetas/page.tsx:60`.
- `src/lib/auth/tenant-api.ts:63-67` (`resolverTenantApi`, la usan
  `export/pdf/[id]/route.ts:39` y `export/liquidaciones/route.ts:23`) → **503**
  "No se pudo verificar la flota pedida" + `logger.error('tenant.api_pedido')`.
- `src/lib/auth/tenant-efectivo.ts:120-125` (la que usan **todas** las páginas
  de `/dashboard`) → `const { data: t } = …` **sin `error`** ⇒ se traga el
  22P02 y cae al tenant de sesión en silencio.

**Escenario, con valores.** Javier (superadmin) enseña la flota del cliente y
comparte la URL por WhatsApp; el cliente la abre con la cola cortada:
`/dashboard/3f8a1c2e-0b4d-4e7a-9c11-2d5e6f7a8b90?tenant=7f3e12`. Verificado en
Postgres: `select … where id = '7f3e12'` ⇒
`ERROR: invalid input syntax for type uuid`. La página de detalle lanza y pinta
"No se pudo cargar el panel". La misma URL sin el uuid final
(`/dashboard?tenant=7f3e12`) **no** falla: `tenant-efectivo.ts:121` se lo come y
enseña el tenant demo. Y `/api/export/pdf/<uuid>?tenant=7f3e12` contesta 503.

**Consecuencia.** Tres respuestas para una sola causa, y la peor de las tres es
la que ve el contralor. Además el log queda envenenado: `tenant.api_pedido` con
"invalid input syntax" es indistinguible de la caída de Supabase que ese
`logger.error` existe para señalar (`tenant-api.ts:58-62` lo dice con todas sus
letras), así que la alarma que debería significar "la base no contesta" la puede
disparar una URL mal pegada.

**Prueba que lo cubra: parcial y del lado equivocado.**
`find src/app/api -name '*.test.ts'` → 6 archivos, ninguno de `dashboard/asistente`;
y `grep -rn "22P02\|invalid input syntax" src --include=*.test.ts` → **cero**.
Nada prueba qué pasa con un `?tenant=` que no es uuid en ninguna de las tres
puertas.

**Causa raíz probable:** `58c44f9` trató el problema como "el segmento de ruta
tiene que tener forma de id" cuando el invariante es "**cualquier** entrada de
usuario que vaya a una columna `uuid` tiene que tener forma de uuid antes de la
consulta". La guarda quedó pegada a `[id]` en vez de al borde del contrato.

---

### [MEDIO] `aplicarSuscripcion` son cuatro escrituras sin transacción: entre la tercera y la cuarta la flota se queda sin ningún plan vivo

`src/lib/saas/suscripcion.ts:333-376` — `select` (`:333`), `select previa`
(`:357`), `update previa → cancelada` (`:366-370`), `insert` (`:374`). Cuatro
viajes a PostgREST, sin `rpc` ni función plpgsql, cuando este mismo repo ya usa
el patrón correcto para el dinero del cliente (`guardar_liquidacion_tx`, 0013,
citado en `repo.ts:594-620`).

**Escenario, con valores.** Flota con la suscripción de cortesía
`estado: 'prueba'`, `stripe_subscription_id: null`. Llega
`customer.subscription.created` de `sub_1QaaBB`. `:366` cancela la de cortesía —
commit. `:374` inserta la nueva y devuelve `57014 statement timeout` (o el
`23505` de `suscripcion_una_viva` si otra entrega concurrente ganó la carrera).
Se lanza, el webhook contesta 500 y `desmarcar` deja el evento reintentable.

Entre ese instante y el reintento de Stripe (backoff: minutos a una hora) la
flota tiene **cero** suscripciones vivas: `getSuscripcion` (`:114-123`, filtra
`.in('estado', ['prueba','activa','morosa','pausada'])`) devuelve `null` y
`/dashboard/suscripcion` le dice a un cliente que acaba de pagar que no tiene
plan.

**Consecuencia.** Ventana de "no tienes plan" para un cliente que sí pagó,
justo en el minuto siguiente a pagar — el peor momento posible. Se cierra sola
con el reintento, así que no deja rastro ni ticket: el cliente ve la pantalla
mala y cuando escribe, ya está bien.

**Prueba que lo cubra: no existe.** El doble de supabase de
`suscripcion_eventos.test.ts:16-35` devuelve `{ error: insertError }` para
`insert` y **nunca** falla el `update`, así que la secuencia "cancelar previa OK
+ insert falla" no es representable en ese arnés.

---

### [MEDIO] `tenant.plan` se desincroniza por un `warn` tragado, en la línea que sigue al comentario que dice por qué no puede desincronizarse

`src/lib/saas/suscripcion.ts:378-382`:

```ts
// … Desincronizarlos haría que una flota morosa siguiera viéndose como del plan
// que ya no paga.
const t = await admin.from('tenant').update({ plan: datos.planClave }).eq('id', datos.tenantId);
if (t.error) logger.warn('stripe.tenant_plan', { err: t.error.message });
```

**Escenario, con valores.** La flota baja de `empresa` a `flota`. Stripe manda
`customer.subscription.updated`. `suscripcion.plan_clave` pasa a `'flota'`. El
`update` de `tenant` choca con un timeout: `tenant.plan` se queda en
`'empresa'`. La función **regresa bien**, `route.ts:66` contesta `{ ok: true }`,
Stripe marca el evento entregado y **nunca lo reintenta**. La divergencia es
permanente: ningún otro evento la corrige, porque el siguiente evento de esa
suscripción escribirá el plan que toque en ese momento… si ese `update` no falla
también.

**Consecuencia.** Las pantallas que leen `tenant.plan` sin consultar
`suscripcion` (que el propio comentario dice que son "varias") le siguen dando
al cliente los límites y las etiquetas del plan caro que ya no paga. Es la única
de las cuatro escrituras de la función cuyo error no se propaga; las otras tres
(`:334`, `:363`, `:371`, `:375`) lanzan, y esa asimetría no está argumentada.

**Causa raíz probable:** se degradó a `warn` porque "es una copia", sin ver que
la copia es la que leen las pantallas y que el 200 al webhook cancela el único
mecanismo de reintento que existe.

---

### [MEDIO] `/admin/compliance` contesta "La solicitud no existe" cuando lo que pasó es que no pudo preguntar

`src/app/admin/compliance/page.tsx:37-38` —
`const { data: sol } = await supabaseAdmin().from('solicitud_arco').select('tenant_id').eq('id', solicitudId).maybeSingle();`
y `if (!sol?.tenant_id) return { error: 'La solicitud no existe.' };`. Sin
`error`, igual que el reincidente de `dashboard/asistente/route.ts:57`.

**Escenario, con valores.** Javier resuelve la solicitud ARCO
`arco_9f2c…` de un operador el día 19 de los 20 hábiles que da la LFPDPPP art.
32. Bache de red: `data = null`, `error = { message: 'fetch failed' }`. La
pantalla contesta **"La solicitud no existe."** Javier concluye que ya se
resolvió o que la borraron, y cierra.

**Consecuencia.** Una obligación legal con reloj se cae por un mensaje que
afirma un hecho falso. El propio archivo declara existir porque "la flota
obligada a contestar en 20 días hábiles estaba ciega" (`:24-25`).

Colateral en la misma acción: `:40` llama `resolverSolicitudArco` y **descarta
el `{ enviada, error }` que devuelve**; el `ok` de `:45` dice "se intentó
enviar" pase lo que pase. La gemela de `/dashboard/arco:51-53` sí distingue los
dos casos. Dos pantallas, el mismo dato, dos verdades.

---

### [BAJO] `resolverSolicitudArco` usa el uuid del operador como número de teléfono cuando falta `titular_ref`

`src/lib/likida/repo.ts:994` —
`const telefono = (sol.titular_ref as string | null) ?? (sol.operador_id as string | null) ?? null;`
`operador_id` es `uuid references public.operador(id)` (`0053:101`), no un
teléfono. Con `titular_ref` nulo (la columna es `text` nullable, y su comentario
en `0053:102-104` explica que se guarda aparte **precisamente** para sobrevivir
a la supresión de la fila de `operador`), se llamaría
`enviarRespuestaArco('8f21c4de-…', …)`. Hoy el único insert
(`registrarSolicitudArco`, `:888`, desde `processor.ts:161`) siempre pone el
teléfono, así que la rama no se alcanza; queda como trampa para el siguiente
canal que inserte una solicitud sin `titular_ref`.

---

### [BAJO] La razón social del mensaje ARCO cae a "la flota" por un error de lectura tragado

`src/lib/likida/repo.ts:999` — `const { data: tenant } = await acotada(…)` sin
`error`; `:1000` cae a `'la flota'`. El titular recibe "Tu solicitud fue
atendida por **la flota**" en vez del nombre del responsable, que es justamente
el dato que la respuesta ARCO tiene que llevar (fue un MEDIO de la auditoría 16,
arreglado poniendo el nombre real y dejando abierta la puerta por la que se
vuelve a perder).

---

## Hallazgos de pases anteriores: qué pasó con cada uno

| Título | Estado | archivo:línea de HOY |
|---|---|---|
| **[ALTO p4]** `/dashboard/[id]` contesta las 18 rutas borradas con la pantalla de error | **CERRADO POR ARREGLO** (`58c44f9`), verificado arriba por quien no lo escribió | `[id]/id.ts:25-28`, `[id]/page.tsx:62`, `id_no_uuid.test.ts` (21 verdes). Deuda: N6 |
| **[CRÍTICO p3]** Lease del mutex más corto que el turno | **CERRADO POR ARREGLO** (`3404616`) — confirmado otra vez hoy | `conv.ts:424` → `TTL_LOCK_VIAJE_MS`; `conv_lock_expira.test.ts` verde |
| **[CRÍTICO p3]** …y `unlock_viaje` borra el candado de quien sea | **REINCIDENTE** | `conv.ts:618-620`, `0005_concurrencia.sql:45-50`. Es el ALTO N4 |
| **[ALTO p3]** Comprobación recortada a 1,000 filas | **CERRADO POR ARREGLO** (`ea23059`) | `recordatorio_comprobacion.ts:108-116` |
| **[ALTO p3]** `/api/cron/escalar` contesta 200 aunque revienten los dos chequeos | **REINCIDENTE** | `escalar/route.ts:72` y `:82` (los `catch` escriben en `resultado`), `:89` `return NextResponse.json(resultado)` sin `status` |
| **[ALTO p3]** Evento de Stripe no atribuible marcado como aplicado | **REINCIDENTE** | `stripe/webhook/route.ts:62`, `:101`, `:121`, `:129`, `:153`. Es el ALTO N5 |
| **[ALTO p1]** El cron de facturación declara `corrio: true` cuando solo encoló | **REINCIDENTE** | `facturar/route.ts:308` (el `if`), `:324-330` (el `return` con `corrio: true` en `:325`); `cola/route.ts:26-28` sigue devolviendo 503 sin que el cron se entere. `grep -n UPSTASH_QSTASH_TOKEN src/app/api/cron/facturar/route.test.ts` → vacío |
| **[ALTO p1]** `updateGastoCfdiXml` descarta el error de su lectura | **REINCIDENTE** | `repo.ts:415` — sigue `const { data: actual } = await acotada(...)`. Contrasta con `repo.ts:979-982`, misma casa, sí comprueba `errLee` |
| **[ALTO p2]** El recordatorio sale por `sendText` y el claim ya se quemó | **REINCIDENTE** | `recordatorio_comprobacion.ts:180` contra `:162` |
| **[ALTO p2]** La misma corrida manda dos WhatsApps contradictorios | **REINCIDENTE** | `escalar/route.ts:65-83` |
| **[ALTO p2]** La 0087 sin compuerta de arranque alcanza todo el histórico | **REINCIDENTE** | `recordatorio_comprobacion.ts:55-62` |
| **[MEDIO p1]** La cola de QStash se presupuesta con los 300 s del cron | **REINCIDENTE** | `facturar/route.ts:25` y `:129` contra `cola/route.ts:11` (600) |
| **[MEDIO p1]** Handlers que resuelven `?tenant=` sin mirar `error` | **REINCIDENTE Y MÁS GRANDE DE LO REPORTADO** | `dashboard/asistente/route.ts:57` **y** `tenant-efectivo.ts:121`, que el pase 4 no había nombrado y es la que usan TODAS las páginas de `/dashboard`. Ver N7 |
| **[MEDIO p1]** `tenant.config` lee-modifica-escribe desde dos módulos | **REINCIDENTE** | `administracion.ts:286-292` y `repo.ts:926-935` |
| **[MEDIO p2]** Dos lotes de envíos comparten 120 s sin medirlos | **REINCIDENTE** | `escalar/route.ts:11` y `:65-83` |
| **[BAJO p3]** `revisados` cuenta la lista ya filtrada | **REINCIDENTE** | `recordatorio_comprobacion.ts:156`, `:188` |
| **[BAJO p1]** La URL destino del job firmado sale de la cabecera `Host` | **REINCIDENTE** | `facturar/route.ts:316` |
| **[BAJO p1]** `receiver.verify` sin `url` | **REINCIDENTE** | `cola/route.ts:36-39` |
| **[BAJO p1]** `/api/demo` parsea el cuerpo sin red | **REINCIDENTE** | `demo/route.ts:32` |
| **[BAJO p2]** Un viaje sin teléfono quema su recordatorio | **REINCIDENTE** | `recordatorio_comprobacion.ts:162` antes de `:172` |
| **[BAJO p2]** `viajesSinComprobar` sin `order` ni filtro de `activo` | **REINCIDENTE** | `recordatorio_comprobacion.ts:55-62` |

**Cerrados por arreglo en total: 3** (los dos del pase 3 y el ALTO del pase 4).
**Cero** de los reincidentes ganó una prueba de ruta este pase.

---

## Lo que revisé y está bien

- **`58c44f9` está en la capa correcta y su argumento se sostiene.** Poner la
  guarda en `getLiquidacionDetalle` habría hecho inalcanzable el caso "la base
  se cayó y esto DEBE lanzar" de `analytics.test.ts`; ponerla en la página deja
  `exigir()` intacto. Comprobé que `exigir` (`pg.ts:33-36`) sigue lanzando sin
  excepciones nuevas para `22P02`: `grep -rn "22P02" src/` → **cero**. El
  arreglo no aflojó el fail-closed, que era el riesgo real de este parche.
- **`aviso/[tenant]/page.tsx:60` ya tenía la misma guarda**, con el mismo
  argumento escrito. El repo tenía la respuesta; el hueco era de aplicación, no
  de conocimiento.
- **`export/pdf/[id]/route.ts:78-88`** comprueba `error` por valor, registra con
  `tenant` y `liquidacion` (el identificador de la fila, que es lo que el ancla
  de 8 pide) y devuelve un 500 con texto controlado. Un id malformado ahí no
  produce pantalla roja.
- **`marcarEvento` sigue siendo el candado correcto** (`suscripcion.ts:282-293`):
  insert como carrera ganada, `23505` distinguido por **código**, cualquier otro
  error **lanza**. Tiene tres pruebas con nombre (`suscripcion_eventos.test.ts:51,58,64`),
  incluida "LANZA ante cualquier otro error — un fallo de base no se lee como
  repetido". Es el único punto de idempotencia del repo con prueba propia además
  del claim del recordatorio.
- **`aplicarFactura` es idempotente por diseño** — el problema es que la
  sentencia con la que lo intenta no la acepta Postgres. La intención está bien;
  el `onConflict` está mal.
- **`/api/cron/purgar` sigue siendo el modelo** (`purgar/route.ts:56-61`,
  `:75-78`, `:82-86`): cero 200 con el fallo dentro.
- **El webhook de WhatsApp** (`webhook/whatsapp/route.ts:91-104`, `:49-59`,
  `:244-249`, `:168-195`) y **el callback de QStash** (`cola/route.ts:22-54`) sin
  cambios y sin hallazgo nuevo.
- **El claim del recordatorio** (`recordatorio_comprobacion.ts:198-215`) sigue
  siendo el único camino de concurrencia del repo que cumple el ancla de 8:
  UPDATE condicional sobre la columna que pisa, acotado por `id` **y**
  `tenant_id`, cero filas = perdí la carrera, error = fallo cerrado, y dos
  pruebas que lo nombran ("DOS CORRIDAS SOLAPADAS…", "el UPDATE va acotado por
  tenant, no solo por id").
- **`saveLiquidacion` sigue siendo una sola transacción** (`repo.ts:594-620` →
  `guardar_liquidacion_tx`, 0013). Contrasta a propósito con N8: el repo sabe
  hacerlo, solo que no lo hizo del lado de la suscripción.
- **Los otros tres `upsert` del repo apuntan a índices TOTALES**, no parciales, y
  por eso no comparten el CRÍTICO: `repo.ts:25` y `consolidado.ts:204-213`
  (`onConflict: 'tenant_id,cfdi_uuid'` contra `unique (tenant_id, cfdi_uuid)` de
  `0009:12`) y `consolidado.ts:289` (`'cfdi_xml_id,indice'` contra
  `unique (cfdi_xml_id, indice)` de `0076:66`). Revisados uno por uno.
- **`pg_errores.ts:40-45`** exige el código `23505` **además** del nombre del
  índice. Sin cambios.
- **`duplicados.ts` es puro** (sin I/O): no hay camino de concurrencia que
  auditar. Sin cambios.
- **`viajesPorConfirmar` (`confirmar_viaje.ts:44`) y `getUso`
  (`suscripcion.ts:194-195`) fallan cerrado y lo dicen**, con el nombre de la
  consulta en el mensaje.

---

## Lo que NO alcancé a revisar

- **El CRÍTICO está verificado contra Postgres 16 puro, no contra PostgREST.**
  Reproduje el esquema real (índice único parcial idéntico al de la 0052) y
  ejecuté la sentencia; el `42P10` es de Postgres. Lo que no pude ejecutar es la
  capa de PostgREST que traduce `upsert`+`onConflict` a esa sentencia: mi
  afirmación de que emite `ON CONFLICT (col) DO UPDATE` **sin** el predicado del
  índice sale de leer el contrato de PostgREST (el parámetro `on_conflict` solo
  acepta columnas), no de una corrida contra un PostgREST vivo. Si alguien tiene
  una base de staging, la prueba de un minuto es un `invoice.paid` de juguete:
  o entra la fila, o sale `42P10`.
- **Nada más se ejercitó contra un Supabase, un Meta o un Stripe reales.** N2,
  N3, N4, N7, N8 y N9 están verificados por lectura y por la **ausencia
  comprobada** de pruebas que los cubran, con nombre de archivo y de caso.
- **El orden real con el que Stripe entrega dos eventos de la misma
  suscripción.** N3 se apoya en que Stripe no garantiza orden y en que el código
  no reconcilia; no medí con qué frecuencia se invierte de verdad.
- **`processor.ts` completo** (136 KB). Leí el bloque del mutex (`:1700-1800`),
  el `finally` (`:2245-2270`) y `atenderPrivacidad` (`:146-172`).
- **Las funciones plpgsql `intake_delta` y `mantenimiento_de_datos`**: caja
  negra. Sí abrí `try_lock_viaje`/`unlock_viaje` (0005) y `guardar_liquidacion_tx`
  (0013).
- **`timbrarFactura`**: lo cité como consecuencia del CRÍTICO (sin fila en
  `factura_saas` no hay qué timbrar) pero no audité `facturapi.ts`.
- **Rendimiento del arreglo**: la guarda añade un regex por request. No lo medí
  ni lo considero mío.
