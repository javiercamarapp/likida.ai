# Modelo de datos y esquema — auditoría 3 (pase 3)

**Nota: 6/10** (antes 5). Razón del movimiento: se atacó y subió · mirada más
profunda. Sube porque las migraciones nuevas (0098, 0105–0111) son de las
mejores del repo —dominios cerrados, equivalencias «⇔» con dientes, RLS
deny-all deliberado, `revoke` en cada `security definer`, y la 0109 existe
porque la verificación 85 atrapó media firma que la 0107 dejaba pasar— y
porque el camino del importador de DAT-C1 sí se cerró (`17dd02b`). No sube más
porque aparecieron **dos casos donde la base es MÁS ESTRICTA que el código**
—el espejo exacto del «tipo más estricto que la columna», y más caro, porque
falla en producción y no en `tsc`— y porque la disciplina de FK compuesta que
la 0028 estableció NO se extendió a las tablas de dinero que estrenaron
escritor esta semana.

El riesgo mayor del rubro hoy: **hay dos pantallas del panel cuyo guardado la
base rechaza SIEMPRE** (la estrategia de agentes) o **rechaza en un caso que la
propia aplicación documenta como válido** (un tope de política en 0). Ninguna
prueba lo puede ver: el escritor toca Supabase y las suites lo mockean.

## Hallazgos

### [CRÍTICO] `tenant.config.agentes` no existe para la base: la estrategia de los agentes NUNCA se puede guardar

`supabase/migrations/0085_fix_config_tenant_valida_tipo.sql:25-27` ×
`src/lib/likida/config.ts:64` × `src/lib/likida/agentes/estrategia.ts:79-85`

`config_tenant_valida` (última definición: 0085, y el CHECK
`tenant_config_valida` de `0026_tenant_config_esquema.sql:336` la invoca en
CADA update de `tenant`) trae una lista blanca de exactamente diez llaves:
`empresa, politica, tabulador, unidades, catalogoCuentas, salida,
hidrocarburos, estimulos, validacion, facilidadCombustibleEfectivo`. La llave
`agentes` **no está**, y `LikidaConfig` (config.ts:64) sí la tiene desde B4
(`28eec66`).

Escenario: el dueño de la flota abre `/dashboard/agentes/conductores`, teclea
`8` horas de escalación y guarda.
`guardarEstrategiaAgente` arma `fusionarConfig(actual, { agentes: {conductores:{horasEscalacion:8}} })`
(estrategia.ts:79) y hace `update tenant set config = …`. El CHECK evalúa
`config_tenant_valida` y **lanza**:
`tenant.config trae la llave "agentes", que CuadraConfig no conoce. Las válidas son: empresa, politica, …`
(0085:53-55). supabase-js lo entrega por valor → `errUpd` →
`throw new Error` (estrategia.ts:85) → la página lo traduce a un mensaje
genérico (`conductores/page.tsx:66`). Lo mismo con el umbral de confianza en
`/dashboard/agentes/liquidacion` (`liquidacion/page.tsx:91`).

Consecuencia: dos perillas anunciadas como editables ("estrategia editable
donde hay una perilla que un motor de verdad lee") **nunca guardan nada**.
El motor sigue corriendo con los defaults de `DEMO_CONFIG` (5 h, 0.85) y el
dueño ve un error opaco cada vez. En un demo, es un botón que falla en vivo.
Ninguna prueba lo detecta: `estrategia.test.ts:5-7` dice explícitamente "el
escritor toca Supabase y no se prueba contra un mock", y `verificaciones.sql`
no tiene un solo bloque que compare `llaves_ok` contra `LikidaConfig`.

Causa raíz probable: la lista blanca de la 0085 es una copia manual del tipo de
TypeScript y nada la ata a él; el commit que agregó `agentes` al tipo no tocó
la base.

### [ALTO] Un tope de política en `0` es válido para la aplicación y prohibido por la base — y tira TODA la política capturada

`supabase/migrations/0085_fix_config_tenant_valida_tipo.sql:116-117` ×
`src/lib/likida/administracion.ts:267-271` × `administracion.ts:385-388`

La base: `if jsonb_exists(e,'topeMonto') and (e ->> 'topeMonto')::numeric <= 0 then raise exception … 'tiene que ser mayor que cero'`.
La aplicación, en el mismo repo y con comentario propio:
`if (!Number.isFinite(p.topeMonto) || p.topeMonto < 0) throw …` y acto seguido
*"Un tope de 0 es una decisión válida (no se permite el concepto), pero se
distingue de «sin tope», que es `undefined`"*. `armarPolitica` (administracion.ts:385)
acepta `0` con la misma regla `n < 0`.

Escenario: el dueño abre `/dashboard/politicas`, quiere prohibir el concepto
`alimentacion` y teclea `0` en su tope (que es exactamente lo que el comentario
del repo dice que significa), ajusta de paso `diesel` a `12000` y guarda.
`armarPolitica` pasa, `guardarPolitica` pasa, el `update tenant` **rebota** con
`tenant.config->politica: el topeMonto de "alimentacion" es 0 y tiene que ser
mayor que cero`. `mensajeParaPantalla` lo convierte en un error de pantalla y
**se pierde también el `12000` de diesel**: el formulario escribe la política
completa de una vez (`politicas/page.tsx:94-100`).

Consecuencia: la pantalla de política —el corazón configurable del motor de
cuadre— tiene un valor que el producto documenta como legítimo y que nunca se
puede guardar, y el intento se lleva por delante el resto de la captura.

Causa raíz probable: dos definiciones del mismo dominio (`>= 0` en TS, `> 0` en
plpgsql) escritas en momentos distintos, sin una prueba que las cruce.

### [ALTO] `pago_recibido` no tiene FK compuesta con `tenant_id`: un abono de la flota A liquida la factura de la flota B

`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:96` ×
`0049:143-145` (la policy) × `0028_fks_con_tenant.sql:93-96` (el patrón que no
se extendió) × `src/lib/likida/comercial.ts:199` (el lector)

`pago_recibido.factura_id uuid not null references public.factura_emitida(id) on delete cascade`
— apunta a `(id)`, no a `(id, tenant_id)`. La policy `tenant_finanzas` sólo
comprueba `tenant_id = any(get_user_tenant_ids()) and ve_finanzas()` sobre la
fila que se inserta, y la verificación de una FK ignora la RLS. Es
literalmente el escenario que la 0028 describe y cierra para `gasto` y
`liquidacion` — sobre una tabla que **estrenó escritor esta semana**.

Escenario, con valores: un `flota_admin` de la flota A (tiene su propio JWT: el
login es Supabase Auth y la anon key es pública por diseño) hace
`POST /rest/v1/pago_recibido` con
`{"tenant_id":"<A>","factura_id":"<uuid de una factura de B>","monto":240000,"fecha":"2026-08-15"}`.
El `WITH CHECK` pasa (el tenant que escribe es el suyo), la FK pasa (la factura
existe), `pago_monto_positivo` pasa. Queda una fila con
`pago_recibido.tenant_id = A` colgada de una factura de B.

Consecuencia para B: `getCobranza(B)` lee la vista `factura_saldo`
(comercial.ts:199) con `supabaseAdmin()` —service role, **RLS por encima**— y
la vista suma `pago_recibido` por `p.factura_id = f.id` **sin condición de
tenant** (0049:128). La factura de B aparece con `pagado = 240,000`,
`saldo = 0` y `vencida = false`. El contralor de B deja de cobrar un adeudo
real de $240,000 y nada en su pantalla dice que ese abono no es suyo.
(La `security_invoker` de la 0054 protege la lectura por PostgREST, no la del
panel, que va por service role.)

Causa raíz probable: la 0028 cerró las cuatro relaciones "del camino del
dinero" que existían en julio; `factura_emitida`, `pago_recibido` y
`factura_viaje` nacieron en la 0049 y nadie repitió el ejercicio.

### [ALTO] `pago_recibido` no tiene llave natural: el doble clic registra dos abonos y la cartera dice cobrado lo que no se cobró

`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:93-109` ×
`src/lib/likida/facturacion_escritura.ts:384-416`

`registrarPago` LEE la suma de pagos, decide con `evaluarAbono` y DESPUÉS
inserta. Entre la lectura y el insert no hay candado, y la tabla no tiene un
solo índice único: `pago_factura_idx` y `pago_tenant_fecha_idx` son ambos no
únicos, y no hay unique sobre `(factura_id, referencia)` ni sobre
`(factura_id, fecha, monto)`.

Escenario, con valores: factura de $116,000 emitida. El contador teclea un
abono de $58,000 y hace doble clic (o el navegador reintenta el server action
tras un timeout). Las dos invocaciones leen `pagado = 0`, las dos pasan
`evaluarAbono` (58,000 ≤ 116,000), las dos insertan. Quedan dos filas de
$58,000: `factura_saldo.pagado = 116,000`, `saldo = 0`, `vencida = false`.
La factura se cae de la cartera vencida con $58,000 reales sin cobrar. Con el
abono completo el resultado es peor: `pagado = 232,000`, `saldo = -116,000` —
un saldo negativo impreso en la pantalla que el contralor cruza contra su
estado de cuenta.

Consecuencia: el sobrepago que el propio módulo declara que rechaza a
propósito ("Un pago que rebasa el saldo también: los pagos parciales son la
norma, los sobrepagos son casi siempre un dedazo") no lo impide nada más que
un LEE-DECIDE-ESCRIBE sin candado.

Causa raíz probable: la regla anti-sobrepago vive sólo en la aplicación; la
base no tiene ni unicidad de abono ni forma de expresar "la suma no rebasa el
total".

### [ALTO] `viaje.operador_id` es NOT NULL y "Por asignar" promete lo contrario — la mitad viva de DAT-C1 · REINCIDENTE

`supabase/migrations/0001_init.sql:49` × `src/lib/likida/operacion.ts:126` ×
`src/lib/likida/operacion.ts:634` × `src/app/dashboard/despacho/vista.tsx:77`

Lo que SÍ murió con `17dd02b`: `importar_viajes.ts` ahora salta la fila sin
operador amarrable (`importar_viajes.ts:314-320, 418`), `/v1/viajes` exige
`operadorId` (`api/v1/viajes/route.ts:192-195`) y `/dashboard/despacho` lo
exige antes de llamar (`despacho/page.tsx:99-101`). Lo que sigue vivo:

1. `crearViaje` conserva `operador_id: v.operadorId || null` (operacion.ts:634)
   sobre un `NuevoViaje.operadorId?: string | null` (operacion.ts:507). El tipo
   dice "opcional, admite null"; la columna dice NOT NULL. La única protección
   son tres guards escritos a mano, uno por llamador — el cuarto llamador que
   se escriba (el propio módulo ya tiene `crear_viaje_wa.ts` y `despacho_wa.ts`
   apuntando aquí) se estrella con 23502.
2. `getViajesSinAsignar` (operacion.ts:122-138) consulta
   `.is('operador_id', null)`: **no puede devolver una sola fila jamás**, y su
   resultado se pinta en Despacho con la leyenda *"Nada sin repartir. **Los
   viajes que crees sin operador caen aquí.**"* (vista.tsx:77). Es una promesa
   que el esquema hace imposible, y un cero permanente presentado como
   medición.

Es exactamente el bug que el propio repo ya diagnosticó y arregló para el otro
contador del mismo tablero: `operacion.ts:432-441` documenta que `porAsignar`
"no podía ser distinto de 0 nunca" y por eso pasó a medir `sinUnidad`. La
consulta gemela se quedó.

Consecuencia: el jefe de tráfico abre Despacho, lee que los viajes sin operador
caen ahí, y nunca cae ninguno — no porque no los haya, sino porque no pueden
existir. Y la promesa del tipo (`operadorId?`) invita al siguiente escritor al
23502 que ya tumbó un lote entero.

Causa raíz probable: la decisión de negocio ("¿un viaje puede nacer sin
chofer?") está tomada en la base (no) y no en el código, que sigue modelándola
como sí.

### [MEDIO] `factura_proveedor` acepta importes negativos y sale así al ERP

`supabase/migrations/0091_factura_proveedor.sql:30-34` ×
`0108_factura_proveedor_flujo.sql:48-63` × `src/lib/likida/proveedores.ts:83-84,138`

`sub_total`, `iva` y `total numeric(12,2) not null` no tienen candado de signo
—ni de NaN—, y la 0108 agregó cinco constraints nuevas sin agregar éste, aun
teniendo enfrente a su hermana `factura_emitida`, que sí lo trae
(`factura_importes_positivos`, 0049:49-50). El filtro de entrada es
`cfdiIngresable` (proveedores.ts:83-84): `Boolean(xml.uuid) && typeof xml.total === 'number'`.
El parser hace `parseFloat` (`intake/cfdi_xml.ts:192-196`), así que
`Total="-5000.00"` entra como `-5000` sin objeción.

Escenario: alguien sube por el panel (o manda al buzón `f-<token>@mail.likida.ai`)
un XML con `Total="-18500.00"`. La fila entra a la bandeja con
`total = -18500.00`. Un humano la aprueba porque la pantalla enseña el
concepto y el emisor, no el signo. `marcarExportadas` (proveedores.ts:452-461)
la marca y el CSV del escalón 2 la lleva a SAP B1/CONTPAQi con un importe
negativo en la columna de la cuenta por pagar.

Consecuencia: una cifra negativa en el asiento contable del cliente, generada
por un archivo que nadie validó contra el SAT antes de aprobar. El contralor
lo descubre en la conciliación del mes.

Causa raíz probable: la 0091 se escribió antes de la 0070 (que puso los
candados de signo en `gasto.monto` y `viaje.anticipo`) y nadie volvió a pasar
por ella cuando la 0108 la amplió.

### [MEDIO] `desglose_peaje_linea.monto` acepta negativos y el parser los produce

`supabase/migrations/0106_desglose_peaje.sql:68` ×
`src/lib/likida/intake/desglose_peaje.ts:185-190`

`monto numeric(12,2) not null` sin candado de signo, y `montoDeCelda` valida
con `/^-?\d+(\.\d+)?$/` — el `-?` es explícito.

Escenario: el corte de IAVE trae, como traen todos, sus renglones de ajuste:
`15/07/2026 · Reverso caseta Tepotzotlán · -189.00`. Entra como una línea más
con `monto = -189.00`. El cruce (`desglose_peaje.ts:425-500`) la compara contra
`gasto.monto`, que desde la 0070 es `>= 0`: no hay ningún candidato a menos de
un centavo ni a menos de un peso, así que cae en `sin_contraparte`.

Consecuencia: el `pctCuadra` del desglose baja por líneas que NO son cruces sin
comprobante sino créditos del proveedor, y alguien de la oficina va a buscar el
ticket de una caseta que nunca se pagó. (Refutado el daño fiscal: la bitácora
RMF 9.1.8 sólo exporta líneas `cuadra`, `desglose_peaje.ts:993-996`, y una
negativa no puede cuadrar contra un `gasto >= 0`.)

Causa raíz probable: `esFilaDeTotal` cubre los pies de página, pero nadie
decidió qué significa un renglón de ajuste; el esquema no obliga a decidirlo.

### [MEDIO] Ocho de las veinte migraciones nuevas no se pueden volver a aplicar

`0089_agente_cobranza.sql:24,45` · `0090_hitos_viaje.sql:20` ·
`0091_factura_proveedor.sql:18` · `0092_viaje_folio_unico.sql:22-23` ·
`0099_carta_porte_transportista.sql` (los dos `add constraint`) ·
`0100_oposicion_decision_automatizada.sql` · `0107_talacha_autorizada.sql:38-67` ·
`0108_factura_proveedor_flujo.sql:38-83` · `0109_firma_sin_medias_tintas.sql:19-20`

`create table public.X` sin `if not exists` (0089, 0091), `add column` sin
`if not exists` (0090, 0107 ×6, 0108 ×4), `add constraint` sin su
`drop constraint if exists` (0092, 0099, 0107 ×2, 0108 ×5) y
`drop constraint` sin `if exists` (0108:80, 0109:20).

Escenario: alguien reconstruye el esquema aplicando `supabase/migrations/*` en
orden sobre una base que ya trae parte —el caso normal de un entorno de
pruebas, o de un `apply` que se cortó a la mitad—. Aborta en 0089 con
`42P07: relation "agente_cobranza_config" already exists`, y si se salta esa,
en 0092 con `42710`, y en 0107 con `42701: column "monto_estimado" already
exists`.

Consecuencia: el equipo que mantiene esto no puede reproducir el esquema desde
cero de forma repetible — y esa incapacidad ya cobró factura una vez, escrita
en el propio repo (`0065_cfdi_de_varias_casetas.sql:70-77`: "el repo no podía
reproducir el esquema desde cero"). El patrón idempotente EXISTE y está bien
hecho en 0025, 0028, 0082-0085, 0093-0098, 0103, 0105, 0106, 0110, 0111; se
omitió en las otras ocho.

Causa raíz probable: no hay compuerta que corra la carpeta dos veces.

### [BAJO] `incidencia.monto_estimado` es el único `numeric` sin precisión ni candado de signo del esquema

`supabase/migrations/0107_talacha_autorizada.sql:39`

`add column monto_estimado numeric` — sin `(12,2)` como todas sus hermanas de
dinero, y sin `>= 0`. Hoy el único escritor es
`talacha_wa.ts:84-100` (`extraerMonto`), que filtra `n > 0` y limita a diez
dígitos, así que no hay camino vivo que meta basura; `crearIncidencia`
(operacion.ts:1032) sí escribe `monto_estimado` desde un `NuevaIncidencia` sin
validación de rango, pero ninguna pantalla lo alimenta todavía.

Consecuencia: el día que la talacha se capture desde el panel, el monto que
`escalaciones.ts:265` imprime al superadmin (`mxn(t.montoEstimado)`) puede ser
`-3500` o `0.005`, y el redondeo silencioso que `numeric(12,2)` haría en las
demás columnas aquí no ocurre.

### [BAJO] Dos FKs a `tenant` sin `on delete` bloquean el borrado de una flota

`supabase/migrations/0089_agente_cobranza.sql:46` (`cobranza_contacto.tenant_id
uuid not null references public.tenant(id)`, sin acción) ·
`0105_zona_vendedores.sql:80` (`prospecto.tenant_id uuid references
public.tenant(id)`, sin acción) · REINCIDENTE (la 0089 venía del pase 2)

Todas las demás tablas del esquema traen `on delete cascade` sobre `tenant_id`.
Estas dos quedan en `NO ACTION`: un `delete from tenant where id = '<X>'` —el
camino natural para dar de baja una flota de prueba desde la consola de
Supabase— rebota con `23503` en cuanto exista un intento de cobranza o un
prospecto cerrado apuntando a ella. En `prospecto` es defendible (el comentario
de `vendedor_id` argumenta que borrar cartera debe doler, aunque el argumento
no se escribió para `tenant_id`); en `cobranza_contacto` es un olvido.

## Invariantes del código que la base NO impone

| Invariante | Dónde lo asume el código | ¿Hay constraint? | Riesgo |
|---|---|---|---|
| Un pago pertenece a una factura de SU MISMA flota | `facturacion_escritura.ts:385-387` (`.eq('tenant_id')` antes de insertar) | **No** — `pago_recibido.factura_id → factura_emitida(id)` (0049:96) | ALTO: la vista `factura_saldo` (0049:128) suma sin tenant y el panel la lee con service role |
| Una factura pertenece a un cliente de su misma flota | `facturacion_escritura.ts:256-262` | **No** — `factura_emitida.cliente_id → cliente(id)` (0049:31); `cliente` ni siquiera tiene el `unique (id, tenant_id)` que haría posible la FK compuesta | MEDIO |
| Los viajes que ampara una factura son de su misma flota | `facturacion_escritura.ts:267-276` | **No** — `factura_viaje` no tiene `tenant_id` y su policy sólo mira el de la factura (0049:150-158) | MEDIO: infla `viajesPorFactura` en `libro_viaje.ts:657-665` y reparte el ingreso entre viajes ajenos |
| La suma de abonos no rebasa el total de la factura | `facturacion_escritura.ts:396-404` (`evaluarAbono`) | **No** | ALTO: ver hallazgo |
| Un abono no se registra dos veces | ninguna parte — no hay dedup | **No** (ni unique ni idempotencia) | ALTO |
| `tenant.config` sólo trae llaves de `LikidaConfig` | `config.ts` (el tipo) | Sí, pero **desincronizada**: 0085:25-27 tiene 10 llaves, el tipo tiene 11 | CRÍTICO: ver hallazgo |
| Un tope de política de 0 es válido | `administracion.ts:267-271` (documentado) | Sí, y **contradictorio**: 0085:116 exige `> 0` | ALTO |
| Un viaje siempre tiene operador | `despacho/page.tsx:99`, `api/v1/viajes/route.ts:192`, `importar_viajes.ts:314` — tres guards de aplicación | Sí en la base (0001:49 NOT NULL), **no en el tipo** (`NuevoViaje.operadorId?`, operacion.ts:507) | ALTO: 23502 al cuarto llamador |
| Una línea de desglose y su desglose son de la misma flota | `desglose_peaje.ts:551-559` (mismo `tenantId` en ambos inserts) | **No** — `desglose_id → desglose_peaje(id)` sin tenant (0106:58) | BAJO (tabla deny-all: sólo alcanzable por service role) |
| Una línea de desglose y su viaje son de la misma flota | `desglose_peaje.ts:685-690` (`.eq('tenant_id')` al buscar candidatos) | **No** — `viaje_id → viaje(id)` (0106:73) | BAJO (mismo motivo) |
| Un importe de factura de proveedor es positivo | ninguna parte | **No** (0091:30-34) | MEDIO: ver hallazgo |
| Un importe de línea de peaje es positivo | ninguna parte; el parser lo permite explícitamente (`-?` en el regex) | **No** (0106:68) | MEDIO |
| `factura_proveedor.origen` está siempre poblado en filas nuevas | `proveedores.ts:113-119` (parámetro obligatorio) | Parcial: el CHECK sólo restringe el dominio, `NULL` pasa | BAJO |
| `prospecto.tenant_id` se llena al cerrar el trato | **nadie lo escribe** — `cambiarEstadoProspecto` (vendedores.ts:501-506) sólo toca `estado`, `cerrado_en`, `updated_at` | Sí (`prospecto_tenant_solo_cerrado`, 0105:95-96) pero sin escritor | BAJO: la comisión que el `comment on table` promete no tiene de dónde salir |

## Lo que revisé y está bien

- **0098 (idempotencia durable).** La llave primaria `(tenant_id, ruta, llave)`
  con el tenant PRIMERO y el porqué escrito (0098:36-47); `status in (200,201)`
  para no replayar errores (0098:105-106); `huella ~ '^[0-9a-f]{64}$'`;
  `length(llave) between 8 and 200` que **coincide** con
  `LARGO_MIN_LLAVE/LARGO_MAX_LLAVE` del código (`_escritura.ts:369-370`); RLS
  encendida sin políticas a propósito y explicado (0098:113-122); y el
  `revoke … from public` que la propia migración documenta como la corrección
  del único RPC alcanzable por `anon` (0098:159-173). La verificación 75 lo
  vigila (`verificaciones.sql:3663`).
- **0109.** Corrige la 0107 de la única forma que sirve: `(decidida) = (hay
  quién)` y `(decidida) = (hay cuándo)` por separado, porque
  `false = false` dejaba pasar media firma (0109:5-16). Y llegó porque la
  verificación 85 falló en su primera corrida real — el bucle de compuerta
  funciona.
- **0110.** `interruptor_id_dominio` contra el catálogo REAL de agentes
  (0110:69-76), `apagado ⇒ motivo no vacío` (0110:79-81), sin filas sembradas
  (sin fila = encendido), y `impersonacion_dia` con PK `(actor, tenant, día)`
  que es el dedup, no un contador.
- **0105.** `prospecto_estado_dominio`, `prospecto_cerrado_coherente` en los DOS
  sentidos, `prospecto_tenant_solo_cerrado`, `empresa` no vacía (0105:86-99). Y
  el `alter column tenant_id drop not null` de `agente_corrida` viene con el
  análisis de qué le pasa a la policy `tenant_lee` con NULL (0105:126-129).
- **0106.** `desglose_peaje_linea_unica (desglose_id, indice)` es la llave
  natural que hace idempotente el re-cruce; `estatus` con dominio de tres
  cubetas; `diferencia` con el `NULL ≠ 0` escrito en el `comment on column`
  (0106:90-91); `periodo_hasta >= periodo_desde`.
- **0111.** Los dos índices que faltaban, con la lista de consultas que los
  piden citada por `archivo:línea` y con la lista de lo que se DESCARTÓ y por
  qué (0111:60-72). Y dice por qué no va `CONCURRENTLY` y por qué se aplica
  antes de la firma del cliente.
- **0054.** `alter view factura_saldo set (security_invoker = true)` cierra la
  fuga entre inquilinos por PostgREST, con la medición (`via-tabla=1
  via-vista=2`) en el comentario. Es el único `view` del esquema y está
  cubierto.
- **0070.** `gasto.monto >= 0` y `viaje.anticipo >= 0` con el razonamiento de
  por qué uno no es `> 0`. El camino del cuadre está protegido.
- **0092.** `unique (tenant_id, folio)` con `NULLS DISTINCT` para que los
  viajes despachados por WhatsApp (folio NULL) no choquen. Y el código lo usa
  como árbitro real de la carrera (`_escritura.ts:764-773`), no como
  decoración.
- **RLS.** Crucé las 60 tablas del esquema contra los `enable row level
  security` (incluidos los dos bucles `do $$` de `0001:110-113` y
  `0047:157-164`): **no queda una sola tabla sin RLS**.
- **Dominios de `types/likida.ts` vs la base.** `ConceptoGasto` (9 valores) =
  `gasto_concepto_dominio` (0025:87-88); `EstadoSat` = `gasto_estado_sat_dominio`
  (0025:93-94) = `factura_proveedor_sat_dominio` (0108:53-54);
  `EstatusLiquidacion` = `liquidacion_estatus_dominio`. Ningún tipo más
  estricto que su columna en este archivo.
- **Unicidades del dinero.** `liquidacion_viaje_uidx` (0005:9),
  `uq_gasto_cfdi_uuid (tenant_id, cfdi_uuid, cfdi_orden)` (0065:73-74) que
  admite el reparto CAPUFE sin permitir el duplicado, `factura_cfdi_unico` y
  `factura_folio_unico` parciales (0049:66-70), `tenant_api_key_hash_unico`,
  `cobranza_contacto unique (viaje_id, tier)`.
- **`tenant_api_key.prefijo` sin unique**: refutado como hallazgo — la
  resolución va por `hash` (que sí es único y con CHECK de forma); el prefijo
  es sólo la pista de pantalla.
- **`incidencia_autorizacion_pendiente_idx` parcial** (0107:72-74): correcto,
  la población grande son las informativas con `autorizacion NULL`.

## Lo que NO alcancé a revisar

- **`guardar_liquidacion_tx`** y las funciones de 0013/0021/0022 — no abrí su
  cuerpo en este pase. Es la única escritura transaccional del esquema y la que
  más invariantes concentra.
- **Los triggers** (0036 y el de `intake_delta`): sé que existen por los
  comentarios de `administracion.ts:405-409` y `0025:117-119`, no leí sus
  definiciones.
- **`bitacora_auditoria` (0053)** y su promesa de append-only: no verifiqué que
  no exista policy ni grant de `update`/`delete`.
- **Las tablas del SaaS** (`plan`, `suscripcion`, `factura_saas`,
  `envio_mensaje`, `campania`, `solicitud_arco`, `invitacion`): sólo confirmé
  que tienen RLS, no revisé sus dominios ni sus unicidades.
- **`storage`**: las políticas de bucket (`gasto.imagen_url`,
  `incidencia.evidencia_path`, `pod`) viven fuera de `supabase/migrations/` y no
  las vi.
- **La base viva.** No hay instancia accesible: todo lo anterior sale de leer
  el SQL y el código. Los conteos de filas que las migraciones citan
  ("comprobado contra producción el 14-ago-2026") no los pude reverificar.
