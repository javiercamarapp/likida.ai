# Modelo de datos y esquema — auditoría 17 (pase 2)

**Nota: 6/10** (antes 7). Razón del movimiento: **se descuidó y bajó**. Ninguno de
los diez hallazgos del pase 1 se tocó (el diff `94c0733..HEAD` sobre
`src/lib/likida/repo.ts`, `src/lib/likida/cuadre/`, `src/types/` y
`src/lib/likida/consolidado.ts` está **vacío**), y las tres migraciones nuevas
dejaron la capa de comprobación peor de lo que estaba: la `0086` retiró un valor
del dominio de `app_user.rol` y con eso **mató tres bloques vivos de
`verificaciones.sql`** que nadie tocó (26, 28 y 30), mientras el borrado
deliberado de los bloques 54/55/56 se llevó por delante la única comprobación de
**dos garantías que siguen vivas**. La `0086` como SQL está bien hecha; lo que se
rompió es el aparato que dice qué garantías están probadas — y ese aparato sigue
en verde.

El riesgo mayor del rubro, hoy: **`migraciones_verificadas.test.ts` pasa (4/4,
corrido) afirmando que las migraciones `0045`, `0047` y `0050` están comprobadas
en `verificaciones.sql`, cuando sus tres bloques abortan hoy en la primera
sentencia con `23514`.** La pregunta "¿está cubierta la 00XX?" volvió a
responderse "creo que sí", que es literalmente el accidente que ese archivo
existe para impedir.

---

## Estado de los hallazgos del pase 1

Los diez siguen abiertos. Verificados uno por uno contra HEAD:

| # | Hallazgo del pase 1 | Estado | Evidencia |
|---|---|---|---|
| 1 | **[ALTO]** El gasto SIN FECHA se resta de un contador del que nunca formó parte | **REINCIDENTE** | `desde_db.ts:86-88` sigue con `(g.fecha?.slice(0,4) ?? anioEjercicio) === anioEjercicio`. `git diff 94c0733..HEAD -- src/lib/likida/cuadre/` vacío. |
| 2 | **[MEDIO]** `0082`/`0083`/`0085` borraron el `search_path` de `config_tenant_valida` | **REINCIDENTE** | `0085:17-21` sigue siendo `CREATE OR REPLACE … LANGUAGE plpgsql IMMUTABLE AS` sin cláusula `SET`, y es la última que la redefine (`grep config_tenant_valida supabase/migrations/`: nada después de la 0085). |
| 3 | **[MEDIO]** `cfdi_consolidado_linea`: "conciliada ⇒ gasto_id no nulo" solo en el comentario, y el `ON DELETE SET NULL` lo rompe | **REINCIDENTE** | `0076:57` y `:69-70` intactas; ninguna migración nueva añade el CHECK. |
| 4 | **[MEDIO]** El trigger de "nada se reescribe tras liquidar" deja fuera `concepto`, `forma_pago`, `clave_prod_serv`, y no tiene brazo de DELETE | **REINCIDENTE** | `0042:22-30` intacta. |
| 5 | **[MEDIO]** `guardar_liquidacion_tx`: el `ON CONFLICT DO UPDATE` no recomprueba el tenant | **REINCIDENTE** | `0021:37-50` intacta. |
| 6 | **[MEDIO]** La `0084` es SQL muerto | **REINCIDENTE** | `grep -rn sumar_combustible src/` devuelve **una** línea y sigue siendo la cadena dentro de `migraciones_verificadas.test.ts:57`. `repo.ts` no cambió. |
| 7 | **[MEDIO]** `liquidacion` no tiene el CHECK de cuadre que sí tienen las dos tablas de factura | **REINCIDENTE** | `0001:71-73` intacta; ninguna migración nueva la toca. |
| 8 | **[MEDIO]** Dos contadores del 15% con criterios distintos en el mismo turno | **REINCIDENTE** | `tools.ts:109` sigue siendo `getAcumuladoCombustible(ctx.tenantId, ejercicio)` sin el tercer argumento; `desde_db.ts:78` sí lo pasa. |
| 9 | **[BAJO]** Ninguna tabla nacida después de la `0028` adoptó la FK compuesta con `tenant_id` | **REINCIDENTE, y el único parche que había quedó inerte** | `pod` sigue con `viaje_id uuid not null references public.viaje(id)` simple (`0047:101`). La `0081` amarraba `(pod.tenant_id = tenant del viaje)` por RLS, y la **`0086:30` la dropea** (`drop policy if exists operador_sube_su_pod on public.pod`). Hoy el amarre no existe en ninguna parte del esquema: vive solo en `viajePropio()` (`operacion.ts:388`). Es exactamente "la aplicación se encarga". |
| 10 | **[BAJO]** `cfdi_consolidado_linea.gasto_id` es la FK sin índice que la `0071` acababa de eliminar | **REINCIDENTE** | `0076:78-85` sigue creando dos índices, ninguno sobre `gasto_id`. |

Nota sobre el #9: la nota del pase 1 subió porque `operador_sube_su_pod` quedó
amarrada en la `0081`. Esa policy ya no existe. No es una regresión de permisos
—un `create policy` permisivo solo *añade* un camino, y el camino (la sesión del
chofer) desapareció—, pero sí borra el único sitio del esquema donde alguien
llegó a escribir la relación "un POD vive en la flota de su viaje".

---

## Hallazgos

### [ALTO] Tres bloques de `verificaciones.sql` abortan hoy en su primer INSERT, y el test los sigue contando como comprobación de las migs. 0045/0047/0050

`supabase/verificaciones.sql:1005-1006` · `:1103-1104` · `:1201-1202` ·
`supabase/migrations/0086_retirar_rol_operador.sql:96-98` ·
`src/lib/likida/migraciones_verificadas.test.ts:99-111`

La `0086` reduce el dominio a `check (rol in ('superadmin','flota_admin','contador','encargado'))`.
El autor borró los bloques 54/55/56 por esta razón exacta, y lo escribió
(`verificaciones.sql:2970-2977`: *"Los tres empezaban con `insert into app_user
(..., rol, ...) values (..., 'operador', ...)`, que ahora rebota"*). Quedaron
**otros tres** con el mismo INSERT, que nadie tocó:

- bloque **26** (mig. 0045), `:1005-1006`
- bloque **28** (mig. 0047), `:1103-1104`
- bloque **30** (mig. 0050), `:1201-1202`

**Escenario, valores exactos.** Pegar el bloque 30 en el SQL editor de Supabase,
tal como manda el encabezado del archivo (`:12-13`). Llega a:

```sql
insert into app_user (id, tenant_id, email, rol, operador_id)
  values ('<uuid>', '<tenant ZZZ>', 'zzz-verif-gps-chofer@likida.test', 'operador', '<op>');
```

→ `ERROR 23514: new row for relation "app_user" violates check constraint
"app_user_rol_dominio"`. El `do $$` aborta ahí. **Nunca llega** a la línea
`:1203-1204` (el `insert … 'contador'`) ni a `:1212`
(`select count(*) into n_cred from rastreo_credencial`), que es la mitad del
bloque que **no tiene nada que ver con el chofer**: el propio encabezado dice que
esa es *"la que separa 've dinero' de 'manda en la flota'"* — que el CONTADOR no
vea el token del proveedor de rastreo (`solo_admin_flota` con `administra_flota()`,
`0050:150-152`). Esa policy sigue viva y ya no hay forma de correr su
comprobación.

Y el bloque 26 es peor en otro sentido: aunque el INSERT pasara, verifica
`operador_ve_su_viaje` / `operador_ve_sus_gastos` / `operador_ve_sus_liquidaciones`,
las tres dropeadas por la `0086:26-28`. Su título sigue afirmando *"El chofer solo
ve sus propios viajes (mig. 0045)"*.

Mientras tanto `migraciones_verificadas.test.ts` **pasa** —lo corrí:
`4 passed`— porque su regla es que el número aparezca en un TÍTULO
(`:102`, `new RegExp('\\b0045\\b').test(TITULOS)`), no que el bloque corra.

**Consecuencia:** el repo tiene un artefacto que responde "¿qué garantías de la
base están probadas?" y hoy sobre-reporta tres, con el test en verde. El próximo
agente que lea "0047 tiene bloque 28" y construya encima —o el propio Javier
antes de un demo— cree que el aislamiento de `unidad`/`mantenimiento`/`incidencia`
está verificado contra la base real, y no lo está desde el 7-ago-2026.

**Causa raíz probable:** la 0086 se buscó a sí misma en `pg_policies` y `pg_depend`
(bien hecho) pero no se buscó en `verificaciones.sql`; y el test solo mira
títulos, así que no puede detectar un bloque que dejó de correr.

---

### [ALTO] El borrado de los bloques 54/55/56 se llevó la única comprobación de dos garantías que siguen vivas, y EXENTAS declara retiradas migraciones que no lo están

`supabase/verificaciones.sql:2970-2978` ·
`src/lib/likida/migraciones_verificadas.test.ts:80-82` ·
`supabase/migrations/0078_rls_chofer_sin_escritura.sql:50-57` ·
`supabase/migrations/0079_rls_chofer_sin_lectura_personal.sql:26-34`

La `0078` hace **dos** cosas distintas: (a) mete `not is_operador()` en siete
tablas —muerto, correcto retirarlo— y (b) **deja `tenant` de SOLO LECTURA por
RLS** (`drop policy tenant_self; create policy tenant_self on tenant for select`).
La (b) no tiene nada que ver con el rol operador: aplica a flota_admin, contador
y encargado igual. Lo mismo con la `0079`: `app_user` se quedó con **una sola
policy, `app_user_self`, y es `FOR SELECT`** — no hay ningún camino de UPDATE por
PostgREST (confirmado: `grep "policy" supabase/migrations/*.sql | grep app_user`
devuelve solo `app_user_self`, y la `0086:70-72` la vuelve a crear `for select`).

El bloque 54 era el único que probaba (b): impersonaba una sesión `authenticated`
y contaba `GET DIAGNOSTICS` sobre `update tenant set rfc = 'XAXX010101000'`,
esperando `tenant-update=0`. El bloque 55 era el único que probaba
`update app_user set operador_id = … → 0 filas` bajo sesión. **Los dos se
borraron.** El bloque 62 que los reemplaza (`:2999-3050`) no toca ni `tenant` ni
`app_user`: prueba el rebote del rol, `viaje` propio/ajeno y `ticket_mensaje`.

Verificado que no quedó otro sitio: los únicos `update tenant set` que quedan en
el archivo (`:278-292`, `:1411-1416`, `:2993`) corren **sin** `set local role
authenticated`, o sea como dueño, y no prueban RLS; `update app_user set` ya no
aparece ni una vez. El bloque 18 (barrido de catálogo) solo caza `qual = true` y
tablas sin RLS — un `for all` sobre `tenant` acotado por `get_user_tenant_ids()`
pasa su filtro sin problema.

Y las exenciones nuevas afirman lo contrario:
`migraciones_verificadas.test.ts:80` dice de la 0078 *"Retirada por la 0086…
el bloque 62 prueba la garantía más fuerte que la reemplaza"* y `:81` lo mismo de
la 0079. Media migración cada una.

**Escenario, valores exactos.** Hoy, con la llave publicable y el JWT de un
flota_admin de la flota A:

```
PATCH /rest/v1/tenant?id=eq.11111111-1111-1111-1111-111111111111
  {"rfc":"XAXX010101000","config":{"politica":[]}}
PATCH /rest/v1/app_user?id=eq.<su propio uuid>
  {"rol":"superadmin"}
```

Las dos devuelven `[]` (cero filas): la garantía se cumple. El problema es que
**nada del repo lo comprueba ya**, y las dos son de las que se rompen sin ruido —
basta que una migración futura recree `tenant_data`/`tenant_self` con el patrón
`for all` de la `0001:114` (que es exactamente lo que la `0078` tuvo que venir a
deshacer, y lo que la `0086:46-50` acaba de hacer para 19 tablas con ese mismo
`for all`). El segundo PATCH es escalada a superadmin: `is_superadmin()` lee
`app_user.rol`, y `lib/admin/negocio.ts` cruza todos los tenants.

**Consecuencia:** las dos únicas propiedades que impiden que un usuario del panel
reescriba la política de topes de su flota o se ascienda a superadmin quedaron sin
prueba, y con una razón escrita que dice que se retiraron. El día que se aflojen,
la compuerta sigue verde.

**Causa raíz probable:** los bloques se indexaron por "de qué rol hablan" en vez
de por "qué invariante prueban", y los tres del chofer probaban de paso
invariantes que no eran del chofer.

---

### [MEDIO] El índice parcial de la `0087` encabeza por una columna que la consulta nunca filtra, y su predicado parcial cubre casi toda la tabla

`supabase/migrations/0087_recordatorio_comprobacion.sql:19-21` ·
`src/lib/likida/recordatorio_comprobacion.ts:54-61` ·
`supabase/migrations/0058_confirmacion_de_viaje.sql:28-30`

La migración dice de sí misma *"Mismo patrón que `escalado_en` (0058)"*
(`0087:4`). En la forma del índice es el patrón **inverso**.

```sql
-- 0058 (el patrón bueno)
create index viaje_sin_aceptar_idx on public.viaje (avisado_en)
  where aceptado_en is null and escalado_en is null and estatus = 'abierto';

-- 0087
create index idx_viaje_recordatorio_pendiente on public.viaje (tenant_id, estatus, fecha_inicio)
  where recordatorio_comprobacion_en is null;
```

La consulta que tiene que servir (`recordatorio_comprobacion.ts:54-61`) es del
cron, cruza todos los tenants y **no filtra `tenant_id`**:

```
.in('estatus', ['abierto','en_cuadre'])
.is('recordatorio_comprobacion_en', null)
.not('fecha_inicio','is', null)
.lte('fecha_inicio', '2026-08-06')      -- ahora − 3 días
.limit(100)
```

Dos fallas encadenadas:

1. **La columna líder no está en el predicado.** Sin cualificador sobre
   `tenant_id`, un btree no puede posicionarse; `estatus` y `fecha_inicio`
   quedan como columnas 2 y 3 sin llave de entrada. Lo mejor que puede hacer el
   planner es recorrer el índice entero.
2. **El predicado parcial no recorta nada.** `recordatorio_comprobacion_en is
   null` es verdadero para **todo viaje que nunca cruzó los 3 días**, o sea la
   práctica totalidad del histórico: el índice parcial tiende al tamaño de la
   tabla. El de la `0058` sí recorta —`estatus='abierto' and aceptado_en is null
   and escalado_en is null`— a la cola viva, que son decenas de filas.

Comparar con el índice que ya existía desde la `0001:89`,
`idx_viaje_tenant on viaje(tenant_id, estatus)`: la `0087` añade un índice cuyo
prefijo es el de otro que ya estaba, para una consulta que ninguno de los dos
puede servir.

**Escenario con valores.** Flota con 3 años de operación, 40,000 viajes, de los
cuales 60 recibieron alguna vez el recordatorio. El cron corre cada hora:
`idx_viaje_recordatorio_pendiente` tiene 39,940 entradas, sin punto de entrada
→ `Seq Scan on viaje  (rows=40000)` filtrando por estatus y fecha, 24 veces al
día, para devolver 0–3 filas. El índice se paga en cada `insert`/`update` de
`viaje` y no se usa nunca.

**Consecuencia:** el camino que la `0087` existe para hacer barato es el único de
los dos crones (`escalar` vs. recordatorio) que barre la tabla completa, en la
misma corrida y sobre la misma tabla donde el otro sí usa su índice. Y la
exención del test (`migraciones_verificadas.test.ts:53`) no lo cubre: argumenta
—correctamente— la atomicidad del claim, y no dice una palabra del índice. El
precedente del repo para esto es el bloque 40, *"Los índices de paginación se
USAN, no solo existen"*.

**Causa raíz probable:** se copió la forma `(tenant_id, …)` de los índices del
panel (que sí filtran por tenant) a una consulta de cron que por diseño es
cross-tenant.

*(Refutado antes de escribirlo: el claim atómico SÍ está impuesto por la base.
`reclamarRecordatorio` (`:158-164`) hace `update viaje set
recordatorio_comprobacion_en = … where id = … and tenant_id = … and
recordatorio_comprobacion_en is null returning id`; en READ COMMITTED el segundo
UPDATE reevalúa el `WHERE` tras tomar el lock de fila y devuelve 0 filas. No
depende de que la aplicación se porte bien. No es hallazgo.)*

---

### [BAJO] El bloque 49 audita el `search_path` de dos funciones que la `0086` acaba de borrar, y su "corrida real" registrada ya no puede reproducirse

`supabase/verificaciones.sql:2686-2687` y `:2697`, `:2704`, `:2713` ·
`supabase/migrations/0086_retirar_rol_operador.sql:80-81`

El bloque 49 es el que prueba que las funciones de las que cuelga TODO el RLS
llevan `pg_temp` al final del `search_path`. Su lista literal incluye
`is_operador` y `get_user_operador_id`, que la `0086:80-81` dropea. Como el
`where p.proname in (…)` simplemente no encuentra filas, el bloque **no falla**:
degrada en silencio.

**Escenario:** correr el bloque 49 hoy. Sale `CON pg_temp: administra_flota,
gasto_no_tras_liquidar, get_user_tenant_ids, is_superadmin, ve_finanzas` — cinco
nombres. La salida registrada en el propio archivo (`:2686-2687`, *"corrida real,
copiada tal cual"*) lista **siete**. Quien la compare no puede distinguir "faltan
dos porque la 0086 las borró" de "faltan dos porque alguien les quitó el
`search_path`", que es precisamente la alarma que el bloque existe para dar.

**Consecuencia:** menor hoy (las cinco que quedan son las que importan), pero es
la segunda pieza de comprobación que la `0086` dejó desincronizada sin que nada
avise.

---

## Lo que revisé y está bien

- **La renumeración de la `0088` quedó consistente, y la comprobé en las cuatro
  puntas.** Nombre de archivo `0088_regimen_624_coordinados.sql`; el encabezado
  interno no se auto-numera (no hay número viejo que corregir); el bloque de
  `verificaciones.sql` es el **63** y su título dice `(mig. 0088)` (`:3052`);
  `migraciones_verificadas.test.ts` lo reconoce por título —lo corrí, 4/4 verde—
  y no queda ningún `0086` colgado refiriéndose al régimen 624 (`grep -rn "0086"
  docs/ src/`: solo el MAPA y `progreso.md`, los dos describiendo la colisión
  correctamente). El CHECK nuevo (`0088:29-38`) conserva 601 con la razón escrita
  y añade 624; el bloque 35 (mig. 0056), que también prueba
  `tenant_regimen_fiscal_dominio`, usa `'999'` como clave inválida (`:1411`) y
  sigue siendo válido después de la 0088. `administracion.ts:128` deriva de
  `['624','612']`, consistente con el comentario de la columna.
- **La `0086` como SQL de esquema es buen trabajo, e intenté romperla por cuatro
  lados sin lograrlo:**
  - *¿Quedó `is_operador()` huérfana pero referenciada?* No. Recorrí las 11
    migraciones que la nombran (`0045`, `0047`, `0048` (solo prosa), `0050`,
    `0051`, `0053`, `0074`, `0078`, `0079`, `0081`) y las 22 policies que la usan
    están todas en la lista de la `0086` (19 en el `array[]` de `:38-43`, más
    `ticket_mensaje` `:56-67`, `app_user_self` `:70-72`, `bitacora_insercion`
    `:75-77`, más las 5 dropeadas en `:26-30`). Si sobrara una, el
    `drop function if exists` de `:80-81` fallaría ruidoso por dependencia
    (RESTRICT), no en silencio.
  - *¿Aflojó permisos al recrear las policies?* No. Todas las originales eran
    `((tenant_id = any(get_user_tenant_ids()) and not is_operador()) or
    is_superadmin())` (verificado en `0045:43-44`, `0047:173-174` y `:183-185`,
    `0050:139-144`, `0051:123-124`, `0053:207-212`, `0078:44-45`). La forma nueva
    es la misma menos el término muerto. Ninguna llevaba `ve_finanzas()` ni
    `administra_flota()` — esas viven en policies con **otro nombre**
    (`tenant_finanzas`, `solo_admin_flota`) que la `0086` no toca.
  - *¿Puede perderse el dominio de `rol` si hay filas `operador`?* No. El `drop
    constraint` y el `add constraint` están dentro del **mismo** `do $$ … end $$`
    (`:87-99`), que es una sola sentencia: si el `ADD` rebota por una fila vieja,
    el `DROP` se revierte con él. La base nunca queda con `rol` sin dominio.
  - *¿Es re-aplicable?* Sí: `drop policy if exists` antes de cada `create`,
    `drop function if exists`, y el `if exists` sobre `pg_constraint`.
  - *¿Es el `check` validado contra las filas existentes?* Sí (`add constraint
    check` valida por default), así que el comportamiento que el comentario
    `:83-86` promete —rebotar en vez de borrar cuentas en silencio— es real.
    No pude verificar si existen filas con `rol='operador'` en la base real (sin
    acceso), pero el camino de creación estaba cerrado desde antes: el alta del
    panel las rechazaba (`git show 94c0733:src/app/admin/usuarios/nuevo/page.tsx:37`,
    `if (rol === 'superadmin' || rol === 'operador') redirect(…?error=2)`) y
    `seed.sql` no inserta ninguna (solo la menciona en un comentario, `:88`).
- **El claim de la `0087` es atómico de verdad** (ver la nota refutada arriba), y
  el `UPDATE` va acotado por `tenant_id` además de por la PK
  (`recordatorio_comprobacion.ts:161-163`), siguiendo la disciplina de `acotada`.
- **El bloque 63 nuevo prueba lo que dice** (`:3052-3078`): admite 624 y rechaza
  699 con `check_violation`, con brazo de control. El bloque 62 (`:2999-3050`)
  prueba el rebote del rol y además dos formas de policy (la simple sobre `viaje`
  y la de join sobre `ticket_mensaje`), que es la regresión correcta a hacer tras
  reescribir 20 policies.
- **Los dominios de estado y las unicidades críticas del pase 1 siguen puestos**
  (los recorrí de nuevo, sin cambios): `0025:87-155`, `0073:60-72`, `0070:44-48`,
  `uq_gasto_cfdi_uuid` (`0065:69-70`) con `cfdi_orden not null default 1`. El
  mismo CFDI sigue sin poder liquidarse dos veces.

---

## Lo que NO alcancé a revisar

- **Los 60 bloques restantes de `verificaciones.sql` uno por uno.** Hice un
  barrido dirigido —`insert … 'operador'`, `update tenant set`, `update app_user
  set`, y los títulos de los 60 bloques— que es lo que encontró los tres bloques
  muertos y las dos garantías descubiertas. No descarto que otro bloque afirme
  verificar algo que dejó de ser cierto por una causa distinta a la `0086`.
- **La numeración de bloques quedó con hueco 54–60** (los 57-60 nunca
  existieron, según noté en el pase 1; ahora se suman 54-56). Cosmético, no lo
  reporto, pero hace más difícil el barrido anterior.
- **`0086` contra la base real.** No tengo acceso; todo lo anterior es contra el
  texto de las migraciones y `pg_policies` reconstruido de ellas. La afirmación
  de la `0086:8-13` de que son "22 policies en 21 tablas confirmado contra
  `pg_policies`" cuadra con lo que conté en el repo (22), lo cual es buena señal
  pero no es verificación.
- **El bucket de Storage y sus políticas** (`0008`, `0039`), el subsistema
  SaaS/Stripe (`0052`-`0057`, `0066`) y las RPC de resumen (`0062`, `0064`) —
  igual que en el pase 1, siguen sin revisar línea por línea.
- **El hueco de numeración `0067`-`0069`** sigue sin poder resolverse sin base.
