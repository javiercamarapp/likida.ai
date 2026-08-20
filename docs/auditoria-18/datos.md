# Modelo de datos y esquema — auditoría 18

**Nota: 6/10** (antes 7). Razón del movimiento: **mirada más profunda**. El esquema no
empeoró — las migraciones de esta ronda (0135–0139) son de las mejor restringidas del
repo. Lo que cambió es lo que se midió: el 7 anterior se apoyaba en "las unicidades
críticas están y faltan los CHECK de dominio", y los CHECK de dominio ya llegaron (0025,
0044, 0086, 0105, más los de cada tabla nueva). Al mirar debajo de eso aparece algo que
la nota anterior no contaba: **el patrón de la 0028 —la FK compuesta con `tenant_id`, que
el propio repo clasifica como CRÍTICA en el bloque 48 de `verificaciones.sql`— cubre 4 de
las ~24 relaciones entre entidades del esquema**, y `gasto`/`liquidacion` son las dos
únicas tablas de dinero que quedaron fuera de `ve_finanzas()`. No es que se rompiera algo:
es que se vio mejor.

**El riesgo mayor del rubro, hoy:** el aislamiento entre flotas dejó de ser una propiedad
de la clave en cuanto el esquema creció. De la 0047 a la 0107 se agregaron veinte FKs
entre entidades con `tenant_id` propio y **todas son de una sola columna**, así que la
única cosa que garantiza que la factura, el pago, el POD o la línea de peaje pertenezcan a
la misma flota que su padre es un `if` en TypeScript.

---

## Invariantes del código contra restricciones de la base

| Invariante que el código asume | Dónde lo asume | ¿Lo impone la base? |
|---|---|---|
| `gasto.concepto` ∈ los 9 de `ConceptoGasto` | `repo.ts:672` (`r.concepto as Gasto['concepto']`) | **Sí** — `gasto_concepto_dominio` (0025:87) |
| `viaje.estatus` ∈ `abierto\|en_cuadre\|liquidado` | `conv.ts` `getOpenViaje`, `guardar_liquidacion_tx` (0021:51) | **Sí** — `viaje_estatus_dominio` (0025:111) — confirmado, admite exactamente esos tres |
| `liquidacion.estatus` ∈ `cuadrada\|con_diferencias\|revisar` | `types/likida.ts:111` | **Sí** — `liquidacion_estatus_dominio` (0025:126) |
| `app_user.rol` ∈ 5 valores (con `vendedor`, sin `operador`) | `auth/provisionar.ts:20` (`RolAppUser`) | **Sí** — `app_user_rol_dominio` (0105:51); el TS y el CHECK coinciden exactamente |
| Un CFDI no se liquida dos veces | `processor.ts` (`violaIndice(e,'uq_gasto_cfdi_uuid')`) | **Sí** — `uq_gasto_cfdi_uuid (tenant_id, cfdi_uuid, cfdi_orden) where cfdi_uuid is not null` (0065:69). El caso de manual está cerrado; la 0065 lo abrió a N filas solo por `cfdi_orden`, que nace en 1 y solo el reparto de CAPUFE escribe >1 |
| Un mensaje de WhatsApp se procesa una vez | `conv.ts` `claim` | **Sí** — `wa_mensaje_procesado.wa_message_id` es PK (0002:6) |
| Una liquidación por viaje | upsert `on conflict (viaje_id)` (0013:33) | **Sí** — `liquidacion_viaje_uidx` (0005:20) |
| No entran gastos después de emitir la liquidación | `processor.ts` (SQLSTATE `CU001`) | **Sí** — trigger `trg_gasto_no_tras_liquidar` con `for update` (0036), + UPDATE (0037) y `fecha` (0042) |
| `gasto.monto >= 0` y `viaje.anticipo >= 0` | `engine.ts:275-277`, `:298` | **Sí** — `gasto_monto_no_negativo`, `viaje_anticipo_no_negativo` (0070:41,44) |
| El gasto y su viaje son de la misma flota | `repo.ts:143-159` | **Sí** — `gasto_viaje_tenant_fkey` (0028:93) |
| El operador de un viaje es de la misma flota | `repo.ts:130-139` (`reasignarOperador` relee el operador) | **Sí** — `viaje_operador_tenant_fkey` (0028:96) |
| **La factura y su cliente son de la misma flota** | `facturacion_escritura.ts:256-262` (`if (!cli) throw`) | **NO** — `factura_emitida.cliente_id` es FK simple (0049:31) |
| **Los viajes que ampara una factura son de la misma flota** | `facturacion_escritura.ts:267-277` | **NO** — `factura_viaje.viaje_id` es FK simple y la tabla no tiene `tenant_id` (0049:85) |
| **El pago abona a una factura de la misma flota** | `facturacion_escritura.ts:384-390` | **NO** — `pago_recibido.factura_id` es FK simple (0049:96) |
| El viaje y su cliente / su unidad son de la misma flota | panel `/dashboard/viajes` | **NO** — `viaje.cliente_id` (0048:139), `viaje.unidad_id` (0047:65) son FKs simples |
| El POD, la incidencia, la posición y la línea de peaje son de la flota de su padre | panel | **NO** — `pod.viaje_id`/`operador_id` (0047:130-131), `incidencia.viaje_id`/`unidad_id` (0047:100-101), `incidencia.gasto_id` (0107:41), `posicion.unidad_id` (0050:47), `desglose_peaje_linea.viaje_id` (0106:73), `cfdi_consolidado_linea.gasto_id` (0076:57) |
| `gasto.ocr_confianza` ∈ [0,1] | `intake/ocr.ts:63` (`z.number().min(0).max(1)`), `engine.ts:447,463` | **NO** — `numeric(4,3)` sin CHECK. La hermana `factura_proveedor.ocr_confianza` **sí** lo tiene (`factura_proveedor_ocr_rango`, 0108:52) |
| `diferencia = total_anticipo − total_comprobado` | `engine.ts`, PDF, `analytics.ts:1349` | **NO** — solo hay CHECK contra `NaN` (`liquidacion_montos_no_nan`, 0025:129) |
| `total_comprobado >= 0`, `total_anticipo >= 0` | `analytics.ts:555-567` los suma para el gráfico "Total liquidado" | **NO** — la 0070 cerró `gasto`/`viaje` y dejó las tres de `liquidacion` con solo el CHECK de `NaN` |
| Solo `flota_admin`/`contador` ven y tocan dinero | `auth/visibilidad.ts:36-45` (`encargado: ['operacion']`) | **Parcial** — `ve_finanzas()` lo impone en `cliente`, `tarifa`, `factura_emitida`, `pago_recibido`, `factura_viaje`, `cotizacion` (0048/0049/0051), **pero no en `gasto` ni en `liquidacion`** (0086:39-52, `tenant_data … for all`) |
| `factura.total = subtotal + iva` | `facturacion_escritura.ts` | **Sí** — `factura_total_cuadra` (0049:54) |
| `prospecto.duplicado_de` apunta a una fila visible | `admin/prospectos-mapa.ts` (el tablero filtra `duplicado_de is null`) | **Parcial** — `prospecto_duplicado_no_circular` (0139:71) solo prohíbe la autorreferencia; un ciclo A→B→A pasa |
| Una capacidad de worker es una de las cuatro del bus | `worker/llaves.ts:44` (`.includes(capacidad)`) | **NO** — `worker_llave.capacidades text[]` sin dominio ni "no vacío" (0135:26). Falla cerrado, pero el error es mudo |
| `wa_conversacion` tiene una fila por (flota, teléfono) | `conv.ts:230-237` (`maybeSingle`) | **Parcial** — `wa_conversacion_tenant_tel_uidx` (0005:24) sobre una columna `tenant_id` **nullable** (0001:80): dos filas con tenant NULL y el mismo teléfono no colisionan |

---

## Hallazgos

### [CRÍTICO] La FK compuesta de la 0028 se quedó en cuatro relaciones; las veinte que vinieron después no la tienen — y la cadena de cobranza es una de ellas

`supabase/migrations/0028_fks_con_tenant.sql:91-96` (las cuatro que sí) ·
`supabase/migrations/0049_cobranza_factura_emitida_pago.sql:31,34,84-85,96` (las que no) ·
`src/lib/likida/facturacion_escritura.ts:256-262,267-277,384-390` (dónde lo suple la app) ·
`supabase/verificaciones.sql:2521-2528` (el repo ya clasificó esta clase como CRÍTICA)

**Escenario, con valores.** Existen dos flotas. `pago_recibido` tiene RLS
`tenant_finanzas` cuyo `with check` solo mira `tenant_id`, y su FK
`pago_recibido.factura_id → factura_emitida(id)` no lleva `tenant_id`. Un `contador` de la
flota A, autenticado, contra PostgREST (que la 0048:42-46 reconoce explícitamente como
superficie: *"cualquier usuario autenticado tiene la anon key y puede pegarle a PostgREST
directo"*):

```
POST /rest/v1/pago_recibido
{"tenant_id":"<A>","factura_id":"<factura de B, $250,000>","fecha":"2026-08-20","monto":250000}
```

El `with check` pasa (el `tenant_id` es el suyo). La FK pasa (la factura existe). Queda una
fila con `pago_recibido.tenant_id = A` y `factura_emitida.tenant_id = B`.

**El estado que queda.** La vista `factura_saldo` (0049:112-129) suma
`coalesce(sum(p.monto),0)` uniendo **solo** por `p.factura_id = f.id`, sin mirar tenant. Y
`getCobranza` la lee con la service role (`src/lib/likida/comercial.ts:200-201`), que salta
RLS. La pantalla de cobranza de la flota B pinta, para esa factura: `pagado $250,000.00`,
`saldo $0.00`, `vencida: false` — y su KPI "Por cobrar" baja $250,000. Mientras tanto B no
puede ver ni una fila de pago: `pago_recibido` está filtrada por `tenant_id`, y el pago es
de A. La factura aparece cobrada y no hay ningún abono que lo explique.

La misma clase, sin la vista de por medio:
`insert into factura_viaje (factura_id, viaje_id)` con una factura de A y un `viaje_id` de
B pasa el `with check` (que solo valida el lado de la factura, 0049:155-158) y liga el
viaje de otra flota al ingreso facturado de A. Y `factura_emitida.cliente_id` de otra flota
pasa igual: la comprobación *"Ese cliente no está en tu flota"* vive únicamente en
`facturacion_escritura.ts:262`.

**Consecuencia.** El contralor de la flota B deja de perseguir una cuenta por cobrar de un
cuarto de millón porque su tablero dice que ya se la pagaron. Es el error que el producto
existe para no cometer, y no hay pantalla desde la cual pueda descubrirlo: la evidencia
—la fila de pago— es invisible para él por diseño de la RLS.

**Por qué no lo bajo a ALTO.** Requiere conocer el UUID de una factura ajena, que no se
adivina. Pero el rubro no se define por el atacante: el bloque 48 de `verificaciones.sql`
ya dice, sobre esta misma clase y palabra por palabra, *"la 0028 documentó como CRÍTICA la
clase de defecto… `comprobante_huerfano` nació en la 0040 —DESPUÉS de la 0028— y se saltó
el patrón. Comprobado antes de arreglarlo: la fila cruzada ENTRABA"*. Se arregló esa tabla
(0073) y nunca se barrió el resto. Un script de importación, la consola de Supabase o un
`tenantId` mal pasado en una función futura no necesitan adivinar nada.

**Causa raíz probable.** La 0028 se escribió como una migración puntual sobre las cuatro
tablas que existían en julio, no como una regla del esquema; ninguna prueba ni bloque de
verificación falla cuando una tabla nueva se salta el patrón.

---

### [ALTO] `gasto` y `liquidacion` son las dos únicas tablas de dinero fuera de `ve_finanzas()`: cualquier rol de oficina las lee y las escribe por PostgREST

`supabase/migrations/0086_retirar_rol_operador.sql:39-52` ·
`supabase/migrations/0048_comercial_cliente_tarifa_ingreso.sql:42-46` (el criterio) ·
`src/lib/auth/visibilidad.ts:36-45` · `supabase/verificaciones.sql:1077-1123` (el bloque 29,
que prueba seis tablas y no estas dos)

**Escenario, con valores.** La política de `gasto` y `liquidacion` es la genérica que la
0086 recreó: `tenant_data … for all using (tenant_id = any(get_user_tenant_ids()) or
is_superadmin()) with check (…)`. No hay `ve_finanzas()` ni ningún filtro por rol. Ninguna
migración revoca los grants por defecto de Supabase sobre esas tablas (el único `revoke`
de tabla en las 136 migraciones es `llm_costo_mensual`, 0072:82). Un `encargado` de la
flota A —jefe de tráfico, a quien `visibilidad.ts:41` le da `['operacion']` y nada más—
con su propia sesión:

```
GET  /rest/v1/liquidacion?select=total_comprobado,total_anticipo,diferencia,estatus
POST /rest/v1/gasto  {"tenant_id":"<A>","viaje_id":"<viaje abierto de A>",
                      "concepto":"diesel","monto":40000,"forma_pago":"01"}
```

La primera devuelve la liquidación de cada viaje de la flota: comprobado, anticipo y
diferencia. La segunda **entra**: pasa `gasto_concepto_dominio`, pasa
`gasto_monto_no_negativo`, pasa `gasto_forma_pago_formato` y pasa el trigger
`trg_gasto_no_tras_liquidar` porque el viaje todavía no tiene liquidación.

**El estado que queda.** $40,000 de diésel que nadie compró, dentro de un viaje abierto.
Al cuadrar, `engine.ts:275-277` los suma a `totalComprobado`, y como `forma_pago = '01'`
entran al denominador del 15% de RFA 2026 regla 2.9. El PDF que recibe el operador y el
contralor sale con esa cifra. `bitacora_auditoria` no tiene una sola fila: la escritura
nunca pasó por `anotar()` porque nunca pasó por la aplicación.

**Consecuencia.** El argumento con el que se vende el producto —"las pantallas de dinero no
son para el encargado"— es cierto en la UI y falso en la base. Un puesto medio ve el margen
completo de la flota con un `fetch`, y puede meter un gasto que acaba en un papel fiscal.
Es exactamente la fuga que la 0048:42-46 describe para justificar `ve_finanzas()` —*"sin
esto, un encargado curioso lee las tarifas de su flota con un fetch"*— aplicada a las dos
tablas que el `ve_finanzas()` nunca alcanzó.

**Causa raíz probable.** `ve_finanzas()` nació en la 0048 junto con las tablas comerciales
y se aplicó a las tablas nuevas de esa tanda. `gasto` y `liquidacion` venían de la 0001 con
`tenant_data`, y la 0086 —que las tocó para quitarles `not is_operador()`— reprodujo la
policy tal cual en lugar de revisarla contra la matriz de roles que ya existía.

---

### [MEDIO] Las tres cifras de `liquidacion` aceptan negativos y no están amarradas entre sí

`supabase/migrations/0025_dominios_check.sql:126-130` ·
`supabase/migrations/0070_montos_no_negativos.sql:40-44` ·
`src/lib/likida/analytics.ts:555-567,1349`

**Escenario, con valores.** La 0070 cerró `gasto.monto >= 0` y `viaje.anticipo >= 0` con el
argumento de que *"un comprobante negativo no suma de menos: RESTA del comprobado, así que
infla la diferencia dos veces su valor"*. Las tres columnas donde ese número aterriza
—`total_comprobado`, `total_anticipo`, `diferencia`— se quedaron con el único CHECK de
`NaN` de la 0025. Un `contador` de la flota A, vía PostgREST (misma policy `for all` del
hallazgo anterior):

```
PATCH /rest/v1/liquidacion?id=eq.<X>
{"total_comprobado":-5000,"diferencia":0}
```

Entra sin error. La fila queda con `total_anticipo = 6000`, `total_comprobado = -5000` y
`diferencia = 0`.

**El estado que queda.** El detalle de la liquidación (`analytics.ts:1321,1349`) imprime las
tres juntas y no restan. El gráfico "Total liquidado por semana"
(`analytics.ts:555-567`) suma `total_comprobado` de todas las liquidaciones y le baja
$5,000 a la semana. El PDF archivado —el que el contralor ya mandó a su contador— dice otra
cosa. Y el portón de reconstrucción de `analytics.ts:1453` compara justamente
`totalComprobado` contra lo persistido, así que se apaga el desglose de las tres cubetas
sin decir por qué.

**Consecuencia.** Dos cifras fiscales que se leen distinto en dos lugares sobre el mismo
viaje, que es la definición de "dos cálculos" que el producto se prohíbe a sí mismo.

**Causa raíz probable.** La 0070 se escribió mirando las entradas del cuadre (`gasto`,
`viaje`) y no las salidas (`liquidacion`), y la 0025 se autolimitó a `NaN` por el argumento
—correcto para `gasto`— de que un dato malo visible vale más que un dato ausente. Ese
argumento no aplica a una fila que produce el motor, no el OCR.

---

### [MEDIO] `gasto.ocr_confianza` no tiene rango 0–1, aunque su gemela `factura_proveedor.ocr_confianza` sí

`supabase/migrations/0001_init.sql:63` · `supabase/migrations/0108_factura_proveedor_flujo.sql:40,52` ·
`src/lib/likida/intake/ocr.ts:63` · `src/lib/likida/cuadre/engine.ts:447,463`

**Escenario, con valores.** El tipo es `numeric(4,3)`: acepta de −9.999 a 9.999. El zod del
intake lo acota a [0,1] (`ocr.ts:63`), pero un `update gasto set ocr_confianza = 9.999
where id = '<G>'` desde la consola de Supabase o desde un script de reproceso entra sin
error.

**El estado que queda.** `engine.ts:463` evalúa `g.ocrConfianza < umbral` (umbral ~0.7):
con 9.999 la comparación es falsa y **no** se emite la diferencia `ocr_baja_confianza`, ni
la `folio_verificar` de `engine.ts:447` para el ticket de diésel. Un comprobante que el
modelo leyó mal deja de estar marcado como "conviene revisarlo a mano", y como
`ocr_baja_confianza` está en la lista `REVISAR` (`engine.ts:1135`), el viaje sale
`cuadrada` en vez de `revisar`.

**Consecuencia.** El contralor no recibe la única señal que le dice qué comprobante mirar
con lupa antes de facturarlo en el portal de la gasolinera.

**Causa raíz probable.** El rango se validó en el borde de entrada (zod) cuando el único
escritor era el intake; la 0108 sí lo puso en la base para `factura_proveedor` y nadie
volvió sobre la columna original.

---

### [MEDIO] `prospecto.duplicado_de` admite un ciclo A→B→A, que esconde las dos filas — y el bloque que lo verifica lo nombra sin probarlo

`supabase/migrations/0139_prospecto_calidad.sql:55,68-72,84` ·
`supabase/verificaciones.sql:5380-5414`

**Escenario, con valores.** La 0139 solo prohíbe la autorreferencia:
`check (duplicado_de is null or duplicado_de <> id)`. El deduplicador que va a escribir esta
columna encuentra «AUTO EXPRESS PERLA» y «AUTOEXPRESS PERLA» y no tiene forma de saber cuál
es la buena:

```sql
update prospecto set duplicado_de = '<B>' where id = '<A>';
update prospecto set duplicado_de = '<A>' where id = '<B>';
```

Las dos pasan el CHECK y las dos pasan la FK.

**El estado que queda.** `idx_prospecto_vivos … where duplicado_de is null` (0139:84) es el
filtro por defecto del tablero, y ninguna de las dos filas lo cumple. La empresa desaparece
del censo completo, con sus toques y sus notas dentro. Lo mismo con una cadena A→B→C: el
puntero de A nombra una fila que a su vez está escondida.

**Consecuencia.** En una empresa pre-revenue cuyo único pipeline es un censo de 33,070
filas, un prospecto marcado dos veces sale del universo de venta sin dejar rastro visible.
El bloque 110 de `verificaciones.sql:5382-5383` escribe la frase *"un ciclo A→B→A escondería
las dos"* y luego solo prueba (a) la autorreferencia y (b) el id inexistente — el ciclo
queda nombrado y sin cubrir.

**Causa raíz probable.** El CHECK se derivó del daño obvio (profundidad 0) en vez de del
invariante real, que es "la fila a la que apunto tiene que ser visible".

---

### [BAJO] `wa_conversacion.tenant_id` es nullable, así que su índice único no cubre el caso NULL y esas filas son invisibles para toda policy

`supabase/migrations/0001_init.sql:80` · `supabase/migrations/0005_concurrencia.sql:24` ·
`src/lib/likida/conv.ts:230-237`

**Escenario, con valores.** `wa_conversacion_tenant_tel_uidx` es
`unique (tenant_id, telefono)`; en Postgres los NULL no colisionan entre sí. Dos
`insert into wa_conversacion (telefono, estado) values ('5215500001001', '{"turns":[]}')`
sin `tenant_id` entran los dos. Después, `loadConversation` sí filtra por tenant, así que
no las encuentra nunca; y la policy `tenant_data` evalúa `NULL = any(...)` → NULL, o sea
que ningún usuario autenticado las ve tampoco. La 0028:51-52 documenta que dejó
`wa_conversacion` fuera de las FK compuestas precisamente por esto y no cerró la nulabilidad.

**Consecuencia.** Filas que acumulan historial de conversación —dato personal bajo
LFPDPPP— sin flota a la que atribuirlas y sin pantalla desde la cual verlas o borrarlas.
Hoy no hay escritor que las produzca; la restricción es la que evita que aparezca uno.

**Causa raíz probable.** El `tenant_id` nullable de la 0001 era para el caso "todavía no sé
de quién es este teléfono", y ese caso dejó de existir cuando `resolveOperador` pasó a
resolverse antes de tocar la tabla.

---

### [BAJO] `worker_llave.capacidades` no tiene dominio ni "no vacío"

`supabase/migrations/0135_worker_llave.sql:26` · `src/lib/worker/llaves.ts:44`

**Escenario, con valores.** `capacidades text[] not null` acepta `'{}'` y acepta
`'{bus.ordenes_}'`. `crear-worker-llave.py` teclea la lista. Una llave creada con
`{"bus.latido","bus.piezas"}` (plural, en vez de `bus.pieza`) se guarda sin queja;
`llaves.ts:44` hace `.includes(capacidad)` y la rechaza en cada llamada.

**Consecuencia.** Falla cerrado —que es lo correcto— pero el error se manifiesta como un
403 en la Mac del bus a las 3 de la mañana, y la fila de la base dice que la llave tiene
permiso. El diagnóstico es un `select capacidades` y comparar letra por letra contra las
cuatro del comentario de la migración.

**Causa raíz probable.** Las cuatro capacidades viven en un comentario SQL (0135:12-15) y
en un `includes` de TypeScript; no hay un lugar donde estén enumeradas de forma que la base
las pueda comprobar.

---

## Lo que revisé y está bien

- **Las 136 migraciones tienen RLS habilitada en todas sus tablas.** Lo verifiqué tabla por
  tabla contra los `alter table … enable row level security` sueltos y contra los dos bucles
  (0001:110, 0047:160): no queda ninguna sin habilitar. Las internas (`viaje_lock`,
  `worker_llave`, `evento_stripe`) tienen RLS sin policy = negado a todo lo que no sea
  service role, que es el default correcto.
- **La unicidad del CFDI, que era el caso de manual, está y está bien pensada.** La 0065
  la relajó a `(tenant_id, cfdi_uuid, cfdi_orden)` por la factura consolidada de CAPUFE y
  conservó el nombre del índice a propósito, porque `processor.ts` distingue *cuál* índice
  chocó para saber si el 23505 es benigno. Dos fotos del mismo XML siguen chocando.
- **El cierre de la liquidación es atómico y está fuera del alcance de la sesión.**
  `guardar_liquidacion_tx` corre en una transacción (0013) y su EXECUTE está revocado de
  `public, anon, authenticated` explícitamente, con la nota de que `revoke from public` no
  basta en Supabase (0013:51-56). Verificado también para las once funciones
  `security definer` restantes.
- **El trigger de "gasto tardío" está construido contra la evidencia correcta.** 0036 se
  ancla en la existencia de la liquidación, no en `viaje.estatus`, y toma `for update`
  sobre el viaje para serializar contra el cierre. Un UPDATE que devuelva el viaje a
  `abierto` no reabre el hueco.
- **`factura_saldo` ya no filtra por el dueño de la vista** (`security_invoker = true`,
  0054:42), con la medición del antes y el después en el propio comentario.
- **Las dos restricciones que llevaban meses en `NOT VALID` se validaron** (0075:41-42),
  aprovechando que la tabla está vacía y diciendo por qué ese es el momento.
- **Las migraciones nuevas de esta ronda son las mejor restringidas del repo.** La 0138 trae
  cinco CHECK, entre ellos uno cruzado (`prospecto_persona_inferido_no_es_alta`) que impide
  que un correo adivinado se declare de confianza alta, y un único parcial sobre
  `lower(correo)`. La 0139 documenta explícitamente por qué **no** crea todavía el índice
  único sobre el nombre (1,227 grupos duplicados vivos abortarían la migración entera). La
  0137 se corrigió en su sitio con la verificación de que nunca se había aplicado en ningún
  entorno, y el escritor (`api/lead/route.ts:161,205`) filtra por el mismo dominio cerrado
  que el CHECK y sobrevive a la columna ausente.
- **`src/types/likida.ts` no miente sobre la nulabilidad en el camino del dinero.**
  Recorrí las cinco interfaces contra las columnas: `Gasto.monto`, `Operador.nombre`,
  `Operador.telefono` y `Viaje.anticipo` son `NOT NULL` en la base; todo lo demás está
  declarado opcional. `Liquidacion.diferencias` es el único que se lee de una columna
  nullable y el código lo cubre con `?? []` (`analytics.ts:1358`). El único desajuste real
  que encontré es `ocr_confianza` (arriba), y es de rango, no de nulabilidad.
- **El hueco de las migraciones 0067–0069 ya está resuelto por evidencia**
  (`verificaciones.sql:3810-3836`: nunca existieron, comprobado contra el ledger). No lo
  levanto de nuevo.

## Lo que NO alcancé a revisar

- **No hay base de datos aquí**, así que ningún bloque de `verificaciones.sql` se corrió.
  Todo lo de arriba se sostiene por lectura de las 136 migraciones y del código que las
  consume. En particular, no pude comprobar que el esquema **vivo** coincida con el que las
  migraciones describen — y el repo tiene precedente de que no siempre coincidió (0065 se
  borró por accidente y se reconstruyó leyendo `pg_indexes`; 0065:72-79 admite que esa
  reconstrucción olvidó dos columnas y su CHECK).
- **Los grants reales por tabla.** Doy por hecho el default de Supabase (`GRANT ALL … TO
  anon, authenticated` en `public`), que es lo que la 0048:42-46 y la 0052 asumen también,
  pero no lo leí de `information_schema.role_table_grants`.
- **`supabase/seed.sql`** solo lo hojeé; no crucé sus valores contra los CHECK de dominio
  de la 0025 y sucesoras.
- **Las políticas de `storage.objects`** más allá de notar que `avatares_lectura_publica`
  (0046:43-45) concede `select` a `public` sobre todo el bucket. Eso es del rubro de
  seguridad, no lo instrumento aquí.
- **Los ~40 CHECK de las tablas de plataforma** (`agente_*`, `cola_*`, `bus_*`, `campana`,
  `evento_stripe`, `evalops`) los inventarié por nombre pero no los crucé uno por uno
  contra los tipos de TypeScript que los consumen. Prioricé el camino del dinero y el
  tenant, que es lo que el rubro pide primero.
