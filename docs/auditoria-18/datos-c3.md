# Modelo de datos y esquema — auditoría 18 · continuación 3

**Nota: 7/10** (antes 5). Razón del movimiento: **se atacó y subió**. La 0145 no
promete: cierra. Conté las relaciones una por una, como la pasada anterior, y el
resultado es **38 de 43** (antes **5 de 39** — la cuenta de ayer decía 5 de 40 y
tenía una fila fantasma, `foto_pendiente`, que la 0041 dropeó). Con ella se
cierran, contra el catálogo y no contra el asunto del commit, el CRÍTICO de la
cadena de cobranza, un ALTO, tres MEDIOS y dos BAJOS. No sube a 8 por dos cosas
que sí encontré: `viaje` —la fila donde vive `anticipo` e `ingreso_flete`— sigue
bajo la policy genérica que la 0146 declaró extinguida, y las tres columnas
GENERADAS de la 0140/0142/0143 perdieron su única verificación de base.

**El riesgo mayor del rubro, hoy:** el dinero ya no puede colgarse de la flota
equivocada (la FK lo impide desde la base, incluso por el camino de service role
que es el que usa toda la app), pero **sigue siendo legible y escribible por el rol
al que el producto se lo niega** — porque el anticipo y el ingreso del flete viven
en la misma fila que la operación, y una policy de fila no separa columnas.

---

## La FK compuesta, contada

**38 de 43 relaciones entre entidades cubiertas hoy** (antes: 5 de 39).

Método idéntico al de la pasada anterior: se extrajeron del árbol de migraciones
todas las claves foráneas entre dos tablas que ambas tienen una columna
`tenant_id` (excluidas las que apuntan a `tenant`, `plan`, `agente_definicion` y
`app_user`), y se marcó cuáles tienen hoy su hermana `(col, tenant_id)`.

- Las **5** de antes: 0028:93-96 (`gasto.viaje_id`, `liquidacion.viaje_id`,
  `codigo_pendiente.viaje_id`, `viaje.operador_id`) + 0073:30-34
  (`comprobante_huerfano.operador_id`).
- Las **33** nuevas: la lista literal de
  `supabase/migrations/0145_fks_con_tenant_barrido_completo.sql:137-169`
  (conté las entradas: son 33, no 31 ni 35).
- **Corrección a la cuenta de ayer:** la #11 de la tabla «B» del reporte anterior
  (`foto_pendiente.viaje_id → viaje`, 0038:33) **no existe**:
  `0041_foto_pendiente_revertida.sql:18` hace `drop table if exists foto_pendiente`.
  La 0145 tuvo razón en no listarla. El denominador de ayer era 39, no 40.
- **Corrección en el otro sentido:** ayer no se contaron
  `wa_conversacion.operador_id` y `wa_conversacion.viaje_id` (0001:81-82), que
  quedaban fuera porque `wa_conversacion.tenant_id` era NULLABLE. La 0145 §0
  cierra la nulabilidad (0145:59-68) y las mete al barrido. Van al numerador y al
  denominador.

Cómo se cierra la aritmética de la cabecera de la 0145 («36 FKs, 5 compuestas, 31
sin tenant»): 5 + 31 = 36 con las dos de `wa_conversacion` ya contadas como NOT
NULL; las dos de `factura_viaje` (que no tenía `tenant_id` en absoluto y lo gana
en 0145:99-129) son las que suben 31 → 33. Cuadra.

### Las cinco que faltan, nombradas

| Relación | Mig:línea | Por qué falta | ¿Cubierta por otra cosa? |
|---|---|---|---|
| `app_user.operador_id → operador` | 0045:21 | `app_user.tenant_id` es NULLABLE (0001:17, «null = superadmin»): una compuesta rechazaría al superadmin | Sí. `app_user` solo tiene policy `for select` (0086:71, 0126:56): un `authenticated` no puede UPDATE por PostgREST, y `operador` salió del dominio de `rol` en la 0086 |
| `ticket_mensaje.ticket_id → ticket_soporte` | 0051:61 | la hija no tiene `tenant_id` | policy por `exists` sobre el ticket (0086:56-61). Sin escritor |
| `chat_mensaje.conversacion_id → chat_conversacion` | 0088:37 | la hija no tiene `tenant_id` | RLS activa **sin ninguna policy** (0088:65-66) = deniega todo |
| `viaje_lock.viaje_id → viaje` | 0075:21 | la hija no tiene `tenant_id` | tabla interna, RLS sin policy |
| `envio_mensaje.campania_id → campania` | 0053:146 | ambas con `tenant_id` NULLABLE | muertas de facto (las sustituyó `campana`, 0123) |

Las cinco son las **estructuralmente** difíciles, y las tres del medio están
tapadas por deniega-todo. La 0145 demostró que la excusa «la hija no tiene
tenant_id» era una decisión y no un muro: se lo agregó a `factura_viaje` con un
trigger de herencia (0145:107-126) y cerró los dos lados. Que no lo hiciera con
las otras tres es defendible —ninguna toca dinero y ninguna es escribible— pero
conviene decir que la razón es «no hace falta», no «no se puede».

### Lo que esto cambia de verdad

La compuesta vale más que la policy porque **toda la aplicación lee y escribe con
`supabaseAdmin()`** (`src/lib/supabase/server.ts:8` — `supabaseServer()` solo lo
usan login, callback, `/cuenta`, `mi-perfil` y los layouts). Una FK sí aplica al
service role. El escenario del CRÍTICO de ayer —`insert into pago_recibido
(tenant_id: A, factura_id: <factura de B por $250,000>)`— hoy rebota con
`foreign_key_violation` venga de donde venga, y lo mismo
`insert into factura_viaje (factura_id: <de A>, viaje_id: <de B>)`, que además
ya no puede inflar el divisor de `viajesPorFactura` en
`src/lib/likida/libro_viaje.ts:657-671`.

---

## Verificación de los abiertos de la pasada anterior

| Hallazgo (c2 / ronda 18) | Estado | Evidencia |
|---|---|---|
| **CRÍTICO** — FK compuesta en 5 de 40; la cadena de cobranza abierta | **CERRADO**, con el conteo: **38 de 43**. `pago_recibido_factura_tenant_fkey`, `factura_emitida_cliente_tenant_fkey`, `factura_viaje_{factura,viaje}_tenant_fkey` y `cfdi_consolidado_linea_cfdi_xml_tenant_fkey` (las cuatro del camino del dinero) están en 0145:146,149,150,158 y 137 | 0145:137-169 |
| **ALTO** — `gasto` y `liquidacion` fuera de `ve_finanzas()` | **CERRADO.** `liquidacion` en 0144:16-19, `gasto` en 0146:50-53. Verificado que ningún camino de la app usa el cliente de sesión sobre esas tablas (`grep supabaseServer()` → 5 archivos, ninguno de datos) | 0144:14-19, 0146:47-56 |
| **MEDIO** — las tres cifras de `liquidacion` aceptan negativos | **CERRADO.** `liquidacion_totales_no_negativos` + `liquidacion_diferencia_cuadra` (0146:61-69). Las tres columnas son `not null default 0` (0001:70-73), así que el CHECK muerde | 0146:61-69 |
| **MEDIO** — `gasto.ocr_confianza` sin rango 0–1 | **CERRADO.** `gasto_ocr_confianza_rango` (0146:71-74) | 0146:71-74 |
| **MEDIO** — ciclo A→B→A en `prospecto.duplicado_de` | **CERRADO con reserva.** El trigger `prospecto_duplicado_visible` (0147:70-107) rebota copia-de-copia y colapsa cadenas; el bloque 116 lo prueba en serie. Queda el flanco de trigger-no-es-restricción (hallazgo BAJO abajo) | 0147:70-107 |
| **BAJO** — `wa_conversacion.tenant_id` nullable | **CERRADO** (0145:59-71), con guardia previa que cuenta las filas huérfanas y las nombra como dato personal antes de fallar | 0145:60-68 |
| **BAJO** — `worker_llave.capacidades` sin dominio | **CERRADO** (0147:121-126: `cardinality > 0` y `<@` el catálogo de cuatro) | 0147:121-126 |
| **ALTO** — `similitud_icp_pct` compara SCIAN con 3 caracteres y el repo lo guarda con 6 | **REINCIDENTE.** `0140:59` intacto (`scian in ('484','485','488')`); la 0142 y la 0143 solo tocan `necesidad_pct`. `prospectos-mapa.ts:139` sigue leyendo por prefijo y `prospectos-mapa.test.ts:41` sigue usando `'484222'`. **Agravante nuevo:** con SCIAN de 6, el techo real de `similitud_icp_pct` es 25+20+15 = **60**, así que los chips `≥65` y `≥85` de `cerebro.tsx:342` devuelven 0 siempre — no uno, dos filtros muertos | 0140:59 |
| **MEDIO** — `necesidad_pct` no pasa de 75 y el filtro ofrece ≥85 | **REINCIDENTE.** `0143:23-37` suma como máximo 50+25 = 75; `cerebro.tsx:71` sigue tipando `minNecesidad: 0 \| 40 \| 65 \| 85` y `:707-711` sigue pintando el chip `≥85%` | 0143:24-37, cerebro.tsx:71 |
| **MEDIO** — el rótulo `CRITERIO_SCORES.necesidad` es la fórmula de la 0140, derogada dos veces | **REINCIDENTE.** `prospectos-mapa.ts:290` sigue diciendo «auxiliar administrativo +50» a secas; 0143:29-31 exige además `viaje\|flota\|diesel\|…`. El `comment on column` (0143:39) sí está al día; la copia que un humano lee, no | prospectos-mapa.ts:290 |
| **MEDIO** — las migraciones nuevas sin bloque en `verificaciones.sql` | **CAMBIÓ DE FORMA, sigue abierto.** 0144-0149 sí tienen sus bloques 111-121. Las 0140/0142/0143 pasaron a EXENTAS por escrito y su bloque 111 se perdió en el merge. Es hallazgo aparte, abajo | migraciones_verificadas.test.ts:70-73 |
| **BAJO** — `mensaje_linkedin` sin escritor y fuera del CHECK de coherencia | **REINCIDENTE.** `grep -rn "mensaje_linkedin" src/` → 0. `0141` sigue sin entrar a `prospecto_mensajes_coherentes` (0129:23-24) | 0141, 0129:22-25 |
| **BAJO** — el redactor llama `giroDe` sin el SCIAN | **REINCIDENTE.** `src/app/api/admin/mapa-prospectos/mensaje/route.ts:71` sigue con tres argumentos; los otros tres llamadores (`prospectos-mapa.ts:253,462,559`) pasan `p.scian` | mensaje/route.ts:71 |
| **BAJO** — `num_unidades` solo acotado por abajo | **REINCIDENTE.** `0140:47-48` sin techo; `viajes_mes_estimado` sigue siendo `num_unidades * 18` sobre `int` (0140:76) | 0140:47-48,76 |
| **BAJO** — `prospecto` es deny-all y `prospecto_persona` no | **REINCIDENTE.** `0138:70-75` intacto. La 0148 le agregó `conservar_hasta` (0148:39-40), que entra a la misma superficie. Ni el bloque C ni el D de `capa1_auditoria_estatica.sql` la alcanzan: el C solo mira tablas **con `tenant_id`** y el D fija una lista de cinco donde `prospecto_persona` no está | 0138:69-75, capa1:118-168 |

---

## Hallazgos

### [ALTO] `viaje` guarda dinero (`anticipo`, `ingreso_flete`) y sigue bajo la policy genérica: el encargado lo lee y lo escribe por PostgREST — la 0146 declaró que `gasto` era la última tabla de dinero fuera de `ve_finanzas()`

`supabase/migrations/0086_retirar_rol_operador.sql:38-52` (`'viaje'` en la lista de
`tenant_data`) · `supabase/migrations/0146_gasto_finanzas_y_dominios_liquidacion.sql:6-7`
(la afirmación: «`gasto` era la ÚLTIMA tabla de dinero fuera de ve_finanzas()») ·
`supabase/migrations/0001_init.sql:52` (`anticipo numeric(12,2) not null default 0`) ·
`supabase/migrations/0048_comercial_cliente_tarifa_ingreso.sql:145` (`ingreso_flete`) ·
`src/lib/auth/visibilidad.ts:41` (`encargado: ['operacion']`)

**Escenario, con valores.** Un `encargado` de la flota A, autenticado con su propia
sesión (rol legal desde la 0044, con login), contra PostgREST:

```
GET /rest/v1/viaje?select=id,anticipo,ingreso_flete,km_recorridos&tenant_id=eq.<A>
```

La policy `tenant_data` de `viaje` es, textual (0086:47-50),
`for all using (tenant_id = any(get_user_tenant_ids()) or is_superadmin())` — no
menciona `ve_finanzas()`. Devuelve el anticipo y el ingreso de flete de **todos**
los viajes de la flota: exactamente el área «dinero» que `visibilidad.ts:41` le
niega en pantalla. Y escribe:

```
PATCH /rest/v1/viaje?id=eq.<V>   {"anticipo": 2000}
```

sobre un viaje abierto con `anticipo = 20000`. Pasa `using` y `with check` (solo
miran `tenant_id`), pasa `viaje_anticipo_no_negativo` (0070:44) y
`viaje_anticipo_no_nan` (0025:114). **No hay ni un trigger sobre `viaje`**:
`grep -n "create trigger" supabase/migrations/*.sql` devuelve cinco, y son
0036:76, 0037:18 y 0042:19 (los tres `on gasto`), 0145:122 (`factura_viaje`) y
0147:105 (`prospecto`). El cuadre siguiente calcula
`diferencia = round2(2000 − 18500) = −16500` (`cuadre/engine.ts:749`) y la
liquidación sale `con_diferencias` con la leyenda «El operador puso $16,500.00 de
su bolsa». `bitacora_auditoria` no tiene una sola fila: nunca pasó por la app.

**Consecuencia.** El jefe de tráfico —el rol que existe precisamente para no ver
finanzas— ve el anticipo y el ingreso de flete de toda la flota y puede moverlos
sin dejar rastro. El contralor cruza su PDF contra una cifra que otro rol cambió,
y el único registro de que cambió es que los números ya no coinciden.

**Causa raíz probable.** `ve_finanzas()` se fue aplicando tabla por tabla (0048 →
0144 → 0146) y `viaje` quedó fuera porque también es la tabla de operación: el
dinero y la operación viven en la misma fila y una policy de fila no puede
separar columnas.

---

### [MEDIO] Nada impide reescribir `viaje.anticipo` después de que la liquidación existe: la cerca de 0036/0037/0042 se construyó solo para `gasto`, y el CHECK nuevo de la 0146 solo mira dentro de la fila de `liquidacion`

`supabase/migrations/0036_no_gastos_tras_liquidar.sql:76` ·
`supabase/migrations/0037_gasto_no_tras_liquidar_update.sql:18` ·
`supabase/migrations/0042_gasto_fecha_no_tras_liquidar.sql:19` (los tres, `on gasto`) ·
`supabase/migrations/0146_gasto_finanzas_y_dominios_liquidacion.sql:66-69`

**Escenario, con valores.** Viaje V, liquidado. La fila de `liquidacion` dice
`{total_anticipo: 20000.00, total_comprobado: 18500.00, diferencia: 1500.00}` y su
PDF está archivado en `pdf_url`. Después, por cualquier camino que no sea el
webhook —la consola de Supabase, un script de corrección, o el PATCH del hallazgo
anterior—:

```sql
update viaje set anticipo = 25000 where id = '<V>';
```

Entra. `viaje_anticipo_no_negativo` solo pide `>= 0`; no hay trigger sobre `viaje`
que mire el estatus. Queda `viaje.anticipo = 25000` y
`liquidacion.total_anticipo = 20000` para el mismo viaje.
`liquidacion_diferencia_cuadra` (0146:68) **sigue satisfecha**, porque compara
`diferencia` contra `total_anticipo − total_comprobado` **dentro de la misma
fila** y ninguno de los tres cambió.

**Consecuencia.** Dos cifras del mismo viaje conviviendo sin que ninguna
restricción lo note: el estado que la propia 0146 nombra como el daño de M11
(«dos cifras fiscales distintas del mismo viaje»), por la puerta que no cerró. La
familia 0036/0037/0042 existe porque este repo ya pisó exactamente esta trampa
con `gasto`, tres veces: primero solo INSERT, luego UPDATE, luego `fecha`.

**Causa raíz probable.** La 0146 amarró la salida del cuadre a sí misma
(`diferencia = anticipo − comprobado` dentro de `liquidacion`) en vez de a la
entrada de la que se deriva (`viaje.anticipo`), y el sello de «liquidado» no
protege la fila de la que salió el número.

---

### [MEDIO] La exención de 0140/0142/0143 dice que el score «se prueba en TS»: la fórmula es una expresión `generated always as … stored` que ningún test de TypeScript puede evaluar, y los dos defectos que la ronda anterior encontró viven dentro de ella

`src/lib/likida/migraciones_verificadas.test.ts:63-73` (el bloque de exenciones y
su razón) y `:104-109` (la nota que documenta la pérdida del bloque 111) ·
`supabase/migrations/0140_prospecto_investigacion_profunda.sql:57-77` ·
`supabase/verificaciones.sql:5416` (donde el bloque 111 iba a vivir y hoy vive la
RLS de `liquidacion`)

**Escenario, con valores.** La razón escrita dice, textual: *«si el cálculo del
score cambia, es lógica de negocio del embudo, probada en TS»*
(`migraciones_verificadas.test.ts:67-68`). No lo está y no puede estarlo: las tres
columnas son `int generated always as (…) stored` (0140:57,65,74) —Postgres las
calcula, nadie las escribe— y `grep -rn "similitud_icp\|necesidad_pct" src/` sobre
los 430 archivos `*.test.ts*` devuelve **una sola línea**:
`src/app/admin/mapa-prospectos/mensajes.test.ts:14`, que pone los literales
`similitudIcpPct: 0, necesidadPct: 0` en un fixture. Ningún test evalúa la
expresión.

Un bloque de tres líneas —insertar `TRANSPORTES MONTERREY` con
`scian='484121'`, `vacante='Coordinador de Liquidaciones de flota'`,
`num_unidades=45`, `sitio_verificado=true` y afirmar
`similitud_icp_pct = 100 and necesidad_pct = 75`— habría impreso
`similitud=60` (0 + 25 + 20 + 15, porque `'484121' not in ('484','485','488')`) y
`necesidad=75`, y se habría puesto rojo el mismo día. Es el bloque que existía en
la rama y que el merge de `master` retiró.

**Consecuencia.** La única garantía que solo la base puede demostrar sobre estas
tres columnas se cambió por una razón escrita cuya premisa es falsa, y las dos
fallas que esa garantía habría cazado siguen abiertas veinticuatro horas después.
El criterio del propio archivo —«hace falta bloque cuando la migración crea una
garantía que la base es la ÚNICA que puede demostrar»
(`migraciones_verificadas.test.ts:47-50`)— aplica aquí de lleno: la fórmula vive
en SQL, y solo SQL la puede correr.

**Causa raíz probable.** El criterio de EXENTAS se aplicó al *efecto* del dato («un
score no es dinero, un valor mal solo reordena la lista») y no a la *sede del
cálculo* (una expresión que vive en el motor de la base y en ningún otro sitio).

---

### [BAJO] El bloque 111 verifica la RLS de `liquidacion` con un `ilike` sobre el texto de la policy; su hermano 114, del mismo arreglo y una tabla más allá, sí impersona

`supabase/verificaciones.sql:5421-5432` (bloque 111) frente a `:5555-5586` (bloque 114)

**Escenario, con valores.** El bloque 111 mide
`select bool_or(qual::text ilike '%ve_finanzas%') from pg_policies where tablename = 'liquidacion'`.
Sustituir la policy de la 0144 por

```sql
create policy tenant_finanzas on public.liquidacion for all
  using ((tenant_id = any (get_user_tenant_ids())) or ve_finanzas() or is_superadmin())
  with check ((tenant_id = any (get_user_tenant_ids())) or ve_finanzas() or is_superadmin());
```

devuelve al `encargado` la lectura y la escritura de **todas** las liquidaciones de
su flota por el primer disyunto —el agujero exacto que la 0144 existe para
tapar— y aun así `qual ilike '%ve_finanzas%'` da `t`: el bloque imprime
`gatea_finanzas=t` y CI sigue verde. La otra mitad del mismo bloque cuenta
constraints **por nombre**
(`conname in ('factura_proveedor_total_positivo','factura_proveedor_conceptos_positivo') and contype = 'c'`),
así que `drop constraint factura_proveedor_total_positivo;`
`add constraint factura_proveedor_total_positivo check (true);` también deja
`check_factura_proveedor=t`.

El bloque 114, escrito para el mismo arreglo sobre `gasto`, hace lo correcto:
`set local role authenticated`, `set_config('request.jwt.claims', …)` con el id del
encargado, cuenta filas y prueba el INSERT de $40,000 (`:5571-5578`).

**Consecuencia.** Sobre la tabla que guarda el total archivado que el contralor
cruza contra su PDF, la puerta de CI mide una cadena de texto, no un
comportamiento. La asimetría con el 114 es la que lo delata: el repo ya sabe cómo
se prueba esto.

**Causa raíz probable.** El 111 se escribió el 21-ago para la 0144 y no se
reescribió cuando el 114 (22-ago) estableció la forma buena para la tabla gemela.

---

### [BAJO] `prospecto_duplicado_visible` es un trigger, no una restricción: un UPDATE en lote sobre un clúster de duplicados aborta con un error que no nombra la fila, y dos transacciones concurrentes todavía dejan A→B→A

`supabase/migrations/0147_prospecto_ciclos_avatares_worker_rpc.sql:97-99` (el UPDATE
a otras filas desde un trigger BEFORE) y `:104-107` (`before insert or update of
duplicado_de … for each row`)

**Escenario, con valores.** Estado inicial legal después de la 0147: `X` visible
(`duplicado_de is null`), `Y` con `duplicado_de = X`. El deduplicador reagrupa el
clúster sobre `G`:

```sql
update prospecto set duplicado_de = '<G>' where id in ('<X>', '<Y>');
```

Al procesar `X`, el trigger comprueba que `G` es visible y a continuación corre
`update prospecto set duplicado_de = G where duplicado_de = X` (0147:97-99), que
toca `Y`. Cuando el statement externo llega a `Y`, Postgres aborta con
`tuple to be updated was already modified by an operation triggered by the current
command`. El lote entero se pierde y el mensaje no nombra ni la columna ni la fila.

Y el flanco de concurrencia: T1 `update prospecto set duplicado_de = B where id = A`
y T2 `update prospecto set duplicado_de = A where id = B`, arrancando a la vez. Cada
una lee el destino en su propio snapshot, las dos lo ven con `duplicado_de is null`,
las dos pasan el trigger y las dos comprometen — el ciclo A→B→A que el bloque 116
prueba en serie entra en paralelo. La guardia de arranque de la migración
(0147:44-50) demuestra que el repo sabe que un ciclo no se puede colapsar solo.

**Consecuencia.** El invariante que la 0147 escribió para que ninguna empresa
desaparezca del censo con sus toques y notas se sostiene en un trigger que no es
serializable y que se pelea con un UPDATE en lote — que es exactamente la forma
en que un deduplicador escribe.

**Causa raíz probable.** El invariante es entre filas («la fila a la que apunto es
visible») y no cabe en un `CHECK`; se resolvió con un trigger BEFORE que además
escribe filas que el statement externo puede estar tocando.

---

## Lo que revisé y está bien

- **La 0145, leída línea por línea, no introduce un estado imposible nuevo.**
  Verifiqué las 33 relaciones una por una: cada acción compuesta **coincide** con
  la de su FK simple (`cascade` con `cascade`, `restrict` con `restrict`,
  `set null (col)` con `set null`), así que no hay dos FKs discrepando sobre qué
  pasa al borrar el padre. Y las 20 que llevan `on delete set null (columna)`
  tienen las 20 su columna hija NULLABLE (0001:32,50,81-82; 0003:10-11; 0009:8;
  0040:44; 0047:65,101,131; 0048:139; 0049:34; 0051:29,77,92; 0052:89; 0053:101;
  0076:57; 0106:73; 0107:41), que es lo que esa forma exige.
- **La sintaxis `on delete set null (columna)` (PG 15+) es aplicable aquí.** El CI
  corre `postgres:16` (`.github/workflows/ci-postgres.yml:76`) y la cabecera de la
  0145 declara 17.6 en producción. La decisión de versión que la 0028:44-47 no
  quiso tomar está tomada.
- **La comprobación previa de cada FK es correcta y falla ruidosa con el número.**
  0145:181-191 cuenta las filas cruzadas antes de intentar el `alter` y nombra
  tabla, constraint y cuántas — en vez de `is not present in table`. Y `MATCH
  SIMPLE` no comprueba la fila cuando la columna hija es NULL, que es
  precisamente por lo que la cuenta previa lleva `h.col is not null`.
- **`factura_viaje.tenant_id` no puede desincronizarse del de su factura**, que era
  la objeción escrita en 0049:147-149 contra darle columna propia: el trigger la
  hereda (0145:107-126) y las dos compuestas (0145:149-150) la obligan a coincidir
  con factura **y** viaje. El `update` de :123 es `of factura_id, tenant_id`, pero
  un cambio de `viaje_id` a secas lo sigue atrapando la FK compuesta.
- **Intenté y refuté que la vista `factura_saldo` filtrara todas las flotas.** Es
  la única vista de `public` (`grep "create .* view" supabase/migrations/*.sql` → una
  línea, 0049:112) y `0054_fuga_vista_saldo_y_grants.sql:42` le puso
  `security_invoker = true`. Además el bloque A de
  `supabase/pruebas-aislamiento/capa1_auditoria_estatica.sql:56` barre el catálogo
  y se pone rojo con cualquier vista futura sin la marca. No es hallazgo.
- **Intenté y refuté que `app_user.operador_id` permitiera colgar una cuenta de la
  flota A del operador de la flota B.** `app_user` solo tiene policy `for select`
  (0086:70-71, ajustada en 0126:56): un `authenticated` no puede hacer UPDATE por
  PostgREST, y el rol `operador` salió del dominio en la 0086. La escribe nadie en
  `src/` (`session.ts:70` solo la lee).
- **Intenté y refuté que `chat_mensaje` o `ticket_mensaje` fueran una fuga por no
  tener `tenant_id`.** `chat_conversacion` y `chat_mensaje` tienen RLS activa y
  **cero** policies (0088:65-66) = deniega todo; `ticket_mensaje` resuelve el
  tenant por `exists` sobre su ticket (0086:56-61) y no tiene escritor.
- **Intenté y refuté que `liquidacion_diferencia_cuadra` (0146:68) pudiera
  rechazar una liquidación legítima del motor.** `engine.ts:749` calcula
  `diferencia = round2(anticipo − totalComprobado)` y `:1260-1262` guarda
  `round2(totalComprobado)` y `round2(anticipo)`; las tres columnas son
  `numeric(12,2)`, así que el desvío máximo por redondear dos veces es 0.01 y la
  tolerancia es `<= 0.01`. Y verifiqué el otro escritor masivo: `scripts/demo-5k.sql:405`
  inserta `v.anticipo − g.comprobado` exacto, con `comprobado >= 0` — el demo de
  5,000 camiones sigue cargando con las restricciones nuevas puestas.
- **Los bloques 113, 114, 115, 116, 117, 118, 119 y 121 miden lo que su título
  dice**, y tres de ellos con impersonación o comportamiento real, no con `grep`
  de catálogo: 114 (`set local role authenticated` + `request.jwt.claims`,
  `verificaciones.sql:5571-5578`), 115 (cinco INSERTs, uno por CHECK, `:5606-5633`),
  116 (la cadena A→B→C con su colapso comprobado, `:5648-5666`). El 112 combina
  barrido de catálogo con cuatro INSERTs que reproducen el escenario C3 literal
  (`:5489-5510`); su título dice «TODA FK» y el barrido excluye las tablas con
  `tenant_id` NULLABLE, pero la exclusión está escrita en el propio comentario
  del bloque (`:5441-5443`), así que no engaña a quien lo lea.
- **El bloque 120 (0148) se declara «PENDIENTE DE CORRER CONTRA PRODUCCIÓN»
  en su propia cabecera** (`verificaciones.sql:5738`) en vez de aparentar
  verificado. Es la forma correcta de un bloque que todavía no se corrió.
- **`suscripcion` sigue siendo la tabla mejor acotada del repo**: dominio de
  estado, `(estado = 'cancelada') = (cancelada_en is not null)`,
  `periodo_fin >= inicio`, el parcial `suscripcion_una_viva` sobre `tenant_id` y
  el único de Stripe (0052:65-81). El `unique (id, tenant_id)` que le agregó la
  0145 (0145:84) no le quita nada.
- **`prospecto.estado` sí tiene dominio cerrado** (0105:86-87) y sus dos CHECKs
  cruzados (`cerrado ⇔ cerrado_en`, `tenant_id ⇒ cerrado`, 0105:91-96) siguen
  intactos, así que el filtro de la purga de la 0148 (`estado in
  ('nuevo','contactado','perdido')`) no puede quedarse fuera por un estado
  inventado.

---

## Lo que NO alcancé a revisar

- **No hay base de datos aquí.** Ningún bloque de `verificaciones.sql` ni de
  `capa1_auditoria_estatica.sql` se corrió: el conteo de FKs es de las migraciones,
  no del catálogo vivo. La 0145 afirma haber leído el catálogo el 22-ago y haber
  contado 36 relaciones; mi cuenta desde el árbol de migraciones da 34 más las dos
  de `wa_conversacion` que ella hace NOT NULL primero — cuadra, pero **cuadra por
  reconstrucción, no por lectura**. Un `select conname, conrelid::regclass from
  pg_constraint where contype='f' and array_length(conkey,1)=1` sobre producción lo
  cierra en un segundo, y es lo primero que haría quien tenga la base delante.
- **`prospecto.scian` sigue sin leerse.** El ALTO reincidente se sostiene en que la
  columna no tiene CHECK de forma (0139:54), en que el repo la lee por prefijo
  (`prospectos-mapa.ts:139`) y en que la prueba usa seis dígitos. Un
  `select distinct length(scian) from prospecto` lo confirma o lo mata.
- **Los grants reales por tabla** (`information_schema.role_table_grants`): sigo
  asumiendo el default de Supabase, igual que 0048:42-46.
- **Las ~35 tablas de plataforma** (`agente_*`, `cola_*`, `bus_*`, `campana`,
  `evalops`, `evento_stripe`, `copiloto_*`): las crucé por FK y por policy, pero no
  comparé sus CHECK de dominio contra los tipos de TypeScript que las consumen.
  Prioricé el delta y la cadena del dinero.
- **`supabase/seed.sql` y `scripts/carga-15k.sql`** no se cruzaron contra las
  restricciones nuevas de la 0146 (sí lo hice con `demo-5k.sql`).
- **El `on delete` de las 33 compuestas contra el borrado de un `tenant`**: razoné
  que la cascada de `tenant` llega a padre e hija por sus FKs a `tenant`, pero no
  probé un `delete from tenant` con las 38 FKs puestas, que es el único momento en
  que todas se disparan a la vez.
