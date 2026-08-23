# Modelo de datos y esquema — auditoría 18 · continuación 4

**Nota: 7/10** (antes 7). Razón del movimiento: **ninguno**, y es una nota que se
sostiene por dos fuerzas que se cancelan y hay que nombrar las dos.

*Se atacó y subió*: el esquema recibió el mejor delta de restricciones que ha
tenido este repo. La 0158 le quita el DELETE al dinero, congela `viaje.anticipo`
tras liquidar (cierra un MEDIO mío de la c3), normaliza `cfdi_uuid` y `folio`, y
le pone `pg_temp` a las cuatro SECURITY DEFINER de RLS. La 0159 vuelve atómicas
las tres escrituras de dinero. La 0164 le pone al gasto la llave de idempotencia
que le faltaba (`wa_message_id`). La 0166 hace bien lo que el foco de esta ronda
pedía revisar: **el NULL de `serie` NO abre el candado** — el índice compara
`upper(coalesce(serie,''))`, y lo comprobé corriéndolo.

*Mirada más profunda*, en el otro sentido, y es lo que impide el 8: **encontré un
Postgres 16 en esta caja** (`/usr/lib/postgresql/16/bin`), levanté un clúster,
apliqué el andamio de CI y las 163 migraciones, y corrí la batería entera. La
c3 escribió en «lo que no alcancé a revisar» que su conteo era *por
reconstrucción, no por lectura*. Hoy es por lectura del catálogo — y lo que la
lectura enseña es que **la única compuerta que ejecuta este esquema lleva 24
horas en rojo**: seis bloques de `verificaciones.sql` no corren sobre base
virgen, entre ellos el que verifica los once agregados de la 0150, que hoy
calculan todas las cifras que el contralor ve.

**El riesgo mayor del rubro, hoy:** las restricciones nuevas son buenas y nadie
las está comprobando. `[deploy] … 6,212 pruebas verdes` (`583fec4`) se refiere a
vitest; el job `CI Postgres` de ese mismo sha terminó en **failure**, y así lleva
desde que entró el PR #39.

---

## Cómo se verificó esta vez (nuevo respecto de la c3)

No hay Supabase, pero **sí hay binarios de Postgres 16**. Reproduje `ci-postgres.yml`
paso por paso:

```
initdb (usuario postgres, /tmp/pgaudit) → PostgreSQL 16.13
psql -f supabase/pruebas-aislamiento/andamio_ci.sql          → OK
163 migraciones, una por una, ON_ERROR_STOP=1                → «163 migraciones aplicadas limpias»
node scripts/ci/correr-verificaciones.mjs capa1…             → 4 bloques · 3 ok · 1 FALLO
node scripts/ci/correr-verificaciones.mjs verificaciones.sql → 123 bloques · 98 ok · 6 FALLOS · 17 sin-calificar
```

Todo lo que sigue con la marca **(corrido)** salió de ahí, no de leer.

---

## Verificación de los abiertos de la c3

| Hallazgo (c3) | Estado | Evidencia |
|---|---|---|
| **ALTO** — `viaje` guarda `anticipo`/`ingreso_flete` bajo la policy genérica: el `encargado` lo lee y lo escribe por PostgREST | **REINCIDENTE, ahora con reproducción** (corrido). Las tres policies vivas de `viaje` son `tenant_data_select/insert/update` y ninguna nombra `ve_finanzas()`. Impersoné un `app_user` con `rol='encargado'`: leyó el viaje y `update viaje set anticipo = 2000` **pasó** (de 20,000 a 2,000). La 0158 sólo le quitó el DELETE | `0158:240-261` (recrea `tenant_data_*` sin `ve_finanzas`), `pg_policies` sobre `viaje` |
| **MEDIO** — nada impide reescribir `viaje.anticipo` con la liquidación ya emitida | **CERRADO.** `trg_viaje_no_tras_liquidar`, `before update of anticipo, operador_id`, lanza CU004 si existe la fila de `liquidacion` | `0158:355-378` |
| **MEDIO** — la exención de 0140/0142/0143 dice que el score «se prueba en TS» y es una columna GENERADA | **REINCIDENTE.** Las cuatro entradas (`0140`,`0141`,`0142`,`0143`) siguen literales en `EXENTAS`, con la razón «probada en TS» intacta | `migraciones_verificadas.test.ts:70-73` |
| **BAJO** — el bloque 111 verifica la RLS de `liquidacion` con `ilike` sobre el texto de la policy | **REINCIDENTE.** Sigue midiendo `qual::text ilike '%ve_finanzas%'`; el 114, del mismo arreglo, sigue impersonando | `verificaciones.sql:5421-5432` vs `:5564-5586` |
| **BAJO** — `prospecto_duplicado_visible` es trigger, no restricción | **REINCIDENTE.** `0147:97-107` intacto | `0147:97-107` |
| **ALTO** — `similitud_icp_pct` compara SCIAN de 3 y el repo guarda 6 | **REINCIDENTE, ahora medido** (corrido). Ver hallazgo abajo: con `scian='484121'` la columna generada da **60**, con `'484'` da **100** | catálogo, `0140:59` |
| **MEDIO** — `necesidad_pct` no pasa de 75 y el filtro ofrece ≥85 | **REINCIDENTE, ahora medido** (corrido). `necesidad_pct = 75` es el techo real; `cerebro.tsx:86` sigue tipando `0\|40\|65\|85` y `:874-877` sigue pintando el chip | catálogo, `cerebro.tsx:874-877` |
| **MEDIO** — `CRITERIO_SCORES.necesidad` cita la fórmula derogada | **REINCIDENTE.** «auxiliar administrativo +50» a secas; la expresión viva exige además `viaje\|flota\|diesel\|…` | `src/lib/admin/prospectos-mapa.ts:290` |
| **BAJO** — `mensaje_linkedin` sin escritor y fuera del CHECK | **REINCIDENTE.** `grep -rn mensaje_linkedin src/` → 1 línea, y es el texto de la exención. `prospecto_mensajes_coherentes` sigue mirando sólo `mensaje_wa`/`mensaje_correo` | `0129:22-24` |
| **BAJO** — el redactor llama `giroDe` sin el SCIAN | **REINCIDENTE.** 3 argumentos; los otros tres llamadores pasan `p.scian` | `mensaje/route.ts:71` vs `prospectos-mapa.ts:253,545,764` |
| **BAJO** — `num_unidades` sólo acotado por abajo | **REINCIDENTE, medido** (corrido). `num_unidades=200000000` revienta con `22003 integer out of range` en `viajes_mes_estimado` en vez de rebotar con un dominio que diga qué pasó | `0140:47-48,76` |
| *(no era hallazgo: iba en «lo que revisé y está bien»)* — «el demo de 5,000 camiones sigue cargando con las restricciones nuevas puestas» | **REFUTADO** (corrido). `scripts/demo-5k.sql` no llega ni a su primer `insert`: hay un `--` dentro del literal `::jsonb` de `tenant.config`. Ver el ALTO | `scripts/demo-5k.sql:48` |
| **BAJO** — `prospecto` es deny-all y `prospecto_persona` no | **ABIERTO PERO ACOTADO** (corrido). `prospecto`: RLS activo, 0 policies. `prospecto_persona`: 1 policy, y es `for select using (exists … rol='superadmin')`. No es una fuga entre flotas; es la asimetría, y la asimetría es defendible | `pg_policies` |

---

## El conteo

### FK compuesta — leída del catálogo, ya no reconstruida

`select conrelid::regclass, conkey … from pg_constraint where contype='f'` sobre
la base con las 163 migraciones aplicadas (corrido).

**Regla, dicha para que se pueda repetir:** toda FK cuyo padre no sea
`tenant`/`plan`/`agente_definicion`/`app_user` (las tablas cuyas filas no son de
una flota) y en la que **ambas tablas tengan columna `tenant_id`** — que es la
regla que la c3 declaró.

**38 de 42.** El numerador coincide exactamente con el de la c3 (las 33 de la
0145 + las 4 de la 0028 + la de la 0073); **el denominador de la c3 estaba mal en
las dos direcciones** y por eso lo corrijo:

- La c3 metió al denominador tres relaciones que su propia regla excluye —
  `ticket_mensaje.ticket_id`, `chat_mensaje.conversacion_id`, `viaje_lock.viaje_id`—
  porque la hija **no tiene `tenant_id`**.
- Y **omitió dos que la regla sí cubre**: `cola_aprobacion.prospecto_id → prospecto`
  (`0117:46`) y `prospecto.duplicado_de → prospecto` (`0139:55`). Las dos tablas
  tienen `tenant_id`; las dos son FK de una columna.

**Las cuatro que faltan, nombradas:**

| Relación | Mig:línea | Por qué falta | Riesgo real |
|---|---|---|---|
| `app_user.operador_id → operador` | `0045:21` | `app_user.tenant_id` es NULLABLE («null = superadmin») | Nulo: `app_user` sólo tiene policy `for select` |
| `envio_mensaje.campania_id → campania` | `0053:146` | `tenant_id` NULLABLE en las dos | Nulo: muertas de facto (las sustituyó `campana`, 0123) |
| `cola_aprobacion.prospecto_id → prospecto` | `0117:46` | `tenant_id` NULLABLE en las dos | Bajo: `cola_aprobacion.tenant_id` NULL = pieza de Likida; `prospecto.tenant_id` sólo se llena al cerrar |
| `prospecto.duplicado_de → prospecto` | `0139:55` | auto-referencia, `tenant_id` NULLABLE | Bajo, pero es la columna sobre la que la 0147 montó su trigger de ciclos |

Bajo la regla más ancha («al menos un lado tiene `tenant_id`») son **38 de 49**;
las 7 extra son las hijas sin `tenant_id` (`chat_mensaje`, `ticket_mensaje`,
`viaje_lock`, `prospecto_contacto`×2, `prospecto_persona`, `prospecto_toque`),
estructuralmente imposibles sin agregarles la columna.

**El delta no agregó ni una relación:** `grep -n "references" 015*.sql 016*.sql`
devuelve exactamente **dos** líneas, y las dos apuntan a catálogos (`0159:162` →
`tenant`, `0163:61` → `plan`). `liquidacion_historico.viaje_id` va **sin FK a
propósito** y está escrito (`0159:181`). O sea: 18 migraciones nuevas y ninguna
tabla nació con la deuda de FK compuesta.

### RPC y SECURITY DEFINER — contados uno por uno

- **Agregados nuevos (0150–0154, 0162): 22 funciones, 0 SECURITY DEFINER.** Todas
  INVOKER con `revoke … from public, anon, authenticated` + `grant … to
  service_role`. La hipótesis del foco («DEFINER sin `tenant_id` en el WHERE»)
  queda **refutada**: no hay ninguna DEFINER entre ellas. Y como corren con
  service_role (que salta RLS), leí el cuerpo de las 22: **las 22 filtran por
  `p_tenant` en cada tabla que tocan**, incluidos los `join` (p. ej.
  `top_rutas_gasto_tenant` lleva `v.tenant_id = p_tenant` *y* `g.tenant_id =
  p_tenant`, `0150:250-254`). La única cross-tenant es `resumen_negocio`
  (`0153:93`), que es cross-tenant a propósito y está revocada a anon/auth
  (`0153:128-129`) — comprobado en el catálogo.
- **SECURITY DEFINER en `public`: 25** (corrido). De ellas, **24 tienen
  `revoke … from anon`** y **1 no**: `prospecto_toque_marca_prospecto` (0167).
  Es la única función DEFINER del esquema ejecutable por `anon`, y es lo que pone
  en rojo dos bloques (ver hallazgos).
- **`search_path` con `pg_temp` al final: 22 de 25.** Las tres sin él:
  `indices_faltantes` (0030, `public, pg_catalog`), `analizar_tablas_operacion`
  (`0157:39`) y `prospecto_toque_marca_prospecto` (`0167:83`) — las dos últimas,
  nuevas de este delta, nueve y diez migraciones **después** de que la 0158 §10.d
  declarara por escrito que ese patrón es un hueco.

---

## Hallazgos

### [CRÍTICO] La única compuerta que ejecuta este esquema lleva 24 horas en rojo: `ci-postgres` falla en `master@583fec4`, y seis bloques no llegan a su propio `RAISE` — entre ellos el 122, la única verificación de base de los once agregados de la 0150

`.github/workflows/ci-postgres.yml:157-162` (el step que corre la batería) ·
`supabase/verificaciones.sql:6094` (bloque 122) · `:5999` (123) · `:5828` (125) ·
`:7000` (134) · `:7508` (137) · `supabase/pruebas-aislamiento/capa1_auditoria_estatica.sql:88`

**Escenario, con valores.** No es hipótesis: es el estado de hoy, por dos vías
independientes.

*Vía 1 — la API de GitHub.* `CI Postgres (aislamiento entre tenants)`, run #311,
`head_sha = 583fec4b…` (el head de `master`, cuyo asunto dice «6,212 pruebas
verdes»): **`"conclusion":"failure"`**. También #310 (`4639717`), #309
(`e228813`), #308 (`b3ac12a`, el merge del PR #39) y #307. El último verde es el
**#305**, `06317d1`, del 22-ago 14:11 — o sea, **antes** de que entraran las
migraciones 0150–0167.

*Vía 2 — reproducido aquí.* Andamio + 163 migraciones + runner, sobre Postgres
16.13 virgen:

```
capa1_auditoria_estatica.sql  → 4 bloques · 3 ok · 1 fallo
   DEFINER_ANON abiertas_sin_exencion=1 (esperado 0)
verificaciones.sql            → 123 bloques · 98 ok · 6 fallos · 17 sin-calificar
```

Los seis fallos, con su causa exacta:

| Bloque | Mig. | Qué pasa |
|---|---|---|
| **122** `:6094` | **0150** | `insert into gasto (… cfdi_uuid …) values (…, 'ZZZ-UUID-0150-A', 1)` viola `gasto_cfdi_uuid_minuscula`. La 0158 (§4, DAT-26) exigió el UUID en minúsculas el **mismo día**; el bloque siembra en mayúsculas. Aborta en la siembra: **ninguna de las once RPC se comprueba** |
| **123** `:5999` | **0151** | dos `insert into viaje (… estatus 'abierto')` con el **mismo `oa`** → `uq_viaje_abierto_por_operador` (0029). El agregado fiscal no se comprueba |
| **125** `:5828` | **0153** | idéntico: `insert into public.viaje (tenant_id, operador_id) values (t_a, o_a)` dos veces seguidas → 23505. `resumen_negocio` no se comprueba |
| **134** `:7000` | **0162** | `storage_borrados=0` contra `(esperado 4)`. La 0165 cambió `limpiar_storage_huerfano` de **borrar** a **marcar** y el bloque 134 quedó midiendo la conducta anterior |
| **137** `:7508` | **0165** | `cannot change name of input parameter "p_dias"`: el bloque rompe a propósito `purgar_posicion` con un `create or replace` de parámetros **sin nombre** sobre una función cuyos parámetros sí lo tienen |
| **75** `:3644` | **0098** | `funciones_security_definer_abiertas_a_anon=[prospecto_toque_marca_prospecto]` — ver el ALTO siguiente |

Las cinco primeras son de bloques **escritos en este delta**, y las tres primeras
no pueden haber pasado nunca en ningún sitio: violan restricciones que existen
desde la 0029 y la 0158.

**Consecuencia.** `migraciones_verificadas.test.ts` da por comprobadas 0150,
0151, 0153, 0162 y 0165 porque un **título** de bloque las nombra
(`:39-42`: la prueba lee títulos, no resultados). O sea que el repo afirma, en
verde, que están verificadas cinco migraciones cuya verificación aborta antes de
medir nada. Y el commit de merge del PR #39 escribe «Migraciones 0150-0165 ya
aplicadas y **verificadas** en producción». Para este rubro eso es lo peor que
puede pasar: las restricciones nuevas son buenas y la afirmación de que se
comprobaron no se sostiene. El precedente está escrito en la cabecera del propio
workflow: este job existe porque los bloques «se pegaban a mano cuando alguien se
acordaba», y su primera corrida encontró cuatro rotos.

**Causa raíz probable.** Dos ramas (`escala-dashboard` y `aud-p2`) escribieron
bloques y migraciones el mismo día, cada una contra el esquema que ella conocía;
al fusionarlas, las restricciones de una invalidaron las siembras de la otra, y
el rojo del job no bloquea el merge.

---

### [ALTO] `0167` mete la única SECURITY DEFINER del esquema ejecutable por `anon`, y su `search_path` no nombra `pg_temp` — el patrón exacto que la 0158 declaró hueco nueve migraciones antes

`supabase/migrations/0167_prospectos_listado.sql:79-100` (la función, sin un solo
`revoke` en todo el archivo) · `supabase/migrations/0158_integridad_fiscal.sql:302-309`
(la forma correcta, con su razón escrita) · `:715-723` (la regla de `pg_temp`)

**Escenario, con valores** (corrido). Sobre el catálogo real:

```
proname                          prosecdef  proconfig                 anon-puede-EXECUTE
prospecto_toque_marca_prospecto  t          {search_path=public}      t     ← única
borrado_de_dinero_prohibido      t          {…, pg_temp}              f
(otras 23 DEFINER)               t          {…, pg_temp}              f
```

`CREATE FUNCTION` concede `EXECUTE` a `PUBLIC` por defecto y la 0167 no lo
revoca. Resultado directo, medido: el bloque B de `capa1_auditoria_estatica.sql`
imprime `DEFINER_ANON abiertas_sin_exencion=1` (esperado 0) y el bloque 75 de
`verificaciones.sql` imprime
`funciones_security_definer_abiertas_a_anon=[prospecto_toque_marca_prospecto]`
(esperado vacío). Los dos **fallan el job**.

La explotación directa es acotada —una función que devuelve `trigger` no se
puede invocar suelta— y el cuerpo califica `public.prospecto`, así que el
`pg_temp` implícito no le cambia la tabla. El daño no es ese: es que **la
auditoría estática de aislamiento, que es lo que vigila que no aparezca una
DEFINER abierta el día que sí importe, está en rojo por esta**, y un rojo
crónico es un rojo que se deja de leer.

**Consecuencia.** El repo tiene dos bloques dedicados a este invariante desde la
0054/0098 —la fuga más cara que ha tenido este producto salió de ahí— y hoy los
dos gritan por una función de marcaje del embudo de ventas. La próxima DEFINER
abierta, la que sí toque dinero, va a llegar a una consola que ya venía roja.

**Causa raíz probable.** `security definer` se copió del patrón de las purgas
(que sí revocan) sin copiar el `revoke` ni el `pg_temp`; nadie corrió el job
antes de mergear.

---

### [ALTO] El `encargado` sigue leyendo y **escribiendo** `viaje.anticipo` por PostgREST — la 0158 le quitó el DELETE a `viaje` pero le dejó la policy de flota, y el candado nuevo sólo muerde *después* de liquidar (REINCIDENTE)

`supabase/migrations/0158_integridad_fiscal.sql:240-261` (recrea
`tenant_data_select/insert/update` sobre `viaje` con la regla `tenant_id = any(...)
or is_superadmin()`, **sin** `ve_finanzas()`) · `:373-378` (el trigger, que sólo
mira si ya existe la liquidación) · `src/lib/auth/visibilidad.ts:41`
(`encargado: ['operacion']`)

**Escenario, con valores** (corrido, con impersonación real). Flota A, viaje V
`abierto` con `anticipo = 20000.00` e `ingreso_flete = 45000.00`. `app_user` con
`rol = 'encargado'` de esa flota:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true);
select count(*), max(anticipo) from viaje where tenant_id = '<A>';   -- 1, 20000.00
update viaje set anticipo = 2000 where id = '<V>';                    -- PASA
```

Salida literal del bloque: `ENCARGADO viajes_leidos=1 anticipo_leido/queda=2000.00
update_paso=t`. Ni `viaje_anticipo_no_negativo` (0070), ni
`trg_viaje_no_tras_liquidar` (que sólo dispara si ya hay fila en `liquidacion`),
ni una línea en `bitacora_auditoria`: nunca pasó por la app.

**Consecuencia.** El jefe de tráfico —el rol que existe precisamente para no ver
finanzas— lee el anticipo y el ingreso de flete de toda la flota, y puede mover
el anticipo de cualquier viaje **antes** de que se cierre, que es justo cuando
cambiarlo cambia el resultado: el cuadre siguiente calcula
`diferencia = round2(2000 − 18500) = −16500` y la liquidación sale con la leyenda
«El operador puso $16,500.00 de su bolsa». El contralor cruza su PDF contra una
cifra que otro rol movió, y el único rastro es que los números ya no cuadran.

**Causa raíz probable.** La misma que en la c3, y la 0158 la rozó sin cerrarla:
el dinero y la operación viven en la misma fila y una policy de fila no separa
columnas. La 0158 partió las policies por **verbo** (select/insert/update) cuando
lo que hacía falta era partirlas por **columna** — o sacar `anticipo` e
`ingreso_flete` de `viaje`.

---

### [ALTO] «Una factura cancelada no tiene pagos» es un invariante que sólo vive en TypeScript, y se comprueba con un `count` fuera de transacción: la base acepta el estado sin decir nada

`src/lib/likida/facturacion_escritura.ts:589-595` (el `count` y su `throw`) ·
`:597-600` (el UPDATE, en otra petición) · `supabase/migrations/0159_rpcs_atomicas.sql:114-115`
(el RPC del abono sí rechaza `cancelada`, pero con la factura ya trabada)

**Escenario, con valores** (corrido). El estado ilegal entra a la base sin
resistencia:

```sql
insert into factura_emitida (… total 11600, estatus 'emitida') → F
insert into pago_recibido   (… factura_id F, monto 5000)
update factura_emitida set estatus = 'cancelada' where id = F;   -- PASA
```

Salida literal: `CANCELADA-CON-PAGO entra=t saldo=6600.00`. No hay CHECK, ni
trigger, ni índice que lo impida.

Y la carrera que lo produce sin que nadie haga nada raro: `cancelarFactura`
cuenta los pagos (`:589-591`) **sin trabar la factura**; entre ese `count` y su
`UPDATE` (`:597-600`) cabe un `registrar_pago_tx` que toma el `for update`, ve
`estatus='emitida'`, inserta un abono parcial de $5,000 y confirma. El `UPDATE`
de cancelación llega después, encuentra `estatus='emitida'` —el abono fue
parcial, así que la factura no pasó a `pagada`— y la cancela. Dos pestañas del
mismo contralor bastan.

**Consecuencia.** Quedan $5,000 registrados como cobrados contra un CFDI
cancelado. `factura_saldo.vencida` excluye las canceladas (`0161:121`), así que
ese dinero desaparece de la cartera y de la antigüedad; la conciliación contra el
banco no cuadra y el único sitio donde aparece es la tabla `pago_recibido`. Es
exactamente el daño que el mensaje de `:594` dice querer evitar («cancelarla de
un clic dejaría cobros contra nada»), escrito en la capa que no lo puede
garantizar.

**Causa raíz probable.** La 0159 movió a la base la decisión del **abono** y dejó
en TS la de la **cancelación**; el invariante es entre dos tablas y ninguna de
las dos mitades lo cierra sola.

---

### [ALTO] `similitud_icp_pct` compara SCIAN de 3 dígitos y la columna guarda 6: el techo real es **60** y dos chips del Cerebro no pueden devolver nada (REINCIDENTE, ahora medido contra la base)

`supabase/migrations/0140_prospecto_investigacion_profunda.sql:59`
(`scian in ('484','485','488')`) · `src/lib/admin/prospectos-mapa.ts:139`
(`/^(48[1235-9]|49)/` — lectura por prefijo, o sea SCIAN largo) ·
`src/app/admin/mapa-prospectos/cerebro.tsx:861-866` (los chips `≥65%` y `≥85%`)

**Escenario, con valores** (corrido). Dos filas, idénticas salvo el SCIAN:

```
empresa                 scian     vacante                                     unidades  →  similitud  necesidad
TRANSPORTES MONTERREY   484121    Coordinador de Liquidaciones de flota        45           60         75
TRANSPORTES 3           484       Coordinador de Liquidaciones de flota        45          100         75
```

La expresión viva, leída del catálogo (`pg_get_expr` sobre `attgenerated='s'`),
confirma el `= ANY (ARRAY['484','485','488'])` literal. Con SCIAN de seis dígitos
el máximo alcanzable es 0 + 25 + 20 + 15 = **60**, por debajo de los dos umbrales
que el panel ofrece.

**Consecuencia.** El vendedor abre el Cerebro, marca «Similitud ICP mínima ≥65%»
para ver a sus mejores prospectos, y el mapa se vacía. No dice «no hay»: dice que
de 33,065 empresas ninguna se parece al cliente ideal. La misma pantalla explica,
en el `title` del filtro, que el criterio es «SCIAN 484/485/488 +40»
(`prospectos-mapa.ts:289`) — el rótulo describe una fórmula que ningún dato real
puede satisfacer.

**Causa raíz probable.** La fórmula se escribió contra la clasificación de tres
dígitos (subsector) y la columna se llenó con la de seis (clase de actividad).
Nada compara las dos porque la columna es GENERADA y ningún test de TS puede
evaluarla — ver el MEDIO siguiente.

---

### [ALTO] `scripts/demo-5k.sql` no ha podido correr nunca: muere en su primer `insert` por un `--` dentro de un literal JSON, y salvado eso siembra 8,653 liquidaciones con **15** comprobantes antes de abortar contra una FK

`scripts/demo-5k.sql:48` (el comentario dentro del jsonb) · `:232`
(`n0 int := 0; n1 int := 30000; -- ← EDITAR por tramo`) · `:161-165` (el bloque
que numera los viajes) · `:585` (el `viaje_id` inventado de los huérfanos) ·
`docs/auditoria-18/datos-c3.md:351-353` (la afirmación que esto refuta)

**Escenario, con valores** (corrido, sobre el clúster con las 163 migraciones).
`psql -v ON_ERROR_STOP=1 -f scripts/demo-5k.sql`, tres paredes en fila:

1. **Statement 1.** La línea 48 es
   `{"concepto":"caseta","topeMonto":5000},   -- una línea del estado del TAG por viaje`
   y está **dentro** del literal `'…'::jsonb` de `tenant.config`. Un `--` no es
   comentario dentro de una cadena: Postgres corta con
   `ERROR: invalid input syntax for type json … Token "-" is invalid`. El guion
   no siembra ni el tenant. Está así desde su primer commit (`c1c036c`, 22-ago),
   así que **la copia versionada nunca ha corrido**; lo que sembró producción fue
   otro texto, pegado a mano.
2. **Los comprobantes.** Salvando esa línea en una copia, el guion avanza y deja:
   `viaje = 8,924 · liquidacion = 8,653 · operador = 7,500 · gasto = 15`.
   Quince. La causa es aritmética y se lee del catálogo: el bloque 4 (`:161-165`)
   numera los viajes `'dddddddd-0005-4000-8000-' || lpad(n,12,'0')` con
   **n de 60,001 a 87,970**, y el bloque 5 —el único que siembra diésel, casetas,
   alimentación, hospedaje y facturas— filtra
   `n between n0 and n1` con `n0 := 0; n1 := 30000` (`:232`). La intersección son
   **4** viajes de 8,924. Peor: el propio comentario (`:222-223`) instruye a
   correrlo «una vez por tramo … p.ej. 0–30000, 30001–60000, 60001–90000», y de
   esos tres tramos **dos están vacíos por construcción**; cada uno imprime su
   `raise notice 'TPS gastos tramo %-%: %'` y se ve idéntico a uno que funcionó.
3. **El aborto.** En `:585` los huérfanos apuntan a
   `'dddddddd-0005-4000-8000-' || lpad(6000 + i, 12, '0')` — viajes 6,001 a
   6,042, que no existen (empiezan en 60,001). El guion muere con
   `insert or update on table "comprobante_huerfano" violates foreign key
   constraint … Key (viaje_id)=(dddddddd-0005-4000-8000-000000006013) is not
   present in table "viaje"`. Y como `psql` confirma por sentencia, **lo anterior
   ya está comprometido**: queda un tenant demo a medias, con 7,500 operadores y
   sin comprobantes.

**Consecuencia.** El día que haya que reconstruir el tenant del vídeo —proyecto
nuevo de Supabase, un reset, una segunda flota de demostración— el guion no
arranca; y si alguien le quita el comentario para desbloquearlo, obtiene un panel
con 8,653 liquidaciones y quince comprobantes: un producto de cuadre de
comprobantes enseñado sin comprobantes. Refuta además, con medición, lo que mi
propio reporte de la c3 dio por bueno («el demo de 5,000 camiones sigue cargando
con las restricciones nuevas puestas», `datos-c3.md:351-353`): esa lectura miró
la aritmética de `:405` y no ejecutó el archivo.

**Causa raíz probable.** El guion se escribió por bloques que se pegaban de uno
en uno en el editor SQL de Supabase, editando `n0/n1` a mano entre pegada y
pegada; la versión que quedó en el repo es la unión de esas pegadas con los
valores de la primera, y nunca se corrió de punta a punta. Cae entre dos rubros
—no es una migración— pero es lo único que llena este esquema, y es lo que un
auditor de datos tiene que ejecutar antes de afirmar que el esquema aguanta.

---

### [MEDIO] La exención de 0140/0142/0143 dice que el score «se prueba en TS»; hoy tengo la medición que demuestra que la premisa es falsa, y sigue en pie (REINCIDENTE)

`src/lib/likida/migraciones_verificadas.test.ts:63-73` (el bloque de exenciones y
su razón) · `:104-109` (la nota que documenta la pérdida del bloque 111)

**Escenario, con valores.** La razón escrita dice, textual: *«si el cálculo del
score cambia, es lógica de negocio del embudo, probada en TS»*. Las tres columnas
son `int generated always as (…) stored`: **Postgres las calcula y nadie las
escribe**, así que ningún test de TypeScript las puede evaluar. El bloque de tres
líneas que la c3 dijo que habría bastado lo corrí hoy y tardó doscientos
milisegundos: insertar `TRANSPORTES MONTERREY` con `scian='484121'` y afirmar
`similitud_icp_pct = 100` se pone rojo con `60`. Los dos defectos que ese bloque
habría cazado llevan **cuatro días** abiertos.

**Consecuencia.** El criterio que el propio archivo declara —«hace falta bloque
cuando la migración crea una garantía que la base es la ÚNICA que puede
demostrar» (`:47-50`)— aplica aquí de lleno y la excepción lo contradice por
escrito. Mientras siga, cualquier cambio a esas tres fórmulas entra sin red.

**Causa raíz probable.** El criterio de EXENTAS se aplicó al *efecto* del dato
(«un score mal sólo reordena la lista») en vez de a la *sede del cálculo* (una
expresión que vive en el motor de la base y en ningún otro sitio).

---

### [MEDIO] El corredor de la batería degrada fallos reales a «SIN CALIFICAR»: dos bloques imprimen hoy el valor que ellos mismos declaran incorrecto y el job no los cuenta

`scripts/ci/correr-verificaciones.mjs` (el emparejador clave/valor) ·
`supabase/verificaciones.sql:1531` · `:1601`

**Escenario, con valores** (corrido). De 123 bloques, **17** vuelven «SIN
CALIFICAR (N claves detectadas vs M valores esperados) — revisar a mano». Trece
de esos diecisiete traen todos sus valores buenos. **Dos no:**

```
:1531  INDICE_FACTURACION  el-planeador-usa-el-indice=f  …  (esperado true)
:1601  INDICES_PAGINACION  el-planeador-los-usa=2/9      …  (esperado 9/9)
```

El primero dice que la consulta de autofacturación **no** usa el índice que se
creó para ella (el plan cae en `Index Scan using gasto_created_at_idx` con
`Filter: cfdi_uuid IS NULL AND ocr_extra IS NOT NULL`). El segundo dice que
**siete de los nueve** índices `*_paginacion_idx` no los elige el planeador:
`gasto`, `viaje`, `liquidacion`, `llm_costo`, `pod` e `incidencia` paginan por
`Sort` sobre un bitmap scan. Los dos son exactamente «índices que nadie usa», y
los dos pasan por la puerta sin ponerla roja porque el corredor no supo parear
sus claves.

**Consecuencia.** El repo tiene la medición y no la ve. Nueve índices que se
crearon para paginar cobran su costo de escritura en cada INSERT de las tablas
más calientes y siete no sirven a nadie — a 50k viajes/mes eso es mantenimiento
de índice pagado por nada, y a la vez la consulta que sí necesitaba el suyo va
por filtro.

**Causa raíz probable.** El bloque emite más claves que valores en su
`(esperado …)`; el corredor sólo sabe calificar cuando ambas listas coinciden en
longitud, y su modo degradado —«revisar a mano»— no falla el job.

---

### [MEDIO] El delta del Cerebro pierde filas para siempre: `clock_timestamp()` sella la hora de la escritura, no la de su commit, y la marca del latido avanza con lo que ya se ve

`supabase/migrations/0167_prospectos_listado.sql:58-64` (la razón escrita:
«el reloj de pared deja la marca más cerca del momento real del cambio, que es lo
que estrecha la ventana») · `src/lib/admin/prospectos-mapa.ts:625` (`gt('updated_at', desde)`)
· `:643-644` (la marca = máximo de lo leído)

**Escenario, con valores.** 10:00:00 — el enriquecedor abre una transacción y
toca 5,000 prospectos; el trigger sella P-1 con `updated_at = 10:00:00.100` y va
avanzando hasta 10:00:30, cuando confirma. 10:00:10 — un latido corre; la
transacción del enriquecedor sigue abierta, así que P-1 es invisible, pero un
vendedor acaba de mover P-2 y sí está confirmado: el latido devuelve P-2 y guarda
`marca = 10:00:09`. 10:00:35 — el latido siguiente pregunta
`updated_at > 10:00:09`. P-1 ya está confirmado, pero su sello dice
**10:00:00.100 < 10:00:09**: no vuelve. Ni en ese latido ni en ninguno. Su giro
nuevo, su historia y su primer toque redactado no aparecen en ningún Cerebro
abierto hasta que alguien recargue la página entera.

La razón escrita en la migración está al revés: la ventana no la estrecha el
reloj de pared, **la ventana mide lo que dure la transacción más larga que
escriba en paralelo**. `now()` habría sellado las 5,000 con la misma hora
(pérdida total o nula, todo o nada); `clock_timestamp()` las reparte, así que
sobreviven las sellizadas después de la marca y se pierden las de antes — un mapa
**parcialmente** actualizado, que es peor, porque se ve correcto.

**Consecuencia.** Es el defecto que la propia 0167 vino a cerrar («un mapa mudo
se ve exactamente igual que un mapa al día»), reducido de tamaño pero no
eliminado, y ahora sin la señal que lo delataba: antes el mapa no se movía nunca;
ahora se mueve casi siempre. No toca dinero: es el embudo de ventas de Likida.

**Causa raíz probable.** Un delta por marca de tiempo necesita una secuencia
monótona **al commit** (un `xmin`/`txid_snapshot`, o una tabla de cambios), no la
hora en que se escribió la fila.

---

### [MEDIO] `viaje` carga 20 índices y al menos cinco son redundantes por construcción — incluido el par de folio que la 0166 identificó como bug y arregló sólo para `factura_emitida`

`supabase/migrations/0157_cursor_viajes_y_analyze.sql:10-13` (la afirmación:
«el único índice de `viaje` por tenant es `idx_viaje_tenant` (tenant_id,
estatus)») · `supabase/migrations/0158_integridad_fiscal.sql:632-634` (crea el
segundo único de folio en `viaje` **y** en `factura_emitida`) ·
`supabase/migrations/0166_factura_serie.sql:28-34` (donde se nombra el problema:
«esta migración sustituye LOS DOS»)

**Escenario, con valores** (corrido, `pg_indexes` sobre `viaje`):

| Índice | Definición | Lo contiene |
|---|---|---|
| `viaje_reciente_idx` | `(tenant_id, created_at DESC)` | `viaje_tenant_created_id_idx (tenant_id, created_at DESC, id DESC)` — 0157 |
| `viaje_tenant_fecha_inicio_idx` | `(tenant_id, fecha_inicio)` | `viaje_registro_keyset_idx (tenant_id, fecha_inicio DESC NULLS LAST, created_at DESC, id DESC)` — 0154 |
| `viaje_cliente_id_idx` | `(cliente_id)` | `viaje_cliente_idx (cliente_id) WHERE cliente_id IS NOT NULL` |
| `viaje_unidad_id_idx` | `(unidad_id)` | `viaje_unidad_idx (unidad_id) WHERE unidad_id IS NOT NULL` |
| `viaje_folio_unico` | `(tenant_id, folio)` | `viaje_folio_upper_uidx (tenant_id, upper(folio)) WHERE folio IS NOT NULL` |

La cabecera de la 0157 es factualmente falsa: `viaje_reciente_idx (tenant_id,
created_at DESC)` ya existía y ya servía el `order by created_at desc` del
cursor; el índice nuevo sólo le agrega el desempate por `id`. Y la 0166, que
diagnostica con precisión que tener **dos** índices únicos sobre el mismo folio es
el bug («la propuesta original no tenía a la vista» el segundo), lo arregla en
`factura_emitida` y deja el par intacto en `viaje`, donde la 0158 lo creó en el
mismo bucle.

**Consecuencia.** A 50k viajes/mes son 600,000 filas al año × 20 entradas de
índice por INSERT, cinco de ellas sin lector. No corrompe nada; encarece la
escritura de la tabla más caliente y deja al equipo que mantiene esto sin saber
cuál de cada par es el que manda el día que haya que tocar uno.

**Causa raíz probable.** Cada migración añadió su índice mirando su consulta, y
la única regla escrita (`REGLAS-ESCALA.md §4`, «sólo si un EXPLAIN lo justifica»)
gobierna el alta y no la baja.

---

### [BAJO] `registrar_pago_tx` se quedó con `current_date` (UTC) para la fecha del abono — la 0161 arregló el default de la columna y no el RPC, que hoy es el único escritor

`supabase/migrations/0159_rpcs_atomicas.sql:127`
(`coalesce(p_fecha, current_date)`) ·
`supabase/migrations/0161_fechas_locales.sql:26-28` («`pago_recibido` es la peor
de las cuatro — es dinero que ya entró, y la flota lo declara en el año en que la
fila dice que entró») · `:136-137` (el default sí corregido)

**Escenario, con valores** (corrido). El default de la columna, leído del
catálogo, es `((now() AT TIME ZONE 'America/Mexico_City'))::date`. El RPC nunca
lo usa: pasa `current_date` explícito. A las 19:00 del 31-dic-2026 en México
(01:00 UTC del 1-ene-2027):

```
UTC=2027-01-01   MX=2026-12-31
```

Un abono registrado sin `p_fecha` se guarda en el **ejercicio siguiente**.

**Consecuencia.** Hoy es una bomba desarmada: `validarPago`
(`facturacion_escritura.ts:201-202`) exige una fecha válida y siempre la manda,
así que la rama del `coalesce` no la toca ningún camino vivo. Lo que la mantiene
abierta es la firma: `p_fecha` acepta NULL, el RPC es la frontera única del
abono, y el día que lo llame un script de conciliación o un import el ingreso
cambia de año fiscal sin avisar. Es también una contradicción escrita entre dos
migraciones consecutivas del mismo delta.

**Causa raíz probable.** La 0161 barrió `current_date` por columnas (los cuatro
`alter column … set default`) y no por código: `grep -n current_date` sobre las
migraciones nuevas deja esta línea a la vista.

---

### [BAJO] El barrido previo de la 0164 no cubre el índice que la propia migración crea: un duplicado de código de barras se estrella con un 23505 sin contexto, que es lo que la migración dice evitar

`supabase/migrations/0164_dedup_fotos_y_huerfanos.sql:142-159` (el barrido, que
agrupa por `coalesce(folio_portal, codigo_barras)`) · `:165-171` (los **dos**
índices, uno por columna) · `:58-61` (la promesa: «los índices únicos se crean
tras un barrido que FALLA RUIDOSO … preferimos no aplicar a aplicar dejando fuera
del índice filas que son justamente las que había que ver»)

**Escenario, con valores.** Dos filas en la bandeja del mismo viaje V de la flota A:

```
fila 1:  folio_portal = NULL,      codigo_barras = '7501234567890'
fila 2:  folio_portal = 'CAS-77',  codigo_barras = '7501234567890'
```

El barrido agrupa por `coalesce(folio_portal, codigo_barras)`: la primera cae en
el grupo `'7501234567890'`, la segunda en `'CAS-77'`. Ningún grupo tiene dos
filas, `msg` queda vacío y el barrido deja pasar. Acto seguido,
`create unique index uq_codigo_pendiente_barras on codigo_pendiente (tenant_id,
viaje_id, codigo_barras)` encuentra las dos y la migración muere con
`ERROR: could not create unique index … Key (…)=(…, 7501234567890) is duplicated`
— sin la tabla, sin el motivo y sin los ids que el bloque promete imprimir. Es
además el mismo par que el comentario de `:161-164` describe («el mismo papel
leído dos veces, una con el EAN decodificado y otra sin él»), sólo que con las
columnas al revés.

**Consecuencia.** Para el que aplique la migración a una base con datos: un fallo
opaco donde había un mensaje preparado. La base está en cero, así que hoy no
muerde; muerde el día que se aplique a una base con bandeja.

**Causa raíz probable.** El barrido se escribió con una llave (el `coalesce`) y
los índices con dos; ninguna de las dos formas cubre a la otra.

---

### [BAJO] Cuatro reincidentes del embudo, verificados uno por uno y sin cambio

- **`CRITERIO_SCORES.necesidad` describe una fórmula derogada dos veces.**
  `src/lib/admin/prospectos-mapa.ts:290` dice «auxiliar administrativo +50»; la
  expresión viva en el catálogo exige además
  `viaje|flota|diesel|diésel|combustible|caseta|embarque|operativ|mesa de control`
  y excluye `liquidación de pagos|compensación`. El `comment on column` sí está al
  día; la copia que un humano lee, no.
- **`mensaje_linkedin` (0141) sigue sin escritor** —`grep -rn "mensaje_linkedin" src/`
  devuelve una sola línea y es el texto de su exención— **y fuera de
  `prospecto_mensajes_coherentes`** (`0129:22-24`), que sólo mira `mensaje_wa` y
  `mensaje_correo`: un LinkedIn redactado sin `mensajes_generados_en` no rebota.
- **`giroDe` sin el SCIAN en el redactor.**
  `src/app/api/admin/mapa-prospectos/mensaje/route.ts:71` sigue con tres
  argumentos; los otros tres llamadores (`prospectos-mapa.ts:253,545,764`) pasan
  `p.scian`. El mensaje que sale al modelo se escribe con un giro peor informado
  que el que la ficha enseña.
- **`num_unidades` sin techo** (`0140:47-48`). Medido: `num_unidades = 200000000`
  no rebota en su CHECK sino 18 líneas más abajo, en `viajes_mes_estimado`
  (`0140:76`, `num_unidades * 18` sobre `int`), con `22003 integer out of range`
  — un error que no nombra la columna que el enriquecedor llenó mal.

---

### [BAJO] El conteo de FK de la c3 tenía el denominador mal en las dos direcciones

Está desarrollado arriba, en «El conteo». Lo apunto como hallazgo porque **la
subida de nota de la c3 se apoyó en ese número**: el numerador (38) era correcto,
el denominador no. La cifra buena, leída del catálogo, es **38 de 42** bajo la
regla que la c3 declaró, y las dos relaciones que faltaban de nombrar son
`cola_aprobacion.prospecto_id → prospecto` (`0117:46`) y
`prospecto.duplicado_de → prospecto` (`0139:55`).

---

## Lo que revisé y está bien

- **La trampa del foco sobre la 0166 no existe: `serie` NULL no abre el candado.**
  El índice vivo es, leído del catálogo,
  `(tenant_id, upper(COALESCE(serie,'')), upper(folio), EXTRACT(year FROM fecha))
  WHERE folio IS NOT NULL`. El `coalesce` es exactamente lo que impide que las
  filas sin serie —todas las de hoy— queden fuera. Y el **bloque 138 pasa**
  (corrido): `sin-serie-repetida-rebota=t`, `mismo-folio-otro-anio=t`,
  `mayusculas-siguen-chocando=t`, `indice-0158-retirado=t`. La 0166 también
  conserva el **nombre** `factura_folio_unico` a propósito, porque
  `traducirChoque` (`facturacion_escritura.ts:316`) discrimina el 23505 por él, y
  el mensaje al contralor cita la llave completa (serie, folio y ejercicio,
  `:300-304`). No hay pre-SELECT de folio en el TS: se apoya en el 23505, que es
  la forma correcta.
- **Los 22 agregados de 0150/0151/0152/0153/0154/0162, leídos uno por uno,
  filtran por `p_tenant` en todas las tablas que tocan**, incluidos los `join`
  (`0150:250-254`, `0150:317-330`, `0150:425-437`), y los 22 son INVOKER con
  `revoke`+`grant` (verificado en el catálogo). La preocupación del foco
  —«SECURITY DEFINER sin `tenant_id` en el WHERE»— no aplica: **no hay ninguna
  DEFINER entre ellos**.
- **Las 163 migraciones aplican limpias sobre base virgen** (corrido, una por una
  con `ON_ERROR_STOP=1`). Ninguna de las 18 nuevas rompe la secuencia.
- **La 0159 hace lo que dice, y el bloque 131 lo demuestra** (corrido, 16 claves,
  todas `t`): `parcial-entra`, `sobrepago-rebota`, `saldo-nunca-negativo`,
  `salda-y-marca-pagada`, `factura-ajena-rebota`, `reabrir-rebota-con-liq-viva`,
  `reabrir-archiva`, `liq-borrada`, `viaje-abierto`, `id-derivado-del-viaje`,
  `merge-conserva-hermanos`, `merge-profundo-agentes`, `llave-inventada-rebota`,
  `anon=f`. Intenté y **refuté** que `registrar_pago_tx` aceptara un monto
  negativo: `pago_monto_positivo` (0070) lo rebota antes.
- **Intenté y refuté que `reabrir_viaje_tx` chocara contra el trigger nuevo de la
  0158.** `borrado_de_dinero_prohibido` (`0158:280-286`) exime a todo rol que no
  sea `authenticated`/`anon`, y el RPC sólo está concedido a `service_role`
  (`0159:256-257`). El orden invertido (estatus primero, archivo y borrado
  después) es el arreglo correcto: el paso que puede rebotar por
  `uq_viaje_abierto_por_operador` va antes de tocar la liquidación.
- **Intenté y refuté que `factura_saas_metodo_coherente` (0163:113-114) tuviera el
  agujero del NULL.** `metodo_cobro` es `text not null default 'transferencia'`
  (`0057:27`), así que `(metodo_cobro='stripe') = (stripe_invoice_id is not null)`
  es total y no se puede satisfacer con un NULL. El bloque 135 pasa (corrido):
  `metodo_incoherente_rebota=t`, `price_viejo_resuelve=t`, `reserva_gana_una=t`.
- **Intenté y refuté que la 0161 hubiera reabierto la fuga de la vista
  `factura_saldo`.** El `create or replace view` lleva
  `with (security_invoker = true)` (`0161:104`) **y** un `alter view … set` de
  cinturón (`:131`); el bloque 33 (0054) pasa. La cabecera documenta que se
  comprobó al revés (escrita sin la cláusula, el bloque se puso rojo), que es la
  forma honesta de decirlo.
- **La 0158 hace lo que dice sobre el borrado y los dominios**: bloque 130
  (`:6747`) pasa con las once formas de ataque. `pago_recibido → factura_emitida`
  quedó en `NO ACTION` y no en `RESTRICT` por la razón correcta (`0158:95-101`):
  `RESTRICT` habría reventado el `delete from tenant` de una baja de cuenta.
- **La 0164 cierra el reproceso.** Bloque 136 (`:7385`) pasa. `uq_gasto_wa_message_id`
  existe con el nombre exacto que `processor.ts` discrimina, y los dos candados
  (`img_hash` y `wamid`) son complementarios y están escritos como tales.
- **`liquidacion_historico` (0159:159-188) está bien planteada**: deny-all (RLS
  activo, cero policies — verificado en el catálogo), `viaje_id` **sin FK a
  propósito y dicho** («el histórico tiene que sobrevivir aunque el viaje se
  elimine»), e índice `(tenant_id, viaje_id, archivada_en desc)`.
- **`cron_latido`, `storage_limpieza_cursor` y `storage_huerfano_candidato`** son
  las otras tres tablas nuevas: las tres con RLS activo y sin policies
  (verificado), ninguna con `tenant_id` que atribuir mal.
- **El `pg_temp` de las cuatro funciones de RLS está puesto** (`0158:720-723`), y
  el bloque 49 lo comprueba con falsificación incluida: `CON pg_temp:
  administra_flota, gasto_no_tras_liquidar, get_user_tenant_ids, is_superadmin,
  ve_finanzas · SIN pg_temp: —`.

---

## Lo que NO alcancé a revisar

- **La base es un Postgres 16.13 recién parido, no producción.** Todo lo que
  medí sale de aplicar las 163 migraciones sobre un clúster vacío con el andamio
  de CI, que reproduce los roles y los GRANT de Supabase pero **no** es Supabase:
  el `storage` real, PostgREST y el `BYPASSRLS` de `service_role` están simulados
  (documentado en `andamio_ci.sql`). Producción corre 17.x. Nada de lo que
  encontré depende de la versión —23505, CHECK, `has_function_privilege` y
  `pg_get_expr` se comportan igual— pero **un catálogo real puede traer objetos
  que ninguna migración creó** (índices puestos a mano, policies del panel de
  Supabase), y eso no lo puedo ver desde aquí.
- **Cero filas.** Todos los escenarios los sembré yo. No puedo decir si
  `prospecto.scian` de verdad trae seis dígitos en las 33,065 filas de
  producción: lo deduzco de que el repo la lee por prefijo
  (`prospectos-mapa.ts:139`) y de que la única prueba que la fija usa `'484121'`
  (`prospectos-mapa-listado.test.ts:25`). Un `select distinct length(scian) from
  prospecto` lo cierra en un segundo.
- **No corrí `npm test` ni `tsc`**: la compuerta de esta ronda ya lo hizo y mi
  rubro no lo necesita. Lo que sí implica es que **no comprobé si las pruebas de
  equivalencia JS-vs-RPC (`espejo_0152.pruebas.ts`, `analytics_rpc_0150.fixture.ts`)
  de verdad comparan** — el MAPA lo pedía y lo dejo sin tocar; lo que sí puedo
  afirmar es que su gemela de base, el bloque 122, no corre.
- **Los 17 bloques «SIN CALIFICAR»**: leí los diecisiete mensajes y clasifiqué
  dos como fallos reales escondidos, pero no reconstruí la expectativa de cada uno
  contra su cuerpo. Puede haber más de dos.
- **Los `on delete` de las 38 compuestas contra un `delete from tenant` real**:
  las leí una por una en la 0145 y coinciden con su FK simple, pero no ejecuté el
  borrado de una flota con datos en las 54 tablas a la vez, que es el único
  momento en que todas se disparan juntas.
- **`supabase/seed.sql` y `scripts/carga-15k.sql`** siguen sin ejecutarse contra
  las restricciones nuevas. `scripts/demo-5k.sql` **sí lo corrí** (ver el ALTO), y
  ninguna de las 163 migraciones lo rechazó por dominio: sus tres paredes son
  suyas, no del esquema. Su `cfdi_uuid` es `md5(…)::uuid::text` (`:244`), que
  Postgres rinde en minúsculas, así que `gasto_cfdi_uuid_minuscula` no le muerde.
  Lo que **no** llegué a ver es el guion **completo**: murió en `:605`, así que
  los bloques posteriores (consolidado, desglose de peaje, incidencias, lo que
  venga después) siguen sin ejecutarse ni una vez.
